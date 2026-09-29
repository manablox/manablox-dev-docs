---
title: 'Permissions, controls and RPC'
description: 'The website plugin permissions and what each built-in role holds, its controls, and the RPC procedures behind the admin Design section.'
---

The designed site is the website plugin, `@manablox/plugin-website`, a feature you pick in
`manablox create` or add later with `manablox plugin install website`.
Everything on this page is declared by that plugin; an instance without it has none of it.

## Permissions

The group **Website** in the role editor:

| Permission | Label | What it allows |
| --- | --- | --- |
| `website:read` | See designs | Open the Design section, list designs, versions and domains, export themes, create share links |
| `website:write` | Edit designs | Save drafts, discard drafts, restore versions into the draft, import themes, apply starter themes, AI designs, import Google fonts (with `asset:write`) |
| `website:publish` | Publish designs | Publish one design or all, delete (reset) a stored design, delete a layout |
| `website:code` | Edit custom CSS and head code | Change `customCss`, `headCode` and `bodyEndCode` of the site settings, and export or import them in theme files |
| `website:domains` | Manage domains | Add, change and remove the host names of the site |

| Role | Gets |
| --- | --- |
| Owner, admin | All five |
| Editor | `website:read`, `website:write`, `website:publish` |
| Author, viewer | None |

`website:code` is kept apart because head and body code run as script on every page of the
site and switch its pages to a relaxed CSP (see [Security headers](./index.md#security-headers)).
A save of the site settings that changes a code field without it is refused; the admin
shows those fields locked.

The website settings (mode, locale strategy, 404 page, password) follow the space
permissions: `plugins.website.settings.get` needs `space:read`,
`plugins.website.settings.set` needs `space:write`.

## Controls

The plugin's flag `features.plugins.website` switches the whole plugin per space: while it
is off its procedures answer 404 `route.notFound` (403 `control.feature` while it is shown
locked), its hooks and routes are skipped, a new space gets no designed site and the site
process answers a designed space with its neutral 404. The designs stay stored. The other
keys:

| Key | Default | What it does |
| --- | --- | --- |
| `features.plugins.website.design` | On | Designing: every write of the designer's procedures (drafts, publishing, restores, themes, starters, fonts, AI designs) and the designed site of a new space. Off: designers open read-only; the site keeps rendering what is published |
| `features.plugins.website.domains` | On | Adding and changing site domains. Off: the existing ones keep serving and can be removed |
| `features.plugins.website.forms.config` | On | Adding, changing and removing forms in a design. Off: the forms that are there keep taking submissions |
| `features.plugins.website.forms` | On | Adding forms to a design. Off: form submissions are refused; forms already in a design stay |
| `features.plugins.website.shareLinks` | On | Creating preview share links. Off: existing links stop working |
| `features.plugins.website.badge` | Off | Shows the "Made with Manablox" badge; the most specific scope that sets it wins (`resolution: 'mostSpecific'`) |
| `features.plugins.website.password` | On | Setting, changing or removing a site password; a password that is set keeps protecting the site |
| `features.plugins.website.headCode` | On | Changing a site's head and body-end code; code already set keeps rendering |

The website is a premium plugin: without a license (`@manablox/plugin-license`) its
`design`, `domains` and `forms.config` features lock with a buy link, and nothing else. On a
development license the site process answers a public host with a plain 403, "This site runs
on a development license".
| `usage.plugins.website.formSubmissions` | No limit | Stored form submissions per period; used up, forms answer "This form is unavailable right now. Please try again later." (503) |
| `rateLimits.plugins.website.ip` | 1200 per 60 s | Site requests per IP (instance and space) |
| `rateLimits.plugins.website.renders` | None | Site renders (cache misses) per space |
| `rateLimits.plugins.website.password` | 10 per 600 s | Site password attempts per IP and space |
| `rateLimits.plugins.website.forms.ip` | 10 per 600 s | Form submissions per IP |
| `rateLimits.plugins.website.forms.space` | None | Form submissions per space |
| `retention.plugins.website.designVersionsCount` | Keep all | Published versions kept per design, newest first; applied each time a design is published |
| `plugins.website.badge.text` | `Made with Manablox` | The badge's text, 1 to 80 characters |
| `plugins.website.badge.link` | `https://manablox.io` | Where the badge links to |

A write to any of these keys purges the cached pages of the scope's spaces. Custom domains
count toward the core `limits.customDomains` and need the core `features.customDomains`,
like API hosts; `domains.requireVerification` applies to both. See
[Controls](../configuration/controls.md) for scopes and resolution.

## RPC

The plugin's router is mounted at `plugins.website` of the management API
(`/rpc/plugins/website/...` and `/api/v1/plugins/website/...`). All procedures take a
`spaceId`; the full list with inputs is in the
[HTTP API reference](../reference/http-api.md#plugin-procedures-apiv1pluginsid), the error
keys under `plugins.website` in [Error keys](../reference/errors.md#plugin-keys).

| Router | Procedures |
| --- | --- |
| `plugins.website.design` | `list` (every design the space has or implies, with its status), `get`, `saveDraft` (`expectedVersion`, 0 creates), `publish`, `publishAll`, `discardDraft`, `versions`, `version`, `restore`, `delete`, `createShareLink`, `importGoogleFont` |
| `plugins.website.design` (themes) | `exportTheme` (`variant`: published or draft), `previewThemeImport`, `importTheme` (`replace`, `skip`), `starterThemes`, `applyStarter` (`builtin:<id>` or `code:<id>`, `replace` off by default) |
| `plugins.website.design` (AI) | `aiTheme` (prompt, optional brand color), `aiBlockDesign` (prompt, block type). Both need `ai:use` too, and answer not found while the AI plugin is missing or off in the space |
| `plugins.website.domains` | `list`, `create`, `update`, `verify`, `delete` |
| `plugins.website.settings` | `get` (the settings plus `hasPassword`, `siteUrl` and `formsEnabled`, never the hash), `set` (answers the same view) |

AI designs use the space's AI providers through `designSiteTheme` and `designSiteBlock` of
`@manablox/plugin-website`, with the design service of the
[AI plugin](../admin/ai.md#the-ai-plugin) (`plugins.get('ai')`). The website plugin only
enhances AI: without the AI plugin the admin hides the AI theme and block design. A theme proposal picks palette, roles, bundled fonts, type scale,
radius and shadows and is contrast checked; a block proposal is a variant tree for one
block type. Both are validated with `@manablox/site` and only ever land in a draft after
the editor applies them.

Every write is an audit entry with the target kinds `website.design` (actions
`website.design.save`, `publish`, `discard`, `restore`, `delete`, `share`, `import`),
`website.domain` (`create`, `update`, `delete`) and `website.settings` (`update`), and
designs take part in realtime activity like other targets. Redirects are core and have
their own router, `redirects`; see [Redirects](../admin/redirects.md).

## Hooks

The plugin declares two hooks of its own; register handlers like core hooks:

| Hook | Payload | When |
| --- | --- | --- |
| `website:beforeDomainCreate` | `{ spaceId, hostname, locale }` | Before a site host name is added, also for each domain a space import restores; throw to refuse it |
| `website:beforeFormSubmit` | `{ spaceId, databagTypeId, form, locale, page }` | Before a site form submission becomes a record; throw to refuse it, and the visitor sees the form as not sent |
