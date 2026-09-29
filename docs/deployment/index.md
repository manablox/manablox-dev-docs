---
title: 'Production stack'
description: 'The two ways to run Manablox in production, the compose file of the CMS images, the environment it needs, and the published images.'
---

There are two ways to run Manablox in production:

- **A project of your own**, written by `manablox create --preset docker`. It has its own
  Dockerfile and compose file with exactly the plugins you picked, premium ones included,
  and a proxy in front. This is the usual way; see
  [Use it as a dependency](../getting-started/as-a-dependency.md#the-short-way-manablox-create).
- **The published CMS images**, `ghcr.io/manablox/cms-api` and `ghcr.io/manablox/cms-admin`,
  with the compose file of the CMS repository (`docker/compose.yml` in
  [manablox-cms](https://github.com/manablox/manablox-cms)). They carry the core and the
  free plugins: fields, workflows, webhooks and the license plugin. The premium plugins are
  not in them; an instance that needs the website or AI plugin is a project of its own.

The rest of this page describes the second. The environment variables are the same in
both, because every config reads them the same way.

```sh
cd docker                    # in a checkout of manablox-cms
# docker/.env: the passwords, AUTH_SECRET, PUBLIC_URL, PUBLIC_API_URL, CORS_ORIGINS
IMAGE_PREFIX=ghcr.io/manablox IMAGE_TAG=0.50.0 docker compose pull
IMAGE_PREFIX=ghcr.io/manablox IMAGE_TAG=0.50.0 docker compose up -d
```

Without `IMAGE_PREFIX` compose builds the images from the checkout instead. Compose
brings up Postgres 18, Valkey, a one-shot `migrate` service, the management API, the
public API and the admin. To run on SQLite instead, drop the `postgres` service, set
`DATABASE_URL=file:/data/db/manablox.db` and mount one volume at `/data/db` into
`migrate` and both APIs; see [Database](../configuration/database.md). Every hostname,
secret and origin comes from the environment; nothing is baked into an image. The
variables are listed in [Environment variables](../configuration/environment.md); the ones
a production instance must set are `POSTGRES_PASSWORD`, `DATABASE_OWNER_PASSWORD`,
`DATABASE_APP_PASSWORD`, `AUTH_SECRET`, `PUBLIC_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS`, and
for the public API the space it serves (`PUBLIC_SPACE`, passed on as `MANABLOX_SPACE`).

Postgres runs with two roles: `manablox_owner` owns the schema and runs the migrations,
`manablox_app` is what the CMS logs in as and cannot change tables or delete audit
entries. An init script creates both on the first start; to split a database that runs
with one role, see [Database roles](./database-roles.md#moving-from-one-role-to-two).

| Service | What | Port on the host |
| --- | --- | --- |
| `postgres` | Postgres 18 | internal |
| `valkey` | The shared cache and job queue | internal |
| `migrate` | One-shot: applies the migrations as the owner role, grants the app role, then exits; both APIs wait for it | none |
| `api` | The management API (`cms-api`) | `API_PORT`, 3000 |
| `public-api` | The public API, same image, `node apps/public-api/dist/main.js`, listening on 3100 in the container | `PUBLIC_API_PORT`, 3001 |
| `admin` | The admin (`cms-admin`), static files behind nginx that proxies the management API to `api` | `ADMIN_PORT`, 3002 |

For the premium plugins, set `MANABLOX_LICENSE_KEYS` for the management API and let it
reach the license server over outbound HTTPS; see
[Premium plugin licenses](./licenses.md).

Put a TLS-terminating proxy or a CDN in front; the admin needs a secure origin for push
notifications and for framing a frontend in the visual editor. Your own website is not
part of this file: build it as its own image. See
[A Vite + Vue SSR frontend](../guides/vite-vue-ssr.md#step-10-production-build-and-a-docker-image),
and point it at `public-api`. Spaces designed in the admin are served by the site process
of the website plugin; see [Running the site process](../site/running.md) for its image,
its variables and HTTPS on the domains editors add.

## Images

Every Manablox repository builds its own images and pushes them to
`ghcr.io/manablox/<image>`, tagged with the version (`0.50.0`, `0.50`) and `latest`. See
[CI and releases](./releases.md).

| Image | Built in | Runtime | Port |
| --- | --- | --- | --- |
| `cms-api` | manablox-cms | Node 24, non-root; the management API, the public API and the migrations | 3000 |
| `cms-admin` | manablox-cms | nginx, the admin | 80 |
| `site` | manablox-plugin-website | Node 24; the site process of the website plugin | 3200 |
| `license-server` | manablox-license-portal | Node 24; the license server of the premium plugins | 3100 |
| `license-portal` | manablox-license-portal | nginx, the customer portal | 80 |
| `dev-docs` | manablox-dev-docs | nginx, these pages (dev.manablox.io) | 80 |
| `user-docs` | manablox-user-docs | nginx, the user guide (docs.manablox.io) | 80 |
| `website` | manablox-website | nginx, the marketing website | 80 |

- **`cms-api`** is built from `docker/Dockerfile.api` of the CMS repository in stages: the build stage builds the two API apps and the packages they use to `dist` with tsdown and points each package at its `dist`, as the npm tarballs do. The runtime layer holds a production-only install plus that built code, runs `node apps/api/dist/main.js` as a non-root user, carries no sources, tsx or other build tooling, and declares a `HEALTHCHECK` against `/readyz`. The `public-api` service runs `node apps/public-api/dist/main.js` from the same image and the `migrate` service `node apps/api/dist/migrate.js`: one image, three entrypoints. The management API loads fields, the license plugin, workflows and webhooks; switch a feature off per instance or space with its `features.plugins.<id>` control. The public API loads only the field types.
- **`cms-admin`**: the admin SPA with a history fallback. Hashed assets are immutable; `index.html` is never cached, so a deploy cannot pin clients to a stale bundle. The build's `.gz` copies are sent as they are (`gzip_static`); everything else is compressed on the fly. The admin calls the management API on its own origin, so nginx proxies it to `MANAGEMENT_API_URL` (default `http://api:3000`, an origin without a path or trailing slash; nginx fills it in when the container starts): `/rpc`, `/api`, `/media`, `/upload`, `/transfer`, `/realtime` (the live event stream, unbuffered, with WebSocket upgrades passed through), `/plugins` (plugin server routes) and `/admin/plugins.json` with `/admin/plugins/` (the [admin plugin](../extending/admin-plugins.md) bundles). Request bodies pass through unbuffered and without an nginx size limit; the API enforces its own. nginx sends `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host`, so add the admin container to `TRUSTED_PROXIES` for client addresses (see [Client addresses](./operations.md#client-addresses)), and keep the admin's origin in `CORS_ORIGINS`. Set `MANAGEMENT_API_URL` when the management API is not the compose service `api`, for example `docker run -e MANAGEMENT_API_URL=http://cms.internal:3000 ghcr.io/manablox/cms-admin:0.50.0`. While the API is unreachable nginx answers 502 on those paths.
- **`site`**: the site process of the website plugin; see [Running the site process](../site/running.md).
- **`license-server`** and **`license-portal`**: the license server of the premium plugins and its customer portal, not part of an instance. See [Premium plugin licenses](./licenses.md#the-license-server).
- **`dev-docs`**, **`user-docs`** and **`website`**: static sites behind nginx. They talk to no Manablox instance. The site URL and base path are build arguments (for these pages `DOCS_SITE_URL` and `DOCS_BASE_PATH`); they only reach canonical links and the sitemap.

In a checkout of the CMS repository, `pnpm docker:build` builds its two images:

```sh
pnpm docker:build                        # ghcr.io/manablox/cms-api:0.50.0 and ghcr.io/manablox/cms-admin:0.50.0
pnpm docker:build --tag test admin       # one image, another tag
pnpm docker:build --prefix my.registry/me --push
```

The other repositories have the same `pnpm docker:build` for theirs.

Scaling by role, health checks, backups and the security checklist are in
[Operations](./operations.md); how the images and the npm packages are published is in
[CI and releases](./releases.md).
