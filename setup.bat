@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Clause AI - Setup

echo.
echo ============================================
echo   Clause AI - one-time setup (Windows)
echo ============================================
echo.

rem ---------- 1. Check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Install Node.js 22 LTS or newer from https://nodejs.org
    goto :fail
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if !NODE_MAJOR! LSS 20 (
    echo [ERROR] Node.js 20 or newer is required. Found:
    node -v
    goto :fail
)
echo [OK] Node.js
node -v

rem ---------- 2. Create .env files (kept if they already exist) ----------
if not exist "apps\api\.env" (
    for /f %%i in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"') do set JWT_SECRET=%%i
    (
        echo # SERVER CONFIG
        echo NODE_ENV="development"
        echo PORT="4000"
        echo ALLOW_DOMAINS="http://localhost:5173"
        echo.
        echo # DB CONFIG
        echo DB_HOST="localhost"
        echo DB_PORT="5432"
        echo DB_USER="clause"
        echo DB_PASSWORD="clause"
        echo DB_NAME="clause"
        echo DB_SSL="false"
        echo.
        echo # AUTH CONFIG
        echo JWT_SECRET="!JWT_SECRET!"
        echo JWT_EXPIRES_IN="7d"
    ) > "apps\api\.env"
    echo [OK] Created apps\api\.env
) else (
    echo [OK] apps\api\.env already exists - keeping it
)

if not exist "apps\web\.env" (
    (
        echo VITE_APP_ENV="development"
        echo VITE_API_URL="http://localhost:4000"
    ) > "apps\web\.env"
    echo [OK] Created apps\web\.env
) else (
    echo [OK] apps\web\.env already exists - keeping it
)

rem ---------- 3. Start PostgreSQL ----------
call "%~dp0scripts\windows\start-db.bat"
if errorlevel 1 echo [WARN] Continuing without PostgreSQL; uploads will be temporary.

rem ---------- 4. Install dependencies ----------
echo.
echo Installing dependencies (this can take a few minutes)...
call npm ci
if errorlevel 1 (
    echo [ERROR] npm ci failed.
    goto :fail
)

rem ---------- 5. Build shared constants ----------
call npm run build:constants
if errorlevel 1 goto :fail

rem ---------- 6. Create database tables ----------
echo.
echo Creating database tables...
call npm run db:push
if errorlevel 1 (
    echo [WARN] Could not create database tables. The API will use temporary in-memory storage.
)

echo.
echo ============================================
echo   Setup complete. Run start.bat to launch.
echo ============================================
echo.
pause
exit /b 0

:fail
echo.
echo Setup did not finish. Fix the error above and run setup.bat again.
pause
exit /b 1
