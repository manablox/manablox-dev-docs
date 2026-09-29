---
title: 'Server modes'
description: 'Add a server mode of your own, such as the website mode, from a plugin.'
---

A server runs in one mode. Core has two: `management` (the admin, the management API,
uploads) and `public` (the hardened delivery API). A [plugin](./plugins.md) can declare
more under `modes`. The website plugin (`@manablox/plugin-website`), for example, declares
`website`, the process that renders designed sites.

```ts
import { definePlugin } from '@manablox/core';
import { pluginMode } from '@manablox/server';

export const statusPlugin = () =>
  definePlugin({
    name: '@acme/status',
    modes: [
      pluginMode({
        name: 'status',
        // Core scopes mounted next to the mode's own routes.
        scopes: [],
        surface: ({ runtime, plugin }) => ({
          mount(app) {
            app.get('/', async (c) => {
              plugin.logger.debug('status asked');
              return c.json({ spaces: (await runtime.repos.spaces.list()).length });
            });
          },
        }),
      }),
    ],
  });
```

Start it with `manablox start --mode status`, with `server.mode: 'status'` in a config, or
from code with `run(config, { mode: 'status' })`. The plugin has to be in the config's
`plugins` either way.

## The mode definition

| Key | Meaning |
| --- | --- |
| `name` | The mode's name. It may not be `management`, `public` or a mode another plugin declares; the server refuses to start with `plugin.key.duplicate` |
| `scopes` | Core scopes the mode mounts when `server.scopes` is not set, for example `['media']` for `/media`. An explicit `server.scopes` wins |
| `surface(context)` | Builds the mode's HTTP surface once per app, and may be async. `context.runtime` is the running instance, `context.plugin` the plugin's context with its [services](./services.md) |

`pluginMode` only adds the types, like `pluginServer`.

`@manablox/server` also exports the helpers a mode's routes need, as the website mode uses
them: `clientIp`, `matchesEtag` and `sharedCacheControl` for cached answers,
`rateLimitHeaders` and `withRateLimitHeaders`, `served`, `markCached` and `markNotMetered`
for usage counting, `writable` for the instance state, `usageRefused` and `retryAfter` for
used up metrics, and the `MediaScope` type of `media(c)`.

## The surface

A mode's server is anonymous and read-only, like `public`: there is no auth, no management
API and no admin, errors are masked, and no mail, workflows or AI are started.

| Key | Meaning |
| --- | --- |
| `mount(app)` | Adds the mode's routes to the [Hono](https://hono.dev) app, after the core scopes and the plugin routes of the mode. It may claim every remaining path |
| `spaceOf(c)` | The space a request is for. Rate limits, usage counting and the [plugin routes](./server-routes.md) of the mode read it |
| `served` | The usage surface its requests count toward and the `surface` of `request:served`: `delivery` by default, or a name of the mode's own (`website` for the website mode). Only `delivery` and `management` count API requests; every surface but `management` counts bandwidth |
| `rateRule` | The per-IP rate rule of the control catalogue, `delivery.ip` by default. Its fallback is `rateLimit`, else `server.rateLimit` |
| `rateLimit` | `{ window, max }` or `false`: the fallback of `rateRule`, `server.rateLimit` when left out |
| `media(c)` | With the `media` scope: which assets `/media` may serve for the request. Without it nothing is served |
| `fallback(c, status)` | The answer for unmatched paths (404), errors (500) and a suspended instance (503). The standard error body by default |
| `unsuspended(path)` | Paths that keep answering while the instance is suspended |
| `headers` | Changes to the baseline security headers, below |

## Security headers

Core sets a baseline of security headers (`PLUGIN_MODE_HEADERS` from `@manablox/server`)
on every response of a plugin mode that does not set them itself. A header a route sets
always wins.

| Header | Baseline |
| --- | --- |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Origin-Agent-Cluster` | `?1` |
| `Referrer-Policy` | `no-referrer` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Download-Options` | `noopen` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `X-XSS-Protection` | `0` |

`headers` on the surface changes the baseline: a value replaces a header or adds one,
`null` drops it. Names are case-insensitive.

```ts
surface: () => ({
  mount(app) {
    app.get('/', (c) => c.html('<h1>Status</h1>', 200, { 'content-security-policy': "default-src 'self'" }));
  },
  headers: { 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': null },
}),
```

The website mode keeps `X-Content-Type-Options`, sets `Referrer-Policy:
strict-origin-when-cross-origin` and `Cross-Origin-Resource-Policy: cross-origin` (another
site of the instance may link its fonts and images), and drops the rest. Its pages set
their own `Content-Security-Policy` and `X-Frame-Options: DENY`; the design canvas sets a
policy that lets the admin frame it.

Core adds no CORS on a plugin mode.

## Plugin routes in a mode

A route or middleware of any plugin runs in a plugin mode when its `scopes` names that
mode, e.g. `scopes: ['website']`. The request's space is the mode's `spaceOf`, and usage is
counted on the mode's `served` surface. See [Server routes and middleware](./server-routes.md).

## Unknown modes

A mode that neither core nor a plugin declares fails at start with `config.mode.unknown`,
listing the known modes. `manablox start --mode <name>` checks the same before starting.

A small mode, `manablox start --mode hello`, with one anonymous route:

```ts
import type { PluginServerMode } from '@manablox/core';
import type {} from '@manablox/server';
import type { HelloServices } from './services.js';

export const helloMode: PluginServerMode<HelloServices> = {
  name: 'hello',
  scopes: [],
  surface: ({ plugin }) => ({
    mount(app) {
      app.get('/', (c) => c.text(`Hello from the ${plugin.id} mode`));
    },
  }),
};
```

The plugin lists it in `modes: [helloMode]`.
