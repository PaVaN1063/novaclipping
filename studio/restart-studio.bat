@echo off
title Nova Clipping Studio - restarting
cd /d "%~dp0"
echo.
echo  Applying the latest Nova Clipping Studio changes (backend + dashboard)...
echo.
docker compose up -d
docker compose restart backend frontend
echo.
echo  Done. Wait about 30 seconds, then refresh http://localhost:5175
echo.
timeout /t 15
