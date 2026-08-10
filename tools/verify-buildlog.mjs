#!/usr/bin/env node
// EVERY SHIPPED VERSION HAS AN ENTRY. The overnight process is told the repo is
// the only record; for nine versions it was not. v3.35.0 through v3.43.0 shipped
// — the ground painter, the whole dressing pass, the seam, the Den rebuild, the
// mini-game harness, Stormreach, the Sunken Vale, the Shadow Court and the
// ending — and BUILDLOG.md jumped straight from v3.34.0 to v3.41.1.
//
// Nothing caught it because nothing was looking. A missing log entry breaks no
// test, renders no wrong pixel and boots fine; it is only ever noticed by the
// next session, which by then has lost the reasoning it needed.
//
// The ruler: sw.js CACHE_NAME is bumped on every deploy (GAME-CONTRACT, "SW
// cache bump every deploy"), so the set of values that constant has ever held IS
// the set of versions that shipped. Walk it through git history and require a
// `## vX.Y.Z` heading in BUILDLOG.md for each.
//
// Usage: node tools/verify-buildlog.mjs
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

// BUILDLOG's early history is phase-based ("## Phase 0 — Scaffold"), and the
// versioned headings only begin once the game had versions to bump. The floor is
// the first version that carries a `## v` heading of its own, so this checks the
// era the file actually uses that vocabulary for and cannot be gamed by deleting
// old entries: it is derived from the log, not hard-coded to a number.
const FLOOR = 'v2.0.0';

const cmp = (a, b) => {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

// Every commit that ever touched sw.js, oldest first, and the version it left
// the constant at. --all so a version that shipped on a branch still counts.
const shas = git('log', '--all', '--reverse', '--format=%H', '--', 'sw.js').trim().split('\n').filter(Boolean);

const versions = new Map(); // version -> { first: sha, commits: n }
for (const sha of shas) {
  let src;
  try { src = git('show', `${sha}:sw.js`); } catch { continue; }
  const m = src.match(/CACHE_NAME\s*=\s*'wolfknight-(v[\d.]+)'/);
  if (!m) continue;
  const v = m[1];
  if (cmp(v, FLOOR) < 0) continue;
  if (!versions.has(v)) versions.set(v, { first: sha.slice(0, 7), commits: 0 });
}

// How much work each version carries, so a missing entry can be reported with
// the size of the hole rather than just its name. Counted between the commit
// that bumped to it and the commit that bumped past it, on the main line.
const line = git('log', '--reverse', '--format=%H', '--no-merges', 'HEAD').trim().split('\n').filter(Boolean);
let cur = null;
const swAt = new Map();
for (const sha of line) {
  let src;
  try { src = git('show', `${sha}:sw.js`); } catch { src = ''; }
  const m = src.match(/CACHE_NAME\s*=\s*'wolfknight-(v[\d.]+)'/);
  if (m) cur = m[1];
  swAt.set(sha, cur);
  if (cur && versions.has(cur)) versions.get(cur).commits++;
}

const log = readFileSync(`${ROOT}/BUILDLOG.md`, 'utf8');
const headed = new Set([...log.matchAll(/^##\s+(v[\d.]+)/gm)].map((m) => m[1]));

const known = [...versions.keys()].sort(cmp);
const missing = known.filter((v) => !headed.has(v));

console.log(`\n  ${known.length} shipped version(s) at or above ${FLOOR}, ${headed.size} logged.`);

if (missing.length) {
  console.log(`\n  ${missing.length} SHIPPED VERSION(S) WITH NO BUILDLOG ENTRY:`);
  for (const v of missing) {
    const info = versions.get(v);
    console.log(`    ✗ ${v.padEnd(9)} first at ${info.first}, ${info.commits} commit(s) under it`);
  }
  console.log('\n  Fix: append a `## <version> — <one line>` entry per version, in the');
  console.log('  existing style, reconstructed from `git log` for that range. The commit');
  console.log('  messages carry the reasoning; the log is where the next session looks.\n');
  process.exit(1);
}

console.log('\n  ALL CLEAN — every shipped version has a BUILDLOG entry.\n');
