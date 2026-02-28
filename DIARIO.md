# Diario de desarrollo — Kokito

## Sesión 1 — Entorno y prototipo local

### Lo que hemos construido

- Python 3.11.9 gestionado correctamente con **pyenv**
- Repositorio `kokito` en GitHub conectado por **SSH**
- **Entorno virtual** configurado en la carpeta del proyecto
- **Prototipo funcional**: PDF → texto → MP3 en ~20 líneas de Python

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
        TEXT = page.extract_text()
        print(page.extract_text())

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

---

### Próximos pasos (Fase 1 pendiente)

- Preprocesar el texto extraído del PDF para eliminar saltos de línea innecesarios y mejorar la entonación del TTS
- Introducción a Docker: qué es un contenedor y por qué lo usaremos

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
