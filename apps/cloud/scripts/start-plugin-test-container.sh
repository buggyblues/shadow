#!/usr/bin/env bash
# Start a disposable container that runs one or more plugins' real runtime asset install flows.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/../.." && pwd)"

IMAGE_NAME="${PLUGIN_TEST_IMAGE:-node:22-alpine}"
CONTAINER_NAME="${PLUGIN_TEST_CONTAINER:-shadow-plugin-test}"
CONTAINER_PREFIX="${PLUGIN_TEST_CONTAINER_PREFIX:-shadow-plugin-}"
RUNNER_ID="${PLUGIN_TEST_RUNNER:-}"
BUILD_IMAGE="${PLUGIN_TEST_BUILD_IMAGE:-auto}"
RUN_USER="${PLUGIN_TEST_USER:-}"
SETUP_USER="${PLUGIN_TEST_SETUP_USER:-}"
SHELL_BIN="${PLUGIN_TEST_SHELL:-sh}"
RUN_COMMAND=""
ENTER_SHELL=1
PROMPT_MISSING=1
NO_PLUGINS=0
IMAGE_EXPLICIT=0
CONTAINER_NAME_EXPLICIT=0
PLUGIN_IDS=()

usage() {
  cat <<USAGE
Usage: $0 [plugin-id ...] [options]
       $0 clean [--all-images]

Options:
  --plugins a,b,c       Comma-separated plugin ids.
  --no-plugins          Start the container without installing plugin assets.
  --runner runner       Use a Cloud runner image: openclaw, claude-code, codex,
                        opencode, hermes. Aliases: claude, base, node.
  --build               Build the selected runner image before starting.
  --no-build            Do not build the selected runner image.
  --name name           Docker container name. Default: ${CONTAINER_NAME}
  --image image         Docker base image. Default: ${IMAGE_NAME}
  --user user           Docker user for command/shell. Runner mode defaults to shadow.
  --setup-user user     Docker user for setup. Runner mode defaults to root.
  --shell shell         Shell to use in the container. Default: ${SHELL_BIN}
  --command 'cmd'       Run a command after setup.
  --no-shell            Do not automatically exec into the container.
  --no-prompt           Do not prompt for missing required plugin env vars.
  --all-images          With clean, also prune all unused images, not only dangling ones.

Examples:
  $0
  $0 opencli
  $0 opencli github --command 'opencli --version && gh --version'
  $0 --runner codex --command 'cc-connect --help && codex --version'
  $0 --runner hermes --command 'hermes --version && shadowob --help'
  SHADOWOB_PLUGIN_TEST_OPTIONS_CLAUDE_PLUGIN='{"marketplaces":[{"repo":"anthropics/financial-services","plugins":["pitch-agent"]}]}' \
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
    --no-plugins)
      NO_PLUGINS=1
      shift
      ;;
    --runner)
      RUNNER_ID="${2:?missing value for --runner}"
      shift 2
      ;;
    --build)
      BUILD_IMAGE=1
      shift
      ;;
    --no-build)
      BUILD_IMAGE=0
      shift
      ;;
    --name)
      CONTAINER_NAME="${2:?missing value for --name}"
      CONTAINER_NAME_EXPLICIT=1
      shift 2
      ;;
    --image)
      IMAGE_NAME="${2:?missing value for --image}"
      IMAGE_EXPLICIT=1
      shift 2
      ;;
    --user)
      RUN_USER="${2:?missing value for --user}"
      shift 2
      ;;
    --setup-user)
      SETUP_USER="${2:?missing value for --setup-user}"
      shift 2
      ;;
    --shell)
      SHELL_BIN="${2:?missing value for --shell}"
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

append_env_if_absent() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    printf "%s=%s\n" "$key" "$value" >> "$ENV_FILE"
  fi
}

append_runtime_env_json() {
  local json_path="$1"
  [ -f "$json_path" ] || return 0
  node - "$json_path" "$ENV_FILE" <<'NODE'
const fs = require('node:fs')
const [jsonPath, envPath] = process.argv.slice(2)
const runtimeEnv = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const existing = new Set(
  fs.existsSync(envPath)
    ? fs
        .readFileSync(envPath, 'utf8')
        .split(/\n/)
        .map((line) => line.slice(0, line.indexOf('=')))
        .filter(Boolean)
    : [],
)
const lines = []
for (const [key, value] of Object.entries(runtimeEnv)) {
  if (existing.has(key)) continue
  const text = String(value)
  if (text.includes('\n') || text.includes('\r')) continue
  lines.push(`${key}=${text}`)
}
if (lines.length > 0) fs.appendFileSync(envPath, `${lines.join('\n')}\n`)
NODE
}

