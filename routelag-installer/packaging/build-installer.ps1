# Zer0 Custom Installer Build Script
#
# Builds the custom Tauri bootstrapper (Zer0-Beta-{Core,Full}-Setup.exe) by:
#   1. Building routelag-desktop (release) and locating the Engine binaries.
#   2. Optionally building routelag-hud (Full variant only).
#   3. Building the two Rust binaries (routelag-uninstall, then routelag-setup with the
#      uninstaller embedded via the `embed-uninstaller` feature).
#   4. Staging a payload folder (app/, engine/, optionally hud/, manifest.json), zipping it,
#      and appending that zip + a small footer directly onto a copy of routelag-setup.exe.
#
# Usage:
#   .\build-installer.ps1              - build Core + Full (if HUD build output is present)
#   .\build-installer.ps1 -Core        - Core only
#   .\build-installer.ps1 -Full        - Full only (requires HUD build output)
#   .\build-installer.ps1 -Dev         - skip building routelag-desktop/engine/HUD; use existing output
#   .\build-installer.ps1 -BuildHud    - also run `npm run build:windows` in routelag-hud first
#
# Environment variables (optional):
#   WINDOWS_CERT_PATH, WINDOWS_CERT_PASSWORD, WINDOWS_SIGNING_ENABLED
#
# Signing is OFF by default. Unsigned builds must only be used for internal / trusted
# private-beta testing. Do not publish or distribute publicly without Authenticode signing.

param(
    [switch]$Core,
    [switch]$Full,
    [switch]$Dev,
    [switch]$BuildHud,
    [switch]$BetaDallas
)

$ErrorActionPreference = "Stop"

$DallasBetaApiUrl = "http://216.152.154.137:3001"

# The bootstrapper must launch on a stock supported Windows installation before
# it can install anything. Link the MSVC CRT statically so routelag-setup,
# routelag-uninstall, and the packaged desktop executable do not require an
# already-installed Visual C++ Redistributable (for example VCRUNTIME140_1.dll).
$StaticCrtFlag = "-C target-feature=+crt-static"
if ($env:RUSTFLAGS -notmatch [regex]::Escape($StaticCrtFlag)) {
    $env:RUSTFLAGS = (($env:RUSTFLAGS, $StaticCrtFlag) -join " ").Trim()
}
Write-Host "Rust MSVC runtime: statically linked" -ForegroundColor DarkGray

$PackagingDir = $PSScriptRoot                                   # routelag-installer/packaging
$InstallerRoot = Split-Path $PackagingDir -Parent                # routelag-installer/
$RepoRoot = Split-Path $InstallerRoot -Parent                    # Routelag/ (contains all sibling apps)
$DesktopDir = Join-Path $RepoRoot "routelag-desktop"
$HudDir = Join-Path $RepoRoot "routelag-hud"
$SrcTauriDir = Join-Path $InstallerRoot "src-tauri"
$OutputDir = Join-Path $DesktopDir "dist\installers"
$StagingRoot = Join-Path $PackagingDir ".payload-staging"

$AppSrcDir = Join-Path $DesktopDir "src-tauri\target\release"
$EngineSrcDir = Join-Path $DesktopDir "src-tauri\engine\windows"
# NOTE: ow-electron-builder writes to routelag-hud\build\win-unpacked, NOT dist\win-unpacked
# (the old NSIS build.ps1 pointed at the wrong path and silently skipped the Full installer).
$HudSrcDir = Join-Path $HudDir "build\win-unpacked"

Write-Host ""
Write-Host "=== Zer0 Installer Builder (custom Tauri bootstrapper) ===" -ForegroundColor Cyan
Write-Host "Repo root:   $RepoRoot"
Write-Host "App output:  $AppSrcDir"
Write-Host "Engine dir:  $EngineSrcDir"
Write-Host "HUD dir:     $HudSrcDir"
Write-Host "Output dir:  $OutputDir"
Write-Host ""

