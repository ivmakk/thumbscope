; Custom NSIS registry: context-menu entries + a ProgID, written machine-wide (HKLM) since this is a
; per-machine (Program Files) install running elevated — entries apply to all users. The .db default
; association is deliberately NOT set (".db" is shared with SQLite etc.) — only context menus + a
; ready ProgID for opt-in. Plus: a `thumbscope` CLI wrapper added to the machine PATH.

!include "WinMessages.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"

!define Environ 'HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"'

!ifndef BUILD_UNINSTALLER
!insertmacro VersionCompare ; used by customInit to detect upgrade/downgrade/reinstall

; Whether to install the thumbscope CLI (checkbox on a custom page; default on, also on for silent).
Var InstallCli
Var CliCheckbox

; Custom page (inserted after the install-dir page): opt out of the CLI / PATH entry.
Function CliOptionsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "Optionally install the command-line tool. It adds a `thumbscope` command to your PATH for exporting/listing thumbnails from a terminal. The desktop app is installed either way."
  Pop $0
  ${NSD_CreateCheckbox} 0 30u 100% 12u "Install the thumbscope command-line tool (adds it to PATH)"
  Pop $CliCheckbox
  ${If} $InstallCli == 1
    ${NSD_Check} $CliCheckbox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function CliOptionsPageLeave
  ${NSD_GetState} $CliCheckbox $InstallCli
FunctionEnd
!endif

; StrStr: returns (on stack) the substring of <haystack> from the first occurrence of <needle>
; to the end, or "" if not found. Defined for both installer ("") and uninstaller ("un.").
; NSIS compiles the installer and uninstaller in separate passes (BUILD_UNINSTALLER); a function
; that the active pass never calls trips warning 6010, which electron-builder treats as an error.
; So guard each pass to define only the functions it uses.
!macro StrStr un
Function ${un}StrStr
  Exch $R1 ; needle
  Exch
  Exch $R2 ; haystack
  Push $R3
  Push $R4
  Push $R5
  StrLen $R3 $R1
  StrCpy $R4 0
  ${un}StrStr_loop:
    StrCpy $R5 $R2 $R3 $R4
    StrCmp $R5 $R1 ${un}StrStr_done
    StrCmp $R5 "" ${un}StrStr_done
    IntOp $R4 $R4 + 1
    Goto ${un}StrStr_loop
  ${un}StrStr_done:
    StrCpy $R1 $R2 "" $R4
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Exch $R1
FunctionEnd
!macroend

!ifndef BUILD_UNINSTALLER
!insertmacro StrStr ""

; Append the dir on the stack to the machine PATH (idempotent), then broadcast the change.
Function AddToPath
  Exch $0 ; dir to add
  Push $1
  Push $2
  Push $3

  ReadRegStr $1 ${Environ} "Path"
  ; Already present? Search with boundary semicolons so C:\App doesn't match C:\App2.
  Push ";$1;"
  Push ";$0;"
  Call StrStr
  Pop $2
  StrCmp $2 "" 0 AddToPath_done

  StrCmp $1 "" AddToPath_empty
  StrCpy $3 $1 1 -1 ; last char
  StrCmp $3 ";" 0 +2
    StrCpy $1 $1 -1 ; drop trailing ;
  StrCpy $1 "$1;$0"
  Goto AddToPath_write
  AddToPath_empty:
    StrCpy $1 "$0"
  AddToPath_write:
    WriteRegExpandStr ${Environ} "Path" "$1"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  AddToPath_done:
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif ; !BUILD_UNINSTALLER

!ifdef BUILD_UNINSTALLER
!insertmacro StrStr "un."

; Remove the dir on the stack from the machine PATH, then broadcast the change.
Function un.RemoveFromPath
  Exch $0 ; dir to remove
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5

  ReadRegStr $1 ${Environ} "Path"
  StrCpy $1 ";$1;" ; normalize with boundary semicolons
  Push $1
  Push ";$0;"
  Call un.StrStr
  Pop $2 ; ";$0;...rest"  or  ""
  StrCmp $2 "" un.RemoveFromPath_done

  StrLen $3 $2 ; tail length
  StrLen $4 $1 ; total length
  IntOp $4 $4 - $3 ; prefix length (before the leading ; of ";$0;")
  StrCpy $5 $1 $4 ; prefix
  StrLen $3 ";$0" ; chars to drop from the tail front (keep the trailing ;)
  StrCpy $2 $2 "" $3 ; tail without ";$0"
  StrCpy $1 "$5$2"

  StrCpy $5 $1 1 ; strip leading ;
  StrCmp $5 ";" 0 +2
    StrCpy $1 $1 "" 1
  StrCpy $5 $1 1 -1 ; strip trailing ;
  StrCmp $5 ";" 0 +2
    StrCpy $1 $1 -1

  WriteRegExpandStr ${Environ} "Path" "$1"
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  un.RemoveFromPath_done:
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif ; BUILD_UNINSTALLER

