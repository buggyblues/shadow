#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf '%s\n' "Usage: $0 sync|backup|restore [--source USER@HOST] [--target USER@HOST] [--remote-path PATH] [--backup-root DIR] [--backup-dir DIR] [--yes] [--no-start-app]"
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

bash "$REPO_ROOT/scripts/ops/verify-prod-no-build.sh"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

ACTION="${1:-}"
if [ -n "$ACTION" ]; then
  shift
fi

SOURCE="${SOURCE_SSH_TARGET:-}"
TARGET="${TARGET_SSH_TARGET:-}"
SOURCE_PORT="${SOURCE_SSH_PORT:-22}"
TARGET_PORT="${TARGET_SSH_PORT:-22}"
REMOTE_PATH="${REMOTE_PATH:-/workspace/shadow}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-$REPO_ROOT/.tmp/prod-migrations}"
BACKUP_DIR="${BACKUP_DIR:-}"
TARGET_BACKUP_ROOT="${TARGET_BACKUP_ROOT:-$REMOTE_PATH/.migration-backups}"
SOURCE_MINIO_VOLUME="${SOURCE_MINIO_VOLUME:-}"
TARGET_MINIO_VOLUME="${TARGET_MINIO_VOLUME:-}"
RUNTIME_FILE_OWNER="${RUNTIME_FILE_OWNER:-1000:1000}"
YES=0
START_APP=1
SKIP_ENV=0
SKIP_DB=0
SKIP_MINIO=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    --source-port)
      SOURCE_PORT="$2"
      shift 2
      ;;
    --target-port)
      TARGET_PORT="$2"
      shift 2
      ;;
    --remote-path)
      REMOTE_PATH="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --backup-root)
      BACKUP_ROOT="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --target-backup-root)
      TARGET_BACKUP_ROOT="$2"
      shift 2
      ;;
    --source-minio-volume)
      SOURCE_MINIO_VOLUME="$2"
      shift 2
      ;;
    --target-minio-volume)
      TARGET_MINIO_VOLUME="$2"
      shift 2
      ;;
    --skip-env)
      SKIP_ENV=1
      shift
      ;;
    --skip-db)
      SKIP_DB=1
      shift
      ;;
    --skip-minio)
      SKIP_MINIO=1
      shift
      ;;
    --yes)
      YES=1
      shift
      ;;
    --no-start-app)
      START_APP=0
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

case "$ACTION" in
  sync | backup | restore) ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [ "$ACTION" = "backup" ] || [ "$ACTION" = "sync" ]; then
  if [ -z "$SOURCE" ]; then
    printf 'Missing source SSH target. Pass --source or set SOURCE_SSH_TARGET.\n' >&2
    exit 2
  fi
fi

if [ "$ACTION" = "restore" ] || [ "$ACTION" = "sync" ]; then
  if [ -z "$TARGET" ]; then
    printf 'Missing target SSH target. Pass --target or set TARGET_SSH_TARGET.\n' >&2
    exit 2
  fi
fi

SSH_COMMON=(-o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new)
KEY_PATH="${PROD_SSH_KEY_PATH:-${SSH_KEY_PATH:-}}"

quote() {
  printf '%q' "$1"
}

ssh_run() {
  local port="$1"
  local target="$2"
  shift 2

  local cmd
  cmd=(ssh "${SSH_COMMON[@]}")
  if [ "$port" != "22" ]; then
    cmd+=(-p "$port")
  fi
  if [ -n "$KEY_PATH" ]; then
    cmd+=(-i "$KEY_PATH")
  fi
  if [ -n "${SSHPASS:-}" ] && [ -z "$KEY_PATH" ]; then
    if ! command -v sshpass >/dev/null 2>&1; then
      printf 'SSHPASS is set, but sshpass is not installed.\n' >&2
      exit 127
    fi
    cmd=(sshpass -e "${cmd[@]}")
  fi

  "${cmd[@]}" "$target" "$@"
}

