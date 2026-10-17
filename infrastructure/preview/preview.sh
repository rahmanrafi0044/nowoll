#!/usr/bin/env bash
# ============================================================================
# The $0 TRIAL (step 48b): the production setup running on this PC, reachable
# at the real addresses (nowoll.com, admin., api.) through a Cloudflare Tunnel,
# behind the trial password. Guide: docs/preview.md.
#
#   infrastructure/preview/preview.sh build    build the 5 images (after each code change)
#   infrastructure/preview/preview.sh up       start everything + the tunnel
#   infrastructure/preview/preview.sh status   what runs, is the tunnel connected
#   infrastructure/preview/preview.sh logs [storefront|admin|api|order-worker|notification-worker|nginx|tunnel]
#   infrastructure/preview/preview.sh down     stop everything (the data stays)
#
# Settings: ~/nowoll-preview/.env (outside the repo — it holds secrets) and
# ~/nowoll-preview/htpasswd (the trial password). The database and photos are
# the PRODUCTION Supabase project, so what you upload now is the real catalogue.
#
# Same images and compose files as the VPS, under their own project names
# ("nowoll-preview", never "nowoll" — that's the dev setup). Only the website
# ports differ: none are opened on this PC; the tunnel connects out.
# NOWOLL_PREVIEW_DIR / NOWOLL_COMPOSE_OVERRIDE / NOWOLL_EDGE_OVERRIDE: for tests.
# ============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
export NOWOLL_PREVIEW_DIR="${NOWOLL_PREVIEW_DIR:-$HOME/nowoll-preview}"
ENV_FILE="$NOWOLL_PREVIEW_DIR/.env"
export NOWOLL_ENV_FILE="$ENV_FILE" NOWOLL_HTPASSWD="$NOWOLL_PREVIEW_DIR/htpasswd"
export DEPLOY_ENV=production IMAGE_PREFIX=nowoll IMAGE_TAG=preview

say() { echo "[preview] $*"; }
fail() { echo "[preview] ✗ $*" >&2; exit 1; }

# One value from the .env (not `source`: values like "Nowoll <orders@…>" aren't shell).
val() { grep -m1 "^$1=" "$ENV_FILE" 2> /dev/null | cut -d= -f2- || true; }

app() {
  local files=(-f "$REPO/infrastructure/deployment/docker-compose.prod.yml")
  [[ -n "${NOWOLL_COMPOSE_OVERRIDE:-}" ]] && files+=(-f "$NOWOLL_COMPOSE_OVERRIDE")
  docker compose -p nowoll-preview "${files[@]}" --env-file "$ENV_FILE" "$@"
}
edge() {
  local files=(-f "$REPO/infrastructure/deployment/docker-compose.edge.yml"
    -f "$REPO/infrastructure/preview/docker-compose.preview-edge.yml")
  [[ -n "${NOWOLL_EDGE_OVERRIDE:-}" ]] && files+=(-f "$NOWOLL_EDGE_OVERRIDE")
  docker compose -p nowoll-preview-edge "${files[@]}" --env-file "$ENV_FILE" "$@"
}

