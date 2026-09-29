---
title: 'Contributing'
description: 'The Manablox repositories, how they depend on each other, their development stacks and the local registry, and how to contribute.'
---

Manablox is developed in several repositories on GitHub under
[github.com/manablox](https://github.com/manablox). Each one has its own README with the
quick start, its own checks and its own release.

## The repositories

| Repository | What it holds | Licence |
| --- | --- | --- |
| [manablox-cms](https://github.com/manablox/manablox-cms) | The CMS: every `@manablox/*` package of the core (server, APIs, services, database, CLI, SDKs, admin plugin kit and more), the admin, the free plugins (workflows, webhooks, license), the `api` and `public-api` apps it runs in development, and the `cms-api` and `cms-admin` images | MIT |
| manablox-plugin-ai | The premium AI plugin, `@manablox/plugin-ai` | Commercial |
| manablox-plugin-website | The premium website plugin, `@manablox/plugin-website`, with `@manablox/site`, `@manablox/site-renderer` and the site process image `site` | Commercial |
| manablox-license-portal | The license server and the customer portal, `license-server` and `license-portal` images | Proprietary |
| manablox-website | The marketing website, `website` image | Proprietary |
| [manablox-dev-docs](https://github.com/manablox/manablox-dev-docs) | These pages, `dev-docs` image (dev.manablox.io) | MIT |
| [manablox-user-docs](https://github.com/manablox/manablox-user-docs) | The user guide, `user-docs` image (docs.manablox.io) | MIT |

The repositories depend on each other through npm package names only: a plugin repository
depends on `"@manablox/core": "^0.50.0"`, never on a folder of another checkout. In CI and
production those packages come from npmjs; in development they come from a local registry
in the CMS stack (below), so a change to a CMS package can be tried in another repository
before it is released.

They share one set of conventions: every package and app has the same version, a pnpm
workspace on Node 24, Biome, TypeScript through `@manablox/config-typescript` and Vitest
through `@manablox/config-vitest`; a development stack in `docker/compose.dev.yml` driven by
`scripts/dev.sh` as `pnpm dev:up`, `dev:down`, `dev:logs` and `dev:reset` (which deletes the
volumes); `pnpm docker:build` for the production images (`ghcr.io/manablox/<image>`);
`.github/workflows/ci.yml` and, where the repository publishes, a manually dispatched
`release.yml` (see [CI and releases](../deployment/releases.md)).

## Ports

Each development stack has ports of its own, so all of them run side by side:

| Repository | Ports |
| --- | --- |
| manablox-cms | api 3000, public api 3001, admin 3002, postgres 5432, valkey 6379, minio 9000/9001, mailpit 1025/8025, verdaccio 4873 |
| manablox-plugin-website | site 3003, instance api 3100, admin 3102, postgres 5442 |
| manablox-plugin-ai | instance api 3200, admin 3202, postgres 5452 |
| manablox-license-portal | license server 3110, portal 5174, postgres 5462, mailpit 8026 |
| manablox-website | 3005 |
| manablox-dev-docs | 3004 |
| manablox-user-docs | 3008 |

## The CMS development stack

Docker is the only prerequisite; Node 24 and pnpm (pinned by `packageManager`) run in the
containers. In a checkout of manablox-cms:

| Command | What it does |
| --- | --- |
| `pnpm dev:up` | Build and start everything, the apps included; `pnpm install` and the migrations run in the stack |
| `pnpm dev:services` | Only postgres, valkey, minio, mailpit and verdaccio, to run the apps on the host with `pnpm dev` |
| `pnpm dev:logs [service]` | Follow the logs |
| `pnpm dev:down` | Stop, keep the data |
| `pnpm dev:reset` | Stop and delete every volume: database, object store, cache and the registry's packages |
| `pnpm dev:publish` | Build every package and publish it to the local registry |

The admin is then at <http://localhost:3002>, the management API at
<http://localhost:3000> and the public API at <http://localhost:3001>, which starts once the
instance has a space. `pnpm check` runs what CI runs first: lint, dead code, licences,
conventions, typecheck and the tests on both databases.

## The local registry

The CMS stack runs a Verdaccio registry on port 4873. `pnpm dev:publish` builds every CMS
package and publishes it there; the other repositories install `@manablox/*` from it:

```sh
pnpm dev:services        # in manablox-cms, or pnpm dev:up
pnpm dev:publish         # every package at 0.50.0, tag latest; run it again after a change
pnpm dev:publish --dev   # or as 0.50.0-dev.<timestamp> under the dev tag
npm view @manablox/core --registry http://localhost:4873
```

A consuming repository commits the npmjs setting and keeps the local one out of git. On
the host, its development `.npmrc` (gitignored, or `~/.npmrc`) is one line:

```ini
@manablox:registry=http://localhost:4873/
```

Inside a container of that repository's own development stack, `localhost` is the
container. The registry also sits on the docker network `manablox-registry` as
`verdaccio`; the CMS stack creates the network, and the consumer's containers join it:

```ini
@manablox:registry=http://verdaccio:4873/
```

When the repository is bind-mounted into the container, the host's `.npmrc` comes along,
and in pnpm 11 it wins over the user config and the environment. So the container names
the registry on the command line, which wins over every file:

```sh
pnpm install --frozen-lockfile --config.@manablox:registry=http://verdaccio:4873/
```

as the development stack of these pages does. The same flag goes on every other pnpm
command in the container that resolves packages (`pnpm add`, `pnpm update`, `pnpm dlx`).

```yaml
# its docker/compose.dev.yml, on every service that runs pnpm install
services:
  install:
    networks: [default, manablox-registry]

networks:
  manablox-registry:
    external: true
```

The network exists while the CMS stack is up (`pnpm dev:services` is enough), so bring that
up first. pnpm's `minimumReleaseAge` holds back packages published minutes ago, which every
local package is, so a consumer's `pnpm-workspace.yaml` excludes the scope:

```yaml
minimumReleaseAgeExclude:
  - '@manablox/*'
```

After `pnpm dev:publish` replaces `0.50.0`, the tarball has a new checksum under the same
version, and pnpm keeps what its cache and lockfile hold. A consumer picks up the new build
with

```sh
pnpm cache delete '@manablox/*' && pnpm update '@manablox/*'
```

With `--dev` every publish is a new version under the `dev` tag, so nothing is cached:
`pnpm add @manablox/core@dev` takes the newest.

## Where a change goes

A change to the core, the admin, the SDKs or the free plugins goes to manablox-cms; its
[`CONTRIBUTING.md`](https://github.com/manablox/manablox-cms/blob/main/CONTRIBUTING.md) has
the map of its packages, the recipes (a field type, a procedure, a migration, a hook, an
error key, an environment variable) and the conventions. Read the
[architecture](./architecture.md) before a change that crosses a package boundary. A change
to a premium plugin goes to that plugin's repository, and a change that needs a new CMS
package version is published to the local registry first and released from the CMS before
the plugin's CI can install it.

A change that needs a documentation page comes here, or to the user guide for what editors
read.

## Working on these pages

The pages are the markdown files in `docs/` of manablox-dev-docs, one folder per section;
the site is Astro Starlight. A new page needs `title` and `description` frontmatter and an
entry in the sidebar in `astro.config.mjs`. Link other pages by their relative `.md` path
(`../delivery/sdk.md`); a link out of `docs/` fails the build, so name a file of another
repository by its GitHub URL.

| Command | What it does |
| --- | --- |
| `pnpm dev:up` | The site in a container at <http://localhost:3004>, reloading on every edit |
| `pnpm dev:reset` | Stop it and delete its volumes |
| `pnpm docs:generate` | Rewrite the generated pages (error keys, HTTP API, hooks) with `manablox docs generate` from the installed packages |
| `pnpm docs:check` | Fail when a generated page is stale |
| `pnpm docs:words` | Keep change history and paths no repository has out of the pages |
| `pnpm check` | Lint, dead code, wording, typecheck, the generated pages, the build and the link check |
| `pnpm docker:build` | The `ghcr.io/manablox/dev-docs` image |

The generated pages say so at the top; edit the code they come from in the CMS instead.
After a CMS release, update the `@manablox/*` dependencies and run `pnpm docs:generate`.

## Licence and the CLA

Contributions are accepted under the
[Contributor Licence Agreement](https://github.com/manablox/manablox-cms/blob/main/CLA.md),
the same in every public Manablox repository. You keep the copyright in what you wrote; a
contribution to an MIT repository is licensed under MIT, and the maintainer may relicense
it. Accepting it is one flag: sign off every commit with `git commit -s`, which appends

```
Signed-off-by: Your Name <your.email@example.com>
```

A pull request whose commits are signed off is your acceptance for those commits. If your
employer holds the rights to your work, say so in the pull request before the first merge.
See [Licensing](./licensing.md) for what the licences allow.
