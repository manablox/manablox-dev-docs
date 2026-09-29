---
title: 'Designed sites'
description: 'How a space becomes a website without a code frontend: the site process, what it serves, how a request is answered, how pages are cached and which security headers it sends.'
---

A space either has a code frontend of its own (it reads the delivery API, see
[Delivering content](../delivery/index.md)) or a **designed site**: editors design a
theme, blocks, pages, layouts and menus in the admin, and a separate site process renders
the published designs and the published content as HTML. The choice is per space, in the
website settings (`mode`: `external` by default, or `designed`). Spaces that keep a code
frontend are not touched by any of this.

All of it is the website plugin, `@manablox/plugin-website`, a premium plugin under a
commercial license (see [Licensing](../reference/licensing.md)). The management, public and
site configs of an instance load it, and `manablox create`
adds it to a new project when the website is picked (`--website`, or `website` in
`--features`); `manablox plugin install website` adds it later. Without it an instance has no
designer and no site process. It owns the designer tables (`website_designs`,
`website_design_versions`, `website_domains`), its permissions, controls, procedures and
error keys (see [Permissions, controls and RPC](./api.md)), and the `website` server mode.
Its settings per space live in the core table `space_plugin_settings` under the plugin id
`website`: the production row holds the space's settings, a staging environment's row only
its own 404 page.

| Part | What it is |
| --- | --- |
| `@manablox/site` | Browser-safe: design types, validation, the CSS compiler, generated designs, starter themes, the theme bundle format. See [The design model](./designs.md) |
| `@manablox/site-renderer` | Vue server rendering of a page from one `SiteRenderInput`, the small browser scripts ("islands") and the design canvas app |
| `@manablox/plugin-website` | The plugin: `websitePlugin(options)` (`.`), the site process entry (`./site`) and browser-safe types (`./sdk`) |
| `server.mode: 'website'` | The website mode, declared by `websitePlugin`: host routing, the HTML cache, forms, share links, sitemap and robots |
| Site process | `manablox start --config manablox.site.config.ts` in a created project (port 3200), or `runWebsite` from `@manablox/plugin-website/site`; the `ghcr.io/manablox/site` image runs the latter |
| Admin **Design** section | The plugin's runtime admin bundle: theme editor, block, page, layout and menu designers, site settings, publishing. The website settings of a space sit under **Settings > General**, its domains under **Settings > API hosts** |

The site process runs from the same code as the APIs, in its own mode. How to configure
and deploy it is in [Running the site process](./running.md).

## One process, many sites

A single site process serves every space in `designed` mode. It picks the space by the
request's `Host` header, looked up in the `website_domains` table, which editors fill in the
admin under **Settings > API hosts**. Scale it by running more replicas behind the proxy; every
replica can answer every host.

Like the public API, it is anonymous and only reads: no auth surface, no RPC, no uploads.
It mounts its pages and the `media` scope and can use a read-only database role. Data is read in-process through the same delivery reader and tagged cache the public
API uses, so a designed site sees exactly what the public API would deliver.

## A request, step by step

1. **Host.** The `Host` header (port stripped, lowercased) is looked up in `website_domains`, cached under the `domains` tag. An unknown host gets a neutral 404 page that names nothing. A domain marked "redirect to primary" answers 301 to the space's primary domain.
2. **Space.** A space in `external` mode, or one whose import is still running, answers the same neutral 404.
3. **Locale.** A domain pinned to a locale serves only that locale. Otherwise the first path segment picks the locale when it names one of the space's locales; the default locale has no prefix, and `/<default>/about` answers 301 to `/about`.
4. **Document.** The rest of the path is a permalink, resolved through the delivery reader. `/` is the space's home document (`settings.homeContentId`).
5. **Redirects.** When no document matches, the space's [redirects](../admin/redirects.md) are checked.
6. **Not found.** Still nothing: status 404 with the document picked as the 404 page in the site settings (`notFoundContentId`), or a generated "Page not found" page.
7. **Designs.** The page design of the document's content type, its layout, the block designs, menu designs and the resolved menus, all from the published designs of the current revision. A design nobody has stored is generated from the content type's fields at render time.
8. **Render.** `renderSitePage()` renders the tree with Vue on the server (no hydration) and adds the head: title from the title pattern, description, canonical and `hreflang` alternates, Open Graph and Twitter tags, favicon, font preloads, the stylesheet, and the site's head code.
9. **Cache.** The HTML is stored in the tagged cache (see below) and sent with an ETag.

