#!/usr/bin/env node
/**
 * Copy the shared API client out of the jclinic web app into src/api.
 *
 * Why a copy and not a dependency: EAS builds in the cloud and can only see files inside THIS repo,
 * so a `file:../../Clinic Management Dr JOshi/jclinic` dependency cannot work. The web app remains
 * the single source of truth; this script is the only sanctioned way the copy changes.
 *
 *   node scripts/sync-api-client.mjs           copy source -> here
 *   node scripts/sync-api-client.mjs --check   exit 1 if they differ (run this in CI)
 *
 * Point at a jclinic checkout other than the default with JCLINIC_REPO=/path/to/jclinic.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const JCLINIC = process.env.JCLINIC_REPO
  ? resolve(process.env.JCLINIC_REPO)
  : resolve(REPO, '..', 'Clinic Management Dr JOshi', 'jclinic');

/**
 * Files copied out of the jclinic web app, and where they land here.
 *
 * The destination layout MIRRORS apps/web/src/ exactly — which is why datetime.ts keeps its `lib/`
 * folder. That is deliberate, not incidental: these files import each other by relative path
 * (due-test-ui.ts does `from './api'` and `from './lib/datetime'`), so flattening them would break
 * resolution and force this script to rewrite imports. A transformed copy cannot be byte-compared
 * against its source, which would cost the --check drift guard — the one thing keeping the two
 * sides honest.
 */
const FILES = [
  ['apps/web/src/api.ts', 'src/api/api.ts'],
  ['apps/web/src/encounter-gaps.ts', 'src/api/encounter-gaps.ts'],
  ['apps/web/src/amendments.ts', 'src/api/amendments.ts'],
  ['apps/web/src/clinical-forms.ts', 'src/api/clinical-forms.ts'],
  ['apps/web/src/due-test-ui.ts', 'src/api/due-test-ui.ts'],
  ['apps/web/src/dial-help.ts', 'src/api/dial-help.ts'],
  ['apps/web/src/lib/datetime.ts', 'src/api/lib/datetime.ts'],
];

/**
 * A browser global in a synced file means it is not portable and must not be copied. This is the
 * guard that stops someone quietly reintroducing a browser dependency into the shared layer via the
 * web app — the failure would otherwise surface as a red screen on a device, days later.
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

const isComment = (t) => t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
const stripComment = (line) => line.replace(/\/\/.*$/, '');
const rel = (full) => relative(REPO, full).split('\\').join('/');

function lintPortable(relSrc, text) {
  const bad = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (isComment(t)) return; // comments may mention them
    for (const { re, what } of BANNED) {
      if (re.test(stripComment(line))) bad.push(`    ${relSrc}:${i + 1}  ${what}  —  ${t}`);
    }
  });
  return bad;
}

/**
 * Hand-written code must not use `any`.
 *
 * This is not style policing. Four screens shipped reading fields that do not exist —
 * `bill.outstanding`, `visit.visitAt`, `message.fromStaff`, and an appointments *object* iterated as
 * an array — and every one of them typechecked, because an `as any` cast had switched TypeScript off
 * at exactly the point it was about to help. The synced client carries 246 accurate interfaces; the
 * only way to get those wrong is to opt out of them.
 *
 * src/api/ is exempt: it is generated from the web app and is not ours to change here.
 */
const ANY_RE = /\bas any\b|:\s*any\b|<any>/;

/**
 * Escape hatch, for the handful of places where `any` is honest: a platform boundary whose types we
 * do not own. Put `// any-ok: <reason>` on the line before. Requiring a stated reason is the point —
 * it keeps the rule strict while making a deliberate exception cheap and a lazy one visible.
 */
const ANY_OK = /^\/\/\s*any-ok:\s*\S/;

function scanForAny(dir, hits = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.expo'].includes(entry.name)) continue;
      scanForAny(full, hits);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (rel(full).startsWith('src/api/')) continue;
    const lines = readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (isComment(t)) return;
      if (!ANY_RE.test(stripComment(line))) return;
      // Look back past a continued expression to find the pragma.
      for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
        const prev = lines[j].trim();
        if (ANY_OK.test(prev)) return;
        if (prev && !isComment(prev)) break;
      }
      hits.push(`    ${rel(full)}:${i + 1}  ${t}`);
    });
  }
  return hits;
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

  const bad = lintPortable(relSrc, body);
  if (bad.length) {
    problems.push(`  ${relSrc} is not portable — browser globals in code:\n${bad.join('\n')}`);
    continue;
  }

  const next = BANNER(relSrc) + body;
  const current = existsSync(destPath) ? readFileSync(destPath, 'utf8') : null;
  if (current === next) continue;

  if (check) {
    problems.push(`  ${relDest} is ${current === null ? 'missing' : 'out of date'} (source: ${relSrc})`);
    continue;
  }

  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, next);
  changed.push(`  ${relSrc}  ->  ${relDest}`);
}

// Only in --check mode. Copying the client and linting our own screens are separate jobs, and a
// stray `any` must not stop a sync — otherwise fixing the `any` needs a sync that the `any` blocks.
if (check) {
  const anyHits = [];
  for (const dir of ['app', 'src']) {
    const target = join(REPO, dir);
    if (existsSync(target)) scanForAny(target, anyHits);
  }
  if (anyHits.length) {
    problems.push(
      `  \`any\` in hand-written code — use the real types from src/api,\n` +
        `  or mark a genuine platform boundary with \`// any-ok: <reason>\`:\n${anyHits.join('\n')}`,
    );
  }
}

if (problems.length) {
  console.error(check ? 'checks failed:' : 'sync failed:');
  console.error(problems.join('\n'));
  if (check) console.error('\nIf the client is out of date, run: node scripts/sync-api-client.mjs');
  process.exit(1);
}

console.log(
  check
    ? `in sync (${FILES.length} files), and no \`any\` in hand-written code.`
    : changed.length
      ? `synced:\n${changed.join('\n')}`
      : `already in sync (${FILES.length} files).`,
);
