---
title: 'Read it from a frontend'
description: 'Fetch the page you just published over REST, over GraphQL and with the SDK, and learn which one to reach for.'
---

Everything a website needs comes from the **public delivery API**, running at
<http://localhost:3100> in a project from `manablox create` (`pnpm dev:public`). It serves the published content of one
space and needs no login. The three ways to ask it are the same data in three shapes.

## REST

A URL per question. Resolve the page at `about`:

```sh
curl http://localhost:3100/v1/permalink/about
```

```json
{
  "id": "...", "type": "page", "title": "About", "slug": "about", "permalink": "about",
  "locale": "en", "parentId": null, "publishedAt": "...", "updatedAt": "...",
  "fields": {
    "summary": "...",
    "components": [
      { "blockId": "...", "type": "teaser", "fields": { "headline": "...", "body": { "type": "doc", "content": [ ... ] }, "image": "asset-id" } }
    ]
  }
}
```

Field values arrive under `fields`, keyed by the technical names you chose. The rich
text `body` is a JSON document (ProseMirror's format), not HTML: a frontend renders it,
and the SDK's `richTextToHtml` does that for you.
The image is an **id**; add `?expand=image` to inline the asset with its URL and its
resized variants:

```sh
curl 'http://localhost:3100/v1/permalink/about?expand=image'
curl http://localhost:3100/v1/menus/main
curl 'http://localhost:3100/v1/content?type=page&limit=10'
```

Every REST endpoint is listed in [REST](../delivery/rest.md).

## GraphQL

One endpoint, and you say which fields you want. Each content type is a real GraphQL
type, so the *Page* type has a `summary` field and a `components` list:

```sh
curl http://localhost:3100/graphql -H 'content-type: application/json' -d '{
  "query": "{ contentByPermalink(permalink: \"about\") { title ... on Page { summary components { ... on Teaser { headline body } } } } }"
}'
```

GraphQL is the richer surface (ask for exactly what a component renders) at the cost
of writing selection sets. See [GraphQL](../delivery/graphql.md).

## The SDK

`@manablox/public-sdk` wraps both. It runs in Node, in a browser and at the edge, has no
dependencies, and returns the same shape whichever transport it uses:

```ts
import { createClient } from '@manablox/public-sdk';

const cms = createClient({ url: 'http://localhost:3100', transport: 'rest' });

const page = await cms.byPermalink('/about', { expand: ['image'] });
page?.title;             // 'About'
page?.summary;           // field values are flattened onto the node...
page?.fields.summary;    // ...and kept under `fields` too

const menu = await cms.menu('main');
menu?.items[0]?.label;   // 'About'
menu?.items[0]?.href;    // '/about'
```

The SDK also generates TypeScript types from the space's content model, so
`page.summary` autocompletes. See [The SDK](../delivery/sdk.md).

## Which one?

| You are writing... | Use |
| --- | --- |
| A frontend in any framework | The SDK. Start with the REST transport; switch to GraphQL when you want per-component selections. |
| A quick script or a `curl` | REST |
| A frontend that already speaks GraphQL | GraphQL directly, or the SDK's GraphQL transport |

## Drafts and preview

The public API has no drafts. To read unpublished content (for a preview server, a
build that renders drafts), ask the **management API** at <http://localhost:3000> with an
API key and the preview header. See [Preview and the visual editor](../delivery/preview.md).

Next: build a real site with [A Vite + Vue SSR frontend](../guides/vite-vue-ssr.md), or
read [How content is organised](../content-model/index.md) first.
