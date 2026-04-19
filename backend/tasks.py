import os
from celery_app import celery_app
from database import SessionLocal, Parte, Libro, EstadoParte
from tts.edge import process_file_with_edge
from tts.google import process_file_with_google

@celery_app.task(bind=True)
def convertir_pdf(self, proveedor: str, parte_id: int, voz_bytes: bytes = b"", voicebox_profile_id: str = "") -> str:
    db = SessionLocal()
    parte = db.query(Parte).filter(Parte.id == parte_id).first()

    if not parte:
        db.close()
        raise ValueError(f"No existe ninguna parte con id {parte_id}")

    libro = db.query(Libro).filter(Libro.id == parte.libro_id).first()

    if not libro or not libro.ruta_pdf:
        db.close()
        raise ValueError("No se encontró el archivo del libro")

    with open(libro.ruta_pdf, "rb") as f:
        archivo_bytes = f.read()

    filename = libro.titulo
    formato = libro.formato or "pdf"

    voz_bytes_final = voz_bytes
    if not voz_bytes_final and libro.ruta_voz and os.path.exists(libro.ruta_voz):
        with open(libro.ruta_voz, "rb") as f:
            voz_bytes_final = f.read()

    try:
        ruta_mp3 = None
        parte.estado = EstadoParte.procesando
        parte.proveedor = proveedor
        db.commit()

        if formato == "epub":
            from epub_utils import extraer_capitulos_epub
            capitulos = extraer_capitulos_epub(archivo_bytes)
            indice = parte.pagina_inicio
            if indice >= len(capitulos):
                raise ValueError(f"Índice de capítulo {indice} fuera de rango")
            texto_capitulo = capitulos[indice]["texto"].strip()

            if not texto_capitulo:
                parte.estado = EstadoParte.listo
                parte.ruta_mp3 = None
                db.commit()
                siguiente = db.query(Parte).filter(
                    Parte.libro_id == parte.libro_id,
                    Parte.estado == EstadoParte.pendiente
                ).order_by(Parte.orden_procesamiento).first()
                if siguiente:
                    nueva_tarea = convertir_pdf.delay(proveedor, siguiente.id, voz_bytes_final, voicebox_profile_id)
                    siguiente.tarea_id = nueva_tarea.id
                    db.commit()
                return ""

            if proveedor == "edge":
                ruta_mp3 = process_file_with_edge(
                    self, None, filename,
                    texto_directo=texto_capitulo
                )
            elif proveedor == "google":
                ruta_mp3 = process_file_with_google(
                    self, None, filename,
                    texto_directo=texto_capitulo
                )
            elif proveedor == "local":
                from tts.local import process_file_with_local
                ruta_mp3 = process_file_with_local(
                    self, None, filename,
                    texto_directo=texto_capitulo,
                    voz_bytes=voz_bytes_final
                )
            elif proveedor == "voicebox":
                from tts.voicebox import process_file_with_voicebox
                ruta_mp3 = process_file_with_voicebox(
                    self, None, filename,
                    texto_directo=texto_capitulo,
                    profile_id=voicebox_profile_id or None
                )
            else:
                raise ValueError(f"Proveedor desconocido: {proveedor}")

        else:
            if proveedor == "edge":
                ruta_mp3 = process_file_with_edge(
                    self, archivo_bytes, filename,
                    parte.pagina_inicio, parte.pagina_fin
                )
            elif proveedor == "google":
                ruta_mp3 = process_file_with_google(
                    self, archivo_bytes, filename,
                    parte.pagina_inicio, parte.pagina_fin
                )
            elif proveedor == "local":
                from tts.local import process_file_with_local
                ruta_mp3 = process_file_with_local(
                    self, archivo_bytes, filename,
                    parte.pagina_inicio, parte.pagina_fin,
                    voz_bytes_final
                )
            elif proveedor == "voicebox":
                from tts.voicebox import process_file_with_voicebox
                ruta_mp3 = process_file_with_voicebox(
                    self, archivo_bytes, filename,
                    pagina_inicio=parte.pagina_inicio,
                    pagina_fin=parte.pagina_fin + 1,
                    profile_id=voicebox_profile_id or None
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
        ).order_by(Parte.orden_procesamiento).first()

        if siguiente:
            nueva_tarea = convertir_pdf.delay(proveedor, siguiente.id, voz_bytes_final, voicebox_profile_id)
            siguiente.tarea_id = nueva_tarea.id
            db.commit()

        return ruta_mp3

    except Exception as e:
        parte.estado = EstadoParte.error
        db.commit()
        raise

    finally:
        db.close()