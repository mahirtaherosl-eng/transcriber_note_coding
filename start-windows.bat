@echo off
setlocal
title Transcriber
cd /d "%~dp0"

echo.
echo  Transcriber - local setup and launch
echo  =====================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node

where npm >nul 2>nul
if errorlevel 1 goto :no_npm

node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]*100+v[1]>=2009?0:1)"
if errorlevel 1 goto :old_node

if not exist "node_modules\next" (
  echo Installing dependencies. This can take a few minutes on the first run...
  echo.
  call npm install
  if errorlevel 1 goto :install_failed
  echo.
)

call :find_port 3000
set "URL=http://127.0.0.1:%PORT%"

echo Starting Transcriber at %URL%
echo Add your API key in Settings after the page opens.
echo Press Ctrl+C in this window to stop the server.
echo.

if not "%TRANSCRIBER_NO_BROWSER%"=="1" (
  start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 90;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%/api/transcriptions' -TimeoutSec 2; if($r.StatusCode -eq 200){Start-Process '%URL%'; break}}catch{};Start-Sleep -Seconds 1}"
)

call npm run dev -- -p %PORT%
echo.
echo The server has stopped.
pause
exit /b 0

:find_port
set "PORT=%~1"
:find_port_loop
if %PORT% GEQ 3100 (
  echo Could not find a free port between 3000 and 3099.
  echo Close other apps using those ports and try again.
  echo.
  pause
  exit /b 1
)
netstat -ano | findstr /C:":%PORT% " | findstr /C:"LISTENING" >nul
if errorlevel 1 goto :eof
set /a PORT+=1
goto :find_port_loop

:no_node
echo Node.js was not found.
echo Install Node.js 20.9 or newer from https://nodejs.org/ and double-click this file again.
echo.
pause
exit /b 1

:no_npm
echo npm was not found. Reinstall Node.js from https://nodejs.org/ (it includes npm).
echo.
pause
exit /b 1

:old_node
echo Node.js 20.9 or newer is required. Found:
node --version
echo Download it from https://nodejs.org/
echo.
pause
exit /b 1

:install_failed
echo.
echo Dependency installation failed. Check your internet connection and try again.
echo.
pause
exit /b 1
