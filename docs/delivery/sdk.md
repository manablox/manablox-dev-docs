---
title: 'The SDK'
description: '`@manablox/public-sdk`: the delivery client for any JavaScript frontend, its two transports, caching, errors, assets, preview, and the type generator.'
---

`@manablox/public-sdk` is the delivery client for any JavaScript frontend. Zero runtime
dependencies, ESM + CJS, and safe to load in a browser, an edge worker or Node. Everything
it does can be done with plain `fetch` against [REST](./rest.md) or [GraphQL](./graphql.md);
what it adds is one interface over both, a consistent result shape, deduplication and
caching, retries, typed errors, asset URL helpers and a type generator.

```sh
pnpm add @manablox/public-sdk
```

```ts
import { createClient } from '@manablox/public-sdk';

const cms = createClient({ url: 'https://cms.example.com' });

const page = await cms.byPermalink('/about');
const menu = await cms.menu('main');
// menu.items[0].href, .label, .content, .children
```

## Transports

One interface, two surfaces:

```ts
createClient({ url, transport: 'graphql' })  // default: ask for exactly what you render
createClient({ url, transport: 'rest' })     // no selection sets at all
```

Every method below works on both, and both are covered by the same test suite. That is
the actual claim: nothing above the transport option differs. Pick REST when you would rather not write
selection sets; pick GraphQL when a page should fetch less than a whole document.

GraphQL takes an optional `selection` for type-specific fields; REST ignores it, because
a document arrives whole:

```ts
await cms.byPermalink('/about', {
  selection: '... on Page { summary components { blockId typeName } }',
});
```

The SDK always selects the `ContentNode` fields (`id`, `type`, `title`, `slug`,
`permalink`, `locale`, `publishedAt`, `updatedAt`, `tags`), so a selection only names what
is specific to the type.

A document and an asset both carry `tags`, a list of `{ name, slug }`, and a list can be
narrowed to them:

```ts
const travel = await cms.list({ type: 'article', tags: ['travel'] });
```

See [Tags](../admin/tags.md).

## Methods

