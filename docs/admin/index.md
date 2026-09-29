---
title: 'The admin: a tour'
description: 'Where everything is in the admin, who sees what, and the conventions every screen follows.'
---

The admin (at <http://localhost:3000> in a project made with `manablox create`, served by
the management API itself) is a single-page app talking to the management API. Everything it does is also reachable over RPC and REST, so nothing here is
admin-only; these pages describe where each thing lives and the rules it enforces.

## The layout

```
+--------------+--------------------------------------------------+
| Space v      | space name | locale v | keys | ? | bell | site   |  top bar
|              +--------------------------------------------------+
| Dashboard    |                                                  |
| Content      |                                                  |
| Menus        |              the page                            |
| Design       |                                                  |
| Workflows    |                                                  |
| Webhooks     |                                                  |
| Content types|                                                  |
| Redirects    |                                                  |
| Assets       |                                                  |
| Activity     |                                                  |
| Settings     |                                                  |
| you          |                                                  |
+--------------+--------------------------------------------------+
```

- **The space switcher** at the top of the sidebar picks the space you are working in. Everything in the sidebar below Dashboard is scoped to it.
- **The locale switch** in the top bar, shown when the space has more than one, picks the language you are editing. The content tree, the editor and the menus follow it.
- **The keyboard button** in the top bar, left of the bell, lists what the keyboard does on the page you are looking at. `?` opens the same dialog; see [Keyboard shortcuts](./keyboard.md).
- **The help menu** (`?`) in the top bar, when the instance is set up with them, links to documentation, support, billing (superadmins only) and upgrade pages.
- **The bell** in the top bar carries your unread notifications; see [Notifications and approvals](./notifications.md).
- **The site link** in the top bar opens the space's frontend URL in a new tab.
- **Your name** at the bottom of the sidebar opens your profile: name, password, notification preferences.

| Section | What it holds | Page |
| --- | --- | --- |
| Dashboard | The space's figures, recently updated documents, shortcuts to start something, the language | |
| Content | The document tree, search, the editor | [Editing content](./editing-content.md) |
| Databags | Flat records outside the tree, in a searchable, paged table per type | [Databags](./databags.md) |
| Menus | Named navigations built from documents and links | [Menus](./menus.md) |
| Design | The designed site: theme, block, page, layout and menu designs, site settings, domains, publishing | [Designed sites](../site/index.md) |
| Workflows | Automations: API calls, AI, documents, mails, notifications (the workflows plugin) | [Workflows](./workflows.md) |
| Webhooks | The calls the space receives and the calls it makes (the webhooks plugin) | [Webhooks](./webhooks.md) |
| Content types | The builder for document and block types | [Building content types](./content-types.md) |
| Databag types | The builder for databag types | [Databags](./databags.md#defining-a-databag-type) |
| Redirects | Old addresses and where they lead, by hand or recorded when a page moves | [Redirects](./redirects.md) |
| Assets | The space's file library | [Assets](./assets.md) |
| Activity | The audit log: who did what, when, and what changed | [Activity](./activity.md) |
| Settings > Spaces | Spaces, their settings, members, uploads, transfer | [Spaces and members](./spaces.md), [Moving a space](./transfer.md) |
| Settings > Backups | Snapshots of the space: take one, download, restore | [Backups](./backups.md) |
| Settings > Roles | What a role may do in a space | [Users and roles](./users-and-roles.md) |
| Settings > Tags | The space's tag vocabulary: rename, merge, delete | [Tags](./tags.md) |
| Settings > AI | The providers the space generates text, images and video with (the AI plugin) | [AI](./ai.md) |
| Settings > Users | The instance's accounts (superadmin only) | [Users and roles](./users-and-roles.md) |
| Settings > Security | The two-factor policy and single sign-on providers (superadmin only) | [Users and roles](./users-and-roles.md#two-factor-authentication), [Single sign-on](./sso.md) |
| Settings > API keys | Credentials for programs | [API keys](./api-keys.md) |
| Notifications | Your inbox: approvals to give, answers to what you asked | [Notifications and approvals](./notifications.md) |
| Profile | Your name, email and password, and where each kind of notification reaches you | [Notifications and approvals](./notifications.md) |

## Who sees what

What the sidebar shows depends on your role in the current space: an editor does not
see Workflows unless the instance loads the workflows plugin and the role grants
`workflows:read`, Activity needs `audit:read`, an
author sees the "new document" menu only for the types the role may write, the magic
wand appears only where the instance loads the AI plugin, the space has a provider and
the role grants `ai:use`, and
**Settings > Users** exists only for a superadmin. The permissions are listed in [Users and roles](./users-and-roles.md).

## Banners, read-only and suspended

Whoever hosts the instance can show messages in the admin and restrict it; nothing in the
admin changes these, superadmins included. See [Controls](../configuration/controls.md#admin-messages).

- **Banners** appear in a strip below the top bar, coloured by level: information, a warning (yellow) or something urgent (red). Some have a "Learn more" link, and some can be closed with the x on the right; a closed banner stays closed for your account in this browser.
- **A read-only instance or space** shows "This instance is read-only." or "This space is read-only." below the top bar, often with a reason. You can open and read everything, export spaces and change your own profile, but saving, publishing, uploading and deleting are refused with a message, and workflows do not start. Sites and the delivery API keep working.
- **A suspended instance** shows a single page after sign-in with the reason and the help links, for everyone. The site and the delivery API are unavailable meanwhile. Use "Check again" once the host has lifted it, or sign out.

## Conventions

- **Technical names fill themselves in.** A space, a content type, a field, a menu and a role each have a label and a technical name (`machineName` in the API). The technical name follows the label as you type, spaces become hyphens, capitals are lowered, umlauts transliterate (`ue` for a u umlaut, `ss` for eszett), until you type one yourself, and it **locks when the thing is saved**, because it is part of an API: a GraphQL type name, a field name, a menu's address.
- **Destructive actions ask first**, in a dialog that says what actually happens. Deleting a space additionally requires typing its technical name.
- **The keyboard works everywhere.** Save is `Cmd+S` (`Ctrl+S`) on every editor, `g` and a letter jumps to a section, `/` reaches the search box, `n` starts a new one, and `Esc` closes the topmost dialog. `?` lists the keys the open page answers to; see [Keyboard shortcuts](./keyboard.md).
- **Errors are sentences.** A save with field errors marks the fields and says so once; anything else shows the server's message. Every message maps to an [error key](../reference/errors.md), which is what an API client sees.
- **Light and dark** follow the system, or the choice made with the theme toggle in the sidebar.
