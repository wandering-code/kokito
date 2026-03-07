from celery_app import celery_app
from database import SessionLocal, Conversion
import pdfplumber, edge_tts, tempfile, asyncio, os

VOICE = "es-ES-AlvaroNeural"
MP3_DIR = "/tmp/kokito"

@celery_app.task
def convertir_pdf(pdf_bytes: bytes, filename: str) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        for page in file.pages:
            text += page.extract_text()

    if not text:
        return "ERROR: PDF vacío"

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    asyncio.run(edge_tts.Communicate(text, VOICE).save(tmp_mp3_path))

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text))
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path