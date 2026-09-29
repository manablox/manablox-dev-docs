---
title: 'Delivering content'
description: 'How a frontend reads content: the two instances, the three surfaces, authentication, locales, and how to choose.'
---

A frontend reads content over HTTP from a Manablox instance. There are two instances to
choose from, three surfaces on them, and one SDK that hides the difference.

## Two instances

| | Management API | Public API |
| --- | --- | --- |
| Port in a project from `manablox create` | 3000 | 3100 |
| Serves | Drafts and published content, every space | Published content of **one** space |
| Needs | A session or an API key for anything private; the delivery surfaces are open but read published only unless preview is requested | Nothing. Anonymous by design |
| CORS | The origins in `CORS_ORIGINS` | Every origin |
| Cache | Short | Response cache, `ETag`, `s-maxage` for a CDN |
| Use for | The admin, integrations, **preview** | **The website** |

A website should read from the public API: it cannot leak a draft, it needs no
credentials in the browser, and it is built to sit behind a CDN. See
[The public API](./public-api.md). The management API is for preview and for programs
that write. See [Preview and the visual editor](./preview.md).

## Three surfaces

| Surface | Path | Shape | Page |
| --- | --- | --- | --- |
| GraphQL | `POST /graphql` | One generated object type per content type; ask for exactly what you render | [GraphQL](./graphql.md) |
| REST | `GET /v1/...` | A document arrives whole, as plain JSON; relations inlined with `?expand=` | [REST](./rest.md) |
| SDK | `@manablox/public-sdk` | One `createClient()` over either transport, with the same methods and the same result shape | [The SDK](./sdk.md) |

GraphQL and REST cannot disagree about what is visible: they share the query builder and
the loaders that decide. GraphQL is available on both instances; REST (`delivery` scope)
is mounted on the public instance.

## What every surface offers

- **Resolve a URL** to a document: `byPermalink`, `contentByPermalink`, `/v1/permalink/...`. The routing entry point for a site. The empty path is the space's home page.
- **One document by id**, **a filtered list** (by type, parent, subtree, search, with limit and offset), **a menu by name**, **the redirects of a locale**, **an asset by id**, and **the content model** for type generation.
- **Blocks** inside a document, recursively, and **relations**, other documents, assets, users, resolved to objects (always in GraphQL, on request over REST).

A space does not need a frontend of its own: a **designed site** is rendered by the
site process of the website plugin (`--mode website`) from designs made in the admin, and needs none of the APIs on this
page. See [Designed sites](../site/index.md).

## Locales

Every call takes a locale and defaults to the space's default. See
[Locales and translations](../content-model/localisation.md#what-a-frontend-asks-for).

## Choosing

- **Building a site?** The SDK, on the public API. Start with the REST transport, no selection sets, and switch to GraphQL if a page wants less than a whole document. [A Vite + Vue SSR frontend](../guides/vite-vue-ssr.md) does exactly this.
- **Already a GraphQL shop?** Point your client at `/graphql`. The schema is generated from your content types and introspection can be switched on for tooling.
- **A script, a CDN worker, another system?** REST.

## Errors

Every error carries a key from the [catalogue](../reference/errors.md), in the same
[body](../reference/errors.md#the-error-body) on REST and in GraphQL `extensions`. On the
public instance unexpected errors are always masked; keys and statuses are not. A 404 means the
document is not published or does not exist; a 5xx means the CMS could not answer:
render those differently.
