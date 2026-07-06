; ================================================
; RouteLag Installer — registry.nsh
; Read / write registry helpers
; ================================================

; Write all install metadata under HKCU\Software\RouteLag
; Parameters expected as defines: $InstallPath, $HUDInstalled (0|1)
!macro WriteInstallRegistry
  ; App info
  WriteRegStr HKCU "${REG_APP}" "InstallPath"         "$INSTDIR"
  WriteRegStr HKCU "${REG_APP}" "Version"             "${PRODUCT_VERSION}"
  WriteRegDWORD HKCU "${REG_APP}" "EngineInstalled"   1

  ; HUD flag is written by Section -SecHUD post-install
  ; (or left 0 if HUD section was unselected)

  ; Add/Remove Programs entry
  WriteRegStr HKCU "${REG_UNINST}" "DisplayName"          "${PRODUCT_NAME}"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayVersion"        "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${REG_UNINST}" "Publisher"             "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${REG_UNINST}" "UninstallString"       "$INSTDIR\${PRODUCT_UNINST_EXE}"
  WriteRegStr HKCU "${REG_UNINST}" "QuietUninstallString"  "$INSTDIR\${PRODUCT_UNINST_EXE} /S"
  WriteRegStr HKCU "${REG_UNINST}" "InstallLocation"       "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINST}" "DisplayIcon"           "$INSTDIR\${PRODUCT_EXE}"
  WriteRegDWORD HKCU "${REG_UNINST}" "NoModify"            1
  WriteRegDWORD HKCU "${REG_UNINST}" "NoRepair"            0
!macroend

!macro WriteHudRegistered
  WriteRegDWORD HKCU "${REG_APP}" "HudRuntimeInstalled" 1
  WriteRegStr   HKCU "${REG_APP}" "HudRuntimePath" "$INSTDIR\hud"
!macroend

!macro ClearHudRegistered
  WriteRegDWORD HKCU "${REG_APP}" "HudRuntimeInstalled" 0
  DeleteRegValue HKCU "${REG_APP}" "HudRuntimePath"
!macroend

!macro RemoveAllRegistry
  DeleteRegKey HKCU "${REG_UNINST}"
  DeleteRegKey HKCU "${REG_APP}"
!macroend
