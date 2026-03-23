from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
from tasks import convertir_pdf
from celery_app import celery_app
from database import SessionLocal, Conversion, Libro, Parte, EstadoParte
from sqlalchemy import func
from datetime import datetime, timezone
import hashlib
from fastapi import Response, Depends
from auth import hashear_password, verificar_password, crear_token, obtener_usuario_actual, requerir_admin
from database import Usuario

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True
)

def analizar_y_registrar_libro(pdf_bytes: bytes, titulo: str, autor: str, paginas_por_parte: int, db):
    # Calcular hash del contenido
    hash_contenido = hashlib.sha256(pdf_bytes).hexdigest()

    # Comprobar si el libro ya existe
    libro_existente = db.query(Libro).filter(Libro.hash_contenido == hash_contenido).first()
    if libro_existente:
        return libro_existente, False  # False = no es nuevo

    # Contar páginas
    import pdfplumber, tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    with pdfplumber.open(tmp_path) as pdf:
        num_paginas = len(pdf.pages)

    # Crear registro del libro
    libro = Libro(
        titulo=titulo,
        autor=autor,
        hash_contenido=hash_contenido,
        num_paginas=num_paginas,
        paginas_por_parte=paginas_por_parte,
        visible=False
    )
    db.add(libro)
    db.flush()  # Para obtener el libro.id sin hacer commit todavía

    # Crear registros de partes
    pagina_actual = 0
    numero_parte = 1
    while pagina_actual < num_paginas:
        pagina_fin = min(pagina_actual + paginas_por_parte - 1, num_paginas - 1)
        parte = Parte(
            libro_id=libro.id,
            numero_parte=numero_parte,
            pagina_inicio=pagina_actual,
            pagina_fin=pagina_fin,
            estado=EstadoParte.pendiente
        )
        db.add(parte)
        pagina_actual += paginas_por_parte
        numero_parte += 1

    db.commit()
    db.refresh(libro)
    return libro, True  # True = es nuevo

@app.get("/health_check")
def health_check():
    return {"mensaje": "Servicio Api REST activo"}

@app.post("/convertir")
async def convertir(
    pdf: UploadFile = File(...),
    titulo: str = Form(...),
    autor: str = Form(""),
    paginas_por_parte: int = Form(50),
    proveedor: str = Form("edge"),
    voz: UploadFile = File(None)
):
    pdf_bytes = await pdf.read()
    db = SessionLocal()

    try:
        libro, es_nuevo = analizar_y_registrar_libro(
            pdf_bytes, titulo, autor, paginas_por_parte, db
        )

        if not es_nuevo:
            partes = db.query(Parte).filter(Parte.libro_id == libro.id).all()
            return {
                "libro_id": libro.id,
                "titulo": libro.titulo,
                "es_nuevo": False,
                "mensaje": "Este libro ya existe en el sistema",
                "partes": [{"id": p.id, "numero_parte": p.numero_parte, "estado": p.estado} for p in partes]
            }

        # Encolar solo la primera parte
        partes = db.query(Parte).filter(Parte.libro_id == libro.id).order_by(Parte.numero_parte).all()
        primera_parte = partes[0]

        voz_bytes = await voz.read() if voz else b""
        tarea = convertir_pdf.delay(pdf_bytes, pdf.filename, proveedor, primera_parte.id, voz_bytes)

        # Actualizar estado de la primera parte a "procesando"
        primera_parte.estado = EstadoParte.procesando
        db.commit()

        return {
            "libro_id": libro.id,
            "titulo": libro.titulo,
            "es_nuevo": True,
            "num_paginas": libro.num_paginas,
            "total_partes": len(partes),
            "tarea_id": tarea.id,
            "parte_id": primera_parte.id
        }

    finally:
        db.close()

