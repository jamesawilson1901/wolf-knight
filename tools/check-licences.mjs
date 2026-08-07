#!/usr/bin/env node
// Licence coverage check for every vendored asset.
//
// The v3.20 asset audit found packs shipping in the build whose CC0 status was
// asserted in CREDITS.md but backed by nothing on disk. This turns that into a
// machine check so it cannot silently happen again:
//
//   * every directory under assets/ must be CLAIMED by an entry in
//     assets/LICENSES/MANIFEST.json  → an unclaimed directory FAILS the run
//   * every claimed pack should have its own licence FILE in assets/LICENSES/
//     → a pack with licence:null is reported as PENDING, loudly, but does not
//       fail: the pending list is the honest state of the world, not a bug
//   * every licence file named in the manifest must actually exist and must
//     actually contain a licence grant → a missing or empty one FAILS
//
// Usage:  node tools/check-licences.mjs [--strict]
//   --strict also fails on PENDING packs (use before a commercial release).
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const LIC_DIR = join(ROOT, 'assets', 'LICENSES');
const STRICT = process.argv.includes('--strict');

const manifest = JSON.parse(readFileSync(join(LIC_DIR, 'MANIFEST.json'), 'utf8'));
const fail = [];
const pending = [];

// ---- 1. every licence file the manifest names must exist and say something
for (const p of manifest.packs) {
  const files = [p.licence, ...(p.alsoLicence || [])].filter((f) => f && f !== 'SELF');
  for (const f of files) {
    const path = join(LIC_DIR, f);
    if (!existsSync(path)) { fail.push(`${p.pack}: licence file missing — assets/LICENSES/${f}`); continue; }
    const text = readFileSync(path, 'utf8');
    if (!/licen[cs]e/i.test(text) || text.trim().length < 40) {
      fail.push(`${p.pack}: assets/LICENSES/${f} does not read like a licence`);
    }
  }
  if (p.licence === null) pending.push(p);
}

// ---- 2. every directory under assets/ must be claimed by some pack
const claims = manifest.packs.flatMap((p) => (p.covers || []).map((c) => ({ c, pack: p.pack })));
const claimed = (relPath) => claims.find(({ c }) => relPath === c || relPath.startsWith(c + '/'));

const dirs = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) { dirs.push(abs); walk(abs); }
  }
})(join(ROOT, 'assets'));

const unclaimed = new Set();
for (const abs of dirs) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  if (rel === 'assets/LICENSES') continue;
  if (rel.endsWith('/Textures')) continue;           // shared atlas, rides its pack
  // a directory counts as covered if it, an ancestor, or any file in it is claimed
  if (claimed(rel)) continue;
  const files = readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => `${rel}/${e.name}`);
  if (files.length && files.every((f) => claimed(f))) continue;
  const orphans = files.filter((f) => !claimed(f));
  if (orphans.length) unclaimed.add(`${rel}  (${orphans.length} unclaimed file(s), e.g. ${orphans[0].split('/').pop()})`);
}
for (const u of unclaimed) fail.push(`unclaimed by MANIFEST.json: ${u}`);

// ---- report
const cleared = manifest.packs.filter((p) => p.licence && p.licence !== 'SELF');
console.log(`\n  ${cleared.length} pack(s) cleared by a licence file on disk:`);
for (const p of cleared) console.log(`    ✓ ${p.pack}`);

if (pending.length) {
  console.log(`\n  ${pending.length} pack(s) PENDING — shipping, but no licence file on disk:`);
  for (const p of pending) {
    console.log(`    ⚠ ${p.pack}`);
    console.log(`        covers : ${(p.covers || []).join(', ')}`);
    console.log(`        get it : ${p.source}`);
  }
}

if (fail.length) {
  console.log(`\n  ${fail.length} FAILURE(S):`);
  for (const f of fail) console.log(`    ✗ ${f}`);
}

const bad = fail.length || (STRICT && pending.length);
console.log(bad
  ? `\n  FAIL${STRICT && pending.length && !fail.length ? ' (strict: pending packs are not acceptable for release)' : ''}\n`
  : `\n  OK — every asset directory is accounted for.${pending.length ? ` ${pending.length} pack(s) still pending a licence file.` : ''}\n`);
process.exit(bad ? 1 : 0);
