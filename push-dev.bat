@echo off
title Nova Clipping - save and push to dev
cd /d "%~dp0"
git checkout dev >nul 2>&1
git add -A
if exist .commit-msg (
  git commit -F .commit-msg
  del .commit-msg
) else (
  git commit -m "Update"
)
git push origin dev
echo.
echo Done. Open https://github.com/PaVaN1063/novaclipping/compare/main...dev to make a pull request.
pause
