from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
from tasks import convertir_pdf
from celery_app import celery_app
from database import crear_tablas

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    crear_tablas()

@app.get("/health_check")
def health_check():
    return {"mensaje": "Servicio Api REST activo"}

@app.post("/convertir")
async def convertir(pdf: UploadFile = File(...), proveedor: str = Form(...)):
    pdf_bytes = await pdf.read()
    tarea = convertir_pdf.delay(pdf_bytes, pdf.filename, proveedor)
    return {"tarea_id": tarea.id}

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
        pagina = tarea.info.get("pagina", 0)
        total = tarea.info.get("total", 1)
        porcentaje = int((pagina / total) * 100)
        return {"estado": "progreso", "porcentaje": porcentaje}