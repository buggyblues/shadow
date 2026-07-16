#!/usr/bin/env bash

set -euo pipefail
export LC_ALL=C
export LANG=C

usage() {
  cat <<'USAGE'
Usage:
  scripts/ops/hotfix-prod.sh [--target all|server|web|integrations] [--components component[,component...]] [--integration-payload full|source] [--recreate-integrations] [--skip-build] [--dry-run]

Environment:
  PROD_SSH_HOST             Required unless set in the env file. Never logged.
  PROD_SSH_USER             Default: root
  PROD_SSH_PORT             Default: 22
  PROD_SSH_KEY_PATH         Optional SSH private key path
  PROD_REMOTE_PATH          Default: /workspace/shadow
  SHADOW_HOTFIX_COMPONENTS        Default: all. Comma-separated Space App component names.
  SHADOW_HOTFIX_INTEGRATION_PAYLOAD
                            Default: full. Use source for server-only integration hotfixes.
  SHADOW_HOTFIX_RECREATE_INTEGRATIONS
                            Set to 1 to recreate selected integration containers
                            without building images before applying the hotfix payload.
  SHADOW_HOTFIX_ENV_FILE    Default: .tmp/prod-hotfix.env

Recommended local env file, ignored by git:
  .tmp/prod-hotfix.env

The script hot-patches production containers by copying built artifacts and
source files into staged paths inside the containers, then swapping them in and
restarting the containers. It does not build or pull Docker images. With
--recreate-integrations it recreates selected integration containers before
patching and resets them back to image state if the patch fails.
USAGE
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

ENV_FILE="${SHADOW_HOTFIX_ENV_FILE:-$REPO_ROOT/.tmp/prod-hotfix.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

TARGET="${SHADOW_HOTFIX_TARGET:-all}"
HOTFIX_COMPONENTS_RAW="${SHADOW_HOTFIX_COMPONENTS:-all}"
INTEGRATION_PAYLOAD="${SHADOW_HOTFIX_INTEGRATION_PAYLOAD:-full}"
HOST="${PROD_SSH_HOST:-}"
USER="${PROD_SSH_USER:-root}"
PORT="${PROD_SSH_PORT:-22}"
REMOTE_PATH="${PROD_REMOTE_PATH:-/workspace/shadow}"
SKIP_BUILD=0
DRY_RUN=0
KEEP_ARCHIVE=0
RECREATE_INTEGRATIONS="${SHADOW_HOTFIX_RECREATE_INTEGRATIONS:-0}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --components)
      HOTFIX_COMPONENTS_RAW="$2"
      shift 2
      ;;
    --integration-payload)
      INTEGRATION_PAYLOAD="$2"
      shift 2
      ;;
    --recreate-integrations)
      RECREATE_INTEGRATIONS=1
      shift
      ;;
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
    --env-file)
      ENV_FILE="$2"
      if [ -f "$ENV_FILE" ]; then
        set -a
        # shellcheck disable=SC1090
        . "$ENV_FILE"
        set +a
        HOST="${PROD_SSH_HOST:-$HOST}"
        USER="${PROD_SSH_USER:-$USER}"
        PORT="${PROD_SSH_PORT:-$PORT}"
        REMOTE_PATH="${PROD_REMOTE_PATH:-$REMOTE_PATH}"
        HOTFIX_COMPONENTS_RAW="${SHADOW_HOTFIX_COMPONENTS:-$HOTFIX_COMPONENTS_RAW}"
        INTEGRATION_PAYLOAD="${SHADOW_HOTFIX_INTEGRATION_PAYLOAD:-$INTEGRATION_PAYLOAD}"
        RECREATE_INTEGRATIONS="${SHADOW_HOTFIX_RECREATE_INTEGRATIONS:-$RECREATE_INTEGRATIONS}"
      fi
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --keep-archive)
      KEEP_ARCHIVE=1
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

case "$TARGET" in
  all | server | web | integrations) ;;
  *)
    printf 'Invalid --target value: %s\n' "$TARGET" >&2
    usage >&2
    exit 2
    ;;
esac

case "$INTEGRATION_PAYLOAD" in
  full | source) ;;
  *)
    printf 'Invalid --integration-payload value: %s\n' "$INTEGRATION_PAYLOAD" >&2
    usage >&2
    exit 2
    ;;
