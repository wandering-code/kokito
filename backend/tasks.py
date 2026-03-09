from celery_app import celery_app
from database import SessionLocal, Conversion
from tts.edge import process_file_with_edge
from tts.google import process_file_with_google

@celery_app.task(bind=True)
def convertir_pdf(self, pdf_bytes: bytes, filename: str, proveedor: str) -> str:
    print("Tratando PDF con proveedor de " + proveedor)
    if proveedor == "edge":
        return process_file_with_edge(self, pdf_bytes, filename)
    elif proveedor == "google":
        return process_file_with_google(self, pdf_bytes, filename)