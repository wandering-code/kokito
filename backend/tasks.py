import os
from celery_app import celery_app
from database import SessionLocal, Parte, Libro, EstadoParte
from tts.edge import process_file_with_edge
from tts.google import process_file_with_google

@celery_app.task(bind=True)
def convertir_pdf(self, proveedor: str, parte_id: int, voz_bytes: bytes = b"") -> str:
    db = SessionLocal()
    parte = db.query(Parte).filter(Parte.id == parte_id).first()

    if not parte:
        db.close()
        raise ValueError(f"No existe ninguna parte con id {parte_id}")

    libro = db.query(Libro).filter(Libro.id == parte.libro_id).first()

    if not libro or not libro.ruta_pdf:
        db.close()
        raise ValueError("No se encontró el PDF del libro")

    with open(libro.ruta_pdf, "rb") as f:
        pdf_bytes = f.read()

    filename = libro.titulo

    voz_bytes_final = voz_bytes
    if not voz_bytes_final and libro.ruta_voz and os.path.exists(libro.ruta_voz):
        with open(libro.ruta_voz, "rb") as f:
            voz_bytes_final = f.read()

    try:
        parte.estado = EstadoParte.procesando
        parte.proveedor = proveedor
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
        elif proveedor == "local":
            from tts.local import process_file_with_local
            ruta_mp3 = process_file_with_local(
                self, pdf_bytes, filename,
                parte.pagina_inicio, parte.pagina_fin,
                voz_bytes_final
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
            nueva_tarea = convertir_pdf.delay(proveedor, siguiente.id, voz_bytes_final)
            siguiente.tarea_id = nueva_tarea.id
            db.commit()

        return ruta_mp3

    except Exception as e:
        parte.estado = EstadoParte.error
        db.commit()
        raise

    finally:
        db.close()