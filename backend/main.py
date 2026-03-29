from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
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
from auth import hashear_password, verificar_password, crear_token, obtener_usuario_actual, requerir_admin, obtener_usuario_opcional
import os
from datetime import datetime, timezone
from database import Usuario, ProgresoUsuario, ProgresoParte, EstadoParteUsuario, EstadoPartUsuario, Libro, Parte, EstadoParte

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://192.168.1.94:5173",
        "https://kokito.wanderingcode.dev"
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True
)

PORTADAS_DIR = "/app/portadas"
PDFS_DIR = "/app/pdfs"

def analizar_y_registrar_libro(pdf_bytes, titulo, autor, paginas_por_parte, db,
    sinopsis="", serie="", anio=None, genero="", editorial="", isbn="", portada_url="", ruta_pdf="", ruta_voz=""):
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
        visible=False,
        sinopsis=sinopsis or None,
        serie=serie or None,
        anio=anio,
        genero=genero or None,
        editorial=editorial or None,
        isbn=isbn or None,
        portada_url=portada_url or None,
        ruta_pdf=ruta_pdf or None,
        ruta_voz=ruta_voz or None
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
    voz: UploadFile = File(None),
    sinopsis: str = Form(""),
    serie: str = Form(""),
    anio: int = Form(None),
    genero: str = Form(""),
    editorial: str = Form(""),
    isbn: str = Form(""),
    portada_url: str = Form(""),
):
    pdf_bytes = await pdf.read()
    os.makedirs(PDFS_DIR, exist_ok=True)
    nombre_pdf = f"{hashlib.md5(pdf_bytes).hexdigest()}.pdf"
    ruta_pdf = os.path.join(PDFS_DIR, nombre_pdf)
    with open(ruta_pdf, "wb") as f:
        f.write(pdf_bytes)

    ruta_voz = ""
    if voz and voz_bytes:
        ext = voz.filename.rsplit(".", 1)[-1].lower()
        nombre_voz = f"{hashlib.md5(voz_bytes).hexdigest()}.{ext}"
        ruta_voz = os.path.join(PDFS_DIR, nombre_voz)
        with open(ruta_voz, "wb") as f:
            f.write(voz_bytes)
         
    db = SessionLocal()

    try:
        libro, es_nuevo = analizar_y_registrar_libro(
            pdf_bytes, titulo, autor, paginas_por_parte, db,
            sinopsis=sinopsis, serie=serie, anio=anio,
            genero=genero, editorial=editorial, isbn=isbn,
            portada_url=portada_url, ruta_pdf=ruta_pdf, ruta_voz=ruta_voz
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
        tarea = convertir_pdf.delay(proveedor, primera_parte.id, voz_bytes)
        primera_parte.tarea_id = tarea.id
        primera_parte.proveedor = proveedor
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
                "portada_url": l.portada_url,
                "partes": [
                    {"estado": p.estado.value}
                    for p in db.query(Parte).filter(Parte.libro_id == l.id).order_by(Parte.numero_parte).all()
                ]
            }
            for l in libros
        ]
    finally:
        db.close()


@app.get("/libros/publicos")
def listar_libros_publicos():
    db = SessionLocal()
    try:
        libros = db.query(Libro).filter(Libro.visible == True).order_by(Libro.fecha_subida.desc()).all()
        return [
            {
                "id": l.id,
                "titulo": l.titulo,
                "autor": l.autor,
                "num_paginas": l.num_paginas,
                "partes": db.query(Parte).filter(Parte.libro_id == l.id).count(),
                "portada_url": l.portada_url
            }
            for l in libros
        ]
    finally:
        db.close()


