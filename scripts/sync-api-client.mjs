#!/usr/bin/env node
/**
 * Copy the shared API client out of the jclinic web app into packages/api-client.
 *
 * Why a copy and not a dependency: EAS builds in the cloud and can only see files inside THIS
 * repo, so a `file:../../Clinic Management Dr JOshi/jclinic` dependency cannot work. The web app
 * remains the single source of truth; this script is the only sanctioned way the copy changes.
 *
 *   node scripts/sync-api-client.mjs           copy source -> here
 *   node scripts/sync-api-client.mjs --check    exit 1 if they differ (run this in CI)
 *
 * Point at a jclinic checkout other than the default with JCLINIC_REPO=/path/to/jclinic.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const JCLINIC = process.env.JCLINIC_REPO
  ? resolve(process.env.JCLINIC_REPO)
  : resolve(REPO, '..', 'Clinic Management Dr JOshi', 'jclinic');

/**
 * Files copied out of the jclinic web app, and where they land here.
 *
 * The destination layout MIRRORS apps/web/src/ exactly. That is deliberate, not incidental:
 * these files import each other by relative path (due-test-ui.ts does `from './api'` and
 * `from './lib/datetime'`), so flattening them would break resolution and force this script to
 * rewrite imports. A transformed copy cannot be byte-compared against its source, which would
 * cost us the --check drift guard — the one thing keeping the two sides honest.
 *
 * Every file listed must be free of browser globals; BANNED below enforces it.
 */
const FILES = [
  ['apps/web/src/api.ts', 'packages/api-client/src/api.ts'],
  ['apps/web/src/encounter-gaps.ts', 'packages/api-client/src/encounter-gaps.ts'],
  ['apps/web/src/amendments.ts', 'packages/api-client/src/amendments.ts'],
  ['apps/web/src/clinical-forms.ts', 'packages/api-client/src/clinical-forms.ts'],
  ['apps/web/src/due-test-ui.ts', 'packages/api-client/src/due-test-ui.ts'],
  ['apps/web/src/dial-help.ts', 'packages/api-client/src/dial-help.ts'],
  ['apps/web/src/lib/datetime.ts', 'packages/api-client/src/lib/datetime.ts'],
];

/**
 * Anything here means the file is not portable and must not be copied. This is the guard that
 * stops someone quietly reintroducing a browser dependency into the shared layer via the web app
 * — the failure would otherwise surface as a red screen on a device, days later.
 */
const BANNED = [
  { re: /\blocalStorage\s*\./, what: 'localStorage' },
  { re: /\bsessionStorage\s*\./, what: 'sessionStorage' },
  { re: /\bdocument\s*\./, what: 'document' },
  { re: /(^|[^.\w])location\s*\./, what: 'location' },
  { re: /\bwindow\s*\./, what: 'window' },
  { re: /\bURL\.(createObjectURL|revokeObjectURL)\b/, what: 'URL.createObjectURL/revokeObjectURL' },
  { re: /\bnavigator\s*\./, what: 'navigator' },
];

const BANNER = (from) =>
  `// GENERATED — DO NOT EDIT.\n` +
  `// Copied verbatim from the JClinic web app: ${from}\n` +
  `// Edit it THERE, then run: node scripts/sync-api-client.mjs\n` +
  `// CI runs this with --check, so an edit made here alone will fail the build.\n\n`;

function lint(relSrc, text) {
  const bad = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return; // comments may mention them
    const code = line.replace(/\/\/.*$/, '');
    for (const { re, what } of BANNED) if (re.test(code)) bad.push(`    ${relSrc}:${i + 1}  ${what}  —  ${t}`);
  });
  return bad;
}

const check = process.argv.includes('--check');
const problems = [];
const changed = [];

if (!existsSync(JCLINIC)) {
  console.error(`jclinic checkout not found at:\n  ${JCLINIC}\nSet JCLINIC_REPO to override.`);
  process.exit(2);
}

for (const [relSrc, relDest] of FILES) {
  const srcPath = join(JCLINIC, relSrc);
  const destPath = join(REPO, relDest);

  if (!existsSync(srcPath)) {
    problems.push(`  missing source: ${relSrc}`);
    continue;
  }

  const body = readFileSync(srcPath, 'utf8');

  const bad = lint(relSrc, body);
  if (bad.length) {
    problems.push(`  ${relSrc} is not portable — browser globals in code:\n${bad.join('\n')}`);
    continue;
  }

  const next = BANNER(relSrc) + body;
  const current = existsSync(destPath) ? readFileSync(destPath, 'utf8') : null;

  if (current === next) continue;

  if (check) {
    const reason = current === null ? 'missing' : 'out of date';
    problems.push(`  ${relDest} is ${reason} (source: ${relSrc})`);
    continue;
  }

  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, next);
  changed.push(`  ${relSrc}  ->  ${relDest}`);
}

if (problems.length) {
  console.error(check ? 'api-client is out of sync with the web app:' : 'sync failed:');
  console.error(problems.join('\n'));
  if (check) console.error('\nRun: node scripts/sync-api-client.mjs');
  process.exit(1);
}

if (check) {
  console.log(`api-client is in sync (${FILES.length} files).`);
} else if (changed.length) {
  console.log('synced:');
  console.log(changed.join('\n'));
} else {
  console.log(`already in sync (${FILES.length} files).`);
}
