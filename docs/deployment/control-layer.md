---
title: 'Running under a control layer'
description: 'An overview for operators who run Manablox instances for customers and switch features, limits and state from their own hosting or billing system.'
---

Manablox can run under an **external control layer**: your own hosting panel, billing
system or provisioning script. The layer decides what each instance may do (plans,
prices, trials and customer accounts live there, never in the CMS), and tells the
instance through the control API. The instance stores the values, enforces them and
reports back.

This page walks through the setup in the order you need it. The details are in
[Controls](../configuration/controls.md) (what each control does) and the
[Control API reference](../reference/control-api.md) (every endpoint).

One instance serves one customer. Nothing about the layer changes a self-hosted instance:
without the `control` scope and a key nothing is mounted, and an instance without control
settings behaves as it always did.

## 1. Mount the control API on an internal port

The control API is the server scope `control`. It is in no preset, so a process serves it
only when `SCOPES` names it, and only with a key. Run it as its own process on a port that
only the control layer reaches, next to the management API of the same instance:

```yaml
api-control:
  image: ghcr.io/manablox/cms-api:0.50.0
  environment:
    SCOPES: control
    PORT: "3300"
    DATABASE_URL: ${DATABASE_URL}
    REDIS_URL: ${REDIS_URL}
    AUTH_SECRET: ${AUTH_SECRET}
    CONTROL_API_KEY: ${CONTROL_API_KEY}
    CONTROL_API_ALLOWED_IPS: 10.0.0.0/8
    CONTROL_PROVISIONED: "true"
    TRUSTED_PROXIES: none
```

Keep the port off the internet and off the proxy that serves the admin. Share `REDIS_URL`
with the other processes of the instance: a control write then reaches every process at
once, and usage counts, rate limits and levels are shared.

## 2. Keys and client addresses

