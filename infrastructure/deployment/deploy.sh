#!/usr/bin/env bash
# ============================================================================
# Runs ON THE VPS for every deploy (step 47) — started by the GitHub workflows:
#   bash <root>/app.new/infrastructure/deployment/deploy.sh staging|production
#
#   environment   root (settings in <root>/.env)   compose project
#   staging       /opt/nowoll-staging              nowoll-staging
#   production    /opt/nowoll                      nowoll-production
#
# The workflow first uploads the new release to <root>/app.new:
#   app.new/infrastructure/{deployment,nginx}   the compose files + nginx template
#   app.new/release.env                          IMAGE_PREFIX=… and IMAGE_TAG=<git commit>
#
# This script:
#   1. swaps the folders: app → app.prev, app.new → app
#   2. pulls the new images and restarts the app (docker compose up --wait)
#   3. checks: API, shop and admin healthy + both workers still running (not crash-looping)
#   4. starts the shared nginx (docker-compose.edge.yml): always for production
#      — so nginx changes go live only with a production deploy — and for
#      staging only if nginx isn't running yet
#   5. healthy   → keeps it, and deletes images older than the previous release
#      unhealthy → ROLLBACK: puts app.prev back and starts the previous release
#
# Database migrations are NOT run here — the workflow runs them before this.
# NOWOLL_BASE (default /opt) and NOWOLL_COMPOSE_OVERRIDE / NOWOLL_EDGE_OVERRIDE
# exist only so the script can be tested on a developer machine.
# ============================================================================
set -euo pipefail

ENVIRONMENT="${1:-}"
BASE="${NOWOLL_BASE:-/opt}"
case "$ENVIRONMENT" in
  production) ROOT="$BASE/nowoll" && export COMPOSE_PROJECT_NAME=nowoll-production ;;
  staging) ROOT="$BASE/nowoll-staging" && export COMPOSE_PROJECT_NAME=nowoll-staging ;;
  *) echo "usage: deploy.sh staging|production" >&2 && exit 2 ;;
esac
export DEPLOY_ENV="$ENVIRONMENT" # the API's name for nginx: api-production / api-staging
export NOWOLL_ENV_FILE="$ROOT/.env"
EDGE_ENV_FILE="$BASE/nowoll/.env" # nginx always uses production's settings (both domains)
EDGE_HTPASSWD="$BASE/nowoll/htpasswd" # the trial / staging password (nginx)
export NOWOLL_HTPASSWD="$EDGE_HTPASSWD"
WORKERS=(order-worker notification-worker)

log() { echo "[deploy $ENVIRONMENT] $*"; }

# docker compose for the app of the release currently in $ROOT/app.
compose() {
  local files=(-f "$ROOT/app/infrastructure/deployment/docker-compose.prod.yml")
  [[ -n "${NOWOLL_COMPOSE_OVERRIDE:-}" ]] && files+=(-f "$NOWOLL_COMPOSE_OVERRIDE")
  docker compose "${files[@]}" --env-file "$NOWOLL_ENV_FILE" "$@"
}

# docker compose for the shared nginx + certbot, from the same release.
edge() {
  local files=(-f "$ROOT/app/infrastructure/deployment/docker-compose.edge.yml")
  [[ -n "${NOWOLL_EDGE_OVERRIDE:-}" ]] && files+=(-f "$NOWOLL_EDGE_OVERRIDE")
  COMPOSE_PROJECT_NAME=nowoll-edge docker compose "${files[@]}" --env-file "$EDGE_ENV_FILE" "$@"
}

# Loads IMAGE_PREFIX and IMAGE_TAG of the release in $ROOT/app.
load_release() {
  # shellcheck disable=SC1091
  set -a && source "$ROOT/app/release.env" && set +a
  : "${IMAGE_PREFIX:?release.env has no IMAGE_PREFIX}" "${IMAGE_TAG:?release.env has no IMAGE_TAG}"
}