scp_to() {
  local port="$1"
  local target="$2"
  local source_path="$3"
  local remote_path="$4"
  local remote_path_q
  remote_path_q="$(quote "$remote_path")"

  if command -v rsync >/dev/null 2>&1 && ssh_run "$port" "$target" "command -v rsync >/dev/null 2>&1"; then
    local rsync_ssh
    rsync_ssh="ssh -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new"
    if [ "$port" != "22" ]; then
      rsync_ssh="$rsync_ssh -p $port"
    fi
    if [ -n "$KEY_PATH" ]; then
      rsync_ssh="$rsync_ssh -i $KEY_PATH"
    fi
    if [ -n "${SSHPASS:-}" ] && [ -z "$KEY_PATH" ]; then
      SSHPASS="$SSHPASS" sshpass -e rsync -a --partial --inplace -e "$rsync_ssh" "$source_path" "$target:$remote_path"
    else
      rsync -a --partial --inplace -e "$rsync_ssh" "$source_path" "$target:$remote_path"
    fi
    return
  fi

  local cmd
  cmd=(ssh "${SSH_COMMON[@]}")
  if [ "$port" != "22" ]; then
    cmd+=(-p "$port")
  fi
  if [ -n "$KEY_PATH" ]; then
    cmd+=(-i "$KEY_PATH")
  fi
  if [ -n "${SSHPASS:-}" ] && [ -z "$KEY_PATH" ]; then
    cmd=(sshpass -e "${cmd[@]}")
  fi

  "${cmd[@]}" "$target" "cat > $remote_path_q" < "$source_path"
}

scp_from() {
  local port="$1"
  local target="$2"
  local remote_path="$3"
  local local_path="$4"
  local remote_path_q
  remote_path_q="$(quote "$remote_path")"

  local cmd
  cmd=(ssh "${SSH_COMMON[@]}")
  if [ "$port" != "22" ]; then
    cmd+=(-p "$port")
  fi
  if [ -n "$KEY_PATH" ]; then
    cmd+=(-i "$KEY_PATH")
  fi
  if [ -n "${SSHPASS:-}" ] && [ -z "$KEY_PATH" ]; then
    cmd=(sshpass -e "${cmd[@]}")
  fi

  "${cmd[@]}" "$target" "cat $remote_path_q" > "$local_path"
}

remote_compose='compose() { if docker compose version >/dev/null 2>&1; then docker compose "$@"; elif command -v docker-compose >/dev/null 2>&1; then docker-compose "$@"; else printf "docker compose or docker-compose is required.\n" >&2; return 127; fi; };'

detect_minio_volume() {
  local port="$1"
  local target="$2"
  local remote_path_q="$3"
  local compose_file_q="$4"

  ssh_run "$port" "$target" \
    "cd $remote_path_q && $remote_compose container_id=\"\$(compose --env-file .env -f $compose_file_q ps -q minio 2>/dev/null || true)\"; if [ -n \"\$container_id\" ]; then docker inspect \"\$container_id\" --format '{{range .Mounts}}{{if eq .Destination \"/data\"}}{{.Name}}{{end}}{{end}}'; fi"
}

fallback_minio_volume() {
  local port="$1"
  local target="$2"
  local remote_path_q="$3"

  ssh_run "$port" "$target" \
    "cd $remote_path_q && if [ -f .env ]; then value=\"\$(grep -E '^SHADOWOB_MINIO_VOLUME=' .env | tail -n1 | cut -d= -f2-)\"; if [ -n \"\$value\" ]; then printf '%s\n' \"\$value\"; else printf '%s\n' shadow_miniodata; fi; else printf '%s\n' shadow_miniodata; fi"
}

env_file_value() {
  local key="$1"
  local file="$2"
  local value

  value="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' "$file" | tail -n1)"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s\n' "$value"
}

