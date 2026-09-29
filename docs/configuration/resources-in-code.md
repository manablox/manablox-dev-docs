---
title: 'Resources in code'
description: 'Declaring workflows, webhook endpoints, credentials and content templates in the config file or in a plugin, and reconciling them into a space with `manablox sync`.'
---

A workflow, a webhook endpoint, a credential and a content template can be written in the
config file the way a [content type](./content-types-in-code.md) can. A plugin can declare
the same four, so an integration ships as a package rather than as a page of clicking in
every install.

They are declared under `resources` in `defineConfig()`, and written into the database by
`manablox sync`. Credentials and templates are the core's own lists. Workflows and
endpoints are [plugin resource kinds](../extending/plugins.md#plugin-resource-kinds):
`workflows.workflow` of the [workflows plugin](../admin/workflows.md#the-workflows-plugin)
and `webhooks.webhook` of the webhooks plugin, listed under `resources.plugins` and
declared with the plugins' own define functions. A config that declares them loads both
plugins.

```ts
import { defineConfig, defineCredential, ref, requireEnv } from '@manablox/core';
import { webhooksPlugin } from '@manablox/plugin-webhooks';
import { workflowsPlugin } from '@manablox/plugin-workflows';
import { defineWorkflow } from '@manablox/plugin-workflows/define';

export default defineConfig({
  // ... database, auth, and the rest
  plugins: [workflowsPlugin(), webhooksPlugin()],
  resources: {
    credentials: [
      defineCredential({
        slug: 'mailer',
        kind: 'smtp',
        values: { url: requireEnv('WORKFLOW_SMTP_URL'), from: 'cms@example.com' },
      }),
    ],

    plugins: {
      'workflows.workflow': [
        defineWorkflow({
          slug: 'notify-on-publish',
          name: 'Tell the team about a publish',
          enabled: true,
          trigger: {
            kind: 'event',
            events: ['content.published'],
            typeIds: [ref.contentType('article')],
          },
          steps: [
            { key: 'summarise', action: 'ai.generate', config: { prompt: 'One sentence about: {{ content.title }}' } },
            {
              key: 'tell',
              action: 'email',
              credential: 'mailer',
              config: {
                to: ['editors@example.com'],
                subject: 'Published: {{ content.title }}',
                body: '{{ nodes.summarise.text }}\n\n{{ url }}',
              },
            },
          ],
        }),
      ],
    },
  },
});
```

The `ai.generate` step comes from the [AI plugin](../admin/ai.md#the-ai-plugin); a config
without the plugin cannot use it.

## Why a sync rather than a registry

A code-defined content type never touches a table: it is merged into the registry at boot
and everything downstream reads it from there. These four cannot work that way. A workflow
has runs pointing at it, an endpoint has a delivery log, a template is a document with
versions, and all of them belong to a space, which is a row somebody created at runtime.

So a declaration is reconciled instead of merged. `manablox sync` writes the row, under an
id derived from the space and the slug, marked `source: 'code'`. Everything else in the
system reads one row and does not care where it came from; the admin renders a code row
read-only, and an export leaves it out, because the instance it lands on gets it from its
own config.

## Declaring a workflow

The database stores a workflow as a graph. `defineWorkflow`, from
`@manablox/plugin-workflows/define`, takes a list of keyed steps and builds one: the ids, the edges, the ports and the canvas positions come out of the
wiring rules below, so the common case reads as a list.

```ts
defineWorkflow({
  slug: 'weekly-digest',
  spaces: ['marketing'],
  trigger: { kind: 'schedule', cron: '0 9 * * 1', timezone: 'Europe/Berlin' },
  steps: [
    { key: 'fetch', action: 'http', credential: 'analytics', config: { url: 'https://api.example.com/top' } },
    { key: 'enough', condition: { rules: [{ field: 'nodes.fetch.body.total', operator: 'greaterThan', value: '0' }] }, then: 'send' },
    { key: 'send', action: 'email', config: { to: ['team@example.com'], subject: 'This week', body: '{{ nodes.fetch.body.html }}' } },
  ],
});
```

| Key | What it does |
| --- | --- |
| `slug` | Machine name. The row is matched by it, so renaming the slug makes a new workflow and leaves the old one behind |
| `spaces` | `'*'` (the default) is every space, including ones created later; an array names spaces by machine name |
| `enabled` | Only read when the row is created. Afterwards the switch belongs to whoever runs the install |
| `trigger` | `event`, `schedule`, `call`, `manual`, or a kind another plugin adds. A webhook trigger of the webhooks plugin names an endpoint by its slug with `webhookTrigger('from-github')` from `@manablox/plugin-webhooks/define`, optionally with `{ filter }`. A [called workflow](../admin/workflows.md#sub-workflows) lists what it takes and may say what it hands back: `{ kind: 'call', parameters: [{ name: 'orderId', required: true }, 'note'], output: '{{ nodes.shape }}' }`; a bare name is an optional value. A workflow [started by hand](../admin/workflows.md#starting-by-hand) lists what it asks for the same way: `{ kind: 'manual', parameters: ['note'] }` |
| `abortOn` | Optional [abort triggers](../admin/workflows.md#abort-triggers): `{ kind: 'event', events: ['content.deleted'], match: 'document' }` or `webhookAbort('order-cancelled', { match: { key: { run: '{{ payload.body.id }}', abort: '{{ payload.body.id }}' } } })` from `@manablox/plugin-webhooks/define`. `match` defaults to `'all'` |
| `steps` | The nodes, in order |

A step is an action (`action`, `config`, `credential`), a condition (`condition`, `then`,
`else`), a switch (`switch: { field, cases }`, with `else` naming what runs when no case
holds), a delay (`delayMinutes`), a loop (`loop: { items, maxItems }`, with `each`
naming the first step of what runs per pass), a stop (`stop: { outcome: 'failed',
message: 'No price' }`, which ends the whole run; `outcome` defaults to `'succeeded'`) or
a call of another code workflow
(`call: { workflow: 'send-order', input: { orderId: '{{ content.id }}' }, wait: true }`,
with `onError` as on an action). A loop repeats a number of times with `loop: { times: 3 }`
(or a placeholder, `times: '{{ input.pages }}'`) and until rules hold, checked after each
pass, with `loop: { until: { rules: [{ field: 'nodes.fetch.body.next', operator: 'isEmpty' }] } }`.
A switch case is `{ value: 'news', then: 'notify_news' }`, with an optional `operator`
(`equals` unless given), `label` and `id`; the id is the port the case leaves by and
defaults to `case_1`, `case_2` and so on by its place:

```ts
{
  key: 'route',
  switch: {
    field: 'content.fields.category',
    cases: [
      { value: 'news', then: 'notify_news' },
      { id: 'blog', operator: 'contains', value: 'blog', then: 'notify_blog' },
    ],
  },
  else: 'ignore',
}
```
 The workflow a call names by slug must start with a `call`
trigger; the two may be declared in either order. Every step has a `key`, which is what a
template addresses it by: `{{ nodes.fetch.body.id }}`. A step chained after a loop, rather
than named by its `each`, runs once after the last item.

The wiring rules:

* A step follows the one declared before it, and the first follows the trigger.
* `after` overrides that. It takes one key or several, and `null` means no incoming edge.
* A step named by another step's `then`, `else` or `onError` is not also chained to its
  neighbour, so a branch target only runs when the branch is taken.
* `port` names the port an edge leaves by. It defaults to `ok` on an action or a call and `out` on
  the trigger and on a delay. A condition has two equal branches, so leaving it implicit
  is refused: use `then` and `else`, or an explicit `port`. The same goes for a switch: use
  each case's `then` and the step's `else`, or `port` with a case id or `default`. Nothing
  may follow a stop.
* `onError` on an action or a call routes its `error` port somewhere. Without one, a failure ends
  the run.
* `join: 'all'` makes a step with several incoming edges wait for all of them.

Everything the editor refuses is refused here too, most of it as the config file is loaded
(`plugins.workflows.code.step.keyDuplicate`, `plugins.workflows.code.step.targetUnknown`)
and the rest during the sync, where a space exists to check against
(`plugins.workflows.action.unknown`, `plugins.workflows.graph.cycle`,
`plugins.workflows.trigger.cronInvalid`).

## Declaring an endpoint

`defineWebhook` comes from `@manablox/plugin-webhooks/define`; the endpoints are listed
under `resources.plugins['webhooks.webhook']`.

```ts
defineWebhook({
  slug: 'from-github',
  direction: 'incoming',
  methods: ['POST'],
  auth: { mode: 'hmac', credential: 'github' },
});

defineWebhook({
  slug: 'notify-search',
  direction: 'outgoing',
  url: 'https://search.example.com/reindex',
  events: ['content.published', 'content.unpublished'],
  auth: { mode: 'bearer', credential: 'search' },
});
```

An incoming endpoint's URL is computed from its slug, so it is the same in every
environment and a plugin's README can print the path. Which authentication modes a
direction may use is checked as the config loads, and so is the kind of credential each
mode needs. A mode that does not fit the direction, or a missing credential or URL, is
refused as the config loads (`plugins.webhooks.code.auth.modeUnsupported`,
`plugins.webhooks.code.auth.credentialRequired`, `plugins.webhooks.code.url.required`).

A workflow started by an endpoint declared in the same config names it by slug, and the two
may be declared in either order:

```ts
import { webhookTrigger } from '@manablox/plugin-webhooks/define';

defineWorkflow({
  slug: 'on-github-push',
  trigger: webhookTrigger('from-github', {
    filter: { match: 'all', rules: [{ field: 'payload.body.ref', operator: 'equals', value: 'refs/heads/main' }] },
  }),
  steps: [{ key: 'log', action: 'http', config: { url: 'https://ci.example.com/hook' } }],
});
```

## Declaring a credential

The rule is one sentence: **the code declares the slot, the environment fills the secret.**

```ts
// Filled here, from the environment.
defineCredential({
  slug: 'stripe',
  kind: 'apiKey',
  values: { header: 'Authorization', key: requireEnv('STRIPE_KEY') },
});

// Declared empty. An operator fills it once under Settings, and nothing else changes.
defineCredential({ slug: 'github', kind: 'signing' });
```

`values` is read once, at sync time, and handed to the vault, which encrypts it with the
instance secret exactly as the admin's form does. Never write a secret into the config
file itself; `requireEnv` is there for this.

A slot with no `values` is created empty, and everything pointing at it is written
**switched off** until somebody fills it. That is deliberate: an endpoint that lets a
caller in with nothing behind the mode it claims is worse than one somebody has to finish.

An empty slot is also what makes this safe in a plugin. The plugin ships
`defineCredential({ slug: 'stripe', kind: 'apiKey' })` and never has to know the name of
an environment variable it does not own.

## Declaring a template

A content template is a document of the built-in `template` type holding one block list.

```ts
defineTemplate({
  slug: 'campaign-hero',
  title: 'Campaign hero',
  blocks: [
    { blockId: 'hero', type: ref.contentType('teaser'), fields: { headline: 'Change me' } },
  ],
});
```

| `manage` | What a sync does |
| --- | --- |
| `seed` (default) | Writes the document once. From then on it belongs to the editors and is never touched again |
| `managed` | Rewrites the document whenever the declaration changes, and the admin refuses an edit to it (`content.code.immutable`) |

A document is written per locale of the space: pass one block list for all of them, or a
record keyed by locale. A locale the space does not have is skipped, and so is a template
whose block types the space has not got.

The write goes through the content service, so validation, hooks, versions, the audit
entry and publishing all happen as they do for any other document. `publish` defaults to
`true`, because delivery reads the published projection and an unpublished template
delivers an empty block list.

## Referring to things that only have an id at runtime

A config file cannot know the id a content type has in a space it has never seen. `ref`
writes a placeholder that the sync resolves per space:

```ts
ref.contentType('article')                   // wherever a content type id goes
ref.credential('stripe')                     // a vault slot, by slug
ref.template('campaign-hero')
ref.of('webhooks.webhook', 'from-github')    // an entry of a plugin resource kind, by slug
```

`webhookTrigger('from-github')` is `ref.of('webhooks.webhook', 'from-github')` in the
trigger's `webhookId`.

They work anywhere in a declaration, an action's `config` included, which is what lets an
action nobody has heard of take a reference. A reference with nothing behind it in a given
space is reported (`codeResource.ref.unresolved`) and that one declaration is skipped;
the rest of the sync carries on, because a space that lacks a plugin's content type is a
legitimate state rather than a failed deployment.

The step shorthand `credential: 'stripe'` is the same thing as
`credentialId: ref.credential('stripe')`.

## Running the sync

```
manablox migrate     # the schema
manablox sync        # the declarations
```

| Option | Meaning |
| --- | --- |
| `--dry-run` | Report what would change and write nothing. Exits `2` when there is anything to do, so a deploy step can refuse to go on |
| `--space <name>` | Only this space, by machine name |
| `--prune` | Delete what no declaration covers any more, instead of switching it off |

`resources.apply: 'boot'` in the config reconciles on start instead, on management
instances only. The default is `'manual'`, which is what an install that already runs
migrations as a deploy step wants.

A space created in the admin is reconciled the moment it exists, so a declaration with
`spaces: '*'` reaches the spaces made tomorrow.

Every instance takes a lock before it writes, so a deployment that starts four of them
at once still writes each row once. On Postgres it is an advisory lock that spans
processes; SQLite runs one management instance, and its lock spans that process. Every write is an audit entry with
a `system` actor, so "the workflow changed and nobody touched it" has an answer.

A workflow a sync creates or changes is published at once, as a new
[version](../admin/workflows.md#publishing-and-versions) noted `Synced from <source>`, so
its version history shows every deploy that changed it. A sync that changes nothing adds
no version.

## What a sync will not do

* **It will not flick a switch back.** `enabled` is read when a row is created and left
  alone from then on. Turning off a plugin's workflow must not need a deploy.
* **It will not overwrite a secret with nothing.** A slot declared without `values` keeps
  whatever an operator filled in.
* **It will not delete by default.** A declaration that disappears switches its row off
  and reports it. A rolling deploy runs both versions of the code at once, and deleting a
  workflow takes its run history with it. `--prune` deletes, and even then a managed
  template is handed back to the editors rather than thrown away.
* **It will not take a slug that is already taken.** A row somebody made in the admin
  under the same slug is left alone and the declaration is skipped.

## In the admin

A declared row carries a **code** badge naming the plugin that declared it, and its editor
is read-only. Three things stay live, because they are the operator's rather than the
config's: the on/off switch, filling in a credential's secret, and **Clone**, which makes
an ordinary editable copy of a declared workflow with no tie back to the config.

Editing or deleting one through the API is refused with `plugins.workflows.code.immutable`,
`plugins.webhooks.code.immutable`, `credential.code.immutable` or `content.code.immutable`.

## From a plugin

A plugin declares the same four: credentials and templates as flat lists, workflows and
endpoints under `resources`, by kind:

```ts
definePlugin({
  name: '@acme/stripe',
  credentials: [defineCredential({ slug: 'stripe', kind: 'apiKey' })],
  resources: {
    'webhooks.webhook': [
      defineWebhook({ slug: 'from-stripe', direction: 'incoming', auth: { mode: 'hmac', credential: 'stripe' } }),
    ],
    'workflows.workflow': [orderPaidWorkflow],
  },
  templates: [],
});
```

Entries of a kind whose plugin is not loaded are refused at boot (`plugin.key.invalid`), so
such a plugin `requires` the workflows and webhooks plugins.

The config's own declarations are collected first, then each plugin's in the order they
are listed. Two declarations of one kind and slug are refused at boot with
`codeResource.duplicate`, naming both sources. Declare them on the plugin object: the sync
reads them when the config is resolved, not later.
