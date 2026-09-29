---
title: 'Lifecycle and channels'
description: "Run a plugin's long-running work from start to shutdown, and send messages between an instance's processes."
---

Most of a [plugin](./plugins.md) runs when something asks for it: a request, a hook, a
[job](./jobs.md). Work that runs on its own, such as a timer or a watcher, starts with the
server and stops with it.

```ts
definePlugin({
  name: 'hello-extra',
  services: helloExtraServices,
  start: (plugin) => plugin.services.board.listen(plugin),
  stop: (plugin) => plugin.services.board.close(),
});
```

| Key | Runs |
| --- | --- |
| `start(plugin)` | Once the server has booted, on management instances only: the process that runs the job worker and the scheduled work (see [Server modes](./server-modes.md)). Plugins start in [boot order](./dependencies.md#boot-order); a `start` that throws stops the boot |
| `stop(plugin)` | When the server shuts down, in reverse boot order, before the database closes. A throw is logged |

Both get the plugin's [context](./services.md#the-plugin-context), with its services built.
With several management replicas each one starts the plugin, as each runs a worker; work that
must happen once per instance belongs in a [maintenance task](./jobs.md) instead.

## Channels

`plugin.channel(name)` sends messages to the instance's other processes: other replicas of
the management API, the public API, plugin modes. It publishes on the process's shared Redis
command connection and listens on its one subscriber, like the cross-process cache
invalidation, so a channel costs no connection of its own. It works where `cache.redisUrl`
is set; without Redis there is one process and nothing to send to. After the subscriber
reconnects, listeners get `undefined`: messages sent in between were missed.

```ts
interface BoardMessage {
  spaceId: string;
}

const channel = plugin.channel<BoardMessage>('board');
const unsubscribe = channel.subscribe((message) => {
  // `undefined` after a reconnect: messages may have been missed, so drop everything.
  if (message === undefined) index.clear();
  else index.forget(message.spaceId);
});
channel.publish({ spaceId });
```

| Member | Meaning |
| --- | --- |
| `publish(message)` | Sends a JSON value to every other process. The sending process does not get its own message; act on the change there directly |
| `subscribe(listener)` | Calls `listener` with each message another process sent, and with `undefined` after a reconnect. Returns the unsubscribe function |

`name` is a word of letters, digits, `.`, `_` and `-`, unique within the plugin; the
channel on the wire is `plugin:<id>:<name>`, so plugins never share one. Asking for the same
name again returns the same channel. Channels suit invalidation, "this changed, look again",
rather than carrying data: a process that was down or disconnected misses messages.

A data provider's [`onLiveChange`](./data-providers.md#live-changes) is a common source of
such messages: it runs in the process that promoted or imported, and the channel tells the
others.