@app.get("/libros/{libro_id}")
def detalle_libro(libro_id: int, usuario = Depends(obtener_usuario_opcional)):
    db = SessionLocal()
    try:
        libro = db.query(Libro).filter(Libro.id == libro_id).first()
        if not libro:
            raise HTTPException(status_code=404, detail="Libro no encontrado")

        partes = db.query(Parte).filter(
            Parte.libro_id == libro_id
        ).order_by(Parte.numero_parte).all()

        escuchadas = set()
        if usuario:
            escuchadas = {
                r.parte_id
                for r in db.query(EstadoParteUsuario).filter(
                    EstadoParteUsuario.usuario_id == usuario.id,
                    EstadoParteUsuario.estado == EstadoPartUsuario.escuchada
                ).all()
            }

        return {
            "id": libro.id,
            "titulo": libro.titulo,
            "autor": libro.autor,
            "num_paginas": libro.num_paginas,
            "portada_url": libro.portada_url,
            "sinopsis": libro.sinopsis,
            "serie": libro.serie,
            "anio": libro.anio,
            "genero": libro.genero,
            "editorial": libro.editorial,
            "isbn": libro.isbn,
            "partes": [
                {
                    "id": p.id,
                    "numero_parte": p.numero_parte,
                    "pagina_inicio": p.pagina_inicio,
                    "pagina_fin": p.pagina_fin,
                    "estado": p.estado,
                    "duracion_segundos": p.duracion_segundos,
                    "escuchada": p.id in escuchadas,
                }
                for p in partes
            ]
        }
    finally:
        db.close()


@app.delete("/libros/{libro_id}")
def borrar_libro(libro_id: int):
    db = SessionLocal()
    try:
        _borrar_libro_completo(libro_id, db)
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
            max_age=30 * 24 * 60 * 60,
            samesite="none",
            secure=True
        )
        return {"id": usuario.id, "nombre": usuario.nombre, "email": usuario.email, "rol": usuario.rol}
    finally:
        db.close()


@app.post("/logout")
def logout(response: Response):
    response.delete_cookie("kokito_token")
    return {"ok": True}


@app.get("/me", response_model=None)
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


@app.get("/partes/{parte_id}/audio")
def audio_parte(parte_id: int):
    db = SessionLocal()
    try:
        parte = db.query(Parte).filter(Parte.id == parte_id).first()
        if not parte:
            raise HTTPException(status_code=404, detail="Parte no encontrada")
        if parte.estado != EstadoParte.listo:
            raise HTTPException(status_code=400, detail="Esta parte todavía no está lista")
        if not parte.ruta_mp3 or not os.path.exists(parte.ruta_mp3):
            raise HTTPException(status_code=404, detail="Archivo de audio no encontrado")
        return FileResponse(parte.ruta_mp3, media_type="audio/mpeg")
    finally:
        db.close()


@app.post("/progreso/parte")
def guardar_progreso_parte(
    parte_id: int = Form(...),
    segundo_actual: int = Form(...),
    usuario: Usuario = Depends(obtener_usuario_actual)
):
    db = SessionLocal()
    try:
        registro = db.query(ProgresoParte).filter(
            ProgresoParte.usuario_id == usuario.id,
            ProgresoParte.parte_id == parte_id
        ).first()
        if registro:
            registro.segundo_actual = segundo_actual
            registro.fecha_actualizacion = datetime.now(timezone.utc)
        else:
            registro = ProgresoParte(
                usuario_id=usuario.id,
                parte_id=parte_id,
                segundo_actual=segundo_actual
            )
            db.add(registro)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.get("/progreso/libro/{libro_id}")
def obtener_progreso_libro(
    libro_id: int,
    usuario: Usuario = Depends(obtener_usuario_actual)
):
    db = SessionLocal()
    try:
        partes = db.query(Parte).filter(Parte.libro_id == libro_id).all()
        ids_partes = [p.id for p in partes]

        registros = db.query(ProgresoParte).filter(
            ProgresoParte.usuario_id == usuario.id,
            ProgresoParte.parte_id.in_(ids_partes)
        ).all()

        progreso_por_parte = {r.parte_id: r.segundo_actual for r in registros}

        # Última parte escuchada — la de mayor fecha
        ultimo = db.query(ProgresoParte).filter(
            ProgresoParte.usuario_id == usuario.id,
            ProgresoParte.parte_id.in_(ids_partes)
        ).order_by(ProgresoParte.fecha_actualizacion.desc()).first()

        return {
            "tiene_progreso": len(registros) > 0,
            "ultima_parte_id": ultimo.parte_id if ultimo else None,
            "ultimo_segundo": ultimo.segundo_actual if ultimo else 0,
            "progreso_por_parte": progreso_por_parte
        }
    finally:
        db.close()


