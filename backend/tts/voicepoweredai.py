import os
import re
import tempfile
import httpx
import pdfplumber

from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto_local, insertar_pausas_sml

MP3_DIR = "/tmp/kokito"
SERVIDOR_VOICEPOWEREDAI = os.getenv("VOICEPOWEREDAI_URL", "http://192.168.1.51:8003")

# Checkpoint F5-TTS afinado solo para castellano — sin exaggeration/temperature
# como Chatterbox, admite "speed" y "cfg_strength" como parámetros de estilo.
SPEED = float(os.getenv("VOICEPOWEREDAI_SPEED", "1.0"))

# cfg_strength (classifier-free guidance) — cuánto se aferra el modelo a la
# referencia de voz. Medido en el servidor con F0 (pitch) y detección de
# clipping: 2.0 es el valor por defecto de F5-TTS, 2.2 da algo más de
# carácter sin riesgo. A partir de ~2.4 el checkpoint se rompe de verdad —
# el F0 medio se dispara de ~94Hz a 300-450Hz, que no es "más expresivo",
# es la identidad de la voz descomponiéndose. NO subir de 2.3 salvo
# experimento consciente.
CFG_STRENGTH = float(os.getenv("VOICEPOWEREDAI_CFG_STRENGTH", "2.2"))

SILENCIO_SHORT_MS = 200
SILENCIO_LONG_MS = 600

# F5-TTS es flow-matching (genera el fragmento entero de una pasada, no
# token a token como XTTS/Qwen), y su propio chunker oficial trocea en
# max 135 caracteres cortando en ; : , . ! ? por igual — a diferencia de
# XTTS, para el que la coma es solo el último recurso cuando una frase no
# cabe. Aquí se sigue esa misma recomendación en vez de la de Coqui.
MAX_CHARS = 135


def dividir_texto_voicepoweredai(texto: str, max_chars: int = MAX_CHARS) -> list[str]:
    """
    Trocea respetando los marcadores [BREAK_SHORT]/[BREAK_LONG] como cortes
    obligatorios, y dentro de cada tramo separa en ; : , . ! ? (igual que el
    chunk_text oficial de F5-TTS) reagrupando hasta el límite de caracteres.
    """
    partes_brutas = re.split(r'(\[BREAK_(?:SHORT|LONG)\])', texto.strip())

    fragmentos = []
    actual = ""

    for parte in partes_brutas:
        if re.match(r'\[BREAK_(?:SHORT|LONG)\]', parte):
            if actual.strip():
                fragmentos.append(actual.strip() + " " + parte)
                actual = ""
            continue

        trozos = re.split(r'(?<=[;:,.!?])\s+', parte.strip())
        for trozo in trozos:
            if not trozo:
                continue
            if len(actual) + len(trozo) + 1 <= max_chars:
                actual = (actual + " " + trozo).strip()
            else:
                if actual:
                    fragmentos.append(actual.strip())
                actual = trozo

    if actual.strip():
        fragmentos.append(actual.strip())

    return [f for f in fragmentos if f.strip()]


def _extraer_marcador_voicepoweredai(fragmento: str) -> tuple[str, str | None]:
    match = re.search(r'\s*\[BREAK_(SHORT|LONG)\]\s*$', fragmento)
    if match:
        tipo = match.group(1)
        texto = fragmento[:match.start()].strip()
    else:
        texto = fragmento.strip()
        tipo = None

    # A diferencia de XTTS, F5-TTS no lee la puntuación final como palabra
    # literal ni genera clic con el guion de diálogo al final de fragmento,
    # así que —a propósito— NO se convierte el punto en coma ni se quita el
    # guion: son parches de Coqui que aquí solo estropeaban el diálogo y la
    # entonación de cierre de frase.
    texto = re.sub(r'[!?],', lambda m: m.group(0)[0], texto)
    texto = re.sub(r',+', ',', texto)

    # Este checkpoint pronuncia mal el signo de apertura español ("¿Estás..."
    # sonaba como "OEstás..."). Se quita el de apertura y se deja el de
    # cierre, que es el que aporta la entonación — mismo criterio que ya se
    # usa para Edge/Google en limpiar_texto().
    texto = texto.replace("¿", "").replace("¡", "")

    return texto, tipo


def _recortar_silencios(segmento, umbral_db=-40.0, margen_ms=80):
    """
    El servidor de VoicePoweredAI devuelve cada fragmento con ~1s de silencio
    muerto al principio y ~300ms al final (verificado con silencedetect).
    Sin recortarlo, ese silencio se suma al que añade Kokito entre
    fragmentos y el resultado se oye lento y con pausas irregulares.
    Deja un margen para no cortar el ataque de la primera sílaba.
    """
    from pydub.silence import detect_leading_silence

    inicio = max(0, detect_leading_silence(segmento, silence_threshold=umbral_db) - margen_ms)
    fin = max(0, detect_leading_silence(segmento.reverse(), silence_threshold=umbral_db) - margen_ms)

    if inicio + fin >= len(segmento):
        return segmento

    return segmento[inicio: len(segmento) - fin]


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

    text = limpiar_texto_local(text)
    text = insertar_pausas_sml(text)

    if not text.strip():
        raise ValueError("El texto quedó vacío tras la limpieza")

    # A diferencia de Coqui, aquí NO se fusionan los fragmentos cortos con el
    # vecino: dividir_texto_voicepoweredai ya empaqueta hasta MAX_CHARS
    # respetando el troceado nativo de F5-TTS, y fusionar por encima de eso
    # se tragaba pausas [BREAK_*] puestas a propósito (p.ej. entre una
    # pregunta y su acotación de diálogo) y podía superar el límite de
    # caracteres del modelo, forzando un re-troceado del propio servidor
    # sobre el que Kokito no tiene control de silencios.
    fragmentos = dividir_texto_voicepoweredai(text)

    total_fragmentos = len(fragmentos)
    segmentos = []

    for i, fragmento in enumerate(fragmentos):
        porcentaje = 50 + int(((i + 1) / total_fragmentos) * 50)
        self.update_state(state="PROGRESS", meta={
            "pagina": total, "total": total,
            "porcentaje_override": porcentaje
        })

        texto_limpio, tipo_marcador = _extraer_marcador_voicepoweredai(fragmento)
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
                        "cfg_strength": CFG_STRENGTH,
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
        segmento = _recortar_silencios(AudioSegment.from_file(ruta, format="wav"))
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
