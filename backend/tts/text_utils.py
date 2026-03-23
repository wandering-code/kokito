import re

def limpiar_texto(texto: str) -> str:
    import re

    # 1. Letras capitulares — unir letra suelta con la palabra siguiente (C\naía → Caía)
    texto = re.sub(r'(?m)^([A-ZÁÉÍÓÚÑÜ])\n([a-záéíóúñü])', r'\1\2', texto)

    # 2. Guiones de diálogo — convertir en coma para mantener fluidez
    texto = texto.replace("\u2014", ",").replace("\u2013", ",")
    texto = re.sub(r'\s*—\s*', ', ', texto)
    # Limpiar comas dobles resultantes
    texto = re.sub(r',\s*,', ',', texto)

    # 3. Signos de apertura españoles
    texto = texto.replace("¿", "").replace("¡", "")

    # 4. Comillas tipográficas
    texto = texto.replace("\u201c", '"').replace("\u201d", '"')
    texto = texto.replace("\u2018", "'").replace("\u2019", "'")

    # 5. Letras capitulares sueltas en línea propia (las que no se pegaron en paso 1)
    texto = re.sub(r'(?m)^\s*[A-ZÁÉÍÓÚÑÜ]\s*$', '', texto)

    # 6. Títulos en mayúsculas — línea sola en mayúsculas → pausa
    texto = re.sub(r'\n([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{2,})\n', r', \1, ', texto)

    # 7. Saltos de línea dobles → pausa
    texto = re.sub(r'\n{2,}', '. ', texto)

    # 8. Saltos de línea simples → espacio
    texto = re.sub(r'\n', ' ', texto)

    # 9. Espacios múltiples
    texto = re.sub(r'\s+', ' ', texto)

    # 10. Pies de página y URLs
    texto = re.sub(r'-?\s*Página\s*\d+', '', texto)
    texto = re.sub(r'www\.\S+', '', texto)

    # 11. Espacios antes de puntuación
    texto = re.sub(r'\s+([.,;:])', r'\1', texto)

    # 12. Puntuación doble o mal combinada
    texto = re.sub(r'[,\.]+([,\.])', r'\1', texto)
    texto = re.sub(r',\.', '.', texto)
    texto = re.sub(r'\.,', '.', texto)
    texto = re.sub(r'\.{2,}', '.', texto)
    texto = re.sub(r',+', ',', texto)
    texto = re.sub(r'\?\.', '?', texto)   # "?." → "?"
    texto = re.sub(r'\?\.', '?', texto)   # doble pasada por si acaso

    # 13. Números romanos solos
    texto = re.sub(r'\b(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XIX|XX)\b', '', texto)

    return texto.strip()