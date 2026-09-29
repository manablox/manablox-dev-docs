import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';

/** `glob()` reads `docs/`, which `docsLoader()` cannot; `README.md` maps to the index. */
export const collections = {
  docs: defineCollection({
    loader: glob({
      base: './docs',
      pattern: '**/[^_]*.md',
      generateId: ({ entry }) => {
        const slug = entry.replace(/\.md$/, '');
        if (slug.toLowerCase() === 'readme') return 'index';
        return slug.replace(/\/index$/i, '');
      },
    }),
    schema: docsSchema(),
  }),
};
