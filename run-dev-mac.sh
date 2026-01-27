#!/bin/bash
set -e

# PATH complet pour trouver npm/node en lancement AppleScript
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Log dans /tmp/run-dev.log pour debug
exec > >(tee -a /tmp/run-dev.log) 2>&1

# Obtenir le répertoire du script (où se trouve ce fichier)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
FRONT_DIR="$PROJECT_ROOT/front end"

echo "[auto] Répertoire du projet: $PROJECT_ROOT"
echo "[auto] Répertoire front end: $FRONT_DIR"

# Vérifier que le répertoire front end existe
if [ ! -d "$FRONT_DIR" ]; then
    echo "❌ Erreur: Le répertoire 'front end' est introuvable dans $PROJECT_ROOT"
    echo "Appuyez sur Entrée pour fermer..."
    read
    exit 1
fi

cd "$FRONT_DIR"

# Vérifier que package.json existe
if [ ! -f "package.json" ]; then
    echo "❌ Erreur: package.json introuvable dans $FRONT_DIR"
    echo "Appuyez sur Entrée pour fermer..."
    read
    exit 1
fi

if [ ! -d node_modules ]; then
  echo "[auto] npm install..."
  npm install
fi

echo "[auto] npm run dev:all (proxy Stripe + Vite)..."
npm run dev:all