| Method | Returns |
| --- | --- |
| `byPermalink(path, options?)` | `ContentNode \| null`: the routing entry point |
| `get(id, options?)` | `ContentNode \| null` |
| `list(args?, options?)` | `Page<ContentNode>`: `args` are `type`, `parentId`, `under`, `search`, `tags` (slugs, any of which matches), `limit` (at most 100), `offset`; `total` counts every match on both transports |
| `menu(name, options?)` | `Menu \| null`: entries nested, each with `label`, `href`, `url`, `target`, `content` and `children` |
| `redirects(options?)` | `Redirect[]`: every [redirect](../admin/redirects.md#fetching-them) of the locale, each with `locale`, `fromPath`, `toPath`, `status` and `contentId`. Paths carry no locale prefix |
| `asset(id, options?)` | `Asset \| null` |
| `types(options?)` | The content model, for codegen |
| `query(gql, variables?)` | The escape hatch: GraphQL transport only |

`RequestOptions`, accepted by every method: `locale`, `expand` (relation fields to
inline; REST sends `?expand=`, GraphQL resolves them anyway), `selection` (GraphQL only),
`signal` (an `AbortSignal`), `fresh` (skip the cache once). `withLocale(locale)` returns
a client bound to another locale.

`createClient` options: `url`, `transport`, `locale`, `spaceId` (only meaningful against
a management instance), `environment` (with `spaceId`: the environment to read by its
technical name, sent as `x-manablox-environment`; production when absent), `graphqlPath`,
`blockExtensions` (below), `headers`, `cache`, `timeout`, `retry`, `fetch` (to supply your own). A public instance
reads the environment of its API host instead.

Field values are presented **both** flattened onto the node and under `fields`, so
`page.summary` and `page.fields.summary` are the same value. A template wants the first;
code that iterates wants the second.

Blocks are normalised the same way whichever transport delivered them: each is
`{ blockId, type, fields, ...the fields flattened }`, with `type` the block type's name;
`layout` stays on the block. Plugin data a block is delivered with (like a designed site's
`design`) stays on the block too, out of `fields`. REST keeps it apart by itself; GraphQL
sends it next to the fields, so the client option `blockExtensions` names those keys
(none by default; `['design']` for the website plugin, plus the keys of other plugins), and
a `null` one is left out as REST does. `DesignedBlock` in
`@manablox/site/sdk` types a block with its `design`.
`normaliseFields()` is exported for a frontend that receives a document from elsewhere
(the visual editor's channel sends fields in storage shape) and wants the same form.

## Deduplication and caching

```ts
createClient({ url, cache: { ttl: 30_000, max: 100 } })
createClient({ url, cache: false })
```

Two callers asking the same question at the same moment share one request: always, even
with `ttl: 0`. A page rendering a menu in the shell and again in a footer issues one
query.

The cache is per-client and in-memory by design. A cache shared across requests on a
server would serve one visitor's response to another; the delivery API is anonymous
precisely so a CDN can do that job properly.

Pass `{ fresh: true }` to bypass it for one call.

## Timeouts, retries and cancellation

```ts
createClient({
  url,
  timeout: 10_000,
  retry: { attempts: 3, baseDelay: 200, maxDelay: 2000 },
});
```

- 5xx and 429 are retried with exponential backoff and **full jitter**: without jitter every client retries in lockstep after an outage.
- `Retry-After` wins over the computed backoff: the server knows more than we do.
- 4xx is never retried; it will fail the same way every time.
- `signal` cancels a request, and a superseded navigation raises `ManabloxAbortError` rather than a timeout.

## Errors

```ts
import { ManabloxHttpError, ManabloxGraphQLError, ManabloxTimeoutError } from '@manablox/public-sdk';

try {
  await cms.byPermalink(path);
} catch (error) {
  if (error instanceof ManabloxTimeoutError) return renderStale();
  if (error instanceof ManabloxHttpError && error.isNotFound) return render404();
  throw error;
}
```

On the REST transport a 404 is already translated to `null`; a 500 stays an error,
because "this page does not exist" and "the CMS is down" must not render the same way.
`ManabloxHttpError` parses the [error body](../reference/errors.md#the-error-body): `key`,
`details` and the whole object as `error`. `ManabloxGraphQLError` carries the `errors` array
a GraphQL response returned, `key` reads the first one's `extensions.key`, and `status` is
the HTTP status: 200 for field errors, the error's own status when the server refused the
whole request (a query past the depth limit answers 400, an unknown space 404).
`ManabloxAbortError` is raised when the `signal` fires.

## Assets

```ts
import { assetUrl, assetSrcSet, isImage } from '@manablox/public-sdk';

assetUrl(asset);                      // the original
assetUrl(asset, { preset: 'card' });  // the server-signed transform
assetSrcSet(asset, { thumb: 320, card: 640, hero: 1920 });   // "url 320w, url 640w, ..."
isImage(asset);                       // mimeType starts with image/
```

The SDK does **not** construct transform paths. They carry an HMAC of the instance's
media secret: an unsigned transform request is a resize amplifier, and the server
refuses it. So signed URLs are served in `asset.variants` and looked up here. An unknown
preset falls back to the original rather than producing a URL that 403s.

Over REST every asset arrives with `variants` filled in. Over GraphQL the schema exposes
`variant(preset:)` instead, and the SDK's default asset selection does not include it,
so either select what you need (`card: variant(preset: "card")`) and use it directly,
or use the REST transport for pages that render images through presets.

## Block grids

A `blocks` field arrives as `{ grid, blocks }`: the grid this document lays its blocks
out on, resolved for every breakpoint (desktop, tablet below 1024px, mobile below
640px) or `null` for a plain list, and the blocks, each with a `layout` where it was
placed. Inline styles cannot carry media queries, so the SDK splits the work: two
helpers write CSS custom properties onto the list and each block, and one small
stylesheet reads them behind the media queries.

```ts
import {
  BLOCK_CLASS, BLOCK_GRID_CSS, GRID_CLASS,
  blockLayoutStyle, blocksGridStyle, blocksOf, gridOf,
} from '@manablox/public-sdk';

const value = page.components;            // { grid, blocks }

// once per page
`<style>${BLOCK_GRID_CSS}</style>`
// the list
`<div class="${GRID_CLASS}" style="${blocksGridStyle(value.grid)}">`
// each block
`<section class="${BLOCK_CLASS}" style="${blockLayoutStyle(block, value.grid)}">`
```

`blocksGridStyle` yields `--mb-cols: 3; --mb-cols-md: 2; --mb-cols-sm: 1` (and `--mb-rows*`
where rows are fixed); `blockLayoutStyle` yields `--mb-col: 2 / span 2; --mb-row: 1;
--mb-col-md: 1 / span 2` and so on, and `''` for a block the grid places itself. The
stylesheet maps them to `grid-template-columns`, `grid-column` and `grid-row` at each
breakpoint. `blocksOf(value)` and `gridOf(value)` read the `{ grid, blocks }` value; pass
`blocksGridStyle` the blocks instead of a grid and it is as wide as the widest placed
block at every breakpoint.

`placementAt(layout, breakpoint, grid)`, `resolveBlockGrid(grid)`, `uniformGrid(n)` and
`breakpointFor(width)` are exported for a frontend that renders differently.

Over GraphQL a block field is a `BlockList`: select `grid` and `blocks { ... }`; over
REST the value is the same object.

## Rich text

A `richtext` field arrives as a ProseMirror document, the JSON the admin's editor
produces. The SDK renders it, so a frontend never has to walk the tree by hand (which is
where bold, italic and links tend to get lost):

```ts
import { richTextToHtml, richTextToText, isRichTextEmpty } from '@manablox/public-sdk';

richTextToHtml(page.body);   // '<h2>Hello</h2><p>Some <strong>bold</strong> text</p>'
richTextToText(page.body);   // 'Hello Some bold text'
isRichTextEmpty(page.body);  // true for an untouched field
```

`richTextToHtml` escapes every string and emits a fixed set of tags (`p`, `h1` to `h6`,
`ul`, `ol`, `li`, `blockquote`, `pre`, `code`, `hr`, `br`, `img`, `table` and its cells,
and `strong`, `em`, `u`, `s`, `code`, `sub`, `sup`, `a` for marks), which is what makes
the output safe for `innerHTML`, `v-html` or Astro's `set:html`. A link is kept only
when its address is `http(s):`, `mailto:`, `tel:`, root-relative or a fragment; a
`javascript:` address renders as plain text. A node type the renderer does not know
renders its text rather than vanishing.

The output carries no classes. Style it from the wrapping element, or post-process the
HTML if a design needs more.

## Preview

Preview lives behind its own entry point:

```ts
import { createPreviewClient } from '@manablox/public-sdk/preview';

const preview = createPreviewClient({ url: MANAGEMENT_URL, apiKey: process.env.MANABLOX_API_KEY! });
```

**Import this only from server code.** Keeping it out of the main entry means a bundler
cannot follow an import into a browser bundle and ship an API key with it: that
separation is the whole design, and a test asserts the main entry never reaches it.

It talks to the *management* instance, on the GraphQL transport, with caching off. The
public instance does not compile the draft path in, so pointing this at one returns
published content and nothing else. See [Preview and the visual editor](./preview.md).

## Generating types

`ContentNode` carries an index signature, which is honest (each installation defines its
own content model) but gives you nothing. Replace it:

```sh
npx manablox-sdk types --url https://cms.example.com --out src/manablox.d.ts
```

```ts
export interface Page extends ContentNode {
  type: 'page';
  summary?: string | null;
  hero?: string | Asset | null;
  components?: Array<Teaser>;
}
```

Then `cms.byPermalink<Page>(path)` autocompletes `page.summary` and rejects
`page.sumary`.

It reads `/v1/types`, not the GraphQL schema: introspection is off on a public instance
by design. `--url` defaults to `MANABLOX_URL`; `--prefix` prepends a string to every
interface name; without `--out` it prints to stdout. **Check the output in.** Renaming a
field in the admin should surface as a diff and a type error, not as `undefined` at
runtime.

The file also exports a `Content` union of every content type and a `ContentByName` map,
for `list<ContentByName['page']>()`. Block types extend `Block`.

A relation generates as `string | Asset` because that is the truth: it arrives as an id
unless the call passed `expand`. Committing to one would make the types lie in whichever
mode you did not use.
