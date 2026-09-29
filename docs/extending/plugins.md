---
title: 'Plugins'
description: 'Extend Manablox from a package: content model, hooks, tables, permissions, controls, procedures, server modes, CLI and admin screens.'
---

A plugin is a package that extends Manablox: field types, content types and hooks, its own
tables, permissions, controls and procedures, background jobs, server routes and modes,
options of the `manablox` CLI, and screens loaded into the prebuilt admin. It is registered
in the [config file](../configuration/index.md) under `plugins`. The built-in field types
arrive the same way, as `manabloxFields()`, and the website designer, AI assistance,
workflows and webhooks are plugins too: `@manablox/plugin-website`, `@manablox/plugin-ai`,
`@manablox/plugin-workflows` and `@manablox/plugin-webhooks`.

```ts
import { definePlugin, onHook } from '@manablox/core';
import { pluginPackage } from '@manablox/core/node';

export const seoPlugin = () =>
  definePlugin({
    name: '@acme/seo',

    // Fields for types declared elsewhere (the config or another plugin). Two plugins
    // extending the same field merge their settings rather than clobbering each other.
    extend: [
      {
        name: 'page',
        fields: [
          { name: 'meta_title', type: 'string', settings: { max: 60 }, admin: { zone: 'sidebar' } },
          { name: 'meta_description', type: 'string', settings: { editor: 'textarea', max: 160 } },
        ],
      },
    ],

    // Called once at boot with the plugin's context; handlers may read its services.
    hooks: (plugin) => [
      onHook(
        'content:beforeCreate',
        (payload) => ({
          ...payload,
          fields: { ...payload.fields, meta_title: payload.fields.meta_title || payload.title },
        }),
        50,
      ),
    ],

    // The prebuilt admin bundle; the admin loads it at runtime.
    admin: { dir: pluginPackage(import.meta.url).adminDir },
  });
```

## Which configs load it

The management config loads every plugin the instance uses. The public (delivery) config
loads a plugin only when the plugin adds something a public instance serves: block
extensions or content type data that delivery returns, routes of the public scope, a server
mode, host sources that decide which space a delivery host belongs to, and the like. A
plugin that only acts on the management API stays out of it: its controls, permissions,
procedures, jobs and hooks do nothing there.

Of the first-party plugins, only the website plugin goes into the public config (its block
designs are delivered as `design`), next to `manabloxFields()`. The AI, workflows and
webhooks plugins act on the management API only, so the public config `manablox create`
writes does not list them. Incoming webhooks arrive at the management
server, not at the public one.

## Every extension point

