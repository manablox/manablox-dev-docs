---
title: 'Plugin permissions'
description: 'Declare permissions for a plugin and check them in its routes and procedures.'
---

A [plugin](./plugins.md) can declare its own permissions under `permissions`. They join the
catalogue the role editor and the API key form show, so a custom role or an API key can grant
them like any built-in permission.

```ts
import { definePlugin } from '@manablox/core';

export const notesPlugin = () =>
  definePlugin({
    name: 'notes',
    permissions: [
      {
        key: 'notes:write',
        label: 'Write notes',
        description: 'Create and edit notes in the space.',
        // Built-in roles that hold it; owner and admin hold every plugin permission.
        roles: ['editor'],
      },
      { key: 'notes:export', label: 'Export notes', group: 'Exports' },
    ],
  });
```

## Keys

A key is `<pluginId>:<action>`: the plugin's id (its name in lower case without `@`, with `/`
as `.`), a colon, and one word. `@acme/notes` declares `acme.notes:write`. The server refuses
to start (`plugin.key.invalid`) when:

- the prefix is not the plugin's id,
- the action has another colon or is empty,
- the id is a core permission prefix such as `content` or `space`,
- a role in `roles` is not a built-in role.

A key declared twice is refused with `plugin.key.duplicate`.

## Roles

`owner` and `admin` hold every plugin permission. `editor`, `author` and `viewer` hold the ones
that name them in `roles`. Custom roles hold what the role editor grants; plugin permissions
appear there in a group named after the plugin, or after `group` when a permission sets one.

## Stored grants of a removed plugin

A role or an API key that holds a permission of a plugin that is no longer loaded keeps the
string. It grants nothing while the plugin is gone and applies again once the plugin is back.
Saving such a role in the admin keeps the stored grant; adding a new unknown grant is still
refused with `role.permission.unknown`.

## Checking a permission

In a [procedure](./rpc.md), `scoped('notes:write')` checks the permission in the space the
input names, like the core procedures do. In a [server route](./server-routes.md),
`helpers.requirePermission(c, 'notes:write')` does the same. Both accept core and plugin
permissions.

The catalogue is also available as functions of `@manablox/core`: `permissionGroups()`,
`allPermissions()` and `permissionsFor(role)` include the loaded plugins.
