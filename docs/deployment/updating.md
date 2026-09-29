---
title: 'Updating'
description: 'Move an instance to a newer Manablox release: back up, update the packages together, migrate, restart.'
---

Every published `@manablox/*` package shares one version and is released together: the
CMS packages from the CMS repository and the premium plugins from theirs, at the same
version. What changed in each release is in the
[CHANGELOG](https://github.com/manablox/manablox-cms/blob/main/CHANGELOG.md) of the CMS
repository, and the premium plugins' in their own; read it before an update, since a `0.x` release may ask
for a step of its own.

## Steps

1. **Back up** the database and the uploads (see [Operations](./operations.md)). Migrations
   only go forward; the backup is the way back.
2. **Update the packages together.** Raise every `@manablox/*` dependency, plugins
   included, to the new version and install, for example
   `pnpm update "@manablox/*" --latest`. Never update one package alone.
3. **Let queued jobs finish** when the release notes say a job changed, then stop the CMS
   processes.
4. **Migrate.** `manablox migrate` (`pnpm migrate` in a created project) applies the core's
   migrations and those of every plugin the config loads. In the Docker setup the `migrate`
   service runs them before `api`, `public-api` and `site` start, so a failed migration
   stops the update before a request sees it (see [Deployment](./index.md)).
5. **Start** the processes again and check the admin and one delivery request.

## Plugins

`manablox plugin list` shows the plugins of the instance and whether each is enabled.
`manablox plugin install <id>` adds one at the instance's version, `uninstall` removes its
code and config but keeps its data, and `enable` / `disable` switch it without touching
the dependency (see [Adding and removing features later](../getting-started/as-a-dependency.md#adding-and-removing-features-later)). A plugin's migrations run with the
core's in step 4.

## Frontends

A frontend on `@manablox/public-sdk`, `@manablox/live-preview` or `@manablox/nuxt` updates
those packages to the same version and is deployed again; the live preview only connects
when the admin and the frontend speak the same protocol version.