| Area | Extension points |
| --- | --- |
| Content model | [Field types](./custom-field-types.md), content types and [`extend`](#adding-fields-to-other-content-types), [block extensions and content type data](./block-extensions.md) |
| Behaviour | [Hooks](./hooks.md), [workflow actions and trigger kinds](./workflow-actions.md) (contributions to the workflows plugin), code resources ([resources in code](../configuration/resources-in-code.md) and [plugin resource kinds](#plugin-resource-kinds)) |
| Data | [Tables and migrations](#tables-and-migrations), [settings per space](#settings-per-space), [data providers](./data-providers.md) (environments, transfers, [snapshots](./data-providers.md#snapshot-state), retention, limits, host names, [nominations](./data-providers.md#nominations)), [new spaces](#new-spaces) |
| Access and plans | [Permissions](./permissions.md), [controls](./controls.md) (features, limits, usage, rate rules, retention, settings), the [plugin flag](../configuration/controls.md#plugin-flags) |
| Server | [Services](./services.md), [audit entries](./services.md#audit-entries), [error keys](./services.md#error-keys), [signed tokens](./services.md#signed-tokens), [procedures](./rpc.md), [jobs](./jobs.md), [server routes and middleware](./server-routes.md), [server modes](./server-modes.md), `llms` sections (below) |
| Command line | [CLI contributions](./cli.md): options of `space create` and `create`, commands, files of a new instance |
| Other plugins | [Dependencies](./dependencies.md) (`requires`, `enhances`, other plugins' services), [extension points and contributions](./extension-points.md) |
| Long-running work | [Lifecycle and channels](./lifecycle.md): `start` and `stop`, messages between the instance's processes |
| Admin | [Admin plugins](./admin-plugins.md) (the runtime bundle), [admin slots](./admin-slots.md), [plugin slots and apis](./plugin-slots.md), the [admin SDK](./admin-sdk.md), [live preview channels](./live-preview-channels.md) |

## What a plugin may declare

[Plugin contract](./plugin-contract.md) lists every field of a plugin, grouped as in
`ManabloxPlugin`, with the page that explains it and the package that defines it.

## Adding fields to other content types

A group of fields that belongs on several content types, such as search engine fields, can
reach them two ways:

- **A shared field list**, when the instance declares the types. Write the fields once and
  spread them into each type in the config (`fields: [...own, ...seoFields]`). Nothing is
  merged; the type says what it has.
- **`extend`**, when a plugin brings the fields to types declared somewhere else: in the
  config or by another plugin. Each entry is `{ name, fields?, label?, icon? }`; the fields
  are appended to the type, `label` and `icon` replace the type's.

`extend` runs once every plugin has declared its `contentTypes`, in plugin order, so a plugin
may extend a type of a plugin listed after it. A field that exists already is merged:
`settings` and `admin` key by key, the rest replaced, so two plugins touching one field keep
both their settings. A name no code declares stops the boot with
`plugin.extend.contentType.notFound`: a type built in the admin lives in the database and
cannot be extended from code. The extension is part of the type, so it is not switched by the
[plugin's flag](../configuration/controls.md#plugin-flags): the fields are there in every
space. Only a field of one of the plugin's own [field types](./custom-field-types.md) keeps
that type's rule: its value cannot be changed in a space where the flag is off. A `hello` plugin with a `greetOn` option (`helloPlugin({ greetOn: ['page'] })`) adds a `greeting`
field this way.

## Hooks

Hooks are **awaited, ordered by priority, and may transform the payload**. Returning a
value replaces the payload; returning nothing leaves it alone. A handler on a `before...`
hook can also throw a `ManabloxError` to refuse the operation.

The surface covers the content lifecycle (`beforeValidate`, `before/afterCreate`,
`before/afterUpdate`, `before/afterDelete`, `before/afterPublish`, read paths), fields,
content types, assets, menus, workflows, cache purges, and the instance lifecycle. Every
hook with its payload and context is listed in [Hooks](./hooks.md). The plugin's
`hooks(plugin)` returns its handlers, each made with `onHook(name, handler, priority?)`, which
types the handler by the hook. It runs once at boot with the plugin's
[context](./services.md#the-plugin-context), so a handler reaches the plugin's services when it
runs (`plugin.services`, or `plugin.plugins.get(id)` in a process that may not build them).
The handlers carry the plugin's name as `source` and are skipped in spaces where the
[plugin's flag](../configuration/controls.md#plugin-flags) is off. Content lifecycle events
come as one `contentEventHooks(handler)` of `@manablox/core`: `content.created`, `updated`,
`published`, and `deleted` and `unpublished` once per operation, with their scope.

## Tables and migrations

A plugin can own tables. It describes them once with the table DSL of
`@manablox/db/definitions`, which also exports the core tables to reference (`spaces`,
`spaceEnvironments`, `users`, ...) and `environmentId()` for rows that belong to one
environment of a space:

```ts
// src/server/db/tables.ts
import { environmentId, id, spaces, table, text, timestamp, uuid } from '@manablox/db/definitions';

export const helloGreetings = table('hello_greetings', {
  id: id(),
  spaceId: uuid().notNull().references(() => spaces, 'id', { onDelete: 'cascade' }),
  environmentId: environmentId(),
  message: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
```

Prefix table names with the plugin id so they never collide with core tables or other
plugins. The plugin generates its migrations for both databases with its own drizzle-kit
configs: one schema file exports `postgresTable(definition)` for each table, another
`sqliteTable(definition)`, and `drizzle-kit generate` writes them to `migrations/` and
`migrations-sqlite/`. The plugin declares both folders as absolute paths:

```ts
import { pluginPackage } from '@manablox/core/node';
import * as tables from './tables.js';

// The package's `migrations`, `migrations-sqlite` and `dist/admin`, from sources or build.
const pkg = pluginPackage(import.meta.url);

export const helloPlugin = () =>
  definePlugin({
    name: 'hello',
    db: { tables, migrations: pkg.migrations },
    admin: { dir: pkg.adminDir },
  });
```

Its drizzle-kit configs take the preset of `@manablox/config-typescript/drizzle` in this
repository: `export default pluginDrizzleConfig('postgresql')` and `('sqlite')`.

`manablox migrate` runs the core migrations first, then each plugin's folder for the
configured database, recorded in its own journal table `__manablox_migrations_<id>`. It is
idempotent, and the app role of a split [database role setup](../deployment/database-roles.md) is
granted the plugin tables as well. The control API's `GET /instance` reports shipped and
applied migrations per plugin, and [`manablox migrate-db`](../deployment/sqlite-to-postgres.md)
copies plugin tables along. Removing a plugin from the config leaves its tables in place.

Repositories extend `Repository` from `@manablox/db` with the plugin's own tables, built
for the database in use by `buildTables`. `this.t` holds them, `this.core` the core tables:

```ts
import {
  buildTables,
  type BuiltTables,
  type DatabaseContext,
  pluginRepos,
  Repository,
} from '@manablox/db';

export class GreetingRepository extends Repository<BuiltTables<typeof tables>> {
  constructor(context: DatabaseContext) {
    super(context, buildTables(tables, context.dialect.name));
  }
}

// On the same connection or transaction as `repos`, built once per `repos`.
export const helloRepos = pluginRepos((context) => ({ greetings: new GreetingRepository(context) }));
```

Inside `repos.transaction(async (tx) => ...)`, `helloRepos(tx).greetings` writes in that transaction,
so the plugin rows commit and roll back with the core ones, and `afterCommit` waits for the
commit.

## Plugin resource kinds

Besides credentials and templates, a plugin can own a code resource kind of its own, named
`<id>.<name>`, and any plugin or the config can declare entries of it: rows the plugin
reconciles into every targeted space. (Entries only read at runtime, such as the website
plugin's themes, are an [extension point](./extension-points.md) instead; see
[Themes in code](../site/themes.md).) The workflows plugin owns `workflows.workflow` and the webhooks plugin `webhooks.webhook`, see
[Resources in code](../configuration/resources-in-code.md).

```ts
definePlugin({
  name: 'shelf',
  resourceKinds: {
    'shelf.book': { check: (entries) => assertBooksValid(entries) },
  },
});

definePlugin({
  name: '@acme/books',
  resources: { 'shelf.book': [{ slug: 'manual', spaces: '*' }] },
});
```

Entries are `{ slug, spaces, ... }`; the config lists its own under
`resources: { plugins: { '<kind>': [...] } }`. `resolveConfig` collects them in
`config.resources.plugins[<kind>]`, the config's first, each stamped with its `sourceRef`. A
slug declared twice fails with `codeResource.duplicate`, a kind no loaded plugin owns or
one outside the owner's id with `plugin.key.invalid`. The owner's `check(entries)` runs when
a server starts, after the registry is built (`checkPluginResources`); a throw stops the
start. With `check` alone nothing is written to the database: the owning plugin reads the
entries itself.

A kind that writes rows adds the reconciler's side, and `manablox sync` (or `resources.apply:
'boot'`) then reconciles it next to credentials and templates, in every environment of every
targeted space. `defineResourceKind` from `@manablox/services` types it:

| Hook | Does |
| --- | --- |
| `load({ manablox, repos, spaces })` | Reads the kind's rows for the spaces of one pass in batched queries; returns `(space, environment) => rows`, asked once per environment |
| `plan(context)` | What the environment will hold after the pass, existing rows plus the declared ones: returns `{ resolve(name) }`, the id `ref.of('<kind>', name)` stands for, plus anything other kinds may read with `plan.part('<kind>')` |
| `reconcile(context)` | Writes the declarations targeting the space (`context.declared`) as `source: 'code'` rows and reports each as a `SyncChange`. `reconcileResources` does the usual one-row-per-declaration work |
| `prune(context)` | Handles the kind's code rows whose declaration is gone; `context.options.prune` says whether to delete rather than disable |

Every kind plans before any is reconciled, so declarations may reference each other in any
order; `context.plan.resolve` resolves `ref.contentType`, `ref.credential`, `ref.template` and
every kind's own references. Kinds reconcile in order after credentials and before
templates, and prune in reverse. A dry run (`manablox sync --dry-run`) calls the same hooks
with `options.dryRun`; the kind reports what it would write and writes nothing.

### Config export

The space's "Write as config" (`spaces.configSource`) renders what editors built in the admin
as `manablox.config.ts` code. A resource kind with a `configExport` part adds the space's own rows there, as its entries,
written with the plugin's own define function, under `resources.plugins['<kind>']`. The config picker lists the kind with
its `label`, and its rows to pick from.

```ts
configExport: {
  label: 'Greetings',
  description: 'defineGreeting, one per greeting of production.',
  define: { name: 'defineGreeting', from: '@acme/hello/define' },
  load: async ({ repos, spaceId }) =>
    (await greetingsOf(repos).list(spaceId)).map((row) => ({ id: row.id, label: row.message, slug: '', row })),
  render: (row, { slug, deref }) => ({ input: deref({ slug, message: row.message }) }),
},
```

| Key | Meaning |
| --- | --- |
| `label`, `description`, `icon` | The kind in the config picker; `icon` names one of the admin's icons, `plug` by default |
| `define` | The function each entry is written with and the module it is imported from |
| `load` | The rows that can be written, each `{ id, label, slug, row }`. Leave out rows that came from code. An empty `slug` is derived from the label; slugs are made unique within the kind |
| `render` | `(row, { slug, deref }) => { input, warnings? }`: the define function's input. `deref(value)` replaces every id the export knows (content types, credentials, templates, other kinds' rows) with its `ref.*` marker, written as `ref.contentType('post')` or `ref.of('<kind>', '<slug>')`. `warnings` land as TODO lines in the file's header |

The selection names the resource kind, like the core kinds; the result's
`counts` has an entry for it.

## Settings per space

A plugin keeps settings of its own per space in the core table `space_plugin_settings`
(`spaceId`, `environmentId`, `plugin`, `data`), through `repos.pluginSettings`:
`get(scope, pluginId)`, `set(scope, pluginId, data)`, `remove(scope, pluginId)` and
`listBySpace(spaceId)`. A space id as the scope is production. The production row holds the
space's settings; a staging environment's row holds what that environment keeps of its
own, for example a 404 page named with a plugin
[nomination](./data-providers.md#nominations). Rows go with their space and environment,
and space transfers carry them under `pluginSettings` of the file. The website plugin keeps
its mode, locale strategy, 404 page, password and revision there.

## New spaces

`spaces.create` takes `plugins`, a map from plugin id to that plugin's draft. The admin
fills it from the [`space.create.steps` slot](./admin-slots.md): each entry's `setDraft`
writes into its plugin's draft, and the form sends the drafts of the steps it showed. The
`SpaceService.create` input takes the same `plugins` map, for code and the CLI.

```ts
import { definePlugin, type PluginSpaceCreate } from '@manablox/core';
import type {} from '@manablox/services'; // adds `repos` to the context
import { z } from 'zod';

const draft = z.object({ greeting: z.string().trim().max(280).default('') });

const spaceCreate: PluginSpaceCreate<unknown, z.infer<typeof draft>> = {
  schema: draft,
  async apply({ repos, space }, { greeting }) {
    if (greeting) await greetings(repos).create({ spaceId: space.id }, greeting);
  },
};

export const hello = definePlugin({ name: 'hello', spaceCreate });
```

Every draft is checked before anything is written. A plugin id that is not loaded or has no
`spaceCreate` answers 400 `space.plugin.unknown`; a plugin whose flag is off for new spaces
(the instance decides, since a new space has no group yet) answers 403 `space.plugin.off`;
a draft its `schema` refuses answers 422 `space.validation.failed` with
`space.plugin.invalid` details under `['plugins', <id>, ...]`. `apply` then runs in the
create's transaction, after the starter and in plugin order, with `repos` bound to that
transaction, the new `space`, its owner as `actorId` (the creating user in the admin, `null`
when there is none) and the plugin's context as `plugin`. A throw from `apply` refuses the create and leaves no space behind.

`afterCommit` runs once the space is committed: after the starter and the types of a
`plan` (both written in the create's transaction), the code resources
declared for all spaces, and (through the control API) the space's group and API hosts. It
gets the same `plugin`, `space` and `actorId`, but no transaction, and is the place for work
that needs the space's content types or calls other services. The space stays whatever
happens there: a returned sentence, or the message of a throw (which is also logged),
comes back in `warnings` of the create's result, next to the space.

```ts
const spaceCreate: PluginSpaceCreate<unknown, z.infer<typeof draft>> = {
  schema: draft,
  async afterCommit({ plugin, space }, { greeting }) {
    const types = await plugin.repos.contentTypes.listByScope(space.id);
    return types.length ? null : 'No content types yet; add one to greet.';
  },
};
```

The same `plugins` map works everywhere a space is created: `spaces.create` over rpc (the
result has `warnings`; `plan` takes the types `plugins.ai.designContentTypes` proposed), `POST
/control/v1/spaces` (also with `warnings` and `plan`) and
`manablox space create --plugin-data <id>=<json>`, which prints the warnings. The AI plugin
uses only `afterCommit`: `plugins: { ai: { copyFrom: <spaceId> } }` copies that space's
providers, keys included, into the new one. A plugin can
also give `space create` options of its own that produce the draft, as the website plugin
does with `--website designed`; see [CLI contributions](./cli.md).

## Admin extensions

A plugin's admin part is a bundle of its own, built with `@manablox/admin-plugin` and
named in `admin: { dir }`. The prebuilt admin loads it at runtime: routes, menu entries,
field components, components in the admin's slots and in other plugins' slots (the
workflows plugin's action forms, field controls and trigger forms), settings tabs,
error sentences, live event handlers and activity log labels. Nothing about the admin is
rebuilt. See [Admin plugins](./admin-plugins.md), [Admin slots](./admin-slots.md) and the
[Admin SDK](./admin-sdk.md).
A plugin screen that frames the site talks to it over [live preview channels](./live-preview-channels.md).

## Package layout

The first-party plugins share one layout; a plugin of your own that keeps it has each part
where a reader of the others looks for it.

| Path | What goes there |
| --- | --- |
| `src/index.ts` | The package entry: exports only |
| `src/sdk.ts`, `src/define.ts`, `src/cli/` or `src/cli.ts` | Browser-safe types and helpers, `define*` for code resources, the CLI module |
| `src/server/plugin.ts` | The `definePlugin` call that wires every part below |
| `src/server/keys.ts` | Control keys (`controlKeys(id, controls)`) and other names the plugin reuses |
| `src/server/audit.ts`, `controls.ts`, `errors.ts`, `permissions.ts`, `llms.ts` | Declarations |
| `src/server/hooks.ts` | The hooks the plugin declares |
| `src/server/services.ts` or `services/` | The plugin's services; see below |
| `src/server/rpc.ts` or `rpc/` | Its oRPC routers, a folder once there are several |
| `src/server/routes.ts` | HTTP routes on a surface |
| `src/server/jobs.ts` | Job definitions, when they are more than one line of wiring |
| `src/server/data.ts` | Data providers: copy, promote, transfer, snapshots |
| `src/server/db/` | `tables.ts`, `schema/` for drizzle-kit, `rows.ts`, the repositories |
| `src/admin/` | The admin bundle, see [Admin plugins](./admin-plugins.md#folder-layout) |

A plugin with several services keeps them in `services/`: `index.ts` builds them and
declares the `PluginServicesMap` entry, each class is `<name>.service.ts`, and the parts of
one service sit in `services/<name>/`. Parts written as free functions take one shared
object, `<Name>Context` in `services/<name>/context.ts`, as their first parameter `ctx`
(the workflow engine's is `EngineContext`). Larger areas get a folder of their own
(`engine/`, `validate/`, `mode/`); a folder with one file is that file.

## A plugin package, end to end

A small `hello` plugin, greetings per space, uses most extension points with a few lines
each. Its factory wires the parts, each in a file of its own:

```ts
// src/server/plugin.ts
import { definePlugin, type ManabloxPlugin } from '@manablox/core';
import { pluginPackage } from '@manablox/core/node';
import { helloAudit } from './audit.js';
import { helloControls } from './controls.js';
import { helloData, helloGreetingKind } from './data.js';
import * as tables from './db/tables.js';
import { helloErrors } from './errors.js';
import { helloJobs, helloMaintenance } from './jobs.js';
import { helloMode } from './mode.js';
import { helloPermissions } from './permissions.js';
import { helloServer } from './routes.js';
import { helloRpc } from './rpc.js';
import { type HelloServices, helloServices } from './services.js';
import { helloSpaceCreate } from './space-create.js';

export function helloPlugin(): ManabloxPlugin<HelloServices> {
  // The package's own `migrations/`, `migrations-sqlite/` and `dist/admin`.
  const pkg = pluginPackage(import.meta.url);
  return definePlugin({
    name: 'hello',
    description: 'Greetings per space.',
    resourceKinds: { 'hello.greeting': helloGreetingKind },
    db: { tables, migrations: pkg.migrations },
    permissions: helloPermissions,
    controls: helloControls,
    audit: helloAudit,
    errors: helloErrors,
    jobs: helloJobs,
    maintenance: helloMaintenance,
    services: helloServices,
    spaceCreate: helloSpaceCreate,
    rpc: helloRpc,
    server: helloServer,
    modes: [helloMode],
    data: [helloData],
    admin: { dir: pkg.adminDir },
  });
}
```

| File | What it holds |
| --- | --- |
| `src/server/db/tables.ts`, `src/server/db/schema/`, `migrations/`, `migrations-sqlite/` | The `hello_greetings` table, its per-dialect schema files and generated migrations |
| `src/server/db/repository.ts` | A repository on the plugin's table that joins core transactions |
| `src/server/permissions.ts`, `src/server/controls.ts` | `hello:write` for editors; a feature `features.plugins.hello.shout` and a limit `limits.plugins.hello.greetings`; see [Plugin permissions](./permissions.md) and [Plugin controls](./controls.md) |
| `src/server/audit.ts`, `src/server/errors.ts` | The audit kind `hello.greeting` and the error key `plugins.hello.shoutingOff` |
| `src/server/services.ts` | The greeting service: checks the feature and the limit, records the audit entry; see [Plugin services](./services.md) |
| `src/server/rpc.ts` | `plugins.hello.greetings.list` and `.create`, and the `HelloRouter` type; see [Plugin procedures](./rpc.md) |
| `src/server/routes.ts` | `GET /plugins/hello/greetings` on the management server; see [Server routes](./server-routes.md) |
| `src/server/mode.ts` | A `hello` server mode answering `GET /`; see [Server modes](./server-modes.md) |
| `src/server/jobs.ts` | A queued job `hello:greet` and an hourly maintenance task `hello:tally`; see [Plugin jobs](./jobs.md) |
| `src/server/data.ts` | A data provider: environment copy and promote, a transfer section, snapshot state and the limit counter; see [Data providers](./data-providers.md) |
| `src/server/space-create.ts`, `src/cli.ts` | A first greeting for a new space, from the admin's create form or `manablox space create --hello-greeting <text>`; see [CLI contributions](./cli.md) |
| `src/admin/` | The admin bundle, built by `vite.admin.config.ts` into `dist/admin`; see [Admin plugins](./admin-plugins.md#a-small-example) |
| `src/define.ts` | `defineGreeting` for the `hello.greeting` resource kind, which the config export writes greetings with |
| `test/` | Tests against a real instance on both databases, with `pluginTestConfig` from `@manablox/config-vitest` |

A second plugin, `hello-extra`, shows how plugins build on each other: it `requires` hello,
declares the `greeters` extension point hello contributes words to (hello `enhances` it),
reaches hello's services through `plugins.get('hello')`, keeps a channel open from `start` to
`stop`, and imports its stamps after hello's greetings they point at (`dependsOn` and the
import's `ids`). Its admin bundle declares the `hello-extra:board` slot, which hello's bundle
fills, and exposes an api hello's greetings page uses when it is there. The pages on
[dependencies](./dependencies.md), [extension points](./extension-points.md),
[lifecycle](./lifecycle.md) and [plugin slots](./plugin-slots.md) show those parts.

## The website plugin

`@manablox/plugin-website` is the largest plugin and uses nearly every extension point:
tables and migrations, permissions, controls, audit and error keys, hooks of its own,
services, a router, data providers with a host source and nominations, a resource kind,
block extensions, a server mode, form routes, an `llms` section, a space create step, plugin
settings, a runtime admin bundle with a live preview channel, and a CLI contribution. It is
a premium plugin, published under a commercial license from a repository of its own; see
[Designed sites](../site/index.md) for what it does. Core packages never import it or its
libraries (`@manablox/site`, `@manablox/site-renderer`).

## The AI plugin

`@manablox/plugin-ai` (id `ai`) is the second premium plugin: tables and a baseline
migration, permissions, controls, audit and error keys, services other plugins use
(`plugins.get('ai')`, which the website plugin's AI theme and block design call), a router,
a queued job, a data provider for transfers, snapshots, retention and environment copies,
a workflow action, a space create step, an `llms` section, a runtime admin bundle with
slot entries and an exposed api, and a CLI contribution. See [AI](../admin/ai.md) for what
it does. Like the website plugin it is a premium plugin with a repository of its own.

## The workflows and webhooks plugins

`@manablox/plugin-workflows` (id `workflows`) is the plugin other plugins extend most: tables
with a baseline migration, permissions, controls (a concurrency rate rule among them), audit and error keys, hooks of its own, services
other plugins start runs through (`plugins.get('workflows').engine.runTrigger`), a router,
a queued job and a maintenance task, a clock and a channel from `start` to `stop`, a data
provider for environments, transfers, retention, limits and the config export, a resource
kind, an `llms` section, five extension points (`actions`, `triggers`, `abortTriggers`,
`fieldKinds`, `designHints`), and a runtime admin bundle that declares four plugin slots
and exposes an api. See [Workflows](../admin/workflows.md) for what it does and
[Workflow actions](./workflow-actions.md) for its extension points; its source is in
[the CMS repository](https://github.com/manablox/manablox-cms/tree/main/packages/plugin-workflows).

`@manablox/plugin-webhooks` (id `webhooks`) shows the other side: it `enhances` workflows
and works without them. It owns the `webhooks` and `webhooks_deliveries` tables with a
baseline migration, permissions, controls (an incoming rate rule
counted per client address among them), audit and error keys, two hooks
(`webhooks:beforeCreate` and the observe-only `webhooks:received`), services
(`plugins.get('webhooks')`, `{ webhooks: WebhookService }`), a router, the queued
`webhooks:deliver` job, an unauthenticated route of the management scope for incoming calls
(`/plugins/webhooks/in/...`, raw body), content hooks that fan out to outgoing endpoints, a
data provider for environments, transfers, snapshots, retention, limits and the config
export, the `webhooks.webhook` resource kind and an `llms` section. With the workflows
plugin it contributes the `webhook` trigger and abort trigger and a design hint, starts and
aborts runs with `runTrigger` when an incoming endpoint is called, and fills
`workflows:triggerForm` from its admin bundle, which also brings the **Webhooks** page. See
[Webhooks](../admin/webhooks.md); its source is in
[the CMS repository](https://github.com/manablox/manablox-cms/tree/main/packages/plugin-webhooks).
