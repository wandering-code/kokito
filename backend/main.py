from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import pdfplumber, edge_tts, tempfile

app = FastAPI()
VOICE = "es-ES-AlvaroNeural"

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
            return FileResponse(tmp_path, media_type="audio/mpeg", filename="kokito.mp3")
        else:
            return {"mensaje": "El archivo PDF está vacío"}
        
    