@app.get("/resultado/{tarea_id}")
def resultado(tarea_id: str):
    tarea = AsyncResult(tarea_id, app=celery_app)

    if tarea.state == "PENDING":
        return {"estado": "pendiente"}
    elif tarea.state == "SUCCESS":
        return FileResponse(tarea.result, media_type="audio/mpeg", filename="kokito.mp3")
    elif tarea.state == "FAILURE":
        return {"estado": "error", "detalle": str(tarea.result)}
    elif tarea.state == "PROGRESS":
        info = tarea.info
        if "porcentaje_override" in info:
            porcentaje = info["porcentaje_override"]
        else:
            pagina = info.get("pagina", 0)
            total = info.get("total", 1)
            porcentaje = int((pagina / total) * 50)
        return {"estado": "progreso", "porcentaje": porcentaje}
    
@app.get("/estadisticas")
def estadisticas():
    db = SessionLocal()
    ahora = datetime.now(timezone.utc)
    caracteres_mes = db.query(func.sum(Conversion.caracteres)).filter(
        Conversion.creado_en >= ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
        Conversion.proveedor == "google"
    ).scalar() or 0
    db.close()
    return {
        "caracteres_mes": caracteres_mes,
        "limite_gratuito": 1_000_000,
        "porcentaje": round((caracteres_mes / 1_000_000) * 100, 2)
    }

@app.get("/libros")
def listar_libros():
    db = SessionLocal()
    try:
        libros = db.query(Libro).order_by(Libro.fecha_subida.desc()).all()
        return [
            {
                "id": l.id,
                "titulo": l.titulo,
                "autor": l.autor,
                "num_paginas": l.num_paginas,
                "fecha_subida": l.fecha_subida,
                "visible": l.visible,
                "partes": db.query(Parte).filter(Parte.libro_id == l.id).count()
            }
            for l in libros
        ]
    finally:
        db.close()

@app.delete("/libros/{libro_id}")
def borrar_libro(libro_id: int):
    db = SessionLocal()
    try:
        partes = db.query(Parte).filter(Parte.libro_id == libro_id).all()
        for parte in partes:
            db.delete(parte)
        libro = db.query(Libro).filter(Libro.id == libro_id).first()
        if not libro:
            return {"error": "Libro no encontrado"}
        db.delete(libro)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.post("/registro")
def registro(nombre: str = Form(...), email: str = Form(...), password: str = Form(...), response: Response = None):
    db = SessionLocal()
    try:
        existe = db.query(Usuario).filter(Usuario.email == email).first()
        if existe:
            raise HTTPException(status_code=400, detail="El email ya está registrado")
        
        usuario = Usuario(
            nombre=nombre,
            email=email,
            password_hash=hashear_password(password),
            rol="usuario"
        )
        db.add(usuario)
        db.commit()
        db.refresh(usuario)
        return {"id": usuario.id, "nombre": usuario.nombre, "email": usuario.email, "rol": usuario.rol}
    finally:
        db.close()


@app.post("/login")
def login(email: str = Form(...), password: str = Form(...), response: Response = None):
    db = SessionLocal()
    try:
        usuario = db.query(Usuario).filter(Usuario.email == email).first()
        if not usuario or not verificar_password(password, usuario.password_hash):
            raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
        
        token = crear_token(usuario.id, usuario.rol)
        response.set_cookie(
            key="kokito_token",
            value=token,
            httponly=True,
            max_age=30 * 24 * 60 * 60,  # 30 días en segundos
            samesite="lax"
        )
        return {"id": usuario.id, "nombre": usuario.nombre, "email": usuario.email, "rol": usuario.rol}
    finally:
        db.close()


@app.post("/logout")
def logout(response: Response):
    response.delete_cookie("kokito_token")
    return {"ok": True}


@app.get("/me")
def me(usuario: Usuario = Depends(obtener_usuario_actual)):
    return {"id": usuario.id, "nombre": usuario.nombre, "email": usuario.email, "rol": usuario.rol}

@app.patch("/libros/{libro_id}/visible")
def cambiar_visibilidad(libro_id: int, visible: bool):
    db = SessionLocal()
    try:
        libro = db.query(Libro).filter(Libro.id == libro_id).first()
        if not libro:
            raise HTTPException(status_code=404, detail="Libro no encontrado")
        libro.visible = visible
        db.commit()
        return {"id": libro.id, "visible": libro.visible}
    finally:
        db.close()