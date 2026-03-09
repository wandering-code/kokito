# Diario de desarrollo — Kokito

## Inicio rápido

### Preparación del entorno (solo la primera vez o si hay problemas)
- nvm y pyenv se cargan solos al abrir la terminal gracias al `.zshrc`
- Si `npm` o `python3` no se encuentran, ejecutar `source ~/.zshrc` y reintentar

### Arrancar el proyecto
**Terminal 1 — Backend y servicios:**
```bash
cd ~/repos/kokito
docker compose up
```

**Terminal 2 — Frontend:**
```bash
cd ~/repos/kokito/frontend
npm run dev
```

Frontend disponible en `http://localhost:5173`  
Backend disponible en `http://localhost:8000`

### Parar el proyecto
- Backend: `Ctrl + C` en la Terminal 1, luego `docker compose down`
- Frontend: `Ctrl + C` en la Terminal 2

### Comandos git del día a día
```bash
git status                        # Ver qué archivos han cambiado
git add .                         # Añadir todos los cambios al stage
git add nombre_archivo            # Añadir un archivo concreto
git commit -m "mensaje del commit" # Guardar los cambios con un mensaje
git push                          # Subir los commits a GitHub
git log --oneline                 # Ver el historial de commits resumido
git diff                          # Ver los cambios no añadidos al stage
```

### Levantar frontend
```bash
npm run dev
```

---

## Sesión 1 — Entorno y prototipo local (Fase 1 completa)

### Lo que hemos construido

- Python 3.11.9 gestionado correctamente con **pyenv**
- Repositorio `kokito` en GitHub conectado por **SSH**
- **Entorno virtual** configurado en la carpeta del proyecto
- **Prototipo funcional**: PDF → texto → MP3 en ~20 líneas de Python
- **Preprocesado básico** del texto para mejorar la entonación del TTS
- **Dockerfile** y **docker-compose.yml** para ejecutar el backend en un contenedor

---

### Pasos realizados

#### 1. Instalación de pyenv
Python del sistema (`/usr/bin/python3`) era la versión 3.9.6 de macOS. No se toca el Python del sistema — se instala **pyenv** vía Homebrew para gestionar versiones de forma segura.

```bash
brew install pyenv
```

Se añaden las siguientes líneas al `.zshrc` (el `eval` debe ir al final para que nadie machaque el PATH después):

```bash
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export OPENAI_API_KEY="..."
eval "$(pyenv init -)"
```

Instalación de Python 3.11.9:

```bash
pyenv install 3.11.9
pyenv global 3.11.9
```

**Concepto clave — PATH:** lista ordenada de directorios donde la terminal busca comandos. El primero que encuentra gana. pyenv usa **shims** (intermediarios) para interceptar las llamadas a `python3` y redirigirlas a la versión correcta. El `eval "$(pyenv init -)"` añade los shims al PATH y debe ir al final del `.zshrc`.

---

#### 2. Repositorio y SSH

Creación de la carpeta del proyecto e inicialización de git:

```bash
cd ~/repos
mkdir kokito && cd kokito
git init
```

Generación de clave SSH específica para GitHub (no reutilizar la de Bitbucket):

```bash
ssh-keygen -t ed25519 -C "email@ejemplo.com" -f ~/.ssh/ssh-key-github
ssh-add ~/.ssh/ssh-key-github
```

Configuración en `~/.ssh/config`:

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/ssh-key-github
```

La clave pública (`~/.ssh/ssh-key-github.pub`) se añade en GitHub → Settings → SSH and GPG keys.

Verificación:

```bash
ssh -T git@github.com
# Hi wandering-code! You've successfully authenticated...
```

**Problema — clave SSH no persistente:** el agente SSH vive en memoria y pierde las claves al cerrar el Mac o abrir una terminal nueva, lo que provoca `Permission denied (publickey)` al hacer `git push`. Solución: configurar macOS para que recuerde la clave automáticamente.

Añadir al bloque de GitHub en `~/.ssh/config`:

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/ssh-key-github
  UseKeychain yes
  AddKeysToAgent yes
```

- `UseKeychain yes` — macOS guarda la passphrase en el Keychain del sistema
- `AddKeysToAgent yes` — añade la clave al agente automáticamente al arrancar la terminal

Ejecutar una vez para registrarla en el Keychain:

```bash
ssh-add --apple-use-keychain ~/.ssh/ssh-key-github
```

A partir de ahí no es necesario volver a ejecutar `ssh-add` manualmente.

Primer commit con `.gitignore` básico (incluye `venv/`, `.env`, `__pycache__/`, `*.pyc`, `.DS_Store`, `*.mp3`).

---

#### 3. Entorno virtual

**Concepto clave:** equivalente al `node_modules` de JavaScript. Aísla las librerías del proyecto para que no interfieran con otros proyectos ni con el sistema.

```bash
python3 -m venv venv
source venv/bin/activate   # Activar (necesario cada vez que se retoma el proyecto)
```

Cuando el entorno está activo, el prompt muestra `(venv)` al principio.

En VS Code: seleccionar el intérprete `./venv/bin/python3` desde la esquina inferior derecha (o con `Cmd+Shift+P → Python: Select Interpreter`).

Instalación de librerías:

```bash
pip install pdfplumber edge-tts
```

---

#### 4. Prototipo kokito.py

```python
import pdfplumber
import edge_tts
import asyncio

TEXT = ""
VOICE = "en-GB-SoniaNeural"
OUTPUT_FILE = "test.mp3"

with pdfplumber.open("./ejemplo.pdf") as pdf:
    for page in pdf.pages:
        TEXT = page.extract_text().replace("\n", " ")
        print(repr(page.extract_text()))  # Para ver caracteres especiales crudos
        print(TEXT)

async def amain() -> None:
    communicate = edge_tts.Communicate(TEXT, VOICE)
    await communicate.save(OUTPUT_FILE)

if __name__ == "__main__":
    asyncio.run(amain())
```

