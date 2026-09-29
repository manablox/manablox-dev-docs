<p align="center"><img src="./docs/assets/logo.svg" alt="Manablox" width="96"></p>

# Manablox developer documentation

The source of <https://dev.manablox.io>: the developer documentation of
[Manablox](https://github.com/manablox/manablox-cms), a configurable, headless CMS. The
pages are the markdown files in [`docs/`](./docs/README.md), rendered with
[Astro Starlight](https://starlight.astro.build) and the shared theme
`@manablox/docs-theme`. The user guide for editors lives in its own repository and is
served at <https://docs.manablox.io>.

## Layout

| Path | What lives there |
| --- | --- |
| `docs/` | The pages, one folder per sidebar section; a folder's `index.md` is the section's page |
| `astro.config.mjs` | Title, sidebar and content root; everything else comes from `@manablox/docs-theme` |
| `src/content.config.ts` | Reads `docs/` as the Starlight collection (`docs/README.md` is the home page) |
| `public/` | Files served as they are: the favicon and the prerendered diagrams with their mermaid sources |
| `manablox.config.ts` | The instance the generated reference pages document: every plugin Manablox ships |
| `scripts/` | The generator, the checks, the diagram renderer, the dev and image scripts |
| `docker/` | The development stack and the production image (nginx) |

A page is a markdown file with `title` and `description` frontmatter and an entry in the
`sidebar` of `astro.config.mjs`. Pages link to each other by file (`./create-a-project.md`,
`../delivery/sdk.md`), which works on GitHub too; the theme turns those links into the
site's routes. A relative link that leaves `docs/` fails the build, so links into other
repositories are absolute URLs.

### Generated pages

Three pages are derived from the code of the CMS packages this repository installs and say
so at the top: `docs/reference/errors.md`, `docs/reference/http-api.md` and
`docs/extending/hooks.md`. `pnpm docs:generate` writes them with the CMS CLI,
`manablox docs generate --out docs --config manablox.config.ts`, which loads the config
without booting an instance. `pnpm docs:check` generates them into a temporary folder and
fails when a page in `docs/` differs; CI runs it, so the pages follow each `@manablox/*`
release this repository updates to.

`manablox.config.ts` lists the CMS plugins (fields, license, workflows, webhooks) and the
premium plugins (`@manablox/plugin-ai`, `@manablox/plugin-website`), all of them dev
dependencies of this repository, so the pages cover every plugin Manablox ships.

### Diagrams

Diagrams are prerendered SVG files in `public/` with their mermaid source beside them
(`public/reference/architecture.mmd`). A page shows one by its path from the site root,
`![...](/reference/architecture.svg)`; the base path is added at build time. After editing
a `.mmd` file run `pnpm diagrams`, which renders every `public/**/*.mmd` with the
`minlag/mermaid-cli` Docker image and the look in `scripts/mermaid.config.json`, and commit
both files. The site ships no mermaid code.

## Development

Node 24 and pnpm (pinned by `packageManager`), plus Docker for the development stack.

`@manablox/*` comes from npmjs in CI and in the image. In development it comes from the
Verdaccio registry of the CMS repository's development stack, so a change to the theme or
the CMS shows up here before it is released:

```sh
# in manablox-cms
pnpm dev:services        # the registry at http://localhost:4873, on the docker network manablox-registry
pnpm dev:publish         # every @manablox/* package at 0.50.0
```

This repository's `.npmrc` (gitignored; `scripts/dev.sh` writes it when it is missing)
points the scope there:

```ini
@manablox:registry=http://localhost:4873/
```

After `pnpm dev:publish` replaces a version, pick up the new build with
`pnpm cache delete '@manablox/*' && pnpm update '@manablox/*'`. `pnpm-workspace.yaml`
excludes `@manablox/*` from `minimumReleaseAge`, which would otherwise hold back packages
published minutes ago.

### The lockfile

CI installs `@manablox/*` from npmjs with `--frozen-lockfile`, so the committed
`pnpm-lock.yaml` has to hold npmjs's checksums. A version published to the local registry
carries other checksums than the same version released to npmjs, and a lockfile resolved
against it does not pass CI.

`pnpm lock:refresh` (`scripts/lock-refresh.sh`) deletes pnpm's cache entries of the scope
and re-resolves only `@manablox/*` in the lockfile, against the registry pnpm is configured
with. No other package moves, `package.json` keeps its ranges and `node_modules` stays as it
is (`pnpm install` afterwards installs what it resolved). `pnpm lock:refresh --npmjs`
resolves against npmjs whatever an `.npmrc` says.

After the CMS release to npmjs, run `pnpm lock:refresh` without the local `.npmrc` (or with
`--npmjs`) and commit the lockfile before CI can pass.

### The development stack

`docker/compose.dev.yml` (project `manablox-dev-docs-dev`), driven by `scripts/dev.sh`.
It installs the dependencies in a container, from `verdaccio:4873` on the
`manablox-registry` network, and runs Astro's dev server on port 3004, the port this
repository keeps so every Manablox repository's stack runs side by side. The repository is
bind-mounted: saving a page reloads it in the browser.

| Command | What it does |
| --- | --- |
| `pnpm dev:up` | Install and start the docs site at <http://localhost:3004>; returns once it answers |
| `pnpm dev:logs` | Follow the logs |
| `pnpm dev:down` | Stop the stack |
| `pnpm dev:reset` | Stop the stack, remove its containers, and delete `dist/`, `.astro/` and Astro's cache |

On the host, without Docker for the site: `pnpm install` and `pnpm dev`.

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Astro's dev server at <http://localhost:3004> |
| `pnpm build` | The static site in `dist/` |
| `pnpm preview` | Serve `dist/` at <http://localhost:3004> |
| `pnpm check` | Everything CI runs: lint, dead code, wording, typecheck, generated pages, build, links |
| `pnpm lint` / `pnpm format` | Biome, for the scripts and configs |
| `pnpm knip` | Unused files, exports and dependencies |
| `pnpm docs:words` | The pages describe what is, not what changed, and name no path that exists in no Manablox repository |
| `pnpm typecheck` | `astro check` and `tsc` |
| `pnpm docs:generate` | Rewrite the generated reference pages |
| `pnpm docs:check` | Fail when a generated page is stale |
| `pnpm links` | Every internal link of the built site in `dist/` resolves |
| `pnpm links:cross` | Every link into the user guide resolves, against its build in `USER_DOCS_DIST` (or `USER_DOCS_URL`); see CONTRIBUTING |
| `pnpm diagrams` | Render the mermaid sources in `public/` to SVG |
| `pnpm docker:build` | Build the production image |
| `pnpm lock:refresh` | Re-resolve only `@manablox/*` in the lockfile (`--npmjs`: against npmjs), see above |

`DOCS_SITE_URL` (default `https://dev.manablox.io`) and `DOCS_BASE_PATH` (default `/`) set
the origin and base path of the build, for canonical links and the sitemap.

## Docker image

`pnpm docker:build` builds `ghcr.io/manablox/dev-docs:<version>` from `docker/Dockerfile`:
the site built with its runtime dependencies only, served by nginx on port 80. With the
local registry in `.npmrc` the build installs `@manablox/*` from it over the host network.

```sh
pnpm docker:build                                   # ghcr.io/manablox/dev-docs:0.50.0
pnpm docker:build --tag test --prefix my.registry/me --push
DOCS_SITE_URL=https://docs.example.com DOCS_BASE_PATH=/dev/ pnpm docker:build
docker run --rm -p 3004:80 ghcr.io/manablox/dev-docs:0.50.0
```

CI (`.github/workflows/ci.yml`) runs the checks, builds the site, checks its links, and
builds and smoke-tests the image on every change. `.github/workflows/release.yml`, run by
hand, runs the checks again and pushes the image to ghcr.io with its version tags.

## Licence

The pages and the site are [MIT licensed](./LICENSE). The Manablox name and logo are not
covered by the licence; see the CMS repository's
[`TRADEMARKS.md`](https://github.com/manablox/manablox-cms/blob/main/TRADEMARKS.md).
Contributions are welcome under the [CLA](./CLA.md); [CONTRIBUTING.md](./CONTRIBUTING.md)
explains how. Release notes are in [CHANGELOG.md](./CHANGELOG.md).
