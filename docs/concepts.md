---
title: 'Concepts'
description: 'The words the documentation uses (instance, space, content type, block, field, document, locale, permalink, menu, asset, role, API key, workflow) and how they relate.'
---

Read this once; every other page assumes these terms.

## Instance

One running Manablox: a database, an API server and an admin. An instance holds any
number of spaces, the user accounts, and the API keys. Everything under
[Configuration](./configuration/index.md) applies to the instance as a whole.

There are two kinds of API server, built from the same code:

- The **management API**: what the admin talks to. It can read and write everything, including unpublished drafts, and requires a login or an API key.
- The **public API**: a hardened, read-only server that serves the *published* content of *one* space to anyone. This is what a website reads from. See [The public API](./delivery/public-api.md).

## Space

A **space** is one site or channel: a website, an app, a newsletter. It has its own
content tree, its own locales, its own assets, its own menus and its own members. Most
things in the admin are "in a space".

A space has a **technical name** (`machineName`), fixed at creation, and a **frontend
URL**: where the website that renders it lives, used by the visual editor.

## Content type

A **content type** describes a kind of document: a *page*, a *blog post*, a *product*.
It is a list of **fields**, plus a few switches (does it have a URL, can it be published,
does it show in the tree). A type is either defined in code (`manablox.config.ts`) or
built in the admin; both are the same shape.

A type has one of two **kinds**:

- `content`: a document that lives in the tree and may have a URL.
- `block`: a reusable fragment that only ever lives *inside* another document's field: a *teaser*, a *gallery*, a *call to action*. Blocks cannot be published or linked on their own.

## Field and field type

A **field** is one slot in a content type: *title*, *summary*, *hero image*. Each field
has a **field type** (string, rich text, number, date, select, asset, content relation,
block list) which decides how the value is validated, stored, edited and served. The
built-in types are listed in [Field types](./content-model/field-types.md); you can add
your own.

## Document

A **document** is one piece of content of some type, in one space and one locale: the
*About* page in English. It has a title, optionally a slug, and a value for each field.
Documents form a **tree**: a document may have a parent, and its position among its
siblings is kept.

## Locale and translation

A space lists the **locales** it writes content in (`en`, `de`, ...) and a default. A
document exists per locale; the translations of one logical document are linked and
edited side by side. Fields a type marks as not localised share their value across
translations. See [Locales and translations](./content-model/localisation.md).

## Slug and permalink

A **slug** is a document's own URL segment (`team`). Its **permalink** is the full path
built from its ancestors' slugs (`about/team`). A frontend turns a browser URL into a
document by asking the API for the document at that permalink. A type may have no slug
at all; such documents are containers, not pages.

## Draft and published

Editing changes the **draft**. **Publishing** copies the draft to the published version,
which is what the public API serves. Unpublishing removes it again. Every save also
records a **version**, which can be restored. See
[Drafts, publishing and versions](./content-model/publishing.md).

## Preview

Reading drafts instead of published content. The management API does it for an
authenticated request that asks for it; the **visual editor** in the admin goes further
and shows the frontend in a frame, updated on every keystroke, without saving. See
[Preview and the visual editor](./delivery/preview.md).

## Menu

A **menu** is a named navigation (`main`, `footer`) built in the admin from documents
and plain links, nested to any depth. The tree says where a document *lives*; a menu says
where it is *linked from*. See [Menus](./admin/menus.md).

## Tag

A free-form label on a document or an asset, belonging to the space rather than to a
content type. Editors create one by typing it; a tag sits on the document, so every
translation carries it. Tags narrow listings in the admin, are matched by free-text
search, and travel to the frontend, where a list can be filtered by them. See
[Tags](./admin/tags.md).

## Asset

An uploaded file: an image, a PDF, a video. Images are served resized through named
**presets** (`thumb`, `card`, `hero`), with an editor-set crop and focal point applied.
See [Assets](./admin/assets.md) and [Storage and media](./configuration/storage-and-media.md).

## User, member, role, permission

A **user** is an account on the instance. A user becomes a **member** of a space with a
**role** (`owner`, `admin`, `editor`, `author`, `viewer`, or a role the space defines),
and the role is a set of **permissions** (`content:write`, `asset:read`, ...). The
instance-wide **superadmin** sees everything. See [Users and roles](./admin/users-and-roles.md).

## API key

A long-lived credential for programs (a build pipeline, a preview server) presented
as an `x-api-key` header. It acts as the user who issued it, optionally narrowed to
some spaces and some permissions. See [API keys](./admin/api-keys.md).

## Workflow

Something the CMS does on its own when content changes or on a schedule: call an API, ask
a model, write a document, tell someone. Built as a graph of nodes on a canvas in the
admin, where each node can use what the ones before it produced. Workflows come from the
workflows plugin. See [Workflows](./admin/workflows.md).

## Plugin and hook

A **plugin** is a package that adds field types, content types, hooks, admin screens,
tables, permissions, controls, API procedures, server modes or CLI commands. The designer
and designed sites are one: the website plugin. AI, workflows and webhooks are plugins
too. You pick them as features of a new project or add them later with
`manablox plugin install <id>`. A
**hook** is a named moment (*before a document is saved*, *after it is published*) that
a plugin can observe or intervene in. See [Plugins](./extending/plugins.md) and
[Hooks](./extending/hooks.md).
