# Inspect packaged Zer0 installer artifacts for private-beta safety.
# Does not publish or distribute. Records hashes and scans for obvious secrets / dev URLs.
#
# Usage (from repo root or packaging dir):
#   powershell -ExecutionPolicy Bypass -File .\routelag-installer\packaging\inspect-artifact-safety.ps1
#   powershell -ExecutionPolicy Bypass -File .\inspect-artifact-safety.ps1 -OutputDir "..\..\routelag-desktop\dist\installers"

param(
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$PackagingDir = $PSScriptRoot
$InstallerRoot = Split-Path $PackagingDir -Parent
$RepoRoot = Split-Path $InstallerRoot -Parent
$DesktopDir = Join-Path $RepoRoot "routelag-desktop"

if (-not $OutputDir) {
    $OutputDir = Join-Path $DesktopDir "dist\installers"
}

Write-Host ""
Write-Host "=== Zer0 artifact safety inspection ===" -ForegroundColor Cyan
Write-Host "Output dir: $OutputDir"

if (-not (Test-Path $OutputDir)) {
    Write-Warning "Output directory does not exist yet: $OutputDir"
    exit 0
}

$reportPath = Join-Path $OutputDir "ARTIFACT-SAFETY-REPORT.txt"
$patterns = @(
    "sk_live_",
    "sk_test_",
    "rk_live_",
    "whsec_",
    "BEGIN RSA PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN PRIVATE KEY",
    "WINDOWS_CERT_PASSWORD",
    "CLERK_SECRET",
    "STRIPE_SECRET",
    "firebase_private_key",
    "127.0.0.1:1420",
    "127.0.0.1:1430",
    "localhost:1420",
    "localhost:1430",
    "VITE_DEV"
)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("Zer0 Artifact Safety Report")
$lines.Add("Generated: $(Get-Date -Format o)")
$lines.Add("Directory: $OutputDir")
$lines.Add("")
$lines.Add("NOTE: This scan is heuristic (string search). It does not prove absence of secrets.")
$lines.Add("Unsigned builds are expected for private beta until Authenticode signing is enabled.")
$lines.Add("")

$exeFiles = Get-ChildItem $OutputDir -Filter "*.exe" -File -ErrorAction SilentlyContinue
if (-not $exeFiles) {
    $lines.Add("No .exe artifacts found.")
    [System.IO.File]::WriteAllLines($reportPath, $lines)
    Write-Host "No EXE artifacts found." -ForegroundColor Yellow
    exit 0
}

foreach ($file in $exeFiles) {
    $hash = Get-FileHash -Algorithm SHA256 -Path $file.FullName
    $sizeMb = [math]::Round($file.Length / 1MB, 2)
    $sig = $null
    try {
        $sig = Get-AuthenticodeSignature -FilePath $file.FullName
    } catch {
        $sig = $null
    }
    $status = if ($sig) { $sig.Status.ToString() } else { "Unknown" }

    $entry = "FILE: $($file.Name)"
    $lines.Add($entry)
    $lines.Add("  Path:   $($file.FullName)")
    $lines.Add("  Size:   $sizeMb MB")
    $lines.Add("  SHA256: $($hash.Hash)")
    $lines.Add("  AuthSig:$status")
    Write-Host ("{0}`n  SHA256={1}`n  Signature={2}" -f $file.Name, $hash.Hash, $status)

    # Binary string scan — may false-positive; still useful for localhost / PEM blobs.
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    # Cap scan window for very large EXEs (first 32MB + last 8MB covers bootstrap + appended zip footer area roughly).
    $chunks = New-Object System.Collections.Generic.List[byte[]]
    if ($bytes.Length -le 40MB) {
        $chunks.Add($bytes)
    } else {
        $headLen = [Math]::Min($bytes.Length, 32MB)
        $tailLen = [Math]::Min($bytes.Length, 8MB)
        $head = New-Object byte[] $headLen
        [Array]::Copy($bytes, 0, $head, 0, $headLen)
        $tail = New-Object byte[] $tailLen
        [Array]::Copy($bytes, $bytes.Length - $tailLen, $tail, 0, $tailLen)
        $chunks.Add($head)
        $chunks.Add($tail)
    }

    $hits = New-Object System.Collections.Generic.List[string]
    foreach ($chunk in $chunks) {
        $text = [System.Text.Encoding]::ASCII.GetString($chunk)
        foreach ($pattern in $patterns) {
            if ($text.Contains($pattern)) {
                if (-not $hits.Contains($pattern)) { $hits.Add($pattern) }
            }
        }
    }

    if ($hits.Count -gt 0) {
        $lines.Add("  SECRET/DEV HITS: $($hits -join ', ')")
        Write-Host ("  WARNING hits: {0}" -f ($hits -join ", ")) -ForegroundColor Yellow
        if ($hits -contains "127.0.0.1:1420" -or $hits -contains "127.0.0.1:1430") {
            $lines.Add("  NOTE: 127.0.0.1:1420/1430 often come from Tauri tauri.conf.json")
            $lines.Add("  devUrl embedded as metadata. Release builds use custom-protocol")
            $lines.Add("  + frontendDist and do not load the Vite dev server at runtime.")
        }
    } else {
        $lines.Add("  SECRET/DEV HITS: none (heuristic)")
        Write-Host "  Secret/dev heuristic: clean" -ForegroundColor Green
    }
    $lines.Add("")
}

# Frontend dist source-map check
$distDir = Join-Path $DesktopDir "dist"
$mapCount = 0
if (Test-Path $distDir) {
    $mapCount = @(Get-ChildItem $distDir -Recurse -Filter "*.map" -File -ErrorAction SilentlyContinue).Count
}
$lines.Add("Desktop dist *.map count: $mapCount (expected 0 for production)")
Write-Host "Desktop source map count: $mapCount"

[System.IO.File]::WriteAllLines($reportPath, $lines)
Write-Host ""
Write-Host "Report written: $reportPath" -ForegroundColor Cyan