check_env() {
  [[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE — copy .env.production.example there and fill it in (docs/preview.md)"
  local missing=() k
  for k in "$@"; do [[ -n "$(val "$k")" ]] || missing+=("$k"); done
  ((${#missing[@]} == 0)) || fail "fill in, in $ENV_FILE: ${missing[*]}"
}

build() {
  check_env SITE_DOMAIN ADMIN_DOMAIN API_DOMAIN NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
  cd "$REPO"
  # One at a time: this PC's memory (docs: low-memory WSL).
  say "building the API and the two workers…"
  docker build -q -f infrastructure/docker/api.Dockerfile -t nowoll-api:preview . > /dev/null
  local w
  for w in order-worker notification-worker; do
    docker build -q -f infrastructure/docker/worker.Dockerfile --build-arg "WORKER=$w" -t "nowoll-$w:preview" . > /dev/null
  done
  local web
  for web in storefront admin; do
    say "building the $web (the real addresses are baked in)…"
    docker build -q -f infrastructure/docker/web.Dockerfile --build-arg "APP=$web" \
      --build-arg "NEXT_PUBLIC_SITE_URL=https://$(val SITE_DOMAIN)" \
      --build-arg "NEXT_PUBLIC_ADMIN_URL=https://$(val ADMIN_DOMAIN)" \
      --build-arg "NEXT_PUBLIC_API_URL=https://$(val API_DOMAIN)" \
      --build-arg "NEXT_PUBLIC_SUPABASE_URL=$(val NEXT_PUBLIC_SUPABASE_URL)" \
      --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$(val NEXT_PUBLIC_SUPABASE_ANON_KEY)" \
      -t "nowoll-$web-production:preview" . > /dev/null
  done
  say "✓ built — now: preview.sh up"
}

up() {
  check_env SITE_DOMAIN ADMIN_DOMAIN API_DOMAIN DATABASE_URL REDIS_PASSWORD INTERNAL_API_KEY CLOUDFLARE_TUNNEL_TOKEN
  docker image inspect nowoll-storefront-production:preview > /dev/null 2>&1 || fail "no images yet — run: preview.sh build"
  [[ -s "$NOWOLL_HTPASSWD" ]] || fail "no trial password yet — add one to $NOWOLL_HTPASSWD (docs/preview.md)"
  # nginx runs as its own user inside its container, so it must be able to read
  # the file. It holds only bcrypt HASHES, never the passwords themselves — but
  # a private (600) file, like the .env, made every visit fail with 500.
  chmod 644 "$NOWOLL_HTPASSWD"
  # The certificate nginx shows the tunnel (self-signed; visitors see Cloudflare's).
  local le="$NOWOLL_PREVIEW_DIR/le/live/nowoll" site
  site="$(val SITE_DOMAIN)"
  if [[ ! -f "$le/fullchain.pem" ]]; then
    mkdir -p "$le"
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=$site" \
      -addext "subjectAltName=DNS:$site,DNS:www.$site,DNS:$(val ADMIN_DOMAIN),DNS:$(val API_DOMAIN)" \
      -keyout "$le/privkey.pem" -out "$le/fullchain.pem" 2> /dev/null
    chmod 644 "$le/fullchain.pem" "$le/privkey.pem"
  fi
  docker network create nowoll_edge > /dev/null 2>&1 || true
  say "starting the shop, admin, API and workers…"
  app up -d --no-build --remove-orphans --wait --wait-timeout 180 > /dev/null 2>&1 \
    || { app ps; fail "a part did not become healthy — preview.sh logs <part>"; }
  # Warm-up, as on the VPS (deploy.sh): the main pages, before the owner opens them.
  local p
  for p in / /shop /blog; do
    app exec -T storefront node -e "fetch('http://127.0.0.1:3000$p').then(r=>r.text()).catch(()=>{})" > /dev/null 2>&1 || true
  done
  say "starting nginx and the tunnel…"
  edge up -d --remove-orphans --wait --wait-timeout 60 > /dev/null 2>&1 || fail "nginx or the tunnel did not start — preview.sh logs nginx / tunnel"
  # The tunnel needs a few seconds to reach Cloudflare.
  local _
  for _ in $(seq 1 15); do
    edge logs tunnel 2> /dev/null | grep "Registered tunnel connection" > /dev/null && break
    sleep 2
  done
  status
  say "open https://$site (and https://$(val ADMIN_DOMAIN)/admin/login) — works while this PC is on"
}

status() {
  # (grep without -q: with "pipefail", -q stops reading early, the log command
  # then fails on the closed pipe, and the check would wrongly say "not connected".)
  app ps --format '  {{.Service}}: {{.Status}}'
  edge ps --format '  {{.Service}}: {{.Status}}'
  if edge logs tunnel 2> /dev/null | grep "Registered tunnel connection" > /dev/null; then
    say "✓ tunnel connected to Cloudflare"
  else
    say "tunnel not connected (yet) — preview.sh logs tunnel"
  fi
}

case "${1:-}" in
  build) build ;;
  up) up ;;
  status) status ;;
  logs)
    case "${2:-}" in
      nginx | tunnel) edge logs -f --tail 100 "$2" ;;
      *) app logs -f --tail 100 ${2:+"$2"} ;;
    esac
    ;;
  down)
    edge down
    app down # no -v: Redis's queued jobs stay; the real data is in Supabase anyway
    ;;
  *) sed -n '5,10p' "$0" | sed 's/^# \{0,1\}//' && exit 2 ;;
esac
