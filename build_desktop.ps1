$ErrorActionPreference = "Stop"

function Invoke-WithRetry {
  param(
    [scriptblock]$Action,
    [int]$MaxAttempts = 6,
    [int]$DelaySeconds = 2
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      & $Action
      return
    } catch {
      if ($attempt -ge $MaxAttempts) {
        throw
      }
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python not found in PATH. Install Python 3.11+ first."
}

$venvDir = Join-Path $projectRoot ".venv-build"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
  python -m venv $venvDir
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r "$projectRoot\requirements-desktop-build.txt"

$pyinstallerArgs = @(
  "--noconfirm",
  "--clean",
  "--name", "KazAlerts",
  "--windowed",
  "--collect-all", "PySide6",
  "--add-data", "web;web",
  "--add-data", "README.md;.",
  "--add-data", "local.env.example.bat;.",
  "--add-data", "install_startup_shortcut.ps1;.",
  "run.py"
)

& $venvPython -m PyInstaller @pyinstallerArgs

$distDir = Join-Path $projectRoot "dist"
$bundleDir = Join-Path $distDir "KazAlerts"
$zipPath = Join-Path $distDir "KazAlerts-Windows.zip"

if (-not (Test-Path $bundleDir)) {
  throw "Build output folder not found: $bundleDir"
}

if (Test-Path $zipPath) {
  Remove-Item -Path $zipPath -Force
}

$zipStageDir = Join-Path $distDir "KazAlerts-zip-stage"
if (Test-Path $zipStageDir) {
  Remove-Item -Path $zipStageDir -Recurse -Force
}

Invoke-WithRetry -Action {
  New-Item -ItemType Directory -Path $zipStageDir -Force | Out-Null
  Copy-Item -Path (Join-Path $bundleDir "*") -Destination $zipStageDir -Recurse -Force
}

Invoke-WithRetry -Action {
  Compress-Archive -Path (Join-Path $zipStageDir "*") -DestinationPath $zipPath
}

if (Test-Path $zipStageDir) {
  Remove-Item -Path $zipStageDir -Recurse -Force
}

Write-Host "Desktop build complete"
Write-Host "Bundle: $bundleDir"
Write-Host "Zip: $zipPath"
