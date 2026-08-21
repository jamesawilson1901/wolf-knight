// EVERY VARIANT NAME A ROOM ASKS FOR MUST EXIST.
//
// Pass 2 audit (combat context pack, 2026-08-21): every spawn site in
// js/level6.js asked for `variant: 'tide' | 'deeptide' | 'gull' | 'drowned'`
// and none of those keys existed in enemies.js's VARIANTS registry.
// applyVariant() fails silent on an unknown name (`if (!v) return e;`), so
// the whole Sunken Vale region shipped as unmodified base enemies for
// however long it went unaudited — no tint, no size, no weakness lesson,
// indistinguishable from region 1. Nothing said a word.
//
// LAW 10: a verification tool with a broken ruler is worse than no tool —
// this one is written against that exact known-bad case (see the fail-first
// note below) before being trusted against the live source.
//
// Pure text scan, no browser: room files only ever reference a variant name
// as a `variant: 'name'` string literal in a spawn-marker object.
import { readFileSync } from 'fs';
import { readdirSync } from 'fs';

const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => console.log(`✗ ${m}`);
const problems = [];

const enemiesSrc = readFileSync('js/enemies.js', 'utf8');
const block = (enemiesSrc.match(/export const VARIANTS = \{[\s\S]*?\n\};/) || [''])[0];
if (!block) {
  console.log('✗ could not find VARIANTS block in js/enemies.js — ruler is broken, stopping');
  process.exit(1);
}
// top-level keys only (2-space indent, `name:` or `'name':`) — skip nested
// object fields like a variant's own `tint:` function body.
const defined = new Set(
  [...block.matchAll(/^ {2}'?([a-zA-Z0-9_]+)'?:\s*\{/gm)].map((m) => m[1])
);

const roomFiles = readdirSync('js').filter((f) => /^level\d\.js$/.test(f) || f === 'rooms.js');
const referenced = new Map(); // name -> [{file, line}]
for (const f of roomFiles) {
  const text = readFileSync(`js/${f}`, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/variant:\s*'([a-zA-Z0-9_]+)'/g)) {
      const name = m[1];
      if (!referenced.has(name)) referenced.set(name, []);
      referenced.get(name).push(`${f}:${i + 1}`);
    }
  });
}

for (const [name, sites] of referenced) {
  if (!defined.has(name)) {
    bad(`variant '${name}' is referenced but not defined in VARIANTS (${sites.slice(0, 3).join(', ')}${sites.length > 3 ? ', ...' : ''}) — applyVariant() will silently no-op every one of these ${sites.length} spawn(s)`);
    problems.push(name);
  }
}
if (!problems.length) {
  ok(`every referenced variant name (${referenced.size}) exists in VARIANTS`);
}

// the reverse direction is a style note, not a failure: an unused variant is
// dead weight, not a silently-broken lesson.
const unused = [...defined].filter((name) => !referenced.has(name));
if (unused.length) console.log(`  · NOTE: ${unused.length} variant(s) defined but never referenced by a room: ${unused.join(', ')}`);

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL CLEAN.');
process.exit(problems.length ? 1 : 0);
