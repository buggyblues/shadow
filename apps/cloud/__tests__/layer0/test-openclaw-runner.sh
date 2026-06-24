#!/usr/bin/env bash
# Layer 0 test: openclaw-runner container
# Usage: ./tests/layer0/test-openclaw-runner.sh
#
# Validates:
# - Docker build succeeds
# - Container starts and /health returns 200 within 30s
# - Runs as non-root user
# - No API key patterns in stdout

set -euo pipefail

IMAGE_NAME="openclaw-runner:test"
CONTAINER_NAME="test-openclaw-runner-$$"
HEALTH_PORT=3100
TIMEOUT=30

cleanup() {
  echo "Cleaning up..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "=== Layer 0: openclaw-runner ==="

# 1. Build image
echo "▸ Building image..."
docker build \
  -t "$IMAGE_NAME" \
  -f "$REPO_DIR/apps/cloud/images/openclaw-runner/Dockerfile" \
  "$REPO_DIR" \
  --quiet
echo "✓ Image built: $IMAGE_NAME"

# 2. Bundled Shadow plugin must auto-deliver normal final replies.
echo "▸ Checking bundled Shadow reply delivery mode..."
REPLY_MODE_CHECK=$(docker run --rm --entrypoint sh "$IMAGE_NAME" -lc '
  if grep -R "message_tool_only" -n /app/extensions/shadowob/dist >/tmp/shadow-reply-mode-bad 2>/dev/null; then
    cat /tmp/shadow-reply-mode-bad
    exit 1
  fi
  grep -R "sourceReplyDeliveryMode: \"automatic\"" -n /app/extensions/shadowob/dist >/dev/null 2>&1 ||
    grep -R "sourceReplyDeliveryMode:\"automatic\"" -n /app/extensions/shadowob/dist >/dev/null 2>&1
' 2>&1 || true)
if [ -n "$REPLY_MODE_CHECK" ]; then
  echo "✗ Bundled Shadow plugin still blocks automatic final-text replies"
  echo "$REPLY_MODE_CHECK"
  exit 1
fi
echo "✓ Bundled Shadow plugin uses automatic reply delivery"

# 3. Start container (provide minimal env so entrypoint doesn't crash)
echo "▸ Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -e OPENCLAW_API_KEY="test-key-not-real" \
  -e OPENCLAW_HEALTH_PORT="$HEALTH_PORT" \
  -p "0:$HEALTH_PORT" \
  "$IMAGE_NAME"

# Get mapped port
MAPPED_PORT=$(docker port "$CONTAINER_NAME" "$HEALTH_PORT/tcp" | head -1 | cut -d: -f2)
echo "  Container started on port $MAPPED_PORT"

# 4. Health check
echo "▸ Waiting for /health (timeout: ${TIMEOUT}s)..."
elapsed=0
while [ $elapsed -lt $TIMEOUT ]; do
  if curl -sf "http://localhost:$MAPPED_PORT/health" > /dev/null 2>&1; then
    echo "✓ /health returned 200 (${elapsed}s)"
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

if [ $elapsed -ge $TIMEOUT ]; then
  echo "✗ /health did not respond within ${TIMEOUT}s"
  echo "Container logs:"
  docker logs "$CONTAINER_NAME" 2>&1 | tail -20
  exit 1
fi

# 5. Non-root user check
echo "▸ Checking user..."
USER_ID=$(docker exec "$CONTAINER_NAME" id -u 2>/dev/null || echo "unknown")
if [ "$USER_ID" = "0" ]; then
  echo "✗ Container is running as root (uid=0)"
  exit 1
fi
echo "✓ Running as non-root (uid=$USER_ID)"

# 6. Generated config must stay out of the mutable OpenClaw state directory.
echo "▸ Checking generated config path..."
CONFIG_PATH=$(docker exec "$CONTAINER_NAME" sh -lc 'test ! -f /home/shadow/.openclaw/openclaw.json && test -f /tmp/openclaw/config/openclaw.json && echo ok' 2>/dev/null || true)
if [ "$CONFIG_PATH" != "ok" ]; then
  echo "✗ Runtime config was not isolated from ~/.openclaw"
  docker exec "$CONTAINER_NAME" sh -lc 'ls -la /home/shadow/.openclaw /tmp/openclaw/config 2>/dev/null' || true
  exit 1
fi
echo "✓ Runtime config is isolated from ~/.openclaw"

# 7. Runtime defaults should avoid noisy cloud warnings while preserving memory vector recall.
echo "▸ Checking cloud runtime defaults..."
CONFIG_DEFAULTS=$(docker exec -i "$CONTAINER_NAME" node - <<'NODE' 2>/dev/null || true
const { readFileSync } = require('node:fs')
const config = JSON.parse(readFileSync('/tmp/openclaw/config/openclaw.json', 'utf8'))
const vector = config.agents?.defaults?.memorySearch?.store?.vector
const browser = config.browser
const errors = []
if (config.gateway?.bind !== 'loopback') errors.push(`gateway.bind=${config.gateway?.bind}`)
if (config.discovery?.mdns?.mode !== 'off') errors.push(`discovery.mdns.mode=${config.discovery?.mdns?.mode}`)
if (config.plugins?.entries?.bonjour?.enabled !== false) {
  errors.push(`plugins.entries.bonjour.enabled=${config.plugins?.entries?.bonjour?.enabled}`)
}
if (config.plugins?.entries?.browser?.enabled === true) {
  errors.push(`plugins.entries.browser.enabled=${config.plugins?.entries?.browser?.enabled}`)
}
for (const id of ['device-pair', 'file-transfer', 'phone-control', 'talk-voice']) {
  if (config.plugins?.entries?.[id]?.enabled !== false) {
    errors.push(`plugins.entries.${id}.enabled=${config.plugins?.entries?.[id]?.enabled}`)
  }
}
if (Array.isArray(config.plugins?.allow) && config.plugins.allow.includes('browser')) {
  errors.push(`plugins.allow=${config.plugins.allow.join(',')}`)
}
if (!Array.isArray(config.plugins?.allow) || !config.plugins.allow.includes('openclaw-shadowob')) {
  errors.push(`plugins.allow=${config.plugins?.allow}`)
}
if (Array.isArray(config.plugins?.allow) && config.plugins.allow.includes('memory-core')) {
  errors.push(`plugins.allow=${config.plugins.allow.join(',')}`)
}
if (vector != null && vector?.enabled !== false) errors.push(`memory vector enabled=${vector?.enabled}`)
if (vector?.extensionPath != null && !String(vector.extensionPath).endsWith('.so')) {
  errors.push(`memory vector extensionPath=${vector?.extensionPath}`)
}
if (browser != null) {
  if (browser?.headless !== true) errors.push(`browser.headless=${browser?.headless}`)
  if (browser?.noSandbox !== true) errors.push(`browser.noSandbox=${browser?.noSandbox}`)
  if (browser?.executablePath !== '/usr/bin/chromium-headless-shell') {
    errors.push(`browser.executablePath=${browser?.executablePath}`)
  }
  const requiredArgs = [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--single-process',
    '--disable-dev-shm-usage',
  ]
  if (!Array.isArray(browser?.extraArgs) || requiredArgs.some((arg) => !browser.extraArgs.includes(arg))) {
    errors.push(`browser.extraArgs=${browser?.extraArgs}`)
  }
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('ok')
NODE
)
if [ "$CONFIG_DEFAULTS" != "ok" ]; then
  echo "✗ Runtime config defaults are wrong"
  echo "$CONFIG_DEFAULTS"
  docker exec "$CONTAINER_NAME" sh -lc 'cat /tmp/openclaw/config/openclaw.json' || true
  exit 1
fi
echo "✓ Cloud runtime defaults are stable"

# 8. API key leak check
echo "▸ Checking logs for API key leaks..."
LOGS=$(docker logs "$CONTAINER_NAME" 2>&1)
if echo "$LOGS" | grep -qiE 'sk-ant-|sk-proj-|gsk_|xai-|ghp_'; then
  echo "✗ API key pattern detected in container logs!"
  exit 1
fi
echo "✓ No API key patterns in logs"

# 9. OpenClaw must not rewrite generated runtime config after startup.
echo "▸ Checking config overwrite logs..."
if echo "$LOGS" | grep -q 'Config overwrite:'; then
  echo "✗ OpenClaw rewrote the generated runtime config"
  echo "$LOGS" | grep 'Config overwrite:' || true
  exit 1
fi
echo "✓ Runtime config was not rewritten"

# 10. Cloud runner should not emit known misleading OpenClaw startup warnings.
echo "▸ Checking cloud warning logs..."
if echo "$LOGS" | grep -q 'Gateway is binding to a non-loopback address'; then
  echo "✗ OpenClaw gateway is still binding to a non-loopback address"
  exit 1
fi
if echo "$LOGS" | grep -q '\[bonjour\]'; then
  echo "✗ Bonjour/mDNS advertiser is still active"
  echo "$LOGS" | grep '\[bonjour\]' || true
  exit 1
fi
if echo "$LOGS" | grep -q 'sqlite-vec unavailable'; then
  echo "✗ sqlite-vec vector recall is unavailable"
  echo "$LOGS" | grep 'sqlite-vec unavailable' || true
  exit 1
fi
if echo "$LOGS" | grep -q 'Failed to apply manifest patch'; then
  echo "✗ Runtime manifest patch failed"
  echo "$LOGS" | grep 'Failed to apply manifest patch' || true
  exit 1
fi
if echo "$LOGS" | grep -q '\[runtime-deps\] staging'; then
  echo "✗ Plugin runtime dependencies were staged at container startup"
  echo "$LOGS" | grep '\[runtime-deps\] staging' || true
  exit 1
fi
echo "✓ No known noisy cloud warnings"

# 11. OpenClaw expects writable runtime files for plugin evolution and local state.
echo "▸ Checking writable runtime filesystem..."
if docker exec "$CONTAINER_NAME" sh -lc 'mkdir -p /workspace/.agents/skills/shadowob && touch /app/extensions/.shadow-write-test /home/shadow/.openclaw/.shadow-write-test /workspace/.agents/skills/shadowob/.shadow-write-test && rm -f /app/extensions/.shadow-write-test /home/shadow/.openclaw/.shadow-write-test /workspace/.agents/skills/shadowob/.shadow-write-test' 2>/dev/null; then
  echo "✓ OpenClaw runtime paths are writable"
else
  echo "✗ OpenClaw runtime paths are not writable"
  docker exec "$CONTAINER_NAME" sh -lc 'ls -ld /app /app/extensions /home/shadow/.openclaw /workspace /workspace/.agents /workspace/.agents/skills /workspace/.agents/skills/shadowob 2>/dev/null' || true
  exit 1
fi

# 12. OpenClaw agent skills need browser control, git, and Python available in the runner.
echo "▸ Checking OpenClaw toolchain dependencies..."
TOOLCHAIN_CHECK=$(docker exec "$CONTAINER_NAME" sh -lc '
  command -v git >/dev/null &&
  command -v python3 >/dev/null &&
  node -e "require.resolve(\"playwright-core\")" >/dev/null &&
  python3 --version >/dev/null &&
  git --version >/dev/null &&
  echo ok
' 2>/dev/null || true)
if [ "$TOOLCHAIN_CHECK" != "ok" ]; then
  echo "✗ Missing OpenClaw toolchain dependencies"
  docker exec "$CONTAINER_NAME" sh -lc 'command -v git || true; command -v python3 || true; node -e "console.log(require.resolve(\"playwright-core\"))" || true' || true
  exit 1
fi
echo "✓ OpenClaw toolchain dependencies are installed"

echo ""
echo "=== Layer 0: openclaw-runner — ALL CHECKS PASSED ==="
