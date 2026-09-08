// THE HEALING — what a region looks like once its guardian is free.
//
// Dad's ask: "when the boss of each area I want the area to be transformed.
// grass begins to return, flowers. lava cools to rock. water returns, winds
// calm. animals replace enemies harmlessly grazing. a real terranigma moment."
//
// The thing this suite exists to stop is the thing it was written to fix:
// js/main.js has set `WS.set(<region>, 'restored')` on every boss defeat since
// the day it was written, and until 2026-09-08 NOT ONE ROOM IN ANY REBUILT
// LEVEL READ IT. A flag nobody reads is indistinguishable from a flag that
// works, from the outside, forever — so every check here is a BEFORE and an
// AFTER of the same room, and the assertion is on the difference.
//
// It also guards the two ways a change this size goes wrong quietly:
//   * a healed room that costs more draw calls than the budget allows, on the
//     tablet this is actually played on;
//   * a bloom growing out of a rock, which is the visual-and-positional class
//     dad's play-testing keeps finding and suites almost never do.
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
const KEYS = ['ember', 'stone', 'wild', 'frost', 'storm', 'vale', 'court'];

// One room per region that a child spends real time in — not an arena, not a
// corridor, and each one has to actually HAVE the thing being tested: the
// first cut named lc1 for the lava (the lava is in `lc`, one room over) and
// xsh for the Court (a shrine room, no foes in it at all), and both passed
// vacuously in the direction that matters.
const SAMPLE = [
  { room: 'lc', key: 'ember' },
  { room: 'vb1', key: 'stone' },
  { room: 't2a', key: 'wild' },
  { room: 'f3', key: 'frost' },
  { room: 'sc2', key: 'storm' },
  { room: 'd1b', key: 'vale' },
  { room: 'xa2', key: 'court' },
];

const wk = await launch({ dev: true });
const { page } = wk;
await wk.newGame('HEAL');
await page.evaluate(() => { window.__game.state.settings.captions = false; });

const snap = () => page.evaluate(() => {
  const w = window.__game.world;
  return {
    room: w.roomId,
    foes: (w.enemies || []).filter((e) => !e.scenery).length,
    grazers: (w.grazers || []).length,
    lava: (w.lavaZones || []).length,
    gales: (w.galeLanes || []).map((g) => g.strength),
    push: (w.galeLanes || []).reduce((m, g) => Math.max(m, Math.abs(g.px) + Math.abs(g.pz)), 0),
    blooms: (w.markers.bloomSpots || []).length,
    calls: window.__game.renderer.info.render.calls,
    light: (() => {
      const L = window.__game.lights, h = {};
      const l = (c) => { c.getHSL(h); return +h.l.toFixed(3); };
      return { sky: l(L.hemi.color), ground: l(L.hemi.groundColor), key: l(L.key.color) };
    })(),
  };
});

// ---------------------------------------------------------------------------
console.log('\n── 1 · which places heal, and which deliberately do not ──');
const keys = await page.evaluate(async () => {
  const m = await import('/js/restoration.js');
  const of = (r) => m.healKeyOf(r);
  return {
    ember: of('lc1'), road: of('n1'), stone: of('vh'), green: of('g1'),
    wild: of('t2a'), frost: of('f3'), market: of('q1'), storm: of('sc2'),
    vale: of('d1b'), court: of('xsh'), village: of('ysq'), spire: of('m1'),
    den: of('den'),
  };
});
check('every region heals, and its road heals with it',
  keys.ember === 'ember' && keys.road === 'ember' && keys.stone === 'stone'
  && keys.green === 'stone' && keys.wild === 'wild' && keys.frost === 'frost'
  && keys.market === 'frost' && keys.storm === 'storm' && keys.vale === 'vale'
  && keys.court === 'court', keys);
check('the Village, the Spire and the Den are left alone on purpose',
  keys.village === null && keys.spire === null && keys.den === null, keys);
// The Village's wards are "everything in this square is dead" gates and an
// empty room never satisfies one; the Spire's is the mirror and would satisfy
// instantly. Both already have their own before/after. See restoration.js.

// ---------------------------------------------------------------------------
console.log('\n── 2 · the ground itself ─────────────────────────────');
const patch = await page.evaluate(async () => {
  const m = await import('/js/restoration.js');
  const g = window.__game;
  const sample = () => [{ x: 0, z: 0, r: 3, kind: 'scorch' },
    { x: 1, z: 1, r: 2, kind: 'sand' }, { x: 2, z: 2, r: 2, kind: 'mud' }];
  const before = m.healPatches(sample(), 'lc').map((p) => p.kind);
  g.WS.set('ember', 'restored');
  const after = m.healPatches(sample(), 'lc').map((p) => p.kind);
  g.WS.set('ember', 'restored', false);
  return { before, after };
});
check('a scorch becomes moss when the shadow lifts',
  patch.before[0] === 'scorch' && patch.after[0] === 'moss', patch);
