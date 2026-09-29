---
title: 'Building content types'
description: 'The content type builder: document and block types, the switches, the built-in fields, adding and ordering fields, and what cannot change after saving.'
---

**Content types** lists what can be written in the space: document types on one side,
block types on the other, and a count of each. Types marked *code* come from the config
file and are read-only here; everything else was built on this page and behaves
identically. See [How content is organised](../content-model/index.md) for what the two
kinds are.

**Describe it** on either card, or **Describe a content model** above them, designs types
from a sentence or two instead: a document type and the block types it needs, or a block
type on its own, previewed with every field before anything is created. See
[Designing with AI](./ai.md#designing-with-ai). It is there when the instance loads the
[AI plugin](./ai.md#the-ai-plugin) and the space has an AI provider that writes text.

**New document type** or **New block type** opens the builder. It normalises through the
same `defineContentType` as a code-defined type, so what you build here and what
[Content types in code](../configuration/content-types-in-code.md) describes are the same
shape, option for option.

## The type

Label comes first, and the technical name fills itself in from it with the same
correction as a space's. It is **immutable once the type is saved**: it becomes a GraphQL
type name and the `type` a frontend matches on.

**Icon** picks the symbol that stands for the type everywhere the admin shows it: the
content tree, the type list, the New menus, the pickers, a block's header and the editor
heading. The list is Lucide icons chosen for what a type is about - an article, a book,
an event, a place, a product, a person - rather than for the admin's own controls. Leave
it on *Default* and a document type keeps the page icon and a block type the blocks icon.
The choice is part of the type, so it travels with an export and is carried by `icon` in
a code-defined type.

A document type has five switches (*Has a slug and permalink*, *Publishable*, *Visible
in tree*, *Can appear in menus*, *Needs approval before publishing*) explained in
[How content is organised](../content-model/index.md#content-types). A block type has
none of them. The last one is only offered on a publishable type; what it sets in
motion is described in [Notifications and approvals](./notifications.md#approval-before-publishing).

## Built-in fields

Every document carries columns that are not in the type's field list, and the builder
shows them in a collapsible **Built-in fields** panel. Which ones apply follows the
type's own switches, so the list reacts as you toggle them:

| Field | Present when |
| --- | --- |
| `title` | Always |
| `slug`, `permalink` | "Has a slug and permalink" |
| `status`, `publishedAt` | "Publishable" |
| `parentId`, `position`, `locale`, `createdAt`, `updatedAt`, `version` | Always |

Do not declare a field of your own with one of these names. A block type has none of
them (its values live inside the document that embeds it), so the panel is hidden for
blocks.

## Fields

**Add field** offers every registered field type: the built-in fourteen and any a plugin
added. Each field has:

- a **label** and a **technical name** that follows the label until you type one yourself, and locks once the type is saved. Field names are part of the published GraphQL schema, so the server refuses a rename (`contentType.field.name.immutable`). Changing one means removing the field and adding it again;
- the field type's **own settings**, rendered from the type's settings schema: the allowed block types of a `blocks` field, the sub-fields of a `repeater` (a nested field list of their own), the options of a `select`, the editor of a text field;
- the general options, **required**, **localised**, **unique**, **read roles** and **write roles**, and the **layout**: which zone of the editor (main column or sidebar), the width, help text and a placeholder.

**Required** refuses a save while the field is empty: blank or whitespace-only text, rich
text without content and an empty list all count. **Unique** refuses a value another
document of the type already holds; it applies to text, number, date and single select or
reference fields. Both are enforced by the server, which marks the field in the editor.
The exact rules, including how locales are compared, are in
[Field types](../content-model/field-types.md#required-and-unique).

Fields are reordered by dragging: the gap between two rows is the drop target, so you
choose an order rather than displace a neighbour. The up and down buttons do the same
thing from the keyboard. The order is the `admin.position` the editor renders by.

A `blocks` field needs at least one allowed block type, so **build block types first**,
then the document types that use them.

## Changing a type that has documents

- Adding a field is safe: existing documents return an empty value for it until they are next saved.
- Removing a field drops its values from the API immediately; the stored values remain in old versions.
- Changing a field's settings re-validates on the next save of each document; a document that no longer validates cannot be saved until it is fixed.
- A type cannot be deleted while any document uses it (`contentType.inUse`).

Saving a type reloads the registry and the GraphQL schema on the spot; a frontend sees
the new field on its next request.

## From here to code

A space's runtime types can be exported as `defineContentType` source from **Settings >
Spaces > Transfer**. See [Moving a space](./transfer.md#the-space-as-config).
