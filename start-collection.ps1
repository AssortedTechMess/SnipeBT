# Data Collection Starter Script
# Runs data collection with auto-restart on failures

Write-Host "🧠 Starting Deep Learning Data Collection" -ForegroundColor Cyan
Write-Host "Target: 200,000 examples over the week" -ForegroundColor Yellow
Write-Host ""

# Check if already running
$existing = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*dataCollector*" }
if ($existing) {
    Write-Host "⚠️  Collection already running (PID: $($existing.Id))" -ForegroundColor Yellow
    Write-Host "   Kill it first if you want to restart: Stop-Process -Id $($existing.Id)"
    exit
}

# Run collection
Write-Host "▶️  Starting collection..." -ForegroundColor Green
Write-Host "   This will run in the background"
Write-Host "   Check progress: Get-Content trainingData_checkpoint.json"
Write-Host "   Stop it: Ctrl+C or close this window"
Write-Host ""

npx ts-node src/deepLearning/dataCollector.ts

# If it exits, show why
Write-Host ""
Write-Host "Collection stopped. Exit code: $LASTEXITCODE" -ForegroundColor $(if ($LASTEXITCODE -eq 0) { "Green" } else { "Red" })

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "To restart: .\start-collection.ps1" -ForegroundColor Yellow
}
