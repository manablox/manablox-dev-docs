---
title: 'Themes in code and theme files'
description: 'Shipping designs with code: defineTheme, themes from plugins, a default design for a block type, the theme bundle file format, and what a space transfer carries.'
---

Designs are made in the admin, but they can also come from code: a theme for the starter
gallery, a default look for a block type a plugin brings, a built-in design preset, or a
JSON theme file exported from one space and imported into another.

## `defineTheme`

A theme declared in code shows up in the **starter gallery** of the spaces it targets:
when a space switches to a designed site, and under **Design > Theme gallery**. Applying
it writes its designs as **drafts** of that space; from then on they belong to the space
and the theme is never written again. Nothing is reconciled at boot and `manablox sync`
does not touch themes.

```ts
import { defineConfig } from '@manablox/core';
import { defineTheme, websitePlugin } from '@manablox/plugin-website';
import { defaultTheme, generateMenuDesign } from '@manablox/site';

const base = defaultTheme();

const acme = defineTheme({
  id: 'acme',
  name: 'Acme',
  description: 'Our brand colors and fonts.',
  spaces: ['marketing'],
  theme: {
    ...base,
    colors: { ...base.colors, roles: { ...base.colors.roles, primary: '#d9480f', onPrimary: '#ffffff' } },
  },
  designs: [
    { kind: 'menu', key: 'main', data: { ...generateMenuDesign({ machineName: 'main' }), preset: 'dropdown' } },
  ],
  site: null,
});

export default defineConfig({
  // ... database, auth, contentTypes
  plugins: [websitePlugin({ themes: [acme] })],
});
```

| Option | Meaning |
| --- | --- |
| `id` | Machine name, unique across the config and every plugin. The gallery lists it as `code:<id>` |
| `name`, `description` | Shown in the gallery. `name` defaults to the id, humanised |
| `spaces` | `'*'` (default) or a list of space machine names |
| `theme` | A `ThemeDesign`: tokens and base element styles. `null` keeps the space's theme |
| `designs` | `{ kind, key, name?, data }` entries of kind `block`, `page`, `layout` or `menu`. Block and page keys are the content type's machine name or id; layout and menu keys are the design key |
| `site` | A `SiteSettingsDesign`, or `null` |

`defineTheme` comes from `@manablox/plugin-website`. `@manablox/site` holds the types
(`ThemeDesign`, `BlockDesign`, and so on) and helpers such as `defaultTheme()`,
`starterThemes()` and the generators, so install it next to the plugin when you write
designs in code.

Themes are entries of the website plugin's `themes` [extension point](../extending/extension-points.md):
`websitePlugin({ themes })` contributes the config's, other plugins contribute theirs.

Every code theme is validated when a process starts, in every mode; a broken one stops the
start with `plugins.website.theme.code.invalid`, like a broken content type. A block or page design
whose content type a space lacks is skipped when the theme is applied there.

Bindings point at **field ids**. Fields of content types declared in code have stable
ids derived from the type and field names, so read them from the definition
(`teaser.fields`) or build the tree with the generators from the definition itself.

### From a plugin

Another plugin contributes themes to the website plugin's `themes` point, next to its other
declarations; they show where the website plugin is loaded and the contributing plugin is on
in the space:

```ts
definePlugin({
  name: '@acme/brand',
  contributions: { website: { themes: [acme] } },
});
```

A theme id declared twice fails at boot with `codeResource.duplicate`.

## A design for a block type

A block type declared in code (in the config or a plugin) may carry a design at
`plugins.website`: a `BlockDesign` the site uses until a space stores its own, and the
block designer starts from it. Only block types may have one; the website plugin checks it
when the config loads (`contentType.plugin.invalid`).

```ts
import { defineContentType } from '@manablox/core';
import { generateBlockPreset } from '@manablox/site';

const teaserInput = {
  name: 'teaser',
  kind: 'block',
  fields: [
    { name: 'headline', type: 'string', required: true },
    { name: 'body', type: 'richtext' },
    { name: 'image', type: 'asset', settings: { accept: ['image/'] } },
  ],
} as const;

const card = generateBlockPreset(defineContentType(teaserInput), 'card');

export const teaser = defineContentType({
  ...teaserInput,
  plugins: { website: { default: 'card', variants: { card } } },
});
```

## Theme files

**Design > Export theme** downloads a theme bundle; **Import theme** reads one into any
space as drafts. The RPC calls are `plugins.website.design.exportTheme`, `previewThemeImport` and
`importTheme`.

