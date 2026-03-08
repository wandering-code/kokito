from celery_app import celery_app
from database import SessionLocal, Conversion
import pdfplumber, edge_tts, tempfile, asyncio, os, re

VOICE = "es-ES-AlvaroNeural"
MP3_DIR = "/tmp/kokito"

def limpiar_texto(texto: str) -> str:
    # Limpiando pausas tras títulos
    texto_limpio = re.sub(r"\n([A-ZÁÉÍÓÚÑÜ]+)\n", r". \1. ", texto)

    # Limpiando saltos de línea
    texto_limpio = re.sub(r"\n{2,}", ". ", texto_limpio)
    texto_limpio = re.sub(r"\s+", " ", re.sub(r"\n", " ", texto_limpio))

    # Limpiando la paginación y las URLs
    texto_limpio = re.sub(r"-?\s*Página\s*\d+", "", texto_limpio)
    texto_limpio = re.sub(r"www\.\S+", "", texto_limpio)

    return texto_limpio

@celery_app.task(bind=True)
def convertir_pdf(self, pdf_bytes: bytes, filename: str) -> str:
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