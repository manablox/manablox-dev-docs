---
title: 'The design model'
description: 'What a designed site is made of: design kinds and their storage, drafts, publishing and versions, element trees, bindings, theme tokens, styles, the CSS compiler, and style overrides on single blocks.'
---

The types, validators and the CSS compiler live in `@manablox/site`, a browser-safe
package used by the admin, the renderer and the server alike. Every save is checked with
`validateSiteDesign(kind, data)`, so a design that reaches the database is one the renderer
can draw.

## Design kinds

| Kind | Key | What it holds |
| --- | --- | --- |
| `theme` | `default` | Colors, fonts, type scale, spacing, radius, shadows, container widths, base element styles |
| `block` | The block type's id | How blocks of that type look: named variants, each an element tree, and a default variant |
| `page` | The content type's id | The element tree of that type's pages, its layout and which fields feed the page's SEO tags |
| `layout` | A machine name (`default` first) | The frame around pages: header, footer, menus. Exactly one `slot` marks where the page goes |
| `menu` | A menu's machine name, or the name of a shared design | Preset, depth, styles per level, current-page styles, mobile behaviour |
| `site` | `default` | Site name, logo, favicon, title pattern, default description and share image, robots, custom CSS, head and body code, layout per content type |

A design nobody has stored is **generated**: `generateBlockDesign(type)`,
`generatePageDesign(type)`, `generateLayout(site, menus)` and `generateMenuDesign(menu)`
build one from the fields at render time. A new block type therefore renders at once, and
new fields show up without anything to migrate. The first edit in the admin stores the
generated tree as the draft. For a block type, a `design` declared on the type in code
(see [Themes in code](./themes.md#a-design-for-a-block-type)) is used before the generator.

## Storage, drafts and publishing

`website_designs` holds one row per environment, kind and key (unique): `draft` and `published`
JSON, `version` (the optimistic lock, raised by every save), `publishedVersion`,
`publishedAt`, `publishedBy` and `source`/`sourceRef`. `website_design_versions` keeps a
snapshot per publish, which **Restore** copies back into the draft.

| Status | Meaning |
| --- | --- |
| `generated` | No row; rendered from the generators |
| `unpublished` | Stored, never published |
| `changed` | The draft differs from the live copy |
| `published` | Draft and live copy agree |

Saves send `expectedVersion` (0 creates the row) and are refused with
`plugins.website.design.versionConflict` when someone else saved in between. `publishAll` publishes
every changed design of the space in one transaction and bumps the site `revision`, so
the site never renders a mix of old and new designs.
Discarding a draft resets it to the live copy, and a never published design goes back to
generated.

Space-level settings live in the website plugin's row of `space_plugin_settings` (plugin
`website`), read with `readSiteSettings()` from `@manablox/plugin-website` and over RPC with
`plugins.website.settings.get`. The production row holds them for the space; a staging
environment's row holds only its own `notFoundContentId`:

| Setting | Values |
| --- | --- |
| `mode` | `external` (default) or `designed` |
| `revision` | Raised by every design publish; part of every cache key |
| `localeStrategy` | `prefix` (every locale except the default under `/<locale>`) or `domain` (domains pin locales) |
| `notFoundContentId` | The document shown for a 404, or `null` for a generated page; per environment |
| `password` | The Argon2id hash of the [site password](./index.md#password-protection), or `null` |

## Element trees

Block, page and layout designs are trees of `DesignNode`:

```ts
type DesignNode = {
  id: string;            // stable within the design, part of the CSS class
  el: ElementKind;
  bind?: Binding;        // where the content comes from
  props?: Record<string, unknown>; // element options; static text is { en: '...', de: '...' }
  style?: StyleRules;
  children?: DesignNode[];
  visibility?: { breakpoints?: Breakpoint[]; whenField?: string };
};
```

`visibility.breakpoints` lists where a node is shown (absent: everywhere); `whenField`
hides it while that bound field is empty.

| Group | Elements |
| --- | --- |
| Structure | `box`, `stack` (flex row or column), `grid`, `section` (full-width band with an inner container), `spacer`, `divider` |
| Content | `text`, `heading`, `richtext`, `image`, `video`, `icon`, `link`, `button`, `embed` |
| Data | `repeat` (over a repeater or a list field), `blocks` (a blocks field, through the block grid and each block's design), `block`, `template` |
| Forms | `form`, `formField`, `formSubmit`, `formMessage` |
| Chrome (layouts only) | `slot`, `menu`, `logo`, `breadcrumbs`, `localeSwitch`, `searchLink` |

`embed` rebuilds the frame address from the video or map id of an allowed provider
(YouTube, Vimeo, Google Maps, Spotify, SoundCloud), so nothing else from the pasted address
reaches the page. Validation also checks unique ids, the nesting rules (`canPlace`,
`canContain`), one `slot` per layout, and a limit on depth and size.

### Bindings

`bind: { field, format? }` points at a **field id**, so renaming a field keeps the binding.

- `<fieldId>`: a field of the block or document.
- `<repeaterId>.<subFieldId>`: a sub-field, only inside a `repeat` bound to the repeater.
- `<fieldId>.$item`: the current entry of a list field, only inside a `repeat` bound to it.
- `<contentFieldId>.<fieldName>`: a field of the related document, by field name, only inside a `repeat` bound to a `content` field. The site inlines related documents with their fields and assets, one level deep; `findBrokenBindings()` does not check these paths.
- `$title`, `$permalink`, `$publishedAt`, `$author`: document meta, in page designs and layouts.
- `$site.name`, `$site.logo`: site meta, in layouts.

`format` turns a value into text: `date` (`short`, `medium`, `long`, optional time),
`number` (decimals, `decimal`, `percent` or `currency`, `grouping: false` without a
thousands separator, for years), `boolean` (localized yes and no
texts), `list` (a separator) and `excerpt` (a length). An element without a binding shows
its static `props`. `findUnplacedFields()` and `findBrokenBindings()` report fields no
element shows and bindings to removed fields; the admin shows both as warnings.

### Block variants

```ts
type BlockDesign = { variants: Record<string, { label: string; root: DesignNode }>; default: string };
```

All variants of a block share one set of node ids. `generateBlockPreset(type, preset)`
lays a variant out as `imageLeft`, `card`, `hero` or `centered`.

## Theme tokens

| Token group | What it holds | Referenced as |
| --- | --- | --- |
| Colors | A named palette, the roles `bg`, `surface`, `text`, `muted`, `primary`, `onPrimary`, `border`, `accent`, optional dark roles | `color:primary`, `color:primary/50` (50% opacity) |
| Fonts | Families (`bundled`, `asset` or `google`, each with woff2 files and a fallback stack) and the roles `body`, `heading`, `mono` | `font:heading` |
| Type | Steps `xs`, `sm`, `base`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, each with size, optional mobile size, line height, weight, letter spacing | `type:xl` |
| Headings and body | Defaults per `h1` to `h6` and for body text: type step, font role, weight, color, text transform | |
| Space, radius, shadow | Named scales | `space:4`, `radius:md`, `shadow:lg` |
| Container | Named widths, a default, and the inline gutter | `container:lg` |
| Elements | Base styles for `body`, `link`, `button` and the `primary`, `secondary`, `ghost` buttons, `input`, `label`, `prose` | |

The breakpoints are fixed to the block grid's: tablet up to 1023px, mobile up to 639px.
`defaultTheme()` is the default; `starterThemes()` returns twelve themes, each with a
`category` (`THEME_CATEGORIES`: professional, creative, personal). Most are
composed from a short spec of colours, type and shapes.

Fonts: the renderer bundles Inter, Source Serif 4, Space Grotesk, Fraunces, Lora, Outfit, DM Sans, Bricolage Grotesque, Plus Jakarta Sans and JetBrains Mono (SIL
Open Font License) under `/_site/fonts/`. Uploaded fonts are woff2 assets
(`font/woff2` and `font/woff` are in the default upload allow-list). The Google Fonts
import (`plugins.website.design.importGoogleFont`, up to 18 weights and styles of one family) downloads
the latin woff2 files once on the management API and stores them as assets, so a site never
calls Google.

## Styles

```ts
type StyleRules = { base?; tablet?; mobile?; hover?; focus?; active? }; // each a StyleProps
```

`StyleProps` is an allow-list. Spacing, colors, radius, shadows, type and fonts only take
token references, so a theme change restyles the whole site. Sizes (`width`, `maxWidth`,
`minHeight`, ...) take a number with a unit (`px`, `rem`, `em`, `%`, `vw`, `vh`, `svh`,
`dvh`, `ch`) or a container token.

| Group | Properties |
| --- | --- |
| Spacing | `padding`, `paddingX`, `paddingY`, the four sides, `margin` (also `auto`) likewise, `gap` |
| Size | `width`, `maxWidth`, `minWidth`, `height`, `minHeight`, `maxHeight`, `aspectRatio` |
| Layout | `display`, `direction`, `wrap`, `align`, `justify`, `alignSelf`, `grow`, `columns` (1 to 12) |
| Type | `type`, `font`, `fontWeight`, `fontStyle`, `textAlign`, `textTransform`, `textDecoration` |
| Color and background | `color`, `background`, `backgroundImage` (asset, position, size, repeat), `backgroundGradient` (from, via, to, angle) |
| Border and effects | `borderWidth`, `borderStyle`, `borderColor`, `radius`, `shadow`, `opacity`, `overflow`, `objectFit`, `objectPosition` |

### The CSS compiler

`compileSiteCss(input)` turns a theme and designs into one stylesheet; the same input
always gives the same CSS.

- Tokens become custom properties on `:root` (`--mb-color-primary`, `--mb-space-4`, ...), with a `prefers-color-scheme: dark` block for dark roles.
- Each styled node gets the class `mb-<kind>-<hash of the key>-<nodeId>` (`classFor()`), with media queries per breakpoint and pseudo-classes per state.
- The cascade layers are `mb-reset`, `mb-theme`, `mb-design`, `mb-instance`, `mb-custom`, in that order: custom CSS wins over everything, instance styles over designs.
- `@font-face` rules point at `/_site/fonts/*` for bundled fonts and at `/media` for uploaded and Google fonts.
- The block grid CSS of `blocks` fields is included, so the grid and the designs agree.

The site process serves the result as `/_site/<hash>.css`. The admin compiles drafts in the
browser and pushes them into the canvas, so every change repaints without a round trip.

## Styling one block

A block value in a document may carry a design at `ext.website`: which variant it renders
with and a small set of overrides on its root.

```json
{ "blockId": "...", "type": "...", "fields": { "headline": "Hi" },
  "ext": { "website": { "variant": "dark", "style": { "background": "color:primary", "paddingY": "space:8", "hide": ["mobile"] } } } }
```

| Style key | Values |
| --- | --- |
| `background` | A color token, optionally with opacity |
| `backgroundImage` | `{ assetId, position?, size?, repeat? }` |
| `paddingY`, `paddingX`, `gap` | A space token or `0` |
| `textAlign` | `left`, `center`, `right` |
| `width` | `contained` or `full` |
| `hide` | The breakpoints it is hidden at: `desktop`, `tablet`, `mobile` |

The types are `BlockInstanceDesign` and `BlockInstanceStyle` in `@manablox/site` (and in
its browser-safe `@manablox/site/sdk` entry); `validateInstanceDesign()` checks them and a
variant name the design lacks falls back to the default variant. The website plugin checks
the design on every save through its [block extension](../extending/block-extensions.md).
The design is part of the document, so it versions, publishes, copies and transfers with
it. The compiler emits one class per used combination of overrides (`instanceClass()`) in
the `mb-instance` layer, never inline styles, so pages stay cacheable and the CSP strict.

Delivery exposes it too, for code frontends that want to honour it: REST puts `design` on
a block where a variant or a style is set, GraphQL has `design: BlockDesign { variant, style }`
on the `Block` interface. See [Field types](../content-model/field-types.md#block-design).

## The render input

`SiteRenderInput` is everything one page needs, already resolved: space meta, locale and
alternates, the document in delivery shape, the page design, the layout, block designs by
type, menu designs and resolved menus, the theme, site settings, assets the designs use,
content types, the stylesheet address and the mode (`live`, `share` or `canvas`).
`renderSitePage(input, options?)` from `@manablox/site-renderer` returns
`{ html, status, head, islands, instanceStyles }`. The site process builds the input from
the database; the admin builds the same input from drafts for its canvas, so both draw the
same markup.

The canvas at `/_manablox/canvas` fetches nothing: the admin pushes the input and the
compiled CSS over the live-preview [plugin channel](../extending/live-preview-channels.md)
`website` (`design`, `highlight`, `breakpoint`, `scheme` and `paletteDrag`; the canvas
answers with `selectNode`, `hoverNode`, `moveNode`, `insertNode`, `removeNode`, `editText`
and `resizeNode`). `@manablox/site` exports the channel's types as `WebsiteCanvasMessages`.
Content messages stay on v3, so the content visual editor of a designed space frames the
same canvas.
