# syntax=docker/dockerfile:1.7

# The production image: the site built to plain files, served by nginx.
#
#   pnpm docker:build                       ghcr.io/manablox/dev-docs:<version>
#   docker run --rm -p 3004:80 ghcr.io/manablox/dev-docs:0.50.0
#
# `@manablox/*` comes from npmjs. `MANABLOX_REGISTRY` points the install at another registry
# for that scope, such as the CMS development stack's Verdaccio; scripts/docker-build.sh
# passes it, with the host network, when `.npmrc` names one.
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
# `CI` keeps pnpm non-interactive; the build needs no telemetry.
ENV CI=true ASTRO_TELEMETRY_DISABLED=1

# The site needs its runtime dependencies only: Astro, Starlight and the theme. The dev
# dependencies (the CMS packages the reference pages are generated from, the checkers)
# stay out.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
ARG MANABLOX_REGISTRY
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod \
      ${MANABLOX_REGISTRY:+--config.@manablox:registry=$MANABLOX_REGISTRY}

# No tsconfig.json: it extends a dev dependency, and the build needs no type information.
COPY astro.config.mjs ./
COPY src ./src
COPY public ./public
COPY docs ./docs
# Absolute URLs (canonical links, the sitemap) need the deployed origin at build time;
# unset, the site builds for https://dev.manablox.io at `/`.
ARG DOCS_SITE_URL
ARG DOCS_BASE_PATH
RUN for name in DOCS_SITE_URL DOCS_BASE_PATH; do \
      eval "[ -n \"\$$name\" ]" || unset "$name"; \
    done \
 && pnpm build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
