import re

def _numero_a_palabras(n: int) -> str:
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

    return str(n)


def _reemplazar_numeros(texto: str) -> str:
    def reemplazar(match):
        numero_str = match.group(0).replace(".", "").replace(",", "")
        try:
            n = int(numero_str)
            if 1000 <= n <= 2100:
                return match.group(0)
            return _numero_a_palabras(n)
        except ValueError:
            return match.group(0)

    return re.sub(r'\b\d[\d.,]*\b', reemplazar, texto)


def limpiar_texto_local(texto: str) -> str:
    # 1. Letras capitulares
    texto = re.sub(r'(?m)^([A-ZÁÉÍÓÚÑÜ])\n([a-záéíóúñü])', r'\1\2', texto)

    # 2. Notas del traductor
    texto = re.sub(r'\[N\.\s*del\s*[TAta]\.:?[^\]]*\]', '', texto)
    texto = re.sub(r'\(N\.\s*del\s*[TAta]\.:?[^)]*\)', '', texto)

    # 3. Pies de página y URLs — ANTES de colapsar saltos
    NUMEROS_ESCRITOS = (
        r'(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|'
        r'once|doce|trece|catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|'
        r'veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|'
        r'cien|ciento)'
    )
    texto = re.sub(rf'-?\s*[Pp]ágina\s*(?:\d+|{NUMEROS_ESCRITOS})\s*[—–-]?', '', texto, flags=re.IGNORECASE)
    texto = re.sub(r'www\.\S+', '', texto)
    texto = re.sub(r'https?://\S+', '', texto)

    # 4. Saltos de línea dentro de frase
    texto = re.sub(r'([^.!?\n])\n([^\n])', r'\1 \2', texto)

    # 5. Símbolos sueltos
    texto = re.sub(r'[*†§©®™]', '', texto)

    # 6. Abreviaciones
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

    # 7. Comillas tipográficas
    texto = texto.replace('\u201c', '"').replace('\u201d', '"')
    texto = texto.replace('\u2018', "'").replace('\u2019', "'")

    # 8. Números a palabras
    texto = _reemplazar_numeros(texto)

    # 9. Títulos en mayúsculas
    texto = re.sub(r'\n([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{2,})\n', r'. \1. ', texto)

    # 10. Letras capitulares sueltas
    texto = re.sub(r'(?m)^\s*[A-ZÁÉÍÓÚÑÜ]\s*$', '', texto)

    # 11. Saltos dobles → pausa
    texto = re.sub(r'([^.!?])\n{2,}', r'\1. ', texto)
    texto = re.sub(r'\n{2,}', '. ', texto)

    # 12. Saltos simples → espacio
    texto = re.sub(r'\n', ' ', texto)

    # 13. Espacios múltiples
    texto = re.sub(r'\s+', ' ', texto)

    # 14. Espacios antes de puntuación
    texto = re.sub(r'\s+([.,;:!?])', r'\1', texto)

    # 15. Puntuación doble
    texto = re.sub(r'\.{2,}', '.', texto)
    texto = re.sub(r',+', ',', texto)
    texto = re.sub(r'([.!?])\s*[,.]', r'\1', texto)

    return texto.strip()


def insertar_pausas_sml(texto: str) -> str:
    # Pausa larga después de punto que cierra diálogo
    texto = re.sub(r'([.!?])\s+(?=—)', r'\1 [BREAK_LONG] ', texto)

    # Pausa corta después de punto seguido de mayúscula
    texto = re.sub(r'([.!?])\s+(?=[A-ZÁÉÍÓÚÑÜ])', r'\1 [BREAK_SHORT] ', texto)

    # Pausa corta después de dos puntos
    texto = re.sub(r'(:\s*)(?=[—"A-ZÁÉÍÓÚÑÜ])', r'\1[BREAK_SHORT] ', texto)

    # Limpiar marcadores duplicados
    texto = re.sub(r'(\[BREAK_(?:SHORT|LONG)\]\s*){2,}', r'\1', texto)
    texto = re.sub(r'\s+', ' ', texto)

    return texto.strip()