esac

if [ -z "$HOST" ]; then
  printf 'Missing production SSH host. Set PROD_SSH_HOST in %s or pass --host.\n' "$ENV_FILE" >&2
  exit 2
fi

if [[ "$HOST" == *@* ]]; then
  USER="${HOST%@*}"
  HOST="${HOST##*@}"
fi

if [ -z "$HOST" ] || [ -z "$USER" ]; then
  printf 'Invalid SSH target. Use --host <host> or --host <user@host>; host is never logged.\n' >&2
  exit 2
fi

if ! command -v rsync >/dev/null 2>&1; then
  printf 'rsync is required for staging hotfix artifacts.\n' >&2
  exit 127
fi

quote() {
  printf '%q' "$1"
}

log_step() {
  printf '\n==> %s\n' "$1"
}

ALL_INTEGRATION_COMPONENTS="runtime kanban qna quiz trainer skills warbuddy flash space"
HOTFIX_COMPONENTS=()

parse_hotfix_components() {
  local raw="${1:-all}"
  local app
  if [ "$raw" = "all" ]; then
    for app in $ALL_INTEGRATION_COMPONENTS; do
      HOTFIX_COMPONENTS+=("$app")
    done
    return 0
  fi

  raw="${raw//,/ }"
  for app in $raw; do
    case "$app" in
      runtime | kanban | qna | quiz | trainer | skills | warbuddy | flash | space)
        HOTFIX_COMPONENTS+=("$app")
        ;;
      *)
        printf 'Invalid Space App component in --components: %s\n' "$app" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  if [ "${#HOTFIX_COMPONENTS[@]}" -eq 0 ]; then
    printf 'No Space App components selected.\n' >&2
    exit 2
  fi
}

component_selected() {
  local expected="$1"
  local app
  for app in "${HOTFIX_COMPONENTS[@]}"; do
    if [ "$app" = "$expected" ]; then
      return 0
    fi
  done
  return 1
}

hotfix_components_csv() {
  local IFS=,
  printf '%s' "${HOTFIX_COMPONENTS[*]}"
}

run_local() {
  printf '+ %s\n' "$*"
  "$@"
}

copy_dir() {
  local src="$1"
  local dest="$2"
  if [ ! -d "$src" ]; then
    return 0
  fi
  mkdir -p "$dest"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .turbo \
    --exclude .vite \
    --exclude .tmp \
    --exclude coverage \
    --exclude data \
    --exclude '*.tsbuildinfo' \
    "$src/" "$dest/"
}

copy_file() {
  local src="$1"
  local dest="$2"
  if [ ! -f "$src" ]; then
    return 0
  fi
  mkdir -p "$(dirname -- "$dest")"
  cp "$src" "$dest"
}

build_server() {
  log_step 'Building server artifacts locally'
  run_local pnpm --filter @shadowob/shared build
  run_local pnpm --filter @shadowob/sdk build
  run_local pnpm --filter @shadowob/server build
}

build_web() {
  log_step 'Building web artifacts locally'
  run_local pnpm --filter @shadowob/website build
  run_local pnpm --filter @shadowob/web build
}

build_integrations() {
  log_step 'Building integration artifacts locally'
  run_local pnpm --filter @shadowob/shared build
  run_local pnpm --filter @shadowob/sdk build
  local packages=()
  component_selected kanban && packages+=('@shadowob/kanban-space-app')
  component_selected qna && packages+=('@shadowob/qna-space-app')
  component_selected quiz && packages+=('@shadowob/quiz-space-app')
  component_selected trainer && packages+=('@shadowob/trainer-space-app')
  component_selected skills && packages+=('@shadowob/skills-space-app')
  component_selected warbuddy && packages+=('@shadowob/warbuddy-space-app')
  component_selected flash && packages+=('@shadowob/flash-space-app')
  component_selected space && packages+=('@shadowob/space-app')
  component_selected runtime && packages+=('@shadowob/integrations-runtime')

  for pkg in "${packages[@]}"; do
    run_local pnpm --filter "$pkg" build
  done
}

