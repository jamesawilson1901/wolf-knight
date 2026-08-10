#!/usr/bin/env node
// THE REPO IS THE ONLY RECORD.
//
// An overnight session is told the repo is the only record of what happened,
// and for nine versions it was not: BUILDLOG's newest entry was v3.34.0 while
// sw.js said the build was v3.43.1. The dressing pass, the seam, the Den
// rebuild, the mini games, Stormreach, the Sunken Vale, the Shadow Court and
// the ending all shipped with nothing written down. Nobody noticed, because
// nothing was looking.
//
// This is what looks. Every version CACHE_NAME has ever carried is a version
// that shipped, and a version that shipped wants an entry. It is git plus two
// regexes — no browser, no server, milliseconds — so it runs first in
// verify-all.sh.
//
// It deliberately does NOT judge what an entry says. A verifier cannot tell
// you a log entry is honest; it can tell you one exists, which is the failure
// that actually happened.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_RE = /const CACHE_NAME = '[a-z]+-v([0-9]+\.[0-9]+(?:\.[0-9]+)?)'/;
// BUILDLOG headers are `## v3.41.1 — title` and, in the older phases,
// `## v2.2.6 — title`. Two- and three-part numbers both appear.
const HEADER_RE = /^##\s+v([0-9]+\.[0-9]+(?:\.[0-9]+)?)\b/gm;

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const fail = [];
const note = [];

const swVersion = (readFileSync(join(ROOT, 'sw.js'), 'utf8').match(VERSION_RE) || [])[1];
if (!swVersion) {
  console.error('✗ sw.js has no CACHE_NAME this script can read');
  process.exit(1);
}

const log = readFileSync(join(ROOT, 'BUILDLOG.md'), 'utf8');
const logged = new Set(Array.from(log.matchAll(HEADER_RE), (m) => m[1]));

// 1. The build you are standing on must be written down.
if (!logged.has(swVersion)) fail.push(`${swVersion} — the version sw.js is serving RIGHT NOW`);

// 2. Every version the service worker has ever carried shipped to somebody.
//    Shallow clones and exported trees have no history; that is a skip, not a
//    failure, because the check above still holds without git.
let shipped = [];
try {
  const commits = git('log', '--format=%H', '--', 'sw.js').trim().split('\n').filter(Boolean);
  const seen = new Set();
  for (const c of commits) {
    let body;
    try { body = git('show', `${c}:sw.js`); } catch { continue; }
    const v = (body.match(VERSION_RE) || [])[1];
    if (v && !seen.has(v)) { seen.add(v); shipped.push({ v, commit: c.slice(0, 7) }); }
  }
  for (const { v, commit } of shipped) {
    if (!logged.has(v) && v !== swVersion) fail.push(`${v} — shipped in ${commit}, no entry`);
  }
} catch {
  note.push('git history unavailable — only the current version was checked');
}

console.log(`sw.js at v${swVersion}; BUILDLOG holds ${logged.size} version entries; ` +
            `${shipped.length} versions found in sw.js history`);
for (const n of note) console.log(`  note: ${n}`);

if (fail.length) {
  console.error(`\n✗ ${fail.length} shipped version(s) with no BUILDLOG entry:`);
  for (const f of fail) console.error(`    v${f}`);
  console.error('\nWrite the entry. The repo is the only record.');
  process.exit(1);
}

console.log('\nALL CLEAN — every shipped version has a BUILDLOG entry');
