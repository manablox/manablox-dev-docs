---
title: 'The public API'
description: 'A hardened instance that serves published content from one space.'
---

A second instance of the same image, serving **published content from one space**, with
no management surface and no draft code path. This is the instance a website reads from;
in a project from `manablox create` it is <http://localhost:3100>.

```sh
pnpm dev:public          # manablox start --watch --config manablox.public.config.ts
curl http://localhost:3100/
```

```json
{
  "name": "Manablox Public API",
  "version": "1.0.0",
  "space": "5e2c...",
  "surfaces": { "graphql": "/graphql", "rest": "/v1", "openapi": "/openapi.json", "media": "/media/{assetId}/{variant}" }
}
```

## Why an instance and not a flag

Which surfaces a process mounts is a config decision, so the public API needs no second
codebase. `manablox.public.config.ts` is a locked configuration of the same packages, and
`manablox start` boots it with the same `bootstrap()` and `createApp()`: every package,
router and migration is shared with the management instance.

What it does *not* share is the draft read path. `server.mode: 'public'` is not a scope
list: it changes how the app is assembled, so the hardening is structural rather than a
guard that runs per request.

## Surfaces

| Path | Scope | What |
| --- | --- | --- |
| `GET /` | | Service document |
| `/graphql` | `graphql` | The generated delivery schema, minus `spaceId` arguments |
| `/v1/*` | `delivery` | Read-only REST. See below |
| `/openapi.json` | `delivery` | OpenAPI for `/v1`, generated from the same definition |
| `/media/{id}/{variant}` | `media` | Originals and signed transforms |
| `/healthz`, `/readyz` | | Liveness and readiness |

Anything else is a 404: no `/rpc`, no `/api/v1`, no `/api/auth`, no `POST /upload`.

### Scopes

Media reads and uploads are separate scopes, so a process can serve published reads plus
images without accepting uploads:

| Scope | Mounts |
| --- | --- |
| `rpc` | `/rpc/*`, `/api/v1/*`, management `/openapi.json` |
| `auth` | `/api/auth/*` |
| `uploads` | `POST /upload/:spaceId` |
| `media` | `GET /media/...` |
| `graphql` | `/graphql` |
| `delivery` | `/v1/*` and the public `/openapi.json` |

Presets: management is `['rpc', 'auth', 'uploads', 'media', 'graphql']`, public is
`['graphql', 'media', 'delivery']`.

## What public mode changes

| Concern | Public mode |
| --- | --- |
| **Space** | Pinned from `publicApi.spaceId` or `publicApi.spaceMachineName`, resolved once at boot. `x-manablox-space` is not read, and the `spaceId` argument is removed from the schema. The GraphQL schema is built from the pinned space's content types alone, so another tenant's model is not even described. Lookups by id are bounded to the pinned space, so an id from another tenant does not resolve. |
| **Preview** | Not compiled in. No header is read, no session or API-key lookup happens on any request, and the loaders are constructed published-only. |
| **Assets** | Scoped to the space *and* to assets reachable from published content. |
| **Introspection** | Off unless `publicApi.introspection` is explicitly `true`. |
| **Limits** | Depth 8, complexity 1000 by default. |
| **CORS** | `origin: '*'`, `credentials: false`, `GET, POST, OPTIONS`. |
| **Rate limit** | Keyed on client IP, not `x-api-key`. |
| **Errors** | Unexpected errors always masked, whatever `NODE_ENV` says; keys are kept. |
| **Mutations** | The delivery schema has none, and the instance **refuses to boot** if a plugin adds one. |
| **Caching** | Read-through response cache plus `ETag` and `Cache-Control`. |

