; ================================================
; RouteLag Beta — Windows Installer (polished v2)
; routelag-installer.nsi
;
; Requirements: NSIS 3.09+, NsDialogs, nsExec, System, dwmapi
; Build via: installer\build.ps1  (see README)
;
; /DAPP_SRC_DIR=path        path to Tauri release build output
; /DENGINE_SRC_DIR=path     path to engine binaries
; /DHUD_SRC_DIR=path        include HUD Runtime (Full installer)
; /DOUTPUT_DIR=path         output directory for setup EXE
; ================================================

Unicode true
ManifestDPIAware true
ManifestSupportedOS all
BrandingText " "          ; clear default NSIS branding text

SetCompressor /SOLID lzma
SetCompressorDictSize 32

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "Sections.nsh"
!include "nsDialogs.nsh"

!include "includes\defines.nsh"
!include "includes\ui.nsh"
!include "includes\registry.nsh"
!include "includes\logging.nsh"

; ── Build variant ─────────────────────────────────────────────────────────────
!ifdef HUD_SRC_DIR
  !define INSTALLER_SUFFIX "Full"
!else
  !define INSTALLER_SUFFIX "Core"
!endif

; ── Output ────────────────────────────────────────────────────────────────────
!ifdef OUTPUT_DIR
  OutFile "${OUTPUT_DIR}\RouteLag-Beta-${INSTALLER_SUFFIX}-Setup.exe"
!else
  OutFile "..\dist\installers\RouteLag-Beta-${INSTALLER_SUFFIX}-Setup.exe"
!endif

Name "${PRODUCT_NAME}"
InstallDir "${INSTDIR_DEFAULT}"
InstallDirRegKey HKCU "${REG_APP}" "InstallPath"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

; ── MUI config (header bitmap + icon; body is NsDialogs) ─────────────────────
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT  "Are you sure you want to cancel the installation?"
!define MUI_ICON               "assets\logo.ico"
!define MUI_UNICON             "assets\logo.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "assets\header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEFINISHPAGE_BITMAP "assets\sidebar.bmp"
!define MUI_INSTFILESPAGE_PROGRESSBAR smooth
!define MUI_CUSTOMFUNCTION_GUIINIT   DarkModeInit

; ── Variables ─────────────────────────────────────────────────────────────────
Var Dialog
Var InstallType       ; ${INSTALL_TYPE_STANDARD} | ${INSTALL_TYPE_FULL} | ${INSTALL_TYPE_CUSTOM}
Var InstallHUD        ; "1" or "0"
Var InstallShortcuts  ; "1" or "0"
Var LaunchAfterInstall ; "1" or "0"  captured from complete page
Var ExistingInstall   ; prior install path or ""
Var HudAvailable      ; "1" if HUD source files present in this build

; Font handles (created once in .onInit)
Var hFont_H1
Var hFont_H2
Var hFont_Body
Var hFont_Small
Var hFont_Mono

; Radio/checkbox handles reused across pages
Var hRad1
Var hRad2
Var hRad3
Var hCB_HUD
Var hCB_Shortcuts
Var hCB_Launch

; ── Page sequence ─────────────────────────────────────────────────────────────
Page custom pg_Existing_Create  pg_Existing_Leave
Page custom pg_Welcome_Create   pg_Welcome_Leave
Page custom pg_Type_Create      pg_Type_Leave
Page custom pg_Components_Create pg_Components_Leave
Page directory  pg_Dir_Pre "" pg_Dir_Leave
Page custom pg_Ready_Create     pg_Ready_Leave
Page instfiles  pg_Progress_Pre pg_Progress_Show
Page custom pg_Complete_Create  ""

UninstPage custom un.pg_Confirm_Create un.pg_Confirm_Leave
UninstPage instfiles

; ── Installer init ────────────────────────────────────────────────────────────

Function DarkModeInit
  ${ApplyDarkWindow}
FunctionEnd

