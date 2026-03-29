import httpx
import tempfile
import os
from database import SessionLocal, Conversion

MP3_DIR = "/tmp/kokito"
SERVIDOR_LOCAL = os.getenv("TTS_LOCAL_URL", "http://192.168.1.51:8001")

def dividir_texto_local(texto: str, max_chars: int = 200) -> list[str]:
    import re
    frases = re.split(r'(?<=[.!?])\s+', texto.strip())
    
    fragmentos = []
    actual = ""

    for frase in frases:
        if len(frase) > max_chars:
            partes = re.split(r'(?<=,)\s+', frase)
            for parte in partes:
                if len(actual) + len(parte) + 1 <= max_chars:
                    actual = (actual + " " + parte).strip()
                else:
                    if actual:
                        fragmentos.append(actual)
                    actual = parte
        elif len(actual) + len(frase) + 1 <= max_chars:
            actual = (actual + " " + frase).strip()
        else:
            if actual:
                fragmentos.append(actual)
            actual = frase

    if actual:
        fragmentos.append(actual)

    return fragmentos

def process_file_with_local(self, pdf_bytes, filename, pagina_inicio=0, pagina_fin=None, voz_bytes=b"") -> str:
    import pdfplumber
    from tts.text_utils import limpiar_texto
    from pydub import AudioSegment

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
            texto_pagina = page.extract_text()
            if texto_pagina:
                text += texto_pagina
            self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})

    if not text:
        raise ValueError("El PDF no contiene texto extraíble")

    print(repr(text[800:2200]))

    text = limpiar_texto(text)

    print(repr(text[800:2200]))

    if not text.strip():
        raise ValueError("El texto quedó vacío tras la limpieza")

    fragmentos = dividir_texto_local(text)
    total_fragmentos = len(fragmentos)
    segmentos = []

    for i, fragmento in enumerate(fragmentos):
        porcentaje = 50 + int(((i + 1) / total_fragmentos) * 50)
        self.update_state(state="PROGRESS", meta={
            "pagina": total, "total": total,
            "porcentaje_override": porcentaje
        })

        print(f"--- Fragmento {i+1}/{total_fragmentos} ---")
        print(fragmento[:200])
        print("---")

        MAX_INTENTOS = 3
        for intento in range(MAX_INTENTOS):
            try:
                response = httpx.post(
                    f"{SERVIDOR_LOCAL}/tts",
                    data={"texto": fragmento},
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

        print(f"Content-Type recibido: {response.headers.get('content-type')}")
        print(f"Tamaño respuesta: {len(response.content)} bytes")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=MP3_DIR) as tmp:
            tmp.write(response.content)
            tmp.flush()
            segmentos.append(tmp.name)

    audio_final = None
    for ruta in segmentos:
        try:
            segmento = AudioSegment.from_file(ruta, format="wav")
            if audio_final is None:
                audio_final = segmento
            else:
                audio_final += segmento
        except Exception as e:
            print(f"Error leyendo fragmento {ruta}: {e}")
            raise

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="local")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path