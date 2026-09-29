---
title: 'GraphQL'
description: 'The generated delivery schema: one object type per content type, the root fields, blocks and relations, preview, and the limits.'
---

`POST /graphql` on either instance. The schema is **generated from the content types at
boot** and regenerated when a type is saved in the admin, so it always matches the model.

## The schema

Each content type becomes a real GraphQL object type implementing `ContentNode`; each
block type becomes one implementing `Block`. Type names are PascalCase
(`blog-post` -> `BlogPost`), field names camelCase (`meta_description` ->
`metaDescription`). Required fields are non-null. Fields with `readRoles` are **omitted
from the public schema entirely** rather than present and always null.

```graphql
interface ContentNode {
  id: ID!
  typeName: String!
  title: String!
  slug: String!
  permalink: String
  locale: String!
  status: String!
  publishedAt: DateTime
  updatedAt: DateTime!
  parent: ContentNode
  children: [ContentNode!]!
  tags: [Tag!]!
}

type Page implements ContentNode {
  # ...the ContentNode fields...
  summary: String
  components: [Block!]
}

interface Block { blockId: ID!  typeName: String!  layout: JSON  design: BlockDesign }
type BlockDesign { variant: String  style: JSON }   # website plugin: set where an editor styled the block

type Teaser implements Block {
  blockId: ID!
  typeName: String!
  headline: String
  body: JSON
  image: Asset
}

type Asset {
  id: ID!  name: String!  filename: String!  mimeType: String!  size: Int!
  width: Int  height: Int  alt: String  title: String
  focalPoint: FocalPoint  crop: AssetCrop
  tags: [Tag!]!
  url: String!                                  # the original
  variant(preset: String!, format: String): String!   # a signed transform URL
}

type Tag { name: String!  slug: String! }

type Menu { id: ID!  name: String!  machineName: String!  items: [MenuItem!]! }
type MenuItem { id: ID!  label: String!  url: String  target: String!  content: ContentNode  children: [MenuItem!]! }
```

A field's GraphQL type follows its field type: `string` -> `String`, `number` -> `Int` or
`Float`, `date` -> `DateTime`, `richtext` -> `JSON`, `blocks` -> `BlockList` (`grid` and `blocks`), `select` -> `String` or `[String]`,
relations -> `Asset`, `ContentNode` or `User`, block fields -> `Block` or `[Block]`, and a `repeater` -> a list of an object type generated for the field (for example `ArticleQuotesItem`; the exact name appears in the schema) with `itemId` and one field per sub-field.
See [Field types](../content-model/field-types.md).

## Root fields

