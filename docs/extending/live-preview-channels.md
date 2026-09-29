---
title: 'Live preview channels'
description: 'Typed messages between a plugin screen in the admin and its frame on the site.'
---

The admin talks to a frame with the site (the visual editor, a design canvas) over
`@manablox/live-preview`. Besides the content messages every frontend handles, a plugin can
open its own channel on that connection: named messages with a payload, in both directions.
The designer of designed sites uses the channel `website` this way.

## The messages

A channel is typed by a map of message names to payloads, one map per direction:

```ts
import type { PluginChannelMap } from '@manablox/live-preview';

export interface HelloMessages extends PluginChannelMap {
  toPreview: { greet: { name: string } };
  toEditor: { clicked: { id: string } };
}
```

Keep the map in a package both sides can import without pulling in the other side.

## The frame

The frame lists the channels it handles in `plugins` and opens them with `plugin(id)` on the
value `connectPreview` returns:

```ts
import { connectPreview } from '@manablox/live-preview';

const connection = connectPreview({ editorOrigin, onDocument, plugins: ['hello'] });
const hello = connection.plugin<HelloMessages>('hello');
const off = hello.on('greet', ({ name }) => show(name));
hello.send('clicked', { id: 'button' });

// later
off();
connection();
```

The returned value is still the function that disconnects the frame.

## The admin

An admin plugin screen that frames the site opens the same channel on its editor channel:

```ts
import { createEditorChannel } from '@manablox/live-preview';

const channel = createEditorChannel({ iframe, previewOrigin, onReady });
const hello = channel.plugin<HelloMessages>('hello');
hello.send('greet', { name: 'Ada' });
hello.on('clicked', ({ id }) => select(id));
```

- `onReady(capabilities)` gets the frame's channels in `capabilities.plugins`.
- A `send` before the frame is ready waits; only the last payload of each name is kept, and they go out in the order of their first send, before the queued document.
- Once the frame is ready, messages for a channel it did not list are dropped.
- `on(name, handler)` returns a function that stops listening.

## On the wire

Every plugin message is `{ v: 1, kind: 'plugin', plugin, name, payload }`. Both sides check
the origin (and the admin also the frame) of every message before a handler sees it. The
payload is whatever the other side sent, so check its shape where a wrong value would do
harm.

Content messages carry the same version. A side ignores message kinds it does not know.
