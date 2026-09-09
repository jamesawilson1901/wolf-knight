// THE GROWTH STAGE — design/WIDER-WORLD.md §1.2, slice v3.127.
//
// `growthStage(key)` is the new derived number a hearth room reads: a plain
// SUM of five independent facts (restored, pups home, keepsake found, dungeon
// cleared, Grimm freed), not front-to-back the way `WS.stage()` counts
// everything else. Two of the four early drafts of this plan tried the
// front-to-back count and both had to admit the same consequence: a child
// who clears a region's dungeon before finding its road keepsake would sit
// at a LOWER stage than what they actually did, with the dungeon's own payoff
// invisible. §1 below runs the REAL function (extracted from the shipping
// source, not a re-implementation of it) against every combination of the
// five facts and checks the law holds: adding a fact never lowers the stage.
//
// §1-2 are static — no server, no browser, sub-second — so they join
// `--quick`. §3-4 need a live room (the settler, the furniture, the draw-call
// budget) and stay in the full sweep.
import { readFileSync } from 'fs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
const read = (f) => readFileSync(f, 'utf8');

// ============================================================================
console.log('── 1 · the derivation is a sum ──────────────────────────────');
// ============================================================================
const restSrc = read('js/restoration.js');
const fnMatch = restSrc.match(/export function growthStage\(key\) \{[\s\S]*?\n\}\n/);
if (!fnMatch) { check('growthStage() found in js/restoration.js', false); process.exit(1); }
const fnBody = fnMatch[0]
  .replace(/^export function growthStage\(key\) \{/, '')
  .replace(/\}\s*$/, '');

// STRUCTURAL: five independent `if (...) n++;` facts, no early return that
// would make a later fact unable to raise the stage — the exact shape that
// broke the front-to-back drafts. (One extra `if (!key) return 0;` guard is
// expected and is not one of the five facts — it fires before any counting
// starts, for a key that names no region at all.)
const factIfs = (fnBody.match(/\) n\+\+;/g) || []).length;
const incCount = (fnBody.match(/n\+\+/g) || []).length;
const earlyReturn = /return n;[\s\S]/.test(fnBody.replace(/return n;\s*$/, ''));
check('exactly five `if` facts, each incrementing the count once',
  factIfs === 5 && incCount === 5, { factIfs, incCount });
check('no early return — every fact gets a chance to raise the stage',
  !earlyReturn, { earlyReturn });

// BEHAVIORAL: run the REAL extracted body (not a rewrite of it) against a
// mock WS/state/helpers, across every combination of the five facts. This is
// the shipping source under test, glass-boxed only for its three collaborator
// calls (WS.get, pupsHomeFor, keepsakeFoundFor) and one free variable
// (state.flags.grimmFreed).
function runGrowthStage(facts) {
  const WS = { get: (k, f) => (f === 'restored' ? facts.restored : facts.dungeon) };
  const pupsHomeFor = () => facts.pups;
  const keepsakeFoundFor = () => facts.keepsake;
  const state = { flags: { grimmFreed: facts.grimm } };
  const f = new Function('WS', 'pupsHomeFor', 'keepsakeFoundFor', 'state', 'key', fnBody);
  return f(WS, pupsHomeFor, keepsakeFoundFor, state, 'ember');
}

const NAMES = ['restored', 'pups', 'keepsake', 'dungeon', 'grimm'];
let additiveOk = true, additiveBad = null;
for (let m = 0; m < 32; m++) {
  const facts = {};
  NAMES.forEach((n, i) => { facts[n] = !!(m & (1 << i)); });
  const base = runGrowthStage(facts);
  // adding any ONE more true fact must never lower the stage
  for (const n of NAMES) {
    if (facts[n]) continue;
    const raised = { ...facts, [n]: true };
    if (runGrowthStage(raised) < base) { additiveOk = false; additiveBad = { facts, raised, n }; break; }
  }
  if (!additiveOk) break;
}
check('adding any fact never lowers the stage (all 32 combinations)', additiveOk, additiveBad);

const restoredOnly = runGrowthStage({ restored: true, pups: false, keepsake: false, dungeon: false, grimm: false });
check('a save holding only `restored` reads stage 1', restoredOnly === 1, { restoredOnly });

const full = runGrowthStage({ restored: true, pups: true, keepsake: true, dungeon: true, grimm: true });
const pupsRemoved = runGrowthStage({ restored: true, pups: false, keepsake: true, dungeon: true, grimm: true });
check('a save with pups removed does not regress below what its other facts give (additive law)',
  full === 5 && pupsRemoved === 4, { full, pupsRemoved });

