---
title: 'CLI contributions'
description: 'Add options to manablox space create and manablox create, commands of your own, and marked parts of an instance that manablox plugin install and uninstall add and remove, from a plugin.'
---

A [plugin](./plugins.md) can take part in the `manablox` command line tool. It names a
module, in its package's `package.json` or, for a plugin without a package, in its own
`cli`, and that module's default export says what the plugin adds:

- options of `manablox space create`, turned into the plugin's data for the new space
- options of `manablox create`, for the first-party plugins a new instance can pick
- commands of its own, run as `manablox <plugin id> <command>`
- files and fragments of an instance: a config, a compose service, `.env` lines, proxy rules,
  written by `manablox create` and added or removed later by `manablox plugin install` and
  `uninstall`
- questions and cleanup of `manablox plugin install` and `uninstall`

The website plugin (`@manablox/plugin-website`) is built this way: `--website`, `--theme`
and `--design` of `space create`, the site process of a new project, and
`manablox website publish-all` all come from its contribution.

## Declaring it

```json
{
  "name": "@acme/seo",
  "exports": { ".": "./src/index.ts", "./cli": "./src/cli.ts" },
  "manablox": { "plugin": "seo", "cli": "@acme/seo/cli" }
}
```

`plugin` is the plugin's `name`; `cli` a module id resolved from the instance, an absolute
path, or a file URL. This is the place for a published plugin, and the first-party plugins
use it: the CLI reads it without loading the instance config, so the plugin's options and
commands show in `manablox --help` and `manablox plugin install <package>` accepts it.

A plugin kept in the instance's own repository, without a `package.json` of its own, names
the module on the plugin object instead:

```ts
// plugins/seo/index.ts, imported by manablox.config.ts
import { definePlugin } from '@manablox/core';

export const seoPlugin = () =>
  definePlugin({
    name: 'seo',
    // A path relative to the config's folder, a module id, an absolute path or a file URL.
    cli: './plugins/seo/cli.ts',
  });
```

| Declared in | Read by | Wins |
| --- | --- | --- |
| `cli` on the plugin object | Commands that load the config: `space create`, `manablox <plugin id> ...` and its `--help` | Yes, when the config is loaded |
| `"manablox": { "cli" }` in the package's `package.json` | The same commands, for a plugin whose object has no `cli`; and `manablox --help`, `manablox plugin install`, which do not load the config | Otherwise |

So a plugin that declares both gets its object's module whenever the config is loaded, and
its package's module in the help that does not load it. A local plugin appears in
`manablox <plugin id> --help` but not in the plain `manablox --help`. A plugin can also be
made a package (a `file:` dependency with the `package.json` field) to show there too.

```ts
// src/cli.ts, exported by the package as "./cli"
import { defineCliContribution } from '@manablox/core';

export default defineCliContribution({
  summary: 'search engine settings',
  options: {
    'space create': {
      options: [{ name: 'seo-index', type: 'switch', help: 'let search engines index the site' }],
      apply: (space, values) =>
        values['seo-index'] === undefined ? undefined : { index: values['seo-index'] },
    },
  },
  commands: {
    'sitemap ping': {
      description: 'tell the search engines the sitemap changed',
      run: async (context) => {
        const { plugin } = await context.runtime();
        context.out.write(`pinged for ${plugin.id}\n`);
        return 0;
      },
    },
  },
});
```

### Keep it light

The help imports the module, so it only describes: the options, the commands and their help
text. Everything that does the work is imported when it runs. `check`, `apply`, `run` and
`templates` may all be async, so they can load their code on use:

```ts
export default defineCliContribution({
  summary: 'search engine settings',
  commands: {
    'sitemap ping': {
      description: 'tell the search engines the sitemap changed',
      run: async (context) => (await import('./sitemap.js')).ping(context),
    },
  },
  templates: async (context) => (await import('./templates.js')).seoTemplates(context),
});
```

Help text that lists values from a larger library (the website plugin's themes, for
example) is written out in the module; a test holds it to the library.

### How the CLI finds it

