#!/usr/bin/env bash
# ============================================================================
# Runs ON THE VPS for every deploy (step 47) — started by .github/workflows/deploy.yml.
#
# The workflow first uploads the new release to /opt/nowoll/app.new:
#   app.new/infrastructure/{deployment,nginx}   the compose file + nginx template
#   app.new/release.env                          IMAGE_PREFIX=… and IMAGE_TAG=<git commit>
# then runs  bash /opt/nowoll/app.new/infrastructure/deployment/deploy.sh
#
# This script:
#   1. swaps the folders: app → app.prev, app.new → app
#   2. pulls the new images and restarts everything (docker compose up --wait)
#   3. checks: API healthy + both workers still running (not crash-looping)
#   4. healthy   → keeps it, and deletes images older than the previous release
#      unhealthy → ROLLBACK: puts app.prev back and starts the previous images
#
# Database migrations are NOT run here — the workflow runs them before this.
# NOWOLL_ROOT (default /opt/nowoll) and NOWOLL_COMPOSE_OVERRIDE exist only so
# the script can be tested on a developer machine (docs/deployment.md).
# ============================================================================
set -euo pipefail

ROOT="${NOWOLL_ROOT:-/opt/nowoll}"
export NOWOLL_ENV_FILE="$ROOT/.env"
WORKERS=(order-worker notification-worker)

log() { echo "[deploy] $*"; }

# docker compose for the release currently in $ROOT/app.
compose() {
  local files=(-f "$ROOT/app/infrastructure/deployment/docker-compose.prod.yml")
  [[ -n "${NOWOLL_COMPOSE_OVERRIDE:-}" ]] && files+=(-f "$NOWOLL_COMPOSE_OVERRIDE")
  docker compose "${files[@]}" --env-file "$NOWOLL_ENV_FILE" "$@"
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
  # --wait: returns only when every service is running and the API's health
  # check passes (or fails after the timeout).
  if ! compose up -d --no-build --remove-orphans --wait --wait-timeout 180; then
    log "containers did not become healthy"
    return 1
  fi
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
  log "${IMAGE_TAG} is healthy"
}

[[ -d "$ROOT/app.new" ]] || { log "nothing to deploy: $ROOT/app.new is missing"; exit 1; }
[[ -f "$NOWOLL_ENV_FILE" ]] || { log "missing $NOWOLL_ENV_FILE (copy .env.production.example)"; exit 1; }

# 1. Swap the folders (the previous release stays for a rollback).
rm -rf "$ROOT/app.prev"
[[ -d "$ROOT/app" ]] && mv "$ROOT/app" "$ROOT/app.prev"
mv "$ROOT/app.new" "$ROOT/app"

# 2. Pull the new images (GitHub logged this server in for the length of the deploy).
load_release
log "pulling ${IMAGE_PREFIX}-*:${IMAGE_TAG}"
compose pull --quiet api "${WORKERS[@]}"

# 3. Start and check.
if start_and_check; then
  new_tag="$IMAGE_TAG"
  prev_tag=""
  [[ -f "$ROOT/app.prev/release.env" ]] && prev_tag="$(sed -n 's/^IMAGE_TAG=//p' "$ROOT/app.prev/release.env")"
  # 4a. Free disk space: keep only this release's and the previous release's images.
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep "^${IMAGE_PREFIX}-" \
    | grep -vE ":(${new_tag}${prev_tag:+|$prev_tag})\$" \
    | xargs -r docker rmi >/dev/null 2>&1 || true
  docker image prune -f >/dev/null
  log "done — running ${new_tag}"
  exit 0
fi

# 4b. Rollback.
log "logs of the failed release:"
compose logs --tail 40 api "${WORKERS[@]}" || true
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
