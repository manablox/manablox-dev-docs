---
title: 'A Vite + Vue SSR frontend'
description: 'Build the frontend of a space from an empty folder: Vite, Vue 3 and server-side rendering with hydration, routing by permalink, menus, blocks, images, typed content, the visual editor, and a Docker image.'
---

This guide builds a complete website for a space, step by step, with **Vite**, **Vue 3**
and **server-side rendering** (SSR): the server renders each page to HTML from the CMS,
the browser hydrates it into a Vue app, and navigation from then on fetches from the CMS
directly. It ends with a `/preview` route for the visual editor and a Docker image.

Every step ends in something that runs. The code is complete; copy it as you go.

In a hurry? `manablox frontend my-site --framework vue-ssr` writes this whole project in
one command. See [Scaffold a frontend](./scaffold-a-frontend.md); this page is the same
site built by hand, and explains every decision on the way.

**What you need before starting**

- A running instance: [Create a project](../getting-started/create-a-project.md), with `pnpm dev` and `pnpm dev:public`.
- The space from [Your first space](../getting-started/first-space.md): a *Page* type with `summary` and `components`, a *Teaser* block with `headline`, `body` and `image`, a published page and a menu called `main`. The guide renders exactly that; if your types differ, adjust the component in step 6.
- The public API answering at <http://localhost:3100>. If it is not, the space is not pinned yet: set `MANABLOX_SPACE=website` in the project's `.env` and restart `pnpm dev:public`, or make sure there is exactly one space.
- Node 24 and pnpm (or npm; the commands are the same shape).

**What you will build**

```
my-site/
|-- index.html                 the HTML shell, with two placeholders
|-- server.js                  Express: Vite in dev, the built bundle in production
|-- vite.config.ts
|-- package.json, tsconfig.json
`-- src/
    |-- entry-client.ts        hydrates the app in the browser
    |-- entry-server.ts        renders the app to HTML on the server
    |-- app.ts                 creates the app: router, client, state
    |-- App.vue                the shell: menu + <RouterView>
    |-- lib/manablox.ts        the SDK client, provided to the app
    |-- lib/state.ts           the state the server hands to the browser
    |-- composables/useLoad.ts fetch on the server, reuse in the browser
    |-- pages/Page.vue         any permalink -> a document
    |-- pages/Preview.vue      the visual editor's canvas
    |-- components/Blocks.vue  block -> component
    |-- components/blocks/Teaser.vue
    `-- manablox.d.ts          generated types for the content model
```

## Step 1: Create the project

```sh
mkdir my-site && cd my-site
pnpm init
pnpm add vue vue-router express @manablox/public-sdk @manablox/live-preview
pnpm add -D vite @vitejs/plugin-vue typescript vue-tsc @types/express @types/node
```

`package.json`: set `"type": "module"` and the scripts:

```json
{
  "name": "my-site",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server.js",
    "build": "pnpm build:client && pnpm build:server",
    "build:client": "vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.ts --outDir dist/server",
    "start": "NODE_ENV=production node server.js",
    "typecheck": "vue-tsc --noEmit",
    "types": "manablox-sdk types --url ${MANABLOX_URL:-http://localhost:3100} --out src/manablox.d.ts"
  }
}
```

There are two builds because there are two bundles: one for the browser, one the server
imports. `dev` runs the same `server.js` with Vite in the middle.

`vite.config.ts`:

```ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: { port: 3006 },
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "server.js", "vite.config.ts"]
}
```

## Step 2: The HTML shell

`index.html` is the page every route is rendered into. Two comments are placeholders the
server fills in: the rendered app, and the `<head>` additions (the title and the state).

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!--app-head-->
  </head>
  <body>
    <div id="app"><!--app-html--></div>
    <script type="module" src="/src/entry-client.ts"></script>
  </body>
</html>
```

## Step 3: The server

`server.js` does two jobs. In development it creates Vite in *middleware mode*, so
requests for `/src/...` are served by Vite with hot reload, and it loads the server entry
through Vite so it is compiled on the fly. In production it serves the built client
bundle as static files and imports the built server entry once.

```js
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3006);
const root = import.meta.dirname;

/**
 * Configuration the site needs. Read on the server, at start-up, and handed to the
 * browser inside the page, so one build runs against any instance.
 */