def limpiar_texto(texto: str) -> str:
    # 1. Letras capitulares
    texto = re.sub(r'(?m)^([A-ZÁÉÍÓÚÑÜ])\n([a-záéíóúñü])', r'\1\2', texto)

    # 2. Guiones de diálogo → coma
    texto = texto.replace("\u2014", ",").replace("\u2013", ",")
    texto = re.sub(r'\s*—\s*', ', ', texto)
    texto = re.sub(r',\s*,', ',', texto)

    # 3. Signos de apertura españoles
    texto = texto.replace("¿", "").replace("¡", "")

    # 4. Comillas tipográficas
    texto = texto.replace("\u201c", '"').replace("\u201d", '"')
    texto = texto.replace("\u2018", "'").replace("\u2019", "'")

    # 5. Letras capitulares sueltas
    texto = re.sub(r'(?m)^\s*[A-ZÁÉÍÓÚÑÜ]\s*$', '', texto)

    # 6. Títulos en mayúsculas
    texto = re.sub(r'\n([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{2,})\n', r', \1, ', texto)

    # 7. Saltos dobles → pausa
    texto = re.sub(r'\n{2,}', '. ', texto)

    # 8. Saltos simples → espacio
    texto = re.sub(r'\n', ' ', texto)

    # 9. Espacios múltiples
    texto = re.sub(r'\s+', ' ', texto)

    # 10. Pies de página y URLs
    texto = re.sub(r'-?\s*Página\s*\d+', '', texto)
    texto = re.sub(r'www\.\S+', '', texto)

    # 11. Espacios antes de puntuación
    texto = re.sub(r'\s+([.,;:])', r'\1', texto)

    # 12. Puntuación doble
    texto = re.sub(r'[,\.]+([,\.])', r'\1', texto)
    texto = re.sub(r',\.', '.', texto)
    texto = re.sub(r'\.,', '.', texto)
    texto = re.sub(r'\.{2,}', '.', texto)
    texto = re.sub(r',+', ',', texto)
    texto = re.sub(r'\?\.', '?', texto)

    # 13. Números romanos solos
    texto = re.sub(r'\b(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XIX|XX)\b', '', texto)

    return texto.strip()


def limpiar_texto_voicebox(texto: str) -> str:
    """
    Preprocesado específico para Voicebox/Qwen3-TTS.
    A diferencia de limpiar_texto, preserva la estructura de párrafos
    y usa saltos de línea dobles para inducir pausas largas.
    """

    # 1. Letras capitulares pegadas al párrafo siguiente
    texto = re.sub(r'(?m)^([A-ZÁÉÍÓÚÑÜ])\n([a-záéíóúñü])', r'\1\2', texto)

    # 2. Notas del traductor
    texto = re.sub(r'\[N\.\s*del\s*[TAta]\.:?[^\]]*\]', '', texto)
    texto = re.sub(r'\(N\.\s*del\s*[TAta]\.:?[^)]*\)', '', texto)

    # 3. URLs y números de página
    texto = re.sub(r'-?\s*[Pp]ágina\s*\d+', '', texto)
    texto = re.sub(r'www\.\S+', '', texto)
    texto = re.sub(r'https?://\S+', '', texto)

    # 4. Símbolos sueltos
    texto = re.sub(r'[*†§©®™]', '', texto)

    # 5. Comillas tipográficas → neutras
    texto = texto.replace('\u201c', '"').replace('\u201d', '"')
    texto = texto.replace('\u2018', "'").replace('\u2019', "'")

    # 6. Letras capitulares sueltas en su propia línea
    texto = re.sub(r'(?m)^\s*[A-ZÁÉÍÓÚÑÜ]\s*$', '', texto)

    # 7. Títulos en mayúsculas → separados por saltos dobles
    texto = re.sub(r'\n([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{2,})\n', r'\n\n\1\n\n', texto)

    # 8. Salto simple dentro de frase (sin punto antes ni después) → espacio
    texto = re.sub(r'([^.!?\n])\n([^\n])', r'\1 \2', texto)

    # 9. Normalizar saltos múltiples → doble salto (pausa larga para Qwen3)
    texto = re.sub(r'\n{3,}', '\n\n', texto)

    # 10. Espacios múltiples
    texto = re.sub(r'[ \t]+', ' ', texto)

    # 11. Espacios antes de puntuación
    texto = re.sub(r' +([.,;:!?])', r'\1', texto)

    # 12. Puntuación doble
    texto = re.sub(r'\.{2,}', '.', texto)
    texto = re.sub(r',+', ',', texto)
    texto = re.sub(r'([.!?])\s*[,.]', r'\1', texto)

    # 13. Números romanos solos
    texto = re.sub(r'\b(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XIX|XX)\b', '', texto)

    return texto.strip()