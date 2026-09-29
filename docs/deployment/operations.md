---
title: 'Operations'
description: 'Running an instance: scaling by role, health checks, backups and restores, moving data, and the security checklist.'
---

## Scaling by role

`SCOPES` selects which surfaces a process of the `cms-api` image mounts (`server.scopes` in a
config of your own), so one image scales by role:

```yaml
api-delivery:   { environment: { SCOPES: "graphql,media" } }            # cacheable reads
api-management: { environment: { SCOPES: "rpc,auth,uploads,media" } }
```

Media reads (`media`) and uploads (`uploads`) are separate scopes, which is what makes a
read-only replica possible: a replica can serve `/media/...` without mounting
`POST /upload/:spaceId`.

For a hardened, published-only, single-space endpoint, run the **public API** instead of
a scope-limited replica: it removes the draft read path rather than leaving it mounted
and unreachable. See [The public API](../delivery/public-api.md). Several public
instances (one per space, or several behind a load balancer) share the image, the
database and the cache.

The **site process** of [designed sites](../site/index.md) scales the same way: every
replica serves every space and domain, reads through a read-only role, and needs the shared
`REDIS_URL` so a publish on the management API purges its pages. See
[Running the site process](../site/running.md#scaling).

Whatever the topology, **every process needs the same `REDIS_URL`**: it is what carries
a cache purge from the process that published to the ones that serve, and it is also
where the rate limiter counts. Without it each replica keeps its own counters, so a
limit of 300 requests a minute becomes 300 per replica; with it they share one budget.
A Redis the limiter cannot reach lets requests through and logs a warning rather than
refusing them. See [Caching](../delivery/caching.md). The rules the limiter applies, and how
the control API changes them per space, are listed under
[Rate limits](../configuration/controls.md#rate-limits).

### Which Redis or Valkey

Any Valkey release (7.2 and later) works, as does **Redis 5.0 or later**; 6.2 or later is
recommended. The floor comes from two places: the cache files an entry under its tags in a
Lua script that reads the server clock (`TIME`) before writing, which Redis only allows
from 5.0 on, and the job queue (BullMQ) refuses to start on anything older than 5.0 and
warns below 6.2. Nothing else needs a newer version. A managed Redis that disables Lua
scripting or pub/sub cannot be used: purges, rate limits and the job queue rely on both.
Each process holds two connections (`manablox:command` for every command, `manablox:subscriber`
for every channel it listens on) plus the job queue's own (`manablox:jobs` and BullMQ's
worker connections). Keys are prefixed with `manablox:`, so a shared server works, but the job queue needs
`maxmemory-policy noeviction` (BullMQ warns at start otherwise); every cache entry carries
a TTL, so the cache expires rather than fills memory.

## Client addresses

Rate limits per address, sign-in backoff and the control API allowlist
(`CONTROL_API_ALLOWED_IPS`) all read the client address the same way. Which headers they
believe depends on `TRUSTED_PROXIES` (`server.trustedProxies` in the config file), a
comma-separated list of addresses and CIDR ranges of your proxies, IPv4 or IPv6:

| `TRUSTED_PROXIES` | Client address |
| --- | --- |
| Unset | `cf-connecting-ip`, else the first `x-forwarded-for` entry, else `x-real-ip`, else the socket address. Any client can send these headers, so a client that talks to the process directly can pick its own address. A production process logs a warning once at start |
| A list, e.g. `10.0.0.0/8,172.16.0.0/12` | The headers only when the socket peer is in the list. `x-forwarded-for` is read from the right, skipping the proxies in the list, so a forged first entry is ignored. Any other peer is taken by its socket address |
| `none` | The socket address; no header is believed |

Unset trusts the headers, so an instance behind a proxy works without it. Set it whenever clients can reach the process without
passing your proxy, and to `none` when there is no proxy at all. Behind Cloudflare list
Cloudflare's published ranges, or the address of the proxy that connects to the process. A
malformed entry stops the start with `config.server.trustedProxyInvalid`.

## Maintenance jobs

The management instance runs housekeeping on a schedule: expired API keys are deleted
every hour, and workflow runs beyond the newest two hundred per workflow every ten
minutes. With `REDIS_URL` these are repeatable jobs on the shared queue, so one worker
runs each of them however many management replicas there are, and a restart does not add
a second schedule. Without it each management process runs them on its own timer. Public
instances run no maintenance.

## Health

- `GET /healthz`: liveness. Touches nothing.
- `GET /readyz`: readiness: checks the database and reports the registry's schema version.

The API image declares a `HEALTHCHECK` against `/readyz`. A public instance with no
space to serve (none pinned, no API hosts and not exactly one space) starts anyway, logs a
warning and answers every request except `/healthz` with 503 `publicApi.space.unresolved`,
so it reports unhealthy. The 503 carries the public CORS headers, so a browser sees the
error body. It retries at most every ten seconds and serves the space once exactly one
exists. Once spaces have API hosts, `/readyz` answers on any host, while other paths on an
unknown host answer 404 `publicApi.host.unknown`; see
[Which space a request reads](../delivery/public-api.md#which-space-a-request-reads). A
pinned space that does not exist still stops the boot.

## Migrations

The API processes never migrate. In the production compose file the one-shot `migrate`
service runs them from the API image (`node apps/api/dist/migrate.js`, `manablox migrate`
with the instance's plugins) as the owning role and exits. `api` and
`public-api` start only after it completed successfully, so a failing migration stops the
deploy before a request can hit a stale schema. On a schema that is already current it
finishes in a moment, so every `docker compose up -d` runs it.

To migrate without restarting anything:

```sh
docker compose run --rm migrate
```

The public API connects with its own, possibly read-only, `PUBLIC_DATABASE_URL` and
never touches the schema. Scaling `api` to several replicas is safe: only `migrate`
changes the schema, once per `up`.

## Backups

`contents` and `published_contents` are derivable from `content_versions` plus
`content_types`, but back up the whole database. On Postgres:

```sh
docker compose exec postgres pg_dump -U manablox -Fc manablox > backup.dump
docker compose exec -T postgres pg_restore -U manablox -d manablox --clean < backup.dump
```

On SQLite, `manablox backup` writes a consistent copy while the instance runs. To
restore, stop every process that opens the database, replace the file, delete the
`-wal` and `-shm` files beside it, and start again:

```sh
manablox backup backups/manablox-$(date +%F).db
```

Uploaded files live in the `uploads` volume (local driver) or your bucket (S3). Image
variants regenerate on demand and need no backup.

To move **one space** to another instance rather than restore a whole database, use the
space export in [Moving a space](../admin/transfer.md). It carries the space's settings
and whichever of its content types, documents, document history, asset records, menus,
roles, workflows and webhooks you tick, and, as a zip archive, the asset files
themselves.

## Secrets

`AUTH_SECRET` signs sessions and media transform URLs. Rotating it signs everyone out
and invalidates every variant URL a CDN holds; set `MEDIA_SIGNING_SECRET` separately if
the two should rotate independently. The VAPID keys for push notifications must not
change once browsers have subscribed.

## Logs

Structured JSON on stdout (pino), one line per request with the request id, method,
path, status, duration and the number of database statements. `LOG_LEVEL=debug` adds
the rest.

The console is one destination among several. `LOG_FILE` adds a file, `LOG_HTTP_URL`
posts batches to a collector, and a plugin can register a provider's own adapter; each
destination carries its own level. See [Logging](../configuration/logging.md).

## Security checklist

What each item is defending against, and what the instance does on its own, is in
[Security](./security.md).

- Set a long random `AUTH_SECRET`; it also signs media transform URLs.
- Create the first account before exposing the instance: sign-up closes after it.
- Restrict `CORS_ORIGINS` on the management API to the admin and the frontends that fetch from it in the browser.
- Serve the admin and the management API over `https`; push notifications and the visual editor's framing need a secure origin.
- Point websites at a public instance, never at the management API.
- Set `GRAPHQL_MAX_DEPTH` to the shallowest value your queries need.
- Turn introspection off in production (it is off automatically when `NODE_ENV=production`, and off by default on a public instance).
- Issue an API key per consumer and revoke individually rather than sharing one.
- Restrict each key to the spaces and permissions it needs. A restriction binds a superadmin's key too. See [API keys](../admin/api-keys.md).
- Give the public instance a read-only database role. See [The public API](../delivery/public-api.md#a-read-only-database-role).
