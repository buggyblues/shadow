#!/usr/bin/env bash
# Start a disposable container that runs one or more plugins' real runtime asset install flows.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_NAME="${PLUGIN_TEST_IMAGE:-node:22-alpine}"
CONTAINER_NAME="${PLUGIN_TEST_CONTAINER:-shadow-plugin-test}"
CONTAINER_PREFIX="${PLUGIN_TEST_CONTAINER_PREFIX:-shadow-plugin-}"
RUN_COMMAND=""
ENTER_SHELL=1
PROMPT_MISSING=1
PLUGIN_IDS=()

usage() {
  cat <<USAGE
Usage: $0 [plugin-id ...] [options]
       $0 clean [--all-images]

Options:
  --plugins a,b,c       Comma-separated plugin ids.
  --name name           Docker container name. Default: ${CONTAINER_NAME}
  --image image         Docker base image. Default: ${IMAGE_NAME}
  --command 'cmd'       Run a command after setup.
  --no-shell            Do not automatically exec into the container.
  --no-prompt           Do not prompt for missing required plugin env vars.
  --all-images          With clean, also prune all unused images, not only dangling ones.

Examples:
  $0
  $0 opencli
  $0 opencli github --command 'opencli --version && gh --version'
  SHADOW_PLUGIN_TEST_OPTIONS_CLAUDE_PLUGIN='{"marketplaces":[{"repo":"anthropics/financial-services","plugins":["pitch-agent"]}]}' \
    $0 claude-plugin --image node:22-bookworm --no-shell --command 'test -f /claude-plugins/.shadow/plugins.json'
  $0 clean
USAGE
}

clean_test_containers() {
  local prune_all_images=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --all-images)
        prune_all_images=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown clean option: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  remove_matching_test_containers() {
    local containers
    containers="$(docker ps -aq --filter "name=^/${CONTAINER_PREFIX}" || true)"
    if [ -n "$containers" ]; then
      docker rm -f $containers
    else
      echo "No matching containers found."
    fi
  }

  echo "Removing plugin test containers with prefix: ${CONTAINER_PREFIX}"
  remove_matching_test_containers

  echo "Pruning dangling images..."
  docker image prune -f

  echo "Pruning build cache..."
  docker builder prune -f

  echo "Pruning unused local volumes..."
  docker volume prune -f

  echo "Removing any plugin test containers created during cleanup..."
  remove_matching_test_containers

  local remaining
  remaining="$(docker ps -aq --filter "name=^/${CONTAINER_PREFIX}" || true)"
  if [ -n "$remaining" ]; then
    echo "Some matching containers remain:" >&2
    docker ps -a --filter "name=^/${CONTAINER_PREFIX}" >&2
    exit 1
  fi

  if [ "$prune_all_images" = "1" ]; then
    echo "Pruning all unused images..."
    docker image prune -a -f
  fi

  echo "Docker disk usage after cleanup:"
  docker system df
}

if [ "${1:-}" = "clean" ]; then
  shift
  clean_test_containers "$@"
  exit 0
fi

split_plugins() {
  local raw="$1"
  local old_ifs="$IFS"
  IFS=','
  for item in $raw; do
    if [ -n "$item" ]; then PLUGIN_IDS+=("$item"); fi
  done
  IFS="$old_ifs"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --plugins)
      split_plugins "${2:?missing value for --plugins}"
      shift 2
      ;;
    --name)
      CONTAINER_NAME="${2:?missing value for --name}"
      shift 2
      ;;
    --image)
      IMAGE_NAME="${2:?missing value for --image}"
      shift 2
      ;;
    --command)
      RUN_COMMAND="${2:?missing value for --command}"
      shift 2
      ;;
    --no-shell)
      ENTER_SHELL=0
      shift
      ;;
    --no-prompt)
      PROMPT_MISSING=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      PLUGIN_IDS+=("$1")
      shift
      ;;
  esac
done

