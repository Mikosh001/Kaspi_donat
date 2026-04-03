$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$startupDir = [Environment]::GetFolderPath("Startup")
$targetExe = Join-Path $projectRoot "KazAlerts.exe"
$targetBat = Join-Path $projectRoot "start_no_terminal.bat"
$shortcutPath = Join-Path $startupDir "Kaz Alerts.lnk"

$targetPath = ""
if (Test-Path $targetExe) {
  $targetPath = $targetExe
} elseif (Test-Path $targetBat) {
  $targetPath = $targetBat
} else {
  throw "Neither KazAlerts.exe nor start_no_terminal.bat found in: $projectRoot"
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = if (Test-Path $targetExe) { $targetExe } else { "$env:SystemRoot\System32\shell32.dll,220" }
$shortcut.Save()

Write-Host "Startup shortcut created: $shortcutPath"
Write-Host "Target: $targetPath"
