---
title: 'How content is organised'
description: 'Spaces hold a tree of documents; documents have a type; a type is a list of fields; blocks nest inside fields. How the pieces fit, and how they show up in the API.'
---

```
instance
`-- space "website"                 one site: its own tree, locales, assets, menus, members
    |-- content types               page, blog-post, teaser (a block), ...
    |-- documents                   a tree, one row per document and locale
    |   |-- Home                    permalink ""   (the home page)
    |   |-- About                   permalink "about"
    |   |   `-- Team                permalink "about/team"
    |   |-- Campaigns               a folder: no permalink of its own
    |   |   `-- Spring              permalink "spring", not "campaigns/spring"
    |   `-- Blog                    permalink "blog"
    |       `-- First post          permalink "blog/first-post"
    |-- templates                   reusable block lists, referenced by a template field
    |-- assets                      uploaded files
    `-- menus                       main, footer, ...
```

## Spaces

A space is one site or channel. Everything below is scoped to a space; a user is a
member of a space with a role; a public API instance serves one space. Two spaces never
see each other's content, but code-defined content types are available in all of them.

## Content types

A content type is a named list of fields plus a few switches. There are three kinds:

- **Document types** (`kind: content`): pages, posts, products. Their documents live in the tree, may have URLs, and may be published.
- **Block types** (`kind: block`): teasers, galleries, quotes. A block is never stored on its own; it is a value inside a document's `block` or `blocks` field, with its own fields inside it. Blocks may nest: a *columns* block may hold a `blocks` field of its own.
- **Databag types** (`kind: data`): products, team members, FAQs. Their documents are flat records at the root, outside the tree and menus, without a slug. They may be published and are delivered like other documents. See [Databags](../admin/databags.md).

The switches on a document type (a databag type has only *Publishable* and *Needs approval before publishing*):

| Switch | On means |
| --- | --- |
| Has a slug and permalink | Documents are pages with a URL. Off for containers and data records: such a document has no permalink and never occupies a URL, and its descendants' permalinks skip it |
| Publishable | Documents have a draft and a published state |
| Visible in tree | Documents appear in the admin's tree |
| Can appear in menus | Documents may be added to a menu |
| Needs approval before publishing | An author who cannot publish the type asks for approval, and whoever can is told. Only on a publishable type. See [Notifications and approvals](../admin/notifications.md#approval-before-publishing) |

Types come from two places, the config file or the admin, and behave identically. See
[The config file](../configuration/index.md#code-defined-and-runtime-defined-content-types).

## Fields

Each field has a **field type** that decides everything about it: validation, storage,
how it appears in GraphQL, which filters it accepts, what it contributes to search, and
which input the admin renders. The built-in ones are on the next page,
[Field types](./field-types.md). A field's technical name is part of the API, so it
cannot be renamed once the type is saved; remove it and add a new one instead.

Every document also carries **built-in fields** that no type declares: `title`, `slug`
and `permalink` (when the type has a slug), `status` and `publishedAt` (when publishable),
`parentId`, `position`, `locale`, `createdAt`, `updatedAt` and `version`.

## Documents and the tree

A document is one row: a type, a space, a locale, a title, a slug, a parent, a position
among its siblings, and a value per field. Documents form a tree by parent, and the tree
is what the admin's **Content** page shows. Moving a document moves its whole subtree,
and every permalink beneath it is recomputed.

**Permalinks** are the joined slugs of the ancestors, root first: the *Team* page under
*About* is `about/team`. A type without a slug contributes nothing to the path, so a
*Blog* container without a slug would put its posts at `first-post` rather than
`blog/first-post`. Slugs must be unique among siblings, and permalinks unique in the
space per locale.

The **home page** is one document a space nominates (a star in the tree). The API serves
it for the empty permalink, so a frontend's `/` route needs no special case.

### Folders

A **folder** groups documents in the tree and nothing else. It is a document of the
built-in `folder` type, which has no slug, so it adds no level to the addresses of what
it holds: a page in a *Campaigns* folder is at `spring`, not `campaigns/spring`. A folder
is never published, never appears in a menu, and holds no fields of its own.

Creating one writes a folder in every locale of the space, sharing one localization
group, so the tree has the same shape in each language and a translated page is never
filed somewhere else. A nested folder is created under the parent folder's translation
in each locale; a locale where that parent has no translation is skipped.

Folders are created from the tree panel: the `+` at the top of the tree for one at the
root, or the `+` on a row for one inside it. Two folders under the same parent may share
a name: a type without a slug has none an author sees, so the one stored behind it is
made unique rather than reported as a clash. The same holds for templates.

### Templates

A **template** is a block list written once and used in many documents. It is a document
of the built-in `template` type, holding one `blocks` field, and a
[`template` field](./field-types.md#content-template-template) on a document type points
at it.

Templates are deliberately absent from the content tree; the admin's **Templates** page
lists them. A template is published like a page, and every document referencing it
delivers the blocks the published template holds today.

Both `folder` and `template` are code-defined types available in every space. They are
not offered where a document type is picked, since each has its own way in.

## Locales

A space lists its locales. A document exists per locale; the translations of one
document are linked and can differ in title, slug and localised field values. See
[Locales and translations](./localisation.md).

## Drafts, publishing, versions

Saving changes the draft. Publishing makes a copy that the public API serves; every save
also records a restorable version. See [Drafts, publishing and versions](./publishing.md).

## How this appears in the API

- Over REST a document is `{ id, type, title, slug, permalink, locale, parentId, publishedAt, updatedAt, fields: { ... } }`, with each block as `{ blockId, type, fields }` and relations as ids unless expanded.
- Over GraphQL each content type is an object type implementing `ContentNode`, each block type an object type implementing `Block`, and relations are the related objects.
- The SDK presents both the same way: field values flattened onto the node and kept under `fields`, blocks with `type` and their fields.

See [Delivering content](../delivery/index.md).