- Commands that run against an instance (`space create`, `manablox <plugin id> ...`) load the instance config (`manablox.config.ts` or `--config`) and, for each listed plugin, import the module its `cli` names or, without one, the `cli` module its package declares, found among the dependencies next to the config. A module id or relative path is resolved from the config's folder first, then from the CLI itself.
- The help does not load the config. It reads the `package.json` of each dependency of the instance and imports the modules they declare. Declared, a plugin's options and commands show in `manablox --help`, and `manablox plugin install <package>` accepts it. An optional `"requires": ["<plugin id>"]` there lets `install` refuse the plugin until those are installed. `manablox <plugin id> --help` for a plugin no package declares loads the config, and so finds local plugins.
- `manablox create` runs before any config exists. It knows the first-party plugins (`FIRST_PARTY_PLUGINS`: `@manablox/plugin-website`, `@manablox/plugin-ai`, `@manablox/plugin-workflows` and `@manablox/plugin-webhooks`, optional peers of `@manablox/cli`) and looks for them in the working directory, next to the CLI and in the CLI's cache. The ones picked and missing are installed with one npm run into the cache (`~/.cache/manablox/plugins/cli-<version>/`, or under `XDG_CACHE_HOME`) at the CLI's own version; when that fails, the command stops with the commands to run instead. A plugin that is not picked is never installed.
- A plugin id may not be a core command's name (`start`, `plugin`, `create`, ... `CLI_CORE_COMMANDS`): the config is refused with `plugin.id.reserved`.

## Options

An option is `{ name, type?, arg?, help }`. `type` is `value` (the default, takes an
argument), `switch` (on or off, with a `--no-<name>` form) or `list` (may be repeated).
`arg` is how the help shows the argument, for example `<id>`. `help` is a string, wrapped to
the help's width, or an array of lines. The values arrive by name: a string, a list of
strings, or `true` / `false` for a switch; options not given are missing.

A name a core option or another plugin already uses is refused when the CLI starts, with a
message naming both. Prefix your options with the plugin id or a word of its domain.

### `space create`

| Key | Meaning |
| --- | --- |
| `options` | The options |
| `check(values)` | Optional, may be async. Throws a message naming the option when a value is bad; runs before anything is opened |
| `apply(space, values)` | Returns (or resolves to) the plugin's data for the new space, sent to `spaces.create` as `plugins.<id>`, or `undefined` for none. `space` has `name`, `machineName`, `url` and `locales` |
| `report(data, space)` | Optional. Lines for the summary once the space exists; `space` has `url` and `warnings` |

