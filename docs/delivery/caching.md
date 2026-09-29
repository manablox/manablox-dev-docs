---
title: 'Caching'
description: "The layers between a publish and a visitor: the delivery response cache and its tag-based purge, the HTTP headers a CDN honours, image caching, and the SDK's own cache."
---

Nothing is cached in a way that outlives a publish: every layer is either purged by the
publish or told to revalidate cheaply.

## The delivery response cache

The public instance caches delivery responses in Valkey (or in memory without `REDIS_URL`) for `CACHE_TTL` seconds (300 on
the public instance by default). The instance is anonymous, so one entry serves every
viewer.

Each entry is **tagged** with what the request actually read: `content:<id>` for every
document it touched, `type:<id>` for every content type it filtered by, and `space:<id>`
only for a response that a *new* document could change: an unfiltered list, a menu, a
permalink that resolved to nothing, the home page. A publish, unpublish or delete runs the
`cache:purge` hook with the document's tags and drops exactly the entries that
referenced it; a response filed under the space tag is dropped by any publish in the
space, and by nominating or clearing the home page. The redirects of a space are also filed
under `redirects:<id>`, which every redirect change purges.

A staging environment's entries have keys of their own, so it never shares an entry with
production. Where an entry is filed under `space:<id>` it is also filed under
`space:<id>:env:<environment id>`. A write in a staging environment purges that tag instead
of `space:<id>`, so production entries stay; production writes and space-wide changes
purge `space:<id>`, which drops the staging entries too. Production keeps the tags above
unchanged, so CDN setups keyed on them keep working.

Assets work the same way: `asset:<id>` for every asset a response carries, purged by any
edit or delete of it, and `asset-list:<space id>` for a response holding an asset filter
relation, purged by an upload, a rename, an asset added to the space and any document
write (a publish can make an asset public), since each can change which assets such a list
matches.

A response carrying `errors` is never cached and is marked `no-store`: an error cached
for a TTL would turn a database blip into a minutes-long outage.

> **Set `REDIS_URL` on both instances.** Without it each process has its own memory
> cache, and the purge runs only in the process that published, so a publish on the
> management instance cannot invalidate the public instance's cache, and stale content is
> served until the TTL expires. A shared cache is what makes the purge cross the process
> boundary. The same goes for two public instances behind a load balancer. `REDIS_URL`
> also moves the rate limiter's counters into Redis, so replicas share one budget instead
> of one each; see [Operations](../deployment/operations.md#scaling-by-role).

`fresh: true` on an SDK call bypasses only the SDK's cache, not this one.

## Lookups kept in process

Besides the shared response cache, each process keeps a few lookups it would otherwise
repeat on every request, for at most 5 seconds (a space's production environment for up
to 10 minutes): a site host's space, environment, settings and domains; the menus a site
design names; space rows (default locale, readiness); the public API's host resolution;
the resolved [controls](../configuration/controls.md); a space's live workflow triggers.
They carry the same cache tags as the responses, so the purge that drops a response drops
them too, in this process at once and, with `REDIS_URL`, in every other process over a
Redis channel (a reconnect drops them all, since purges may have been missed).

## Turning caching off

`CACHE_ENABLED=false` turns the content caches off, for debugging or a deployment that
wants each request to read its content from the database:

- the delivery response cache (REST, GraphQL, site pages);
- the lookups kept in process listed above, except the controls, and the "space is ready"
  memo: every request reads the database.

What stays:

- the resolved [controls](../configuration/controls.md), in process and in the shared
  Redis cache: control values are configuration, not content, and a control write still
  drops them in every process at once;
- memos keyed by what they were built from, which cannot go stale: GraphQL schemas by the
  content model's digest, site design bundles by design revision, stylesheets by content
  hash (a page's instance stylesheet lives only there);
- the content model itself, loaded at boot and kept in step by the registry sync;
- state: rate limit counters, usage counts and levels, promote markers, idempotency keys
  of the control API, the owner space of an asset;
- OAuth access tokens of credentials and mail transports, reused until they expire as the
  providers expect;
- request-scoped deduplication (a request reads a document or a relation once).

## HTTP headers, for a CDN

Delivery responses carry an `ETag` and, on GET:

```
Cache-Control: public, max-age=0, s-maxage=<ttl>, stale-while-revalidate=<ttlx10>
```

The `ETag` is a weak one: it is a truncated SHA-1 of the payload and its length, so it
changes with the payload and is never a claim about who wrote it. The surface that
answers computes it as it serialises, and a cached response carries the digest stored
beside it, so a cache hit re-hashes nothing. A miss costs a little on a large list -
about a tenth of a millisecond on a 28 kB one - and saves the payload whenever a client
revalidates.

`max-age=0` keeps browsers from holding a page; `s-maxage` lets a CDN hold it for the
TTL and `stale-while-revalidate` serve it while refreshing. Conditional requests
(`If-None-Match`) return 304. Configure the CDN to purge on publish if it supports it:
the `cache:purge` hook is where to call it from, see [Hooks](../extending/hooks.md),
or accept the TTL as the maximum staleness.

Image variants at `/media/{id}/{preset}.{format}` are `immutable` with a far-future
`max-age`: the URL carries the asset's version, so a re-cropped image gets a new URL
rather than a stale hit.

The management instance renders a variant once and keeps it in storage. The public
instance writes neither storage nor the database, so a variant nobody has rendered yet is
rendered there into `media.cachePath` (`PUBLIC_MEDIA_CACHE_PATH` in a scaffolded
project), a local directory that must be writable. Losing it costs a render, not an image.

## A frontend's own cache

A server-rendered frontend should cache too, with the same rules:

- Serve pages with `s-maxage` and `stale-while-revalidate`, and **`no-store` on an error page**, so a CMS outage is not cached as a 404.
- The SDK deduplicates identical in-flight requests and holds results for a short TTL **per client instance**. Create one client per process and let it dedupe the menu the shell and the page both ask for; do not share a client's cache across requests that differ in locale or preview state (`withLocale` makes a separate client).
- Incremental static regeneration (Nuxt's `isr`, a similar mode elsewhere) with a window equal to the CMS's TTL is a good default, for instance `isr: 300` in Nuxt.

## What is never cached

Anything on the management instance: it has no response cache, so the admin and preview
reads always see the current state. `createPreviewClient` turns the SDK's cache off too.
