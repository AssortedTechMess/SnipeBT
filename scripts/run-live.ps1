<#
Simple helper to initialize the bot and start it in live mode with the provided arguments.
Usage (from project root):
  .\scripts\run-live.ps1 --MainArgs "--live --confirm-live --auto-tp --multi-input --risk 0.02 --slippage-bps 30 --min-profit 0.0075 --target-mult 4 --min-liquidity-usd 5000 --min-volume24h-usd 2500 --min-txns5m 2"

This script will:
 - initialize secure config (calls initializeAndLog)
 - exit if initialization fails (prints the error)
 - run src/main.ts with the args you supply

Note: You must run this locally in your machine where your OS wallet and environment are available.
#>

param(
  [string]$MainArgs = "--live --confirm-live --auto-tp --auto-sl --multi-input --risk 0.02 --slippage-bps 30 --min-profit 0.0075 --target-mult 4 --min-liquidity-usd 5000 --min-volume24h-usd 2500 --min-txns5m 2"
)

try {
  # Ensure we run from the project root
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  Set-Location (Join-Path $scriptDir "..")
} catch {
  Write-Error "Failed to set location to project root: $_"
  exit 1
}

Write-Host "Initializing secure configuration and wallet (this may prompt for OS credential access)..."

$initCmd = "npx ts-node -e \"import { initializeAndLog } from './src/config'; (async ()=>{ try{ await initializeAndLog(); console.log('INITIALIZE_OK'); } catch(e){ console.error('INITIALIZE_ERROR', e && e.stack ? e.stack : e); process.exit(1); } })()\""

Write-Host "Running: $initCmd"
Invoke-Expression $initCmd 2>&1 | Tee-Object -Variable initOutput

if ($LASTEXITCODE -ne 0) {
  Write-Error "Initialization failed (exit code $LASTEXITCODE). See output below:`n$($initOutput -join "`n")"
  exit $LASTEXITCODE
}

Write-Host "Initialization succeeded. Starting main with args: $MainArgs"

$runCmd = "npx ts-node src/main.ts $MainArgs"
Write-Host "Running: $runCmd"
Invoke-Expression $runCmd
