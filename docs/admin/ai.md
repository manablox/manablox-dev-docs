---
title: 'AI'
description: 'Claude, ChatGPT and self-hosted models for text, Nano Banana and Veo for images and video: where the keys live, what the magic wand does, how a whole document is generated, and how content types, templates, workflows and whole spaces are designed from a description.'
---

**Settings > AI** is where a space is given the providers it generates with. Once one is
set up, a magic wand appears beside every text field and asset field, the document
editor gains a **Generate** button that writes the whole thing at once, and content
types, block types, templates, workflows and new spaces can be designed by describing
them in a sentence or two.

Nothing is on by default. A space with no provider shows no wands: the feature is absent
rather than present and broken.

## The AI plugin

All of it is the AI plugin, `@manablox/plugin-ai` (plugin id `ai`). `manablox create`
offers it in its feature choice (`--ai`, or `ai` in `--features`), and
`manablox plugin install ai` adds it to an existing instance. An instance that
does not load it has no AI: no **AI** settings tab, no wands, no Generate or Describe
buttons, no AI step in the workflow editor, no AI site type in the new space form, and
the website designer's AI theme and block design are hidden.

To add it to an instance, add `@manablox/plugin-ai` to its dependencies, with the same
version as the other `@manablox` packages, and load it in the management config's
`plugins`:

```ts
import { defineConfig, envList } from '@manablox/core';
import { aiPlugin } from '@manablox/plugin-ai';
import { licensePlugin } from '@manablox/plugin-license';

export default defineConfig({
  // ...
  plugins: [
    // AI is a premium plugin: it needs the license plugin and a key (MANABLOX_LICENSE_KEYS).
    licensePlugin(),
    // Private-network hosts a self-hosted AI provider may reach, as `host` or `host:port`.
    aiPlugin({ allowedHosts: envList('AI_ALLOWED_HOSTS', []) }),
  ],
});
```

The public delivery instance needs nothing. Then run `manablox migrate`: the plugin's
baseline migration creates its tables, `ai_providers` and `ai_generations`, where they are
missing. Removing the plugin leaves both tables in place.

Without a valid license lease the plugin's flag `features.plugins.ai` locks, with a buy link:
its procedures answer 403 `control.feature`, the `ai.generate` step is refused and the AI
buttons show the lock. Providers, keys and generations stay. On a development license its
procedures refuse a public `Host` with 403 `plugins.ai.license.host`.

