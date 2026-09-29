---
title: 'Spaces and members'
description: 'Creating a space, its settings, and who is a member of it with which role.'
---

**Settings > Spaces** lists every space you are a member of; a superadmin sees all of
them. Each row expands into a panel holding that space's settings on the left and its
members on the right. **New space** in the header (or the button on the empty
dashboard) creates one. The empty dashboard also offers **Import a space**, which
opens the [import dialog](./transfer.md) straight away, for an instance whose first
space is a copy of another instance's.

## Settings

| Field | Notes |
| --- | --- |
| Name | Free text. The label everywhere in the admin |
| Technical name | `machineName` in the API. **Immutable**: it keys the GraphQL schema and the public API's space pinning |
| Frontend URL | Where the website that renders this space runs. The visual editor loads `<frontend URL>/preview` in a frame, and the top bar's site link opens it. Prefilled with `http://localhost:3005`, where the Astro website `manablox frontend` makes by default runs. See [Preview and the visual editor](../delivery/preview.md) |
| Locales | Picked from a list of written languages, most-spoken first |
| Default locale | One of the space's own locales: the language content falls back to |

**Start with** chooses what the new space holds. *Empty space* is a space with no
content types, documents or menus. *Preconfigured* adds a **Website type** page: a
company website, a product or landing page, a portfolio, a personal blog, the basic setup,
or *Pick your blocks*, where the sections come from the block catalog (`SPACE_BLOCKS` in
`@manablox/core`: hero, text, image and text, image, gallery, quote, features, numbers,
FAQ, pricing, testimonials, team, contact form, call to action). Every design preset has
a design for each catalog block, so a designed site fits whatever was picked. *Describe
it* (offered when the instance loads the [AI plugin](./ai.md#the-ai-plugin) and a space you can use has an AI provider) designs the document and block types from what you say the space will hold,
with that space's AI, and can give the new space the same providers (sent as
`plugins: { ai: { copyFrom } }` of the create, see [New spaces](../extending/plugins.md#new-spaces)); see
[Designing with AI](./ai.md#designing-with-ai). *Basic setup* fills it with a small working site,
created as if an editor had built it by hand, so it shows up in the audit log and the
role grants like anything else:

| What | Details |
| --- | --- |
| `teaser` block | `headline`, `body` (rich text), `image` (asset) |
| `page` type | `summary` (textarea, localized) and `components` (blocks of `teaser`, localized) |
| `article` type | `date`, `image`, `summary` and `body` (rich text), the text fields localized |
| Documents | *Home*, *About* and *Blog* pages, and a *Hello world* article under *Blog*, all published in the default locale |
| Home page blocks | Two teasers on a two-column grid (desktop and tablet; one column on mobile), each placed in its own column, so the grid board and the layout options are on show in the editor. *About* holds one teaser as a plain list |
| Home page | *Home* is nominated as the space's root |
| Menu | *Main navigation* (`main`) linking the three pages |

The names are the ones the [getting-started walkthrough](../getting-started/first-space.md)
builds, so the guides render a starter space unchanged. A
code-defined global type wins a name over a runtime one in every space, so the setup
is refused before anything is written when the instance's config already defines a
`teaser`, `page` or `article` (`space.starter.typeTaken`). Over the API the same
option is `starter: true` on `spaces.create`; a website type is `starter: "<id>"`
(`business`, `landing`, `portfolio`, `blog`, `basic`, `custom`), and `custom` takes the
picked sections as `blocks: ["hero", "faq"]` (default: hero, text, media-text, gallery,
quote, call-to-action). The space and its setup are written together:
if any part fails, no space is created.

The technical name is corrected as you type. See the [conventions](./index.md#conventions),
so what you end up with always matches the server's `^[a-z][a-z0-9_-]*$`.

The server rejects a default locale that is not in the space's locale set, on both
create and update, including the case where a partial update drops the locale that
happens to be the stored default (`space.defaultLocale.notInLocales`).

Two more panels live in the same place: **Uploads** (what the space accepts, covered in
[Assets](./assets.md#what-a-space-accepts)) and **Transfer**, covered in
[Moving a space](./transfer.md).

## Members

Membership is a property of the space, so it lives in the space's own panel rather than
in a section of its own.

**Add members** opens a picker over the users who are not yet members, searchable by
name or email, granting one role to everyone selected. The candidate list is scoped to
`user:write` in that space and returns only an id, a name and an email: a space admin
can pick a colleague without being handed the instance's user directory, which stays
superadmin-only.

**Invite** sends an invitation by email with a role in this space, for someone who has no
account yet or is not a member; the open invitations are listed below the members. See
[Invitations](./users-and-roles.md#invitations).

| Role | Can |
| --- | --- |
| `owner` | Everything, including deleting the space |
| `admin` | Everything except deleting the space |
| `editor` | Read and write content, types and assets; publish |
| `author` | Write and delete content, but not publish |
| `viewer` | Read only |

These five are built in and the same in every space. A space can have roles of its own
beside them. See [Users and roles](./users-and-roles.md#roles), and the role picker
offers both.

A space always keeps at least one owner: removing *or* demoting the last one is refused
with `space.member.lastOwner`. Without that a space could reach a state with no owner and
no way back, since `user:write` belongs to owners and admins and an admin cannot promote
past their own role. A membership may only name a role the space has
(`space.member.roleNotFound`).

Accounts themselves, creating one, resetting a password, banning, are managed under
**Settings > Users**; see [Users and roles](./users-and-roles.md#users).

## Deleting a space

**Delete** in the panel removes the space with every document, content type, asset
record, menu, workflow and membership in it. It asks for the technical name to be typed.
Uploaded files are not removed from storage. Only an owner may delete a space.
