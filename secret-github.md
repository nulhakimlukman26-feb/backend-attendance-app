Add these GitHub Secrets (repo Settings → Secrets → Actions):
Secret	Value
VPS_HOST	VPS IP/hostname
VPS_USER	ssh user (e.g. root)
VPS_SSH_KEY	private key (cat ~/.ssh/id_*)
VPS_PORT	22 if unsure
VPS_APP_DIR	e.g. /opt/attendance-backend
GHCR_TOKEN	optional PAT (read:packages) — only if the GHCR package is private; skip if public
One-time VPS setup
1. Install Docker + compose plugin; mkdir -p /opt/attendance-backend
2. Put a production .env there (copy from .env.example: NODE_ENV=production, real DB_HOST/DB_USER/DB_PASS/DB_NAME, JWT_*, CORS_ORIGIN) — never committed
3. Create the MySQL database once (CREATE DATABASE attendance_app;) — migrate creates tables, not the DB
4. Add the public key matching VPS_SSH_KEY to ~/.ssh/authorized_keys for VPS_USER
5. Push to main and watch Actions: CI → Build & Push → Deploy
First deploy can also be triggered manually from the Actions tab if the image already exists.