import os
import tempfile
import httpx
import pdfplumber

from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto_voicebox

VOICEBOX_URL = os.getenv("VOICEBOX_URL", "http://192.168.1.51:17493")
VOICEBOX_PROFILE_ID_DEFAULT = os.getenv("VOICEBOX_PROFILE_ID", "4f2e31cf-a3aa-47d6-934c-f74d80aec9f2")
MP3_DIR = "/tmp/kokito"
# Timeout generoso: 10 min por chunk interno de Voicebox x 4 chunks = 40 min máximo
STREAM_TIMEOUT = 2400


def process_file_with_voicebox(self, pdf_bytes, filename,
                                pagina_inicio=0, pagina_fin=None,
                                texto_directo=None, profile_id=None) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    profile_id_final = profile_id or VOICEBOX_PROFILE_ID_DEFAULT

    # --- Extracción de texto ---
    if texto_directo:
        text = texto_directo
        total = 1
    else:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
            tmp_pdf.write(pdf_bytes)
            tmp_pdf_path = tmp_pdf.name

        with pdfplumber.open(tmp_pdf_path) as file:
            paginas = file.pages[pagina_inicio:pagina_fin]
            total = len(paginas)
            text = ""
            for i, page in enumerate(paginas):
                text += page.extract_text() or ""
                self.update_state(state="PROGRESS", meta={
                    "pagina": i + 1,
                    "total": total,
                    "porcentaje_override": int(((i + 1) / total) * 50)
                })

        os.unlink(tmp_pdf_path)

    if not text.strip():
        raise ValueError("El texto extraido esta vacio")

    text = limpiar_texto_voicebox(text)

    self.update_state(state="PROGRESS", meta={
        "pagina": total, "total": total, "porcentaje_override": 55
    })

    print(f"DEBUG texto mandado a Voicebox:\n{text[:500]}")

    # --- Streaming directo: bloquea hasta que el audio está completo ---
    with httpx.Client(timeout=STREAM_TIMEOUT) as client:
        response = client.post(
            f"{VOICEBOX_URL}/generate/stream",
            json={
                "profile_id": profile_id_final,
                "text": text,
                "language": "es",
                "engine": "qwen",
                "model_size": "1.7B",
                "instruct": "You are narrating an epic fantasy novel in Spanish. Read with dramatic expression and emotional depth. Use natural rhythm: slow down at tense moments, pause meaningfully at sentence endings and paragraph breaks. When a character speaks (lines starting with —), give them a distinct voice different from the narration. Emphasize emotional words. Make it feel like a professional audiobook performance."
            }
        )
        response.raise_for_status()
        audio_bytes = response.content

    if not audio_bytes:
        raise ValueError("Voicebox devolvio un audio vacio")

    self.update_state(state="PROGRESS", meta={
        "pagina": total, "total": total, "porcentaje_override": 95
    })

    # --- Guardar en disco ---
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=MP3_DIR) as tmp_audio:
        tmp_audio.write(audio_bytes)
        tmp_audio_path = tmp_audio.name

    # --- Registrar en BBDD ---
    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="voicebox")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_audio_path