#!/bin/bash
# Le studio Alaya sur ce Mac : http://127.0.0.1:8776/studio/
# Le premier compte vient de .env (ADMIN_EMAIL, ADMIN_PASSWORD), cree au premier lancement.
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
exec node server.js
