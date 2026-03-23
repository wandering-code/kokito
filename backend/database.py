from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Enum
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime, timezone
import enum, os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://kokito:kokito@localhost:5432/kokito")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


# --- Enums ---

class EstadoParte(str, enum.Enum):
    pendiente   = "pendiente"
    procesando  = "procesando"
    listo       = "listo"
    error       = "error"

class RolUsuario(str, enum.Enum):
    admin   = "admin"
    usuario = "usuario"

class EstadoPartUsuario(str, enum.Enum):
    pendiente    = "pendiente"
    en_progreso  = "en_progreso"
    escuchada    = "escuchada"

class EstadoSolicitud(str, enum.Enum):
    pendiente  = "pendiente"
    aceptada   = "aceptada"
    rechazada  = "rechazada"


# --- Modelos ---

class Libro(Base):
    __tablename__ = "libros"

    id                = Column(Integer, primary_key=True, index=True)
    titulo            = Column(String, nullable=False)
    autor             = Column(String, nullable=True)
    hash_contenido    = Column(String, unique=True, nullable=False)
    num_paginas       = Column(Integer, nullable=False)
    paginas_por_parte = Column(Integer, nullable=False, default=50)
    visible           = Column(Boolean, default=False, nullable=False)
    fecha_subida      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    subido_por        = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    partes            = relationship("Parte", back_populates="libro")


class Parte(Base):
    __tablename__ = "partes"

    id                = Column(Integer, primary_key=True, index=True)
    libro_id          = Column(Integer, ForeignKey("libros.id"), nullable=False)
    numero_parte      = Column(Integer, nullable=False)
    pagina_inicio     = Column(Integer, nullable=False)
    pagina_fin        = Column(Integer, nullable=False)
    estado            = Column(Enum(EstadoParte), default=EstadoParte.pendiente)
    ruta_mp3          = Column(String, nullable=True)
    proveedor         = Column(String, nullable=True)
    duracion_segundos = Column(Integer, nullable=True)
    fecha_procesado   = Column(DateTime, nullable=True)

    libro             = relationship("Libro", back_populates="partes")


class Usuario(Base):
    __tablename__ = "usuarios"

    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String, unique=True, nullable=False)
    nombre        = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    rol           = Column(Enum(RolUsuario), default=RolUsuario.usuario)
    fecha_registro = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ProgresoUsuario(Base):
    __tablename__ = "progreso_usuario"

    id                  = Column(Integer, primary_key=True, index=True)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    libro_id            = Column(Integer, ForeignKey("libros.id"), nullable=False)
    parte_id            = Column(Integer, ForeignKey("partes.id"), nullable=False)
    segundo_actual      = Column(Integer, default=0)
    fecha_actualizacion = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EstadoParteUsuario(Base):
    __tablename__ = "estado_parte_usuario"

    id                  = Column(Integer, primary_key=True, index=True)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    parte_id            = Column(Integer, ForeignKey("partes.id"), nullable=False)
    estado              = Column(Enum(EstadoPartUsuario), default=EstadoPartUsuario.pendiente)
    fecha_actualizacion = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ListaDeseos(Base):
    __tablename__ = "lista_deseos"

    id            = Column(Integer, primary_key=True, index=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    libro_id      = Column(Integer, ForeignKey("libros.id"), nullable=False)
    fecha_añadido = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Solicitud(Base):
    __tablename__ = "solicitudes"

    id               = Column(Integer, primary_key=True, index=True)
    usuario_id       = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    titulo_solicitado = Column(String, nullable=False)
    autor            = Column(String, nullable=True)
    notas            = Column(String, nullable=True)
    estado           = Column(Enum(EstadoSolicitud), default=EstadoSolicitud.pendiente)
    fecha            = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# Mantenemos Conversion para no perder el historial existente
class Conversion(Base):
    __tablename__ = "conversiones"

    id         = Column(Integer, primary_key=True, index=True)
    nombre     = Column(String, nullable=False)
    caracteres = Column(Integer)
    proveedor  = Column(String, nullable=True)
    creado_en  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def crear_tablas():
    Base.metadata.create_all(bind=engine)