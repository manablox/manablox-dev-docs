---
title: 'Moving from SQLite to Postgres'
description: 'Copy a whole instance from its SQLite file into Postgres with manablox migrate-db: the Starter to Pro path for a control layer, and the same steps for anyone who outgrows one file.'
---

An instance that started on SQLite (one file, one management process) moves to Postgres
with one command. Everything moves: spaces, documents with their versions and published
copies, menus, workflows and their runs, webhooks, users with their sessions and
sign-in methods, SSO providers, invitations, control settings, usage counters, control
events and the audit log with its hash chain intact. Uploaded files stay where they are:
storage does not depend on the database.

Under a [control layer](./control-layer.md) this is the upgrade from a small plan that
runs on SQLite to a larger one that runs on Postgres (for example Starter to Pro). The
customer keeps their data, their ids and their links.

## What you need

- The instance's SQLite database, fully migrated (`manablox migrate` reports nothing to do).
- An empty Postgres database and a role that owns it. The command creates the tables, so the role needs `CREATE` on the database, and the `ltree`, `pg_trgm` and `btree_gin` extensions must be available (they are in the official Postgres images).
- The `manablox` CLI of the same version as the instance, run where it can read the SQLite file and reach Postgres.

## Steps

1. **Stop writes.** Set the instance read-only through the control API, or stop it:

```sh
curl -X PUT http://api-control:3300/control/v1/instance/state \
  -H "Authorization: Bearer $CONTROL_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"status":"readOnly","message":"Moving to a bigger database, back in a few minutes."}'
```

Read-only keeps delivery and designed sites serving while the copy runs. Every process
sees the new state within 5 seconds; the command waits out the rest of that time when the
state was set just before. See [Set the state](./control-layer.md#6-set-the-state) and
[the control API](../reference/control-api.md).

2. **Copy.** Run the command next to the instance's config:

```sh
manablox migrate-db --to postgres://manablox:secret@db.example.com:5432/manablox
```

3. **Switch the environment.** Stop the instance, set `DATABASE_URL` to the Postgres URL
and remove `DATABASE_AUTH_TOKEN` if it was set. The database scheme alone picks the
dialect; nothing else in the config changes.

4. **Start** the instance on Postgres. The schema is already current, so `manablox migrate`
has nothing to do.

5. **Lift read-only.** The copied settings still say read-only, so the instance starts
read-only on Postgres. Lift it once it runs:

```sh
curl -X PUT http://api-control:3300/control/v1/instance/state \
  -H "Authorization: Bearer $CONTROL_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"status":"active"}'
```

Keep the SQLite file (or a `manablox backup` of it) until the instance runs well on
Postgres. With Postgres you can now run several management instances and a
[public API](../delivery/public-api.md) with its own read-only role.

## What the command does

1. Refuses unless the instance-wide `state` is `readOnly` or `suspended`. `--force-offline` skips this check when you stopped the instance yourself.
2. Refuses when the SQLite database misses a migration, or when rows point at rows that no longer exist (it names the tables).
3. Takes a consistent snapshot of the SQLite file next to it and reads only the snapshot, so a read-only instance can keep serving. The snapshot is deleted at the end.
4. Refuses a Postgres database that already holds rows. `--replace` drops its `public` and `drizzle` schemas first; use it only on a database meant for this instance.
5. Creates the schema with the Postgres migrations shipped in `@manablox/db`.
6. Copies every table in one transaction, in batches of 1000 rows, tables in foreign key order and menu entries parents first. It prints each table with its row count.
7. Moves the sequence counters (`seq` of the audit log, control events and external usage) past the copied values, so new entries continue the numbering.
8. Checks the copy and prints the next steps.

The search index is not copied: Postgres builds its own from the same text. Timestamps,
JSON documents, booleans and 64-bit numbers are converted per column type, and ids stay
the same, so links, API keys, sessions and webhook signatures keep working.

## Verification

After the copy the command compares:

- the row count of every table on both sides;
- the audit chain, verified on SQLite and on Postgres, which must end at the same entry;
- up to 100 random rows per table, compared field by field after normalising types (dates as ISO strings, JSON with sorted keys).

Any difference is listed and the command exits with code `2`. The instance can then keep
running on SQLite: lift read-only and look into the difference before trying again.

## When it fails

The copy runs in one transaction. If it stops halfway (a lost connection, a row Postgres
refuses), nothing is committed: the Postgres database keeps the empty tables and counts as
empty, so the same command can simply run again. The SQLite file is never written to.

Writes that read-only still allows, such as sign-ins and usage counters, reach SQLite
after the snapshot and do not move. People who signed in during the copy sign in again.

## Options

| Option | Meaning |
| --- | --- |
| `--to <url>` | The Postgres database to fill (required) |
| `--replace` | Drop the schema of a target that holds rows first |
| `--force-offline` | Skip the state check; you guarantee the instance is stopped |
| `--config <file>` | The config that names the SQLite database (default `manablox.config.ts`) |

| Exit code | Meaning |
| --- | --- |
| `0` | Copied and verified |
| `1` | Refused before writing, or the copy failed and was rolled back |
| `2` | Copied, but the verification found a difference |
