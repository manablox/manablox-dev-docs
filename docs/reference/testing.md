---
title: 'Testing'
description: 'The test tiers, how to run one, and how to write a test at each level.'
---

The first part of this page is the test suite of the CMS repository
([manablox-cms](https://github.com/manablox/manablox-cms)); the second is how a plugin in a
repository of its own tests itself with the helpers the CMS publishes.

## The CMS suites

```sh
pnpm test                                   # every suite, through turbo
pnpm test:sqlite                            # the same suites on SQLite
pnpm --filter @manablox/db test             # one package
pnpm --filter @manablox/db exec vitest run test/publish.test.ts
pnpm --filter @manablox/admin test:e2e      # the browser tests (smoke, controls, runtime plugins, core only)
pnpm check                                  # lint, dead code, licences, plugin boundary, docs wording, typecheck, admin conventions, SDK surface, tests on both databases
```

### The tiers

| Tier | Where | Needs | Cost |
| --- | --- | --- | --- |
| Unit | most packages, `apps/admin/test` | nothing | milliseconds |
| Database | `packages/db/test`, `packages/services/test` | a Postgres server, or nothing on SQLite | a few seconds |
| HTTP surface | `packages/server/test` | nothing: a stub runtime | under a second |
| Contract | `packages/api-rpc/test` | nothing: a stub context with the real services | milliseconds |
| End to end | `apps/admin/e2e` | Postgres or SQLite, a browser | about half a minute including boot |

**Database suites** clone a migrated template database per test file
(`@manablox/db/testing`), so a suite starts in milliseconds rather than migrating from
scratch, and files run in parallel. The template is named after a fingerprint of the
migration files, so a schema change gets a fresh one. A suite that passes `plugins` gets a
template of its own for that plugin set (cloned from the core one, keyed by each plugin's
migrations as well), so plugin tables are migrated once per set, not once per suite.
`TEST_DATABASE_URL` names the
*server*; it falls back to `DATABASE_URL`, and to the dev stack's Postgres. Every suite drops
its database on exit; an interrupted run leaves one behind, which `psql -l | grep
manablox_test` finds.

`TEST_DATABASE_DIALECT=sqlite` (what `pnpm test:sqlite` sets) runs the same suites on
SQLite: the template is a migrated file in the system temp folder and each suite copies
it. CI runs both. A test that only makes sense on one database checks
`ctx.handle.kind`.

**Running in parallel.** Every package's `vitest.config.ts` builds on `sharedConfig` from
`@manablox/config-vitest`. `pnpm test` runs four packages at once (`--concurrency=4`), and under turbo each gets a
quarter of the cores as workers instead of one per core; run alone, a package keeps
vitest's default. Files run in the `vmThreads` pool: each file gets a fresh module graph, so
a `vi.mock` never reaches another file, while workers and the test environment are reused.
A worker whose heap passes 300 MB is replaced (`vmMemoryLimit`), which keeps the largest
suites near 1.7 GB instead of 3 GB.
Transformed modules are cached in `node_modules/.vitest-cache`; `pnpm exec vitest --clearCache`
in a package empties it.
Tests get 20 seconds and hooks 60 (60 for tests too in the database packages), so a loaded
machine slows a run down rather than failing it. `vi.stubGlobal` and `vi.stubEnv` are undone
after every test. A test must not depend on timing: wait for the event it expects (the
realtime tests wait for `ready`), and let background work finish before the next test
(`ctx.notifications.settle()`). To shake out a flaky test, run `pnpm test` and
`pnpm test:sqlite` at the same time.

**The HTTP-surface suite** deliberately runs without a database. The route table and the
public-mode hardening are properties of `createApp`, and asserting them against a real
instance would make the security regressions the slowest tests in the suite rather than
the ones that always run. `stubRuntime()` in `packages/server/test/helpers/runtime.ts` builds a runtime whose repositories
record what they were asked, so a test can assert that a public request never looked up a
principal or never read another space.

**The contract suite** calls the management procedures through oRPC's `call()` with mocked
repositories and the real `SpaceService`, so the rules (last owner, locale invariant,
permission per procedure) are exercised without a database.

**The end-to-end tests** are five Playwright projects in `apps/admin/e2e`. `setup` runs the
install wizard once; `chromium` (the smoke test) and `controls` depend on it. `plugins` and
`core-only` run against instances of their own, each with the prebuilt admin: `plugins` with
the two fixture plugins of `e2e/fixtures/runtime-plugins`, loaded at runtime
(`E2E_PLUGINS_URL`, port 3504), `core-only` without any feature plugin (`@manablox/api`'s
`serve:core-only`, `E2E_CORE_URL`, port 3505), where it checks that no workflow or webhook
UI shows, no plugin bundle loads and the main pages and every settings tab log no error.
The smoke test creates a space, a content type and a document, publishes it and reads it
back from the delivery schema. The designed-site tests live with the website plugin, in its
own repository.

The `controls` project (`e2e/controls.spec.ts`) checks what the admin shows for values the
[control API](./control-api.md) sets. It makes its own space through the control API and
deletes it at the end; each test sets its controls, then resets the instance and space
scopes with an empty `PUT /settings`, so the tests run in any order and leave nothing behind
for the other projects:

| Test | Sets | Checks |
| --- | --- | --- |
| hidden and locked features | `features.plugins.workflows` hidden, `features.menus` and `features.scheduledPublishing` locked, `admin.links.upgrade` | The Workflows entry is gone and its page answers neutrally; Menus shows a lock and opens the locked panel with the message and link; the Schedule button is a lock whose popover links to the upgrade page |
| a count limit | `limits.menusPerSpace` at the current count | Creating a menu toasts the limit sentence and stays on the list |
| a used-up usage limit | a hard `usage.bandwidthBytes` and an external figure that uses it up | The blocked banner names the metric and the space and links to the usage page |
| instance banners | two `admin.banners` and `admin.links.support` | Both show, the help menu has the link, a dismissed banner stays hidden after a reload |
| a read-only instance | `PUT /instance/state` with `readOnly` | The read-only notice with the message; creating a menu toasts the read-only sentence |
| a suspended instance | `PUT /instance/state` with `suspended` | After a reload only the suspended page shows, with the message and links; lifted, "Check again" brings the admin back |

The API the config starts serves the control API next to the management preset
(`SCOPES=rpc,auth,uploads,media,graphql,control`) with the key `E2E_CONTROL_API_KEY`, which has
a fixed default; the tests read it from the config's metadata and call `/control/v1` with
`control()` from `e2e/support.ts`. Servers you start yourself for `E2E_EXTERNAL=1` need the
same two variables. Only the controls project needs them.

Playwright boots the API (migrated with its plugins by `@manablox/api migrate`, started with
a test license by `start:licensed`) and the admin on the host against a throwaway
`manablox_e2e` database (`E2E_DATABASE` names another); the plugins and core only instances
(ports 3504 and 3505, `E2E_PLUGINS_URL` and `E2E_CORE_URL`) use the same name with `_plugins`
and `_core` appended, `manablox_e2e_plugins` and `manablox_e2e_core` by default. `E2E_API_URL` and `E2E_ADMIN_URL` pick
the ports (3000 and 3002 by default). The API uses Redis database 13; set `E2E_REDIS_URL` to
another URL, or to `off` to run without. Set `E2E_EXTERNAL=1` to run against servers you
started yourself; add `-- --project controls` for the controls tests, or
`-- --project core-only` for the core alone. External runs skip the plugins and core only
projects unless `E2E_PLUGINS_URL` or `E2E_CORE_URL` is set. CI runs them on every pull
request and push.

### Filling an instance

`apps/api/scripts/seed/` of the CMS repository fills a development instance with enough of everything to test
against: content types and block types carrying every field type between them, a deep
content tree with blocks inside blocks, translations, assets, content templates, menus,
credentials, webhooks and workflows.

```sh
docker exec manablox-cms-dev-api-1 sh -c 'cd /app/apps/api && pnpm seed:testing'
SEED_SCALE=large SEED=7 pnpm --filter @manablox/api seed:testing
```

It writes through the service layer, so every row gets the hooks, the audit entry, the
search text and the cache purge an editor's save would. Data comes from faker under a
fixed seed, so `SEED=1234` twice over builds the same instance twice over.

| Variable | Default | What it does |
| --- | --- | --- |
| `SEED_SCALE` | `medium` | `small`, `medium` or `large`: how much of everything |
| `SEED` | `20260909` | the faker seed |
| `SEED_SPACES` | per scale | spaces to build, on top of what the instance has |
| `SEED_SPACE` | unset | fill this existing space, by machine name, instead of creating any |
| `SEED_ARM` | unset | `1` leaves the event and schedule workflows and the outgoing endpoints switched on |
| `SEED_LOCALES` | per scale | comma separated, the first one being each space's default |
| `SEED_API_URL` | the instance's public URL | where to send the registry reload described below |
| `SEED_NO_RELOAD` | unset | `1` skips that reload |

`SEED_BLOCK_TYPES`, `SEED_CONTENT_TYPES`, `SEED_ASSETS`, `SEED_TEMPLATES`, `SEED_ROOTS`,
`SEED_DEPTH`, `SEED_MENUS`, `SEED_CREDENTIALS`, `SEED_WEBHOOKS` and `SEED_WORKFLOWS`
override one number each.

The registry is read once, at boot, and reloaded in process when a type is saved in the
admin. A seed runs in a second process, so an instance that is already up would answer
`contentType.notFound` for every seeded document until it restarts. The run therefore ends
by asking the instance to reload: it issues a temporary superadmin API key, calls
`POST /api/v1/contentTypes/reload`, and revokes the key. It is best effort, and says what
to do by hand when there is no instance, no superadmin or no route to it. The instance
passes the reload on to every other process on the database, the public API among them;
see [The public API](../delivery/public-api.md#content-types-saved-in-the-admin).

Nothing seeded is armed by default. An event or schedule workflow that was on would run
against the next document the seed writes, and an outgoing endpoint would try to deliver
every save to a domain that does not exist, so both are written switched off. Incoming
endpoints stay on: they do nothing until somebody calls them. Assets are generated rather
than downloaded, so a run needs no network. The medium scale writes a few thousand rows
per space and takes about ten minutes; `SEED_SCALE=small` is the quick one.

### Writing one

- A repository test: `createRepositoryContext('name')` from `packages/db/test/helpers/repository.ts` gives a migrated database, a registry with a `page` and a `folder` type, a space, and every SQL statement issued in `ctx.queries`. Assert on those when a change is about cost.
- A service test: `createServiceContext('name', options)` from `@manablox/services/testing` does the same over the whole service layer, with a `queryCount()`.
- A surface test: `stubRuntime()` in `packages/server/test/helpers/runtime.ts`, then `createApp(runtime, { mode: 'public' })` and plain `fetch` against `app.request`.
- A procedure test: `stubContext()` in `packages/api-rpc/test/helpers/rpc.ts`, arrange the mocks through `mocks(ctx)`, call with `invoke()`, and read a failure with `failure()`.
- An admin unit test: Vitest with `happy-dom`; mock the API with `vi.hoisted` and use a fresh Pinia per test (see `apps/admin/test/features/content/draft.test.ts`).

A comment that explains a fixed bug becomes a test name, and the comment goes.

## Testing a plugin in its own repository

A plugin that lives outside the CMS repository, the premium plugins or one of your own,
tests itself against the published packages. The CMS publishes the helpers it uses itself:

| Package | What it gives a test |
| --- | --- |
| `@manablox/config-vitest` | `sharedConfig`, `pluginTestConfig()` (the server tests, without `test/admin`), `pluginAdminTestConfig([vue()])` (only `test/admin/**`, in happy-dom, with imported prop types resolved by the TypeScript 5.9 of `@manablox/admin-plugin`) and `graphqlTestConfig(import.meta.url, via?)` (one graphql build for every importer). Paths resolve from your package |
| `@manablox/core/testing` | `fixedId(n)` and `ids`, stable UUIDs for fixtures |
| `@manablox/db/testing` | `createTestDatabase(prefix, { plugins })`: a migrated database per suite, cloned from a template of the core and your plugins' migrations, on Postgres or, with `TEST_DATABASE_DIALECT=sqlite`, a SQLite file |
| `@manablox/services/testing` | `createServiceContext(name, options)`: the whole service layer over such a database, with one space, the hooks wired as in the host and a `queryCount()` |
| `@manablox/plugin-license/testing` | `generateTestSigningKeys(kid?)`, `testLicensePlugin({ signing, grant?, kind?, ... })` (`kind` defaults to `production`), `signingToEnv(keys)` and `signingFromEnv(env)`, for a premium plugin's tests |
| `@manablox/admin-sdk/testing` | `setupAdminTest({ api?, me?, space? })`, `mockAdminApi(procedures?)`, `resetAdminApi()`, `createTestSession(...)`, `testMe(...)`, `useTestSpace(space?, { contentTypes?, fieldTypes? })`, `exposePluginApi`, `resetPluginSlots` and the types `Me`, `Space`, `ContentTypeSummary`, `FieldTypeMeta`, `MockProcedures` |

The two vitest configs of a plugin repository:

```ts
// vitest.config.ts
import { graphqlTestConfig, pluginTestConfig } from '@manablox/config-vitest';

export default pluginTestConfig(graphqlTestConfig(import.meta.url, '@manablox/api-graphql'));
```

```ts
// vitest.admin.config.ts
import { pluginAdminTestConfig } from '@manablox/config-vitest';
import vue from '@vitejs/plugin-vue';

export default pluginAdminTestConfig([vue()]);
```

**The admin code's types** are checked apart from the rest: `tsc` (TypeScript 7) checks the
server code, and `manablox-vue-check` from `@manablox/admin-plugin` checks the `.vue` files
with the vue-tsc and TypeScript 5.9 it installs, so the repository has no vue-tsc or
TypeScript 5.9 of its own:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "typecheck:vue": "manablox-vue-check --noEmit -p tsconfig.admin.json"
  }
}
```

See [Type-checking the admin code](../extending/admin-plugins.md#type-checking-the-admin-code).

**A premium plugin under test** needs a lease, and `testLicensePlugin` grants one that it
signs itself: it trusts only the key pair you pass, calls no license server and stores the
lease as an activated key of the instance before it reads the leases. No key pair ships
with the package; each repository generates its own:

```ts
import { generateTestSigningKeys, testLicensePlugin } from '@manablox/plugin-license/testing';

const signing = generateTestSigningKeys();
const plugins = [testLicensePlugin({ signing }), myPremiumPlugin()];
// grant: false boots with no lease, so the premium features lock;
// grant: { products: ['ai'], kind: 'development', days: 1 } a narrower one.
// grant: false, kind: 'auto' tests a development instance: unlocked without a key.
```

The instance's own `kind` is `production` by default, so a test that boots on `localhost`
still locks without a grant: the grant alone decides. Pass `kind: 'auto'` (or
`'development'`) to classify the instance by its hostnames as a real one does, and test the
`development` state.

When several processes must trust the same pair (an API and a site process started by an
end-to-end run), put it in the environment with `signingToEnv(keys)`: it sets
`MANABLOX_TEST_LICENSE_SIGNING`, and each process reads it back with
`signingFromEnv(process.env)`. Generate a pair when the variable is unset, so a process
started on its own still works.

**An admin screen under test** starts every test with `setupAdminTest()`, which gives a fresh
Pinia, an empty query cache and reset plugin slots. `mockAdminApi({ plugins: { ai: aiApi } })`
answers the plugin's procedures with plain `vi.fn`s, `createTestSession({ role: 'superadmin' })`
signs someone in (`{ locked: ['plugins.website.design'], message, link }` as the second argument
locks a feature), and `useTestSpace({ id: 's1', locales: ['en'], defaultLocale: 'en' })` sets
the current space.
