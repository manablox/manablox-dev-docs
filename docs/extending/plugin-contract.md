---
title: 'Plugin contract'
description: 'Every field of a server plugin, what it does and which package defines it.'
---

A [plugin](./plugins.md) is the object `definePlugin` from `@manablox/core` returns. Its type,
`ManabloxPlugin<S>`, is exported by `@manablox/core`; `S` is what its `services` build.
A few fields and the types they take come from other packages, which add them to the core
interfaces when they are imported (`declare module '@manablox/core'`). A plugin depending on
those packages sees the fields; the core alone does not know them.

## Identity and the plugin graph

| Field | Meaning | Package |
| --- | --- | --- |
| `name` | Unique; its id (lowercased, `@` dropped, `/` as `.`) names the flag `plugins.<id>`, keys, procedures and routes | core |
| `version`, `description` | Listed in `instance.plugins`; `description` also explains the permission group | core |
| `requires`, `enhances` | Plugins it cannot run without, and plugins it adds to when they are there. See [Dependencies](./dependencies.md) | core |
| `extensionPoints`, `contributions` | Points others fill, and entries for others' points. See [Extension points](./extension-points.md) | core; each point's entry type by its plugin (`PluginContributions`) |

## Model

| Field | Meaning | Package |
| --- | --- | --- |
| `fieldTypes` | Field types to register. See [Custom field types](./custom-field-types.md) | core |
| `contentTypes` | Content types, the same inputs as the config's; a name the config declares too is refused | core |
| `extend` | Fields for content types declared in the config or by another plugin; a field that exists is merged. See [Adding fields to other content types](./plugins.md#adding-fields-to-other-content-types) | core |
| `blocks`, `contentTypeData` | The plugin's data on block instances (`ext.<id>`) and on code content types. See [Block extensions](./block-extensions.md) | core; the GraphQL type of block data by `@manablox/api-graphql` |
| `db` | `{ migrations, tables }`: migration folders per dialect (`pluginPackage(import.meta.url).migrations`) and table definitions. See [Tables and migrations](./plugins.md#tables-and-migrations) | core (`migrations`), `@manablox/db` (`tables`) |

## Declarations

| Field | Meaning | Package |
| --- | --- | --- |
| `permissions` | `<id>:<action>` keys. See [Plugin permissions](./permissions.md) | core |
| `controls` | Flags, limits, usage, rate rules, retention and settings under the plugin's namespace. See [Plugin controls](./controls.md) | core |
| `ceilings(plugin)` | Read-only feature values above every scope, never stored, and admin banners; called once per process after the services are built. See [Feature ceilings](./controls.md#feature-ceilings) | core; wired by `@manablox/server` |
| `audit`, `errors` | Activity log kinds `<id>.<entity>` and error keys `plugins.<id>.*`. See [Plugin services](./services.md#audit-entries) | core |
| `credentials`, `templates` | Code resources for the targeted spaces. See [Resources in code](../configuration/resources-in-code.md) | core |
| `resourceKinds`, `resources` | Code resource kinds the plugin owns, and entries of any plugin's kinds. See [Plugin resource kinds](./plugins.md#plugin-resource-kinds) | core; `load`, `plan`, `reconcile`, `prune` and `configExport` of a kind by `@manablox/services` |

## Runtime

| Field | Meaning | Package |
| --- | --- | --- |
| `services` | Builds the plugin's services once per process. See [Plugin services](./services.md) | core; `repos`, `db`, `cache` and the core services on its context by `@manablox/server` |
| `hooks(plugin)` | Returns the hook handlers, each made with `onHook`, once at boot with the plugin's context; gated by the plugin's flag in each space. See [Plugins](./plugins.md#hooks) | core |
| `jobs`, `maintenance` | Queued jobs by name and scheduled payload-less jobs. See [Plugin jobs](./jobs.md) | core |
| `start`, `stop` | Long-running work on management instances. See [Lifecycle and channels](./lifecycle.md) | core; `repos`, `db`, `cache`, `jobs` and `channel` on the context by `@manablox/server` |
| `spaceCreate` | The plugin's part of a new space. See [New spaces](./plugins.md#new-spaces) | core; the transaction's `repos` by `@manablox/services` |

## Surfaces

| Field | Meaning | Package |
| --- | --- | --- |
| `rpc` | Procedures of the management API under `plugins.<id>`. See [Plugin procedures](./rpc.md) | `@manablox/api-rpc` |
| `server` | HTTP routes under `/plugins/<id>/` and middleware per scope. See [Server routes](./server-routes.md) | core (the field), `@manablox/server` (`routes`, `middleware`) |
| `modes` | Server modes. See [Server modes](./server-modes.md) | core (`name`, `scopes`), `@manablox/server` (`surface`) |
| `admin` | `{ dir?, frameOrigins? }`: the prebuilt admin bundle (`pluginPackage(import.meta.url).adminDir`). See [Admin plugins](./admin-plugins.md) | core |
| `llms` | Markdown for the management API's `/llms.txt`, with the plugin's context | core |
| `cli` | The CLI module of a plugin without a package of its own; wins over the package's declaration when the config is loaded. See [CLI contributions](./cli.md#declaring-it) | core (the field), `@manablox/cli` (reads it) |

## Data

| Field | Meaning | Package |
| --- | --- | --- |
| `data` | Data providers: environments, transfers, snapshots, retention, counters, hosts, cache tags. See [Data providers](./data-providers.md) | core (the list), `@manablox/services` (every part of a provider) |

## Outside the object

- The CLI part of a packaged plugin: `"manablox": { "plugin", "cli" }` in its `package.json`,
  read without the config (the help, `plugin install`). See [CLI contributions](./cli.md).
- Other plugins' services: `PluginServicesMap`, augmented by each plugin package, gives
  `plugins.get(id)` and `plugins.require(id)` their types. See [Dependencies](./dependencies.md).
- Hooks a plugin adds: `ManabloxHooks`, augmented by the plugin package. See [Hooks](./hooks.md).
- The admin bundle: `defineAdminPlugin` of `@manablox/admin-plugin`, its own contract. See
  [Admin plugins](./admin-plugins.md).