stage_server() {
  local dest="$1/server/app"
  copy_dir "$REPO_ROOT/packages/shared/dist" "$dest/packages/shared/dist"
  copy_dir "$REPO_ROOT/packages/sdk/dist" "$dest/packages/sdk/dist"
  copy_dir "$REPO_ROOT/apps/server/dist" "$dest/apps/server/dist"
  copy_dir "$REPO_ROOT/apps/server/src/db/migrations" "$dest/apps/server/migrations"
  copy_dir "$REPO_ROOT/apps/cloud/dist" "$dest/apps/cloud/dist"
  copy_dir "$REPO_ROOT/apps/cloud/templates" "$dest/apps/cloud/templates"
  copy_file "$REPO_ROOT/packages/shared/package.json" "$dest/packages/shared/package.json"
  copy_file "$REPO_ROOT/packages/sdk/package.json" "$dest/packages/sdk/package.json"
  copy_file "$REPO_ROOT/apps/server/package.json" "$dest/apps/server/package.json"
  copy_file "$REPO_ROOT/apps/cloud/package.json" "$dest/apps/cloud/package.json"
}

stage_web() {
  local dest="$1/web"
  copy_dir "$REPO_ROOT/website/doc_build" "$dest/site"
  copy_dir "$REPO_ROOT/apps/web/dist" "$dest/app"
  copy_file "$REPO_ROOT/apps/web/dist/logo.png" "$dest/site/logo.png"
  copy_file "$REPO_ROOT/apps/web/nginx.conf" "$1/web/nginx/default.conf"
}

stage_integration_component() {
  local app="$1"
  local stage_root="$2"
  local dest="$stage_root/integrations/repo/integrations/$app"
  copy_dir "$REPO_ROOT/integrations/$app/src" "$dest/src"
  if [ "$INTEGRATION_PAYLOAD" = "full" ]; then
    copy_dir "$REPO_ROOT/integrations/$app/dist" "$dest/dist"
    copy_dir "$REPO_ROOT/integrations/$app/public" "$dest/public"
  fi
  copy_file "$REPO_ROOT/integrations/$app/package.json" "$dest/package.json"
  copy_file "$REPO_ROOT/integrations/$app/space-app.local.json" "$dest/space-app.local.json"
  copy_file "$REPO_ROOT/integrations/$app/vite.config.ts" "$dest/vite.config.ts"
  copy_file "$REPO_ROOT/integrations/$app/tsconfig.json" "$dest/tsconfig.json"
}

stage_integrations() {
  local dest="$1/integrations/repo"
  copy_dir "$REPO_ROOT/packages/shared/dist" "$dest/packages/shared/dist"
  copy_dir "$REPO_ROOT/packages/shared/src" "$dest/packages/shared/src"
  copy_dir "$REPO_ROOT/packages/sdk/dist" "$dest/packages/sdk/dist"
  copy_dir "$REPO_ROOT/packages/sdk/src" "$dest/packages/sdk/src"
  copy_dir "$REPO_ROOT/packages/sdk/__tests__" "$dest/packages/sdk/__tests__"
  copy_file "$REPO_ROOT/packages/shared/package.json" "$dest/packages/shared/package.json"
  copy_file "$REPO_ROOT/packages/sdk/package.json" "$dest/packages/sdk/package.json"
  if component_selected flash; then
    copy_dir "$REPO_ROOT/integrations/flash/packages" "$dest/integrations/flash/packages"
  fi

  for app in "${HOTFIX_COMPONENTS[@]}"; do
    stage_integration_component "$app" "$1"
  done
}

parse_hotfix_components "$HOTFIX_COMPONENTS_RAW"

if [ "$SKIP_BUILD" -eq 0 ]; then
  case "$TARGET" in
    all)
      build_server
      build_web
      build_integrations
      ;;
    server)
      build_server
      ;;
    web)
      build_web
      ;;
    integrations)
      build_integrations
      ;;
  esac
else
  log_step 'Skipping local build; using existing artifacts'
fi

STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$REPO_ROOT/.tmp/hotfix/$STAMP"
STAGE_DIR="$WORK_DIR/stage"
ARCHIVE="$WORK_DIR/shadow-hotfix-$TARGET.tar.gz"
REMOTE_ARCHIVE="/tmp/shadow-hotfix-$TARGET-$STAMP.tar.gz"

rm -rf "$WORK_DIR"
mkdir -p "$STAGE_DIR"

