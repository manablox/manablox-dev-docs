#!/usr/bin/env node
// Checks that every internal link of the built site (`dist/`) resolves to a file.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const base = process.env.DOCS_BASE_PATH ?? '/';

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* htmlFiles(path);
    else if (entry.endsWith('.html')) yield path;
  }
}

function resolvesInDist(href) {
  const clean = href.replace(/[?#].*$/, '');
  if (!clean.startsWith(base)) return false;
  const path = join(dist, clean.slice(base.length));
  return (
    existsSync(path) ||
    existsSync(join(path, 'index.html')) ||
    existsSync(`${path.replace(/\/$/, '')}.html`)
  );
}

let broken = 0;
let checked = 0;
for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    checked++;
    if (!resolvesInDist(href)) {
      broken++;
      console.error(`${relative(process.cwd(), file)}: ${href}`);
    }
  }
}

console.info(`check-links: ${checked} internal links, ${broken} broken`);
process.exit(broken ? 1 : 0);
