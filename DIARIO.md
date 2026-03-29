# Diario de desarrollo — Kokito

---

## Inicio rápido

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
git status                         # Ver qué archivos han cambiado
git add .                          # Añadir todos los cambios al stage
git add nombre_archivo             # Añadir un archivo concreto
git commit -m "mensaje del commit" # Guardar los cambios con un mensaje
git push                           # Subir los commits a GitHub
git log --oneline                  # Ver el historial de commits resumido
git diff                           # Ver los cambios no añadidos al stage
```

---

## Regla permanente — Proveedor TTS

**Durante el desarrollo se usa siempre Edge TTS** (gratuito, rápido para pruebas).

**Todo el código debe ser agnóstico al proveedor.** Cualquier mejora, nueva funcionalidad
o cambio debe funcionar exactamente igual con el TTS local del sobremesa (Coqui XTTS v2)
sin modificar nada salvo el parámetro `proveedor`.

El módulo `tts/` ya está diseñado para esto — cada proveedor es un archivo independiente
y `tasks.py` solo decide cuál usar. Mantener siempre esta separación.

Antes de dar algo por terminado, preguntarse: *¿esto funcionaría igual pasando `proveedor="local"`?*

---

## Estado actual del proyecto

### Stack en uso
| Capa | Tecnología |
|---|---|
| Backend | Python + FastAPI + Uvicorn |
| Extracción PDF | pdfplumber |
| Text-to-Speech | Edge TTS (desarrollo) · Google TTS Chirp3 HD (candidato producción) · TTS local con GPU (en desarrollo) |
| Procesamiento async | Celery + Redis |
| Base de datos | PostgreSQL + SQLAlchemy |
| Frontend | React + Vite + Tailwind CSS v3 |
| Contenedores | Docker + Docker Compose |
| Deploy futuro | Mini PC propio (servidor 24/7) |
| Almacenamiento futuro | Cloudflare R2 |

### Estructura actual del proyecto
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

### Lo que funciona hoy
- API REST con FastAPI: endpoints `/health_check`, `/convertir`, `/resultado/{tarea_id}`, `/estadisticas`
- Conversión PDF → MP3 con Edge TTS (paralelización con semáforo de 15, ~2 min/100 páginas)
- Conversión PDF → MP3 con Google TTS (voz `es-ES-Chirp3-HD-Umbriel`, fragmentación automática a 4800 bytes)
- Cola de tareas con Celery + Redis, progreso en dos fases (0-50% extracción, 50-100% síntesis)
- Barra de progreso en tiempo real en el frontend
- Registro de conversiones en PostgreSQL con campo `proveedor`
- Endpoint `/estadisticas` con consumo mensual de caracteres Google TTS
- Billing Stopper en Google Cloud Run (se desvincula la facturación al superar €10/mes)
- Frontend React con selector de proveedor Edge / Google / Local (GPU), reproductor de audio y descarga
- Servidor TTS local en el sobremesa Windows (FastAPI en puerto 8001, accesible desde el Mac en 192.168.1.51)
- `tts/local.py` en Kokito que llama al sobremesa via HTTP — pendiente de depurar concatenación de MP3

---

## Hoja de ruta — fases pendientes

### Próxima — Decisión de proveedor TTS y rediseño de BBDD

**Pendiente de decidir:** proveedor TTS para producción.
- **Google Standard** — $4/millón, 4M caracteres gratuitos/mes (~8 libros). Buena calidad, ya integrado parcialmente.
- **Azure TTS Neural** — $16/millón, 5M caracteres gratuitos/mes (~10 libros). Mismas voces que Edge TTS pero API oficial. Más generoso en capa gratuita.
- TTS local con XTTS v2 **descartado definitivamente** — inconsistente en español, inaceptable para audiolibros.

Una vez decidido el proveedor, atacar el **rediseño de BBDD**:
**Objetivo:** tener el sobremesa (RTX 3070, i7-11700F, 32 GB RAM, Windows limpio) sirviendo una API de TTS local de alta calidad, y conectarla a Kokito como tercer proveedor.

**Hardware del sobremesa:**
- GPU: NVIDIA GeForce RTX 3070 (8 GB VRAM)
- CPU: Intel i7-11700F
- RAM: 32 GB
- SO: Windows 11
- IP local: 192.168.1.51

**Decisiones tomadas:**
- Motor TTS: **Coqui XTTS v2** — mejor calidad narrativa, soporta clonado de voz
- Piper TTS descartado — muy rápido pero suena plano y sin expresividad, no apto para audiolibros
- Voz de referencia: `voz_elevenlabs_1.mp3` — capturada desde la demo de ElevenLabs
- Parámetros óptimos: `temperature=0.7`, `repetition_penalty=5.0`
- Velocidad: ~40 segundos por 150 palabras en RTX 3070 → ~5-6 horas por libro de 300 páginas procesando de noche
- Comunicación: el worker de Kokito manda fragmentos de ~500 palabras uno a uno (síncrono) al sobremesa y concatena los MP3 recibidos
- Las voces disponibles las selecciona el admin previamente; el usuario elige entre ellas en el frontend

**Conclusión — TTS local descartado:**
XTTS v2 no es viable para audiolibros en español. Los problemas son limitaciones del modelo, no de configuración: aceleración y agudización de voz en fragmentos largos, atascos en algunas frases, inconsistencia general inaceptable para escuchar un libro entero. Piper TTS también descartado — demasiado plano y robótico para narración.

**Decisión pendiente:** elegir entre Google Standard ($4/millón, 4M gratuitos/mes ≈ 8 libros) y Azure TTS Neural ($16/millón, 5M gratuitos/mes ≈ 10 libros) según el volumen de consumo esperado entre los usuarios.

---

### Rediseño de la BBDD y modelo de datos completo
**Objetivo:** pasar del modelo actual (tabla `conversiones` plana) al modelo definitivo que soporte libros, partes, usuarios y marcadores de posición.

**Nuevas tablas:**
```
libros
  id, titulo, hash_contenido, num_paginas, fecha_subida, subido_por

partes
  id, libro_id, numero_parte, pagina_inicio, pagina_fin,
  estado (pendiente | procesando | listo | error),
  ruta_mp3, proveedor, fecha_procesado

usuarios
  id, email, nombre, password_hash, rol (admin | usuario), fecha_registro

progreso_usuario
  id, usuario_id, libro_id, parte_actual, segundo_actual, fecha_actualizacion

lista_deseos
  id, usuario_id, libro_id, fecha_añadido

solicitudes
  id, usuario_id, titulo_solicitado, autor, notas,
  estado (pendiente | aceptada | rechazada), fecha
