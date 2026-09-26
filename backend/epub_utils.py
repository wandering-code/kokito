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
    vistos = set()
    _recorrer_toc(book.toc, doc_por_href, capitulos, vistos)

    # Hay EPUB cuya TOC solo apunta a las portadillas de cada parte ("Nevada",
    # "Texas"...) y deja fuera los documentos con el texto real — p. ej. La
    # casa entre los cactus (Paul Pen): 7 entradas de 0-32 palabras y ~92.000
    # palabras fuera del índice. Solo en ese caso se tira del spine: si la TOC
    # cubre la mayor parte del libro se deja tal cual, porque las partes guardan
    # el índice del capítulo y cambiarlo descolocaría los libros ya en marcha
    # (La mejor venganza tiene algún documento suelto fuera de la TOC y no debe
    # cambiar).
    palabras_toc = sum(c["palabras"] for c in capitulos)
    palabras_spine = sum(_contar_palabras(item) for item in _documentos_spine(book))
    if palabras_spine and palabras_toc < MIN_COBERTURA_TOC * palabras_spine:
        return _capitulos_por_spine(book)

    return capitulos


MIN_COBERTURA_TOC = 0.5
# Un documento más largo que esto se parte en sus cortes de escena: en La casa
# entre los cactus, c1.xhtml son 25.000 palabras (~3 h de audio) sin un solo
# título dentro, solo 15 escenas.
MAX_PALABRAS_CAPITULO = 4000
MIN_PALABRAS_TROZO = 1500
MAX_PALABRAS_PORTADILLA = 20


def _documentos_spine(book):
    documentos = []
    for idref, _ in book.spine:
        item = book.get_item_with_id(idref)
        if item is not None and item.get_type() == ebooklib.ITEM_DOCUMENT:
            documentos.append(item)
    return documentos


def _contar_palabras(item):
    return len(BeautifulSoup(item.get_content(), "html.parser").get_text(" ", strip=True).split())


def _titulos_toc(toc, titulos):
    for item in toc:
        if isinstance(item, tuple):
            seccion, hijos = item
            if getattr(seccion, "href", None):
                titulos.setdefault(seccion.href.split("#")[0], seccion.title)
            _titulos_toc(hijos, titulos)
        elif isinstance(item, epub.Link):
            titulos.setdefault(item.href.split("#")[0], item.title)
    return titulos


def _bloques(soup):
    """Bloques de texto (título o párrafo) en orden, sin duplicar el texto de
    un <div> que contiene párrafos. Cada bloque: (es_titulo, texto, es_corte),
    donde es_corte marca el inicio de escena."""
    etiquetas = ["h1", "h2", "h3", "h4", "p", "div"]
    bloques = []
    for el in soup.find_all(etiquetas + ["hr"]):
        if el.name == "hr":
            bloques.append((False, "", True))
            continue
        if el.find(etiquetas):
            continue
        texto = el.get_text(separator=" ", strip=True)
        clases = " ".join(el.get("class") or [])
        # Convenciones de corte de escena: "* * *" y similares, o las clases de
        # los EPUB de ePubLibre (asangre = primer párrafo sin sangría tras un
        # salto, con letra capital).
        es_separador = bool(texto) and not any(c.isalnum() for c in texto)
        es_corte = es_separador or "asangre" in clases
        if es_separador:
            bloques.append((False, "", True))
        elif texto:
            bloques.append((el.name in ["h1", "h2", "h3", "h4"], texto, es_corte))
    return bloques


def _unir_bloques(bloques):
    partes = [f"\n\n{t}\n\n" if es_titulo else t for es_titulo, t, _ in bloques if t]
    return "\n\n".join(p.strip() for p in partes if p.strip())


def _partir_largo(bloques):
    """Parte un documento largo en trozos de >= MIN_PALABRAS_TROZO palabras,
    cortando en inicios de escena. Sin marcas de escena, por párrafos cada
    MAX_PALABRAS_CAPITULO palabras."""
    hay_cortes = any(corte for _, _, corte in bloques[1:])
    limite = MIN_PALABRAS_TROZO if hay_cortes else MAX_PALABRAS_CAPITULO
    trozos, actual, palabras = [], [], 0
    for bloque in bloques:
        es_corte = bloque[2] if hay_cortes else True
        if actual and es_corte and palabras >= limite:
            trozos.append(actual)
            actual, palabras = [], 0
        actual.append(bloque)
        palabras += len(bloque[1].split())
    if actual:
        # Un resto muy corto va con el trozo anterior.
        if trozos and palabras < MIN_PALABRAS_TROZO // 2:
            trozos[-1].extend(actual)
        else:
            trozos.append(actual)
    return trozos


def _capitulos_por_spine(book):
    titulos = _titulos_toc(book.toc, {})
    documentos = []
    for item in _documentos_spine(book):
        bloques = _bloques(BeautifulSoup(item.get_content(), "html.parser"))
        palabras = sum(len(t.split()) for _, t, _ in bloques)
        if palabras:
            documentos.append((titulos.get(item.get_name()), bloques, palabras))

    capitulos = []
    titulo_actual = ""
    numero_en_titulo = 0
    portadilla = None
    for i, (titulo, bloques, palabras) in enumerate(documentos):
        siguiente_sin_titulo = i + 1 < len(documentos) and documentos[i + 1][0] is None
        # Portadilla de parte ("Nevada") seguida de texto fuera de la TOC: no es
        # un capítulo propio, da título al texto que sigue.
        if titulo and palabras <= MAX_PALABRAS_PORTADILLA and siguiente_sin_titulo:
            titulo_actual, numero_en_titulo, portadilla = titulo, 0, bloques
            continue
        if titulo:
            titulo_actual, numero_en_titulo = titulo, 0
        trozos = _partir_largo(bloques) if palabras > MAX_PALABRAS_CAPITULO else [bloques]
        for trozo in trozos:
            if portadilla:
                trozo = portadilla + trozo
                portadilla = None
            numero_en_titulo += 1
            texto = _unir_bloques(trozo)
            capitulos.append({"titulo": titulo_actual or "Inicio", "numero": numero_en_titulo,
                              "texto": texto, "palabras": len(texto.split())})

    # "Nevada · 1" solo si hay un "Nevada · 2"; si no, "Nevada" a secas.
    varios = {c["titulo"] for c in capitulos if c["numero"] > 1}
    for c in capitulos:
        numero = c.pop("numero")
        if c["titulo"] in varios:
            c["titulo"] = f"{c['titulo']} · {numero}"
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