**Conceptos clave aprendidos:**

- `-> None` es una **type hint** (anotación de tipo). Equivalente a `void` en Java. Python no la valida en ejecución, pero VS Code la usa para avisar de errores. Otros tipos: `-> str`, `-> int`, `-> float`, `-> bool`, `-> list`, `-> dict`.
- `if __name__ == "__main__"` — el código dentro solo se ejecuta cuando el archivo se lanza directamente, no cuando se importa desde otro módulo. Equivalente al `main()` de Java.
- `async/await` en Python funciona igual que en JavaScript. Para ejecutar una función `async` desde código síncrono se usa `asyncio.run()`.
- `repr()` muestra los caracteres especiales visibles en un string (útil para depurar).
- Comentar varias líneas en VS Code: seleccionar y pulsar `Cmd + /`.

**Decisión de diseño — preprocesado de texto:**
Se optó por un replace simple de `\n` por espacio. Una solución más elaborada (detectar párrafos, títulos en mayúsculas, etc.) se deja para fases posteriores cuando el preprocesado sea el foco.

---

#### 5. Docker

**Concepto clave — contenedor:** caja aislada que incluye el código, el runtime y las librerías necesarias para ejecutar un servicio. Más ligero que una máquina virtual. Los contenedores son **efímeros** — todo lo que se genera dentro desaparece al parar el contenedor, salvo que se use un volumen.

**Concepto clave — volumen:** carpeta de la máquina local montada dentro del contenedor para persistir archivos.

**Estructura del proyecto:**

```
kokito/
├── backend/
│   ├── kokito.py
│   ├── ejemplo.pdf
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml
├── .gitignore
└── DIARIO.md
```

**`backend/requirements.txt`** — generado con:

```bash
pip freeze > backend/requirements.txt
```

**`backend/Dockerfile`:**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . /app/
CMD ["python", "kokito.py"]
```

- `FROM` — imagen base (sistema operativo + runtime)
- `WORKDIR` — carpeta de trabajo dentro del contenedor
- `COPY` — copia archivos del Mac al contenedor
- `RUN` — ejecuta un comando durante la construcción de la imagen
- `CMD` — comando que se ejecuta cuando el contenedor arranca

**`docker-compose.yml`:**

```yaml
services:
  backend:
    build: ./backend
    volumes:
      - ./backend:/app
```

**Comandos Docker:**

```bash
docker build -t kokito-backend ./backend          # Construir imagen manualmente
docker run -v $(pwd)/backend:/app kokito-backend  # Ejecutar con volumen
docker compose up    # Levantar todos los servicios
docker compose down  # Parar todos los servicios
```

---

### Stack definido para el proyecto

| Capa | Tecnología |
|---|---|
| Backend | Python + FastAPI |
| Extracción PDF | pdfplumber |
| Text-to-Speech | edge-tts (con posibilidad de migrar a OpenAI TTS) |
| Procesamiento async | Celery + Redis |
| Base de datos | PostgreSQL (SQLAlchemy) + Supabase en producción |
| Frontend | React + Tailwind CSS |
| Contenedores | Docker + Docker Compose |
| Deploy | Render/Railway (backend) + Vercel (frontend) |
| Almacenamiento | Local en desarrollo, Cloudflare R2 en producción |

---

## Sesión 2 — Backend con API REST (Fase 2 completa)

### Lo que hemos construido

- **API REST funcional** con FastAPI y Uvicorn
- **Endpoint `GET /health_check`** para verificar que el servicio está activo
- **Endpoint `POST /convertir`** que recibe un PDF y devuelve un MP3
- **Swagger UI** disponible automáticamente en `/docs`
- La lógica del prototipo `kokito.py` integrada dentro de la API

---

### Pasos realizados

#### 1. Instalación de librerías

```bash
pip install fastapi uvicorn python-multipart
pip freeze > backend/requirements.txt
```

- `fastapi` — el framework para construir la API
- `uvicorn` — el servidor ASGI que ejecuta FastAPI
- `python-multipart` — necesario para recibir archivos (`multipart/form-data`). FastAPI lo requiere pero no lo incluye por defecto — sin él lanza un `RuntimeError` al arrancar cualquier endpoint con `UploadFile`

**Recordatorio:** cada vez que se instale una librería nueva, actualizar el `requirements.txt` con `pip freeze > backend/requirements.txt`.

---

#### 2. Conceptos clave — API REST

Una API REST es un servidor que escucha peticiones HTTP y devuelve respuestas. Tiene **endpoints** — URLs que hacen cosas concretas. El verbo HTTP indica la intención:

- `GET` — consulta, sin efectos secundarios
- `POST` — envía datos al servidor para que los procese o cree algo
- `PUT` / `PATCH` — actualiza
- `DELETE` — borra

El endpoint de conversión usa `POST` porque implica enviar un archivo y pedir al servidor que lo procese.

---

#### 3. Conceptos clave — FastAPI

FastAPI usa **decoradores** para definir endpoints. Son equivalentes a las anotaciones de Spring Boot en Java (`@GetMapping`, `@PostMapping`).

```python
@app.get("/ruta")
def mi_funcion():
    return {"clave": "valor"}