log_step 'Staging hotfix payload'
case "$TARGET" in
  all)
    stage_server "$STAGE_DIR"
    stage_web "$STAGE_DIR"
    stage_integrations "$STAGE_DIR"
    ;;
  server)
    stage_server "$STAGE_DIR"
    ;;
  web)
    stage_web "$STAGE_DIR"
    ;;
  integrations)
    stage_integrations "$STAGE_DIR"
    ;;
esac

tar -C "$STAGE_DIR" -czf "$ARCHIVE" .

SSH_COMMON=(
  -o ConnectTimeout="${PROD_SSH_CONNECT_TIMEOUT:-20}"
  -o ConnectionAttempts="${PROD_SSH_CONNECTION_ATTEMPTS:-3}"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=4
  -o StrictHostKeyChecking=accept-new
)
SSH_CMD=(ssh "${SSH_COMMON[@]}")
SCP_CMD=(scp "${SSH_COMMON[@]}")

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

REMOTE="${USER}@${HOST}"

printf '\nHotfix target: %s@<redacted>:%s\n' "$USER" "$REMOTE_PATH"
printf 'Hotfix scope: %s\n' "$TARGET"
if [ "$TARGET" = "all" ] || [ "$TARGET" = "integrations" ]; then
  printf 'Space App components: %s\n' "$(hotfix_components_csv)"
  printf 'Integration payload: %s\n' "$INTEGRATION_PAYLOAD"
  printf 'Recreate integrations: %s\n' "$RECREATE_INTEGRATIONS"
fi
printf 'Payload: %s\n' "${ARCHIVE#$REPO_ROOT/}"

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[dry-run] would upload payload and patch containers; SSH host is redacted.\n'
  exit 0
fi

log_step 'Uploading hotfix payload'
"${SCP_CMD[@]}" "$ARCHIVE" "$REMOTE:$REMOTE_ARCHIVE" >/dev/null

log_step 'Patching remote containers'
"${SSH_CMD[@]}" "$REMOTE" \
  "TARGET=$(quote "$TARGET") HOTFIX_COMPONENTS=$(quote "$(hotfix_components_csv)") RECREATE_INTEGRATIONS=$(quote "$RECREATE_INTEGRATIONS") REMOTE_ARCHIVE=$(quote "$REMOTE_ARCHIVE") REMOTE_PATH=$(quote "$REMOTE_PATH") bash -s" <<'REMOTE'
set -euo pipefail

tmp_dir="$(mktemp -d /tmp/shadow-hotfix.XXXXXX)"
RECREATED_INTEGRATION_SERVICES=()

cleanup() {
  status="${1:-0}"
  if [ "$status" -ne 0 ] && [ "${#RECREATED_INTEGRATION_SERVICES[@]}" -gt 0 ]; then
    printf 'Hotfix failed; resetting recreated integration containers back to image state.\n' >&2
    (
      cd "$REMOTE_PATH/integrations"
      docker compose -f docker-compose.prod.yaml --env-file .env up -d --no-build --force-recreate --no-deps "${RECREATED_INTEGRATION_SERVICES[@]}" >/dev/null
    ) || true
  fi
  rm -rf "$tmp_dir"
  rm -f "$REMOTE_ARCHIVE"
}
trap 'status=$?; cleanup "$status"; exit "$status"' EXIT

tar -xzf "$REMOTE_ARCHIVE" -C "$tmp_dir"

IFS=',' read -r -a HOTFIX_COMPONENTS_ARRAY <<< "${HOTFIX_COMPONENTS:-runtime,kanban,qna,quiz,trainer,skills,warbuddy,flash,space}"

component_selected() {
  expected="$1"
  for app in "${HOTFIX_COMPONENTS_ARRAY[@]}"; do
    if [ "$app" = "$expected" ]; then
      return 0
    fi
  done
  return 1
}

runtime_patch_selected() {
  for app in runtime kanban qna quiz trainer skills warbuddy; do
    if component_selected "$app"; then
      return 0
    fi
  done
  return 1
}

