---
title: 'Security'
description: 'What the instance defends against on its own, what it leaves to configuration, and the settings that decide which is which.'
---

This page says what Manablox does about security without being asked, what it does only
once configured, and what it deliberately does not promise. The short checklist for a new
deployment is in [Operations](./operations.md#security-checklist); this is the reasoning
behind it.

## Who holds what

Three levels of caller, because the answer to "how bad is this" depends on which one it is.

| Caller | Reaches | Notes |
| --- | --- | --- |
| Anonymous | `/api/auth/*`, incoming webhook endpoints (`/plugins/webhooks/in/*`, the webhooks plugin), the delivery surfaces, media | Everything a public instance serves |
| Editor | Everything above, plus writing workflows and templates | A workflow chooses an outbound URL, so an editor can aim a request |
| Space administrator | Everything above, plus importing an archive and configuring AI providers | Holds the credentials a space runs on |

An editor is trusted with content, not with the machine. Most of what follows exists
because those are not the same thing.

## Sign-in

Passwords are hashed with Argon2id at the OWASP parameters. There is no bcrypt path and
therefore no silent truncation at 72 bytes.

The credential-presenting routes under `/api/auth/` sit behind their own limiter, far
tighter than the instance-wide one:

- Two buckets per attempt: the client address, and the account the attempt names. One
  address trying a thousand accounts is stopped by the first; a thousand addresses trying
  one account are stopped by the second.
- Five attempts, then a delay that doubles with each further failure up to fifteen
  minutes. A refused attempt answers `429` with `Retry-After`.
- A success clears both buckets, so mistyping a password twice is not a lockout.
- `get-session` and the other read routes are not guarded, since the admin polls them.

Every refusal is written to the audit log as `session.signInFailed`, with the address, the
user agent and the account that was named. A key presented on `x-api-key` and refused is
recorded as `apiKey.rejected` with the key's public prefix. Neither entry ever carries a
password or a key secret.

The limiter is in process. A deployment running several nodes should put a shared limiter
in front of it, or the budget is multiplied by the number of nodes.

## Outbound requests

A workflow is written by an editor, not reviewed as code, so a request one makes is
treated as a request from a stranger. `createSafeFetch` guards every outbound call the
workflow engine (the [workflows plugin](../admin/workflows.md#the-workflows-plugin)), the
webhook service (the [webhooks plugin](../admin/webhooks.md#the-webhooks-plugin)) and the
AI providers make:

- Only `http` and `https`.
- The host is resolved and refused if it lands on a private, loopback, link-local or
  multicast address. `169.254.169.254`, the cloud metadata endpoint, is covered by the
  link-local rule.
- Redirects are followed by hand so every hop is checked again, not just the first.
- A redirect to another origin drops `Authorization` and `Cookie`, so a credential meant
  for one host does not travel to another.
- The response body is read through a counter and refused past the configured size rather
  than filling the heap.

Set `NET_ALLOW_PRIVATE_NETWORK=true` (`net.allowPrivateNetwork` in the config file)
only on an isolated install where reaching an internal host is the point. It turns the
guard off entirely. `net.maxResponseBytes` and `net.maxRedirects` set the other limits.

AI provider calls (the [AI plugin](../admin/ai.md#the-ai-plugin)) run behind the same
guard. A self-hosted model usually sits on the private network, so the plugin's
`allowedHosts` option, read from `AI_ALLOWED_HOSTS`, names the hosts that may be reached anyway
(`ollama`, `localhost:11434`): those exact hosts, and only for AI calls, rather than the
whole network for everything. Anyone who may configure providers in a space can point a
self-hosted provider at any address, so list only the model servers themselves.

What this does not promise: the name is resolved for the check and resolved again for the
connection, so a name that answers differently between the two is a window this does not
close. The guard stops a workflow aimed at an internal host on purpose, which is the case
that matters; it is not a defence against an attacker who controls a DNS server.

## Secrets at rest

AI provider keys and credentials are stored encrypted, never in the clear. The
column holds `v2.<iv>.<tag>.<ciphertext>` in base64url: AES-256-GCM with a fresh 12-byte
nonce per write.

The key is derived from `AUTH_SECRET` with HKDF-SHA256 under a fixed label, so the
encryption key is not the value anything else deriving from the same secret would arrive
at.

Losing `AUTH_SECRET` loses every secret stored this way. That is the intended failure, not
a bug: they are re-entered, not recovered. Back the secret up with the same care as the
database.

## What is recorded

Sixty-one actions are audited, covering every write to content, types, spaces, members,
menus, roles, workflows, webhooks, credentials, assets, users, API keys and AI providers,
plus sign-ins and their failures. Each entry carries the actor, the target, the request
id, and the address and user agent where a request supplied them. The table refuses
updates and deletes, so the repository offers neither. On Postgres with
[separate database roles](./database-roles.md), the role the CMS connects as has no right
to update or delete audit entries either.

Read the log in the admin under Activity, or over the `audit` RPC.

## Uploads

An uploaded file's bytes are sniffed and the declared MIME type is checked against what
they actually are, before anything is stored. A file is refused if the detected type is
not on the space's allow list, or if it is larger than the space's limit narrowed by the
instance's.

Image transforms are signed. An unsigned transform request is refused rather than
computed, so the media endpoint cannot be used as a resize amplifier.

## Imports

A space archive is a zip, and inflating one is what a reader does before it knows how much
there is. Three ceilings apply:

- The upload is refused past 2 GB on the wire.
- Any one entry is refused past 512 MB inflated.
- The archive as a whole is refused past 4 GB inflated.

Sizes are counted as the bytes arrive rather than read from the zip's own headers, which a
crafted archive states wrongly. Entries are selected by name against the manifest, so an
entry naming a path outside the asset prefix is ignored rather than written.

Importing requires superadmin.

## The browser surface

**CORS.** The management API answers only the origins `CORS_ORIGINS` names, with
credentials. A wildcard origin is never credentialed: browsers refuse that combination,
and `validateConfig` refuses it at boot rather than letting it look configured. The public
API is anonymous and read-only, so it answers any origin without credentials.

**CSP.** The admin's own HTML carries a Content-Security-Policy. It is
`Content-Security-Policy-Report-Only` by default, so turning it on cannot break an admin
that loads something unanticipated; watch the browser console, then set
`server.csp.reportOnly` to `false`. The policy closes `script-src` to `'self'`, refuses
objects, and refuses to be framed at all.

Two directives stay open by default because neither can be settled from configuration:
`frame-src`, since the visual editor frames whatever URL a space names, and `img-src`,
since assets may live in a bucket on another origin. Narrow both with
`server.csp.frameSrc` and `server.csp.imgSrc` once you know your own deployment.

**Live preview.** The editor and the previewed page exchange messages over `postMessage`
and each checks the other's origin on every message, in both directions. The editor also
checks that the message came from its own frame. A page that does not name the admin's
origin receives nothing.

**Realtime.** The admin's event stream re-resolves the caller on every heartbeat, not only
when the stream opens. A session signed out elsewhere, a membership revoked or an account
banned closes the stream within twenty-five seconds rather than at the end of the browser
tab's life.

## What is not defended

- **Code-defined resources.** Workflows, webhooks and templates defined in code are
  TypeScript the operator writes and the process imports. The trust boundary is the
  project's code, not the runtime; nothing sandboxes them, and nothing is meant to.
- **A superadmin.** The role can do everything by design, including importing an archive
  and reading every space. Restrict what a key can do rather than sharing an account.
- **Denial of service.** The limiters bound abuse of a single instance; capacity is a
  deployment concern.

## Reporting

Report a security issue privately, through GitHub's private vulnerability reporting on
the repository it concerns (**Security > Report a vulnerability**, for the CMS on
[manablox-cms](https://github.com/manablox/manablox-cms/security)), not in the public
issue tracker. The CMS's [security policy](https://github.com/manablox/manablox-cms/security/policy)
(its `SECURITY.md`) has the details.
