---
title: 'Plugin controls'
description: 'Declare feature flags, limits, usage metrics, rate rules, retention and settings for a plugin.'
---

Besides its [flag](../configuration/controls.md#plugin-flags), a [plugin](./plugins.md) can
declare its own control keys under `controls`. They join the catalogue at start, so the
[control API](../reference/control-api.md) sets them per instance, group or space like the
core keys, and the admin reads them with the resolved controls.

```ts
import { definePlugin } from '@manablox/core';
import { z } from 'zod';

export const notesPlugin = () =>
  definePlugin({
    name: 'notes',
    controls: {
      'features.plugins.notes.pinning': { label: 'Pinned notes', description: 'Pinning notes.' },
      'limits.plugins.notes.count': {
        label: 'Notes',
        description: 'Notes of a space.',
        nouns: ['note', 'notes'],
      },
      'usage.plugins.notes.views': { description: 'Note views per period.' },
      'rateLimits.plugins.notes.writes': {
        description: 'Note writes per space.',
        default: { max: 60, windowSeconds: 60 },
      },
      'retention.plugins.notes.trashDays': { description: 'Days trashed notes are kept.' },
      'plugins.notes.title': {
        description: 'The title of the notes page.',
        default: 'Notes',
        schema: z.string().max(80),
      },
    },
  });
```

## Keys

Every key sits in the plugin's namespace, and its prefix sets its kind:

| Prefix | Kind | Value |
| --- | --- | --- |
| `features.plugins.<id>.` | feature | `{ enabled, presentation?, message?, link? }`, on unless `enabled: false` |
| `limits.plugins.<id>.` | count limit | `{ max, mode?, thresholds? }` |
| `usage.plugins.<id>.` | usage per period | `{ max, mode?, thresholds? }` |
| `rateLimits.plugins.<id>.` | rate rule | `{ max, windowSeconds }` or `null`; `default` sets the value while no scope does |
| `retention.plugins.<id>.` | retention | days or a count, or `null`; `default` likewise |
| `plugins.<id>.` | setting | whatever `schema` accepts; `default` is required |

Each key needs a `description`; `label` names it in the admin and `scopes` narrows where it
may be set (all three by default). A key outside the namespace is refused at start with
`plugin.key.invalid`. The flag `features.plugins.<id>` itself is not declared.

A feature may set `resolution`: `feature` (the default) is on only while no scope switches
it off; `mostSpecific` lets the narrowest scope that sets it win, for a flag a space may
switch on while the instance has it off, such as the website plugin's badge
(`features.plugins.website.badge`, `enabled: false`). Such a flag is not listed among the
features a scope has off. A write to any key of a plugin purges the cache tags its
[data providers](./data-providers.md#retention-limits-and-caches) name for the spaces the
write applies to.

A rate rule may set `concurrency: true`: it then caps how many of something run at once,
`{ max }` with no window and no default, instead of counting per window. It is taken with
`acquire` rather than `assertRate` (see below). The workflows plugin's
`rateLimits.plugins.workflows.concurrency` is one.

A declared key takes precedence over the flag pattern: `features.plugins.notes.pinning` is the
`pinning` feature of `notes`, never the flag of a plugin called `notes/pinning`. Loading both
such plugins is refused with `plugin.key.duplicate`.

## Using them

The keys work with the same calls as the core ones, without the kind prefix. Declare the
controls in their own module with `satisfies PluginControls` and name them through
`controlKeys(id, controls)` of `@manablox/core`, typed from the declaration, rather than as
strings; each plugin keeps them in its `keys.ts`:

```ts
// keys.ts
export const notesKeys = controlKeys('notes', notesControls);
// notesKeys.feature is 'plugins.notes', notesKeys.features.pinning 'plugins.notes.pinning',
// notesKeys.retention.trashDays 'plugins.notes.trashDays', notesKeys.settings.title
// 'plugins.notes.title'.

const { controls } = manablox;
await controls.assertFeature(spaceId, notesKeys.features.pinning);
await controls.assertLimit(scope, notesKeys.limits.count);
controls.consume(spaceId, notesKeys.usage.views, 1);
await controls.assertRate(spaceId, [{ rule: notesKeys.rateLimits.writes, key: spaceId }]);
// A concurrency rule: a slot, or null while the cap is reached; release it when done.
const slot = await controls.acquire(spaceId, 'plugins.notes.exports', ttlMs);
await slot?.release();
const resolved = await controls.resolved(spaceId);
resolved.retention['plugins.notes.trashDays'];
resolved.settings.plugins['notes.title'];
```

A limit is counted by a `counters` entry of one of the plugin's
[data providers](./data-providers.md#retention-limits-and-caches), under the key without its
kind prefix (`'plugins.notes.count'`). It gets the space ids of the scope being checked
(`'all'` at the instance). A declared limit that no provider counts is refused at start with
`plugin.key.invalid`. Rows written in a staging environment count toward no limit, as with the
core limits.

Usage metrics are counted with `consume`, appear in the usage report and the admin's usage
page next to the core ones, and `assertUsage` blocks once a hard limit on one is used up.

## Settings schema

`schema` is any [Standard Schema](https://standardschema.dev) (zod, valibot, ...) that
validates synchronously. A value it refuses is answered with `control.value.invalid`.

## Feature ceilings

A plugin can cap features above every scope with `ceilings`. It returns a provider once per
process, in every server mode, after the plugin's services are built, so it can read them.
Its values are never stored and are not written to the shared cache; each process resolves
under its own providers.

```ts
import { definePlugin, type FeatureControl, type FeatureKey } from '@manablox/core';

export const gatePlugin = () =>
  definePlugin({
    name: 'gate',
    services: () => ({ off: new Map<FeatureKey, FeatureControl>(), version: 0 }),
    ceilings: (plugin) => ({
      features: () => plugin.services.off,
      version: () => plugin.services.version,
      banners: () => [],
    }),
  });
```

| Method | Returns |
| --- | --- |
| `features()` | Feature values by key without the `features.` prefix (`plugins.notes`, `approvals`). It is called while resolving, so it must be synchronous and cheap |
| `version()` | A number that changes whenever `features` or `banners` does. Resolved controls are cached per version, so a new one takes effect on the next read |
| `banners()` | Optional. Admin banners shown before the ones the control API sets, dismissed per `id` like them |

A ceiling that is off joins a feature's scopes as the scope `ceiling`, before the instance:

- The feature is off wherever the ceiling has it off. No stored scope switches it back on.
- When the ceiling is the only scope that has it off, the feature takes its `message`, `link`
  and `presentation`. When a stored scope has it off too, the stored message and link win and
  the ceiling's fill in what they leave unset.
- A `mostSpecific` feature always takes the ceiling's values while the ceiling is off.
- A ceiling that is on changes nothing. When two providers have a feature off, the first in
  boot order wins.

The resolved controls, `feature`, `assertFeature`, `plugins.isOn`, the admin's `FeatureGate`
and the gating of the plugin's hooks, jobs and routes all follow the ceilings. The control
API lists them read-only under `ceilings` in `GET /settings`
([Control API](../reference/control-api.md#settings)).
