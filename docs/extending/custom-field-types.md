---
title: 'Custom field types'
description: 'Write a field type of your own: settings and value schemas, storage, filters, GraphQL, search, references, and the admin components, then register it.'
---

A field type is **one object** made with `defineFieldType()`. It carries everything the
system needs, so adding one touches no other file on the server: the registry, the
validator, the query builder, the GraphQL schema and the admin's field picker all read
the definition. The built-in types of [`@manablox/fields`](https://github.com/manablox/manablox-cms/tree/main/packages/fields/src) are the
reference; each is one file.

## A colour field

```ts
import { z } from 'zod';
import { defineFieldType } from '@manablox/core';

export const colorField = defineFieldType({
  name: 'color',
  label: 'Colour',
  icon: 'i-lucide-palette',

  settingsSchema: z.object({
    presets: z.array(z.string()).default([]),
    allowAlpha: z.boolean().default(false),
  }),

  valueSchema: (settings) =>
    z.string().regex(settings.allowAlpha ? /^#[0-9a-f]{6,8}$/i : /^#[0-9a-f]{6}$/i),

  defaultValue: (settings) => settings.presets[0] ?? '#000000',

  storage: { kind: 'jsonb', index: 'btree' },
  filters: ['eq', 'neq', 'in', 'isNull', 'isNotNull'],
  graphql: { type: { kind: 'scalar', name: 'String' } },

  admin: { input: 'color', settings: 'color' },
});
```

Register it and it appears in the admin's **Add field** menu, in the GraphQL schema, and
in the query allowlist:

```ts
export default defineConfig({
  fieldTypes: [colorField],
  // or from a plugin: plugins: [definePlugin({ name: '@acme/color', fieldTypes: [colorField] })]
});
```

## The pieces

| Key | What it does |
| --- | --- |
| `name` | The type's identifier, used as `type` in a field definition. Unique across the instance (`fieldType.name.duplicate`) |
| `label`, `icon`, `description` | What the admin shows in the field picker |
| `settingsSchema` | Validated when a content type is saved. Any [Standard Schema](https://standardschema.dev) implementation works: Zod, Valibot, ArkType; nothing in core imports Zod |
| `valueSchema(settings)` | The value schema, derived from the settings, so `max: 120` on one field does not affect another. Its issues surface as validation details on save |
| `defaultValue(settings)` | What a new document starts with |
| `isEmpty(value, settings)` | Optional. Whether a value counts as empty, so a required field refuses it and a unique one skips it. `null` always counts; without it nothing else does. Also called with input that failed `valueSchema`, so check the shape |
| `unique` | Optional. `true`, or a function of the settings, when the unique rule applies. Values compare by JSON equality, so leave it off for lists and objects |
| `storage` | `{ kind: 'jsonb', index }` (the default; a runtime-created type needs no migration) or `{ kind: 'column' }` to promote the field to a real typed Postgres column. `index` is `'btree'`, `'gin'` or `false`. May be a function of the settings |
| `filters` | The operators the query layer accepts for this field. Anything not listed is refused (`query.operator.unsupported`), so a client cannot force an unindexed scan |
| `graphql` | How the field appears in the generated schema: a scalar (`String`, `Int`, `Float`, `Boolean`, `DateTime`, `JSON`), a `ref` to `asset`, `content` or `user`, a `block`, or `items` for a list of items with sub-fields; with `list: true` for arrays. May be a function of the settings (`integer: true` -> `Int`) |
| `search(value)` | Text contributed to the document's full-text index, or `null` |
| `references(value)` | The ids a value points at, as `{ target, id }`, so relations batch through DataLoader and asset usage is tracked. A type that stores ids of assets or documents must declare this, or the public API cannot know which assets are in use |
| `blocks(value)` and `nested: true` | For a type that holds blocks: return the block values, so validation and traversal recurse |
| `subFields(settings)` and `items(value, settings)` | Optional. For a type that holds items made of sub-fields, like `repeater`: `subFields` returns the completed `FieldDefinition[]` every item follows, `items` the `{ itemId, fields }[]` a value holds. The server, GraphQL and delivery recurse into the items for validation, search, references and resolution. `@manablox/core` exports `fieldSubFields`, `fieldItems` and `itemsContentType` to walk them the same way |
| `admin` | **Component keys**, not imports: `input` names the editor component, `settings` the settings form, `summary: true` shows the value in listings. Field types run on the server too, and a bundler resolves an import specifier even inside an uncalled arrow function; keys keep the definitions isomorphic |

## The admin side

The keys in `admin` are resolved by the admin when it renders the field. A built-in key
maps to one of the admin's own field components; a plugin supplies its own
through its admin bundle:

```ts
// @acme/color/admin
import { defineAdminPlugin } from '@manablox/admin-plugin';

export default defineAdminPlugin({
  name: '@acme/color',
  fields: {
    inputs: { color: () => import('./ColorInput.vue') },
    settings: { color: () => import('./ColorSettings.vue') },
  },
});
```

An input component receives the field definition and the value and emits updates; it
reads the space, the locale, the error at its path and the content model from
`useFieldContext()` rather than from the app, so it renders wherever a field context is
provided: the document editor, a block, the visual editor. See [Admin plugins](./admin-plugins.md)
for building the bundle.

A settings component renders in the content type builder, below the built-in settings of
the field. It receives `settings` (the field's current settings object), `field` (the whole
field definition) and `readOnly` (the user may not change the type), and emits
`update:settings` with the complete new settings object. The server validates the result
against `settingsSchema` on save.

## Checklist

- A value that references other records declares `references`.
- `filters` lists only operators the storage index can serve.
- `valueSchema` rejects what `defaultValue` produces? Then the default is wrong: an empty string is not a valid date, so a date field defaults to `null`.
- A field type used by a **block** needs nothing extra; blocks validate recursively.
- Add a test next to the definition; the built-in types show the shape.
