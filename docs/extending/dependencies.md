---
title: 'Plugin dependencies'
description: 'Let a plugin require or enhance other plugins, and use their services.'
---

A [plugin](./plugins.md) can build on other plugins. It names them by id (see
[`pluginId`](./plugins.md#what-a-plugin-may-declare)) in one of two lists:

```ts
definePlugin({
  name: 'hello-extra',
  // Cannot run without hello: the server refuses to start when it is missing.
  requires: ['hello'],
  // Adds to reports when that plugin is there; fine without it.
  enhances: ['reports'],
});
```

| Key | Meaning |
| --- | --- |
| `requires` | Plugins this one cannot run without. A server whose config lacks one refuses to start with `plugin.requires.missing`; plugins that require each other in a cycle are refused with `plugin.requires.cycle`, naming the cycle |
| `enhances` | Plugins this one adds to when they are configured, usually through their [extension points](./extension-points.md). Missing ones are fine |

`requires` is about the config, not about flags: a required plugin that is switched off in a
space is still configured, and its services are still there. Check its flag with
`plugins.isOn` where that matters.

## Boot order

The server boots plugins in dependency order: each after the plugins it requires, and after
those it enhances where that forms no cycle. Otherwise the config's order holds. Two plugins
may enhance each other; the one listed first then boots first. The order applies to
everything that runs per plugin: its hooks, building `services`, `start`, middleware, the admin
manifest and so the order in which the admin installs the plugins' bundles.

## Other plugins' services

The plugin context, the context of the plugin's [procedures](./rpc.md) and every data
provider callback's `plugin` have `plugins`, the configured plugins by id:

| Member | Meaning |
| --- | --- |
| `has(id)` | Whether the plugin is configured |
| `get(id)` | Its [services](./services.md); `undefined` when it is not configured or builds none |
| `require(id)` | Its services, for a plugin it `requires` or its own; throws when it is not configured or they are not built yet |
| `isOn(id, spaceId)` | Whether it is configured and its flag is on in the space; `null` asks for the instance |

```ts
// A procedure of hello-extra
get: scoped('space:read')
  .input(schemas.spaceScoped)
  .handler(async ({ input, context }) => {
    const hello = context.plugins.get('hello');
    return {
      greetings: hello ? (await hello.greetings.list(input.spaceId)).length : null,
      helloOn: await context.plugins.isOn('hello', input.spaceId),
    };
  }),
```

`get` is typed through `PluginServicesMap`. A plugin whose services others use augments it in
its package, and consumers import that package's types only:

```ts
// in @acme/hello
declare module '@manablox/core' {
  interface PluginServicesMap {
    hello: HelloServices;
  }
}
```

Services are built in boot order, so inside `services()` only plugins booted earlier, the
ones it requires, have theirs; a lookup there sees `undefined` for the others. Look them up
where they are used instead, in a procedure, a route, a job or a hook.

The same lookup is `manablox.plugins` on the instance.
