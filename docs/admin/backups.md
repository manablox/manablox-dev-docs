---
title: 'Backups'
description: 'Snapshots of a space in Settings > Backups: taking one now, the schedule the control API sets, downloading and restoring.'
---

**Settings > Backups** lists the snapshots of the current space, newest first. A snapshot
is the space export of [Moving a space](./transfer.md) with every section, stored on the
instance's own storage, without asset files: those stay where they are and are kept after
a delete for as long as a snapshot may need them. How the files, the schedule and pruning
work is described under [Snapshots](../configuration/controls.md#snapshots).

The section is there for anyone with the `space:export` permission (owners and admins, and
custom roles given it). It follows the `snapshots` feature: switched off, the menu entry
shows its lock or is hidden, as the control says.

## The list

Each row shows when the snapshot was taken, whether by hand or on the schedule, its
compressed size, and how many documents, assets and content types it holds. The line above
the list says whether snapshots are taken automatically (`snapshots.interval`: every hour,
every day, or not at all) and how long they are kept (`retention.snapshotsDays`, 7 days by
default). Both are set by the control API; nobody can change them in the admin.

**Create snapshot now** takes one at once (`snapshots.create({ spaceId })`). Snapshots run
one at a time, so the button may wait for another space's snapshot to finish.

## Download

Superadmins see **Download** on each row. It saves the export inside the snapshot as a
plain JSON file, `<machineName>-<id>.manablox.json`, from
`GET /transfer/snapshots/<spaceId>/<id>`. The file can be imported under **Settings >
Spaces > Import** like any export, on this instance or another; it carries no asset files.

## Restore

Owners of the space (and superadmins) see two restore buttons on each row. Both ask for
the space's technical name before they run.

- **As new space** imports the snapshot as a separate space, `<machineName>-restored-<date>`, next to this one, which stays as it is. The instance's `spaces` limit and the `spaceCreate` feature apply.
- **Replace this space** puts the snapshot in place of this space: its content, content types, menus, workflows, settings and site designs go back to that moment, and everything since is lost. The domains, the members, the group and the control settings stay, and so does the technical name. The admin switches to the restored space, which has a new id.

Asset records come back pointing at the files they had, so an asset deleted after the
snapshot is back as it was. Credential secrets and AI provider keys come from the space's
current rows, when those still exist. Every restore is recorded in the activity log as
**Restored a snapshot**, and a snapshot taken by hand as **Took a snapshot**.

The procedures are `snapshots.list`, `snapshots.create` and `snapshots.restore({ spaceId,
snapshot, mode, confirm })`, where `confirm` must be the space's technical name. A restore
by anyone but an owner or a superadmin is refused with `snapshot.ownerOnly`. The same
restore is available to the external layer through `POST /control/v1/snapshots/restore`.
