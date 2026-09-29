---
title: 'CI and releases'
description: 'What the CI workflow builds and publishes, and how the npm packages are released with trusted publishing.'
---

Every Manablox repository has its own `.github/workflows/ci.yml`, and those that publish
packages or images a manually dispatched `release.yml`. This page describes the CMS
repository's, which publishes the `@manablox/*` packages and the `cms-api` and `cms-admin`
images; the premium plugin, license portal, website and documentation repositories follow
the same pattern for their own packages and images. Their CI installs `@manablox/*` from
npmjs, so a change they need in a CMS package is released there first.

## Continuous integration

`.github/workflows/ci.yml` of manablox-cms runs on every push to `main`, every `v*` tag and
every pull request:

| Job | What it runs |
| --- | --- |
| `lint - typecheck - generated files` | lint, the dead code check (`pnpm knip`), the license check, the admin conventions, the plugin boundary, the docs wording check, typecheck, the admin SDK surface (`pnpm sdk:api:check`) and the migration drift check. No services. |
| `test - postgres`, `test - sqlite` | the test suites on each database dialect. The Postgres leg migrates first; the SQLite leg starts no Postgres. Both run Valkey. |
| `build` | the workspace build, the admin bundle budget, the check that every package entry point exists (`pnpm exports:check`) and the check that what a package's build imports is in its dependencies (`pnpm deps:check`). |
| `end-to-end - admin` | the browser tests against the API and the admin booted on the runner. |
| `audit` | `pnpm audit --audit-level high` over the lockfile. |
| `image - api`, `image - admin` | the production images whose inputs changed, after the check, test and build jobs pass. |

The migration drift check runs `pnpm db:generate` for both dialects and fails when that
writes anything into a migrations folder: a schema change was committed without its
migration. It needs no database.

Every job installs through `.github/actions/setup` (pnpm, Node, the frozen install and a
turbo cache per job), and the test legs start their containers through
`.github/actions/services`.

The image jobs build what a commit can invalidate: a change under `packages/`, to the
lockfile, the workspace files or the workflow rebuilds both, a change under `apps/api`,
`apps/public-api` or `docker/Dockerfile.api` the API image, a change under `apps/admin`,
`docker/Dockerfile.admin` or `docker/nginx.admin.conf` the admin image. A tag rebuilds both
regardless of the diff.

- Pull requests build the images they touch without pushing them, so a broken Dockerfile fails before the merge.
- Pushes to `main` push `ghcr.io/manablox/cms-api` and `cms-admin` as `latest`, `main` and `sha-<commit>`.
- Tags `v*` push the semver tags as well.

## Publishing the images

`release.yml` builds `cms-api` and `cms-admin` at the version in `package.json` and pushes
them as `0.50.0`, `0.50` and, when the npm dist-tag is `latest`, `latest`, so a prerelease
never becomes what `docker pull` gets. Its `images` input (on by default) turns this part
off; a dry run builds the images and pushes nothing.

## Publishing the packages

Releases go out from CI with **trusted publishing**, GitHub mints a short-lived OIDC
token, npm verifies it against the trusted publisher configured for each package, and no
credential is stored anywhere. `.github/workflows/release.yml` is that workflow; it is
`workflow_dispatch` only, because a version number can never be reused and a release
should be something someone asked for.
It publishes every package of the CMS repository that is not private,
`@manablox/license` and `@manablox/plugin-license` among them.

Run it from the Actions tab: pick a dist-tag, leave **dry run** ticked to see what would
go out, untick it to publish.

Trusted publishing is only available from GitHub Actions, GitLab CI and CircleCI on their
hosted runners, and needs npm 11.5.1+ on Node 22.14+. It cannot authenticate a laptop, so
there is nothing to configure on your machine and no reason to `npm login` for it.

### Setting it up, once per package

