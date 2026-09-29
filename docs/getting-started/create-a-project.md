---
title: 'Create a project'
description: 'Create a Manablox project with one command, start it on your machine and find your way around its files.'
---

A Manablox instance is a small project of your own that installs the published
`@manablox/*` packages. The `manablox` CLI writes it for you: the config files, a `.env`
with generated secrets and a compose file for the services the CMS needs.

## Create it

```sh
pnpm dlx @manablox/cli create my-cms --yes --no-admin --no-space
cd my-cms
```

`--yes` takes the defaults without asking: the `local` preset, Postgres, local file
storage, Mailpit for mail, the public delivery API and no feature plugins. `--no-admin`
and `--no-space` leave the first account and the first space to you, so
[Your first space](./first-space.md) can walk through both in the admin. Without them
`create` also writes the commands that make an administrator and a space called *My site*.
Run it without `--yes` to answer the questions one by one; every option is listed in
[Use it as a dependency](./as-a-dependency.md#the-short-way-manablox-create).

The command installs the dependencies and runs `git init`. It needs Node 24 and pnpm;
Docker runs the services.

## Start it

```sh
pnpm services:up      # Postgres, Valkey and Mailpit in Docker
pnpm migrate          # creates the tables
pnpm dev              # the management API and the admin, restarts on change
```

In a second terminal:

```sh
pnpm dev:public       # the public delivery API
```

| Service | Address | What it is |
| --- | --- | --- |
| Admin | <http://localhost:3000> | Where editors and administrators work, served by the management process |
| Management API | <http://localhost:3000> | Everything the admin does, as an API. GraphQL at `/graphql`, OpenAPI at `/openapi.json` |
| Public delivery API | <http://localhost:3100> | Published content of one space, for frontends |
| Mailpit | <http://localhost:8025> | Catches every mail the CMS sends |
| Postgres | `localhost:5432` | The database, with the two roles described below |
| Valkey | `localhost:6379` | The cache and the job queue |

One thing surprises people on a fresh instance:

- **The public delivery API waits for a space.** It serves exactly one space. Until it can pin one it answers 503 and checks again every ten seconds; with exactly one space it pins that one on its own. With several, set `MANABLOX_SPACE` in `.env` to the technical name of the one to serve. [Your first space](./first-space.md) creates the first.

## Day to day

| Task | Command |
| --- | --- |
| Start the services | `pnpm services:up` |
| Stop the services (the data stays in Docker volumes) | `pnpm services:down` |
| Apply migrations, after every update of the `@manablox/*` packages | `pnpm migrate` |
| Run the management instance | `pnpm dev` (restarts on change) or `pnpm start` |
| Run the public instance | `pnpm dev:public` or `pnpm start:public` |
| Web Push keys for workflow notifications | `pnpm push-keys`, then paste them into `.env` |
| Typecheck the configs | `pnpm typecheck` |
| Add or remove a feature | `pnpm exec manablox plugin install ai`; see [Adding and removing features later](./as-a-dependency.md#adding-and-removing-features-later) |

## The project's files

| File | What it is |
| --- | --- |
| `manablox.config.ts` | The management instance: the API and the admin at `/`. See [The config file](../configuration/index.md) |
| `manablox.public.config.ts` | The hardened public delivery instance. See [The public API](../delivery/public-api.md) |
| `content-model.ts` | What every config shares: the field types and the content types defined in code |
| `manablox.plugins.ts` | The feature plugins of each instance; `manablox plugin` adds and removes them |
| `compose.yml` | Postgres, Valkey and Mailpit for `pnpm services:up` |
| `postgres/init/` | Creates the database roles on the first start of Postgres |
| `.env` | Connection strings and secrets, read by docker compose and by the CLI. Never commit it |
| `.env.example` | Every variable, commented, with the secrets blank |
| `data/` | Uploads and the media cache, created on first use |
| `README.md` | The same overview, for the preset you chose |

Postgres gets two roles on its first start: `manablox_owner` owns the schema and runs the
migrations (`MIGRATION_DATABASE_URL`), `manablox_app` is what the CMS logs in as
(`DATABASE_URL`). See [Database roles](../deployment/database-roles.md).

Content types built in the admin live in the database and need no code. Declare one in
`content-model.ts` only when a frontend depends on its exact shape; see
[Content types in code](../configuration/content-types-in-code.md).

To work on Manablox itself rather than on a project that uses it, see
[Contributing](../reference/contributing.md).

Next: [Your first space](./first-space.md).
