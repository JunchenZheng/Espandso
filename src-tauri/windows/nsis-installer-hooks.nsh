!include LogicLib.nsh
!include StrFunc.nsh
!include WinMessages.nsh

${Using:StrFunc} StrRep
${Using:StrFunc} StrStr
${Using:StrFunc} UnStrRep
${Using:StrFunc} UnStrStr

!define EXPANDSO_ENV_REG_KEY "Environment"
!define EXPANDSO_PATH_VALUE "Path"

!macro EXPANDSO_BROADCAST_ENVIRONMENT_CHANGE
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $0 HKCU "${EXPANDSO_ENV_REG_KEY}" "${EXPANDSO_PATH_VALUE}"
  StrCpy $1 "$INSTDIR"

  ${If} $0 == ""
    WriteRegExpandStr HKCU "${EXPANDSO_ENV_REG_KEY}" "${EXPANDSO_PATH_VALUE}" "$1"
  ${Else}
    StrCpy $2 ";$0;"
    ${StrStr} $3 "$2" ";$1;"

    ${If} $3 == ""
      WriteRegExpandStr HKCU "${EXPANDSO_ENV_REG_KEY}" "${EXPANDSO_PATH_VALUE}" "$0;$1"
    ${EndIf}
  ${EndIf}

  !insertmacro EXPANDSO_BROADCAST_ENVIRONMENT_CHANGE
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $0 HKCU "${EXPANDSO_ENV_REG_KEY}" "${EXPANDSO_PATH_VALUE}"
  StrCpy $1 "$INSTDIR"

  ${If} $0 != ""
    StrCpy $2 ";$0;"
    ${UnStrStr} $3 "$2" ";$1;"

    ${If} $3 != ""
      ${UnStrRep} $2 "$2" ";$1;" ";"

      StrCpy $3 $2 1
      ${If} $3 == ";"
        StrCpy $2 $2 "" 1
      ${EndIf}

      ${Do}
        StrLen $4 $2
        ${If} $4 <= 0
          ${Break}
        ${EndIf}

        IntOp $4 $4 - 1
        StrCpy $3 $2 1 $4
        ${If} $3 != ";"
          ${Break}
        ${EndIf}

        StrCpy $2 $2 $4
      ${Loop}

      ${If} $2 == ""
        DeleteRegValue HKCU "${EXPANDSO_ENV_REG_KEY}" "${EXPANDSO_PATH_VALUE}"
      ${Else}
        WriteRegExpandStr HKCU "${EXPANDSO_ENV_REG_KEY}" "${EXPANDSO_PATH_VALUE}" "$2"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  !insertmacro EXPANDSO_BROADCAST_ENVIRONMENT_CHANGE
!macroend