runner_dir_for() {
  case "$1" in
    ""|base|node)
      printf ""
      ;;
    openclaw|openclaw-runner)
      printf "openclaw-runner"
      ;;
    claude|claude-code|claude-runner)
      printf "claude-runner"
      ;;
    codex|codex-runner)
      printf "codex-runner"
      ;;
    opencode|open-code|opencode-runner)
      printf "opencode-runner"
      ;;
    hermes|hermes-runner)
      printf "hermes-runner"
      ;;
    *)
      echo "Unknown runner: $1" >&2
      echo "Supported runners: openclaw, claude-code, codex, opencode, hermes, base" >&2
      exit 2
      ;;
  esac
}

runner_image_tag_for_dir() {
  printf "shadow-plugin-test/%s:latest" "$1"
}

runtime_id_for_dir() {
  case "$1" in
    openclaw-runner)
      printf "openclaw"
      ;;
    claude-runner)
      printf "claude-code"
      ;;
    codex-runner)
      printf "codex"
      ;;
    opencode-runner)
      printf "opencode"
      ;;
    hermes-runner)
      printf "hermes"
      ;;
    *)
      printf ""
      ;;
  esac
}

docker_image_exists() {
  docker image inspect "$1" >/dev/null 2>&1
}

prepare_runner_image() {
  local runner_dir="$1"
  [ -z "$runner_dir" ] && return 0

  local dockerfile="$APP_DIR/images/$runner_dir/Dockerfile"
  if [ ! -f "$dockerfile" ]; then
    echo "Runner Dockerfile not found: $dockerfile" >&2
    exit 2
  fi

  local should_build=0
  case "$BUILD_IMAGE" in
    1|true|yes)
      should_build=1
      ;;
    0|false|no)
      should_build=0
      ;;
    auto)
      if [ "$IMAGE_EXPLICIT" = "0" ] && ! docker_image_exists "$IMAGE_NAME"; then
        should_build=1
      fi
      ;;
    *)
      echo "Invalid PLUGIN_TEST_BUILD_IMAGE/--build value: $BUILD_IMAGE" >&2
      exit 2
      ;;
  esac

  if [ "$should_build" = "1" ]; then
    echo "Building runner image: ${IMAGE_NAME}"
    docker build -t "$IMAGE_NAME" -f "$dockerfile" "$REPO_DIR"
  else
    echo "Using existing runner image: ${IMAGE_NAME}"
  fi
}

write_runner_runtime_config() {
  local runtime_id="$1"
  local output_dir="$2"
  shift 2
  local plugin_ids=("$@")
  [ -z "$runtime_id" ] && return 0

  local generator
  generator="$(mktemp "$APP_DIR/.shadow-runner-config-generator.XXXXXX.ts")"
  cat > "$generator" <<'TS'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentDeployment, AgentRuntime, CloudConfig } from './src/config/schema.js'
import { buildAgentRuntimePackage } from './src/infra/runtime-package.js'
import { getPluginRegistry, resetPluginRegistry } from './src/plugins/registry.js'
import shadowobPlugin from './src/plugins/shadowob/index.js'

const [outDir, runtime, ...pluginIds] = process.argv.slice(2) as [string, AgentRuntime, ...string[]]
mkdirSync(outDir, { recursive: true })
resetPluginRegistry()
getPluginRegistry().register(shadowobPlugin)
for (const pluginId of pluginIds) {
  if (pluginId === 'shadowob') continue
  const mod = await import(`./src/plugins/${pluginId}/index.js`)
  getPluginRegistry().register(mod.default)
}

const agent: AgentDeployment = {
  id: `${runtime}-plugin-test`,
  runtime,
  use: pluginIds.map((plugin) => ({ plugin })),
  configuration: {},
  identity: {
    name: `${runtime} Plugin Test`,
    systemPrompt: 'Plugin test runner container.',
  },
}
const config: CloudConfig = {
  version: '1',
  plugins: {
    shadowob: {
      config: {
        buddies: [{ id: 'buddy-1', name: 'Plugin Test Buddy' }],
        bindings: [{ agentId: agent.id, targetId: 'buddy-1' }],
      },
    },
  },
  deployments: { agents: [agent] },
}
const pkg = buildAgentRuntimePackage({
  agent,
  config,
  extraEnv: {
    SHADOWOB_SERVER_URL: process.env.SHADOWOB_SERVER_URL ?? 'http://host.docker.internal:3000',
    SHADOWOB_TOKEN_BUDDY_1: process.env.SHADOWOB_TOKEN_BUDDY_1 ?? 'shadow-plugin-test-token',
  },
  cwd: process.cwd(),
})

