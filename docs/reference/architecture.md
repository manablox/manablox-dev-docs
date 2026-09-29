---
title: 'Architecture'
description: 'How the packages fit together, what happens to a request on each surface, and the data model behind it.'
---

Manablox is one core (content-type definitions with a hook bus) and a set of consumers
of it. Nothing in `@manablox/core` knows about a specific field type, a database or an HTTP
framework; each of those arrives through one package that depends on core, never the other
way round.

## Packages

<!-- Generated from public/reference/architecture.mmd of this repository: pnpm diagrams -->
![Package dependency graph: fields, db and cache depend on core; services, auth and jobs on db; media on db and storage; the three transports (api-rpc, api-graphql, api-public) on services and media, api-rpc also on auth; the server on the transports, jobs and cache; the first-party plugins (website, ai, workflows, webhooks) on the server, api-rpc and services, and nothing in core on them; the admin uses api-rpc for types only and the SDK reaches the server over HTTP.](/reference/architecture.svg)

On GitHub the image above does not render; open [architecture.svg](https://github.com/manablox/manablox-dev-docs/blob/main/public/reference/architecture.svg) instead.

| Layer | Package | Owns |
| --- | --- | --- |
| Core | `core` | `Manablox` (the instance), the field-type and content-type registries, the hook bus, config resolution, `ManabloxError` and the error-key catalogue, env readers. The main entry point is browser-safe; `/node` holds the server-only helpers, which the main entry point does *not* re-export. The plugin contract (tables, permissions, controls, RPC, server modes, data providers, block extensions, CLI contributions) lives here too, so no core package names a plugin. |
| Field types | `fields` | The fourteen built-in field types, each a `defineFieldType()` in one file. A plugin adds more the same way. |
| Storage | `db` | One description per table in `definitions/`, from which the Postgres and the SQLite tables are both built, the migrations, one repository per table group (the content repository is split by concern: reads, writes, tree, publish, versions), the filter/sort builder, the test-database helper. `repos.transaction(fn)` runs several writes as one unit: `fn` gets repositories bound to the transaction and must use only those (a nested call opens a savepoint), and their `afterCommit` holds side effects such as live-workflow and audit notifications until the commit. |
| Domain | `services` | Everything above a repository: validation and block recursion, permissions, localisation, the hook calls around each write, publish, cache purge; the space and membership rules; per-request DataLoaders; the public query builder. A write that touches several rows runs in one `repos.transaction`: `using(repos)` binds a service to it, and hooks, cache purges, notifications and registry reloads wait for the commit. |
| Transports | `api-rpc`, `api-graphql`, `api-public` | Input schemas, permission checks and the mapping to the services. They hold no rules of their own. |
| Host | `@manablox/server` | Assembles the runtime (`bootstrap`), mounts the surfaces (`createApp`) and serves the admin when configured. The CMS repository's `apps/api` and `apps/public-api` are two configs booting it, the website plugin's site process is another, and a project that depends on the CMS is one more, through the `manablox` CLI. |
| Command line | `@manablox/cli` | The `manablox` executable: it loads `manablox.config.ts` and hands it to the host, and scaffolds instances and frontends. Nothing depends on it; it depends on the host. |
| Designed sites | `plugin-website`, `site`, `site-renderer` (premium, in their own repository) | The website plugin: its services, tables, procedures, the `website` server mode and the prebuilt admin bundle of the designer. `site`: browser-safe design types, validation, the CSS compiler and generated designs. `site-renderer`: Vue server rendering of a page, the islands and the design canvas. Only the plugin uses them; the site process boots its mode. See [Designed sites](../site/index.md). |
| AI | `plugin-ai` (premium, in its own repository) | The AI plugin: providers with encrypted keys, text, document, image and video generation, designs of content types, templates and workflows, the `ai.generate` workflow action, its procedures and its admin bundle. Other plugins reach its services with `plugins.get('ai')`. See [AI](../admin/ai.md). |
| Workflows | `plugin-workflows` | The workflows plugin: the engine, the canvas graph and its validation, the built-in actions and trigger kinds, versions, runs, workflow files, the clock, its procedures and its admin bundle. Other plugins add actions, trigger kinds, field kinds and design hints through its extension points and start runs with `plugins.get('workflows').engine.runTrigger`. See [Workflows](../admin/workflows.md). |
| Webhooks | `plugin-webhooks` | The webhooks plugin: incoming and outgoing endpoints, their tables, the delivery log and the `webhooks:deliver` job, the incoming route `/plugins/webhooks/in/...`, its procedures, code-declared endpoints and its admin bundle. It fires `webhooks:received` for every verified incoming call, and with the workflows plugin adds the webhook trigger and abort trigger and starts runs from calls. Other plugins reach its services with `plugins.get('webhooks')`. See [Webhooks](../admin/webhooks.md). |
| Admin extension | `admin-plugin`, `admin-sdk` | The admin plugin contract and build preset, and the UI kit, stores and clients the prebuilt admin shares with plugin bundles loaded at runtime. See [Admin plugins](../extending/admin-plugins.md). |
| Clients | `admin`, `public-sdk`, `nuxt`, `live-preview` | The admin imports the *type* of the RPC router; the SDK talks HTTP to a public instance; the live preview protocol connects the admin to a framed frontend. |

The rule for where a change goes: **move logic down, not sideways.** A rule belongs in
`services` if it needs the database, in `core` if it does not; a transport only validates
input, checks a permission and calls one method.

## The instance

`bootstrap(config)` builds a `Runtime`: the `Manablox` instance, the database handle and
repositories, auth, the cache, the storage driver, the media, content, content-type and
space services, and the job runner. `createApp(runtime)` then mounts one surface per scope
the configuration names. Which surfaces a process exposes is a config decision
(`server.scopes`), not a separate deployable: one image runs the management API, the
public delivery API, or both.

The registry holds content types from two sources that produce identical definitions:
`manablox.config.ts` (source `code`, immutable at runtime) and the `content_types` table
(source `runtime`, edited in the admin). Creating a runtime type reloads the registry and
bumps `schemaVersion`, which is what the GraphQL schema cache keys on.

## A request, per surface

Every request passes the same middleware first (request id, statement counter, secure
headers, CORS, rate limit, structured log), then reaches one of:

**Management RPC (`/rpc`, `/api/v1`).** The oRPC handler resolves a principal from the
session cookie or an API key, builds a context with the runtime's services and fresh
DataLoaders, and runs the procedure. `scoped(permission)` reads `spaceId` from the input and
asserts the permission before the handler runs. A `ManabloxError` is mapped to an oRPC error
whose `data` is the [error body](./errors.md#the-error-body), which the admin turns into a
sentence.

**Delivery GraphQL (`/graphql`).** Pothos builds an object type per content type from the
registry. Relation fields resolve through DataLoaders, so a list with several relations
costs a handful of `= any($1)` reads. On the management instance a preview header plus a
principal reads drafts; on the public instance the draft path does not exist: the loaders
are constructed published-only, the space is pinned from config, and the `spaceId` argument
is removed from the schema.

**Delivery REST (`/v1`).** The same query builder (`toPublicListQuery`) and the same
loaders as GraphQL, serialised to plain JSON with `expand` for inlining relations. The two
surfaces cannot disagree about what is visible because they share the code that decides.

**Media (`/media`, `/upload`).** Uploads go to the storage driver and record an asset;
reads serve originals and signed transforms, derived on demand. Eager presets are queued
as `media:derive` jobs when there is Redis, and rendered inside the upload without it.

The rate limiter counts named rules in sliding windows, per client address, API key, user
or space, with limits the control API can set per space. Its counters live in the process
unless the instance has a Redis URL, in which case every replica counts into the same
Redis keys and shares one budget; a store that cannot be reached lets the request
through and logs a warning, so a Redis outage cannot take the API down with it.

## Content

A document is a row in `contents`, keyed by a UUID, in one space and one locale, with its
field values in a JSONB column. See [Data model](./data-model.md) for the columns.

- **Tree.** `path` is an `ltree` of ids from the root down. Subtree queries are one `path <@ ...` with a GiST index; a move rewrites the subtree's paths in one statement.
- **Permalinks.** Each node stores its own segment (`permalink_segment`, null for a type without a slug) and the accumulated prefix (`permalink_path`). Recomputation is a single recursive CTE that needs no knowledge of the registry.
- **Translations.** One row per locale, tied together by `localization_id`. Fields a type marks non-localised are copied across siblings on every save.
- **Draft and published.** `published_contents` mirrors `contents` column for column. Publishing copies the row inside a transaction and recomputes permalinks beneath it when its own path changed; unpublishing deletes the subtree from the projection and sets every draft that lost its copy back to `draft`. Delivery reads the projection; the admin reads drafts.
- **Versions.** Every save snapshots the whole row into `content_versions`; restore is a save of a snapshot. `version` on the row is the optimistic lock.

## Caching

The public instance caches delivery responses in Valkey (or memory) under a key, and
indexes each entry by every content id, type id and space id the response touched. A
publish, unpublish or delete runs the `cache:purge` hook with those tags and drops exactly
the entries that referenced them. A response that could change when a *new* document
appears (an unfiltered list, a permalink that resolved to nothing) is filed under the
space tag and is the only kind a publish elsewhere in the space invalidates.

Each delivery surface reports the digest of what it answered, and the cache-header
middleware builds the weak `ETag` from it; a response served from the response cache
carries the digest stored beside it, so a hit re-hashes nothing. A handler that reports
no digest has its body hashed instead.

Assets have no draft state of their own, so `asset_usages` records which documents
reference which assets and whether any of those is published; the public asset loader
refuses an asset nothing published points at.

## Where to read next

- [Hooks](../extending/hooks.md): the whole surface, generated from the type map.
- [Error keys](./errors.md): every key, generated from the catalogue.
- [HTTP API reference](./http-api.md): every endpoint, generated from the routers.
- [The public API](../delivery/public-api.md) and [Caching](../delivery/caching.md): what public mode changes and how the tag purge works.
- [Data model](./data-model.md) and [Testing](./testing.md).
