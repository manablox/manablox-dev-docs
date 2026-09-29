---
title: 'Plugin slots and apis'
description: "Let admin plugins extend each other: slots a plugin declares, and apis a bundle exposes to others."
---

[Admin slots](./admin-slots.md) are places in the admin's own screens. A plugin's screens can
have slots too, which other plugins' bundles fill, and a bundle can hand components,
composables and queries to other bundles. Both work between runtime bundles, without
rebuilding anything.

## Declaring a slot

A bundle declares a slot in its `setup` with `defineSlot(name)`; its id is the plugin's id, a
colon and the name. Its own components render the slot with `PluginSlot` from
`@manablox/admin-plugin` (or `@manablox/admin-sdk`):

```ts
// hello-extra's admin entry
import { defineAdminPlugin } from '@manablox/admin-plugin';

declare module '@manablox/admin-plugin' {
  interface AdminSlotProps {
    /** On the greeting board, below the words. */
    'hello-extra:board': { spaceId: string };
  }
}

export default defineAdminPlugin({
  name: 'hello-extra',
  routes: [{ path: '/hello-extra', name: 'hello-extra-board', component: () => import('./pages/BoardPage.vue') }],
  setup({ defineSlot }) {
    defineSlot('board'); // 'hello-extra:board'
  },
});
```

```vue
<!-- pages/BoardPage.vue -->
<script setup lang="ts">
import { PluginSlot, useSpaceStore } from '@manablox/admin-sdk';

const spaces = useSpaceStore();
</script>

<template>
  <PluginSlot id="hello-extra:board" :props="{ spaceId: spaces.currentId }" />
</template>
```

`PluginSlot` takes `id`, the `props` every entry gets, and `locked`, which keeps entries whose
feature is locked for a default slot that draws the lock (each such item has `locked: true` and
names the feature that is off). Its default slot gets `items` to lay the entries out itself, like the admin's own slots. Augmenting `AdminSlotProps`
types the slot's props for the plugins that fill it.

## Filling one

Other bundles fill a plugin's slot like a core slot, under `slots`, with the same entry keys (`component`, `key`, `order`, `feature`, `locked`, `permission`,
`label`, `icon`, `hint`, `when`):

```ts
// hello's admin entry
export default defineAdminPlugin({
  name: 'hello',
  slots: {
    // Stays empty without hello-extra.
    'hello-extra:board': [{ component: () => import('./slots/BoardGreetings.vue') }],
  },
});
```

An entry of a plugin slot may carry options of its own beside those keys, which the
declaring plugin reads: the workflows plugin's `workflows:nodeForm` entries name their
`action`, its `workflows:triggerForm` entries their trigger `kind`, how to create one, how
to label it and what to drop after a workflow import (`imported(spaceId)`). The declaring plugin types them by augmenting `AdminSlotOptions` of
`@manablox/admin-plugin` next to `AdminSlotProps`, and reads a slot's entries with
`useSlotEntries(id)` from `@manablox/admin-sdk` when it draws them itself rather than
through `PluginSlot`.

An entry answers to its own plugin's flag, and the slot renders inside the declaring plugin's
screens, which answer to that plugin's flag: an entry shows only where both are on. Entries
for a slot of a plugin that is not loaded are never rendered. Without the declaring plugin's
types the entry's props are untyped.

## Exposing an api

`expose(api)` in a bundle's `setup` hands a value to other bundles; `usePluginApi<T>(id)`
returns it, or `undefined` when that plugin is not loaded:

```ts
// hello-extra
setup({ expose }) {
  expose({ decorate: (text: string) => `* ${text} *` });
},
```

```ts
// hello, which works without hello-extra
import { usePluginApi } from '@manablox/admin-sdk';

const extra = usePluginApi<{ decorate(text: string): string }>('hello-extra');
const title = extra ? extra.decorate('Greetings') : 'Greetings';
```

The caller names the type; import it from the exposing package when it depends on it, or
describe the part it uses, as above, when the other plugin is optional. A package that
exposes an api publishes its type on a types-only `./admin-api` subpath, such as
`AiAdminApi` from `@manablox/plugin-ai/admin-api` and `WorkflowsAdminApi` from
`@manablox/plugin-workflows/admin-api`; those import nothing at runtime, so a bundle can
use them for an optional plugin too. The AI plugin's api carries its "describe it" dialog
(`DesignDialog`, with `useDesignRun` for the job's state), which the website plugin's theme
and block design dialogs are built on. The admin installs
bundles in the server's [boot order](./dependencies.md#boot-order), so a bundle's `setup` sees
the apis of the plugins it requires; others are there once every bundle is installed, when
the first page renders.
