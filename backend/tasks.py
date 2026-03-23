from celery_app import celery_app
from tts.edge import process_file_with_edge
from tts.google import process_file_with_google
from tts.local import process_file_with_local

@celery_app.task(bind=True)
def convertir_pdf(self, pdf_bytes: bytes, filename: str, proveedor: str, voz_bytes: bytes = b"") -> str:
    print("Tratando PDF con proveedor de " + proveedor)
    if proveedor == "edge":
        return process_file_with_edge(self, pdf_bytes, filename)
    elif proveedor == "google":
        return process_file_with_google(self, pdf_bytes, filename)
    elif proveedor == "local":
        return process_file_with_local(self, pdf_bytes, filename, voz_bytes)