import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup


def extraer_capitulos_epub(epub_bytes: bytes) -> list[dict]:
    """
    Lee un EPUB desde bytes y devuelve la lista de capítulos según la TOC.
    Cada capítulo es un dict con:
      - titulo: str
      - texto: str
      - palabras: int
    """
    import tempfile, os

    with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as tmp:
        tmp.write(epub_bytes)
        tmp_path = tmp.name

    try:
        book = epub.read_epub(tmp_path)
    finally:
        os.unlink(tmp_path)

    # Construir índice href → item del documento
    doc_por_href = {}
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        # El href puede tener fragmento (#ancla), normalizamos
        href = item.get_name()
        doc_por_href[href] = item

    # Recorrer la TOC en orden y extraer texto
    capitulos = []
    _recorrer_toc(book.toc, doc_por_href, capitulos, set())

    return capitulos


def _recorrer_toc(toc, doc_por_href, capitulos, vistos):
    for item in toc:
        if isinstance(item, tuple):
            seccion, hijos = item
            # La sección puede tener href propio
            if hasattr(seccion, "href") and seccion.href:
                _agregar_capitulo(seccion.title, seccion.href, doc_por_href, capitulos, vistos)
            _recorrer_toc(hijos, doc_por_href, capitulos, vistos)
        elif isinstance(item, epub.Link):
            _agregar_capitulo(item.title, item.href, doc_por_href, capitulos, vistos)


def _agregar_capitulo(titulo, href, doc_por_href, capitulos, vistos):
    href_base = href.split("#")[0]

    if href_base in vistos:
        return
    vistos.add(href_base)

    item = doc_por_href.get(href_base)
    if item is None:
        item = doc_por_href.get("Text/" + href_base)
    if item is None:
        return

    soup = BeautifulSoup(item.get_content(), "html.parser")

    partes = []
    for elemento in soup.find_all(["h1", "h2", "h3", "h4", "p", "div"]):
        texto_elemento = elemento.get_text(separator=" ", strip=True)
        if not texto_elemento:
            continue

        # Títulos — añadir salto doble antes y después para que
        # limpiar_texto_local los trate como pausa larga
        if elemento.name in ["h1", "h2", "h3", "h4"]:
            partes.append(f"\n\n{texto_elemento}\n\n")
        else:
            partes.append(texto_elemento)

    texto = "\n\n".join(p.strip() for p in partes if p.strip())
    palabras = len(texto.split())

    capitulos.append({
        "titulo": titulo or "",
        "texto": texto,
        "palabras": palabras,
    })