@echo off
title Nova Clipping - localhost:3000
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages, first run only...
  call npm install
)
echo Starting Nova Clipping on http://localhost:3000
call npm run dev
pause