```

FastAPI convierte automáticamente los diccionarios Python a JSON. No hace falta configuración adicional.

**Swagger UI** se genera automáticamente en `/docs` sin ninguna configuración extra. Permite probar los endpoints directamente desde el navegador.

---

#### 4. main.py — código final

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import pdfplumber, edge_tts, tempfile

app = FastAPI()
VOICE = "es-ES-AlvaroNeural"

@app.get("/health_check")
def health_check():
    return {"mensaje": "Servicio Api REST activo"}

@app.post("/convertir")
async def convertir(pdf: UploadFile = File(...)):
    with pdfplumber.open(pdf.file) as file:
        text = ""
        for page in file.pages:
            text += page.extract_text()

    if text:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(tmp_path)
        return FileResponse(tmp_path, media_type="audio/mpeg", filename="kokito.mp3")
    else:
        return {"mensaje": "El archivo PDF está vacío"}
```

**Conceptos clave aprendidos:**

- `UploadFile` — clase de FastAPI que representa un archivo subido via HTTP. Su atributo `.file` es un objeto de tipo fichero compatible con `pdfplumber.open()`.
- `File(...)` — indica que el parámetro es obligatorio. Los `...` en Python significan "requerido". Si no se envía el archivo, FastAPI devuelve un error 422 automáticamente.
- `multipart/form-data` — formato HTTP en el que viajan los archivos subidos desde formularios o clientes HTTP.
- `tempfile.NamedTemporaryFile` — crea un archivo temporal en disco con nombre único. `delete=False` evita que se borre al cerrar el bloque `with`, porque lo necesitamos para devolverlo. El sistema operativo lo elimina después de enviarlo.
- `FileResponse` — devuelve un archivo en disco como respuesta HTTP. `media_type="audio/mpeg"` indica al cliente que es un MP3.
- El `return FileResponse` va **fuera** del bloque `with tempfile` pero dentro del `if text`, porque FastAPI necesita que el archivo siga existiendo cuando lo envía.

---

#### 5. Error encontrado — puerto en uso

Si uvicorn no se cierra correctamente y el puerto 8000 queda ocupado:

```bash
lsof -ti:8000 | xargs kill -9   # Matar el proceso que ocupa el puerto
```

La forma correcta de parar el servidor es siempre `Ctrl + C` en la terminal.

---

## Sesión 3 — Base de datos con PostgreSQL y SQLAlchemy (Fase 3 completa)

### Lo que hemos construido

- **PostgreSQL** corriendo en Docker como servicio independiente
- **Modelo `Conversion`** con SQLAlchemy que mapea a la tabla `conversiones`
- **`database.py`** con la configuración de conexión, el modelo y la función de inicialización
- **Endpoint `/convertir` actualizado** para guardar un registro en la base de datos en cada conversión
- Verificación de registros desde **DBeaver**

---

### Pasos realizados

#### 1. PostgreSQL en Docker Compose

Se amplió el `docker-compose.yml` para añadir un servicio `db`:

```yaml
services:
  backend:
    build: ./backend
    volumes:
      - ./backend:/app
    environment:
      - DATABASE_URL=postgresql://kokito:kokito@db:5432/kokito
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: kokito
      POSTGRES_PASSWORD: kokito
      POSTGRES_DB: kokito
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**Conceptos clave:**

- `depends_on` — garantiza que Docker arranque `db` antes que `backend`
- `volumes: postgres_data:` a nivel raíz — volumen con nombre gestionado por Docker. A diferencia de un volumen de carpeta local, persiste aunque se haga `docker compose down`
- `environment` en el backend — pasa la `DATABASE_URL` como variable de entorno para que `database.py` la lea con `os.getenv()`

Verificación de que Postgres está activo:

```bash
docker compose exec db psql -U kokito -d kokito
# Prompt kokito=# indica conexión correcta
# Salir con \q
```

---

#### 2. Instalación de librerías

```bash
pip install sqlalchemy psycopg2-binary
pip freeze > backend/requirements.txt
```

- `sqlalchemy` — ORM que permite definir tablas como clases Python y hacer queries sin SQL crudo
- `psycopg2-binary` — driver que SQLAlchemy usa internamente para conectarse a PostgreSQL

---

#### 3. backend/database.py

```python
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
```

**Conceptos clave:**

- `engine` — gestiona el pool de conexiones a la base de datos. Recibe la URL de conexión
- `SessionLocal` — factoría de sesiones. Cada petición HTTP abre una sesión, opera, y la cierra
- `Base` — clase de la que heredan todos los modelos. SQLAlchemy la usa para saber qué tablas crear
- `Base.metadata.create_all()` — crea las tablas que falten. Si ya existen, no las toca
- `os.getenv("DATABASE_URL", "...")` — lee la variable de entorno; si no existe, usa el valor por defecto (útil para desarrollo local sin Docker)

---

#### 4. backend/main.py — versión final

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import pdfplumber, edge_tts, tempfile
from database import SessionLocal, Conversion, crear_tablas

app = FastAPI()
VOICE = "es-ES-AlvaroNeural"

@app.on_event("startup")
def startup():
    crear_tablas()

@app.get("/health_check")
def health_check():
    return {"mensaje": "Servicio Api REST activo"}

@app.post("/convertir")
async def convertir(pdf: UploadFile = File(...)):
    with pdfplumber.open(pdf.file) as file:
        text = ""
        for page in file.pages:
            text += page.extract_text()

    if text:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(tmp_path)

        db = SessionLocal()
        conversion = Conversion(nombre=pdf.filename, caracteres=len(text))
        db.add(conversion)
        db.commit()
        db.close()

        return FileResponse(tmp_path, media_type="audio/mpeg", filename="kokito.mp3")
    else:
        return {"mensaje": "El archivo PDF está vacío"}
```

**Conceptos clave:**

