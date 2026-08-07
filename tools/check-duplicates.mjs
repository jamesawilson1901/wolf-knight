#!/usr/bin/env node
// Byte-identical assets ship twice and every kid's phone downloads both.
//
// v3.21.2 found 6.6 MB of this: two music tracks and two sound effects, each
// vendored under two names. The music alone was ~11% of the game's download.
// Nobody noticed because both copies worked perfectly.
//
// The fix for a duplicate is almost never "delete one and hope" — it is to
// point the second NAME at the first FILE (see MUSIC_FILES / SFX_FILES in
// js/audio.js), so the game keeps its vocabulary and the wire carries one copy.
//
// Usage: node tools/check-duplicates.mjs
import { readdirSync, statSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, relative, sep } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SCAN = ['assets', 'vendor'];
const EXT = /\.(ogg|mp3|wav|glb|gltf|bin|png|jpg|jpeg|json)$/i;

// Duplicates that CANNOT be removed, with the reason. A glTF file resolves its
// texture relative to its own folder ("uri":"Textures/colormap.png"), so two
// model folders sharing one Kenney atlas genuinely need a copy each — the only
// alternative is rewriting the binaries, which is not worth 7 KB.
const ALLOWED = [
  {
    files: ['assets/env/den-survival/Textures/colormap.png', 'assets/loot/survival/Textures/colormap.png'],
    why: 'glTF resolves textures relative to its own folder; both model sets need a local copy',
  },
];

const byHash = new Map();
for (const dir of SCAN) {
  (function walk(d) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!EXT.test(e.name)) continue;
      const hash = createHash('md5').update(readFileSync(p)).digest('hex');
      if (!byHash.has(hash)) byHash.set(hash, { size: statSync(p).size, files: [] });
      byHash.get(hash).files.push(relative(ROOT, p).split(sep).join('/'));
    }
  })(join(ROOT, dir));
}

const allowedKey = (files) => files.slice().sort().join('|');
const allowedSet = new Set(ALLOWED.map((a) => allowedKey(a.files)));

const dupes = [...byHash.values()].filter((g) => g.files.length > 1);
const flagged = dupes.filter((g) => !allowedSet.has(allowedKey(g.files)));
const excused = dupes.filter((g) => allowedSet.has(allowedKey(g.files)));

let wasted = 0;
for (const g of flagged) wasted += g.size * (g.files.length - 1);

if (excused.length) {
  console.log(`\n  ${excused.length} known-unavoidable duplicate(s):`);
  for (const g of excused) {
    const why = ALLOWED.find((a) => allowedKey(a.files) === allowedKey(g.files)).why;
    console.log(`    · ${g.files.join('  =  ')}\n      ${why}`);
  }
}

if (flagged.length) {
  console.log(`\n  ${flagged.length} DUPLICATE GROUP(S) — ${(wasted / 1024 / 1024).toFixed(2)} MB shipped twice:`);
  for (const g of flagged.sort((a, b) => b.size - a.size)) {
    console.log(`    ✗ ${(g.size / 1024).toFixed(0)} KB each`);
    for (const f of g.files) console.log(`        ${f}`);
  }
  console.log('\n  Fix: keep ONE file, and alias the other name to it in the map that');
  console.log('  names it (js/audio.js SFX_FILES / MUSIC_FILES, or the room kit loader).');
  console.log('  Then remove the deleted path from sw.js PRECACHE — a precache entry');
  console.log('  pointing at a missing file makes cache.addAll reject and kills offline.\n');
} else {
  console.log('\n  OK — no avoidable duplicate assets.\n');
}
process.exit(flagged.length ? 1 : 0);
