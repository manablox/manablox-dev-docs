---
title: 'Data providers'
description: "Let a plugin's rows follow environment copies and promotes, space transfers, snapshots, retention and limits."
---

A [plugin](./plugins.md) that owns [tables](./plugins.md#tables-and-migrations) declares under
`data` how its rows take part in the life of a space: copied into a new environment, promoted
into production, exported and imported with the space, restored from a snapshot, pruned by a
retention control and counted by a limit. Each provider is one kind of row; a plugin may have
several. Every part is optional.

```ts
import { definePlugin } from '@manablox/core';
import { defineDataProvider } from '@manablox/services';
import { notesRepositories, type NoteRow } from './repository.js';

const notes = defineDataProvider<NoteRow, { title: string; body: string }>({
  kind: 'notes.notes',
  environments: {
    content: true,
    load: ({ repos, spaceId, environmentId }) =>
      notesRepositories(repos).notes.list({ spaceId, environmentId }),
    describe: (row) => ({ label: row.title, value: { title: row.title, body: row.body } }),
    copy: ({ repos, rows }) => notesRepositories(repos).notes.insert(rows),
    promote: async ({ repos, upsert, remove }) => {
      const { notes } = notesRepositories(repos);
      await notes.removeMany(remove.map((row) => row.id));
      await notes.upsertMany(upsert);
    },
  },
  transfer: {
    section: { label: 'Notes' },
    count: async ({ repos, spaceId }) => (await notesRepositories(repos).notes.list(spaceId)).length,
    export: async ({ repos, scope }) =>
      (await notesRepositories(repos).notes.list(scope)).map(({ title, body }) => ({ title, body })),
    import: async ({ repos, spaceId }, entries) => {
      for (const entry of entries) await notesRepositories(repos).notes.create({ spaceId }, entry);
    },
  },
});

export const notesPlugin = () => definePlugin({ name: 'notes', db: { /* ... */ }, data: [notes] });
```

`kind` is unique per instance and starts with the plugin id and a dot. `defineDataProvider`
types the rows (`load` returns them) and the export entries; its types come from
`@manablox/services`.

## Transactions

Every callback gets `manablox` and `repos`, the core repositories bound to the operation's
transaction when it has one. Build the plugin's repositories on them with `pluginRepos`
(see [Tables and migrations](./plugins.md#tables-and-migrations)), so their writes commit and
roll back with the core ones. A provider that throws inside an environment copy, a promote
group, an import step or a snapshot restore rolls back that whole transaction.

A callback that takes such a context also gets `plugin`, the plugin's context with its
[services](./services.md) (`context.plugin.services`).

## Environments

The `environments` part moves the rows between a space's environments. The rows need an `id`;
rows with an `environmentId` column get the target environment set by core.

| Key | Meaning |
| --- | --- |
| `load` | The rows of one environment |
| `copy` | Writes the rows of a new staging environment. They arrive under new ids, derived from the source ids so a later promote finds them again, and with every id core maps (content types, documents) replaced inside their values |
| `promote` | Writes production: `upsert` holds staging's rows under production ids, `remove` the production rows staging no longer has, `production` the rows before. Without it the rows are never promoted, and the promote diff and its groups leave the provider out; `match` still pairs staging's rows with production's, so what points at them follows (the webhooks plugin's endpoints stay per environment this way) |
| `describe` | A row in the promote diff: its label and the part whose change counts as changed; needed with `promote` |
| `match` | A key that pairs a staging row with a production row it was not copied from, such as a unique name |
| `keep` | Production rows a promote keeps although staging lacks them, such as rows from code |
| `promotes` | `(row) => boolean`: whether a staging row is promoted at all; every one by default. The workflows plugin leaves out workflows from code, which the sync writes in every environment on its own |
| `content` | The rows are content: only full copies and full promotes move them |
| `limits` | Count limit increments a promote needs, checked before anything is written |
| `remove` | Runs in the transaction that deletes a staging environment. Rows with a foreign key on the environment go by themselves |
| `nominations` | Documents the environment names, such as a 404 page, see [Nominations](#nominations). They follow a full copy and a full promote and are cleared with their document |
| `key` | The name of the promote group, the diff line and the copy count; the kind by default |
| `after` | Keys of other providers' groups this one runs after, and whose diff lines it follows. Keys of providers that are not there are ignored; a cycle stops the start |
| `onLiveChange` | `({ spaceId, reason })`: runs once a change to the space's environments committed, see [Live changes](#live-changes) |

A promote runs each provider as its own group, after core's groups (the last is
`redirects`), each in one transaction. Providers run in plugin order unless `after` says otherwise. When a group
fails, it rolls back alone and the later groups are skipped, as with core's groups.

### Live changes

`onLiveChange` tells a provider that what runs in a space may have changed: `reason` is
`create` (a staging environment was copied), `delete` (one was deleted), `promote` (a promote
wrote production) or `import` (a space import finished). It runs after the commit, in the
process that made the change, with `repos` outside any transaction; a throw is logged. Use it
for state a process keeps about a space, such as an index of what runs where, and send the
change to the instance's other processes over a [channel](./lifecycle.md#channels).

```ts
environments: {
  // ...
  onLiveChange: ({ plugin, spaceId }) => {
    const index = (plugin?.services as NotesServices).index;
    index.forget(spaceId);
    index.channel.publish({ spaceId });
  },
},
```

### Nominations

An `EnvironmentNomination` (`@manablox/core`) is a document an environment names: `{ key,
plugin?, read(settings), write(settings, id) }`. Core's home page lives in `spaces.settings`.
A nomination with `plugin` set lives in that plugin's [settings rows](./plugins.md#settings-per-space):
production's through `read` and `write` on the production row's data, a staging
environment's at `key` of its own row. The website plugin's 404 page is one:

```ts
export const NOT_FOUND_NOMINATION: EnvironmentNomination = {
  key: 'notFoundContentId',
  plugin: 'website',
  read: (data) => (typeof data.notFoundContentId === 'string' ? data.notFoundContentId : null),
  write: (data, id) => (id || data.notFoundContentId ? { ...data, notFoundContentId: id } : data),
};
```

A full copy names the copied document in the new environment, a full promote writes
staging's into production, deleting a staging environment drops its rows, and deleting a
document clears it everywhere. A staging export carries the environment's nominations in
production's place.

## Transfer and snapshots

The `transfer` part is a section of the space export. The file keeps it under
`plugins.<kind>` as a list of JSON entries; the export and import selection name it by its
kind. A snapshot is an export, so the same section is captured and restored with it.

| Key | Meaning |
| --- | --- |
| `section.label` | The name of the section |
| `section.dependsOn` | Kinds whose entries this one references: other providers' kinds, whose imports then run first, and core sections such as `contentTypes` or `credentials`, which always import before provider sections. Kinds that are not there are ignored; a cycle between providers stops the start |
| `section.optIn` | Exported by default but only imported when named, like host names |
| `count` | How many entries the space holds, for the transfer dialog (`inventory.plugins`) |
| `entries` | `({ spaceId }) => [{ id, label }]`: the space's entries, so the transfer dialog can pick them one by one (`inventory.pluginEntries`). `export` then gets the picked ids as `picked` and exports only those, and an import keeps only the file's entries whose `id` was picked (entries without a string `id` always stay). Pair it with `pickable` on the admin's [transfer section](./admin-plugins.md) |
| `export` | The entries of the exported environment (`scope`); only the `picked` ones when the provider has `entries` and the selection names some |
| `import` | Writes the entries into the new space, as one step of the import in its own transaction. Push notes for the person importing to `notes`. `carried(kind)` hands over the rows the file carries under another section, a core one such as `credentials` or a provider's, whether or not the import restores it: rows a section left behind can be recreated from them, as the workflows plugin recreates the credentials and endpoints its workflows point at |
| `check` | Runs before anything is written; throw to refuse the import, for example from a `before...` hook |
| `limits` | What the entries count against each count limit |
| `ids` | Row ids the entries carry, so a snapshot restored beside its space gets fresh ones, and so other sections find them in the import's `ids`. Entries without ids need nothing |
| `targetId` | `(id, spaceId) => id`: the id an entry's row is written under when the import does not keep the file's ids. It must be deterministic, e.g. `stableId(spaceId, id)` from `@manablox/core/node`, so every step of an import, also a resumed one, agrees |

Core's sections come first; provider steps run after them and before tags and publishing.

A section whose entries are rows picked one by one gets `count`, `entries`, `export` and
`ids` from `rowsSection` of `@manablox/services`: `list(context, scope)` gives the rows,
`label` names one in the dialog, `toExported` turns one into its entry, and an optional
`count(context, spaceId)` counts without loading the rows:

```ts
transfer: {
  section: { label: 'Greetings' },
  ...rowsSection({
    list: ({ repos }, scope) => helloRepos(repos).greetings.list(scope),
    label: (row) => row.message,
    toExported: exported,
  }),
  import: ({ repos, spaceId }, entries) => insertGreetings(repos, spaceId, entries),
},
```

### Ids across sections

`import` gets `ids`, one map for the whole import: `ids.of(kind)` maps the file's ids of
a kind's restored rows to the ids they are written under, whether or not that kind's step ran
yet. Core rows keep their ids (`contentTypes`, `contents`, `assets`, `menus`, `roles`,
`credentials`); a provider's map comes from its `ids` and `targetId`. A kind the import leaves
out maps nothing, so a section can tell which of its references came along:

```ts
transfer: {
  section: { label: 'Stamps', dependsOn: ['hello.greetings'] },
  // ...
  async import({ repos, spaceId, ids, notes }, entries) {
    const greetings = ids.of('hello.greetings');
    const kept = entries.filter((entry) => !entry.greetingId || greetings.has(entry.greetingId));
    if (kept.length < entries.length) notes.push('Stamps without their greeting were left out.');
    await stampsOf(repos).insert(
      kept.map((entry) => ({ ...entry, spaceId, greetingId: greetings.get(entry.greetingId) ?? null })),
    );
  },
},
```

A provider whose kind others read augments `TransferIdKinds` in `@manablox/services`
(`interface TransferIdKinds { 'hello.greetings': true }`), which offers the kind to
`dependsOn` and `ids.of`. An
import keeps a section of a kind no loaded plugin provides out, logs a warning and adds a note
to the result.

Plugin [settings](./plugins.md#settings-per-space) travel with the space, in the file's
`pluginSettings` by plugin id: the exported environment's settings with
its nominations in production's place. An import writes them as the new space's
production rows.

## Snapshot state

The `snapshot` part keeps state of a space that the export leaves out, such as rows that
should not travel to another instance. `capture` runs while the snapshot is taken, after the
export, and its result is stored in the snapshot file under `snapshots.<kind>`. A restore
hands it to `restore` as one import step after the provider sections, in its own transaction:
when `restore` throws, that step rolls back and the restore fails like any import step, and a
space being replaced stays as it was.

```ts
snapshot: {
  capture: async ({ repos, spaceId }) => notesRepositories(repos).drafts.list(spaceId),
  restore: async ({ repos, spaceId }, drafts) => notesRepositories(repos).drafts.insert(spaceId, drafts),
},
```

| Key | Meaning |
| --- | --- |
| `capture` | The state of the space's production, as JSON |
| `restore` | Writes it into the restored space; gets `notes` like `import` |
| `ids` | Row ids the state carries, so a snapshot restored beside its space gets fresh ones |
| `limits` | What restoring the state counts against each count limit, checked with the sections' before anything is written. A restore in place of its space subtracts what the replaced space holds, its state included |

The state is restored with its provider's section, or always when the provider has none. UUIDs
inside it are remapped like the export's. A snapshot downloaded as a file carries the state
too, and importing that file restores it. A file with state of a kind no loaded plugin
provides is imported without it, with a note. `defineDataProvider<Row, Entry, State>` types
the state.

## Retention, limits and caches

| Key | Meaning |
| --- | --- |
| `retention` | Pruners, each `{ key, prune }`: `prune` gets the space's value of the retention control `key` and deletes up to about `limit` rows, returning how many |
| `counters` | Counters by limit key, each getting the space ids to count (`'all'` for every space). A core key such as `customDomains` adds the provider's production rows to core's count; a key of the plugin's own [limits](./controls.md) (`plugins.<id>.<name>`) is the whole count. Every limit the plugin declares needs one, and a key that is neither is refused at start with `plugin.key.invalid` |
| `hosts` | A table of host names verified by DNS; host names are unique across API hosts and every provider's table |
| `cacheTags` | Tags purged with a space's caches: on a promote, when usage blocks a space, when the instance is suspended or resumed, and when a control key of the plugin or the space's group changes |