# ── Build routelag-desktop (unless -Dev) ─────────────────────────────────────
if (-not $Dev) {
    Write-Host "Building routelag-desktop (release)..." -ForegroundColor Yellow
    if ($BetaDallas) {
        $env:VITE_ROUTELAG_API_URL = $DallasBetaApiUrl
        $env:VITE_ROUTELAG_BETA_MODE = "dallas"
        Write-Host "Beta Dallas API: $DallasBetaApiUrl" -ForegroundColor DarkGray
    }
    # Temporarily disable HUD + Replay Engine UI in shipped desktop builds.
    $env:VITE_ROUTELAG_ENABLE_HUD = "false"
    $env:VITE_ROUTELAG_ENABLE_REPLAY = "false"
    $desktopCargoFeatures = "custom-protocol,disable-hud"
    Write-Host "Desktop features: HUD=off, Replay=off" -ForegroundColor DarkGray
    Push-Location $DesktopDir
    try {
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
        $desktopDist = Join-Path $DesktopDir "dist\index.html"
        if (-not (Test-Path $desktopDist)) {
            throw "Desktop frontend dist missing at $desktopDist - cannot embed UI into Zer0.exe."
        }
        # custom-protocol embeds frontendDist; without it the release binary still loads
        # http://127.0.0.1:1420 and shows ERR_CONNECTION_REFUSED.
        cargo clean -p routelag-desktop --manifest-path src-tauri\Cargo.toml
        cargo build --release --features $desktopCargoFeatures --manifest-path src-tauri\Cargo.toml
        if ($LASTEXITCODE -ne 0) { throw "cargo build failed for routelag-desktop" }
    } finally {
        Pop-Location
    }
    Write-Host "routelag-desktop build complete." -ForegroundColor Green
}

$appExe = Join-Path $AppSrcDir "routelag-desktop.exe"
if (-not (Test-Path $appExe)) {
    throw "App executable not found: $appExe`nRun a routelag-desktop release build first, or omit -Dev."
}

# ── Build routelag-hud (only if requested; it's a large Overwolf/Electron build) ────
if ($BuildHud) {
    Write-Host "Building routelag-hud..." -ForegroundColor Yellow
    Push-Location $HudDir
    try {
        npm.cmd run build:windows
        if ($LASTEXITCODE -ne 0) { throw "npm run build:windows failed for routelag-hud" }
    } finally {
        Pop-Location
    }
}

$hudAvailable = Test-Path (Join-Path $HudSrcDir "RouteLagHUD.exe")
Write-Host "HUD available: $hudAvailable"

New-Item -ItemType Directory -Force $OutputDir | Out-Null

# ── Build the installer frontend (must exist before cargo embeds it) ─────────
# Bare `cargo build` does not run tauri.conf.json's beforeBuildCommand, so we
# build the Vite UI ourselves. Without this, the release exe tries to load
# http://127.0.0.1:1430 and shows ERR_CONNECTION_REFUSED.
Write-Host ""
Write-Host "Building installer frontend..." -ForegroundColor Yellow
Push-Location $InstallerRoot
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed for routelag-installer frontend" }
} finally {
    Pop-Location
}
$frontendDist = Join-Path $InstallerRoot "dist"
if (-not (Test-Path (Join-Path $frontendDist "index.html"))) {
    throw "Installer frontend dist missing at $frontendDist - cannot embed UI into the setup exe."
}

# ── Build the two installer binaries ─────────────────────────────────────────
# Always use the in-tree target dir. A leftover CARGO_TARGET_DIR (e.g. from a prior
# shell) would build into a different folder while we package the stale local exe.
$CargoTargetDir = Join-Path $SrcTauriDir "target"
$env:CARGO_TARGET_DIR = $CargoTargetDir

