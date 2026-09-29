---
title: 'Scaffold a frontend'
description: 'One command writes a working frontend for a space: plain Vite and TypeScript, Astro, Vite with React and SSR, or Vite with Vue and SSR. Routing by permalink, blocks, menus, typed content and the visual editor are already wired.'
---

`manablox frontend` writes a complete frontend for a space against the delivery API. It
is the fastest way from a published page to a site that renders it, and the code it
leaves behind is meant to be edited: no runtime of its own, no configuration format to
learn, just the SDK and the framework you picked.

```sh
pnpm dlx @manablox/cli frontend my-site
```

It asks what it needs to know and writes the folder. Nothing is installed globally, and
the project does not depend on the CLI afterwards.

## The four shapes

| `--framework` | What it is | Dev port |
| --- | --- | --- |
| `plain` | Vite and TypeScript, no framework. Rendered in the browser, so `pnpm build` is a static bundle any CDN can serve | 3003 |
| `astro` | Astro, server-rendered on Node. The default. Pages ship no JavaScript except the preview canvas, which needs it | 3005 |
| `vue-ssr` | Vite and Vue 3, rendered on the server and hydrated in the browser, behind a small Express server | 3006 |
| `react-ssr` | Vite and React 19, the same shape as `vue-ssr` | 3007 |

Every one of them does the same four things, in the idiom of its framework:

- **Routing by permalink.** One catch-all route asks the CMS for the document at the
  current path. Nothing is published there means 404; the CMS being unreachable means
  503, which is a different answer and must not be cached as if it were a missing page.
- **Blocks through a registry.** A block whose type is `teaser` renders the teaser
  component. An unknown type renders a visible note rather than vanishing. The list is
  laid out on the grid the editor placed the blocks on: each block's layout becomes the
  custom properties the SDK's `BLOCK_GRID_CSS` reads, and every template ships that
  stylesheet, so a grid built in the admin lands on the page unchanged. It comes from the
  SDK rather than a copy in the project, which could drift from the properties the
  components set.
- **The menu called `main`,** as edited in the admin under Menus.
- **A `/preview` route** for the visual editor, with click-to-edit attributes on every
  field of every block.

Rich text arrives as ProseMirror JSON and is rendered with the SDK's `richTextToHtml`,
which escapes every string and emits a fixed set of tags. That is the only reason the
templates set inner HTML at all; never pass a CMS string to `v-html`,
`dangerouslySetInnerHTML` or `set:html` unescaped.

## Options

Everything the questions ask has a command line option, so a scripted run needs no
terminal:

```sh
pnpm dlx @manablox/cli frontend my-site --yes --framework vue-ssr \
  --url https://content.example.com --editor-origin https://cms.example.com
```

| Option | What it decides |
| --- | --- |
| `--framework plain\|astro\|react-ssr\|vue-ssr` | Which of the four is written; `astro` by default |
| `--name` | The package name; defaults to the folder name |
| `--url` | The delivery API to read from; `http://localhost:3100` by default |
| `--editor-origin` | The admin's origin, which the preview channel checks every message against; `http://localhost:3000` by default, where a project from `manablox create` serves the admin |
| `--space-id` | Only needed against a management instance; a public one pins its own space |
| `--port` | The dev server port; one per framework by default |
| `--manablox-version` | The `@manablox/*` range to depend on; defaults to the CLI's own version |
| `--install` / `--no-install`, `--git` / `--no-git` | Run `pnpm install` and `git init` afterwards; both default to yes |
| `--yes`, `--force` | Take the defaults without asking; write into a folder that is not empty |
| `--model management\|delivery\|none` | Where the content model for the components is read, see below |
| `--api-url`, `--api-key` | The management API and a key that may read the space; a key implies `--model management` |
| `--space` | The space on the management API, by machine name or id; needed when the key reaches several |
| `--types all\|a,b` | The types to write components for; all of them by default |

## Components from a space's content model

Without a model the frontend ships one example block, `teaser`. Point the command at a
running instance instead and it writes a component for every content type and block type
you pick, with one element per field, so the site renders the space's documents from the
first `pnpm dev`.

The question after the delivery API offers two ways to read the model:

- **The management API**, with an API key (create one in the admin under `Settings > API keys`). The command lists the spaces the key can read, asks which one, then reads that space's types.
- **The delivery API** the frontend reads from. No key is needed, and there is no space to pick: `/v1/types` describes the one space a public instance is pinned to.

Then it asks which types get a component: all of them, or a pick from a list grouped
into content types and block types, where selecting a group selects every type in it.
Picking a space on the management API also makes it the default for `MANABLOX_SPACE_ID`.

A scripted run says the same on the command line:

```sh
pnpm dlx @manablox/cli frontend my-site --yes --framework astro \
  --api-url https://cms.example.com --api-key "$MANABLOX_API_KEY" \
  --space marketing --types article,teaser,gallery
```

What gets written, in the idiom of each framework:

- **A component per block type** in the blocks folder, and a registry beside it (`index.ts`) that maps the type's name to it. `Blocks` looks every block up there, so a block list renders with no further wiring.
- **A component per content type** in the content folder, and a registry beside it. The page renders a document of such a type through its component, and any other type as the generic article.
- **`fields.ts`**, the helpers the components read values through: text, dates, rich text, assets, related documents, users and links. A field that is empty renders nothing.
- **An `expand` list** on the page request naming every asset, content and user field, so relations arrive as objects rather than ids.

Each field renders by what it holds. Text, numbers, booleans and selects become a
paragraph (the first title-like text field of a block is a heading), rich text goes through
`richTextToHtml`, an asset field renders its images through the `card` preset, a content
relation a list of links, a link field an anchor with its tab choice, and a blocks or
template field a nested block list. Every element carries its click-to-edit path, so the
visual editor works on the generated components as it does on the teaser. Astro's preview
canvas runs in the browser, so the command writes matching DOM renderers for it as well.

The components are a starting point to edit, not generated code to keep in step. A field
added in the admin later needs a line in its component, and a new type a component and a
line in its registry. `pnpm types` keeps the TypeScript side current.

## Where the values come from

No API key, no preview token: the delivery API has no draft path to unlock, which is what
makes shipping a built bundle to a CDN safe.

The browser-only `plain` template reads `VITE_`-prefixed variables, which Vite inlines
into the bundle at build time, so a change to them needs a rebuild. The three
server-rendered templates read plain variables from `process.env` at start-up, so one
build runs against any instance:

```sh
MANABLOX_URL=https://content.example.com pnpm start
```

Both write a `.env` with the answers and an `.env.example` beside it.

## Typed content

```sh
pnpm types      # writes src/manablox.d.ts from <url>/v1/types
```

The file is generated from the space's content model, and checking it in is what turns a
field renamed in the admin into a compile error after the next `pnpm types`, rather than
`undefined` in production. See [The SDK](../delivery/sdk.md).

## The visual editor

Set the space's frontend URL in the admin to where this site runs. The **Visual** button
then loads `<that URL>/preview` in a frame and pushes the document being edited into it on
every keystroke, unsaved. The route needs no credential: the editor sends the document
over the channel rather than the page fetching a draft.

The origin check in `connectPreview` is not optional. Without it any page could drive the
preview. It is the `--editor-origin` answer, and it lives in `.env` afterwards. See
[Preview and the visual editor](../delivery/preview.md).

## What to do next

The scaffold is a starting point, not a framework. The generated `README.md` explains
every file it wrote. To understand what the code is doing, and to go further than the
components it ships with, [A Vite + Vue SSR frontend](./vite-vue-ssr.md) builds the
same site by hand, step by step, and explains every decision on the way.