```

**Pasos:**
1. Diseñar el esquema completo antes de tocar código
2. Crear los modelos SQLAlchemy para cada tabla
3. Implementar migraciones con **Alembic** (equivalente a Liquibase/Flyway en Java)
4. Verificar desde DBeaver que todas las tablas se crean correctamente
5. Adaptar `tasks.py` para que guarde en `libros` y `partes` en lugar de `conversiones`

**Conceptos nuevos:**
- **Hash de contenido:** `hashlib.sha256` sobre los bytes del PDF. Detecta libros duplicados independientemente del nombre del archivo.
- **Alembic:** herramienta de migraciones para SQLAlchemy. Genera scripts versionados que se pueden aplicar y revertir.

---

### Procesamiento por partes
**Objetivo:** dividir el PDF en bloques independientes y procesarlos de forma separada para que el usuario pueda empezar a escuchar antes de que el libro esté completo.

**Pasos:**
1. Función `analizar_pdf(pdf_bytes)` → número de páginas, capítulos detectados, hash
2. Función `dividir_en_partes(num_paginas, tamaño=50)` → lista de rangos `[(0,50), (50,100), ...]`
3. Al subir un PDF: crear registro en `libros`, crear registros en `partes` con estado `pendiente`, encolar solo la parte elegida por el admin
4. Al terminar una parte: guardar MP3 en R2, actualizar estado a `listo`
5. Worker secundario procesa el resto en segundo plano (partes siguientes primero)
6. Si el libro ya existe por hash: devolver partes ya procesadas sin reprocesar

---

### Almacenamiento en Cloudflare R2
**Objetivo:** los MP3 generados se almacenan en R2 en lugar de en disco local, accesibles desde cualquier máquina.

**Pasos:**
1. Crear bucket en Cloudflare R2
2. Generar API keys con permisos lectura/escritura
3. Instalar `boto3` (R2 es compatible con la API S3 de Amazon)
4. Función `subir_mp3_a_r2(ruta_local, nombre_objeto)` → URL pública
5. Modificar `tasks.py` para subir cada parte a R2 al terminar
6. Modificar `/resultado` para devolver URL de R2 en lugar de `FileResponse`
7. Credenciales de R2 como variables de entorno (nunca en el repositorio)

---

### Panel de administración (frontend admin)
**Objetivo:** interfaz separada solo para el administrador para gestionar libros, conversiones y solicitudes de usuarios.

**Rutas del panel admin:**
- `/admin` — dashboard: libros totales, partes pendientes, solicitudes sin atender, uso TTS del mes
- `/admin/libros` — lista de todos los libros con estado de cada parte
- `/admin/libros/nuevo` — subir PDF manualmente, elegir proveedor, lanzar conversión
- `/admin/solicitudes` — solicitudes de usuarios con botones aceptar/rechazar
- `/admin/usuarios` — lista de usuarios registrados

**Pasos:**
1. Instalar `react-router-dom` para gestionar rutas en el frontend
2. Crear carpeta `frontend/src/pages/admin/` con componentes por ruta
3. Layout de admin con barra lateral de navegación
4. Página de subida de PDF con selector de proveedor y barra de progreso
5. Página de solicitudes con estado y acciones
6. Proteger rutas `/admin/*` verificando `rol === "admin"`

**Notas:**
- La subida de PDFs es manual (el admin lo hace desde este panel).
- Las notificaciones de solicitudes nuevas se ven en el dashboard; push/email para más adelante.

---

### Frontend de usuarios (biblioteca y reproductor)
**Objetivo:** interfaz para usuarios finales — biblioteca de audiolibros disponibles, reproductor con guardado de posición, solicitudes y perfil.

**Rutas:**
- `/` — biblioteca con todos los libros disponibles
- `/libro/:id` — detalle del libro: partes disponibles, botón de reproducir
- `/libro/:id/escuchar` — reproductor con guardado automático de posición
- `/solicitudes` — formulario para pedir un libro + estado de solicitudes anteriores
- `/perfil` — estadísticas: libros escuchados, tiempo total, lista de deseos

**Pasos:**
1. Componentes: `BibliotecaPage`, `LibroPage`, `ReproductorPage`, `SolicitudesPage`, `PerfilPage`
2. Reproductor con guardado de posición cada 5 segundos via `PATCH /progreso`
3. Biblioteca con filtros: todos / en progreso / completados / lista de deseos
4. Formulario de solicitudes y listado de estado de las propias solicitudes
5. Página de perfil con estadísticas del usuario

---

### Autenticación de usuarios
**Objetivo:** login y registro con JWT, protección de rutas y gestión de roles (admin / usuario).

**Pasos:**
1. Instalar `python-jose` y `passlib` en el backend
2. Endpoint `POST /registro` — crea usuario con contraseña hasheada con bcrypt
3. Endpoint `POST /login` — devuelve JWT con `usuario_id` y `rol`
4. Middleware FastAPI que verifica el JWT en cada petición protegida
5. Frontend: guardar JWT en `localStorage`, enviarlo en cabecera `Authorization`
6. Componente `<RutaProtegida>` que redirige a `/login` si no hay JWT válido
7. Componente `<RutaAdmin>` que además verifica `rol === "admin"`

**Conceptos nuevos:**
- **JWT:** token firmado que el servidor emite al hacer login. El cliente lo envía en cada petición. El servidor verifica la firma sin consultar la BBDD. Equivalente a un token de sesión en Spring Security.
- **Hashing de contraseñas:** nunca se guardan en texto plano. Se usa bcrypt, irreversible. Al hacer login se compara el hash.

---

### Deploy en el mini PC
**Objetivo:** mover todo lo que corre en Docker en el Mac al mini PC como servidor 24/7.

**Pasos:**
1. Instalar Ubuntu Server 24.04 LTS en el mini PC
2. Instalar Docker y Docker Compose
3. Clonar el repositorio de GitHub
4. Configurar `.env` con todas las variables de entorno
5. `docker compose up -d` (modo daemon)
6. `systemctl enable docker` para que arranque automáticamente
7. Acceder desde cualquier dispositivo de la red local via IP del mini PC
8. (Opcional) Dominio propio + HTTPS con Cloudflare Tunnel o nginx + Let's Encrypt

---

## Historial de sesiones

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

---

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

### Errores encontrados

**`KeyError: tasks.convertir_pdf` en el worker** — el worker no registraba la tarea porque faltaba `include=["tasks"]` en `celery_app.py`.

**`DisabledBackend`** — `AsyncResult` no sabía qué backend usar. Solución: pasar `app=celery_app` explícitamente y añadir `result_backend` en `celery_app.conf.update`.

**`FileNotFoundError` al servir el MP3** — el archivo se generaba en el `/tmp` del worker pero el backend lo buscaba en su propio sistema de archivos. Solución: volumen compartido `mp3_data` montado en `/tmp/kokito` en ambos contenedores.

---

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
  theme: { extend: {} },
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
{ "css.validate": false }
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

    const res = await fetch(`${API}/convertir`, { method: "POST", body: formData })
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
  // ... render
}
```

**Conceptos clave:**

- `useState` — hook de React que define estado local. Cuando se llama a la función setter, React re-renderiza el componente con el valor nuevo
- `setInterval` — consulta `/resultado` cada 2 segundos hasta que la tarea termina o da error. Se cancela con `clearInterval` cuando ya no hace falta
- La detección de fin de tarea se hace comprobando el `content-type` de la respuesta — si incluye `audio` es el MP3, si no es JSON con el estado
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

## Sesión 6 — Limpieza de texto

### Lo que hemos construido

- **Función `limpiar_texto`** en `tasks.py` que preprocesa el texto extraído antes de enviarlo al TTS
- **Limitación de páginas** para pruebas sin procesar el PDF entero
- **Manejo de errores mejorado** — PDFs vacíos o escaneados ya no dejan el spinner infinito

---

### Pasos realizados

#### 1. Limitación de páginas para pruebas

```python
for page in file.pages[1:2]:  # Solo la segunda página
    text += page.extract_text()
```

- `[:1]` — solo la primera página · `[1:2]` — solo la segunda · Sin slice — el PDF entero

---

#### 2. Manejo de errores en PDFs vacíos

```python
if not text:
    raise ValueError("El PDF no contiene texto extraíble")
```

Así Celery marca la tarea como `FAILURE` y el frontend puede detectarlo correctamente (en lugar de `return "ERROR"` que Celery marca como `SUCCESS`).

---

#### 3. Función limpiar_texto
```python
import re

def limpiar_texto(texto: str) -> str:
    texto = re.sub(r"\n([A-ZÁÉÍÓÚÑÜ]+)\n", r". \1. ", texto)
    texto = re.sub(r"\n{2,}", ". ", texto)
    texto = re.sub(r"\s+", " ", re.sub(r"\n", " ", texto))
    texto = re.sub(r"-?\s*Página\s*\d+", "", texto)
    texto = re.sub(r"www\.\S+", "", texto)
    return texto
```

**Conceptos clave:**
- `re.sub(patrón, reemplazo, texto)` — busca y reemplaza patrones en un string
- `r"\n{2,}"` — dos o más saltos de línea seguidos
- `r"\1"` — referencia al grupo capturado entre paréntesis en el patrón
- El orden importa: hay que procesar los dobles antes de colapsar los simples

---

### Errores encontrados

**Spinner infinito en PDFs vacíos** — Celery marcaba la tarea como `SUCCESS` aunque devolviera un string de error. Solución: usar `raise` en lugar de `return` para los errores.

---

## Sesión 6.5 — Barra de progreso

### Lo que hemos construido

- **Reporte de progreso en tiempo real** desde el worker de Celery
- **Barra de progreso visual** en el frontend con porcentaje

---

### Cambios realizados

#### tasks.py
```python
@celery_app.task(bind=True)
def convertir_pdf(self, pdf_bytes: bytes, filename: str) -> str:
    # ...
    paginas = file.pages
    total = len(paginas)
    for i, page in enumerate(paginas):
        text += page.extract_text()
        self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})
```

- `enumerate()` — devuelve índice y valor en cada iteración, equivalente a for con contador en Java
- `self.update_state()` — guarda el estado actual en Redis para que el backend pueda consultarlo

#### main.py
```python
elif tarea.state == "PROGRESS":
    pagina = tarea.info.get("pagina", 0)
    total = tarea.info.get("total", 1)
    porcentaje = int((pagina / total) * 100)
    return {"estado": "progreso", "porcentaje": porcentaje}
```

#### App.jsx
```jsx
<p className="text-gray-400 text-sm">Generando audio... {progreso}%</p>
<div className="w-full bg-gray-700 rounded-full h-2">
    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{width: `${progreso}%`}} />
</div>
```

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
```python
import re

def limpiar_texto(texto: str) -> str:
    texto_limpio = re.sub(r"\n([A-ZÁÉÍÓÚÑÜ]+)\n", r". \1. ", texto)
    texto_limpio = re.sub(r"\n{2,}", ". ", texto_limpio)
    texto_limpio = re.sub(r"\s+", " ", re.sub(r"\n", " ", texto_limpio))
    texto_limpio = re.sub(r"-?\s*Página\s*\d+", "", texto_limpio)
    texto_limpio = re.sub(r"www\.\S+", "", texto_limpio)
    return texto_limpio
```

---

#### 3. backend/tts/edge.py
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

#### 4. backend/tasks.py — versión final
```python
from celery_app import celery_app
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

#### 5. backend/main.py — cambios
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

#### 6. frontend/src/App.jsx — selector de proveedor
```jsx
const [proveedor, setProveedor] = useState("edge")

// Al enviar:
formData.append("proveedor", proveedor)

// UI:
<div className="w-full flex rounded-xl overflow-hidden border border-gray-700">
  <button onClick={() => setProveedor("edge")}
    className={`flex-1 py-2 text-sm font-medium transition ${
      proveedor === "edge" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
    }`}>Edge TTS</button>
  <button onClick={() => setProveedor("google")}
    className={`flex-1 py-2 text-sm font-medium transition ${
      proveedor === "google" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
    }`}>Google TTS</button>
</div>
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

---

### Errores encontrados

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

---

## Sesión 9 — Google TTS integrado y estadísticas de uso

### Lo que hemos construido

- **`tts/google.py`** implementado completamente con Google Cloud Text-to-Speech
- **Fragmentación automática** del texto para respetar el límite de 5000 bytes por petición de la API
- **Endpoint `GET /estadisticas`** que consulta la BBDD y devuelve el uso de caracteres del mes actual
- **Barra de progreso de uso** en el frontend que se actualiza al terminar cada conversión
- **Voz seleccionada**: `es-ES-Chirp3-HD-Charon` — masculina, adulta, grave, tecnología Chirp3 HD

---

### Pasos realizados

#### 1. Habilitar la API de Google TTS
```bash
gcloud services enable texttospeech.googleapis.com --project=kokito
```

---

#### 2. Instalar el cliente de Google TTS
```bash
pip install google-cloud-texttospeech pydub
pip freeze > backend/requirements.txt
```

- `google-cloud-texttospeech` — cliente oficial de Google para la API de TTS
- `pydub` — librería para concatenar fragmentos de audio MP3

---

#### 3. Credenciales en desarrollo

Google TTS requiere autenticación via Application Default Credentials (ADC). En desarrollo se usa el archivo de credenciales del SDK de Google Cloud instalado en el Mac:
```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project kokito
```

El archivo se genera en `~/.config/gcloud/application_default_credentials.json` y se monta en el contenedor del worker via volumen en `docker-compose.yml`. **Nunca se sube al repositorio.**

En producción este archivo no se usa — las credenciales se inyectan via variables de entorno en el panel del proveedor de cloud asignando una Service Account con los permisos necesarios.

---

#### 4. docker-compose.yml — cambios en el worker

```yaml
worker:
  build: ./backend
  volumes:
    - ./backend:/app
    - mp3_data:/tmp/kokito
    - /Users/wander/.config/gcloud/application_default_credentials.json:/tmp/gcloud_credentials.json
  environment:
    - DATABASE_URL=postgresql://kokito:kokito@db:5432/kokito
    - CELERY_BROKER_URL=redis://redis:6379/0
    - GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcloud_credentials.json
  depends_on:
    - db
    - redis
  command: celery -A celery_app worker --loglevel=info
```

---

#### 5. Dockerfile — ffmpeg

`pydub` necesita `ffmpeg` instalado en el contenedor para leer y concatenar MP3:
```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . /app/
CMD ["python", "kokito.py"]
```

---

#### 6. backend/tts/google.py

La API de Google TTS tiene un límite de 5000 bytes por petición. Se implementó una función `dividir_texto` que parte el texto en fragmentos respetando ese límite sin cortar palabras, convierte cada fragmento por separado y los concatena con `pydub`:
```python
import os, tempfile, pdfplumber
from pydub import AudioSegment
from google.cloud import texttospeech
from database import SessionLocal, Conversion
from tts.text_utils import limpiar_texto

MP3_DIR = "/tmp/kokito"
MAX_BYTES = 4800

def dividir_texto(texto: str) -> list[str]:
    fragmentos = []
    while len(texto.encode("utf-8")) > MAX_BYTES:
        corte = MAX_BYTES
        while len(texto[:corte].encode("utf-8")) > MAX_BYTES:
            corte -= 1
        corte = texto.rfind(" ", 0, corte)
        fragmentos.append(texto[:corte])
        texto = texto[corte:].strip()
    fragmentos.append(texto)
    return fragmentos

def process_file_with_google(self, pdf_bytes: bytes, filename: str) -> str:
    # extracción PDF, fragmentación, síntesis con Google TTS, concatenación con pydub
    ...
```

**Conceptos clave:**

- `MAX_BYTES = 4800` — se usa 4800 en lugar de 5000 como margen de seguridad
- `texto.rfind(" ", 0, corte)` — busca el último espacio antes del límite para no cortar palabras a la mitad
- `AudioSegment.from_mp3` + `+=` — carga cada fragmento de audio y los concatena en memoria
- `audio_final.export` — escribe el audio concatenado al archivo final

---

#### 7. Selección de voz

Se probaron voces masculinas de español de España: `es-ES-Studio-F`, `es-ES-Neural2-F`, `es-ES-Neural2-G`, `es-ES-Chirp3-HD-Charon`, `es-ES-Chirp3-HD-Fenrir`, `es-ES-Chirp3-HD-Iapetus`.

**Voz seleccionada: `es-ES-Chirp3-HD-Charon`** (luego actualizada a Umbriel en sesión 10).

---

#### 8. Endpoint GET /estadisticas
```python
from sqlalchemy import func
from datetime import datetime, timezone

@app.get("/estadisticas")
def estadisticas():
    db = SessionLocal()
    ahora = datetime.now(timezone.utc)
    caracteres_mes = db.query(func.sum(Conversion.caracteres)).filter(
        Conversion.creado_en >= ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ).scalar() or 0
    db.close()
    return {
        "caracteres_mes": caracteres_mes,
        "limite_gratuito": 1_000_000,
        "porcentaje": round((caracteres_mes / 1_000_000) * 100, 2)
    }
```

- `or 0` — evita que devuelva `None` si no hay conversiones ese mes

---

### Errores encontrados

**`quota project not set`** — las credenciales ADC no tenían proyecto de quota asignado. Solución: `gcloud auth application-default set-quota-project kokito`.

**`InvalidArgument: input.text longer than 5000 bytes`** — la API de Google TTS no acepta textos de más de 5000 bytes por petición. Solución: fragmentar con `dividir_texto` y concatenar los MP3 resultantes con `pydub`.

**`FileNotFoundError: ffprobe`** — `pydub` necesita `ffmpeg` instalado en el sistema para procesar MP3. Solución: añadir `apt-get install -y ffmpeg` al `Dockerfile`.

---

## Sesión 10 — Ajustes de voz y conteo de caracteres por proveedor

### Lo que hemos construido

- **Voz actualizada a `es-ES-Chirp3-HD-Umbriel`** tras comparar varias opciones
- **Columna `proveedor`** añadida a la tabla `conversiones` para distinguir el origen de cada conversión
- **Endpoint `/estadisticas` actualizado** para contar solo los caracteres procesados con Google TTS

---

### Cambios realizados

#### Selección de voz

Se probaron las siguientes voces masculinas adicionales: `es-ES-Chirp3-HD-Algieba`, `es-ES-Chirp3-HD-Alnilam`, `es-ES-Chirp3-HD-Umbriel`, `es-ES-Chirp3-HD-Algenib`, `es-ES-Chirp3-HD-Schedar` y `es-ES-Studio-F`. También se exploró SSML para mejorar la naturalidad, pero las voces Chirp3 HD tienen soporte limitado y Studio-F no soporta `pitch` ni `emphasis`. La voz seleccionada finalmente es **`es-ES-Chirp3-HD-Umbriel`**.

#### Columna proveedor en BBDD
```python
# database.py
proveedor = Column(String, nullable=True)

# edge.py
conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="edge")

# google.py
conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="google")
```

#### Estadísticas filtradas por proveedor
```python
caracteres_mes = db.query(func.sum(Conversion.caracteres)).filter(
    Conversion.creado_en >= ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
    Conversion.proveedor == "google"
).scalar() or 0
```

---

### Notas

- Edge TTS es gratuito porque usa el endpoint interno de Microsoft Edge para lectura web. No es una API oficial y puede dejar de funcionar en cualquier momento — válido para desarrollo pero no recomendable para producción.
- Las voces Chirp3 HD cuestan $30/millón de caracteres fuera de la capa gratuita. Con 1 millón gratuito al mes caben aproximadamente 2 libros del tamaño de El Imperio Final sin coste.
- Para cambiar temporalmente el número de páginas a procesar, modificar el slice `file.pages[:100]` en `tts/edge.py` y `tts/google.py`.

---

## Sesión 11 — Paralelización de Edge TTS y optimización de velocidad

### Lo que hemos construido

- **Paralelización de Edge TTS** con concurrencia limitada via semáforo
- **Progreso real en dos fases** — extracción de texto (0-50%) y síntesis de audio (50-100%)
- **Reintento automático** de fragmentos fallidos hasta 3 veces
- **Semáforo óptimo establecido en 15** — 20 causa errores 503 de Microsoft

---

### Pasos realizados

#### 1. Paralelización en edge.py

Se reemplazó el procesado secuencial por concurrencia limitada con `asyncio.Semaphore`. El límite óptimo probado es 15 — con 20 Microsoft devuelve `503 OriginTimeout`:
```python
async def procesar_audio(fragmentos: list[str], task_self, total_paginas: int) -> list[str]:
    semaforo = asyncio.Semaphore(15)
    completados = [0]
    total_fragmentos = len(fragmentos)

    async def sintetizar(i, fragmento):
        ruta = os.path.join(MP3_DIR, f"fragmento_{i}_{os.getpid()}.mp3")
        async with semaforo:
            for intento in range(3):
                try:
                    await edge_tts.Communicate(fragmento, VOICE).save(ruta)
                    break
                except Exception:
                    if intento == 2:
                        raise
                    await asyncio.sleep(1)
        completados[0] += 1
        porcentaje = 50 + int((completados[0] / total_fragmentos) * 50)
        task_self.update_state(state="PROGRESS", meta={"pagina": total_paginas, "total": total_paginas, "porcentaje_override": porcentaje})
        return ruta

    tareas = [sintetizar(i, f) for i, f in enumerate(fragmentos)]
    return await asyncio.gather(*tareas)
```

**Tiempo resultante: ~2 minutos para 100 páginas.**

---

#### 2. Progreso en dos fases

Tanto `edge.py` como `google.py` reportan ahora progreso en dos fases:

- **0-50%** — extracción de texto, página a página
- **50-100%** — síntesis de audio, fragmento a fragmento

En `main.py` se lee `porcentaje_override` si existe:
```python
elif tarea.state == "PROGRESS":
    info = tarea.info
    if "porcentaje_override" in info:
        porcentaje = info["porcentaje_override"]
    else:
        pagina = info.get("pagina", 0)
        total = info.get("total", 1)
        porcentaje = int((pagina / total) * 50)
    return {"estado": "progreso", "porcentaje": porcentaje}
```

---

### Investigación de alternativas TTS

| Servicio | Capa gratuita | Precio después | Notas |
|---|---|---|---|
| Edge TTS | Ilimitado | Gratis | No oficial, puede fallar |
| Google Chirp3 HD | 1M chars/mes | $30/millón | Voz Umbriel seleccionada |
| Google Neural2 | 1M chars/mes | $16/millón | Soporta SSML completo |
| Azure TTS Neural | 5M chars/mes | $16/millón | API oficial detrás de Edge TTS |
| Amazon Polly Neural | 1M chars/mes (1 año) | $16/millón | Voz Sergio es-ES pendiente de probar |
| ElevenLabs Creator | 100K chars/mes | $22/mes | Mejor calidad narrativa, muy caro |

---

### Notas

- Correr modelos TTS locales en un Pentium doméstico no es viable — tardaría horas por libro. Se necesita CPU moderna de 8 núcleos o GPU dedicada.
- Azure TTS es la opción más interesante a largo plazo: mismas voces que Edge TTS pero API oficial con 5M caracteres gratuitos al mes.
- ElevenLabs tiene la mejor calidad narrativa del mercado pero el coste es prohibitivo para uso con varios usuarios.

---

## Sesión 12 — Diseño del flujo de producto

### Decisiones tomadas

**Proveedor TTS:**
- **Edge TTS** para desarrollo y pruebas — gratis, suficiente para iterar
- **Google Standard** como candidato para producción — $4/millón, 4M chars gratuitos/mes (~8 libros), 100 páginas en ~3 minutos con paralelización a 5 workers
- Google Chirp3 HD y Neural2 descartados por precio
- Amazon Polly descartado — cuenta nueva obligatoria con caducidad a 6 meses
- OpenAI TTS descartado — sin capa gratuita permanente, modelo de prepago no encaja
- **WaveNet pendiente de probar** como alternativa intermedia entre Standard y Neural2

---

### Flujo de producto diseñado

#### Subida de un PDF nuevo
1. Admin sube el PDF manualmente desde el panel de administración
2. El sistema analiza el PDF en menos de 1 segundo — número de páginas, detección de capítulos, cálculo de **hash del contenido**
3. Se muestra al admin un **selector de parte** — "¿Por dónde empezamos?"
4. Se procesa primero la parte elegida → disponible en ~2 minutos
5. En segundo plano, Celery procesa el resto del libro en orden: partes siguientes primero, anteriores al final

#### PDF ya existente en el sistema
- El hash del PDF permite detectar si el libro ya fue procesado anteriormente, independientemente del nombre del archivo
- Las partes ya procesadas están disponibles de inmediato

---

### Arquitectura necesaria para este flujo

- **División del libro en partes** — bloques de N páginas o por capítulos detectados automáticamente
- **Hash del PDF** — huella digital del contenido para identificar libros duplicados
- **Nuevas tablas en BBDD** — libros (con hash) y partes (con estado: pendiente / procesando / listo)
- **Cloudflare R2** — almacenamiento permanente de los MP3 por partes
- **Login de usuarios** — para asociar cada libro y posición de escucha a cada usuario
- **Marcador de posición** — guardar en BBDD en qué parte y en qué segundo se quedó cada usuario
- **Panel de admin** separado del frontal de usuarios
- **Sistema de solicitudes** — los usuarios pueden pedir libros; el admin recibe la notificación en su dashboard

---

## Sesión 13 — TTS local con GPU

### Lo que hemos construido

- **Python 3.11.9** instalado en el sobremesa Windows
- **PyTorch 2.5.1 con CUDA 12.1** — GPU RTX 3070 reconocida correctamente
- **Coqui XTTS v2** instalado y funcionando con clonado de voz
- **Voz de referencia seleccionada** — `voz_elevenlabs_1.mp3`, capturada desde la demo de ElevenLabs
- **Parámetros óptimos** — `temperature=0.7`, `repetition_penalty=5.0`
- **Servidor FastAPI** en el sobremesa (puerto 8001) con endpoints `/health` y `/tts`
- **`tts/local.py`** en Kokito que llama al sobremesa via HTTP y concatena los MP3
- Servidor accesible desde el Mac en `http://192.168.1.51:8001`
- Pendiente: depurar error de concatenación de MP3 en pydub

---

### Pasos realizados

#### 1. Entorno en Windows

```cmd
# Instalar Python 3.11.9 desde python.org (instalador oficial, marcar "Add to PATH")
# Crear entorno virtual
mkdir C:\kokito-tts
cd C:\kokito-tts
python -m venv venv
venv\Scripts\activate
```

---

#### 2. PyTorch con CUDA

No fue necesario instalar CUDA Toolkit por separado — el driver 595.79 ya incluye CUDA 13.2 y entraba en conflicto con el instalador de CUDA 12.4. PyTorch incluye su propia versión de CUDA internamente.

```cmd
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

Verificación:
```cmd
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
# 2.5.1+cu121
# True
# NVIDIA GeForce RTX 3070
```

---

#### 3. Coqui XTTS v2

```cmd
pip install TTS
# Requiere Microsoft C++ Build Tools — descargar de https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Seleccionar "Desarrollo para el escritorio con C++"

pip install transformers==4.37.2
# Necesario — versión más nueva rompe la importación de BeamSearchScorer
```

Verificación:
```cmd
python -c "from TTS.api import TTS; print('TTS importado correctamente')"
```

---

#### 4. Evaluación de motores TTS

Se evaluaron dos motores:

**Piper TTS** — descartado. Muy rápido (casi instantáneo) pero suena plano y sin expresividad. No apto para audiolibros.

**Coqui XTTS v2** — seleccionado. Soporta clonado de voz, español nativo, expresivo. Velocidad: ~40 segundos por 150 palabras en RTX 3070 → ~5-6 horas por libro de 300 páginas. Aceptable procesando de noche.

---

#### 5. Selección de voz

Las voces predefinidas de XTTS v2 suenan genéricas y con acento no español. Se optó por **clonado de voz** — se capturó un fragmento de audio desde la demo de ElevenLabs (voz masculina, grave, castellano) y se usa como referencia.

Archivo: `voz_elevenlabs_1.mp3` — guardado en `C:\kokito-tts\`

Parámetros óptimos tras pruebas:
- `temperature=0.7` — balance entre naturalidad y estabilidad
- `repetition_penalty=5.0`

**Nota de producto:** el usuario podrá elegir entre las voces disponibles en el frontend. El admin selecciona previamente qué voces están disponibles (habiendo probado cuáles suenan bien).

---

#### 6. Servidor FastAPI en el sobremesa — `C:\kokito-tts\server.py`

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import tempfile, os, time
from TTS.api import TTS

app = FastAPI()

print("Cargando modelo XTTS v2...")
tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2').to('cuda')
print("Modelo listo.")

VOZ_DIR = "C:/kokito-tts"

class PeticionTTS(BaseModel):
    texto: str
    voz: str = "voz_elevenlabs_1.mp3"

@app.get("/health")
def health():
    return {"estado": "activo"}

@app.post("/tts")
def sintetizar(peticion: PeticionTTS):
    voz_path = os.path.join(VOZ_DIR, peticion.voz)

    if not os.path.exists(voz_path):
        raise HTTPException(status_code=404, detail=f"Voz no encontrada: {peticion.voz}")

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=VOZ_DIR) as tmp:
        tmp_path = tmp.name

    inicio = time.time()

    tts.tts_to_file(
        text=peticion.texto,
        speaker_wav=voz_path,
        language='es',
        file_path=tmp_path,
        temperature=0.7,
        repetition_penalty=5.0,
    )

    duracion = round(time.time() - inicio, 1)
    print(f"Fragmento generado en {duracion}s")

    return FileResponse(tmp_path, media_type="audio/mpeg", filename="fragmento.mp3")
```

Arrancar el servidor:
```cmd
pip install fastapi uvicorn
uvicorn server:app --host 0.0.0.0 --port 8001
```

IP local del sobremesa: `192.168.1.51`

---

#### 7. backend/tts/local.py en Kokito

```python
import httpx
import tempfile
import os
from database import SessionLocal, Conversion

MP3_DIR = "/tmp/kokito"
SERVIDOR_LOCAL = os.getenv("TTS_LOCAL_URL", "http://192.168.1.51:8001")

def process_file_with_local(self, pdf_bytes: bytes, filename: str) -> str:
    import pdfplumber
    from tts.text_utils import limpiar_texto
    from tts.edge import dividir_texto

    os.makedirs(MP3_DIR, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_pdf.write(pdf_bytes)
        tmp_pdf_path = tmp_pdf.name

    with pdfplumber.open(tmp_pdf_path) as file:
        text = ""
        paginas = file.pages
        total = len(paginas)
        for i, page in enumerate(paginas):
            text += page.extract_text()
            self.update_state(state="PROGRESS", meta={"pagina": i + 1, "total": total})

    if not text:
        raise ValueError("El PDF no contiene texto extraíble")

    text = limpiar_texto(text)
    fragmentos = dividir_texto(text)
    total_fragmentos = len(fragmentos)
    segmentos = []

    for i, fragmento in enumerate(fragmentos):
        porcentaje = 50 + int(((i + 1) / total_fragmentos) * 50)
        self.update_state(state="PROGRESS", meta={
            "pagina": total, "total": total,
            "porcentaje_override": porcentaje
        })

        response = httpx.post(
            f"{SERVIDOR_LOCAL}/tts",
            json={"texto": fragmento, "voz": "voz_elevenlabs_1.mp3"},
            timeout=300
        )
        response.raise_for_status()

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp:
            tmp.write(response.content)
            tmp.flush()
            segmentos.append(tmp.name)

    from pydub import AudioSegment
    audio_final = None
    for ruta in segmentos:
        segmento = AudioSegment.from_file(ruta, format="mp3")
        if audio_final is None:
            audio_final = segmento
        else:
            audio_final += segmento

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=MP3_DIR) as tmp_mp3:
        tmp_mp3_path = tmp_mp3.name

    audio_final.export(tmp_mp3_path, format="mp3")

    db = SessionLocal()
    conversion = Conversion(nombre=filename, caracteres=len(text), proveedor="local")
    db.add(conversion)
    db.commit()
    db.close()

    return tmp_mp3_path
```

Variable de entorno añadida al worker en `docker-compose.yml`:
```yaml
- TTS_LOCAL_URL=http://192.168.1.51:8001
```

---

#### 8. Arquitectura de comunicación decidida

```
Mini PC / Mac (Kokito worker)
  → extrae texto del PDF
  → limpia texto y trocea en fragmentos de ~500 palabras
  → POST /tts al sobremesa (síncrono, un fragmento a la vez)
  → recibe MP3 de cada fragmento
  → concatena todos los MP3 con pydub
  → sube resultado a R2 (futuro)
```

Los capítulos se gestionan en Kokito, no en el servidor TTS. El servidor solo recibe texto y devuelve audio.

---

### Errores encontrados

**`BeamSearchScorer` ImportError** — versión de `transformers` incompatible con TTS. Solución: `pip install transformers==4.37.2`.

**CUDA Toolkit 12.4 falla en instalación** — el driver 595.79 ya incluye CUDA 13.2 y entra en conflicto. Solución: no instalar CUDA Toolkit, PyTorch incluye su propia versión.

**Microsoft C++ Build Tools requerido** — necesario para compilar extensiones de TTS en Windows. Descargar de `https://visualstudio.microsoft.com/visual-cpp-build-tools/`.

**Error de concatenación MP3 en pydub** — los bytes recibidos del servidor Windows no son reconocidos correctamente por pydub/ffmpeg. Pendiente de depurar — se añadieron logs para inspeccionar content-type y primeros bytes de la respuesta.

---

### Notas

- El servidor del sobremesa carga el modelo XTTS v2 en VRAM al arrancar (~2-3 minutos) y luego permanece en memoria. No se recarga entre peticiones.
- Para añadir una voz nueva: copiar el MP3 de referencia a `C:\kokito-tts\` y pasarlo en el campo `voz` de la petición.
- El sobremesa no necesita estar encendido 24/7 — solo cuando se procesen libros nuevos. El mini PC sirve los libros ya procesados independientemente.

---

## Sesión 14 — Voz dinámica desde el frontend y mejoras de calidad TTS local

### Lo que hemos construido

- **Envío del archivo de voz desde el frontend** — el admin sube el MP3/WAV de referencia directamente desde el navegador sin tocar el sobremesa
- **Servidor del sobremesa actualizado** para recibir la voz como `multipart/form-data` en lugar de buscarla en disco
- **`limpiar_texto` mejorado** con mejor manejo de diálogos, letras capitulares y títulos de capítulo
- **`dividir_texto_local` reescrito** para cortar siempre en frases completas respetando puntuación
- **Logs con timestamp** en el servidor del sobremesa
- **Punto explícito al final de cada fragmento** para evitar vocalizaciones de cierre de XTTS

---

### Cambios por archivo

#### `C:\kokito-tts\server.py`
- Eliminado el modelo `PeticionTTS` y el endpoint antiguo
- Nuevo endpoint `/tts` recibe `texto: str = Form(...)` y `voz: UploadFile = File(...)`
- El archivo de voz se guarda en un temporal, se usa y se borra con `os.unlink`
- Logs con timestamp via función `log()` con `datetime.now().strftime('%H:%M:%S')`
- Instalado `python-multipart` en el entorno del sobremesa

#### `backend/tts/local.py`
- Firma actualizada: `process_file_with_local(self, pdf_bytes, filename, voz_bytes)`
- `httpx.post` cambiado de `json=` a `data=` + `files=` para enviar `multipart/form-data`
- Se añade `.` al final de cada fragmento antes de enviarlo para evitar artefactos de cierre de XTTS
- `dividir_texto_local` reescrito — corta por frases completas (`.`, `!`, `?`) agrupando hasta 200 caracteres, con segundo nivel de corte por comas para frases largas

#### `backend/tasks.py`
- `convertir_pdf` recibe nuevo parámetro `voz_bytes: bytes = b""`
- Se pasa a `process_file_with_local`

#### `backend/main.py`
- Endpoint `/convertir` recibe `voz: UploadFile = File(None)` como campo opcional
- Lee los bytes con `await voz.read() if voz else b""`

#### `frontend/src/App.jsx`
- Nuevo estado `vozArchivo`
- Input de archivo visible solo cuando `proveedor === "local"`
- El archivo se añade al `formData` antes del fetch

#### `backend/tts/text_utils.py` — mejoras en `limpiar_texto`
- Guiones de diálogo convertidos a coma para mantener fluidez (`—Cabría pensar —apuntó—` → `, Cabría pensar, apuntó,`)
- Letras capitulares separadas por salto de línea unidas a la palabra siguiente (`C\naía` → `Caía`)
- Títulos en mayúsculas con pausa via coma en lugar de `...` (evita vocalización "Mm" de XTTS)
- `?.` → `?` para evitar puntuación doble tras interrogaciones seguidas de título

---

### Problemas encontrados y resueltos

**`python-multipart` no instalado en el sobremesa** — el endpoint no podía procesar `multipart/form-data`. Solución: `pip install python-multipart` en el entorno del sobremesa.

**Código duplicado en `server.py`** — el endpoint nuevo se pegó encima del viejo sin borrar el original, y `app = FastAPI()` quedó después de los decoradores. Solución: reescribir el archivo completo en el orden correcto.

**`Cabría pensar` desaparecía del audio** — el regex `##DIALOGO##[^#\n]*##DIALOGO##` eliminaba el texto entre el primer y segundo guión de un diálogo con tres guiones. Solución: abandonar la detección de incisos y convertir todos los guiones en coma.

**Artefacto de cierre en XTTS** — palabras agudas al final de fragmento generaban una vocalización extra. Solución: añadir `.` explícito al final de cada fragmento antes de enviarlo.

**Fragmentos cortados a mitad de frase** — `dividir_texto_local` cortaba por número de palabras sin respetar puntuación. Solución: reescribir para cortar siempre en fin de frase.

---

### Notas

- La voz de referencia se envía en cada fragmento — el sobremesa no necesita tener ningún archivo en disco
- Para probar voces nuevas basta con seleccionar otro archivo desde el frontend sin tocar nada en el sobremesa
- Los artefactos de XTTS son impredecibles y dependen del contenido — se irán corrigiendo en `limpiar_texto` a medida que aparezcan casos nuevos en libros reales
- Pendiente: quitar el `print` de depuración de `local.py` antes de procesar libros completos

---

## Sesión 15 — Rediseño de BBDD, procesado por partes, autenticación y reproductor

### Lo que hemos construido

- **Esquema completo de BBDD** diseñado y razonado: 8 tablas nuevas
- **Alembic** configurado para migraciones versionadas
- **Primera migración** aplicada y verificada en DBeaver
- **Flujo nuevo de procesado**: PDF → hash → libros → partes → encadenamiento automático
- **Detección de duplicados** por hash del contenido
- **Autenticación completa**: registro, login, logout con cookies HttpOnly y JWT
- **Contexto de autenticación global** en React (`AuthContext.jsx`)
- **Routing por roles** con `react-router-dom`: admin → `/admin`, usuario → `/biblioteca`
- **Panel de admin**: subir PDFs, lista de libros con estado, publicar/despublicar
- **Biblioteca de usuarios** con navegación a detalle de libro
- **Reproductor por partes** con selección de parte y estado visual
- **Guardado de posición** cada 5 segundos, recuperado al volver al libro
- **Acceso desde iPhone** en red local via IP del Mac

---

### Regla permanente — Proveedor TTS

**Durante el desarrollo se usa siempre Edge TTS** (gratuito, rápido para pruebas).

**Todo el código debe ser agnóstico al proveedor.** Cualquier mejora, nueva funcionalidad o cambio debe funcionar exactamente igual con el TTS local del sobremesa (Coqui XTTS v2) sin modificar nada salvo el parámetro `proveedor`.

El módulo `tts/` ya está diseñado para esto — cada proveedor es un archivo independiente y `tasks.py` solo decide cuál usar. Mantener siempre esta separación.

Antes de dar algo por terminado, preguntarse: *¿esto funcionaría igual pasando `proveedor="local"`?*

**Nota pendiente:** la función `limpiar_texto` funciona muy bien para TTS local (Coqui), pero para Edge TTS limpia demasiado — Edge no respeta tan bien las pausas y la puntuación como Coqui. En el futuro habrá que tener dos versiones del preprocesado o parametrizarlo por proveedor.

---

### Pasos realizados

#### 1. Esquema de BBDD

Tablas diseñadas y creadas:
```
libros              → titulo, autor, hash_contenido, num_paginas, paginas_por_parte, visible
partes              → libro_id, numero_parte, pagina_inicio, pagina_fin, estado, ruta_mp3, duracion_segundos
usuarios            → email, nombre, password_hash, rol (admin | usuario)
progreso_usuario    → usuario_id, libro_id, parte_id, segundo_actual
estado_parte_usuario → usuario_id, parte_id, estado (pendiente | en_progreso | escuchada)
lista_deseos        → usuario_id, libro_id
solicitudes         → usuario_id, titulo_solicitado, autor, notas, estado
conversiones        → mantenida para historial existente
```

**Conceptos clave:**
- `hash_contenido` — `hashlib.sha256(pdf_bytes).hexdigest()`. Detecta libros duplicados independientemente del nombre
- `visible` — el admin puede procesar un libro sin que los usuarios lo vean hasta publicarlo
- `duracion_segundos` en partes — necesario para que el reproductor muestre la barra de progreso
- `progreso_usuario` y `estado_parte_usuario` son tablas separadas — una para posición actual, otra para historial

#### 2. Alembic
```bash
pip install alembic
alembic init migrations
alembic revision --autogenerate -m "descripcion"  # Genera script de migración
alembic upgrade head                               # Aplica todas las migraciones pendientes
alembic downgrade -1                               # Deshace la última migración
```

Configuración en `alembic.ini`:
```
sqlalchemy.url = postgresql://kokito:kokito@localhost:5432/kokito
```

Configuración en `migrations/env.py`:
```python
from database import Base
target_metadata = Base.metadata
```

**Problema encontrado — tipos ENUM huérfanos:** al borrar tablas manualmente, los tipos ENUM de PostgreSQL no se borran. Solución:
```sql
DROP TYPE IF EXISTS rolusuario CASCADE;
DROP TYPE IF EXISTS estadoparte CASCADE;
DROP TYPE IF EXISTS estadopartusuario CASCADE;
DROP TYPE IF EXISTS estadosolicitud CASCADE;
```

#### 3. Flujo nuevo de procesado

`main.py` — función `analizar_y_registrar_libro`:
- Calcula hash del PDF con `hashlib.sha256`
- Si el libro ya existe por hash → devuelve el existente con `es_nuevo: False`
- Si es nuevo → crea registro en `libros`, divide en partes y crea registros en `partes`
- Encola solo la primera parte

`tasks.py` — worker actualizado:
- Recibe `parte_id` en lugar de procesar el PDF entero
- Consulta `pagina_inicio` y `pagina_fin` de la parte en BBDD
- Al terminar encola automáticamente la siguiente parte pendiente del mismo libro
- Marca la parte como `error` si falla y relanza la excepción

`tts/edge.py` y `tts/google.py` — firma actualizada:
```python
def process_file_with_edge(self, pdf_bytes, filename, pagina_inicio=0, pagina_fin=None)
```

**`db.flush()`** — escribe cambios en la transacción sin hacer commit. Necesario para obtener el `libro.id` antes de crear las partes.

#### 4. Autenticación

Librerías:
```bash
pip install "passlib[bcrypt]" "python-jose[cryptography]"
```

**Problema de compatibilidad:** fijar `bcrypt==4.0.1` en `requirements.txt`.

`backend/auth.py`:
- `hashear_password` / `verificar_password` — bcrypt via passlib
- `crear_token` — JWT con `usuario_id`, `rol` y expiración 30 días
- `obtener_usuario_actual` — lee cookie `kokito_token`, decodifica JWT
- `requerir_admin` — verifica rol admin

Endpoints:
- `POST /registro` — crea usuario con contraseña hasheada
- `POST /login` — verifica credenciales, escribe cookie HttpOnly
- `POST /logout` — borra la cookie
- `GET /me` — devuelve usuario actual via `Depends(obtener_usuario_actual)`

Cookie: `httponly=True`, `samesite="none"`, `secure=False`, `max_age=30 días`

CORS: `allow_credentials=True` y orígenes `localhost:5173` + IP local del Mac.

`SECRET_KEY` en `backend/.env`, cargada en Docker via `env_file` en `docker-compose.yml`.

#### 5. Frontend — routing y autenticación

`frontend/src/config.js`:
```js
const API = import.meta.env.VITE_API_URL || "http://localhost:8000"
export default API
```

`frontend/.env.local`:
```
VITE_API_URL=http://192.168.1.94:8000
```

`vite.config.js` — para acceso desde red local:
```js
server: { host: '0.0.0.0', port: 5173 }
```

`AuthContext.jsx` — contexto global con `usuario`, `login()`, `logout()`. Todas las peticiones usan `credentials: "include"`.

`App.jsx` — routing con `react-router-dom`:
- `/login` — página de login
- `/admin/*` — panel de admin (requiere rol admin)
- `/biblioteca` — biblioteca usuarios
- `/libro/:id` — detalle libro con reproductor

Componentes guardianes: `<RutaProtegida>` y `<RutaAdmin>`.

#### 6. Panel de admin

Componentes:
- `SubirPDF.jsx` — formulario completo: título, autor, páginas por parte, proveedor, voz de referencia, botón de procesar
- `ListaLibros.jsx` — lista de libros con botón publicar/despublicar y borrar

Endpoints nuevos:
- `GET /libros` — lista todos los libros (admin)
- `DELETE /libros/{id}` — borra libro y sus partes
- `PATCH /libros/{id}/visible` — cambia visibilidad
- `GET /libros/publicos` — lista libros visibles (usuarios)
- `GET /libros/{id}` — detalle de libro con partes
- `GET /partes/{id}/audio` — sirve el MP3 de una parte

#### 7. Navegación admin/usuario

El admin puede ver la biblioteca como usuario normal. Implementado con `navigate("/biblioteca", { state: { modoAdmin: true }, replace: true })` para no acumular historial. La barra azul de "Viendo como usuario" se muestra en `BibliotecaPage` y `LibroPage` cuando `modoAdmin` es `true`. El botón vuelve siempre a `/admin` con `replace: true`.

#### 8. Reproductor y guardado de posición

`LibroPage.jsx`:
- Carga libro y progreso en paralelo con `Promise.all`
- Si hay progreso guardado, selecciona la parte correspondiente y posiciona el audio con `onLoadedMetadata`
- Guarda posición cada 5 segundos via `setInterval` solo si el audio está reproduciéndose
- Lista de partes con estado visual: listo / procesando / pendiente / error

Endpoints:
- `POST /progreso` — guarda parte_id y segundo_actual del usuario
- `GET /progreso/{libro_id}` — recupera última posición del usuario

---

### Cuándo hace falta `docker compose up --build`

- **Nunca** para cambios en `.jsx` — Vite recarga automáticamente
- **Nunca** para cambios en `.py` — uvicorn con `--reload` detecta los cambios
- **Siempre** cuando se instala una librería nueva (`requirements.txt` o `package.json`)
- **Siempre** cuando se modifica el `Dockerfile`

---

### Próximos pasos

- Sistema de solicitudes de libros para usuarios
- Mejora estética general (pasada completa de diseño)
- Deploy en el mini PC (Ubuntu Server, Docker, acceso desde red local)
- Marcar partes como escuchadas (`estado_parte_usuario`)
- Lista de deseos
- Notificaciones por email: al admin cuando llega una solicitud, a los usuarios cuando se publica un libro que han solicitado (Gmail + smtplib, credenciales en `.env`)

---

## Sesión 16 — Rediseño visual completo

### Decisiones de diseño tomadas

**Paleta — inspirada en Coco (la gata)**
Variables definidas en `frontend/src/theme.css`:
- `--cr-bg`           #FAF6F0 — fondo principal crema
- `--cr-surface`      #F2EBE0 — superficies secundarias
- `--cr-warm`         #E8D9C4 — bordes y separadores
- `--cr-tan`          #C4A882 — tostado medio
- `--cr-brown`        #8B6B4A — acento principal (botones)
- `--cr-dark`         #3D2B1A — texto principal
- `--cr-muted`        #9C8470 — texto secundario
- `--cr-green`        #4A6E4C — enlaces y foco (ojos de Coco)
- `--cr-green-lt`     #6B9E6E — verde claro
- `--cr-border`       rgba(139,107,74,0.18)
- `--cr-border-focus` #6B9E6E

**Estética general**
- Fondo crema claro, texto oscuro — modo claro únicamente por ahora
- Sin Coco como ilustración por ahora (posible logo/icono en el futuro)
- Tipografía limpia, pesos 400 y 500 únicamente
- Cada página tiene su propio `.css` con clases prefijadas (lp-, bib-, libro-, adm-)
- Responsive desde el principio: móvil y escritorio

**Sistema de estilos**
- `theme.css` — variables globales, importado en `main.jsx`
- Tailwind sigue activo para el resto de componentes no rediseñados

---

### Archivos creados o modificados

**Frontend:**
- `frontend/src/theme.css` — nuevo, paleta global
- `frontend/src/LoginPage.jsx` + `LoginPage.css` — reescritos
- `frontend/src/pages/BibliotecaPage.jsx` + `BibliotecaPage.css` — reescritos
- `frontend/src/pages/LibroPage.jsx` + `LibroPage.css` — reescritos
- `frontend/src/pages/admin/AdminPage.jsx` + `AdminPage.css` — reescritos
- `frontend/src/pages/admin/SubirPDF.jsx` + `SubirPDF.css` — reescritos
- `frontend/src/pages/admin/ListaLibros.jsx` + `ListaLibros.css` — reescritos

**Backend:**
- `backend/main.py` — múltiples endpoints actualizados y añadidos
- `backend/database.py` — modelos `ProgresoParte` añadido
- `backend/migrations/env.py` — corregido para usar `DATABASE_URL` del entorno
- `backend/auth.py` — añadida función `obtener_usuario_opcional`

**Migraciones Alembic aplicadas:**
- `portada_url en libros`
- `progreso por parte`

---

### Login (completo)
- Franja superior fija con nombre "kokito" y tagline
- Panel izquierdo (solo escritorio): claim poético + 3 features
- Formulario centrado en el panel derecho
- En móvil: panel izquierdo desaparece, solo formulario
- Claim: "Escucha lo que quieras leer."
- Subtítulo: biblioteca curada, pedir título, escuchar cuando esté listo
- Features: pedir libro / escuchar por capítulos / progreso guardado

---

### Biblioteca de usuarios (completa)
- Franja superior con nombre de app y saludo al usuario
- Vista cuadrícula y lista — el usuario elige, preferencia guardada en `localStorage`
- Portadas con fallback a placeholder elegante
- Badges de estado por libro: Nuevo / En progreso / Completado
- Barra de progreso en vista lista para libros en progreso
- Espacio reservado para filtros y búsqueda futuros
- Columna `portada_url` añadida a la tabla `libros`

**Nota de producto:** la biblioteca actual es la general (todos los libros disponibles).
En el futuro existirá una "Mi biblioteca" personal por usuario con listas propias
(pendientes, escuchados, por mes, etc.). Se diseñará cuando se implemente esa funcionalidad.

---

### Detalle del libro y reproductor (completo)
- Columna izquierda fija: portada, título, autor, stats, barra de progreso del libro
- En móvil: columna izquierda se convierte en franja horizontal arriba
- Reproductor completamente custom (sin controles nativos del navegador):
  - Scrubber clickeable con thumb
  - Botones ±15 segundos
  - Botón play/pausa
- Lista de partes con estados visuales:
  Reproduciendo / Escuchada / Listo / Procesando / Pendiente / Error
- Progreso guardado automáticamente cada 5s, al pausar, al cambiar de parte y al terminar
- Partes marcadas como escuchadas en BBDD (`estado_parte_usuario`) al terminar reproducción
- Barra de progreso del libro calculada sobre partes escuchadas (no sobre partes listas)

---

### Progreso por parte (nuevo modelo)
**Motivación:** guardar un único punto de progreso por libro hacía que al volver
a una parte anterior se perdiera la posición en la parte posterior.

**Solución:** tabla `progreso_parte` — un registro por `(usuario, parte)`.

- Cada parte tiene su propio segundo guardado independientemente
- Al seleccionar una parte se restaura automáticamente el segundo donde se dejó
- Al cambiar de parte se guarda el segundo actual antes de cambiar
- Endpoints nuevos:
  - `POST /progreso/parte` — guarda segundo de una parte concreta
  - `GET /progreso/libro/{libro_id}` — devuelve progreso de todas las partes + última parte activa
- Los endpoints antiguos `POST /progreso` y `GET /progreso/{libro_id}` se mantienen
  por compatibilidad pero ya no se usan en `LibroPage`

---

### Panel de administración (completo)
- Franja superior con badge "administración" y botón "Ver como usuario"
- Dos secciones: formulario de nuevo libro + lista de libros del sistema
- Misma paleta y estética que el resto de la app

**Formulario de nuevo libro:**
- Campos: título, autor, páginas por parte
- Selector de motor TTS: Edge TTS y Coqui (IA local) — Google TTS eliminado
- Al seleccionar Coqui aparece sección con:
  - Tres voces predefinidas en tarjetas (nombre + descripción + botón escuchar)
  - Opción de subir archivo de voz personalizado (MP3/WAV)
  - Si hay archivo subido, tiene prioridad sobre la voz predefinida
- Zona de drop para el PDF con estado visual (borde verde si hay archivo)
- Estados de procesamiento: spinner con barra de progreso → confirmación de éxito

**Lista de libros:**
- Portada pequeña (o placeholder), título, autor, páginas
- Puntitos de colores por parte: verde (listo) / ámbar (procesando) / crema (pendiente)
- Badge: Publicado / Sin publicar
- Botón publicar/despublicar
- Botón borrar con confirmación

---

### Fixes y correcciones aplicados esta sesión
- Orden de rutas en FastAPI: `/libros/publicos` antes de `/libros/{libro_id}`
- `/progreso/libro/{libro_id}` antes de `/progreso/{libro_id}`
- `guardarProgreso` y `marcarParteEscuchada` movidas dentro del componente React
- `obtener_usuario_opcional` en `auth.py` — permite endpoints sin auth obligatoria
- `Request` importado en `main.py`
- `ProgresoParte` importado en `main.py`
- Alembic corregido para usar `DATABASE_URL` del contenedor (no `localhost`)
- Cookie de sesión: usar siempre `localhost:8000` en desarrollo desde el Mac
- Reset de `tiempoActual` y `duracion` al cambiar de parte (evitaba posición errónea)
- `porcentajeLibro()` cuenta partes `escuchada` en lugar de partes `listo`

---

### Notas de desarrollo
- En `frontend/.env.local` usar `localhost:8000` para desarrollo en Mac.
  Cambiar a IP local (`192.168.1.94:8000`) solo para probar desde iPhone.
- Las voces predefinidas de Coqui son archivos en `C:\kokito-tts\` del sobremesa.
  El botón de escuchar preview llama a `GET /voces/{id}` — pendiente de implementar
  en el servidor del sobremesa (puerto 8001).

---

### Pendiente para próximas sesiones

**Voces predefinidas de Coqui (backend sobremesa):**
- Añadir endpoint `GET /voces` al servidor del sobremesa → lista de voces disponibles
- Añadir endpoint `GET /voces/{nombre}` → sirve el archivo MP3 de referencia para preview
- En Kokito: nuevo endpoint `GET /voces` que proxea al sobremesa

**Metadatos de libros:**
- Añadir columnas a `libros`: `sinopsis`, `genero`, `serie`, `editorial`, `isbn`
- Generar migración Alembic (aunque no se use en UI todavía)
- En el futuro: integración con Google Books API para autocompletar al subir un libro
  (aplica también al formulario de solicitudes de usuarios)

**Puntitos de estado en ListaLibros:**
- Ahora todos los puntitos aparecen en verde porque el endpoint `/libros`
  solo devuelve el conteo de partes, no su estado individual
- Para mostrar estados reales: hacer que el endpoint devuelva
  la lista de partes con su estado, o añadir un campo `partes_por_estado`

**Próxima pantalla a rediseñar:**
- No quedan pantallas de usuario pendientes de rediseño
- Siguiente funcionalidad nueva: sistema de solicitudes de libros para usuarios

**Otras cosas a tener en cuenta:**
- Revisar cómo se están almacenando los archivos físicos en el contenedor, por ver si se puede optimizar. 
- Revisar si se están borrando los archivos cuando se elimina el libro.
- Revisar por qué no se puede eliminar actualmente un libro desde la vista de administración
- Hay que implementar alguna manera de opder cortar la prueba de audio que hay cuando se selecciona el local
- En cuanto a sesiones, cómo funciona? Si yo pongo a convertir un libro que va a tardar horas, y al rato vuelvo a entrar con la cuenta de admin (que es con la que lo lancé), seguiré viendo el progreso? Debería verlo en todo momento, e incluso debería poder cortarlo

---

## Sesión 17 — Mejoras de administración, metadatos y búsqueda de libros

### Lo que hemos construido

- **Persistencia de sesión** — fix del problema de cookie al acceder desde IP local
- **Proxy de Vite** — el frontend llama a `/api` en lugar de a una URL absoluta, funciona igual desde cualquier dispositivo de la red
- **Play/pausa de voces** en el selector de Coqui con cambio de icono
- **Sistema de progreso persistente** — el admin ve el estado del procesamiento aunque recargue o cambie de pantalla
- **Progreso en la lista de libros** — barra de progreso por libro directamente en `ListaLibros`, con polling propio
- **Panel de admin simplificado** — el formulario siempre visible, el progreso vive en la lista
- **Cancelación de libros** — botón para cancelar y borrar un libro completo durante el procesamiento
- **Fix de borrado con claves foráneas** — función `_borrar_libro_completo` que borra en el orden correcto (`estado_parte_usuario` → `progreso_parte` → `progreso_usuario` → `partes` → `libro`)
- **Un libro por motor** — Edge TTS y Coqui pueden procesar en paralelo; el botón se bloquea solo para el motor ocupado
- **Metadatos de libros** — nuevas columnas en BBDD: `sinopsis`, `serie`, `anio`, `genero`, `editorial`, `isbn`
- **Portadas** — subida manual de imagen, almacenamiento en disco local (`/app/portadas`), endpoint para servirlas
- **Búsqueda con Open Library** — autocompletado de título, autor, año, editorial, ISBN, sinopsis y portada al buscar un libro
- **Mapeo de géneros** — los subjects de Open Library se mapean automáticamente a los géneros predefinidos
- **Género como desplegable** — lista predefinida de géneros en lugar de campo libre

---

### Cambios por archivo

#### `vite.config.js`
- Añadido proxy `/api` → `http://localhost:8000`
- `host: '0.0.0.0'` para acceso desde red local

#### `frontend/src/config.js`
- `API = "/api"` en lugar de URL absoluta

#### `backend/database.py`
- Nuevas columnas en `Libro`: `sinopsis`, `serie`, `anio`, `genero`, `editorial`, `isbn`

#### `backend/main.py`
- `_borrar_libro_completo` — función auxiliar que borra en orden correcto respetando FK
- Endpoint `/portadas` (POST) — recibe imagen y la guarda en `/app/portadas`
- Endpoint `/portadas/{nombre}` (GET) — sirve imágenes de portada
- Endpoint `/admin/procesando` — devuelve un proceso por proveedor (`edge`, `local`)
- Endpoint `/admin/cancelar/{libro_id}` — revoca tareas Celery y borra todo
- Endpoint `/libros/{libro_id}/progreso` — estado y porcentaje de cada parte
- Endpoint `/libros` — ahora devuelve lista de partes con estado en lugar de conteo
- `response_model=None` en todos los endpoints con `Depends(requerir_admin)`
- `portada_url`, `sinopsis`, `serie`, `anio`, `genero`, `editorial`, `isbn` en `/convertir`

#### `backend/tasks.py`
- `parte.proveedor` se guarda al inicio del procesamiento (no solo al terminar)
- `nueva_tarea.tarea_id` se guarda al encolar la siguiente parte

#### `backend/auth.py`
- `requerir_admin` usa `Depends(obtener_usuario_actual)` sin anotación de tipo `-> Usuario`

#### `docker-compose.yml`
- Volumen `portadas_data` montado en `/app/portadas` en el servicio `backend`

#### `frontend/src/pages/admin/SubirPDF.jsx`
- Buscador de Open Library con autocompletado
- Mapeo automático de subjects a géneros predefinidos (`MAPEO_GENEROS`)
- Selector de portada con preview, subida manual y opción de quitar
- Género como `<select>` con lista predefinida (`GENEROS`)
- Campos nuevos: serie, año, género, editorial, ISBN, sinopsis
- Motor bloqueado si está procesando — polling cada 5 segundos con `useRef`

#### `frontend/src/pages/admin/ListaLibros.jsx`
- Polling propio cada 3 segundos mientras hay libros procesando
- Barra de progreso por fila cuando el libro está en estado `procesando`
- Puntitos de color real por estado de cada parte
- Botón publicar deshabilitado si el libro no está completamente listo
- Badge "Procesando" cuando hay partes en curso

#### `frontend/src/pages/admin/AdminPage.jsx`
- Eliminado el panel de progreso — simplificado a su versión original

---

### Migraciones Alembic aplicadas

- `tarea_id en partes`
- `metadatos libro` — sinopsis, serie, anio, genero, editorial, isbn

---

### Pendiente para próximas sesiones

- **Google Books API** — mejor cobertura que Open Library para libros en español, devuelve títulos traducidos, requiere API key gratuita en Google Cloud (ya tienes cuenta)
- **Botón de cancelar** en la fila del libro en `ListaLibros` (actualmente solo existe via `/admin/cancelar`)
- **Sistema de solicitudes** — formulario para que usuarios pidan libros, panel de admin para gestionarlas
- **Marcar partes como escuchadas** desde `LibroPage`
- **Lista de deseos** para usuarios
- **Deploy en el mini PC** — Ubuntu Server, Docker, acceso desde red local

---

## Sesión 18 — Deploy en el mini PC

### Lo que hemos construido

- **Ubuntu Server 24.04 LTS** instalado en el mini PC
- **Red configurada** con Netplan — interfaz `eno1` con DHCP permanente
- **Docker 28.2.2** y **Docker Compose 1.29.2** instalados y configurados
- **Usuario `wander` añadido al grupo docker** — no requiere `sudo` para comandos Docker
- **Estructura de carpetas `~/apps/`** para alojar múltiples proyectos en el futuro
- **Repositorio clonado** en `~/apps/kokito` via SSH con clave dedicada para GitHub
- **Servicio systemd `kokito`** — los contenedores arrancan automáticamente al encender el mini PC
- **Migraciones Alembic aplicadas** — todas las tablas creadas en PostgreSQL
- **nginx** instalado para servir el frontend como build estática
- **Frontend construido** con `npm run build` y servido desde `/home/wander/apps/kokito/frontend/dist`
- **Dominio `wanderingcode.dev`** registrado en Cloudflare
- **Cloudflare Tunnel `kokito`** configurado — acceso externo sin abrir puertos en el router
- **`kokito.wanderingcode.dev`** accesible desde cualquier parte del mundo con HTTPS automático
- **Servicio `cloudflared`** instalado como systemd — el tunnel arranca automáticamente

---

### Arquitectura resultante

```
Internet → Cloudflare Tunnel → nginx (puerto 80) → frontend (dist/)
                                                  → /api/* → FastAPI (puerto 8000)
                                                           → Celery worker
                                                           → PostgreSQL
                                                           → Redis
```

---

### Comandos útiles en el mini PC

```bash
# Conectarse por SSH desde el Mac
ssh wander@192.168.1.106

# Ver estado de los servicios
sudo systemctl status kokito
sudo systemctl status cloudflared
sudo systemctl status nginx

# Ver logs de los contenedores
cd ~/apps/kokito
docker-compose logs --tail=50 backend
docker-compose logs --tail=50 worker

# Actualizar Kokito tras un git push
cd ~/apps/kokito
git pull
docker-compose up --build -d

# Reiniciar servicios
sudo systemctl restart kokito
sudo systemctl restart cloudflared
sudo systemctl restart nginx
```

---

### Pasos realizados

#### 1. Instalación de Ubuntu Server

- Instalado Ubuntu Server 24.04 LTS desde USB
- Durante la instalación se configuró OpenSSH Server para acceso remoto
- Usuario creado: `wander`, nombre del servidor: `miniserver`
- Particionado automático en SSD Kingston de 111.79G con LVM

#### 2. Configuración de red

El adaptador wifi interno no fue detectado por el kernel — se usa cable ethernet.
La interfaz `eno1` no obtenía IP automáticamente al arrancar. Se creó el archivo de configuración Netplan desde cero:

```bash
sudo nano /etc/netplan/00-network.yaml
```

```yaml
network:
  version: 2
  ethernets:
    eno1:
      dhcp4: true
```

```bash
sudo netplan apply
```

#### 3. Conexión SSH desde el Mac

```bash
ssh wander@192.168.1.106
```

A partir de aquí todo se gestiona remotamente desde el Mac.

#### 4. Actualización del sistema

```bash
sudo apt update && sudo apt upgrade -y
```

#### 5. Instalación de Docker

```bash
sudo apt install -y docker.io
sudo apt install -y docker-compose
sudo usermod -aG docker wander
sudo systemctl enable docker
```

Versiones instaladas: Docker 28.2.2, Docker Compose 1.29.2.

#### 6. Clave SSH para GitHub

```bash
ssh-keygen -t ed25519 -C "miniserver-kokito" -f ~/.ssh/ssh-key-github
```

Clave pública añadida en GitHub → Settings → SSH and GPG keys con título `miniserver`.

Configuración en `~/.ssh/config`:
```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/ssh-key-github
```

#### 7. Estructura de carpetas y clonado del repositorio

```bash
mkdir ~/apps
cd ~/apps
git clone git@github.com:wandering-code/kokito.git
```

#### 8. Archivo .env

```bash
nano ~/apps/kokito/backend/.env
```

Contiene únicamente `SECRET_KEY`.

#### 9. Ajuste de docker-compose.yml

Se eliminaron las referencias a las credenciales de Google Cloud del servicio `worker` ya que en el mini PC solo se usa Edge TTS y TTS local.

#### 10. Primer arranque de Docker

```bash
cd ~/apps/kokito
docker-compose up --build
```

#### 11. Servicio systemd para arranque automático

```bash
sudo tee /etc/systemd/system/kokito.service << 'EOF'
[Unit]
Description=Kokito
Requires=docker.service
After=docker.service

[Service]
WorkingDirectory=/home/wander/apps/kokito
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
User=wander

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable kokito
sudo systemctl start kokito
```

#### 12. Migraciones de base de datos

```bash
sudo docker-compose exec backend alembic upgrade head
```

#### 13. Instalación de Node.js y build del frontend

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
cd ~/apps/kokito/frontend
npm install
npm run build
```

#### 14. nginx para servir el frontend

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/kokito
```

```nginx
server {
    listen 80;

    location / {
        root /home/wander/apps/kokito/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kokito /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

**Problema de permisos:** nginx corre con el usuario `www-data` y no podía leer la carpeta home. Solución:

```bash
sudo chmod o+x /home/wander
sudo chmod -R o+r /home/wander/apps/kokito/frontend/dist
```

#### 15. Dominio y Cloudflare Tunnel

Dominio registrado: `wanderingcode.dev` en Cloudflare Registrar.

```bash
# Instalar cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Autenticarse
cloudflared tunnel login

# Crear tunnel
cloudflared tunnel create kokito

# Configurar
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

```yaml
tunnel: a586f040-3ef9-4e54-93fb-6fa68aeca374
credentials-file: /etc/cloudflared/a586f040-3ef9-4e54-93fb-6fa68aeca374.json

ingress:
  - hostname: kokito.wanderingcode.dev
    service: http://localhost:80
  - service: http_status:404
```

```bash
# Crear registro DNS
cloudflared tunnel route dns kokito kokito.wanderingcode.dev

# Instalar como servicio
sudo cloudflared service install
sudo systemctl start cloudflared
```

---

### Errores encontrados

**`dhclient` no encontrado** — Ubuntu Server moderno no incluye `dhclient`. Se resolvió creando el archivo Netplan manualmente.

**Error 500 en nginx** — permisos insuficientes para que `www-data` accediera a la carpeta home. Solución: `chmod o+x /home/wander` y `chmod -R o+r` sobre la carpeta `dist`.

**`cloudflared service install` no encontraba config.yml** — el archivo estaba en `~/.cloudflared/` pero el servicio busca en `/etc/cloudflared/`. Solución: copiar config y credenciales a `/etc/cloudflared/` y actualizar la ruta en el config.

**Tabla `usuarios` no existe** — la base de datos arrancó vacía. Solución: ejecutar `alembic upgrade head` dentro del contenedor backend.

**Archivos de voz no disponibles** — las voces predefinidas no estaban en el repositorio. Solución: copiar desde el Mac con `scp` y ajustar permisos de la carpeta `voces` (era propiedad de `root` por haberla creado Docker).

---

### Pendiente

- **WiFi** — el adaptador wifi interno no fue detectado. De momento funciona con cable ethernet. Investigar driver en el futuro.
- **IP fija local** — la IP `192.168.1.106` se asigna por DHCP y podría cambiar. Configurar IP fija en Netplan o reservar la IP en el router.
- **Script de actualización** — automatizar `git pull` + `docker-compose up --build` para desplegar nuevas versiones cómodamente.
- **Subdominios futuros** — para nuevas apps añadir entrada en `/etc/cloudflared/config.yml` y ejecutar `cloudflared tunnel route dns kokito nuevaapp.wanderingcode.dev`.