container_for() {
  service="$1"
  project="${2:-}"
  explicit_var="HOTFIX_$(printf '%s' "$service" | tr '[:lower:]-' '[:upper:]_')_CONTAINER"
  explicit="${!explicit_var:-}"
  if [ -n "$explicit" ]; then
    printf '%s\n' "$explicit"
    return 0
  fi

  if [ -n "$project" ]; then
    found="$(docker ps -aq \
      --filter "label=com.docker.compose.project=$project" \
      --filter "label=com.docker.compose.service=$service" \
      | head -n 1)"
  else
    found="$(docker ps -aq --filter "label=com.docker.compose.service=$service" | head -n 1)"
  fi

  if [ -z "$found" ]; then
    found="$(docker ps -aq --filter "name=$service" | head -n 1)"
  fi

  if [ -z "$found" ]; then
    printf 'Unable to find running container for service %s.\n' "$service" >&2
    return 1
  fi

  printf '%s\n' "$found"
}

copy_tree() {
  container="$1"
  src="$2"
  dest="$3"
  parent="$(dirname "$dest")"
  base="$(basename "$dest")"
  stage="/tmp/shadow-hotfix-copy.$base.$$"
  backup="/tmp/shadow-hotfix-backup.$base.$$"

  if [ ! -d "$src" ]; then
    return 0
  fi

  docker exec -u 0 "$container" sh -lc "rm -rf $(printf '%q' "$stage") && mkdir -p $(printf '%q' "$stage")"
  tar -C "$src" -cf - . | docker exec -i -u 0 "$container" sh -lc "tar -C $(printf '%q' "$stage") -xf -"
  docker exec -u 0 "$container" sh -lc "set -e; rm -rf $(printf '%q' "$backup"); mkdir -p $(printf '%q' "$parent"); if [ -e $(printf '%q' "$dest") ]; then mv $(printf '%q' "$dest") $(printf '%q' "$backup"); fi; if mv $(printf '%q' "$stage") $(printf '%q' "$dest"); then rm -rf $(printf '%q' "$backup"); else status=\$?; if [ -e $(printf '%q' "$backup") ]; then mv $(printf '%q' "$backup") $(printf '%q' "$dest"); fi; exit \$status; fi"
  docker exec -u 0 "$container" sh -lc "test -d $(printf '%q' "$dest")"
}

copy_file() {
  container="$1"
  src="$2"
  dest="$3"
  parent="$(dirname "$dest")"
  base="$(basename "$dest")"
  stage="/tmp/shadow-hotfix-file.$base.$$"
  backup="/tmp/shadow-hotfix-file-backup.$base.$$"

  if [ ! -f "$src" ]; then
    return 0
  fi

  docker exec -u 0 "$container" sh -lc "mkdir -p $(printf '%q' "$parent")"
  docker cp "$src" "$container:$stage"
  docker exec -u 0 "$container" sh -lc "set -e; test -f $(printf '%q' "$stage"); rm -f $(printf '%q' "$backup"); if [ -e $(printf '%q' "$dest") ]; then mv $(printf '%q' "$dest") $(printf '%q' "$backup"); fi; if mv $(printf '%q' "$stage") $(printf '%q' "$dest"); then rm -f $(printf '%q' "$backup"); else status=\$?; if [ -e $(printf '%q' "$backup") ]; then mv $(printf '%q' "$backup") $(printf '%q' "$dest"); fi; exit \$status; fi"
}

copy_site_tree_preserve_app() {
  container="$1"
  src="$2"
  dest="$3"
  stage="/tmp/shadow-hotfix-site.$$"
  backup="/tmp/shadow-hotfix-site-backup.$$"

  if [ ! -d "$src" ]; then
    return 0
  fi

  docker exec -u 0 "$container" sh -lc "rm -rf $(printf '%q' "$stage") $(printf '%q' "$backup") && mkdir -p $(printf '%q' "$stage")"
  tar -C "$src" -cf - . | docker exec -i -u 0 "$container" sh -lc "tar -C $(printf '%q' "$stage") -xf -"
  docker exec -u 0 "$container" sh -lc "set -e; mkdir -p $(printf '%q' "$dest") $(printf '%q' "$backup"); find $(printf '%q' "$dest") -mindepth 1 -maxdepth 1 ! -name app -exec sh -c 'backup=\"\$1\"; shift; for path do mv \"\$path\" \"\$backup\"/; done' sh $(printf '%q' "$backup") {} +; if cp -a $(printf '%q' "$stage")/. $(printf '%q' "$dest")/; then rm -rf $(printf '%q' "$stage") $(printf '%q' "$backup"); else status=\$?; find $(printf '%q' "$dest") -mindepth 1 -maxdepth 1 ! -name app -exec rm -rf {} +; cp -a $(printf '%q' "$backup")/. $(printf '%q' "$dest")/ || true; exit \$status; fi"
}

