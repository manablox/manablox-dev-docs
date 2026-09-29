---
title: 'Webhooks'
description: 'The calls a space receives and the calls it makes: a URL, a way of proving who is calling, and a log of what went over it.'
---

A webhook is one system telling another that something happened. A space does both:
**incoming** webhooks give another system a URL to call, and a call on one starts every
workflow pointed at it; **outgoing** webhooks call a URL of yours when content changes.

**Webhooks** in the sidebar has a tab for each direction. They are the same thing pointed
opposite ways, which is why they share a page: a name, a switch, a way of proving who is
calling, and a log of every call that went over the endpoint.

## The webhooks plugin

All of it is the webhooks plugin, `@manablox/plugin-webhooks` (plugin id `webhooks`).
`manablox create` offers it in its feature choice (`--webhooks`, or `webhooks` in
`--features`), and `manablox plugin install webhooks` adds it to an existing instance. An
instance that does not load it has no webhooks: no **Webhooks** in the sidebar, no
webhook procedures, no incoming address and no webhook section in a transfer.

The plugin enhances the [workflows plugin](./workflows.md#the-workflows-plugin): with both
loaded, a call on an incoming endpoint starts and aborts the workflows pointed at it, and
workflows get the webhook trigger and abort trigger. Each works without the other. Without
the workflows plugin, see [Without workflows](#without-workflows).

To add it to an instance, add `@manablox/plugin-webhooks` to its dependencies, with the
same version as the other `@manablox` packages, and load it in the management config's
`plugins`:

```ts
import { defineConfig } from '@manablox/core';
import { webhooksPlugin } from '@manablox/plugin-webhooks';
import { workflowsPlugin } from '@manablox/plugin-workflows';

export default defineConfig({
  // ...
  plugins: [
    workflowsPlugin(),
    // Outgoing webhooks, and incoming ones that start and stop workflows.
    webhooksPlugin(),
  ],
});
```

`webhooksPlugin()` takes no options. The public delivery instance needs nothing: incoming
calls arrive at the management server. Then run `manablox migrate`: the plugin's baseline
migration creates its tables, `webhooks` and `webhooks_deliveries`. Removing the plugin
leaves the tables in place.

The plugin owns its [permissions](#permissions), the flag `features.plugins.webhooks`,
`limits.plugins.webhooks.count`, `rateLimits.plugins.webhooks.incoming` and `.outgoing` and
`retention.plugins.webhooks.deliveriesDays` (see
[Controls](../configuration/controls.md#the-webhooks-plugin)), the procedures under
`plugins.webhooks.*` (`list`, `get`, `create`, `update`, `setEnabled`, `delete`,
`deliveries`, `retry`, `test`), the `webhooks:deliver` job, its [hooks](#hooks), the error
keys `plugins.webhooks.*` (see [Error keys](../reference/errors.md#plugin-keys)), the audit
kind `webhooks.webhook`, the code resource kind `webhooks.webhook` (see
[Resources in code](../configuration/resources-in-code.md#declaring-an-endpoint)) and the
webhooks section of `/llms.txt`. Its endpoints travel in a transfer as the plugin section
`webhooks.webhooks`. Another plugin reaches the endpoint service with
`plugins.get('webhooks')`, which answers `{ webhooks: WebhookService }`.

## Incoming

Create one and it gets a URL of the form:

```
https://your-api.example.com/plugins/webhooks/in/<space id>/<slug>
```

It is an address of the management server, not of the public delivery API. It takes no
session or API key: the endpoint's own [way of proving who is calling](#proving-who-is-calling)
decides. Calls are limited per client IP, 600 a minute by default
(`rateLimits.plugins.webhooks.incoming`), before anything is looked up.

The slug comes from the name it was created with and never changes afterwards, so renaming
the endpoint does not invalidate a URL you have already handed out. Copy it from the list,
or from the trigger in the workflow editor.

An endpoint of a staging environment names the environment between the space and the slug,
`/plugins/webhooks/in/<space id>/staging/<slug>`, and starts that environment's workflows
only. It answers 404 while the space's `environments` feature is off.

Nothing runs on its own. An incoming endpoint is a doorway: a workflow whose trigger is
_on a webhook_ names the endpoint, and every enabled workflow that names it starts when a
call arrives. Several workflows may hang off one endpoint, and each may filter on what
arrived, so one URL from a service that sends a dozen kinds of event can feed a workflow
per kind. A workflow can also name an endpoint in an
[abort trigger](./workflows.md#abort-triggers): a call to it then stops that workflow's
runs that are still going, before any new runs start. The list marks an endpoint no
workflow is waiting on, since that is almost always a half-finished setup rather than a
choice, and **Connect to workflow** on a row opens the new-workflow dialog with that
endpoint already picked.

What arrived is available to every node of the run:

| Placeholder | What it holds |
| --- | --- |
| `{{ payload.body }}` | The body, parsed. An object when it was JSON, form fields when it was a form, `{ raw }` otherwise. |
| `{{ payload.query.name }}` | One value from the query string. |
| `{{ payload.method }}` | The method the call used. |
| `{{ headers.name }}` | A request header, lower-cased. |
| `{{ webhook.name }}` | Which endpoint was called. |

The endpoint answers `202` as soon as the runs are queued, with the delivery id, how many
workflows it started (`runs`) and how many active runs it aborted (`aborted`). It does not
wait for them: a caller that needs to know how a run went reads the run, or is called back
in turn by an outgoing webhook at the end of it.

Bodies larger than 1 MB are refused, and only the methods the endpoint accepts get
through. POST alone is the default. The body is read raw, so a signature covers the exact
bytes that were sent.

### Without workflows

Without the workflows plugin, an incoming call is still received, checked, logged and
handed to the [`webhooks:received` hook](#hooks); it answers `202` with `runs` and
`aborted` at `0`. The page says that calls are received and logged but nothing runs them
unless a plugin listens, and **Connect to workflow** is not offered. A plugin of your own
can act on calls through the hook.

## Outgoing

An outgoing endpoint is a URL and the content events it cares about: created, updated,
saved, deleted, published, unpublished. Nothing chosen means every event. The body is
JSON:

```json
{ "event": "content.published", "payload": { "id": "...", "permalink": "..." }, "at": "..." }
```

The event is also in `x-manablox-event`, and each call carries its own id in
`x-manablox-delivery`, so a receiver can recognise a repeat. Extra headers can be added
per endpoint for anything else the far end wants.

Deliveries run in the background, one job per endpoint per event, so a save never waits
for a call to go out and a slow endpoint holds nothing up. A call that fails is retried by
the queue's own backoff. **Send test** posts a made-up call so an endpoint can be proved
before any content depends on it, and any call in the log can be sent again by hand.

## Proving who is calling

Both directions ask the same question, and neither stores a secret beside the endpoint.
Every mode names a credential in the space's vault, the same vault workflow nodes use, and
one can be created straight from the webhook form.

| Mode | Credential | Incoming | Outgoing |
| --- | --- | --- | --- |
| Nothing | none | Anyone who knows the URL may call it | No authentication is sent |
| Signature | Signing secret | The body is checked against the signature header | The body is signed |
| Token in a header | API key | The header the credential names is compared | The header is sent |
| Username and password | Username and password | `Authorization` is compared | `Authorization` is sent |
| Bearer token | Bearer token | `Authorization` is compared | `Authorization` is sent |
| OAuth 2 | OAuth 2 refresh token | Not available | A fresh access token per call |

A signature is an HMAC over the exact bytes of the body, in `sha256`, `sha1` or `sha512`,
written as `sha256=<hex>`, as bare hex, or as base64. Manablox's own format, and the
default, is `sha256=<hex>` in `X-Manablox-Signature`; the workflow _Call an API_ node signs
its body the same way when it has a secret. That is how GitHub, Stripe and most
other services sign theirs, so an incoming endpoint can usually be matched to whatever the
sender already does. On the way in, both spellings of the same digest are accepted, so a
service that sends bare hex where the endpoint says prefixed still gets through. Every
comparison is constant-time.

The events an instance pushes to its control layer are signed in another format,
`t=<unix seconds>,v1=<hex>` over the timestamp and the body, so a captured push cannot be
replayed later; see [Verifying the signature](../reference/control-api.md#events). Both are
the same HMAC (`signBody` of `@manablox/core/node`), only what is signed and how it is
written differ.

Leaving an incoming endpoint on _nothing_ means anyone who learns the URL can start its
workflows. It is there for an install where the endpoint is not reachable from outside;
anywhere else, pick a mode.

Deleting a credential does not delete the endpoints that used it. They stay, and their
next call fails saying so, rather than quietly going out unauthenticated or letting a
stranger in.

## The log

Every call is recorded, both directions, whether or not it was let through. A call turned
away for a wrong signature is in the log as a `401` with the reason, which is the entry
you actually want when an integration is silently doing nothing. An entry opens to show
what was sent or received and the headers that came with it; the headers that carry the
secret itself are not kept. An incoming entry says which workflow runs it started.

The newest 200 calls per endpoint are kept, and older ones are dropped as new ones arrive.
`retention.plugins.webhooks.deliveriesDays` drops calls older than that many days too, in
every environment; the 200 stay the ceiling.

## Permissions

`webhooks:read` sees the endpoints and their logs; `webhooks:write` creates, edits, tests
and switches them. Owners and admins hold both; editors hold `webhooks:read`. An incoming
endpoint can start a workflow, and an outgoing one calls another system on behalf of the
space, which is why writing one is not an editor's permission by default.

The two permissions are the plugin's, in the group Webhooks. Every change to an endpoint is
an entry in [Activity](./activity.md) on `webhooks.webhook` (`webhooks.webhook.create`, `update`, `setEnabled`, `delete`, `test`, and `received` for an
incoming call).

## Hooks

The plugin declares two [hooks](../extending/hooks.md). A handler of a `before` hook
throws to refuse; a thrown `ManabloxError` keeps its key and status.

| Hook | Payload | When |
| --- | --- | --- |
| `webhooks:beforeCreate` | `{ spaceId, direction, name }` | Before an endpoint is created: by hand, by a space import (before anything is written), by a workflow import that creates the endpoints it names, and for code endpoints `manablox sync` creates, where a refused one is skipped and logged |
| `webhooks:received` | `{ webhook: { id, spaceId, environmentId, name, slug }, payload: { body, query, method }, headers }` | After an incoming call passed its checks, before the workflows plugin starts or aborts runs. Observe only: a handler's error is logged, never answered to the caller. `headers` are lower-cased, without the ones that carry the secret |

Their context is `{ manablox, spaceId }`. The payload types come with
`@manablox/plugin-webhooks` (`WebhookReceived` is the one of `webhooks:received`); a plugin
that registers a handler imports the package so the hook names are known.

## Moving a space

Webhooks travel with a [space export](./transfer.md), as the plugin section
`webhooks.webhooks` (the core section `webhooks` in files before format 12, which still
import), but the credential vault does not. An endpoint that authenticates therefore
arrives switched off with nothing behind the mode it claims: give it a credential on the
new instance and switch it back on. An endpoint set to _nothing_ arrives as it was.
Endpoints can be picked one by one, like content types.

## Environments and snapshots

Endpoints belong to an [environment](./environments.md). A new staging environment gets a
copy of production's endpoints, switched off, so a staging copy never answers or calls out
until it is switched on. A promote never writes production's endpoints: it matches
staging's endpoints to production's by direction and slug, so a promoted workflow points at
production's endpoint of the same slug. A [snapshot](./backups.md) restored on the same
instance switches back on the endpoints whose credential secret came back with it.
