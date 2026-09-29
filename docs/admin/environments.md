---
title: 'Environments'
description: 'Staging copies of a space: creating one from production, the diff, promoting config or content to production, deleting, and the controls that limit them.'
---

Every space has one `production` environment, the space as delivered today. An owner or
admin can add staging environments: copies of the space's content model and, if wanted,
its content, where changes are made and checked before they go live. A staging
environment is promoted to production when it is ready, and deleted when it is no longer
needed.

## What belongs to an environment

Each environment holds its own rows of:

- content types defined in the admin (types from code are shared), documents with their versions, published projections, tags and asset usages
- menus and their entries, redirects, site designs
- workflows and outgoing and incoming webhooks (with the workflows and webhooks plugins)
- site domains and API hosts

Shared by every environment of a space: members and roles, the asset library, tags
themselves, credentials, AI providers, the space settings, the audit log (its
entries name the environment in `meta.environment`) and the control settings. An editor
works in every environment of the spaces they are a member of.

Each environment nominates its own home and 404 pages; a staging environment's are kept
in the space settings under `environments.<environmentId>`.

An asset is public (its media URL answers and delivery lists it) once a published
document of a production environment uses it. A staging environment's API hosts and
site domains also serve the assets its own published documents use, without letting
shared caches keep them. An asset that only staging documents use stays private in
production.

An environment is addressed by its technical name (`production`, `staging`, ...), unique
within its space. Requests without one use production.

## Creating an environment

`environments.create({ spaceId, from, machineName, name, mode })` copies the environment
`from` (production when left out) into a new staging environment:

| `mode` | Copied |
| --- | --- |
| `config` | Content types, templates, menus without their entries, workflows, webhooks, site designs, and redirects to a path |
| `full` | All of `config`, plus every document with its versions, published state, tags and asset usages, menu entries and redirects to documents |

