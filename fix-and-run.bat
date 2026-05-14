@echo off
title Favo Cafe — Fix Database and Start Server
color 0A

echo.
echo  ============================================
echo   Favo Cafe ^& Roastery — Fresh Start
echo  ============================================
echo.

cd /d "%~dp0"

echo  [1/3] Removing old database files...
del /f /q "src\db\favo.db"     2>nul
del /f /q "src\db\favo.db-wal" 2>nul
del /f /q "src\db\favo.db-shm" 2>nul
echo        Done.
echo.

echo  [2/3] Seeding fresh database...
node src\db\seed.js
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Seed failed. Make sure Node.js 22+ is installed.
  pause
  exit /b 1
)
echo.

echo  [3/3] Starting server...
echo.
echo  ============================================
echo   PUBLIC SITE
echo   http://localhost:3000
echo.
echo   ADMIN PORTAL
echo   http://localhost:3000/admin/login.html
echo.
echo   TEST ACCOUNTS
echo   Super Admin  admin@favocafe.co.za    FavoAdmin2024!
echo                -> Dashboard, all modules, user management
echo.
echo   Admin        manager@favocafe.co.za  FavoAdmin2024!
echo                -> Dashboard, Inventory, CRM, Loyalty
echo.
echo   Barista      barista@favocafe.co.za  barista123
echo                -> Point of Sale only
echo.
echo   Roaster      roaster@favocafe.co.za  roaster123
echo                -> Inventory only
echo  ============================================
echo.
node server.js
