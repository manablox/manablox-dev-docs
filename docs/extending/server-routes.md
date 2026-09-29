---
title: 'Server routes and middleware'
description: 'Add HTTP endpoints and request middleware to the server from a plugin.'
---

A [plugin](./plugins.md) can add its own HTTP endpoints and request middleware under
`server`. Routes live under `/plugins/<id>/`, so they never collide with the built-in API
or with another plugin. Each route and each middleware names the servers it runs in.

```ts
import { definePlugin } from '@manablox/core';
import { pluginServer } from '@manablox/server';

export const seoPlugin = () =>
  definePlugin({
    name: '@acme/seo',
    server: pluginServer({
      routes: [
        {
          scopes: ['management'],
          register(app, { requirePermission, requireSpace, manablox }) {
            // GET /plugins/acme.seo/report with an x-manablox-space header
            app.get('/report', async (c) => {
              await requirePermission(c, 'content:read');
              const spaceId = await requireSpace(c);
              return c.json({ spaceId, score: 97 });
            });

            // The space can also come from the path
            app.post('/spaces/:spaceId/rescan', async (c) => {
              const caller = await requirePermission(c, 'content:write');
              manablox.logger.info({ user: caller.userId }, 'rescan requested');
              return c.json({ queued: true }, 202);
            });
          },
        },
        {
          scopes: ['public'],
          register(app, { requireSpace }) {
            // GET /plugins/acme.seo/sitemap-hints on the public API
            app.get('/sitemap-hints', async (c) => c.json({ spaceId: await requireSpace(c) }));
          },
        },
      ],
      middleware: [
        {
          scopes: ['management'],
          order: 'beforeRoutes',
          path: '/api/v1/*',
          handler: async (c, next, { principal }) => {
            await next();
            const caller = await principal(c);
            if (caller) c.header('x-acme-seen', caller.userId);
          },
        },
      ],
    }),
  });
```