```json
{
  "format": "manablox-theme",
  "version": 1,
  "name": "Acme",
  "exportedAt": "2026-09-24T10:00:00.000Z",
  "theme": { "colors": {}, "fonts": {}, "type": {} },
  "designs": [
    {
      "kind": "block",
      "key": "teaser",
      "name": "Teaser",
      "type": { "id": "...", "name": "teaser", "fields": { "<fieldId>": "headline" } },
      "data": { "default": "default", "variants": {} }
    }
  ],
  "site": { "name": "Acme", "titlePattern": "{title} | {site}", "layouts": {} }
}
```

| Member | Meaning |
| --- | --- |
| `format`, `version` | `manablox-theme` and `1`. Anything else is refused (`plugins.website.theme.bundle.invalid`) |
| `theme` | The theme design, or `null` |
| `designs` | At most 500 block, page, layout and menu designs |
| `designs[].type` | For block and page designs: the source type's id, machine name and a map of field id paths to field name paths |
| `site` | Site settings without domains, or `null` |

On import, block and page designs find their type by id first, then by machine name, and
are rebound to the target's field ids through the `fields` map, so a theme moves between
spaces whose types were built separately. Designs for types the space lacks are skipped
and reported (`unknownType`). The preview lists each entry as `create`, `replace` or
`skip` (`exists` when replace is off, `excluded` when unticked), plus `missingAssets`:
asset ids the designs use (fonts, logo, images) that the space does not have. Asset files
do not travel in a theme file.

Custom CSS, head code and body code are exported only for a caller with `website:code`. An
import without `website:code` keeps the space's own code fields instead of refusing
(`codeSkipped` in the report).

## Design presets

A design preset is a complete site design without a theme: the `default` layout, the
`main` and `footer` menu designs, and block and page designs for the types it knows. The
theme sets colors, fonts and buttons, the preset sets structure, so every preset works with
every starter theme. `@manablox/site` ships twelve, four per theme category:

| Category | Presets |
| --- | --- |
| `professional` | `atlas` (split hero, elevated cards, dark footer), `harbor` (primary hero band, centered headings, bordered cards), `ledger` (statement hero, rows, large quotes, square corners), `summit` (floating header, hero panel, accent cards, quote bars) |
| `creative` | `spotlight` (display headline on a gradient, outlined cards, large footer), `gallery` (centered header, full bleed hero, plain image-led cards), `poster` (uppercase statement hero, boxed menu, outlined cards), `stage` (inverted header and hero, centered titles, gradient highlights) |
| `personal` | `journal` (centered masthead, narrow reading column, rows), `sunny` (portrait hero, pill menu, tinted cards), `readme` (compact hero, text index, square kickers), `postcard` (floating header, mirrored hero panel, italic titles) |

`DESIGN_PRESETS` lists them with their `Look`, the handful of choices that set one apart
(header and footer kind and tone, menu style, hero kind, card style, list, quote and call to action layout, page header, highlight tone, radius, rhythm). The category only orders the admin's picker and picks the default; any preset can be applied with any theme.
`defaultDesignPreset(category)` returns the first of a category, which a new designed space
starts with. `designPresetBundle(id, { types, locale })` builds the bundle for a set of
types, described by machine name, kind and fields:

- Block types named `hero`, `text`, `teaser`, `service-list`, `project-grid`, `team`, `testimonials` and `call-to-action` get designs when they have the fields the design needs; other block types keep their generated design.
- Document types named `article`, `post`, `project` and `service` get their own page designs; any other document type gets a page with a `blocks` field shown edge to edge, a text page around a `body` rich text field, or a page header around the generated field elements.
- Bindings are written with field names and the bundle carries a name to name `fields` map, so importing it maps them onto the space's field ids.
- Static texts (`Learn more`, `Menu`, labels of project facts) come in English and German, plus the given locale.

`plugins.website.design.applyStarter` takes the preset next to the starter theme and writes both as
drafts; the preset's menu designs replace the theme's:

```json
{ "spaceId": "...", "id": "builtin:studio", "preset": "spotlight", "replace": true }
```

The admin's **New space** dialog and `manablox space create --design <id>` apply a preset
this way and publish at once. An unknown preset answers `plugins.website.theme.preset.notFound`.

## Space transfer

The website plugin adds two [data provider](../extending/data-providers.md) sections to the
space [transfer](../admin/transfer.md), kept in the file under `plugins`; its redirects
travel in the core section `redirects` (see [Redirects](../admin/redirects.md)):

| Section | What travels | On import |
| --- | --- | --- |
| `website.designs` | Every stored design with its draft and its live copy, and for block and page designs the type reference above. No version history | The live copy becomes version 1, a draft with changes version 2. Designs whose type is missing, or that fail validation, are skipped with a note |
| `website.domains` | Host names with language, primary and redirect flags | **Opt-in**: exported by default, imported only when named in the selection, because a host name serves one space per instance. Hosts already taken are skipped with a note |

The website settings (mode, locale strategy, 404 page, password hash) travel in the file's
`pluginSettings.website`, as the exported environment has them.
