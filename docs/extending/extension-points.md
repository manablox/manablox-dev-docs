---
title: 'Extension points and contributions'
description: 'Let a plugin declare points that other plugins fill, and fill those of others.'
---

A [plugin](./plugins.md) can be extended by other plugins the way core is extended by
plugins. It declares **extension points**, named lists of entries; other plugins fill them
with **contributions**. Contributions are plain data, resolved once every plugin is loaded,
so two plugins may contribute to each other.

```ts
import { definePlugin, extensionPoint } from '@manablox/core';

export interface Greeter {
  word: string;
}

export const helloExtraPlugin = () =>
  definePlugin({
    name: 'hello-extra',
    extensionPoints: {
      greeters: extensionPoint<Greeter>({
        description: 'Words the greeting board greets with.',
        check(entry, contributor) {
          if (!/^\p{L}+$/u.test(entry.word)) throw new Error(`${contributor}: one word, please`);
        },
      }),
    },
    // A plugin may fill its own points, through the same list.
    contributions: { 'hello-extra': { greeters: [{ word: 'Hi' }] } },
  });
```

```ts
// Another plugin
definePlugin({
  name: 'hello',
  enhances: ['hello-extra'],
  contributions: {
    'hello-extra': { greeters: [{ word: 'Hello' }, { word: 'Servus' }] },
  },
});
```

`contributions` is keyed by the target plugin's id, then the point. Declare the target in
`enhances` (or `requires`) so it boots first where it can; see [Dependencies](./dependencies.md).

## Checks

| Case | What happens |
| --- | --- |
| The target plugin is not configured | Its contributions are skipped, with a debug log line |
| The target is configured but has no such point | The server refuses to start with `plugin.contribution.unknown` |
| The point's `check(entry, contributor)` throws | The server refuses to start with that error |

## Reading them

The target reads a point's entries from its [context](./services.md#the-plugin-context), in
boot order, each tagged with the id of the plugin that contributed it:

```ts
// All entries: [{ plugin: 'hello-extra', entry: { word: 'Hi' } }, { plugin: 'hello', ... }]
const all = plugin.contributions<Greeter>('greeters');

// Those that are on in a space
const here = await plugin.contributions<Greeter>('greeters', spaceId);
```

With a space (`null` for the instance) only entries whose contributing plugin has its flag on
there come back, and none while the target itself is off: an entry counts only where both
plugins are on. Use that form wherever the entries act in a space.

## Types

The target types its points for contributors by augmenting `PluginContributions`, keyed by
its id and then by point:

```ts
declare module '@manablox/core' {
  interface PluginContributions {
    'hello-extra': { greeters: Greeter };
  }
}
```

A plugin that imports the target's types then gets its contributions checked by
`definePlugin`; without them the entries are `unknown`. `ContributionOf<'hello-extra',
'greeters'>` names an entry's type, for the target's own code.

The admin has the same idea for components: [plugin slots](./plugin-slots.md).
