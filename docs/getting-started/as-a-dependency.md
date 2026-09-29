---
title: 'Use it as a dependency'
description: 'Run the APIs and the admin from a project of your own: install the packages, write one config file, migrate, start.'
---

The server, the admin and every library they are built from are published to npm, so a
project of your own installs the CMS like any other dependency, describes its instance in
one config file and starts it with one command: the management API, the public delivery
surfaces you enable, and the admin, served from the same origin.

[Create a project](./create-a-project.md) is the quick start. This page covers every
option of `manablox create` and the same setup built by hand. To work on Manablox itself,
see [Contributing](../reference/contributing.md).

## What you need

- Node 24 or newer. The packages ship compiled JavaScript with type declarations; the `manablox` command only needs `tsx`, which it brings along, for your own config file. See the note at the end.
- A database: Postgres (18 in the generated compose files), or SQLite, which is a file and needs nothing installed. See [Database](../configuration/database.md). Everything else (Valkey, S3, SMTP) is optional and off until configured.

## The short way: manablox create

The `manablox` CLI can write the whole project for you: the config files, a `.env` with
generated secrets, and a compose stack. Run it without installing anything first:

```sh
pnpm dlx @manablox/cli create my-cms     # or: npx @manablox/cli create my-cms
```

It asks what it needs to know, with arrow-key selects and text fields that validate as you
type, and skips what does not apply to an earlier answer. Every question has a command
line option, so a scripted run needs no terminal:

```sh
pnpm dlx @manablox/cli create my-cms --yes
```

### Features

A new instance is the core alone - spaces, content types, content, assets, users and
roles, environments, publishing, approvals, notifications and delivery - unless you pick
features. `create` asks once, in one list with nothing preselected:

