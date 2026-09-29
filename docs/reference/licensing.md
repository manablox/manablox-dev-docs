---
title: 'Licensing'
description: 'Manablox is MIT licensed; the premium plugins are under a commercial license. What that means for you.'
---

Manablox is open source under the MIT licence. The CMS, the admin interface, the
CLI, the SDKs, the workflows, webhooks and license plugins and everything else in the
[CMS repository](https://github.com/manablox/manablox-cms) are MIT. The premium plugins,
which live in repositories of their own, are under the Manablox Commercial Plugin License.

This page is a plain summary. The binding texts are the CMS repository's
[`LICENSE`](https://github.com/manablox/manablox-cms/blob/main/LICENSE) and the `LICENSE`
and `COMMERCIAL.md` files each premium package carries, and they win wherever this page is
less precise.

## The short answer

You may use Manablox for anything, including commercially. Install it, run it in
production, run it for clients and charge them, change it, fork it, embed it in
your own product, closed source or not. The one condition of the MIT licence is
that its copyright and permission notice travel with copies of the code.

The premium plugins (website and AI) are source-available: you may read them and
use them in development freely, and production use needs a subscription.

## What you may do without asking

Install it, self host it, run it in production, run it for a client, run it as a
hosted service for many customers, charge whatever you like for any of that.

Build websites and applications against its APIs. Those are yours, entirely.

Write extensions, field types, plugins and admin extensions under any licence,
open or proprietary, and sell them.

Start a project with `manablox create` or `manablox frontend`. The generated
project is yours.

Modify Manablox itself and keep the changes private, or ship it inside a
closed-source product. The MIT licence asks nothing in return beyond keeping the
notice.

## What stays the same

Manablox sends an `X-Powered-By: Manablox` response header and shows the
Manablox logo in the administration interface. Both are part of the product and
are not settings; the MIT licence does not require them, so a modified version
may change them.

The licence grants no trademark rights. A fork needs its own name and logo, and
may not be presented as the original or as endorsed by the project. See
[`TRADEMARKS.md`](https://github.com/manablox/manablox-cms/blob/main/TRADEMARKS.md).

## Which packages are under which licence

MIT: every package and app of the CMS repository, among them `@manablox/core`,
`db`, `services`, `server`, `auth`, `fields`, `media`, `storage`, `cache`,
`jobs`, `api-rpc`, `api-graphql`, `api-public`, `cli`, the SDKs
(`public-sdk`, `nuxt`, `live-preview`, `admin-plugin`, `admin-sdk`), the workflows plugin
`plugin-workflows`, the webhooks plugin `plugin-webhooks`, the license plugin
`plugin-license` with its key format `license`, and the admin interface. These
documentation pages and the user guide are MIT as well.

The Manablox Commercial Plugin License, source-available, because they are paid plugins:

the AI plugin `@manablox/plugin-ai`, and the website plugin `@manablox/plugin-website` with
its libraries `@manablox/site` and `@manablox/site-renderer` and the site process. You may
read and change their code for your own instances and use them in development without
limit, each instance with a license key; production use needs a subscription for that
instance. You may not redistribute changed copies, resell them, or remove or get around the
license check. See [Premium plugin licenses](../deployment/licenses.md).

Every package carries its own `LICENSE` file and `license` field; the premium ones also
the license text, `COMMERCIAL.md`.

## Contributing

Contributions are accepted under a [Contributor Licence Agreement](https://github.com/manablox/manablox-cms/blob/main/CLA.md);
every public Manablox repository carries the same `CLA.md`.
You keep the copyright in what you write. A contribution to an MIT package is
licensed under MIT; one to a premium plugin is licensed to the maintainer so it
can be offered under the commercial license. `git commit -s` on each commit in a
pull request is how you accept it.

## Not legal advice

This page and the licence files are written to be read, not to substitute for
counsel. If the answer matters to your business, have a lawyer read the actual
licence.
