// check-buildlog — every SHIPPED version has an entry in BUILDLOG.md.
//
// The overnight process is told "the repo is the only record", and for thirteen
// versions it was not: BUILDLOG jumped v3.24.0 -> v3.27.0 and v3.34.0 -> v3.41.1
// while sw.js had walked all the way to v3.43.1. Stormreach, the Sunken Vale,
// the Shadow Court, the Tide Wolf, the mini-game harness, the ground painter and
// the Den rebuild all shipped with nothing written down here, and nobody noticed
// because every other verifier measures the GAME. This one measures the RECORD.
//
// The shipped list comes from sw.js's CACHE_NAME across git history, because
// that constant is the one thing a deploy is required by law to bump — so it is
// the closest thing this repo has to a release ledger.
//
// Needs no browser and no static server: it is git and one file read.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

// Versions ship in commits that touch sw.js, by definition — CACHE_NAME cannot
// change anywhere else. Reverse order so first-appearance order is ship order.
const commits = git('log', '--format=%H', '--', 'sw.js').trim().split('\n').reverse();

const shipped = [];
const firstSeen = new Map();
for (const c of commits) {
  let sw;
  try { sw = git('show', `${c}:sw.js`); } catch { continue; }   // sw.js not born yet
  const m = sw.match(/CACHE_NAME\s*=\s*'wolfknight-(v[\d.]+)'/);
  if (!m || firstSeen.has(m[1])) continue;
  firstSeen.set(m[1], c);
  shipped.push(m[1]);
}

const logged = new Set(
  (readFileSync(join(ROOT, 'BUILDLOG.md'), 'utf8').match(/^## (v[\d.]+)/gm) || [])
    .map((h) => h.slice(3))
);

const missing = shipped.filter((v) => !logged.has(v));

console.log(`shipped versions (sw.js CACHE_NAME across history): ${shipped.length}`);
console.log(`BUILDLOG.md entries matching a shipped version:     ${shipped.length - missing.length}`);

if (missing.length) {
  console.log(`\nSHIPPED WITH NO BUILDLOG ENTRY — ${missing.length}:`);
  for (const v of missing) {
    const c = firstSeen.get(v);
    const subject = git('log', '-1', '--format=%ad  %s', '--date=short', c).trim();
    console.log(`  ${v.padEnd(9)} ${c.slice(0, 7)}  ${subject}`);
  }
  console.log('\nWrite the entry from `git log` before the history is lost.');
  process.exit(1);
}

console.log('\nALL CLEAN — every shipped version is written down.');
