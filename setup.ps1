#Requires -Version 5.1
<#
.SYNOPSIS
    Favo Cafe & Roastery — Windows PowerShell setup script.
.DESCRIPTION
    No C++ compiler or Python needed — uses Node's built-in sqlite module.
    Run from the favo-cafe folder:  .\setup.ps1
    If blocked by execution policy:
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#>

$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Favo Cafe & Roastery -- Windows Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
try {
    $nodeVersion = (node -v 2>&1).ToString().Trim()
    Write-Host "[OK] Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Download from https://nodejs.org (LTS)" -ForegroundColor Red
    exit 1
}

$major = [int]($nodeVersion -replace 'v(\d+).*','$1')
if ($major -lt 22) {
    Write-Host "[ERROR] Node.js 22.5+ required (found $nodeVersion)." -ForegroundColor Red
    Write-Host "        Download LTS from: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

$npmVersion = (npm -v 2>&1).ToString().Trim()
Write-Host "[OK] npm found: v$npmVersion" -ForegroundColor Green
Write-Host ""

# ── Copy .env ─────────────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "[OK] .env created -- set a strong JWT_SECRET before production." -ForegroundColor Green
    } else {
        Write-Host "[WARN] .env.example not found. Create .env manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "[OK] .env already exists -- skipping." -ForegroundColor Green
}
Write-Host ""

# ── Install dependencies ───────────────────────────────────────────────────────
Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
Write-Host "(No native compilation needed -- uses Node built-in SQLite)" -ForegroundColor Gray
Write-Host ""
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Dependencies installed." -ForegroundColor Green
Write-Host ""

# ── Seed database — uses node directly to avoid npm run path issues ───────────
Write-Host "Seeding database..." -ForegroundColor Cyan
node src/db/seed.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Seed failed." -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Start the server:" -ForegroundColor White
Write-Host "  node server.js          (or double-click start.bat)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Public:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Admin:   http://localhost:3000/admin/login.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "Default admin: admin@favocafe.co.za / FavoAdmin2024!" -ForegroundColor Yellow
Write-Host ""
