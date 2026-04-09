import httpx
import tempfile
import os
from database import SessionLocal, Conversion
import re
import pdfplumber

MP3_DIR = "/tmp/kokito"
SERVIDOR_LOCAL = os.getenv("TTS_LOCAL_URL", "http://192.168.1.51:8001")

SILENCIO_SHORT_MS = 200  # Bajado de 300 — más corto que la pausa natural de XTTS con coma
SILENCIO_LONG_MS  = 600  # Bajado de 700 — proporcional


def dividir_texto_local(texto: str, max_chars: int = 180) -> list[str]:
    """
    Divide el texto en fragmentos respetando:
    1. Los marcadores [BREAK_SHORT] y [BREAK_LONG] como puntos de corte obligatorios
    2. Fin de frase (. ! ?)
    3. Comas para frases largas
    Límite subido a 180 para dar más contexto a XTTS y reducir artefactos
    en fragmentos cortos.
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

        frases = re.split(r'(?<=[.!?])\s+', parte.strip())
        for frase in frases:
            if not frase:
                continue
            if len(frase) > max_chars:
                if actual:
                    fragmentos.append(actual.strip())
                    actual = ""
                partes_coma = re.split(r'(?<=,)\s+', frase)
                for p in partes_coma:
                    if len(actual) + len(p) + 1 <= max_chars:
                        actual = (actual + " " + p).strip()
                    else:
                        if actual:
                            fragmentos.append(actual.strip())
                        actual = p
            elif len(actual) + len(frase) + 1 <= max_chars:
                actual = (actual + " " + frase).strip()
            else:
                if actual:
                    fragmentos.append(actual.strip())
                actual = frase

    if actual.strip():
        fragmentos.append(actual.strip())

    return [f for f in fragmentos if f.strip()]


def _extraer_marcador(fragmento: str) -> tuple[str, str | None]:
    match = re.search(r'\s*\[BREAK_(SHORT|LONG)\]\s*$', fragmento)
    if match:
        tipo = match.group(1)
        texto = fragmento[:match.start()].strip()
    else:
        texto = fragmento.strip()
        tipo = None

    # Punto final → coma para evitar que XTTS lo vocalice como "punto"
    texto = re.sub(r'\.$', ',', texto).strip()

    # Guión al final → quitarlo — XTTS genera artefacto de clic con guión final
    texto = re.sub(r'[—–-]+\s*$', ',', texto).strip()

    # Puntuación doble que pueda haber quedado
    texto = re.sub(r',+$', ',', texto).strip()
    texto = re.sub(r'[!?],', lambda m: m.group(0)[0], texto)

    return texto, tipo


def fusionar_frases_cortas(texto: str, min_palabras: int = 6) -> str:
    # Reconoce tanto . ! ? como , como separadores de frase
    frases = re.split(r'(?<=[.!?,])\s+', texto.strip())
    resultado = []
    pendiente = ""

    for frase in frases:
        if pendiente:
            frase = pendiente + " " + frase
            pendiente = ""
        if len(frase.split()) < min_palabras:
            pendiente = frase
        else:
            resultado.append(frase)

    if pendiente:
        if resultado:
            resultado[-1] = resultado[-1] + " " + pendiente
        else:
            resultado.append(pendiente)

    return " ".join(resultado)


def process_file_with_local(self, pdf_bytes, filename, pagina_inicio=0, pagina_fin=None, voz_bytes=b"", texto_directo=None) -> str:
    from tts.text_utils import limpiar_texto_local, insertar_pausas_sml
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
            text = ""
            fin = (pagina_fin + 1) if pagina_fin is not None else None
            paginas = file.pages[pagina_inicio:fin]
            total = len(paginas)
            for i, page in enumerate(paginas):
                texto_pagina = page.extract_text()
                if texto_pagina:
                    text += texto_pagina
                self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})

    if not text:
        raise ValueError("El texto está vacío")

    text = limpiar_texto_local(text)
    text = insertar_pausas_sml(text)

    if not text.strip():
        raise ValueError("El texto quedó vacío tras la limpieza")

    # Dividir en fragmentos y luego fusionar los que sean demasiado cortos
    fragmentos_raw = dividir_texto_local(text)

    fragmentos = []
    pendiente_texto = ""
    pendiente_tipo = None

    for fragmento in fragmentos_raw:
        texto_sin_marcador, tipo = _extraer_marcador(fragmento)
        palabras = len(texto_sin_marcador.split())

        if palabras < 6:
            # Fragmento corto — acumular con el siguiente
            if pendiente_texto:
                pendiente_texto = pendiente_texto + " " + texto_sin_marcador
            else:
                pendiente_texto = texto_sin_marcador
            # Conservar el tipo de pausa más largo entre los acumulados
            if tipo == "LONG" or pendiente_tipo == "LONG":
                pendiente_tipo = "LONG"
            elif tipo == "SHORT" or pendiente_tipo == "SHORT":
                pendiente_tipo = "SHORT"
        else:
            if pendiente_texto:
                # Fusionar el pendiente con este fragmento
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

    # Si quedó algo pendiente al final, añadirlo al último fragmento
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

        if len(texto_limpio) > 220:
            texto_limpio = texto_limpio[:220].rsplit(' ', 1)[0]

        MAX_INTENTOS = 3
        for intento in range(MAX_INTENTOS):
            try:
                response = httpx.post(
                    f"{SERVIDOR_LOCAL}/tts",
                    data={"texto": texto_limpio},
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
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="local")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path