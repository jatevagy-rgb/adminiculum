@echo off
REM Adminiculum Backend - Startup Script
REM This script sets up and runs the backend server

echo ==========================================
echo Adminiculum Backend - Indítás
echo ==========================================

REM Change to backend directory
cd /d "%~dp0..\backend"

REM Check if node_modules exists
if not exist node_modules (
    echo.
    echo [1/4] npm csomagok telepítése...
    npm install
) else (
    echo.
    echo npm csomagok már telepítve.
)

REM Generate Prisma client
echo.
echo [2/4] Prisma client generálása...
npx prisma generate

REM Run database migrations (if needed)
echo.
echo [3/4] Adatbázis migráció...
npx prisma migrate dev --name init

REM Start the server
echo.
echo [4/4] Szerver indítása...
echo.
echo A szerver elérhető: http://localhost:3000
echo API dokumentáció: http://localhost:3000/api-docs
echo.
echo Nyomj meg egy gombot a leállításhoz...
pause

npm run dev
