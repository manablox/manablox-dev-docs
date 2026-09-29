---
title: 'Domains, redirects, share links and forms'
description: 'How the site process maps host names to spaces and languages, follows redirects, shows drafts through signed share links, and accepts form submissions safely.'
---

## Domains

`website_domains` maps a host name to a space: `hostname` (lowercase, no port, unique across
the instance), `locale` (`null` serves every locale by path prefix), `isPrimary` and
`redirectToPrimary`. Editors manage them under **Settings > API hosts**, which takes the
`website:domains` permission. Custom domains count toward `limits.customDomains`, like API
hosts, and a new host runs the hook `website:beforeDomainCreate`.

- The first domain of a space and locale becomes its **primary**. There is one primary per space and locale; making another one primary clears the old one.
- The primary host is the canonical one: absolute links, canonical tags, `hreflang` alternates and the sitemap use it.
- A domain with `redirectToPrimary` answers every request with a 301 to the primary host, path and query kept.
- Any other domain serves the site as well, with canonical links pointing at the primary.
- With the `domain` locale strategy, a locale pinned to its own primary domain is linked there; other locales stay on the locale-less primary with a path prefix.

`localhost` is a valid host name for a local try-out.

Each domain belongs to one environment of its space (see
[Environments](../admin/environments.md)); the domains page lists the environment's own. A
staging domain renders that environment's documents, designs, menus, redirects and home
and 404 pages, and is never indexed: every page carries `X-Robots-Tag: noindex, nofollow`
and a `noindex` meta tag, `robots.txt` answers `Disallow: /` and `/sitemap.xml` 404. While
the space's `environments` feature is off, a staging domain answers 404. Forms posted on a
staging domain write into that environment.

## Redirects

Redirects are a core feature of the space, managed under **Structure > Redirects**; see
[Redirects](../admin/redirects.md) for what they hold and how they are made. The site
checks them only after the permalink lookup missed, so a live page always wins. A document
target follows the document's permalink in the visitor's locale, and the answer carries the
locale prefix of the site's locale strategy. Lookups are cached under the tag
`redirects:<spaceId>`, which every change purges.

## Share links

A share link shows drafts on the real site to someone without an account. There is no
table: the link carries a signed token.

1. `plugins.website.design.createShareLink({ spaceId, environment?, contentId?, expiresInSeconds? })` signs `{ spaceId, environmentId?, contentId?, expiresAt }` with a key derived from `auth.secret` (purpose `site-share`). The default lifetime is a day, the maximum 30 days (`plugins.website.design.share.invalidExpiry` outside 60 seconds to 30 days). It needs `website:read`, or reading the document the link is for.
2. The admin builds `<site origin>/_manablox/share/<token>`. The origin is the primary domain, else the website plugin's `url`.
3. The site process verifies the token against the host's space and environment (a link of staging opens only on a staging domain of that environment, one of production only on production's), sets the HttpOnly cookie `mb_site_share` (SameSite Lax, Secure over HTTPS, at most an hour and never past the token's expiry) and redirects to the page: the document's permalink, or `/` for a whole-site link.
4. With the cookie, pages render uncached (`private, no-store`) with `X-Robots-Tag: noindex, nofollow`, a `noindex` meta tag and a small "Preview" badge. `robots.txt` disallows everything.

| Link for | Shows |
| --- | --- |
| The whole site (`contentId` absent) | Draft designs and the drafts of every document |
| One document | That document's draft and draft designs; other pages stay published |

With a share cookie, `/media` serves any asset of the space, so draft images show. Every
share link is an audit entry (`website.design.share`). The site only reads drafts, so the
read-only database role is enough.

## Forms

A `form` element in a block, page or layout design stores what visitors send as a record
of a **databag** type (`kind: 'data'`), named in `props.databagTypeId`. Its children are
`formField` inputs (one per field, hideable and reorderable, required fields cannot be
hidden), a `formSubmit` button and a `formMessage`. Other props: a localized success
message, `redirectContentId` (a document to go to after sending) and `consent` with its
text.

A form can instead be bound to a `databag` field of its design (`bind: { field }`, no
`databagTypeId`): the type is the one an editor picked in that field. Such a form holds one
`formField` without a `fieldId`, which the renderer repeats for every field of the picked
type that a form can fill, and the submission exposes all of those fields. Without a picked
databag type the form renders nothing.

The site process signs the picked type into the form at render (`_mb_databag`,
`<typeId>.<HMAC>` over the form reference and the type id, keyed from `auth.secret`), so a
post cannot pick another type. A post to a bound form without a valid token is a 404. Its
form reference, used for the result shown after a post without JavaScript, is
`<kind>:<key>:<nodeId>@<databagTypeId>`.

### The flow

```
browser --POST /_manablox/forms/<kind>/<key>/<nodeId>--> site process
site process --POST /plugins/website/forms/submit (Bearer secret)--> management API
management API --content service create, as the "Site form" system actor--> databag record
```

1. The site process finds the form in the **published** design (`block`, `page` or `layout`, generated designs included) and the databag type. Anything else is a 404.
2. It checks the submission (below), reads only the values of the fields the form exposes, and forwards them with the space, the locale, the page, the host, the form reference and a hash of the client IP.
3. The management API creates the record through the content service under a system actor (`Site form`), so validation, `content:afterCreate` hooks, `content.created` workflow triggers (filterable by type), audit and notifications run as for any record. Validation errors come back as 422 with an error per field.

With the `form` island (JavaScript), the browser posts with `Accept: application/json` and
gets `{ ok, redirect?, message?, errors? }`. Without JavaScript the form posts normally and
gets a 303 back to the page with `?_mb_form=<signed result>` (valid 10 minutes); that page
renders uncached and shows the success or error message. On success with a redirect
target, both go to that document in the posted locale.

### What protects it

| Check | Answer when it fails |
| --- | --- |
| Forms configured: `forms.apiUrl` and a secret of 16 characters or more | 503 |
| `Origin`, when sent, is the host the form was posted to | 403 |
| Body is `application/x-www-form-urlencoded`, at most 64 KiB | 415, 413 |
| Per-IP limit (rule `plugins.website.forms.ip`: `forms.rateLimit`, default 10 per 10 minutes) and per-space limit (rule `plugins.website.forms.space`, none by default), counted on the shared rate limit store | 429 with `Retry-After` |
| A hidden honeypot field stays empty | A fake success, so bots learn nothing |
| At least 2 seconds between rendering and sending | 400 |
| Consent ticked when the form asks for it | 422 |
| Values valid for the fields the form shows; fields limited by roles and fields not in the form are dropped | 422 |

The management side accepts a forward only with `Authorization: Bearer <SITE_FORMS_SECRET>`,
compared as SHA-256 digests in constant time, and bodies up to 128 KiB. The route
`POST /plugins/website/forms/submit` is only mounted when the website plugin's
`forms.secret` is set on the management instance, and takes the submission's space in
`x-manablox-space`; keep `/plugins/website/forms/*` unreachable from the internet (see
[Running the site process](./running.md#https-for-every-domain)). A forward that takes
longer than `forms.timeout` (10 seconds) fails with 502.

Messages shown to visitors are in English. The admin warns in the form's checks when the
installation has no forms secret (`plugins.website.settings.get` returns `formsEnabled`).

Before the record is written, the hook `website:beforeFormSubmit` runs with
`{ spaceId, databagTypeId, form, locale, page }`; a handler that throws refuses the
submission and the visitor sees the form as not sent. The feature
`features.plugins.website.forms` off refuses submissions, and a used up
`usage.plugins.website.formSubmissions` answers 503; stored submissions count toward it.
