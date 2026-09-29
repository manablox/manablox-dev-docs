---
title: 'Logging'
description: 'One logger, many destinations: the console, a file, an HTTP collector, or an adapter a plugin registers.'
---

Every part of the platform logs through one structured logger, reached as
`manablox.logger`. Where those records go is configuration: a list of **adapters**, each
one a named destination with its own level.

```ts
logging: {
  level: 'info',
  adapters: [
    { type: 'console' },
    { type: 'file', path: './data/logs/api.log', level: 'debug' },
    { type: 'http', url: 'https://logs.example.com/ingest', headers: { authorization: 'Bearer ...' } },
  ],
}
```

With no `adapters` the logger writes to the console alone, which is what a container
wants. `logLevel` still works and means `logging.level`.

## Levels

`trace`, `debug`, `info` (the default), `warn`, `error`, `fatal`. `logging.level` is the
floor for every adapter; an adapter's own `level` narrows or widens it, so a file can
keep `debug` while the console stays at `info`. The record is created once and each
adapter decides whether to write it.

## Built-in adapters

### `console`

| Option | Default | Purpose |
| --- | --- | --- |
| `pretty` | on unless `NODE_ENV=production` | Colourised, human-readable lines instead of JSON |
| `destination` | `stdout` | `stdout` or `stderr` |

### `file`

| Option | Default | Purpose |
| --- | --- | --- |
| `path` | required | File the JSON lines are appended to |
| `mkdir` | `true` | Create the parent directory when it is missing |
| `append` | `true` | Set `false` to truncate at boot |

Rotation is left to the system that already does it (logrotate, the platform's own
collector); the adapter holds the file open and writes to it.

### `http`

Posts batches to any endpoint that accepts them, which is the shape most hosted
providers take.

| Option | Default | Purpose |
| --- | --- | --- |
| `url` | required | Where batches are posted |
| `method` | `POST` | |
| `headers` | none | API keys and source tags |
| `format` | `ndjson` | `ndjson` for one record per line, `json` for an array |
| `batchSize` | `100` | Records per request |
| `flushInterval` | `5000` | Milliseconds before a partial batch is sent |
| `maxQueue` | `10000` | Records held while the endpoint is unreachable |
| `timeout` | `10000` | Per-request timeout in milliseconds |

Logging never blocks or fails the request that produced it. A failed batch is retried on
the next flush, and once the queue is full the oldest records are dropped so the newest
survive; the count of dropped records rides along with the next successful batch in the
`x-manablox-dropped` header. On shutdown the queue is drained once, without retries, so a
dead collector cannot hang a deploy.

## Redaction

`req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.refreshToken` and
`*.secret` are replaced with `[redacted]` before a record reaches any adapter. Setting
`logging.redact` replaces that list, so include the defaults you still want.

## Fields on every record

`logging.base` stamps fields on every line, which is how records from several processes
stay apart in one collector:

```ts
logging: { base: { service: 'management-api', release: process.env.GIT_SHA } }
```

## Environment variables

`loggingConfigFromEnv()` builds the list above from the environment, so an operator can
add a destination without editing the config file. It is what the configs `manablox create`
writes use.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | The floor for every adapter |
| `LOG_PRETTY` | by `NODE_ENV` | `true` or `false`, overriding pretty console output |
| `LOG_CONSOLE_LEVEL` | `LOG_LEVEL` | Console level |
| `LOG_FILE` | | Adds a file adapter writing to this path |
| `LOG_FILE_LEVEL` | `LOG_LEVEL` | File level |
| `LOG_HTTP_URL` | | Adds an HTTP adapter posting to this URL |
| `LOG_HTTP_HEADERS` | | `authorization: Bearer abc, x-source: api` |
| `LOG_HTTP_BATCH_SIZE` | `100` | Records per request |
| `LOG_HTTP_LEVEL` | `LOG_LEVEL` | HTTP level |

## Writing an adapter

An adapter is a name and a writable stream that receives one JSON line per record. A
package registers a type once, at import time, and a config then names it:

```ts
import { registerLogAdapter } from '@manablox/core/node';

registerLogAdapter('acme', (options) => {
  const client = new AcmeClient(options.apiKey as string);
  return {
    name: 'acme',
    stream: new Writable({
      write(chunk, _encoding, callback) {
        client.send(JSON.parse(String(chunk)));
        callback();
      },
    }),
    close: () => client.flush(),
  };
});
```

```ts
logging: { adapters: [{ type: 'console' }, { type: 'acme', apiKey: process.env.ACME_KEY }] }
```

An adapter object, or a function returning one, can also be placed in `adapters`
directly, which is the shortest path for a one-off destination in a project's own config.
An unknown `type` is refused at boot rather than dropped quietly, because a logger that
lost a destination is how an incident becomes invisible.

`close()` is called when the instance stops, before the rest of the shutdown, so an
adapter that buffers gets its chance to flush.
