@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  Favo Cafe ^& Roastery -- Windows Setup
echo ============================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found. Download from https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo [OK] Node.js found: %NODE_VERSION%

for /f "tokens=1 delims=." %%a in ("%NODE_VERSION:v=%") do set MAJOR=%%a
if %MAJOR% LSS 22 (
    echo [ERROR] Node.js 22.5+ required. Download LTS from https://nodejs.org
    pause & exit /b 1
)

if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo [OK] .env created.
    )
) else (
    echo [OK] .env already exists.
)
echo.

echo Installing dependencies...
npm install
if %ERRORLEVEL% NEQ 0 ( echo [ERROR] npm install failed. & pause & exit /b 1 )
echo [OK] Dependencies installed.
echo.

echo Seeding database...
node src/db/seed.js
if %ERRORLEVEL% NEQ 0 ( echo [ERROR] Seed failed. & pause & exit /b 1 )
echo.

echo ============================================
echo  Setup complete! Run start.bat to launch.
echo ============================================
pause
