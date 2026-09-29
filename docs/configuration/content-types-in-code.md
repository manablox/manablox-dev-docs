---
title: 'Content types in code'
description: 'Declaring content types and fields in the config file: every option of `defineContentType`, with the same meaning as the switches in the admin.'
---

A content type in the config file is the same thing an editor builds under **Content
types** in the admin, written down. Put it in `contentTypes` of `defineConfig()`, or
declare it with `defineContentType()` and import it: the result is identical.

```ts
import { defineContentType } from '@manablox/core';

export const teaser = defineContentType({
  name: 'teaser',
  label: 'Teaser',
  kind: 'block',
  fields: [
    { name: 'headline', type: 'string', required: true },
    { name: 'body', type: 'richtext' },
    { name: 'image', type: 'asset', settings: { accept: ['image/'] } },
  ],
});

export const page = defineContentType({
  name: 'page',
  label: 'Page',
  icon: 'doc',
  hasSlug: true,
  isPublishable: true,
  fields: [
    { name: 'summary', type: 'string', settings: { editor: 'textarea', max: 300 }, localized: true },
    {
      name: 'components',
      type: 'blocks',
      settings: { types: [teaser.id] },
      admin: { zone: 'main' },
    },
    { name: 'meta_title', type: 'string', settings: { max: 60 }, admin: { zone: 'sidebar' } },
  ],
});
```

## Type options

| Option | Default | Meaning |
| --- | --- | --- |
| `name` | required | The technical name: `^[a-z][a-z0-9_-]*$`. Becomes the GraphQL type name (`blog-post` -> `BlogPost`) and the `type` a frontend sees. **Immutable** once documents exist |
| `label` | from `name` | What the admin shows |
| `description`, `icon` | | `icon` is the symbol the admin draws for the type everywhere it appears - the tree, the lists, the pickers. It is one of the admin's own icon names, the set the builder's Icon picker offers - Lucide icons chosen for what a type is about (`newspaper`, `book-open`, `calendar`, `map-pin`, `shopping-bag`, `building-2`, `image`, `video`, ...); a name it does not ship falls back to the default for the kind |
| `kind` | `content` | `content` lives in the tree; `block` only ever lives inside another document's block field; `data` is a [databag](../admin/databags.md), flat records outside the tree |
| `spaceId` | `null` | `null` means global: available in every space. Set it to confine a code type to one space |
| `hasSlug` | `true` | The type has a slug and a permalink, so its documents are pages with URLs. Off for a container or a data record |
| `isPublishable` | `true` | Documents have a draft and a published state. Off for a type that is live as soon as it is saved |
| `isVisibleInTree` | `true` | Documents appear in the admin's content tree and can be created from it |
| `canBeVisibleInMenu` | `true` | Documents may be added to a [menu](../admin/menus.md) |
| `requiresApproval` | `false` | Documents go through [review](../admin/notifications.md#approval-before-publishing): an author who cannot publish asks, whoever can is told. Ignored when `isPublishable` is off |
| `plugins` | | Data for plugins by plugin id, checked by each plugin when the config loads. The website plugin takes a `BlockDesign` on block types (`plugins.website`), which a [designed site](../site/themes.md#a-design-for-a-block-type) uses until a space stores its own. Data for a plugin that is not loaded is refused (`contentType.plugin.unknown`), invalid data too (`contentType.plugin.invalid`) |
| `id` | derived from `name` | Leave it out. Pinning an id ties the config to one database |

A block type may not set `hasSlug`, `isPublishable`, `isVisibleInTree`,
`canBeVisibleInMenu` or `requiresApproval` (a block is not a page), and the config refuses to load if it
does (`contentType.block.flagsNotAllowed`). A databag type may not turn on `hasSlug`,
`isVisibleInTree` or `canBeVisibleInMenu` (`contentType.data.flagsNotAllowed`); it
keeps `isPublishable` and `requiresApproval`.

Every document additionally carries the built-in fields (`title`, `slug`, `permalink`,
`status`, `publishedAt`, `parentId`, `position`, `locale`, `createdAt`, `updatedAt`,
`version`), which follow the switches above. Do not declare fields with those names.

## Field options

| Option | Default | Meaning |
| --- | --- | --- |
| `name` | required | Technical name, same rules as a type's. Immutable: it is part of the GraphQL schema |
| `label` | from `name` | Shown in the editor |
| `type` | required | A field type's name: `string`, `richtext`, `number`, `boolean`, `date`, `select`, `asset`, `content`, `user`, `block`, `blocks`, or one you added. See [Field types](../content-model/field-types.md) |
| `settings` | `{}` | The field type's own settings, validated by its `settingsSchema` |
| `required` | `false` | A save without a value is refused (`field.required`) |
| `localized` | `false` | Each translation keeps its own value. Off, the value is shared: saving one translation copies it to the others. See [Locales and translations](../content-model/localisation.md) |
| `unique` | `false` | Recorded on the definition and carried through the admin's config export; the server does not enforce it yet |
| `readRoles` | everyone | Roles that may read the field. A field with `readRoles` is **absent from the public GraphQL schema**, not present-and-null |
| `writeRoles` | everyone | Roles that may change it |
| `admin.zone` | `main` | `main` or `sidebar`: which column of the editor |
| `admin.width` | `100` | Percent of the column |
| `admin.position` | its index | Order within the zone |
| `admin.help`, `admin.placeholder` | | Text under and inside the input |

`blocks` and `block` settings name the allowed block types **by id**. A code-defined
type's id is derived from its name, so `teaser.id` above is stable across databases;
a runtime type's id is the one shown in the admin.

## Fields for several types

A group of fields several types share, such as search engine fields, is either a list the
config spreads into each type, or fields a plugin adds with `extend` to types declared in
the config or by another plugin (settings of a field two plugins touch are merged). The
first keeps the type's fields in one place; the second lets a plugin bring its fields along.
See [Adding fields to other content types](../extending/plugins.md#adding-fields-to-other-content-types).

```ts
import { defineContentType, type FieldInput } from '@manablox/core';

const seoFields: FieldInput[] = [
  { name: 'meta_title', type: 'string', settings: { max: 60 }, admin: { zone: 'sidebar' } },
];

export const article = defineContentType({
  name: 'article',
  fields: [{ name: 'body', type: 'richtext' }, ...seoFields],
});
```

## From the admin to code

Build the type in the admin, then let the admin write this file for you: **Settings >
Spaces > Transfer > The space as config** renders the runtime types of a space as
`defineContentType` calls, along with its workflows, endpoints, vault slots and templates
if you tick them. What to watch for when you deploy the result is in
[Moving a space](../admin/transfer.md#the-space-as-config).
