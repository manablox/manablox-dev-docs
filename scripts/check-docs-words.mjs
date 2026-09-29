#!/usr/bin/env node
// Keeps upgrade history out of the documentation: nothing is released yet, so the pages
// describe what is, not what changed. Names a refactor removed from the packages stay out,
// and so do paths that exist in no Manablox repository.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { lineOf, report } from './lib/scan.mjs';

/** Wording that describes a change rather than the current state, in docs and READMEs. */
const PHRASES = [
  /\bformerly\b/gi,
  /\bused to be\b/gi,
  /\bolder (projects?|instances?|releases?)\b/gi,
  /\bwhere they are missing\b/gi,
  /\btook over from\b/gi,
  /\bbecame a plugin\b/gi,
  /\bbefore (Manablox )?0\.\d+/gi,
  /\b(made|created) (before|with) (Manablox )?0\.\d+/gi,
  /\brenamed (from|to)\b/gi,
  /\bstill (accepted|read) as\b/gi,
  /\bas before\b/gi,
  /\bearlier versions? (of Manablox|had)\b/gi,
  /\bbefore you upgrade\b/gi,
  /\bupgrade guide\b/gi,
  /\bafter an upgrade\b/gi,
  /\bmonorepo\b/gi,
];

/** Names the packages no longer have; none may come back into the pages. */
const NAMES = [
  'formerKinds',
  'renameFormerKinds',
  'moveLegacyBlockDesigns',
  'adoptLegacySettings',
  'legacy-block-ext',
  'legacy-steps',
  'MigrationBackfill',
  'ensureTotals',
  'WORKFLOWS_ALLOW_PRIVATE_NETWORK',
  'workflow_credentials',
  'workflowCredential',
  'siteRedirect',
  'RENAMED_KINDS',
  'LEGACY_MESSAGES',
  'CONTENT_PROTOCOL_VERSION',
  'config.mode.renamed',
  'sdkLevel: 2',
  '/api/hooks',
  'backfill:asset-usages',
  'needsRewrite',
  'smtpUrl',
  'upgrading.md',
  'RENAMES.md',
];

/** Paths and places no Manablox repository has; each repository has its own layout. */
const PATHS = [
  'examples/plugin-hello',
  'manablox-content',
  'github.com/daspete',
  'AGPL',
  'apps/site',
  'apps/docs',
  'apps/user-docs',
  'apps/license-server',
  'apps/license-portal',
  'apps/website',
  'packages/plugin-ai',
  'packages/plugin-website',
  'packages/site',
  'Dockerfile.static',
  'compose.license.yml',
];

const SELF = 'scripts/check-docs-words.mjs';
const TEXT = /\.(md|mdx|ts|mts|mjs|js|json|ya?ml|sh|astro|css|html|txt|conf|example)$/;

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter((path) => path && path !== SELF && TEXT.test(path));

const findings = [];
for (const path of files) {
  const text = readFileSync(path, 'utf8');
  for (const [names, message] of [
    [NAMES, 'a removed name'],
    [PATHS, 'a path no Manablox repository has'],
  ]) {
    for (const name of names) {
      for (let index = text.indexOf(name); index !== -1; index = text.indexOf(name, index + 1)) {
        findings.push({ where: `${path}:${lineOf(text, index)}`, found: name, message });
      }
    }
  }
  if (!path.endsWith('.md')) continue;
  for (const phrase of PHRASES) {
    for (const match of text.matchAll(phrase)) {
      findings.push({
        where: `${path}:${lineOf(text, match.index)}`,
        found: match[0],
        message: 'describe what is, not what changed',
      });
    }
  }
}

report('docs:words', findings, `${files.length} files`);
