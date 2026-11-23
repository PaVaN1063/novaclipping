# Nova Clipping: put the website and the studio into one Git repo and push it
# to https://github.com/PaVaN1063/novaclipping (main = live, dev = work).
# Commits are made as Pavan Kumar Naraharisetti only.
$ErrorActionPreference = "Continue"
$Studio = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Tools  = Split-Path -Parent $Studio
$Web    = Join-Path $Tools "NovaClipping  Website"
$Root   = Join-Path $Tools "novaclipping-repo"
$Remote = "https://github.com/PaVaN1063/novaclipping.git"
$Log    = Join-Path $Studio "github-setup.log"
"=== $(Get-Date) github setup" | Out-File $Log -Encoding utf8
function Say($m) { Write-Host $m; $m | Out-File $Log -Append -Encoding utf8 }
function Run { param([string[]]$a) $out = & git @a 2>&1; $out | Out-File $Log -Append -Encoding utf8; $out | Write-Host; return $LASTEXITCODE }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Say "ERROR: Git is not installed. Install it from https://git-scm.com/download/win and run this again."; exit 1 }
if (Test-Path (Join-Path $Root ".git")) { Say "ERROR: $Root already has a Git repo. Nothing changed."; exit 1 }

Say "Copying the studio..."
robocopy $Studio (Join-Path $Root "studio") /E /NFL /NDL /NJH /NJS /NP `
  /XD output uploads .cache .config .hallmark .github node_modules __pycache__ .git target `
  /XF publish.json deploy-oracle.log github-setup.log oracle-key-path.txt studio-login.txt website-login.txt website.env CLAUDE.md *.pyc | Out-Null
Say "Copying the website..."
robocopy $Web (Join-Path $Root "website") /E /NFL /NDL /NJH /NJS /NP `
  /XD node_modules .next data storage inbox .netlify `
  /XF .env.local *.tsbuildinfo deploy-netlify.bat deploy-netlify.log | Out-Null

@"
# Nova Clipping

Turn long gameplay into short clips, add a watermark, and post them to YouTube and Instagram.

- ``website/`` : the Nova Clipping website (Next.js), deployed on Netlify from ``main``.
- ``studio/``  : the clipping engine (Python + React), runs on the Oracle Cloud VM.

Branches: ``main`` is the live website. Work happens on ``dev`` and reaches ``main`` through pull requests.
"@ | Out-File (Join-Path $Root "README.md") -Encoding utf8

@"
# secrets and local data: never commit
.env
.env.*
!.env.example
**/data/
**/storage/
**/inbox/
**/output/
**/uploads/
**/.cache/
**/node_modules/
**/.next/
**/.netlify/
**/__pycache__/
*.log
*.tsbuildinfo
studio/assets/nova_brand/publish.json
studio/deploy/*login*.txt
studio/deploy/oracle-key-path.txt
studio/deploy/website.env
studio/deploy/Caddyfile.live
studio/deploy/.studio-hash
website/netlify-proxy/deploy-netlify.bat
*.key
*.pem
"@ | Out-File (Join-Path $Root ".gitignore") -Encoding utf8

Set-Location $Root
Run @("init", "-b", "main") | Out-Null
Run @("config", "user.name", "Pavan Kumar Naraharisetti") | Out-Null
Run @("config", "user.email", "pavankumarnaraharisetti5763@gmail.com") | Out-Null
Run @("add", "-A") | Out-Null
Run @("commit", "-q", "-m", "Nova Clipping: website and studio") | Out-Null
Run @("remote", "add", "origin", $Remote) | Out-Null

Say "Checking the GitHub repo (a GitHub sign-in window may open)..."
$heads = & git ls-remote --heads origin 2>&1
$heads | Out-File $Log -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) { Say "ERROR: can't reach $Remote. Sign in to GitHub when asked, then run again."; exit 1 }
if ($heads -match "refs/heads/main") {
  Say "GitHub already has a main branch: joining its history with this code..."
  Run @("fetch", "origin", "main") | Out-Null
  Run @("merge", "origin/main", "--allow-unrelated-histories", "-X", "ours", "-m", "Join existing GitHub repo") | Out-Null
}
Say "Pushing main..."
if ((Run @("push", "-u", "origin", "main")) -ne 0) { Say "ERROR: push to main failed."; exit 1 }
Run @("checkout", "-b", "dev") | Out-Null
Say "Pushing dev..."
if ((Run @("push", "-u", "origin", "dev")) -ne 0) { Say "ERROR: push to dev failed."; exit 1 }
Say "DONE. Repo folder: $Root  (now on branch dev)"
