; ================================================
; RouteLag Installer — defines.nsh
; Central constants, colors, paths, and section IDs
; ================================================

; ----- Product -----
!define PRODUCT_NAME        "RouteLag Beta"
!define PRODUCT_VERSION     "0.1.4"
!define PRODUCT_PUBLISHER   "RouteLag"
!define PRODUCT_URL         "https://routelag.com"
!define PRODUCT_EXE         "RouteLag Beta.exe"
!define PRODUCT_UNINST_EXE  "Uninstall RouteLag.exe"

; ----- Registry -----
!define REG_APP    "Software\RouteLag"
!define REG_UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\RouteLag Beta"

; ----- Default install dir -----
!define INSTDIR_DEFAULT "$PROGRAMFILES64\RouteLag"

; ----- Log file -----
!define LOG_FILE "$LOCALAPPDATA\RouteLag\logs\installer.log"

; ----- Source paths (relative to installer/ dir, set by build.ps1 defines) -----
; /DAPP_SRC_DIR=..\..\src-tauri\target\release
; /DENGINE_SRC_DIR=..\..\src-tauri\engine\windows
; /DHUD_SRC_DIR=..\..\..\routelag-hud\dist\win-unpacked

; Section IDs (SEC_APP, SEC_ENGINE, SEC_HUD, SEC_SHORTCUTS) are assigned
; automatically by NSIS from Section "Name" SEC_* labels in the main script.

; ----- Install type constants -----
!define INSTALL_TYPE_STANDARD   1   ; App + Engine
!define INSTALL_TYPE_FULL       2   ; App + Engine + HUD
!define INSTALL_TYPE_CUSTOM     3

; ----- Colors for SetCtlColors (RRGGBB) -----
!define CLR_BG          "070A12"
!define CLR_PANEL       "0D1220"
!define CLR_PANEL2      "111827"
!define CLR_TEXT        "F4F7FB"
!define CLR_MUTED       "9AA4B7"
!define CLR_PURPLE      "8B5CF6"
!define CLR_PURPLE_LT   "A78BFA"
!define CLR_BORDER      "232B3D"
!define CLR_SUCCESS     "4ADE80"
!define CLR_WARNING     "FACC15"
!define CLR_ERROR       "F87171"

; ----- Size estimates (MB) -----
!define SIZE_APP_MB     85
!define SIZE_ENGINE_MB  12
!define SIZE_HUD_MB     220
