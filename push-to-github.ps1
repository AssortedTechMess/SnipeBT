# GitHub Push Script with Redacted Sensitive Data
# Run this script to push SnipeBT-share to GitHub

Write-Host "🚀 Preparing SnipeBT for GitHub..." -ForegroundColor Cyan

# Step 1: Copy files to SnipeBT-share (already done by robocopy)
Write-Host "✅ Files copied to SnipeBT-share" -ForegroundColor Green

# Step 2: Navigate to share folder
cd C:\Users\Khbar\SnipeBT-share

# Step 3: Check if git is available
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git not found! Please install Git or use GitHub Desktop" -ForegroundColor Red
    Write-Host "   Download from: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "   OR use GitHub Desktop: https://desktop.github.com/" -ForegroundColor Yellow
    pause
    exit
}

# Step 4: Initialize git if needed
if (!(Test-Path .git)) {
    Write-Host "📦 Initializing git repository..." -ForegroundColor Yellow
    git init
    git branch -M main
}

# Step 5: Create/update .gitignore
$gitignore = @"
# Dependencies
node_modules/
package-lock.json

# Environment variables (sensitive data)
.env
.env.local
.env.production

# Logs
*.log
logs/
npm-debug.log*

# Build output
dist/
build/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Trading data (may contain sensitive info)
entryPrices.json
tradeHistory.json

# Temporary files
*.tmp
*.temp
"@

$gitignore | Out-File -FilePath .gitignore -Encoding UTF8 -Force
Write-Host "✅ .gitignore created" -ForegroundColor Green

# Step 6: Update .env.example (remove sensitive data)
$envExample = @"
# Wallet Configuration (Base58 encoded private key)
WALLET_PRIVATE_KEY=your-solana-wallet-private-key-here

# RPC Endpoints - Multiple endpoints for redundancy
RPC_URL=https://your-quicknode-url-here
BACKUP_RPC_URL=https://solana-mainnet.rpc.extrnode.com
RPC_WSS_URL=wss://api.mainnet-beta.solana.com

# Environment Configuration
ENVIRONMENT=development

# API Keys
HUGGINGFACE_TOKEN=your-huggingface-token-here
TWITTER_BEARER_TOKEN=your-twitter-bearer-token-here
XAI_API_KEY=your-xai-grok-api-key-here

# External APIs
COINGECKO_BASE=https://api.coingecko.com/api/v3

# Bot Configuration
LOG_LEVEL=debug
MAX_RETRIES=5
REQUEST_TIMEOUT_MS=30000
CACHE_DURATION_MS=60000
AUTO_TAKEPROFIT=true
TAKEPROFIT_MIN_PCT=2.0

# Volume Filtering
MIN_VOLUME24H_USD=10000
MIN_VOLUME1H_USD=500
MIN_RVOL=1.5
VERBOSE_FILTER_LOGS=true

# Multi-Strategy System
# Available modes: emperorBTC, conservative, balanced, aggressive, scalping, dcaOnly
STRATEGY_MODE=aggressive
USE_STRATEGIES=true

# Telegram Notifications
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
TELEGRAM_CHAT_ID=your-telegram-chat-id-here
"@

$envExample | Out-File -FilePath .env.example -Encoding UTF8 -Force
Write-Host "✅ .env.example updated (sensitive data redacted)" -ForegroundColor Green

# Step 7: Remove .env if it exists
if (Test-Path .env) {
    Remove-Item .env -Force
    Write-Host "✅ .env removed (not committed to GitHub)" -ForegroundColor Green
}

# Step 8: Remove sensitive files
$sensitiveFiles = @("entryPrices.json", "tradeHistory.json")
foreach ($file in $sensitiveFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "✅ $file removed" -ForegroundColor Green
    }
}

# Step 9: Add all files
Write-Host "📝 Staging files..." -ForegroundColor Yellow
git add .

# Step 10: Commit
$commitMessage = "🚀 Add AI Candlestick Monitor + EmperorBTC Strategy

- Implemented AI-powered candlestick analysis with xAI Grok
- Added rule-based candlestick strategy (EmperorBTC methodology)
- Integrated AI monitoring for active positions
- Telegram alerts on high-confidence signals (70%+)
- 4-strategy ensemble: Candlestick (30%), Anti-Martingale (35%), RSI (25%), DCA (10%)
- Complete integration with position tracking
- Graceful shutdown with AI cleanup

Features:
✅ Real-time AI candlestick analysis
✅ EmperorBTC pattern detection (pin bars, engulfing, wick rejection)
✅ Context-aware confidence scoring
✅ Volume confirmation (RVOL 1.5x+)
✅ Automated Telegram alerts
✅ Multi-strategy decision making"

Write-Host "💾 Committing changes..." -ForegroundColor Yellow
git commit -m $commitMessage

# Step 11: Check remote
$hasRemote = git remote -v 2>$null
if (!$hasRemote) {
    Write-Host ""
    Write-Host "⚠️  No GitHub remote configured!" -ForegroundColor Yellow
    Write-Host "   To add your GitHub repository, run:" -ForegroundColor Cyan
    Write-Host "   git remote add origin https://github.com/YOUR-USERNAME/SnipeBT.git" -ForegroundColor White
    Write-Host ""
    Write-Host "   Then run: git push -u origin main" -ForegroundColor White
    Write-Host ""
    pause
    exit
}

# Step 12: Push to GitHub
Write-Host ""
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "🎉 Your AI-enhanced trading bot is now on GitHub!" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Push failed. You may need to:" -ForegroundColor Red
    Write-Host "   1. Set up your GitHub repository" -ForegroundColor Yellow
    Write-Host "   2. Configure authentication (Personal Access Token)" -ForegroundColor Yellow
    Write-Host "   3. Run: git push -u origin main" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Summary of changes:" -ForegroundColor Cyan
Write-Host "   - AI Candlestick Monitor (src/aiCandlestickMonitor.ts)" -ForegroundColor White
Write-Host "   - AI Integration (src/aiIntegration.ts)" -ForegroundColor White
Write-Host "   - Candlestick Strategy (src/strategies/candlestickStrategy.ts)" -ForegroundColor White
Write-Host "   - Updated main.ts with AI monitoring hooks" -ForegroundColor White
Write-Host "   - Documentation (AI_INTEGRATION_GUIDE.md, INTEGRATION_COMPLETE.md)" -ForegroundColor White
Write-Host ""

pause
