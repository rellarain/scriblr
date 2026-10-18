<#
.SYNOPSIS
  Builds the Scriblr installer from this checkout and checks that what was built starts.

.DESCRIPTION
  1. Versions: frontend, electron and backend must carry the same version (-Version sets all three).
  2. Tests: backend (ruff, pytest) and frontend (tsc, eslint, vitest), unless -SkipTests.
  3. Build: frontend (vite), the backend (PyInstaller, one-dir), the installer (electron-builder), unless -SkipBuild.
  4. Smoke check, unless -SkipSmoke: the packaged backend is started on a free port against a scratch data
     folder (never your projects), asked for /api/health, the shelves' overview and a deep route, shown a bad
     id, and then stopped; no process may be left behind.

  Run it from anywhere:  powershell -File scripts\release.ps1  [-Version 0.2.0] [-SkipTests] [-SkipBuild] [-SkipSmoke]
  Needs the backend's virtual environment (backend\.venv) and `npm install` done in frontend and electron.
  On Windows without Developer Mode, run it from an elevated terminal (see the README's note on electron-builder).
#>
param(
  [string]$Version,
  [switch]$SkipTests,
  [switch]$SkipBuild,
  [switch]$SkipSmoke
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$electron = Join-Path $root 'electron'
$python = Join-Path $backend '.venv\Scripts\python.exe'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

# Runs a native command in a folder and stops the script when it fails (PowerShell does not on its own).
function Run($dir, $exe, [string[]]$arguments) {
  Push-Location $dir
  try {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "'$exe $($arguments -join ' ')' failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

# --- 1. versions ---
$files = @(
  @{ Path = Join-Path $frontend 'package.json'; Pattern = '(?m)^(\s*"version":\s*")([^"]+)(")' },
  @{ Path = Join-Path $electron 'package.json'; Pattern = '(?m)^(\s*"version":\s*")([^"]+)(")' },
  @{ Path = Join-Path $backend 'pyproject.toml'; Pattern = '(?m)^(version\s*=\s*")([^"]+)(")' }
)
function Version-Of($file) {
  $match = [regex]::Match([IO.File]::ReadAllText($file.Path), $file.Pattern)
  if (-not $match.Success) { throw "No version found in $($file.Path)" }
  return $match.Groups[2].Value
}

Step 'Versions'
if ($Version) {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "-Version must look like 1.2.3, not '$Version'" }
  foreach ($file in $files) {
    $text = [IO.File]::ReadAllText($file.Path)
    $regex = [regex]$file.Pattern
    $text = $regex.Replace($text, ('${1}' + $Version + '${3}'), 1)
    [IO.File]::WriteAllText($file.Path, $text, (New-Object Text.UTF8Encoding($false)))
  }
}
$versions = $files | ForEach-Object { Version-Of $_ }
if (($versions | Select-Object -Unique).Count -ne 1) {
  throw "The three versions differ (frontend, electron, backend): $($versions -join ', '). Pass -Version to set them."
}
$current = $versions[0]
Write-Host "Version $current"

# --- 2. tests ---
if (-not $SkipTests) {
  Step 'Backend: ruff and pytest'
  Run $backend $python @('-m', 'ruff', 'check', 'app', 'tests')
  Run $backend $python @('-m', 'pytest', '-q')
  Step 'Frontend: typecheck, lint and vitest'
  Run $frontend 'npm.cmd' @('run', 'typecheck')
  Run $frontend 'npm.cmd' @('run', 'lint')
  Run $frontend 'npm.cmd' @('test')
}

# --- 3. build ---
if (-not $SkipBuild) {
  Step 'Frontend build'
  Run $frontend 'npm.cmd' @('run', 'build')
  Step 'Backend (PyInstaller, one-dir)'
  Run $backend $python @('-m', 'PyInstaller', 'scriblr.spec', '--noconfirm')
  Step 'Installer (electron-builder)'
  Run $electron 'npm.cmd' @('run', 'dist')
}

$installer = Join-Path $electron "dist\Scriblr Setup $current.exe"
if (-not (Test-Path $installer)) { throw "The installer was not built: $installer" }
$sizeMb = [math]::Round((Get-Item $installer).Length / 1MB, 1)
Write-Host "Installer: $installer ($sizeMb MB)"

# --- 4. smoke check of the packaged backend ---
if (-not $SkipSmoke) {
  Step 'Smoke check of the packaged backend'
  $exe = Join-Path $electron 'dist\win-unpacked\resources\backend\scriblr-backend.exe'
  if (-not (Test-Path $exe)) { throw "The packaged backend is missing: $exe" }

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()
  $data = Join-Path ([IO.Path]::GetTempPath()) ("scriblr-smoke-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $data | Out-Null
  $env:SCRIBLR_DATA_DIR = $data
  $env:SCRIBLR_PORT = "$port"
  $base = "http://127.0.0.1:$port"
  $process = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
  try {
    $up = $false
    $lastError = ''
    for ($i = 0; $i -lt 60 -and -not $up; $i++) {
      Start-Sleep -Milliseconds 500
      if ($process.HasExited) { throw "The packaged backend stopped at once (exit code $($process.ExitCode))" }
      try { $up = (Invoke-RestMethod "$base/api/health").status -eq 'ok' } catch { $lastError = $_.Exception.Message }
    }
    if (-not $up) { throw "The packaged backend did not answer /api/health within 30 s ($lastError)" }

    $created = Invoke-RestMethod -Method Post -Uri "$base/api/projects" -ContentType 'application/json' -Body '{"title":"Smoke"}'
    $overview = Invoke-RestMethod "$base/api/projects/overview"
    if (@($overview).Count -ne 1 -or $overview[0].index.projectId -ne $created.projectId) { throw 'The shelves overview did not list the new project' }

    $page = Invoke-WebRequest "$base/write" -UseBasicParsing
    if ($page.StatusCode -ne 200 -or $page.Content -notmatch '<div id="root">') { throw 'A deep route did not serve the app' }

    $badStatus = 0
    try { Invoke-WebRequest "$base/api/projects/..%5C..%5Cx" -UseBasicParsing | Out-Null } catch { $badStatus = [int]$_.Exception.Response.StatusCode }
    if ($badStatus -lt 400) { throw "A bad project id was not refused (status $badStatus)" }
    Write-Host "Backend answered on port $port; the shelves, a deep route and a bad id behave."
  } finally {
    if (-not $process.HasExited) { & taskkill /PID $process.Id /T /F | Out-Null }
    Remove-Item Env:SCRIBLR_DATA_DIR, Env:SCRIBLR_PORT -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue
  }
  if (Get-Process -Name 'scriblr-backend' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }) {
    throw 'A scriblr-backend process was left running'
  }
  Write-Host 'No process left behind.'
}

Step 'Done'
