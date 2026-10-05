@echo off
cd /d "%~dp0"
rem Stops the PostgreSQL container. Your data is kept in a Docker volume.
docker compose stop postgres
pause
