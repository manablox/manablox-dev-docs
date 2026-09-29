---
title: 'Admin slots'
description: "Named places in the admin's own screens where an admin plugin adds components."
---

A slot is a named place in one of the admin's screens. An [admin plugin](./admin-plugins.md)
puts components into slots; the admin renders them there with the props of that slot.

```ts
export default defineAdminPlugin({
  name: '@acme/seo',
  slots: {
    'content.editor.actions': [{ component: () => import('./SeoScore.vue'), order: 50 }],
    'space.settings.sections': [
      { component: () => import('./SeoSettings.vue'), permission: 'acme.seo:write' },
    ],
  },
});
```

An entry is `{ component, key, order, feature, locked, permission, label, icon, hint, when }`:

| Key | Meaning |
| --- | --- |
| `component` | `() => import('./Component.vue')` |
| `key` | Unique within the slot. Registering the same key again replaces the entry |
| `order` | Lower renders first; 100 by default |
| `feature` | Shown only while this feature is on in the current space; the plugin's flag by default, which a feature of the entry's own needs on too. `null` always shows it, for a component that decides itself |
| `locked` | Also rendered while that feature is locked (switched off but shown with a lock, see [Controls](../configuration/controls.md)), for the component to draw the lock with `FeatureGate` or `FeatureLock` from `@manablox/admin-sdk` |
| `permission` | Shown only when the user holds this permission in the current space |
| `label`, `icon`, `hint` | The button or tab the admin draws for the entry, where the slot has one; `hint` is its tooltip |
| `when` | `(props) => boolean`: shown only while it holds for the slot's props |

Editor views, space starters and the plugin's menu entries and settings tabs are drawn with a
lock while their feature is locked, like the admin's own buttons. In other slots an entry
without `locked` disappears while its feature is off; one with `locked` stays and is expected
to show the lock itself. A hidden feature removes the entry either way.

## Slots and their props

`AdminSlotProps` in `@manablox/admin-plugin` types the props of every slot.

