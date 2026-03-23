from celery_app import celery_app
from database import SessionLocal, Parte, EstadoParte
from tts.edge import process_file_with_edge
from tts.google import process_file_with_google

@celery_app.task(bind=True)
def convertir_pdf(self, pdf_bytes: bytes, filename: str, proveedor: str, parte_id: int) -> str:
    db = SessionLocal()
    parte = db.query(Parte).filter(Parte.id == parte_id).first()

    if not parte:
        db.close()
        raise ValueError(f"No existe ninguna parte con id {parte_id}")

    try:
        parte.estado = EstadoParte.procesando
        db.commit()

        if proveedor == "edge":
            ruta_mp3 = process_file_with_edge(
                self, pdf_bytes, filename,
                parte.pagina_inicio, parte.pagina_fin
            )
        elif proveedor == "google":
            ruta_mp3 = process_file_with_google(
                self, pdf_bytes, filename,
                parte.pagina_inicio, parte.pagina_fin
            )
        else:
            raise ValueError(f"Proveedor desconocido: {proveedor}")

        parte.estado = EstadoParte.listo
        parte.ruta_mp3 = ruta_mp3
        parte.proveedor = proveedor
        db.commit()

        # Encolar la siguiente parte pendiente
        siguiente = db.query(Parte).filter(
            Parte.libro_id == parte.libro_id,
            Parte.estado == EstadoParte.pendiente
        ).order_by(Parte.numero_parte).first()

        if siguiente:
            siguiente.estado = EstadoParte.procesando
            db.commit()
            convertir_pdf.delay(pdf_bytes, filename, proveedor, siguiente.id)

        return ruta_mp3

    except Exception as e:
        parte.estado = EstadoParte.error
        db.commit()
        raise

    finally:
        db.close()