#!/bin/bash
# Lance le projet dans une vraie fenêtre Terminal (macOS) pour éviter les soucis de PATH/sandbox.
# Double-clique simplement ce fichier.

# Obtenir le chemin du répertoire où se trouve ce script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
RUN_SCRIPT="$PROJECT_ROOT/run-dev-mac.sh"

# Vérifier que le script run-dev-mac.sh existe
if [ ! -f "$RUN_SCRIPT" ]; then
    osascript -e 'display dialog "Erreur: Le fichier run-dev-mac.sh est introuvable dans le répertoire du projet." buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

# Rendre le script exécutable si nécessaire
chmod +x "$RUN_SCRIPT" 2>/dev/null || true

# Ouvre une nouvelle fenêtre Terminal et exécute le script (évite le sandbox du double-clic).
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$PROJECT_ROOT' && bash '$RUN_SCRIPT'"
end tell
EOF

# Attendre un peu avant d'ouvrir le navigateur (le serveur a besoin de temps pour démarrer)
sleep 3

# Ouvre le navigateur sur l'app (port 8080) - en arrière-plan pour ne pas bloquer
open http://localhost:8080 2>/dev/null || true

echo "✅ Fenêtre Terminal lancée. Le serveur démarre..."
echo "📝 Fermez la fenêtre Terminal pour arrêter les serveurs."
echo "🌐 Le navigateur devrait s'ouvrir automatiquement sur http://localhost:8080"

