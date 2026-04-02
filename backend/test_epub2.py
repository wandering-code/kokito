from epub_utils import extraer_capitulos_epub

with open("La mejor venganza.epub", "rb") as f:
    epub_bytes = f.read()

caps = extraer_capitulos_epub(epub_bytes)
for i, c in enumerate(caps):
    print(f"{i+1:3}. [{c['palabras']:5} pal] {c['titulo']}")