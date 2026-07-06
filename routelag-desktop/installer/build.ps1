# RouteLag Installer Build Script
# Usage:
#   .\build.ps1              - build Core + Full (if HUD dist present)
#   .\build.ps1 -Core        - Core only
#   .\build.ps1 -Full        - Full only (requires HUD build)
#   .\build.ps1 -Dev         - Core installer without building the Tauri app first
#
# Environment variables (optional):
#   WINDOWS_CERT_PATH         - path to .pfx signing certificate
#   WINDOWS_CERT_PASSWORD     - certificate password
#   WINDOWS_SIGNING_ENABLED   - "true" to enable code signing

param(
    [switch]$Core,
    [switch]$Full,
    [switch]$Dev,           # skip cargo/npm build - use existing build output
    [switch]$SkipAppBuild,  # alias for -Dev
    [string]$NsisPath       # override NSIS install path
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent     # routelag-desktop/
$InstallerDir = $PSScriptRoot                # routelag-desktop/installer/
$OutputDir = Join-Path $Root "dist\installers"

# -- Paths --------------------------------------------------------------------
$AppSrcDir     = Join-Path $Root "src-tauri\target\release"
$EngineSrcDir  = Join-Path $Root "src-tauri\engine\windows"
$HudSrcDir     = Join-Path (Split-Path $Root -Parent) "routelag-hud\build\win-unpacked"

Write-Host ""
Write-Host "=== RouteLag Installer Builder ===" -ForegroundColor Cyan
Write-Host "Root:        $Root"
Write-Host "App output:  $AppSrcDir"
Write-Host "Engine dir:  $EngineSrcDir"
Write-Host "HUD dir:     $HudSrcDir"
Write-Host ""

# -- Find NSIS ----------------------------------------------------------------
function Find-NSIS {
    if ($NsisPath -and (Test-Path "$NsisPath\makensis.exe")) { return "$NsisPath\makensis.exe" }
    $cmd = Get-Command makensis -ErrorAction SilentlyContinue
    $candidates = @(
        "C:\Program Files (x86)\NSIS\makensis.exe",
        "C:\Program Files\NSIS\makensis.exe"
    )
    if ($cmd) { $candidates += $cmd.Source }
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

$makensis = Find-NSIS
if (-not $makensis) {
    Write-Error @"
NSIS not found. Please install NSIS 3.x from https://nsis.sourceforge.io/
Then re-run this script, or pass -NsisPath 'C:\path\to\nsis'.
"@
    exit 1
}
Write-Host "NSIS:        $makensis" -ForegroundColor Green

# -- Build Tauri app (unless -Dev / -SkipAppBuild) ----------------------------
if (-not $Dev -and -not $SkipAppBuild) {
    Write-Host ""
    Write-Host "Building Tauri app..." -ForegroundColor Yellow
    Push-Location $Root
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { Write-Error "npm build failed"; exit 1 }
    $desktopDist = Join-Path $Root "dist\index.html"
    if (-not (Test-Path $desktopDist)) {
        Write-Error "Desktop frontend dist missing at $desktopDist"
        exit 1
    }
    cargo clean -p routelag-desktop --manifest-path src-tauri\Cargo.toml
    cargo build --release --features custom-protocol --manifest-path src-tauri\Cargo.toml
    if ($LASTEXITCODE -ne 0) { Write-Error "cargo build failed"; exit 1 }
    Pop-Location
    Write-Host "Tauri build complete." -ForegroundColor Green
}

# -- Generate assets ----------------------------------------------------------
Write-Host ""
Write-Host "Generating installer assets..." -ForegroundColor Yellow
& "$InstallerDir\gen-assets.ps1"

# -- Verify required files ----------------------------------------------------
$appExe = Join-Path $AppSrcDir "routelag-desktop.exe"
if (-not (Test-Path $appExe)) {
    Write-Error "App executable not found: $appExe`nRun a Tauri release build first, or use -Dev to skip."
    exit 1
}
Write-Host "App exe found: $appExe" -ForegroundColor Green

$hudAvailable = Test-Path (Join-Path $HudSrcDir "RouteLagHUD.exe")
Write-Host "HUD available: $hudAvailable"

New-Item -ItemType Directory -Force $OutputDir | Out-Null

# -- Code signing helper ------------------------------------------------------
function Sign-Exe ([string]$path) {
    $signingEnabled = $env:WINDOWS_SIGNING_ENABLED -eq "true"
    $certPath = $env:WINDOWS_CERT_PATH
    $certPass = $env:WINDOWS_CERT_PASSWORD

    if (-not $signingEnabled) {
        Write-Host "  [signing] Skipped (WINDOWS_SIGNING_ENABLED != true)" -ForegroundColor DarkGray
        return
    }
    if (-not $certPath -or -not (Test-Path $certPath)) {
        Write-Warning "  [signing] WINDOWS_CERT_PATH not set or file missing - skipping."
        return
    }

    $signtoolItem = Get-ChildItem "C:\Program Files*\Windows Kits\*\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $signtoolItem) {
        Write-Warning "  [signing] signtool.exe not found - install Windows SDK."
        return
    }
    $signtool = $signtoolItem.FullName

    Write-Host "  [signing] Signing $path..." -ForegroundColor Yellow
    & $signtool sign /f "$certPath" /p "$certPass" /tr "http://timestamp.digicert.com" /td sha256 /fd sha256 "$path"
    if ($LASTEXITCODE -ne 0) { Write-Warning "  [signing] signtool returned $LASTEXITCODE" }
}

# -- Run NSIS -----------------------------------------------------------------
function Run-NSIS ([string]$variant, [hashtable]$defines) {
    $nsisArgs = @("/V2")
    foreach ($key in $defines.Keys) {
        $val = $defines[$key]
        if ($val) { $nsisArgs += "/D${key}=$val" } else { $nsisArgs += "/D$key" }
    }
    $nsisArgs += "/DOUTPUT_DIR=$OutputDir"
    $nsisArgs += "$InstallerDir\routelag-installer.nsi"

    Write-Host ""
    Write-Host "Building $variant installer..." -ForegroundColor Yellow

    & $makensis @nsisArgs
    if ($LASTEXITCODE -ne 0) { Write-Error "NSIS build failed for $variant"; exit 1 }

    $outFile = Join-Path $OutputDir "RouteLag-Beta-${variant}-Setup.exe"
    if (Test-Path $outFile) {
        $size = [math]::Round((Get-Item $outFile).Length / 1MB, 1)
        Write-Host "  Output: $outFile ($size MB)" -ForegroundColor Green
        Sign-Exe $outFile
    }
}

# -- Core installer -----------------------------------------------------------
$buildCore = $Core -or (-not $Full)
if ($buildCore) {
    Run-NSIS "Core" @{
        APP_SRC_DIR    = $AppSrcDir
        ENGINE_SRC_DIR = $EngineSrcDir
    }
}

# -- Full installer (only if HUD present and -Full or default) ----------------
$buildFull = $Full -or (-not $Core -and $hudAvailable)
if ($buildFull) {
    if (-not $hudAvailable) {
        Write-Warning "HUD Runtime not found at '$HudSrcDir' - skipping Full installer."
        Write-Warning "Build routelag-hud first: cd ..\routelag-hud ; npm run make"
    } else {
        Run-NSIS "Full" @{
            APP_SRC_DIR    = $AppSrcDir
            ENGINE_SRC_DIR = $EngineSrcDir
            HUD_SRC_DIR    = $HudSrcDir
        }
    }
}

Write-Host ""
Write-Host "=== Build complete ===" -ForegroundColor Cyan
Write-Host "Installers in: $OutputDir"
Get-ChildItem $OutputDir -Filter "*.exe" | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 1)
    Write-Host ("  {0}  ({1} MB)" -f $_.Name, $size)
}