| Option | Meaning |
| --- | --- |
| `allowedHosts` | Hosts on the private network a self-hosted model may be reached at, as `host` or `host:port`. Usually read from `AI_ALLOWED_HOSTS`. See [Self-hosted models](#self-hosted-models) |
| `designRetries` | How often a design with problems is sent back to the model. 2 by default. See [Designing with AI](#designing-with-ai) |

The plugin owns its [permissions](#permissions), its controls under
`features.plugins.ai`, `usage.plugins.ai.calls`, `rateLimits.plugins.ai.calls` and
`retention.plugins.ai.generationsDays` (see [Controls](../configuration/controls.md#the-ai-plugin)),
the procedures under `plugins.ai.*`, the `ai:generate` job, what it contributes to the
[workflows plugin](./workflows.md#the-workflows-plugin) (the action `ai.generate`, the
field kinds `aiProvider` and `aiModel` of its form, hints for the workflow designer and
the **Describe it** entry of the new workflow dialog), the error keys `plugins.ai.*` (see [Error keys](../reference/errors.md#plugin-keys))
and the AI section of `/llms.txt`. Its providers travel in a transfer as the plugin section
`ai.providers`.

## Setting up a provider

Each provider is a row on the tab. A closed row shows what the provider can do and whether
it is on, not set up or off; click it to open its settings. Opening another row closes it,
but keeps anything typed and not yet saved:

| Provider | What it does | Key |
| --- | --- | --- |
| Claude | Text | An Anthropic API key, from console.anthropic.com |
| ChatGPT | Text | An OpenAI API key, from platform.openai.com |
| Self-hosted | Whatever you set it up for: text, images | Only if your server asks for one. See [Self-hosted models](#self-hosted-models) |
| Google | Images and video | A Gemini API key, from aistudio.google.com. The same key covers every model below. |

For images, Google offers both families under that one key:

| Model | Id | What it is for |
| --- | --- | --- |
| Nano Banana Pro | `gemini-3-pro-image` | The most faithful, and the one that can render legible text inside a picture. The default. |
| Nano Banana Pro (preview id) | `gemini-3-pro-image-preview` | The same model under the id it launched with. Google has served it under both; use this one if a key cannot see the other. |
| Nano Banana 2 | `gemini-3.1-flash-image` | Nearly as good, several times faster and cheaper. |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | The cheapest. Renders 1K whatever resolution is asked for. |
| Nano Banana (legacy) | `gemini-2.5-flash-image` | The original. |
| Imagen 4, Imagen 4 Ultra | `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001` | Google's dedicated image models. |

The two families are different APIs behind the same key - the Nano Banana models are
Gemini models and answer on `generateContent`, Imagen answers on `predict` - and
Manablox picks the right call from the model id, so switching between them is only a
change of model in its settings. Video is Veo, in both cases.

A provider's settings hold four things:

- **The API key.** Stored encrypted with the instance secret and never sent back to the browser: the field is empty on every visit and shows only the last four characters of the key that is there. Saving with the field empty keeps the stored key; **Remove** deletes it. Because the key is encrypted with the instance secret, changing that secret makes the stored keys unreadable and they have to be entered again.
- **The model**, per capability. The suggested ids are the current ones; the field exists because model ids move faster than releases do.
- **The system prompt.** Sent before every prompt this provider serves in this space, so generations come out in the house style. Empty means the shipped default, which is shown as the placeholder.
- **The switch** that offers the provider in the editor. A provider with no key, or with the switch off, is not offered.

**Test the key** proves the key works. For Google it also lists the models that key can
actually call and checks the ones chosen in its settings are among them - Google publishes
and retires image model ids faster than anything else here, so a model the key cannot see
is the usual reason a generation fails. When one is missing, the message names the models
that key *does* have, which is what to switch to. The list at the bottom of the tab is the space's recent generations: the
prompt, the provider and model, and - when one failed - the reason the provider gave,
in the provider's own words.

Keys are per space. Two spaces can bill to two accounts, and a space can be left with no
AI at all. Keys are not part of a space export; a self-hosted model's address and
settings are, with its key left out. A [snapshot](./backups.md) restored on the same
instance takes the keys over from the space's own providers.

## Self-hosted models

**Add a self-hosted model** on the AI tab connects a model you run yourself: Ollama, LM
Studio, vLLM, LocalAI, llama.cpp's server, or any gateway that speaks the OpenAI API. A
space may have several, say a text model on one machine and an image model on another.
Each one is a row of its own under **Self-hosted models**, and asks for what a hosted
provider already knows:

| Setting | What it is |
| --- | --- |
| Name and slug | The name editors see, and the slug requests use: a self-hosted model is `custom:<slug>` wherever a provider is named, in a workflow's AI step or an API call. The slug cannot change once saved |
| Speaks | **OpenAI-compatible** (`<base>/chat/completions` and `<base>/images/generations`), or **Ollama (native)** (`<base>/api/chat`), which also passes the context window and a strict JSON mode |
| Base URL | Up to the version segment for the OpenAI shape (`http://ollama:11434/v1`), the server root for native Ollama (`http://ollama:11434`) |
| What it can do | Write text, draw pictures, or both, each with the model to call. The model is typed, since it is whatever you pulled |
| Can be held to a JSON answer | Documents and designs are JSON. Untick it for a server that refuses JSON mode; answers are still read leniently |
| Longest answer, context window, wait at most | The answer's token ceiling, Ollama's `num_ctx` (designs want 16k or more), and the deadline, which defaults to 300 seconds because a local model on modest hardware is slow |
| API key | Optional, sent as a bearer token |

**Test the connection** lists the models the server has and checks the configured ones
are among them; when one is missing, the message names what the server does have. A
reasoning model's `<think>` scratchpad is stripped from every answer.

A server on the private network (which is where they usually are) is refused until the
instance names it in the plugin's `allowedHosts`, which the config usually reads from
`AI_ALLOWED_HOSTS`: `AI_ALLOWED_HOSTS=ollama,localhost:11434`. The
test says which host to add. Only the named hosts are let through, and only for AI calls;
the rest of the network stays closed to the providers and to workflows alike. See
[Environment variables](../configuration/environment.md#ai) and
[Security](../deployment/security.md).

When a space has both a hosted and a self-hosted provider for a job, the dialogs open on
the hosted one and offer the other in the provider picker.

## The magic wand

Every dialog opens on the provider and model the space's settings name, and both can be changed
for one generation without touching the space's settings - to try a cheaper model for a
draft, or the strongest one for the picture that matters. The choice is not saved; the
next dialog opens on the configured model again, and the history records which model each
generation actually ran on.

A **text field or rich text field** carries a wand beside its label. The dialog offers a
writing style, a tone and a length, and a prompt box; what comes back can be edited in
the dialog before **Use it** puts it in the field. Nothing touches the document until
then, and nothing is saved until you save.

**Assets** carries the same two buttons beside Upload files, for generating into the
library without going through a document. What lands there is an ordinary asset.

An **asset field** carries one wand per kind of file it accepts: an image field offers
images, a video field offers video, an unrestricted field offers both. Image generations
offer a style, a mood, an aspect ratio and a resolution; video generations offer a style,
a camera motion, an aspect ratio and a duration. Resolution (1K, 2K, 4K) is a Nano Banana
setting: an Imagen request ignores it, and Nano Banana 2 Lite renders 1K whatever is
chosen. The five aspect ratios offered are the ones every image model accepts. A finished generation is uploaded to the space's
asset library first and then put in the field, so it is a normal asset: it can be
cropped, reused, and it stays in the library whether or not the field is saved.

The model is told where the generation is going: the content type, the field's label and
whether it takes plain text or rich text, the locale being edited, the document's title,
any length limit on the field, and what the document's other text fields already say. A
teaser generated on its own therefore matches the body that is already there.

Text is answered inside the request. An image or a video is a job: the row is recorded
first, the dialog polls it, and a video that takes minutes survives the wait. Closing the
dialog loses only the polling, never the work.

## Lengths

The **Length** picker offers numbers rather than adjectives. Each length is a preset with
three numbers: the words a single field is written to, the words a whole document is
written to, and the blocks a document's block fields hold.

| Preset | A field | A document | Blocks |
| --- | --- | --- | --- |
| Short | 30 words | 250 words | 3 |
| Medium | 90 words | 700 words | 5 |
| Long | 250 words | 1500 words | 8 |
| Extensive | 500 words | 3000 words | 12 |

The **Lengths** card on the AI tab rewrites them for the space: rename them, change the
numbers, add up to twelve, or leave the block count empty to let the model choose. A
provider's "What the dialog opens on" can preselect one.

**Custom** in the picker takes exact numbers for one generation: words, and for a
document the number of blocks. A field's own character limit still wins, so a
60-character teaser stays one whatever length is chosen. A document's words are spread by
purpose (a title stays a title, the body carries the rest), the block count is held to
the field's own minimum and maximum, and a long document is given the output room and
the time it needs rather than being cut off by the default limits.

A document is written inside the request, so a proxy in front of the API has to let a
long one finish: several thousand words can take a few minutes, and nginx gives up on
an upstream after 60 seconds unless `proxy_read_timeout` says otherwise.

## Generating a whole document

The document editor's **Generate** button asks for every text field of the content type
at once, plus the title, as a single answer. Filling them one at a time would drift; one
answer keeps the teaser and the body talking about the same thing.

**Block fields are part of that answer.** Where the type has a block field, the model is
shown every block type it may hold and each one's own fields, and it composes the
sequence: which blocks the piece needs, in which order, filled in. A block type that does
not suit is left out, one that suits twice is used twice, and the field's own minimum and
maximum are respected. A single-block field gets exactly one.

The result is not a summary you accept or reject: the dialog shows the generated blocks
**in the block field itself** - the same board, the same inputs, the same drag and drop -
so the layout can be adjusted and the text rewritten before any of it reaches the
document. What you hand over is what you looked at. (Pressing **Again** regenerates, and
that does discard edits made in the preview.)

**The grid is generated too.** The model chooses how many columns the page wants and
places every block on it - a block carrying a lot of text wider than one carrying a line,
short blocks side by side rather than stacked, an opening block across the full width.
The columns it picks become the desktop grid; tablet is narrowed to at most two columns
and a phone gets one, which is what the field does by itself. A placement that reaches
past the last column, or that would sit on top of another block, is dropped and that one
block is left for the grid to place - so a layout can be partly used rather than refused
whole. Everything is draggable afterwards exactly as if you had placed it.

**Nested blocks** - a block that itself holds blocks - are left alone, because a layout
chosen inside a layout is hard to unpick.

The generated values replace what those fields hold, and the title fills the slug on a
document that has not been saved yet.

### More controls

The dialog's **More controls** steer a whole document further:

- **Blocks it may use**: untick block types the model should leave out of this document.
- **Describe pictures for the image fields**: untick to generate text only, with no briefs to draw.
- **Audience**: who it is written for, in your own words.
- **Keywords**: terms the document should use naturally, the most important first.

### The pictures

A content type with image fields - on the document, or inside its block types - is
generated in two passes, because the two halves need different models.

1. **The writing pass** produces the text, the blocks and the grid, and for each image field a *brief*: a sentence or two saying what belongs in that picture. The text model writes it because it is the only thing that knows what the page says.
2. **The drawing pass** happens when you press **Draw N pictures**. Each brief goes to the space's image provider in turn, at the aspect ratio the writer asked for and under the space's own image defaults, and the thumbnails fill in as they arrive.

Each picture appears in its block in the preview as it arrives, so the page can be judged
whole. They are drawn one at a time rather than all at once: image providers rate-limit
hard, and a failure halfway through leaves the pictures already drawn in place instead of
losing the lot. **Use it** then writes the text, the blocks, the grid and the pictures
into the draft together, so it is one thing to undo. You can skip the drawing pass
entirely and press Use it - the image fields are simply left empty for the wand on each
one to fill later. A space with no image provider sees the briefs and a line saying so. As with the wand, nothing is written until you
save, so undo and Discard both still work.

## Designing with AI

The same providers can design structure rather than write copy. Each design is shown in
full before anything exists, and nothing is created until you press Create.

| Where | What you describe | What is created |
| --- | --- | --- |
| Content types > **Describe a content model** | What the site holds | Document types, databag types for records such as authors or categories, and the block types they need, together |
| Content types > **Describe it** on either card | One document type, or one block type | That type, plus any block types a document type needs |
| Templates > **Describe a template** | What the template is for | A template laid out from the space's block types and filled with sample copy, plus a new block type for any section none of them fits |
| Workflows > New workflow > **Describe it** | The trigger and what should happen | A complete workflow, switched off |
| Settings > Spaces > New space > **Describe it** | What the new space will hold | The space, with its document and block types |

**Content types** are designed against the field types installed on the instance, with
their exact settings, and against the types the space already has, which are reused
rather than designed twice. The preview lists every type with its fields and what each
block field holds; untick a type to leave it out (a type another ticked type embeds
cannot be left out on its own). Create makes them all in one go, block types first, and
if any of them fails, none is kept.

**Templates** go through the same reader a generated document does: existing block types
where they fit, a new block type where none does, a grid, and sample copy that shows what
belongs in each block. The template opens in the editor as a draft.

**Workflows** are designed against the space's own actions, credentials, incoming
webhooks and document types, then checked exactly as a save would check them. The
[workflows plugin](./workflows.md#the-workflows-plugin) does the designing
(`plugins.workflows.design`) with this plugin's services; **Describe it** is this plugin's
entry in the new workflow dialog, so it is there only with both plugins loaded. An action
the instance cannot run (no mailer, say) is not offered, and a value only you know, an
address or a URL, is left as a placeholder the notes point out.

**A new space** has no provider yet, so it is designed with the AI of a space you choose,
against the instance's global types only. **Give the new space the same AI providers**
copies that space's providers into the new one, keys included, so it can go on
generating with what it was designed with.

A model gets things wrong: a field type that does not exist, a block field pointing at a
type nobody designed, an edge from a step that is not there. Every design is read
strictly, and an answer with problems is sent back to the model with the problems listed,
up to twice (the plugin's `designRetries` option). Whatever is still wrong after that is
left out of the design, and the preview says what was left out and why.

Designs are long, structured answers. The strongest model you have does them best, and a
self-hosted model needs a context window of 16k tokens or more.

## Letting an AI agent work in Manablox

The other direction: an AI agent (Claude, ChatGPT, a coding assistant, a script) driving
this instance through its API. The instance describes itself for one:

| URL | What it is |
| --- | --- |
| `/llms.txt` | The guide: authentication, the model, the value shapes, recipes for creating a content model, documents, templates and workflows, and how to design a designed site (design documents, elements, bindings, style tokens, design presets and layout advice) |
| `/llms-full.txt` | The same with every field type's settings schema, every workflow action with its config and outputs, every procedure, and for design the theme, menu and bundle shapes with complete example designs |
| `/openapi.json` | The exact input schema of every procedure |

All three are generated from what is installed, so a plugin's field type or workflow
action appears in them the moment it is. The **Let an AI agent work here** card on the AI
tab shows the three URLs and a first message to paste into the agent. Give it an API key
from [API keys](./api-keys.md) with only the permissions the job needs.

Three things make the API easy for an agent to use. `contentTypes.applyPlan` creates a
set of types that refer to each other by machine name, block types first, all or nothing.
A rich text field accepts an HTML string as its value and stores the document it
describes, so an agent never has to write ProseMirror JSON. And the design procedures
above (`plugins.ai.designContentTypes`, `plugins.ai.designTemplate`,
`plugins.workflows.design`)
are there for an agent to use too, when the space has a provider. The AI section of
`/llms.txt`, with these procedures, is there only when the instance loads the AI plugin.

## Permissions

| Grant | What it allows |
| --- | --- |
| `ai:read` | See what is set up on the AI tab, never a key |
| `ai:use` | The wands, the Generate button and the Describe buttons |
| `ai:configure` | Add keys, choose models, edit the system prompts |

Editors and authors hold `ai:read` and `ai:use` by default; only owners and admins hold
`ai:configure`. Designing content types or a template also needs `contentType:read`, and
designing a workflow `workflows:read`; creating what was designed needs the same rights as
creating it by hand. Copying providers into a new space needs `ai:configure` on the space
they come from. Every generation is an entry in [Activity](./activity.md), with the
prompt and who asked for it; keys never appear in the log, only whether one was set.
The entries are `ai.generation.create` on `ai.generation`, `ai.provider.configure` and
`ai.provider.delete` on `ai.provider`, and `ai.settings.update` on `ai.settings`.

## What it costs

Every generation is a call to the provider, billed to the key in its settings. Nothing here
is cached behind your back: a generation happens when someone presses Generate, and
pressing it again is a second one. The one retry is a design's: one sent back with its
problems is a second call, and a third at most. A self-hosted model costs whatever running
it costs you.
