---
title: 'Drafts, publishing and versions'
description: 'What saving, publishing and unpublishing do; how the public API sees it; how versions and restore work; and how a stale save is refused.'
---

## Two copies

A publishable document exists as two rows: the **draft**, which the admin edits, and the
**published** copy, which the delivery APIs serve. Editors work on the draft freely; the
website shows the published copy until someone publishes again.

| Action | What happens |
| --- | --- |
| **Save** | Writes the draft, records a version, bumps the document's `version` number. The website does not change |
| **Publish** | Copies the draft to the published copy, in one transaction, and recomputes permalinks beneath it if its own path changed. Stamps `publishedAt`. Purges cached responses that showed the old copy. Refused with `field.unique` if another document's published copy holds the value of a unique field |
| **Unpublish** | Deletes the published copy, and the published copies of every descendant, since a page cannot be reachable below an unpublished parent. Every document that lost its published copy goes back to `draft` |
| **Delete** | Removes the draft, the published copy and the versions |

A document's **status** is `draft` until first published and `published` afterwards.
"Changed since it was published" is exact rather than a heuristic: `publishedAt` is
stamped only by a publish and `updatedAt` only by a save, so a later `updatedAt` is
precisely that, and the editor's buttons and badge follow it.

A type with *Publishable* off has only one copy: saving is publishing.

## Scheduling

Both ends of a document's life can be set in advance. The editor's **Schedule** panel
holds two dates:

| Field | What it does |
| --- | --- |
| **Publish at** | The document is published at this time, exactly as the Publish button would publish it |
| **Unpublish at** | The published copy is removed again at this time |

Either can be set on its own. A window must close after it opens, or the write is refused
with `content.schedule.invalidWindow`.

A clock on the management instance checks for due documents every twenty seconds, so a
date is accurate to within one tick rather than to the second. It calls the same service
the buttons call, which means a scheduled publish runs the same hooks, writes the same
audit entry and purges the same cache as one done by hand.

The dates live on the document, so changing one is a save and nothing has to be cancelled.
A date is spent when it fires: publishing clears **Publish at** and leaves **Unpublish
at**, which is the other end of the same window, and unpublishing clears **Unpublish at**.
Publishing by hand does the same, so a schedule cannot fire twice. If a whole window
passes while the instance is down, the next tick publishes and then unpublishes, leaving
the document down, which is where it should be.

Scheduling needs the same permission as publishing. A failure is logged and the date is
not retried: a document that cannot be published now will not publish on the next tick
either.

## What the public API sees

The public API reads the published copies only. There is no draft code path in it: no
header, key or cookie can make it show a draft. A document that was never published, or
was unpublished, does not exist there, and neither does an asset that only a draft
references. To read drafts, use the management API's preview mode; see
[Preview and the visual editor](../delivery/preview.md).

## Versions

Every save snapshots the whole document into its version history: title, slug, parent,
every field. The editor's **History** panel lists them with who saved and when.
**Restore** loads a snapshot and saves it as a new version, so nothing is ever lost and a
restore can itself be undone. Restoring does not publish; publish afterwards if the
restored state should go live.

## Optimistic locking

The document's `version` is also a lock. A save carries the version it was based on;
if someone else saved in between, the server refuses the write with
`content.version.conflict` rather than silently overwriting theirs. The admin shows the
conflict with both version numbers and lets you reload.

## Publishing and the tree

- Moving a published page and then publishing recomputes the permalinks of every published descendant.
- Unpublishing a page unpublishes its published descendants with it. Each of them is set back to `draft`, gets its own `content:afterUnpublish` hook and its own audit entry, whose `meta.ancestorId` names the page that was unpublished. `content:beforeUnpublish` runs for that page only, and one cache purge covers all of them. `content:afterUnpublishMany` also runs once with every row; webhooks, workflows and the asset usage index listen there. Descendants that were never published are not touched.
- Deleting a document's last translation removes it from every menu.

## What triggers elsewhere

A save, publish, unpublish or delete runs the matching [hooks](../extending/hooks.md),
can start a [workflow](../admin/workflows.md), queues webhook deliveries, and (for
publish, unpublish and delete) purges the delivery cache entries that referenced the
document. See [Caching](../delivery/caching.md).
