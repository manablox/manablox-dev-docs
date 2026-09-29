# Contributing

## Licensing

Everything in this repository is [MIT licensed](./LICENSE). Contributions are accepted
under the [Contributor Licence Agreement](./CLA.md): a contribution is licensed under MIT,
and the maintainer may relicense it. You keep the copyright in what you wrote.

Accepting it is one flag: sign off every commit with `git commit -s`, which appends

```
Signed-off-by: Your Name <your.email@example.com>
```

A pull request whose commits are signed off is your acceptance for those commits. If your
employer holds the rights to your work, say so in the pull request before the first merge.

## Setup

The site installs `@manablox/*` (the theme, the CLI and the packages the reference pages
are generated from) from the local registry of the CMS repository's development stack.
Bring that up first, then this repository's stack:

```sh
# in manablox-cms
pnpm dev:services && pnpm dev:publish

# here
pnpm dev:up        # the docs site at http://localhost:3004; saving a page reloads it
pnpm dev:logs      # follow it
pnpm dev:down      # stop it; pnpm dev:reset also deletes the build output and caches
```

`README.md`, "Development", has the registry setup and every command. Node 24
(`.node-version`) and pnpm (pinned by `packageManager`) to run the checks on the host. VS
Code users get the recommended extensions prompt; Biome formats the scripts on save.

Before CI can pass after a CMS release to npmjs, the lockfile has to be resolved against
npmjs: run `pnpm lock:refresh` without the local `.npmrc` (or `pnpm lock:refresh --npmjs`)
and commit `pnpm-lock.yaml` (README.md, "The lockfile").

## Where a change goes

- **A page**: a markdown file in the folder of its sidebar section under `docs/`, with
  `title` and `description` frontmatter, and its entry in the `sidebar` of
  `astro.config.mjs`. Link other pages by their file (`../delivery/sdk.md`); the build
  fails on a link that leaves `docs/`, so links into the code are absolute GitHub URLs.
- **A generated page** (`reference/errors.md`, `reference/http-api.md`,
  `extending/hooks.md`): change the code in the CMS repository, update the `@manablox/*`
  packages here and run `pnpm docs:generate`. Editing the page by hand fails `pnpm docs:check`.
- **A diagram**: edit the `.mmd` source in `public/`, run `pnpm diagrams`, commit both files.
- **A change to the theme** (fonts, palette, logo, the link rewriting): it lives in
  `@manablox/docs-theme` in the CMS repository, which the user guide shares.

A page describes the product as it is at the version this repository installs. The CMS
repository's changes that need a page land here in their own pull request.

## Style

- Plain words, short sentences, the reader's task first. Tables for options, variables and
  commands; code blocks that run as they are.
- Describe what is, not what changed: no upgrade history and no wording that compares
  with an earlier state. `pnpm docs:words` catches the usual phrasings, names removed
  from the packages, and paths no Manablox repository has.
- Examples are self-contained: a page shows the code it explains rather than pointing into
  another repository's sources.
- Name a package (`@manablox/fields`) rather than a path inside the CMS repository. When a
  path helps, link it on GitHub.

## Checks

```sh
pnpm check          # lint, dead code, wording, typecheck, generated pages, build, links - what CI runs
pnpm docs:words     # the wording check alone
pnpm docs:check     # the generated pages match the installed packages
pnpm build && pnpm links   # the site, and every internal link in it
```

Links into the user guide (`https://docs.manablox.io/...`) point at another repository, so
`pnpm check` leaves them out. After changing one, build manablox-user-docs next to this
repository and run

```sh
pnpm build && USER_DOCS_DIST=../manablox-user-docs/dist pnpm links:cross
```

which fails on a page or `#fragment` that the user guide does not have.
`USER_DOCS_URL=https://docs.manablox.io` checks the deployed pages instead.

Commit messages: `type(scope): what` - `docs`, `fix`, `feat`, `chore`. The body says why.

## The Manablox repositories

These pages are one of several repositories. They share one set of conventions:

- Every package and app has the same version; a release bumps them together.
- Dependencies between the repositories go through npm package names (`@manablox/*`) only:
  npmjs in CI and production, the CMS stack's local registry in development. No
  repository reaches into another's folders.
- pnpm workspace, Node 24, Biome, TypeScript through `@manablox/config-typescript`.
- Each repository has a `README.md`, `LICENSE`, `CHANGELOG.md`, `.editorconfig`,
  `.gitignore` and `.env.example` files; the public ones also `CONTRIBUTING.md` and
  `CLA.md`.
- A development docker setup in `docker/compose.dev.yml`, driven by `scripts/dev.sh` as
  `pnpm dev:up`, `dev:down`, `dev:logs` and `dev:reset`, on ports of its own so every
  repository's stack runs side by side:

  | Repository | Ports |
  | --- | --- |
  | manablox-cms | api 3000, public api 3001, admin 3002, postgres 5432, valkey 6379, minio 9000/9001, mailpit 1025/8025, verdaccio 4873 |
  | manablox-plugin-website | site 3003, instance api 3100, admin 3102, postgres 5442 |
  | manablox-plugin-ai | instance api 3200, admin 3202, postgres 5452 |
  | manablox-license-portal | license server 3110, portal 5174, postgres 5462, mailpit 8026 |
  | manablox-website | 3005 |
  | manablox-dev-docs | 3004 |
  | manablox-user-docs | 3008 |

- `scripts/docker-build.sh [--tag <tag>] [--prefix <name>] [--push]` builds the production
  image(s) from `docker/`, as `pnpm docker:build`.
- `.github/workflows/ci.yml` runs the checks, the build and the image build; a repository
  that publishes has a manually dispatched `release.yml`.
