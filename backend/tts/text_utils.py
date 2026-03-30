import re

def _numero_a_palabras(n: int) -> str:
    """Convierte un número entero a su representación en palabras en español."""
    if n < 0:
        return "menos " + _numero_a_palabras(-n)
    if n == 0:
        return "cero"

    unidades = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete",
                "ocho", "nueve", "diez", "once", "doce", "trece", "catorce",
                "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"]
    decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta",
               "sesenta", "setenta", "ochenta", "noventa"]
    centenas = ["", "cien", "doscientos", "trescientos", "cuatrocientos",
                "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"]

    if n < 20:
        return unidades[n]
    if n < 100:
        if n == 20:
            return "veinte"
        if 21 <= n <= 29:
            return "veinti" + unidades[n - 20]
        resto = n % 10
        return decenas[n // 10] + (" y " + unidades[resto] if resto else "")
    if n < 1000:
        if n == 100:
            return "cien"
        resto = n % 100
        return centenas[n // 100] + (" " + _numero_a_palabras(resto) if resto else "")
    if n < 1000000:
        miles = n // 1000
        resto = n % 1000
        prefijo = "mil" if miles == 1 else _numero_a_palabras(miles) + " mil"
        return prefijo + (" " + _numero_a_palabras(resto) if resto else "")

    # Para números muy grandes, dejar como está — son raros en novelas
    return str(n)


def _reemplazar_numeros(texto: str) -> str:
    """Reemplaza números en cifras por su forma escrita, respetando años y casos especiales."""
    def reemplazar(match):
        numero_str = match.group(0).replace(".", "").replace(",", "")
        try:
            n = int(numero_str)
            # Los años entre 1000 y 2100 los dejamos — suenan mejor en cifras
            # porque XTTS los lee bien como años
            if 1000 <= n <= 2100:
                return match.group(0)
            return _numero_a_palabras(n)
        except ValueError:
            return match.group(0)

    # Solo reemplaza números aislados (no dentro de palabras)
    return re.sub(r'\b\d[\d.,]*\b', reemplazar, texto)


def limpiar_texto_local(texto: str) -> str:
    """
    Preprocesado específico para XTTS v2.
    Diferente a limpiar_texto (Edge TTS) — no eliminar ¿¡ ni guiones de diálogo.
    """

    # 1. Letras capitulares — unir letra suelta con la palabra siguiente (C\naía → Caía)
    texto = re.sub(r'(?m)^([A-ZÁÉÍÓÚÑÜ])\n([a-záéíóúñü])', r'\1\2', texto)

    # 2. Notas del traductor y del autor — XTTS las lee literalmente
    texto = re.sub(r'\[N\.\s*del\s*[TAta]\.:?[^\]]*\]', '', texto)
    texto = re.sub(r'\(N\.\s*del\s*[TAta]\.:?[^)]*\)', '', texto)

    # 3. Pies de página — ANTES de colapsar saltos de línea
    NUMEROS_ESCRITOS = (
        r'(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|'
        r'once|doce|trece|catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|'
        r'veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|'
        r'cien|ciento)'
    )
    texto = re.sub(rf'-?\s*[Pp]ágina\s*(?:\d+|{NUMEROS_ESCRITOS})\s*[—–-]?', '', texto, flags=re.IGNORECASE)
    texto = re.sub(r'www\.\S+', '', texto)
    texto = re.sub(r'https?://\S+', '', texto)

    # 4. Saltos de línea dentro de frase — después de limpiar páginas
    texto = re.sub(r'([^.!?\n])\n([^\n])', r'\1 \2', texto)

    # 4. Símbolos sueltos que aparecen en notas a pie de página arrastradas por pdfplumber
    texto = re.sub(r'[*†§©®™]', '', texto)

    # 5. Abreviaciones comunes en novelas — XTTS las deletrea o hace pausa rara
    abreviaciones = {
        r'\bPág\.\s*': 'página ',
        r'\bpág\.\s*': 'página ',
        r'\bCap\.\s*': 'capítulo ',
        r'\bcap\.\s*': 'capítulo ',
        r'\bDr\.\s*': 'doctor ',
        r'\bDra\.\s*': 'doctora ',
        r'\bSr\.\s*': 'señor ',
        r'\bSra\.\s*': 'señora ',
        r'\bSrta\.\s*': 'señorita ',
        r'\bProf\.\s*': 'profesor ',
        r'\bEd\.\s*': 'edición ',
        r'\bVol\.\s*': 'volumen ',
        r'\bArt\.\s*': 'artículo ',
        r'\betc\.\s*': 'etcétera ',
        r'\bEE\.\s*UU\.\s*': 'Estados Unidos ',
        r'\bEE\.UU\.\s*': 'Estados Unidos ',
    }
    for patron, reemplazo in abreviaciones.items():
        texto = re.sub(patron, reemplazo, texto)

    # 6. Comillas tipográficas → comillas simples
    # XTTS maneja bien las comillas pero las tipográficas a veces confunden
    texto = texto.replace('\u201c', '"').replace('\u201d', '"')
    texto = texto.replace('\u2018', "'").replace('\u2019', "'")

    # 7. Números en cifras → palabras (excepto años)
    texto = _reemplazar_numeros(texto)

    # 8. Títulos de capítulo en mayúsculas — línea sola → pausa natural con punto
    # Mantenemos el texto pero lo rodeamos de puntos para que XTTS haga pausa
    texto = re.sub(r'\n([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{2,})\n', r'. \1. ', texto)

    # 9. Letras capitulares sueltas en línea propia que no se pegaron en paso 1
    texto = re.sub(r'(?m)^\s*[A-ZÁÉÍÓÚÑÜ]\s*$', '', texto)

    # 10. Saltos de línea dobles → pausa (punto si no hay puntuación antes)
    texto = re.sub(r'([^.!?])\n{2,}', r'\1. ', texto)
    texto = re.sub(r'\n{2,}', '. ', texto)

    # 11. Saltos de línea simples → espacio
    texto = re.sub(r'\n', ' ', texto)

    # 12. Espacios múltiples
    texto = re.sub(r'\s+', ' ', texto)

    # 13. Espacios antes de puntuación
    texto = re.sub(r'\s+([.,;:!?])', r'\1', texto)

    # 14. Puntuación doble o mal combinada
    texto = re.sub(r'\.{2,}', '.', texto)
    texto = re.sub(r',+', ',', texto)
    texto = re.sub(r'([.!?])\s*[,.]', r'\1', texto)

    return texto.strip()

def limpiar_texto(texto: str) -> str:

    # 1. Letras capitulares — unir letra suelta con la palabra siguiente (C\naía → Caía)
    texto = re.sub(r'(?m)^([A-ZÁÉÍÓÚÑÜ])\n([a-záéíóúñü])', r'\1\2', texto)

    # 2. Guiones de diálogo — convertir en coma para mantener fluidez
    texto = texto.replace("\u2014", ",").replace("\u2013", ",")
    texto = re.sub(r'\s*—\s*', ', ', texto)
    texto = re.sub(r',\s*,', ',', texto)

    # 3. Signos de apertura españoles
    texto = texto.replace("¿", "").replace("¡", "")

    # 4. Comillas tipográficas
    texto = texto.replace("\u201c", '"').replace("\u201d", '"')
    texto = texto.replace("\u2018", "'").replace("\u2019", "'")

    # 5. Letras capitulares sueltas en línea propia
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
    texto = re.sub(r'\?\.', '?', texto)
    texto = re.sub(r'\?\.', '?', texto)

    # 13. Números romanos solos
    texto = re.sub(r'\b(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XIX|XX)\b', '', texto)

    return texto.strip()