import os
import tempfile
import pdfplumber
from pydub import AudioSegment
from google.cloud import texttospeech
from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto
from concurrent.futures import ThreadPoolExecutor, as_completed

MP3_DIR = "/tmp/kokito"
MAX_BYTES = 4800

def dividir_texto(texto: str) -> list[str]:
    fragmentos = []
    while len(texto.encode("utf-8")) > MAX_BYTES:
        corte = MAX_BYTES
        while len(texto[:corte].encode("utf-8")) > MAX_BYTES:
            corte -= 1
        corte = texto.rfind(" ", 0, corte)
        fragmentos.append(texto[:corte])
        texto = texto[corte:].strip()
    fragmentos.append(texto)
    return fragmentos

def sintetizar_fragmento(client, voice, audio_config, i, fragmento):
    synthesis_input = texttospeech.SynthesisInput(text=fragmento)
    for intento in range(3):
        try:
            response = client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp:
                tmp.write(response.audio_content)
                return i, tmp.name
        except Exception:
            if intento == 2:
                raise
            import time
            time.sleep(2)

def process_file_with_google(self, pdf_bytes: bytes, filename: str, pagina_inicio: int = 0, pagina_fin: int = None) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        fin = (pagina_fin + 1) if pagina_fin is not None else None
        paginas = file.pages[pagina_inicio:fin]
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
        name="es-ES-Standard-B"
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3
    )

    fragmentos = dividir_texto(text)
    total_fragmentos = len(fragmentos)
    resultados = {}
    completados = [0]

    with ThreadPoolExecutor(max_workers=5) as executor:
        futuros = {
            executor.submit(sintetizar_fragmento, client, voice, audio_config, i, f): i
            for i, f in enumerate(fragmentos)
        }
        for futuro in as_completed(futuros):
            i, ruta = futuro.result()
            resultados[i] = ruta
            completados[0] += 1
            porcentaje = 50 + int((completados[0] / total_fragmentos) * 50)
            self.update_state(state="PROGRESS", meta={
                "pagina": total, "total": total, "porcentaje_override": porcentaje
            })

    segmentos = [AudioSegment.from_mp3(resultados[i]) for i in range(total_fragmentos)]

    audio_final = segmentos[0]
    for segmento in segmentos[1:]:
        audio_final += segmento

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="google")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path