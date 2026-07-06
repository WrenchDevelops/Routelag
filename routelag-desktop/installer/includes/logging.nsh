; ================================================
; RouteLag Installer — logging.nsh
; Write install events to %LOCALAPPDATA%\RouteLag\logs\installer.log
; ================================================

!macro _LogLine msg
  CreateDirectory "$LOCALAPPDATA\RouteLag\logs"
  FileOpen $9 "${LOG_FILE}" a
  FileWrite $9 "${msg}$\r$\n"
  FileClose $9
!macroend
!define LogLine "!insertmacro _LogLine"

!macro _LogSection sec
  ${LogLine} "[section] ${sec}"
!macroend
!define LogSection "!insertmacro _LogSection"

!macro _LogFile src dst
  ${LogLine} "[file] ${src} -> ${dst}"
!macroend
!define LogFile "!insertmacro _LogFile"

!macro _LogError msg
  ${LogLine} "[ERROR] ${msg}"
!macroend
!define LogError "!insertmacro _LogError"

Function LogHeader
  CreateDirectory "$LOCALAPPDATA\RouteLag\logs"
  FileOpen $9 "${LOG_FILE}" a
  FileWrite $9 "--- RouteLag Installer ${PRODUCT_VERSION} ---$\r$\n"
  FileWrite $9 "InstallDir: $INSTDIR$\r$\n"
  FileClose $9
FunctionEnd

Function LogFooter
  FileOpen $9 "${LOG_FILE}" a
  FileWrite $9 "--- Installation complete ---$\r$\n"
  FileClose $9
FunctionEnd