## Routes

| Route | What it answers |
| --- | --- |
| `GET /*` | Pages, as above |
| `GET /sitemap.xml` | Published documents per locale with language alternates; 404 when the site is set to not be indexed, has a password, or is a staging environment's |
| `GET /robots.txt` | From the site settings; `Disallow: /` when indexing is off, the site has a password, a share cookie is present, or the domain is a staging environment's |
| `GET /_site/<hash>.css` | The compiled stylesheet of a published revision; immutable |
| `GET /_site/islands/<name>.<hash>.js`, `GET /_site/canvas.<hash>.js` | The menu and form islands and the canvas app; immutable |
| `GET /_site/fonts/<path>.woff2` | The bundled fonts (`BUNDLED_FONTS`, ten OFL families); immutable |
| `GET /media/*` | Images and files, scoped to the host's space (see below) |
| `GET /_manablox/domain-check?domain=<host>` | 200 `ok` for a host in `website_domains`, else 404. For on-demand TLS, see [Running the site process](./running.md#https-for-every-domain) |
| `GET /_manablox/canvas` | The design canvas the admin frames |
| `GET /_manablox/share/<token>` | Opens a [share link](./forms-links.md#share-links) |
| `POST /_manablox/forms/<kind>/<key>/<nodeId>` | [Form submissions](./forms-links.md#forms) |
| `POST /_manablox/password` | The [site password](#password-protection) form |

`/media` on a site only hands out assets of the host's space that a visitor may see: assets
referenced by published content, as on the public API, plus assets the published designs
use (logo, favicon, share image, uploaded fonts, background images). With a share cookie,
any asset of the space is served.

## Caching

Pages are cached in the same tagged cache as delivery responses, with Valkey when
`REDIS_URL` is set and in memory otherwise.

- **Key:** space, design revision, host, port, protocol, locale, path and the [badge](#the-manablox-badge). A share link, a form result or a site password bypasses the cache.
- **Tags:** every document and asset the render read, plus `design:<spaceId>`, `redirects:<spaceId>`, `domains`, `site:pages` and `menu:<id>` for each menu on the page.
- **Purges:** publishing a document purges its tags as it does for the public API. Publishing designs bumps the site `revision` in the website settings, which changes every key, and purges `design:<spaceId>`. Domain changes purge `domains`, redirect changes `redirects:<spaceId>`, a mode switch both.
- **HTTP:** pages carry `Cache-Control: public, max-age=0, s-maxage=<ttl>, stale-while-revalidate=<ttl * 10>` and a weak ETag (`If-None-Match` answers 304). The TTL is `websitePlugin({ cacheTtl })`, else `cache.ttl`. Pages with drafts (share links) and pages that show a form result are `private, no-store`.
- **Assets:** the stylesheet, islands and fonts have a content hash in their name and are served with `max-age=31536000, immutable`.

The stylesheet is compiled once per space, revision and schema version and kept by its
hash. A page that has blocks with [instance styles](./designs.md#styling-one-block) links
its own content-hashed stylesheet: the site rules plus the classes of those overrides.

> **Set `REDIS_URL` on the management API and on every site replica.** A publish happens
> on the management API; only a shared cache carries the purge to the site processes.
> Without it each site process keeps its pages until the TTL expires.

## Password protection

A space can have one site password (`password` in the website settings, an Argon2id hash).
Editors with `space:write` set or remove it under **Settings > General > Site password**,
through `plugins.website.settings.set` with `password` (at least 8 characters; `null`
removes it). The hash never leaves the server: `plugins.website.settings.get` answers
`hasPassword`, and audit entries and the admin never carry it. Space exports keep it, so an imported or
restored space stays protected.

While a space has a password, the site process answers every page with a neutral password
form (status 401), whatever the path:

- **Form:** `POST /_manablox/password` with `password` and `next` (a path on the same site). A correct password sets the cookie and answers 303 to `next`; a wrong one shows the form again with a message. A post from another origin is refused.
- **Cookie:** `mb_site_access`, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, for 30 days. Its value is an expiry and an HMAC over the space, the expiry and a fingerprint of the password hash, signed with a key derived from `AUTH_SECRET`. It only works on the space it was issued for, and a new password ends every earlier cookie.
- **Attempts:** each post counts against the rate rule `plugins.website.password`, per client address and space, 10 per 10 minutes by default. Past it, the form answers 429 without checking the password.
- **Caching:** protected pages are never written to the shared page cache and are sent as `private, no-store`, so a CDN never keeps them. The form itself is `private, no-store` too.
- **Robots:** every protected response, the form included, carries `X-Robots-Tag: noindex, nofollow`; `robots.txt` answers `Disallow: /` and `/sitemap.xml` answers 404.
- **Share links:** a valid [share link](./forms-links.md#share-links) cookie previews the site without the password.
- **Forms:** form posts from a visitor without the cookie answer 404.
- **Media:** `/media` on the site's own host answers 404 without the cookie and `private, no-store` with it. The same files stay reachable by their address on the delivery and management APIs, so the password does not make uploaded files secret.

Setting, changing or removing the password purges `design:<spaceId>`, so the site switches
at once. The feature flag `plugins.website.password` only decides whether the password may
be changed: while it is off, a password that is set stays in force (see
[Controls](./api.md#controls)).

## The Manablox badge

When the control `features.plugins.website.badge` is on for a space, every page (share
previews included, the canvas not) ends with a small fixed link in the bottom left corner.
Its text (`plugins.website.badge.text`) and target (`plugins.website.badge.link`) come from
the controls; the text is
escaped, the link opens in a new tab with `rel="noopener"`, and its inline styles start with
`all: initial`, so the site's CSS does not reach it. Toggling it or changing its text or
link purges the cached pages of the affected spaces.

## Security headers

Every response carries `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Resource-Policy: cross-origin`. Pages also carry `X-Frame-Options: DENY`.

Pages get a strict Content-Security-Policy:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
font-src 'self' data:; img-src 'self' data: https:; media-src 'self' https:;
frame-src <embed providers>; connect-src 'self'; form-action 'self';
object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

- Scripts only come from the site itself: the islands. No inline script is ever rendered.
- `style-src` allows inline `style` attributes, which the block grid and the preview badge use.
- `frame-src` lists the providers the `embed` element accepts: YouTube (including `youtube-nocookie.com`), Vimeo, Google Maps, Spotify and SoundCloud.
- A site with **head code or body code** in its settings runs arbitrary HTML, so its pages switch to a relaxed policy: `default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'`, with `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'none'` kept. Editing that code needs the `website:code` permission, which only owners and admins hold by default.

The canvas page is the one page that may be framed: its policy sets
`frame-ancestors` to the configured editor origins (`editorOrigin`), `connect-src 'none'`
and `form-action 'none'`, and allows fonts and images from any origin because the admin
injects draft CSS and assets from the management API. Without an editor origin the canvas
answers 404. The admin's own CSP needs the site origin in `frame-src`, which the website
plugin's `url` adds when `frame-src` is restricted.

## Read next

- [Running the site process](./running.md): config, environment, compose, HTTPS, scaling.
- [The design model](./designs.md): design kinds, element trees, bindings, tokens and styles.
- [Themes in code and theme files](./themes.md): `defineTheme`, plugin themes, the bundle format, transfer.
- [Forms, share links and redirects](./forms-links.md).
- [Permissions, controls and RPC](./api.md).
