@echo off
cd /d "%~dp0"
title Clause AI

if not exist "node_modules" (
    echo Dependencies are not installed yet. Run setup.bat first.
    pause
    exit /b 1
)

call "%~dp0scripts\windows\start-db.bat"
if errorlevel 1 (
    echo [WARN] Starting without PostgreSQL; uploaded documents will be temporary.
)

echo.
echo Starting Clause AI...
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:4000
echo Press Ctrl+C in this window to stop.
echo.

rem Open the browser once the frontend has had a moment to start
start "" /min cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5173"

call npm run dev
