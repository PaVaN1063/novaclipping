@echo off
title Nova Clipping - push to GitHub
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0github-setup.ps1"
echo.
pause
