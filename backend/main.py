from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from celery.result import AsyncResult
from tasks import convertir_pdf
from celery_app import celery_app
from database import crear_tablas

app = FastAPI()

@app.on_event("startup")
def startup():
    crear_tablas()

@app.get("/health_check")
def health_check():
    return {"mensaje": "Servicio Api REST activo"}

@app.post("/convertir")
async def convertir(pdf: UploadFile = File(...)):
    pdf_bytes = await pdf.read()
    tarea = convertir_pdf.delay(pdf_bytes, pdf.filename)
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
