---
title: 'The config file'
description: 'How an instance is configured: one `defineConfig()` call, fed by environment variables, that declares content types, field types, plugins and every runtime setting.'
---

An instance is configured by **one TypeScript object**, built with `defineConfig()` from
`@manablox/core`. A project keeps it in `manablox.config.ts` at its root, which is what
the `manablox` CLI loads; see [Create a project](../getting-started/create-a-project.md).
`manablox create` writes three files around it: `manablox.config.ts` for the management
instance, `manablox.public.config.ts` for the public delivery instance, and
`content-model.ts` and `manablox.plugins.ts`, which both configs import for the content
types, field types and plugins they share. Another file is loaded with
`--config <file>`.

Every value that differs between environments (the database, secrets, hostnames, the
storage driver) is read from the environment inside that file, so **a deployment needs
no code change**. Every value that is part of the product (content types defined in
code, custom field types, plugins, media presets) is written into it.

## The shape

```ts
import { defineConfig } from '@manablox/core';
import { manabloxFields } from '@manablox/fields';

export default defineConfig({
  database: { url: process.env.DATABASE_URL! },
  auth: { secret: process.env.AUTH_SECRET! },

  server: {
    port: 3000,
    publicUrl: 'https://cms.example.com',
    cors: { origin: ['https://admin.example.com', 'https://www.example.com'], credentials: true },
    // Which surfaces this process mounts, and whether it is the management or the
    // public half. See "One image, two modes" below.
    scopes: ['rpc', 'auth', 'uploads', 'media', 'graphql'],
    mode: 'management',
  },

  storage: { driver: 's3', s3: { bucket: 'assets', /* ... */ } },
  media: { presets: { hero: { width: 1920, format: 'webp' } } },
  cache: { redisUrl: process.env.REDIS_URL, ttl: 60 },

  plugins: [manabloxFields()],

  contentTypes: [
    {
      name: 'page',
      fields: [
        { name: 'summary', type: 'string', settings: { editor: 'textarea' } },
        { name: 'components', type: 'blocks', settings: { types: [] } },
      ],
    },
  ],
});
```

| Section | What it holds | Detail |
| --- | --- | --- |
| `database` | Connection URL, pool size, SSL | [Environment variables](./environment.md) |
| `auth` | The secret that signs sessions and media URLs, trusted origins, session length | [Environment variables](./environment.md) |
| `server` | Host, port, public URL, admin URL, CORS, rate limit, scopes, mode | below |
| `publicApi` | Settings that apply only in public mode: the pinned space, limits, persisted operations | [The public API](../delivery/public-api.md) |
| `graphql` | Path, depth and complexity limits, introspection, the preview header | [GraphQL](../delivery/graphql.md) |
| `storage`, `media` | Where files go, upload limits, image presets | [Storage and media](./storage-and-media.md) |
| `cache` | Valkey/Redis URL, TTL, how often to check for content types saved elsewhere | [Caching](../delivery/caching.md) |
| `mail` | How mail leaves: SMTP, Mailpit, Gmail, Microsoft 365 or a mail API, for workflows and notifications | [Mail](./mail.md) |
| `push` | Web Push keys, for workflows and notifications | [Workflows](../admin/workflows.md) |
| `net` | What outbound calls to configured URLs (workflow nodes, webhooks, AI providers) may reach, and their ceilings on response size and redirects | [Security](../deployment/security.md#outbound-requests) |
| `fieldTypes`, `contentTypes`, `plugins` | The model and the extensions | [Content types in code](./content-types-in-code.md), [Extending](../extending/plugins.md) |
| `logging` | Level, destinations (console, file, HTTP, or an adapter a plugin registers), redaction | [Logging](./logging.md) |

`manabloxFields()` is the plugin that provides the built-in field types. Leave it in.
The first-party plugins, such as `workflowsPlugin()` with a workflow's ceilings on run time
and crawled pages, `webhooksPlugin()`, `aiPlugin()` and `websitePlugin()`, take their
settings as options; see [Workflows](../admin/workflows.md#the-workflows-plugin),
[AI](../admin/ai.md#the-ai-plugin) and [Designed sites](../site/index.md).

## Code-defined and runtime-defined content types

A content type declared in `contentTypes` and one built by an editor in the admin are
**the same shape**, in the same registry, stored the same way and served by the same
GraphQL schema. The only difference is where it came from:

- **`code`**: from the config file. Read-only in the admin, versioned with your repository, deployed with your code. Available in every space unless it names a `spaceId`.
- **`runtime`**: created in the admin, stored in the database, scoped to one space.

Use code-defined types for structures your frontend depends on, and runtime types for
whatever editors need to invent without a deploy. The admin can also turn a space's
runtime types into the code that would declare them. See
[Moving a space](../admin/transfer.md#the-space-as-config).

## One image, two modes

The same server code runs as the **management API** (what the admin uses) and as the
**public API** (what a website reads). Which one a process is comes from two settings:

- `server.scopes` names the surfaces to mount: `rpc` (the management procedures), `auth` (login), `uploads`, `media` (serving files), `graphql`, `delivery` (the public REST surface), `control` (the [control API](../reference/control-api.md), management mode only).
- `server.mode` is `management` (the default) or `public`. Public mode is more than a list of scopes: it removes the draft code path, pins one space, masks errors and keys the rate limiter on the client's IP.
- `server.rateLimit` is `{ window, max }` per client and window, or `false` to turn it off. The counters live in the process unless `cache.redisUrl` is set, in which case every replica counts into the same Redis keys and shares one budget. It is the default of the rate limit rules the control API can set per space; see [Rate limits](./controls.md#rate-limits).
- `server.trustedProxies` lists the proxies (addresses or CIDR ranges) whose client-IP headers are believed; `[]` believes none. Defaults to `TRUSTED_PROXIES`; unset believes every peer. See [Client addresses](../deployment/operations.md#client-addresses).

Presets: management mounts `rpc, auth, uploads, media, graphql`; public mounts
`graphql, media, delivery`. No preset mounts `control`: name it in `server.scopes` and set
`control.apiKey` (`CONTROL_API_KEY`), or the process refuses to start. The `cms-api` image reads both from the
environment variables `SCOPES` and `SERVER_MODE` (with `envScopes()` and `envServerMode()` of
`@manablox/core`, which a config of your own can call too). See [The public API](../delivery/public-api.md) and
[Operations](../deployment/operations.md#scaling-by-role).

## Validation

The config is validated once, at boot, and every problem is reported at once with its
path: an unknown scope, a port out of range, a missing database URL or auth secret. The error keys start with `config.`. See
[Error keys](../reference/errors.md).