@app.post("/progreso")
def guardar_progreso(
    libro_id: int = Form(...),
    parte_id: int = Form(...),
    segundo_actual: int = Form(...),
    usuario: Usuario = Depends(obtener_usuario_actual)
):
    db = SessionLocal()
    try:
        progreso = db.query(ProgresoUsuario).filter(
            ProgresoUsuario.usuario_id == usuario.id,
            ProgresoUsuario.libro_id == libro_id
        ).first()

        if progreso:
            progreso.parte_id = parte_id
            progreso.segundo_actual = segundo_actual
            progreso.fecha_actualizacion = datetime.now(timezone.utc)
        else:
            progreso = ProgresoUsuario(
                usuario_id=usuario.id,
                libro_id=libro_id,
                parte_id=parte_id,
                segundo_actual=segundo_actual
            )
            db.add(progreso)

        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.get("/progreso/{libro_id}", response_model=None)
def obtener_progreso(libro_id: int, usuario: Usuario = Depends(obtener_usuario_actual)):
    db = SessionLocal()
    try:
        progreso = db.query(ProgresoUsuario).filter(
            ProgresoUsuario.usuario_id == usuario.id,
            ProgresoUsuario.libro_id == libro_id
        ).first()

        if not progreso:
            return {"tiene_progreso": False}

        return {
            "tiene_progreso": True,
            "parte_id": progreso.parte_id,
            "segundo_actual": progreso.segundo_actual
        }
    finally:
        db.close()

@app.post("/partes/{parte_id}/escuchada", response_model=None)
def marcar_escuchada(parte_id: int, usuario: Usuario = Depends(obtener_usuario_actual)):
    db = SessionLocal()
    try:
        registro = db.query(EstadoParteUsuario).filter(
            EstadoParteUsuario.usuario_id == usuario.id,
            EstadoParteUsuario.parte_id == parte_id
        ).first()
        if registro:
            registro.estado = EstadoPartUsuario.escuchada
            registro.fecha_actualizacion = datetime.now(timezone.utc)
        else:
            registro = EstadoParteUsuario(
                usuario_id=usuario.id,
                parte_id=parte_id,
                estado=EstadoPartUsuario.escuchada
            )
            db.add(registro)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

VOCES_DIR = "/app/voces"

@app.get("/voces/{nombre}")
def servir_voz(nombre: str):
    ruta = os.path.join(VOCES_DIR, nombre)
    if not os.path.exists(ruta):
        raise HTTPException(status_code=404, detail="Voz no encontrada")
    media = "audio/mpeg" if nombre.endswith(".mp3") else "audio/wav"
    return FileResponse(ruta, media_type=media)

@app.get("/libros/{libro_id}/progreso", response_model=None)
def progreso_libro(libro_id: int, usuario=Depends(requerir_admin)):
    db = SessionLocal()
    try:
        partes = db.query(Parte).filter(
            Parte.libro_id == libro_id
        ).order_by(Parte.numero_parte).all()

        resultado = []
        for parte in partes:
            info = {
                "parte_id": parte.id,
                "numero_parte": parte.numero_parte,
                "estado": parte.estado.value,
                "porcentaje": None
            }

            if parte.estado == EstadoParte.procesando and parte.tarea_id:
                tarea = AsyncResult(parte.tarea_id, app=celery_app)
                if tarea.state == "PROGRESS":
                    info["porcentaje"] = tarea.info.get("porcentaje_override") or int(
                        (tarea.info.get("pagina", 0) / max(tarea.info.get("total", 1), 1)) * 50
                    )
                elif tarea.state == "PENDING":
                    info["porcentaje"] = 0

            resultado.append(info)

        return {"partes": resultado}
    finally:
        db.close()

@app.get("/admin/procesando", response_model=None)
def libro_procesando(usuario=Depends(requerir_admin)):
    db = SessionLocal()
    try:
        partes_procesando = db.query(Parte).filter(
            Parte.estado == EstadoParte.procesando
        ).all()

        if not partes_procesando:
            return {"procesos": {}}

        procesos = {}
        for parte in partes_procesando:
            proveedor = parte.proveedor or "edge"
            if proveedor in procesos:
                continue

            libro = db.query(Libro).filter(Libro.id == parte.libro_id).first()
            partes_libro = db.query(Parte).filter(
                Parte.libro_id == parte.libro_id
            ).order_by(Parte.numero_parte).all()

            resultado = []
            for p in partes_libro:
                info = {
                    "parte_id": p.id,
                    "numero_parte": p.numero_parte,
                    "estado": p.estado.value,
                    "porcentaje": None
                }
                if p.estado == EstadoParte.procesando and p.tarea_id:
                    tarea = AsyncResult(p.tarea_id, app=celery_app)
                    if tarea.state == "PROGRESS":
                        info["porcentaje"] = tarea.info.get("porcentaje_override") or int(
                            (tarea.info.get("pagina", 0) / max(tarea.info.get("total", 1), 1)) * 50
                        )
                    elif tarea.state == "PENDING":
                        info["porcentaje"] = 0

                resultado.append(info)

            procesos[proveedor] = {
                "libro_id": libro.id,
                "titulo": libro.titulo,
                "autor": libro.autor,
                "partes": resultado
            }

        return {"procesos": procesos}
    finally:
        db.close()

