#!/usr/bin/env node
// THE REPO IS THE ONLY RECORD, so the record falling behind the build is a bug.
//
// v3.41.1 found BUILDLOG's newest entry at v3.34.0 while sw.js said the build
// was v3.43.0: Stormreach, the Sunken Vale, the Tide Wolf, the mini game
// harness, the Den rebuild and the Shadow Court had all shipped with no entry
// here. Every verifier in tools/ was green throughout, because not one of them
// reads a document. An overnight session is told the repo is the only record,
// and for nine versions it was not.
//
// The hard assertion is deliberately narrow: BUILDLOG's newest version heading
// must be at least the version sw.js is serving. That is the one that catches
// the log falling behind while work carries on, which is how the hole happened.
//
// Interior gaps — a version that shipped, got its cache bump, and never got an
// entry — are REPORTED and do not fail. They are history rather than drift, and
// failing on them would mean the check could never be green until every old
// hole was filled by hand.
//
// Usage: node tools/check-buildlog.mjs
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

const cmp = (a, b) => {
  const A = a.split('.').map(Number), B = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  return 0;
};

// What the build says it is.
const swm = read('sw.js').match(/CACHE_NAME\s*=\s*'wolfknight-v([\d.]+)'/);
if (!swm) {
  console.log('\n  ✗ could not read CACHE_NAME out of sw.js\n');
  process.exit(1);
}
const shipping = swm[1];

// What the log says it is.
const logged = [...read('BUILDLOG.md').matchAll(/^## v([\d.]+)/gm)].map((m) => m[1]);
if (!logged.length) {
  console.log('\n  ✗ BUILDLOG.md has no "## vX.Y.Z" version headings at all\n');
  process.exit(1);
}
const newest = logged.slice().sort(cmp).pop();

console.log(`\n  sw.js serves       v${shipping}`);
console.log(`  BUILDLOG newest    v${newest}   (${logged.length} entries)`);

// Every version the service worker has ever been bumped to, from git. This is
// the only place that knows a version shipped at all — nothing else in the repo
// keeps a history. Best-effort: outside a git checkout the head check still runs.
let shipped = [];
try {
  const out = execSync("git log -p -U0 --format='@ %ad' --date=short -- sw.js", {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  let date = '';
  const seen = new Map();
  for (const line of out.split('\n')) {
    if (line.startsWith('@ ')) { date = line.slice(2).trim(); continue; }
    const m = line.match(/^\+.*CACHE_NAME\s*=\s*'wolfknight-v([\d.]+)'/);
    if (m && !seen.has(m[1])) seen.set(m[1], date);
  }
  shipped = [...seen.entries()].map(([v, d]) => ({ v, d })).sort((a, b) => cmp(a.v, b.v));
} catch {
  console.log('  (no git history available — head check only)');
}

const holes = shipped.filter((s) => !logged.includes(s.v) && cmp(s.v, newest) <= 0);
if (holes.length) {
  console.log(`\n  ${holes.length} shipped version(s) with no BUILDLOG entry — history, not drift:`);
  for (const h of holes) console.log(`    · v${h.v}  (bumped ${h.d})`);
  console.log('    Reconstruct from `git log` before the commits scroll out of reach.');
}

if (cmp(newest, shipping) < 0) {
  console.log(`\n  ✗ THE LOG IS BEHIND THE BUILD: BUILDLOG stops at v${newest}, sw.js serves v${shipping}.`);
  console.log('    Everything between them shipped unrecorded. Append the entries — the');
  console.log('    commit bodies in `git log` are the primary source; this file is not.\n');
  process.exit(1);
}

console.log('\n  ALL CLEAN — the log covers the shipping build.\n');
