#!/bin/bash
set -e

echo "📦 Actualizando código..."
git pull

echo "🐳 Bajando contenedores..."
docker-compose down

echo "🐳 Construyendo y levantando contenedores..."
docker-compose up --build -d

echo "🗄️ Aplicando migraciones..."
docker-compose exec backend alembic upgrade head

echo "⚛️ Construyendo frontend..."
cd frontend
npm install
npm run build
cd ..

echo "🔒 Ajustando permisos..."
sudo chmod -R o+r /home/wander/apps/kokito/frontend/dist

echo "🔄 Recargando nginx..."
sudo systemctl reload nginx

echo "✅ Deploy completado"
