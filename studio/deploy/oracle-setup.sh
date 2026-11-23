#!/usr/bin/env bash
# Nova Clipping Studio: install / update on the Oracle Cloud VM (Ubuntu, ARM64).
# Run by deploy-oracle.bat from Windows. Safe to run again (redeploy).
set -euo pipefail
trap 'echo "FAILED at line $LINENO: $BASH_COMMAND"' ERR
APP=~/novaclipping
LOG=~/nova-deploy.log
exec > >(tee -a "$LOG") 2>&1
echo "=== Nova Clipping deploy $(date -u) ==="
uname -m

# 1. Swap (builds need more than 12 GB at peak), once.
if ! sudo swapon --show | grep -q /swapfile; then
  echo "--- adding 4 GB swap"
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# 2. Docker, once.
if ! command -v docker >/dev/null; then
  echo "--- installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker ubuntu || true
fi
DOCKER="sudo docker"

# 3. Open port 80 in the VM's own firewall (Oracle's Ubuntu image blocks it).
set +e
if ! sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; then
  echo "--- opening ports 80 and 443 in iptables"
  sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT; echo "iptables: $?"
  echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
  echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null 2>&1; echo "persistent: $?"
  sudo netfilter-persistent save >/dev/null 2>&1 || { sudo mkdir -p /etc/iptables; sudo sh -c 'iptables-save > /etc/iptables/rules.v4'; }
fi
set -e

# 4. Unpack the new code (keeps output/, uploads/, settings and the password).
mkdir -p "$APP"
tar -xzf ~/nova-studio.tgz -C "$APP"
rm -f ~/nova-studio.tgz
cd "$APP"
mkdir -p output uploads .cache assets/nova_brand
# the backend runs as its own user inside Docker: let it write these
sudo chmod -R a+rwX output uploads .cache assets

# 4b. The Nova Clipping website (next to the Studio). Its settings and
# connections (data/nova.json) are copied from the laptop only the first time.
WEB=~/novaclipping-website
SITE_PUBLIC=https://novaclipping.netlify.app
SITE_DIRECT=https://nova.129-225-74-22.sslip.io
STUDIO_URL=https://novaclipping.netlify.app/studio
if [ -f ~/nova-website.tgz ]; then
  mkdir -p "$WEB"
  tar -xzf ~/nova-website.tgz -C "$WEB"
  rm -f ~/nova-website.tgz
fi
mkdir -p "$WEB/data" "$WEB/storage/clips" "$WEB/inbox"
if [ ! -f "$WEB/data/nova.json" ] && [ -f ~/nova-data.json ]; then
  echo "--- first time: copying the website's settings and connections from the laptop"
  cp ~/nova-data.json "$WEB/data/nova.json"
  python3 - "$WEB/data/nova.json" "$STUDIO_URL" "$SITE_DIRECT" <<'PY'
import json, sys
p, studio, direct = sys.argv[1:4]
d = json.load(open(p))
d.setdefault("prefs", {})
d["prefs"]["studioUrl"] = studio
d["prefs"]["publicUrl"] = direct
json.dump(d, open(p, "w"), indent=2)
PY
fi
rm -f ~/nova-data.json
sudo chmod -R a+rwX "$WEB/data" "$WEB/storage" "$WEB/inbox"
if [ ! -f deploy/website.env ]; then
  WPASS=$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | cut -c1-14)
  cat > deploy/website.env <<ENV
NOVA_USER=pavan
NOVA_PASSWORD=$WPASS
AUTH_SECRET=$(openssl rand -hex 32)
APP_URL=$SITE_PUBLIC
PUBLIC_URL=$SITE_DIRECT
STUDIO_URL=$STUDIO_URL
ENV
  chmod 600 deploy/website.env
  printf 'website: %s\nuser: pavan\npassword: %s\n' "$SITE_PUBLIC" "$WPASS" > deploy/website-login.txt
  chmod 600 deploy/website-login.txt
fi
# Engine settings (added to older website.env files too).
ENGINE_SECRET_NEW=$(cat ~/nova-engine-secret.txt 2>/dev/null || true)
rm -f ~/nova-engine-secret.txt
setenv() { grep -q "^$1=" deploy/website.env && sed -i "s|^$1=.*|$1=$2|" deploy/website.env || echo "$1=$2" >> deploy/website.env; }
setenv NOVA_ROLE engine
setenv PUBLIC_ENGINE_URL "$SITE_DIRECT"
setenv APP_URL "$SITE_PUBLIC"
[ -n "$ENGINE_SECRET_NEW" ] && setenv ENGINE_SECRET "$ENGINE_SECRET_NEW"
grep -q '^ENGINE_SECRET=' deploy/website.env || echo "WARNING: ENGINE_SECRET missing; the website on Netlify can't reach the engine"

# The Studio posts through the website right here on the VM.
if [ -f assets/nova_brand/publish.json ]; then
  python3 - assets/nova_brand/publish.json "$SITE_PUBLIC" <<'PY'
import json, sys
p, site = sys.argv[1:3]
d = json.load(open(p)); d["site_url"] = site; json.dump(d, open(p, "w"))
PY
fi

# Base images were pinned for the laptop (x86); on ARM use the plain tags.
sed -i -E 's/^(FROM [^ @]+)@sha256:[0-9a-f]+/\1/' Dockerfile render-service/Dockerfile dashboard/Dockerfile

# 5. Login for the Studio page (made once, kept on redeploy).
if [ ! -f deploy/studio-login.txt ]; then
  PASS=$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | cut -c1-16)
  printf 'user: nova\npassword: %s\n' "$PASS" > deploy/studio-login.txt
  chmod 600 deploy/studio-login.txt
  $DOCKER run --rm caddy:2 caddy hash-password --plaintext "$PASS" > deploy/.studio-hash
fi
HASH=$(cat deploy/.studio-hash)
cat > deploy/Caddyfile.live <<CADDY
# Website (Netlify forwards novaclipping.netlify.app here)
nova.129-225-74-22.sslip.io {
	encode gzip
	request_body {
		max_size 2GB
	}
	reverse_proxy website:3000
}

CADDY

# 6. Build and start.
echo "--- building and starting (first time takes 15-30 minutes on ARM)"
$DOCKER compose -f docker-compose.yml -f docker-compose.oracle.yml up -d --build
$DOCKER compose -f docker-compose.yml -f docker-compose.oracle.yml ps

IP=$(curl -s --max-time 5 https://api.ipify.org || echo "129.225.74.22")
echo
echo "=== DONE"
echo "=== Website: https://novaclipping.netlify.app   (login: deploy/website-login.txt)"
echo "=== Studio:  https://novaclipping.netlify.app/studio"
