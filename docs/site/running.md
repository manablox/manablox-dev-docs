---
title: 'Running the site process'
description: 'Configuring and deploying the site process: config options, environment variables, the compose service, HTTPS for every domain with Caddy, scaling, and the read-only database role.'
---

The site process is `@manablox/server` in the `website` mode, which the website plugin
(`websitePlugin` from `@manablox/plugin-website`) declares. In a project made with
`manablox create --website` it is `manablox.site.config.ts` on port 3200, started with:

```sh
manablox start --config manablox.site.config.ts   # pnpm dev:site / pnpm start:site in the project
```

`manablox start --mode website` overrides `server.mode` of whichever config it loads.

## The config

```ts
import { databaseConfigFromEnv, defineConfig, requireEnv } from '@manablox/core';
import { websitePlugin } from '@manablox/plugin-website';

export default defineConfig({
  database: databaseConfigFromEnv({ urlVar: 'PUBLIC_DATABASE_URL' }),
  server: {
    port: 3200,
    publicUrl: 'https://www.example.com',
    mode: 'website',
    rateLimit: { window: 60_000, max: 1200 },
  },
  auth: { secret: requireEnv('AUTH_SECRET') },
  plugins: [
    websitePlugin({
      editorOrigin: ['https://cms.example.com'],
      cacheTtl: 300,
      forms: { apiUrl: 'http://api:3000', secret: requireEnv('SITE_FORMS_SECRET') },
    }),
  ],
  // storage, media, cache, contentTypes and the other plugins: the same as the management instance
});
```

An entrypoint of your own can use the `./site` entry of the plugin package instead:
`websiteProcessConfig()` builds the whole config from the environment (below), with other
plugins passed as `{ plugins }` and plugin options as `{ website }`, and `runWebsite(config)`
starts it as `run(config, { mode: 'website' })`. This is what the `ghcr.io/manablox/site`
image runs:

```ts
import { manabloxFields } from '@manablox/fields';
import { licensePlugin } from '@manablox/plugin-license';
import { runWebsite, websiteProcessConfig } from '@manablox/plugin-website/site';

await runWebsite(websiteProcessConfig({ plugins: [manabloxFields(), licensePlugin()] }));
```

`licensePlugin()` belongs in every process that loads the website plugin, a premium plugin:
without a license designing locks, while the sites keep rendering.

| Option | Meaning |
| --- | --- |
| `server.mode` | `'website'`. Mounts the site surface and `/media`, masks errors and keys the rate limit by IP address (rule `plugins.website.ip`) |
| `server.scopes` | Leave it out: the mode mounts `media` next to its pages |
| `server.rateLimit` | Requests per window per IP. A page pulls its stylesheet, fonts, images and scripts, so the shipped configs allow 1200 a minute |
| `websitePlugin({ editorOrigin })` | One origin or a list: the admin origins that may frame the design canvas at `/_manablox/canvas`. None by default, and then the canvas answers 404 |
| `websitePlugin({ cacheTtl })` | `s-maxage` of pages, in seconds. Falls back to `cache.ttl` |
| `websitePlugin({ rateLimit })` | Per IP, for the site process only. Falls back to `server.rateLimit` |
| `websitePlugin({ forms: { apiUrl } })` | Site process only: the management API origin form submissions are forwarded to |
| `websitePlugin({ forms: { secret } })` | Both processes: the shared secret sent as a bearer token. Ignored below 16 characters |
| `websitePlugin({ forms: { rateLimit } })` | Form submissions per IP. Default 10 per 10 minutes |
| `websitePlugin({ forms: { timeout } })` | Milliseconds a forward may take. Default 10000 |
| `websitePlugin({ themes })` | [Themes in code](./themes.md) for the starter gallery |
| `auth.secret` | Must equal the management instance's: it verifies share links, signs form results and media URLs |

`storage`, `media`, `cache`, `plugins` and `contentTypes` must match the management
instance, so the site reads the same files, the same cache and the same content types.
Plugins that ship [themes or block designs](./themes.md) must be loaded here too.

The **management** config loads the website plugin too, with two options of its own:

| Option | Meaning |
| --- | --- |
| `websitePlugin({ url })` | The site process origin. The admin frames `<url>/_manablox/canvas` for the designers and the visual editor of designed spaces, and the origin is added to the admin's `frame-src` when that is restricted. Without it the admin uses the space's primary domain |
| `websitePlugin({ forms: { secret } })` | Mounts `POST /plugins/website/forms/submit`, which accepts form submissions from the site process. Forms are off without it |

## Environment

`websiteProcessConfig()` reads:

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `PORT` | `3200` | Port |
| `PUBLIC_URL` | `http://localhost:3200` | The site process origin |
| `SITE_EDITOR_ORIGIN` | empty | Comma-separated admin origins allowed to frame the canvas (`editorOrigin`) |
| `CACHE_TTL` | `300` | `s-maxage` of pages and the cache TTL |
| `SITE_FORMS_API_URL` | empty | Management API origin for form submissions |
| `SITE_FORMS_SECRET` | empty | Shared forms secret. Forms are off unless both forms variables are set |
| `RATE_LIMIT` | on | `off` disables the per-IP limit |
| `AUTH_SECRET` | required | The management instance's secret |

