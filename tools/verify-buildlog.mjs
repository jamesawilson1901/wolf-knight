#!/usr/bin/env node
// EVERY SHIPPED VERSION HAS AN ENTRY IN BUILDLOG.md.
//
// The overnight process is told the repo is the only record. For seven versions
// it was not: v3.35.0 through v3.41.0 shipped — the button budget, the painted
// floor, 52 dressed rooms, the seam, the Den rebuild, the mini game harness,
// Stormreach and the Sunken Vale — with no BUILDLOG entry between them, and
// nobody noticed until a session went looking for history that was not there.
// Reconstructing them from git took a whole run; nine months later it would
// have taken longer and been worth less.
//
// The version a build shipped as is not a matter of opinion: sw.js's CACHE_NAME
// is bumped on every deploy (GAME-CONTRACT, engineering law), so git's record of
// that constant IS the release list. This walks it and asks BUILDLOG for a
// heading per version.
//
// It does not check that an entry is any GOOD — nothing can. It checks that one
// exists, which is the failure that actually happened.
//
// Usage: node tools/verify-buildlog.mjs
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// VERSIONS THAT SHIPPED BEFORE THE LOG COVERED THEM, with the reason. Same
// pattern as check-duplicates.mjs's ALLOWED list: a known gap recorded in the
// tool beats a tool that fails on every run and stops being read.
//
// These four are the A1/A7, A2a-c, A3/A5 and A4 sessions. Their record is not
// lost — design/FIX-PLAN.md carries a full write-up of each under its item
// letter, including what was measured — it is just not in BUILDLOG. Queued for
// a reconstruction pass of its own; delete the entry here when one lands.
const KNOWN_GAPS = {
  '3.25.0': 'A1 + A7 — written up in design/FIX-PLAN.md under A1 and A7',
  '3.25.1': 'A2a / A3 / A5 — written up in design/FIX-PLAN.md under those items',
  '3.26.0': 'A2b + A2c — written up in design/FIX-PLAN.md under A2',
  '3.26.1': 'A4 — written up in design/FIX-PLAN.md under A4',
};

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

// "## v3.0" is the entry for the build that shipped as wolfknight-v3.0.0. A
// heading that drops a trailing zero is a style, not a missing entry, so both
// sides are compared as a three-part number.
const norm = (v) => {
  const p = v.split('.').map(Number);
  while (p.length < 3) p.push(0);
  return p.slice(0, 3).join('.');
};

// Every value CACHE_NAME has ever held, in the order the commits landed.
const shipped = new Map(); // version -> first commit that carried it
let commits;
try {
  commits = git(['log', '--all', '--reverse', '--pretty=format:%H', '--', 'sw.js']).split('\n').filter(Boolean);
} catch (e) {
  console.log('\n  SKIPPED — no git history available here.\n');
  process.exit(0);
}
for (const c of commits) {
  let src;
  try { src = git(['show', `${c}:sw.js`]); } catch { continue; }
  const m = src.match(/CACHE_NAME\s*=\s*'wolfknight-v([0-9]+(?:\.[0-9]+)*)'/);
  if (m && !shipped.has(norm(m[1]))) shipped.set(norm(m[1]), c.slice(0, 7));
}

// Every version BUILDLOG says it has an entry for.
const log = readFileSync(`${ROOT}/BUILDLOG.md`, 'utf8');
const logged = new Set();
for (const m of log.matchAll(/^##\s+v([0-9]+(?:\.[0-9]+)*)/gm)) logged.add(norm(m[1]));

const missing = [];
const excused = [];
for (const [v, sha] of shipped) {
  if (logged.has(v)) continue;
  (KNOWN_GAPS[v] ? excused : missing).push({ v, sha });
}

const cmp = (a, b) => a.v.localeCompare(b.v, undefined, { numeric: true });
missing.sort(cmp);
excused.sort(cmp);

console.log(`\n  ${shipped.size} versions shipped (git, sw.js CACHE_NAME) · ${logged.size} versions logged (BUILDLOG headings)`);

if (excused.length) {
  console.log(`\n  ${excused.length} known gap(s), recorded rather than erased:`);
  for (const { v, sha } of excused) console.log(`    · v${v} (${sha}) — ${KNOWN_GAPS[v]}`);
}

if (missing.length) {
  console.log(`\n  ${missing.length} SHIPPED VERSION(S) WITH NO BUILDLOG ENTRY:`);
  for (const { v, sha } of missing) console.log(`    ✗ v${v}  first seen in ${sha}`);
  console.log('\n  Write the entry from the commits that carried the version:');
  console.log('    git log --reverse --pretty=format:"%h %ad%n%s%n%n%b" --date=short <prev>..<this>');
  console.log('  A heading of the form "## vX.Y.Z — <what changed> (<date>)" satisfies this.\n');
  process.exit(1);
}

console.log('\n  ALL CLEAN — every shipped version has a BUILDLOG entry.\n');
