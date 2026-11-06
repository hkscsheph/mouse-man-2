@echo off
cd /d "%~dp0"
echo Mouse Man 2: http://127.0.0.1:5173/?mode=stage
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:5173/?mode=stage"
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
:missing
echo Node.js was not found. Install it from https://nodejs.org and run this file again.
pause
