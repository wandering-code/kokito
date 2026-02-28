import pdfplumber
import edge_tts
import asyncio

TEXT_FIRST_PAGE = ""
VOICE = "es-ES-AlvaroNeural"
OUTPUT_FILE = "test.mp3"

with pdfplumber.open("./ejemplo.pdf") as pdf:
    for page in pdf.pages:
        print("Texto crudo" + repr(page.extract_text()))
        TEXT_FIRST_PAGE = page.extract_text().replace("\n", " ")
        print(TEXT_FIRST_PAGE)

async def amain() -> None:
    communicate = edge_tts.Communicate(TEXT_FIRST_PAGE, VOICE)
    await communicate.save(OUTPUT_FILE)

if __name__ == "__main__":
    asyncio.run(amain())