; Default the CLI choice on (the checkbox starts checked; silent installs keep it on), then
; acknowledge an existing install: tell the user whether this run upgrades, reinstalls, or
; downgrades, and let them cancel. Skipped for silent installs and clean first-time installs.
; The version was recorded by a prior install's customInstall (so the very first upgrade from a
; build predating this check finds nothing and proceeds silently).
!macro customInit
  StrCpy $InstallCli 1

  ${IfNot} ${Silent}
    ReadRegStr $R0 HKLM "Software\Thumbscope" "Version"
    ${If} $R0 != ""
      ${VersionCompare} "$R0" "${VERSION}" $R1
      ${If} $R1 == 0
        MessageBox MB_OKCANCEL|MB_ICONQUESTION "Version ${VERSION} is already installed.$\n$\nReinstall it?" IDOK +2
          Quit
      ${ElseIf} $R1 == 1
        MessageBox MB_YESNO|MB_ICONEXCLAMATION "A newer version ($R0) is already installed.$\n$\nContinue and downgrade to ${VERSION}?" IDYES +2
          Quit
      ${Else}
        MessageBox MB_OKCANCEL|MB_ICONQUESTION "Version $R0 is already installed.$\n$\nIt will be updated to ${VERSION}." IDOK +2
          Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Show the CLI opt-out page right after the user picks the install directory.
!macro customPageAfterChangeDir
  Page custom CliOptionsPageCreate CliOptionsPageLeave
!macroend

!macro customInstall
  ; "Open with Thumbscope" on .db files
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.db\shell\Thumbscope" "" "Open with Thumbscope"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.db\shell\Thumbscope" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.db\shell\Thumbscope\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; "View thumbnails here" on a folder (passes the folder path; app resolves its Thumbs.db)
  WriteRegStr HKLM "Software\Classes\Directory\shell\ThumbscopeHere" "" "View thumbnails here"
  WriteRegStr HKLM "Software\Classes\Directory\shell\ThumbscopeHere" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKLM "Software\Classes\Directory\shell\ThumbscopeHere\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; "View thumbnails here" on the folder background (right-click empty space inside a folder)
  WriteRegStr HKLM "Software\Classes\Directory\Background\shell\ThumbscopeHere" "" "View thumbnails here"
  WriteRegStr HKLM "Software\Classes\Directory\Background\shell\ThumbscopeHere" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKLM "Software\Classes\Directory\Background\shell\ThumbscopeHere\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  ; ProgID — registered for opt-in default association; not set as the .db default here.
  WriteRegStr HKLM "Software\Classes\Thumbscope.db" "" "Thumbnail Database"
  WriteRegStr HKLM "Software\Classes\Thumbscope.db\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKLM "Software\Classes\Thumbscope.db\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Record the installed version so the next run can detect upgrade/downgrade/reinstall (customInit).
  WriteRegStr HKLM "Software\Thumbscope" "Version" "${VERSION}"

  ; --- CLI: thumbscope command (optional, gated by the custom page checkbox) ---
  ; Wrapper runs the bundled CLI through the installed Electron binary in Node mode
  ; (ELECTRON_RUN_AS_NODE). NODE_PATH covers both the unpacked node_modules (native sharp +
  ; its .node binaries) and the packed app.asar node_modules (sharp's pure-JS deps like
  ; detect-libc). Paths are %~dp0-relative, so the install stays relocatable.
  ${If} $InstallCli == 1
    FileOpen $0 "$INSTDIR\thumbscope.cmd" w
    FileWrite $0 "@echo off$\r$\n"
    FileWrite $0 "setlocal$\r$\n"
    FileWrite $0 "set $\"ELECTRON_RUN_AS_NODE=1$\"$\r$\n"
    FileWrite $0 "set $\"NODE_PATH=%~dp0resources\app.asar.unpacked\node_modules;%~dp0resources\app.asar\node_modules$\"$\r$\n"
    FileWrite $0 "$\"%~dp0${APP_EXECUTABLE_FILENAME}$\" $\"%~dp0resources\cli\thumbscope.cjs$\" %*$\r$\n"
    FileWrite $0 "exit /b %errorlevel%$\r$\n"
    FileClose $0

    ; Add the install dir to the machine PATH so `thumbscope` works in any new terminal.
    Push "$INSTDIR"
    Call AddToPath
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegKey HKLM "Software\Classes\SystemFileAssociations\.db\shell\Thumbscope"
  DeleteRegKey HKLM "Software\Classes\Directory\shell\ThumbscopeHere"
  DeleteRegKey HKLM "Software\Classes\Directory\Background\shell\ThumbscopeHere"
  DeleteRegKey HKLM "Software\Classes\Thumbscope.db"
  DeleteRegKey HKLM "Software\Thumbscope"

  ; CLI cleanup: remove the wrapper and drop the install dir from PATH.
  Delete "$INSTDIR\thumbscope.cmd"
  Push "$INSTDIR"
  Call un.RemoveFromPath

  ; Optionally remove the per-user settings & data (renderer localStorage: theme, thumbnail size,
  ; export preferences, etc. — under the Electron userData folder). Default is to KEEP it, so a later
  ; reinstall restores preferences. Silent uninstall keeps it (/SD IDNO). electron-builder exposes no
  ; uninstaller-page hook, so this is a Yes/No prompt rather than an in-page checkbox.
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your settings and data (theme, view and export preferences)?$\n$\nChoose No to keep them so a future reinstall restores your preferences." /SD IDNO IDYES un.delAppData
    Goto un.keepAppData
    un.delAppData:
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    un.keepAppData:
  ${EndIf}
!macroend
