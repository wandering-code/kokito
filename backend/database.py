from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://kokito:kokito@localhost:5432/kokito")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Conversion(Base):
    __tablename__ = "conversiones"

    id         = Column(Integer, primary_key=True, index=True)
    nombre     = Column(String, nullable=False)
    caracteres = Column(Integer)
    creado_en  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

def crear_tablas():
    Base.metadata.create_all(bind=engine)