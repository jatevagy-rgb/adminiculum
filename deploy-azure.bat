@echo off
REM Azure Deployment Script for Adminiculum Backend
REM This script prepares the project for Azure App Service deployment

echo ========================================
echo Adminiculum Azure Deployment
echo ========================================
echo.

echo Step 1: Cleaning previous build...
if exist dist rmdir /s /q dist
if exist deploy-azure.zip del /f deploy-azure.zip
if exist deploy-check rmdir /s /q deploy-check

echo Step 2: Installing dependencies...
call npm install

echo Step 3: Generating Prisma client...
call npx prisma generate

echo Step 4: Building TypeScript...
call npm run build

echo Step 5: Cleaning Windows-specific files...
if exist node_modules\.bin rmdir /s /q node_modules\.bin
if exist node_modules\.package-lock.json del /f node_modules\.package-lock.json

echo Step 6: Creating deployment zip...
echo    - Using 7-Zip for Linux-compatible paths
7z a -tzip -slp deploy-azure.zip dist\* node_modules\* package.json package-lock.json prisma\* .deployment templates\*

if errorlevel 1 (
    echo    - 7-Zip not found, falling back to PowerShell...
    powershell -Command "Compress-Archive -Path 'dist','node_modules','package.json','package-lock.json','prisma','.deployment','templates' -DestinationPath 'deploy-azure.zip' -Force"
)

echo.
echo ========================================
echo Deployment package ready: deploy-azure.zip
echo ========================================
echo.
echo Next steps:
echo 1. Upload to Azure Portal -^> Deployment Center -^> Zip Deploy
echo 2. Ensure WEBSITE_RUN_FROM_PACKAGE = 1 in Configuration
echo.
pause
