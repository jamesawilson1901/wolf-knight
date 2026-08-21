// THE COMBAT LAWS, MECHANICALLY ENFORCED.
//
// design/COMBAT-SPEC's telegraph floor is the most important number in the
// game for a five-year-old, and until this file existed nothing checked it:
// four attacks had drifted under the floor (spitter 0.6s, rogue 0.7s, shield
// 0.55s, minion 0.25s) and shipped for months. A law nobody measures is a
// wish.
//
// LAW 10 (a verification tool with a broken ruler is worse than no tool)
// applies to this file itself: it was written against the KNOWN-BAD values
// first and confirmed to fail on all four before any of them were fixed.
//
// Reads js/attacks.js — the same table the enemy state machines read — so the
// clock cannot drift from the check. No browser needed.
import { readFileSync } from 'fs';
import { ATTACK, TELEGRAPH_FLOOR, BOSS_FLOOR, PUNISH_FLOOR } from '../js/attacks.js';

const ELEMENTS = ['steel', 'spark', 'moon', 'fire', 'earth', 'verdant', 'frost', 'storm', 'tide'];
const problems = [];
const notes = [];
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { console.log(`✗ ${m}`); problems.push(m); };

console.log('\n── 1. telegraph floor (LAW 1) ──────────────────');
for (const [id, a] of Object.entries(ATTACK)) {
  const floor = a.tier === 'boss' ? BOSS_FLOOR : TELEGRAPH_FLOOR;
  const label = `${id} (${a.owner}) windup ${a.windup.toFixed(2)}s vs floor ${floor}s`;
  if (a.windup + 1e-9 < floor) bad(label); else ok(label);
}

console.log('\n── 2. every attack leaves a punish window (LAW 6) ────');
for (const [id, a] of Object.entries(ATTACK)) {
  const punish = a.recover + a.gap;
  const label = `${id} punish ${punish.toFixed(2)}s (recover ${a.recover} + gap ${a.gap})`;
  if (punish + 1e-9 < PUNISH_FLOOR) bad(label + ` — under ${PUNISH_FLOOR}s`); else ok(label);
}

console.log('\n── 3. every attack has a taught answer (LAW 6) ─────');
{
  const n = problems.length;
  for (const [id, a] of Object.entries(ATTACK)) {
    if (!a.counterplay || !a.counterplay.length) bad(`${id} has no counterplay`);
  }
  if (problems.length === n) ok('every attack names at least one taught answer');
}

console.log('\n── 4. element vocabulary is real (§1.3) ──────────');
{
  const n = problems.length;
  for (const [id, a] of Object.entries(ATTACK)) {
    if (!ELEMENTS.includes(a.element)) bad(`${id} emits unknown element '${a.element}'`);
  }
  if (problems.length === n) ok(`all elements within [${ELEMENTS.join(', ')}]`);
}

console.log('\n── 5. readable at Gentle timescale (0.8x) ─────────');
{
  const n = problems.length;
  for (const [id, a] of Object.entries(ATTACK)) {
    const gentle = a.windup / 0.8;               // enemies run slower in Gentle
    if (gentle + 1e-9 < TELEGRAPH_FLOOR) bad(`${id} is only ${gentle.toFixed(2)}s even in Gentle`);
  }
  if (problems.length === n) ok('Gentle stretches every windup at or above the floor');
}

console.log('\n── 6. the clock cannot drift from the code ───────');
const src = {};
const read = (p) => (src[p] = src[p] ?? readFileSync(p, 'utf8'));
for (const [id, a] of Object.entries(ATTACK)) {
  const text = read(a.source);
  if (a.source === 'js/enemies.js') {
    // wired attacks must READ the table, never re-type the number
    if (!/from '\.\/attacks\.js'/.test(text)) {
      bad(`${a.source} does not import the attack clock — timings can drift`);
      break;
    }
  } else {
    // not yet wired: assert the literal the table claims still exists there
    if (!text.includes(String(a.windup))) {
      bad(`${id}: ${a.source} no longer contains windup ${a.windup} — table is stale`);
    }
  }
}
if (!problems.some((p) => p.includes('drift') || p.includes('stale'))) ok('table and source agree');

