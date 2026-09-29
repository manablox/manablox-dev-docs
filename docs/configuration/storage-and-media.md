---
title: 'Storage and media'
description: 'Where uploaded files live, what an instance and a space accept, and how images are resized through named presets with signed URLs.'
---

## Storage drivers

Uploaded files are written by a **storage driver**, chosen with `STORAGE_DRIVER`.

| Driver | Where files go | When |
| --- | --- | --- |
| `local` (default) | A directory on disk, `STORAGE_LOCAL_PATH`, `./data/uploads` by default | One server, or a shared volume |
| `s3` | An S3 bucket, or anything S3-compatible (MinIO, R2, ...) | More than one API process, or a CDN in front of the bucket |

The S3 driver needs `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; set
`S3_ENDPOINT` for a non-AWS service (a MinIO service in a compose stack is
`http://minio:9000`), `S3_REGION` if the service wants one, and `S3_PUBLIC_URL` to serve
originals straight from the bucket instead of through the API. Path-style addressing is
always used.

In `defineConfig()` the same settings are below. Both drivers take `publicUrl`, the base
URL files are served from without the API: `S3_PUBLIC_URL` for S3, and for the local driver
a reverse proxy that serves the directory (`local: { path, publicUrl }`, or
`STORAGE_LOCAL_PUBLIC_URL`).

```ts
storage: {
  driver: 's3',
  s3: { bucket: 'assets', accessKeyId: '...', secretAccessKey: '...', endpoint: 'https://...', publicUrl: 'https://cdn.example.com' },
  maxFileSize: 25 * 1024 * 1024,
  allowedMimeTypes: ['image/', 'application/pdf'],
}
```

Other object stores plug in as their own driver; see
[Storage drivers](../extending/storage-drivers.md) for the interface.

## What may be uploaded

Two limits apply to every upload, and the **bytes are sniffed** before the declared type
is believed:

- `ALLOWED_MIME_TYPES`: exact types or families with a trailing slash. The default admits every image, video, audio and text type, PDF, RTF, and Word, Excel, PowerPoint and OpenDocument files, and WOFF and WOFF2 web fonts.
- `FILE_MAX_SIZE_MB`: 25 by default.

