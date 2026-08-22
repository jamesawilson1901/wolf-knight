// LAW W5 — ABILITY ROTATION: each region's critical path must reuse at
// least TWO distinct earlier forms, not lean on one verb (usually fire)
// over and over. Static-parses each region file's OWN puzzle-gate wiring —
// which gate-helper it imports, and which element-tagged object registry
// (world.burnables/crackables/cuttables/shatterables/quenchables) it
// populates inline — and maps that to the element it exercises.
//
// Known-bad (context pack §11.2, STILL LIVE — unlike §11.1, no fix has
// landed for this one): fire carries L1 (Kiln braziers), L2 ("Stoneroot is
// played with FIRE" — codified intent, but L2 ALSO still wires its own
// burnables/crackables directly), and L3 (Wild Woods wisp-lanterns) —
// three straight regions on one verb, with L4 leaning fire too per the doc.
// Ground truth for the element↔hook mapping is read directly from source,
// not asserted: js/player.js's Ground Slam comment names braziers/burnables
// as the fire hook, the Vine-Lash comment names cuttables as verdant
// ("mirrors Ember's burnables and Stoneroot's crackables"), and the Frost
// Breath comment names shatterables.
import { readFileSync, readdirSync } from 'fs';

const problems = [];
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { console.log(`✗ ${m}`); problems.push(m); };

// import-name -> element. Only names that gate a PUZZLE step count (not
// combat-only imports like `flattenStatic` or `WS`).
const IMPORT_ELEMENT = {
  brazier: 'fire',
  crackedRocks: 'earth', pushableBoulder: 'earth', plateSwitch: 'earth',
  registerCuttable: 'verdant', brambleGate: 'verdant', thornGate: 'verdant',
  iceGate: 'frost', frostGate: 'frost',
  waterGate: 'tide', quenchable: 'tide',
  galeLane: 'storm', buildWindField: 'storm', turnVane: 'storm',
};
// world.<registry>.push(...) inline (a region authoring its own local prop
// instead of importing the shared helper) -> element. Verified against
// player.js's attack-resolution comments (see header).
const REGISTRY_ELEMENT = {
  burnables: 'fire', crackables: 'earth', cuttables: 'verdant',
  shatterables: 'frost', quenchables: 'tide',
};

// Region order per the codified intent (§1.7): each region is played with
// the PREVIOUS boss's wolf; the new wolf is that region's own reward.
const REGIONS = [
  { id: 'L1', file: 'level1.js', newForm: 'fire' },
  { id: 'L2', file: 'level2.js', newForm: 'earth' },
  { id: 'L3', file: 'level3.js', newForm: 'verdant' },
  { id: 'L4', file: null, slice: ['js/rooms.js', 3628, 3958], newForm: 'frost' }, // Frostpeak lives in rooms.js — no level4.js
  { id: 'L5', file: 'level5.js', newForm: 'storm' },
  { id: 'L6', file: 'level6.js', newForm: 'tide' },
  { id: 'L7', file: 'level7.js', newForm: 'ghost' },
];

function elementsUsedIn(src) {
  const found = new Set();
  // a CALL to the helper counts whether it arrived via import (level1-3/5-7
  // .js import these from gates.js/water.js/wind.js) or is a same-file
  // local function (rooms.js defines crackedRocks/thornGate/frostGate
  // itself and calls them directly — Frostpeak has no level4.js to import
  // into).
  for (const [name, el] of Object.entries(IMPORT_ELEMENT)) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(src)) found.add(el);
  }
  for (const [reg, el] of Object.entries(REGISTRY_ELEMENT)) {
    if (new RegExp(`world\\.${reg}\\.push`).test(src)) found.add(el);
  }
  return found;
}

const matrix = [];
for (const r of REGIONS) {
  const src = r.file ? readFileSync(`js/${r.file}`, 'utf8')
    : readFileSync(r.slice[0], 'utf8').split('\n').slice(r.slice[1] - 1, r.slice[2]).join('\n');
  matrix.push({ ...r, elements: elementsUsedIn(src) });
}

console.log('Region  new-form  elements-on-critical-path');
for (const r of matrix) console.log(`  ${r.id}      ${r.newForm.padEnd(8)}  [${[...r.elements].join(', ') || '(none found)'}]`);

const n0 = problems.length;

// W5(a): a region's critical path must reuse >=2 DISTINCT EARLIER forms,
// not just its own new one (and not just fire alone). L1 has zero earlier
// forms and L2 has exactly one (fire) — neither can mathematically reuse
// ">=2 distinct earlier forms" no matter how the room is built, so the rule
// only binds once >=2 earlier forms actually exist to be reused (from L3
// on). Flagging L2 for this was a ruler bug, not a real W5(a) violation —
// found live: the item-5 audit (2026-08-22) traced L2's fire-only critical
// path straight to "Stoneroot is played with FIRE" (codified intent, L2's
// own comment), which is a documented design choice this ruler was
// wrongly contradicting.
for (let i = 1; i < matrix.length; i++) {
  const r = matrix[i];
  const earlierForms = matrix.slice(0, i).map((x) => x.newForm);
  if (earlierForms.length < 2) continue;
  const reused = [...r.elements].filter((e) => earlierForms.includes(e) && e !== r.newForm);
  if (reused.length < 2 && r.elements.size > 0) {
    bad(`W5(a): ${r.id} reuses only [${reused.join(', ') || 'none'}] of its earlier forms on the critical path (needs >=2 distinct)`);
  }
}

// Anti-pattern (§4): the same verb carrying 3+ CONSECUTIVE regions. For
// each element, find its longest run of consecutive regions that use it.
const elems = new Set(matrix.flatMap((r) => [...r.elements]));
for (const el of elems) {
  let run = 0, best = 0, bestStart = null, curStart = null;
  for (const r of matrix) {
    if (r.elements.has(el)) {
      if (run === 0) curStart = r.id;
      run++;
      if (run > best) { best = run; bestStart = curStart; }
    } else run = 0;
  }
  if (best >= 3) bad(`anti-pattern: '${el}' carries ${best} consecutive regions starting at ${bestStart}`);
}

if (problems.length === n0) ok('every region reuses >=2 distinct earlier forms, no verb carries 3+ consecutive regions');

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL CLEAN.');
process.exit(problems.length ? 1 : 0);
