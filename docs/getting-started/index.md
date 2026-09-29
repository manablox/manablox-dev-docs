---
title: 'Getting started'
description: 'From nothing to a published page you can read from the API, in three short steps.'
---

Three pages take you from an empty machine to a published page that a frontend can read:

1. [Create a project](./create-a-project.md): write a Manablox project with one command, start it and find the admin.
2. [Your first space](./first-space.md): create an account, a space, a content type and a document, and publish it.
3. [Read it from a frontend](./first-request.md): fetch that document over REST, GraphQL and the SDK.

After that, [A Vite + Vue SSR frontend](../guides/vite-vue-ssr.md) builds a complete
website on top of the space, step by step.

## What you need

- **Node 24** and **pnpm**. The CMS runs on your machine from the published npm packages.
- **Docker** with the compose plugin, for Postgres, Valkey and Mailpit. With `--database sqlite` the database is a file and only Valkey runs in Docker.

## What you get

| Service | Address |
| --- | --- |
| Admin and management API | <http://localhost:3000> |
| Public delivery API | <http://localhost:3100> |
| Mail (Mailpit) | <http://localhost:8025> |

If a word here is new (space, content type, permalink), [Concepts](../concepts.md)
defines it. To work on Manablox itself, see [Contributing](../reference/contributing.md).
