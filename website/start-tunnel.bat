@echo off
title Nova Clipping - public address (Cloudflare tunnel)
echo.
echo  Gives your local Nova Clipping (localhost:3000) a temporary public https address,
echo  so Instagram can download your Reels. Keep this window open while posting.
echo.
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo  Installing Cloudflare's free tunnel tool, one time only...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo.
  echo  Installed. If the next step says "cloudflared is not recognized", close this window and double-click start-tunnel.bat again.
  echo.
)
echo  Look below for a line with  https://....trycloudflare.com
echo  Copy that address into Nova Clipping: Settings - Instagram - Public address.
echo.
cloudflared tunnel --url http://localhost:3000
pause