| Slot | Props | Where |
| --- | --- | --- |
| `app.sidePanels` | none | Side lists beside the plugin's pages; a route's `panel` names one by `key`. The `sidePanels` key of the plugin is the short form |
| `content.editor.views` | `document`, `type`, `draft`, `close` | Full-screen views of the document editor, opened from a header button with the entry's `label`, `icon` and `hint`. `document` is the live draft; edit its fields in place. `draft` has `isDirty`, `readOnly`, `saving`, `revision` (raised by every edit), `canUndo`, `canRedo`, `undo()`, `redo()`, `errorFor(path)`, `errorUnder(path)` and `save()` |
| `content.editor.actions` | `document`, `type` | Buttons in the document editor's header |
| `content.preview.target` | `document`, `type`, `readOnly`, `preview` | The header of the content preview (the document editor's Visual view), where an entry may take over the frame with `preview.setTarget`. See [The content preview](#the-content-preview) |
| `block.inspector` | `block`, `type`, `path`, `readOnly`, `update`, `panel` | Below a block's fields in the blocks and block fields of the document editor (inputs whose field context sets `blockInspectors`), and below the selected block's fields in the content preview, where `panel` is `true`. `update(block)` replaces the block |
| `contentType.actions` | `type` | Buttons in the content type editor's header |
| `contentType.presets` | `draft`, `setDraft` | A starting point of a new content type (the entry's `preset`); the component shows below the picker while it is picked, with the preset's own state |
| `space.create.steps` | `draft`, `setDraft`, `stage`, `setStage`, `address` | The space creation form, also in the install wizard: after the space's names (`stage: 'space'`), and in a stage of its own (`stage: 'own'`) unless the entry drops it with `setStage(false)`. `draft` is the plugin's own state there; `setDraft(patch)` merges into it. On submit the form sends each shown plugin's data (the draft, or what the entry's `data` makes of it) in `spaces.create`'s `plugins`, and the plugin's `spaceCreate` applies it (see [New spaces](./plugins.md#new-spaces)); the warnings `spaces.create` returns show as notices. `address` is the space's address field: `value`, the admin's `default`, `set(url)` and `describe({ label, hint })`. Entries are gated by the instance's flags, since the space does not exist yet |
| `space.settings.sections` | `space` | Below the space's General settings |
| `space.domains` | `space` | Below the API hosts in Settings |
| `transfer.sections` | `spaceId` | Below the export section picker. A plugin's own sections in the picker come from its `transferSections` |
| `usage.lines` | `usage` | Below the space's usage meters |
| `audit.entities` | none | Above the activity log |
| `environment.address` | `environment` | In the top bar, next to "Visit site": `{ spaceId, machineName, id }` of the working environment. The admin's own "Visit site" shows the space's address in production only |
| `field.actions` | `field`, `value`, `update`, `context` | Beside a field's label in every editor that renders fields (documents, blocks, templates). `update(value)` sets the field's value; `context` is the editor's field context, whose `extensions` holds what the editor adds for plugins, by name |
| `assets.actions` | `selection`, `added` | In the asset library's header. `selection` is the assets picked in the library; `added(assetId)` selects an asset the entry created, after the list is refetched |
| `contentType.list.actions` | none | In the content type list's header |
| `template.list.actions` | none | In the template list's header |
| `space.create.starters` | `draft`, `setDraft` | A kind of preconfigured space in the creation form, next to the website types, with the entry's `starter` as its choice. While it is picked, the component shows below the picker with the entry's own state. See [Slot options](#slot-options). Gated by the instance's flags |

The props are the admin's live values; a component reads them and never changes them in
place (the one exception is the editor view's `document`). To change a block, call `update`
with a new one.

## Slot options

Three slots take more keys on their entries:

| Slot | Key | Meaning |
| --- | --- | --- |
| `space.create.steps` | `stage` | `{ label, title, hint, welcome }` of the entry's own stage: `label` in the step list and on the next button, `title` and `hint` as the install wizard's heading, `welcome` a sentence the install wizard adds to its welcome text |
| `space.create.steps` | `data` | `(draft) => unknown`: what goes to `spaces.create` for the plugin; `undefined` sends nothing. The draft itself by default |
| `contentType.presets` | `preset` | `{ id, kind, label, icon, description, fields, isPublishable }`, the same shape as the admin's presets; it joins them after its kind's |
| `contentType.presets` | `validate` | `(draft) => string or null`: a reason the new type cannot be saved yet |
| `contentType.presets` | `afterCreate` | `(type, draft) => Promise<void>`: runs once the new type is saved |
| `space.create.starters` | `starter` | `{ title, hint }`: the choice in the list of space types |
| `space.create.starters` | `validate` | `(draft) => string or null`: a reason the space cannot be created yet |
| `space.create.starters` | `plan` | `(draft) => types`: content types `spaces.create` creates with the space (its `plan` input, `ContentTypePlanType` items from `@manablox/core`) |
| `space.create.starters` | `data` | `(draft) => unknown`: the plugin's data for `spaces.create`, merged with its `space.create.steps` entry's |
| `space.create.starters` | `created` | `(draft) => string`: the end of the success notice, e.g. `with 4 types` |

A plugin can also declare slots of its own for other plugins to fill; see
[Plugin slots and apis](./plugin-slots.md).

## The content preview

The document editor's Visual view is the admin's own: it frames the space's frontend at
`<space URL>/preview`, keeps it in step with the draft over
[`@manablox/live-preview`](../delivery/preview.md), and outlines the selected block.
It is shown for document types with a slug and a blocks field, while `visualEditor` is on.

A `content.preview.target` entry can frame another page instead, for example a site the
plugin renders itself. Nothing is framed until every shown entry has called
`preview.setTarget` once: `null` leaves the frontend, a target takes the frame. The first
target in slot order wins.

| Target key | Meaning |
| --- | --- |
| `src`, `origin` | The page to frame and its origin, checked on every message. `src: null` shows `empty` instead |
| `empty` | The sentence shown while there is nothing to frame |
| `status` | A few words after the connection state in the header |
| `fields` | `(fields) => fields`: the draft's fields as the frame gets them, the draft itself stays |
| `ready` | `(frame) => void`: runs each time the frame announces itself, before the draft goes out |

`frame` has `plugin(id)` with `send(name, payload)` and `on(name, handler)` for the plugin's
[live preview channel](./live-preview-channels.md), `document()` with the draft as the frame
gets it, and `sync()` to send the draft again. A frame's calls do nothing once it is gone.

```ts
// WebsiteCanvas.vue, a `content.preview.target` entry
const props = defineProps<AdminSlotProps['content.preview.target']>();
props.preview.setTarget({
  src: 'https://site.test/_canvas',
  origin: 'https://site.test',
  ready: (frame) => frame.plugin('acme.site').send('theme', currentTheme()),
});
```

The component renders in the view's header, so it can add its own controls there. Below
the selected block's fields the view shows the `block.inspector` slot with `panel: true`.

## Registries

Some extensions are data rather than components:

| Registry | Plugin key | What it does |
| --- | --- | --- |
| Live events | `realtime` | Handlers by target kind (`<id>.<entity>`), called for changes other editors make |
| Activity log | `audit` | Labels of the plugin's target kinds and actions, and where an entry links to. The action filter lists the labelled actions |
| Settings tabs | `settingsSections` | Tabs in Settings, next to the built-in ones of their scope |
| Promote diff | `diffKinds` | Names of the plugin's kinds in an environment's promote diff, by kind (the `key` of its data provider's plan entries) |
| Promote | `invalidateOnPromote` | Drops the plugin's queries of a space after a promote replaced its production data |

Permission groups and feature names come from the server: the admin reads the labels a
plugin declares on its [permissions](./permissions.md) and [controls](./controls.md). So do
the sentences of the plugin's error keys, from its server error catalogue.

Everything is declared on the plugin object; an entry that depends on something only known
at runtime says so with `when`. `setup(context)` only declares the plugin's own slots and
exposes its api (see [Plugin slots and apis](./plugin-slots.md)).