plus the usual `DATABASE_URL`, `REDIS_URL`, storage, media and logging variables from
[Environment variables](../configuration/environment.md).

The management config of a created project reads `SITE_URL` into the website plugin's
`url` and `SITE_FORMS_SECRET` into its `forms.secret`:

```ts
websitePlugin({ url: envOptional('SITE_URL'), forms: { secret: envOptional('SITE_FORMS_SECRET') } })
```

The `manablox.site.config.ts` of a created project reads `SITE_`-prefixed variables so one
`.env` drives every process: `SITE_PORT` (3200), `SITE_URL`, `SITE_EDITOR_ORIGIN` (defaults
to the admin's URL), `SITE_CACHE_TTL`, `SITE_MEDIA_CACHE_PATH`, `SITE_FORMS_API_URL`,
`SITE_FORMS_SECRET` and `PUBLIC_DATABASE_URL` (else `DATABASE_URL`). `manablox create`
writes the website plugin and its site process when the website is picked (`--website`, or
`website` in `--features`; `--site-port` sets its port without a proxy) and fills in a
forms secret; `manablox plugin install website` adds both to an existing instance.

## Docker compose

In the docker preset of `manablox create --website` the compose file has a `site` service:
the project's image with the command `start --config manablox.site.config.ts`, port 3200
(`SITE_PORT` on the host without a proxy), the uploads volume mounted read-only, its own
media cache volume, and Valkey for the cache. On Postgres it connects as the read-only
`manablox_public` role.

| Variable in `.env` | Service | Meaning |
| --- | --- | --- |
| `SITE_URL` | `api`, `site` | The site's public origin, for the canvas and the site's `publicUrl` |
| `SITE_FORMS_SECRET` | `api`, `site` | The same value on both; `manablox create` generates it, or use `openssl rand -hex 32` |
| `SITE_CACHE_TTL` | `site` | `s-maxage` of pages, default 300 |
| `SITE_PORT` | `site` | Host port without a proxy, default 3200 |

The service sets `SITE_EDITOR_ORIGIN` to the admin's `PUBLIC_URL` and `SITE_FORMS_API_URL` to
`http://api:3000`, the internal network.

The website plugin's repository publishes a ready image, `ghcr.io/manablox/site`, that runs
`websiteProcessConfig()` with the fields and license plugins, configured by the variables
above. A project with plugins or content types of its own builds its image from the project
instead, so the site process loads the same config as the management instance.

In the local preset, `pnpm dev:site` starts it at <http://localhost:3200>. Add the domain
`localhost` to a designed space to see it.

## HTTPS for every domain

Editors add domains in the admin, so the proxy cannot list them in advance. Caddy's
on-demand TLS issues a certificate on the first request for a host, after asking the site
process whether it knows the host. A project from `manablox create --website --proxy caddy`
ships this setup:

```
{
	email {$ACME_EMAIL}
	on_demand_tls {
		ask http://site:3200/_manablox/domain-check
	}
}

https:// {
	tls {
		on_demand
	}
	reverse_proxy site:3200 {
		header_up X-Forwarded-Proto {scheme}
	}
}
```

`/_manablox/domain-check?domain=<host>` answers 200 only for a host in `website_domains`, so
nobody can make the proxy request certificates for arbitrary names. With the control
`domains.requireVerification` on, it also answers 404 for a domain whose DNS record has not
been found yet; see [Custom domain verification](../configuration/controls.md#custom-domain-verification). Whatever proxy you use,
it must pass the original `Host` header and set `X-Forwarded-Proto`, which the site uses
for absolute URLs, canonical links and secure cookies.

The management API's `/plugins/website/forms/*` route is meant for the site process only.
Keep it off the public internet: the Caddyfile of a created project answers
`respond /plugins/website/forms/* 404` on the admin host, and the site reaches the API over
the internal network.

## Scaling

Every replica serves every host, so add replicas behind the proxy. Two things must be
shared:

- **Valkey** (`REDIS_URL`) on the management API and on every site replica. Publishing happens on the management API, and the purge only reaches the site's page cache through a shared cache. The per-IP rate limits (pages and forms) are also shared through it.
- **The uploads**, the same storage as the management API. The compose service of a created project mounts the uploads volume read-only.

Each replica keeps its own image variant cache on disk (`MEDIA_CACHE_PATH`).

## A read-only database role

The site never writes. Give it the read-only role the public API uses, see
[The public API](../delivery/public-api.md#a-read-only-database-role), and pass it as
`PUBLIC_DATABASE_URL` (a created project's site config) or `DATABASE_URL`
(`websiteProcessConfig()`). Share links show
drafts, which the site reads from the same tables, so the read-only role is enough for
them too. Migrations always run from the management side.

SQLite has no roles: the site process opens the same file as the management instance.

## Health

`GET /healthz` (liveness) and `GET /readyz` (database check) answer as on the other
processes; see [Operations](../deployment/operations.md#health). The image's health check
asks `/readyz` on `PORT`, which the compose service of a created project sets to 3200.