check('...and sand stays sand — what the place is MADE of does not change',
  patch.before[1] === 'sand' && patch.after[1] === 'sand', patch);
// A mud flat is the shape of a pool with no pool in it, so it is where a
// healed region gets its water back — dad's "water returns", which has no
// other home: the Vale's problem is too MUCH water and Meri's own defeat
// already drains it.
check('a dried mud flat fills with water again',
  patch.before[2] === 'mud' && patch.after[2] === 'water', patch);

// ---------------------------------------------------------------------------
console.log('\n── 3 · before and after, one room per region ─────────');
const before = {};
for (const s of SAMPLE) {
  await wk.jump(s.room, ALL);
  before[s.room] = await snap();
}
await page.evaluate((ks) => { for (const k of ks) window.__game.WS.set(k, 'restored'); }, KEYS);
const after = {};
for (const s of SAMPLE) {
  await wk.jump(s.room, ALL);
  after[s.room] = await snap();
}
for (const s of SAMPLE) {
  const b = before[s.room], a = after[s.room];
  check(`${s.room}: the shadows are gone and a pack grazes where they stood`,
    b.foes > 0 && a.foes === 0 && a.grazers > 0, { before: b.foes, after: [a.foes, a.grazers] });
  check(`${s.room}: flowers and grass come up`, a.blooms > 0, { blooms: a.blooms });
  check(`${s.room}: it still fits in the draw-call budget`, a.calls <= 125,
    { before: b.calls, after: a.calls });
}

// ---------------------------------------------------------------------------
console.log('\n── 3b · the light comes back too ─────────────────────');
// The first healed contact sheet showed a Wild Woods with flowers in it and
// wolves grazing through it that a child still could not see: everything else
// the healing does is a thing IN the room, and the room went on being LIT as
// if the shadow were still sitting on it. Same hues — wayfinding by colour
// temperature has to survive — half a stop brighter.
for (const s of SAMPLE) {
  const b = before[s.room].light, a = after[s.room].light;
  check(`${s.room}: the shadow lifts off the light itself`,
    a.sky > b.sky && a.ground > b.ground && a.key > b.key, { before: b, after: a });
}

// ---------------------------------------------------------------------------
console.log('\n── 4 · the lava sleeps as black stone ────────────────');
// Pip has promised this since `lava_cooled` was written, and js/level1.js
// said out loud in a comment that nothing had ever made it true.
check('the lava crossing burned before and does not now',
  before.lc.lava > 0 && after.lc.lava === 0,
  { before: before.lc.lava, after: after.lc.lava });
await wk.jump('lc', ALL);
const hurt = await page.evaluate(() => {
  const g = window.__game;
  // the middle of the old channel, between the two safe slabs
  return { hazard: g.world.hazardAt(-1.75, -1), hearts: g.player.hearts };
});
check('...and standing in the middle of it is simply floor now',
  !hurt.hazard, hurt);

// ---------------------------------------------------------------------------
console.log('\n── 5 · the winds calm ────────────────────────────────');
check('sc2 was a gale stair and is a breeze',
  before.sc2.gales.length > 0 && before.sc2.push > 0
  && after.sc2.gales.length === before.sc2.gales.length
  && after.sc2.gales.every((g) => g === 'breeze'),
  { before: before.sc2.gales, after: after.sc2.gales,
    push: [before.sc2.push, after.sc2.push] });
check('...the air still moves — the lanes are calmed, not deleted',
  after.sc2.gales.length > 0, after.sc2.gales);

// ---------------------------------------------------------------------------
console.log('\n── 6 · nothing blooms inside a rock ──────────────────');
let bad = [];
for (const s of SAMPLE) {
  await wk.jump(s.room, ALL);
  const r = await page.evaluate(({ R }) => {
    const w = window.__game.world;
    const out = [];
    for (const p of w.markers.bloomSpots || []) {
      let clear = true;
      for (const c of w.boxColliders) {
        const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
        if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < R * R) clear = false;
      }
      for (const c of w.circleColliders) {
        if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + R) ** 2) clear = false;
      }
      if (!clear) out.push([+p.x.toFixed(1), +p.z.toFixed(1)]);
    }
    return { room: w.roomId, bad: out, n: (w.markers.bloomSpots || []).length };
  }, { R: 0.44 });
  if (r.bad.length) bad.push(r);
  check(`${s.room}: all ${r.n} blooms stand on clear ground`, !r.bad.length, r.bad);
}

