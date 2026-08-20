import io
import os
import tempfile
import time
import httpx
import pdfplumber

from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto_voicebox, dividir_texto_indextts

MP3_DIR = "/tmp/kokito"
SERVIDOR_INDEXTTS = os.getenv("INDEXTTS_URL", "http://192.168.1.51:8005")

# low_vram_chunking=false + 120 tokens por fragmento como tope de seguridad
# del lado de IndexTTS. El troceado real ahora lo decide Kokito
# (dividir_texto_indextts, ver text_utils.py): siempre corta en un límite de
# frase (. ! ? …), nunca en una coma ni a media frase, para no partir un
# intercambio de diálogo ni perder la entonación de una pregunta/exclamación
# — el troceador por tokens de IndexTTS de fábrica sí puede cortar en comas.
# OJO: 120 es el valor VALIDADO en la evaluación del 2026-08-20 (ver
# EVALUACION_INDEXTTS.md en D:\Proyectos\index_tts del motor) — no es solo un
# límite de seguridad para evitar el troceo interno sin contexto. Se probó en
# vivo (2026-08-20, prueba real en Kokito local) que un valor mayor (220,
# heredado de una sesión de tuning del 2026-08-12 anterior a esta evaluación)
# sigue sin trocear casi ningún fragmento (mismo texto, un único segmento en
# ambos casos) pero hace que el regulador de duración de IndexTTS comprima el
# audio generado ~20% (mismo texto/duration_factor: 24.8s con 220 vs 30.4s
# con 120) — probablemente la causa de la sensación de lectura acelerada y de
# los golpes raros reportados cerca de subordinadas largas. No subir de 120
# sin volver a escuchar.
DURATION_FACTOR = float(os.getenv("INDEXTTS_DURATION_FACTOR", "0.92"))
MAX_TEXT_TOKENS_PER_SEGMENT = int(os.getenv("INDEXTTS_MAX_TOKENS_PER_SEGMENT", "120"))
# Bajado de 420 a 200 el 2026-08-20 (misma tarde): con 420, el empaquetado de
# narración (dividir_texto_indextts) metía 4-5 frases seguidas en una sola
# llamada a IndexTTS (hasta ~30s de audio por fragmento) — probado en vivo
# que eso aumenta el riesgo de que el modelo repita una palabra (bucle del
# decodificador autoregresivo en generaciones largas) y de que Whisper deje
# de transcribir antes del final real (causó un bug real: el recorte de cola
# cortaba contenido bueno pensando que era cola sobrante — ver
# GAP_MAXIMO_CONFIABLE_MS en server.py, ya arreglado, pero 200 reduce
# ademas la probabilidad de que pase). 200 sigue permitiendo empaquetar
# 2-3 frases cortas de narración por llamada.
MAX_CHARS_POR_FRAGMENTO = int(os.getenv("INDEXTTS_MAX_CHARS_POR_FRAGMENTO", "200"))

# Pausas entre fragmentos: 600ms si el fragmento actual o el siguiente
# empieza por guion largo "—" (línea de diálogo), 300ms si es narración
# seguida. Pipeline validado el 2026-08-20 sobre una novela de Abercrombie
# (14 fragmentos, "—Monza, esta mañana..."): el usuario confirmó "Mejor
# ahora" con esta regla — ver EVALUACION_INDEXTTS.md en D:\Proyectos\index_tts
# del motor. Sustituye a la regla anterior basada en fin de párrafo
# (700/350ms, 2026-08-12): esta es la que quedó validada de oído.
# OJO: pydub .append(seg, crossfade=X) SOLAPA X ms de cada lado — con
# crossfade=20 en los dos append() (silencio y siguiente fragmento) se comía
# ~40ms reales de la pausa (bug encontrado 2026-08-12). Crossfade bajado a
# algo simbólico, solo para evitar un clic digital en el corte, no para
# suavizar-y-recortar la pausa en sí.
PAUSA_DIALOGO_MS = 600
PAUSA_NARRACION_MS = 300
CROSSFADE_MS = 8
UMBRAL_SILENCIO_DB = -40.0


def _recortar_silencio(segmento, umbral_db=UMBRAL_SILENCIO_DB):
    from pydub.silence import detect_leading_silence
    inicio = detect_leading_silence(segmento, silence_threshold=umbral_db)
    fin = detect_leading_silence(segmento.reverse(), silence_threshold=umbral_db)
    duracion = len(segmento)
    if inicio + fin >= duracion:
        return segmento
    return segmento[inicio:duracion - fin]


def _sintetizar_fragmento(texto, idioma, voz_bytes):
    MAX_INTENTOS = 3
    for intento in range(MAX_INTENTOS):
        try:
            response = httpx.post(
                f"{SERVIDOR_INDEXTTS}/tts",
                data={
                    "texto": texto,
                    "idioma": idioma,
                    "duration_factor": DURATION_FACTOR,
                    "low_vram_chunking": "false",
                    "max_text_tokens_per_segment": MAX_TEXT_TOKENS_PER_SEGMENT,
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


def process_file_with_indextts(self, pdf_bytes, filename, pagina_inicio=0, pagina_fin=None,
                                voz_bytes=b"", texto_directo=None, idioma="es") -> str:
    from pydub import AudioSegment

    os.makedirs(MP3_DIR, exist_ok=True)

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

    # Preprocesado generico (letras capitulares, notas del traductor, URLs,
    # numeros de pagina, comillas).
    text = limpiar_texto_voicebox(text)

    if not text.strip():
        raise ValueError("El texto quedó vacío tras la limpieza")

    fragmentos = dividir_texto_indextts(text, max_chars=MAX_CHARS_POR_FRAGMENTO)
    total_fragmentos = len(fragmentos)

    segmentos_audio = []
    for i, (fragmento_texto, es_dialogo) in enumerate(fragmentos):
        porcentaje = 30 + int(((i + 1) / total_fragmentos) * 65)
        self.update_state(state="PROGRESS", meta={
            "pagina": total_fragmentos, "total": total_fragmentos,
            "porcentaje_override": porcentaje
        })

        audio_bytes = _sintetizar_fragmento(fragmento_texto, idioma, voz_bytes)
        segmento = AudioSegment.from_file(io.BytesIO(audio_bytes), format="wav")
        segmentos_audio.append((_recortar_silencio(segmento), es_dialogo))

    audio_final = None
    for i, (segmento, es_dialogo) in enumerate(segmentos_audio):
        if audio_final is None:
            audio_final = segmento
        else:
            limite_dialogo = segmentos_audio[i - 1][1] or es_dialogo
            pausa_ms = PAUSA_DIALOGO_MS if limite_dialogo else PAUSA_NARRACION_MS
            silencio = AudioSegment.silent(duration=pausa_ms)
            audio_final = audio_final.append(silencio, crossfade=CROSSFADE_MS).append(segmento, crossfade=CROSSFADE_MS)

    self.update_state(state="PROGRESS", meta={"pagina": total_fragmentos, "total": total_fragmentos, "porcentaje_override": 95})

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="indextts")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path
