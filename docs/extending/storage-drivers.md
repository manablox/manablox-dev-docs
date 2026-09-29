---
title: 'Storage drivers'
description: 'The interface a storage driver implements, what each method must do (byte ranges included), and how to register one for STORAGE_DRIVER.'
---

Uploaded files, image variants, import staging and snapshots go through one **storage
driver**. Two ship with Manablox, `local` and `s3` (see
[Storage and media](../configuration/storage-and-media.md)). Any other object store can be
added by implementing `StorageDriver` from `@manablox/storage` and registering it under a
name.

## Registering a driver

```ts
// manablox.config.ts
import { defineConfig, storageConfigFromEnv } from '@manablox/core';
import { registerStorageDriver } from '@manablox/storage';
import { BlobStorageDriver } from './blob-driver.js';

registerStorageDriver('blob', (config) => new BlobStorageDriver(config.blob as BlobOptions));

export default defineConfig({
  storage: {
    // The upload limits from the environment, the driver from here.
    ...storageConfigFromEnv(),
    driver: 'blob',
    blob: { container: 'assets', connection: process.env.BLOB_URL },
  },
  // ...
});
```

Register before the instance boots: the config file is the right place, since every
process (management, public, site, the CLI) loads it. The factory receives the whole
`storage` object of the config, so a driver reads its options from a key of its own. To
type that key, augment `StorageConfig`:

```ts
declare module '@manablox/core' {
  interface StorageConfig {
    blob?: BlobOptions;
  }
}
```

`storageConfigFromEnv()` knows only `local` and `s3` (`STORAGE_DRIVER`), so a custom
driver is named in the config as above. `maxFileSize` and `allowedMimeTypes` apply
whatever the driver.

## The interface

```ts
interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer | Readable, options: PutOptions): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  stream(key: string, range?: ByteRange): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  url(key: string): string | null;
  list?(prefix: string): Promise<ListedObject[]>;
  deletePrefix?(prefix: string): Promise<void>;
  presignPut?(key: string, contentType: string, expiresIn: number): Promise<string>;
}
```

Keys are relative paths with `/` separators, for example
`<space id>/2026/09/photo-k3j9x2.jpg`, `snapshots/<space id>/<time>/space.json` or an import's
staging files. Treat them as opaque; never let one escape the driver's root (the local
driver refuses `..` segments with `storage.key.traversal`).

| Method | What it must do |
| --- | --- |
| `name` | The name it is registered under; shows up in logs |
| `put(key, body, { contentType, cacheControl? })` | Stores the bytes under `key`, replacing an existing object. `body` is a Buffer or a stream: uploads arrive as streams and must not be buffered whole. A reader must never see a partial object (write elsewhere and move, or use the store's atomic upload). Resolves to `{ key, size, contentType }` with the stored size in bytes |
| `get(key)` | The whole object. Used for small objects (staging manifests, image variants, the source of a resize) |
| `stream(key, range?)` | The object as a Node `Readable`, see below |
| `exists(key)` | `true` or `false`; only absence is `false`, other failures (permissions, network) throw |
| `delete(key)` | Removes the object; a missing one is not an error |
| `url(key)` | A public URL when the store serves bytes itself (a CDN or a public bucket), otherwise `null`: then the API serves originals at `/media/<id>/original` |
| `list(prefix)` (optional) | Every object whose key starts with `prefix`, with `size` and `lastModified`, **sorted by key**, and without objects still being written. Without it, snapshots are refused with `snapshot.unsupported` |
| `deletePrefix(prefix)` (optional) | Removes everything under a prefix, including what a store leaves behind (empty directories). Used to drop an import's staging area |
| `presignPut(key, contentType, expiresIn)` (optional) | A URL a client can `PUT` the bytes to for `expiresIn` seconds |

### Streams and byte ranges

`stream(key)` without a range returns the whole object. With `range` it returns exactly
the bytes from `range.start` to `range.end`, **both inclusive**, and nothing else: the
server has already answered the client with `206`, `Content-Range` and a
`Content-Length` of `end - start + 1`, so a driver that returns more or fewer bytes
corrupts the download. The server only passes a range inside the object
(`0 <= start <= end < size`, with `size` from the asset row) and handles everything else
itself: suffix and open ranges are turned into offsets, a range past the end is answered
`416`, several ranges or other units get the whole file. A driver maps it to its store's
own form, for example a `Range: bytes=<start>-<end>` request header on HTTP stores (the S3
driver) or `createReadStream(path, { start, end })` on disk (the local driver).

Originals are streamed to the client as they are read, so a stream must not load the
object into memory first. The server reads the first chunk before it sends headers, so a
missing object can fail either the returned promise or the stream's first read. Use an
error that `isMissingObject` from `@manablox/storage` recognises (`code: 'ENOENT'`, name
`NoSuchKey` or `NotFound`, or an HTTP status of 404 in `$metadata.httpStatusCode`): image
variants and the snapshot code treat those as "absent" rather than as a failure.

Destroying the stream (a client that disconnects mid-download) must release whatever the
driver holds open: the file handle or the HTTP response.

## Testing a driver

Run it against the same cases the built-in drivers pass: a put from a Buffer and from a
stream, reading back with `get` and `stream`, ranges at the start, the middle and the last
byte (`{ start: size - 1, end: size - 1 }`), `exists` before and after `delete`, and, if
it implements `list`, the key order and a prefix that ends mid-name. Then set
`STORAGE_DRIVER` to it on a development instance and upload, crop and download an image,
download a video with seeking (browsers send ranges), export and import a space, and take
a snapshot.
