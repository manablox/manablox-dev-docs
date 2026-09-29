---
title: 'Admin plugins'
description: "Add pages, menu entries, field editors and slot entries to the prebuilt admin, loaded at runtime."
---

A plugin brings its own admin screens as a prebuilt bundle next to its server code. The
admin that ships in `@manablox/admin` loads that bundle when it starts, so adding or
removing a plugin never means rebuilding the admin.

## How it loads

1. The plugin builds its admin part into a folder, usually `dist/admin`: `entry.js`, its
chunks, `style.css` and `manifest.json`.
2. The server plugin names that folder in `admin: { dir }`.
3. The management server lists every such bundle at `GET /admin/plugins.json` and serves
its files at `/admin/plugins/<id>/<hash>/...`, compressed. The hash is taken from the files,
so the files are cached forever and a rebuilt bundle gets new URLs (the server reads them
at boot, so a rebuild takes a restart).
4. When the server serves the admin, it writes the list into `index.html` along with
`modulepreload` links for each `entry.js`, so the browser fetches the entries next to the
admin's own code; an admin served elsewhere fetches the list on start. The admin adds each
bundle's stylesheet and imports its `entry.js` while it mounts, and installs the bundles in
the list's order, the server's [boot order](./dependencies.md#boot-order), each as soon as
it and the ones before it have loaded. Signed-out pages such as sign-in do not wait for
them; every other page does, so the plugin's routes work on the first page load.

```ts
import { definePlugin } from '@manablox/core';
import { pluginPackage } from '@manablox/core/node';

export const seoPlugin = () =>
  definePlugin({
    name: '@acme/seo',
    // `dist/admin` of the plugin's package.
    admin: { dir: pluginPackage(import.meta.url).adminDir },
  });
```

A folder without a readable `manifest.json` is skipped with a warning in the server log;
the rest of the admin works without it.

## The admin entry

`entry.js` default-exports the admin plugin:

```ts
// src/admin/index.ts
import { defineAdminPlugin } from '@manablox/admin-plugin';
import './style.css';

export default defineAdminPlugin({
  name: '@acme/seo',
  routes: [{ path: '/seo', name: 'seo', component: () => import('./SeoReport.vue') }],
  menu: [{ label: 'SEO', icon: 'eye', to: '/seo', group: 'content', order: 350, shortcut: 'e' }],
  slots: {
    'content.editor.actions': [{ component: () => import('./SeoScore.vue') }],
  },
  audit: {
    entities: { 'acme.seo.report': { label: 'SEO report', route: () => '/seo' } },
    actions: { 'acme.seo.report.create': 'Ran an SEO report' },
  },
});
```

`name` is the same as the server plugin's name. The admin knows the plugin by the server's
id and flag (`features.plugins.<id>`); the plugin's routes, menu entries and slot entries
answer to that flag unless they name their own `feature`.

| Key | Meaning |
| --- | --- |
| `name` | The plugin's name, as its server part has it |
| `feature` | Another feature switch for the whole plugin |
| `routes` | Pages: `{ path, name, component, inSpace, feature, features, panel, section, editor }`. `inSpace: false` renders outside the space shell. `features` lists more features the page needs besides `feature`. `panel` names one of the plugin's `sidePanels`; `section` the sidebar entry the page belongs to. `editor: 'new'` or `'edit'` marks an editor page |
| `menu` | Sidebar entries: `{ label, icon, to, group, order, permission, shortcut, feature }` |
| `fields` | `inputs` and `settings` components of field types, by the keys their `admin` declares. See [Custom field types](./custom-field-types.md) |
| `slots` | Components in the admin's own screens and in other plugins' slots, such as the workflows plugin's action forms (`workflows:nodeForm`). See [Admin slots](./admin-slots.md), [Plugin slots and apis](./plugin-slots.md) and [Workflow actions](./workflow-actions.md#custom-form-components) |
| `sidePanels` | Side lists for the plugin's routes: `{ key, label, icon, component }` |
| `settingsSections` | Tabs of their own in Settings: `{ id, label, icon, component, scope, permission, superadmin, feature }`. The tab's id becomes `<plugin id>.<id>` |
| `transferSections` | The plugin's [data provider](./data-providers.md) sections in the export and import pickers: `{ kind, label, description, icon, group, optIn, noun, pickable }`. `group` is one of the admin's groups (`content`, `structure`, `integrations`) or a new `{ id, label, hint, order }`; the admin's groups are ordered 100, 200 and 400. `optIn` leaves the section unticked until picked; `noun` names one row and several in counts; `pickable` lets its entries be picked one by one, for a provider with `entries` (in an import file they are the rows with an `id`, named by `label`, `name` or `kind`) |
| `realtime` | Handlers of live events by target kind, such as refetching a list another editor changed |
| `audit` | Labels and links of the plugin's activity log entries: `entities` by target kind (`{ label, route(targetId, meta) }`), `actions` by action, `verbs` (the badge word), `outcomes` by action (`(meta, changes) => string or null`, a word beside the badge from the entry's meta and changed fields, such as `on` for a switch: `enabledSwitchOutcome` from `@manablox/admin-plugin` reads an `enabled` change) and `actors` by actor kind (`{ label, icon }`, for entries the plugin records as its own actor, like the workflows plugin's `workflows`). Unlabelled ones show their key |
| `features` | Names of the plugin's features by key, for locks and notices |
| `permissionIcons` | Icons of the plugin's permission groups by group id |
| `usage` | Names of the plugin's usage metrics by metric, with what stops when one is used up: `{ label, blocked }` |
| `diffKinds` | Names of the plugin's data provider kinds in the promote view's list of changes, by kind |
| `invalidateOnPromote` | `(spaceId) => void`, called after a promote replaced a space's production data, to drop the plugin's queries of that space (usually `invalidate` of its `pluginKeys`) |
| `setup(context)` | Runs once when the admin starts, with `id`, `defineSlot` and `expose` (see [Plugin slots and apis](./plugin-slots.md)); everything else is declared on the plugin object |

Components are loaded with `() => import(...)`, so each one is a chunk of its own that
loads when it is first shown.

## Talking to the server

`pluginClient(id)` is the typed client of the plugin's [procedures](./rpc.md), over the
admin's own connection: the editor's session, the working environment and the admin's
error sentences all apply.

```ts
import { pluginClient } from '@manablox/admin-sdk';
import type { SeoRouter } from '../rpc.js';

const seo = pluginClient<SeoRouter>('acme.seo');
const report = await seo.reports.run({ spaceId });
```

A plugin's [server routes](./server-routes.md#calling-routes-from-an-admin-plugin) take a
plain same-origin `fetch`.

The plugin's queries keep their keys under a root of their own with `pluginKeys(root)` from
the SDK: `all(spaceId)` covers a space, `scoped(spaceId, ...parts)` adds the working
environment, so keys follow an environment switch, and `invalidate(spaceId)` drops them all:

```ts
import { pluginKeys } from '@manablox/admin-sdk';

const seo = pluginKeys('seo');
export const seoKeys = {
  reports: (spaceId: string | null) => seo.scoped(spaceId, 'reports'),
};
export const invalidateSeo = seo.invalidate;
```

## Building the bundle

`@manablox/admin-plugin/vite` has the build preset:

```ts
// vite.admin.config.ts
import { defineAdminPluginBuild } from '@manablox/admin-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(
  defineAdminPluginBuild({ plugins: [vue(), tailwindcss()], sdkLevel: 1 }),
);
```

`vite build --config vite.admin.config.ts` writes `dist/admin`. The options are `sdkLevel`
(required, below), `entry` (default `src/admin/index.ts`), `outDir` (default `dist/admin`),
`root` and `plugins`.

The config is the same in a repository with TypeScript 7. The Vue SFC compiler resolves the
types that `defineProps<...>()` and the other macros import from other files with
TypeScript's programmatic API, which TypeScript 7 does not have, so the preset gives it the
TypeScript 5.9 that `@manablox/admin-plugin` installs. `pluginAdminTestConfig` of
`@manablox/config-vitest` does the same for the admin tests.

The admin shares `vue`, `vue-router`, `@tanstack/vue-query`, `pinia`, `reka-ui` and
`@manablox/admin-sdk` with its plugins through an import map. The preset leaves these
imports to the admin, so a bundle carries only its own code and every plugin uses the
admin's one copy of Vue. Import only the packages themselves: a subpath such as
`@manablox/admin-sdk/lib/api` is not shared, and the build refuses it.

`manifest.json` records the bundle's `version`, its `entry` and `css` files and
`sdkLevel`, the lowest admin SDK API level the plugin needs. The SDK exports its current
level as `SDK_API_LEVEL`, an integer raised by one with every breaking change to its
surface; npm versions stay the same for every `@manablox/*` package. Set `sdkLevel` to the
level whose surface the plugin uses, usually the `SDK_API_LEVEL` you build against (1 today).
Each admin supports a range of levels up to its own `SDK_API_LEVEL`. It refuses a bundle
outside that range and tells superadmins why: a level above the range needs a newer
Manablox, one below it an updated plugin.

The management API lists and serves the bundles at `/admin/plugins.json` and
`/admin/plugins/`, also when it does not serve the admin itself. An admin served from
elsewhere proxies those two paths to it, as the nginx admin image does (see
[Deployment](../deployment/index.md#images)).

## Styles

The plugin's stylesheet is built against the admin's design tokens with the Tailwind
preset, imported with a prefix of the plugin's own:

```css
/* src/admin/style.css */
@import "@manablox/admin-plugin/tailwind.css" prefix(seo);
```

It brings Tailwind's utilities on the admin's theme (colours, type scale, spacing, radii),
without base styles. Every utility the plugin writes starts with its prefix,
before any variant: `seo:flex`, `seo:lg:block`, `seo:dark:bg-surface-900`,
`seo:hover:text-brand-600`. They look as the admin's `flex` or `bg-surface-50` do, but
live in the plugin's sheet only, so they never override the admin's own classes and two
plugins never override each other's. By convention the prefix is the plugin's id, or a
short form of it, in lowercase letters only (the website plugin uses `ws`, the hello
example `hello`). Nothing checks that two plugins differ, so keep to the convention.

A few rules follow from the prefix:

- Theme variables carry it too, and point at the admin's own: the sheet defines `--seo-color-brand-500: var(--color-brand-500)`, `--seo-spacing: var(--spacing)` and so on for the tokens it uses. Plugin styles therefore follow the admin's current values, dark mode included. In arbitrary values and your own CSS, use either name: `seo:shadow-[0_0_0_1px_var(--color-brand-500)]`. The admin's sheet always defines every theme variable, used by the admin or not. Breakpoints and container sizes are the exception: queries need fixed values, so the preset copies them.
- The Tailwind colour palettes (`red-500`, `gray-100`) are not part of the admin's theme; use its own colours (`surface`, `brand`, `iris`, `ochre`, `ok`, `warn`, `danger`, `white`, `black`).
- A `group` or `peer` that drives prefixed variants is prefixed as well: `seo:group` on the parent, `seo:group-hover:flex` on the child. The admin's `mb-row-action` reveals on the plain `group`; a parent that serves both carries `group seo:group`.
- The admin's component classes (`mb-btn-primary`, `mb-card`, `mb-input`, `mb-row-action` and the rest) are already on the page; use them as they are, without the prefix. So are SDK components: their own classes come with the admin's sheet.
- Your own plain classes (`.seo-report`) need no prefix.

The build preset refuses a stylesheet that imports the Tailwind preset without a prefix,
and a bundle whose sheet has utilities without it.

## When something fails

A bundle that does not load (a network error, an exception in `entry.js`, a missing
default export, an SDK level outside the admin's range) is skipped and logged in the browser
console, and superadmins see a notice naming the plugin. Every other plugin and the admin
itself keep working. A slot entry that throws while rendering is dropped from its slot
without taking the page down.

## Folder layout

The first-party bundles share one shape under `src/admin`, a good default for yours:

| Path | What goes there |
| --- | --- |
| `index.ts` | The `defineAdminPlugin` call |
| `client.ts` | `pluginClient<Router>(id)` for the plugin's own procedures |
| `keys.ts` | Query keys (`pluginKeys(root)`) and their invalidation |
| `queries.ts` | Every query hook and write helper of the bundle |
| `api.ts`, `admin-api.ts` | An api exposed to other bundles and its types-only package export |
| `slots.ts` | The props of the slots the bundle declares, as a types-only package export |
| `use*.ts` | Composables |
| `model/` | Plain TypeScript: types, constants, pure helpers |
| `pages/` | Route components |
| `slots/` | Components (and entries) the bundle puts into slots |
| `components/` | Everything else: dialogs, side lists, settings tabs, the pieces pages are built of |

Component names follow the admin's own: a page is a `*Page.vue`, a section of an
inspector aside is a `*Section.vue`.

## Type-checking the admin code

`.vue` files are type-checked by vue-tsc, which uses TypeScript's programmatic API, and
TypeScript 7 does not have it yet. `@manablox/admin-plugin` installs vue-tsc and the
TypeScript 5.9 it needs, and runs them with its `manablox-vue-check` command. Your
repository keeps TypeScript 7 for everything else and installs neither vue-tsc nor
TypeScript 5.9 itself.

Give the admin code a tsconfig of its own, say `tsconfig.admin.json` with `src/admin/**/*.ts`
and `src/admin/**/*.vue` included and `"types": ["vite/client"]`, and check it with a
script:

```json
{
  "scripts": {
    "typecheck:vue": "manablox-vue-check --noEmit -p tsconfig.admin.json"
  }
}
```

`manablox-vue-check` takes vue-tsc's options (those of `tsc`) and exits with its code: 0
without errors, 1 or 2 with them. It always runs the vue-tsc and TypeScript installed with
`@manablox/admin-plugin`, whichever TypeScript your project has.

## Testing a bundle

A plugin in its own repository builds its bundle (see [Building the bundle](#building-the-bundle))
and tests it against the published packages, with no checkout of the CMS. The tests need
`vitest`, `happy-dom` and `@manablox/config-vitest` as dev dependencies:

```ts
// vitest.admin.config.ts: test/admin/**/*.test.ts in happy-dom
import { pluginAdminTestConfig } from '@manablox/config-vitest';
import vue from '@vitejs/plugin-vue';

export default pluginAdminTestConfig([vue()]);
```

`@manablox/admin-sdk/testing` sets up the admin's state a test needs: `setupAdminTest()`
for a fresh store and query cache, `mockAdminApi({ plugins: { <id>: { ... } } })` for the
plugin's own procedures (and `{ contentTypes: { ... } }` for the core's),
`createTestSession({ role, permissions })` for the signed-in account and `useTestSpace()`
for the current space:

```ts
// test/admin/queries.test.ts
import { mockAdminApi, setupAdminTest, useTestSpace } from '@manablox/admin-sdk/testing';
import { beforeEach, expect, it, vi } from 'vitest';
import { createGreeting } from '../../src/admin/queries';

const hello = { greetings: { create: vi.fn(async () => ({ id: 'g1' })) } };
mockAdminApi({ plugins: { hello } });

beforeEach(() => {
  setupAdminTest();
  useTestSpace({ id: 's1' });
});

it('creates a greeting in the space', async () => {
  await createGreeting('s1', 'Hello');
  expect(hello.greetings.create).toHaveBeenCalledWith({ spaceId: 's1', message: 'Hello' });
});
```

To try the bundle in a real admin, build it and start an instance whose config loads the
plugin: the prebuilt admin loads `dist/admin` at runtime, so a rebuild and a reload show a
change. The admin's own development server, in the CMS repository, can load a plugin's
source for hot reloading with `manabloxAdminPlugins({ plugins: [...] })` from
`@manablox/admin-plugin/vite`; a production build ignores that list.

## A small example

A `hello` plugin that keeps greetings per space has a page, a menu entry, slot entries, audit
labels and a realtime handler:

```ts
// src/admin/index.ts
import { defineAdminPlugin } from '@manablox/admin-plugin';
import { queryClient } from '@manablox/admin-sdk';
import './style.css';

export default defineAdminPlugin({
  name: 'hello',
  routes: [
    { path: '/hello', name: 'hello-greetings', component: () => import('./pages/GreetingsPage.vue') },
  ],
  menu: [{ label: 'Greetings', icon: 'star', to: '/hello', group: 'content', order: 900 }],
  slots: {
    'space.settings.sections': [{ component: () => import('./slots/GreetingSettings.vue') }],
    'audit.entities': [{ component: () => import('./slots/GreetingAuditHint.vue') }],
  },
  audit: {
    entities: { 'hello.greeting': { label: 'Greeting', route: () => '/hello' } },
    actions: { 'hello.greeting.create': 'Created a greeting' },
  },
  realtime: {
    'hello.greeting': () => void queryClient.invalidateQueries({ queryKey: ['hello'] }),
  },
});
```

Its queries talk to the plugin's own procedures through `pluginClient`, typed from the
plugin's server router:

```ts
// src/admin/queries.ts
import { pluginClient, useSpaceStore } from '@manablox/admin-sdk';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import type { HelloRouter } from '../server/rpc.js';

const hello = pluginClient<HelloRouter>('hello');

export function useGreetings() {
  const spaces = useSpaceStore();
  return useQuery({
    queryKey: computed(() => ['hello', 'greetings', spaces.currentId]),
    queryFn: () => hello.greetings.list({ spaceId: spaces.currentId as string }),
    enabled: computed(() => Boolean(spaces.currentId)),
  });
}

export const createGreeting = (spaceId: string, message: string) =>
  hello.greetings.create({ spaceId, message });
```

[Plugin slots and apis](./plugin-slots.md) shows a second bundle that declares a slot the
first one fills and exposes an api to it.

## Reference implementations

The website plugin (`@manablox/plugin-website`) is the full-size example: its admin bundle is
the designer (routes under `/design`, a side panel, entries in most slots, transfer sections,
audit labels and realtime handlers), talking to its own router through
`pluginClient<WebsiteRouter>('website')`.

[`@manablox/plugin-workflows`](https://github.com/manablox/manablox-cms/tree/main/packages/plugin-workflows)
shows a bundle other plugins extend: its routes, menu entry and side panel, the four slots
it declares (`workflows:triggerForm`, `workflows:nodeForm`, `workflows:fieldControl`,
`workflows:createActions`, typed in `@manablox/plugin-workflows/admin-slots`) and an exposed
api, typed in `@manablox/plugin-workflows/admin-api`.
[`@manablox/plugin-webhooks`](https://github.com/manablox/manablox-cms/tree/main/packages/plugin-webhooks)
has a page of its own (**Webhooks**) and fills `workflows:triggerForm`, and uses the
workflows api where that plugin is loaded. Both build their bundle with
`vite.admin.config.ts` into `dist/admin`, as above.
