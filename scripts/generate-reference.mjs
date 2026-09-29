#!/usr/bin/env node
// Writes the reference pages derived from the code into `docs/` with the CMS's
// `manablox docs generate`, for the instance of `manablox.config.ts`: the error keys, the HTTP
// API and the hooks of the installed `@manablox/*` packages. `--check` generates into a
// temporary folder instead and fails when a page in `docs/` differs, so CI catches pages
// that are stale against the packages this repository installs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const bin = join(root, 'node_modules/.bin/manablox');
const check = process.argv.includes('--check');

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const out = check ? mkdtempSync(join(tmpdir(), 'manablox-reference-')) : docs;
let stale = [];
try {
  execFileSync(bin, ['docs', 'generate', '--out', out, '--config', 'manablox.config.ts'], {
    cwd: root,
    stdio: ['ignore', check ? 'ignore' : 'inherit', 'inherit'],
  });
  if (check) {
    stale = [...files(out)]
      .map((path) => relative(out, path))
      .filter((page) => {
        const current = join(docs, page);
        return (
          !existsSync(current) ||
          readFileSync(current, 'utf8') !== readFileSync(join(out, page), 'utf8')
        );
      });
  }
} finally {
  if (check) rmSync(out, { recursive: true, force: true });
}

if (stale.length) {
  console.error(`docs:check: ${stale.length} stale page(s); run pnpm docs:generate\n`);
  for (const page of stale) console.error(`  docs/${page}`);
  process.exit(1);
}
if (check) console.log('docs:check: the generated pages are current');
