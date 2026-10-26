#!/usr/bin/env bash
# Déploie le dernier commit sur le serveur OVH (hôte SSH « ovh-deploy »).
# Les données du restaurant (carte, photos, historique) sont dans un volume Docker
# et ne sont jamais écrasées par un déploiement.
set -euo pipefail

HOST="${DEPLOY_HOST:-ovh-deploy}"
DIR="fujiyama-etoile"

if [ -n "$(git status --porcelain)" ]; then
  echo "Des modifications ne sont pas commitées : seul le dernier commit est déployé." >&2
fi

echo "→ Envoi de $(git rev-parse --short HEAD) vers $HOST"
git archive --format=tar HEAD | ssh "$HOST" "set -e; mkdir -p ~/$DIR/app.new; tar -x -C ~/$DIR/app.new"

ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ~/$DIR
test -f .env || { echo ".env manquant dans ~/$DIR (voir README)"; exit 1; }
rm -rf app.old; [ -d app ] && mv app app.old; mv app.new app
cp .env app/.env
cd app
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
EOF

echo "→ Vérification"
sleep 3
ssh "$HOST" "curl -fsS http://127.0.0.1:8095/api/health" && echo " OK"
