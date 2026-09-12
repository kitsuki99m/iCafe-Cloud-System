!include nsDialogs.nsh
!include WinMessages.nsh
Var CafeNameInput
Var CafeNameHandle

Page custom CafeBrandingPageCreate CafeBrandingPageLeave

Function CafeBrandingPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 12u "Cafe name"
  Pop $0
  ${NSD_CreateText} 0 18u 100% 14u "iCafe Management System"
  Pop $CafeNameHandle
  nsDialogs::Show
FunctionEnd

Function CafeBrandingPageLeave
  ${NSD_GetText} $CafeNameHandle $CafeNameInput
  StrCmp $CafeNameInput "" 0 +2
    StrCpy $CafeNameInput "iCafe Management System"
  WriteRegStr HKCU "Software\iCafe Management System" "CafeName" "$CafeNameInput"
FunctionEnd


