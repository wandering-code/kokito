from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import pdfplumber, edge_tts, tempfile
from database import SessionLocal, Conversion, crear_tablas

app = FastAPI()
VOICE = "es-ES-AlvaroNeural"

@app.on_event("startup")
def startup():
    crear_tablas()

@app.get("/health_check")
def health_check():
    return {"mensaje": "Servicio Api REST activo"}

@app.post("/convertir")
async def convertir(pdf: UploadFile = File(...)):
    with pdfplumber.open(pdf.file) as file:
        text = ""
        for page in file.pages:
            text += page.extract_text()

    if text:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(tmp_path)

        db = SessionLocal()
        conversion = Conversion(nombre=pdf.filename, caracteres=len(text))
        db.add(conversion)
        db.commit()
        db.close()

        return FileResponse(tmp_path, media_type="audio/mpeg", filename="kokito.mp3")
    else:
        return {"mensaje": "El archivo PDF está vacío"}