for (const [name, content] of Object.entries(pkg.configData)) {
  writeFileSync(join(outDir, name), content)
}
writeFileSync(
  join(outDir, 'runtime-env.json'),
  `${JSON.stringify({ ...pkg.plainEnv, ...pkg.secretData }, null, 2)}\n`,
  { mode: 0o600 },
)
TS
  (
    cd "$APP_DIR"
    pnpm --silent exec tsx "$generator" "$output_dir" "$runtime_id" "${plugin_ids[@]}"
  )
  rm -f "$generator"
}

RUNNER_REQUESTED=0
if [ -n "$RUNNER_ID" ]; then
  RUNNER_REQUESTED=1
fi
RUNNER_DIR="$(runner_dir_for "$RUNNER_ID")"
if [ -n "$RUNNER_DIR" ]; then
  if [ "$IMAGE_EXPLICIT" = "0" ]; then
    IMAGE_NAME="$(runner_image_tag_for_dir "$RUNNER_DIR")"
  fi
  if [ "$CONTAINER_NAME_EXPLICIT" = "0" ]; then
    CONTAINER_NAME="${CONTAINER_PREFIX}${RUNNER_DIR%-runner}-test"
  fi
  if [ -z "$SETUP_USER" ]; then
    SETUP_USER="root"
  fi
  if [ -z "$RUN_USER" ]; then
    RUN_USER="shadow"
  fi
  prepare_runner_image "$RUNNER_DIR"
elif [ "$BUILD_IMAGE" = "1" ]; then
  echo "--build requires --runner so the script can find a Dockerfile." >&2
  exit 2
fi
if [ -z "$SETUP_USER" ]; then
  SETUP_USER="$RUN_USER"
fi

METADATA_JSON="$(mktemp -t shadow-plugin-metadata.XXXXXX.json)"
INSTALL_SCRIPT="$(mktemp -t shadow-plugin-install.XXXXXX.sh)"
ENV_FILE="$(mktemp -t shadow-plugin-env.XXXXXX)"
PLUGIN_LIST_FILE="$(mktemp -t shadow-plugin-list.XXXXXX)"
RUNTIME_CONFIG_DIR="$(mktemp -d -t shadow-runner-config.XXXXXX)"

cleanup() {
  rm -f "$METADATA_JSON" "$INSTALL_SCRIPT" "$ENV_FILE" "$PLUGIN_LIST_FILE"
  rm -rf "$RUNTIME_CONFIG_DIR"
}
trap cleanup EXIT

if [ "${#PLUGIN_IDS[@]}" -eq 0 ] && [ "$NO_PLUGINS" = "0" ] && [ "$RUNNER_REQUESTED" = "0" ]; then
  choose_plugins "$PLUGIN_LIST_FILE"
fi

if [ "${#PLUGIN_IDS[@]}" -eq 0 ] && [ "$NO_PLUGINS" = "0" ] && [ "$RUNNER_REQUESTED" = "0" ]; then
  echo "No plugins selected" >&2
  exit 2
fi

if [ "${#PLUGIN_IDS[@]}" -eq 0 ]; then
  echo "Selected plugins: none"
else
  echo "Selected plugins: ${PLUGIN_IDS[*]}"
fi

if [ "${#PLUGIN_IDS[@]}" -eq 0 ]; then
  printf "[]\n" > "$METADATA_JSON"
else
  (
    cd "$APP_DIR"
    pnpm --silent exec tsx scripts/plugin-runtime-metadata.ts --json "${PLUGIN_IDS[@]}"
  ) > "$METADATA_JSON"
fi