A trusted publisher is configured **on a package**, which means the package has to exist
first ([npm/cli#8544](https://github.com/npm/cli/issues/8544)). So each package name is
bootstrapped once with a token, and every release after that is tokenless:

1. Create a granular access token on npmjs.com with write access to `@manablox/*`.
2. Publish the first version from your machine:

   ```sh
   NPM_TOKEN=npm_... pnpm publish:npm --yes
   ```

3. On npmjs.com, for each package: **Settings > Trusted Publisher > GitHub Actions**, with the repository that publishes it and the workflow filename `release.yml`.
4. Delete the token. From here on, releases run through the workflow.

### New packages

A package name that is new in a release has no trusted publisher yet, so it goes through
the bootstrap above before the workflow can publish it.

### The local script

`scripts/publish.sh` of the CMS repository is what both paths share, so a dry run on a laptop and a release in CI
cannot drift:

```sh
pnpm publish:npm                          # dry run: check, build, list what would go out
pnpm publish:npm --version minor          # bump every package, still a dry run
pnpm publish:npm --version minor --yes    # bump and publish with a token (the bootstrap)
```

It is a **dry run unless you pass `--yes`**.

| Option | |
| --- | --- |
| `--yes` | Publish for real, with a token |
| `--version <bump>` | `patch`, `minor`, `major`, or a literal version, applied to every publishable package |
| `--tag <name>` | npm dist-tag (default `latest`). Use it for prereleases |
| `--otp <code>` | One-time password, if your account has 2FA on publishes |
| `--pack-only <dir>` | Build the tarballs and stop; this is what the workflow runs |
| `--skip-checks` | Skip typecheck, lint and tests |
| `--no-git-checks` | Allow a dirty tree or a branch other than `main` |
| `--host` | Run pnpm on the host instead of in the dev container |

Before anything is packed it runs the CMS workspace typecheck, lint and tests, then the build:
the SDK's `dist` is the only artefact any package ships, and it comes from that build.

It runs inside the api container of the dev stack, so a token comes from
**`NPM_TOKEN`** in the environment rather than a `~/.npmrc` the container cannot see.
`NODE_AUTH_TOKEN` is accepted as an alias. npm never reads either variable on its own:
it only ever reads an `.npmrc`. So the script writes a throwaway one containing the
*name* `${NPM_TOKEN}`, which npm expands as it reads it; the token itself never touches
disk, and the file is removed when the script exits. `--host` with no token set uses your
own `npm login` instead. After a real publish it asks whether to record the release in
git: it commits the bumped `package.json` files as `chore(release): v<version>` (and
nothing else, even on a dirty tree), tags the commit `v<version>` and pushes the branch
and the tag. Answer no, or run it without a terminal, and it prints those commands
instead.

### Why the workflow packs and then publishes

`pnpm publish` does not currently work with an OIDC credential
([pnpm/pnpm#11513](https://github.com/pnpm/pnpm/issues/11513)), and `npm publish` does not
understand pnpm's `workspace:` and `catalog:` specifiers. So each package is packed with
`pnpm pack`, which rewrites those specifiers into real ranges, and the resulting tarball is
handed to `npm publish`, the half that understands the credential. Versions already on the
registry are skipped, so a re-run after a partial failure picks up where it stopped.

### What a tarball contains

Inside the CMS workspace every package exports its TypeScript source, so nothing
has to be rebuilt between an edit and a test. A tarball is different: `pnpm build` runs
each package's `tsdown` build (`@manablox/config-typescript/tsdown` holds the shared
settings, for the plugin repositories too), and `publishConfig` in every `package.json` swaps `exports`, `main` and
`types` to `dist/` when pnpm packs. What reaches npm is minified ESM JavaScript (compressed,
comments removed, local names shortened), readable `.d.ts` declarations and the few files a package needs at runtime (the database migrations, the
CLI's `bin`, the Nuxt module's runtime directory, which Nuxt compiles itself). No `src/`,
no source maps. A consumer therefore needs neither a bundler nor a loader for these
packages; plain `node` imports them. The script prints `dist` or `src` per package on
every run, and `src` would mean a package has lost its `publishConfig`.

Each package's `README.md` is what npmjs.com shows, so it is written for someone new to
Manablox: what the package is for, how to use it, and its main functions and options. Notes for people
working on a package itself go into a `DEVELOPMENT.md` beside it, which is not published.