Presenting a session cookie or an API key changes **nothing**. That is asserted by a test
([`packages/server/test/app.test.ts`](https://github.com/manablox/manablox-cms/blob/main/packages/server/test/app.test.ts)
in the CMS repository), not merely intended.

### Which space a request reads

Each request reads exactly one space; nothing in a request can name another one.

- **Pinned:** `publicApi.spaceId` or `publicApi.spaceMachineName` (`MANABLOX_SPACE_ID`, `MANABLOX_SPACE`) pins the instance to one space on every host. A pin that names a missing space refuses to start.
- **By host:** without a pin, the `Host` header picks the space from its API hosts. A space gets them in the admin under **Settings > API hosts**, or through the control API (`POST /spaces` with `apiHosts`, `PUT /spaces/{id}/api-hosts`). One public process then serves every space of the instance: point `api.shop-a.example` and `api.shop-b.example` at it, and each answers with its own space. Once any API host exists, a request on any other host answers 404 `publicApi.host.unknown`; `/healthz` and `/readyz` answer on every host.
- **The only space:** while the instance has no API host at all, the only ready space is picked once, logged and kept, like a pin. With several spaces (or none) the instance logs a warning and answers 503 `publicApi.space.unresolved` until exactly one exists; it checks again at most every ten seconds.

Each API host belongs to one environment of its space: production, or a staging copy
(see [Environments](../admin/environments.md)). A staging host reads that environment's
documents, content types and menus, its answers carry `X-Robots-Tag: noindex, nofollow`,
and its cache entries are its own. While the space's `environments` feature is off, a
staging host answers 404 `publicApi.host.unknown`; production hosts are not affected. A
pinned instance reads production. Requests to a staging host count toward the space's
usage like any other.

Everything after the lookup uses the space it found: feature flags (`graphqlDelivery`,
`restDelivery`), usage limits, `request:served` metering, the `delivery.space` rate limit,
the per-space GraphQL depth and complexity, and the response cache, whose keys start with
the space id, so two hosts never share an entry.

Host lookups are cached in the shared cache under the tag `api-hosts` for `CACHE_TTL`
seconds, and adding, removing or verifying a host purges them. With `REDIS_URL` every
process sees a change at once; without it, another process sees it once its entry expires.
With `domains.requireVerification` on, a host serves only after its DNS record is found; see
[Custom domain verification](../configuration/controls.md#custom-domain-verification).

DNS: give each API host an `A`/`AAAA` record or a `CNAME` to the proxy in front of the
public API, and have the proxy pass the original `Host` header. With on-demand TLS, only ask
for certificates for names you know; API hosts are listed by `GET /control/v1/spaces`.

## REST and GraphQL

The REST surface (`/v1`) and the delivery GraphQL schema are documented on their own
pages: [REST](./rest.md) and [GraphQL](./graphql.md). One oRPC definition yields the
REST routes, the OpenAPI document and the SDK's types; GraphQL and REST share the query
builder and loaders, so they cannot disagree about what is visible.

## Caching

The public instance caches responses, tags each entry with what it read, purges on
publish, and serves `ETag` and `s-maxage` for a CDN. See [Caching](./caching.md), and
**set `REDIS_URL` on both instances**, or a publish on the management instance cannot
invalidate the public instance's cache.

## Content types saved in the admin

Each process keeps the content types in memory, read at boot. A save in the admin
reloads the management instance and fires `registry:afterReload`; `@manablox/cache`
then tells every other process on the database to reload too, so the public instance
serves the new type without a restart:

- With `REDIS_URL`, the process that saved publishes on the `manablox:registry` channel and the others reload at once. A process that was disconnected from Redis reloads when it reconnects, because it may have missed an announcement.
- Without it, each process compares a fingerprint of the `content_types` table (ids and `updated_at`) every `CACHE_SYNC_INTERVAL` seconds, 5 by default, and reloads when it changed. `0` turns the check off.

A reload bumps the registry's schema version, so the GraphQL schema is rebuilt on the
next request. Until a process has reloaded, it answers `contentType.notFound` for
documents of the new type.

## Asset exposure

Assets have no draft/published state of their own, so the public API serves an asset only
where a published document references it.

`asset_usages` records which documents reference which assets, and whether the
**published projection** does. It is maintained from the `content:afterPublish`,
`afterUnpublishMany` and `afterDeleteMany` hooks, using the references each
field type already declares via `references()`, so a plugin's own field type
participates without knowing the table exists.

The distinction that matters: editing a draft to remove an image does **not** revoke it
while the live page still shows it. Only publishing or unpublishing changes what is
public.

Space imports record the usages of the documents they write, and environment copies and
promotes carry them over.

## Persisted operations

Optional allowlist mode. With a manifest configured, only known query hashes execute:

```ts
publicApi: {
  persistedOperations: { manifest: await import('./queries.json'), rejectUnknown: true },
}
```

Accepts `documentId` or the APQ-shaped `extensions.persistedQuery.sha256Hash`. Unknown
hashes are **logged before they are rejected**, so a manifest lagging a deploy is visible
rather than a wall of 400s. The refusals carry the keys `graphql.persisted.required` and
`graphql.persisted.notFound`; see [GraphQL](./graphql.md#errors-and-http-status). Off by
default.

## Deployment

The production compose file runs the `public-api` service from the same image as the
API. See [Deployment](../deployment/index.md).

### A read-only database role

The last line of defence if any of the above is ever bypassed. The public instance only
reads:

```sql
create role manablox_public login password '...';
grant connect on database manablox to manablox_public;
grant usage on schema public to manablox_public;
grant select on all tables in schema public to manablox_public;
alter default privileges in schema public grant select on tables to manablox_public;
```

Then set `PUBLIC_DATABASE_URL` for the `public-api` service. Note this makes the
migration runner a separate concern: run migrations as the owning role, from the
management instance.

SQLite has no roles. A public instance on SQLite opens the same file, with write access
to its folder because WAL mode needs it; public mode is what keeps it to reads.

### A CDN in front

```
CDN --> public-api --> Postgres (read-only role)
 |
 `-- honours s-maxage / stale-while-revalidate; purge on publish via the cache hook
```

`/media/{id}/{variant}` responses are `immutable` with a far-future max-age (a variant
key is content-addressed by preset), so they can be cached indefinitely.

### Environment

| Variable | Meaning |
| --- | --- |
| `PORT` | Defaults to 3100 |
| `MANABLOX_SPACE_ID` / `MANABLOX_SPACE` | The pinned space, by id or machine name |
| `GRAPHQL_INTROSPECTION` | `true` to enable; off otherwise |
| `GRAPHQL_MAX_DEPTH`, `GRAPHQL_MAX_COMPLEXITY` | Default 8 and 1000 |
| `CACHE_TTL` | `s-maxage`, in seconds. Default 300 |
| `CACHE_SYNC_INTERVAL` | Seconds between content type checks without `REDIS_URL`. Default 5, `0` turns it off |
| `RATE_LIMIT` | `off` to disable. 300 requests a minute per client address otherwise, shared across replicas when `REDIS_URL` is set |

The management entrypoint of the `cms-api` image becomes a public instance with two
variables, if you would rather not run a second entrypoint:

```yaml
api-delivery:
  environment: { SERVER_MODE: public, SCOPES: "graphql,media,delivery" }
```

The named entrypoint makes "run the public API" obvious in compose, in CI and to a reader.
