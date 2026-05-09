#!/usr/bin/env bash
# ============================================================================
# deploy.sh  –  InvestorFYP one-shot deployment script
# Run on the DigitalOcean droplet as root (or sudo):
#   bash deploy.sh
#
# What it does:
#   1. Installs system dependencies (python3, pip, nodejs, npm, nginx)
#   2. Clones / updates the repo from GitHub
#   3. Builds the React frontend (served at /web)
#   4. Sets up the Django backend (gunicorn on port 8765)
#   5. Configures nginx to add /web and /api WITHOUT touching the existing /
#   6. Reloads nginx
#
# The existing model at 159.65.235.61 is NEVER touched.
# ============================================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/Stunvansh/investorfyp.git"
DEPLOY_DIR="/var/www/investorfyp"
LOG_DIR="/var/log/investorfyp"
SERVICE_NAME="investorfyp-api"
NGINX_SNIPPET="/etc/nginx/snippets/investorfyp.conf"
PORT=8765
VITE_API_URL="http://159.65.235.61/api"

# ── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

info "=== InvestorFYP Deployment starting ==="

# ── 1. System packages ────────────────────────────────────────────────────────
info "Installing system packages..."
apt-get update -q
apt-get install -y -q python3 python3-pip python3-venv nodejs npm nginx git curl

# node LTS via nodesource if node < 18
NODE_VER=$(node -v 2>/dev/null | grep -oP '\d+' | head -1 || echo "0")
if [ "$NODE_VER" -lt 18 ]; then
    info "Upgrading Node.js to LTS..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y -q nodejs
fi

# ── 2. Clone / update repo ────────────────────────────────────────────────────
info "Deploying code to $DEPLOY_DIR..."
mkdir -p "$DEPLOY_DIR"
if [ -d "$DEPLOY_DIR/.git" ]; then
    info "Repo exists – pulling latest changes..."
    cd "$DEPLOY_DIR"
    git pull origin main
else
    info "Cloning repo..."
    git clone "$REPO_URL" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi

# ── 3. Frontend build ─────────────────────────────────────────────────────────
info "Building React frontend..."
cd "$DEPLOY_DIR/frontend"
npm ci --silent
VITE_API_BASE_URL="$VITE_API_URL" npm run build
info "Frontend built → $DEPLOY_DIR/frontend/dist"

# ── 4. Backend setup ──────────────────────────────────────────────────────────
info "Setting up Python virtualenv..."
cd "$DEPLOY_DIR"
python3 -m venv .venv
source .venv/bin/activate

info "Installing Python deps..."
pip install --quiet --upgrade pip
pip install --quiet -r backend/requirements.txt
pip install --quiet gunicorn

# ── 4a. .env file ─────────────────────────────────────────────────────────────
ENV_FILE="$DEPLOY_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    warn ".env not found – creating minimal production .env"
    SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
    cat > "$ENV_FILE" <<EOF
DJANGO_SECRET_KEY=$SECRET
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=159.65.235.61,localhost
CORS_ALLOWED_ORIGINS=http://159.65.235.61
EOF
    warn "Edit $ENV_FILE to add Stripe keys and PostgreSQL config if needed."
fi

# ── 4b. Database & static files ───────────────────────────────────────────────
info "Running Django migrations..."
cd "$DEPLOY_DIR/backend"
python manage.py migrate --noinput

info "Collecting static files..."
python manage.py collectstatic --noinput --clear 2>/dev/null || true

# ── 5. Log directory ──────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
chown -R www-data:www-data "$LOG_DIR"
chown -R www-data:www-data "$DEPLOY_DIR"

# ── 6. Systemd service ────────────────────────────────────────────────────────
info "Installing systemd service..."
cp "$DEPLOY_DIR/scripts/investorfyp-api.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "Django API service is running on port $PORT ✅"
else
    error "Django API service failed to start! Check: journalctl -u $SERVICE_NAME -n 50"
fi

# ── 7. Nginx config ───────────────────────────────────────────────────────────
info "Installing nginx snippet..."
mkdir -p /etc/nginx/snippets
cp "$DEPLOY_DIR/scripts/nginx-investorfyp.conf" "$NGINX_SNIPPET"

# Auto-detect the active nginx server block config (could be tracefake, default, etc.)
NGINX_CONF=$(grep -rl "listen 80" /etc/nginx/sites-enabled/ 2>/dev/null | head -1)
if [ -z "$NGINX_CONF" ]; then
    NGINX_CONF=$(grep -rl "listen 80" /etc/nginx/conf.d/ 2>/dev/null | head -1)
fi
if [ -z "$NGINX_CONF" ]; then
    NGINX_CONF="/etc/nginx/sites-available/default"
fi
info "Using nginx config: $NGINX_CONF"

if ! grep -q "investorfyp" "$NGINX_CONF" 2>/dev/null; then
    info "Adding include to nginx config..."
    # Insert our include just before the last closing } of the server block
    sed -i '/^}/i\    include snippets\/investorfyp.conf;' "$NGINX_CONF"
    info "Added: include snippets/investorfyp.conf to $NGINX_CONF"
else
    info "Nginx snippet already included – skipping"
fi

# ── 8. Test & reload nginx ────────────────────────────────────────────────────
info "Testing nginx config..."
nginx -t
info "Reloading nginx..."
systemctl reload nginx

# ── 9. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       InvestorFYP Deployment Complete! 🚀            ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Frontend:  http://159.65.235.61/web                 ║${NC}"
echo -e "${GREEN}║  API:       http://159.65.235.61/api                 ║${NC}"
echo -e "${GREEN}║  Admin:     http://159.65.235.61/django-admin        ║${NC}"
echo -e "${GREEN}║  Model:     http://159.65.235.61  (unchanged ✅)     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  If the API returns errors, check: journalctl -u investorfyp-api -n 50"
echo "  To create a Django superuser:    python manage.py createsuperuser"
