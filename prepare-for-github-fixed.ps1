# SnipeBT GitHub Preparation Script
# This script copies the project to SnipeBT-share with all sensitive data redacted

$sourceDir = "C:\Users\Khbar\SnipeBT"
$targetDir = "C:\Users\Khbar\SnipeBT-share"

Write-Host "=== SnipeBT GitHub Preparation ===" -ForegroundColor Cyan
Write-Host ""

# Create target directory if it doesn't exist
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
    Write-Host "[OK] Created $targetDir" -ForegroundColor Green
}

# Files and folders to exclude (sensitive or build artifacts)
$excludeItems = @(
    "node_modules",
    "dist",
    ".env",
    "logs",
    "*.log",
    "entryPrices.json",
    "tradeHistory.json",
    "learningData_v2.json",
    "balance-tracker.json",
    "price-cache.json",
    "rpc-stats.json",
    ".git",
    "prepare-for-github.ps1",
    "prepare-for-github-fixed.ps1"
)

# Get all items in source directory
Write-Host "Copying files to $targetDir..." -ForegroundColor Yellow
Get-ChildItem -Path $sourceDir -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourceDir.Length + 1)
    
    # Check if this item should be excluded
    $shouldExclude = $false
    foreach ($exclude in $excludeItems) {
        if ($relativePath -like $exclude -or $relativePath -like "*\$exclude\*" -or $relativePath -like "*\$exclude") {
            $shouldExclude = $true
            break
        }
    }
    
    if (-not $shouldExclude) {
        $targetPath = Join-Path $targetDir $relativePath
        
        if ($_.PSIsContainer) {
            if (-not (Test-Path $targetPath)) {
                New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
            }
        } else {
            $targetFileDir = Split-Path $targetPath -Parent
            if (-not (Test-Path $targetFileDir)) {
                New-Item -ItemType Directory -Path $targetFileDir -Force | Out-Null
            }
            Copy-Item -Path $_.FullName -Destination $targetPath -Force
        }
    }
}

Write-Host "[OK] Files copied" -ForegroundColor Green
Write-Host ""

# Create a safe .env.example file
Write-Host "Creating .env.example with safe defaults..." -ForegroundColor Yellow
$envExample = @"
# Wallet Configuration (Base58 encoded private key)
WALLET_PRIVATE_KEY=your_private_key_here

# RPC Endpoints
RPC_URL=https://api.mainnet-beta.solana.com
BACKUP_RPC_URL=https://solana-api.projectserum.com
RPC_WSS_URL=wss://api.mainnet-beta.solana.com

# Environment
ENVIRONMENT=development

# API Keys (Optional)
HUGGINGFACE_TOKEN=your_huggingface_token_here
OPENAI_API_KEY=your_openai_key_here
TWITTER_BEARER_TOKEN=your_twitter_token_here

# External APIs
COINGECKO_BASE=https://api.coingecko.com/api/v3
DEXSCREENER_BASE=https://api.dexscreener.com
JUPITER_QUOTE_URL=https://lite-api.jup.ag

# Bot Configuration
LOG_LEVEL=debug
MAX_RETRIES=5
REQUEST_TIMEOUT_MS=30000

# Strategy Mode
STRATEGY_MODE=aggressive
USE_STRATEGIES=true

# Telegram Notifications (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here

# Volume Analysis
MIN_RVOL=1.5
MIN_VOL24_USD=25000
MIN_VOLUME1H_USD=1000

# Trade Settings
TRADE_AMOUNT_SOL=0.15
MAX_POSITIONS=10
TAKEPROFIT_MIN_PCT=2.0
SLIPPAGE_BPS=150
SCAN_INTERVAL_SECONDS=30
"@

$envExample | Out-File -FilePath (Join-Path $targetDir ".env.example") -Encoding UTF8
Write-Host "[OK] Created .env.example" -ForegroundColor Green
Write-Host ""

# Create/update .gitignore
Write-Host "Creating .gitignore..." -ForegroundColor Yellow
$gitignore = @"
# Environment variables
.env
.env.*
!.env.example

# Node
node_modules/
npm-debug.log*

# Logs
logs/
*.log

# Build output
dist/
build/

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store

# Sensitive trading data
entryPrices.json
tradeHistory.json
learningData_v2.json
balance-tracker.json
price-cache.json
rpc-stats.json

# Scripts
prepare-for-github.ps1
prepare-for-github-fixed.ps1
push-to-github.ps1
"@

$gitignore | Out-File -FilePath (Join-Path $targetDir ".gitignore") -Encoding UTF8
Write-Host "[OK] Created .gitignore" -ForegroundColor Green
Write-Host ""

# Scan for sensitive data
Write-Host "Scanning for sensitive data..." -ForegroundColor Yellow
$sensitivePatterns = @(
    "quiknode.pro",
    "hf_[A-Za-z0-9]+",
    "sk-[A-Za-z0-9]+",
    "[0-9]{10}:AA[A-Za-z0-9_-]+"
)

$foundSensitive = @()
Get-ChildItem -Path $targetDir -Recurse -File | Where-Object { 
    $_.Extension -in @('.ts', '.js', '.md', '.json') 
} | ForEach-Object {
    $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        foreach ($pattern in $sensitivePatterns) {
            if ($content -match $pattern) {
                $foundSensitive += $_.FullName.Substring($targetDir.Length + 1)
                break
            }
        }
    }
}

if ($foundSensitive.Count -gt 0) {
    Write-Host "[WARNING] Found potential sensitive data in:" -ForegroundColor Red
    $foundSensitive | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "Please review these files before pushing!" -ForegroundColor Yellow
} else {
    Write-Host "[OK] No sensitive data patterns detected" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "[OK] Project copied to: $targetDir" -ForegroundColor Green
Write-Host "[OK] .env.example created" -ForegroundColor Green
Write-Host "[OK] .gitignore updated" -ForegroundColor Green
Write-Host ""
Write-Host "Files are ready in: $targetDir" -ForegroundColor Yellow
Write-Host "Next: Run push-to-github.ps1 to commit and push" -ForegroundColor Yellow
Write-Host ""
