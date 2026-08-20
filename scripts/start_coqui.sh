#!/bin/bash
# Conecta al sobremesa por SSH y arranca el servidor TTS local Coqui/XTTS v2
# (C:\kokito-tts, puerto 8001). El motor NO arranca solo al iniciar el
# sobremesa (kokito-tts.vbs está deshabilitado en la carpeta de Inicio de
# Windows) -- este script es la forma de levantarlo a demanda.
set -e

HOST="sobremesa"
URL="http://192.168.1.51:8001/health"

if curl -s -m 3 "$URL" >/dev/null 2>&1; then
    echo "Coqui ya está activo en $URL"
    curl -s -m 3 "$URL"; echo
    exit 0
fi

echo "Arrancando Coqui en el sobremesa..."
ssh "$HOST" 'powershell -NoProfile -Command "[void](New-Object -ComObject WScript.Shell).Run('"'"'C:\kokito-tts\arrancar_startup.bat'"'"', 0, $false)"'

echo "Esperando a que cargue el modelo..."
for i in $(seq 1 40); do
    sleep 3
    if curl -s -m 3 "$URL" >/dev/null 2>&1; then
        echo "Coqui activo:"
        curl -s -m 3 "$URL"; echo
        exit 0
    fi
done

echo "Coqui no respondió tras 2 minutos. Revisa C:\kokito-tts\logs\server.log en el sobremesa." >&2
exit 1
