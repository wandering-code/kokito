import os
import tempfile
import pdfplumber
from pydub import AudioSegment
from google.cloud import texttospeech
from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto

MP3_DIR = "/tmp/kokito"
MAX_BYTES = 4800

def dividir_texto(texto: str) -> list[str]:
    fragmentos = []
    while len(texto.encode("utf-8")) > MAX_BYTES:
        corte = MAX_BYTES
        while len(texto[:corte].encode("utf-8")) > MAX_BYTES:
            corte -= 1
        # Buscar el último espacio para no cortar palabras
        corte = texto.rfind(" ", 0, corte)
        fragmentos.append(texto[:corte])
        texto = texto[corte:].strip()
    fragmentos.append(texto)
    return fragmentos

def process_file_with_google(self, pdf_bytes: bytes, filename: str) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        paginas = file.pages[10:12]
        total = len(paginas)
        for i, page in enumerate(paginas):
            text += page.extract_text()
            self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})

    if not text:
        raise ValueError("El PDF no contiene texto extraíble")

    text = limpiar_texto(text)

    client = texttospeech.TextToSpeechClient()
    voice = texttospeech.VoiceSelectionParams(
        language_code="es-ES",
        name="es-ES-Chirp3-HD-Charon"
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3
    )

    fragmentos = dividir_texto(text)
    segmentos = []
    for fragmento in fragmentos:
        synthesis_input = texttospeech.SynthesisInput(text=fragmento)
        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp:
            tmp.write(response.audio_content)
            segmentos.append(AudioSegment.from_mp3(tmp.name))

    audio_final = segmentos[0]
    for segmento in segmentos[1:]:
        audio_final += segmento

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text))
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path