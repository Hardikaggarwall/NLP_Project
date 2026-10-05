@echo off
rem Starts the PostgreSQL container and waits until it accepts connections.
rem Skipped when Docker is not installed (use your own PostgreSQL 18 instead).
setlocal EnableDelayedExpansion
cd /d "%~dp0..\.."

where docker >nul 2>nul
if errorlevel 1 (
    echo [WARN] Docker was not found. Skipping the database container.
    echo        Make sure PostgreSQL 18 is running and the DB_* values in apps\api\.env match it.
    exit /b 0
)

docker info >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker is installed but not running. Start Docker Desktop and try again.
    exit /b 1
)

echo Starting PostgreSQL container...
docker compose up -d postgres
if errorlevel 1 (
    echo [ERROR] Could not start the PostgreSQL container.
    exit /b 1
)

set /a TRIES=0
:wait
set DB_STATE=
for /f %%s in ('docker inspect --format "{{.State.Health.Status}}" clause-postgres 2^>nul') do set DB_STATE=%%s
if "!DB_STATE!"=="healthy" (
    echo [OK] PostgreSQL is ready
    exit /b 0
)
set /a TRIES+=1
if !TRIES! GEQ 60 (
    echo [ERROR] PostgreSQL did not become ready in time. Check: docker logs clause-postgres
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto :wait
