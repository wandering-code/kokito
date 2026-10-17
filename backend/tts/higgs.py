import io
import os
import tempfile
import time
import httpx
import pdfplumber

from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto_voicebox, dividir_unidades_higgs, agrupar_trozos_higgs

MP3_DIR = "/tmp/kokito"
SERVIDOR_HIGGS = os.getenv("HIGGS_URL", "http://192.168.1.51:8006")

# Receta validada de oído en la evaluación (#7, último comentario), servida
# por D:\Proyectos\otros\higgs\server.py en el sobremesa. Aquí solo va lo que
# decide Kokito: troceo, emociones por trozo y ensamblado.
#
# Trozos cortos, por intervención (<= 200 caracteres): con referencia fija y
# trozos de 3-10 s la voz no cambia entre trozos; con trozos de ~300
# caracteres (20-27 s) derivaba dentro de la generación y el empalme lo hacía
# audible (#7, prueba de continuidad del 2026-09-25).
MAX_CHARS_POR_TROZO = int(os.getenv("HIGGS_MAX_CHARS_POR_TROZO", "200"))
# T = 1,2 elegida a ciegas frente a 0,7 y 0,95: "el que menos monótono es".
# Sube los inventos de palabras, que el servidor caza con ASR y regenera.
TEMPERATURA = float(os.getenv("HIGGS_TEMPERATURA", "1.2"))
# Emociones por intervención: las pone el servidor de Higgs (Gemini si tiene clave,
# si no el LLM local con Ollama; ver anotador.py del servidor). Con 0 se
# genera todo sin etiquetas (más rápido, más monótono).
ANOTAR_EMOCIONES = os.getenv("HIGGS_ANOTAR_EMOCIONES", "1") == "1"
# Pausa entre trozos: la de todas las escuchas de #7 (0,35 s), sin recorte de
# silencios — Higgs no deja colas largas y así sonó en lo validado.
PAUSA_MS = 350
CROSSFADE_MS = 8


def _anotar(unidades):
    response = httpx.post(f"{SERVIDOR_HIGGS}/anotar", json={"unidades": unidades}, timeout=1800)
    response.raise_for_status()
    return response.json()["etiquetas"]


def _sintetizar_trozo(trozo, voz_bytes, semilla):
    MAX_INTENTOS = 3
    for intento in range(MAX_INTENTOS):
        try:
            response = httpx.post(
                f"{SERVIDOR_HIGGS}/tts",
                data={
                    "texto": trozo["texto"],
                    "emocion": trozo["emocion"] or "",
                    "estilo": trozo["estilo"] or "",
                    "temperature": TEMPERATURA,
                    "semilla": semilla,
                },
                files={"voz": ("voz.mp3", voz_bytes, "audio/mpeg")},
                timeout=600
            )
            response.raise_for_status()
            return response.content
        except (httpx.ReadTimeout, httpx.ConnectError) as e:
            print(f"Intento {intento + 1} fallido: {e}")
            if intento == MAX_INTENTOS - 1:
                raise
            time.sleep(5)


def process_file_with_higgs(self, pdf_bytes, filename, pagina_inicio=0, pagina_fin=None,
                            voz_bytes=b"", texto_directo=None) -> str:
    from pydub import AudioSegment

    os.makedirs(MP3_DIR, exist_ok=True)

    if not voz_bytes:
        raise ValueError("Higgs necesita una voz de referencia")

    if texto_directo is not None:
        text = texto_directo
        self.update_state(state="PROGRESS", meta={"pagina": 1, "total": 1, "porcentaje_override": 30})
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
                    "porcentaje_override": int(((i + 1) / total) * 30)
                })

        os.unlink(tmp_pdf_path)

    if not text.strip():
        raise ValueError("El texto extraido esta vacio")

    text = limpiar_texto_voicebox(text)

    if not text.strip():
        raise ValueError("El texto quedó vacío tras la limpieza")

    unidades = dividir_unidades_higgs(text, max_chars=MAX_CHARS_POR_TROZO)
    etiquetas = [{"emocion": None, "estilo": None} for _ in unidades]
    if ANOTAR_EMOCIONES:
        try:
            etiquetas = _anotar(unidades)
        except Exception as e:
            # Sin emociones el capítulo sigue siendo válido (solo más plano).
            print(f"Anotación de emociones fallida, se genera sin etiquetas: {e}")
    self.update_state(state="PROGRESS", meta={"pagina": 1, "total": 1, "porcentaje_override": 35})

    trozos = agrupar_trozos_higgs(unidades, etiquetas, max_chars=MAX_CHARS_POR_TROZO)
    total_trozos = len(trozos)

    audio_final = None
    silencio = AudioSegment.silent(duration=PAUSA_MS)
    for i, trozo in enumerate(trozos):
        # Semilla fija por posición: regenerar un capítulo da el mismo audio.
        audio_bytes = _sintetizar_trozo(trozo, voz_bytes, semilla=100 * i)
        segmento = AudioSegment.from_file(io.BytesIO(audio_bytes), format="wav")
        if audio_final is None:
            audio_final = segmento
        else:
            audio_final = audio_final.append(silencio, crossfade=CROSSFADE_MS).append(segmento, crossfade=CROSSFADE_MS)

        self.update_state(state="PROGRESS", meta={
            "pagina": total_trozos, "total": total_trozos,
            "porcentaje_override": 35 + int(((i + 1) / total_trozos) * 60)
        })

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="higgs")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path
