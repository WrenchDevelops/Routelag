; ================================================
; RouteLag Installer — ui.nsh  (polished v2)
; Dark-theme macros for NsDialogs pages
; ================================================

; -- Win32 constants (guarded; some already exist in NSIS headers) -------------
!ifndef WM_SETFONT
  !define WM_SETFONT        0x0030
!endif
!ifndef WM_SETTEXT
  !define WM_SETTEXT        0x000C
!endif
!ifndef GCL_HBRBACKGROUND
  !define GCL_HBRBACKGROUND -10
!endif
!ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
  !define DWMWA_USE_IMMERSIVE_DARK_MODE 20
!endif

; ── Font creation ─────────────────────────────────────────────────────────────
; ${CreateFont} hOut pointSize boldWeight (700=bold 400=normal)
!macro _CreateFont hOut pts bold
  System::Call "gdi32::CreateFont(i -${pts}, i 0, i 0, i 0, i ${bold}, i 0, i 0, i 0, i 0, i 0, i 0, i 4, i 0, t 'Segoe UI') p.s"
  Pop ${hOut}
!macroend
!define CreateFont "!insertmacro _CreateFont"

; Apply a font handle to a control
!macro _ApplyFont hCtl hFont
  System::Call "user32::SendMessage(p ${hCtl}, i ${WM_SETFONT}, p ${hFont}, i 1)"
!macroend
!define ApplyFont "!insertmacro _ApplyFont"

; ── Color helpers ─────────────────────────────────────────────────────────────
; Text=white bg=deep-navy
!macro _DarkCtl h
  SetCtlColors ${h} "${CLR_TEXT}" "${CLR_BG}"
!macroend
!define DarkCtl "!insertmacro _DarkCtl"

; Text=muted bg=deep-navy
!macro _MutedCtl h
  SetCtlColors ${h} "${CLR_MUTED}" "${CLR_BG}"
!macroend
!define MutedCtl "!insertmacro _MutedCtl"

; Text=white bg=panel (lighter surface)
!macro _PanelCtl h
  SetCtlColors ${h} "${CLR_TEXT}" "${CLR_PANEL}"
!macroend
!define PanelCtl "!insertmacro _PanelCtl"

; Text=muted bg=panel
!macro _PanelMutedCtl h
  SetCtlColors ${h} "${CLR_MUTED}" "${CLR_PANEL}"
!macroend
!define PanelMutedCtl "!insertmacro _PanelMutedCtl"

; Purple accent text on dark bg
!macro _PurpleCtl h
  SetCtlColors ${h} "${CLR_PURPLE_LT}" "${CLR_BG}"
!macroend
!define PurpleCtl "!insertmacro _PurpleCtl"

; Success green text on dark bg
!macro _SuccessCtl h
  SetCtlColors ${h} "${CLR_SUCCESS}" "${CLR_BG}"
!macroend
!define SuccessCtl "!insertmacro _SuccessCtl"

; Error/warning red text on dark bg
!macro _ErrorCtl h
  SetCtlColors ${h} "${CLR_ERROR}" "${CLR_BG}"
!macroend
!define ErrorCtl "!insertmacro _ErrorCtl"

; ── Layout helpers ────────────────────────────────────────────────────────────
; Full-page dark background fill — MUST be called right after nsDialogs::Create
; Places a label behind all subsequent controls.
!macro _DarkBg
  ${NSD_CreateLabel} 0 0 100% 100% ""
  Pop $9
  SetCtlColors $9 "" "${CLR_BG}"
!macroend
!define DarkBg "!insertmacro _DarkBg"

; Thin horizontal separator line
!macro _HRule ypos
  ${NSD_CreateLabel} 16 ${ypos} -16 1u ""
  Pop $9
  SetCtlColors $9 "${CLR_BORDER}" "${CLR_BORDER}"
!macroend
!define HRule "!insertmacro _HRule"

; ── Window-level dark mode ────────────────────────────────────────────────────
; Call from .onGUIInit to paint the NSIS outer window dark and
; request Win11 dark title bar.
!macro _ApplyDarkWindow
  ; Paint outer dialog background dark (#070A12 → COLORREF 0x00120A07)
  System::Call "gdi32::CreateSolidBrush(i 0x120A07) p.s"
  Pop $R9
  System::Call "user32::SetClassLongPtr(p $HWNDPARENT, i ${GCL_HBRBACKGROUND}, p $R9)"
  System::Call "user32::InvalidateRect(p $HWNDPARENT, p 0, i 1)"

  ; Win11 dark title bar (DWMWA_USE_IMMERSIVE_DARK_MODE = 20, value = 1)
  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i ${DWMWA_USE_IMMERSIVE_DARK_MODE}, *i 1, i 4)"
!macroend
!define ApplyDarkWindow "!insertmacro _ApplyDarkWindow"

; ── Button label helpers ──────────────────────────────────────────────────────
; Change the Next/Back/Cancel labels for the current page.
; ID 1 = Next, 2 = Cancel, 3 = Back
!macro _SetNextText txt
  GetDlgItem $R8 $HWNDPARENT 1
  System::Call "user32::SendMessage(p $R8, i ${WM_SETTEXT}, p 0, t '${txt}')"
!macroend
!define SetNextText "!insertmacro _SetNextText"

!macro _SetBackText txt
  GetDlgItem $R8 $HWNDPARENT 3
  System::Call "user32::SendMessage(p $R8, i ${WM_SETTEXT}, p 0, t '${txt}')"
!macroend
!define SetBackText "!insertmacro _SetBackText"

!macro _SetCancelText txt
  GetDlgItem $R8 $HWNDPARENT 2
  System::Call "user32::SendMessage(p $R8, i ${WM_SETTEXT}, p 0, t '${txt}')"
!macroend
!define SetCancelText "!insertmacro _SetCancelText"

; Hide the Back button
!macro _HideBack
  GetDlgItem $R8 $HWNDPARENT 3
  ShowWindow $R8 ${SW_HIDE}
!macroend
!define HideBack "!insertmacro _HideBack"