- `@app.on_event("startup")` — ejecuta una función al arrancar el servidor. Se usa para crear las tablas automáticamente si no existen
- `db.add(conversion)` — prepara el objeto para insertar (no escribe nada todavía)
- `db.commit()` — ejecuta el INSERT en la base de datos
- `db.close()` — cierra la sesión. Imprescindible para no agotar el pool de conexiones

---

#### 5. Error encontrado — uvicorn no encuentra main.py

Lanzar uvicorn desde la raíz del proyecto en lugar de desde `backend/` provoca `Could not import module "main"`. Solución: entrar siempre en `backend/` antes de lanzar el servidor.

```bash
cd backend
uvicorn main:app --reload
```

---

#### 6. Conexión desde DBeaver

Datos de conexión:

| Campo | Valor |
|---|---|
| Host | localhost |
| Puerto | 5432 |
| Base de datos | kokito |
| Usuario | kokito |
| Contraseña | kokito |

Requiere tener `docker compose up` activo. Permite inspeccionar la tabla `conversiones` y verificar que cada conversión queda registrada correctamente.

## Sesión 4 — Tareas asíncronas con Celery + Redis (Fase 4 completa)

### Lo que hemos construido

- **Redis** corriendo en Docker como servicio de cola
- **Celery** configurado con worker independiente
- **`celery_app.py`** con la instancia y configuración de Celery
- **`tasks.py`** con la lógica de conversión extraída de `main.py`
- **Endpoint `/convertir` actualizado** — devuelve un `tarea_id` inmediatamente sin bloquear
- **Endpoint `/resultado/{tarea_id}`** — consulta el estado y devuelve el MP3 cuando está listo
- **Volumen compartido `mp3_data`** entre worker y backend para compartir los archivos generados
- **`docker compose up`** levanta los cuatro servicios de golpe sin comandos adicionales

---

### Arquitectura resultante
```
Cliente → POST /convertir → FastAPI → Redis (cola) → Celery worker → genera MP3
Cliente → GET /resultado/{id} → FastAPI → Redis (resultado) → devuelve MP3
```
```
docker compose up levanta:
  - db       → PostgreSQL
  - redis    → cola de tareas
  - backend  → FastAPI + uvicorn
  - worker   → Celery
```

---

### Pasos realizados

#### 1. Redis en Docker Compose

Se añadió el servicio `redis` y la variable de entorno `CELERY_BROKER_URL` al backend:
```yaml
redis:
  image: redis:7
  ports:
    - "6379:6379"
```

- `redis://redis:6379/0` — URL de conexión. El `0` es el número de base de datos dentro de Redis (admite hasta 16, usamos la 0 por defecto)

---

#### 2. backend/celery_app.py
```python
from celery import Celery
import os

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "kokito",
    broker=CELERY_BROKER_URL,
    backend=CELERY_BROKER_URL,
    include=["tasks"]
)

celery_app.conf.update(
    result_backend=CELERY_BROKER_URL
)
```

- `broker` — dónde Celery manda las tareas (Redis como buzón de entrada)
- `backend` — dónde Celery guarda los resultados para consultarlos después
- `include=["tasks"]` — indica a Celery qué módulos contienen tareas. Sin esto el worker arranca pero no registra ninguna tarea y las descarta con `KeyError`
- `result_backend` en `conf.update` — necesario para que `AsyncResult` pueda consultar estados desde FastAPI

---

#### 3. backend/tasks.py
```python
from celery_app import celery_app
from database import SessionLocal, Conversion
import pdfplumber, edge_tts, tempfile, asyncio, os

VOICE = "es-ES-AlvaroNeural"
MP3_DIR = "/tmp/kokito"

@celery_app.task
def convertir_pdf(pdf_bytes: bytes, filename: str) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        for page in file.pages:
            text += page.extract_text()

    if not text:
        return "ERROR: PDF vacío"

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    asyncio.run(edge_tts.Communicate(text, VOICE).save(tmp_mp3_path))

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text))
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path
```

- `@celery_app.task` — decorador que convierte una función normal en una tarea Celery
- La tarea recibe `pdf_bytes: bytes` en lugar de `UploadFile` — Celery serializa los parámetros para meterlos en Redis, y los objetos de FastAPI no son serializables. Los bytes sí
- `dir=MP3_DIR` en `NamedTemporaryFile` — fuerza que el MP3 se cree en el volumen compartido en lugar de en `/tmp` genérico
- `asyncio.run()` — los workers de Celery son síncronos, así que se necesita para ejecutar funciones `async` como las de edge-tts

---

#### 4. backend/main.py — versión final
```python
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from celery.result import AsyncResult
from tasks import convertir_pdf
from celery_app import celery_app
from database import crear_tablas

app = FastAPI()

@app.on_event("startup")
def startup():
    crear_tablas()

@app.get("/health_check")
def health_check():
    return {"mensaje": "Servicio Api REST activo"}

@app.post("/convertir")
async def convertir(pdf: UploadFile = File(...)):
    pdf_bytes = await pdf.read()
    tarea = convertir_pdf.delay(pdf_bytes, pdf.filename)
    return {"tarea_id": tarea.id}

@app.get("/resultado/{tarea_id}")
def resultado(tarea_id: str):
    tarea = AsyncResult(tarea_id, app=celery_app)

    if tarea.state == "PENDING":
        return {"estado": "pendiente"}
    elif tarea.state == "SUCCESS":
        return FileResponse(tarea.result, media_type="audio/mpeg", filename="kokito.mp3")
    elif tarea.state == "FAILURE":
        return {"estado": "error", "detalle": str(tarea.result)}
```

