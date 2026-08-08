import os
import tempfile
import httpx
import pdfplumber

from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto_local, insertar_pausas_sml
from tts.local import dividir_texto_local, _extraer_marcador, fusionar_frases_cortas

MP3_DIR = "/tmp/kokito"
SERVIDOR_VOICEPOWEREDAI = os.getenv("VOICEPOWEREDAI_URL", "http://192.168.1.51:8003")

# Checkpoint F5-TTS afinado solo para castellano — sin exaggeration/cfg_weight
# como Chatterbox, admite "speed" como único parámetro de estilo.
SPEED = float(os.getenv("VOICEPOWEREDAI_SPEED", "1.0"))

SILENCIO_SHORT_MS = 200
SILENCIO_LONG_MS = 600


def process_file_with_voicepoweredai(self, pdf_bytes, filename, pagina_inicio=0, pagina_fin=None,
                                      voz_bytes=b"", texto_directo=None, idioma="es") -> str:
    from pydub import AudioSegment

    os.makedirs(MP3_DIR, exist_ok=True)

    if texto_directo is not None:
        text = texto_directo
        total = 1
        self.update_state(state="PROGRESS", meta={"pagina": 1, "total": 1})
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
                    text += texto_pagina
                self.update_state(state="PROGRESS", meta={
                    "pagina": i + 1, "total": total,
                    "porcentaje_override": int(((i + 1) / total) * 50)
                })

        os.unlink(tmp_pdf_path)

    if not text.strip():
        raise ValueError("El texto extraido esta vacio")

    # Reutiliza el preprocesado de Coqui/Chatterbox — mismo modelo base F5-TTS,
    # así que la fragmentación y limpieza de texto le sientan igual de bien.
    text = limpiar_texto_local(text)
    text = insertar_pausas_sml(text)

    if not text.strip():
        raise ValueError("El texto quedó vacío tras la limpieza")

    fragmentos_raw = dividir_texto_local(text)

    fragmentos = []
    pendiente_texto = ""
    pendiente_tipo = None

    for fragmento in fragmentos_raw:
        texto_sin_marcador, tipo = _extraer_marcador(fragmento)
        palabras = len(texto_sin_marcador.split())

        if palabras < 6:
            if pendiente_texto:
                pendiente_texto = pendiente_texto + " " + texto_sin_marcador
            else:
                pendiente_texto = texto_sin_marcador
            if tipo == "LONG" or pendiente_tipo == "LONG":
                pendiente_tipo = "LONG"
            elif tipo == "SHORT" or pendiente_tipo == "SHORT":
                pendiente_tipo = "SHORT"
        else:
            if pendiente_texto:
                texto_sin_marcador = pendiente_texto + " " + texto_sin_marcador
                if pendiente_tipo == "LONG" or tipo == "LONG":
                    tipo = "LONG"
                elif pendiente_tipo == "SHORT" or tipo == "SHORT":
                    tipo = "SHORT"
                pendiente_texto = ""
                pendiente_tipo = None
            if tipo:
                fragmentos.append(texto_sin_marcador + " [BREAK_" + tipo + "]")
            else:
                fragmentos.append(texto_sin_marcador)

    if pendiente_texto:
        if fragmentos:
            ultimo = fragmentos[-1]
            ultimo_texto, ultimo_tipo = _extraer_marcador(ultimo)
            fusionado = ultimo_texto + " " + pendiente_texto
            if ultimo_tipo:
                fragmentos[-1] = fusionado + " [BREAK_" + ultimo_tipo + "]"
            else:
                fragmentos[-1] = fusionado
        else:
            fragmentos.append(pendiente_texto)

    total_fragmentos = len(fragmentos)
    segmentos = []

    for i, fragmento in enumerate(fragmentos):
        porcentaje = 50 + int(((i + 1) / total_fragmentos) * 50)
        self.update_state(state="PROGRESS", meta={
            "pagina": total, "total": total,
            "porcentaje_override": porcentaje
        })

        texto_limpio, tipo_marcador = _extraer_marcador(fragmento)
        silencio_ms = SILENCIO_LONG_MS if tipo_marcador == "LONG" else SILENCIO_SHORT_MS

        if not texto_limpio:
            continue

        MAX_INTENTOS = 3
        for intento in range(MAX_INTENTOS):
            try:
                response = httpx.post(
                    f"{SERVIDOR_VOICEPOWEREDAI}/tts",
                    data={
                        "texto": texto_limpio,
                        "idioma": idioma,
                        "speed": SPEED,
                    },
                    files={"voz": ("voz.wav", voz_bytes, "audio/wav")},
                    timeout=600
                )
                response.raise_for_status()
                break
            except (httpx.ReadTimeout, httpx.ConnectError) as e:
                print(f"Intento {intento + 1} fallido: {e}")
                if intento == MAX_INTENTOS - 1:
                    raise
                import time
                time.sleep(5)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=MP3_DIR) as tmp:
            tmp.write(response.content)
            tmp.flush()
            segmentos.append((tmp.name, silencio_ms))

    audio_final = None
    for ruta, silencio_ms in segmentos:
        segmento = AudioSegment.from_file(ruta, format="wav")
        if audio_final is None:
            audio_final = segmento
        else:
            silencio = AudioSegment.silent(duration=silencio_ms)
            audio_final = audio_final + silencio + segmento

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="voicepoweredai")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path
