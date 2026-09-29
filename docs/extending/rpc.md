---
title: 'Plugin procedures'
description: 'Add typed procedures to the management API from a plugin, with the core guards.'
---

A [plugin](./plugins.md) can add procedures to the management API under `rpc`. The server
mounts them at `plugins.<id>`: over oRPC at `/rpc/plugins/<id>/...` and over REST at
`/api/v1/plugins/<id>/...`. They use the same builders, guards and error mapping as the core
procedures, and the admin calls them with a typed client.

```ts
// src/rpc.ts
import { type PluginRouterOf, type PluginRpcKit, schemas } from '@manablox/api-rpc/plugin';
import { z } from 'zod';
import type { NotesServices } from './services.js';

export const notesRpc = ({ scoped }: PluginRpcKit<NotesServices>) => ({
  notes: {
    list: scoped('space:read')
      .input(schemas.spaceScoped)
      .handler(({ context }) => context.plugin.services.notes.list(context.env)),
    create: scoped('notes:write')
      .input(schemas.spaceScoped.extend({ text: z.string().min(1) }))
      .handler(({ input, context }) => context.plugin.services.notes.create(context.env, input.text)),
  },
});

export type NotesRouter = PluginRouterOf<typeof notesRpc>;
```

```ts
definePlugin({ name: 'notes', services: notesServices, rpc: notesRpc });
```

## The kit

`rpc` receives a kit of builders bound to the plugin:

| Builder | What it adds |
| --- | --- |
| `base` | Error mapping, the suspended-instance check, the plugin's flag and `context.plugin` |
| `authed` | A signed-in caller or an API key |
| `scoped(permission)` | The permission in the input's `spaceId` space, the request's environment in `context.env`, and for anything but a `:read` permission a writable space |
| `superadmin` | An instance-wide superadmin |
| `superadminWrite` | A superadmin, while the instance takes writes |

`scoped` accepts core and [plugin permissions](./permissions.md). The flag check comes first:
while the plugin is off for the instance, or for the space the input names, every procedure
answers `NOT_FOUND` (`route.notFound`) as if it did not exist when the flag is hidden, and
`FORBIDDEN` (`control.feature`, with the lock's message and link) when it is locked, such as a
premium plugin without a license.

`scoped(permission, { locked: true })` also answers while the plugin is locked (switched off
but shown with a lock) for the instance or the space; hidden still answers `NOT_FOUND`. Use it
for reads the admin needs to draw the lock, such as whether the space has anything the locked
control would work on. The procedure's service checks the flag again before doing any work.

`scoped(permission, { also: ['ai:use'] })` asks for further permissions in the same space
before the handler runs, for a procedure that needs two.

`pluginGuard(check)` turns a check of the context into a step of the chain, after the kit's
own: `scoped('notes:write').use(pluginGuard(checkQuota))`. `check` throws to refuse the call;
the AI plugin refuses a host its development license does not serve this way.

Every procedure has to come from the kit. The server refuses to start
(`plugin.rpc.unguarded`) when a router holds a procedure built another way, since it would
skip the flag. Two plugins with routers may not share an id (`plugin.id.duplicate`).

## Context

A procedure's context is the core one (`manablox`, `repos`, the core services, `principal`,
`env`) plus `plugin`, the plugin's context: its `services`, `repos`, `db`, `cache`, `jobs`,
`controls`, `logger` and `contributions`, and `plugins`, the other plugins' services and flags.
See [Plugin services](./services.md) and [Dependencies](./dependencies.md).

`@manablox/api-rpc/plugin` also exports `schemas` (`spaceScoped`, `spaceItem`, `uuid`,
`pagination`, ...), `payloadOf(input)` (the input without `spaceId` and `environment`, what a
write hands its service), the per-type guards (`assertOnType`, `assertOnDocument`,
`narrowToAllowed`, ...), `toOrpcError` and the `RpcContext` type.

It re-exports the oRPC types a plugin's router refers to: `AnySchema`, `ErrorMap`,
`MergedErrorMap`, `Meta` and `Schema` of `@orpc/contract`, and `Context`,
`DecoratedProcedure`, `Lazy`, `MergedCurrentContext`, `MergedInitialContext`, `Procedure` and
`Router` of `@orpc/server`. The declarations TypeScript emits for a plugin's router name
these types, and a plugin that names them itself imports them from here, so neither needs
`@orpc/server` or `@orpc/contract` as a dependency of the plugin:

```ts
import type { DecoratedProcedure, PluginRouterOf } from '@manablox/api-rpc/plugin';
```

## Typed client

`PluginRouterClient<Router>` is the client type of a plugin's router. In the admin,
`pluginClient<Router>(id)` from `@manablox/admin-sdk` builds one over the admin's own
connection (see [Admin plugins](./admin-plugins.md#talking-to-the-server)); outside the
admin, any oRPC client works:

```ts
import type { PluginRouterClient } from '@manablox/api-rpc/plugin';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { NotesRouter } from '@acme/notes';

type Notes = PluginRouterClient<NotesRouter>;
const client = createORPCClient(new RPCLink({ url: 'https://cms.example.com/rpc' }));
const notes = (client as { plugins: { notes: Notes } }).plugins.notes;
await notes.notes.create({ spaceId, text: 'Hello' });
```
