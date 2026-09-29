#!/usr/bin/env node
// Checks the absolute links of the built site (`dist/`) into the other Manablox docs sites:
// every page they name exists, and so does the `#fragment` when one is given. The other
// sites are built in their own repositories, so this is not part of `pnpm check`. Point it
// at each site it links to, by the variables of `TARGETS` below:
//
//   <ENV>_DIST=../<repo>/dist     that repository's build output (`pnpm build` there)
//   <ENV>_URL=https://<host>      or a deployed copy, fetched page by page
//
// A host the site links to without either variable set fails the check.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');

/** The docs sites this site links to, and the variables that point at their builds. */
const TARGETS = [{ host: 'docs.manablox.io', env: 'USER_DOCS', repo: 'manablox-user-docs' }];

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* htmlFiles(path);
    else if (entry.endsWith('.html')) yield path;
  }
}

/** The page's HTML from a build folder, or `null` when no file serves the path. */
function fromDist(root, path) {
  const file = join(root, decodeURIComponent(path));
  const candidates = path.endsWith('/')
    ? [join(file, 'index.html')]
    : [file, `${file}.html`, join(file, 'index.html')];
  const found = candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  return found ? readFileSync(found, 'utf8') : null;
}

/** The page's HTML from a deployed copy, or `null` when it does not answer 200. */
async function fromUrl(origin, path) {
  const response = await fetch(new URL(path, origin), { redirect: 'follow' });
  return response.ok ? response.text() : null;
}

function hasId(html, fragment) {
  const id = decodeURIComponent(fragment).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\sid=["']?${id}["'\\s>]`).test(html);
}

// Every absolute link into a target host, with the files it appears in.
const links = new Map();
for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/href="(https:\/\/[^"]+)"/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'));
    if (!TARGETS.some((target) => target.host === url.host)) continue;
    const key = `${url.origin}${url.pathname}${url.hash}`;
    if (!links.has(key)) links.set(key, new Set());
    links.get(key).add(relative(process.cwd(), file));
  }
}

let broken = 0;
let missing = false;
const pages = new Map();
for (const target of TARGETS) {
  const own = [...links.keys()].filter((link) => new URL(link).host === target.host);
  if (own.length === 0) continue;
  const distDir = process.env[`${target.env}_DIST`];
  const origin = process.env[`${target.env}_URL`];
  if (!distDir && !origin) {
    console.error(
      `links:cross: ${own.length} link(s) into ${target.host}; set ${target.env}_DIST (the build of ${target.repo}) or ${target.env}_URL`,
    );
    missing = true;
    continue;
  }
  for (const link of own) {
    const url = new URL(link);
    const path = url.pathname || '/';
    const page = `${target.host}${path}`;
    if (!pages.has(page)) {
      pages.set(page, distDir ? fromDist(resolve(distDir), path) : await fromUrl(origin, path));
    }
    const html = pages.get(page);
    const fragment = url.hash.slice(1);
    const problem =
      html === null
        ? 'no such page'
        : fragment && !hasId(html, fragment)
          ? `no #${fragment} on the page`
          : null;
    if (problem) {
      broken++;
      console.error(`${link}: ${problem} (in ${[...links.get(link)].join(', ')})`);
    }
  }
}

console.info(`links:cross: ${links.size} links into the other docs sites, ${broken} broken`);
process.exit(broken || missing ? 1 : 0);
