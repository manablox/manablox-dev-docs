---
title: 'Control API'
description: 'The HTTP API an external layer uses to set controls, provision spaces and accounts, read usage, receive events and set the instance state.'
---

The control API lets a system outside the CMS (a hosting panel, a billing system, a
provisioning script) control an instance at runtime: set feature flags, limits, rate
limits, retention and admin messages, group spaces, create spaces and the first account,
read usage, receive events and set the instance state. The CMS stores the values and
enforces them. Nothing in the admin can change them, superadmins included.

It is a separate server scope, `control`, meant for an internal port or network. It is
not part of any preset, so a process only serves it when you name it. For a walk-through
of the whole setup see [Running under a control layer](../deployment/control-layer.md);
what each control does is described in [Controls](../configuration/controls.md).

## Turning it on

Set a key and name the scope:

```sh
CONTROL_API_KEY=$(openssl rand -hex 32)
SCOPES=rpc,auth,uploads,media,graphql,control
```

Or run it as its own process next to the management API, on a port that is not public:

```yaml
api-control:
  environment:
    SCOPES: control
    PORT: "3300"
    CONTROL_API_KEY: ${CONTROL_API_KEY}
    CONTROL_API_ALLOWED_IPS: 10.0.0.0/8
```

The scope needs `server.mode: 'management'` (the default). A process that names `control`
without a key refuses to start with `config.control.keyMissing`. A key without the scope
mounts nothing. In a config file the same settings are `control: { apiKey, nextApiKey,
allowedIps, provisioned }`; without that block the `CONTROL_API_*` and
`CONTROL_PROVISIONED` variables are read.

Everything lives under `/control`:

| Path | What |
| --- | --- |
| `/control/v1/*` | The endpoints below, JSON in and out |
| `/control/openapi.json` | OpenAPI 3.1 document of every endpoint, with the full control catalogue as schemas |

## Authentication

Every request, the OpenAPI document included, sends the key as a bearer token:

```sh
curl -H "Authorization: Bearer $CONTROL_API_KEY" http://api-control:3300/control/v1/instance
```

The key is compared as a SHA-256 digest in constant time. A missing or wrong key answers
401 `auth.unauthorized`.

**Rotation.** Set the new key as `CONTROL_API_KEY_NEXT` and restart; both keys now work.
Switch the external layer to the new key, then move it to `CONTROL_API_KEY`, remove
`CONTROL_API_KEY_NEXT` and restart again.

