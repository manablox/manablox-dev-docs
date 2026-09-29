---
title: 'Redirects'
description: 'Old addresses of a space and where they lead: made by hand or recorded when a published page moves, delivered to any frontend over the public API.'
---

**Redirects** (under **Structure** in the sidebar, `g` `r`) lists the old addresses of a
space and where each one leads. A redirect is either made by hand, or recorded for you when
a published document gets a new address. The designed site answers with them itself; any
other frontend fetches them from the public API and applies them in its own router.

## What a redirect holds

| Field | Meaning |
| --- | --- |
| `fromPath` | The old path: a leading slash, no trailing slash, no locale prefix. Unique per environment and locale |
| `toPath` | A path of the website or an absolute `http(s)` URL |
| `toContentId` | Or a document, by its localization group: it follows the document's current permalink in each locale |
| `status` | `301` (moved for good) or `302` (temporary) |
| `locale` | The locale it answers in; `null` applies to every locale, and a locale's own redirect wins over a shared one of the same path |
| `source` | `manual`, or `auto` for one a publish recorded |

A redirect has exactly one target: `toPath` or `toContentId`.

## Rules

- Paths are normalised on save: repeated slashes collapse and a trailing slash goes. A path with a query, a fragment or a space is refused (`redirect.path.invalid`).
- Chains are flattened: a redirect to a path that is itself redirected is stored with the final target, and saving a redirect retargets the ones that led to its old path, so a visitor takes one hop.
- A redirect to its own path is refused (`redirect.target.self`), and so is one that would loop (`redirect.target.loop`).
- A locale the space does not have is refused (`redirect.locale.unknown`); a second redirect of the same path and locale too (`redirect.fromPath.taken`).
- The `redirect:beforeCreate` hook runs before a redirect is written and can refuse it. See [Hooks](../extending/hooks.md).
- Manual redirects count toward the `redirectsPerSpace` limit; automatic ones are free. See [Controls](../configuration/controls.md).

## Automatic redirects

When a publish changes the live permalink of a document, a 301 from the old path to the
document is recorded, for the document and every descendant whose permalink moved with it.
Redirects that pointed at the old path follow the document. A redirect whose `fromPath` is a
live permalink again is removed, so a live page always wins.

Editing an automatic redirect makes it manual, and later publishes leave it alone.

## In the admin

The list filters by path, by who made it (**Manual** or **Automatic**) and, in a
multilingual space, by language. **Add redirect** asks for the old path, the target (a path
or URL, or a document picked from the space), the kind (301 or 302) and the language.
Seeing redirects needs `redirect:read`, adding, editing and removing them `redirect:write`.
Editors, admins and owners hold both, viewers `redirect:read`, authors neither. See
[Users and roles](./users-and-roles.md).

Each redirect belongs to one environment: staging keeps its own, a config promote carries
redirects to a path over, a full promote all of them. See
[Environments](./environments.md).

## RPC

The router `redirects` takes a `spaceId` (and `environment`): `list` (`search`, `source`,
`locale`, pagination; document targets come with `toTitle`), `get`, `create`, `update` and
`delete`. Inputs are in the [HTTP API reference](../reference/http-api.md), the error keys
under `redirect` in [Error keys](../reference/errors.md). Every write is an audit entry of
the kind `redirect` and takes part in realtime activity.

## Fetching them

A frontend fetches every redirect of a locale in one call and matches incoming paths
against it:

```ts
const redirects = await cms.redirects({ locale: 'de' });
for (const redirect of redirects) {
  redirect.fromPath;   // '/old-page', without a locale prefix
  redirect.toPath;     // '/new-page', or 'https://example.com/elsewhere'
  redirect.status;     // 301 or 302
  redirect.locale;     // 'de', or null for one that applies to every locale
  redirect.contentId;  // the target document's id, or null for a path target
}
```

Over REST it is `GET /v1/redirects?locale=de`, answering `{ "items": [...] }`; in GraphQL
`redirects(locale: "de") { fromPath toPath status locale contentId }`. Without a locale
the space's default locale is used.

- The locale's own redirect comes before a shared one of the same path; only one of them is listed.
- A document target is resolved to `/` plus its permalink in that locale. A target the reader cannot see (unpublished, hidden by a read hook, or without a version in that locale) is left out.
- Paths carry no locale prefix: the frontend adds its own prefix scheme.
- A staging API host answers its environment's redirects, marked `noindex` like other staging answers.
- Answers are cached under the tag `redirects:<spaceId>`, which every redirect change purges, and under the space, which a publish purges.

See [Delivering content](../delivery/index.md).
