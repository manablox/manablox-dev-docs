#!/usr/bin/env bash
# Build the production image from docker/Dockerfile: the site built to static files,
# served by nginx. Named <prefix>/dev-docs:<tag>, ghcr.io/manablox/dev-docs:0.50.0 by
# default - the name the release workflow pushes. CI builds with the docker actions
# instead, for the layer cache; the Dockerfile is the same.
#
# With a local registry for `@manablox/*` in `.npmrc` (the CMS development stack's
# Verdaccio, see README.md), the build installs from it over the host network.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
cd "$ROOT"

prefix="${IMAGE_PREFIX:-ghcr.io/manablox}"
tag=""
push=false
registry=""

usage() {
  cat <<'USAGE'
Usage: scripts/docker-build.sh [options]

  --tag <tag>        image tag (default: the version in package.json, e.g. 0.50.0)
  --prefix <name>    registry and namespace (default: $IMAGE_PREFIX or ghcr.io/manablox)
  --registry <url>   where `@manablox/*` installs from (default: the `@manablox:registry`
                     of .npmrc, else npmjs)
  --push             push the image after building it (log in to the registry first)
  -h, --help         this message

Build arguments DOCS_SITE_URL and DOCS_BASE_PATH are taken from the environment.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) tag="${2:?--tag needs a tag}"; shift ;;
    --prefix) prefix="${2:?--prefix needs a name}"; shift ;;
    --registry) registry="${2:?--registry needs a URL}"; shift ;;
    --push) push=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage_error "unknown argument '$1'" ;;
  esac
  shift
done

if [ -z "$tag" ]; then
  tag="$(sed -nE 's/^  "version": "([^"]+)",?$/\1/p' package.json | head -n1)"
  [ -n "$tag" ] || die "could not read the version from package.json; pass --tag"
fi
if [ -z "$registry" ] && [ -f .npmrc ]; then
  registry="$(sed -nE 's/^@manablox:registry=(.+)$/\1/p' .npmrc | head -n1)"
fi

require_docker

args=()
if [ -n "$registry" ]; then
  log "installing @manablox/* from $registry"
  # The local registry listens on the host's loopback, which only the host network reaches.
  args+=(--network host --build-arg "MANABLOX_REGISTRY=$registry")
fi
for name in DOCS_SITE_URL DOCS_BASE_PATH; do
  if [ -n "${!name:-}" ]; then args+=(--build-arg "$name=${!name}"); fi
done

name="$prefix/dev-docs:$tag"
log "building $name from docker/Dockerfile"
DOCKER_BUILDKIT=1 docker build \
  --file docker/Dockerfile \
  --tag "$name" \
  --label "org.opencontainers.image.source=https://github.com/manablox/manablox-dev-docs" \
  --label "org.opencontainers.image.version=$tag" \
  "${args[@]}" \
  .

if [ "$push" = true ]; then
  log "pushing $name"
  docker push "$name"
fi

log "built: $name"