runtime_host_paths_from_env() {
  local env_file="$1"
  local key
  local value

  for key in \
    KUBECONFIG_HOST_PATH \
    CLOUD_SAAS_CLUSTER_CONFIG_HOST_PATH \
    CLOUD_SAAS_CLUSTER_KUBECONFIG_HOST_PATH
  do
    value="$(env_file_value "$key" "$env_file")"
    case "$value" in
      "" | /dev/null) ;;
      /*) printf '%s\n' "$value" ;;
      *)
        printf 'Skipping non-absolute runtime host path from %s: %s\n' "$key" "$value" >&2
        ;;
    esac
  done | awk '!seen[$0]++'
}

backup_runtime_files() {
  local env_file="$BACKUP_DIR/.env"
  local manifest="$BACKUP_DIR/runtime-files.manifest"
  local count=0
  local remote_file

  if [ ! -f "$env_file" ]; then
    return
  fi

  : > "$manifest"

  while IFS= read -r remote_file; do
    local remote_file_q
    local relative_path
    local local_file

    remote_file_q="$(quote "$remote_file")"
    relative_path="${remote_file#/}"
    local_file="$BACKUP_DIR/runtime-files/$relative_path"
    mkdir -p "$(dirname -- "$local_file")"

    if ssh_run "$SOURCE_PORT" "$SOURCE" "test -f $remote_file_q"; then
      scp_from "$SOURCE_PORT" "$SOURCE" "$remote_file" "$local_file"
      chmod 600 "$local_file"
      printf '%s\t%s\n' "$remote_file" "runtime-files/$relative_path" >> "$manifest"
      count=$((count + 1))
    else
      printf 'Runtime host file missing on source, skipped: %s\n' "$remote_file" >&2
    fi
  done < <(runtime_host_paths_from_env "$env_file")

  if [ "$count" -eq 0 ]; then
    rm -f "$manifest"
  else
    chmod 600 "$manifest"
    printf 'Backed up runtime host files: %s\n' "$count"
  fi
}

restore_runtime_files() {
  local manifest="$BACKUP_DIR/runtime-files.manifest"
  local remote_file
  local relative_path

  if [ ! -f "$manifest" ]; then
    return
  fi

  while IFS=$'\t' read -r remote_file relative_path; do
    local local_file
    local remote_dir
    local remote_dir_q
    local remote_file_q

    if [ -z "$remote_file" ] || [ -z "$relative_path" ]; then
      continue
    fi

    local_file="$BACKUP_DIR/$relative_path"
    if [ ! -f "$local_file" ]; then
      printf 'Missing runtime host file backup: %s\n' "$local_file" >&2
      exit 2
    fi

    remote_dir="$(dirname -- "$remote_file")"
    remote_dir_q="$(quote "$remote_dir")"
    remote_file_q="$(quote "$remote_file")"

    ssh_run "$TARGET_PORT" "$TARGET" "mkdir -p $remote_dir_q && rm -rf $remote_file_q"
    scp_to "$TARGET_PORT" "$TARGET" "$local_file" "$remote_file"
    ssh_run "$TARGET_PORT" "$TARGET" "chown $RUNTIME_FILE_OWNER $remote_file_q && chmod 400 $remote_file_q"
  done < "$manifest"
}

backup_data() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_DIR="$BACKUP_ROOT/$timestamp"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  remote_path_q="$(quote "$REMOTE_PATH")"
  compose_file_q="$(quote "$COMPOSE_FILE")"

  printf 'Creating local backup in %s\n' "$BACKUP_DIR"

  if [ "$SKIP_ENV" -eq 0 ]; then
    scp_from "$SOURCE_PORT" "$SOURCE" "$REMOTE_PATH/.env" "$BACKUP_DIR/.env"
    chmod 600 "$BACKUP_DIR/.env"
  fi

  if [ "$SKIP_DB" -eq 0 ]; then
    ssh_run "$SOURCE_PORT" "$SOURCE" \
      "cd $remote_path_q && $remote_compose compose --env-file .env -f $compose_file_q exec -T postgres sh -lc 'pg_dump -U \"\$POSTGRES_USER\" -d \"\${POSTGRES_DB:-shadow}\" -Fc'" \
      > "$BACKUP_DIR/postgres.dump"
    chmod 600 "$BACKUP_DIR/postgres.dump"
  fi

  if [ "$SKIP_MINIO" -eq 0 ]; then
    if [ -z "$SOURCE_MINIO_VOLUME" ]; then
      SOURCE_MINIO_VOLUME="$(detect_minio_volume "$SOURCE_PORT" "$SOURCE" "$remote_path_q" "$compose_file_q")"
    fi
    if [ -z "$SOURCE_MINIO_VOLUME" ]; then
      SOURCE_MINIO_VOLUME="$(fallback_minio_volume "$SOURCE_PORT" "$SOURCE" "$remote_path_q")"
    fi
    source_minio_volume_q="$(quote "$SOURCE_MINIO_VOLUME")"
    printf 'Backing up MinIO volume: %s\n' "$SOURCE_MINIO_VOLUME"
    ssh_run "$SOURCE_PORT" "$SOURCE" "docker image inspect alpine:3.20 >/dev/null 2>&1 || docker pull alpine:3.20 >/dev/null"
    ssh_run "$SOURCE_PORT" "$SOURCE" \
      "docker run --rm -v ${source_minio_volume_q}:/data:ro alpine:3.20 tar -C /data -czf - ." \
      > "$BACKUP_DIR/minio.tgz"
    chmod 600 "$BACKUP_DIR/minio.tgz"
  fi

  if [ "$SKIP_ENV" -eq 0 ]; then
    backup_runtime_files
  fi

  {
    printf 'created_at=%s\n' "$timestamp"
    printf 'source=%s\n' "$SOURCE"
    printf 'remote_path=%s\n' "$REMOTE_PATH"
    printf 'compose_file=%s\n' "$COMPOSE_FILE"
    printf 'source_minio_volume=%s\n' "$SOURCE_MINIO_VOLUME"
  } > "$BACKUP_DIR/manifest.env"

  printf 'Backup complete: %s\n' "$BACKUP_DIR"
}

confirm_restore() {
  if [ "$YES" -eq 1 ]; then
    return 0
  fi

  printf 'This will overwrite Postgres and MinIO data on %s:%s. Continue? [y/N] ' "$TARGET" "$REMOTE_PATH" >&2
  read -r answer
  case "$answer" in
    y | Y | yes | YES) ;;
    *)
      printf 'Restore cancelled.\n' >&2
      exit 1
      ;;
  esac
}

restore_data() {
  if [ -z "$BACKUP_DIR" ]; then
    printf '--backup-dir is required for restore.\n' >&2
    exit 2
  fi

  if [ ! -d "$BACKUP_DIR" ]; then
    printf 'Backup directory does not exist: %s\n' "$BACKUP_DIR" >&2
    exit 2
  fi

  confirm_restore

  remote_path_q="$(quote "$REMOTE_PATH")"
  compose_file_q="$(quote "$COMPOSE_FILE")"
  remote_backup_dir="$TARGET_BACKUP_ROOT/$(basename "$BACKUP_DIR")"
  remote_backup_dir_q="$(quote "$remote_backup_dir")"

  ssh_run "$TARGET_PORT" "$TARGET" "mkdir -p $remote_path_q $remote_backup_dir_q"

  if [ -f "$REPO_ROOT/docker-compose.prod.yml" ]; then
    scp_to "$TARGET_PORT" "$TARGET" "$REPO_ROOT/docker-compose.prod.yml" "$REMOTE_PATH/docker-compose.prod.yml"
  fi

  if [ "$SKIP_ENV" -eq 0 ]; then
    if [ ! -f "$BACKUP_DIR/.env" ]; then
      printf 'Missing backup .env: %s/.env\n' "$BACKUP_DIR" >&2
      exit 2
    fi
    scp_to "$TARGET_PORT" "$TARGET" "$BACKUP_DIR/.env" "$REMOTE_PATH/.env"
  fi

  restore_runtime_files

  if [ "$SKIP_DB" -eq 0 ]; then
    if [ ! -f "$BACKUP_DIR/postgres.dump" ]; then
      printf 'Missing database dump: %s/postgres.dump\n' "$BACKUP_DIR" >&2
      exit 2
    fi
    scp_to "$TARGET_PORT" "$TARGET" "$BACKUP_DIR/postgres.dump" "$remote_backup_dir/postgres.dump"
  fi

  if [ "$SKIP_MINIO" -eq 0 ]; then
    if [ ! -f "$BACKUP_DIR/minio.tgz" ]; then
      printf 'Missing MinIO archive: %s/minio.tgz\n' "$BACKUP_DIR" >&2
      exit 2
    fi
    scp_to "$TARGET_PORT" "$TARGET" "$BACKUP_DIR/minio.tgz" "$remote_backup_dir/minio.tgz"
  fi

  ssh_run "$TARGET_PORT" "$TARGET" "cd $remote_path_q && $remote_compose compose --env-file .env -f $compose_file_q up -d --no-build postgres redis minio"
  ssh_run "$TARGET_PORT" "$TARGET" "cd $remote_path_q && $remote_compose compose --env-file .env -f $compose_file_q stop server web admin || true"

  if [ "$SKIP_DB" -eq 0 ]; then
    ssh_run "$TARGET_PORT" "$TARGET" \
      "cd $remote_path_q && $remote_compose container_id=\"\$(compose --env-file .env -f $compose_file_q ps -q postgres)\" && docker cp $remote_backup_dir_q/postgres.dump \"\$container_id:/tmp/shadow-postgres.dump\" && compose --env-file .env -f $compose_file_q exec -T postgres sh -lc 'pg_restore --clean --if-exists --no-owner -U \"\$POSTGRES_USER\" -d \"\${POSTGRES_DB:-shadow}\" /tmp/shadow-postgres.dump && rm -f /tmp/shadow-postgres.dump'"
  fi

  if [ "$SKIP_MINIO" -eq 0 ]; then
    if [ -z "$TARGET_MINIO_VOLUME" ]; then
      TARGET_MINIO_VOLUME="$(detect_minio_volume "$TARGET_PORT" "$TARGET" "$remote_path_q" "$compose_file_q")"
    fi
    if [ -z "$TARGET_MINIO_VOLUME" ]; then
      TARGET_MINIO_VOLUME="$(fallback_minio_volume "$TARGET_PORT" "$TARGET" "$remote_path_q")"
    fi
    target_minio_volume_q="$(quote "$TARGET_MINIO_VOLUME")"
    printf 'Restoring MinIO volume: %s\n' "$TARGET_MINIO_VOLUME"
    ssh_run "$TARGET_PORT" "$TARGET" "docker image inspect alpine:3.20 >/dev/null 2>&1 || docker pull alpine:3.20 >/dev/null"
    ssh_run "$TARGET_PORT" "$TARGET" "cd $remote_path_q && $remote_compose compose --env-file .env -f $compose_file_q stop minio || true"
    ssh_run "$TARGET_PORT" "$TARGET" \
      "docker run --rm -v ${target_minio_volume_q}:/data -v ${remote_backup_dir_q}:/backup:ro alpine:3.20 sh -lc 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /data -xzf /backup/minio.tgz'"
    ssh_run "$TARGET_PORT" "$TARGET" "cd $remote_path_q && $remote_compose compose --env-file .env -f $compose_file_q up -d --no-build minio"
  fi

  if [ "$START_APP" -eq 1 ]; then
    ssh_run "$TARGET_PORT" "$TARGET" "cd $remote_path_q && $remote_compose compose --env-file .env -f $compose_file_q up -d --remove-orphans --no-build"
  fi

  printf 'Restore complete on %s:%s\n' "$TARGET" "$REMOTE_PATH"
}

if [ "$ACTION" = "backup" ] || [ "$ACTION" = "sync" ]; then
  backup_data
fi

if [ "$ACTION" = "restore" ] || [ "$ACTION" = "sync" ]; then
  restore_data
fi
