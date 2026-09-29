---
title: 'Plugin jobs'
description: 'Run background and scheduled work from a plugin on the job queue.'
---

A [plugin](./plugins.md) can run work in the background under `jobs`, and on a schedule under
`maintenance`. Both use the instance's job queue: Redis with a worker in the management
process when the cache has a Redis URL, inline in the calling process without one.

```ts
import { defineJob, definePlugin, type PluginContext } from '@manablox/core';
import { z } from 'zod';

definePlugin({
  name: 'notes',
  jobs: {
    // Queued as `notes:reindex`; the schema types the payload and refuses a malformed one.
    reindex: defineJob(
      z.object({ spaceId: z.string() }),
      async ({ spaceId }, plugin: PluginContext<NotesServices>) => {
        await plugin.services.search.reindex(spaceId);
      },
    ),
  },
  maintenance: [
    // Every hour on the management worker, as `notes:purge`.
    { name: 'purge', every: 60 * 60_000, run: (plugin) => plugin.services.trash.purge() },
  ],
});
```

## Names

A job runs as `<pluginId>:<name>`. A name is letters, digits, `_`, `-` and dots; a name used
twice in `jobs` and `maintenance` is refused at start, and so is one that a core job already
takes. Schedules of a plugin that is no longer loaded are dropped from Redis on the next
start.

## Queueing

The plugin's context enqueues its own jobs by their short name:

```ts
await plugin.jobs.enqueue('reindex', { spaceId });
```

The payload is a JSON object. `defineJob(schema, handler)` checks it with any Standard Schema
(zod, valibot, ...) before the handler runs; a payload the schema refuses fails the job with
`validation.failed`. Retries follow the queue defaults (five attempts with a
backoff) unless the third argument sets BullMQ job options.

`plugin.jobs.inline` says whether jobs run in the calling process as they are queued,
without Redis; `enqueue` then resolves once the job ran. A plugin whose work should not hold
up the caller then runs it in the background itself, as the workflows plugin does with its
runs.

## The plugin's flag

A job whose payload has a `spaceId` is skipped, with a debug log line, while the plugin is off
for that space. A job without one, and every maintenance task, is skipped while the plugin is
off for the instance.

A maintenance task runs every `every` milliseconds, at least a second apart, on the
management worker; public and site processes schedule nothing.
