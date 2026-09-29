#!/usr/bin/env bash
# Re-resolves only `@manablox/*` in pnpm-lock.yaml against the registry pnpm is configured
# with, and nothing else: no other package moves, package.json keeps its ranges and
# node_modules is left alone.
#
#   pnpm lock:refresh           the configured registry (the local one, with the dev .npmrc)
#   pnpm lock:refresh --npmjs   npmjs, whatever an .npmrc says
#
# A republished version has a new checksum under the same version, and pnpm keeps what its
# metadata cache holds, so the cache entries of the scope go first. After a CMS release to
# npmjs, run it with `--npmjs` (or without the local .npmrc) and commit the lockfile: CI
# installs with --frozen-lockfile from npmjs, and a lockfile resolved against the local
# registry carries checksums npmjs does not have.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  sed -n '6,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

args=()
case "${1:-}" in
  '') ;;
  --npmjs) args+=(--config.@manablox:registry=https://registry.npmjs.org/) ;;
  -h | --help) usage; exit 0 ;;
  *) printf 'lock-refresh: unknown option %s\n' "$1" >&2; usage >&2; exit 2 ;;
esac

registry="$(pnpm config get @manablox:registry "${args[@]}" 2>/dev/null || true)"
case "$registry" in '' | undefined) registry="$(pnpm config get registry)" ;; esac
printf 'lock-refresh: resolving @manablox/* against %s\n' "$registry"

pnpm cache delete '@manablox/*' "${args[@]}" >/dev/null
CI=true pnpm update --recursive --lockfile-only --no-save '@manablox/*' "${args[@]}"
printf 'lock-refresh: done; review and commit pnpm-lock.yaml\n'
