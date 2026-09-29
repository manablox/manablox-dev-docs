---
title: 'Admin SDK'
description: "The admin's UI kit, stores, queries and API client that admin plugins build their screens with."
---

`@manablox/admin-sdk` is the part of the admin that [admin plugins](./admin-plugins.md)
build with: the same controls, stores and client the admin's own screens use. At runtime
a plugin does not bundle it; the admin hands its own copy to every plugin through its
import map. Install it for the types and the build:

```sh
npm install --save-dev @manablox/admin-sdk @manablox/admin-plugin
```

```vue
<script setup lang="ts">
import { AsyncList, PageHeader, useSpaceStore } from '@manablox/admin-sdk';
import { useReports } from './reports';

const spaces = useSpaceStore();
const { data, isPending, error, refetch } = useReports();
</script>

<template>
  <div class="mb-page">
    <PageHeader title="Reports" :description="`SEO reports of ${spaces.current?.name}`" />
    <AsyncList :pending="isPending" :items="data" :error="error" :retry="refetch" empty-title="No reports yet">
      <template #item="{ item }">{{ item.title }}</template>
    </AsyncList>
  </div>
</template>
```

## What it exports

Only the package's main entry is public. Its npm version moves with every other
`@manablox/*` package; its compatibility is the integer `SDK_API_LEVEL`, raised by one with
every breaking change. A plugin declares the lowest level it needs (`sdkLevel` in
[`defineAdminPluginBuild`](./admin-plugins.md#building-the-bundle)), and the admin loads it
while that level is within the range it supports. The current level is 1. A generated report of the surface,
[`admin-sdk.api.md`](https://github.com/manablox/manablox-cms/blob/main/packages/admin-sdk/admin-sdk.api.md) in the CMS repository, is checked in its CI, so a
change to it shows up in review.

| Group | Exports |
| --- | --- |
| Controls | `Accordion`, `AsyncList`, `CheckCard`, `Checkbox`, `ChipFieldset`, `ChipToggle`, `ConfirmDialog`, `CopyField` (a value with its Copy button: an input, `inline` or `multiline`), `DataTable`, `Dialog`, `DropdownMenu`, `EmptyState`, `FormDialog`, `FormField`, `IconButton` (a button showing only an icon: `icon`, `label`, `danger`, `busy`), `IconPicker`, `JsonBlock`, `Kbd`, `KeyValueList`, `Loader` (with `inline`, a spinner in a line of text), `LocalePicker`, `MimeTypePicker`, `NavList`, `NavListItem`, `NewButton` (a page's create button with its `n` shortcut), `NumberField`, `PageLoader`, `PageState`, `Pager`, `Panel`, `Popover`, `ProgressBar`, `Radio`, `RadioCard`, `SaveButton` (with `icon`, a spinner while saving), `ScheduleFields`, `SearchField`, `SectionIntro`, `SegmentedControl`, `Select`, `SettingsAccordion`, `Skeleton`, `SortHeader`, `StatusBadge`, `StringList`, `Switch`, `Tabs`, `TextField`, `TextareaField`, `Tip` |
| Page parts | `Icon`, `PageHeader`, `EditorHeader`, `EntityPanel` (a side list beside a section's pages), `SettingsPage` and `SettingsBlock` (a settings tab and its titled groups), `FeatureGate`, `FeatureLock`, `ContentPicker`, `AssetPicker`, `HostVerification`, `CredentialPicker` (a credential of the vault, with adding one on the spot) |
| Field editors | `FieldRenderer`, `FieldInput` (the bare input), `FieldGrid`, `BlockEditor`, `BlockGridBoard`, `htmlToRichText`; the admin lends its own at runtime, so plugin screens edit content like the document editor |
| Composables | `useDraftForm` (with `scoped` and the `ErrorFor` type), `useEditorForm` (an editor page's draft form with the leave guard, breadcrumb and Mod+S), `useUnsavedGuard`, `useBreadcrumb`, `useShortcuts`, `useEditorShortcuts`, `useJsonFilePick` (a file input read as JSON, for imports), `useEnvironmentChoice`, `useCan`, `useFeature`, `useFieldContext`, `provideFieldContext`, `usePanel` |
| Stores | `useSpaceStore` (the current space, its locale and content model), `useSessionStore` (the signed-in user, permissions and features), `useUiStore` (drawer state and screen width) |
| Other plugins | `PluginSlot`, `usePluginApi`, `useSlotEntries` and `slotEntries` (a slot's entries, for a plugin that draws its own slot) (see [Plugin slots and apis](./plugin-slots.md)) |
| API | `api` (the typed management client), `pluginClient(id)`, `errorDetails`, `errorKey`, `isNotFound`, `messageFor`, `messageForKey`, `hasMessage` |
| Queries | `queryClient`, `keys`, `invalidate` (`invalidate.own(key)` for the plugin's own keys), `onInvalidated(kind, handler)` (runs when the admin invalidates a core kind; today `credentials`), `optimistic`, `spaceWrites`, `pluginKeys(root)` (a plugin's own keys: `all`, `scoped` by the working environment, `invalidate`), `useSpaceQuery`, `required`; content (`content`, `useContentByIds`, `useContentSearch`, `useTreeChildren`), assets (`assets`, `useAssetsByIds`, `useAssetsPaged`), menus (`menus`, `useMenu`, `useMenus`), content types (`contentTypes`, `useContentTypes`), credentials (`useCredentials`) |
| Writes and feedback | `runWrite`, `confirmAndRun`, `confirm`, `toast`, `requireSpace` |
| Helpers | `formatBytes`, `formatDate`, `formatDateTime`, `formatTime`, `relativeTime`, `dayLabel`, `plural`, `plainClone`, `downloadFile`, `downloadBlob`, `copyText`, `localeName`, `localeOptions`, `shortcutHint`, `formatKeys`, `focusFirstFieldSoon`, `typeIcon`, `moveInList`, `toggleInList`, `toggleInSet`, `previewHostname`, `environmentOf`, `isProduction` |
| Blocks | `BREAKPOINTS` (the block grid's breakpoints) |
| Compatibility | `SDK_API_LEVEL` |
| Types | `Space`, `ContentDocument`, `ContentListItem`, `ContentTypeSummary`, `FieldDefinition`, `Asset`, `MenuDetail`, `UsageOverview`, `Environment`, `DraftDocument`, and the option types of the controls (`SelectOption`, `TabItem`, ...) |

The controls follow the admin's own rules (bound with `v-model`, errors through
`runWrite`, lists through `AsyncList`, which draws the pager too with `pageSize`, `total`
and `v-model:page`).

## Styles

The kit's controls use the admin's classes, which are on the page already, among them
`mb-meta` for secondary text (dates, counts, ids) and `mb-link` for links in running text. A plugin's own
markup takes the admin's tokens through the Tailwind preset of `@manablox/admin-plugin`,
see [Admin plugins](./admin-plugins.md#styles). The token sheet itself is
`@manablox/admin-sdk/styles/theme.css`.
