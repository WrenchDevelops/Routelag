param([string]$ExePath)
if (-not (Test-Path $ExePath)) { Write-Host "NOT FOUND: $ExePath"; exit 1 }
$bytes = [IO.File]::ReadAllBytes($ExePath)
$len = $bytes.Length
Write-Host "File: $ExePath"
Write-Host "Size MB: $([math]::Round($len/1MB,2))"
if ($len -lt 24) { Write-Host "Too small for footer"; exit 0 }
$magic = [Text.Encoding]::ASCII.GetString($bytes[($len-24)..($len-17)])
Write-Host "Footer magic: $magic"
if ($magic -ne 'RLPAYLD1') { Write-Host "No embedded payload"; exit 0 }
$offset = [BitConverter]::ToUInt64($bytes, $len-16)
$plength = [BitConverter]::ToUInt64($bytes, $len-8)
Write-Host "Payload offset=$offset length=$plength"
$tmp = Join-Path $env:TEMP 'rl-payload-test.zip'
[IO.File]::WriteAllBytes($tmp, $bytes[$offset..($offset+$plength-1)])
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($tmp)
foreach ($e in $zip.Entries) { Write-Host "$($e.FullName) $($e.Length)" }
Write-Host "Total entries: $($zip.Entries.Count)"
$zip.Dispose()
