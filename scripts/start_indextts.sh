#!/bin/bash
# Conecta al sobremesa por SSH y arranca el servidor TTS IndexTTS-2.5
# (D:\Proyectos\index_tts, puerto 8005). El servidor no arranca solo al
# iniciar el sobremesa -- este script es la forma de levantarlo a demanda.
#
# Se lanza vía el Programador de tareas de Windows (schtasks), no con
# WScript.Shell.Run: se comprobó que un proceso lanzado async desde una
# sesión SSH de Windows muere en cuanto esa sesión SSH se cierra (el
# proceso queda atado al Job Object de la sesión) -- schtasks lo desata
# de verdad.
set -e

HOST="sobremesa"
URL="http://192.168.1.51:8005/health"
TASK="KokitoIndexTTS"
BAT="D:\\Proyectos\\index_tts\\arrancar.bat"

if curl -s -m 3 "$URL" >/dev/null 2>&1; then
    echo "IndexTTS-2.5 ya está activo en $URL"
    curl -s -m 3 "$URL"; echo
    exit 0
fi

echo "Arrancando IndexTTS-2.5 en el sobremesa..."
# /End + matar procesos sueltos por si la tarea quedó "En ejecución" de una
# caída anterior (el servidor murió pero el wrapper cmd.exe se quedó
# colgado en el "pause" final) -- si no se limpia, el Programador de tareas
# se niega a lanzar una instancia nueva y este script se queda esperando
# los 2 minutos enteros sin arrancar nada. Todo con "|| true"/"2>nul" porque
# es esperable que no haya nada que limpiar en un arranque desde cero.
ssh "$HOST" "schtasks /End /TN $TASK 2>nul & powershell -NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*uvicorn*server:app*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }\" & exit /b 0" || true
ssh "$HOST" "schtasks /Create /F /TN $TASK /TR $BAT /SC ONCE /ST 23:59 >nul && schtasks /Run /TN $TASK"

echo "Esperando a que cargue el modelo (IndexTTS-2.5 + Whisper)..."
for i in $(seq 1 40); do
    sleep 3
    if curl -s -m 3 "$URL" >/dev/null 2>&1; then
        echo "IndexTTS-2.5 activo:"
        curl -s -m 3 "$URL"; echo
        exit 0
    fi
done

echo "IndexTTS-2.5 no respondió tras 2 minutos. Revisa D:\Proyectos\index_tts\logs\server.log en el sobremesa (GET /logs una vez arriba, o admin/logs/indextts en Kokito)." >&2
exit 1
