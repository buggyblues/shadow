#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

status=0

for file in \
  "$REPO_ROOT/docker-compose.prod.yml" \
  "$REPO_ROOT/integrations/docker-compose.prod.yaml"
do
  if grep -nE '^[[:space:]]*build[[:space:]]*:' "$file" >&2; then
    printf 'Production compose files must not define image build sections: %s\n' "${file#$REPO_ROOT/}" >&2
    status=1
  fi
done

for file in \
  "$REPO_ROOT/scripts/ops/deploy-prod.sh" \
  "$REPO_ROOT/scripts/ops/deploy-integrations-prod.sh" \
  "$REPO_ROOT/scripts/ops/migrate-prod-data.sh" \
  "$REPO_ROOT/.github/workflows/deploy-production.yml" \
  "$REPO_ROOT/.github/workflows/deploy-integrations-production.yml"
do
  if grep -nE '(^|[[:space:]])--build($|[[:space:]])|docker[[:space:]]+build($|[[:space:]])|docker-compose[[:space:]]+build($|[[:space:]])|docker[[:space:]]+compose[[:space:]]+build($|[[:space:]])' "$file" >&2; then
    printf 'Production deploy path must not request image builds: %s\n' "${file#$REPO_ROOT/}" >&2
    status=1
  fi
done

exit "$status"