choose_plugins() {
  local list_file="$1"
  (
    cd "$APP_DIR"
    pnpm --silent exec tsx scripts/plugin-runtime-metadata.ts --list
  ) > "$list_file"

  echo "Available plugins:"
  nl -w2 -s') ' "$list_file"
  echo ""
  printf "Select plugin ids or numbers (comma-separated): "
  read -r selection </dev/tty
  if [ -z "$selection" ]; then
    echo "No plugins selected" >&2
    exit 2
  fi

  local old_ifs="$IFS"
  IFS=','
  for token in $selection; do
    token="$(echo "$token" | xargs)"
    if [ -z "$token" ]; then continue; fi
    if echo "$token" | grep -Eq '^[0-9]+$'; then
      local selected
      selected="$(sed -n "${token}p" "$list_file" || true)"
      if [ -z "$selected" ]; then
        echo "Invalid plugin number: $token" >&2
        exit 2
      fi
      PLUGIN_IDS+=("$selected")
    else
      PLUGIN_IDS+=("$token")
    fi
  done
  IFS="$old_ifs"
}

quote_env_value() {
  printf "%s" "$1" | sed "s/'/'\\\\''/g; s/^/'/; s/$/'/"
}

METADATA_JSON="$(mktemp -t shadow-plugin-metadata.XXXXXX.json)"
INSTALL_SCRIPT="$(mktemp -t shadow-plugin-install.XXXXXX.sh)"
ENV_FILE="$(mktemp -t shadow-plugin-env.XXXXXX)"
PLUGIN_LIST_FILE="$(mktemp -t shadow-plugin-list.XXXXXX)"

cleanup() {
  rm -f "$METADATA_JSON" "$INSTALL_SCRIPT" "$ENV_FILE" "$PLUGIN_LIST_FILE"
}
trap cleanup EXIT

if [ "${#PLUGIN_IDS[@]}" -eq 0 ]; then
  choose_plugins "$PLUGIN_LIST_FILE"
fi

if [ "${#PLUGIN_IDS[@]}" -eq 0 ]; then
  echo "No plugins selected" >&2
  exit 2
fi

echo "Selected plugins: ${PLUGIN_IDS[*]}"

(
  cd "$APP_DIR"
  pnpm --silent exec tsx scripts/plugin-runtime-metadata.ts --json "${PLUGIN_IDS[@]}"
) > "$METADATA_JSON"

node - "$METADATA_JSON" > "$INSTALL_SCRIPT" <<'NODE'
const fs = require('node:fs')
const records = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const q = (value) => `'${String(value).replace(/'/g, "'\\''")}'`
const lines = ['set -eu', 'mkdir -p /workspace /runtime-deps /plugin-skills /plugin-subagents /app/plugin-skills /app/plugin-subagents']
for (const record of records) {
  if (!record.installCommand) {
    lines.push(`echo ${q(`[plugin-test] ${record.id}: no runtime install command`)}`)
    continue
  }
  lines.push(`echo ${q(`[plugin-test] installing ${record.id}`)}`)
  lines.push(record.installCommand)
  for (const mapping of record.copyMappings ?? []) {
    lines.push(`mkdir -p ${q(mapping.to)}`)
    lines.push(`if [ -d ${q(mapping.from)} ]; then cp -R ${q(`${mapping.from}/.`)} ${q(`${mapping.to}/`)}; fi`)
  }
}
lines.push('echo "[plugin-test] ready"')
process.stdout.write(lines.join('\n'))
NODE

touch "$ENV_FILE"
node - "$METADATA_JSON" > "$ENV_FILE.keys" <<'NODE'
const fs = require('node:fs')
const records = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const env = new Map()
for (const record of records) {
  for (const field of record.env ?? []) {
    if (!env.has(field.key)) env.set(field.key, field)
    else if (field.required) env.get(field.key).required = true
  }
}
for (const [key, field] of env) {
  console.log(JSON.stringify({ key, ...field }))
}
NODE

