---
title: 'A Nuxt frontend'
description: 'The Nuxt module: one line of config, a composable that resolves the route to a document, a block renderer, and the preview route.'
---

`@manablox/nuxt` wires the SDK into a Nuxt 4 site. Against a project made by
`manablox create` on this machine the module needs no options: it reads from the public
API on `http://localhost:3100` and accepts the admin on `http://localhost:3000`.

## Setup

```sh
pnpm add @manablox/nuxt @manablox/public-sdk @manablox/live-preview
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@manablox/nuxt'],

  // Every option is optional; these are the defaults.
  manablox: {
    url: 'http://localhost:3100',                   // the public API, or $MANABLOX_URL
    transport: 'graphql',                           // or 'rest'
    locale: 'en',
    preview: { enabled: true, editorOrigin: 'http://localhost:3000' }, // the admin
  },

  // A block of type `teaser` renders <BlockTeaser>. Nuxt would otherwise derive the
  // prefix from the directory name, so it is set explicitly.
  components: [{ path: '~/components/blocks', prefix: 'Block', global: true }],

  routeRules: {
    // Delivery responses are cached and purged on publish, so a long ISR window is safe.
    '/**': { isr: 300 },
    '/preview': { ssr: false, robots: false },
  },
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `url` | `$MANABLOX_URL`, else `http://localhost:3100` | The public delivery API |
| `spaceId` | `$MANABLOX_SPACE_ID`, else none | Only for a management API, see below |
| `locale` | `en` | The language to read |
| `transport` | `graphql` | `graphql` or `rest`. Only a public API serves `rest` (`/v1/...`) |
| `apiKey` | none | Server-only, for a preview server you write yourself; never reaches the browser |
| `cache` | `{ ttl: 1000, max: 100 }` | The client's request cache (`ttl` in ms, `max` entries); `false` keeps only the deduplication of concurrent identical requests |
| `preview.enabled` | `true` | `false` stops `<ManabloxPreview>` from connecting |
| `preview.route` | `/preview` | Only recorded in the runtime config; the admin always opens the Frontend URL plus `/preview` |
| `preview.editorOrigin` | `$MANABLOX_ADMIN_ORIGIN`, else `http://localhost:3000` | The admin's origin, the only sender the preview accepts |

The environment variables are read when Nuxt builds or starts in development. The
options land in the public runtime config, so a built site takes other addresses at
start: `NUXT_PUBLIC_MANABLOX_URL`, `NUXT_PUBLIC_MANABLOX_SPACE_ID`,
`NUXT_PUBLIC_MANABLOX_TRANSPORT` and `NUXT_PUBLIC_MANABLOX_PREVIEW_EDITOR_ORIGIN`. One
build then runs against any instance.

A site reads from the public API. It pins its space, so `spaceId` is ignored there. A
project created with `--no-public` has only the management API (port 3000 locally): set
`url` to it, set `spaceId` (without it every page is a 404, since the management API
serves every space) and keep the `graphql` transport, since the management API has no
REST routes.

The visual editor talks to the page in the browser, not to an API, so the preview needs
only `editorOrigin` and no key.

## What the module provides

| | |
| --- | --- |
| `useManablox()` | The SDK client, configured from the module options. One client per Nuxt app, so one per request on the server: its cache is never shared between requests |
| `useManabloxPage<T>(selection)` or `useManabloxPage<T>({ selection, expand })` | Resolves the current route's path to a document through `useAsyncData`, keyed on the permalink, so the payload fetched during SSR is reused on hydration. `selection` is the type-specific part of a GraphQL selection; ignored on the REST transport. `expand` names the image and relation fields REST delivers whole (`['hero', 'author']`); without it they arrive as ids. GraphQL resolves them anyway |
| `<ManabloxBlocks :blocks="page.components" field="components">` | Renders a block field by convention (`teaser` -> `<BlockTeaser>`), passing each block's fields as props and tagging it with `data-manablox-field` for the visual editor. The value is `{ grid, blocks }`, and a field laid out on a grid renders as one at every breakpoint: each block gets its placement as custom properties in `style`, which the SDK's stylesheet, rendered once by the component, turns into CSS grid |
| `<ManabloxPreview v-slot="{ document, fields }">` | The visual editor's canvas: connects the channel, checks the origin, and hands the slot the document being edited |
| `useManabloxPreviewState()` | The draft `<ManabloxPreview>` last received, for components outside its slot such as a layout; `null` outside the preview |

## A page

```vue
<!-- pages/[...slug].vue -->
<script setup lang="ts">
const SELECTION = `
  ... on Page {
    summary
    components {
      grid
      blocks {
        blockId
        typeName
        layout
        ... on Teaser { headline body }
      }
    }
  }
`;

const { data: page } = await useManabloxPage<{
  title: string;
  summary?: string;
  components?: { blocks: { blockId: string; typeName: string }[] };
}>(SELECTION);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true });
}

useHead({ title: page.value.title });
</script>

<template>
  <article v-if="page">
    <h1>{{ page.title }}</h1>
    <p v-if="page.summary" class="lead">{{ page.summary }}</p>
    <ManabloxBlocks :blocks="page.components" field="components" />
  </article>
</template>
```

```vue
<!-- components/blocks/Teaser.vue -> <BlockTeaser> -->
<script setup lang="ts">
import { richTextToHtml } from '@manablox/public-sdk';
import { computed } from 'vue';

const props = defineProps<{ headline?: string; body?: unknown }>();
const body = computed(() => richTextToHtml(props.body));
</script>

<template>
  <section class="teaser">
    <h2 v-if="headline">{{ headline }}</h2>
    <!-- safe: richTextToHtml escapes text and emits a fixed set of tags -->
    <div v-if="body" v-html="body"></div>
  </section>
</template>
```

On the REST transport there is no selection; name the fields to inline instead:
`useManabloxPage({ expand: ['hero'] })`.

The menu is one call in the layout: `const { data: menu } = await useAsyncData('menu',
() => useManablox().menu('main'))`, then `item.href` and `item.label` per entry.

## The preview route

```vue
<!-- pages/preview.vue -->
<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <ManabloxPreview v-slot="{ document, fields }">
    <article>
      <h1>{{ document.title || 'Untitled' }}</h1>
      <p v-if="fields.summary" class="lead">{{ fields.summary }}</p>
      <ManabloxBlocks :blocks="(fields.components as any) ?? null" field="components" />
    </article>
  </ManabloxPreview>
</template>
```

Set the space's **Frontend URL** to the site's origin and **Visual** in the document
editor renders through this route. See [Preview and the visual editor](../delivery/preview.md).
