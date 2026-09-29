---
title: 'Field types'
description: 'The fourteen built-in field types: what each stores, its settings, how it looks in the API, and which filters it supports.'
---

A field type is **one object** that carries everything the system needs: how its
settings are validated, how a value is validated given those settings, how it is stored
and indexed, how it appears in GraphQL, which filters it supports, what it contributes to
search, and which admin components render it. The built-in ones come from
`@manablox/fields`; [Custom field types](../extending/custom-field-types.md) shows how to
add your own.

## At a glance

| Name | Admin label | Stores | In GraphQL | Filters |
| --- | --- | --- | --- | --- |
| `string` | Text | text | `String` | `eq`, `neq`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `isNull`, `isNotNull` |
| `richtext` | Rich text | a ProseMirror JSON document | `JSON` | `isNull`, `isNotNull` |
| `number` | Number | number | `Int` or `Float` | `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in`, `notIn`, `isNull`, `isNotNull` |
| `boolean` | Boolean | boolean | `Boolean` | `eq`, `neq`, `isNull`, `isNotNull` |
| `date` | Date | ISO string | `DateTime` | `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `isNull`, `isNotNull` |
| `select` | Select | one option value, or a list | `String` or `[String]` | `eq`, `neq`, `in`, `notIn`, `isNull`, `isNotNull` |
| `link` | Link | one address, internal or external | `Link` | `isNull`, `isNotNull` |
| `asset` | Asset | asset id, or a list | `Asset` or `[Asset]` | `eq`, `neq`, `in`, `notIn`, `isNull`, `isNotNull` |
| `content` | Content reference | document id, or a list | `ContentNode` or `[ContentNode]` | same |
| `user` | User reference | user id, or a list | `User` or `[User]` | same |
| `block` | Block | one nested block | the block's type | `isNull`, `isNotNull` |
| `blocks` | Blocks | `{ grid, blocks }`: an ordered list of blocks and the grid they sit on | `BlockList` | `isNull`, `isNotNull` |
| `template` | Content template | the id of a template document | `BlockList` (the template's blocks, inlined) | `eq`, `neq`, `in`, `notIn`, `isNull`, `isNotNull` |
| `repeater` | Repeater | an ordered list of items, each made of the same sub-fields | a list of an object type generated for the field | `isNull`, `isNotNull` |
| `databag` | Databag type | the id of a databag type (`kind: 'data'`) | `String` | `eq`, `neq`, `in`, `notIn`, `isNull`, `isNotNull` |

Filters apply to the management API's `content.list` and are what the query layer
accepts for a field; an operator outside the list is refused rather than run unindexed.
The public delivery surfaces filter by type, parent, subtree and search only.

## Required and unique

Every field can be marked **required** and **unique** in the type builder. Both are
checked by the server on every save (create, update, restore), drafts included, and refused
with `content.validation.failed` carrying one detail per field, at the field's path, so the
editor marks the field.

**Required** (`field.required`) refuses a missing value and an empty one. What counts as
empty depends on the field type:

| Type | Empty |
| --- | --- |
| `string` | `null`, `''`, or only whitespace |
| `richtext` | a document without text, an image or a divider (`<p></p>` is empty) |
| `select` | `null`, `''`, or `[]` when multiple |
| `asset`, `content`, `user` | `null`, or `[]` when multiple. A standing query stores nothing and is never empty |
| `blocks` | no blocks |
| `repeater` | no items |
| `date` | `null` or `''` |
| `number`, `boolean`, `link`, `block`, `template`, `databag` | `null` only, so `0` and `false` are values |

**Unique** (`field.unique`) refuses a value another document of the same type in the same
space already holds. It applies to `string`, `number` and `date` fields and to single (not
multiple) `select`, `asset`, `content` and `user` fields; on any other field it has no
effect, and it has none on fields of a block type. The rules:

- Values compare exactly: `Shoe` and `shoe` are different, and nothing is trimmed.
- Empty values (as in the table above) are never compared, so any number of documents may leave the field empty.
- Translations of one document never clash with each other.
- A translated field is compared within one locale: two documents may share a value if they are in different locales. A field that is not translated holds one value for all translations, so it is compared across every locale.
- A save compares with the other documents' drafts; a publish compares the document with the other documents' live copies. A value an older live copy still holds can therefore be saved into a draft of another document, but not published until that live copy changes.
- A duplicated document starts with its unique fields at their defaults.
- A number field defaults to `0`, which is a value, so with unique on, every document after the first needs its own number.

The check is a query before the write, not a database constraint, so two saves in the same
instant can both pass.

## Text (`string`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `editor` | `input` | `input` (one line), `textarea`, or `code` |
| `language` | | Syntax highlighting hint for `code` |
| `min`, `max` | | Length limits |
| `pattern` | | A regular expression the value must match, anchored |
| `default` | `''` | |

Contributes to full-text search. A `code` field is not indexed.

## Rich text (`richtext`)

Stores a ProseMirror document (the JSON Tiptap produces), not HTML. That keeps it
queryable and lets a frontend render it however it likes. The SDK ships a renderer,
`richTextToHtml`, that turns the document into escaped HTML with bold, italic, links
and the other marks intact; see [the SDK](../delivery/sdk.md). The text content feeds
search.

| Setting | Default | Meaning |
| --- | --- | --- |
| `toolbar` | `bold, italic, link, heading, bulletList, orderedList` | Which tools the editor offers, in the panel and in place in the visual editor. Also available: `strike`, `code`, `blockquote`, `codeBlock`, `horizontalRule`, `alignLeft`, `alignCenter`, `alignRight` |
| `maxLength` | | |

A value looks like the document below. Anything writing a value from outside the editor
(an API client, a workflow, an AI agent) may send an HTML string instead: it is read
into the same nodes and marks the editor produces (`p`, `h1` to `h6`, `ul`, `ol`, `li`,
`blockquote`, `pre`, `hr`, `br`, `strong`, `em`, `s`, `code`, `a`) and stored as the
document. Tags it does not know keep their text; a string with no tags at all is read as
paragraphs separated by blank lines.

```json
{ "type": "doc", "content": [
  { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Hello" }] },
  { "type": "paragraph", "content": [
    { "type": "text", "text": "Some " },
    { "type": "text", "text": "bold", "marks": [{ "type": "bold" }] }
  ] }
] }
```

## Number (`number`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `integer` | `false` | Whole numbers only; the GraphQL type becomes `Int` |
| `min`, `max`, `step` | | |
| `format` | `plain` | Display hint: `plain`, `currency`, `percent`; with `currency`, a three-letter code |
| `default` | `0` | |

## Boolean (`boolean`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `default` | `false` | |
| `display` | `switch` | `switch` or `checkbox` |

## Date (`date`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `mode` | `datetime` | `date` stores `YYYY-MM-DD`; `datetime` stores a full ISO-8601 instant |
| `min`, `max` | | |
| `default` | | |
| `defaultNow` | `false` | Fill in the current time when a document is created without a value |

## Select (`select`)

A constrained choice, kept introspectable rather than as a regex.

| Setting | Default | Meaning |
| --- | --- | --- |
| `options` | required | `[{ value: 'news', label: 'News' }, ...]` |
| `multiple` | `false` | A list of values |
| `default` | | |

## Link (`link`)

One address: a document in this space, or somewhere else entirely. Both ends live on the
same value, so switching between them in the editor keeps what was typed on the other,
and a consumer reads `href` and `target` without knowing which end it came from.

| Setting | Default | Meaning |
| --- | --- | --- |
| `allowInternal` | `true` | The link may point at a document in this space |
| `allowExternal` | `true` | The link may point at an address elsewhere |
| `types` | any | Content type ids an internal link may point at |
| `allowLabel` | `true` | Offer the editor link text of their own |
| `allowTarget` | `true` | Offer the same-tab / new-tab choice |
| `defaultTarget` | `_self` | `_self` or `_blank`; the only target when `allowTarget` is off |

The stored value is:

```json
{ "mode": "internal", "contentId": "...", "url": null, "target": "_blank", "label": "Read on" }
```

An external address typed without a scheme is given the benefit of `https://`. Anything
that executes when it is clicked, such as `javascript:` or `data:`, is refused on save,
so no renderer downstream has to remember to strip it. `mailto:`, `tel:`, a
root-relative path and a fragment are all accepted.

Delivery resolves the address. REST and the SDK add an `href` to the value: the external
address, or the internal document's permalink. GraphQL exposes a `Link` object with
`mode`, `url`, `href`, `target`, `label` and `content` (the referenced document, as
`ContentNode`). An internal link whose document is gone or not published has a `null`
`href`, which is the honest answer rather than a broken address. Naming the field in
`expand` adds the document itself over REST.

## Asset, content and user references

All three share `multiple`, `min` and `max`. The stored value is an id or a list of
ids; the API resolves it to the related object: always in GraphQL, with `expand` over
REST and in the SDK.

| Type | Extra settings |
| --- | --- |
| `asset` | `accept`: MIME families the picker offers, e.g. `['image/']`; `presets` and `sizes` (see below); `default` |
| `content` | `types`: content type ids the field may point at (empty means any); `under`: restrict candidates to a subtree; `default` |
| `user` | |

A content reference to a document that is not published resolves to nothing on the
public API.

### A standing query instead of a list

A multi-valued `asset` or `content` field can be a **query** rather than a list somebody
chose. Set `selection` to `filter` and the field stores nothing: delivery resolves the
matching rows on every read, so the list is never stale. The document editor shows what
matches, read-only, because the query lives on the content type.

| Setting | Default | Meaning |
| --- | --- | --- |
| `selection` | `pick` | `pick` is the editor choosing; `filter` is a standing query. Needs `multiple` |
| `limit` | `10` | Page size, up to 100 |
| `offset` | `0` | How far into the result the page starts |
| `search` | | Free text the query narrows by |
| `sortBy` | `position` | `content` only: `position`, `title`, `createdAt`, `updatedAt`, `publishedAt` or `slug` |
| `sortDirection` | `asc` | `content` only |

A `content` query is narrowed further by the field's own `types` and `under`; an `asset`
query by the first family in `accept`. Such a field holds no references, since what it
delivers is not what is stored.

On a public instance a query follows published content, as every public read does: a
`content` query lists published documents only, and an `asset` query lists only the assets
of the space that a published document references (see
[Which assets a public instance serves](../configuration/storage-and-media.md#which-assets-a-public-instance-serves)).
The management instance and preview list every matching asset of the space.

### Renditions an image field asks for

An asset field that accepts images and nothing else can say which renditions it wants
delivered, rather than taking every preset the instance configures.

| Setting | Default | Meaning |
| --- | --- | --- |
| `presets` | all of them | Names of the configured presets this field delivers |
| `sizes` | none | Renditions by measurement: `{ name, width, height, fit, format, quality }` |

A size appears in the delivered `variants` map under the `name` the field gave it, while
the file it renders is named after its measurements, so two fields wanting 800x450 share
one rendered image. One dimension may be left out to keep the aspect ratio. Only a preset
the configuration or some field names is ever rendered, which is what keeps the transform
endpoint from being an open resize service. See
[Storage and media](../configuration/storage-and-media.md).

## Block and blocks

`block` holds one block of a single type (`type`: the block type's id). `blocks` holds an
ordered list (the page-builder field) from a set of allowed types (`types`, at least
one), with optional `min` and `max`. Both are validated recursively, and a block's own
fields may include further block fields.

A stored block is `{ blockId, type, fields }`, where `type` is the block type's **id**.
The delivery APIs and the SDK present it by **name** instead. A block may also carry
`layout` (below) and `ext`: data of plugins by plugin id, such as the website plugin's
[block design](#block-design). Each plugin checks its own entry on save; entries of plugins
that are not loaded or are switched off for the space keep their stored value, whatever a
write sends for them. `ext` is never
delivered as it is; a plugin may deliver its entry under a key of its own. See
[Block extensions](../extending/block-extensions.md).

### Laying blocks out on a grid

A `blocks` value is `{ grid, blocks }`: the blocks, and the grid this document lays
them out on. The grid belongs to the document, not the content type, so one page can be
three columns and the next a single column with the same field; it is chosen in the
document editor, under the blocks field, per breakpoint. No grid (or one desktop column
and nothing else) is a plain list. A bare array is refused.

| Grid key | Default | Meaning |
| --- | --- | --- |
| `desktop` | one column | `columns` (up to 12) and an optional fixed `rows` count |
| `tablet` | the desktop grid | The grid below 1024px |
| `mobile` | one column | The grid below 640px |

Every block on a grid may carry a `layout`: its position and size in 1-based grid lines,
with `tablet` and `mobile` placements of their own where they differ from desktop.

```json
{ "grid": { "desktop": { "columns": 3 }, "tablet": { "columns": 2 } },
  "blocks": [
    { "blockId": "...", "type": "...", "fields": { "headline": "Hi" },
      "layout": { "column": 2, "row": 1, "columnSpan": 2, "rowSpan": 1,
                  "tablet": { "column": 1, "row": 1, "columnSpan": 2, "rowSpan": 1 } } }
  ] }
```

A breakpoint without its own placement follows the desktop one when its grid has the
same number of columns, and is placed by the grid (after the last positioned block)
otherwise. The admin edits the layout on a board of the grid, in the document editor
and in the visual editor, one breakpoint at a time, each card named after its block's
summary; a block that reaches past the last column (or row, when rows are fixed) at
any breakpoint is rejected on save. Delivery serves the value as `{ grid, blocks }` with
the grid resolved for every breakpoint (`null` for a plain list), and the SDK turns it
into CSS; see [the SDK](../delivery/sdk.md#block-grids).

### Block design

With the website plugin, a block may carry a design at
`ext.website`: how a designed site (a space rendered by the website process rather than a
code frontend) shows it. `variant` names one of the variants of the block type's design (a
name the design lacks renders its default one), and `style` overrides a few properties of
the block's root with theme tokens.

| Style key | Values |
| --- | --- |
| `background` | A color token, `color:<name>`, optionally with an opacity, `color:<name>/50` |
| `backgroundImage` | `{ assetId, position?, size?, repeat? }` |
| `paddingY`, `paddingX`, `gap` | A space token, `space:<name>`, or `0` |
| `textAlign` | `left`, `center` or `right` |
| `width` | `contained` or `full` |
| `hide` | The breakpoints it is hidden at: `desktop`, `tablet`, `mobile` |

```json
{ "blockId": "...", "type": "...", "fields": { "headline": "Hi" },
  "ext": { "website": { "variant": "dark", "style": { "background": "color:primary", "hide": ["mobile"] } } } }
```

Any other key is rejected on save. The design is part of the document, so it is
versioned, published, copied and transferred with it. Delivery includes it on a block
only where a variant or a style is set and the website plugin is on for the space: REST
as `design`, GraphQL as the `design` field of the `Block` interface (`variant` and `style`
as JSON). A code frontend may use it or ignore it; its types are `BlockInstanceDesign` and
`DesignedBlock` in `@manablox/site/sdk`. A frontend reading it through the delivery SDK
names the key, so a GraphQL block keeps it out of its fields as REST does:

```ts
const cms = createClient({ url: 'https://cms.example.com', blockExtensions: ['design'] });
```

## Repeater (`repeater`)

A list of items where every item is made of the same set of fields, defined inline on the
field. Those **sub-fields** belong to the repeater, not to a block type, so a small
structured list (quotes, team members, opening hours) needs no block type of its own.

| Setting | Default | Meaning |
| --- | --- | --- |
| `fields` | required | The sub-fields every item is made of, see below |
| `min`, `max` | | How many items the field may hold |

A sub-field has a `name` (the machine name, unique within the repeater), a `label`, a
`type` (any registered field type, including `asset`, `content`, `link`, `block`, `blocks`
and another `repeater`), the `settings` for that type, `required`, and the admin hints
`admin.width`, `admin.help`, `admin.placeholder` and `admin.position`. A sub-field is never
translated on its own and has no `unique`, `readRoles` or `writeRoles`; to translate the
items, mark the whole repeater field translatable. Repeaters nest two levels deep: a
repeater inside a repeater is fine, a third level is refused with
`contentType.field.subFields.tooDeep`.

In code, with `defineContentType`:

```ts
{ name: 'quotes', type: 'repeater', settings: { max: 10, fields: [
  { name: 'quote', type: 'string', required: true },
  { name: 'author', type: 'string' },
  { name: 'photo', type: 'asset' },
] } }
```

The stored value is a list of items, `[]` by default. Each item has its own `itemId` and
its sub-field values under `fields`:

```json
[
  { "itemId": "...", "fields": { "quote": "Simply works.", "author": "Ada", "photo": "<asset id>" } }
]
```

Required on the repeater means at least one item; required on a sub-field is checked in
every item, and an error inside an item carries the path `[field, itemIndex, subField]`,
so the editor marks the right input. The field is not indexed, and only `isNull` and
`isNotNull` filter it. The text of the sub-fields feeds search, asset and content ids in
the items count as usages and travel with an export and import, and a duplicated document
gives every item a fresh `itemId`.

Delivery treats items the way it treats blocks. REST and the SDK serve each item as
`{ itemId, fields }` with links resolved and expanded references inlined, and `/v1/types`
describes the field with kind `items` and its sub-fields. GraphQL serves a list of an
object type generated for the field (for example `ArticleQuotesItem`; the exact name
appears in the schema) with `itemId` and one field per sub-field, where references, links
and blocks resolve as they do at the top level.

In the admin, the content type editor shows a nested field list inside the repeater's
settings to add and arrange sub-fields; the document editor lets editors add, remove,
reorder and collapse items.

## Content template (`template`)

Holds the id of a **template**: a document of the built-in `template` type, whose one
field is a `blocks` field. Several documents can point at the same template, and editing
the template changes all of them at once.

| Setting | Default | Meaning |
| --- | --- | --- |
| `templates` | every template in the space | The template documents this field offers |
| `default` | | The template a new document starts with |

The field stores an id, but delivery does not: REST, GraphQL and the SDK all serve the
**template's own block list**, in the same shape a `blocks` field has, so a frontend
renders it with the block renderer it already has and never learns a template was
involved. Nothing has to be asked for with `expand`.

A template is published like a page. Until it is, a document pointing at it delivers an
empty block list. Templates are managed on the admin's Templates page, and stay out of
the content tree; see [Editing content](../admin/editing-content.md#templates).

## Databag type (`databag`)

Holds the id of a **databag type**: a content type of kind `data` in the same space, or a
global one. It is meant for site forms: a `form` element bound to the field stores what
visitors send in the type the editor picked, and asks for all of its fields (see
[Forms](../site/forms-links.md#forms)).

| Setting | Default | Meaning |
| --- | --- | --- |
| `types` | every databag type in the space | The databag types this field offers |

A value that is not a databag type of the space is refused with `field.databag.notFound`
at the field's path. Delivery serves the id as a string.

## What a field type declares

For reference, the pieces of a definition: [Custom field types](../extending/custom-field-types.md)
walks through writing one:

- **`settingsSchema`**: validated when a content type is saved.
- **`valueSchema(settings)`**: the value schema, derived from those settings.
- **`defaultValue(settings)`**: what a new document starts with.
- **`isEmpty(value, settings)`**: when a value counts as empty for required and unique; `null` always does.
- **`unique`**: whether the unique rule applies, or a function of the settings.
- **`storage`**: `jsonb` (the default) or `column`; and which index to build.
- **`filters`**: the operators the query layer accepts.
- **`graphql`**: how the field appears in the generated schema.
- **`search`**: text contributed to the document's full-text index.
- **`references`**: ids the value points at, so relations batch and asset usage is tracked.
- **`blocks`** and **`nested: true`**: for types that hold blocks.
- **`subFields`** and **`items`**: for types that hold items made of sub-fields, like `repeater`.
- **`admin`**: the keys of the input and settings components the admin renders.
