// The instance the generated reference pages document (`pnpm docs:generate`): every plugin
// Manablox ships. `manablox docs generate` loads this config
// without booting it, so the database and the secret are never used.
import { defineConfig } from '@manablox/core';
import { manabloxFields } from '@manablox/fields';
import { aiPlugin } from '@manablox/plugin-ai';
import { webhooksPlugin } from '@manablox/plugin-webhooks';
import { websitePlugin } from '@manablox/plugin-website';
import { workflowsPlugin } from '@manablox/plugin-workflows';

export default defineConfig({
  database: { url: 'file:unused.db' },
  auth: { secret: 'unused-by-manablox-docs-generate' },
  plugins: [manabloxFields(), workflowsPlugin(), webhooksPlugin(), aiPlugin(), websitePlugin()],
});