The data goes through the plugin's own `spaceCreate` step on the server, in the same request,
exactly as `--plugin-data <id>=<json>` would send it (see
[Plugins](./plugins.md#new-spaces)). A plugin given data both ways is refused: the
command stops before it opens the database.

### `create`

Only the first-party plugins take part in `manablox create`. They are offered in one feature
choice, none picked, and each gets a switch named after its id (`--website` / `--no-website`)
next to `--features <list>`. A plugin that is not picked adds nothing, and its own options are
refused. `check` runs before any question for every first-party plugin the CLI found,
`apply` and `templates` only for picked ones.

| Key | Meaning |
| --- | --- |
| `options` | The options |
| `check(values)` | Optional, may be async. Throws a message naming the option when a value is bad; runs before any question |
| `apply(context, values)` | Resolves the values once the core questions up to the first space's name are answered. `context.instance` describes the instance (preset, proxy, database, public API, whether it routes by domain, the admin URL, the package version range, the first space); `context.prompter` asks questions, or is `null` with `--yes` or without a terminal |

`apply` returns:

| Key | Meaning |
| --- | --- |
| `spaceArgs` | Arguments added to the first space's `manablox space create`, for example `['--website', 'designed']` |
| `spaceUrl` | The first space's address unless `--space-url` gives one |
| `nextSteps({ started })` | Lines added to the next steps printed at the end |
| `values` | Anything; handed to `templates` |

## Commands

`commands` maps the words after `manablox <plugin id>` to a command. Words may contain
spaces (`'domains add'`); the longest match wins, and what follows are positionals.

| Key | Meaning |
| --- | --- |
| `description` | One line for the help |
| `args` | How the help shows the positionals, for example `<hostname>` |
| `options` | The command's options. `--config` and `--yes` are always accepted; anything else is refused |
| `run(context)` | Resolves to the exit code. Throw for a usage error: the CLI prints `manablox: <message>` and exits with 1 |

`context` has:

| Key | Meaning |
| --- | --- |
| `positionals`, `values` | The arguments after the command words, and the given option values by name |
| `out`, `err` | Where to write |
| `cwd` | The instance folder, where the config and its `.env` are |
| `prompter` | Asks questions: `text`, `select`, `multiselect` and `confirm`, as in `create`. `null` with `--yes` or without a terminal; take a default or refuse then |
| `signal` | Aborted by Ctrl-C. Reading it makes the first Ctrl-C abort the command rather than end the process, so a command that waits can stop cleanly; a second Ctrl-C ends it |
| `open(url, { browser? })` | Prints the address and opens it in the browser: `open` on macOS, `start` on Windows, `xdg-open` on Linux, `wslview` or `cmd.exe` under WSL. With `browser: false` (map your `--no-browser` to it), without a terminal or over SSH (`SSH_CONNECTION`) it only prints. Never throws |
| `spin(label, work, done)` | Runs `work` with a spinner on a terminal, as plain lines otherwise; `done(result)` labels the end |
| `runtime()` | Boots the instance of the config in management mode (once, however often it is called) and returns `{ plugin }`: the plugin's [context](./services.md) with its services, repositories and controls. The CLI shuts the instance down after `run` |

A question cancelled with Ctrl-C ends the command with exit code 130.

`manablox --help` lists every plugin's commands; `manablox <plugin id> --help` lists one
plugin's.

## Installing and uninstalling

`manablox plugin install <id|package>` adds a plugin to an existing instance and
`manablox plugin uninstall <id>` takes it out again (see
[Adding and removing features later](../getting-started/as-a-dependency.md#adding-and-removing-features-later)).
Both use `templates`, so a plugin's parts are the same whether `create` wrote them or
`install` did. Two optional hooks take part:

| Key | Meaning |
| --- | --- |
| `install({ instance, prompter, values })` | The plugin's questions, like `create.apply` without a first space. `values` holds the plugin's `create` options given to `manablox plugin install` (e.g. `--site-port 3300`), after `create.check`; ask only for what they leave open, and refuse options about the first space, which `install` makes none of. Returns `{ values?, nextSteps? }`: `values` go to `templates`, `nextSteps` are lines printed at the end. `prompter` is `null` with `--yes` or without a terminal. Without the hook `templates` gets `values: undefined` |
| `uninstall({ instance, prompter, values })` | Extra cleanup after the confirmation, before the parts, whole files and the dependency are removed. May return `{ nextSteps }`. The plugin's data is never removed: its tables and `ext.<id>` values stay, and installing it again brings them back |

`manablox plugin install` parses the `create` options of the first-party plugins it names (the
CLI finds them in the instance or its cache, or fetches them, as `create` does); an option
none of the named plugins takes is refused. Other packages' installs take no options.
`uninstall` gets empty `values`.

`instance` is read from the instance's files: the preset and proxy from the files it has, the
database, the public instance, ports, domains and the package version range from `.env` and
`package.json`. `instance.space` is always `null`.

`templates` must also work with `values: undefined`, because `uninstall` asks it which files
and dependencies are the plugin's without asking any question.

## Templates

`templates({ instance, values })` returns (or resolves to) what the plugin adds to an instance. `values` is
what `create.apply` or `install` returned as `values`.

| Key | Meaning |
| --- | --- |
| `files` | Whole files: `{ path, template, executable? }`, with the template text |
| `slots` | Fragments for the insertion points of the core templates, below |
| `tokens` | `__TOKEN__` values for the plugin's files and fragments |
| `flags` | `{{#if flag}}` values for the plugin's files and fragments |
| `secrets` | Token names filled with a fresh random secret in `.env` and left blank in `.env.example` |
| `processes` | Processes the instance runs besides `api`: `{ name, port, readOnly?, label }` |
| `dependencies` | Entries for `package.json` |

Files and fragments are rendered like the core templates: `{{#if flag}}`, `{{#if !flag}}`,
`{{#else}}` and `{{/if}}` blocks (a directive alone on its line takes the line with it), then
the tokens. They see the core's flags (`docker`, `local`, `sqlite`, `publicApi`, `caddy`,
`nginx`, `byDomain`, `ports`, `tls`, `readOnlyRole`, `example`, the mail flags) and
tokens (`__NAME__`, `__COMPOSE_NAME__`, `__ADMIN_URL__`, `__ADMIN_PORT__`, `__PUBLIC_API_URL__`,
`__PUBLIC_PORT__`, ...), next to the plugin's own. A token or flag that clashes with the core's
or another plugin's is refused.

The slots are lines `{{slot <name>}}` in the core templates:

| Slot | Where |
| --- | --- |
| `config.imports` | `manablox.plugins.ts`: import lines. `public.imports` lands in the same place, each line once, since both configs import their plugins from this file |
| `config.plugins` | `manablox.plugins.ts`: entries of `plugins`, the management config's list, after the ones from `content-model.ts` |
| `public.plugins` | `manablox.plugins.ts`: entries of `publicPlugins`, the public config's list. Only for a plugin with public contributions (block data it delivers, public routes); a public config loads nothing else |
| `package.start`, `package.dev` | `package.json` script lines after `start` and after `dev`, each ending with a comma |
| `env` | `.env` and `.env.example`, after the public API's section |
| `compose.header`, `compose.services`, `compose.proxy`, `compose.volumes` | Docker `compose.yml`: the service list at the top, the services, the proxy's `depends_on` entries, the volumes |
| `caddy.header`, `caddy.global`, `caddy.admin`, `caddy.sites` | The Caddyfile: the opening comment, the global options, the admin site, and sites after the public API's |
| `nginx.admin`, `nginx.sites` | nginx: `location` blocks of the admin server, and servers after the public API's |
| `readme.sections`, `readme.security` | The instance README: sections after the first start, and the end of the security notes (docker). Describe the plugin's files, services and commands in its section |

A process adds an `EXPOSE` line to the Dockerfile and its name to the processes the restore
script stops, each as a part of the plugin. Its compose service itself is a fragment of
`compose.services`. The read-only database role is created on Postgres whether or not a
process uses it.

### Anchors and markers

Every slot leaves an anchor comment in the file, and each plugin's rendered fragment is
written between two marker comments after it, in the plugins' order:

```ts
  // manablox:slot config.plugins
  // manablox:plugin ai >>>
  // Private-network hosts a self-hosted AI provider may reach, as `host` or `host:port`.
  aiPlugin({ allowedHosts: envList('AI_ALLOWED_HOSTS', []) }),
  // manablox:plugin ai <<<
```

The comment follows the file: `//` in TypeScript, `#` in `.env`, YAML, the Caddyfile, nginx,
the Dockerfile and shell scripts, `<!-- -->` in the README; the anchor takes the slot line's
indentation. A fragment that renders empty gets no markers. `package.json` has no comments,
so its scripts and dependencies are edited as JSON instead.

`manablox plugin install` renders the plugin's parts exactly as `create` would for this
instance and puts each region after its anchor, behind the regions already there;
`uninstall` removes every region of the plugin id. Neither touches anything outside whole
marked regions, so users may edit freely outside them, and may move or delete an anchor. A
file that lacks an anchor the plugin needs is left unwritten and its part is printed with
the file it belongs in (`--strict` turns that into exit code 1); a region with a start and no
end marker is left alone, with a message. Keep a fragment self-contained: it may be added to
an instance created without it and removed from one that keeps running.

The website plugin's contribution (`manablox website ...` and its `create` and `space create`
options) is a complete example. A small one is a single `space create` option that becomes
the plugin's space create draft:

```ts
// src/cli.ts: manablox space create --hello-greeting <text>
import { defineCliContribution } from '@manablox/core';

export default defineCliContribution({
  summary: 'a greeting for every space',
  options: {
    'space create': {
      options: [{ name: 'hello-greeting', arg: '<text>', help: "the new space's first greeting" }],
      check: (values) => {
        const greeting = values['hello-greeting'];
        if (typeof greeting === 'string' && greeting.trim().length > 280)
          throw new Error('--hello-greeting takes at most 280 characters');
      },
      apply: (_space, values) => {
        const greeting = values['hello-greeting'];
        return typeof greeting === 'string' ? { greeting } : undefined;
      },
      report: (data) => [`greeted with "${(data as { greeting: string }).greeting}"`],
    },
  },
});
```
