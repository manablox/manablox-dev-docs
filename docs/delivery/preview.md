---
title: 'Preview and the visual editor'
description: "Reading drafts from a server with an API key, and implementing the /preview route that turns a frontend into the visual editor's canvas."
---

There are two different things called preview, and a frontend can support either or
both:

| | Preview reads | The visual editor |
| --- | --- | --- |
| What | A server-side request that reads **drafts** instead of published copies | The admin shows the frontend in a frame and pushes the **unsaved** document into it on every keystroke |
| Needs | An API key, kept on the server | A `/preview` route in the frontend that listens on a message channel. No key |
| Talks to | The management API | Nothing: the document arrives from the admin |
| Good for | "Preview" links, staging builds, rendering a draft in full | Editing side by side with the result, click-to-edit |

## Preview reads

The management API reads drafts for a request that carries **both** a valid credential
and the `x-manablox-preview` header. A header alone is ignored; a key alone reads
published content like anyone else. Preview is GraphQL only: the REST surface is
mounted on the public instance, which has no drafts.

```ts
// server code only, never in a browser bundle
import { createPreviewClient } from '@manablox/public-sdk/preview';

const preview = createPreviewClient({
  url: process.env.MANABLOX_MANAGEMENT_URL!,      // http://localhost:3000
  apiKey: process.env.MANABLOX_API_KEY!,
  spaceId: process.env.MANABLOX_SPACE_ID!,        // the management instance serves every space
});

const draft = await preview.byPermalink('/about');
```

The client lives behind its own entry point so a bundler cannot follow an import into a
browser bundle and ship the key. It sets the two headers, pins GraphQL and turns caching
off, since a draft is per editor and must never be shared.

Issue the key under **Settings > API keys**, restricted to the one space and to
`content:read` and `asset:read`. See [API keys](../admin/api-keys.md). A common shape
is a `/preview?path=...` route on the frontend, or a query flag the server honours, that
renders through the preview client instead of the public one.

## The visual editor

**Visual** in the document editor opens the space's **Frontend URL** plus `/preview` in
an iframe beside the fields. Over a versioned, origin-checked `postMessage` channel
(`@manablox/live-preview`):

- the admin sends the whole document, title, slug, fields in storage shape, on every change, before it is saved, along with what the page cannot know: each block's label, which fields may be edited in place, and each block field's grid per breakpoint;
- the frontend renders it, reports that it is ready, and reports a click on a field, which opens that field in the panel beside the frame;
- the frontend shows a toolbar on each block it tags: drag it to another place (from cell to cell on a grid), step it up or down, add a block after it, delete it; the selected block gets handles to resize it on the grid. Each is a request; the admin edits the draft and sends the document again;
- text and rich text are edited in place: double-click, type, and the draft follows on every keystroke; Enter or a click elsewhere ends the edit, Escape cancels it. A rich text field is edited with the same editor and schema as in the panel, with undo and redo, and gets a floating toolbar with the tools its settings allow among bold, italic, strikethrough, link, heading, lists, quote and alignment;
- the admin highlights the block the editor is in, so the frontend can too.

The frame is shown at a desktop, tablet or mobile width, scaled to fit, so the page's
own media queries see the width the device would have; a desktop preview is never
narrower than the desktop breakpoint. Every layout edit, in the frame or on the board,
applies to the breakpoint being shown.

The panel beside the frame edits whatever was clicked: a block's fields with the clicked
one focused, and its position on the grid when the field is one, on a board of every
block at the current breakpoint (drag to move, drag a corner to resize, steppers for
exact numbers). With nothing selected it shows the document's own fields and the block
field's board and list, where blocks can be added, reordered and opened as in the
document editor.

The frontend never fetches a draft, so **no key is needed** and the route can be
public. It only accepts messages from the admin's origin, so it cannot be driven by
another page.

### Implementing `/preview`

Three things, in any framework:

First, **a route at `/preview`** on the frontend's origin, rendered in the browser (the document arrives after the page loads). It must be embeddable in a frame from the admin's origin: do not send `X-Frame-Options: DENY` or a `frame-ancestors` that excludes it.