node - "$METADATA_JSON" > "$INSTALL_SCRIPT" <<'NODE'
const fs = require('node:fs')
const records = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const q = (value) => `'${String(value).replace(/'/g, "'\\''")}'`
const lines = [
  'set -eu',
  `if [ "\${SHADOWOB_PLUGIN_TEST_NORMALIZE_USER:-0}" = "1" ] && [ "$(id -u)" = "0" ]; then
  if ! id shadow >/dev/null 2>&1; then
    existing_user="$(getent passwd 1000 2>/dev/null | cut -d: -f1 || true)"
    if [ -n "$existing_user" ]; then
      if [ "$existing_user" = "openclaw" ] && command -v groupmod >/dev/null 2>&1; then groupmod -n shadow openclaw 2>/dev/null || true; fi
      if command -v usermod >/dev/null 2>&1; then usermod -l shadow -d /home/shadow -m "$existing_user" 2>/dev/null || true; fi
    elif command -v useradd >/dev/null 2>&1; then
      if ! getent group shadow >/dev/null 2>&1 && command -v groupadd >/dev/null 2>&1; then groupadd -g 1000 shadow 2>/dev/null || groupadd shadow 2>/dev/null || true; fi
      useradd -u 1000 -g shadow -M -d /home/shadow -s /bin/sh shadow 2>/dev/null || true
    fi
  fi
  mkdir -p /home/shadow
  if [ -d /home/openclaw ] && [ ! -L /home/openclaw ]; then cp -a /home/openclaw/. /home/shadow/ 2>/dev/null || true; rm -rf /home/openclaw; fi
  chown -R 1000:1000 /home/shadow
  if [ ! -e /home/openclaw ]; then ln -s /home/shadow /home/openclaw; fi
fi`,
  'if [ -d /tmp/shadow-runtime-config ]; then mkdir -p /etc/openclaw; cp -R /tmp/shadow-runtime-config/. /etc/openclaw/; fi',
  'mkdir -p /workspace /runtime-deps /etc/shadowob',
  `node <<'MATERIALIZE_RUNTIME_FILES'
const { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { dirname, resolve } = require('node:path')
const path = '/etc/openclaw/runtime-files.json'
const extensionsPath = '/etc/openclaw/runtime-extensions.json'
const runtimeEnvPath = '/etc/openclaw/runtime-env.json'
const runtimeEnv = existsSync(runtimeEnvPath) ? JSON.parse(readFileSync(runtimeEnvPath, 'utf8')) : {}
function envValue(key) {
  return process.env[key] ?? runtimeEnv[key]
}
function replaceEnv(value) {
  return value.replace(/\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}/g, (_, key) => envValue(key) ?? '')
}
function modeFor(file) {
  return file.endsWith('/.env') || /\\.(json|toml|ya?ml)$/u.test(file) ? 0o600 : 0o644
}
if (existsSync(path)) {
  const files = JSON.parse(readFileSync(path, 'utf8'))
  for (const [target, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue
    const absolute = resolve(target)
    mkdirSync(dirname(absolute), { recursive: true })
    const mode = modeFor(absolute)
    writeFileSync(absolute, replaceEnv(content), { encoding: 'utf8', mode })
    chmodSync(absolute, mode)
    if (process.getuid && process.getuid() === 0) {
      try { require('node:fs').chownSync(dirname(absolute), 1000, 1000) } catch {}
      try { require('node:fs').chownSync(absolute, 1000, 1000) } catch {}
    }
  }
}
if (existsSync(extensionsPath)) {
  const extension = JSON.parse(readFileSync(extensionsPath, 'utf8'))
  for (const file of extension.credentialFiles ?? []) {
    if (!file || typeof file !== 'object') continue
    const envKey = typeof file.envKey === 'string' ? file.envKey : ''
    const target = typeof file.path === 'string' ? file.path : ''
    const content = envValue(envKey)
    if (!envKey || !target || content === undefined) continue
    const absolute = resolve(target)
    mkdirSync(dirname(absolute), { recursive: true })
    const parsedMode = typeof file.mode === 'string' ? Number.parseInt(file.mode, 8) : 0o600
    const mode = Number.isFinite(parsedMode) ? parsedMode : 0o600
    writeFileSync(absolute, replaceEnv(String(content)), { encoding: 'utf8', mode })
    chmodSync(absolute, mode)
    if (process.getuid && process.getuid() === 0) {
      try { require('node:fs').chownSync(dirname(absolute), 1000, 1000) } catch {}
      try { require('node:fs').chownSync(absolute, 1000, 1000) } catch {}
    }
  }
}
MATERIALIZE_RUNTIME_FILES`,
]
if (records.length > 0) {
  lines.push('mkdir -p /plugin-skills /plugin-subagents /workspace/.agents/plugin-skills /workspace/.agents/plugin-subagents')
}
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
if (records.length > 0) {
  const skillRoots = [
    ...new Set(
      records.flatMap((record) =>
        (record.copyMappings ?? [])
          .map((mapping) => mapping.to)
          .filter((target) => target.includes('/plugin-skills/')),
      ),
    ),
  ]
  const subagentRoots = [
    ...new Set(
      records.flatMap((record) =>
        (record.copyMappings ?? [])
          .map((mapping) => mapping.to)
          .filter((target) => target.includes('/plugin-subagents/')),
      ),
    ),
  ]
  lines.push(`node <<'MIRROR_PLUGIN_ASSETS'
const { cpSync, existsSync, mkdirSync, readdirSync, statSync, chownSync } = require('node:fs')
const { basename, join } = require('node:path')
const skillRoots = ${JSON.stringify(skillRoots)}
const subagentRoots = ${JSON.stringify(subagentRoots)}
const skillDestinations = [
  '/workspace/.agents/skills',
  '/workspace/.claude/skills',
  '/workspace/.opencode/skills',
  '/home/shadow/.codex/skills',
  '/home/shadow/.hermes/skills',
  '/home/shadow/.openclaw/skills',
]
const subagentDestinations = [
  '/workspace/.agents/agents',
  '/workspace/.claude/agents',
  '/workspace/.opencode/agents',
  '/home/shadow/.codex/agents',
  '/home/shadow/.hermes/agents',
]
function entriesWithMarker(root, marker) {
  if (!existsSync(root)) return []
  if (existsSync(join(root, marker))) return [{ source: root, name: basename(root) }]
  return readdirSync(root)
    .map((name) => ({ source: join(root, name), name }))
    .filter((entry) => {
      try {
        return statSync(entry.source).isDirectory() && existsSync(join(entry.source, marker))
      } catch {
        return false
      }
    })
}
function mirror(roots, marker, destinations) {
  for (const root of roots) {
    for (const entry of entriesWithMarker(root, marker)) {
      for (const destinationRoot of destinations) {
        const destination = join(destinationRoot, entry.name)
        mkdirSync(destinationRoot, { recursive: true })
        if (!existsSync(destination)) cpSync(entry.source, destination, { recursive: true })
      }
    }
  }
}
mirror(skillRoots, 'SKILL.md', skillDestinations)
mirror(subagentRoots, 'AGENT.md', subagentDestinations)
mirror(subagentRoots, 'agent.md', subagentDestinations)
if (process.getuid && process.getuid() === 0) {
  for (const root of ['/workspace/.agents', '/workspace/.claude', '/workspace/.opencode', '/home/shadow']) {
    try { chownSync(root, 1000, 1000) } catch {}
  }
}
MIRROR_PLUGIN_ASSETS`)
}
lines.push('if [ "${SHADOWOB_PLUGIN_TEST_KEEP_STAGING:-0}" != "1" ]; then rm -rf /plugin-skills /plugin-subagents; fi')
lines.push('echo "[plugin-test] ready"')
process.stdout.write(lines.join('\n'))
NODE

