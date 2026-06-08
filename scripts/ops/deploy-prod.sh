#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf '%s\n' "Usage: $0 --host HOST [--user USER] [--port PORT] [--remote-path PATH] [--image-tag TAG] [--integrations-image-tag TAG] [--skip-app] [--skip-integrations] [--dry-run]"
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

HOST="${PROD_SSH_HOST:-}"
USER="${PROD_SSH_USER:-root}"
PORT="${PROD_SSH_PORT:-22}"
REMOTE_PATH="${PROD_REMOTE_PATH:-/workspace/shadow}"
IMAGE_REGISTRY="${PROD_IMAGE_REGISTRY:-${SHADOW_IMAGE_REGISTRY:-ghcr.io}}"
IMAGE_NAMESPACE="${PROD_IMAGE_NAMESPACE:-${SHADOW_IMAGE_NAMESPACE:-buggyblues}}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
INTEGRATIONS_IMAGE_TAG="${INTEGRATIONS_IMAGE_TAG:-}"
DEPLOY_APP=1
DEPLOY_INTEGRATIONS=1
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --user)
      USER="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --remote-path)
      REMOTE_PATH="$2"
      shift 2
      ;;
    --image-registry)
      IMAGE_REGISTRY="$2"
      shift 2
      ;;
    --image-namespace)
      IMAGE_NAMESPACE="$2"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --integrations-image-tag)
      INTEGRATIONS_IMAGE_TAG="$2"
      shift 2
      ;;
    --skip-app)
      DEPLOY_APP=0
      shift
      ;;
    --skip-integrations)
      DEPLOY_INTEGRATIONS=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$DEPLOY_APP" -eq 0 ] && [ "$DEPLOY_INTEGRATIONS" -eq 0 ]; then
  printf 'Nothing to deploy: both app and integrations are skipped.\n' >&2
  exit 2
fi

if [ -z "$HOST" ]; then
  printf 'Missing deploy host. Pass --host or set PROD_SSH_HOST.\n' >&2
  exit 2
fi

if [ -z "$INTEGRATIONS_IMAGE_TAG" ]; then
  INTEGRATIONS_IMAGE_TAG="$IMAGE_TAG"
fi

bash "$REPO_ROOT/scripts/ops/verify-prod-no-build.sh"

TARGET="${USER}@${HOST}"
SSH_COMMON=(
  -o ConnectTimeout="${PROD_SSH_CONNECT_TIMEOUT:-20}"
  -o ConnectionAttempts="${PROD_SSH_CONNECTION_ATTEMPTS:-3}"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=4
  -o StrictHostKeyChecking=accept-new
)
SSH_CMD=(ssh "${SSH_COMMON[@]}")
SCP_CMD=(scp "${SSH_COMMON[@]}")
SSH_RETRIES="${PROD_SSH_RETRIES:-3}"
SSH_RETRY_DELAY="${PROD_SSH_RETRY_DELAY:-10}"

if [ "$PORT" != "22" ]; then
  SSH_CMD+=(-p "$PORT")
  SCP_CMD+=(-P "$PORT")
fi

KEY_PATH="${PROD_SSH_KEY_PATH:-${SSH_KEY_PATH:-}}"
if [ -n "$KEY_PATH" ]; then
  SSH_CMD+=(-i "$KEY_PATH")
  SCP_CMD+=(-i "$KEY_PATH")
fi

if [ -n "${SSHPASS:-}" ] && [ -z "$KEY_PATH" ]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    printf 'SSHPASS is set, but sshpass is not installed.\n' >&2
    exit 127
  fi
  SSH_CMD=(sshpass -e "${SSH_CMD[@]}")
  SCP_CMD=(sshpass -e "${SCP_CMD[@]}")
fi

quote() {
  printf '%q' "$1"
}

remote_run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] ssh %s %s\n' "$TARGET" "$*"
    return 0
  fi

  retry_cmd "${SSH_CMD[@]}" "$TARGET" "$@"
}

