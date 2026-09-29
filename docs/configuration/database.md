---
title: 'Database'
description: 'Postgres or SQLite: how to choose, the connection URLs, and what differs between them.'
---

Manablox stores everything it owns in one SQL database: spaces, content types, documents
and their published copies, versions, assets, users, workflows and the audit log. Uploaded
files live in [storage](./storage-and-media.md), not in the database.

Two databases are supported. The `DATABASE_URL` scheme picks one; nothing else in the
configuration changes.

| Database | `DATABASE_URL` | Good for |
| --- | --- | --- |
| Postgres (the stack runs 18) | `postgres://user:pass@host:5432/manablox` | Production, several management instances, large content trees |
| SQLite (a local file) | `file:./data/manablox.db` | Local development, demos, small and medium sites on one server |
| libSQL / Turso | `libsql://your-db.turso.io` plus `DATABASE_AUTH_TOKEN` | A hosted SQLite database |

`sqlite:./data/manablox.db` is accepted as a synonym of `file:`. A relative path resolves
against the working directory of the process, and the folder is created on first start.
Any other scheme is refused at boot with `config.database.urlUnsupported`.

## Choosing

Pick **Postgres** when more than one process writes: several management API replicas
behind a load balancer, or a separate worker. It is also the database the delivery API's
read-only role (see [Public API](../delivery/public-api.md)) needs, and it scales best to
content trees with hundreds of thousands of documents.

Pick **SQLite** when one server runs the CMS and you want nothing else to operate: no
database service, no connection string with a password, a backup is one file. Reads are
fast (they run in the same process) and a site with tens of thousands of documents is
comfortable.

Both run the same code: the repositories are written once and the few statements that
differ are supplied per database. Every test suite runs against both.

## Connecting

```ts
// manablox.config.ts
export default defineConfig({
  database: {
    url: requireEnv('DATABASE_URL'),
    max: envNumber('DB_POOL_MAX', 10),
    // Turso only.
    ...(process.env.DATABASE_AUTH_TOKEN ? { authToken: process.env.DATABASE_AUTH_TOKEN } : {}),
  },
});
```

| Option | Postgres | SQLite |
| --- | --- | --- |
| `url` | connection string | `file:` path, or a libSQL URL |
| `max` | connection pool size | connections, at least 2 (one writer, readers beside it) |
| `ssl` | require TLS | ignored |
| `authToken` | ignored | Turso auth token |
| `migrationUrl` | the owner role that runs migrations (`MIGRATION_DATABASE_URL`) | ignored, with a warning |

Migrations are the same command for both: `manablox migrate`. Each database has its own
migration folder inside `@manablox/db`, `migrations` for Postgres and `migrations-sqlite`
for SQLite, both generated from one table description; see
[Contributing](../reference/contributing.md) for changing the schema.

## Two roles on Postgres

In production, let the CMS connect as a role that owns nothing: `DATABASE_URL` names that
app role and `MIGRATION_DATABASE_URL` (`migrationUrl`) the role that owns the tables.
Migrations then run as the owner and grant the app role what it needs, which leaves out
changing the schema and deleting audit entries. The production compose file does this.
See [Database roles](../deployment/database-roles.md).

## What differs

The API, the admin and the delivery responses are the same. Underneath:

| Topic | Postgres | SQLite |
| --- | --- | --- |
| Content tree | `ltree` paths with a GiST index | the same paths as text with a b-tree index |
| Search | `tsvector` with the `simple` configuration | an FTS5 index with the `unicode61` tokenizer |
| Field filters | `jsonb` operators with a GIN index | SQLite's JSON functions, no index |
| Concurrent writers | row locks, many at once | one writer at a time; others queue |
| Instance-wide locks | advisory locks, across processes | inside the process |
| Read-only role for the public API | yes | no: rely on public mode |
| Separate owner and app roles | yes, with `MIGRATION_DATABASE_URL` | no |
| Backups | `pg_dump` | `manablox backup <file>` |

Search reads the same query syntax on both: all words must appear, `"a phrase"` keeps
words together, `-word` excludes, `or` offers alternatives, case is ignored and accents
are kept. Words match whole, so `temp` does not find `template`. Ranking is not part of
the result on either database; results follow the requested sort.

Field filters behave the same for the values field types store. One edge differs: `lt`,
`gt` and their siblings treat text that is not a number as `0` on SQLite, where Postgres
refuses the query.

## Running SQLite well

- Run **one management instance**. SQLite has a single writer, and the lock that keeps two `manablox sync` runs from overlapping only reaches within one process. A public delivery instance on the same file is fine: it mostly reads, and its few writes (image variants made on first request) wait their turn.
- Keep the file on a **local disk**. Network file systems break SQLite's locking.
- The database runs in WAL mode, so `manablox.db` is accompanied by `manablox.db-wal` and `manablox.db-shm`. Every process that opens the file, a read-only delivery instance included, needs write access to the folder.
- Back up with `manablox backup backups/cms.db`. It writes a consistent copy while the instance keeps running; copying the file by hand is only safe with the instance stopped.
- A write waits up to 15 seconds for the one in progress, then fails with `SQLITE_BUSY`. Long imports are the usual cause; they finish, then the queue moves on.

## Moving between databases

To move a whole instance from SQLite to Postgres, with its users, audit log and settings,
run `manablox migrate-db --to <postgres-url>`. See
[Moving from SQLite to Postgres](../deployment/sqlite-to-postgres.md).

To move single spaces, or from Postgres to SQLite, move each space with a [space export](../admin/transfer.md): export it as an archive on
the old instance and import it on the new one. The archive carries content types,
documents with their history, assets with their files, menus, roles, workflows and
webhooks. Credential secrets and AI provider keys stay behind and are entered again on
the target. Users and the audit log are instance-wide and are not part of a space
export: invite the users again on the new instance.
