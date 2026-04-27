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
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Layer 0: openclaw-runner ==="

# 1. Build image
echo "▸ Building image..."
docker build -t "$IMAGE_NAME" "$PROJECT_DIR/images/openclaw-runner" --quiet
echo "✓ Image built: $IMAGE_NAME"

# 2. Start container (provide minimal env so entrypoint doesn't crash)
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

# 3. Health check
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

# 4. Non-root user check
echo "▸ Checking user..."
USER_ID=$(docker exec "$CONTAINER_NAME" id -u 2>/dev/null || echo "unknown")
if [ "$USER_ID" = "0" ]; then
  echo "✗ Container is running as root (uid=0)"
  exit 1
fi
echo "✓ Running as non-root (uid=$USER_ID)"

# 5. API key leak check
echo "▸ Checking logs for API key leaks..."
LOGS=$(docker logs "$CONTAINER_NAME" 2>&1)
if echo "$LOGS" | grep -qiE 'sk-ant-|sk-proj-|gsk_|xai-|ghp_'; then
  echo "✗ API key pattern detected in container logs!"
  exit 1
fi
echo "✓ No API key patterns in logs"

# 6. Read-only filesystem check (if applicable)
echo "▸ Checking filesystem..."
if docker exec "$CONTAINER_NAME" touch /test-write 2>/dev/null; then
  echo "⚠ Root filesystem is writable (expected read-only in production)"
else
  echo "✓ Root filesystem is read-only"
fi

echo ""
echo "=== Layer 0: openclaw-runner — ALL CHECKS PASSED ==="