Every copied row gets a new id, derived from the new environment and the original id, and
references between copied rows (a document's parent, a relation field, a block type in a
field, a menu entry's document, a design keyed by a type) follow. Content types keep
their names. Assets are not copied: both environments point at the same files. Site
domains and API hosts are not copied either; a staging environment gets its own.

A `full` copy nominates the copies of the source's home and 404 pages; a `config` copy
starts without nominations.

Workflows and webhooks arrive switched off, so a copy never mails anyone or calls another
system by itself. Editors can switch them on in the staging environment, where they run
against staging content. Workflows and webhooks declared in code are synced into the new
environment right after it is created.

`machineName` must be lower case, start with a letter, and not be `production`
(`environment.machineName.invalid`); a name already used in the space answers 409
`environment.machineName.taken`. The copy runs in one transaction: it is there completely
or not at all. It is recorded as **Created an environment** and emits
`environment.created`.

## The diff

`environments.diff({ spaceId, environment, mode })` shows what promoting would change in
production, without changing anything:

- `contentTypes`: each type that is `added`, `changed`, `removed`, or `kept`, with `documents`, the number of production documents of the type. Its `fields` list the fields that are `added`, `changed`, `removed` or `retyped` (the field type changed), with `from` and `to` types and `documents`, the number of production documents holding a value for the field.
- `changes`: one entry per kind (`templates` in a config promote, `contents` in a full one, then `menus`, `redirects`, `designs`, `workflows`) with the `added`, `changed` and `removed` counts and up to 100 `items` (`status`, `id`, `label`); `truncated` says more differ.
- `breaking`: a config promote removes or retypes fields that production documents hold values for.
- `confirmRequired`: the promote must be sent with `confirm: true`. It is set when the diff is breaking, and for every full promote.

A type removed in staging that production documents still use is `kept` by a config
promote: it stays in production until its documents are gone.

## Promoting to production

`environments.promote({ spaceId, environment, mode, confirm })` moves a staging
environment into production:

| `mode` | What production gets |
| --- | --- |
| `config` | Content types, templates, menus (names and descriptions; production keeps its entries), redirects to a path, site designs and workflow definitions. Production documents stay as they are |
| `full` | All of `config`, and production's documents, versions, tags, asset usages, menu entries and redirects are replaced by the staging ones. Staging's home and 404 pages become production's; where staging nominates none, production keeps its own if the document is still there |

What stays as it is in both modes:

- production's site domains and API hosts
- whether each production workflow is switched on; new workflows arrive switched off
- webhooks, which point at systems per environment: a promote never writes production's endpoints. A promoted workflow started by a staging webhook is started by the production webhook it was copied from, or the one with the same direction and slug
- workflows, templates and designs declared in code, which are synced from the code
- the values of removed fields, which stay stored in the documents that hold them
- the home and 404 pages, in a config promote
- in a full promote, the approval requests of production documents the promote leaves unchanged (a document staging changed or removed is replaced or deleted, and its requests go with it)

Rows that were copied from production keep their production ids when they come back, so
documents, menus and workflows keep their ids and URLs across a create and promote. Rows
new in staging get new production ids; content types get the id production would give a
type of that name. A workflow whose published version changed gets a new version in
production, noted as promoted from the environment.

Custom roles grant per-type rights by production type ids; in a staging environment a
type is checked by the grant of the production type with the same name. A type that is
new in staging can be granted by its own id, which happens when a custom role's member
creates it. A promote gives every role holding such a grant the same grant on the new
production type, so members keep their rights after the promote. Approval requests in a
staging environment notify the members whose role may publish the production type of
that name.

Before anything is written:

1. The diff is computed; a promote that needs confirmation and lacks `confirm: true` is refused with 409 `environment.promote.confirmRequired`.
2. Production's count limits are checked for what the promote adds: `contentTypes`, `databagTypes`, `menusPerSpace`, `redirectsPerSpace`, and for a full promote `documents` and `databagEntries`.
3. When the `snapshots` feature is on and the storage can keep snapshots, a snapshot of the space is taken, with the trigger `promote`. It appears under [Backups](./backups.md) and can restore production to the moment before the promote.

The promote then writes one group of tables per transaction, in this order: content
types, templates (config) or documents (full), menus, redirects, site designs, workflows.
When a group fails, that group is rolled back, the groups after it are skipped, and the
groups before it stay applied. The answer reports each group:

```json
{
  "environment": "staging",
  "mode": "config",
  "status": "partial",
  "snapshot": "2026-09-26T10-15-00-000Z",
  "groups": [
    { "group": "contentTypes", "status": "applied", "error": null },
    { "group": "templates", "status": "applied", "error": null },
    { "group": "menus", "status": "failed", "error": "environment.promote.failed" },
    { "group": "redirects", "status": "skipped", "error": null },
    { "group": "designs", "status": "skipped", "error": null },
    { "group": "workflows", "status": "skipped", "error": null }
  ],
  "diff": { "...": "the diff the promote ran with" }
}
```

`status` is `applied`, `partial` (a group failed after others were applied) or `failed`
(the first group failed). Sending the same promote again applies what is still missing.
Production's cached deliveries, types, menus, designs and redirects are purged afterwards.

While a promote runs, every write to the space's production environment is refused with
423 `control.readOnly` and the reason `promote` ("A promote is in progress."), in the
admin, the management APIs, uploads, incoming webhooks, form submissions and workflow
runs. Writes in staging environments, reads, delivery and the site continue. The admin
shows the usual read-only message. The lock is released when the promote ends, also when
it fails, and expires on its own a minute after a crashed process stopped renewing it.

The promote is recorded as **Promoted an environment to production** and emits
`environment.promoted`. Only staging environments can be promoted
(`environment.promote.notStaging`).

## Deleting an environment

`environments.delete({ spaceId, environment })` deletes a staging environment with every
row in it, its domains and API hosts and its home and 404 nominations included. Production cannot be deleted
(403 `environment.production.undeletable`). The delete is recorded as **Deleted an
environment** and emits `environment.deleted`.

## Who may do what

| Action | Needs |
| --- | --- |
| Listing environments (`environments.list`) | Membership of the space |
| Creating, diffing, promoting, deleting | `environment:manage`, held by owners and admins; custom roles can be given it |

The control API offers the same operations to the external layer, see
[Environments](../reference/control-api.md#environments).

## Limits

| Control | Effect |
| --- | --- |
| `features.environments` | Off, creating and promoting environments and working in a staging environment are refused with 403 `control.feature`. Production is unaffected |
| `limits.environmentsPerSpace` | The staging environments of one space; production is not counted, so `0` allows none and `1` allows one staging environment |

Rows in a staging environment do not count toward the other count limits, a promote
checks production's limits for what it adds, and usage in a staging environment counts
toward its space. See [Controls](../configuration/controls.md).