Write-Host ""
Write-Host "Building routelag-uninstall.exe..." -ForegroundColor Yellow
Push-Location $SrcTauriDir
try {
    # custom-protocol embeds frontendDist; without it the release binary still loads
    # http://127.0.0.1:1430 and shows ERR_CONNECTION_REFUSED.
    # Clean so tauri-build re-embeds the freshly built frontend.
    cargo clean -p routelag-installer
    cargo build --release --bin routelag-uninstall --features custom-protocol
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed for routelag-uninstall" }

    Write-Host "Building routelag-setup.exe (embedding uninstaller)..." -ForegroundColor Yellow
    cargo build --release --bin routelag-setup --features "custom-protocol,embed-uninstaller"
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed for routelag-setup" }
} finally {
    Pop-Location
}

$setupExeSrc = Join-Path $CargoTargetDir "release\routelag-setup.exe"
if (-not (Test-Path $setupExeSrc)) {
    throw "Built exe not found: $setupExeSrc"
}

# ── Code signing helper (same convention as the old NSIS build) ─────────────
function Invoke-SignExe([string]$Path) {
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
        Write-Warning "  [signing] signtool.exe not found - install the Windows SDK."
        return
    }
    Write-Host "  [signing] Signing $Path..." -ForegroundColor Yellow
    & $signtoolItem.FullName sign /f "$certPath" /p "$certPass" /tr "http://timestamp.digicert.com" /td sha256 /fd sha256 "$Path"
    if ($LASTEXITCODE -ne 0) { Write-Warning "  [signing] signtool returned $LASTEXITCODE" }
}

# ── Payload staging + zip ─────────────────────────────────────────────────────
function Get-DirSize([string]$Path) {
    if (-not (Test-Path $Path)) { return 0 }
    $sum = (Get-ChildItem $Path -Recurse -File | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return 0 }
    return [int64]$sum
}

function New-PayloadZip {
    param(
        [bool]$IncludeHud,
        [string]$ZipOutputPath
    )

    if (Test-Path $StagingRoot) { Remove-Item $StagingRoot -Recurse -Force }
    New-Item -ItemType Directory -Force $StagingRoot | Out-Null

    $appDir = Join-Path $StagingRoot "app"
    $engineDir = Join-Path $StagingRoot "engine"
    New-Item -ItemType Directory -Force $appDir | Out-Null
    New-Item -ItemType Directory -Force $engineDir | Out-Null

    Copy-Item $appExe (Join-Path $appDir "Zer0.exe")
    # Compatibility alias for upgrades / recovery tools that still look for RouteLag.exe
    Copy-Item $appExe (Join-Path $appDir "RouteLag.exe")
    $resourcesDir = Join-Path $AppSrcDir "resources"
    if (Test-Path $resourcesDir) {
        Copy-Item $resourcesDir (Join-Path $appDir "resources") -Recurse
    }

    Copy-Item (Join-Path $EngineSrcDir "*") $engineDir -Recurse -Force

    $hudBytes = 0
    if ($IncludeHud) {
        $hudDir = Join-Path $StagingRoot "hud"
        New-Item -ItemType Directory -Force $hudDir | Out-Null
        Copy-Item (Join-Path $HudSrcDir "*") $hudDir -Recurse -Force
        $hudBytes = Get-DirSize $hudDir
    }

    $appBytes = Get-DirSize $appDir
    $engineBytes = Get-DirSize $engineDir

    $manifest = [ordered]@{
        version        = (Get-Content (Join-Path $InstallerRoot "package.json") -Raw | ConvertFrom-Json).version
        hudIncluded    = [bool]$IncludeHud
        appSizeBytes   = $appBytes
        engineSizeBytes = $engineBytes
        hudSizeBytes   = $hudBytes
    }
    # Windows PowerShell 5.1 has no utf8NoBOM encoding; write UTF-8 without BOM explicitly.
    $manifestJson = $manifest | ConvertTo-Json -Compress
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText((Join-Path $StagingRoot "manifest.json"), $manifestJson, $utf8NoBom)

    if (Test-Path $ZipOutputPath) { Remove-Item $ZipOutputPath -Force }
    Compress-Archive -Path (Join-Path $StagingRoot "*") -DestinationPath $ZipOutputPath -CompressionLevel Optimal

    Remove-Item $StagingRoot -Recurse -Force
}

