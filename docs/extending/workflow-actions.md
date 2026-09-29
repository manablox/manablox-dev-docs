---
title: 'Workflow actions'
description: 'Adding your own node to the workflow palette, and your own trigger kinds: the metadata that draws the form, the handler that runs it, how a credential reaches it, and how a plugin contributes all of it to the workflows plugin.'
---

A [workflow](../admin/workflows.md) is a graph of nodes, and every node that does
something is an **action** looked up in a registry. Workflows are a plugin,
`@manablox/plugin-workflows` (id `workflows`), and its registry is filled through its
[extension points](./extension-points.md). The built-in actions - call an API, send an
email - arrive through the same points as a plugin's, so anything they can do your own can
do too. Asking a model is itself another plugin's action: `ai.generate` of the
[AI plugin](../admin/ai.md#the-ai-plugin).

An action arrives in two halves. The **metadata** travels to the admin, which draws the
palette entry and the whole settings form from it; the **handler** stays on the server and
runs. Nothing has to be built into the admin: an action installed with a plugin appears in
a palette that was compiled before the plugin existed.

The workflows plugin has five extension points, all under `contributions: { workflows: ... }`:

| Point | Entries |
| --- | --- |
| `actions` | Actions, from `defineWorkflowAction` |
| `triggers` | Kinds of what starts a workflow, from `defineWorkflowTrigger`. See [Trigger kinds](#trigger-kinds) |
| `abortTriggers` | Kinds of what stops a workflow's active runs, from `defineWorkflowAbortTrigger` |
| `fieldKinds` | Field kinds of action forms beyond the built-in ones: `{ kind, description? }`. See [Field kinds of your own](#field-kinds-of-your-own) |
| `designHints` | Paragraphs for the AI designer's prompt: `{ section: 'placeholders' \| 'actions', text }` |

## Declaring one

```ts
import { defineWorkflowAction } from '@manablox/plugin-workflows/define';

interface TrelloConfig extends Record<string, unknown> {
  listId: string;
  name: string;
  description: string;
}

export const trelloCard = defineWorkflowAction<TrelloConfig>({
  type: 'trello.card',
  label: 'Add a Trello card',
  description: 'Puts a card at the top of a list.',
  icon: 'blocks',
  tone: 'cyan',
  group: 'integration',

  inputs: [{ name: 'in', label: 'Anything', type: 'any' }],
  ports: [],
  output: { name: 'ok', label: 'The card', type: 'json' },
  outputPaths: [
    { path: 'id', type: 'text', hint: 'The new card' },
    { path: 'url', type: 'text', hint: 'Where to open it' },
  ],

  credential: { kinds: ['apiKey'], required: true },

  fields: [
    { name: 'listId', label: 'List id', kind: 'text', required: true },
    { name: 'name', label: 'Title', kind: 'template', required: true },
    { name: 'description', label: 'Description', kind: 'templateArea', rows: 5 },
  ],

  defaults: () => ({ listId: '', name: '{{ content.title }}', description: '' }),

  validate: (config, at, add) => {
    if (!config.listId.trim()) add('plugins.trello.list.required', at('listId'));
    return { ...config, listId: config.listId.trim() };
  },

  async execute(ctx) {
    const response = await ctx.fetch('https://api.trello.com/1/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idList: ctx.config.listId,
        name: ctx.render(ctx.config.name),
        desc: ctx.render(ctx.config.description),
      }),
      signal: ctx.signal,
    });
    if (!response.ok) throw new Error(`Trello answered HTTP ${response.status}`);

    const card = (await response.json()) as { id: string; url: string };
    return {
      kind: 'ok',
      message: `Added "${ctx.render(ctx.config.name)}"`,
      detail: { id: card.id },
      output: card,
    };
  },
});
```

`defineWorkflowAction` and the types of the metadata and the handler come from
`@manablox/plugin-workflows/define`, which is safe to load at config time and pulls in no
part of the engine. The error key a `validate` reports is one of the plugin's own
[error keys](./services.md#error-keys), declared in its `errors`.

Contribute it from a [plugin](./plugins.md):

```ts
import { definePlugin } from '@manablox/core';
import type {} from '@manablox/plugin-workflows/define';

export default definePlugin({
  name: 'trello',
  // Adds to workflows when they are there; `requires` if the plugin is nothing without them.
  enhances: ['workflows'],
  errors: { 'plugins.trello.list.required': { message: 'Pick the list the card goes on.' } },
  contributions: {
    workflows: { actions: [trelloCard] },
  },
});
```

The type import makes `contributions.workflows` known to TypeScript. Contributions for a
plugin that is not configured are skipped, so the same plugin runs on an instance without
workflows.

An action is gated by its plugin's flag. `feature` names one more flag it needs, usually a
feature of the plugin that adds it: the AI plugin's `ai.generate` sets
`feature: 'plugins.ai.workflows'` (`features.plugins.ai.workflows`). While either is off,
saving an enabled node of the action is refused, a run that reaches one fails, and the
admin locks it.

The built-in actions are the workflows plugin's own contributions. An action another
plugin contributes under a key a built-in already uses replaces it rather than clashing
with it.

## The form

`fields` is the whole settings form. Each entry names a key in the node's `config` and how
it is edited:

| Kind | Draws |
| --- | --- |
| `text`, `password`, `number`, `textarea` | The plain inputs. |
| `template`, `templateArea` | The same, monospaced, with the placeholder help beside them. |
| `switch` | A yes/no. |
| `select`, `multiselect` | From `options`. |
| `stringList` | A list of short strings, entered one at a time. |
| `keyValue` | Name/value pairs: headers, a field mapping. |
| `json` | A JSON document, and the mode picker where the value carries one. |
| `rules` | A set of rules, drawn with the condition node's rule editor. The value is a `WorkflowRuleSet`: `{ match: 'all' \| 'any', rules: [{ field, operator, value }] }`. |
| `contentType`, `locale`, `role`, `user` | Picked from the space. |

`width: 'half'` pairs two fields on a row. `showWhen: { field, equals }` hides a field
until another one holds one of those values, which is how one action offers two shapes
without two forms. A dotted `name` addresses a value inside an object: `styles.tone` edits
`config.styles.tone`.

`group` places the action in the palette: `notify`, `data`, `content` or `integration`,
or a group of the plugin's own named by `groupLabel`.

## Field kinds of your own

A plugin can add a field kind the generic form does not know, such as a provider picker.
It contributes the kind on the server and draws it in the admin:

```ts
declare module '@manablox/plugin-workflows/define' {
  interface WorkflowFieldKinds {
    trelloBoard: true;
  }
}

contributions: {
  workflows: {
    fieldKinds: [{ kind: 'trelloBoard', description: 'A board of the account.' }],
  },
},
```

The main entry, `/define` and `/sdk` of `@manablox/plugin-workflows` all export
`WorkflowFieldKinds`, `WorkflowTriggerKinds` and `WorkflowAbortTriggerKinds`. Augment an
entry the file imports: TypeScript only merges a `declare module` into a module the program
loads, and with `skipLibCheck` an augmentation of one it does not load is dropped without an
error, so the new kind is simply missing.

In its [admin bundle](./admin-plugins.md) the plugin fills the workflows plugin's slot
`workflows:fieldControl` with an entry per kind; the form draws the label around it:

```ts
import type {} from '@manablox/plugin-workflows/admin-slots';

slots: {
  'workflows:fieldControl': [
    { key: 'board', kind: 'trelloBoard', component: () => import('./BoardField.vue') },
  ],
},
```

The component gets `spec` (the field), `value`, `config` (the node's, for fields that
depend on others), `readOnly`, `id` (for the label) and `update(value)`. The AI plugin draws
its `aiProvider` and `aiModel` fields this way. A field of a kind no loaded plugin draws
shows only its label.

## What the handler is given

`ctx` carries the run and the ways into the rest of the system:

- `ctx.config` - the node's settings, already through `validate`.
- `ctx.run` - the run context: `content`, `previous`, `documents`, `actor`, and `nodes`, which holds what every earlier node produced.
- `ctx.render(template)` / `ctx.renderJson(template)` / `ctx.resolve(path)` - the placeholder machinery. Anything an editor typed should go through `render`.
- `ctx.fetch` - the guarded fetch. Private addresses are refused, redirects and response size are capped. Use it rather than global `fetch`, and pass `ctx.signal` so the run's own budget can stop you.
- `ctx.credential` - the decrypted credential the node names, or `null`. Every value in it is scrubbed from the run log automatically; `ctx.secret(value)` registers anything else you derive, such as an access token. `credentialHeaders(ctx.credential, ctx.fetch)` from `@manablox/services` gives the headers that carry it: an API key in its header (`X-Api-Key` when none is named), bearer, basic and OAuth 2 (token exchanged and cached) as `authorization`.
- `ctx.services` - the repositories, the mailer, pusher and content services where the host wired them in, and `limits` (the plugin's `runTimeoutSeconds` and `maxCrawlPages`). A plugin's action reaches plugin services with `ctx.manablox.plugins.get(<id>)`, as the AI plugin's `ai.generate` does.
- `ctx.workflow` - `{ id, name, spaceId, environmentId }`; `environmentId` is the space environment the workflow belongs to.

## What the handler may answer

```ts
{ kind: 'ok', message, detail, output, port }
{ kind: 'stop', message }
{ kind: 'wait', minutes }
```

`output` is what later nodes read as `{{ nodes.<key>.something }}`, and it is worth
shaping deliberately: it is the action's public surface. `outputPaths` lists the paths the
editor offers for it.

`port` leaves by a port other than `ok` - one you declared in `ports`. `stop` ends this
branch quietly. `wait` parks the run and resumes it later, the way the Wait node does.
Throwing fails the node, which either takes the `Failed` port, carries on, or ends the
run, depending on how the graph is drawn.

## Availability

`isAvailable(manablox)` says whether this instance can run the action at all - the email
action uses it to report that no mail transport is configured. An unavailable action still appears in the
palette, marked, so the reason is visible rather than the action being mysteriously
absent.

## Custom form components

The generic form covers everything the built-ins need. Where an action wants a form of its
own, an admin plugin fills the slot `workflows:nodeForm` with an entry naming the action;
the generic form remains the fallback.

```ts
slots: {
  'workflows:nodeForm': [
    { key: 'card', action: 'trello.card', component: () => import('./TrelloCardForm.vue') },
  ],
},
```

The component gets `config`, `readOnly`, `hints` (the placeholders the node may read) and
`update(config)`. This slot replaces `workflowNodes` of the admin plugin.

## Trigger kinds

Besides `event`, `schedule`, `call` and `manual`, a plugin can add a kind of what starts a
workflow, and one of what stops its runs. The [webhooks plugin](../admin/webhooks.md#the-webhooks-plugin)
adds `webhook` this way; its source in
[`@manablox/plugin-webhooks`](https://github.com/manablox/manablox-cms/tree/main/packages/plugin-webhooks) is the reference. A kind
is `defineWorkflowTrigger` from `@manablox/plugin-workflows/define`, typed by the stored
trigger, which the plugin adds to `WorkflowTriggerKinds` (an abort kind to
`WorkflowAbortTriggerKinds`) of an entry the file imports, as for
[field kinds](#field-kinds-of-your-own):

```ts
declare module '@manablox/plugin-workflows/define' {
  interface WorkflowTriggerKinds {
    orderPaid: { kind: 'orderPaid'; shopId: string | null; filter: WorkflowRuleSet | null };
  }
}
```

| Part | What the workflows plugin does with it |
| --- | --- |
| `kind`, `spec` | The name, and the label, hint, run context entries and AI designer fields the editor and the designer show |
| `lookup(context)`, `planned(part)` | Loads what `check` needs of the workflow's environment, once per save or import; `planned` reads the same from a code resource sync's plan |
| `check(trigger, check)` | Normalises the trigger as submitted and reports problems with `check.add(key, at)`; `check.rules` checks a filter, `check.typeExists` a content type |
| `matches(trigger, source)` | Whether a start of `source` concerns a live workflow's trigger |
| `sample(trigger, sample)` | The run context of a test run, from what the editor's sample dialog sent |
| `refs` | The records the trigger points at: their list in workflow files, the ids a trigger names and how to remap them |
| `file` | How those records travel in [workflow files](../admin/workflows.md#exporting-and-importing): export, read, match by slug, create and write |
| `catalog(context)` | The kind's entry of the editor's catalogue, such as the records a trigger may name. `context.data` is what the kind's `lookup` read for the environment and `context.workflows` its workflows without their graphs, so neither needs reading again |
| `design` | The AI designer's side: lines about what the space offers, and reading the model's JSON into a trigger |

`defineWorkflowAbortTrigger` takes the same parts for an abort trigger (`check` answers the
kind's own fields; `id`, `filter` and `match` are checked by the workflows plugin), plus
`document(trigger)` for kinds whose starts are about a document.

A contributed kind starts nothing on its own. The contributing plugin calls the engine when
its event happens, and the workflows plugin aborts the concerned runs, then starts the
matching live workflows of the source's environment:

```ts
const workflows = manablox.plugins.get('workflows');
if (workflows && (await manablox.plugins.isOn('workflows', order.spaceId))) {
  const { runIds, abortedRunIds } = await workflows.engine.runTrigger('orderPaid', {
    source: { id: shop.id, spaceId: shop.spaceId, environmentId: shop.environmentId },
    context: { order },
  });
}
```

`context` holds the run context entries templates read (`{{ order.total }}`); `event`
defaults to the kind, and `label` is what an abort records. In the admin the plugin fills
`workflows:triggerForm` with an entry per kind: the form (for the trigger card, the abort
triggers card and the new workflow dialog), `create` and `abort` for fresh triggers, and
optionally the title, hints, filter, test run sample and how runs it started are labelled.
`imported(spaceId)` runs after a workflow import, which may have created records the kind
names (the webhooks plugin drops its cached endpoints there). The slot's props and options
are typed in `@manablox/plugin-workflows/admin-slots`. A bundle that writes what a trigger
may name drops the editor's catalogue of a space with `invalidateCatalog(spaceId)` of the
workflows plugin's api (`usePluginApi<WorkflowsAdminApi>('workflows')`, the type from
`@manablox/plugin-workflows/admin-api`).

A workflow saved with a kind no loaded plugin contributes is refused
(`plugins.workflows.trigger.kindUnknown`, `plugins.workflows.abort.kindUnknown`); one
already saved keeps its trigger and starts nothing.

## Design hints

The AI designer builds its prompt from the actions and trigger kinds it knows. A plugin
adds a paragraph with `designHints`: `section: 'placeholders'` puts it with the
placeholders, `'actions'` after the actions. The AI plugin tells the designer how to write
a whole document this way, the webhooks plugin what a webhook call holds.