`pluginServer` only adds the types; importing `@manablox/server` for them is enough.
Written inline in `definePlugin`, the block takes the type of the plugin's
[services](./services.md) from `services`, so `helpers.plugin.services` is typed. Declared on
its own, `pluginServer<MyServices>({ ... })` or `PluginServer<MyServices>` does the same.
`app` is a [Hono](https://hono.dev) app, so everything Hono offers for routing and
responses works.

## Where routes are mounted

The plugin's id is its name in lower case, without `@`, with `/` as `.`: `@acme/seo`
becomes `acme.seo`, and its routes answer under `/plugins/acme.seo/`. `pluginId(name)` in
`@manablox/core` computes it. Two plugins whose names give the same id cannot both have
routes; the server refuses to start with `plugin.id.duplicate`.

| Scope | Runs in | Space of the request | Caller |
| --- | --- | --- | --- |
| `management` | A server in `management` mode that serves the management API (`rpc` in `server.scopes`) | `x-manablox-space` header, else a `:spaceId` path param, else a `spaceId` query param | A session or an API key |
| `public` | A server in `public` mode | The space the public API serves, pinned or by API host | None, the public API is anonymous |
| A plugin mode's name, e.g. `website` | A server in that [mode](./server-modes.md) | The mode's `spaceOf`; for `website` the space whose domain the request is for | None, plugin modes are anonymous |

A path under `/plugins/<id>/` that the plugin does not define answers the standard 404.

## Helpers

`register(app, helpers)` and every middleware handler receive the same helpers.

| Helper | What it does |
| --- | --- |
| `principal(c)` | The caller, or `null` when anonymous. Always `null` outside `management` |
| `requireSpace(c)` | The request's space id, from the table above. Answers 400 `plugin.space.required` when a management request names none, 404 `space.notFound` for an unknown space, 404 `route.notFound` when the plugin is off and hidden in that space (403 `control.feature` when locked), and 423 on a write (any method but GET, HEAD and OPTIONS) while the space is read-only or suspended |
| `requirePermission(c, permission, spaceId?)` | Answers 401 `auth.unauthorized` without a caller and 403 `auth.forbidden` without the permission, else returns the caller. Without `spaceId` it checks the request's space through `requireSpace`; with `null` it checks instance-wide, which only a superadmin passes. API key restrictions (spaces, permissions) apply |
| `controls` | The instance's controls, e.g. `controls.assertFeature(spaceId, key)` or `controls.assertLimit(...)` |
| `logger` | The instance logger, with the plugin's name on every line |
| `plugin` | The plugin's context: `services`, `repos`, `db`, `cache` and `jobs`. See [Plugin services](./services.md) |
| `rateLimit(rule, options?)` | Middleware for one route that counts the request against one of the plugin's rate rules, `plugins.<id>.<name>` as `controlKeys(id, controls).rateLimits.<name>` gives it, which its [controls](./controls.md) must declare under `rateLimits.`. It counts per client IP unless `options.key(c)` names another bucket, under the controls of the space the request names (a `spaceId` path param included) unless `options.spaceId(c)` names another; used up, it answers 429 `rateLimit.exceeded` with `Retry-After` |
| `manablox` | The running instance: hooks, registries, config |
| `scope` | The scope this server runs as: `management`, `public` or a plugin mode's name |

Permissions are the built-in ones, listed in [Users and roles](../admin/users-and-roles.md).

## Anonymous calls and raw bodies

A route decides itself whether it needs a caller: without `requirePermission` it answers
anonymous requests too, `POST` included. The body reaches it untouched, so a route that
verifies a signature over the exact bytes reads them with `c.req.arrayBuffer()` or
`c.req.text()`. Give such a route its own rate rule:

```ts
// const seoKeys = controlKeys('acme.seo', seoControls), with
// 'rateLimits.plugins.acme.seo.incoming': { description: 'Signed calls per IP.', default: { max: 60, windowSeconds: 60 } }
app.post('/in/:spaceId', helpers.rateLimit(seoKeys.rateLimits.incoming), async (c) => {
  const spaceId = await helpers.requireSpace(c);
  const body = await c.req.text();
  if (!verify(body, c.req.header('x-signature'))) return c.json({ ok: false }, 401);
  await helpers.plugin.services.inbox.receive(spaceId, JSON.parse(body));
  return c.json({ ok: true }, 202);
});
```

On `management` the request still counts against the surface's own limit first
(`management.session` per IP for anonymous callers).

## Errors

Throw a `ManabloxError` (or let a helper throw one) and the route answers the
[standard error body](../reference/errors.md#the-error-body) at its status, on every
scope. Any other error is logged with the plugin's name and answers 500 `internal.error`.
Outside `management` the message of such an error is masked.

## The plugin's switch

Every plugin has a feature switch, `plugins.<id>`, that the
control API can turn off for the instance, a group of spaces or one space. See
[the control API](../reference/control-api.md).

An off switch is either hidden or shown with a lock (`presentation: 'locked'`, the default
for off, and what a premium plugin without a license gets). Routes answer the way the
plugin's [procedures](./rpc.md) do:

- Off for the instance: every route answers 404 `route.notFound` as if it did not exist while hidden, and 403 `control.feature` with the lock's message and link while locked. The plugin's middleware is skipped either way.
- Off in a space: a request that names that space (header or query on management, always on public and plugin modes) answers the same 404 or 403. A route that reads the space from a path param learns it through `requireSpace`, which answers the same.

## What applies to plugin routes

Plugin routes go through the same request pipeline as the built-in surfaces of their
server.

| | `management` | `public` | `website` (a plugin mode) |
| --- | --- | --- | --- |
| Rate limit | `management.apiKey` per key, `management.session` per signed-in user, else per IP | `delivery.ip` and `delivery.space` | The mode's `rateRule`, `plugins.website.ip` |
| Rate-limit headers | Yes | Yes | Yes |
| Suspended instance | 423 `control.suspended` | 503 | 503 |
| Read-only instance or space | Writes answer 423 `control.readOnly` | Same | Same |
| Usage counted | Not counted | `apiRequests` and `bandwidthBytes` of the served space, like delivery | `bandwidthBytes` of the mode's space, on its `served` surface |
| Used-up usage limit | Not checked | 429 `control.usage` | 429 `control.usage` (bandwidth) |
| CORS | The management CORS settings (`server.cors`), with credentials | Any origin, GET and POST, no credentials | None |

Management plugin routes are left out of `apiRequests` because the admin calls them with
the editor's session; count work yourself with `controls.consume(spaceId, metric, amount)`
if a route should.

## Middleware

A middleware entry is `{ scopes, order, path?, handler }`. `handler(c, next, helpers)` is
a Hono middleware with the helpers as a third argument. `path` is a Hono path pattern and
defaults to every path. Entries of the same order run in plugin order, then in the order
they are listed. Plugins cannot remove or reorder the built-in middleware.

| Order | Runs | Available |
| --- | --- | --- |
| `beforeAuth` | After the request id, client IP, security headers and CORS; before the rate limiter. Health checks pass through it too | `c.get('requestId')`, `c.get('clientIp')`. `principal(c)` is always `null` here |
| `afterAuth` | After the rate limiter, request logging and usage counting; before the instance state gate, so it also runs while the instance is suspended | Everything above, plus `principal(c)` |
| `beforeRoutes` | After the instance state gate, just before the built-in routes and the plugin routes | Everything above |

Middleware runs for **every** request of its scope that matches `path`, not only for the
plugin's own routes: the management API, GraphQL, uploads, the control API, the admin's
files, delivery or a plugin mode's pages. Keep it cheap and narrow `path` where you can.

- An error thrown in middleware answers the standard error body, and on a plugin mode its `fallback` (the neutral error page on `website`).
- `beforeAuth` runs before rate limiting, so it also runs for callers the limiter refuses.
- `principal(c)` in middleware looks the caller up once per request; outside a route that resolves it anyway, that is an extra session or API key lookup.
- Middleware sees request headers and bodies of every surface, credentials included. Only install plugins you trust; they run in the server process with full access.

## Calling routes from an admin plugin

The admin is served by the management API, so an [admin plugin](./plugins.md#admin-extensions)
calls its server routes same-origin with the editor's session cookie, with a plain `fetch`:

```ts
const response = await fetch('/plugins/acme.seo/report', {
  credentials: 'include',
  headers: { 'x-manablox-space': spaceId },
});
if (!response.ok) throw new Error((await response.json()).error.key);
const report = await response.json();
```

Send the space in the `x-manablox-space` header so the plugin's switch and `requireSpace`
see it. For calls that are not file downloads or webhooks, [procedures](./rpc.md) through
`pluginClient` are the typed way.