wait_container_ready() {
  container="$1"
  label="$2"
  for _ in $(seq 1 30); do
    state="$(docker inspect -f '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"
    case "$state" in
      "true none" | "true healthy")
        return 0
        ;;
      "true starting")
        sleep 1
        ;;
      *)
        sleep 1
        ;;
    esac
  done
  printf '%s container did not become ready after restart.\n' "$label" >&2
  docker logs "$container" --tail=80 >&2 || true
  return 1
}

patch_server() {
  container="$(container_for server)"
  printf 'Patching server container %s\n' "${container:0:12}"
  copy_tree "$container" "$tmp_dir/server/app/packages/shared/dist" "/app/packages/shared/dist"
  copy_tree "$container" "$tmp_dir/server/app/packages/sdk/dist" "/app/packages/sdk/dist"
  copy_tree "$container" "$tmp_dir/server/app/apps/server/dist" "/app/apps/server/dist"
  copy_tree "$container" "$tmp_dir/server/app/apps/server/migrations" "/app/apps/server/migrations"
  copy_tree "$container" "$tmp_dir/server/app/apps/cloud/dist" "/app/apps/cloud/dist"
  copy_tree "$container" "$tmp_dir/server/app/apps/cloud/templates" "/app/apps/cloud/templates"
  copy_file "$container" "$tmp_dir/server/app/packages/shared/package.json" "/app/packages/shared/package.json"
  copy_file "$container" "$tmp_dir/server/app/packages/sdk/package.json" "/app/packages/sdk/package.json"
  copy_file "$container" "$tmp_dir/server/app/apps/server/package.json" "/app/apps/server/package.json"
  copy_file "$container" "$tmp_dir/server/app/apps/cloud/package.json" "/app/apps/cloud/package.json"
  docker restart "$container" >/dev/null
  wait_container_ready "$container" server
  printf 'Restarted server container %s\n' "${container:0:12}"
}

patch_web() {
  container="$(container_for web)"
  printf 'Patching web container %s\n' "${container:0:12}"
  copy_site_tree_preserve_app "$container" "$tmp_dir/web/site" "/usr/share/nginx/html"
  copy_tree "$container" "$tmp_dir/web/app" "/usr/share/nginx/html/app"
  copy_file "$container" "$tmp_dir/web/nginx/default.conf" "/etc/nginx/conf.d/default.conf"
  docker exec -u 0 "$container" nginx -t >/dev/null
  docker restart "$container" >/dev/null
  wait_container_ready "$container" web
  printf 'Restarted web container %s\n' "${container:0:12}"
}

patch_integration_runtime() {
  container="$1"
  printf 'Patching integrations runtime container %s\n' "${container:0:12}"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/shared/dist" "/repo/packages/shared/dist"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/shared/src" "/repo/packages/shared/src"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/sdk/dist" "/repo/packages/sdk/dist"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/sdk/src" "/repo/packages/sdk/src"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/sdk/__tests__" "/repo/packages/sdk/__tests__"
  copy_file "$container" "$tmp_dir/integrations/repo/packages/shared/package.json" "/repo/packages/shared/package.json"
  copy_file "$container" "$tmp_dir/integrations/repo/packages/sdk/package.json" "/repo/packages/sdk/package.json"

  for app in runtime kanban qna quiz trainer skills warbuddy; do
    if ! component_selected "$app"; then
      continue
    fi
    copy_tree "$container" "$tmp_dir/integrations/repo/integrations/$app/src" "/repo/integrations/$app/src"
    copy_tree "$container" "$tmp_dir/integrations/repo/integrations/$app/dist" "/repo/integrations/$app/dist"
    copy_tree "$container" "$tmp_dir/integrations/repo/integrations/$app/public" "/repo/integrations/$app/public"
    copy_file "$container" "$tmp_dir/integrations/repo/integrations/$app/package.json" "/repo/integrations/$app/package.json"
    copy_file "$container" "$tmp_dir/integrations/repo/integrations/$app/space-app.local.json" "/repo/integrations/$app/space-app.local.json"
    copy_file "$container" "$tmp_dir/integrations/repo/integrations/$app/vite.config.ts" "/repo/integrations/$app/vite.config.ts"
    copy_file "$container" "$tmp_dir/integrations/repo/integrations/$app/tsconfig.json" "/repo/integrations/$app/tsconfig.json"
  done

  docker restart "$container" >/dev/null
  wait_container_ready "$container" integrations-runtime
  printf 'Restarted integrations runtime container %s\n' "${container:0:12}"
}