Second, **connect** on mount and render whatever arrives:

```ts
import { connectPreview, fieldAttribute } from '@manablox/live-preview';
import { normaliseFields } from '@manablox/public-sdk';

const disconnect = connectPreview({
  editorOrigin: 'http://localhost:3000',   // the admin's origin, required
  clickToEdit: true,
  onDocument: (document) => {
    // `document.fields` is in storage shape: blocks are { blockId, type: <id>, fields },
    // plugin data such as a design at `ext.website` rather than `design`.
    // normaliseFields() turns them into the shape the SDK returns, so the same
    // components render the published page and the preview.
    render(document.title, normaliseFields(document.fields));
  },
  onHighlight: (path) => { /* path into the fields, or null */ },
});
```

The admin sends block types by **name** (`type: 'teaser'`), the same as the delivery API, so one block registry serves both. Set the editor origin from the environment, not by hand.

Third, **tag rendered fields** with `data-manablox-field` so a click in the preview selects the right field in the form: `fieldAttribute(['components', 0, 'headline'])` produces the attribute for a block's field; the whole block gets `fieldAttribute(['components', 0])`. Tag the element that holds the list with `listAttribute(['components'])` as well, so "add a block" is offered while the list is empty.

That tagging is all the block toolbar needs. `connectPreview` draws it inside the frame
on every element tagged as a block (`blockControls`, on by default with `clickToEdit`):
a drag handle, move up, move down, add after, delete, and resize handles on the selected
block. On a list whose element is a CSS grid the drag moves the block from cell to cell,
reading the tracks off the page's own styles, and posts the placement for the breakpoint
the frame is at. It touches nothing of the page but its own overlay, so it works the
same in any framework. Pass `blockControls: false` to draw your own instead;
`requestBlockMove(editorOrigin, list, from, to)` posts a reorder from a handle of the
page's own.

Inline editing (`inlineEditing`, on by default with `clickToEdit`) works on the same
tags: the admin says which fields are text or rich text, and a double-click turns the
page's own element into an editable one. A text field is edited as plain text. A rich
text field gets a Tiptap editor mounted on that element, built from the admin's own rich
text schema (`@manablox/live-preview/rich-text`) and started from the stored document, so
it accepts and produces exactly what the field editor in the panel does: toolbar tools are
editor commands, undo and redo are the editor's history, and a paste keeps only what the
schema allows. The editor code is loaded when the first rich text edit starts, so a page
nobody edits never downloads it. Link addresses are typed into the toolbar itself, since
the admin frames the page without permission to open dialogs. Nothing is required of the
page beyond rendering the field inside the tagged element; its own styles keep applying
while it is edited.

`onDocument(document, meta)` receives, beside the document, the block labels, the
editable fields with their tools, and each block field's grid per breakpoint. The
document's block fields are `{ grid, blocks }` in storage shape; `normaliseFields`
resolves the grid, so `gridOf(fields.components)` renders the preview like the page.

A block list is addressed by the path of the field that holds it: `['components']`, or
`['components', 0, 'children']` for a list nested in a block, so nested blocks get the
same toolbar.

The Nuxt module wraps this in `<ManabloxPreview>` and tags blocks and the list
automatically in `<ManabloxBlocks>`; the guides show it in Vue.

The channel is versioned (`PROTOCOL_VERSION`, currently 1) for content and plugin messages
alike (see [Live preview channels](../extending/live-preview-channels.md)). A frontend on
another version stays on "Waiting for the editor...", so update both together.
See [A Vite + Vue SSR frontend](../guides/vite-vue-ssr.md#step-9-the-visual-editor).

### Checklist when the frame stays on "Waiting for the editor..."

- The space's **Frontend URL** is the frontend's origin, and the frontend serves `/preview` there.
- `editorOrigin` on the frontend is exactly the admin's origin (scheme, host, port).
- The frontend's response has no header forbidding framing.
- The admin is on `https` or `localhost`; a page on `https` cannot frame one on `http`.