Function .onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

  ; ---- Fonts (CLEARTYPE quality = 5, ANTIALIASED = 4) ----
  ${CreateFont} $hFont_H1    22 700
  ${CreateFont} $hFont_H2    12 600
  ${CreateFont} $hFont_Body  10 400
  ${CreateFont} $hFont_Small  9 400
  System::Call "gdi32::CreateFont(i -10, i 0, i 0, i 0, i 400, i 0, i 0, i 0, i 0, i 0, i 0, i 4, i 1, t 'Consolas') p.s"
  Pop $hFont_Mono

  ; ---- HUD availability ----
  StrCpy $HudAvailable "0"
  !ifdef HUD_SRC_DIR
    IfFileExists "${HUD_SRC_DIR}\RouteLagHUD.exe" +2 +1
    Goto no_hud
    StrCpy $HudAvailable "1"
    no_hud:
  !endif

  ; ---- Default install type ----
  ${If} $HudAvailable == "1"
    StrCpy $InstallType  ${INSTALL_TYPE_FULL}
    StrCpy $InstallHUD   "1"
  ${Else}
    StrCpy $InstallType  ${INSTALL_TYPE_STANDARD}
    StrCpy $InstallHUD   "0"
  ${EndIf}
  StrCpy $InstallShortcuts    "1"
  StrCpy $LaunchAfterInstall  "1"

  ; ---- Detect existing install ----
  StrCpy $ExistingInstall ""
  ReadRegStr $0 HKCU "${REG_APP}" "InstallPath"
  ${If} $0 != ""
    IfFileExists "$0\${PRODUCT_EXE}" 0 +2
    StrCpy $ExistingInstall $0
    StrCpy $INSTDIR $0
  ${EndIf}
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: EXISTING INSTALL (shown only when already installed)
; ════════════════════════════════════════════════════════════════════════════

Function pg_Existing_Create
  ${If} $ExistingInstall == ""
    Abort  ; skip entirely on fresh install
  ${EndIf}

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${DarkBg}
  ${HideBack}
  ${SetNextText}  "Continue >"
  ${SetCancelText} "Exit"

  ; ── Badge ──
  ${NSD_CreateLabel} 20 18 70u 10u "RouteLag"
  Pop $0
  ${PurpleCtl} $0
  ${ApplyFont} $0 $hFont_H2

  ; ── Title ──
  ${NSD_CreateLabel} 20 34 92% 14u "RouteLag is already installed"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 20 54 92% 10u "Version $ExistingInstall is installed at $ExistingInstall."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${HRule} 72u

  ; ── Options ──
  ${NSD_CreateLabel} 20 80u 92% 9u "Choose how to proceed:"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${NSD_CreateRadioButton} 26 93u 92% 11u "Update  —  reinstall over the current version"
  Pop $hRad1
  ${DarkCtl} $hRad1
  ${ApplyFont} $hRad1 $hFont_Body
  ${NSD_Check} $hRad1

  ${NSD_CreateRadioButton} 26 110u 92% 11u "Repair  —  restore any missing or damaged files"
  Pop $hRad2
  ${DarkCtl} $hRad2
  ${ApplyFont} $hRad2 $hFont_Body

  ${NSD_CreateRadioButton} 26 127u 92% 11u "Uninstall  —  remove RouteLag from this computer"
  Pop $hRad3
  ${DarkCtl} $hRad3
  ${ApplyFont} $hRad3 $hFont_Body

  nsDialogs::Show
FunctionEnd

Function pg_Existing_Leave
  ${NSD_GetState} $hRad3 $0
  ${If} $0 == ${BST_CHECKED}
    ExecWait '"$ExistingInstall\${PRODUCT_UNINST_EXE}" /S'
    Quit
  ${EndIf}
  ; Update and Repair both fall through to the rest of the installer
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: WELCOME
; ════════════════════════════════════════════════════════════════════════════