touch "$ENV_FILE"
if [ -n "$RUNNER_DIR" ]; then
  RUNTIME_ID="$(runtime_id_for_dir "$RUNNER_DIR")"
  write_runner_runtime_config "$RUNTIME_ID" "$RUNTIME_CONFIG_DIR" "${PLUGIN_IDS[@]}"
  append_runtime_env_json "$RUNTIME_CONFIG_DIR/runtime-env.json"
  append_env_if_absent HOME "/home/shadow"
  append_env_if_absent SHADOWOB_PLUGIN_TEST_NORMALIZE_USER "1"
  append_env_if_absent SHADOWOB_RUNNER_CONFIG_MOUNT "/etc/openclaw"
  append_env_if_absent SHADOWOB_SERVER_URL "${SHADOWOB_SERVER_URL:-http://host.docker.internal:3000}"
  append_env_if_absent SHADOWOB_TOKEN_BUDDY_1 "${SHADOWOB_TOKEN_BUDDY_1:-shadow-plugin-test-token}"
  append_env_if_absent SHADOWOB_TOKEN "${SHADOWOB_TOKEN:-${SHADOWOB_TOKEN_BUDDY_1:-shadow-plugin-test-token}}"
fi
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
  runtime="$(node -e 'const item=JSON.parse(process.argv[1]); process.stdout.write(item.runtime === false ? "0" : "1")' "$raw")"
  label="$(node -e 'const item=JSON.parse(process.argv[1]); process.stdout.write(item.label || item.key)' "$raw")"
  value="${!key-}"
  if [ -z "$value" ] && [ "$required" = "1" ] && [ "$PROMPT_MISSING" = "1" ]; then
    printf "Enter %s (%s): " "$label" "$key"
    read -r value </dev/tty
  fi
  if [ -n "$value" ] && [ "$runtime" = "1" ]; then
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
const expandTemplate = (value) =>
  String(value).replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_, key) => env.get(key) ?? process.env[key] ?? '',
  )
