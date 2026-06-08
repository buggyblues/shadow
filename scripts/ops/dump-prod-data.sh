#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf '%s\n' "Usage: $0 --source USER@HOST [--remote-path PATH] [--backup-root DIR] [--source-port PORT] [--source-minio-volume VOLUME]"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

exec "$SCRIPT_DIR/migrate-prod-data.sh" backup --skip-env "$@"
