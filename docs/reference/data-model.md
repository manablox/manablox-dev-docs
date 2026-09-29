---
title: 'Data model'
description: 'The tables, and the reason behind the columns that are not obvious.'
---

Every table of the core is described once in the `@manablox/db` package, one file per
group ([`packages/db/src/definitions/`](https://github.com/manablox/manablox-cms/tree/main/packages/db/src/definitions)
in the CMS repository). That one description builds both databases: `postgresTable()`
builds the Postgres tables, applied by the generated migrations in the package's
`migrations/`, and `sqliteTable()` builds the SQLite ones with the same columns and row
shapes, migrated from `migrations-sqlite/`, so the two cannot drift apart. This page describes the
Postgres types, and [Database](../configuration/database.md) lists how SQLite stores them.
Everything is keyed by UUID; every table with a `space_id` cascades on the space's
deletion. Column names are `snake_case` in the database and `camelCase` in code
(Drizzle's `casing: 'snake_case'`).

## `spaces`

A space is a site or channel: its own content tree, locales, assets and members.

| Column | Why |
| --- | --- |
| `machine_name` | Unique. Keys the GraphQL schema and the public instance's pinning, so it never changes after creation. |
| `url` | The frontend's origin, for the visual editor's iframe. |
| `default_locale`, `locales` | The default must be one of the locales; content falls back to it. |
| `settings` | Free-form JSONB. `homeContentId` names the document served at `/`; it is cleared when that document is deleted. `environments.<id>` holds a staging environment's own home page. `ai` holds the AI length presets. Plugin settings live in `space_plugin_settings`. |

## `space_environments`

An environment is a copy of a space's content and config: `production`, and optionally
staging environments beside it. Every space has exactly one `production` row, created
with the space (a partial unique index on `space_id` where `kind = 'production'` holds
it); `machine_name` is unique per space and addresses the environment.

| Column | Why |
| --- | --- |
| `kind` | `production` or `staging`. It never changes after create; production is never deleted. |
| `created_from`, `created_mode` | The environment a staging one was copied from, and whether it took `config` only or `full` content too. Null for production. |

Environment-scoped tables carry `environment_id` next to `space_id`, NOT NULL and
cascading with the environment: `contents`, `published_contents`, `content_types` (space
types only), `menus`, `workflows`, `webhooks`, `website_designs`, `website_domains`,
`redirects`, `space_api_hosts`, `content_approvals`, `asset_usages` and
`content_tags`. Their unique keys that named the space name the environment instead, so
staging repeats production's permalinks, slugs and machine names. Child rows reached only
through their parent (`content_versions`, `menu_items`, `workflows_versions`,
`workflows_runs`, `webhooks_deliveries`, `website_design_versions`) take the parent's
environment and have no column of their own. Members, roles, the asset library, tags,
credentials, AI providers, audit, notifications and controls are shared by every
environment of a space.

Repositories take a scope (`{ spaceId, environmentId }`) where they took a space id; a
bare space id means the space's production environment, so production reads never see
staging rows. Count limits and the document counters count production rows only.

## `content_types`

Runtime-defined types only: code-defined ones live in the registry and never touch the
database. A space's type belongs to one environment; a global type (no space) to none, so
`environment_id` is null exactly when `space_id` is. `(environment_id, name)` is unique
with `NULLS NOT DISTINCT`, so two global types cannot share a name either. A type's default
id derives from its space and name, so a type in a second environment needs its own id. `fields` is the JSONB list of field definitions.
`requires_approval` puts the type's documents through [review](../admin/notifications.md#approval-before-publishing).

## `contents` and `published_contents`

The same column set, declared once and used twice. `contents` is the draft the admin
edits; `published_contents` is the projection the delivery APIs read.

| Column | Why |
| --- | --- |
| `localization_id` | Shared by every translation of one logical document. |
| `path` | `ltree` of ids, root first, ending in this node. Subtree queries and moves are one statement each; indexed with GiST. |
| `permalink` | The routable path, or `NULL` for a type without a slug: such a node is a container, not a page, and must not occupy a URL. Unique per environment and locale where not null. |
| `permalink_path` | The accumulated prefix including this node's own segment, with slug-less levels skipped. Descendants derive from this, not from `permalink`, which would be `NULL` at a slug-less level and truncate the chain. |
| `permalink_segment` | This node's own contribution: the slug, or `NULL`. Denormalised so recomputation is a recursive CTE that needs no registry. |
| `fields` | The field values, JSONB, indexed with `jsonb_path_ops`. Field types can also be promoted to real columns via `storage.kind: 'column'`. |
| `search_text` | The concatenation of each field type's `search()` contribution; `search` is a generated `tsvector` over it and the title. |
| `version` | Optimistic lock; a save carrying a stale `expectedVersion` is refused. |
| `source_version` | Projection only: the draft version it was made from. |
| `(environment_id, parent_id, locale, slug)` | Unique with `NULLS NOT DISTINCT`, so root-level siblings cannot share a slug either. |

## `content_versions`

A full snapshot of the row on every save, unique per `(content_id, version)`. Restore
loads a snapshot and saves it, which makes a new version: nothing is ever lost.

## `assets`, `asset_spaces`, `asset_variants`, `asset_usages`

| Table | Why |
| --- | --- |
| `assets` | One row per uploaded file: the storage `key`, the original filename, size, dimensions, a checksum for de-duplication, and `alt`/`title`. `(driver, key)` is unique. It has no space column. |
| `asset_spaces` | Which spaces an asset is in, one row per `(asset_id, space_id)`. An asset has at least one; both sides cascade, and deleting a space then deletes the assets it left in none. |
| `asset_variants` | A derived rendition per `(asset, preset, format)`, generated on demand or eagerly by a job. |
| `asset_usages` | Which documents reference which assets, and whether the *published* projection of any of them does. Assets have no draft state of their own; this is what lets the public API refuse a file only a draft references. |

## `tags`, `content_tags`, `asset_tags`

| Table | Why |
| --- | --- |
| `tags` | The vocabulary of one space: `name` as it is shown and `slug` as the identity, unique per `(space_id, slug)`. Two spellings of one label therefore collapse onto one row. |
| `content_tags` | Which documents carry which tag, keyed by `(tag_id, localization_id)`: a tag is on the document, so every translation shows it. `localization_id` is no table's key, so there is no foreign key on it; the content service drops the rows when a document's last translation is deleted. |
| `asset_tags` | Which assets carry which tag, keyed by `(tag_id, asset_id)`. An asset shared between spaces has a separate set per space, since the tag itself belongs to one. |

Filtering by tag is an `exists` subquery rather than a join, so a list keeps one row per
document however many tags match, and a free-text search ORs the same subquery over tag
names onto the full-text match.

## Auth

`users`, `sessions`, `accounts`, `verifications` and `apikeys` are owned by better-auth
and declared here so Drizzle can join and migrate them. Two additions are Manablox's own:

- `users.role`: the instance-wide role (`superadmin` or `editor`); the first account created becomes superadmin.
- `users.notification_preferences`: per notification kind, the channels the person switched on or off, only where that differs from the catalogue's defaults.
- `apikeys.space_ids` and `apikeys.permissions`: restrictions that narrow a key below its owner's access: the spaces it may act in, and the grants it may use, in the same vocabulary as `roles.permissions`. Both bind a superadmin too.
- `apikeys.environment_ids`: the environments a key may address; null for every environment of its spaces.

`memberships` is the space-scoped role: `(user_id, space_id)` -> the role's machine name,
one of the built-in `owner | admin | editor | author | viewer` or a row in `roles` for
the same space. A space always keeps at least one owner; the service refuses the change
that would remove the last one.

`roles` holds the roles created for a space: a name, a machine name unique per space, and
`permissions`, a JSON array of grants: `space:write`, `content:read` for every content
type, or `content:read:<type id>` for one. The built-in roles are not rows; their grants
live in `@manablox/core`. Deleting a content type drops every grant that names it.

## `webhooks`, `webhooks_deliveries`

Tables of the [webhooks plugin](../admin/webhooks.md#the-webhooks-plugin), created by its
baseline migration `0000_webhooks-baseline` (journal `__manablox_migrations_webhooks`).
Removing the plugin leaves them in place.

A webhook is an endpoint of a space environment: a direction, a name and a slug, the URL
and events of an outgoing one, the methods of an incoming one, and how a call proves who
it is, naming a credential of the vault rather than holding a secret. Outgoing deliveries
are queued as `webhooks:deliver` jobs with retries; every call, either direction, is a row
of `webhooks_deliveries` with its status and error. The newest 200 per endpoint are kept.

## `workflows`, `workflows_versions`, `workflows_runs`, `push_subscriptions`

The first three are tables of the [workflows plugin](../admin/workflows.md#the-workflows-plugin),
created by its baseline migration `0000_workflows-baseline` (journal
`__manablox_migrations_workflows`). Removing the plugin leaves them in place.
`push_subscriptions` is the core's.

A workflow is a name, a switch, a `trigger`, its `abort_triggers` and a graph of `nodes`
and `edges` per space environment, all as JSON documents rather than rows, since a
workflow is edited and saved as one thing and a new action or trigger kind needs no
migration. The row is the draft; `published_version` names the row of `workflows_versions`
that triggers run, and `trigger_kind` is that version's trigger kind. `last_scheduled_at`
is the minute a scheduled workflow was last claimed for: the scheduler's
`update ... where last_scheduled_at < $minute` is what keeps two API processes from
starting one run each.

A run is a row from the moment it is queued: the `context` its templates read (the
document, the actor, the space), the version it runs or, for a test run, the
`definition` it walks, its `state` while it is paused, the `log` so far and a `status`.
A delay parks the run as `waiting` with a `resume_at`; the scheduler claims due runs by
moving them to `running` in the same predicate that checks they are still waiting, so two
workers never take the same one. The last 200 runs per workflow are kept.

A push subscription is one browser a user allowed notifications in: the endpoint (unique,
so a browser re-subscribing keeps one row) and its keys. A push service answering 404 or
410 removes the row. See [Workflows](../admin/workflows.md).

## `ai_providers`, `ai_generations`

Tables of the [AI plugin](../admin/ai.md#the-ai-plugin), created by its baseline migration
`0000_ai-baseline` (journal `__manablox_migrations_ai`). Removing the plugin leaves them in
place.

A provider is one row per `(space, kind)`: the encrypted API key, the model per
capability, the space's system prompt, and whether it is switched on. `api_key` holds
AES-256-GCM ciphertext keyed from the instance secret, and `api_key_hint` the last four
characters so a form can say which key is stored; nothing outside `@manablox/plugin-ai`
decrypts either. Keys are not part of a space export.

A generation is a row from the moment it is asked for: the prompt, the chosen styles and
the context it was started from, the provider and model, and a status. Text and whole
documents are answered inside the request and land as `result`; an image or a video runs
as an `ai:generate` job of the plugin, and the row is what the dialog polls until `asset_id` is filled
in or `error` is. A failure stores both: `error` is the key, and `error_detail` the params
behind it, including the sentence the provider itself gave - a job has no caller to throw
at, so unless the reason is on the row it is lost. See [AI](../admin/ai.md).

## `audit_entries`

The activity log: one row per action, appended and never changed. See
[Activity](../admin/activity.md) for what is recorded and how it reads.

| Column | Why |
| --- | --- |
| `seq` | A `bigserial`: the order of the hash chain. |
| `space_id` | The space the action concerns, or null for an instance-wide one. Not a foreign key: the row outlives the space. |
| `actor_kind`, `actor_id`, `actor_label`, `actor_detail` | Who: `user`, `apikey`, `system` or a plugin's actor kind such as the workflows plugin's `workflows` (`workflow` on entries written before it), the id, the label as it was (an email, a workflow's name), and the request's client details or the run. |
| `action` | `<kind>.<verb>`, from the catalogue in `@manablox/core`. |
| `target_kind`, `target_id`, `target_label` | What, by id and by label as it was. |
| `changes` | A JSON list of `{ path, from, to }`. |
| `meta` | Anything else the action noted: a version, a run's outcome. |
| `prev_hash`, `hash` | SHA-256 of the row's canonical content plus the previous row's hash. Writers are serialised on an advisory lock. |

A trigger (`audit_entries_immutable`, in migration `0001_extras`) refuses every update,
delete and truncate. It is not tracked by drizzle-kit.

## `notifications`

One row per person per thing they are told: the in-app copy of a notification. A mail
or a push sent for the same event leaves no row. See
[Notifications and approvals](../admin/notifications.md).

| Column | Why |
| --- | --- |
| `user_id` | The recipient; cascades with the account. |
| `space_id` | The space it concerns, or null for the instance. Cascades with the space. |
| `kind` | One of the catalogue in `@manablox/core`: `content.approvalRequested`, `member.granted`, and so on. |
| `title`, `body`, `url` | What is shown, and where it leads in the admin (a path). |
| `target_kind`, `target_id` | What it is about, for grouping. Not foreign keys. |
| `actor_id`, `actor_label` | Who caused it, as a snapshot like the audit log's. |
| `read_at` | Null while unread. |

## `content_approvals`

One row per request to publish a document on the author's behalf; the row is closed by
the decision and kept as history. A document has at most one `pending` row at a time,
a rule the service keeps. Cascades with the document.

| Column | Why |
| --- | --- |
| `content_id`, `space_id`, `type_id` | The document, and its type so a reviewer's queue can be narrowed to the types they may publish. |
| `status` | `pending`, `approved`, `rejected` or `withdrawn`. |
| `requested_by`, `requested_by_label`, `request_note`, `content_version`, `requested_at` | Who asked, what they said, and the document's version at the time. |
| `decided_by`, `decided_by_label`, `decision_note`, `decided_at` | Who answered and what they said. |

## `space_plugin_settings`

A plugin's settings of one space environment, one row per `(environment_id, plugin)`,
cascading with the space and the environment. `data` is the plugin's JSON: the production
row holds the space's settings, a staging row what that environment keeps of its own. The
website plugin (`plugin` = `website`) keeps `mode`, `revision`, `localeStrategy`,
`notFoundContentId` and the password hash there; see
[Storage, drafts and publishing](../site/designs.md#storage-drafts-and-publishing).

## `website_designs`, `website_design_versions`

Tables of the website plugin, created by its baseline migration `0000_website-baseline`
(journal `__manablox_migrations_website`). The designs of a [designed site](../site/designs.md). One row per
`(environment_id, kind, key)`, unique; a design without a row is generated at render time.

| Column | Why |
| --- | --- |
| `kind`, `key` | `theme`, `block`, `page`, `layout`, `menu` or `site`, and what the design is for: `default`, a type id, or a layout or menu key. |
| `draft`, `published` | The working copy and the live copy (null until the first publish), both validated with `@manablox/site`. |
| `version`, `published_version` | `version` is the optimistic lock, raised by every save; the design is `changed` while the two differ. |
| `source`, `source_ref` | `runtime` for designs made in the admin. |

`website_design_versions` keeps a snapshot (`data`, `version`, `label`) per publish, which a
restore copies into the draft. Both cascade with the space, versions also with the design.

## `website_domains`

A table of the website plugin: host names a designed site answers on. `hostname` is unique across the instance (lowercase,
no port), `locale` is null for a domain that serves every locale by path prefix,
`is_primary` marks the canonical host per space and locale (the service keeps one), and
`redirect_to_primary` makes a host 301 to it.

## `redirects`

Old paths of a space and where they lead (see [Redirects](../admin/redirects.md)).

| Column | Why |
| --- | --- |
| `locale`, `from_path` | Unique per environment and locale; paths with a leading slash and without the locale prefix. A null locale applies to every locale. |
| `to_path`, `to_content_id` | Exactly one: a path or absolute URL, or a document followed in the visitor's locale. |
| `status` | 301 or 302. |
| `source` | `auto` (made by a publish that changed a permalink) or `manual`. |
