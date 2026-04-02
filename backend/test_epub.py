import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

def extraer_capitulos_toc(ruta_epub):
    book = epub.read_epub(ruta_epub)
    items_por_nombre = {item.get_name(): item for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT)}
    
    capitulos = []
    
    def procesar_toc(toc):
        for entry in toc:
            if isinstance(entry, tuple):
                section, children = entry
                # La sección en sí (ej: "I. Talins") la ignoramos como parte propia
                # pero procesamos sus hijos
                procesar_toc(children)
            else:
                # Es un Link con título y href
                href = entry.href.split("#")[0]  # quitar ancla si la hay
                item = items_por_nombre.get(href)
                if not item:
                    return
                soup = BeautifulSoup(item.get_content(), "html.parser")
                texto = soup.get_text(separator=" ", strip=True)
                palabras = len(texto.split())
                capitulos.append({
                    "titulo": entry.title,
                    "palabras": palabras,
                    "href": href
                })
    
    procesar_toc(book.toc)
    return capitulos

if __name__ == "__main__":
    import sys
    caps = extraer_capitulos_toc(sys.argv[1])
    for i, c in enumerate(caps):
        print(f"{i+1:3}. [{c['palabras']:5} pal] {c['titulo']}")