Every call sends `Authorization: Bearer <CONTROL_API_KEY>`. To rotate, set the new key as
`CONTROL_API_KEY_NEXT`, switch the layer over, then make it the only key. See
[Authentication](../reference/control-api.md#authentication).

`CONTROL_API_ALLOWED_IPS` narrows the callers further. It reads the client address like
the rate limiter does, so set `TRUSTED_PROXIES` on every process: your proxies' ranges, or
`none` where nothing sits in front. See [Client addresses](./operations.md#client-addresses).

## 3. Provision the instance

Set `CONTROL_PROVISIONED=true` on every process from the first start: sign-up is closed,
the admin shows no install wizard, and no account becomes superadmin on its own. Then:

1. Wait until `GET /control/v1/instance` answers `"health": { "status": "ok" }` with no pending migrations.
2. Apply the plan: `PUT /control/v1/settings?scope=instance` with the features, limits, usage limits, rate limits and retention the customer gets. `PUT` replaces the whole set atomically, so the same call applies a plan change later.
3. Optionally create spaces: `POST /control/v1/spaces` with a starter, locales, a group and API hosts.
4. Create the owner: `POST /control/v1/users/owner` with the customer's email and name and an `Idempotency-Key`. Send the returned `setPasswordLink.url` yourself, or pass `"sendMail": true` when the instance has mail.

The owner is a superadmin, owner of every space, and can do everything a self-hosted
superadmin can, except change control values: those are read-only in the admin for
everyone. See [Provisioning a new instance](../reference/control-api.md#provisioning-a-new-instance).

Settings apply to three scopes: the instance, a group of spaces (`group:<id>` or
`group:ext:<your id>`) and one space. Groups exist only in the control API; editors never
see them. See [Scopes](../configuration/controls.md#scopes).

## 4. Receive events

The instance records what the layer may want to react to (a space created, a seat added, a
usage threshold reached, a limit refusing an action, a domain verified, a snapshot taken)
in an outbox, in the same transaction as the cause. Read it either way, or both:

- **Push:** set `CONTROL_WEBHOOK_URL` and `CONTROL_WEBHOOK_SECRET`. The instance posts batches in order, signed with `X-Manablox-Signature`, and retries with backoff. Answer 2xx to acknowledge.
- **Pull:** call `GET /control/v1/events?after=<seq>` and store `next`. Events are kept for `retention.controlEventsDays` (30 days by default).

Delivery is at least once, so deduplicate by `id` or `seq`. See
[Events](../reference/control-api.md#events).

## 5. Count usage, including your CDN

The instance counts API requests, bandwidth, workflow runs, form submissions, mails, AI
calls and uploads per space and period, whether or not a limit is set. Read them with
`GET /control/v1/usage?scope=&period=`, and align periods with your billing day through
`usagePeriodAnchorDay`.

Requests a CDN answers from its own cache never reach the instance. Report them with
`POST /control/v1/usage/external` (by space id or host, with your own idempotency key),
and send **only the cache hits**: every request that reaches the instance is counted
already. See [Usage](../reference/control-api.md#usage).

Usage limits (`usage.<metric>`) then refuse or only report once a period's usage passes
them, depending on their mode. See [Usage limits](../configuration/controls.md#usage-limits).

## 6. Set the state

`PUT /control/v1/instance/state` switches the whole instance:

| Status | For example | Effect |
| --- | --- | --- |
| `active` | Normal operation | Nothing is restricted |
| `readOnly` | An unpaid invoice | Writes are refused; delivery and sites keep serving |
| `suspended` | A cancelled account | The admin shows only your message; delivery and sites answer 503 |

The control API, sign-in and the health endpoints keep working in every state, so the same
call lifts it again. A space or a group can be set read-only through the settings
endpoints, for example a space over its limits after a downgrade. Suspending and lifting a
suspension purge every cached delivery and site page through the `cache:purge` hook, so a
CDN purge handler (see [Caching](../delivery/caching.md)) drops them too. See
[Instance state](../configuration/controls.md#instance-state).

## 7. Serve several spaces and custom domains

- **Public API:** one unpinned public API process serves every space of the instance, each on its own API hosts (`POST /spaces` with `apiHosts`, `PUT /spaces/<id>/api-hosts`). See [Which space a request reads](../delivery/public-api.md#which-space-a-request-reads).
- **Domains:** with a shared proxy that issues certificates on demand, switch on `domains.requireVerification`, so a customer's new domain serves only after a DNS record proves ownership. Set `DOMAIN_CNAME_TARGET` to let customers `CNAME` to your proxy instead. See [Custom domain verification](../configuration/controls.md#custom-domain-verification).
- **Links:** set `admin.links` (`upgrade`, `billing`, `support`, `docs`) so locked features and usage banners send people to your pages, and `admin.banners` for notices. See [Admin messages](../configuration/controls.md#admin-messages).

## 8. Staging environments

A space can have staging environments next to production, where the customer changes
the content model, designs and content before promoting them. Offer them per plan with
`features.environments` and `limits.environmentsPerSpace` (staging environments per
space; production is not counted, so `0` allows none). Staging rows count toward no other
limit; a promote checks production's limits for what it adds.

The layer can list, create, diff, promote and delete environments through
`/control/v1/spaces/<id>/environments`, and hears about them through the
`environment.created`, `environment.promoted` and `environment.deleted` events. While a
promote runs, writes to the space's production environment answer 423
`control.readOnly` with the reason `promote`; reads, delivery and sites keep serving. See
[Environments](../reference/control-api.md#environments) and
[Environments in Controls](../configuration/controls.md#environments).

## 9. Move a customer from SQLite to Postgres

A small plan can run on SQLite and a larger one on Postgres. To move an instance, set it
read-only, run `manablox migrate-db --to <postgres-url>`, switch `DATABASE_URL`, start it
and lift read-only. Everything moves, ids and links included. See
[Moving from SQLite to Postgres](./sqlite-to-postgres.md). On Postgres, run the migrations
with an owner role and the CMS with an app role that cannot rewrite the audit log; see
[Database roles](./database-roles.md).

## What stays in your layer

Plans, prices, trials, billing, invoices, customer accounts and sign-up, creating the
instances themselves (containers, databases, domains, CDN), backups of whole instances,
translating plans into control values, reacting to events, and CDN log processing. The
CMS knows features, limits, usage, rate limits, retention, messages and events, and
nothing else.