while IFS= read -r raw; do
  [ -z "$raw" ] && continue
  key="$(node -e 'const item=JSON.parse(process.argv[1]); process.stdout.write(item.key)' "$raw")"
  required="$(node -e 'const item=JSON.parse(process.argv[1]); process.stdout.write(item.required ? "1" : "0")' "$raw")"
  label="$(node -e 'const item=JSON.parse(process.argv[1]); process.stdout.write(item.label || item.key)' "$raw")"
  value="${!key-}"
  if [ -z "$value" ] && [ "$required" = "1" ] && [ "$PROMPT_MISSING" = "1" ]; then
    printf "Enter %s (%s): " "$label" "$key"
    read -r value </dev/tty
  fi
  if [ -n "$value" ]; then
    printf "%s=%s\n" "$key" "$value" >> "$ENV_FILE"
  fi
done < "$ENV_FILE.keys"
rm -f "$ENV_FILE.keys"

node - "$METADATA_JSON" "$ENV_FILE" <<'NODE'
const fs = require('node:fs')
const [metadataPath, envPath] = process.argv.slice(2)
const records = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
const lines = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, 'utf8').split(/\n/).filter(Boolean)
  : []
const env = new Map()
for (const line of lines) {
  const index = line.indexOf('=')
  if (index > 0) env.set(line.slice(0, index), line.slice(index + 1))
}
const append = []
for (const record of records) {
  for (const [key, value] of Object.entries(record.buildEnv?.literal ?? {})) {
    if (!env.has(key)) {
      env.set(key, String(value))
      append.push(`${key}=${value}`)
    }
  }
  for (const alias of record.buildEnv?.aliases ?? []) {
    if (!env.has(alias.key) && env.has(alias.fromKey)) {
      const value = env.get(alias.fromKey)
      env.set(alias.key, value)
      append.push(`${alias.key}=${value}`)
    }
  }
}
if (append.length > 0) fs.appendFileSync(envPath, `${append.join('\n')}\n`)
NODE

PATH_VALUE="$(node - "$METADATA_JSON" <<'NODE'
const fs = require('node:fs')
const records = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const paths = []
for (const record of records) {
  for (const envVar of record.envVars ?? []) {
    if (envVar.name === 'PATH' && typeof envVar.value === 'string') {
      paths.push(...envVar.value.split(':'))
    }
  }
  for (const mapping of record.copyMappings ?? []) {
    if (mapping.from === '/runtime-deps') paths.push(`${mapping.to}/bin`)
  }
}
paths.push('/runtime-deps/bin', '/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin')
process.stdout.write([...new Set(paths)].join(':'))
NODE
)"
printf "PATH=%s\n" "$PATH_VALUE" >> "$ENV_FILE"

echo "Starting container: ${CONTAINER_NAME}"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --env-file "$ENV_FILE" \
  -v "$INSTALL_SCRIPT:/tmp/install-plugins.sh:ro" \
  -w /workspace \
  "$IMAGE_NAME" \
  sh -c "sh /tmp/install-plugins.sh && tail -f /dev/null" \
  >/dev/null

echo "Waiting for plugin setup to finish..."
for _ in $(seq 1 300); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || echo false)" != "true" ]; then
    echo "Container exited during setup" >&2
    docker logs "$CONTAINER_NAME" >&2 || true
    exit 1
  fi
  if docker logs "$CONTAINER_NAME" 2>&1 | grep -q '\[plugin-test\] ready'; then
    break
  fi
  sleep 1
done

if ! docker logs "$CONTAINER_NAME" 2>&1 | grep -q '\[plugin-test\] ready'; then
  echo "Timed out waiting for plugin setup" >&2
  docker logs "$CONTAINER_NAME" >&2 || true
  exit 1
fi

echo "Plugin setup completed."

if [ -n "$RUN_COMMAND" ]; then
  echo "Running test command: ${RUN_COMMAND}"
  docker exec "$CONTAINER_NAME" sh -c "$RUN_COMMAND"
fi

echo ""
echo "Container is ready:"
echo "  docker exec -it ${CONTAINER_NAME} sh"

if [ "$ENTER_SHELL" = "1" ] && [ -t 0 ] && [ -t 1 ]; then
  docker exec -it "$CONTAINER_NAME" sh
fi