These are the **instance's ceiling**. The [upload rules](controls.md#upload-rules) an
external layer sets through the control API can narrow them per instance, group or space,
and a space can narrow them further from its settings panel (see
[Assets > What a space accepts](../admin/assets.md#what-a-space-accepts)), but nothing
widens them. An upload is held to the strictest of the three, wherever it comes from: the
upload route, AI-generated images and videos, and web fonts imported for a site theme. A
space import checks its files against the instance's rules (a new space is in no group)
and is refused with `space.import.assetsRefused`, listing each refused file, before
anything is written.

### How an upload is received

`POST /upload/:spaceId` takes `multipart/form-data` with one `file` part and optional
`alt` and `title` fields. It answers `201` with the asset. Several files are several
requests, which can run in parallel; a second `file` part in one request is refused with
`asset.file.single`.

The file is never held in memory whole. It streams to a temporary file while its size is
counted and its SHA-256 computed, and only then goes to storage:

- A `Content-Length` larger than the space's limit (plus 1 MB for the form fields) is refused before the body is read.
- Without one, the upload is cut off as soon as the file passes the limit.
- Either way the answer is `413` with `asset.tooLarge` (kind `too_large`, the limit in `max`).
- The type is sniffed from the first bytes, then the `asset:beforeUpload` hook runs.
- A file the space already holds (the same checksum) returns the existing asset. Identical uploads to one space wait for each other (a lock per space and checksum, across processes on Postgres), so two at the same time store the file once and count its bytes toward `storageBytes` once.
- The storage limit (`storageBytes`) is checked with the exact size before the file is stored.
- Images are measured from the temporary file, and the eager presets are rendered or queued.

The temporary file lives in the operating system's temp directory (`TMPDIR`) and is
removed when the request ends, so that directory needs room for the largest upload times
the number of parallel uploads.

## Image presets

Images are not served at their original size. A **preset** names a rendition (a width,
a height, how to fit, a format, a quality) and the API renders it on request, caches it
under `MEDIA_CACHE_PATH`, and serves it with a far-future cache header.

The defaults:

| Preset | Renders |
| --- | --- |
| `thumb` | 320 x 320, `inside`, WebP 80. Rendered eagerly on upload; the admin's grid uses it |
| `card` | 640 wide, `inside`, WebP 82 |
| `hero` | 1920 wide, `inside`, WebP 84 |

Add or replace them in `defineConfig()`:

```ts
media: {
  presets: {
    thumb: { width: 320, height: 320, fit: 'inside', format: 'webp', quality: 80 },
    card:  { width: 640, fit: 'inside', format: 'webp', quality: 82 },
    hero:  { width: 1920, fit: 'inside', format: 'webp', quality: 84 },
    square: { width: 800, height: 800, fit: 'cover', format: 'avif', quality: 70 },
  },
  eager: ['thumb'],   // rendered on upload; everything else on first request
}
```

With `REDIS_URL`, the management instance answers an upload at once and queues one
`media:derive` job per eager preset; its worker renders and stores the variant. A failed
render is logged with the asset and preset and retried up to three times with a growing
delay, and a job for a variant that already exists does nothing. Without `REDIS_URL` the
upload renders its eager presets itself before it answers. Either way a variant that is not
there yet is rendered on its first request, so its URL works as soon as the upload returns.

`fit` is one of `cover`, `contain`, `inside`, `outside`, `fill`, with sharp's meaning.
`format` is `avif`, `webp`, `jpeg` or `png`.

A preset with both sides fixed and `fit: 'cover'` keeps the window around the image's
**focal point**, if an editor set one, and every preset is rendered *after* the editor's
mirror, turn and **crop**, with the colour adjustments applied last. See
[Assets -> Editing an image](../admin/assets.md#editing-an-image).

### Sizes an asset field asks for

A preset here is a property of the installation. An asset field that accepts images can
also ask for renditions of its own, by measurement rather than by name: a hero field
wants 1600x900, a card field wants 800x450, and neither belongs in this config. Those
sizes are declared on the field, delivered under the names the field gave them, and
rendered under a name derived from the measurements, so two fields wanting the same size
share one file. A field can also narrow which of the presets above it delivers. See
[Field types -> Renditions an image field asks for](../content-model/field-types.md#renditions-an-image-field-asks-for).

A transform is only ever rendered for a preset the configuration or some field names.
That allowlist, and the signature below, are what keep the endpoint from being an open
resize service.

## Signed URLs

A variant URL looks like `/media/<asset id>/card.webp?s=...&v=...`. The signature is an
HMAC of `MEDIA_SIGNING_SECRET` (which falls back to `AUTH_SECRET`), and the server
refuses a transform request without a valid one: otherwise anyone could ask for arbitrary
sizes and turn the resizer into a denial-of-service amplifier.

The consequence for a frontend: **do not build variant URLs yourself.** The delivery API
serves them ready-made, under `variants` on every asset over REST and through
`variant(preset:)` in GraphQL, and the SDK's `assetUrl(asset, { preset })` looks them up.
The `v` parameter is the asset's version, so a re-cropped image gets a new URL and a CDN
holding the old one as immutable fetches the new rendering.

Originals are served at `/media/<id>/original` through the API, or straight from the
bucket when `S3_PUBLIC_URL` is set.

## Which assets a public instance serves

Assets have no draft or published state of their own. A public instance serves an asset
only if a **published** document references it; a file uploaded for a draft that never
went live is not reachable, and an asset filter relation does not list it. The index
behind that is `asset_usages`, maintained on every publish, unpublish and delete, and by
space imports, environment copies and promotes.
