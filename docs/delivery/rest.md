---
title: 'REST'
description: 'The read-only delivery REST surface on the public instance: the routes, the document shape, expanding relations, menus, pagination and errors.'
---

`GET /v1/...` on the public instance. One definition yields the routes, the OpenAPI
document at `/openapi.json` and the SDK's types. A document arrives **whole**, so there
is nothing to select: this is what makes a framework-free consumer pleasant, and why
the guides use it.

## Routes

| Route | Returns |
| --- | --- |
| `GET /v1/permalink/{path}` | The document at a URL path. `?locale=`, `?expand=`. 404 if none |
| `GET /v1/permalink` | The space's home page: the document starred in the content tree. Same parameters |
| `GET /v1/content/{id}` | One document. `?expand=` |
| `GET /v1/content` | A page of documents: `?type=`, `?parentId=`, `?under=`, `?search=`, `?tags=`, `?locale=`, `?limit=` (default 25), `?offset=`, `?expand=` |
| `GET /v1/menus/{name}` | A menu by technical name. `?locale=`, `?expand=` |
| `GET /v1/redirects` | Every [redirect](../admin/redirects.md#fetching-them) of a locale: `{ items: [{ locale, fromPath, toPath, status, contentId }] }`. `?locale=` |
| `GET /v1/assets/{id}` | One asset's metadata and variant URLs |
| `GET /v1/types` | The space's content model, for type generation |
| `GET /` | A service document naming the surfaces |

The full table with every parameter is in the [HTTP API reference](../reference/http-api.md#delivery-api-v1).

## A document

```sh
curl 'http://localhost:3100/v1/permalink/about?expand=image'
```

```json
{
  "id": "...", "type": "page", "title": "About", "slug": "about", "permalink": "about",
  "locale": "en", "parentId": null, "publishedAt": "2026-09-06T09:00:00.000Z", "updatedAt": "...",
  "tags": [ { "name": "Travel", "slug": "travel" } ],
  "fields": {
    "summary": "...",
    "components": [
      {
        "blockId": "...", "type": "teaser",
        "fields": {
          "headline": "...",
          "body": { "type": "doc", "content": [ ... ] },
          "image": { "id": "...", "url": "http://.../media/.../original", "alt": "...", "width": 1600, "height": 900, "mimeType": "image/jpeg", "variants": { "thumb": "http://...", "card": "http://...", "hero": "http://..." }, "focalPoint": null, "crop": null }
        }
      }
    ]
  }
}
```

- `fields` is a plain map keyed by technical name. Blocks are `{ blockId, type, fields }` with the block type's **name** in `type`, recursively, plus a `layout` on a grid and a [`design`](../content-model/field-types.md#block-design) where an editor chose one (the website plugin delivers it; a block's stored `ext` never leaves as it is). Items of a `repeater` field are `{ itemId, fields }`, with links resolved and expanded references inlined the same way.
- Relations are **ids** unless named in `?expand=hero,author`. Expansion applies inside blocks too, resolves through the same loaders as GraphQL in one batch per target, and inlines a document, an asset or a user as an object. An unpublished document or an asset nothing published references expands to nothing.
- The home page is `GET /v1/permalink` with no path; the SDK's `byPermalink('/')` calls it.

## A list

```sh
curl 'http://localhost:3100/v1/content?type=page&under=<id>&limit=20&offset=0'
```

```json
{ "items": [ ... ], "total": 42, "limit": 20, "offset": 0 }
```

`under` restricts to a subtree, `parentId` to direct children, `search` runs a
full-text query over titles, the fields that contribute to search and the document's tag
names, `type` is a content type's name. `tags` takes comma-separated tag slugs
(`?tags=travel,food`) and keeps a document carrying any of them; every document carries
its own tags in `tags`. Sorting is by tree position, then creation time. `limit` is at most
100, the same maximum GraphQL applies; a larger one is refused, not clamped.

## A menu

```sh
curl 'http://localhost:3100/v1/menus/main?locale=de'
```

```json
{
  "id": "...", "name": "Main navigation", "machineName": "main",
  "items": [
    { "id": "...", "label": "About", "url": null, "content": { "id": "...", "type": "page", "title": "About", "permalink": "about", ... }, "children": [] },
    { "id": "...", "label": "GitHub", "url": "https://github.com/...", "content": null, "children": [] }
  ]
}
```

Entries nest to any depth; a content entry carries the document for the requested
locale, published only; a link entry carries a `url`.

## Errors

An error answers `{ "error": { "key", "kind", "status", "message", "details" } }` (see
[the error body](../reference/errors.md#the-error-body)). A missing document, menu or asset
is a 404 carrying the key `content.notFound`, `menu.notFound` or `asset.notFound`; an
unknown `type` is a 404 with `contentType.notFound`; a query parameter out of range, such as
`limit=101`, is a 422 `validation.failed` with a `validation.invalid` detail naming the
parameter. Unexpected errors are always `internal.error` with no details.
The SDK translates a 404 to `null` and leaves a 5xx as an exception, because "this page
does not exist" and "the CMS is down" must not render the same way.

## Caching headers

Responses carry an `ETag` and `Cache-Control: public, max-age=0, s-maxage=<ttl>,
stale-while-revalidate=<ttlx10>`; conditional requests return 304. See
[Caching](./caching.md).
