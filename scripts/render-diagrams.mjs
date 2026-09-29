#!/usr/bin/env node
// Renders every `public/**/*.mmd` to the `.svg` beside it with the mermaid CLI image, so the
// site ships static diagrams instead of mermaid. Pass file paths to render only those.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const image = process.env.MERMAID_CLI_IMAGE ?? 'minlag/mermaid-cli';

const sources =
  process.argv.length > 2
    ? process.argv.slice(2).map((path) => resolve(path))
    : readdirSync(join(here, '../public'), { recursive: true })
        .filter((path) => path.endsWith('.mmd'))
        .map((path) => join(here, '../public', path));

const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;

for (const source of sources) {
  const path = relative(root, source);
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-u',
      user,
      '-v',
      `${root}:/data`,
      image,
      '-i',
      path,
      '-o',
      path.replace(/\.mmd$/, '.svg'),
      '-c',
      relative(root, join(here, 'mermaid.config.json')),
      '-b',
      'transparent',
      '-q',
    ],
    { stdio: 'inherit' },
  );
  console.log(`rendered ${path.replace(/\.mmd$/, '.svg')}`);
}
