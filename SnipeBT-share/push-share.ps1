<#
PowerShell helper: push-share.ps1

Run this from the VS Code integrated terminal while your current directory is
the `SnipeBT-share` folder. It will:
- check for git and gh (GitHub CLI)
- initialize a git repo if needed
- create a GitHub repo via gh (interactive auth if needed) and push
- fallback to manual remote if gh is not available

Usage (in VS Code terminal):
  cd 'C:\Users\Khbar\SnipeBT-share'
  .\push-share.ps1
#>

function ExitWith([string]$msg, [int]$code=1) {
  Write-Host $msg -ForegroundColor Red
  exit $code
}

Write-Host "Running push-share.ps1 in: $(Get-Location)" -ForegroundColor Cyan

# Check git
try {
  git --version > $null 2>&1
} catch {
  ExitWith "git is not installed or not on PATH. Please install Git: https://git-scm.com/download/win" 2
}

# Ask for repo details
$owner = Read-Host "GitHub username or organization (leave empty to use your account via gh)"
$repoName = Read-Host "Repository name (default: SnipeBT-share)"
if ([string]::IsNullOrWhiteSpace($repoName)) { $repoName = 'SnipeBT-share' }
$visibility = Read-Host "Visibility (public/private) [public]"
if ([string]::IsNullOrWhiteSpace($visibility)) { $visibility = 'public' }

# Initialize git if no repo yet
if (-not (Test-Path .git)) {
  Write-Host "Initializing local git repository..." -ForegroundColor Green
  git init
  git add -A
  git commit -m "Initial sanitized share: add storeSecret helper and README" 2>$null
} else {
  Write-Host "Git repository already exists. Skipping init." -ForegroundColor Yellow
}

# Prefer GitHub CLI
try {
  gh --version > $null 2>&1
  $hasGh = $true
} catch {
  $hasGh = $false
}

if ($hasGh) {
  Write-Host "GitHub CLI detected. Using gh to create repo and push." -ForegroundColor Green
  # Ensure authenticated
  $authOk = $false
  try {
    gh auth status 2>&1 | Out-String | Select-String "Logged in to" > $null
    $authOk = $true
  } catch {}
  if (-not $authOk) {
    Write-Host "You need to authenticate gh. An interactive browser flow will start." -ForegroundColor Yellow
    gh auth login
  }

  # If owner not supplied, gh will create under your account
  $createCmd = "gh repo create"
  if (-not [string]::IsNullOrWhiteSpace($owner)) { $createCmd += " $owner/$repoName" } else { $createCmd += " $repoName" }
  if ($visibility -eq 'private') { $createCmd += " --private" } else { $createCmd += " --public" }
  $createCmd += " --source=. --remote=origin --push"

  Write-Host "Running: $createCmd" -ForegroundColor Cyan
  iex $createCmd
  if ($LASTEXITCODE -ne 0) {
    ExitWith "gh repo create failed. See output above." 3
  }
  Write-Host "Repository created and pushed via gh." -ForegroundColor Green
  exit 0
} else {
  Write-Host "GitHub CLI not found. Falling back to manual remote setup." -ForegroundColor Yellow
  $remoteUrl = Read-Host "Enter the Git remote URL to push to (e.g. https://github.com/USERNAME/$repoName.git)"
  if ([string]::IsNullOrWhiteSpace($remoteUrl)) { ExitWith "No remote provided; aborting." 4 }
  git remote add origin $remoteUrl 2>$null
  git branch -M main
  Write-Host "Pushing to remote..." -ForegroundColor Green
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { ExitWith "git push failed. Check remote URL and credentials." 5 }
  Write-Host "Pushed to remote successfully." -ForegroundColor Green
  exit 0
}
