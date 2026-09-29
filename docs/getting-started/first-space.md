---
title: 'Your first space'
description: 'Create the first account, a space, a content type with a block, and a published page, the walkthrough every later page builds on.'
---

This page walks through the admin once, end to end. By the end there is a space called
*Website* with a *Page* type, a *Teaser* block and a published *About* page. The
[guides](../guides/vite-vue-ssr.md) render exactly this content, so it is worth following
the names.

## 1. Create the first account

Open <http://localhost:3000>, where `pnpm dev` serves the admin. The login page says **Create the first account** because
the instance has none yet. Fill in a name, an email and a password.

**The first account becomes the instance superadmin** and owner of every space. Sign-up
closes as soon as it exists: from now on the login page only logs in, and further
accounts are created by a superadmin under **Settings > Users**. See
[Users and roles](../admin/users-and-roles.md). Create this account before exposing an
instance to the internet.

## 2. Create a space

The empty dashboard offers **Create your first space**; later it is **Settings > Spaces >
New space**. Its third button, **Import a space**, restores an export from another
instance instead; see [Moving a space](../admin/transfer.md).

| Field | Enter |
| --- | --- |
| Name | `Website` |
| Technical name | fills itself in as `website`. Fixed once saved. |
| Frontend URL | `http://localhost:3006`: where the site you build in the guide will run. It only matters for the visual editor and can be changed later. |
| Locales | leave `en`, or add more |

Under **Start with**, leave *Empty space*: the rest of this page builds the model by
hand, which is the point of the walkthrough. *Basic setup* would create the very things
the next steps make, a *Teaser* block, a *Page* and an *Article* type, a published
home, about and blog page with one article, and a *main* menu, so it is the option to
pick when you want a site to look at before defining anything. The empty dashboard
offers it as **Start with the basic setup**. *Personal blog*, *Portfolio* and *Company
website* are templates with their own content models, pages and menu. A template is
refused when the instance's config already defines one of its type names in code
(`space.starter.typeTaken`); create an empty space then.

Save. The sidebar now shows the space; the space switcher at its top is how you move
between spaces later. The public delivery API notices the space and starts.

## 3. Create a block type

A block is a fragment that lives inside a document. Making the block first means the
page type can use it.

**Content types > New block type.**

| Field | Enter |
| --- | --- |
| Label | `Teaser` |
| Technical name | `teaser` (fills itself in) |

Under **Fields > Add field** add three fields:

| Label | Type | Settings |
| --- | --- | --- |
| Headline | Text | |
| Body | Rich text | |
| Image | Asset | leave *multiple* off |

Save. The technical names (`headline`, `body`, `image`) fill in from the labels and lock
when the type is saved, because they become part of the API.

## 4. Create the page type

**Content types > New document type.**

| Field | Enter |
| --- | --- |
| Label | `Page` |
| Technical name | `page` |
| Has a slug and permalink | on: a page has a URL |
| Publishable | on |

Add two fields:

| Label | Type | Settings |
| --- | --- | --- |
| Summary | Text | editor: *textarea* |
| Components | Blocks | allowed types: *Teaser* |

Save. The **Built-in fields** panel in the builder lists what every page carries without
you adding it: `title`, `slug`, `permalink`, `status`, timestamps. Do not add fields with
those names.

## 5. Write a page

**Content > New > Page.**

- Title: `About`. The slug fills itself in as `about`; leave it.
- Summary: a sentence.
- Components: **Add block > Teaser**, give it a headline and a body. Uploading an image is optional here; [Assets](../admin/assets.md) covers the library.

**Save**, then **Publish**. The badge next to the title changes to *live*.

The tree on the left shows the page. Documents nest: a page created with *About* selected
becomes its child, and its permalink becomes `about/<slug>`. Drag to reorder or move.

## 6. Make it the home page

A space can name one document as its home page. In the content tree, open the page's
menu and choose **Set as home page** (a star marks it). The public API then answers
the empty path (`byPermalink('/')` in the SDK, `GET /v1/permalink` over REST) with that
document, so a frontend's `/` route needs no special case.

## 7. Build a menu

**Menus > New menu**, name `Main navigation`, technical name `main`. **Add document**,
pick *About*, save. A frontend fetches this by its technical name: `main` is what the
guides use.

## What happened

- The space, its content types, the document and the menu are rows in one database; the published copy of the page is a separate row the public API reads.
- The management API at <http://localhost:3000> knows about all of it, drafts included, behind your login.
- The public API at <http://localhost:3100> knows the *published* page and nothing else, and needs no login.

Next: [Read it from a frontend](./first-request.md).