- `.delay()` — forma abreviada de `.apply_async()`. Manda la tarea a la cola y devuelve un objeto con el ID
- `AsyncResult(tarea_id, app=celery_app)` — consulta el estado de una tarea en Redis. El parámetro `app=celery_app` es necesario para que sepa qué backend usar; sin él devuelve `DisabledBackend`
- `tarea.state` — atributo gestionado automáticamente por Celery. Valores posibles: `PENDING`, `STARTED`, `SUCCESS`, `FAILURE`
- `tarea.result` — contiene el valor de retorno de la tarea si `SUCCESS`, o la excepción si `FAILURE`

---

#### 5. Volumen compartido entre worker y backend

Worker y backend son contenedores distintos con sistemas de archivos independientes. El worker generaba el MP3 en su propio `/tmp` y el backend no podía encontrarlo.

Solución: volumen con nombre `mp3_data` montado en `/tmp/kokito` en ambos contenedores:
```yaml
volumes:
  - mp3_data:/tmp/kokito

volumes:
  mp3_data:
```

---

#### 6. Worker y backend en Docker Compose

Se añadió el servicio `worker` al `docker-compose.yml` y se configuró el comando de cada servicio explícitamente:
```yaml
backend:
  command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

worker:
  build: ./backend
  command: celery -A celery_app worker --loglevel=info
```

- `--host 0.0.0.0` — necesario dentro de Docker para aceptar conexiones externas al contenedor. Sin esto uvicorn solo escucha en localhost interno y no es accesible desde el Mac
- El worker usa el mismo `build` que el backend — mismo código, distinto comando

---

### Estructura del proyecto al final de la sesión
```
kokito/
├── backend/
│   ├── main.py
│   ├── tasks.py
│   ├── celery_app.py
│   ├── database.py
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml
├── .gitignore
└── DIARIO.md
```

---

### Errores encontrados

**`KeyError: tasks.convertir_pdf` en el worker** — el worker no registraba la tarea porque faltaba `include=["tasks"]` en `celery_app.py`.

**`DisabledBackend`** — `AsyncResult` no sabía qué backend usar. Solución: pasar `app=celery_app` explícitamente y añadir `result_backend` en `celery_app.conf.update`.

**`FileNotFoundError` al servir el MP3** — el archivo se generaba en el `/tmp` del worker pero el backend lo buscaba en su propio sistema de archivos. Solución: volumen compartido `mp3_data` montado en `/tmp/kokito` en ambos contenedores.

## Sesión 5 — Frontend con React + Tailwind (Fase 5 completa)

### Lo que hemos construido

- **Proyecto React** creado con Vite
- **Tailwind CSS** configurado para estilos utilitarios
- **Interfaz completa** con tres estados: subir PDF, spinner de procesado, y reproductor de audio
- **Polling automático** cada 2 segundos para consultar el estado de la tarea
- **CORS** configurado en el backend para permitir peticiones desde el frontend

---

### Pasos realizados

#### 1. Instalación de Node.js con nvm

Node.js no estaba instalado. Se instaló con nvm (gestor de versiones de Node, equivalente a pyenv para Python):
```bash
brew install nvm
```

Añadir al `.zshrc`:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
```
```bash
source ~/.zshrc
nvm install --lts
nvm use --lts
```

---

#### 2. Crear el proyecto React con Vite
```bash
cd ~/repos/kokito
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

- `vite` — transforma JSX a JavaScript que el navegador entiende y levanta un servidor de desarrollo con recarga automática
- `tailwindcss@3` — versión estable. La v4 cambió la API y ya no usa `tailwindcss init`
- `postcss` y `autoprefixer` — necesarios para que Tailwind procese el CSS internamente

---

#### 3. Configuración de Tailwind

**`frontend/tailwind.config.js`:**
```js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

El campo `content` le dice a Tailwind dónde buscar las clases usadas para incluirlas en el CSS final. Sin esto Tailwind no genera ningún estilo.

**`frontend/src/index.css`:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

El aviso `Unknown at rule @tailwind` en VS Code es solo una advertencia del editor — no afecta al funcionamiento. Se puede silenciar creando `frontend/.vscode/settings.json`:
```json
{
  "css.validate": false
}
```

---

#### 4. frontend/src/App.jsx
```jsx
import { useState } from "react"

const API = "http://localhost:8000"

