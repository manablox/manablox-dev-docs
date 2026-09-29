---
title: 'API keys'
description: 'Long-lived credentials for programs (a preview server, a build, an integration) and how to restrict one to certain spaces and permissions.'
---

**Settings > API keys** issues long-lived credentials for headless consumers, presented
as an `x-api-key` header on the management API. A key acts **as the user who issued it**,
so it can do at most what that user can do. The secret is shown once, at creation, and
stored only as a SHA-256 digest: there is no way to recover it afterwards.

```sh
curl http://localhost:3000/api/v1/spaces/list -X POST \
  -H 'x-api-key: <the key>' -H 'content-type: application/json' -d '{}'
```

When you need one:

| Use | Notes |
| --- | --- |
| Preview drafts from a server-rendered frontend | The key plus `x-manablox-preview`. Keep it on the server; see [Preview](../delivery/preview.md) |
| A build step that reads the content model | `manablox-sdk types` against a public instance needs none; against a management instance it needs a key |
| An integration that writes content | Every management procedure. See the [HTTP API reference](../reference/http-api.md) |

The **public API needs no key**; it is anonymous by design.

## Restricting a key to spaces

Tick the spaces it may act in; leave every box unticked for a key that reaches
everywhere its owner does. A restriction only ever narrows:

- it cannot widen a key beyond its owner's own memberships;
- it binds a superadmin too: a restricted key held by a superadmin still cannot touch a space outside its list;
- it fails every instance-wide operation, because those have no space to be inside;
- `spaces.list` returns only the spaces the key is allowed in.

You may only confine a key to spaces you can already read, so a restriction cannot be
used to name a space you have no business knowing about.

## Restricting a key to permissions

A key can also be restricted to permissions, with the same toggles a role has. See
[Roles](./users-and-roles.md#roles), including content actions for every type or type by
type, across the spaces the key reaches. Leave it at *Everything I may do* for a key that
does whatever your role allows. At use, the key's grants and the owner's role are
intersected: a grant the role lacks does nothing, a broad content grant on one side and a
typed one on the other leaves the typed one, and a superadmin's key is held to the list
like anyone's. A typed grant naming a type outside the key's spaces is refused
(`apiKey.validation.failed`).

A key for a preview server therefore wants: the one space, `content:read` and
`asset:read`, nothing else.

## Expiry and revocation

A key may carry an expiry date. An expired key stops working at once, and a maintenance job
on the management instance deletes it within the hour, recorded in the activity log.
**Revoke** deletes the key. A revoked key is never listed
again or re-enabled, so keeping a disabled row would only leave a secret digest lying
around. Issue a key per consumer and revoke individually rather than sharing one.
