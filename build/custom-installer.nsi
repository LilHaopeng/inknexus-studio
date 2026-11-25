Unicode True
SilentInstall silent
RequestExecutionLevel user
SetCompressor /SOLID lzma
Name "墨枢 InkNexus Studio 1.0.1"
Caption "墨枢 InkNexus Studio 1.0.1 安装程序"
Icon "icon.ico"
OutFile "..\dist\墨枢 InkNexus Studio Setup 1.0.1.exe"

VIProductVersion "1.0.1.0"
VIAddVersionKey "ProductName" "墨枢 InkNexus Studio"
VIAddVersionKey "CompanyName" "LilHaopeng"
VIAddVersionKey "FileDescription" "墨枢 InkNexus Studio 安装程序"
VIAddVersionKey "FileVersion" "1.0.1.0"
VIAddVersionKey "ProductVersion" "1.0.1"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 LilHaopeng (MIT License)"

!include "FileFunc.nsh"

Section "Install"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\payload"
  File /r "..\dist\win-unpacked\*.*"

  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/S" $R1
  IfErrors run_gui run_silent

run_silent:
  ExecWait '"$PLUGINSDIR\payload\墨枢 InkNexus Studio.exe" --installer-mode --silent --payload-dir="$PLUGINSDIR\payload"' $0
  Goto done

run_gui:
  ExecWait '"$PLUGINSDIR\payload\墨枢 InkNexus Studio.exe" --installer-mode --payload-dir="$PLUGINSDIR\payload"' $0

done:
  SetErrorLevel $0
SectionEnd
