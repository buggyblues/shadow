#!/bin/bash
set -e

CONFIG_FILE="/root/.openclaw/openclaw.json"

# -------------------------------------------------------
# Inject LLM provider config from environment variables
# -------------------------------------------------------
PROVIDER="${OPENCLAW_LLM_PROVIDER:-deepseek}"
API_KEY="${OPENCLAW_LLM_API_KEY:-}"
BASE_URL="${OPENCLAW_LLM_BASE_URL:-https://api.deepseek.com}"
MODEL="${OPENCLAW_LLM_MODEL:-deepseek-chat}"
GW_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-$(head -c 24 /dev/urandom | xxd -p)}"
GW_PORT="${OPENCLAW_GATEWAY_PORT:-3100}"
UI_PORT="${APP_PORT:-8080}"

if [ -z "$API_KEY" ]; then
  echo "❌ ERROR: OPENCLAW_LLM_API_KEY is required"
  echo "Usage: docker run -e OPENCLAW_LLM_API_KEY=sk-xxx ..."
  exit 1
fi

echo "╔══════════════════════════════════════════════╗"
echo "║     ⚡ Flash All-in-One v1.0               ║"
echo "╠══════════════════════════════════════════════╣"
echo "║ Provider  : $PROVIDER"
echo "║ Model     : $MODEL"
echo "║ Base URL  : $BASE_URL"
echo "║ Gateway   : localhost:$GW_PORT (internal)"
echo "║ UI + API  : 0.0.0.0:$UI_PORT"
echo "║ Token     : ${GW_TOKEN:0:8}..."
echo "╚══════════════════════════════════════════════╝"
echo ""

# Patch config with runtime values
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));

// LLM provider
cfg.models = cfg.models || {};
cfg.models.mode = 'merge';
cfg.models.providers = cfg.models.providers || {};
cfg.models.providers['$PROVIDER'] = {
  baseUrl: '$BASE_URL',
  apiKey: '$API_KEY',
  api: 'openai-completions',
  models: [{
    id: '$MODEL',
    name: '$MODEL',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 32768
  }]
};

// Agent default model
cfg.agents = cfg.agents || {};
cfg.agents.defaults = cfg.agents.defaults || {};
cfg.agents.defaults.model = { primary: '$PROVIDER/$MODEL' };

// Gateway auth
cfg.gateway = cfg.gateway || {};
cfg.gateway.port = parseInt('$GW_PORT');
cfg.gateway.auth = cfg.gateway.auth || {};
cfg.gateway.auth.token = '$GW_TOKEN';

fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2));
console.log('✅ Config patched');
"

echo "🛡️  Verifying OpenClaw gateway..."

# Ensure data directories exist
mkdir -p /data/projects /output

echo ""
echo "🚀 Starting OpenClaw Gateway on port $GW_PORT (background)..."
openclaw gateway run --port "$GW_PORT" --verbose &
OPENCLAW_PID=$!

# Wait for gateway to be ready
echo "⏳ Waiting for Gateway to become ready..."
READY=0
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$GW_PORT/health" >/dev/null 2>&1; then
    echo "✅ Gateway ready! (${i}s)"
    READY=1
    break
  fi
  if ! kill -0 $OPENCLAW_PID 2>/dev/null; then
    echo "❌ Gateway process died!"
    exit 1
  fi
  sleep 1
done

if [ "$READY" = "0" ]; then
  echo "⚠️  Gateway not responding after 60s, starting API server anyway..."
fi

echo ""
echo "🚀 Starting Flash UI + API Server on port $UI_PORT..."
echo "   ➡️  Open http://localhost:$UI_PORT in your browser"
echo ""

# Graceful shutdown handler
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $OPENCLAW_PID 2>/dev/null || true
  wait $OPENCLAW_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup SIGTERM SIGINT

# Start API server
export OPENCLAW_URL="http://localhost:$GW_PORT"
export OPENCLAW_TOKEN="$GW_TOKEN"
export PORT="$UI_PORT"
export STATIC_DIR="/app/ui"
export DATA_DIR="/data"
export OUTPUT_DIR="/output"
export THEMES_DIR="/data/themes"
export OPENCLAW_SKILLS_DIR="/app/workspace/skills"

node /app/server/dist/index.js &
SERVER_PID=$!

# Wait for either process to exit
wait -n $OPENCLAW_PID $SERVER_PID 2>/dev/null || true
echo "⚠️  A process exited, shutting down..."
cleanup
exit 1