const config = {
  url: process.env.MANABLOX_URL ?? 'http://localhost:3100',
  editorOrigin: process.env.MANABLOX_ADMIN_ORIGIN ?? 'http://localhost:3000',
};

const app = express();

let vite;
if (isProduction) {
  // Hashed assets are immutable; index.html is never served from here, so `index: false`.
  app.use('/assets', express.static(path.join(root, 'dist/client/assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(path.join(root, 'dist/client'), { index: false }));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
  app.use(vite.middlewares);
}

app.use('*all', async (req, res) => {
  const url = req.originalUrl;
  try {
    let template;
    let render;
    if (vite) {
      template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
      template = await vite.transformIndexHtml(url, template);
      ({ render } = await vite.ssrLoadModule('/src/entry-server.ts'));
    } else {
      template = fs.readFileSync(path.join(root, 'dist/client/index.html'), 'utf8');
      ({ render } = await import('./dist/server/entry-server.js'));
    }

    const { html, head, status } = await render(url, config);
    res
      .status(status)
      .set({
        'content-type': 'text/html',
        // Delivery responses are purged on publish, so a CDN may hold a page briefly;
        // a page that could not be rendered must not be held at all.
        'cache-control': status >= 500 ? 'no-store' : 'public, max-age=0, s-maxage=300',
      })
      .end(template.replace('<!--app-head-->', head).replace('<!--app-html-->', html));
  } catch (error) {
    vite?.ssrFixStacktrace(error);
    console.error(error);
    // "The CMS is down" is a 503, never a 404. See step 5.
    res.status(503).set('cache-control', 'no-store').end('Something went wrong.');
  }
});

app.listen(port, () => console.log(`http://localhost:${port}`));
```

Two things to notice: the CMS URL is read from `process.env` **on the server only**, and
the same `render(url, config)` runs in both modes. Nothing about the CMS is baked into
the bundle.

`'*all'` is Express 5's catch-all syntax; on Express 4 use `'*'`.

## Step 4: The app, shared by both entries

Server and browser build the same app; only the router's history and the mount differ.

`src/lib/state.ts`: the object the server fills while rendering and the browser reads
after hydration, so nothing is fetched twice:

```ts
import { inject, type InjectionKey } from 'vue';

export interface SiteConfig {
  url: string;
  editorOrigin: string;
}

export interface AppState {
  config: SiteConfig;
  /** Loaded data, keyed by `useLoad`: filled on the server, read once in the browser. */
  data: Record<string, unknown>;
}

export const stateKey: InjectionKey<AppState> = Symbol('state');

export function useState(): AppState {
  const state = inject(stateKey);
  if (!state) throw new Error('App state is not provided');
  return state;
}
```

`src/lib/manablox.ts`: one SDK client per app instance, on the REST transport so no
selection sets are needed, with `expand` left to each call:

```ts
import { createClient, type ManabloxClient } from '@manablox/public-sdk';
import { inject, type InjectionKey } from 'vue';

export const clientKey: InjectionKey<ManabloxClient> = Symbol('manablox');

export function createManablox(url: string): ManabloxClient {
  return createClient({
    url,
    transport: 'rest',
    // Deduplicates the menu request the shell and the page both make during one render.
    cache: { ttl: 30_000 },
  });
}

export function useManablox(): ManabloxClient {
  const client = inject(clientKey);
  if (!client) throw new Error('Manablox client is not provided');
  return client;
}
```

`src/app.ts`:

```ts
import { createSSRApp } from 'vue';
import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { clientKey, createManablox } from './lib/manablox';
import { type AppState, stateKey } from './lib/state';

export function createApp(state: AppState) {
  const app = createSSRApp(App);

  const router = createRouter({
    // The server has no address bar; memory history takes the URL from `push()`.
    history: import.meta.env.SSR ? createMemoryHistory() : createWebHistory(),
    routes: [
      { path: '/preview', component: () => import('./pages/Preview.vue') },
      // Everything else is a permalink the CMS resolves.
      { path: '/:permalink(.*)*', component: () => import('./pages/Page.vue') },
    ],
  });

  app.use(router);
  app.provide(stateKey, state);
  app.provide(clientKey, createManablox(state.config.url));

  return { app, router };
}
```

`src/entry-server.ts`: render one URL to a string. The page components can set the
HTTP status and the title on the SSR context:

```ts
import { renderToString, type SSRContext } from 'vue/server-renderer';
import { createApp } from './app';
import type { AppState, SiteConfig } from './lib/state';

export interface RenderResult {
  html: string;
  head: string;
  status: number;
}

export async function render(url: string, config: SiteConfig): Promise<RenderResult> {
  const state: AppState = { config, data: {} };
  const { app, router } = createApp(state);

  await router.push(url);
  await router.isReady();

  const ctx: SSRContext & { status?: number; title?: string } = {};
  const html = await renderToString(app, ctx);

  // The state travels in the page. `<` is escaped so content cannot close the script.
  const serialised = JSON.stringify(state).replace(/</g, '\\u003c');
  const head = [
    `<title>${escapeHtml(ctx.title ?? 'My site')}</title>`,
    `<script>window.__STATE__=${serialised}</script>`,
  ].join('\n');

  return { html, head, status: ctx.status ?? 200 };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
```

`src/entry-client.ts`: pick the state up and hydrate:

```ts
import { createApp } from './app';
import type { AppState } from './lib/state';

declare global {
  interface Window {
    __STATE__?: AppState;
  }
}

const state: AppState = window.__STATE__ ?? {
  config: { url: 'http://localhost:3100', editorOrigin: 'http://localhost:3000' },
  data: {},
};

const { app, router } = createApp(state);
router.isReady().then(() => app.mount('#app'));
```

## Step 5: Loading data on the server and reusing it in the browser

The heart of SSR with data: a component needs its data *before* the server renders it,
and the browser must not fetch it again on hydration. Vue's `onServerPrefetch` gives the
first; the shared state gives the second.

`src/composables/useLoad.ts`:

```ts
import { onServerPrefetch, ref, type Ref, watch } from 'vue';
import { useState } from '../lib/state';

export interface Loaded<T> {
  data: Ref<T | null>;
  error: Ref<unknown>;
  pending: Ref<boolean>;
}

/**
 * Loads a value once per key.
 *
 * On the server the loader runs during render, and the result is written into the
 * state the page carries to the browser. In the browser the first render takes that
 * value instead of fetching; every later change of the key (a navigation) fetches.
 *
 * On the server a failure is rethrown, so the request ends as a 503 rather than a page
 * that looks empty. In the browser it is kept in `error` for the component to show.
 */
export function useLoad<T>(key: () => string, load: () => Promise<T>): Loaded<T> {
  const state = useState();
  const data = ref(null) as Ref<T | null>;
  const error = ref<unknown>(null);
  const pending = ref(false);

  async function run() {
    pending.value = true;
    error.value = null;
    try {
      data.value = await load();
      if (import.meta.env.SSR) state.data[key()] = data.value;
    } catch (caught) {
      if (import.meta.env.SSR) throw caught;
      error.value = caught;
    } finally {
      pending.value = false;
    }
  }

  if (import.meta.env.SSR) {
    onServerPrefetch(run);
  } else {
    const hydrated = state.data[key()];
    if (hydrated !== undefined) {
      data.value = hydrated as T;
      delete state.data[key()]; // used once; the next visit fetches
    } else {
      void run();
    }
    watch(key, () => void run());
  }

  return { data, error, pending };
}
```

## Step 6: Render a page

Rich text arrives as ProseMirror JSON, not HTML. The SDK's `richTextToHtml` renders
the node types the toolbar produces and **escapes every string**, so content can never
inject markup; there is nothing to write yourself.

`src/components/blocks/Teaser.vue`: one component per block type. The `path` prop and
`fieldAttribute` are for the visual editor (step 9); they cost nothing on the live site.

```vue
<script setup lang="ts">
import { fieldAttribute } from '@manablox/live-preview';
import {
  type Asset,
  assetSrcSet,
  assetUrl,
  type Block,
  isImage,
  richTextToHtml,
} from '@manablox/public-sdk';
import { computed } from 'vue';

const props = defineProps<{ block: Block; path: (string | number)[] }>();

const headline = computed(() => (typeof props.block.headline === 'string' ? props.block.headline : null));
const body = computed(() => richTextToHtml(props.block.body));
// A relation arrives as an id unless expanded; the page expands `image` (step 6).
const image = computed(() => (isAsset(props.block.image) && isImage(props.block.image) ? props.block.image : null));

function isAsset(value: unknown): value is Asset {
  return typeof value === 'object' && value !== null && 'url' in value && 'mimeType' in value;
}
</script>

<template>
  <section class="teaser" v-bind="fieldAttribute(path)">
    <img
      v-if="image"
      :src="assetUrl(image, { preset: 'card' })"
      :srcset="assetSrcSet(image, { thumb: 320, card: 640, hero: 1920 })"
      sizes="(max-width: 46rem) 100vw, 46rem"
      :alt="image.alt ?? headline ?? ''"
      :width="image.width ?? undefined"
      :height="image.height ?? undefined"
      loading="lazy"
      decoding="async"
      v-bind="fieldAttribute([...path, 'image'])"
    />
    <h2 v-if="headline" v-bind="fieldAttribute([...path, 'headline'])">{{ headline }}</h2>
    <div v-if="body" v-bind="fieldAttribute([...path, 'body'])" v-html="body"></div>
  </section>
</template>
```

`v-html` is safe here only because `richTextToHtml` escapes text and allows a fixed set
of tags. Never pass CMS strings to `v-html` unescaped.

`src/components/Blocks.vue`: the registry: a block whose type is `teaser` renders
`<Teaser>`. An unknown type renders a visible note rather than vanishing.

```vue
<script setup lang="ts">
import type { Block } from '@manablox/public-sdk';
import type { Component } from 'vue';
import Teaser from './blocks/Teaser.vue';

defineProps<{ blocks: Block[]; field: string }>();

const renderers: Record<string, Component> = { teaser: Teaser };
</script>

<template>
  <template v-for="(block, index) in blocks" :key="block.blockId">
    <component :is="renderers[block.type]" v-if="renderers[block.type]" :block="block" :path="[field, index]" />
    <div v-else class="unknown">No renderer for block type "{{ block.type }}".</div>
  </template>
</template>
```

`src/pages/Page.vue`: the catch-all route. It asks the CMS for the document at the
current path, with the teaser's `image` relation expanded, and tells the server to answer
404 when there is none:

```vue
<script setup lang="ts">
import type { Block } from '@manablox/public-sdk';
import { computed, useSSRContext, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import Blocks from '../components/Blocks.vue';
import { useLoad } from '../composables/useLoad';
import { useManablox } from '../lib/manablox';
import type { Page } from '../manablox';

const route = useRoute();
const cms = useManablox();
const ssr = import.meta.env.SSR ? useSSRContext<{ status?: number; title?: string }>() : undefined;

const { data: page, error, pending } = useLoad(
  () => `page:${route.path}`,
  async () => {
    // The SDK strips the slashes; the empty path that is left for `/` resolves the space's
    // home page: the document starred in the content tree.
    const found = await cms.byPermalink<Page>(route.path, { expand: ['image'] });
    if (!found && ssr) ssr.status = 404;
    if (found && ssr) ssr.title = found.title;
    return found;
  },
);

const blocks = computed(() => (Array.isArray(page.value?.components) ? (page.value.components as Block[]) : []));

if (!import.meta.env.SSR) {
  watchEffect(() => {
    if (page.value) document.title = page.value.title;
  });
}
</script>

<template>
  <div v-if="error" class="state">
    <h1>Something went wrong</h1>
    <p>{{ error instanceof Error ? error.message : String(error) }}</p>
  </div>
  <div v-else-if="!page && !pending" class="state">
    <h1>Not found</h1>
    <p>Nothing is published at {{ route.path }}.</p>
    <p><RouterLink to="/">Back to the start</RouterLink></p>
  </div>
  <article v-else-if="page">
    <h1>{{ page.title }}</h1>
    <p v-if="page.summary" class="lead">{{ page.summary }}</p>
    <Blocks :blocks="blocks" field="components" />
  </article>
</template>
```

`Page` is a generated type: step 8. Until then, replace the import with
`type Page = ContentNode & { summary?: string; components?: unknown[] }` from
`@manablox/public-sdk`.

## Step 7: The shell and the menu

`src/App.vue` renders the menu called `main` and the current route. The menu loads
through the same composable, so it is fetched once on the server and reused in the
browser:

```vue
<script setup lang="ts">
import { useLoad } from './composables/useLoad';
import { useManablox } from './lib/manablox';
import { useRoute } from 'vue-router';

const cms = useManablox();
const route = useRoute();
const { data: menu } = useLoad(() => 'menu:main', () => cms.menu('main'));
</script>

<template>
  <div class="site">
    <nav v-if="route.path !== '/preview'">
      <RouterLink
        v-for="item in menu?.items ?? []"
        :key="item.id"
        :to="item.href ?? '#'"
        :aria-current="item.href === route.path ? 'page' : undefined"
      >
        {{ item.label }}
      </RouterLink>
    </nav>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style>
:root { --ink: #18181b; --muted: #71717a; --line: #e4e4e7; }
body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: var(--ink); }
.site { max-width: 46rem; margin: 0 auto; padding: 3rem 1.5rem; }
nav { display: flex; gap: 1rem; border-bottom: 1px solid var(--line); padding-bottom: 1rem; margin-bottom: 2rem; }
nav a[aria-current='page'] { font-weight: 600; }
.lead { color: var(--muted); font-size: 1.125rem; }
.teaser { border-top: 1px solid var(--line); padding-top: 1.5rem; margin-top: 1.5rem; }
.teaser img { max-width: 100%; height: auto; }
.unknown, .state { color: var(--muted); }
</style>
```

`item.href` is the link's URL for a link entry and the document's root-relative
permalink for a content entry, so a `<RouterLink>` works for both. An external link
would want a plain `<a>`; check `item.url` to tell them apart.

**Run it:**

```sh
pnpm dev
```

Open <http://localhost:3006/about>. View the page source: the article is in the HTML,
rendered on the server, and the state script carries the page and the menu. Click a
menu entry: the browser navigates without a reload and fetches the next page from the
CMS itself. `MANABLOX_URL=http://other-host:3100 pnpm dev` points the whole site at
another instance without touching the code.

## Step 8: Typed content

`ContentNode` carries an index signature, which is honest but gives you nothing. Generate
the real types from the space's content model and check the file in:

```sh
pnpm types      # writes src/manablox.d.ts from http://localhost:3100/v1/types
```

```ts
// src/manablox.d.ts (generated)
export interface Teaser extends Block { type: 'teaser'; headline?: string; body?: unknown; image?: string | Asset | null; }
export interface Page extends ContentNode { type: 'page'; summary?: string; components?: Array<Teaser>; }
export type Content = Page;
```

Now `cms.byPermalink<Page>()` autocompletes `page.summary`, and renaming a field in the
admin shows up as a type error after the next `pnpm types`, not as `undefined` in
production. Re-run it whenever the model changes; a CI step that runs it and fails on a
diff catches drift.

## Step 9: The visual editor

The admin's **Visual** button loads `<frontend URL>/preview` in a frame and pushes the
document being edited into it on every keystroke, unsaved. The route renders in the
browser only (there is nothing to render on the server, since the document arrives
after the page loads) and needs no API key.

`src/pages/Preview.vue`:

```vue
<script setup lang="ts">
import { connectPreview, fieldAttribute, type PreviewDocument } from '@manablox/live-preview';
import { type Block, normaliseFields } from '@manablox/public-sdk';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Blocks from '../components/Blocks.vue';
import { useState } from '../lib/state';

const { config } = useState();
const document = ref<PreviewDocument | null>(null);
const highlighted = ref<string | null>(null);
let disconnect: (() => void) | undefined;

onMounted(() => {
  disconnect = connectPreview({
    // The origin check is not optional: without it any page could drive the preview.
    editorOrigin: config.editorOrigin,
    clickToEdit: true,
    onDocument: (next) => {
      document.value = next;
    },
    onHighlight: (path) => {
      highlighted.value = path ? path.join('.') : null;
    },
  });
});
onBeforeUnmount(() => disconnect?.());

// The editor sends fields in storage shape; normalising them gives the shape the SDK
// returns, so the same <Blocks> and <Teaser> render the preview and the live page.
const fields = computed(() => (document.value ? normaliseFields(document.value.fields) : {}));
const blocks = computed(() => (Array.isArray(fields.value.components) ? (fields.value.components as Block[]) : []));
</script>

<template>
  <div :data-manablox-highlight="highlighted">
    <article v-if="document">
      <h1 v-bind="fieldAttribute(['title'])">{{ document.title || 'Untitled' }}</h1>
      <p v-if="typeof fields.summary === 'string' && fields.summary" class="lead" v-bind="fieldAttribute(['summary'])">
        {{ fields.summary }}
      </p>
      <Blocks :blocks="blocks" field="components" />
    </article>
    <p v-else class="state">Waiting for the editor...</p>
  </div>
</template>
```

Images in the preview arrive as **ids**, because the editor does not expand relations;
`<Teaser>` already skips an image that is not an object, so the preview simply shows no
picture until the page is saved and viewed live. A preview that wants the picture can
fetch it with `cms.asset(id)`.

Then, in the admin, make sure the space's **Frontend URL** is `http://localhost:3006`,
open a page and click **Visual**. Typing in a field updates the frame; clicking a
headline in the frame opens that block beside it with the headline focused, and the
toolbar on each block moves, resizes, adds and deletes blocks from inside the frame,
and a double-click on a headline or a body edits it in place, with the rich text
field's own tools. A block field arrives as `{ grid, blocks }`, the grid chosen on the
document per breakpoint: include the SDK's `BLOCK_GRID_CSS` once, give the list
`GRID_CLASS` and `blocksGridStyle(value.grid)`, and each block `BLOCK_CLASS` and
`blockLayoutStyle(block, value.grid)`, as `<Blocks>` in the Nuxt module does. The
preview route renders the same value, resolved by `normaliseFields`. The frame stays on "Waiting for the editor..."
if the origins do not match. See the [checklist](../delivery/preview.md#checklist-when-the-frame-stays-on-waiting-for-the-editor).

## Step 10: Production build and a Docker image

```sh
pnpm build
MANABLOX_URL=https://cms.example.com pnpm start
```

`dist/client` holds the browser bundle and `index.html`; `dist/server/entry-server.js`
is what the server imports. Nothing else is needed at runtime except `node_modules` for
`express` and `vue`.

`Dockerfile`:

```dockerfile
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3006
RUN groupadd --system --gid 1001 site && useradd --system --uid 1001 --gid site site
COPY --from=build --chown=site:site /app/node_modules ./node_modules
COPY --from=build --chown=site:site /app/dist ./dist
COPY --from=build --chown=site:site /app/server.js /app/package.json ./
USER site
EXPOSE 3006
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/preview').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

The health check hits `/preview` because that route does not depend on the CMS: an
unreachable CMS should show as 503s on content routes, not as an unhealthy container.
Run it beside the CMS with the two variables:

```yaml
site:
  build: ./my-site
  environment:
    MANABLOX_URL: http://public-api:3100        # inside the compose network
    MANABLOX_ADMIN_ORIGIN: https://admin.example.com
  ports: ['3006:3006']
```

One subtlety when the browser and the server share a URL: in the browser, the SDK
fetches from `state.config.url`, which is the *server's* view of the CMS. Inside a
compose network that is `http://public-api:3100`, which a browser cannot reach. Either
give the public API a hostname that resolves from both (a `*.localhost` name, which a
browser resolves to 127.0.0.1, set as the service's network alias; or a real DNS name in
production), or hand the browser a second
URL in the config. A public API behind a CDN on `https://cms.example.com` resolves from
both and is the usual answer.

## Where to go from here

- **Locales.** Read the locale from a URL prefix, pass it to `byPermalink` and `menu`, and create the client with `withLocale`. See [Locales and translations](../content-model/localisation.md).
- **Listings.** `cms.list({ type: 'blog-post', under: page.id, limit: 20 })` for a section landing page; `total` is real on the REST transport.
- **GraphQL.** Swap `transport: 'rest'` for `'graphql'` and pass a `selection` per page when a page should fetch less than a whole document; select `variant(preset:)` for images. See [The SDK](../delivery/sdk.md#transports).
- **Preview reads.** A "Preview" link that renders a draft needs the management API and an API key on the server. See [Preview and the visual editor](../delivery/preview.md#preview-reads).
- **Caching.** The response headers above are a start; a CDN in front of both the site and the public API is where SSR sites end up. See [Caching](../delivery/caching.md).
