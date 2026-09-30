---
title: 'Premium plugin licenses'
description: 'What an instance with the website or AI plugin needs to run: none on a development instance, license keys in production, the variables, outbound HTTPS and what it sends.'
---

The website plugin (`@manablox/plugin-website`) and the AI plugin (`@manablox/plugin-ai`)
are premium plugins. A development instance (below) runs them without any key; a production
instance needs a license key from a subscription, bought on the license portal
(`https://licenses.manablox.io`), one seat per production instance. The core, workflows and
webhooks need none. The user guide explains buying, trials and seats; this page is what a
deployment needs.

Both plugins require `@manablox/plugin-license`, which holds the instance's activations and
leases. Add `licensePlugin()` to every config that loads a premium plugin: the management
config, the public API's, and the site process's where the website plugin runs. A project
made with `manablox create` has it when a premium plugin was picked.

## How the check works

- Each key is activated for the instance on the license server, which answers with a lease signed with Ed25519: the products, the kind (production, development or hosted) and an expiry.
- Every process verifies the stored leases offline, with the public keys bundled in `@manablox/license`. Nothing on the request path calls the license server.
- The management worker refreshes each lease once a day (the `license:refresh` maintenance task runs every six hours). A lease lasts 14 days past its last refresh at most, and 14 days past the end of the period paid for.
- On a production instance, a product that no valid lease covers is locked through a [feature ceiling](../extending/controls.md#feature-ceilings): its features are off and shown with a lock and a buy link. The server keeps booting, the data stays, and a valid lease unlocks everything again. On a development instance it is `development` instead and nothing locks.

What locks per plugin:

| Plugin | Locks | Keeps working |
| --- | --- | --- |
| AI | the whole plugin (`features.plugins.ai`): its procedures and routes answer 403 `control.feature`, the workflow step and the AI buttons are refused | providers, keys and the generation history |
| Website | designing (`features.plugins.website.design`), site domain changes (`.domains`) and form setup (`.forms.config`) | the designed sites keep rendering on their domains, forms keep taking submissions |

## Environment

Keys are secrets: they belong in the environment, never in `manablox.config.ts`. The
management API activates and refreshes, so it reads the keys, the server and the kind. The
public API and the site process only read the leases from the database; they need
`MANABLOX_LICENSE_DEV_HOSTS` when it is set, since a development lease checks request
hosts on every process.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MANABLOX_LICENSE_KEYS` | none | Optional on a development instance. The license keys, comma separated (`MBX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX,MBX-...`). One key per subscription; the instance gets what all of them cover |
| `MANABLOX_LICENSE_SERVER` | `https://licenses.manablox.io/api` | The license server's API |
| `MANABLOX_LICENSE_KIND` | `auto` | `auto`, `production` or `development`: how keys activate, and whether the instance counts as a development one (below) |
| `MANABLOX_LICENSE_DEV_HOSTS` | none | Preview hosts that count as private, comma separated, each a hostname or `*.suffix` |

Keys added in the admin (Settings > Licenses) are stored in the database, encrypted with
`AUTH_SECRET`, beside the keys from the environment, which the admin shows read-only.

## Development instances

An instance is a **development instance** when `NODE_ENV` is not `production` and every
hostname of the instance is private: its configured URLs (`server.publicUrl`,
`server.adminUrl`, `auth.baseUrl`), every space's URL and API hosts, and the website's
domains. Private are `localhost`, names under `.localhost`, `.test`, `.local` and
`.internal`, loopback, RFC 1918, link-local and unique-local addresses, and
`MANABLOX_LICENSE_DEV_HOSTS`. `MANABLOX_LICENSE_KIND=development` makes it one whatever
`NODE_ENV` says, but the hostnames still have to be private; `production` makes it none.
Anything else is a production instance.

- A premium product that no valid lease covers is `development` there, not `missing`:
  nothing locks, `manablox license status` exits 0, and the admin shows "Development
  instance: the premium plugins run without a production license, on private hosts only."
- The unlock serves private hosts only. A request over a public `Host` is refused: AI
  answers 403 `plugins.ai.license.host`, the site process a plain 403 page ("This site runs
  on a development license").
- The classification is evaluated at boot, after every license change, as soon as a space
  or an API host is added, removed or given another URL, and every ten minutes. Once a
  public hostname appears (a site domain, a space URL, an API host), or the instance starts with
  `NODE_ENV=production`, the products fall back to `missing` and lock until a key covers
  them.

A key still works on a development instance, but it is optional. `auto` activates it as
`development` there: that takes no seat, covers only an instance whose hostnames are all
private, and refuses a public `Host` the same way. On any other instance `auto` activates as
`production`, which takes a seat of the subscription and covers every host
(`manablox license activate --production` forces it).

## Network

The management worker needs outbound HTTPS to `MANABLOX_LICENSE_SERVER`, port 443, once it
has a key: it activates keys at boot and when the keys change, and refreshes the leases. An
instance without a key calls nothing, so a keyless development instance needs no outbound
access. The public API
and the site process only read the leases from the database and call nothing. When the
server cannot be reached the instance keeps running on its leases and the admin shows a
banner; the features lock only once a lease has run out, at most 14 days after its last
refresh.

Offline and air-gapped instances are not supported: without a refresh a lease runs out
after 14 days.

## What an instance sends

An instance without a key sends nothing to the license server. Each activation and refresh sends the key (activation only), the key's refresh secret, the
instance id (a random id made at the first boot), the activation kind, the Manablox and
plugin versions, the instance's hostnames as listed above and the admin URL's hostname as the
instance's name. It sends no content, no users and nothing else from the database.

## Several processes and copies

Only the management worker talks to the license server, under the jobs lock, so a
multi-process instance refreshes once; every process reloads the leases when one changes.
A backup restore keeps the instance id and the activations. When two copies of one
instance refresh (a restored backup beside the original, a copied database), the license
server flags a conflict: the copy runs until its lease runs out, then locks until someone
runs `manablox license activate` there, which takes a seat for production.

Instances on Manablox Cloud run on platform keys provided with the instance; nothing here
applies to them.

## The license server

The license server and its customer portal run at `licenses.manablox.io`; an instance never
runs them. They live in their own repository, manablox-license-portal, and ship as the
images `ghcr.io/manablox/license-server` (the API, port 3100, a health check on `/health`)
and `ghcr.io/manablox/license-portal` (the portal behind nginx, which proxies `/api/` to the
server). An instance only needs to reach the server's API at `MANABLOX_LICENSE_SERVER`.