@app.delete("/admin/cancelar/{libro_id}", response_model=None)
def cancelar_libro(libro_id: int, usuario=Depends(requerir_admin)):
    db = SessionLocal()
    try:
        _borrar_libro_completo(libro_id, db)
        return {"ok": True}
    finally:
        db.close()

@app.post("/admin/reintentar/{libro_id}", response_model=None)
def reintentar_libro(libro_id: int, usuario=Depends(requerir_admin)):
    db = SessionLocal()
    try:
        libro = db.query(Libro).filter(Libro.id == libro_id).first()
        if not libro:
            raise HTTPException(status_code=404, detail="Libro no encontrado")

        partes_fallidas = db.query(Parte).filter(
            Parte.libro_id == libro_id,
            Parte.estado.in_([EstadoParte.error, EstadoParte.pendiente])
        ).order_by(Parte.numero_parte).all()

        if not partes_fallidas:
            raise HTTPException(status_code=400, detail="No hay partes pendientes o con error")

        primera = partes_fallidas[0]
        proveedor = primera.proveedor or "edge"

        tarea = convertir_pdf.delay(proveedor, primera.id, b"")
        primera.tarea_id = tarea.id
        primera.estado = EstadoParte.procesando
        db.commit()

        return {"ok": True, "parte_id": primera.id, "tarea_id": tarea.id}
    finally:
        db.close()

def _borrar_libro_completo(libro_id: int, db):
    """Función auxiliar que borra un libro y todas sus dependencias en orden."""
    partes = db.query(Parte).filter(Parte.libro_id == libro_id).all()
    ids_partes = [p.id for p in partes]

    if ids_partes:
        db.query(EstadoParteUsuario).filter(
            EstadoParteUsuario.parte_id.in_(ids_partes)
        ).delete(synchronize_session=False)
        db.query(ProgresoParte).filter(
            ProgresoParte.parte_id.in_(ids_partes)
        ).delete(synchronize_session=False)
        db.query(ProgresoUsuario).filter(
            ProgresoUsuario.parte_id.in_(ids_partes)
        ).delete(synchronize_session=False)

    for parte in partes:
        if parte.tarea_id:
            celery_app.control.revoke(parte.tarea_id, terminate=True)
        if parte.ruta_mp3 and os.path.exists(parte.ruta_mp3):
            os.remove(parte.ruta_mp3)
        db.delete(parte)

    libro = db.query(Libro).filter(Libro.id == libro_id).first()
    if libro:
        db.delete(libro)

    db.commit()


@app.post("/portadas", response_model=None)
async def subir_portada(imagen: UploadFile = File(...), usuario=Depends(requerir_admin)):
    os.makedirs(PORTADAS_DIR, exist_ok=True)
    ext = imagen.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(status_code=400, detail="Formato no soportado")
    nombre = f"{hashlib.md5(await imagen.read()).hexdigest()}.{ext}"
    ruta = os.path.join(PORTADAS_DIR, nombre)
    # Rewind para leer de nuevo tras el md5
    await imagen.seek(0)
    with open(ruta, "wb") as f:
        f.write(await imagen.read())
    return {"url": f"/portadas/{nombre}"}

@app.get("/portadas/{nombre}")
def servir_portada(nombre: str):
    ruta = os.path.join(PORTADAS_DIR, nombre)
    if not os.path.exists(ruta):
        raise HTTPException(status_code=404, detail="Portada no encontrada")
    ext = nombre.rsplit(".", 1)[-1].lower()
    media = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
    return FileResponse(ruta, media_type=media)