function App() {
  const [estado, setEstado] = useState("inicial")
  const [tareaId, setTareaId] = useState(null)
  const [mp3Url, setMp3Url] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    const archivo = e.target.files[0]
    if (!archivo) return

    setEstado("procesando")
    setError(null)

    const formData = new FormData()
    formData.append("pdf", archivo)

    const res = await fetch(`${API}/convertir`, {
      method: "POST",
      body: formData,
    })
    const data = await res.json()
    setTareaId(data.tarea_id)

    const intervalo = setInterval(async () => {
      const res = await fetch(`${API}/resultado/${data.tarea_id}`)

      if (res.headers.get("content-type")?.includes("audio")) {
        clearInterval(intervalo)
        const blob = await res.blob()
        setMp3Url(URL.createObjectURL(blob))
        setEstado("listo")
      } else {
        const result = await res.json()
        if (result.estado === "error") {
          clearInterval(intervalo)
          setError(result.detalle)
          setEstado("inicial")
        }
      }
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-10 w-full max-w-md shadow-xl flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Kokito</h1>
        <p className="text-gray-400 text-sm text-center">
          Convierte un PDF a audio en segundos
        </p>

        {estado === "inicial" && (
          <div className="w-full flex flex-col items-center gap-4">
            <label className="w-full cursor-pointer border-2 border-dashed border-gray-700 hover:border-blue-500 transition rounded-xl p-8 flex flex-col items-center gap-2 text-gray-400 hover:text-blue-400">
              <span className="text-4xl">📄</span>
              <span className="text-sm">Haz clic para seleccionar un PDF</span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleSubmit}
              />
            </label>
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
          </div>
        )}

        {estado === "procesando" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Generando audio...</p>
            <p className="text-gray-600 text-xs font-mono">{tareaId}</p>
          </div>
        )}

        {estado === "listo" && (
          <div className="flex flex-col items-center gap-4 w-full">
            <span className="text-5xl">✅</span>
            <p className="text-gray-300 text-sm">Audio listo</p>
            <audio controls src={mp3Url} className="w-full mt-2" />
            
              href={mp3Url}
              download="kokito.mp3"
              className="w-full text-center bg-blue-600 hover:bg-blue-500 transition text-white font-medium py-2 rounded-xl text-sm"
            >
              Descargar MP3
            </a>
            <button
              onClick={() => { setEstado("inicial"); setMp3Url(null) }}
              className="text-gray-500 hover:text-gray-300 text-xs transition"
            >
              Convertir otro PDF
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
```

**Conceptos clave:**

- `useState` — hook de React que define estado local. Cuando se llama a la función setter, React re-renderiza el componente con el valor nuevo
- `setInterval` — consulta `/resultado` cada 2 segundos hasta que la tarea termina o da error. Se cancela con `clearInterval` cuando ya no hace falta
- La detección de si la tarea terminó se hace comprobando el `content-type` de la respuesta — si incluye `audio` es el MP3, si no es JSON con el estado
- `URL.createObjectURL(blob)` — convierte el MP3 que llega del servidor en una URL temporal que el navegador puede reproducir directamente
- `FormData` — formato necesario para enviar archivos via HTTP desde el navegador. Equivalente a `multipart/form-data`

---

#### 5. CORS en el backend

El navegador bloquea por seguridad las peticiones desde un origen (`localhost:5173`) a otro (`localhost:8000`) salvo que el servidor lo permita explícitamente. Se añadió el middleware de CORS a `main.py`:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Sin esto el frontend recibía la respuesta del POST `/convertir` pero las llamadas al GET `/resultado` eran bloqueadas silenciosamente por el navegador, dejando el spinner girando indefinidamente.

---

### Arrancar el proyecto
```bash
# Terminal 1
docker compose up

# Terminal 2
cd frontend
npm run dev
```

Frontend disponible en `http://localhost:5173`.

---

### Estructura del proyecto al final de la sesión
```
kokito/
├── backend/
│   ├── main.py
│   ├── tasks.py
│   ├── celery_app.py
│   ├── database.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── index.css
│   ├── tailwind.config.js
│   ├── index.html
│   └── package.json
├── docker-compose.yml
├── .gitignore
└── DIARIO.md
```

---

## Sesión 6 — Limpieza de texto (Nivel 1 completa)

### Lo que hemos construido

- **Función `limpiar_texto`** en `tasks.py` que preprocesa el texto extraído antes de enviarlo al TTS
- **Limitación de páginas** para pruebas sin procesar el PDF entero
- **Manejo de errores mejorado** — PDFs vacíos o escaneados ya no dejan el spinner infinito

---

### Pasos realizados

#### 1. Limitación de páginas para pruebas

En `tasks.py`, el bucle de extracción acepta un slice para procesar solo las páginas necesarias:
```python
for page in file.pages[1:2]:  # Solo la segunda página
    text += page.extract_text()
```

- `[:1]` — solo la primera página
- `[1:2]` — solo la segunda página
- Sin slice — el PDF entero

---

#### 2. Manejo de errores en PDFs vacíos

Cambio en `tasks.py` — en lugar de devolver un string de error (que Celery marca como `SUCCESS`), se lanza una excepción real:
```python
if not text:
    raise ValueError("El PDF no contiene texto extraíble")
```

Así Celery marca la tarea como `FAILURE` y el frontend puede detectarlo correctamente.

Cambio en `App.jsx` — se añadió un caso para estados inesperados en el polling:
```javascript
} else if (result.estado !== "pendiente") {
    clearInterval(intervalo)
    setError("Ha ocurrido un error inesperado")
    setEstado("inicial")
}
```

---

#### 3. Función limpiar_texto
```python
import re

def limpiar_texto(texto: str) -> str:
    # Títulos en mayúsculas — añadir pausa antes y después
    texto = re.sub(r"\n([A-ZÁÉÍÓÚÑÜ]+)\n", r". \1. ", texto)
    # Saltos de línea dobles — pausa entre secciones
    texto = re.sub(r"\n{2,}", ". ", texto)
    # Saltos de línea simples — dentro de párrafo, reemplazar por espacio
    texto = re.sub(r"\s+", " ", re.sub(r"\n", " ", texto))
    # Pies de página y URLs
    texto = re.sub(r"-?\s*Página\s*\d+", "", texto)
    texto = re.sub(r"www\.\S+", "", texto)
    return texto
```

Se llama justo antes de pasarle el texto a edge-tts:
```python
text = limpiar_texto(text)
asyncio.run(edge_tts.Communicate(text, VOICE).save(tmp_mp3_path))
```

**Conceptos clave:**

- `re.sub(patrón, reemplazo, texto)` — busca y reemplaza patrones en un string
- `r"\n{2,}"` — dos o más saltos de línea seguidos
- `r"\1"` — referencia al grupo capturado entre paréntesis en el patrón
- `?` en un patrón — el elemento anterior es opcional (cero o una vez)
- El orden importa: hay que salvar los dobles antes de colapsar los simples

---

### Errores encontrados

**Spinner infinito en PDFs vacíos** — Celery marcaba la tarea como `SUCCESS` aunque devolviera un string de error, porque técnicamente no había excepción. Solución: usar `raise` en lugar de `return` para los errores.

**Títulos sin pausa** — los títulos en este PDF están separados por `\n` simples, no dobles. Se detectan buscando líneas con solo letras mayúsculas.

---

## Sesión 6.5 — Barra de progreso

### Lo que hemos construido

- **Reporte de progreso en tiempo real** desde el worker de Celery
- **Barra de progreso visual** en el frontend con porcentaje

---

### Cambios realizados

#### tasks.py

`bind=True` en el decorador permite usar `self` dentro de la tarea para reportar el estado:
```python
@celery_app.task(bind=True)
def convertir_pdf(self, pdf_bytes: bytes, filename: str) -> str:
```

El bucle reporta en qué página va en cada iteración:
```python
paginas = file.pages
total = len(paginas)
for i, page in enumerate(paginas):
    text += page.extract_text()
    self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})
```

- `enumerate()` — devuelve el índice y el valor en cada iteración, equivalente a un `for` con contador en Java
- `self.update_state()` — guarda el estado actual en Redis para que el backend pueda consultarlo

---

#### main.py

Nuevo caso en `/resultado` para el estado `PROGRESS`:
```python
elif tarea.state == "PROGRESS":
    pagina = tarea.info.get("pagina", 0)
    total = tarea.info.get("total", 1)
    porcentaje = int((pagina / total) * 100)
    return {"estado": "progreso", "porcentaje": porcentaje}
```

---

#### App.jsx

Nuevo estado `progreso` y barra visual en el bloque de procesando:
```javascript
const [progreso, setProgreso] = useState(0)
```
```javascript
} else if (result.estado === "progreso") {
    setProgreso(result.porcentaje)
}
```
```jsx
<p className="text-gray-400 text-sm">Generando audio... {progreso}%</p>
<div className="w-full bg-gray-700 rounded-full h-2">
    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{width: `${progreso}%`}} />
</div>
```

---

### Notas

- Con PDFs cortos (2-3 páginas) el worker termina antes de que el polling capture estados intermedios, por lo que la barra salta directamente a 100%. Con PDFs largos el progreso se verá correctamente.

---

## Sesión 7 — Refactorización TTS y soporte multi-proveedor

### Lo que hemos construido

- **Módulo `tts/`** con la lógica de conversión separada por proveedor
- **`tts/text_utils.py`** con la función `limpiar_texto` extraída de `tasks.py`
- **`tts/edge.py`** con la lógica completa de conversión usando edge-tts
- **`tts/google.py`** con el stub para Google Cloud TTS (WIP)
- **Endpoint `/convertir` actualizado** para recibir el parámetro `proveedor`
- **Selector visual en el frontend** para elegir entre Edge TTS y Google TTS

---

### Pasos realizados

#### 1. Estructura del módulo tts

Se extrajo toda la lógica de conversión de `tasks.py` a un módulo independiente:
```
backend/
├── tts/
│   ├── edge.py
│   ├── google.py
│   └── text_utils.py
├── tasks.py
├── main.py
...
```

La motivación es separar responsabilidades: `tasks.py` solo decide qué proveedor usar, y cada módulo dentro de `tts/` implementa la conversión completa para ese proveedor.

---

#### 2. backend/tts/text_utils.py

La función `limpiar_texto` se movió aquí desde `tasks.py` para que pueda ser reutilizada por cualquier proveedor:
```python
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
```

---

#### 3. backend/tts/edge.py

Contiene la lógica completa que antes estaba en `tasks.py`, ahora como función independiente que recibe `self` (la instancia de la tarea Celery) para poder reportar progreso:
```python
from celery_app import celery_app
from database import SessionLocal, Conversion
import pdfplumber, edge_tts, tempfile, asyncio, os, re
from tts.text_utils import limpiar_texto

VOICE = "es-ES-AlvaroNeural"
MP3_DIR = "/tmp/kokito"

def process_file_with_edge(self, pdf_bytes: bytes, filename: str) -> str:
    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        paginas = file.pages[10:12]  # Limitado a páginas 11 y 12 para pruebas
        total = len(paginas)
        for i, page in enumerate(paginas):
            text += page.extract_text()
            self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})

    if not text:
        raise ValueError("El PDF no contiene texto extraíble")

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    text = limpiar_texto(text)
    asyncio.run(edge_tts.Communicate(text, VOICE).save(tmp_mp3_path))

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text))
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path
```

---

#### 4. backend/tts/google.py

Stub vacío pendiente de implementar:
```python
def process_file_with_google(self, pdf_bytes: bytes, filename: str) -> str:
    return "WIP"
```

---

#### 5. backend/tasks.py — versión final

Simplificado a un dispatcher que delega en el proveedor correspondiente:
```python
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
```

---

#### 6. backend/main.py — cambios

Se añadió `proveedor` como parámetro obligatorio del endpoint `/convertir`:
```python
from fastapi import FastAPI, UploadFile, File, Form

@app.post("/convertir")
async def convertir(pdf: UploadFile = File(...), proveedor: str = Form(...)):
    pdf_bytes = await pdf.read()
    tarea = convertir_pdf.delay(pdf_bytes, pdf.filename, proveedor)
    return {"tarea_id": tarea.id}
```

- `Form(...)` — indica que el parámetro llega como campo de formulario (`multipart/form-data`), no como JSON. Necesario porque el endpoint ya recibe un archivo y no puede mezclar `multipart` con JSON

---

#### 7. frontend/src/App.jsx — selector de proveedor

Se añadió estado `proveedor` y un selector visual tipo toggle antes del campo de subida:
```jsx
const [proveedor, setProveedor] = useState("edge")

// Al enviar:
formData.append("proveedor", proveedor)

// UI:
<div className="w-full flex rounded-xl overflow-hidden border border-gray-700">
  <button
    onClick={() => setProveedor("edge")}
    className={`flex-1 py-2 text-sm font-medium transition ${
      proveedor === "edge"
        ? "bg-blue-600 text-white"
        : "bg-gray-800 text-gray-400 hover:text-white"
    }`}
  >
    Edge TTS
  </button>
  <button
    onClick={() => setProveedor("google")}
    className={`flex-1 py-2 text-sm font-medium transition ${
      proveedor === "google"
        ? "bg-blue-600 text-white"
        : "bg-gray-800 text-gray-400 hover:text-white"
    }`}
  >
    Google TTS
  </button>
</div>
```

---

### Estructura del proyecto al final de la sesión
```
kokito/
├── backend/
│   ├── tts/
│   │   ├── edge.py
│   │   ├── google.py
│   │   └── text_utils.py
│   ├── main.py
│   ├── tasks.py
│   ├── celery_app.py
│   ├── database.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── index.css
│   ├── tailwind.config.js
│   ├── index.html
│   └── package.json
├── docker-compose.yml
├── .gitignore
└── DIARIO.md
```

---

## Sesión 8 — Billing Stopper en Google Cloud

### Lo que hemos construido

- **Cloud Run function `kokito-billing-stopper`** que deshabilita la facturación automáticamente al superar el presupuesto
- **Permisos IAM** configurados correctamente para que la función pueda modificar la facturación
- **Presupuesto de €10** en Google Cloud Billing conectado via Pub/Sub a la función
- Verificación real: la función desvinculó la cuenta de facturación correctamente al simular un mensaje de presupuesto superado

---

### Pasos realizados

#### 1. Habilitar la Cloud Billing API
```bash
gcloud services enable cloudbilling.googleapis.com --project=kokito
```

---

#### 2. Permisos IAM

La service account que ejecuta Cloud Run necesita permisos en dos niveles:

**A nivel de proyecto:**
```bash
gcloud projects add-iam-policy-binding kokito \
  --member="serviceAccount:$(gcloud iam service-accounts list --project=kokito --filter='displayName:Default' --format='value(email)' | head -1)" \
  --role="roles/billing.projectManager"
```

**A nivel de cuenta de facturación:**
```bash
gcloud billing accounts add-iam-policy-binding $(gcloud billing accounts list --format='value(name)') \
  --member="serviceAccount:344097171695-compute@developer.gserviceaccount.com" \
  --role="roles/billing.user"
```

El rol `roles/billing.projectManager` no está soportado a nivel de billing account — hay que usar `roles/billing.user`.

---

#### 3. Código de la función — main.py
```python
import base64
import json
from googleapiclient import discovery
from flask import Flask, request

app = Flask(__name__)

@app.route("/", methods=["POST"])
def stop_billing(request):
    envelope = request.get_json()
    pubsub_message = envelope["message"]
    pubsub_data = base64.b64decode(pubsub_message["data"]).decode("utf-8")
    budget_data = json.loads(pubsub_data)
    cost = budget_data.get("costAmount", 0)
    budget = budget_data.get("budgetAmount", 1)

    if cost <= budget:
        return "OK"

    project_id = budget_data.get("projectId")
    billing = discovery.build("cloudbilling", "v1")
    billing.projects().updateBillingInfo(
        name=f"projects/{project_id}",
        body={"billingAccountName": ""}
    ).execute()
    return "Billing disabled"
```

**Conceptos clave:**

- La función necesita ser una app Flask con `app = Flask(__name__)` porque Cloud Run con Buildpacks busca una variable `app` en `main.py`. Sin ella el worker crashea con `Failed to find attribute 'app' in 'main'`
- `stop_billing` debe recibir `request` como parámetro aunque use el objeto `request` de Flask globalmente — sin él lanza `TypeError: stop_billing() takes 0 positional arguments but 1 was given`
- `billingAccountName: ""` — pasar una cadena vacía es la forma de desvincular la cuenta de facturación via la API

---

#### 4. requirements.txt
```
google-api-python-client
flask
```

---

#### 5. Conexión con el presupuesto via Pub/Sub

El presupuesto `kokito-limite` (€10 mensual) ya tenía configurado el topic `projects/kokito/topics/kokito-presupuesto`. La suscripción que conecta ese topic con la Cloud Run function se verificó con:
```bash
gcloud pubsub subscriptions list --project=kokito
```

La suscripción `eventarc-europe-west1-trigger-xg1htbue-sub-402` está activa y apunta a la URL de la función con autenticación OIDC.

---

#### 6. Errores encontrados

**`Failed to find attribute 'app' in 'main'`** — Cloud Run con Buildpacks espera una app Flask. Solución: añadir `app = Flask(__name__)` y el decorador `@app.route`.

**`roles/billing.projectManager is not supported for this resource`** — ese rol no existe a nivel de billing account. Solución: usar `roles/billing.user`.

**`TypeError: stop_billing() takes 0 positional arguments`** — la función definida con `@app.route` necesita `request` como parámetro explícito cuando se usa con Cloud Run Functions framework.

**Worker SIGKILL / out of memory** — la instancia de Cloud Run tenía poca memoria asignada. Solución:
```bash
gcloud run services update kokito-billing-stopper \
  --memory=512Mi \
  --region=europe-west1 \
  --project=kokito
```