from database import SessionLocal, Conversion
import pdfplumber, edge_tts, tempfile, asyncio, os
from tts.text_utils import limpiar_texto

VOICE = "es-ES-AlvaroNeural"
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

async def sintetizar_fragmento(semaforo, fragmento: str, ruta: str):
    async with semaforo:
        await edge_tts.Communicate(fragmento, VOICE).save(ruta)

async def procesar_audio(fragmentos: list[str], task_self, total_paginas: int) -> list[str]:
    semaforo = asyncio.Semaphore(15)
    rutas = []
    completados = [0]
    total_fragmentos = len(fragmentos)

    async def sintetizar(i, fragmento):
        ruta = os.path.join(MP3_DIR, f"fragmento_{i}_{os.getpid()}.mp3")
        async with semaforo:
            for intento in range(3):
                try:
                    await edge_tts.Communicate(fragmento, VOICE).save(ruta)
                    break
                except Exception:
                    if intento == 2:
                        raise
                    await asyncio.sleep(1)
        completados[0] += 1
        porcentaje = 50 + int((completados[0] / total_fragmentos) * 50)
        task_self.update_state(state="PROGRESS", meta={"pagina": total_paginas, "total": total_paginas, "porcentaje_override": porcentaje})
        return ruta

    tareas = [sintetizar(i, f) for i, f in enumerate(fragmentos)]
    return await asyncio.gather(*tareas)

def process_file_with_edge(self, pdf_bytes: bytes, filename: str) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        paginas = file.pages[:100]
        total = len(paginas)
        for i, page in enumerate(paginas):
            text += page.extract_text()
            self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})

    if not text:
        raise ValueError("El PDF no contiene texto extraíble")

    text = limpiar_texto(text)
    fragmentos = dividir_texto(text)

    rutas = asyncio.run(procesar_audio(fragmentos, self, total))

    from pydub import AudioSegment
    audio_final = AudioSegment.from_mp3(rutas[0])
    for ruta in rutas[1:]:
        audio_final += AudioSegment.from_mp3(ruta)
    for ruta in rutas:
        os.remove(ruta)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="edge")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path