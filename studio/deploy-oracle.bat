@echo off
title Nova Clipping - deploy to Oracle Cloud VM
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-oracle.ps1" %1
echo.
pause