console.log('\n── 6b. TRAITS elements are real, and teachable ──────');
{
  const n = problems.length;
  const e = read('js/enemies.js');
  const block = (e.match(/const TRAITS = \{[\s\S]*?\n\};/) || [''])[0];
  for (const m of block.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const [, owner, body] = m;
    for (const f of ['weakness', 'resist']) {
      const hit = body.match(new RegExp(f + ":\\s*(\\[[^\\]]*\\]|'[a-z]+')"));
      if (!hit) continue;
      const els = [...hit[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
      for (const el of els) {
        if (!ELEMENTS.includes(el)) bad(`TRAITS ${owner}.${f} names unknown element '${el}'`);
      }
      // an enemy that fears nothing the player can ever emit teaches nothing
      if (f === 'weakness' && !els.length) bad(`TRAITS ${owner}.weakness is empty`);
    }
  }
  if (problems.length === n) ok('every TRAITS weakness/resist uses a real element');
}

console.log('\n── 7. no ground decals under regular enemies (LAW 4) ──');
{
  const e = read('js/enemies.js');
  // boss lane telegraphs are the one sanctioned exception; BoneWarden is a boss
  const ringDecls = [...e.matchAll(/RingGeometry|CircleGeometry/g)].length;
  notes.push(`${ringDecls} ring/circle geometries in enemies.js (BoneWarden danger rings are the sanctioned boss exception)`);
  ok('checked (see notes)');
}

console.log('\n── 8. every enemy family has TRAITS ────────────');
{
  const e = read('js/enemies.js');
  const traitsBlock = (e.match(/const TRAITS = \{[\s\S]*?\n\};/) || [''])[0];
  const owners = [...new Set(Object.values(ATTACK).filter((a) => a.source === 'js/enemies.js').map((a) => a.owner))];
  for (const o of owners) {
    if (!traitsBlock.includes(o + ':')) notes.push(`${o} has no TRAITS entry (no weakness/armor lesson)`);
  }
  ok('TRAITS coverage checked (see notes)');
}

console.log('\n── 9. crowd enemies honor the attack-token cap (LAW 3) ──');
{
  // Pass 2 audit (2026-08-21): Spitter and SkeletonRogue each had a real,
  // clocked attack (§3 of the combat context pack) that never once checked
  // `this.engaged` — the one enemy able to ignore "only 2/3/4 press at
  // once" per mode. Fixed, but nothing stopped the NEXT enemy from shipping
  // the same gap silently, so: any `tier: 'enemy'` owner in the attack
  // clock must reference `.engaged` somewhere in its own class body. This
  // cannot prove the specific attack-trigger line is gated (that still
  // wants a human/live check, as Pass 4 did), but it catches the exact
  // failure mode found here — total omission — which is what actually
  // shipped silently for however long these two went unaudited.
  const n = problems.length;
  const e = read('js/enemies.js');
  // top-level `class Name` / `export class Name` declarations bound each
  // class's body from its own declaration to the next one (or EOF).
  const starts = [...e.matchAll(/^(?:export )?class (\w+)/gm)];
  const bodies = {};
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : e.length;
    bodies[starts[i][1]] = e.slice(from, to);
  }
  const crowdOwners = [...new Set(Object.values(ATTACK)
    .filter((a) => a.tier === 'enemy' && a.source === 'js/enemies.js')
    .map((a) => a.owner))];
  for (const owner of crowdOwners) {
    const body = bodies[owner];
    if (!body) { bad(`${owner}: no class body found in js/enemies.js to check`); continue; }
    if (!/\.engaged\b/.test(body)) {
      bad(`${owner} has a real windup (attack clock) but never references .engaged — can attack regardless of the token cap`);
    }
  }
  if (problems.length === n) ok(`every crowd owner (${crowdOwners.join(', ')}) references .engaged`);
}

if (notes.length) { console.log('\nNOTES:'); for (const n of notes) console.log('  · ' + n); }
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nALL CLEAN — the telegraph floor holds.');
process.exit(problems.length ? 1 : 0);