| Feature | Plugin | What it adds |
| --- | --- | --- |
| Designed websites (`website`) | `@manablox/plugin-website` | Spaces designed in the admin, served by the site process; see [Designed sites](../site/index.md) |
| AI assistance (`ai`) | `@manablox/plugin-ai` | Text, image and model generation with your own provider keys; see [AI](../admin/ai.md#the-ai-plugin) |
| Workflows (`workflows`) | `@manablox/plugin-workflows` | Automations started by content changes, schedules and incoming webhooks; see [Workflows](../admin/workflows.md#the-workflows-plugin) |
| Webhooks (`webhooks`) | `@manablox/plugin-webhooks` | Calls to other systems when content changes, and endpoints they call; see [Webhooks](../admin/webhooks.md#the-webhooks-plugin) |

Some work together when both are there: AI adds a step to workflows and designs to the
website, webhooks start workflows. Each works without the others. On the command line
`--features website,ai` picks exactly that list (`--features none` the core alone), and
`--ai` / `--no-ai` one feature at a time; `--yes` without either gives the core alone. A
feature's own options, such as `--site-port`, are refused when the feature is left out.

A picked feature brings its dependency, its entry in `manablox.plugins.ts` and its parts
of the other files (`.env`, the compose stack, the proxy config, the README). Each part
sits between marker comments, and every place a feature can add to keeps an anchor
comment, so [`manablox plugin`](#adding-and-removing-features-later) can add and remove
features later.

Two presets exist. `local` (the default) writes a compose file for Postgres and Valkey
only and runs the CMS on your machine with `pnpm dev`, which is the setup the rest of this
page builds by hand. `docker` writes a production stack: a Dockerfile, a compose file
with Postgres, Valkey, a one-shot migration, the management API with the admin, the
public delivery API and a proxy in front, plus backup and restore scripts. It
is the setup described in [Production stack](../deployment/index.md), ready to start with
`docker compose up -d` once the domains point at the host. The proxy is Caddy by default,
which obtains certificates on its own. `--proxy nginx` puts nginx in front instead: the
host names still come from `.env`, the certificate comes from you (put it into
`nginx/certs/`, or run the generated `scripts/selfsigned-certs.sh` for a trial), and a
domain given with an `http://` prefix is served without TLS. `--proxy none` drops the
proxy and publishes the API ports for one of your own. Giving `--proxy` without `--preset`
picks `docker`.

`--database sqlite` swaps Postgres for a SQLite file in either preset: `data/manablox.db`
next to the project, or a `database` volume in the docker preset. No database service is
started, `.env` holds no database password, and the backup scripts use `manablox backup`.
SQLite has one writer, so such an instance runs one management process.

On Postgres both presets create the two
[database roles](../deployment/database-roles.md) on the first start of the database,
with the generated script `postgres/init/10-roles.sh`: `manablox_owner` owns the schema and
runs the migrations, `manablox_app` is what the CMS logs in as. `.env` holds a generated
password for each. The migrations connect through `MIGRATION_DATABASE_URL` (the owner) and
grant the role of `DATABASE_URL` (the app role), so the CMS cannot change tables or delete
audit entries. The public API and the site process connect as a third, read-only role,
created by `postgres/init/20-public-role.sh`; it is created even when nothing uses it yet,
so the website can be added later.

In the docker preset, `migrate` and `api` read the whole `.env`, so any variable the
config reads can be set there without touching `compose.yml`. `public` gets an explicit
list instead and never sees the owner database password. The image carries the whole
project except what `.dockerignore` lists, so plugins may live in subfolders.

| Option | What it decides |
| --- | --- |
| `--name` | The package and compose project name; defaults to the folder name |
| `--preset local\|docker` | Only Postgres and Valkey (the default), or every process in containers |
| `--database postgres\|sqlite` | A Postgres server (the default) or a SQLite file |
| `--proxy caddy\|nginx\|none` | Docker preset: Caddy with automatic TLS, nginx with your certificate, or published ports |
| `--public` / `--no-public` | Whether the hardened public delivery instance is part of it |
| `--features <list>` | The [features](#features), exactly these, comma separated: `website`, `ai`, `workflows`, `webhooks`, or `none`. Asked when not given; none without a terminal or with `--yes` |
| `--website`, `--ai`, `--workflows`, `--webhooks` (and `--no-...`) | One feature at a time, instead of `--features`: the website plugin and its site process, the AI plugin with `AI_ALLOWED_HOSTS` in `.env`, the workflows plugin, the webhooks plugin. Each defaults to no |
| `--admin-domain`, `--public-domain` | Caddy and nginx: the two host names |
| `--acme-email` | Caddy: where certificate notices go |
| `--admin-port`, `--public-port` | Without a proxy: the ports the two processes use |
| `--postgres-port`, `--valkey-port` | Local preset: where compose publishes the services |
| `--storage local\|s3` | Where uploads live; S3 credentials go into `.env` |
| `--mail <driver>` | How mail leaves: `smtp`, `mailpit`, `gmail`, `microsoft`, `resend`, `sendgrid`, `postmark`, `mailgun` or `none`. Defaults to `mailpit` for the local preset and `none` for Docker; see [Mail](../configuration/mail.md) |
| `--admin` / `--no-admin`, `--admin-email`, `--admin-name` | The first account, a superadmin that owns the first space, created with `manablox user create` once the instance runs, else listed in the next steps. The password is asked, read from `MANABLOX_USER_PASSWORD`, or generated and shown once; it is never written to a file |
| `--space` / `--no-space` | A first space, created with `manablox space create` once the instance runs (`--start`), else listed in the next steps. Defaults to yes |
| `--space-name`, `--space-url`, `--space-locales` | The first space's name (`My site`), website address and locales (`en`, the first is the default) |
| `--space-website designed\|external`, `--space-theme`, `--space-design` | A designed site with a starter theme and design (the default with the website plugin), or an own frontend |
| `--space-template <id>`, `--space-blocks <list>` | What the first space starts with: `basic` (the default), `business`, `landing`, `portfolio`, `blog` or `custom` with the sections from `--space-blocks` |
| `--space-starter` / `--no-space-starter` | The basic template, or an empty space |
| `--manablox-version` | The `@manablox/*` range to depend on; defaults to the CLI's own version |
| `--install` / `--no-install`, `--git` / `--no-git` | Run `pnpm install` and `git init` afterwards; both default to yes |
| `--start` / `--no-start` | Start the instance once it is installed. Docker builds and starts the whole stack (with a self-signed certificate for nginx if there is none yet); local starts Postgres and Valkey, migrates and runs `pnpm dev` in the terminal. Defaults to no, and needs the install |
| `--yes`, `--force` | Take the defaults without asking; write into a folder that is not empty |

The generated `README.md` explains every file and the day-two commands for the preset
you chose. The secrets in `.env` are random on every run and the file is in
`.gitignore`; `.env.example` is the same file with the secrets blank. `AUTH_SECRET` also
encrypts the stored credentials and AI provider keys, so changing it later
leaves those unreadable until they are entered again. With the AI plugin, `AI_ALLOWED_HOSTS`
in `.env` lists the private-network hosts a self-hosted AI provider may reach.

## 1. Install

```sh
mkdir my-cms && cd my-cms
pnpm init
pnpm add @manablox/cli @manablox/server @manablox/admin @manablox/core @manablox/fields
```

| Package | What it is |
| --- | --- |
| `@manablox/cli` | The `manablox` command: `start`, `migrate`, `push-keys`, and the two scaffolding commands. A dependency rather than a dev one, so an image installed with `--prod` still has it. |
| `@manablox/server` | `bootstrap`, `createApp`, `run`. Depends on every other server package, so you never list them yourself. |
| `@manablox/admin` | The admin, prebuilt. `@manablox/server` serves it when `server.admin` is set. |
| `@manablox/core` | `defineConfig()` and the plugin and content type helpers your config imports. The main entry point is browser-safe; `@manablox/core/node` holds the server-only helpers, which the main entry point does not re-export. |
| `@manablox/fields` | The built-in field types, as the `manabloxFields()` plugin. |

For designed sites add `@manablox/plugin-website`, the website plugin (`websitePlugin()`);
see [Designed sites](../site/index.md). For AI assistance add `@manablox/plugin-ai`, the AI
plugin (`aiPlugin()` in the management config only); see
[AI](../admin/ai.md#the-ai-plugin). For workflows add
`@manablox/plugin-workflows` (`workflowsPlugin()`), and for webhooks
`@manablox/plugin-webhooks` (`webhooksPlugin()`), both in the management config only; see
[Workflows](../admin/workflows.md#the-workflows-plugin) and
[Webhooks](../admin/webhooks.md#the-webhooks-plugin). A public config lists only the plugins
that add to what delivery serves, such as the website plugin; see
[Which configs load it](../extending/plugins.md#which-configs-load-it).

Any package manager works; the examples use pnpm.

## 2. Configure

Create `manablox.config.ts` in the project root. This is the same object the
`manablox.config.ts` of `manablox create` builds, and every section is described in
[The config file](../configuration/index.md).

```ts
import { defineConfig, envString, requireEnv, storageConfigFromEnv } from '@manablox/core';
import { manabloxFields } from '@manablox/fields';

export default defineConfig({
  database: { url: requireEnv('DATABASE_URL') },
  auth: { secret: requireEnv('AUTH_SECRET') },

  server: {
    port: 3000,
    publicUrl: envString('PUBLIC_URL', 'http://localhost:3000'),
    // Serve the admin from this process, at `/`. Same origin as the API, so the
    // session cookie needs no proxy in front of it.
    admin: true,
  },

  storage: storageConfigFromEnv(),

  plugins: [manabloxFields()],
});
```

There are no content types in it: editors create them in the admin, where they live in
the database. Declare one in `contentTypes` only when a frontend depends on its exact
shape; see [Content types in code](../configuration/content-types-in-code.md).

`auth.baseUrl` defaults to `server.publicUrl`, which is the right value when the admin
is served by the same process; set it only when sessions are issued from another host.

Put the secrets in a `.env` next to it. The CLI loads that file before it evaluates the
config, and a variable already set in the shell wins over the file.

```sh
DATABASE_URL=postgres://manablox:manablox@localhost:5432/manablox
AUTH_SECRET=change-me-to-a-long-random-string
```

`server.admin` takes `true` for the bundle in `@manablox/admin`, or `{ dir: '...' }` for
an admin you built yourself. Plugins with admin screens need neither: the prebuilt admin
loads their bundles at runtime, see [Admin plugins](../extending/admin-plugins.md). It is
only honoured by a management instance; a
public instance has no sign-in surface and ignores it. CORS is not needed for the admin
when it is served this way, so the `cors` setting only matters for your own frontends.

The server sends the admin compressed: the build ships a brotli (`.br`) and a gzip (`.gz`)
copy of each script and stylesheet, and the server picks one by the browser's
`Accept-Encoding` (with `Vary: Accept-Encoding` and an ETag per coding). Plugin bundles are
read into memory once at boot and compressed on their first request. Hashed files are cached
by browsers for a year, `index.html` is revalidated on every load. A proxy in front has
nothing left to compress on these paths.

## 3. Migrate and start

```sh
npx manablox migrate     # applies the schema shipped with @manablox/db
npx manablox start       # boots the instance and listens on server.port
```

Open <http://localhost:3000>. The first account you create becomes the instance
superadmin; from there,
[Your first space](./first-space.md) continues.

During development, `npx manablox start --watch` restarts the process whenever
`manablox.config.ts` or anything it imports changes.

## The CLI

| Command | What it does |
| --- | --- |
| `manablox start` | Boot the instance described by `manablox.config.ts` and listen |
| `manablox start --mode public` | The same config as a public delivery instance: `server.mode` set to `public`, the management surfaces left unmounted. See [The public API](../delivery/public-api.md) |
| `manablox start --mode website` | The site process of the website plugin, when the config loads `websitePlugin`. See [Running the site process](../site/running.md) |
| `manablox start --watch` | Restart on change |
| `manablox migrate` | Bring the database up to date |
| `manablox backup <file>` | Copy a SQLite database into a new file while the instance runs |
| `manablox migrate-db --to <url>` | Copy a SQLite database into an empty Postgres database and verify the copy: `--replace` for a target that holds rows, `--force-offline` when the instance is stopped instead of read-only. See [Moving from SQLite to Postgres](../deployment/sqlite-to-postgres.md) |
| `manablox push-keys` | Print a VAPID key pair for workflow push steps |
| `manablox user create --email <email>` | Create an account; the first one is a superadmin owning every space. `--name`, `--role superadmin\|editor`; the password comes from `MANABLOX_USER_PASSWORD` or a prompt. Does nothing when the email exists |
| `manablox space create --name <name>` | Create a space as the admin does, owned by `--owner <email>` or by the first account to exist: `--machine-name`, `--url`, `--locales`, `--template basic\|business\|landing\|portfolio\|blog\|custom`, `--blocks <list>`, `--plan <file>`, `--plugin-data <id>=<json>`, and with the website plugin `--website designed\|external`, `--theme` and `--design`. Does nothing when the technical name exists |
| `manablox website publish-all`, `manablox website domains list\|add\|verify\|remove` | Commands of the website plugin; see [CLI contributions](../extending/cli.md) |
| `manablox license buy\|add\|status\|activate\|refresh\|remove\|open` | License keys of the premium plugins (`@manablox/plugin-license`): buy in the portal, add a key to `.env`, check the states (exit code 1 while one is locked). Without a terminal `buy` needs `--plugins` and `--monthly` or `--yearly`; `--trial` leads with the trial. See the plugin's README |
| `manablox create [dir]` | Scaffold a new instance into a folder; see above |
| `manablox plugin list\|install\|uninstall\|enable\|disable` | Add, remove and switch features of an instance; see [below](#adding-and-removing-features-later) |
| `manablox frontend [dir]` | Scaffold a frontend for a space: plain Vite, Astro, React with SSR or Vue with SSR. See [Scaffold a frontend](../guides/scaffold-a-frontend.md) |

Every command accepts `--config <file>` for a config that is not at the default path,
and `start` accepts `--port` and `--host` to override the config for one run.

## Adding and removing features later

`manablox plugin` works on the instance in the current folder:

```sh
pnpm exec manablox plugin list                  # what is available, installed and configured
pnpm exec manablox plugin install ai workflows  # add features
pnpm exec manablox plugin uninstall webhooks    # remove one; asks to confirm
pnpm exec manablox plugin disable ai --space blog
```

`install` takes a first-party id (`website`, `ai`, `workflows`, `webhooks`), installed at the
version of the instance's other `@manablox/*` packages, or any npm package that declares
itself a Manablox plugin. It asks the plugin's own questions (the website asks for the site
port), or takes the answers as the plugin's `create` options without a terminal
(`manablox plugin install website --site-port 3300 --yes`), adds the dependency with the instance's package manager (found by its lockfile, the
`packageManager` field, or the tool running the command), writes the plugin's parts at the
anchors the files kept from `create`, installs and runs the migrations when the database
answers from here. Then restart the instance: `pnpm dev` restarts on its own; in the docker
preset run `./scripts/lockfile.sh` and `docker compose up -d --build`, which migrates first.
Installing a plugin that is there already says so and changes nothing. A plugin that
`requires` another is refused until that one is installed too.

`manablox plugin` runs on the host, also in the docker preset: it needs the project's
`node_modules` there (run `pnpm install` once in the project folder), since it runs the
package manager and reads the plugins' command line parts from them. The containers pick the
change up when they are rebuilt.

`uninstall` takes the parts out again, with the plugin's own files, its dependency and its
scripts, and refuses while an installed plugin requires it. The plugin's data stays: its
tables and the `ext.<id>` values of entries remain in the database, and installing it again
brings them back. There is no purge yet.

Only whole marked parts are touched. A file whose anchor is missing, in an instance made
before these markers or edited by hand, is left as it is; the command prints the part and
the file it belongs in, so you can place it yourself. Such an instance counts a plugin as
configured only by its part in `manablox.plugins.ts`: one it already loads by hand from its
config is installed again, which prints every part of it. Keep what the files already have
and skip the printed parts, or move the plugin into a `manablox.plugins.ts` as
`manablox create` writes it. `--strict` makes that an error
(exit 1). `--no-install` skips the package manager, `--no-migrate` the migrations, `--yes`
the questions and the confirmation.

`enable` and `disable` switch a configured plugin's flag, `features.plugins.<id>`, for the
whole instance or, with `--space <name>`, for one space, through the same services the
[control API](../deployment/control-layer.md) uses.

## Running a public instance

The mode is chosen when the process starts. Either keep one file and start it twice:

```sh
npx manablox start                                  # management, port 3000
npx manablox start --mode public --port 3100
```

or keep a second file, `manablox.public.config.ts` as `manablox create` writes it, with the hardened settings from
[The public API](../delivery/public-api.md) and start it with `--config`. A public
instance pins one space; with several spaces, name it under `publicApi`.

## Your own entrypoint

The CLI is a convenience. `@manablox/server` exports what it calls, so a project that
wants its own process, its own signals or its own routes can use the pieces directly:

```ts
import { bootstrap, createApp, startServer } from '@manablox/server';
import config from './manablox.config.js';

const runtime = await bootstrap(config);
const app = await createApp(runtime);

app.get('/hello', (c) => c.text('hello from the same process'));

startServer(runtime, app, 'my cms');
```

`app` is a Hono application, so anything Hono mounts can sit next to the CMS. Run the
file with `tsx` (or `node`, if it and the config use only syntax Node can strip).

## Deploying

A project built this way is an ordinary Node service: a `Dockerfile` that installs its
dependencies and runs `manablox migrate` then `manablox start` is all it takes. The
[Production stack](../deployment/index.md) page describes the published images; the
environment variables are the same, because the config reads them the same way.

## Why tsx

The packages themselves need no loader: what npm carries is compiled JavaScript and
`.d.ts` files, built at release time (see [CI and releases](../deployment/releases.md)). Your `manablox.config.ts` is the one
TypeScript file in the picture, and it is imported rather than run, so the `manablox`
command registers `tsx` before loading it. That covers any syntax the config uses,
including what Node's own type stripping refuses. The cost is one dependency that
`@manablox/cli` already declares. A bundler (Vite, Next, Nuxt) needs nothing extra.
