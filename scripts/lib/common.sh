#!/usr/bin/env bash
# Shared helpers for the scripts in this directory. Source it, do not run it:
#
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
#
# It sets ROOT to the repository root and defines a prefixed logger, a fatal-error helper
# and the docker compose wrapper that `dev.sh` owns.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ROOT

# The script's own name, for log prefixes: `dev: ...`.
SCRIPT_NAME="$(basename "${BASH_SOURCE[1]:-$0}" .sh)"

log() { printf '%s: %s\n' "$SCRIPT_NAME" "$*"; }
warn() { printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; }
die() { warn "$@"; exit "${DIE_STATUS:-1}"; }

# `usage_error "unknown option '$1'"` - prints the message, then the caller's usage(),
# and exits 2.
usage_error() {
  warn "$1"
  if declare -F usage >/dev/null; then usage >&2; fi
  exit 2
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is required but not installed"
  docker info >/dev/null 2>&1 || die "docker is installed but the daemon is not reachable"
}

# The gitignored files a fresh clone lacks: `.env` from `.env.example`, and the `.npmrc`
# that installs `@manablox/*` from the CMS development stack's registry on the host.
seed_files() {
  if [ ! -e "$ROOT/.env" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    log "created .env from .env.example"
  fi
  if [ ! -e "$ROOT/.npmrc" ]; then
    printf '@manablox:registry=http://localhost:4873/\n' > "$ROOT/.npmrc"
    log "created .npmrc: @manablox/* from the local registry at http://localhost:4873/"
  fi
}

COMPOSE_FILE="$ROOT/docker/compose.dev.yml"
compose() {
  seed_files
  # The container writes `node_modules` into the bind-mounted working copy, so it runs as
  # the invoking user. Without this compose falls back to 1000:1000.
  DEV_UID="$(id -u)" DEV_GID="$(id -g)" docker compose -f "$COMPOSE_FILE" "$@"
}
