---
title: 'Plugin services'
description: "Build a plugin's services once, and give its hooks, procedures, routes and jobs audit entries and error keys."
---

A [plugin](./plugins.md) builds its services once per process with `services`. The result is
its context's `services` wherever the plugin runs code: [procedures](./rpc.md),
[server routes](./server-routes.md), [jobs](./jobs.md), [data providers](./data-providers.md)
and hooks.

```ts
import { auditor, type PluginServicesContext, pluginError, type Scope } from '@manablox/core';
import type {} from '@manablox/server';

export function notesServices(context: PluginServicesContext) {
  const repos = () => notesRepositories(context.repos);
  return {
    notes: {
      list: (scope: Scope) => repos().notes.list(scope),
      create: (scope: Scope, text: string) =>
        context.repos.transaction(async (tx) => {
          const row = await notesRepositories(tx).notes.create(scope, text);
          await auditor(tx, 'notes.note', (note: { text: string }) => note.text).record(
            'notes.note.create',
            row,
          );
          return row;
        }),
    },
  };
}

export type NotesServices = ReturnType<typeof notesServices>;
```

`definePlugin` infers the services' type, so `plugin.services` is typed in the plugin's own
`jobs`, `maintenance`, `start`, `stop` and `server` routes and middleware.

## What `services` receives

| Field | What it is |
| --- | --- |
| `plugin` | The plugin's context, below, without `services` |
| `manablox` | The instance: config, hooks, registries, `controls`, `instance.id` |
| `logger` | The instance logger bound to the plugin |
| `repos` | The core repositories |
| `db` | The database context for the plugin's own repositories, see [Tables and migrations](./plugins.md#tables-and-migrations) |
| `cache` | The tagged cache |

The types of `repos`, `db`, `cache` and the context's `core` come with `@manablox/server`; a plugin that
uses them imports it for types (`import type {} from '@manablox/server'`).

## The plugin context

Every process builds the services after the core services and before it starts. The context
(`manablox.plugin(name)`) carries `id`, `name`, `manablox` (with `manablox.instance.id`, the
instance's id, below), `logger`, `controls`, `repos`,
`db`, `cache`, `jobs`, `core` (the core services: `content`, `contentTypes`, `spaces`,
`environments`, `users`, `menus`, `tags`, `roles`, `audit`, `media`, `storage`, `realtime`,
`hostVerifier`, and on management instances `credentials`, `mailer` and `pusher`) and `services`, `plugins` (other plugins' services and flags, see
[Dependencies](./dependencies.md)), `contributions(point)` (see
[Extension points](./extension-points.md)) and `channel(name)` (see
[Lifecycle and channels](./lifecycle.md#channels)). Reading `services` before they are built, for example in
an `after:init` hook, throws.

## The instance id

`manablox.instance.id` is the instance's identity: a uuid v7 made at the first boot and kept
in the core `instance_meta` table, the same in every process of the instance. It is read-only.
A backup and its restore keep it; creating or promoting an environment and a snapshot restore
leave it alone. It is loaded before the plugins' services are built.

## Audit entries

A plugin declares the target kinds it records under `audit`, each `<pluginId>.<entity>`.
Entries are recorded as `<pluginId>.<entity>.<verb>` with any one-word verb, and the activity
log's filters list the kinds. A kind outside the plugin's namespace is refused at start
(`plugin.key.invalid`). The server keeps no labels: the plugin's admin bundle labels its
kinds and actions, and the admin shows the key where none is given.

```ts
audit: { entities: ['notes.note'] },
// ...
await auditor(tx, 'notes.note', (note: { text: string }) => note.text).record('notes.note.create', note);
```

Work the plugin does on its own, not for a person or an API key, can be recorded under an
actor kind of its own, declared in `audit.actorKinds` as the plugin id or
`<pluginId>.<name>` (`audit: { entities: [...], actorKinds: ['notes'] }`), then passed as
`{ actor: { kind: 'notes', id, label } }`. The activity log filters by it and shows the key.

## Error keys

A plugin declares its error keys under `errors`, each `plugins.<pluginId>.<name>` with an
English sentence and a kind (`bad_request` by default), which sets the HTTP status.
`pluginError(key, params)` builds the error; its transport `message` is the sentence with
`{param}` filled in, so the admin and API clients can show it.

```ts
errors: {
  'plugins.notes.locked': { kind: 'locked', message: 'Note {id} is locked.' },
},
// ...
throw pluginError('plugins.notes.locked', { id: note.id });
```

A key outside the plugin's namespace is refused at start (`plugin.key.invalid`).
`instance.plugins` of the management API lists each plugin with its permission, control and
error labels and its audit kinds for the admin.

## Signed tokens

`@manablox/core/node` exports the signing helpers core uses for its own tokens:
`signingKey(secret, purpose)` derives a key for one purpose from the instance secret,
`signFor(secret, purpose, data)` is the base64url HMAC-SHA256 of `data` under it, and
`sameSignature(expected, actual)` compares two signatures in constant time. Pass
`manablox.config.auth.secret` and a purpose string of the plugin's own, so its tokens never
verify anywhere else. The website plugin signs its share links and site password cookies
this way.
