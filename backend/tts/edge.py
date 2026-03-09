from celery_app import celery_app
from database import SessionLocal, Conversion
import pdfplumber, edge_tts, tempfile, asyncio, os, re
from tts.text_utils import limpiar_texto

VOICE = "es-ES-AlvaroNeural"
MP3_DIR = "/tmp/kokito"

def process_file_with_edge(self, pdf_bytes: bytes, filename: str) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        
        # Ahora mismo solo lee las páginas 11 y 12 de El imperio final
        paginas = file.pages[10:12]
        total = len(paginas)
        for i, page in enumerate(paginas):
            text += page.extract_text()
            self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})

    if not text:
        raise ValueError("El PDF no contiene texto extraíble")

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    text = limpiar_texto(text)

    asyncio.run(edge_tts.Communicate(text, VOICE).save(tmp_mp3_path))

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text))
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path

