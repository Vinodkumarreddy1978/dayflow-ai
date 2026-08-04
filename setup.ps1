# =============================================================================
# DayFlow AI - one-shot local setup (Windows PowerShell)
#
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Installs dependencies and produces a working .env.local with the secrets that
# can be generated locally. The four Supabase values cannot be generated - they
# come from your project - so the script prints exactly where to find them and
# stops rather than pretending it finished.
# =============================================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Write-Step($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }
function Write-Ok($message)   { Write-Host "    $message" -ForegroundColor Green }
function Write-Warn($message) { Write-Host "    $message" -ForegroundColor Yellow }

# --- 1. Node ---------------------------------------------------------------
Write-Step "Checking Node.js"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed or not on PATH." -ForegroundColor Red
    Write-Host "Install Node.js 20.9 or newer from https://nodejs.org and run this again."
    Write-Host ""
    Write-Host "No admin rights? Download the Windows .zip build, extract it, and add"
    Write-Host "the extracted folder to PATH for the session:"
    Write-Host '    $env:Path = "C:\path\to\node;$env:Path"'
    exit 1
}

$nodeVersion = (node -v).TrimStart("v")
$major = [int]($nodeVersion.Split(".")[0])
$minor = [int]($nodeVersion.Split(".")[1])

if ($major -lt 20 -or ($major -eq 20 -and $minor -lt 9)) {
    Write-Host "Node $nodeVersion found, but 20.9 or newer is required." -ForegroundColor Red
    exit 1
}
Write-Ok "Node $nodeVersion"

# --- 2. OneDrive warning ---------------------------------------------------
if ($PSScriptRoot -match "OneDrive|Dropbox|iCloud") {
    Write-Step "Sync folder detected"
    Write-Warn "This project is inside a file-sync folder."
    Write-Warn "node_modules has tens of thousands of files and the sync client will"
    Write-Warn "either saturate your upload or corrupt the install midway."
    Write-Warn "Moving the project outside the synced folder is strongly recommended."
    Write-Host ""
    $answer = Read-Host "    Continue anyway? (y/N)"
    if ($answer -notmatch "^[Yy]") { exit 1 }
}

# --- 3. Dependencies -------------------------------------------------------
Write-Step "Installing dependencies (a few minutes on first run)"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed." -ForegroundColor Red; exit 1 }
Write-Ok "$((Get-ChildItem node_modules -Directory).Count) packages installed"

# --- 4. Environment file ---------------------------------------------------
Write-Step "Preparing .env.local"

if (Test-Path ".env.local") {
    Write-Ok ".env.local already exists - leaving it untouched"
} else {
    Copy-Item ".env.example" ".env.local"
    $content = Get-Content ".env.local" -Raw

    # CRON_SECRET: 48 bytes of cryptographic randomness, base64 encoded.
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $cronSecret = [Convert]::ToBase64String($bytes)
    $content = $content -replace "CRON_SECRET=.*", "CRON_SECRET=$cronSecret"

    # VAPID pair for web push.
    try {
        $vapid = node scripts/generate-vapid-keys.mjs --json | ConvertFrom-Json
        $content = $content -replace "NEXT_PUBLIC_VAPID_PUBLIC_KEY=.*", "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$($vapid.publicKey)"
        $content = $content -replace "VAPID_PRIVATE_KEY=.*", "VAPID_PRIVATE_KEY=$($vapid.privateKey)"
        Write-Ok "Generated CRON_SECRET and VAPID key pair"
    } catch {
        Write-Warn "Could not generate VAPID keys. Run 'npm run vapid:generate' later."
    }

    Set-Content ".env.local" $content -NoNewline
    Write-Ok "Created .env.local"
}

# --- 5. What is still needed ----------------------------------------------
Write-Step "Setup complete - four values still needed"

Write-Host @"

    These cannot be generated. Get them from your Supabase project:

      1. Create a project at https://supabase.com
      2. Open Project Settings -> API
      3. Copy into .env.local:

           Project URL      ->  NEXT_PUBLIC_SUPABASE_URL
           anon / public    ->  NEXT_PUBLIC_SUPABASE_ANON_KEY
           service_role     ->  SUPABASE_SERVICE_ROLE_KEY

      4. Apply the schema - either:
           supabase link --project-ref <ref>
           supabase db push
         or paste supabase/migrations/0001..0012 into the SQL editor in order.

      5. Authentication -> URL Configuration:
           Site URL:       http://localhost:3000
           Redirect URLs:  http://localhost:3000/auth/callback
         Authentication -> Providers -> Email: turn OFF "Confirm email" for now.

    Then start it:

        npm run dev

    Full detail, including troubleshooting, is in README.md.

"@ -ForegroundColor Gray
