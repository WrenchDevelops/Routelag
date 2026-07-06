# Generate dark branded BMP assets for the NSIS installer.
# Creates header.bmp (150x57) and sidebar.bmp (164x314) using .NET System.Drawing.
# Run: .\gen-assets.ps1  (from the installer/ directory)

param(
    [string]$OutputDir = "$PSScriptRoot\assets"
)

Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force $OutputDir | Out-Null

$bgColor     = [System.Drawing.Color]::FromArgb(255,  7, 10, 18)   # #070A12
$panelColor  = [System.Drawing.Color]::FromArgb(255, 13, 18, 32)   # #0D1220
$purpleColor = [System.Drawing.Color]::FromArgb(255,139, 92,246)   # #8B5CF6
$textColor   = [System.Drawing.Color]::FromArgb(255,244,247,251)   # #F4F7FB
$mutedColor  = [System.Drawing.Color]::FromArgb(255,154,164,183)   # #9AA4B7
$borderColor = [System.Drawing.Color]::FromArgb(255, 35, 43, 61)   # #232B3D

# ── Header bitmap (150 × 57) ────────────────────────────────────────────────
# Shown in the top-right corner of each wizard page header area.
function New-HeaderBmp {
    $w = 150; $h = 57
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g   = [System.Drawing.Graphics]::FromImage($bmp)

    # Background gradient (top: panel → bottom: bg)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        [System.Drawing.Point]::new(0, 0),
        [System.Drawing.Point]::new(0, $h),
        $panelColor,
        $bgColor
    )
    $g.FillRectangle($brush, 0, 0, $w, $h)

    # Purple accent bar at top
    $accentBrush = New-Object System.Drawing.SolidBrush $purpleColor
    $g.FillRectangle($accentBrush, 0, 0, $w, 2)

    # "RouteLag" wordmark in header
    $font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush $textColor
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Far
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("RouteLag", $font, $textBrush, [System.Drawing.RectangleF]::new(0, 4, $w - 10, $h - 8), $sf)

    # Bottom border line
    $borderPen = New-Object System.Drawing.Pen $borderColor
    $g.DrawLine($borderPen, 0, $h-1, $w, $h-1)

    $path = Join-Path $OutputDir "header.bmp"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "  Created: $path"
}

# ── Sidebar bitmap (164 × 314) ───────────────────────────────────────────────
# Shown on the left side of Welcome and Finish pages (MUI_WELCOMEFINISHPAGE_BITMAP).
function New-SidebarBmp {
    $w = 164; $h = 314
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Deep navy background
    $bgBrush = New-Object System.Drawing.SolidBrush $bgColor
    $g.FillRectangle($bgBrush, 0, 0, $w, $h)

    # Subtle purple gradient panel in the upper half
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        [System.Drawing.Point]::new(0, 0),
        [System.Drawing.Point]::new($w, $h / 2),
        [System.Drawing.Color]::FromArgb(60, 139, 92, 246),
        [System.Drawing.Color]::Transparent
    )
    $g.FillRectangle($gradBrush, 0, 0, $w, $h)

    # Purple accent bar on right edge
    $accentBrush = New-Object System.Drawing.SolidBrush $purpleColor
    $g.FillRectangle($accentBrush, $w - 3, 0, 3, $h)

    # Large "R" monogram
    $bigFont = New-Object System.Drawing.Font("Segoe UI", 72, [System.Drawing.FontStyle]::Bold)
    $monoBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 255, 255, 255))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("R", $bigFont, $monoBrush, [System.Drawing.RectangleF]::new(0, 20, $w, 120), $sf)

    # Product name
    $nameFont  = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $nameBrush = New-Object System.Drawing.SolidBrush $textColor
    $sf2 = New-Object System.Drawing.StringFormat
    $sf2.Alignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("RouteLag", $nameFont, $nameBrush, [System.Drawing.RectangleF]::new(0, 155, $w, 22), $sf2)

    $subFont  = New-Object System.Drawing.Font("Segoe UI", 8)
    $subBrush = New-Object System.Drawing.SolidBrush $mutedColor
    $g.DrawString("Beta", $subFont, $subBrush, [System.Drawing.RectangleF]::new(0, 180, $w, 16), $sf2)

    # Bottom tagline
    $tagFont  = New-Object System.Drawing.Font("Segoe UI", 7)
    $g.DrawString("Routing  •  Replay  •  HUD", $tagFont, $subBrush,
        [System.Drawing.RectangleF]::new(10, $h - 36, $w - 20, 20), $sf2)

    $path = Join-Path $OutputDir "sidebar.bmp"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "  Created: $path"
}

# ── ICO placeholder (copy from Tauri icons if not present) ──────────────────
function Copy-Icon {
    $src = Join-Path $PSScriptRoot "..\src-tauri\icons\icon.ico"
    $dst = Join-Path $OutputDir "logo.ico"
    if (Test-Path $src) {
        Copy-Item -Force $src $dst
        Write-Host "  Copied icon: $dst"
    } else {
        Write-Warning "  icon.ico not found at $src - place a logo.ico in installer/assets/ manually."
    }
}

Write-Host "Generating RouteLag installer assets..."
New-HeaderBmp
New-SidebarBmp
Copy-Icon
Write-Host "Done. Assets saved to: $OutputDir"
