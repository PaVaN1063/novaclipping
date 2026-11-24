@echo off
title Nova Clipping - get VM logs
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vm-logs.ps1"