// ---------------------------------------------------------------------------
console.log('\n── 7 · the pack is harmless, and cannot wedge anybody ─');
await wk.jump('t2a', ALL);
const pack = await page.evaluate(() => {
  const w = window.__game.world;
  const g = w.grazers || [];
  // No colliders (Biscuit's rule): a healed room must not be a room a child
  // can be shoved around in, and a wandering body with a collider is a
  // wandering obstacle.
  const solid = g.filter((a) => w.circleColliders.some((c) =>
    Math.hypot(c.x - a.model.position.x, c.z - a.model.position.z) < 0.4));
  return { n: g.length, solid: solid.length, ticks: typeof w.updateGrazers,
    foes: (w.enemies || []).filter((e) => !e.scenery).length,
    drawn: g.every((a) => !!a.model.parent) };
});
check('they are drawn, they are ticked, and nothing about them is solid',
  pack.n > 0 && pack.solid === 0 && pack.ticks === 'function' && pack.drawn, pack);
check('there is nothing left in the room that fights back', pack.foes === 0, pack);
// they must actually MOVE — a herd of statues is a prop, not an animal
const moved = await page.evaluate(() => {
  const g = window.__game.world.grazers;
  return g.map((a) => ({ x: a.model.position.x, z: a.model.position.z }));
});
await page.waitForTimeout(9000);
const moved2 = await page.evaluate(() => {
  const g = window.__game.world.grazers;
  return g.map((a) => ({ x: a.model.position.x, z: a.model.position.z }));
});
check('...and at least one of them has wandered a pace in nine seconds',
  moved.some((p, i) => Math.hypot(p.x - moved2[i].x, p.z - moved2[i].z) > 0.05),
  moved.map((p, i) => +Math.hypot(p.x - moved2[i].x, p.z - moved2[i].z).toFixed(2)));

// ---------------------------------------------------------------------------
console.log('\n── 8 · the ground substitution really reaches the room ───');
// §2 proves the FUNCTION. This proves the WIRING: tgl carries a mud patch at
// (-8, -9), and levelkit's shell derives world.waterPatches from the patch
// list AFTER the healing pass — so if the substitution is plumbed in, that
// patch is water in a healed Wild Woods and is not before.
await page.evaluate(() => window.__game.WS.set('wild', 'restored', false));
await wk.jump('tgl', ALL);
const dryWoods = await page.evaluate(() => (window.__game.world.waterPatches || []).length);
await page.evaluate(() => window.__game.WS.set('wild', 'restored'));
await wk.jump('tgl', ALL);
const wetWoods = await page.evaluate(() => (window.__game.world.waterPatches || []).length);
check('the Glade\u2019s mud flat is water once the Woods are free',
  wetWoods === dryWoods + 1, { before: dryWoods, after: wetWoods });

// ---------------------------------------------------------------------------
console.log('\n── 9 · the moment is witnessed, not found later ──────');
// Ember and Stoneroot grow their green around the player's feet the instant
// the fight ends. Five regions had a background-colour change on the next
// rebuild and nothing else — five of the seven biggest moments in the game,
// off screen. healLive is that beat generalised, so it has to actually run
// in the room the child is standing in, without a reload.
await page.evaluate(() => window.__game.WS.set('wild', 'restored', false));
await wk.jump('tgl', ALL);
const armed = await page.evaluate(() => ({
  boss: !!window.__game.world.boss,
  played: !!window.__game.world.markers.restorationPlayed,
  blooms: (window.__game.world.markers.bloomSpots || []).length,
}));
check('Sylva is bound and the glade has not healed yet',
  armed.boss && !armed.played && armed.blooms === 0, armed);
await page.evaluate(() => window.__game.world.boss._defeat());
// same two things that legitimately hold a post-fight beat: see verify-wayfarer
let played = false;
for (let i = 0; i < 30 && !played; i++) {
  const card = page.locator('#perk-menu .perk-card').first();
  if (await card.count() && await card.isVisible().catch(() => false)) await card.dispatchEvent('pointerdown');
  await page.evaluate(() => { const n = window.__game.narration; if (n && n.blocking) n.skip(); });
  played = await page.evaluate(() => !!window.__game.world.markers.restorationPlayed);
  if (!played) await page.waitForTimeout(700);
}
check('the glade blooms where the child is standing, without a reload', played);
const grew = await page.evaluate(() => {
  const w = window.__game.world;
  return { blooms: (w.markers.bloomSpots || []).length, wild: w.WS ? 1 : 1 };
});
check('...and it really planted something', grew.blooms > 0, grew);

console.log(wk.errors.length ? '\nPAGE ERRORS:\n' + wk.errors.join('\n') : '');
for (const e of wk.errors) errors.push('PAGEERROR: ' + e);
await wk.b.close();
console.log(errors.length ? `\nFAIL (${errors.length}): ${errors.join(', ')}` : '\nPASS');
process.exit(errors.length ? 1 : 0);
