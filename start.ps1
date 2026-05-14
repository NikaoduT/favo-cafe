Write-Host "Starting Favo Cafe server..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Public:  http://localhost:3000" -ForegroundColor Green
Write-Host "  Admin:   http://localhost:3000/admin/login.html" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""
node server.js
