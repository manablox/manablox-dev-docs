---
title: 'Block extensions'
description: 'Plugin data on block instances and code content types: checked on save, delivered under a key of its own.'
---

A plugin can keep data of its own on every block of a document, next to the block's
fields. The website plugin keeps each block's design this way. Core stores the data, runs
the plugin's check on save and hands it to the plugin for delivery; it never reads it.

## Where the data lives

A stored block carries it in `ext`, by plugin id:

```json
{ "blockId": "...", "type": "<block type id>", "fields": { "headline": "Hi" },
  "ext": { "website": { "variant": "dark" }, "acme": { "tone": "warm" } } }
```

`ext` is part of the document: it is versioned, published, copied, translated, moved
between environments and exported with it. The management API (RPC and export files)
reads and writes it as it is. The delivery APIs never show `ext`; a plugin delivers its
entry under a key of its own, or not at all.

## Declaring it

```ts
import { definePlugin } from '@manablox/core';

export const acme = definePlugin({
  name: 'acme',
  blocks: {
    instance: {
      validate: (value) =>
        typeof value === 'object' && value !== null && 'tone' in value
          ? []
          : [{ path: ['tone'], message: 'is required' }],
      strip: (value) => value,
    },
    publicApi: {
      field: 'tone',
      serialize: (value) => (value as { tone: string }).tone || undefined,
    },
  },
});
```

| Key | What it does |
| --- | --- |
| `instance.validate(value, context)` | Checks the plugin's entry on every save. Returns problems as `{ path?, message }`, paths relative to the entry; none means valid. `context` has the block's `type` id, `spaceId` and `locale`. Synchronous |
| `instance.strip(value)` | Optional. The value to store; `undefined` stores nothing, so an empty entry leaves no trace |
| `publicApi.field` | The block key REST and GraphQL deliver the entry at |
| `publicApi.serialize(value)` | The delivered value; `undefined` or `null` leaves the key out of REST and makes the GraphQL field `null` |
| `graphql.type(builder)` | The GraphQL type of the field, built with the schema's Pothos builder (`Builder` from `@manablox/api-graphql`). The field is added to the `Block` interface after `layout`. Optional `graphql.description` |

A problem fails the save with `content.validation.failed`, its path pointing into the
block, for example `['components', 'blocks', 0, 'ext', 'acme', 'tone']`.

## When the plugin is off

The data follows the plugin's flag (`features.plugins.<id>`) per space:

- On save, the stored entries of plugins that are not loaded, or that are off for the space, stay as they are: core carries each block's entry over by `blockId`, unchecked. Incoming values for those plugins are ignored, so a write can neither change nor remove them. A new document has nothing stored and gets none; copies and translations keep their source's.
- Delivery leaves the plugin's key out (REST) or answers `null` (GraphQL) where the plugin is off for the space. The GraphQL field itself stays in the schema.
- Turned back on, the plugin finds its data where it left it and delivers it again.

## Data on code content types

A content type declared in code (in the config or a plugin) can bring data for a plugin
under `plugins.<id>`. The owning plugin checks it when the config loads with
`contentTypeData.validate(value, type)`, which returns problems like `instance.validate`:

```ts
definePlugin({
  name: 'acme',
  contentTypeData: {
    validate: (value, type) => (type.kind === 'block' ? [] : [{ message: 'block types only' }]),
  },
});

defineContentType({ name: 'hero', kind: 'block', fields: [], plugins: { acme: { tone: 'warm' } } });
```

Data for a plugin that is not loaded, or that has no `contentTypeData`, stops the start
with `contentType.plugin.unknown`; a failed check with `contentType.plugin.invalid`. The
plugin reads the data from the resolved type, `type.plugins?.<id>`.

## The website plugin

The website plugin stores a block's design at `ext.website` (`{ variant?, style? }`, see
[Field types](../content-model/field-types.md#block-design)) and delivers it as `design`,
where it has a variant or a style. A code block type brings its default design at
`plugins.website`. The frontend types are in `@manablox/site/sdk`: `BlockInstanceDesign`,
`BlockInstanceStyle` and `DesignedBlock`. A frontend on the delivery SDK passes
`blockExtensions: ['design']` to `createClient` so GraphQL blocks keep it out of `fields`.
