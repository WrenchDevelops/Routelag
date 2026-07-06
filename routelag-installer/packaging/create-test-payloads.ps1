param()

$ErrorActionPreference = "Stop"

$InstallerRoot = Split-Path $PSScriptRoot -Parent
$PayloadDir = Join-Path $InstallerRoot "installer"
$WorkDir = Join-Path $PayloadDir ".test-payload-work"

if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Force $PayloadDir | Out-Null
New-Item -ItemType Directory -Force $WorkDir | Out-Null

function New-ZipPayload {
    param(
        [string]$Name,
        [hashtable]$Files
    )

    $dir = Join-Path $WorkDir $Name
    New-Item -ItemType Directory -Force $dir | Out-Null
    foreach ($relative in $Files.Keys) {
        $path = Join-Path $dir $relative
        New-Item -ItemType Directory -Force (Split-Path $path -Parent) | Out-Null
        [System.IO.File]::WriteAllText($path, $Files[$relative], [System.Text.UTF8Encoding]::new($false))
    }
    $zipPath = Join-Path $PayloadDir "test-$Name.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $dir "*") -DestinationPath $zipPath -CompressionLevel Optimal
    return $zipPath
}

$baseZip = New-ZipPayload "base-app" @{
    "RouteLag.exe" = "RouteLag test app payload"
    "resources\app.txt" = "RouteLag resources"
}
$engineZip = New-ZipPayload "engine" @{
    "RouteLagEngine.exe" = "RouteLag test engine"
    "routelag-wg.exe" = "RouteLag test WireGuard helper"
}
$hudZip = New-ZipPayload "hud" @{
    "RouteLagHUD.exe" = "RouteLag test HUD runtime"
    "resources\hud.txt" = "HUD resources"
}

function Hash([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 $Path).Hash.ToLowerInvariant()
}

$manifest = [ordered]@{
    version = "0.1.4-dev"
    channel = "dev"
    components = [ordered]@{
        baseApp = [ordered]@{
            version = "0.1.4-dev"
            url = "file://$baseZip"
            sha256 = Hash $baseZip
            sizeBytes = (Get-Item $baseZip).Length
        }
        engine = [ordered]@{
            version = "0.1.4-dev"
            url = "file://$engineZip"
            sha256 = Hash $engineZip
            sizeBytes = (Get-Item $engineZip).Length
        }
        hudRuntime = [ordered]@{
            version = "0.1.0-dev"
            url = "file://$hudZip"
            sha256 = Hash $hudZip
            sizeBytes = (Get-Item $hudZip).Length
        }
    }
}

$manifestJson = $manifest | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText((Join-Path $PayloadDir "dev-manifest.json"), $manifestJson, [System.Text.UTF8Encoding]::new($false))

Remove-Item $WorkDir -Recurse -Force
Write-Host "Created test payloads and dev manifest in $PayloadDir"