retry_cmd() {
  attempt=1

  while :; do
    if "$@"; then
      return 0
    else
      status="$?"
    fi

    if [ "$attempt" -ge "$SSH_RETRIES" ]; then
      return "$status"
    fi

    printf 'Command failed with exit %s; retrying in %ss (%s/%s).\n' "$status" "$SSH_RETRY_DELAY" "$attempt" "$SSH_RETRIES" >&2
    sleep "$SSH_RETRY_DELAY"
    attempt=$((attempt + 1))
  done
}

remote_path_q="$(quote "$REMOTE_PATH")"

printf 'Deploy target: %s@<host>:%s\n' "$USER" "$REMOTE_PATH"
printf 'App tag: %s\n' "$IMAGE_TAG"
printf 'Integrations tag: %s\n' "$INTEGRATIONS_IMAGE_TAG"

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[dry-run] would copy compose files to %s\n' "$TARGET"
else
  remote_run "mkdir -p ${remote_path_q}/integrations ${remote_path_q}/scripts/ops"
  retry_cmd "${SCP_CMD[@]}" "$REPO_ROOT/docker-compose.prod.yml" "$TARGET:$REMOTE_PATH/docker-compose.prod.yml"
  retry_cmd "${SCP_CMD[@]}" "$REPO_ROOT/integrations/docker-compose.prod.yaml" "$TARGET:$REMOTE_PATH/integrations/docker-compose.prod.yaml"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[dry-run] would deploy on %s\n' "$TARGET"
  exit 0
fi

"${SSH_CMD[@]}" "$TARGET" \
  "REMOTE_PATH=$(quote "$REMOTE_PATH") IMAGE_REGISTRY=$(quote "$IMAGE_REGISTRY") IMAGE_NAMESPACE=$(quote "$IMAGE_NAMESPACE") IMAGE_TAG=$(quote "$IMAGE_TAG") INTEGRATIONS_IMAGE_TAG=$(quote "$INTEGRATIONS_IMAGE_TAG") DEPLOY_APP=${DEPLOY_APP} DEPLOY_INTEGRATIONS=${DEPLOY_INTEGRATIONS} bash -s" <<'REMOTE'
set -euo pipefail

cd "$REMOTE_PATH"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    printf 'docker compose or docker-compose is required on the remote host.\n' >&2
    return 127
  fi
}

upsert_env() {
  key="$1"
  value="$2"
  file=".env"
  tmp="$(mktemp)"

  if [ ! -f "$file" ]; then
    printf 'Missing %s/%s. Create it before deployment.\n' "$REMOTE_PATH" "$file" >&2
    exit 1
  fi

  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (replaced == 0) {
        print key "=" value
      }
    }
  ' "$file" > "$tmp"

  cat "$tmp" > "$file"
  rm -f "$tmp"
}

upsert_env SHADOW_IMAGE_REGISTRY "$IMAGE_REGISTRY"
upsert_env SHADOW_IMAGE_NAMESPACE "$IMAGE_NAMESPACE"

if [ "$DEPLOY_APP" -eq 1 ]; then
  upsert_env SHADOW_IMAGE_TAG "$IMAGE_TAG"
  compose --env-file .env -f docker-compose.prod.yml pull server web admin
  compose --env-file .env -f docker-compose.prod.yml up -d --remove-orphans --no-build
fi

if [ "$DEPLOY_INTEGRATIONS" -eq 1 ]; then
  upsert_env SHADOW_INTEGRATIONS_IMAGE_TAG "$INTEGRATIONS_IMAGE_TAG"
  compose --env-file .env -f integrations/docker-compose.prod.yaml pull \
    kanban skills qna quiz trainer resume flash space warbuddy
  compose --env-file .env -f integrations/docker-compose.prod.yaml up -d --remove-orphans --no-build
fi

docker image prune -f

if [ "$DEPLOY_APP" -eq 1 ]; then
  compose --env-file .env -f docker-compose.prod.yml ps
fi

if [ "$DEPLOY_INTEGRATIONS" -eq 1 ]; then
  compose --env-file .env -f integrations/docker-compose.prod.yaml ps
fi
REMOTE