# Starts the release in $ROOT/app and checks it. Returns 1 if unhealthy.
start_and_check() {
  load_release
  log "starting ${IMAGE_TAG}"
  # --wait: returns only when every service is running and every health
  # check (API, shop, admin) passes — or fails after the timeout.
  if ! compose up -d --no-build --remove-orphans --wait --wait-timeout 180; then
    log "containers did not become healthy"
    return 1
  fi
  # Warm-up (step 48): pages built into the image may be older than the
  # 60-second refresh, or empty if the API couldn't be reached during the
  # build. The first request starts a fresh rebuild in the background, so ask
  # for the main pages now, from inside the shop's container, before customers do.
  local p
  for p in / /shop /blog; do
    compose exec -T storefront node -e \
      "fetch('http://127.0.0.1:3000$p').then(r=>r.text()).catch(()=>{})" > /dev/null 2>&1 || true
  done
  # A worker with a bad setting starts, crashes and restarts — give it time
  # to show that, then require it to be running with no restarts.
  sleep "${NOWOLL_WORKER_SETTLE_SECONDS:-20}"
  local w id state
  for w in "${WORKERS[@]}"; do
    id="$(compose ps -q "$w")"
    state="$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' "$id" 2>/dev/null || echo missing)"
    if [[ "$state" != "running 0" ]]; then
      log "$w is not running cleanly ($state)"
      return 1
    fi
  done
  # The shared nginx. --force-recreate on production: nginx reads its template
  # from this release's folder, so it must restart to pick the new folder up
  # (a second or two). A staging deploy never changes a running nginx.
  if [[ "$ENVIRONMENT" == production ]]; then
    edge up -d --force-recreate --wait --wait-timeout 60 || { log "nginx did not start"; return 1; }
  elif [[ -z "$(edge ps -q --status running nginx 2>/dev/null)" ]]; then
    [[ -f "$EDGE_ENV_FILE" ]] || { log "nginx not started: $EDGE_ENV_FILE is missing"; return 1; }
    edge up -d --wait --wait-timeout 60 || { log "nginx did not start"; return 1; }
  fi
  log "${IMAGE_TAG} is healthy"
}

[[ -d "$ROOT/app.new" ]] || { log "nothing to deploy: $ROOT/app.new is missing"; exit 1; }
[[ -f "$NOWOLL_ENV_FILE" ]] || { log "missing $NOWOLL_ENV_FILE (copy .env.production.example)"; exit 1; }
docker network create nowoll_edge > /dev/null 2>&1 || true # shared with nginx; exists after the first deploy
# Nginx mounts the password file; an empty one means "nobody can sign in" to
# the password-protected sites until you add someone (docs/deployment.md).
[[ -f "$EDGE_HTPASSWD" ]] || { mkdir -p "$(dirname "$EDGE_HTPASSWD")" && : > "$EDGE_HTPASSWD"; }

# 1. Swap the folders (the previous release stays for a rollback).
rm -rf "$ROOT/app.prev"
[[ -d "$ROOT/app" ]] && mv "$ROOT/app" "$ROOT/app.prev"
mv "$ROOT/app.new" "$ROOT/app"

# 2. Pull the new images (GitHub logged this server in for the length of the deploy).
load_release
log "pulling ${IMAGE_PREFIX}-*:${IMAGE_TAG}"
compose pull --quiet api storefront admin "${WORKERS[@]}"

# 3–4. Start and check.
if start_and_check; then
  # 5a. Free disk space: keep the images that staging and production run now,
  # and each one's previous release (for a rollback).
  keep="$IMAGE_TAG"
  for f in "$BASE"/nowoll{,-staging}/{app,app.prev}/release.env; do
    [[ -f "$f" ]] && keep="$keep|$(sed -n 's/^IMAGE_TAG=//p' "$f")"
  done
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep "^${IMAGE_PREFIX}-" \
    | grep -vE ":(${keep})\$" \
    | xargs -r docker rmi > /dev/null 2>&1 || true
  docker image prune -f > /dev/null
  log "done — running ${IMAGE_TAG}"
  exit 0
fi

# 5b. Rollback.
log "logs of the failed release:"
compose logs --tail 40 api storefront admin "${WORKERS[@]}" || true
if [[ ! -d "$ROOT/app.prev" ]]; then
  log "FAILED, and there is no previous release to go back to"
  exit 1
fi
log "ROLLING BACK to the previous release"
rm -rf "$ROOT/app.failed"
mv "$ROOT/app" "$ROOT/app.failed"
mv "$ROOT/app.prev" "$ROOT/app"
if start_and_check; then
  log "FAILED — rolled back to ${IMAGE_TAG} (the failed release is kept in $ROOT/app.failed)"
else
  log "FAILED — and the previous release is unhealthy too. Check: docker compose logs"
fi
exit 1