// ============================================================================
console.log('\n── 2 · every promised pup has a home ────────────────────────');
// ============================================================================
// PUP_HOME (js/pip.js) is the id -> growth-key table growthStage's second
// fact reads. verify-pups.mjs's ROOMS is the independent list of rooms the
// spawner promises a pup in, one entry per region. The two tables are
// written by hand in different files for different reasons, so nothing stops
// them drifting apart the day a region gains or loses a pup room.
const pipSrc = read('js/pip.js');
const pupHomeMatch = pipSrc.match(/export const PUP_HOME = \{[\s\S]*?\n\};/);
if (!pupHomeMatch) { check('PUP_HOME found in js/pip.js', false); process.exit(1); }
const PUP_HOME = {};
for (const m of pupHomeMatch[0].matchAll(/(\w+):\s*'(\w+)'/g)) PUP_HOME[m[1]] = m[2];
check(`PUP_HOME names ${Object.keys(PUP_HOME).length} pups`, Object.keys(PUP_HOME).length === 24, PUP_HOME);

const pupsSrc = read('tools/verify-pups.mjs');
const roomsMatch = pupsSrc.match(/const ROOMS = \{[\s\S]*?\n\};/);
if (!roomsMatch) { check('ROOMS found in tools/verify-pups.mjs', false); process.exit(1); }
const ROOMS = {};
for (const m of roomsMatch[0].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
  ROOMS[m[1]] = m[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
}
// verify-pups.mjs names regions by their world name (stoneroot, wildwoods...);
// PUP_HOME names them by their growth key (stone, wild...) — the same split
// js/restoration.js's own WS_KEY table makes for the same reason.
const REGION_TO_KEY = {
  ember: 'ember', stoneroot: 'stone', wildwoods: 'wild', frostpeak: 'frost',
  stormreach: 'storm', sunkenvale: 'vale', court: 'court', village: 'village',
};
const byKey = {};
for (const [id, key] of Object.entries(PUP_HOME)) (byKey[key] ||= []).push(id);
const missing = [];
for (const region of Object.keys(ROOMS)) {
  const key = REGION_TO_KEY[region];
  const ids = (key && byKey[key]) || [];
  if (!key || ids.length !== ROOMS[region].length) missing.push({ region, key, roomCount: ROOMS[region].length, pupCount: ids.length });
}
check('every region in verify-pups’ ROOMS has exactly as many PUP_HOME ids as rooms',
  missing.length === 0, missing.length ? missing : { regions: Object.keys(ROOMS).length });

console.log(errors.length ? `\n${errors.length} PROBLEM(S) in §1-2:\n` + errors.join('\n')
  : '\n✓ §1-2 clean (static).');

// ============================================================================
// §3-4 need a live room, a browser and tens of seconds — the opposite of
// "sub-second, joins --quick". `WK_QUICK` is set only by verify-all.sh's
// --quick block (tools/verify-all.sh), so this exits here unconditionally in
// that mode regardless of whether a server happens to be reachable, and runs
// the real thing everywhere else (the full sweep, or a bare `node
// tools/verify-growth.mjs` with the server up per CLAUDE.md).
// ============================================================================
let serverUp = !process.env.WK_QUICK;
if (serverUp) {
  try { await (await fetch('http://localhost:8901/', { signal: AbortSignal.timeout(1000) })).text(); }
  catch { serverUp = false; }
}

if (!serverUp) {
  console.log(process.env.WK_QUICK
    ? '\n(WK_QUICK — skipping §3-4, browser checks)'
    : '\n(no server on :8901 — skipping §3-4, browser checks)');
  process.exit(errors.length ? 1 : 0);
}

const { launch } = await import('./wk-drive.mjs');
const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

const wk = await launch({ dev: true });
const { page } = wk;
await wk.newGame('GROWTH');
await page.evaluate(() => { window.__game.state.settings.captions = false; });

const setStage = (key, n) => page.evaluate(async ({ key, n }) => {
  const g = window.__game;
  const { PUP_HOME } = await import('/js/pip.js');
  const { KEEPSAKE, COURT_RELICS } = await import('/js/restoration.js');
  g.WS.set(key, 'restored', n >= 1);
  for (const id of Object.keys(PUP_HOME)) {
    if (PUP_HOME[id] === key) g.state.flags.pups[id] = n >= 2;
  }
  if (!g.state.inventory.treasures) g.state.inventory.treasures = [];
  if (key === 'court') {
    for (const r of COURT_RELICS) g.WS.set('court', 'relic_' + r, n >= 3);
  } else if (KEEPSAKE[key]) {
    g.state.inventory.treasures = g.state.inventory.treasures.filter((t) => t !== KEEPSAKE[key]);
    if (n >= 3) g.state.inventory.treasures.push(KEEPSAKE[key]);
  }
  g.WS.set(key, 'dungeon', n >= 4);
  g.state.flags.grimmFreed = n >= 5;
}, { key, n });

const posts = await page.evaluate(async () => {
  const { SETTLER_POSTS } = await import('/js/npcs.js');
  return Object.entries(SETTLER_POSTS).map(([room, p]) => ({ room, ...p }));
});
check('at least one settler post exists (Ember’s `la`, this slice)', posts.length > 0, posts);

for (const post of posts) {
  console.log(`\n── 3 · ${post.key} @ ${post.room}, LATE=0..3 ───────────────`);
  for (let n = 0; n <= 3; n++) {
    await setStage(post.key, n);
    await wk.jump(post.room, ALL);
    await page.evaluate(async () => { for (let i = 0; i < 15; i++) await new Promise((r) => requestAnimationFrame(r)); });

    const snap = await page.evaluate(async ({ n, minStage }) => {
      const g = window.__game, w = g.world;
      const settler = (w.npcs || []).find((npc) => npc.id && w.markers.settlerSpot
        && Math.hypot(npc.model.position.x - w.markers.settlerSpot.x, npc.model.position.z - w.markers.settlerSpot.z) < 0.1);
      const R = 0.8;
      const freeAt = (x, z, r) => {
        for (const c of w.boxColliders) {
          const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ));
          if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
        }
        return true;
      };
      const { STAGE_CLUTTER } = await import('/js/restoration.js');
      const rows = STAGE_CLUTTER[w.roomId] || {};
      const clutterBad = [];
      for (let s = 2; s <= Math.max(2, n); s++) {
        for (const [key, x, z] of (rows[s] || [])) {
          // a hearth/hut prop deliberately IS its own collider; test clears
          // ONLY box colliders (the room's static geometry), never the props'
          // own circles, which would fail every solid prop against itself
          if (!freeAt(x, z, R)) clutterBad.push([key, x, z]);
        }
      }
      const bloomBad = [];
      for (const p of (w.markers.bloomSpots || [])) {
        for (const c of w.circleColliders) {
          if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + 0.44) ** 2) bloomBad.push([p.x, p.z]);
        }
      }
      return {
        room: w.roomId,
        settlerPresent: !!settler,
        settlerHasMixer: !!(settler && settler.mixer),
        calls: g.renderer.info.render.calls,
        clutterBad, bloomBad,
        want: n >= minStage,
      };
    }, { n, minStage: post.minStage });

    check(`${post.key} LATE=${n}: settler present iff stage>=minStage(${post.minStage})`,
      snap.settlerPresent === snap.want, snap);
    if (snap.settlerPresent) {
      check(`${post.key} LATE=${n}: settler is animating, not frozen by flattenStatic`,
        snap.settlerHasMixer, snap);
    }
    check(`${post.key} LATE=${n}: draw calls ${snap.calls} <= 125`, snap.calls <= 125, snap);
    check(`${post.key} LATE=${n}: every placed prop clears r=0.8 of the room's static geometry`,
      snap.clutterBad.length === 0, snap.clutterBad);
    check(`${post.key} LATE=${n}: blooms avoid the hut (and every other settler collider)`,
      snap.bloomBad.length === 0, snap.bloomBad);
  }
}

