---
title: 'Manablox'
description: 'A configurable, headless CMS: content types defined in code or at runtime, one registry behind both.'
---

Manablox is a **headless CMS**: it stores structured content and serves it over an API,
and *you* build the website or app that shows it. Editors work in the admin; developers
model the content, configure the instance and write the frontend.

Content types can be defined in a config file or built in the admin at runtime: both
feed the same registry, the same storage layer and the same generated API.

## Where to start

New to Manablox? Read these in order:

1. [Concepts](./concepts.md): the words the rest of the documentation uses.
2. [Getting started](./getting-started/index.md): create a project with one command, create the first space and the first page, and read it back from the API.
3. [How content is organised](./content-model/index.md): spaces, content types, blocks, fields, locales and publishing.
4. [Delivering content](./delivery/index.md): GraphQL, REST and the SDK, and which one to pick.
5. [Scaffold a frontend](./guides/scaffold-a-frontend.md): one command writes a working frontend for a space, in one of four shapes. [A Vite + Vue SSR frontend](./guides/vite-vue-ssr.md) builds the same thing by hand, step by step.

## By task

| I want to... | Read |
| --- | --- |
| Run it on my machine | [Create a project](./getting-started/create-a-project.md) |
| Add it to a project of my own | [Use it as a dependency](./getting-started/as-a-dependency.md) |
| Configure an instance | [The config file](./configuration/index.md), [Environment variables](./configuration/environment.md) |
| Model content | [The content model](./content-model/index.md), [Field types](./content-model/field-types.md), [Content types in code](./configuration/content-types-in-code.md) |
| Use the admin | [A tour](./admin/index.md), then the page for each area |
| Build a frontend | [Scaffold a frontend](./guides/scaffold-a-frontend.md), [Delivering content](./delivery/index.md), [The SDK](./delivery/sdk.md) |
| Show editors a live preview | [Preview and the visual editor](./delivery/preview.md) |
| Add a field type or a plugin | [Extending](./extending/custom-field-types.md) |
| Put it in production | [Deployment](./deployment/index.md), [Operations](./deployment/operations.md) |
| Understand the internals | [Architecture](./reference/architecture.md), [Data model](./reference/data-model.md) |
| Know what you may do with it | [Licensing](./reference/licensing.md) |

## For contributors

[Contributing](./reference/contributing.md) describes the Manablox repositories and how to
work on them. Then [Architecture](./reference/architecture.md),
[Data model](./reference/data-model.md), [Testing](./reference/testing.md), the generated
references ([hooks](./extending/hooks.md), [error keys](./reference/errors.md),
[HTTP API](./reference/http-api.md)) and [Licensing](./reference/licensing.md). The CMS
takes contributions under its
[`CONTRIBUTING.md`](https://github.com/manablox/manablox-cms/blob/main/CONTRIBUTING.md) and
[`CLA.md`](https://github.com/manablox/manablox-cms/blob/main/CLA.md).

## About these pages

These pages are the markdown files under `docs/` in the
[manablox-dev-docs](https://github.com/manablox/manablox-dev-docs) repository, rendered with
Astro Starlight. Corrections are welcome; its
[`CONTRIBUTING.md`](https://github.com/manablox/manablox-dev-docs/blob/main/CONTRIBUTING.md)
says how. Three pages are generated from the code by `pnpm docs:generate`, which runs
`manablox docs generate` against every plugin Manablox ships; they say so at the top.