**IP allowlist.** `CONTROL_API_ALLOWED_IPS` takes addresses and CIDR ranges, IPv4 and IPv6,
comma-separated. The client IP is read like the rate limiter reads it, which depends on
`TRUSTED_PROXIES`: set it to your proxies, or to `none` without a proxy, so a client cannot
name its own address in a header. See
[Client addresses](../deployment/operations.md#client-addresses).
Other clients get 403 `control.ipNotAllowed`. A malformed entry stops the start.

## Errors

Errors use the same body as every other API (see
[the error body](./errors.md#the-error-body)):

```json
{ "error": { "key": "control.key.unknown", "kind": "validation", "status": 422, "message": "control.key.unknown", "details": [] } }
```

| Status | When |
| --- | --- |
| 400 | `control.scope.invalid`: the `scope` parameter is not one of the forms below; `snapshot.unsupported`; `environment.promote.notStaging` |
| 401 | Missing or wrong key |
| 403 | `control.ipNotAllowed`; `control.feature` when a switched-off feature is needed (snapshots, API hosts, environments); `environment.production.undeletable` |
| 404 | `space.notFound`, `spaceGroup.notFound`, `user.notFound`, `snapshot.notFound`, `environment.notFound`, `route.notFound` |
| 409 | `control.idempotency.mismatch`, `control.owner.exists`, `spaceGroup.externalId.taken`, `control.limit`, `environment.machineName.taken`, `environment.promote.confirmRequired` |
| 422 | Validation: `control.key.unknown`, `control.scope.notAllowed`, `control.value.invalid`, `control.key.duplicate`, `user.email.taken`, `apiHost.validation.failed`, `validation.invalid` |

## Scopes

A control value is set at one scope. The `scope` query parameter names it:

| Scope | Meaning |
| --- | --- |
| `instance` | The whole instance |
| `group:<id>` | A space group, by its id |
| `group:ext:<externalId>` | A space group, by the external layer's own id |
| `space:<id>` | One space |

Responses always name a group by its id (`group:<id>`). `GET /catalogue` lists the scopes
each key allows; how the values of several scopes combine (a feature is on only if no
scope switches it off, every scope's limit must pass, the most specific rate limit wins)
is described under [Scopes](../configuration/controls.md#scopes).

Path parameters for groups take the same two forms: `/groups/<id>` or
`/groups/ext:<externalId>`.

## Idempotency

A `POST` may send an `Idempotency-Key` header (at most 255 characters). The first response
for a key is stored for 24 hours, in Redis when `REDIS_URL` is set and in the process
otherwise; repeats get that response again with the header `Idempotent-Replayed: true`,
and nothing runs twice. The same key with a different method, path or body answers 409
`control.idempotency.mismatch`. Responses with a 5xx status are not stored, so a failed
request can be retried with the same key. Two requests with the same key at the same
moment run one after the other within one process; across processes, send each key to
one process or wait for the first answer.

## Audit

Every write is recorded in the audit log with the actor `control` (label `control API`):
settings (`control.set`, `control.replace`, `control.delete`), groups (`spaceGroup.*`),
provisioned spaces (`space.create`, `member.grant` and the starter's writes) and the
account operations (`user.create`, `member.grant`, `user.requestPasswordReset`,
`user.revokeSessions`) and external usage figures (`usage.external`).

## Endpoints

All paths are relative to `/control/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/instance` | Version, catalogue version, migrations, health |
| `GET` | `/catalogue` | Every control key with kind, default and allowed scopes |
| `GET` | `/settings?scope=` | Stored values of one scope, or of all scopes |
| `PUT` | `/settings?scope=` | Replace the whole set of one scope atomically |
| `PATCH` | `/settings?scope=` | Set the given keys, keep the others |
| `DELETE` | `/settings/<key>?scope=` | Remove one key, restoring its default at that scope |
| `GET` | `/groups` | Space groups |
| `POST` | `/groups` | Create a group |
| `GET` | `/groups/<ref>` | One group |
| `PATCH` | `/groups/<ref>` | Rename a group or change its external id |
| `DELETE` | `/groups/<ref>` | Delete a group and its values; its spaces stay, without a group |
| `PUT` | `/groups/<ref>/spaces` | Replace the group's spaces |
| `GET` | `/spaces` | Spaces with group, hosts and counts |
| `GET` | `/spaces/<id>` | One space |
| `POST` | `/spaces` | Provision a space |
| `PUT` | `/spaces/<id>/api-hosts` | Replace a space's API hosts |
| `GET` | `/spaces/<id>/environments` | A space's environments, production first |
| `POST` | `/spaces/<id>/environments` | Copy an environment into a new staging environment |
| `GET` | `/spaces/<id>/environments/<env>/diff?mode=` | What promoting an environment would change in production |
| `POST` | `/spaces/<id>/environments/<env>/promote` | Promote a staging environment into production |
| `DELETE` | `/spaces/<id>/environments/<env>` | Delete a staging environment with everything in it |
| `GET` | `/users` | Accounts with role, memberships and last sign-in |
| `POST` | `/users/owner` | Create the superadmin and return a set-password link |
| `POST` | `/users/<id>/reset-link` | A new set-password link for an account |
| `POST` | `/users/<id>/revoke-sessions` | Sign an account out everywhere |
| `PUT` | `/instance/state` | Set the instance state |
| `GET` | `/state` | Resolved state, switched-off features and usage levels per scope |
| `GET` | `/usage?scope=&period=` | Counted, external and total usage of a scope per metric |
| `POST` | `/usage/external` | Report usage the CMS did not serve, such as CDN cache hits |
| `GET` | `/events?after=&limit=` | Control events after a sequence number, for pull |
| `GET` | `/snapshots?spaceId=` | A space's snapshots, newest first |
| `POST` | `/snapshots` | Take a snapshot of a space now |
| `POST` | `/snapshots/restore` | Restore a snapshot as a new space or in place of its space |

### GET /instance

```json
{
  "version": "0.26.0",
  "catalogueVersion": "1",
  "schemaVersion": 12,
  "migrations": {
    "latest": "0001_extras",
    "applied": "0001_extras",
    "pending": 0,
    "plugins": [{ "id": "hello", "latest": "0000_hello-greetings", "applied": "0000_hello-greetings", "pending": 0 }]
  },
  "health": { "status": "ok", "database": "ok" }
}
```

`version` is the server package version, `catalogueVersion` changes whenever control keys,
shapes or defaults change, and `schemaVersion` is the content-type registry version.
`migrations` is `null` when the database cannot be read; `plugins` lists the same per
configured plugin with [tables](../extending/plugins.md#tables-and-migrations).

### GET /catalogue

```json
{
  "version": "1",
  "controls": [
    { "key": "features.sso", "kind": "feature", "scopes": ["instance"], "default": { "enabled": true }, "description": "Single sign-on providers.", "restrictsByDefault": false, "pattern": false }
  ]
}
```

`pattern: true` marks `features.plugins.*`, which stands for `features.plugins.<pluginId>`.
Keys the loaded plugins declare ([Plugin controls](../extending/controls.md)) follow the
core keys as fixed keys.

### Settings

The body of `PUT` and `PATCH` is a map of control keys to values. It may be flat, with the
stored keys:

```json
{ "features.sso": { "enabled": false, "presentation": "locked" }, "limits.spaces": { "max": 5, "mode": "hard" } }
```

or grouped by the part before the first dot:

```json
{
  "features": { "sso": { "enabled": false, "presentation": "locked" } },
  "limits": { "spaces": { "max": 5, "mode": "hard" } },
  "usage": { "apiRequests": { "max": 10000000, "mode": "soft", "thresholds": [80, 100] } },
  "rateLimits": { "delivery.space": { "max": 6000, "windowSeconds": 60 } },
  "retention": { "versionsDays": 90 },
  "snapshots": { "interval": "daily" },
  "admin": { "links": { "upgrade": "https://example.com/upgrade" } },
  "state": { "status": "active" }
}
```

Grouping maps `features.sso` to `{ "features": { "sso": ... } }`, `rateLimits.delivery.space`
to `{ "rateLimits": { "delivery.space": ... } }`, `retention.versionsDays` to
`{ "retention": { "versionsDays": ... } }` and `snapshots.interval` to
`{ "snapshots": { "interval": ... } }`. Keys without a dot (`state`,
`usagePeriodAnchorDay`, `apiKeysDisable`) stay at the top. Both forms may be mixed; a key
given twice is refused with `control.key.duplicate`.

Every value is checked against the catalogue before anything is written, and all problems
are reported at once. A `PUT` with one bad key changes nothing. Unlisted keys are removed
by `PUT` and kept by `PATCH`.

```sh
curl -X PUT -H "Authorization: Bearer $CONTROL_API_KEY" -H 'content-type: application/json' \
  'http://api-control:3300/control/v1/settings?scope=instance' \
  -d '{ "features": { "sso": { "enabled": false } }, "limits": { "spaces": { "max": 5 } } }'
```

`PUT`, `PATCH` and `GET` with a scope answer the stored values of that scope, flat:

```json
{ "scope": "instance", "settings": { "features.sso": { "enabled": false }, "limits.spaces": { "max": 5, "mode": "hard" } } }
```

`GET /settings` without a scope answers every scope that stores anything:

```json
{ "scopes": { "instance": { "features.sso": { "enabled": false } }, "group:1f0c...": { "limits.documents": { "max": 1000, "mode": "hard" } } } }
```

Both forms of `GET` also list `ceilings`: the features plugins switch off above every scope
([feature ceilings](../extending/controls.md#feature-ceilings)), by key, read-only. No scope
turns them back on and no write reaches them, so they tell why a feature is off although
the settings have it on:

```json
{ "scopes": {}, "ceilings": { "features.plugins.notes": { "enabled": false, "message": "Notes need a license" } } }
```

`DELETE /settings/features.sso?scope=instance` answers
`{ "scope": "instance", "removed": true }` (`false` when the key was not set).

### Groups

A group bundles spaces so limits and flags apply to them together. A space belongs to at
most one group. Editors never see groups.

```sh
curl -X POST -H "Authorization: Bearer $CONTROL_API_KEY" -H 'content-type: application/json' \
  -H 'Idempotency-Key: create-group-acme' \
  http://api-control:3300/control/v1/groups -d '{ "name": "Acme", "externalId": "acme" }'
```

```json
{ "id": "1f0c...", "externalId": "acme", "name": "Acme", "spaceIds": [], "createdAt": "2026-09-25T10:00:00.000Z", "updatedAt": "2026-09-25T10:00:00.000Z" }
```

`POST` answers 201. `PATCH /groups/ext:acme` takes `{ "name"?, "externalId"? }`
(`externalId: null` clears it). `PUT /groups/ext:acme/spaces` takes
`{ "spaceIds": ["<id>", ...] }`, moves those spaces into the group (out of any other) and
takes the group's other spaces out; it answers the group. A `spaces` limit set at the group
counts the spaces that join less those that leave: a `hard` one refuses with 409
`control.limit` and no space moves. `DELETE` answers `{ "deleted": true }` and removes the
group's control values with it.

### Spaces

`GET /spaces` answers `{ "items": [...] }`; `GET /spaces/<id>` answers one:

```json
{
  "id": "5e2c...",
  "name": "Shop",
  "machineName": "shop",
  "description": null,
  "url": "https://shop.example.com",
  "defaultLocale": "en",
  "locales": ["en", "de"],
  "status": "ready",
  "group": { "id": "1f0c...", "externalId": "acme", "name": "Acme" },
  "hosts": [
    { "hostname": "shop.example.com", "locale": null, "isPrimary": true, "verified": true, "verificationToken": null }
  ],
  "apiHosts": [
    { "hostname": "api.shop.example.com", "verified": false, "verificationToken": "manablox-verify-3f9c...", "createdAt": "2026-09-25T10:00:00.000Z" }
  ],
  "counts": { "documents": 42, "contentTypes": 6, "members": 2, "assets": 17 },
  "createdAt": "2026-09-25T10:00:00.000Z",
  "updatedAt": "2026-09-25T10:00:00.000Z"
}
```

`hosts` are the host names of plugin host sources (the website plugin's domains), `apiHosts` the host names the public API serves
`hosts` are the designed site's domains, `apiHosts` the host names the public API serves
the space on (see [Which space a request reads](../delivery/public-api.md#which-space-a-request-reads)).
`verificationToken` is the value of the `_manablox.<host>` TXT record while a host is
unverified, `null` once it is; see
[Custom domain verification](../configuration/controls.md#custom-domain-verification).
`documents` counts every locale.

`POST /spaces` creates a space the way the admin does, through the same checks and hooks
(`space:beforeCreate`), and answers 201 with the space:

```json
{ "name": "Shop", "machineName": "shop", "locales": ["en", "de"], "starter": "basic", "group": "ext:acme" }
```

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | required | Display name |
| `machineName` | required | Lower case, letter first, then letters, digits, `_` and `-` |
| `description` | | Free text |
| `url` | the public URL | The frontend origin, used by the visual editor |
| `defaultLocale` | `en` | Must be one of `locales` |
| `locales` | `[defaultLocale]` | The space's locales |
| `starter` | `false` | A website starter: `true` (the basic one) or a template id such as `blog` |
| `blocks` | | Catalog blocks for the `custom` starter |
| `plan` | | Content types to add after the starter, `{ "types": [...] }` as `contentTypes.applyPlan` takes them (for example what the AI plugin's `plugins.ai.designContentTypes` proposed). They are created in the create's transaction: an invalid plan answers 422 `contentType.validation.failed` and no space is created |
| `group` | | A group id or `ext:<externalId>` to join. A full group (its hard `spaces` limit) refuses with 409 `control.limit` before the space is created |
| `apiHosts` | | Host names for the public API, at most 100. A name that is not a host name or that another space or site domain uses refuses with 422 `apiHost.validation.failed` before the space is created |
| `plugins` | | Data for plugins that take part in creating spaces, by plugin id, for example `{ "hello": { "greeting": "Welcome" } }`, or `{ "ai": { "copyFrom": "<spaceId>" } }` to copy another space's AI providers, keys included, once the space exists (the AI plugin). Each plugin checks and writes its part in the create's transaction; an unknown plugin answers 400 `space.plugin.unknown`, one switched off on the instance 403 `space.plugin.off`, invalid data 422 `space.validation.failed`. What a plugin does once the space exists comes back in `warnings`. See [New spaces](../extending/plugins.md#new-spaces) |

Every superadmin becomes owner of the new space. With no account yet, the owner created
later by `POST /users/owner` becomes owner of it; on an instance that is not provisioned,
the first account to sign up does. Code resources that apply to every space are synced
into it.

`PUT /spaces/<id>/api-hosts` makes the space's API hosts exactly the list and answers the
space:

```json
{ "hostnames": ["api.shop.example.com", "origin.shop.example.com"] }
```

Names are normalised like site domains (lower case, punycode, no scheme, port or path).
Kept names keep their verification; new ones start verified, or unverified with a token
while `domains.requireVerification` is on. Adding needs `features.customDomains` (403
`control.feature`) and room in the `customDomains` limit, which counts site domains and API
hosts together (409 `control.limit`). Removed and added names send `domain.removed` and
`domain.added`. An empty list removes every host. These are production's API hosts; a
staging environment's hosts are managed in the admin or through the management API with
its `environment`.

### Users

The customer's accounts are made and supported through these endpoints. Reads are not
audited; every write is, with the actor `control`.

`POST /users/owner` creates the first superadmin and answers 201:

```json
{ "email": "owner@example.com", "name": "Ada Owner", "sendMail": true, "expiresIn": 259200 }
```

| Field | Default | Meaning |
| --- | --- | --- |
| `email` | required | The account's email, stored in lower case |
| `name` | required | Display name |
| `sendMail` | `false` | Also mail a set-password link when mail is configured |
| `expiresIn` | `259200` (72 hours) | Seconds the link stays valid, 60 to 2592000 (30 days) |

```json
{
  "user": { "id": "9b1d...", "email": "owner@example.com", "name": "Ada Owner", "role": "superadmin", "banned": false, "memberships": 1, "lastSignInAt": null, "createdAt": "2026-09-25T10:00:00.000Z" },
  "setPasswordLink": { "url": "https://admin.example.com/reset-password?token=...", "expiresAt": "2026-09-28T10:00:00.000Z" },
  "mailSent": true
}
```

The account has no password anyone knows; it signs in after it opened the link and chose
one. It becomes owner of every existing space, and of every space `POST /spaces` creates
later. Each of those grants runs through `member:beforeGrant`, like a grant in the admin,
so a plugin or a seat limit can refuse it; then nothing is created. From this call on the
instance is provisioned (see below). A second call answers 409 `control.owner.exists` as
soon as any superadmin exists; a repeat with the same `Idempotency-Key` gets the first
response instead.

`mailSent` is `true` only when a mail went out. With `sendMail` and mail configured, the
mail carries its own link; the returned one stays valid as well. Without mail, or when
sending fails, the account and the returned link are still there and `mailSent` is
`false`.

`GET /users` answers `{ "items": [...] }` with every account, oldest first, in the shape of
`user` above. `role` is `superadmin` or `editor`; `memberships` counts the spaces the
account belongs to; `lastSignInAt` is the start of its newest stored session, `null` when
none is stored (sessions end with sign-out, expiry and revocation).

`POST /users/<id>/reset-link` takes `{ "expiresIn"?, "sendMail"? }` (both optional, as
above) and answers `{ "setPasswordLink": { "url", "expiresAt" }, "mailSent" }`. Each
link works once; earlier links stay valid until they expire. Using a link sets the
password and signs the account out everywhere.

`POST /users/<id>/revoke-sessions` signs the account out on every device and answers
`{ "revoked": true }`.

### Provisioning a new instance

Provisioned means the control API provides the accounts: the admin shows no install
wizard, sign-up is closed, and no account is ever promoted to superadmin on its own. An
instance is provisioned when `CONTROL_PROVISIONED=true` is set (or `control.provisioned`
in a config file), and from the moment `POST /users/owner` succeeds; that second marker is
kept in the database and cannot be unset through the API. Without either, the first
account to sign up in the admin becomes superadmin, as on any self-hosted instance.

Set the flag from the start, so nobody can claim the instance between its start and the
owner call:

1. Start the instance with `CONTROL_API_KEY`, `CONTROL_PROVISIONED=true` and the `control` scope on an internal port.
2. Wait for `GET /instance` to answer `"health": { "status": "ok" }` with no pending migrations.
3. Apply the plan: `PUT /settings?scope=instance` with the features and limits the customer gets.
4. Optionally create the first space: `POST /spaces` with a starter.
5. Create the owner: `POST /users/owner` with the customer's email and name, and an `Idempotency-Key` so a retry cannot fail with 409.
6. Hand out the link: send `setPasswordLink.url` to the customer yourself, or pass `"sendMail": true` and let the instance mail it. The customer opens it, chooses a password and signs in.

If the customer lets the link expire, `POST /users/<id>/reset-link` makes a new one.

### State

`PUT /instance/state` sets the `state` control at instance scope:

```json
{ "status": "readOnly", "message": "Maintenance until 14:00 UTC." }
```

`status` is `active`, `readOnly` or `suspended`; the response is the stored value.
`message` is optional plain text (no HTML) up to 1000 characters; the admin shows it.
`readOnly` can also be set on a group or a space through the settings endpoints
(`{ "state": { "status": "readOnly" } }`); `suspended` only on the instance, elsewhere it
is refused with `control.value.invalid`. A space is held to the most severe state of its
scopes.

| Status | Management API and admin | Delivery, media, sites |
| --- | --- | --- |
| `active` | Everything works | Served |
| `readOnly` | Writes refused with 423 `control.readOnly` (`{ scope, reason }`); reads, sign-in and each person's own account keep working. No new workflow runs start | Served; site forms answer "form unavailable" |
| `suspended` | Everything but `users.me` refused with 423 `control.suspended` (`{ reason }`); the admin shows only the message and the `admin.links` | 503 `service.unavailable` (`Cache-Control: no-store`); sites show the neutral "Temporarily unavailable" page |

The control API, sign-in and the health endpoints are never affected, so
`PUT /instance/state` with `{ "status": "active" }` always lifts a state. It takes effect in
every process within 5 seconds, at once in the process that received it. What each state
refuses in detail is listed under
[Instance state](../configuration/controls.md#instance-state).

`GET /state` answers the resolved state of every scope, and the features switched off
there (a flag like the website badge, `plugins.website.badge`, whose off state is the unrestricted one, is not listed):

```json
{
  "version": "1",
  "scopes": [
    { "scope": "instance", "state": { "status": "readOnly", "scope": "instance", "message": "Maintenance until 14:00 UTC." }, "featuresOff": ["sso"] },
    { "scope": "group:1f0c...", "state": { "status": "readOnly", "scope": "instance" }, "featuresOff": ["sso", "plugins.webhooks"] },
    { "scope": "space:5e2c...", "group": "group:1f0c...", "state": { "status": "readOnly", "scope": "instance" }, "featuresOff": ["sso", "plugins.webhooks"] }
  ],
  "usage": {
    "space:5e2c...": { "bandwidthBytes": { "level": "blocked", "used": 107374182400, "max": 107374182400, "resetsAt": "2026-10-01T00:00:00.000Z" } },
    "instance": { "apiRequests": { "level": "warn", "used": 850000, "max": 1000000, "resetsAt": "2026-10-01T00:00:00.000Z" } }
  }
}
```

A group or space row includes what the scopes above it set. `usage` lists, per scope, the
usage limits set at exactly that scope whose level is not `ok`: `warn`, `over` or
`blocked` (see [usage limits](../configuration/controls.md#usage-limits)). A scope with
every level at `ok` is left out, so `{}` means nothing is near a limit. The levels are
worked out about once a minute and right after a control API write, so they can be up to
a minute behind `GET /usage`.

### Usage

The CMS counts usage per space and month, for every space, whether or not a usage limit
is set. Groups and the instance are sums of their spaces.

| Metric | Counted |
| --- | --- |
| `apiRequests` | Every delivery request (REST `/v1` and GraphQL, on the public API and on the management API) and every management API read made with an API key (`/api/v1`). Editors working in the admin do not count |
| `bandwidthBytes` | Body bytes of delivery responses, media files and designed-site pages, answers from the response cache included, plus external figures. Management API reads do not count |
| `plugins.workflows.runs` | Runs that start: by trigger, by hand, or called by another workflow. Test runs and runs a hook refused do not count (the workflows plugin) |
| `plugins.website.formSubmissions` | Designed-site form submissions that were stored (the website plugin) |
| `mails` | Recipients of mails sent through the instance's mail transport (notifications and workflow mail nodes). Mails sent through an editor's own mailbox do not count |
| `plugins.ai.calls` | AI generations that finished (the AI plugin) |
| `uploads` | Files uploaded through `POST /upload/<spaceId>` |

Media the admin loads on the management API names no space; it counts toward the space
that owns the asset (the first space it was put in, as for `storageBytes`). Each process
remembers the owners of the last 10,000 assets it served, so only the first request for
an asset looks it up. A request that still names no space, such as a delivery request
without the `x-manablox-space` header, is counted apart as unattributed: `GET /usage?scope=instance`
answers it in `unattributed`, outside `metrics`, and it counts toward no usage limit.

**Periods.** A period is a calendar month in UTC, named `YYYY-MM`, or starts on the day
`usagePeriodAnchorDay` sets; see [Usage periods](../configuration/controls.md#usage-periods).

**How counting works.** Each process adds counts in memory, which costs nothing
measurable per request. With `REDIS_URL` set, every process hands its counts to Redis
once a second, and a background job on the management API moves them into the database
once a minute. Without Redis, each process writes its own counts to the database once a
minute. Counts are also handed on when a process shuts down cleanly. A public API or site
process that connects with a read-only database role needs Redis for its counts to reach
the database. The figures in `GET /usage` are up to about a minute behind.

**Request log.** Set `USAGE_REQUEST_LOG=true` (or `control: { usageLog: true }` in a config
file) on a process to log every counted request at info level, with `surface`, `spaceId`,
`status`, `bytes` and `cached`. It is off by default; counting does not need it.

`GET /usage?scope=space:5e2c...&period=2026-09` answers every metric of the scope:

```json
{
  "scope": "space:5e2c...",
  "period": "2026-09",
  "start": "2026-09-01T00:00:00.000Z",
  "end": "2026-10-01T00:00:00.000Z",
  "metrics": {
    "apiRequests": { "counted": 81234, "external": 450000, "total": 531234, "limit": { "max": 1000000, "mode": "soft", "thresholds": [80, 100] }, "state": "ok" },
    "bandwidthBytes": { "counted": 1200000000, "external": 0, "total": 1200000000, "limit": null, "state": null },
    "mails": { "counted": 12, "external": 0, "total": 12, "limit": null, "state": null }
  }
}
```

For `scope=instance` the answer also carries `unattributed`, the counts of every metric
no space could be named for; every other scope answers `"unattributed": null`.

`period` is optional; without it the current period is answered. `counted` is what the
CMS counted, `external` what was reported through `POST /usage/external`, and `total`
their sum. `limit` is the usage limit set at exactly this scope (a space's report does not
show its group's limit), and `state` compares `total` with it: `ok`, `warn` (a threshold
passed), `over` (a soft limit passed) or `blocked` (a hard limit used up). Both are `null`
without a limit at the scope. What the CMS refuses while a metric is `blocked` is described
under [usage limits](../configuration/controls.md#what-happens-when-a-metric-is-blocked).

`POST /usage/external` adds figures the CMS cannot see, such as requests and bytes a CDN
answered from its own cache:

```json
{ "idempotencyKey": "cdn-2026-09-shop-day-12", "host": "shop.example.com", "metric": "bandwidthBytes", "period": "2026-09", "value": 52428800, "mode": "add" }
```

| Field | Meaning |
| --- | --- |
| `idempotencyKey` | Your id for this report, at most 255 characters. It is stored for good, not for 24 hours like the header |
| `spaceId` or `host` | The space, by id or by a host name: one of its site domains or API hosts, or the host of its frontend URL. Send exactly one |
| `metric` | `bandwidthBytes` or `apiRequests` |
| `period` | `YYYY-MM`, as in `GET /usage` |
| `value` | A whole number, 0 or more |
| `mode` | `add` adds `value` to the period's external figure; `set` replaces the figure with `value`, so you can send running totals. Adds received after a `set` count on top of it |

```json
{ "spaceId": "5e2c...", "metric": "bandwidthBytes", "period": "2026-09", "mode": "add", "value": 52428800, "duplicate": false, "external": 104857600 }
```

`external` is the space's external figure for the metric and period after the report. A
repeat with the same key and values changes nothing and answers `"duplicate": true`; the
same key with other values answers 409 `control.idempotency.mismatch`. An unknown space
or host answers 404 `space.notFound`.

**Send only what the CDN served from its cache.** Every request that reaches the CMS,
including CDN cache misses and revalidations, is already counted by the CMS. Report only
the cache hits, or the same traffic is counted twice.

### Events

The CMS records what the external layer may want to react to (a space created, a seat
added, a limit reached) as events in an outbox table. Each event is written in the same
database transaction as its cause, so an action that fails leaves no event and an event
never describes something that did not happen. You can read the events (pull), have
them posted to you (push), or both: both read the same outbox.

| Type | Scope | When | Payload |
| --- | --- | --- | --- |
| `usage.threshold` | where the usage limit is set | Usage reached a threshold of a usage limit, once per scope, metric, period and threshold | `metric`, `threshold` (percent), `level`, `used`, `max`, `period` |
| `limit.exceeded` | where the limit is set | A soft limit was passed. For a count limit, by the action that went over; for a usage limit, when its state became `over` | Count limit: `limit`, `used`, `max`, `spaceId`. Usage limit: `metric`, `used`, `max`, `period` |
| `limit.blocked` | where the limit is set | A hard limit refused an action; at most one per scope and key per hour | Count limit: `limit`, `used`, `max`, `spaceId`. Usage limit: `metric`, `used`, `max`, `spaceId` |
| `feature.denied` | the space, or `instance` | A switched-off feature was attempted; at most one per scope and feature per hour | `feature`, `spaceId` |
| `space.created`, `space.deleted` | the space | A space was created (also by import or `POST /spaces`) or deleted | `spaceId`, `name`, `machineName`, `groupId` |
| `space.groupChanged` | the space | A space joined or left a group, also when its group was deleted | `spaceId`, `from`, `to`: each `{ "id", "externalId" }` or `null` |
| `user.created`, `user.deleted` | `instance` | An account was created (by an admin, by sign-up or by `POST /users/owner`) or deleted | `userId`, `email`, and `role` on creation |
| `seat.changed` | the space | Members were added to or removed from a space; a role change is not a seat change. A deleted account sends one per space it was in | `spaceId`, `change` (`added` or `removed`), `userIds`, `members` (the space's member count afterwards) |
| `domain.added`, `domain.removed` | the space | A site domain or API host was added or removed. Renaming a domain sends both | `spaceId`, `environmentId` and `environment` (the technical name, e.g. `production`) of the environment the host belongs to, `domainId`, `hostname`, `kind` (`site` or `api`), and `locale` for a site domain |
| `domain.verified` | the space | A DNS check found the domain's TXT or CNAME record | `spaceId`, `environmentId`, `environment`, `domainId`, `hostname`, `kind`, and `locale` for a site domain |
| `snapshot.completed` | the space | A snapshot was taken, by hand or on the schedule | `spaceId`, `snapshot` (its id), `trigger`, `size`, `createdAt` |
| `snapshot.failed` | the space | Taking a snapshot failed; nothing was stored | `spaceId`, `trigger`, `error` (the error key) |
| `snapshot.restored` | the restored space | A snapshot was restored | `spaceId` (the restored space), `sourceSpaceId`, `snapshot`, `mode` (`new` or `replace`) |
| `environment.created` | the space | A staging environment was created | `spaceId`, `environmentId`, `machineName`, `from` (the copied environment), `mode` (`config` or `full`) |
| `environment.promoted` | the space | A staging environment was promoted into production | `spaceId`, `environmentId`, `machineName`, `mode`, `status` (`applied`, `partial` or `failed`), `snapshot` (the id, or `null`) |
| `environment.deleted` | the space | A staging environment was deleted | `spaceId`, `environmentId`, `machineName` |
| `instance.stateChanged` | `instance` | The instance `state` control changed, through `PUT /instance/state` or the settings endpoints | `from`, `to`: the stored state, `null` for the default `active` |

**Pull.** `GET /events?after=<seq>&limit=<n>` answers the events after `seq`, oldest
first. `after` defaults to 0 (from the start), `limit` to 100 (at most 1000):

```json
{
  "items": [
    { "seq": 41, "id": "0b9e...", "type": "space.created", "scope": "space:5e2c...", "payload": { "spaceId": "5e2c...", "name": "Shop", "machineName": "shop", "groupId": null }, "createdAt": "2026-09-25T10:00:00.000Z", "deliveredAt": "2026-09-25T10:00:01.214Z" },
    { "seq": 42, "id": "77a1...", "type": "seat.changed", "scope": "space:5e2c...", "payload": { "spaceId": "5e2c...", "change": "added", "userIds": ["a3f0..."], "members": 1 }, "createdAt": "2026-09-25T10:00:00.000Z", "deliveredAt": null }
  ],
  "next": 42
}
```

Store `next` and pass it as `after` on the next call. When nothing is new, `items` is
empty and `next` is the `after` you sent. `seq` grows in commit order, so paging this way
never skips an event. `deliveredAt` is when a push of the event was acknowledged, `null`
before that or without push.

**Retention.** Events are kept for `retention.controlEventsDays` (instance scope, 30 days
by default), whether they were pushed or not; a pull client has that long to catch up. A
job on the management API deletes older ones every hour. The newest event is always kept,
so `seq` never starts over.

**Push.** Set `CONTROL_WEBHOOK_URL` and `CONTROL_WEBHOOK_SECRET` (see
[Environment variables](../configuration/environment.md#control-api)) and the CMS posts
new events to the URL about a second after they happen, in batches of up to 100 in `seq`
order:

```http
POST /manablox/events HTTP/1.1
Content-Type: application/json
X-Manablox-Signature: t=1790330401,v1=5d41402abc4b2a76b9719d911017c592...

{"events":[{"seq":41,"id":"0b9e...","type":"space.created","scope":"space:5e2c...","payload":{"spaceId":"5e2c..."},"createdAt":"2026-09-25T10:00:00.000Z","deliveredAt":null}]}
```

Answer with any 2xx status to acknowledge the batch. Anything else, or no answer within
10 seconds, counts as a failed attempt for every event in the batch, and the CMS tries
again after 5 seconds, then 10, 20 and so on, up to an hour between tries. A background
job also looks for unsent events every minute. An event that failed before is sent on its
own, so one event your endpoint refuses holds the others back only until it failed 10
times; after that it is no longer pushed and stays available to pull. Delivery is at
least once: deduplicate by `id` or `seq`.

The URL is set by the operator, not by editors, but it still goes through the same guard
as workflow requests: redirects are checked hop by hop and the answer is capped. Its own
host is allowed even on a private network, so an internal hostname such as
`http://billing:8080/events` works.

**Verifying the signature.** `X-Manablox-Signature` is `t=<unix seconds>,v1=<hex>`, where
`<hex>` is the HMAC-SHA256 of `<t>.<raw body>` with `CONTROL_WEBHOOK_SECRET` as the key.
Compute it over the raw body bytes, before any JSON parsing, compare in constant time and
refuse old timestamps to stop replays. This is not the format of webhooks and the workflow
_Call an API_ node (`sha256=<hex>` over the body alone, see
[Proving who is calling](../admin/webhooks.md#proving-who-is-calling)): the timestamp is
signed with the body. Both are made by `signBody` of `@manablox/core/node`.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyManablox(header: string, rawBody: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=', 2)));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  const given = Buffer.from(String(parts.v1 ?? ''), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

### Environments

Staging copies of a space and promoting them to production; see
[Environments](../admin/environments.md) for what is copied, the diff and what a promote
changes. Creating and promoting need `features.environments` on for the space (403
`control.feature` otherwise); `limits.environmentsPerSpace` counts the staging
environments of the space, production not included. `<env>` is an environment's
technical name.

`POST /spaces/<id>/environments` copies an environment and answers 201:

```json
{ "from": "production", "machineName": "staging", "name": "Staging", "mode": "config" }
```

```json
{
  "environment": {
    "id": "c1d2...",
    "machineName": "staging",
    "name": "Staging",
    "kind": "staging",
    "createdFrom": "8f3a...",
    "createdMode": "config",
    "createdAt": "2026-09-26T10:15:00.000Z",
    "updatedAt": "2026-09-26T10:15:00.000Z"
  },
  "copied": { "contentTypes": 6, "contents": 2, "menus": 2, "menuItems": 0, "workflows": 1, "webhooks": 1, "designs": 4, "redirects": 3 }
}
```

`from` defaults to `production` and `mode` to `config` (`full` copies the content too, and
the home and 404 nominations with it). `machineName` is lower case and starts with a
letter; `production` and a name the space already uses are refused. `createdFrom` is the
id of the copied environment, `null` for production and after that environment was
deleted; `createdMode` is `null` for production. `copied` counts the rows written per kind.
`GET /spaces/<id>/environments` answers `{ "items": [...] }` with the same environment
objects, production first.

`GET /spaces/<id>/environments/<env>/diff?mode=config` answers the diff described under
[The diff](../admin/environments.md#the-diff):

```json
{
  "environment": "staging",
  "mode": "config",
  "contentTypes": [
    {
      "id": "3b5e...",
      "name": "page",
      "label": "Page",
      "status": "changed",
      "documents": 12,
      "fields": [
        { "name": "rating", "label": "Rating", "status": "removed", "from": "string", "to": null, "documents": 4 }
      ]
    }
  ],
  "changes": [
    { "kind": "menus", "added": 1, "changed": 0, "removed": 0, "items": [{ "status": "added", "id": "9a1c...", "label": "Footer" }], "truncated": false }
  ],
  "breaking": true,
  "confirmRequired": true
}
```

A type's `status` is `added`, `changed`, `removed` or `kept` (removed in staging, still
used by production documents), a field's `added`, `changed`, `removed` or `retyped`.
`documents` counts production documents of the type, or holding a value for the field.
`changes` has one entry per `kind` (`templates` or `contents`, `menus`, `redirects`,
`designs` and the key of every other [data provider](../extending/data-providers.md),
`workflows`) with up to 100 `items`; the promote's `groups` follow the same order. `POST /spaces/<id>/environments/<env>/promote`
with `{ "mode": "config", "confirm": true }` promotes it; `confirm` is needed when the
diff says `confirmRequired` (a breaking config promote, and every full promote), else the
answer is 409 `environment.promote.confirmRequired`. The answer carries `status`
(`applied`, `partial` or `failed`), `snapshot` (the snapshot of production taken first,
or `null`), `groups` with the outcome of each table group (`group`, `status` of `applied`,
`failed` or `skipped`, and the `error` key of a failed one), and the `diff`. A promote that
fails part way still answers 200; check `status`. While it runs, writes to the space's
production environment through the management APIs answer 423 `control.readOnly` with
the reason `promote`; see [Environments](../configuration/controls.md#environments).

`DELETE /spaces/<id>/environments/<env>` deletes a staging environment and answers
`{ "deleted": true }`; production answers 403 `environment.production.undeletable`.
Creating, promoting and deleting are recorded in the audit log with the control actor and
emit `environment.created`, `environment.promoted` and `environment.deleted`. The POSTs
take an `Idempotency-Key` like every other.

### Snapshots

Snapshots are copies of a space's records on the instance's storage; see
[Snapshots](../configuration/controls.md#snapshots) for what they hold, the schedule and
pruning. These endpoints need `features.snapshots` on for the space (403 `control.feature`
otherwise) and a storage driver that can list (400 `snapshot.unsupported`).

`POST /snapshots` with `{ "spaceId": "5e2c..." }` takes one now and answers 201 with its
manifest. `GET /snapshots?spaceId=5e2c...` answers `{ "items": [...] }`, newest first; a
deleted space's snapshots are listed until pruned.

```json
{
  "id": "2026-09-25T10-15-00-000Z",
  "spaceId": "5e2c...",
  "machineName": "shop",
  "name": "Shop",
  "createdAt": "2026-09-25T10:15:00.000Z",
  "trigger": "manual",
  "formatVersion": 5,
  "size": 18342,
  "counts": { "contentTypes": 6, "contents": 42, "assets": 17, "menus": 2, "workflows": 1 }
}
```

`trigger` is `manual` for a snapshot taken by hand (here or in the admin), `scheduled`
for one the `snapshots.interval` took, and `promote` for one taken right before an
environment was promoted. `size` is the compressed export in bytes; asset
files are not in it.

`POST /snapshots/restore` restores one:

```json
{ "spaceId": "5e2c...", "snapshot": "2026-09-25T10-15-00-000Z", "mode": "replace" }
```

| `mode` | What happens |
| --- | --- |
| `new` | The snapshot becomes another space, `<machineName>-restored-<date>`, next to the original. Needs `spaceCreate`; counts against `spaces` |
| `replace` | The snapshot is imported beside the space, takes over its technical name, domains, group and control settings, and the space is deleted. Counts as net zero against the limits |

```json
{
  "mode": "replace",
  "snapshot": "2026-09-25T10-15-00-000Z",
  "sourceSpaceId": "5e2c...",
  "spaceId": "9a41...",
  "machineName": "shop",
  "replacedDeleted": true
}
```

The restored space has a new id in both modes: store `spaceId`. `replacedDeleted` is
`false` only when the old space could not be deleted after the takeover; it then keeps a
`-replaced-` technical name and can be deleted by hand. A restore emits `snapshot.restored`,
with `space.created` for the new space and, for a replace, `space.deleted` for the old one.
An unknown snapshot answers 404 `snapshot.notFound`.
