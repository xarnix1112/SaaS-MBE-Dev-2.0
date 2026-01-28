@echo off
REM Lance le projet sous Windows (front + proxy Stripe)

set "PROJECT_ROOT=%~dp0"
set "FRONT_DIR=%PROJECT_ROOT%front end"

echo.
echo ========================================
echo  Demarrage de l'application MBE-SDV
echo ========================================
echo.

cd /d "%FRONT_DIR%"

if not exist node_modules (
  echo [INFO] Installation des dependances npm...
  call npm install
  echo.
)

echo [INFO] Lancement du serveur de developpement...
echo [INFO] L'application sera accessible sur http://localhost:8080
echo.
echo ATTENTION: NE FERMEZ PAS CETTE FENETRE pour que l'application continue de fonctionner
echo.

REM Attendre 3 secondes avant d'ouvrir le navigateur
timeout /t 3 /nobreak >nul
start "" http://localhost:8080

REM Lancer npm run dev:all dans cette fenêtre (visible et ne se ferme pas)
npm run dev:all

pause

