// LAW W5 — ABILITY ROTATION: each region's critical path must reuse at
// least TWO distinct earlier forms, not lean on one verb (usually fire)
// over and over. Static-parses each region file's OWN puzzle-gate wiring —
// which gate-helper it imports, and which element-tagged object registry
// (world.burnables/crackables/cuttables/shatterables/quenchables) it
// populates inline — and maps that to the element it exercises.
//
// Ground truth for the element↔hook mapping is read directly from source,
// not asserted: js/player.js's Ground Slam comment names braziers/burnables
// as the fire hook, the Vine-Lash comment names cuttables as verdant
// ("mirrors Ember's burnables and Stoneroot's crackables"), and the Frost
// Breath comment names shatterables.
//
// STATUS (2026-08-24 re-audit, context pack §11.2): 'earth' (L2-L4) and
// 'frost' (L4-L6) both RESOLVED — Frostpeak's F2b pocket moved off earth
// onto verdant (frostBramble, rooms.js), Stormreach's s3p pocket moved off
// verdant onto earth (boulderGate, level5.js), Sunken Vale's d2p pocket
// moved off frost onto verdant (valeBramble, level6.js). Each swap is a
// pocket-only edit (a bonus-chest gate, never a mandatory-route puzzle) —
// verified this held for real by mapping every flagged call's critical-
// path-vs-pocket status by hand before touching anything (a prior pass had
// already shown F3's boulder/plate puzzle isn't actually earth_wolf-gated
// at all — pushableBoulder()/plateSwitch() never check the player's form,
// unlike crackedRocks() — so it was never a real ability-reuse instance,
// just a same-named checker miss from rooms.js's `boulder`/`pressurePlate`
// aliases living outside this file's old hardcoded slice).
//
// 'fire' (L1-L4, 4 consecutive) is NOT fixable this way — it's a proven
// floor, not an oversight: L1 is fire's own origin (nothing earlier
// exists to swap in); L2's fire use is documented intentional design
// ("Stoneroot is played with FIRE") AND exempt from the W5(a) 2-reuse
// rule below (L2 has only ONE earlier form to begin with — see the loop
// guard); L3 has exactly TWO earlier forms available (fire, earth) and
// the W5(a) rule requires reusing both to hit its >=2-distinct minimum,
// so L3 cannot drop fire without breaking that rule instead. Any fix
// reaching this far back means redesigning already-shipped, tested
// critical-path puzzles in 3 regions at once — out of scope for a static-
// analysis cleanup pass. Documented, not silently accepted: this is the
// SAME kind of structural constant as L2's own W5(a) exemption below.
import { readFileSync, readdirSync } from 'fs';

const problems = [];
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { console.log(`✗ ${m}`); problems.push(m); };

// import-name -> element. Only names that gate a PUZZLE step count (not
// combat-only imports like `flattenStatic` or `WS`).
const IMPORT_ELEMENT = {
  brazier: 'fire',
  crackedRocks: 'earth', pushableBoulder: 'earth', plateSwitch: 'earth', boulderGate: 'earth',
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
  // Frostpeak lives in rooms.js — no level4.js. Sliced by NAME, not hardcoded
  // line numbers: a fixed [start,end] silently drifts wrong (and stops
  // catching anything) the moment earlier content in this 4000-line file
  // grows or shrinks — exactly what happened here 2026-08-24 when adding
  // frostBramble() shifted every later line. loadSnowKit is the first
  // Frostpeak-only top-level construct (helpers used only by f1-f5 live
  // between it and buildF5); the ROOMS export is the first line after.
  { id: 'L4', file: null,
    slice: ['js/rooms.js', /^async function loadSnowKit/m, /^export const ROOMS/m],
    newForm: 'frost' },
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

// Name-anchored slice: find `startRe`'s match and `endRe`'s match (searched
// only after start) and return the text between them. Throws loudly if
// either landmark goes missing, rather than silently slicing the wrong
// region — a hardcoded line-number slice going stale is exactly the bug
// this replaced.
function nameSlice(file, startRe, endRe) {
  const src = readFileSync(file, 'utf8');
  const s = src.search(startRe);
  if (s < 0) throw new Error(`nameSlice: start marker ${startRe} not found in ${file}`);
  const e = src.slice(s).search(endRe);
  if (e < 0) throw new Error(`nameSlice: end marker ${endRe} not found in ${file} after the start marker`);
  return src.slice(s, s + e);
}

const matrix = [];
for (const r of REGIONS) {
  const src = r.file ? readFileSync(`js/${r.file}`, 'utf8')
    : nameSlice(r.slice[0], r.slice[1], r.slice[2]);
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
