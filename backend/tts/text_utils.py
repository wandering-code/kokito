import re

def limpiar_texto(texto: str) -> str:
    # Limpiando pausas tras títulos
    texto_limpio = re.sub(r"\n([A-ZÁÉÍÓÚÑÜ]+)\n", r". \1. ", texto)

    # Limpiando saltos de línea
    texto_limpio = re.sub(r"\n{2,}", ". ", texto_limpio)
    texto_limpio = re.sub(r"\s+", " ", re.sub(r"\n", " ", texto_limpio))

    # Limpiando la paginación y las URLs
    texto_limpio = re.sub(r"-?\s*Página\s*\d+", "", texto_limpio)
    texto_limpio = re.sub(r"www\.\S+", "", texto_limpio)

    return texto_limpio