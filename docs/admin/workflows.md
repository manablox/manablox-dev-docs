---
title: 'Workflows'
description: 'What happens when content changes, or on a schedule: call an API, ask a model, write a document, tell someone - drawn as nodes you join up on a canvas.'
---

A workflow is something the CMS does on its own: when a page is saved, email someone;
after it was updated, call another system and act on what it answered; every night, read a
site, ask a model to summarise it and file the summary as a document. Each one is built in
the admin as a graph: a trigger at the top, nodes below it, and lines saying what follows
what. Every run is recorded with what each node did and what it produced.

**Workflows** in the sidebar lists the space's workflows with their switch; **New
workflow** creates one from a name, and the editor opens on the canvas. With the
[AI plugin](./ai.md#the-ai-plugin) loaded and an AI provider in the space, **Describe it**
in the same dialog designs the whole workflow from what should happen: the trigger, the
steps and their wiring, drawn from the space's own actions, credentials and webhooks and
checked as a save would check them. It is shown before it is created, and created as an
unpublished draft, switched off. Over the API this is `plugins.workflows.design`
(`workflows:read` and `ai:use`), which answers not found
(`plugins.workflows.design.unavailable`) without the AI plugin. See
[Designing with AI](./ai.md#designing-with-ai).

What you edit is a draft. **Save draft** keeps your changes without touching what runs;
**Publish** makes the draft the version the trigger runs. See
[Publishing and versions](#publishing-and-versions).

## The workflows plugin

All of it is the workflows plugin, `@manablox/plugin-workflows` (plugin id `workflows`).
`manablox create` offers it in its feature choice (`--workflows`, or `workflows` in
`--features`), and `manablox plugin install workflows` adds it to an existing instance. An
instance that does not load it has no workflows: no **Workflows** in the sidebar,
no workflow procedures, no runs, and no workflow section in a transfer.

Starting a workflow from an [incoming webhook](./webhooks.md) takes a second plugin, the
[webhooks plugin](./webhooks.md#the-webhooks-plugin) `@manablox/plugin-webhooks` (plugin id
`webhooks`), which owns the endpoints and adds the webhook trigger and abort trigger.
`manablox create` offers each on its own; pick both for webhooks that start workflows. Without the webhooks plugin, there are no webhooks, the webhook trigger is not offered
and a workflow saved with one is refused (`plugins.workflows.trigger.kindUnknown`).

To add them to an instance, add `@manablox/plugin-workflows` and
`@manablox/plugin-webhooks` to its dependencies, with the same version as the other
`@manablox` packages, and load them in the management config's `plugins`:

```ts
import { defineConfig } from '@manablox/core';
import { webhooksPlugin } from '@manablox/plugin-webhooks';
import { workflowsPlugin } from '@manablox/plugin-workflows';

export default defineConfig({
  // ...
  plugins: [
    workflowsPlugin(),
    // Incoming webhooks start and stop workflows.
    webhooksPlugin(),
  ],
});
```

The public delivery instance needs nothing. Then run `manablox migrate`: the plugin's
baseline migration creates its tables, `workflows`, `workflows_versions` and
`workflows_runs`. Removing the plugin leaves the tables in place.

| Option | Meaning |
| --- | --- |
| `runTimeoutSeconds` | Seconds one run may take, delays excluded. 300 by default |
| `maxCrawlPages` | Pages one crawl may fetch, whatever the node asks for. 50 by default |

`webhooksPlugin()` takes no options; see [Webhooks](./webhooks.md#the-webhooks-plugin).

The workflows plugin owns its [permissions](#permissions), the flag `features.plugins.workflows`,
`features.plugins.workflows.http` and `.mail`, `limits.plugins.workflows.active`,
`usage.plugins.workflows.runs`, `rateLimits.plugins.workflows.starts` and `.concurrency` and
`retention.plugins.workflows.runsDays` (see
[Controls](../configuration/controls.md#the-workflows-plugin)), the procedures under
`plugins.workflows.*`, the `workflows:run` job and the `workflows:pruneRuns` maintenance
task, its [hooks](#hooks), the error keys `plugins.workflows.*` (see
[Error keys](../reference/errors.md#plugin-keys)), the audit kinds `workflows.workflow` and
`workflows.run`, the code resource kind `workflows.workflow` and the workflows section of
`/llms.txt`. Its workflows travel in a transfer as the plugin section `workflows.workflows`.
The webhooks plugin owns the endpoints with their own flag, `features.plugins.webhooks`;
a webhook trigger needs both plugins on for the space.

Other plugins extend workflows through the plugin's extension points: actions, trigger
kinds, abort trigger kinds, field kinds of action forms and hints for the AI designer. The
webhook trigger and the AI plugin's AI node arrive that way. See
[Workflow actions](../extending/workflow-actions.md).

## Triggers

A workflow starts in one of five ways, and in the ways other plugins add.

**On an event.** Pick one or more of _created_, _updated_, _saved_ (either of the two),
_deleted_, _published_ and _unpublished_, and optionally narrow to certain content types
and languages. The nodes then see the document as `content`; on an update they also see
the row before the save as `previous`, which is what a "changed" condition compares
against. A deleted document is still handed over in full, so a farewell mail can say what
went.

**On a schedule.** A time (every few minutes, hourly, daily, on certain weekdays, monthly,
or a five-field cron expression) read in a timezone you name. A scheduled workflow may
also _look at documents_: a selection by content type, status, language and recency
("changed in the last day"). The matches are handed over as `documents`, or, with _run
once per document_, the nodes run for each one with it as `content`: the shape of a daily
digest, or a nightly sync of everything that changed.

**On a webhook.** Another system calls a URL of this space, and the workflow runs with
what arrived. The URL, and how a caller proves itself, belong to an
[incoming webhook](./webhooks.md) rather than to the workflow: the trigger only names one.
That is what lets several workflows hang off one call, and what keeps the URL working when
a workflow is renamed or replaced. The endpoint is chosen when the workflow is created and
can be changed in the trigger panel; either place can create one on the spot, so a space
with no endpoints yet is not a reason to go somewhere else and come back. The nodes read the call as `{{ payload.body }}`, with
the query string under `payload.query` and the request headers under `headers`. A trigger
may also filter on what arrived, so one endpoint from a service that sends a dozen kinds of
event can feed a workflow per kind. There is no `content`: run a _find documents_ or
_write a document_ node if the call is about one. This trigger comes from the
[webhooks plugin](./webhooks.md#the-webhooks-plugin).

**When another workflow runs it.** The workflow is a step other workflows share: they run
it with a _Run a workflow_ node, hand it values and get its result back. It declares the
values it takes (a name, a line saying what it is, and whether a caller must give it) and
reads them as `{{ input.orderId }}`. It also sees the caller's document as `content`, and
its actor, so a shared step about "the document" needs nothing handed over for that. See
[sub-workflows](#sub-workflows).

**When someone runs it.** Nothing starts the workflow on its own: a person starts it with
**Run**, in the workflow list or the editor, or a program with `plugins.workflows.start`. It
declares the values it asks for the same way a called workflow does, and reads them as
`{{ input.<name> }}`; `actor` is whoever started it. See [Starting by hand](#starting-by-hand).

The scheduler wakes every twenty seconds and starts each scheduled workflow once per
matching minute. Several API processes may run at once: the minute is claimed in the
database before anything starts, so one run happens between them, not one each. A minute
that passes while no process is up is skipped, not caught up.

## Abort triggers

A run that is still going can be stopped: one waiting at a delay, one queued behind
others, or one in the middle of an action. Under the trigger panel, **Aborts when** holds
any number of abort triggers, each of which stops the workflow's active runs when it
fires. What a run already did stays done; only what comes after is skipped, and a request
the aborted node had in flight is cancelled.

An abort trigger fires in one of two ways.

**On an event.** Any of the content events a workflow can start from, narrowed to content
types and languages like the trigger, and also _asset uploaded_, _menu saved_, _menu
deleted_, _member role granted_ and _workflow finished_. The last one fires when a run of
any workflow in the space ends; filter on `data.workflowId` and `data.status` to react to
one workflow succeeding, failing or being aborted itself. The other events describe what
happened under `data` (the asset, the menu id, the member and role).

**On a webhook.** Another system calls an [incoming webhook](./webhooks.md) of the space,
with the same authentication as any call to it. The same endpoint may also start
workflows: the aborts are applied first, so a call that both aborts and starts replaces
the old runs with a new one. Like the webhook trigger, it comes from the
[webhooks plugin](./webhooks.md#the-webhooks-plugin).

Each abort trigger decides which runs it stops:

| Which runs | Stops |
| --- | --- |
| Every run still going | All queued, running and waiting runs of the workflow. |
| Runs about the same document | Runs that started for the document the event is about. Only for content events: a reminder that should not go out once the page is deleted, or a delayed step that a new save makes stale. |
| Runs with a matching key | Runs whose _run key_ comes out the same as the _abort key_. The run key is rendered against each run, node outputs included (`{{ payload.body.orderId }}`, `{{ nodes.create_order.body.id }}`); the abort key against what fired (`{{ payload.body.orderId }}`, `{{ content.id }}`). An empty key never matches. |

An abort trigger may also filter, like a webhook trigger does: _only sometimes_ adds rules
over what fired, so one endpoint can cancel only for `payload.body.action` equal to
`cancelled`. Abort triggers belong to enabled workflows; a switched off workflow is not
listened for.

Runs can also be aborted by hand or from outside, without an abort trigger: see
[Runs](#runs).

## The canvas

The palette adds a node, joined to whatever is selected by its first free socket - so
adding two nodes after a fork takes one side and then the other - and placed under that
socket. With nothing selected the new node joins the end of the chain instead. Dragging an entry
from the palette onto the canvas places the node where it is dropped, not joined to
anything yet. A socket
carries as many lines as you like: drag from a socket at the bottom of one node to the
top of another to join them, again and again from the same socket to fan a branch out.
Drag a node to move it. Dragging snaps to a grid, and a node that comes close to lining
up with another is pulled onto it, with a line showing what it lined up with. Selecting a
node opens its settings beside the canvas, and selecting a line opens that line's own
settings; selecting the node at the top opens the trigger. _Arrange_ lays everything out
again from the connections: a row per step away from the trigger, a fork's two sides to
the left and the right below it, a switch's cases fanned out in their order, and no two
nodes on each other. _Relaxed_ gives each branch a lane of its own with room around it,
which is also what a workflow written before the canvas existed looks like when it is
first opened. _Compact_ packs the nodes closer and lets a branch tuck in under its
neighbour wherever the rows leave space, which suits a large graph.

Each line is animated in the direction the run travels, so a graph says which way it goes
standing still.

A node's ports are what makes the shape mean something.

| Port | On | What leaves by it |
| --- | --- | --- |
| Succeeded | Every action | The usual way on, carrying what the action produced. |
| Failed | Every action | Taken instead when the action fails. A line here means the failure is handled, not fatal. |
| Rules hold / do not hold | Only continue if... | One side or the other, never both. |
| One per case / Otherwise | Switch | The first case that holds, or _Otherwise_ when none does. Only one of them. |
| After the wait | Wait | Once the pause is over. |
| For each item (or Each time) / After the last | Loop | Once per pass into the branch hanging off it, then once when every pass is done. |

A _Stop the run_ node has no ports: nothing comes after it.

Two lines may lead into the same node. By default the first one to arrive starts it; turn
on _wait for every incoming line_ where two branches meet and it waits for all of them,
which is how a fork rejoins into one final step. A line that can never arrive - the other
side of a decided fork - does not hold anything up.

A line may also carry a guard of its own: rules that decide whether that particular line
is taken. It is a fork without a node, useful when only one of several ways on is
conditional.

The graph may not lead back into itself, and every node must be reachable from the
trigger; both are refused on save rather than at three in the morning.

## What a node can do

| Action | What it does |
| --- | --- |
| Send an email | To addresses you write (each may be a placeholder such as `{{ actor.email }}`) and to every member of the space holding a role you pick. Subject and body are templates; the body may be HTML. Needs `SMTP_URL`. |
| Call an API | An HTTP request to a URL template, with headers and an optional credential. The body is either everything about the run as JSON, a body you write, or nothing. With a secret, the body is signed as `sha256=<hex>` in `X-Manablox-Signature`, like a [signed webhook](./webhooks.md). Everything it answers - status, headers, the parsed body - is available to every later node. |
| Reshape data | Builds a JSON value out of what earlier nodes produced. A placeholder standing alone keeps its type, so a number stays a number. |
| Read a website | Fetches a page and, optionally, the pages it links to, and hands over their text. Made to feed the AI action. |
| Write or draw something | Asks a model for text, a whole document or a picture, with the provider and model you choose. The prompt may quote anything an earlier node produced; a prompt that quotes no earlier node is given what the previous node produced instead. Text can come back as JSON, so a later rule can test one field of it. A whole document fills every text and block field of the type you pick, the way the editor's wand does; pictures are left out. Uses the space's [AI providers](./ai.md). Added by the [AI plugin](./ai.md#the-ai-plugin) (action `ai.generate`); without it the node is not in the editor. |
| Create a document / Update a document | Writes a document from what the workflow has: the title and each field is a template. This is how an AI answer becomes content. Take everything from `{{ nodes.write }}` saves a whole document an AI node wrote, with its type, title and fields; anything you set on the node itself wins. |
| Send from a mail account | Sends through an SMTP account you stored, rather than the instance mailer. |
| Send with Gmail | Sends as a Google account through the Gmail API, with an OAuth credential. |
| Send a push notification | A Web Push notification to members, everyone, by role, or certain people, on each browser they switched notifications on in (Profile > Notifications). Needs the `PUSH_VAPID_*` keys. |
| Only continue if... | Rules over the run: `content.status` _is_ `published`, `nodes.fetch.body.total` _is greater than_ `0`. All or any must hold, and the run leaves by whichever of the two ports that decides. |
| Switch | Compares one value of the run with each of its cases in turn, `content.fields.category` _is_ `news`, _is_ `blog`, and leaves by the first that holds, or by _Otherwise_. See [switches](#switches). |
| Wait | Pauses the run for minutes, hours or days. The run is parked in the database and picked up by the scheduler, so it survives a restart. |
| Loop | Runs the branch hanging off its first port for each item of a list, a number of times, or until rules hold, then carries on by _After the last_. See [loops](#loops). |
| Stop the run | Ends the whole run where it stands, as done or as failed, with a message. See [stopping a run](#stopping-a-run). |
| Run a workflow | Runs another workflow of the space that starts _when another workflow runs it_, hands it values and carries on with what it hands back. See [sub-workflows](#sub-workflows). |

More can be installed: an action is a plugin's to add, and one that arrives that way
appears in the palette with its own form, without the admin being rebuilt. See
[workflow actions](../extending/workflow-actions.md).

Every node has a name, an on/off switch of its own, and a _carry on if it fails_ flag. A
failing node ends the run unless something catches it: a line from its _Failed_ port, or
that flag.

## Passing data between nodes

Each node has a short name - its **key** - shown under its title and edited in the
inspector. What the node produced is available to every node after it as
`{{ nodes.<key>.something }}`:

```
{{ nodes.fetch_order.body.items[0].name }}
{{ nodes.crawl_site.text }}
{{ nodes.write.json.title }}
```

That is the whole of how one action feeds another. The help beside every template field
lists what this particular node can reach, which is the trigger's payload plus the output
of every node that genuinely runs before it - pointing at one that does not is refused on
save. The same list comes up while typing: after `{{` in any field that takes
placeholders, the paths that match what follows appear at the caret. The arrow keys move
through them, Enter or Tab puts one in and closes the braces, and Escape dismisses them.
A path with a part to fill in, such as `content.fields.<name>`, arrives with that part
selected to type over.

Any text a node sends may contain placeholders: `{{ content.title }}`,
`{{ content.fields.summary }}`, `{{ actor.email }}`, `{{ url }}` (the document's page in
the admin), `{{ event }}`, `{{ space.name }}`. A path into an object or list renders as
JSON; a missing one renders as nothing. Every run keeps the context its templates saw,
under _show what the templates saw_.

## Loops

A _Loop_ node runs the nodes hanging off its first port again and again. It repeats in one
of three ways, picked at the top of its settings:

| Way | Repeats | `{{ item }}` in a pass |
| --- | --- | --- |
| Each item | once per item of a list | the item |
| Times | as many times as its count says: a number, or a placeholder such as `{{ input.pages }}` | the pass, from 0 |
| Until | until its rules hold, checked after each pass | the pass, from 0 |

A count that is not a whole number from 0 up fails the node. _Until_ rules are checked
after every pass, so they can read what that pass produced: _until_
`nodes.fetch.body.next` _is empty_ keeps fetching pages until the last one. They may also
use `loop.index`. After the loop, `{{ nodes.<key>.met }}` says whether the rules held or
the loop stopped at its limit.

The rest of this section is about going through a list, which works the same way for
every kind of loop. An _Each item_ loop runs the branch once per item. The list is a placeholder such as `{{ nodes.write.json }}` or
`{{ nodes.fetch.body.items }}`; left empty, the loop takes the list the previous node
produced, whether that is its whole output or the first list among its values (the pages
of a crawl, a JSON answer).

Inside the branch, `{{ item }}` is the current item, `{{ item.title }}` one value of it,
`{{ loop.index }}` its place from 0 and `{{ loop.count }}` the length of the list. A node
of the branch reads the nodes before the loop as any node would, and an AI node in it is
given the item as its material. After the last item the run carries on by _After the
last_, where `{{ nodes.<key>.count }}` says how many items there were and
`{{ nodes.<key>.results }}` holds what every pass produced, by node key.

A loop takes at most as many items or passes as its _at most_ setting says (50 unless
changed, up to 500) and leaves the rest out; an _Until_ loop that reaches it carries on by
_After the last_ with its rules not met. A failure in any pass ends the run, unless _skip
a pass that fails_ is on, in which case that pass's result records the error and the loop
moves on.
Loops may nest. Two things are refused on save: a line into the branch from anywhere but
the loop, since that node would run with no item, and a _Wait_ inside a loop. The run log
marks every entry of the branch with the item it ran for.

## Switches

A _Switch_ node looks at one value of the run, such as `content.fields.category` or
`nodes.fetch.body.status`, and compares it with each of its cases from the top. Each case
has its own comparison (_is_, _contains_, _is greater than_ and the rest, as in a rule)
and its own port on the canvas; the run leaves by the first case that holds and by no
other, or by _Otherwise_ when none does. A case value may be a placeholder. A switch
takes up to 10 cases; the arrows beside a case change the order they are tried in.

A case may carry a label for its port on the canvas; without one the port shows the
comparison, _is news_. Removing a case removes the lines from its port. Later nodes read
which way it went as `{{ nodes.<key>.label }}` (the case's label, or `Otherwise`),
`{{ nodes.<key>.case }}` (its port name) and `{{ nodes.<key>.value }}` (the value it
compared).

## Stopping a run

A _Stop the run_ node ends the whole run where it stands: every other branch stops too,
and so does a loop it sits in. _End the run_ finishes it normally; _fail the run_ marks
it failed, with the node's message as the error, which is what a run history filter and a
failure notification see. The message may use placeholders, such as
`No price for {{ content.title }}`. Put one at the end of a switch case or a condition's
side to say "nothing more to do here" out loud.

## Sub-workflows

Steps several workflows need, such as "tell the editors about this document" or "create the
order in the shop system", can live in one workflow of their own that the others run. Set
its trigger to _When run by a workflow_, then add a _Run a workflow_ node where it is
needed and pick it.

The node shows a field for every value the workflow takes. Each is a template, so
`{{ content.id }}` or `{{ nodes.fetch.body.orderId }}` hands over what the caller has; a
placeholder standing alone, or JSON, keeps its type. A value marked required must be given
before the caller can be saved, and a run whose template comes out empty fails the node.

With _Wait for it to finish_ on (the default), the called workflow runs, and the caller
carries on by _Finished_ once it has. `{{ nodes.<key>.output }}` is what it handed back:
what its trigger's _Hands back_ template says, such as `{{ nodes.shape }}`, or, with that
left empty, every node's result by key. `{{ nodes.<key>.status }}` is `succeeded` or
`skipped`. When the called run fails or is aborted, the node fails and the caller leaves by
_Failed_, just as with an action. When the called run waits at a delay, the caller waits
with it and carries on once it has finished; a caller in a loop cannot wait like that, so
there the node fails and the called run carries on by itself. With the switch off, the
called workflow is only started and the caller moves on at once.

The run starts in the caller's space with the caller's document, documents and actor.
Some things are refused when the node runs, and fail it: a workflow that is switched off or
not published, a workflow already running further up the same chain of calls (a workflow cannot call itself,
directly or round a circle), and a chain more than five calls deep. Aborting the caller
aborts the run it is waiting for; aborting that run fails the caller's node.

The called run is of the called workflow's published version. Its runs are listed with its
own runs, each naming the workflow that ran it; the caller's steps link to them. A **Test
run** of a called workflow asks for its values first. In the file of an export, a workflow it runs is named, not included: see
[Exporting and importing](#exporting-and-importing).

## Credentials

A workflow that calls a service outside signs in with a credential, kept in **Settings >
Credentials** and addable straight from the node that needs one: an API key, a bearer token, a username and password, an OAuth refresh
token, a signing secret, or a mail account. The same vault holds what a
[webhook](./webhooks.md) authenticates with, in either direction. The values are encrypted with the instance secret, they are
never sent back to a browser once saved, and they are removed from a run's log before it
is written. A node names the credential it uses; only credentials of the kind the action
accepts are offered.

Losing the instance secret loses the stored credentials. That is the intended failure:
they are re-entered rather than recovered.

## What a workflow may reach

A workflow is written by an editor, not reviewed as code, so its requests are treated like
requests from a stranger. Loopback, private and link-local addresses are refused,
including the cloud metadata service, and including a public name that resolves to one;
each redirect hop is checked again, and a credential is dropped when a redirect crosses to
another origin. Responses are capped, as is the number of pages one crawl may fetch and
the time one run may take.

Set `net.allowPrivateNetwork` only on an isolated install where reaching an internal
host is the point.

## Publishing and versions

A workflow has a draft and published versions. The editor always shows the draft, and
**Save draft** stores it without changing what runs. **Publish** freezes the draft as the
next version (1, 2, 3 and on) with an optional note on what changed, and from then on the
trigger runs that version. Unsaved changes are saved in the same step.

A new, imported or duplicated workflow is a draft until it is first published: its trigger
starts nothing, even when it is switched on. The header shows which version is live and
marks a draft that has changes since. The switch stays separate: it pauses and resumes the
live version.

A run keeps the version it started on. A run waiting at a delay when a new version is
published finishes on its old version, so a changed graph never meets a half-walked run.

The **Versions** tab lists every published version, newest first, with who published it,
when, and its note. **View** opens a version read-only: the canvas as it was, and every
node's and the trigger's settings when you pick them. From there **Export** downloads that
version, and **Restore to the draft** copies it into the draft. Restoring does not change
what runs; publish the restored draft to make it live again, as a new version.

Workflows declared in code are published by every sync that changes them, with the note
`Synced from <source>`. See [Resources in code](../configuration/resources-in-code.md).

Over the API, `plugins.workflows.create` and `plugins.workflows.update` save the draft,
and take `publish: true` (with an optional `note`) to publish it in the same call. The save
and the publish then commit together: when the publish fails, the draft is not saved
either. `plugins.workflows.publish` publishes the saved draft, `plugins.workflows.versions`
lists a page of versions, `plugins.workflows.version` returns one with its graph, and
`plugins.workflows.restoreVersion` copies one into the draft.

## Test runs

**Test run** in the editor runs the draft at once, so a change can be tried before it is
published. It saves unsaved changes first. What the run starts from depends on the
trigger:

| Trigger | The test run starts from |
| --- | --- |
| Content event | A document you pick. |
| Schedule | Its own selection of documents, as a scheduled run would. |
| Webhook | A sample call you write: method, query string and a JSON body, read as `{{ payload.body }}`. |
| Run by a workflow | The values you enter for its parameters. |
| Run by hand | The values you enter for its parameters, with you as `actor`. |

A test run is a real run: mails are sent and requests are made. It is marked as a test in
the history, keeps a copy of the draft it ran, and paints its statuses onto the canvas so
you see at once which way it went. A workflow it runs through a _Run a workflow_ node runs
that workflow's published version, and that run is marked as a test too. **Test again** on
a test run's page runs the current draft with the same input.

Over the API this is `plugins.workflows.runNow` with `contentId`, `input` or `payload` (and
optionally `headers`) as the trigger needs.

## Starting by hand

A workflow whose live version is triggered _when someone runs it_ has a **Run** button, in
its row of the workflow list and in the editor, once it is published and switched on. It
asks for the values the live version declares (a required one must be filled) and opens
the run. Unlike a test run, this runs the published version, in the background like any
other run, and counts as a live run in the history.

Over the API this is `plugins.workflows.start` with `{ spaceId, id, input }` and
`workflows:write`. It answers the queued run, or refuses with
`plugins.workflows.run.unpublished`, `plugins.workflows.run.disabled`,
`plugins.workflows.run.notManual` (the live version has another trigger) or
`plugins.workflows.run.inputMissing`. Values the trigger does not declare are dropped; an
optional one left out is blank.

## Runs

Runs happen in the background: a save never waits for a mail to go out. With `REDIS_URL`
set they go through the job queue like webhook deliveries; without it the process runs
them itself, off the request. Each run is a row from the moment it is queued, with a
status (queued, running, waiting, succeeded, failed, stopped, aborted) and a step per node
it ran. The last two hundred finished runs of a workflow are kept; a maintenance job on the
management instance deletes older ones every ten minutes.

The **Runs** tab is the run history, newest first: when each run started, what started it,
the version it ran or that it was a test, how many steps it took, how long, and where it
failed. It can be narrowed to live runs or tests, and to a status.

A run opens on its own page, step by step. The canvas shows the graph the run walked (its
version, or the draft a test ran), with each node painted in the status it reached. Beside
it every step is listed in the order it ran: its status, how long it took, what it
reported, what it handed on (its output, as later nodes read it) and the details it kept,
such as an HTTP status. A step inside a loop is listed once per item. Picking a step marks
its node on the canvas, and picking a node marks its steps. Tabs beside the steps show the
data the run started with (the document, the webhook call or the values it was handed,
each under the name templates read it by, and everything else on request) and, for a
called workflow, what it handed back. An output larger than 16,000 characters is kept as
its start only; the next node still got all of it.

An aborted run says what stopped it: the event, the webhook, or who asked. **Abort** on an
active run, in the history or on its page, stops it, and **Abort active runs** above the
history stops all of them. The same is open to other systems through the management API, with an API
key holding `workflows:write`:

| Procedure | REST | What it does |
| --- | --- | --- |
| `plugins.workflows.abortRun` | `POST /api/v1/plugins/workflows/abortRun` | Stops one run: `{ spaceId, id, reason? }` with the run id. Answers 409 when the run has already ended. |
| `plugins.workflows.abortRuns` | `POST /api/v1/plugins/workflows/abortRuns` | Stops every active run of a workflow: `{ spaceId, id, reason? }` with the workflow id. Answers `{ aborted: [runIds] }`. |

To read the history, `plugins.workflows.runHistory` (`workflows:read`) pages the runs of
a workflow as summaries, `{ spaceId, id, status?, test?, pagination? }`, and
`plugins.workflows.run` returns one with its steps and, in `definition`, the graph it
walked.

A run being executed by another process (a queue worker) notices the abort before its next
node starts; one in this process is stopped at once. Either way the run is reported once.

The `workflows:afterRun` [hook](#hooks) fires when a run finishes, with the run id, the
workflow, the space, the status (`aborted` included) and whether it was a test, for
plugins that audit or forward.

## Configuration

| Variable | Purpose |
| --- | --- |
| `MAIL_DRIVER` | How the email action sends: an SMTP server, Mailpit, Gmail, Microsoft 365, Resend, SendGrid, Postmark or Mailgun, each with its own variables. See [Mail](../configuration/mail.md). A project made with `manablox create` uses Mailpit by default, whose inbox is at `http://localhost:8025`. |
| `MAIL_FROM` | The `From` header of every mail: `Manablox <cms@example.com>`. |
| `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` | The Web Push key pair. Make one with `manablox push-keys` (`pnpm push-keys` in a created project); changing it later invalidates every subscription. |
| `PUSH_VAPID_SUBJECT` | A `mailto:` or `https:` address push services may contact about the sender. |
| `ADMIN_URL` | Where the admin is served from, for the links in mails and notifications. Defaults to the first `CORS_ORIGINS` entry. |

In the [config file](../configuration/index.md) the same settings are
`mail: { transport, from }`, `push: { vapidPublicKey, vapidPrivateKey, subject }` and
`server.adminUrl`. What a node may reach is `net`, shared with webhooks and AI providers,
and the run's own ceilings are [options of the plugin](#the-workflows-plugin):

```ts
net: {
  allowPrivateNetwork: false,
  maxResponseBytes: 2_000_000,
  maxRedirects: 3,
},
plugins: [
  workflowsPlugin({ runTimeoutSeconds: 300, maxCrawlPages: 50 }),
],
```

Push notifications need the admin on a secure origin (`https`, or `localhost`); the admin
registers a small service worker (`/sw.js`) that only shows notifications and opens the
page they point at.

## Exporting and importing

**Export** in the editor's header, or the download button on a row of the Workflows list,
saves a workflow's draft as a JSON file (`<name>.workflow.json`): its trigger, abort
triggers, nodes and lines. A version's page exports that version instead. Config workflows export too. No secret ever goes into the file. The
incoming webhooks the workflow starts or aborts from travel as their settings (name, slug,
methods, how a caller signs), and the credentials its nodes and those webhooks use travel
as their name, slug and kind.

**Import** on the Workflows list reads such a file into the current space, which may be on
another instance. The new workflow is always an unpublished draft, **switched off**. What it
points at is matched by slug:

| In the file | In this space |
| --- | --- |
| An incoming webhook | The one with the same slug is used. Without one, it is created, switched off. |
| A credential | The one with the same slug and kind is used. Without one, an empty credential of that kind is created: fill in its secret before switching the workflow on. When the slug is taken by a credential of another kind, the new one gets a numbered slug (`-2`). |
| A content type | Kept when it exists here, dropped from the trigger's filters when it does not. |
| A workflow it runs | The one with the same slug is used, else the one run by other workflows with the same name. Without one the node's target is left empty and the list says which workflow was missing: import it, then pick it in the node. |

The list shows what the import had to create or drop. A name already taken gets `(copy)`
appended. The workflow is then checked like a save: a file whose nodes use an action that
is not installed here is refused as a whole, with nothing created, and the endpoints,
credentials and workflow an import creates are written in one transaction, so any other
failure leaves nothing behind either. Each of them is recorded in the activity log as it
would be when made by hand. Over the API the same is `plugins.workflows.export`
(`workflows:read`) and `plugins.workflows.import` (`workflows:write`, with the file as
`file`). The incoming webhooks travel in the file through the webhooks plugin; a file that
names one on an instance without the plugin is refused like an unknown action. To move a
whole space instead, see [Transfer](./transfer.md).

## Duplicating

**Duplicate** in the editor's header, or on a row of the Workflows list, copies a
workflow: the same trigger and the same graph, under a name that counts up (`(copy)`,
then `(copy 2)`). The copy is an unpublished draft, **switched off**, because a duplicate is made to be changed
and one that started running the moment it was copied would fire the original's actions
twice before anybody had touched it. An unsaved editor is saved first, so the copy is of
what is really there.

It is also how a workflow the config owns becomes editable: the copy is an ordinary
`runtime` workflow with no tie to the declaration, which is what the header calls
**Clone** on such a workflow. See
[Resources in code](../configuration/resources-in-code.md).

## Permissions

`workflows:read` sees workflows, their versions and their runs; `workflows:write` creates,
edits, publishes, test-runs, starts and switches them. The credentials their nodes use have
permissions of their own: `credential:read` sees them by name, `credential:write` adds,
edits and removes them (`credentials.list`, `credentials.create`, `credentials.update`,
`credentials.delete`). Owners and admins hold all four; editors hold `workflows:read` and
`credential:read`. Roles and API keys holding a workflow permission from before the vault
had its own were given the matching credential permission by the migration. A workflow can
send mail, spend money on a model and call other systems on behalf of the space, which is
why writing it is not an editor's permission by default.

The two workflow permissions are the plugin's, in the group Workflows. Every change to a
workflow is an entry in [Activity](./activity.md) on `workflows.workflow` (`workflows.workflow.create`, `update`, `publish`, `setEnabled`,
`delete` and the rest), and every finished or aborted run one on `workflows.run`
(`workflows.run.finish`, `workflows.run.abort`), written by the actor `workflows`.

## Hooks

The plugin declares three [hooks](../extending/hooks.md). A handler of a `before` hook
throws to refuse; a thrown `ManabloxError` keeps its key and status.

| Hook | Payload | When |
| --- | --- | --- |
| `workflows:beforeEnable` | `{ spaceId, id, name }`, `id` `null` for a new workflow | Before a workflow is created, imported or saved switched on, or switched on; also for each enabled workflow of a space import, before anything is written. The active workflow limit is checked after it |
| `workflows:beforeRun` | `{ spaceId, workflowId, trigger, test }` | Before a run is queued, test runs and called runs included, once the flag, the space's state, the run usage and the start rate allow it. `trigger` is the event that started it, or `schedule`, `manual` and the like |
| `workflows:afterRun` | `{ runId, workflowId, spaceId, status, trigger, test }` | Once per run as it ends; `status` is `succeeded`, `failed`, `skipped` or `aborted`. The plugin's own _workflow finished_ abort trigger listens to it. A handler that throws is logged and skips the handlers after it; the run still ends and wakes a workflow that called it |

Their context is `{ manablox, spaceId }`. The payload types come with
`@manablox/plugin-workflows` (`WorkflowRunSummary` is the one of `workflows:afterRun`); a
plugin that registers a handler imports the package so the hook names are known.
