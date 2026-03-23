from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Cookie, HTTPException, status
from database import SessionLocal, Usuario
import os

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
EXPIRE_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hashear_password(password: str) -> str:
    return pwd_context.hash(password)


def verificar_password(password: str, hash: str) -> bool:
    return pwd_context.verify(password, hash)


def crear_token(usuario_id: int, rol: str) -> str:
    expiracion = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    payload = {
        "sub": str(usuario_id),
        "rol": rol,
        "exp": expiracion
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def obtener_usuario_actual(kokito_token: Optional[str] = Cookie(None)):
    if not kokito_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado"
        )
    try:
        payload = jwt.decode(kokito_token, SECRET_KEY, algorithms=[ALGORITHM])
        usuario_id = int(payload.get("sub"))
        rol = payload.get("rol")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido"
        )

    db = SessionLocal()
    try:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return usuario
    finally:
        db.close()


def requerir_admin(usuario: Usuario = None):
    if usuario.rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador"
        )
    return usuario