function Add-PayloadToExe {
    param([string]$ExePath, [string]$ZipPath)

    $exeLength = (Get-Item $ExePath).Length
    $zipBytes = [System.IO.File]::ReadAllBytes($ZipPath)
    $magic = [System.Text.Encoding]::ASCII.GetBytes("RLPAYLD1")
    $offsetBytes = [BitConverter]::GetBytes([uint64]$exeLength)
    $lengthBytes = [BitConverter]::GetBytes([uint64]$zipBytes.Length)

    $stream = [System.IO.File]::Open($ExePath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
    try {
        $stream.Write($zipBytes, 0, $zipBytes.Length)
        $stream.Write($magic, 0, $magic.Length)
        $stream.Write($offsetBytes, 0, $offsetBytes.Length)
        $stream.Write($lengthBytes, 0, $lengthBytes.Length)
    } finally {
        $stream.Dispose()
    }
}

function Build-Variant {
    param(
        [string]$Variant,
        [bool]$IncludeHud,
        [string]$OutFileName = ""
    )

    Write-Host ""
    Write-Host "Building $Variant installer..." -ForegroundColor Yellow

    $outFile = if ($OutFileName) {
        Join-Path $OutputDir $OutFileName
    } else {
        Join-Path $OutputDir "Zer0-Beta-$Variant-Setup.exe"
    }
    if (Test-Path $outFile) { Remove-Item $outFile -Force }
    Copy-Item $setupExeSrc $outFile

    $zipPath = Join-Path $PackagingDir "payload-$Variant.zip"
    New-PayloadZip -IncludeHud:$IncludeHud -ZipOutputPath $zipPath
    Add-PayloadToExe -ExePath $outFile -ZipPath $zipPath
    Remove-Item $zipPath -Force

    Invoke-SignExe $outFile

    $size = [math]::Round((Get-Item $outFile).Length / 1MB, 1)
    Write-Host "  Output: $outFile ($size MB)" -ForegroundColor Green

    if ($Variant -eq "Core") {
        $aliasFile = Join-Path $OutputDir "Zer0Setup.exe"
        Copy-Item $outFile $aliasFile -Force
        Write-Host "  Alias:  $aliasFile" -ForegroundColor Green
    }
}

# ── Dallas beta installer ─────────────────────────────────────────────────────
if ($BetaDallas) {
    if (-not $Dev) {
        $env:VITE_ROUTELAG_API_URL = $DallasBetaApiUrl
        $env:VITE_ROUTELAG_BETA_MODE = "dallas"
    }
    Build-Variant -Variant "Dallas" -IncludeHud $false -OutFileName "Zer0-Beta-Dallas-Setup.exe"
    $readmePath = Join-Path $OutputDir "README-BETA-TESTERS.txt"
    @"
Zer0 Beta Dallas Build — Tester Guide
=====================================

Install
-------
1. Run Zer0-Beta-Dallas-Setup.exe
2. Windows may show an unsigned beta warning — choose Run anyway
3. Complete the installer and click Finish to launch Zer0

Launch
------
1. Launch Zer0 normally — Windows will prompt for administrator permission
   (required for Start Optimization and Restore Internet)

Sign in
-------
1. Enter your beta access code (example: ROUTELAG-BETA)
2. No website, Google, Discord, or payment required

Test routing
------------
1. Open Routing and select Dallas Beta
2. Target: Fortnite NA 18.88.0.0/16 (all 18.88.x.x game servers)
3. Click Start Optimization (as admin)
4. Play Fortnite NA-Central and note ping / packet loss
5. Click Restore Internet when finished

Report back
-----------
Send ping, packet loss, errors, and screenshots to the Zer0 beta team.

API endpoint baked into this build:
$DallasBetaApiUrl
"@ | Set-Content -Path $readmePath -Encoding UTF8
    Write-Host "  Readme: $readmePath" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== Build complete ===" -ForegroundColor Cyan
    Write-Host "Installers in: $OutputDir"
    Get-ChildItem $OutputDir -Filter "*Dallas*" | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 1)
        Write-Host ("  {0}  ({1} MB)" -f $_.Name, $size)
    }
    $signingEnabled = $env:WINDOWS_SIGNING_ENABLED -eq "true"
    if (-not $signingEnabled) {
        Write-Host ""
        Write-Host "UNSIGNED BUILD WARNING - private-beta only; do not publish." -ForegroundColor Yellow
    }
    $inspectScript = Join-Path $PackagingDir "inspect-artifact-safety.ps1"
    if (Test-Path $inspectScript) {
        & powershell -ExecutionPolicy Bypass -File $inspectScript -OutputDir $OutputDir
    }
    return
}

