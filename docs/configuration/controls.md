---
title: 'Controls'
description: 'What each control an external layer sets through the control API does inside the CMS: feature flags, count and usage limits, rate limits, retention, upload rules, admin messages, the instance state and other settings.'
---

Controls are values an external layer (a hosting panel, a billing system, a provisioning
script) sets through the [control API](../reference/control-api.md). The CMS stores them
and enforces them; nothing in the admin can change them, superadmins included. This page
explains what each kind of control does once it is set, in the order of the catalogue.
For the setup as a whole, see [Running under a control layer](../deployment/control-layer.md).

An instance without any control settings behaves as it always did: every feature is on,
nothing is limited, and the few defaults that restrict something are listed below.

## Scopes

Every control is stored under a key, set at one scope: the whole instance (`instance`), a
group of spaces (`group:<id>`) or one space (`space:<id>`). Groups exist only in the
control API; a space belongs to at most one group. `GET /control/v1/catalogue` lists every
key with the scopes it allows and its default.

| Kind | Keys | How the scopes combine |
| --- | --- | --- |
| [Feature flags](#feature-flags) | `features.<key>` | On only if no scope switches it off. A plugin flag declared with `resolution: 'mostSpecific'`: the most specific scope that sets it wins |
| [Count limits](#count-limits) | `limits.<key>` | Checked at every scope that sets one; all must pass |
| [Usage limits](#usage-limits) | `usage.<metric>`, `usagePeriodAnchorDay` | Checked at every scope that sets one; all must pass |
| [Rate limits](#rate-limits) | `rateLimits.<rule>` | The most specific scope that sets the rule wins |
| [Retention](#retention) | `retention.<key>` | The most specific scope wins |
| [Upload rules](#upload-rules) | `uploads.maxFileSize`, `uploads.allowedMimeTypes` | The strictest value of every scope, the env ceiling included |
| [Admin messages](#admin-messages) | `admin.banners`, `admin.links` | Banners of every scope are shown together; links are set at the instance |
| [Instance state](#instance-state) | `state` | The most severe state of the space's scopes |
| [Settings](#settings) | `snapshots.interval`, `domains.requireVerification`, `auth.requireEmailVerification`, `apiKeysDisable`, plugin settings `plugins.<id>.*` | The most specific scope wins |

The most specific scope is the space, then its group, then the instance. Removing a value
(`DELETE /control/v1/settings/<key>`) restores the default at that scope.

These defaults differ from an instance that never had controls:

- `rateLimits.auth.mails` allows 3 password, confirmation and invitation mails per account an hour.
- `retention.snapshotsDays` keeps snapshots for 7 days; no snapshot is taken until `snapshots.interval` is set or someone takes one by hand.
- `retention.controlEventsDays` keeps control events for 30 days.

Every process keeps the resolved controls of a space for at most 5 seconds. A control API
write drops them at once in the process that received it, and in every other process that
shares `REDIS_URL`. Checking a control never costs a request a database query.
Control values are configuration, not content, so this cache stays on with
`CACHE_ENABLED=false`.

## Feature flags

A feature flag switches one feature on or off. It is stored under `features.<key>`:

```json
{ "features.approvals": { "enabled": false, "presentation": "locked", "message": "Approvals are part of Business.", "link": "https://example.com/upgrade" } }
```

| Field | Meaning |
| --- | --- |
| `enabled` | `true` (the default) or `false` |
| `presentation` | How the admin shows a switched-off feature: `locked` (the default) or `hidden` |
| `message` | Optional plain text, up to 500 characters, shown with the lock |
| `link` | Optional `http` or `https` URL behind "See how to unlock"; without it, the `admin.links.upgrade` link |

A flag is on for a space only if no scope that applies to it switches it off: the
instance, the space's group and the space itself. The presentation comes from the most
specific scope that sets one; `message` and `link` from the most specific scope that
switches the flag off.

### The flags

| Key | Scopes | Refused while off | Keeps working |
| --- | --- | --- | --- |
| `customRoles` | all | Creating, changing and deleting roles; giving a member, invitation or single sign-on grant a custom role | Existing roles and the members who hold them |
| `approvals` | all | Asking for approval; switching `requiresApproval` on for a type | `requiresApproval` is ignored; open requests can still be decided |
| `scheduledPublishing` | all | Setting a publish or unpublish time on documents and assets | Clearing a schedule; pending schedules still run |
| `versionRestore` | all | Restoring an earlier document version | The version history |
| `visualEditor` | all | Preview reads of the visual editor (403) | The public GraphQL API |
| `plugins.workflows` | all | The [workflows plugin](../admin/workflows.md#the-workflows-plugin)'s flag: creating, saving, publishing, switching on, deleting, importing and starting workflows, also inside a space import. Triggers stop starting runs, and paused runs stay paused until it is on again | Reading workflows and their runs |
| `plugins.workflows.http`, `plugins.workflows.mail` | all | Saving a workflow with an enabled HTTP or crawl, or mail node; such a node fails when a run reaches it. The admin locks switching such a node on (the workflows plugin) | Workflows without those nodes |
| `plugins.webhooks` | all | The [webhooks plugin](../admin/webhooks.md#the-webhooks-plugin)'s flag: creating, changing, retrying and testing webhooks. Incoming calls answer 404; outgoing deliveries are not sent; the webhook trigger of workflows goes with it | Reading webhooks and their delivery logs |
| `databags` | all | Writing databag types and entries | Reading and delivering them |
| `menus` | all | Writing menus | Reading and delivering them, so sites still show them |
| `tags` | all | Creating, renaming, merging and deleting tags, and changing the tags of a document or asset | Existing tags; saves that keep the same tags |
| `apiKeys` | instance | Issuing API keys | Existing keys keep working; see `apiKeysDisable` under [Settings](#settings) |
| `graphqlDelivery` | instance, space | The public GraphQL API answers 404 | Preview reads |
| `restDelivery` | instance, space | The public REST API answers 404 | Everything else |
| `transferExport` | instance, space | Space exports | Everything else |
| `transferImport` | instance, space | Space imports and resuming them, checked at the instance | Everything else |
| `plugins.ai` | all | The [AI plugin](../admin/ai.md#the-ai-plugin)'s flag: every AI generation, text, documents, designs, images and video | Generated content stays |
| `plugins.ai.images`, `plugins.ai.video` | all | AI image or video generation (the AI plugin) | Text generation |
| `plugins.ai.designModels` | all | Designing types, templates, workflows and plugin designs (the website's themes and block designs) with AI (the AI plugin) | Designing a new space, see `plugins.ai.designSpace` |
| `plugins.ai.designSpace` | instance | Designing the types of a new space with AI (the AI plugin) | Everything else |
| `plugins.ai.workflows` | all | Saving a workflow with an enabled AI node; such a node fails when a run reaches it. The admin locks switching such a node on (the AI plugin) | Workflows without AI nodes |
| `customDomains` | all | Adding API hosts and plugin host names (the website's domains) | Existing domains and hosts keep serving and can be removed |
| `twoFactor` | instance | Enrolling in two-factor authentication; requiring it, see [Two-factor authentication](#two-factor-authentication) | Accounts that use it keep their second step |
| `sso` | instance | Adding, changing and testing providers, and signing in through them, see [Single sign-on](#single-sign-on) | Accounts created through single sign-on |
| `snapshots` | all | Taking and restoring snapshots, scheduled or by hand, see [Snapshots](#snapshots) | Listing and downloading snapshots already taken, and pruning them |
| `environments` | all | Creating and promoting staging environments, and every request to a staging environment: 403 on the management APIs, 404 on its API hosts, site domains and webhook addresses; see [Environments](../admin/environments.md) | Production; listing environments; deleting them through the control API |
| `plugins.<pluginId>` | all | See [Plugin flags](#plugin-flags) | |
| `spaceCreate` | instance, group | Creating, importing and resuming imported spaces (`manablox space create` too), and restoring a snapshot as a new space | Everything else |

A refused action answers 403 `control.feature` with `{ feature, message, link }`, except
where the table says 404: a public surface answers as if the feature did not exist.
Refusals are reported to the external layer as `feature.denied` events, at most one per
scope and feature an hour.

### Switching a feature off

Nothing is deleted when a feature goes off. What exists stays stored and, where the table
says so, keeps working or stays readable; only new use is refused. Switching the feature
on again restores it as it was.

The admin mirrors the flags. A `locked` feature keeps its menu entry and settings section
with a lock; the page shows "<Feature> is locked" with the `message` and a "See how to
unlock" button to the `link`, and inline buttons show a lock with the same text in a
popover. A `hidden` feature leaves out its menu entries, settings sections and buttons;
opening its page directly shows "This page is not available". A write the server refuses
anyway opens the locked dialog with the error's message and link.

### Plugin flags

Every [plugin](../extending/plugins.md) gets a flag, `features.plugins.<pluginId>`, on by
default. The id is the plugin's name in lower case without `@`, with `/` as `.`, so
`@acme/seo` is `features.plugins.acme.seo`. A plugin can also declare keys of its own under
`features.plugins.<id>.`, `limits.plugins.<id>.` and so on; see
[Plugin controls](../extending/controls.md). While the flag is off in a space:

- Changed values of the plugin's field types are refused at any depth, inside blocks and repeater items too; stored values stay readable.
- Saving a workflow that uses the plugin's actions is refused, and such a node fails when a run reaches it.
- The plugin's hooks are skipped for that space; hooks that run without a space still run.
- Its [server routes](../extending/server-routes.md) answer 404, for the instance or for the space the request names. Its middleware follows the instance value only.
- Its [procedures](../extending/rpc.md) answer `NOT_FOUND` the same way, and its [jobs](../extending/jobs.md) for that space are skipped.
- Its admin menu entries and pages are hidden or locked like any other feature.

The plugin's content types and the fields it adds to other types with
[`extend`](../extending/plugins.md#adding-fields-to-other-content-types) stay: they are part of
the model, the same in every space.

### Two-factor authentication

| Key | Scope | Default | What it does |
| --- | --- | --- | --- |
| `features.twoFactor` | instance | On | Accounts may turn on two-factor authentication (an authenticator app plus backup codes), and a superadmin may require it |

With `features.twoFactor` off, enrolment is refused (`POST /api/auth/two-factor/enable`
answers 403 with the code `FEATURE_OFF`), the admin shows the profile's **Set up** button
as locked (or hides it, with `presentation: 'hidden'`), and the superadmin's two-factor
policy stops applying: nobody is asked to enrol, and the policy can only be set to
optional. Accounts that turned two-factor on keep their second sign-in step, so switching
the feature off never weakens an account that uses it; they can still renew their backup
codes or turn it off. The policy itself is a customer setting, not a control: a
superadmin sets it under **Settings > Security** (see
[Users and roles](../admin/users-and-roles.md#two-factor-authentication)).

### Single sign-on

| Key | Scope | Default | What it does |
| --- | --- | --- | --- |
| `features.sso` | instance | On | A superadmin may set up OIDC and SAML providers, and people sign in through them |

With `features.sso` off, the providers stay stored but nobody signs in through them:
`POST /api/auth/sign-in/sso` answers 403 with the code `FEATURE_OFF`, a sign-in that was
already on its way at the identity provider comes back to the login page with
`error=sso_disabled`, and the login page lists no provider. *Require single sign-on* stops
applying, so the addresses of those domains can sign in with a password and reset it again.
**Settings > Security** lists the providers read-only behind the lock (or leaves the section
out, with `presentation: 'hidden'`); adding, editing and testing a provider are refused with
`control.feature`, removing one still works. Accounts created through single sign-on stay,
and so do their sessions. Setting the provider up is a customer setting, not a control; see
[Single sign-on](../admin/sso.md). Accounts created at a first sign-in count against
`limits.seats`, see [Count limits](#count-limits).

## Count limits

A count limit caps how many of something may exist, for example documents or webhooks.
It is stored under `limits.<key>`, at any scope the key allows:

```json
{ "limits.documents": { "max": 1000, "mode": "hard" } }
```

`max` is the highest allowed count; `null` means no limit. `mode` decides what happens
when an action would go past it:

| Mode | Effect |
| --- | --- |
| `hard` (default) | The action is refused with 409 `control.limit`. Nothing is written |
| `soft` | The action goes ahead and the passed limit is logged |
| `off` | The limit is ignored, as if it was not set |

A limit set at the instance counts across every space, one set at a group counts across
the spaces in the group, and one set at a space counts in that space. When limits are
set at several scopes, every one of them must pass. The refusal names the limit and the
scope that refused it, with the count and the maximum, for example
`{ "limit": "documents", "scope": "space:5c1e...", "used": 1000, "max": 1000 }`. The
admin shows it as a sentence such as "The limit of 1000 documents in this space is
reached".

Keys ending in `PerSpace` always count inside one space, whichever scope sets them: a
`localesPerSpace` of 3 at the instance lets every space have three locales.

Only production counts: what a staging environment holds counts toward no limit, and
creating in a staging environment checks none, `environmentsPerSpace` aside. A promote
checks production's limits for what it adds. Usage limits count per space, requests to a
staging environment's hosts included. See [Environments](#environments).

### The keys

| Key | Scopes | Counts | Checked when |
| --- | --- | --- | --- |
| `spaces` | instance, group | Spaces | A space is created or imported; at a group also when spaces join it (`PUT /groups/<id>/spaces`, `POST /spaces` with a group), counting the spaces that join less those that leave |
| `seats` | all | Accounts with a membership in the scope; at the instance every account. Superadmins and banned accounts count, API keys do not | An account is created (instance), a member is added to a space (space and group) |
| `contentTypes` | all | Content and block types of the spaces | A type is created, a set of types is applied, a space starter or import adds types |
| `documents` | all | Documents; each locale of a document counts once | A document or translation is created, copied, imported |
| `databagTypes` | all | Databag types | A databag type is created |
| `databagEntries` | all | Databag entries, form submissions included | An entry is created or a form is submitted |
| `localesPerSpace` | all | Locales of one space | A space is created or its locales change |
| `menusPerSpace` | all | Menus of one space | A menu is created |
| `apiKeys` | instance | API keys that have not expired | A key is issued |
| `plugins.webhooks.count` | all | Incoming and outgoing webhooks (the webhooks plugin) | A webhook is created, or a workflow file or a code sync brings new endpoints |
| `plugins.workflows.active` | all | Switched-on workflows (the workflows plugin) | A workflow is saved switched on or switched on |
| `customDomains` | all | API hosts and plugin host names (the website's domains) | A domain or an API host is added |
| `redirectsPerSpace` | all | Manual redirects of one space; automatic ones from slug changes are free | A redirect is created, or an automatic one is saved and so becomes manual |
| `customRolesPerSpace` | all | Custom roles of one space | A role is created |
| `environmentsPerSpace` | all | Staging environments of one space; production is not counted, so `0` allows none | A staging environment is created |
| `storageBytes` | all | Bytes of uploaded files and their generated image variants | A file is uploaded, with its size |

Actions that add many things at once are checked as a whole before anything is written:
adding several members, applying a set of content types, a space starter, copying a
document with its children, and importing a space. An import is refused when the space
it would create, or any of the documents, types, entries, menus, redirects, domains,
webhooks, switched-on workflows, locales, custom roles or file bytes it brings, would go
past an instance limit. Resuming an interrupted import checks the limits again for what is
still to be written.

A seat is taken once per scope. Adding someone who is already a member of another space
in the same group takes a seat in the new space, but not in the group. Changing a
member's role takes no seat.

### Lowering a limit

Nothing is deleted when a limit is lowered below what exists. Existing documents, members
or files stay and keep working; only new ones are refused until the count is below the
limit again. Actions that add nothing, such as editing a document or changing a role,
are never refused by a count limit.

### How counting works

Most limits are counted when they are checked, with a query over the rows. Documents,
databag entries and stored bytes are kept as running totals per space instead, updated in
the same transaction as the write that changes them. A stored file counts in the space
it was uploaded to; when it is shared with other spaces it still counts there, and when
that space removes it, it moves to the next space that has it.

Every night a maintenance job recounts the totals from the rows and corrects any that
drifted.

Checks only run when a limit is set: an instance without count limits runs no extra
queries for them.

## Usage limits

A usage limit caps how much of a metered resource a scope may use per period, for example
API requests or bandwidth per month. It has the same shape as a count limit and is stored
under `usage.<metric>`, at the instance, a group or a space:

```json
{ "usage.bandwidthBytes": { "max": 107374182400, "mode": "hard", "thresholds": [80, 100] } }
```

The metrics are `apiRequests`, `bandwidthBytes`, `mails` and `uploads`, plus the metrics
plugins declare as `usage.plugins.<id>.<metric>` (the website plugin's
`plugins.website.formSubmissions`, the AI plugin's `plugins.ai.calls`, the workflows
plugin's `plugins.workflows.runs`). The CMS counts them for every space whether or not a
limit is set; what each one counts and how figures from a CDN are added is described under
[Usage in the control API reference](../reference/control-api.md#usage). A limit at a
space counts that space, one at a group the group's spaces together, one at the instance
every space.

Every request is counted toward a space where one can be named. Media the admin loads
counts toward the space that owns the asset (the first space it was put in). A request
that still names no space, such as a delivery request without the `x-manablox-space`
header, is counted as unattributed: the instance usage page shows it under
**Unattributed** and the control API answers it apart, and it counts toward no usage limit.

### Usage periods

A period is a calendar month in UTC, named `YYYY-MM` after the month it starts in.
`usagePeriodAnchorDay` (1 to 28, instance only) starts periods on another day, for example
the customer's billing day: with 15, the period `2026-09` runs from 15 September to 14
October. A changed anchor applies to counts from then on; earlier counts keep their period.

### Levels

About once a minute, after the counts are written to the database, and right after the
control API changes a setting, a group or receives an external figure, the CMS works out
a level for every scope and metric that has a usage limit:

| Level | When |
| --- | --- |
| `ok` | Below every threshold |
| `warn` | A threshold is reached: usage is at least `thresholds` percent of `max` (default 80 and 100) |
| `over` | A `soft` limit is passed; nothing is refused |
| `blocked` | A `hard` limit is used up: usage is at `max` or above |

`mode: "off"` or `max: null` means no limit and no level. The levels are reported by
`GET /control/v1/state`, and each change of level or of the highest threshold reached is
logged and handed to the events the external layer receives. A new period starts every
level at `ok` again.

A space is blocked for a metric when any of its scopes is blocked: its own, its group's or
the instance's.

### What happens when a metric is blocked

| Metric | Effect while blocked |
| --- | --- |
| `apiRequests` | The delivery API (REST `/v1` and GraphQL reads without a preview) answers 429 `control.usage`, with `Cache-Control: no-store` and `Retry-After`. When the space becomes blocked, its cached deliveries are purged once, through the `cache:purge` hook, so a CDN connected to it drops them |
| `bandwidthBytes` | The same answer for delivery and for media files served by the public API or a site. The designed site shows a neutral page, "Temporarily unavailable", with status 503, `Cache-Control: private, no-store` and `Retry-After`, so search engines treat it as temporary. The site's cached pages are purged once as for `apiRequests`. Site forms show "form unavailable" |
| `plugins.workflows.runs` | New runs are not started. Runs from triggers are skipped; a run started by hand is refused with `control.usage`. Test runs from the editor still run |
| `plugins.website.formSubmissions` | Site forms answer "This form is unavailable right now. Please try again later." (503) and nothing is stored |
| `mails` | Notification mails are skipped; in-app notifications still arrive. A workflow mail step fails with `control.usage`. Mails sent through an editor's own mailbox are not affected |
| `plugins.ai.calls` | AI generation (text, images, video, designs) is refused with `control.usage` before a provider is called |
| `uploads` | Uploads are refused with `control.usage` |

The error `control.usage` (429) carries `{ metric, scope, used, max, resetsAt }`, where
`scope` is the scope that is blocked and `resetsAt` the start of the next period.
Requests that are refused this way are not counted as usage. Only the actions in the
table are refused; everything else in the admin keeps working.

The admin shows the numbers on a usage page (Settings > Usage for a space, Settings >
Instance > Usage for superadmins) and a banner across the admin while a metric the viewer
can see is blocked, with the reset date and the `admin.links.upgrade` link when it is
set. `warn` and `over` show on the usage page only. Superadmins see the instance and every
space; space owners and admins, and anyone else who may change the space settings, see
their space.

### How enforcement stays cheap

Requests never query the database for the level. The levels are stored in Redis
(`manablox:controls:usage:<scope>`) when `REDIS_URL` is set, else each process keeps them
in memory and works them out again once a minute. A process reads them at most once every
5 seconds, and only for a space where some scope sets a limit for the metric. When Redis
cannot be reached, the last known levels stay in force; after 5 minutes without a fresh
read the limits are no longer enforced (fail-open), and a warning is logged once.

Counts reach the database in batches. With Redis every process adds its counts to one
shared batch each second, and the worker moves the batch into the counters. Each batch is
recorded with the counters in one transaction (table `usage_flushes`, kept for 7 days), so
a batch that is picked up again after a failed cleanup is not counted twice. Without Redis
each process writes its own counts.

## Rate limits

A rate limit caps how often something may happen in a time window, for example requests
per minute from one address. Each rule is stored under `rateLimits.<rule>`:

```json
{ "rateLimits.delivery.ip": { "max": 600, "windowSeconds": 60 } }
```

`max` is the number of hits allowed per `windowSeconds` (1 to 86400); `null` removes the
limit, and `0` refuses everything. The concurrency rules, `uploads.parallel` and the
workflows plugin's `plugins.workflows.concurrency`, take `{ "max": 2 }`: how many may run
at the same time.
`graphql.depth` and `graphql.complexity` take a plain number.

The most specific scope that sets a rule wins: the space, then its group, then the
instance. A rule that no scope sets keeps the behaviour the instance had before controls.
Where a config setting existed (`server.rateLimit`, `publicApi.rateLimit`, the website
plugin's `rateLimit` and `forms.rateLimit`, the GraphQL limits) that setting is the default,
so a config that turned a limit off (`RATE_LIMIT=off`) keeps it off until the control API
sets the rule. Otherwise the default is the one in the table.

### The rules

| Rule | Counted per | Default | Scopes | Applies to |
| --- | --- | --- | --- | --- |
| `delivery.ip` | Client address | `publicApi.rateLimit`, else `server.rateLimit`; the public API image ships 300 a minute | instance, space | Every request to a public instance |
| `delivery.space` | Space | None | all | Every request to a public instance, all addresses together |
| `management.apiKey` | API key | `server.rateLimit`, 600 a minute | instance | Management requests that send `x-api-key` |
| `management.session` | User; client address when signed out | `server.rateLimit`, 600 a minute | instance | Every other management request |
| `plugins.website.ip` | Client address | The website plugin's `rateLimit`, else `server.rateLimit`; the site image ships 1200 a minute | instance, space | Every request to the site process |
| `plugins.website.renders` | Space | None | all | Pages the site process renders because its page cache had none |
| `plugins.website.password` | Client address and space | 10 per 10 minutes | instance, space | Attempts at a site password (`POST /_manablox/password`) |
| `uploads` | Space | None | all | `POST /upload/<space>` |
| `uploads.parallel` | Space, at once | None | all | Uploads in progress at the same time |
| `plugins.webhooks.incoming` | Client address | 600 a minute | all | Calls to `/plugins/webhooks/in/<space>/<slug>` (the webhooks plugin) |
| `plugins.webhooks.outgoing` | Space | None | all | Outgoing webhook deliveries (the webhooks plugin) |
| `plugins.workflows.starts` | Space | None | all | Runs started by a trigger or by hand; test runs from the editor are not counted (the workflows plugin) |
| `plugins.workflows.concurrency` | The scope that sets it, at once | None | all | Workflow runs executing at the same time (the workflows plugin) |
| `plugins.ai.calls` | User; a workflow counts as one caller | None | all | AI text, document, design, image and video calls (the AI plugin) |
| `plugins.website.forms.ip` | Client address | The website plugin's `forms.rateLimit`, else 10 per 10 minutes | instance, space | Site form submissions |
| `plugins.website.forms.space` | Space | None | all | Site form submissions, all addresses together |
| `transfer` | Space; the instance for imports | None | instance, space | Space exports and imports |
| `auth.signIn` | Client address and account | 5 failures per 15 minutes | instance | Sign-in and the other credential routes, see below |
| `auth.mails` | Account | 3 an hour | instance | Password reset and set-password mails |
| `graphql.depth` | Query | `publicApi.maxDepth` (8) on public, `graphql.maxDepth` (12) on management | instance, space | GraphQL queries |
| `graphql.complexity` | Query | `publicApi.maxComplexity` (1000) on public, `graphql.maxComplexity` (5000) on management | instance, space | GraphQL queries |

The space of a request is the pinned space on a public instance, the space of the host on
the site process, the `x-manablox-space` header for GraphQL on management, and the space
in the path or the procedure input elsewhere. The management rules are set at the instance
only. A signed-in request to `/rpc`, `/api/v1`, `/graphql`, `/upload`, `/transfer` or
`/realtime` counts against `management.session` per user, whichever address it comes
from; every other request without an API key counts per address, except the prebuilt
admin's hashed files (`/assets/*` and the plugin bundles under `/admin/plugins/<id>/<hash>/`),
which no rule counts.

Rules counted per address keep one count per address; the space decides only how high it
may go. `delivery.space` and `plugins.website.forms.space` count all addresses of a space together, next to
the per-address rule, in the same check.

### How hits are counted

The counters are sliding windows: a request counts in the current window, and the previous
window still counts by the share of it that overlaps the last `windowSeconds`. A client
cannot send twice the limit around a window boundary, and a refused request is not
counted, so a client that keeps retrying is let in again as soon as the window has room.
Rules checked together, such as `plugins.website.forms.ip` and `plugins.website.forms.space`, are counted in one call;
when one of them refuses, none of them counts the request. Changing a rule's
`windowSeconds` starts a fresh count.

With `REDIS_URL` (and the cache on) every replica counts in Redis, under `manablox:rl:`,
with one script call per checked request; without it each process counts on its own.
When Redis cannot be reached the request is let through and a warning is logged. The rule
values themselves come from the resolved controls, which are cached for 5 seconds, so a
request costs no database query for them, and a rule without a limit costs no Redis call.

### What a refusal looks like

A request counted by the rules of its surface (delivery, management, site and incoming
webhooks) carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds
until the window ends) for the rule with the least room left. A refusal answers 429
`rateLimit.exceeded` with `{ rule, retryAfter }` and a `Retry-After` header, where
`RateLimit-Reset` and `retryAfter` are the seconds until the next request fits. Some rules
answer in their own way:

| Rule | When refused |
| --- | --- |
| `plugins.website.renders` | The neutral page "Too many requests" with status 429 |
| `plugins.website.password` | The password form with "Too many attempts. Please try again later." (429); no password is checked |
| `plugins.website.forms.ip`, `plugins.website.forms.space` | "Too many submissions. Please try again later." (429), as JSON to the form script or on the page after a plain post |
| `plugins.webhooks.outgoing` | The delivery waits in the queue until the window has room; it is not dropped and uses none of its retries |
| `plugins.workflows.starts` | A run from a trigger is skipped and logged; a run started by hand is refused with `rateLimit.exceeded` |
| `plugins.workflows.concurrency` | The run waits, see below |
| `uploads.parallel` | 429 `rateLimit.exceeded` with `retryAfter` 5 |
| `auth.signIn` | 429 `auth.tooManyAttempts` with `{ rule, retryAfter }` |
| `auth.mails` | `auth.mails.tooMany` when an admin sends the mail; a reset the user asked for is skipped and audited |
| `graphql.depth`, `graphql.complexity` | The GraphQL errors `QUERY_TOO_DEEP` and `QUERY_TOO_COMPLEX` |

### Workflow runs and parallel uploads

`plugins.workflows.concurrency` caps how many runs execute at once. A value set at a space counts
that space's runs, one set at a group counts the runs of all its spaces together, and one
set at the instance counts every run. A run that finds no free slot stays queued: with
`REDIS_URL` the job goes back to the queue's delayed set for about five seconds without
using up an attempt, without it the process tries again after the same pause. A run that
waits for a called workflow or a timer gives its slot back while it waits. A slot is held
for the run timeout plus a minute at most, so a process that dies does not keep it.

`uploads.parallel` works the same way for uploads, counted per space, with a slot held
for ten minutes at most; an upload without a free slot is refused rather than queued.

### Sign-in backoff

`auth.signIn` guards sign-in, sign-up, password reset, and password and email changes.
Each failed attempt (any 4xx answer) counts against the client address and against the
account it names. Once `max` failures are counted within `windowSeconds`, every further
failure blocks that address or account for 1, 2, 4 and more seconds, up to
`windowSeconds`. A successful attempt clears both counts. With `REDIS_URL` the counts are
shared by every replica.

### Client addresses

Rules counted per address read the client address the same way the control API allowlist
does. Behind a proxy or CDN, set `TRUSTED_PROXIES` so forwarding headers are believed only
from the proxy; see [Operations](../deployment/operations.md#client-addresses).

## Retention

Retention controls let old records go. They are stored under `retention.<key>`, as a
number of days (1 to 36500) or, for design versions, a count. `null` keeps everything, and
so does an unset key, except `snapshotsDays` (7) and `controlEventsDays` (30), which have a
default. The most specific scope wins: a value at a space beats its group's, which
beats the instance's, so `null` at a space keeps everything there even when the instance
sets a window.

```json
{ "retention.versionsDays": 90, "retention.auditDays": 365, "retention.auditExport": true }
```

| Key | Scopes | What goes |
| --- | --- | --- |
| `versionsDays` | all | Document versions older than the window. Always kept: the newest version of each document, the version its published copy was made from, and a version an open approval request refers to |
| `auditDays` | all | Audit entries older than the window, see below |
| `auditExport` | instance | `true` writes audit entries to storage before they are deleted |
| `plugins.workflows.runsDays` | all | Finished workflow runs (the workflows plugin). The newest 200 per workflow stay the ceiling; waiting or running runs are never removed |
| `plugins.webhooks.deliveriesDays` | all | Webhook deliveries, in every environment (the webhooks plugin). The newest 200 per webhook stay the ceiling |
| `notificationsDays` | instance | In-app notifications, read or not |
| `plugins.ai.generationsDays` | all | Finished AI generations; the assets they produced stay (the AI plugin) |
| `plugins.website.designVersionsCount` | all | How many published versions of each site design are kept, newest first (the website plugin) |
| `snapshotsDays` | all | Space snapshots, 7 days by default; see [Snapshots](#snapshots) |

`controlEventsDays` (instance, 30 by default) is described with the events in the
[control API reference](../reference/control-api.md).

### When records are deleted

A maintenance job on the management process deletes what the windows let go once a day,
counted from the process start. It works space by space in batches of 1000 rows, oldest
first, for at most 10 minutes a run; what is left waits for the next run. It runs on a
timer in the process without Redis and as a repeatable job with it. While no scope sets
a retention key, the job runs one query and stops. Design versions are also trimmed to
`plugins.website.designVersionsCount` each time a design is published.

A window hides records before the job deletes them. The version list of a document
(`content.versions`) leaves out versions past the window, except those that are always
kept, as soon as the value is set. The audit log does the same, as described next.

### Audit log

As soon as `auditDays` is set, every read of the log leaves out entries past their
scope's window: `audit.list`, `audit.listInstance`, `audit.forTarget` and `audit.get`.
An entry in a space follows that space's window, an instance entry (one without a space)
the instance's.

The log still refuses updates and deletes. The job deletes through one guarded path: on
Postgres the function `audit_entries_prune`, which sets a transaction-local flag the
immutability trigger lets through; on SQLite the one-row table `audit_prune_guard`, which
the prune sets and clears inside its own transaction. Any other `DELETE` is refused as
before.

On Postgres with [separate database roles](../deployment/database-roles.md), the app role
holds no `DELETE`, `UPDATE` or `TRUNCATE` right on `audit_entries` at all, so the guard
holds even against a session that sets the flag itself; `audit_entries_prune` runs as the
owner. With one role the guard stops accidental deletes, not a role that means to delete.

Before a batch is deleted, an anchor entry `audit.pruned` (kind Audit log) is appended in
the same transaction and scope. Its details hold the number of entries, their first and
last position (`fromSeq`, `toSeq`) and time (`from`, `to`), the hash of the newest one
(`lastHash`), and the hashes of pruned entries that a remaining entry links to
(`bridges`). **Verify chain** accepts a link to a pruned entry when a later anchor lists
its hash, so the chain checks out after pruning; any other gap is still reported.
Anchors are never deleted.

With `auditExport` set to `true`, each batch is written first to the storage configured
for uploads, as gzip-compressed JSON lines (one entry per line), under
`audit-exports/<space id or instance>/<from>-<to>.ndjson.gz`, with the times in UTC such as
`2026-09-25T120000.000Z`. When the export fails, nothing is deleted; the job logs the
failure and tries again on its next run.

## Upload rules

Two controls narrow what uploads accept, at the instance, a group or a space:

| Key | Value | Resolves to |
| --- | --- | --- |
| `uploads.maxFileSize` | Bytes, or `null` | The smallest set value |
| `uploads.allowedMimeTypes` | Exact types or families (`image/`), or `null` | The types every set list admits |

```json
{ "uploads.maxFileSize": 10485760, "uploads.allowedMimeTypes": ["image/", "application/pdf"] }
```

The env values (`FILE_MAX_SIZE_MB`, `ALLOWED_MIME_TYPES`) stay the process ceiling, and a
space's own asset settings can narrow further. The rule an upload is held to is the
strictest of all three: the smallest size, and only the types every list admits. Lists
that do not overlap admit no type at all.

The rule applies wherever a file enters: the upload route, AI-generated images and videos
(the generation fails with `asset.tooLarge` or `asset.mimeType.notAllowed` on its row),
web fonts imported for a site theme, and the files of a space import (checked against the
instance's controls, since a new space is in no group). A file past the size is refused
with `413` and `asset.tooLarge`; the upload route checks a declared `Content-Length` before
reading and cuts a streamed body off once it passes the limit. See
[Storage and media](storage-and-media.md#how-an-upload-is-received).

Lowering a rule keeps every stored file. A space setting that is now looser than a control
stays stored but has no effect, and saving the space's settings refuses it
(`space.assets.maxFileSize.aboveControl`, `space.assets.mimeType.outsideControl`). The
admin shows the control bounds read-only in the space's upload settings.

## Admin messages

Two controls put the external layer's words in front of the people using the admin.

`admin.banners` is a list of banners shown across the top of the admin, below the top
bar. It can be set at the instance, a group and a space; every scope adds its own, so a
space shows the instance's banners and then its group's and its own.

```json
{
  "admin.banners": [
    { "id": "invoice-2026-09", "level": "warning", "text": "Your invoice is overdue.", "link": "https://example.com/billing", "dismissible": true, "audience": "superadmin" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Letters, digits, `_`, `.`, `:` and `-`, unique within the list. A dismissal is remembered by id, so a new id shows a changed banner again |
| `level` | `info`, `warning` or `danger`: the colour. The most severe banners come first |
| `text` | Plain text, up to 500 characters. HTML is refused (`<` followed by a letter, `/`, `!` or `?`), as are control characters other than tabs and line breaks |
| `link` | Optional. An `http` or `https` URL without a user name or password; shown as "Learn more" and opened in a new tab |
| `dismissible` | Whether the banner has a close button |
| `audience` | `all`, or `superadmin` for superadmins only. The server leaves banners out for anyone outside the audience |

A dismissed banner stays hidden for that account on every device: the admin stores the
dismissed ids with the account on the server (`preferences.set` with the key
`banners.dismissed`, up to 500 ids).

`admin.links` holds up to four links, set at the instance only: `upgrade`, `billing`,
`support` and `docs`, each an `http` or `https` URL. They appear in a help menu (the
question mark in the top bar) and on the suspended page. `billing` is shown to
superadmins only. `upgrade` is also the link of locked features and of the usage banner.

The per-feature `message` and `link` of a switched-off feature follow the same rules:
plain text up to 500 characters and an `http` or `https` link.

## Instance state

The `state` control switches an instance, a group or a space between normal operation and
two restricted modes. It is set with `PUT /control/v1/instance/state`, or like any other
key through the settings endpoints (`{ "state": { "status": "readOnly" } }` with
`?scope=space:<id>`). `message` is optional plain text up to 1000 characters.

| Status | Scopes | Effect |
| --- | --- | --- |
| `active` (default) | all | Nothing is restricted |
| `readOnly` | instance, group, space | Writes are refused; reading, delivery and sites keep working |
| `suspended` | instance only | The admin shows only the message; delivery and sites are unavailable |

When several scopes set a state, the most severe one applies to a space: a read-only
instance makes every space read-only, and a read-only group makes its spaces read-only.

### Read-only

Every write in the scope is refused with 423 `control.readOnly`, whose params are
`{ scope, reason }`: the scope that set the state and its message. That covers:

- Every management API procedure that changes something in a space (content, assets, types, menus, design, workflows, webhooks, members, roles, settings, AI generation), over RPC and REST, and deleting a space.
- At the instance: creating, importing and resuming spaces, and creating, changing, banning and deleting accounts.
- File uploads (`POST /upload/<spaceId>`) and space imports (`POST /transfer/import`, instance only).
- Incoming webhooks (`/plugins/webhooks/in/<spaceId>/<slug>`) and forwarded form submissions.
- Workflow runs: no new run starts, from any trigger. Runs from triggers are skipped quietly; a run started by hand is refused. Runs that were already running finish.

Site forms answer "This form is unavailable right now. Please try again later." (503) and
store nothing.

A running promote refuses the writes to its space's production environment the same way,
with the reason `promote`; see [Environments](#environments).

Reads stay available: the admin opens every page, exports (`GET /transfer/<id>/export`)
work, delivery, GraphQL, media and the designed site keep serving. Signing in, signing
out and each person's own account (profile, password, notification settings, own API
keys) keep working.

The admin shows a notice below the top bar, "This instance is read-only." or "This space
is read-only.", with the message, while the viewer is in an affected space. A refused save
shows the read-only message as usual.

### Suspended

Only the instance can be suspended. While it is:

- Every signed-in person, superadmins included, sees a single page with the message, the `admin.links` and buttons to check again and to sign out. Nothing else of the admin is shown.
- Every management API procedure is refused with 423 `control.suspended` (params `{ reason }`), except `users.me` (which the admin reads the state from) and `users.setupNeeded`.
- Uploads, transfers, forwarded form submissions and the realtime feed are refused the same way.
- Delivery (REST `/v1` and GraphQL), media files and incoming webhooks answer 503 `service.unavailable` with `Cache-Control: no-store`. The error does not carry the message.
- The designed site shows the neutral "Temporarily unavailable" page with status 503 and `Cache-Control: private, no-store`. Hosting checks (`/_manablox/domain-check`) still answer.

Signing in and out, the health endpoints (`/healthz`, `/readyz`) and the control API keep
working; the control API is how the state is lifted.

Suspending the instance purges every space's cached deliveries and site pages through the
`cache:purge` hook (tags `space:<id>` and the tags plugin data providers name, such as the
website's `design:<id>`), so a CDN handler
listening to it drops them as well; lifting the suspension (to `active` or `readOnly`)
purges again, so nothing cached while suspended is served afterwards. Other state changes
do not purge.

### How the state stays cheap

The state is part of the resolved controls every process already keeps: in memory for at
most 5 seconds, or until a control API write drops it in every process. Checking it adds
no database query to a request.

## Environments

Staging environments are copies of a space where changes are made before they are
promoted to production; see [Environments](../admin/environments.md). The controls that
apply to them:

- `features.environments` switches creating and promoting staging environments on or off, and with them every request to a staging environment (403 `control.feature` on the management APIs, 404 on its API hosts, site domains and webhook addresses). Production works either way, and environments can still be listed and deleted.
- `limits.environmentsPerSpace` counts a space's staging environments; production is always there and not counted, so `0` allows none.
- What a staging environment holds counts toward no other count limit and creating there checks none; a promote checks production's limits for the types, menus, redirects and, in a full promote, documents and entries it adds.
- Usage limits count per space; requests to a staging environment's hosts count toward its space.
- Staging sites and staging delivery are never indexed.
- A space's state (`readOnly`, `suspended`) applies to all of its environments.

While a promote runs, every write to the space's production environment is refused with
423 `control.readOnly` and the params
`{ "scope": "space:<id>", "reason": "promote", "message": "A promote is in progress." }`:
management API writes, uploads, incoming webhooks, forwarded form submissions and new
workflow runs of production. Writes in staging environments, reads, delivery and the site
continue. The admin shows the message like any other read-only refusal.

The promote marker is shared by every process: a field of one Redis hash when `REDIS_URL`
is set, else a row in `instance_meta`. Each process reads every space's markers in one
call at most every 5 seconds, like the other controls, and is told at once when Redis
carries the change; the process running the promote knows at once. The marker is renewed
while the promote runs, removed when it ends, also when it fails, and expires 60 seconds
after a crashed process stopped renewing it.

Creating, promoting and deleting emit `environment.created`, `environment.promoted` and
`environment.deleted`; see [Events](../reference/control-api.md#events).

## Settings

Settings configure a feature rather than switch it. The most specific scope that sets one
wins.

| Key | Scopes | Default | What it does |
| --- | --- | --- | --- |
| `snapshots.interval` | all | Unset | `daily` or `hourly` takes snapshots on a schedule, see [Snapshots](#snapshots) |
| `domains.requireVerification` | instance | Off | New domains serve only after a DNS check, see [Custom domain verification](#custom-domain-verification) |
| `auth.requireEmailVerification` | instance | Off | Accounts confirm their email address before they sign in, see [Email confirmation](#email-confirmation) |
| `apiKeysDisable` | instance | Off | Every existing API key stops working, see [Disabling API keys](#disabling-api-keys) |

`usagePeriodAnchorDay` is described with the [usage limits](#usage-periods).

### Snapshots

A snapshot is a copy of one space taken on the CMS's own storage: the space export of
[Moving a space](../admin/transfer.md) with every section, but without asset files. The
files stay where they are, and files of deleted assets are kept for as long as a snapshot
may need them, so a restore finds them again. Three controls shape it:

| Key | Scopes | Default | What it does |
| --- | --- | --- | --- |
| `features.snapshots` | all | On | Taking snapshots (scheduled or by hand) and restoring them. Off, the Backups page shows its lock and the snapshots already taken stay until pruned |
| `snapshots.interval` | all | Unset | `daily` or `hourly` takes snapshots on a schedule. Unset takes none automatically; snapshots can still be taken by hand |
| `retention.snapshotsDays` | all | 7 | Snapshots older than this many days are deleted. `null` keeps them all |

```json
{ "features": { "snapshots": { "enabled": true } }, "snapshots": { "interval": "daily" }, "retention": { "snapshotsDays": 14 } }
```

#### Storage layout

Each snapshot is two objects in the storage configured for uploads:

- `snapshots/<spaceId>/<id>.json.gz`: the space export as gzip-compressed JSON.
- `snapshots/<spaceId>/<id>.manifest.json`: the space id, technical name and name, the creation time, `trigger` (`manual` or `scheduled`), the export format version, the compressed size in bytes, and counts of content types, documents, assets, menus and workflows.

The `<id>` is the creation time in UTC with `-` in place of `:` and `.`, such as
`2026-09-25T10-15-00-000Z`. Listing snapshots lists the prefix, so the storage driver
must be able to list: the `local` and `s3` drivers can; a custom driver without `list`
takes no snapshots and the Backups page says so.

#### Schedule and pruning

A maintenance job on the management process runs every 15 minutes. For every ready space
with the feature on and an interval set, it takes a snapshot when the newest one (by hand
or scheduled) is at least the interval old, less 5 minutes of slack so the schedule does not
slip by a whole run. Snapshots are taken one at a time: in the process, and across
processes through a database lock. Each one emits `snapshot.completed`, or
`snapshot.failed` with the error key when it fails; a failed snapshot leaves no file behind.

The same run deletes snapshots past their space's `retention.snapshotsDays`. Snapshots of a
deleted space stay until the instance's window has passed, so a deleted space can still be
restored through the control API.

#### Deleted asset files

While a space may need its snapshots, deleting an asset removes its record at once (and
storage usage drops as always), but not its file. That applies when the feature is on in
one of the asset's spaces and that space has an interval set or snapshots taken, and to
assets left without any space when a space is deleted while any snapshot exists. The file
stays at its storage key and a tombstone is written to `trash/<yyyy-mm-dd>/<assetId>.json`
listing the key. Image variants are deleted at once, since they are rendered again on
demand.

The maintenance run deletes the kept file once the longest `retention.snapshotsDays` of the
instance and every space has passed since the delete; a `null` window anywhere keeps them
all. A file whose asset came back through a restore is kept, and only its tombstone goes.
Without snapshots in use, deleting an asset deletes its file at once.

#### Restoring

A restore imports the snapshot as a new space: every record gets a new id, references
between them move along, and asset records point at the kept storage keys, so no file is
copied. Assets that still exist are shared with the new space. Credential secrets, AI
provider keys and switches, and the webhooks those secrets let back on are taken from the
source space's own rows when they still exist, since exports leave secrets out. Members of
the source space come along, and whoever restores becomes owner.

- **New space**: the copy gets the technical name `<name>-restored-<date>` and a name ending in "(restored <date>)", next to the original. It needs `spaceCreate` and counts against the `spaces` limit like any new space.
- **Replace**: the copy is imported under a temporary technical name, then takes over the original's technical name, domains, group and control settings in one transaction, and the original is deleted. Its snapshots move to the new space id. Against the limits a replace counts as net zero: what the old space counts is subtracted from what the import adds, so a full `spaces` limit does not refuse it. The space gets a new id; the external layer learns it from `snapshot.restored` (`spaceId`, `sourceSpaceId`, `snapshot`, `mode`), and from `space.created` and `space.deleted`.

A restore is audited as `space.restore` on the restored space. In the admin only space
owners (and superadmins) restore, after typing the space's technical name; see
[Backups](../admin/backups.md).

### Plugin controls

Plugins declare control keys of their own under `plugins.<id>`: features
`features.plugins.<id>.<name>`, limits `limits.plugins.<id>.<name>`, usage metrics
`usage.plugins.<id>.<name>`, rate rules `rateLimits.plugins.<id>.<name>`, retention
`retention.plugins.<id>.<name>` and settings `plugins.<id>.<name>`. They are stored, set and
resolved like the core keys above and listed in `GET /control/v1/catalogue`; a plugin's flag
`features.plugins.<id>` switches the whole plugin. A write to a plugin's key purges the
cached pages its data providers name for the spaces it applies to, and so does a space
joining or leaving a group. How to declare them is in
[Controls from plugins](../extending/controls.md).

The website plugin's keys (the designed site flag, forms, share links, the badge, the site
password, head code, form submissions, its rate rules, design version retention and the
badge text and link) are listed in [Permissions, controls and RPC](../site/api.md#controls).

#### The AI plugin

The [AI plugin](../admin/ai.md#the-ai-plugin) declares these keys; its flag
`features.plugins.ai` switches all of AI. Without the plugin none of them exists.

| Key | What it controls |
| --- | --- |
| `features.plugins.ai` | Every AI generation: text, documents, designs, images and video |
| `features.plugins.ai.images`, `features.plugins.ai.video` | AI image and video generation |
| `features.plugins.ai.designModels` | Designing types, templates, workflows, themes and block designs with AI |
| `features.plugins.ai.designSpace` | Designing a new space with AI (instance only) |
| `features.plugins.ai.workflows` | The AI workflow step |
| `usage.plugins.ai.calls` | AI calls per period |
| `rateLimits.plugins.ai.calls` | AI calls per user; a workflow counts as one caller |
| `retention.plugins.ai.generationsDays` | Finished AI generations |

#### The workflows plugin

The [workflows plugin](../admin/workflows.md#the-workflows-plugin) declares these keys; its
flag `features.plugins.workflows` switches workflows. Without the plugin none of them
exists.

| Key | What it controls |
| --- | --- |
| `features.plugins.workflows` | Editing, switching on, importing and starting workflows; triggers |
| `features.plugins.workflows.http`, `features.plugins.workflows.mail` | The HTTP and crawl nodes, and the mail nodes |
| `limits.plugins.workflows.active` | Switched-on workflows |
| `usage.plugins.workflows.runs` | Workflow runs per period, test runs excluded |
| `rateLimits.plugins.workflows.starts` | Workflow starts per space |
| `rateLimits.plugins.workflows.concurrency` | Workflow runs at once, per scope |
| `retention.plugins.workflows.runsDays` | Finished workflow runs |

#### The webhooks plugin

The [webhooks plugin](../admin/webhooks.md#the-webhooks-plugin) declares these keys; its
flag `features.plugins.webhooks` switches webhooks, and with them the webhook trigger and
abort trigger of workflows. Without the plugin none of them exists.

| Key | What it controls |
| --- | --- |
| `features.plugins.webhooks` | Editing, retrying and testing webhooks; incoming calls and outgoing deliveries |
| `limits.plugins.webhooks.count` | Webhooks, either direction |
| `rateLimits.plugins.webhooks.incoming` | Incoming calls per client address, 600 a minute by default |
| `rateLimits.plugins.webhooks.outgoing` | Outgoing deliveries per space |
| `retention.plugins.webhooks.deliveriesDays` | Webhook deliveries; the newest 200 per webhook stay the ceiling |

### Custom domain verification

| Key | Scope | Default | What it does |
| --- | --- | --- | --- |
| `domains.requireVerification` | instance | Off | On: a new site domain or API host is not served until DNS proves the owner controls it |

With the key off, a new domain is verified the moment it is added. With it on,
a new domain (and an imported one) starts unverified with a token. It proves ownership in
one of two ways:

- a TXT record named `_manablox.<host>` whose value is the token, or
- a `CNAME` of the host itself to the target in `DOMAIN_CNAME_TARGET`, when that is set.

The admin shows the record and a "Verify now" button next to each unverified domain, under
**Settings > API hosts**, for API hosts and site domains alike. A job on the management process checks
up to 50 unverified hosts of each kind every ten minutes. A host that is still unverified
seven days after it was added is marked failed and left out of the job; "Verify now" still
checks it. Renaming a domain asks for a new proof.

While the key is on, an unverified host is dark: `/_manablox/domain-check` answers 404
`unknown` for it, so an on-demand TLS proxy asks for no certificate, the site process
answers its neutral 404 and the public API answers 404 `publicApi.host.unknown`. Site links,
the sitemap and redirects to the primary domain leave unverified domains out. Switching
the key off serves unverified hosts again; they stay unverified. Domains that existed
before the key are verified by the migration, so switching it on takes no site offline.
A write to the key purges the cached host lookups of every process sharing the cache.

A verification emits `domain.verified` (`spaceId`, `domainId`, `hostname`, `kind`, and
`locale` for a site domain). Verification changes no count: domains and API hosts count
toward `customDomains` whether verified or not.

### Email confirmation

| Key | Scope | Default | What it does |
| --- | --- | --- | --- |
| `auth.requireEmailVerification` | instance | Off | Accounts confirm their email address from a mailed link before they can sign in |

`auth.requireEmailVerification` applies only while the instance has a
[mail transport](./mail.md); without one it changes nothing, since no link could reach
anyone. While it is on, a sign-in with the right password but an unconfirmed address is
refused with 403 and the message `auth.email.unverified`, no session is created, and a
confirmation link goes to the address (at most `rateLimits.auth.mails` per account).
Accounts created from an invitation are confirmed already, because the invitation link
went to that address. Accounts that existed before the upgrade that brought this setting
count as confirmed, so switching it on locks nobody out who could sign in before.

### Disabling API keys

`features.apiKeys` off stops new keys; `apiKeysDisable` set to `true` also stops the keys
that exist. A request with a key is then treated as if it sent none: it falls back to the
session or to an anonymous caller, and each refused key is audited as `apiKey.rejected`.
The keys stay stored and can still be revoked, and the admin's API keys page says that
keys are switched off. Setting it back to `false` lets them work again.
