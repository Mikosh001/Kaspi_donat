$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$startupDir = [Environment]::GetFolderPath("Startup")
$targetBat = Join-Path $projectRoot "start_no_terminal.bat"
$shortcutPath = Join-Path $startupDir "Kaz Alerts.lnk"

if (-not (Test-Path $targetBat)) {
  throw "start_no_terminal.bat not found: $targetBat"
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetBat
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$shortcut.Save()

Write-Host "Startup shortcut created: $shortcutPath"
