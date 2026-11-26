@echo off
cd /d "%~dp0"
if /i "%~1"=="openchrome" goto openchrome
echo Mouse Man 2: http://127.0.0.1:5173/?mode=stage
set "URL=http://127.0.0.1:5173/?mode=stage"
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME echo Chrome was not found.
start "" cmd /c timeout /t 3 /nobreak ^>nul ^& call "%~f0" openchrome
where node >nul 2>&1 || goto missing
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*mouse-man-2*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
npm run dev -- --strictPort
goto :eof
:openchrome
if not defined CHROME goto openfallback
start "" "%CHROME%" --new-window --start-fullscreen "%URL%"
goto :eof
:openfallback
start "" "%URL%"
goto :eof
:missing
echo Node.js was not found. Install it from https://nodejs.org and run this file again.
pause