// ============================================================================
console.log('\n── 4 · witnessed once, not on every visit ──────────────────');
// ============================================================================
for (const post of posts) {
  await page.evaluate((key) => { window.__game.WS.set(key, 'seen_2', false); }, post.key);
  await setStage(post.key, 2);
  await wk.jump('den', ALL); // leave, so the next jump is a fresh build of the room
  const before = await page.evaluate((key) => window.__game.WS.get(key, 'seen_2'), post.key);
  await wk.jump(post.room, ALL);
  await page.evaluate(async () => { for (let i = 0; i < 200; i++) await new Promise((r) => requestAnimationFrame(r)); });
  const afterFirst = await page.evaluate((key) => window.__game.WS.get(key, 'seen_2'), post.key);
  // a second build at the SAME stage must not unset the flag (WS.set('seen_2')
  // only ever runs inside the `if (!WS.get(...))` gate — this is the whole
  // mechanism `spawnSettlers` uses to play the reveal once per stage)
  await wk.jump('den', ALL);
  await wk.jump(post.room, ALL);
  await page.evaluate(async () => { for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r)); });
  const afterSecond = await page.evaluate((key) => window.__game.WS.get(key, 'seen_2'), post.key);
  check(`${post.key}: seen_2 is unset on arrival, set after the first visit at stage 2`,
    !before && afterFirst, { before, afterFirst });
  check(`${post.key}: seen_2 stays set (the reveal does not replay) on a second visit`,
    afterSecond, { afterSecond });
}

console.log(wk.errors.length ? '\nPAGE ERRORS:\n' + wk.errors.join('\n') : '');
for (const e of wk.errors) errors.push('PAGEERROR: ' + e);
await wk.b.close();
console.log(errors.length ? `\nFAIL (${errors.length}): ${errors.join(', ')}` : '\nPASS');
process.exit(errors.length ? 1 : 0);
