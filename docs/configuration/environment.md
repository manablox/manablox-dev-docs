---
title: 'Environment variables'
description: 'Every variable the configs of manablox create and the helpers of @manablox/core read, grouped by what it controls, with defaults.'
---

The configs `manablox create` writes, and the `*FromEnv()` helpers of `@manablox/core` they
call, read these. No hostname is hardcoded anywhere: a new local project runs on the
defaults, and production sets the ones marked required.

The `manablox` CLI loads the `.env` next to the config before it evaluates it; a variable
already set in the shell wins over the file. `.env.example` beside it lists every variable
the project reads.

## Required

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | The database: `postgres://user:pass@host:5432/manablox` for Postgres, `file:./data/manablox.db` for SQLite. See [Database](./database.md) |
| `AUTH_SECRET` | Signs sessions and media transform URLs. A long random string; changing it logs everyone out and invalidates every image URL a CDN holds |

## Server

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `PORT` | `3000` | Port of the management instance. The public instance reads `PUBLIC_PORT` (`3100`) |
| `PUBLIC_URL` | `http://localhost:3000` | The origin the management API is reached at. Used for absolute asset URLs and auth callbacks. The public instance reads `PUBLIC_API_URL` (`http://localhost:3100`) |
| `CORS_ORIGINS` | none | Comma-separated browser origins allowed to call the management API: any frontend that fetches from it in the browser, and the admin when another origin serves it. The admin served by the management process is same-origin and needs no entry. The public API allows every origin |
| `ADMIN_URL` | `PUBLIC_URL` | Where the admin is served from, for links in workflow mails, notifications and password reset mails |
| `SCOPES` | by mode | The `cms-api` image, and a config that calls `envScopes()`: which surfaces this process mounts, `rpc,auth,uploads,media,graphql` or `graphql,media,delivery`. `control` is in no preset and must be named. The configs `manablox create` writes set `server.scopes` in the file instead. See [The config file](./index.md#one-image-two-modes) |
| `SERVER_MODE` | `management` | The `cms-api` image, and a config that calls `envServerMode()`: `management`, `public` or a plugin's mode, such as `website` from the website plugin. A created project picks the mode per config file, or with `manablox start --mode` |
| `TRUSTED_PROXIES` | | Every config without `server.trustedProxies`: comma-separated addresses and CIDR ranges of the proxies whose client-IP headers are believed, or `none`. Unset believes every peer. See [Client addresses](../deployment/operations.md#client-addresses) |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`. More destinations than the console in [Logging](./logging.md) |
| `NODE_ENV` | | `production` turns GraphQL introspection off on the management API |
| `DB_POOL_MAX` | `10` | Connection pool size |
| `DATABASE_AUTH_TOKEN` | | Turso auth token, for a `libsql://` database URL |
| `MIGRATION_DATABASE_URL` | | Postgres only: the owner role that runs the migrations and grants the role of `DATABASE_URL` its rights. Unset, one role does both and a production management process warns at start; SQLite ignores it. See [Database roles](../deployment/database-roles.md) |

## Storage and media

Detailed in [Storage and media](./storage-and-media.md).

| Variable | Default | Purpose |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `STORAGE_LOCAL_PATH` | `./data/uploads` | Where the local driver writes |
| `STORAGE_LOCAL_PUBLIC_URL` | | Optional: a public origin that serves the local directory, so originals skip the API |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | | Required with the S3 driver |
| `S3_ENDPOINT`, `S3_REGION`, `S3_PUBLIC_URL` | | Optional: a non-AWS endpoint (MinIO), the region, and a public origin to serve originals from directly |
| `FILE_MAX_SIZE_MB` | `25` | Largest upload |
| `ALLOWED_MIME_TYPES` | every image, video, audio and text type, PDF, RTF, and Word, Excel, PowerPoint and OpenDocument files, WOFF and WOFF2 fonts | Comma-separated exact types or families with a trailing slash (`image/`) |
| `MEDIA_SIGNING_SECRET` | `AUTH_SECRET` | Signs transform URLs, if you want a secret separate from auth |
| `MEDIA_CACHE_PATH` | `./data/media-cache` | Where rendered image variants are cached on disk |

## Cache and jobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `REDIS_URL` | | Valkey/Redis. Enables the shared response cache and the job queue (webhooks, workflows, eager variants). **Set it on both instances** in production; see [Caching](../delivery/caching.md) |
| `CACHE_ENABLED` | `true` | `false` turns the cache layers off: the delivery response cache and the lookups each process keeps for seconds (hosts, spaces). The resolved controls stay cached. See [Caching](../delivery/caching.md#turning-caching-off) |
| `CACHE_TTL` | `60` (`300` for the public API) | Seconds a delivery response is cached and the `s-maxage` it is served with |
| `CACHE_SYNC_INTERVAL` | `5` | Without `REDIS_URL`, seconds between checks for content types another process saved. `0` turns the check off. See [The public API](../delivery/public-api.md#content-types-saved-in-the-admin) |

## GraphQL

| Variable | Default | Purpose |
| --- | --- | --- |
| `GRAPHQL_MAX_DEPTH` | `12` (`8` public) | Deepest query accepted. The schema is cyclic, so a limit is needed |
| `GRAPHQL_MAX_COMPLEXITY` | `5000` (`1000` public) | Complexity budget per query |
| `GRAPHQL_INTROSPECTION` | `false` | Public API only: explicit opt-in. The management API follows `NODE_ENV` |

## Public API

| Variable | Default | Purpose |
| --- | --- | --- |
| `MANABLOX_SPACE` | | Technical name of the one space this instance serves. Without a pin the instance serves spaces by their API hosts; see [The public API](../delivery/public-api.md#which-space-a-request-reads) |
| `MANABLOX_SPACE_ID` | | The same, by id. Takes precedence |
| `RATE_LIMIT` | on | `off` disables the per-IP limit |

With exactly one space in the database both may be left unset; the instance pins it and
says so in the log. See [The public API](../delivery/public-api.md).

## Designed sites

Read by the website plugin's configs (`websitePlugin` in `manablox.plugins.ts`, `websiteProcessConfig` for the site process).

| Variable | Default | Purpose |
| --- | --- | --- |
| `SITE_URL` | | Management API: the site process origin, which the admin frames for the design canvas and adds to a restricted `frame-src`. Without it the admin uses the space's primary domain |
| `SITE_FORMS_SECRET` | | Management API and site process, the same value: at least 16 characters. Turns on form submissions from designed sites. Generate one with `openssl rand -hex 32` |
| `SITE_FORMS_API_URL` | | Site process: the management API origin form submissions are forwarded to, e.g. `http://api:3000` |
| `SITE_EDITOR_ORIGIN` | | Site process: comma-separated admin origins allowed to frame the design canvas |

The site process also reads `HOST`, `PORT` (3200), `PUBLIC_URL`, `CACHE_TTL` (300) and
`RATE_LIMIT`. See [Running the site process](../site/running.md#environment).

## Control API

The control API is the HTTP API an external layer (a hosting or billing system) uses to set
feature flags, limits and space groups. It is mounted only when the process names the
`control` scope in `SCOPES` and a key is set. See [Control API](../reference/control-api.md).

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONTROL_API_KEY` | | The bearer key. Required when `SCOPES` names `control`; the process refuses to start without it. Generate one with `openssl rand -hex 32` |
| `CONTROL_API_KEY_NEXT` | | A second valid key, for rotation. Both keys work while it is set |
| `CONTROL_API_ALLOWED_IPS` | any | Comma-separated client IPs or CIDR ranges, e.g. `10.0.0.0/8,2001:db8::/32`. Other clients get 403 |
| `CONTROL_PROVISIONED` | `false` | `true` when the control API creates the accounts: sign-up is closed, the admin shows no install wizard and no account becomes superadmin on its own. Set it on every process of a provisioned instance. The instance also counts as provisioned once `POST /users/owner` created the owner |
| `USAGE_REQUEST_LOG` | `false` | `true` logs every request counted as usage at info level, with its space, bytes and cache state. Usage is counted either way. See [Usage](../reference/control-api.md#usage) |
| `CONTROL_WEBHOOK_URL` | | Where control events are pushed, an `http` or `https` URL. Needs `CONTROL_WEBHOOK_SECRET`; the process refuses to start without it. See [Events](../reference/control-api.md#events) |
| `CONTROL_WEBHOOK_SECRET` | | The key the pushes are signed with (`X-Manablox-Signature`). Generate one with `openssl rand -hex 32` |
| `DOMAIN_CNAME_TARGET` | | Management API: a host name custom domains and API hosts may `CNAME` to instead of adding the `_manablox.<host>` TXT record, e.g. your proxy's name. Shown in the admin only when set. See [Custom domain verification](./controls.md#custom-domain-verification) |

## Mail

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAIL_DRIVER` | `smtp` when `SMTP_URL` is set, `none` otherwise | `smtp`, `mailpit`, `gmail`, `microsoft`, `resend`, `sendgrid`, `postmark`, `mailgun` or `none`. Without a driver the email action fails with `mail.notConfigured` |
| `MAIL_FROM` | the mailbox for `gmail` and `microsoft`, `Manablox <no-reply@localhost>` otherwise | The `From` header |

Each driver reads its own variables (`SMTP_HOST`, `MICROSOFT_TENANT_ID`, `RESEND_API_KEY`,
...). They are listed in [Mail](./mail.md).

## Push (workflows)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` | | Web Push keys. Generate once with `manablox push-keys` (`pnpm push-keys` in a created project) |
| `PUSH_VAPID_SUBJECT` | `mailto:admin@localhost` | Contact address push services may use |

What a workflow may reach and how much it may spend has no environment variable besides
`NET_ALLOW_PRIVATE_NETWORK`; it is the `net` section of the
[config file](./index.md) and the options of `workflowsPlugin()`, since these are limits an
operator sets once rather than per deployment. See
[Workflows](../admin/workflows.md#the-workflows-plugin).

## AI

Read by the AI plugin's config line (`aiPlugin({ allowedHosts: envList('AI_ALLOWED_HOSTS', []) })`
in the management config, see [The AI plugin](../admin/ai.md#the-ai-plugin)). Without the
plugin it does nothing.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_ALLOWED_HOSTS` | | Comma-separated hosts a self-hosted AI model may be reached at although they are on the private network: `ollama`, `localhost:11434`, `10.0.0.5:8000`. A host alone allows every port on it. A self-hosted model at a public address needs no entry. See [AI](../admin/ai.md#self-hosted-models) |

Provider keys are not environment variables: they are set per space under Settings > AI.
How often a rejected design is sent back to the model is the plugin's `designRetries`
option, 2 by default.

## Premium plugin licenses

Read by `licensePlugin()` (`@manablox/plugin-license`), which the website and AI plugins
require. The management API reads all four; the public API and the site process only
`MANABLOX_LICENSE_DEV_HOSTS`. Without the plugin they do nothing. See
[Premium plugin licenses](../deployment/licenses.md).

| Variable | Default | Purpose |
| --- | --- | --- |
| `MANABLOX_LICENSE_KEYS` | | License keys, comma separated. Secrets: keep them here, never in the config file. Optional on a development instance, where the premium plugins run without a key |
| `MANABLOX_LICENSE_SERVER` | `https://licenses.manablox.io/api` | The license server's API. The management worker needs outbound HTTPS to it |
| `MANABLOX_LICENSE_KIND` | `auto` | `auto`, `production` or `development`: how keys activate. `development` also makes the instance a development one whatever `NODE_ENV` says (its hostnames must still be private); `production` never counts as development |
| `MANABLOX_LICENSE_DEV_HOSTS` | | Preview hosts that count as private for a development instance, comma separated, `host` or `*.suffix` |

## The admin

The admin needs no variables of its own: the management process serves the prebuilt
bundle from `@manablox/admin` at `/` when `server.admin` is set. The separate admin image
(nginx) reads the address of the management API it proxies to; see
[Deployment](../deployment/index.md). The variables of the CMS repository's own
development stack and test suites are described in [Contributing](../reference/contributing.md).