patch_standalone_integration() {
  service="$1"
  container="$(container_for "$service" shadow-integrations)"
  printf 'Patching %s container %s\n' "$service" "${container:0:12}"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/shared/dist" "/repo/packages/shared/dist"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/shared/src" "/repo/packages/shared/src"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/sdk/dist" "/repo/packages/sdk/dist"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/sdk/src" "/repo/packages/sdk/src"
  copy_tree "$container" "$tmp_dir/integrations/repo/packages/sdk/__tests__" "/repo/packages/sdk/__tests__"
  copy_file "$container" "$tmp_dir/integrations/repo/packages/shared/package.json" "/repo/packages/shared/package.json"
  copy_file "$container" "$tmp_dir/integrations/repo/packages/sdk/package.json" "/repo/packages/sdk/package.json"
  copy_tree "$container" "$tmp_dir/integrations/repo/integrations/$service/src" "/repo/integrations/$service/src"
  copy_tree "$container" "$tmp_dir/integrations/repo/integrations/$service/dist" "/repo/integrations/$service/dist"
  copy_tree "$container" "$tmp_dir/integrations/repo/integrations/$service/public" "/repo/integrations/$service/public"
  copy_file "$container" "$tmp_dir/integrations/repo/integrations/$service/package.json" "/repo/integrations/$service/package.json"
  copy_file "$container" "$tmp_dir/integrations/repo/integrations/$service/space-app.local.json" "/repo/integrations/$service/space-app.local.json"
  copy_file "$container" "$tmp_dir/integrations/repo/integrations/$service/vite.config.ts" "/repo/integrations/$service/vite.config.ts"
  copy_file "$container" "$tmp_dir/integrations/repo/integrations/$service/tsconfig.json" "/repo/integrations/$service/tsconfig.json"

  if [ "$service" = "flash" ]; then
    copy_tree "$container" "$tmp_dir/integrations/repo/integrations/flash/packages" "/repo/integrations/flash/packages"
  fi

  docker restart "$container" >/dev/null
  wait_container_ready "$container" "$service"
  printf 'Restarted %s container %s\n' "$service" "${container:0:12}"
}

patch_integrations() {
  if [ "${RECREATE_INTEGRATIONS:-0}" = "1" ]; then
    services=()
    runtime_patch_selected && services+=("integrations-runtime")
    component_selected flash && services+=("flash")
    component_selected space && services+=("space")
    if [ "${#services[@]}" -gt 0 ]; then
      printf 'Recreating selected integration containers without building images\n'
      (
        cd "$REMOTE_PATH/integrations"
        docker compose -f docker-compose.prod.yaml --env-file .env up -d --no-build --force-recreate --no-deps "${services[@]}" >/dev/null
      )
      RECREATED_INTEGRATION_SERVICES=("${services[@]}")
    fi
  fi

  if runtime_patch_selected; then
    runtime_container="$(container_for integrations-runtime shadow-integrations)"
    patch_integration_runtime "$runtime_container"
  fi
  for service in flash space; do
    if ! component_selected "$service"; then
      continue
    fi
    if docker ps -aq \
      --filter "label=com.docker.compose.project=shadow-integrations" \
      --filter "label=com.docker.compose.service=$service" \
      | grep -q .; then
      patch_standalone_integration "$service"
    fi
  done
  RECREATED_INTEGRATION_SERVICES=()
}

case "$TARGET" in
  all)
    patch_server
    patch_web
    patch_integrations
    ;;
  server)
    patch_server
    ;;
  web)
    patch_web
    ;;
  integrations)
    patch_integrations
    ;;
esac

printf '\nContainer status after hotfix:\n'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
  | awk 'NR == 1 || /shadow|integration|server|flash|space/'
REMOTE

if [ "$KEEP_ARCHIVE" -eq 0 ]; then
  rm -rf "$WORK_DIR"
fi

printf '\nHotfix complete. SSH host was not logged.\n'
