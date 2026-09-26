#!/bin/bash
# Conecta al sobremesa por SSH y arranca el servidor TTS Higgs Audio v3
# (D:\Proyectos\otros\higgs, puerto 8006). Mismo mecanismo que
# start_indextts.sh: tarea del Programador de tareas de Windows, porque un
# proceso lanzado desde una sesión SSH muere al cerrarse la sesión.
#
# Higgs e IndexTTS no caben a la vez en la 3070 (8 GB). Este script mata
# cualquier "uvicorn server:app" que haya (IndexTTS incluido), igual que
# start_indextts.sh mata Higgs al arrancar IndexTTS.
set -e

HOST="sobremesa"
URL="http://192.168.1.51:8006/health"
TASK="KokitoHiggs"
BAT="D:\\Proyectos\\otros\\higgs\\arrancar.bat"

if curl -s -m 3 "$URL" >/dev/null 2>&1; then
    echo "Higgs Audio v3 ya está activo en $URL"
    curl -s -m 3 "$URL"; echo
    exit 0
fi

echo "Arrancando Higgs Audio v3 en el sobremesa..."
ssh "$HOST" "schtasks /End /TN $TASK 2>nul & schtasks /End /TN KokitoIndexTTS 2>nul & powershell -NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*uvicorn*server:app*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }\" & exit /b 0" || true
ssh "$HOST" "schtasks /Create /F /TN $TASK /TR $BAT /SC ONCE /ST 23:59 >nul && schtasks /Run /TN $TASK"

# Carga en bf16 en CPU, cuantiza a int8, sube a GPU y compila los CUDA graphs:
# ~70 s con la caché de torch.compile caliente, 2-4 min la primera vez.
echo "Esperando a que cargue y compile el modelo (Higgs + Whisper)..."
for i in $(seq 1 100); do
    sleep 3
    if curl -s -m 3 "$URL" >/dev/null 2>&1; then
        echo "Higgs Audio v3 activo:"
        curl -s -m 3 "$URL"; echo
        exit 0
    fi
done

echo "Higgs no respondió tras 5 minutos. Revisa D:\Proyectos\otros\higgs\logs\server.log en el sobremesa (GET /logs una vez arriba, o admin/logs/higgs en Kokito)." >&2
exit 1
