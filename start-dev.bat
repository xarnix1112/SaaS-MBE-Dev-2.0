@echo off
REM Lance le projet sous Windows (front + proxy Stripe)

set "PROJECT_ROOT=%~dp0"
set "FRONT_DIR=%PROJECT_ROOT%\front end"

pushd "%FRONT_DIR%"

if not exist node_modules (
  echo [auto] npm install...
  call npm install
)

echo [auto] npm run dev:all (proxy Stripe + Vite)...
start "" cmd /c "npm run dev:all"

echo [auto] Ouverture http://localhost:8080
start "" http://localhost:8080

popd