const appendEnv = (key, value) => {
  const text = String(value)
  env.set(key, text)
  if (text.includes('\n') || text.includes('\r')) return
  append.push(`${key}=${text}`)
}
for (const record of records) {
  for (const [key, value] of Object.entries(record.buildEnv?.literal ?? {})) {
    if (!env.has(key)) {
      appendEnv(key, value)
    }
  }
  for (const alias of record.buildEnv?.aliases ?? []) {
    if (!env.has(alias.key) && env.has(alias.fromKey)) {
      const value = env.get(alias.fromKey)
      appendEnv(alias.key, value)
    }
  }
  for (const [key, value] of Object.entries(record.buildEnv?.templates ?? {})) {
    if (!env.has(key)) {
      const rendered = expandTemplate(value)
      appendEnv(key, rendered)
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

DOCKER_USER_ARGS=()
DOCKER_EXEC_USER_ARGS=()
RUNTIME_CONFIG_MOUNT_ARGS=()
if [ -n "$SETUP_USER" ]; then
  DOCKER_USER_ARGS=(--user "$SETUP_USER")
fi
if [ -n "$RUN_USER" ]; then
  DOCKER_EXEC_USER_ARGS=(--user "$RUN_USER")
fi
if [ -n "$RUNNER_DIR" ]; then
  RUNTIME_CONFIG_MOUNT_ARGS=(-v "$RUNTIME_CONFIG_DIR:/tmp/shadow-runtime-config:ro")
fi

DOCKER_RUN_ARGS=(--name "$CONTAINER_NAME")
if [ "${#DOCKER_USER_ARGS[@]}" -gt 0 ]; then
  DOCKER_RUN_ARGS+=("${DOCKER_USER_ARGS[@]}")
fi
DOCKER_RUN_ARGS+=(
  --env-file "$ENV_FILE"
  -v "$INSTALL_SCRIPT:/tmp/install-plugins.sh:ro"
)
if [ "${#RUNTIME_CONFIG_MOUNT_ARGS[@]}" -gt 0 ]; then
  DOCKER_RUN_ARGS+=("${RUNTIME_CONFIG_MOUNT_ARGS[@]}")
fi
DOCKER_RUN_ARGS+=(-w /workspace)

docker_exec_args() {
  if [ "${#DOCKER_EXEC_USER_ARGS[@]}" -gt 0 ]; then
    docker exec "${DOCKER_EXEC_USER_ARGS[@]}" "$@"
  else
    docker exec "$@"
  fi
}

echo "Starting container: ${CONTAINER_NAME}"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  "${DOCKER_RUN_ARGS[@]}" \
  "$IMAGE_NAME" \
  "$SHELL_BIN" -c "sh /tmp/install-plugins.sh && tail -f /dev/null" \
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
  docker_exec_args "$CONTAINER_NAME" "$SHELL_BIN" -c "$RUN_COMMAND"
fi

echo ""
echo "Container is ready:"
echo "  docker exec -it ${CONTAINER_NAME} ${SHELL_BIN}"
if [ -n "$RUN_USER" ]; then
  echo "  docker exec -it --user ${RUN_USER} ${CONTAINER_NAME} ${SHELL_BIN}"
fi
if [ -n "$RUNNER_DIR" ]; then
  echo "Runner inspection paths:"
  echo "  home/config: /home/shadow"
  echo "  runner config mount: /etc/openclaw"
  echo "  ShadowOB skill: /workspace/.agents/skills/shadowob/SKILL.md"
  echo "  native homes: /home/shadow/.cc-connect /home/shadow/.codex /home/shadow/.claude /home/shadow/.hermes"
  echo "  docker exec -it --user root ${CONTAINER_NAME} ${SHELL_BIN}"
fi

if [ "$ENTER_SHELL" = "1" ] && [ -t 0 ] && [ -t 1 ]; then
  if [ "${#DOCKER_EXEC_USER_ARGS[@]}" -gt 0 ]; then
    docker exec -it "${DOCKER_EXEC_USER_ARGS[@]}" "$CONTAINER_NAME" "$SHELL_BIN"
  else
    docker exec -it "$CONTAINER_NAME" "$SHELL_BIN"
  fi
fi
