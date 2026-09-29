#!/usr/bin/env bash
# Control the development docker compose stack.
#
# Every command is a thin wrapper around `docker compose -f docker/compose.dev.yml`.
# Arguments after the command are passed straight through (e.g. `dev.sh logs docs -n 100`).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

REGISTRY_NETWORK=manablox-registry

usage() {
  cat <<'USAGE'
Usage: scripts/dev.sh <command> [docker compose args...]

  up          install the dependencies and start the docs site in the background
  down        stop the stack
  logs        follow the logs
  reset       stop the stack, remove its containers, and delete the build output and
              Astro's caches (dist/, .astro/, node_modules/.astro)
  <other>     any other docker compose command, forwarded as-is

  -h, --help  this message

Port: the docs site at http://localhost:3004. `@manablox/*` installs from the Verdaccio of
the CMS repository's development stack, which has to be up (`pnpm dev:services` there).
USAGE
}

if [ $# -eq 0 ]; then
  usage >&2
  exit 2
fi

command="$1"
shift

case "$command" in
  -h|--help) usage; exit 0 ;;
esac

require_docker

case "$command" in
  up)
    docker network inspect "$REGISTRY_NETWORK" >/dev/null 2>&1 ||
      die "no docker network $REGISTRY_NETWORK: start the CMS development stack first (pnpm dev:services in manablox-cms)"
    # `up -d --wait` returns once the dev server answers.
    compose up -d --build --wait "$@"
    log "the docs site runs at http://localhost:3004"
    ;;
  down) compose down "$@" ;;
  logs) compose logs -f "$@" ;;
  reset)
    compose down -v --remove-orphans "$@"
    rm -rf "$ROOT/dist" "$ROOT/.astro" "$ROOT/node_modules/.astro"
    ;;
  *) compose "$command" "$@" ;;
esac
