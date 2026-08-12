import io
import os
import tempfile
import httpx
import pdfplumber

from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto_voicebox

MP3_DIR = "/tmp/kokito"
SERVIDOR_INDEXTTS = os.getenv("INDEXTTS_URL", "http://192.168.1.51:8005")

# Parámetros fijados tras las pruebas de calidad del 2026-08-12 — ver DIARIO.
# low_vram_chunking=false + ~220 tokens por fragmento: punto intermedio entre
# el modo de 40 caracteres (demasiados cortes, artefactos), 150 (mas fragmentos
# de la cuenta en capitulos largos, entonacion algo mas plana en preguntas
# cortas — medido con F0: std 22.6Hz vs 23.7Hz con 220) y 400 (el modelo se
# precipita y genera menos audio del que corresponde al texto). 220 reduce
# fragmentos sin reintroducir el problema de "atropello" (ritmo verificado:
# ~17 caracteres/segundo, igual que con fragmentos mas cortos).
DURATION_FACTOR = float(os.getenv("INDEXTTS_DURATION_FACTOR", "0.92"))
MAX_TEXT_TOKENS_PER_SEGMENT = int(os.getenv("INDEXTTS_MAX_TOKENS_PER_SEGMENT", "220"))


def process_file_with_indextts(self, pdf_bytes, filename, pagina_inicio=0, pagina_fin=None,
                                voz_bytes=b"", texto_directo=None, idioma="es") -> str:
    from pydub import AudioSegment

    os.makedirs(MP3_DIR, exist_ok=True)

    if texto_directo is not None:
        text = texto_directo
        self.update_state(state="PROGRESS", meta={"pagina": 1, "total": 1, "porcentaje_override": 50})
    else:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
            tmp_pdf.write(pdf_bytes)
            tmp_pdf_path = tmp_pdf.name

        with pdfplumber.open(tmp_pdf_path) as file:
            fin = (pagina_fin + 1) if pagina_fin is not None else None
            paginas = file.pages[pagina_inicio:fin]
            total = len(paginas)
            text = ""
            for i, page in enumerate(paginas):
                texto_pagina = page.extract_text()
                if texto_pagina:
                    text += texto_pagina + "\n\n"
                self.update_state(state="PROGRESS", meta={
                    "pagina": i + 1, "total": total,
                    "porcentaje_override": int(((i + 1) / total) * 50)
                })

        os.unlink(tmp_pdf_path)

    if not text.strip():
        raise ValueError("El texto extraido esta vacio")

    # Preprocesado generico (letras capitulares, notas del traductor, URLs,
    # numeros de pagina, comillas) — IndexTTS-2.5 hace su propia normalizacion
    # y troceado por frases, asi que no hace falta nada especifico de motor
    # (nada de marcadores [BREAK_*] ni tocar los guiones de dialogo).
    text = limpiar_texto_voicebox(text)

    if not text.strip():
        raise ValueError("El texto quedó vacío tras la limpieza")

    self.update_state(state="PROGRESS", meta={"pagina": 1, "total": 1, "porcentaje_override": 60})

    MAX_INTENTOS = 3
    for intento in range(MAX_INTENTOS):
        try:
            response = httpx.post(
                f"{SERVIDOR_INDEXTTS}/tts",
                data={
                    "texto": text,
                    "idioma": idioma,
                    "duration_factor": DURATION_FACTOR,
                    "low_vram_chunking": "false",
                    "max_text_tokens_per_segment": MAX_TEXT_TOKENS_PER_SEGMENT,
                },
                files={"voz": ("voz.wav", voz_bytes, "audio/wav")},
                timeout=3600
            )
            response.raise_for_status()
            break
        except (httpx.ReadTimeout, httpx.ConnectError) as e:
            print(f"Intento {intento + 1} fallido: {e}")
            if intento == MAX_INTENTOS - 1:
                raise
            import time
            time.sleep(5)

    self.update_state(state="PROGRESS", meta={"pagina": 1, "total": 1, "porcentaje_override": 95})

    audio_final = AudioSegment.from_file(io.BytesIO(response.content), format="wav")

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="indextts")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path
