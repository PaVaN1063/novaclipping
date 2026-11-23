# Nova Clipping: send the Studio to the Oracle Cloud VM and start it there.
# Run deploy-oracle.bat (double-click). Optional: drag your private .key file onto it.
param([string]$KeyPath = "")
$ErrorActionPreference = "Stop"
$VmIp   = "129.225.74.22"
$VmUser = "ubuntu"
$Here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log    = Join-Path $Here "deploy-oracle.log"
"=== $(Get-Date) deploy to $VmIp" | Out-File $Log -Encoding utf8
function Say($m) { Write-Host $m; $m | Out-File $Log -Append -Encoding utf8 }
trap { Say "ERROR: $_"; break }

# 1. Find the SSH private key (the .key file Oracle gave you).
$saved = Join-Path $Here "deploy\oracle-key-path.txt"
if (-not $KeyPath -and (Test-Path $saved)) { $KeyPath = (Get-Content $saved -Raw).Trim() }
if (-not $KeyPath -or -not (Test-Path $KeyPath)) {
  $dirs = @("$HOME\Downloads", "$HOME\.ssh", "$HOME\Desktop", "$HOME\Documents", "D:\", "D:\Files")
  $cands = foreach ($d in $dirs) {
    if (Test-Path $d) { Get-ChildItem $d -File -ErrorAction SilentlyContinue |
      Where-Object { ($_.Extension -eq ".key" -or $_.Name -like "ssh-key*" -or $_.Name -like "id_*") -and $_.Extension -ne ".pub" -and $_.Length -lt 10000 } }
  }
  $cands = $cands | Where-Object { (Get-Content $_.FullName -TotalCount 1 -ErrorAction SilentlyContinue) -match "PRIVATE KEY" } |
    Sort-Object LastWriteTime -Descending
  if (-not $cands) { Say "ERROR: no SSH private key found. Drag your .key file onto deploy-oracle.bat."; exit 1 }
  $KeyPath = $cands[0].FullName
}
Say "Using key: $KeyPath"
$KeyPath | Out-File $saved -Encoding ascii

# Windows ssh refuses keys other users can read: use a private copy.
$Key = Join-Path $env:TEMP ("nova_oci_{0}.key" -f [guid]::NewGuid().ToString("N"))
Copy-Item $KeyPath $Key -Force
icacls $Key /inheritance:r /grant:r "$($env:USERNAME):(R,D)" | Out-Null
$Ssh = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=8")

# ssh writes notices to stderr; don't treat them as failures.
$ErrorActionPreference = "Continue"
try {
  # 2. Check the connection.
  Say "Connecting to $VmUser@$VmIp ..."
  & ssh @Ssh "$VmUser@$VmIp" "echo connected: `$(uname -m)" 2>&1 | Tee-Object -FilePath $Log -Append
  if ($LASTEXITCODE -ne 0) { Say "ERROR: could not log in to the VM (check the key and that port 22 is open)."; exit 1 }

  # 3. Pack the Studio (no videos, caches or node_modules).
  $Tgz = Join-Path $env:TEMP "nova-studio.tgz"
  Say "Packing the Studio..."
  Push-Location $Here
  tar.exe -czf $Tgz --exclude=./output --exclude=./uploads --exclude=./.cache --exclude=./.git `
    --exclude=node_modules --exclude=__pycache__ --exclude=./deploy-oracle.log `
    --exclude=./deploy/oracle-key-path.txt --exclude=./deploy/studio-login.txt --exclude=./deploy/website-login.txt --exclude=./osrender/target .
  Pop-Location
  Say ("Package: {0:N1} MB" -f ((Get-Item $Tgz).Length / 1MB))
  # The Nova Clipping website goes next to it (videos and node_modules stay here).
  $Web = Join-Path (Split-Path -Parent $Here) "NovaClipping  Website"
  $WebTgz = Join-Path $env:TEMP "nova-website.tgz"
  $Data = Join-Path $Web "data\nova.json"
  $Up = @($Tgz, (Join-Path $Here "deploy\oracle-setup.sh"))
  if (Test-Path $Web) {
    Say "Packing the website..."
    Push-Location $Web
    tar.exe -czf $WebTgz --exclude=./node_modules --exclude=./.next --exclude=./data --exclude=./storage `
      --exclude=./inbox --exclude=./.env.local --exclude=*.log .
    Pop-Location
    $Up += $WebTgz
    if (Test-Path $Data) {
      $DataCopy = Join-Path $env:TEMP "nova-data.json"
      Copy-Item $Data $DataCopy -Force
      $Up += $DataCopy
    }
  }

  # 4. Upload and run the setup on the VM.
  Say "Uploading..."
  & scp @Ssh @Up "${VmUser}@${VmIp}:~/" 2>&1 | Tee-Object -FilePath $Log -Append
  if ($LASTEXITCODE -ne 0) { Say "ERROR: upload failed."; exit 1 }
  Say "Installing on the VM (first time: 15-30 minutes)..."
  & ssh @Ssh "$VmUser@$VmIp" "sed -i 's/\r$//' ~/oracle-setup.sh && bash ~/oracle-setup.sh" 2>&1 | Tee-Object -FilePath $Log -Append
  if ($LASTEXITCODE -ne 0) { Say "ERROR: setup on the VM failed. See deploy-oracle.log."; exit 1 }
  & ssh @Ssh "$VmUser@$VmIp" "cat ~/novaclipping/deploy/studio-login.txt" 2>&1 | Tee-Object -FilePath (Join-Path $Here "deploy\studio-login.txt")
  & ssh @Ssh "$VmUser@$VmIp" "cat ~/novaclipping/deploy/website-login.txt" 2>&1 | Out-File (Join-Path $Here "deploy\website-login.txt") -Encoding utf8
  Say "DONE. Website: https://novaclipping.netlify.app (login in deploy\website-login.txt)"
  Say "      Studio:  https://studio.129-225-74-22.sslip.io/#app (login in deploy\studio-login.txt)"
}
finally {
  Remove-Item $Key -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $env:TEMP "nova-studio.tgz") -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $env:TEMP "nova-website.tgz") -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $env:TEMP "nova-data.json") -Force -ErrorAction SilentlyContinue
}