Function pg_Welcome_Create
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${DarkBg}
  ${HideBack}
  ${SetNextText}  "Get Started  >"
  ${SetCancelText} "Exit"

  ; ── Wordmark ──
  ${NSD_CreateLabel} 20 18 90u 13u "RouteLag"
  Pop $0
  ${PurpleCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 20 37 120u 9u "Beta  ·  v${PRODUCT_VERSION}"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${HRule} 54u

  ; ── Headline ──
  ${NSD_CreateLabel} 20 64u 92% 14u "Welcome to RouteLag"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 20 84u 92% 18u "Optimize your Fortnite connection, review replays, and unlock live in-game stats."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${HRule} 108u

  ; ── Feature grid: 3 columns ──
  ; Card 1
  ${NSD_CreateLabel} 20 116u 28% 9u "Routing Optimization"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H2

  ${NSD_CreateLabel} 20 128u 28% 20u "Lower ping, better routes, and real-time connection stability."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ; Card 2
  ${NSD_CreateLabel} 36% 116u 28% 9u "PathGen Replay Engine"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H2

  ${NSD_CreateLabel} 36% 128u 28% 20u "Import Fortnite replays and review real match data."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ; Card 3
  ${NSD_CreateLabel} 68% 116u 29% 9u "RouteLag HUD"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H2

  ${NSD_CreateLabel} 68% 128u 29% 20u "Optional live Fortnite overlay with real-time stats."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${HRule} 155u

  ; ── Footer ──
  ${NSD_CreateLabel} 20 160u 92% 8u "routelag.com  ·  Privacy  ·  Terms  ·  Support (legal drafts; hosted URLs pending)"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  nsDialogs::Show
FunctionEnd

Function pg_Welcome_Leave
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: INSTALL TYPE
; ════════════════════════════════════════════════════════════════════════════

Function pg_Type_Create
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${DarkBg}
  ${SetNextText}  "Continue  >"
  ${SetCancelText} "Exit"

  ; ── Header ──
  ${NSD_CreateLabel} 20 18 92% 13u "Choose Installation"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 20 36 92% 9u "Select what to install. You can always change this later."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${HRule} 52u

  ; ── Standard ──
  ${NSD_CreateRadioButton} 20 62u 92% 11u "Standard  (Recommended)"
  Pop $hRad1
  ${DarkCtl} $hRad1
  ${ApplyFont} $hRad1 $hFont_H2

  ${NSD_CreateLabel} 34 76u 88% 14u "Installs the RouteLag app with core routing and replay features. Does not include live HUD overlays. Best for most users."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ; ── Full ──
  ${NSD_CreateRadioButton} 20 98u 92% 11u "Full Install"
  Pop $hRad2
  ${DarkCtl} $hRad2
  ${ApplyFont} $hRad2 $hFont_H2

  ${NSD_CreateLabel} 34 112u 88% 14u "Installs RouteLag plus the HUD Runtime for live Fortnite overlays. Approximately ${SIZE_HUD_MB} MB extra."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${If} $HudAvailable == "0"
    EnableWindow $hRad2 0
    ${NSD_CreateLabel} 34 128u 88% 9u "Not available in this installer build."
    Pop $0
    ${ErrorCtl} $0
    ${ApplyFont} $0 $hFont_Small
  ${EndIf}

  ; ── Custom ──
  ${NSD_CreateRadioButton} 20 142u 92% 11u "Custom"
  Pop $hRad3
  ${DarkCtl} $hRad3
  ${ApplyFont} $hRad3 $hFont_H2

  ${NSD_CreateLabel} 34 156u 88% 9u "Choose exactly which components to install."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ; ── Apply saved choice ──
  ${If} $InstallType == ${INSTALL_TYPE_FULL}
    ${NSD_Check} $hRad2
  ${ElseIf} $InstallType == ${INSTALL_TYPE_CUSTOM}
    ${NSD_Check} $hRad3
  ${Else}
    ${NSD_Check} $hRad1
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function pg_Type_Leave
  ${NSD_GetState} $hRad1 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallType ${INSTALL_TYPE_STANDARD}
    StrCpy $InstallHUD "0"
    Return
  ${EndIf}
  ${NSD_GetState} $hRad2 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallType ${INSTALL_TYPE_FULL}
    StrCpy $InstallHUD "1"
    Return
  ${EndIf}
  StrCpy $InstallType ${INSTALL_TYPE_CUSTOM}
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: COMPONENT SELECTION (Custom only)
; ════════════════════════════════════════════════════════════════════════════

Function pg_Components_Create
  ${If} $InstallType != ${INSTALL_TYPE_CUSTOM}
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${DarkBg}
  ${SetNextText}  "Continue  >"
  ${SetCancelText} "Exit"

  ; ── Header ──
  ${NSD_CreateLabel} 20 18 92% 13u "Choose Components"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 20 36 92% 9u "Required components are always installed. Optional components can be added later."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${HRule} 52u

  ; ── RouteLag App (required) ──
  ${NSD_CreateCheckBox} 20 62u 70% 11u "RouteLag App"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H2
  ${NSD_Check} $0
  EnableWindow $0 0

  ${NSD_CreateLabel} 20 75u 60% 9u "Routing, Replay Engine, account, profile, and settings."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${NSD_CreateLabel} 78% 62u 20% 9u "~${SIZE_APP_MB} MB"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${HRule} 88u

  ; ── RouteLag Engine (required) ──
  ${NSD_CreateCheckBox} 20 96u 70% 11u "RouteLag Engine"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H2
  ${NSD_Check} $0
  EnableWindow $0 0

  ${NSD_CreateLabel} 20 109u 60% 9u "Connection routing and optimization tools. Required for routing features."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${NSD_CreateLabel} 78% 96u 20% 9u "~${SIZE_ENGINE_MB} MB"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${HRule} 122u

  ; ── HUD Runtime (optional) ──
  ${NSD_CreateCheckBox} 20 130u 70% 11u "RouteLag HUD Runtime  (optional)"
  Pop $hCB_HUD
  ${DarkCtl} $hCB_HUD
  ${ApplyFont} $hCB_HUD $hFont_H2

  ${If} $HudAvailable == "1"
    ${If} $InstallHUD == "1"
      ${NSD_Check} $hCB_HUD
    ${EndIf}
  ${Else}
    EnableWindow $hCB_HUD 0
  ${EndIf}

  ${NSD_CreateLabel} 20 143u 60% 14u "Required only for live Fortnite HUD overlays. Can be added later from inside RouteLag."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${If} $HudAvailable == "0"
    ${NSD_CreateLabel} 20 159u 70% 9u "Not available in this installer."
    Pop $0
    ${ErrorCtl} $0
    ${ApplyFont} $0 $hFont_Small
  ${Else}
    ${NSD_CreateLabel} 78% 130u 20% 9u "~${SIZE_HUD_MB} MB"
    Pop $0
    ${MutedCtl} $0
    ${ApplyFont} $0 $hFont_Small
  ${EndIf}

  ${HRule} 173u

  ; ── Shortcuts (optional) ──
  ${NSD_CreateCheckBox} 20 181u 92% 11u "Desktop and Start Menu shortcuts"
  Pop $hCB_Shortcuts
  ${DarkCtl} $hCB_Shortcuts
  ${ApplyFont} $hCB_Shortcuts $hFont_Body
  ${If} $InstallShortcuts == "1"
    ${NSD_Check} $hCB_Shortcuts
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function pg_Components_Leave
  ${NSD_GetState} $hCB_HUD       $0
  StrCpy $InstallHUD       $0
  ${NSD_GetState} $hCB_Shortcuts $0
  StrCpy $InstallShortcuts $0
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: DIRECTORY
; ════════════════════════════════════════════════════════════════════════════

Function pg_Dir_Pre
FunctionEnd

Function pg_Dir_Leave
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: READY TO INSTALL
; ════════════════════════════════════════════════════════════════════════════

Function pg_Ready_Create
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${DarkBg}
  ${SetNextText}  "Install RouteLag"
  ${SetCancelText} "Exit"

  ; ── Header ──
  ${NSD_CreateLabel} 20 18 92% 13u "Ready to Install"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 20 36 92% 9u "Review your choices before RouteLag is installed."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${HRule} 52u

  ; ── Summary rows ──
  ; Col A = muted label, Col B = value
  ${NSD_CreateLabel} 20 60u 36% 9u "Install location"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body
  ${NSD_CreateLabel} 58% 60u 40% 9u "$INSTDIR"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${NSD_CreateLabel} 20 74u 36% 9u "RouteLag App"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body
  ${NSD_CreateLabel} 58% 74u 40% 9u "Included"
  Pop $0
  ${SuccessCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${NSD_CreateLabel} 20 87u 36% 9u "RouteLag Engine"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body
  ${NSD_CreateLabel} 58% 87u 40% 9u "Included"
  Pop $0
  ${SuccessCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${NSD_CreateLabel} 20 100u 36% 9u "HUD Runtime"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body
  ${If} $InstallHUD == "1"
    ${NSD_CreateLabel} 58% 100u 40% 9u "Included"
    Pop $0
    ${SuccessCtl} $0
  ${Else}
    ${NSD_CreateLabel} 58% 100u 40% 9u "Not included  (add later from HUD page)"
    Pop $0
    ${MutedCtl} $0
  ${EndIf}
  ${ApplyFont} $0 $hFont_Body

  ${NSD_CreateLabel} 20 113u 36% 9u "Shortcuts"
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body
  ${If} $InstallShortcuts == "1"
    ${NSD_CreateLabel} 58% 113u 40% 9u "Desktop + Start Menu"
    Pop $0
    ${DarkCtl} $0
  ${Else}
    ${NSD_CreateLabel} 58% 113u 40% 9u "None"
    Pop $0
    ${MutedCtl} $0
  ${EndIf}
  ${ApplyFont} $0 $hFont_Body

  ${HRule} 128u

  ${NSD_CreateLabel} 20 134u 92% 9u "Click  Install RouteLag  to begin. This will take less than a minute."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  nsDialogs::Show
FunctionEnd

Function pg_Ready_Leave
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: PROGRESS  (instfiles — dark detail area)
; ════════════════════════════════════════════════════════════════════════════

Function pg_Progress_Pre
  ; Set installer window caption during progress
  ${SetNextText}  "Installing..."
FunctionEnd

Function pg_Progress_Show
  ; Nothing extra needed — MUI instfiles page handles progress bar
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; PAGE: COMPLETE
; ════════════════════════════════════════════════════════════════════════════

Function pg_Complete_Create
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${DarkBg}
  ${HideBack}
  ${SetNextText}  "Finish"
  ${SetCancelText} "Exit"

  ; ── Success icon (checkmark approximated with unicode) ──
  ${NSD_CreateLabel} 20 18 24u 14u "✓"
  Pop $0
  ${SuccessCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ; ── Title ──
  ${NSD_CreateLabel} 50 22 92% 11u "RouteLag is ready"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 50 38 80% 9u "Installation completed successfully."
  Pop $0
  ${SuccessCtl} $0
  ${ApplyFont} $0 $hFont_H2

  ${HRule} 54u

  ; ── HUD status message ──
  ${If} $InstallHUD == "1"
    ${NSD_CreateLabel} 20 62u 92% 9u "RouteLag HUD Runtime installed successfully."
    Pop $0
    ${SuccessCtl} $0
    ${ApplyFont} $0 $hFont_Body
  ${Else}
    ${NSD_CreateLabel} 20 62u 92% 18u "HUD Runtime was not installed. You can add it later from the HUD page inside RouteLag."
    Pop $0
    ${MutedCtl} $0
    ${ApplyFont} $0 $hFont_Body
  ${EndIf}

  ${HRule} 86u

  ; ── Launch checkbox ──
  ${NSD_CreateCheckBox} 20 94u 92% 11u "Launch RouteLag now"
  Pop $hCB_Launch
  ${DarkCtl} $hCB_Launch
  ${ApplyFont} $hCB_Launch $hFont_Body
  ${If} $LaunchAfterInstall == "1"
    ${NSD_Check} $hCB_Launch
  ${EndIf}

  nsDialogs::Show
FunctionEnd

; ════════════════════════════════════════════════════════════════════════════
; SECTIONS
; ════════════════════════════════════════════════════════════════════════════

SectionGroup /e "RouteLag Application" SEC_APP_GROUP

; ── Core App (required) ──────────────────────────────────────────────────────
Section "RouteLag App" SEC_APP
  SectionIn RO
  ${LogSection} "RouteLag App"

  DetailPrint "Preparing installation directory..."
  SetOutPath "$INSTDIR"
  SetOverwrite on

  DetailPrint "Installing RouteLag..."
  !ifdef APP_SRC_DIR
    File /a "${APP_SRC_DIR}\routelag-desktop.exe"
    Rename "$INSTDIR\routelag-desktop.exe" "$INSTDIR\${PRODUCT_EXE}"
    File /nonfatal /r /x "*.pdb" /x "*.lib" "${APP_SRC_DIR}\resources"
  !else
    File /nonfatal /a "bin\routelag-desktop.exe"
  !endif

  ${LogFile} "routelag-desktop.exe" "$INSTDIR\${PRODUCT_EXE}"

  DetailPrint "Writing uninstaller..."
  WriteUninstaller "$INSTDIR\${PRODUCT_UNINST_EXE}"

  DetailPrint "Writing registry metadata..."
  !insertmacro WriteInstallRegistry
SectionEnd

; ── Engine (required) ────────────────────────────────────────────────────────
Section "RouteLag Engine" SEC_ENGINE
  SectionIn RO
  ${LogSection} "RouteLag Engine"

  DetailPrint "Installing RouteLag Engine..."
  SetOutPath "$INSTDIR\engine"
  SetOverwrite on

  !ifdef ENGINE_SRC_DIR
    File /nonfatal /a "${ENGINE_SRC_DIR}\RouteLagEngine.exe"
    File /nonfatal /a "${ENGINE_SRC_DIR}\routelag-wg.exe"
    File /nonfatal /a "${ENGINE_SRC_DIR}\wireguard.exe"
    File /nonfatal /a "${ENGINE_SRC_DIR}\wg.exe"
  !else
    File /nonfatal /a "engine\RouteLagEngine.exe"
    File /nonfatal /a "engine\routelag-wg.exe"
  !endif

  ${LogLine} "[engine] installed to $INSTDIR\engine"
SectionEnd

SectionGroupEnd

; ── HUD Runtime (optional) ───────────────────────────────────────────────────
Section "HUD Runtime" SEC_HUD
  ${If} $InstallHUD != "1"
    Goto skip_hud
  ${EndIf}
  ${If} $HudAvailable != "1"
    Goto skip_hud
  ${EndIf}

  ${LogSection} "HUD Runtime"
  DetailPrint "Installing HUD Runtime..."
  SetOutPath "$INSTDIR\hud"
  SetOverwrite on

  !ifdef HUD_SRC_DIR
    File /nonfatal /r "${HUD_SRC_DIR}\*.*"
  !endif

  !insertmacro WriteHudRegistered
  ${LogLine} "[hud] installed to $INSTDIR\hud"

  skip_hud:
SectionEnd

; ── Shortcuts (optional) ─────────────────────────────────────────────────────
Section "Shortcuts" SEC_SHORTCUTS
  ${If} $InstallShortcuts != "1"
    Goto skip_shortcuts
  ${EndIf}

  ${LogSection} "Shortcuts"
  DetailPrint "Creating shortcuts..."
  SetOutPath "$INSTDIR"

  CreateShortcut "$DESKTOP\RouteLag.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0
  ${LogLine} "[shortcut] desktop"

  CreateDirectory "$SMPROGRAMS\RouteLag"
  CreateShortcut "$SMPROGRAMS\RouteLag\RouteLag Beta.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0
  CreateShortcut "$SMPROGRAMS\RouteLag\Uninstall RouteLag.lnk" "$INSTDIR\${PRODUCT_UNINST_EXE}"
  ${LogLine} "[shortcut] start menu"

  skip_shortcuts:
SectionEnd

; ── Finalize: launch if requested ────────────────────────────────────────────
Section "-Finalize"
  DetailPrint "Finalizing installation..."
  WriteRegDWORD HKCU "${REG_APP}" "InstallType" $InstallType

  ; Read launch preference from complete page checkbox
  ${NSD_GetState} $hCB_Launch $0
  ${If} $0 == ${BST_CHECKED}
    Exec '"$INSTDIR\${PRODUCT_EXE}"'
  ${EndIf}

  Call LogFooter
SectionEnd

; ════════════════════════════════════════════════════════════════════════════
; UNINSTALL
; ════════════════════════════════════════════════════════════════════════════

Var un_RemoveData

Function un.pg_Confirm_Create
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${DarkBg}
  ${HideBack}
  ${SetNextText}  "Uninstall"
  ${SetCancelText} "Cancel"

  ${NSD_CreateLabel} 20 18 92% 13u "Uninstall RouteLag"
  Pop $0
  ${DarkCtl} $0
  ${ApplyFont} $0 $hFont_H1

  ${NSD_CreateLabel} 20 36 92% 9u "RouteLag and its components will be removed from your computer."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Body

  ${HRule} 52u

  ${NSD_CreateCheckBox} 20 62u 92% 11u "Remove RouteLag user data, settings, and logs"
  Pop $un_RemoveData
  ${DarkCtl} $un_RemoveData
  ${ApplyFont} $un_RemoveData $hFont_Body

  ${NSD_CreateLabel} 34 76u 88% 9u "Includes data stored in %LOCALAPPDATA%\RouteLag. Unchecked by default — your data is kept."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  ${HRule} 92u

  ${NSD_CreateLabel} 20 98u 92% 9u "Your route configurations and relay settings will not be affected."
  Pop $0
  ${MutedCtl} $0
  ${ApplyFont} $0 $hFont_Small

  nsDialogs::Show
FunctionEnd

Function un.pg_Confirm_Leave
  ; Capture checkbox value before the dialog closes
  ${NSD_GetState} $un_RemoveData $0
  StrCpy $un_RemoveData $0
FunctionEnd

Section "Uninstall"
  DetailPrint "Stopping any running instance..."
  nsExec::ExecToLog /TIMEOUT=5000 'taskkill /IM "RouteLag Beta.exe" /F'

  DetailPrint "Removing HUD Runtime..."
  RMDir /r "$INSTDIR\hud"

  DetailPrint "Removing RouteLag Engine..."
  RMDir /r "$INSTDIR\engine"

  DetailPrint "Removing application files..."
  RMDir /r "$INSTDIR\resources"
  Delete "$INSTDIR\${PRODUCT_EXE}"
  Delete "$INSTDIR\${PRODUCT_UNINST_EXE}"
  RMDir  "$INSTDIR"

  DetailPrint "Removing shortcuts..."
  Delete "$DESKTOP\RouteLag.lnk"
  Delete "$SMPROGRAMS\RouteLag\RouteLag Beta.lnk"
  Delete "$SMPROGRAMS\RouteLag\Uninstall RouteLag.lnk"
  RMDir  "$SMPROGRAMS\RouteLag"

  ${If} $un_RemoveData == ${BST_CHECKED}
    DetailPrint "Removing user data..."
    RMDir /r "$LOCALAPPDATA\RouteLag"
    RMDir /r "$APPDATA\com.routelag.beta"
    ${LogLine} "[uninstall] user data removed"
  ${EndIf}

  DetailPrint "Removing registry entries..."
  !insertmacro RemoveAllRegistry

  DetailPrint "Uninstall complete."
SectionEnd

Function un.onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
  ${CreateFont} $hFont_H1    22 700
  ${CreateFont} $hFont_H2    12 600
  ${CreateFont} $hFont_Body  10 400
  ${CreateFont} $hFont_Small  9 400
  StrCpy $un_RemoveData "0"
FunctionEnd