# ── Core installer ────────────────────────────────────────────────────────────
$buildCore = ($Core -or (-not $Full -and -not $BetaDallas))
if ($buildCore) {
    Build-Variant -Variant "Core" -IncludeHud $false
}

# ── Full installer (only if HUD present and -Full or default) ────────────────
$buildFull = $Full -or (-not $Core -and $hudAvailable)
if ($buildFull) {
    if (-not $hudAvailable) {
        Write-Warning "HUD Runtime not found at '$HudSrcDir' - skipping Full installer."
        Write-Warning "Build routelag-hud first: cd ..\routelag-hud ; npm run build:windows  (or pass -BuildHud)"
    } else {
        Build-Variant -Variant "Full" -IncludeHud $true
    }
}

Write-Host ""
Write-Host "=== Build complete ===" -ForegroundColor Cyan
Write-Host "Installers in: $OutputDir"
Get-ChildItem $OutputDir -Filter "*.exe" | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 1)
    Write-Host ("  {0}  ({1} MB)" -f $_.Name, $size)
}

$signingEnabled = $env:WINDOWS_SIGNING_ENABLED -eq "true"
if (-not $signingEnabled) {
    Write-Host ""
    Write-Host "UNSIGNED BUILD WARNING" -ForegroundColor Yellow
    Write-Host "  Authenticode signing was skipped. Safe for internal / trusted private-beta only." -ForegroundColor Yellow
    Write-Host "  Do not publish this build. SmartScreen warnings are expected." -ForegroundColor Yellow
}

$privateBetaReadme = Join-Path $OutputDir "README-PRIVATE-BETA.txt"
@"
Zer0 Private-Beta Installer - Tester Notes
==========================================

UNSIGNED BUILD
--------------
This setup EXE is typically unsigned. Windows may show SmartScreen / Defender
warnings. Only run it if you received it directly from the Zer0 team.

ADMINISTRATOR PERMISSION
------------------------
Installing to Program Files requires a UAC prompt. Starting Optimization and
Restore Internet also require administrator permission.

MANUAL UPDATES
--------------
Auto-update is disabled. To update: Restore Internet, quit Zer0, run the newer
setup EXE, then relaunch. Do not install update EXEs from unofficial sources.

UNINSTALL
---------
Use Apps and Features -> Zer0 Beta, or Start Menu -> Zer0 -> Uninstall Zer0.
Uninstall disconnects Zer0/RouteLag owned tunnels only - it does not remove
other WireGuard or VPN software. User data is kept unless you opt in to wipe.

SUPPORT
-------
See routelag-desktop/docs/WINDOWS-INSTALL.md in the repo for packaging details.
"@ | Set-Content -Path $privateBetaReadme -Encoding UTF8
Write-Host "  Readme: $privateBetaReadme" -ForegroundColor Green

$inspectScript = Join-Path $PackagingDir "inspect-artifact-safety.ps1"
if (Test-Path $inspectScript) {
    Write-Host ""
    & powershell -ExecutionPolicy Bypass -File $inspectScript -OutputDir $OutputDir
}
