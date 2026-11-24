# Nova Clipping: save the latest VM logs to deploy\vm-logs.txt (for troubleshooting).
$Here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Out = Join-Path $Here "deploy\vm-logs.txt"
$KeyPath = (Get-Content (Join-Path $Here "deploy\oracle-key-path.txt") -Raw -ErrorAction SilentlyContinue)
if (-not $KeyPath) { $KeyPath = (Get-ChildItem "$HOME\Downloads" -Filter "ssh-key*.key" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
$KeyPath = $KeyPath.Trim()
$Key = Join-Path $env:TEMP ("nova_oci_{0}.key" -f [guid]::NewGuid().ToString("N"))
Copy-Item $KeyPath $Key -Force
icacls $Key /inheritance:r /grant:r "$($env:USERNAME):(R,D)" | Out-Null
$cmd = 'cd ~/novaclipping; echo "== load"; uptime; nproc; free -h | head -2; echo "== cpu"; top -bn1 | head -15; echo "== backend"; sudo docker logs --since 60m novaclipping-backend 2>&1 | grep -v health/ready | tail -400'
& ssh -i $Key -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=20 ubuntu@129.225.74.22 $cmd 2>&1 | Out-File $Out -Encoding utf8
Remove-Item $Key -Force -ErrorAction SilentlyContinue