| Query | Purpose |
| --- | --- |
| `contentByPermalink(permalink, locale)` | Resolve a URL path: the routing entry point. `""` resolves the home page |
| `content(id)` | One document by id |
| `contentsPage(type, parentId, under, search, tags, locale, limit, offset)` | Filtered lists, answering `{ items, total, limit, offset }`; `tags` is a comma-separated list of tag slugs, any of which matches; `limit` defaults to 25, `offset` to 0 |
| `menu(name, locale)` | One named menu, entries nested |
| `redirects(locale)` | Every [redirect](../admin/redirects.md#fetching-them) of a locale, each with `locale`, `fromPath`, `toPath`, `status` and `contentId` |
| `asset(id)` | One asset |

On the management instance each also takes `spaceId`; on the public instance the space
is pinned and the argument does not exist.

`limit` is at most 100, the same maximum as REST; a larger one fails with
`query.limit.invalid`. Every document these fields return, relations included, passes
through the read hooks (see [Hooks](../extending/hooks.md)).

## One schema per space

Two spaces may each have a type called `article` - content type names are unique within
a space, not across the instance - and one schema cannot hold two `Article` types. So the
schema is built **per space** and chosen per request:

- the **public instance** is pinned to one space, and its schema is that space's;
- the **management instance** reads `x-manablox-space`, the same header that decides which space's documents it serves, so the model and the data always agree. The SDK sends it from its `spaceId` option.

A space's schema holds its own types plus any the configuration defines globally.
Without the header the management instance falls back to every space's types taken
together; where two spaces disagree about a name the first is kept and the collision is
logged, so the endpoint stays introspectable. Name the space to get the right model.

Each schema is cached until a content type it holds is saved, so a request pays for a
build once.

### Environments

A space's staging environments have content types of their own. The management instance
reads the environment from `x-manablox-environment` (its technical name, e.g. `staging`),
next to `x-manablox-space`; without it the request reads production. The schema, the
documents, the menus and the cache entries are then that environment's, and a document
id of another environment reads as missing. An environment other than production needs
the `environments` feature (403 `control.feature` otherwise), and an unknown name answers
404 `environment.notFound`. Staging answers carry `X-Robots-Tag: noindex, nofollow`. The
SDK sends the header from its `environment` option. On the public instance the API host
decides the environment, see [Which space a request reads](./public-api.md#which-space-a-request-reads).

## A page, with its blocks

```graphql
query Page($permalink: String!, $locale: String) {
  contentByPermalink(permalink: $permalink, locale: $locale) {
    id title permalink
    ... on Page {
      summary
      components {
        blockId typeName
        ... on Teaser {
          headline
          body
          image { alt width height url variant(preset: "card") }
        }
      }
    }
  }
}
```

Relations resolve through DataLoader, so a 50-item list with three relation fields is a
handful of queries rather than roughly two hundred. `parent` and `children` walk the
tree the same way.

## Introspection

Off on the public instance unless `GRAPHQL_INTROSPECTION=true`; on the management
instance it follows `NODE_ENV`. For type generation the SDK reads `/v1/types` instead,
which is always available. See [The SDK](./sdk.md#generating-types).

## Preview

On the management instance, a request carrying both a valid credential (`x-api-key` or
a session) **and** the `x-manablox-preview` header reads drafts instead of published
copies. A preview header alone is ignored. See [Preview and the visual editor](./preview.md).

## Limits

- Queries deeper than `GRAPHQL_MAX_DEPTH` are rejected (12 on the management instance, 8 on the public one). The schema is cyclic (`content -> parent -> content`), so a limit is needed. Fragment cycles are detected rather than walked.
- A complexity budget, `GRAPHQL_MAX_COMPLEXITY` (5000 / 1000). A field costs one and a `limit` multiplies its selection; on `contentsPage` the `limit` sizes `items` once.
- The delivery schema has **no mutations**, and the public instance refuses to boot if a plugin adds one.
- Optional persisted-operations allowlist on the public instance. See [The public API](./public-api.md#persisted-operations).

## Errors and HTTP status

Each entry of `errors` carries `extensions` with `key`, `kind`, `status` and `details`; see
[the error body](../reference/errors.md#the-error-body). The HTTP status follows the GraphQL
over HTTP spec, so it can depend on the `Accept` header:

- A field error raised while the query runs (an unknown `type`, a `limit` over 100) answers 200 with `data` and `errors`, whatever the client accepts.
- A document refused before it runs (a syntax error, an unknown field, the depth or complexity limit, introspection while it is off) answers 400 when the client accepts `application/graphql-response+json`, and 200 when it accepts only `application/json`, the legacy media type. A request without an `Accept` header gets `application/json`. The SDK asks for `application/graphql-response+json`.
- The depth limit, the complexity limit and disabled introspection carry the keys `graphql.query.tooDeep`, `graphql.query.tooComplex` and `graphql.introspection.disabled` (kind `bad_request`) next to their `code` (`QUERY_TOO_DEEP`, `QUERY_TOO_COMPLEX`, `INTROSPECTION_DISABLED`); the limit errors add `maxDepth` or `maxComplexity`.
- A refused persisted operation answers 400 with either media type, with the key `graphql.persisted.required` (code `PERSISTED_QUERY_REQUIRED`, raw query text sent) or `graphql.persisted.notFound` (code `PERSISTED_QUERY_NOT_FOUND`, a hash missing from the manifest), kind `bad_request`.
- A request refused before GraphQL runs answers its own status with either media type, and the body keeps the GraphQL shape (`errors`, no `data`): 429 past the rate limit, 404 for an unknown space or one whose import has not finished.

## From a client

Any GraphQL client works; the SDK's GraphQL transport adds the `ContentNode` fields for
you so a selection names only what is specific to the type:

```ts
const cms = createClient({ url, transport: 'graphql' });
const page = await cms.byPermalink('/about', {
  selection: '... on Page { summary components { blockId typeName ... on Teaser { headline body } } }',
});
await cms.query('{ contentsPage(type: "page") { total items { title } } }');   // the escape hatch
```
