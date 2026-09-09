// THE WAY ON, WHERE THE CHILD IS STANDING.
//
// Dad, from play: "at the end of the boss fight the doorway to the next level
// should appear. it doesn't."
//
// He is describing a shape this codebase already has a name for. An arena's
// onward door used to be REBUILD-GATED: the gap in the wall was cut and the
// door hung at build time, gated on the defeated flag, so the room a child
// stood in the moment they won was a room whose reward had not arrived. They
// had to walk back the way they came and return to fetch it.
//
// Three arenas were fixed for it in v3.76 (f5, scr, ddp). The three the kids
// reach FIRST were not — and one of them, Stoneroot's crypt, could not have
// been, because the fix hung off `world.boss.onDefeated` and the Bone Warden
// is the one boss not stored as world.boss.
//
// So: every boss room in the game, asked the same two questions.
//   1. While the boss lives, is the way on shut? (a gap with no plug is a
//      hole in the wall, which is its own bug — verify-openholes' territory)
//   2. Does the room carry a LIVE opener, so the door arrives without a
//      rebuild — and does pulling it actually hang the door?
import { launch } from './wk-drive.mjs';

// The same set js/main.js keeps for boss music and doorway timing. xth is the
// Shadow Court throne — the last fight in the game, and its way on is the
// ending, not a door — so it is named here as having none on purpose.
const ARENAS = [
  { room: 'le',  onward: 'n1', flag: 'bossDefeated' },
  { room: 'vz',  onward: 'g1', flag: 'wardenDefeated' },
  // The last three arenas hand onto a ROAD now, not straight at the next
  // region (js/route.js NEXT, 2026-09-08): the Cold Climb, the Plunge and the
  // Hollow Road. Same shape le and vz have had since the Night Road and the
  // Greenway went in, two entries up.
  { room: 'tgl', onward: 'c1', flag: 'sylvaDefeated' },
  { room: 'f5',  onward: 'q1', flag: 'borealDefeated' },
  { room: 'scr', onward: 'p1', flag: 'ariaDefeated' },
  { room: 'ddp', onward: 'h1', flag: 'meriDefeated' },
];
const NO_DOOR_ON_PURPOSE = ['xth'];   // the ending is the way on

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
const wk = await launch({ timescale: 1 });
await wk.newGame('ONWARD');
const quiet = () => wk.page.evaluate(() => { window.__game.state.settings.captions = false; window.__game.narration.skip(); });

const probe = await wk.page.evaluate(async ({ arenas, none }) => {
  const rooms = await import('/js/rooms.js');
  const st = await import('/js/state.js');
  const THREE = await import('three');
  const out = [];
  const flagsOff = () => {
    for (const k of Object.keys(st.state.flags)) {
      if (typeof st.state.flags[k] === 'boolean') st.state.flags[k] = false;
    }
  };
  for (const a of [...arenas, ...none.map((room) => ({ room, onward: null }))]) {
    flagsOff();
    let w;
    try { w = await rooms.buildRoom(a.room, new THREE.Scene()); }
    catch (e) { out.push({ ...a, error: String(e && e.message || e) }); continue; }
    const shut = (w.doors || []).map((d) => d.to);
    const hasOpener = typeof w.openOnward === 'function';
    let opened = shut;
    if (hasOpener) { w.openOnward(); opened = (w.doors || []).map((d) => d.to); }
    // ...and the same room built with the flag already set, which is what a
    // returning child sees
    let rebuilt = null;
    if (a.flag) {
      st.state.flags[a.flag] = true;
      try { rebuilt = ((await rooms.buildRoom(a.room, new THREE.Scene())).doors || []).map((d) => d.to); }
      catch { rebuilt = null; }
      st.state.flags[a.flag] = false;
    }
    out.push({ ...a, shut, hasOpener, opened, rebuilt });
  }
  return out;
}, { arenas: ARENAS, none: NO_DOOR_ON_PURPOSE });

console.log('\n── 1. every arena builds ───────────────────────────────');
const broke = probe.filter((r) => r.error);
check('no boss arena threw while building', broke.length === 0, broke);

console.log('\n── 1.5 the arena hub: the nearest unfinished thing (§5.2) ──');
// js/route.js's HUBS, for the six arenas — a function answer now, not a
// fixed string, so this drives it through real state rather than reading
// the table. Ember/Stone/Wild have real promise gates and a real hearth to
// point at; Frost/Storm/Vale carry neither yet (design/WIDER-WORLD.md
// §2.3's "later" queue), so their own hub must fall straight through to the
// same road every already-shipped test above expects.
const hubProbe = await wk.page.evaluate(async () => {
  const { nextRoom } = await import('/js/route.js');
  const st = await import('/js/state.js');
  const ws = await import('/js/worldstate.js');
  const g = st.state;
  const reset = () => {
    for (const k of Object.keys(g.flags)) if (typeof g.flags[k] === 'boolean') g.flags[k] = false;
    g.flags.world = {};
    g.flags.pups = {}; g.flags.burned = {};
    g.formsUnlocked = ['knight'];
  };
  const out = {};

  reset(); g.flags.bossDefeated = true;
  out.le_noForm = nextRoom('le');                                    // no earth_wolf yet
  g.formsUnlocked = ['knight', 'earth_wolf'];
  out.le_crackOpen = nextRoom('le');                                 // earth_wolf, dungeon not cleared
  ws.WS.set('ember', 'dungeon', true);
  out.le_dungeonDone = nextRoom('le');                                // that promise resolved; scorched still isn't
  g.formsUnlocked.push('fire_wolf');
  out.le_bothPromisesOpen = nextRoom('le');                           // both promises now open, neither answered
  g.flags.burned.l1_scorched_gate = true;
  out.le_allPromisesDone = nextRoom('le');                            // both answered — falls to hearth/road

  // ...and the hearth itself, once growth has actually reached it and the
  // child has not yet walked in to see it (js/restoration.js's own `seen_N`).
  reset(); g.flags.bossDefeated = true;
  ws.WS.set('ember', 'restored', true); ws.WS.set('ember', 'dungeon', true);
  g.formsUnlocked = ['knight', 'earth_wolf', 'fire_wolf'];
  g.flags.burned.l1_scorched_gate = true;   // both promises pre-answered
  out.le_pendingHearth = nextRoom('le');
  ws.WS.set('ember', 'seen_2', true);       // she has now seen it
  out.le_hearthSeen = nextRoom('le');

  reset(); g.flags.wardenDefeated = true;
  out.vz_noForm = nextRoom('vz');
  g.formsUnlocked = ['knight', 'verdant_wolf'];
  out.vz_brambleOpen = nextRoom('vz');
  ws.WS.set('vault', 'cut_l2_bramble_gate', true);
  out.vz_allPromisesDone = nextRoom('vz');

  reset(); g.flags.sylvaDefeated = true;
  out.tgl_noForm = nextRoom('tgl');
  g.formsUnlocked = ['knight', 'verdant_wolf'];
  out.tgl_thornOpen = nextRoom('tgl');

  // Frost/Storm/Vale: no promises, no hearth — always the road, regardless
  // of which forms she already carries.
  reset(); g.flags.borealDefeated = true; g.formsUnlocked = ['knight', 'fire_wolf', 'frost_wolf'];
  out.f5_alwaysRoad = nextRoom('f5');
  reset(); g.flags.ariaDefeated = true; g.formsUnlocked = ['knight', 'storm_wolf'];
  out.scr_alwaysRoad = nextRoom('scr');
  reset(); g.flags.meriDefeated = true; g.formsUnlocked = ['knight', 'tide_wolf'];
  out.ddp_alwaysRoad = nextRoom('ddp');

  return out;
});
check('le, boss down, no earth_wolf yet: points at the live door, not a promise she cannot open',
  hubProbe.le_noForm === 'n1', hubProbe.le_noForm);
check('le, earth_wolf in hand, the crack unbroken: points at la',
  hubProbe.le_crackOpen === 'la', hubProbe.le_crackOpen);
check('le, the vault cleared, the scorched barricade still fire_wolf-only and unopened: points at lb2 once fire_wolf is hers',
  hubProbe.le_dungeonDone === 'n1' && hubProbe.le_bothPromisesOpen === 'lb2',
  { dungeonDone: hubProbe.le_dungeonDone, bothOpen: hubProbe.le_bothPromisesOpen });
check('le, every promise answered: falls through (hearth or the road), never a closed gate',
  hubProbe.le_allPromisesDone !== 'la' && hubProbe.le_allPromisesDone !== 'lb2', hubProbe.le_allPromisesDone);
check('le, growth reached the hearth and she has not seen it yet: points at la',
  hubProbe.le_pendingHearth === 'la', hubProbe.le_pendingHearth);
check('le, the same grow-in already seen: falls through to the road, not a repeat',
  hubProbe.le_hearthSeen === 'n1', hubProbe.le_hearthSeen);
check('vz, no verdant_wolf yet: the road, not a promise she cannot open',
  hubProbe.vz_noForm === 'g1', hubProbe.vz_noForm);
check('vz, verdant_wolf in hand, the bramble uncut: points at vc2',
  hubProbe.vz_brambleOpen === 'vc2', hubProbe.vz_brambleOpen);
check('vz, the bramble answered: falls through, never vc2 again',
  hubProbe.vz_allPromisesDone !== 'vc2', hubProbe.vz_allPromisesDone);
check('tgl, no verdant_wolf yet: the Cold Climb, not a promise she cannot open',
  hubProbe.tgl_noForm === 'c1', hubProbe.tgl_noForm);
check('tgl, verdant_wolf in hand, the thorn wall uncut: points at t1b',
  hubProbe.tgl_thornOpen === 't1b', hubProbe.tgl_thornOpen);
check('f5 always answers the road (no promise/hearth content yet)', hubProbe.f5_alwaysRoad === 'q1', hubProbe.f5_alwaysRoad);
check('scr always answers the road (no promise/hearth content yet)', hubProbe.scr_alwaysRoad === 'p1', hubProbe.scr_alwaysRoad);
check('ddp always answers the road (no promise/hearth content yet)', hubProbe.ddp_alwaysRoad === 'h1', hubProbe.ddp_alwaysRoad);

console.log('\n── 2. the way on is shut while the boss lives ──────────');
for (const r of probe) {
  if (!r.onward) continue;
  check(`${r.room} does not hand over ${r.onward} before the fight`,
    !r.shut.includes(r.onward), r.shut);
}

console.log('\n── 3. ...and opens WHERE THE CHILD STANDS ──────────────');
for (const r of probe) {
  if (!r.onward) {
    check(`${r.room} has no onward door, and that is the design`, !r.hasOpener, { doors: r.shut });
    continue;
  }
  check(`${r.room} carries a live opener`, r.hasOpener, { hasOpener: r.hasOpener });
  check(`${r.room} hangs ${r.onward} the moment it is pulled`,
    r.opened.includes(r.onward), { before: r.shut, after: r.opened });
}

console.log('\n── 4. and a returning child sees the same room ─────────');
for (const r of probe) {
  if (!r.onward || !r.rebuilt) continue;
  check(`${r.room} rebuilt with the flag set still leads to ${r.onward}`,
    r.rebuilt.includes(r.onward), r.rebuilt);
  check(`${r.room} opens to the same doors live as on a rebuild`,
    [...r.opened].sort().join() === [...r.rebuilt].sort().join(),
    { live: r.opened, rebuilt: r.rebuilt });
}

console.log('\n── 5. beaten, and the door is simply there ────────────');
// The three above are geometry; this is the moment itself. It fires the boss's
// OWN defeat hook — `onDefeated` (js/boss.js:523, :1078) for the two bosses
// stored as world.boss, and `onWardenDefeated` for the one that is not — which
// is the exact function the killing blow calls. Landing that blow is the job
// of tools/fight-*.mjs; these bosses only expose a core to hit during their
// tired window and re-fighting three of them here would prove nothing this
// does not.
//
// Then it WALKS THROUGH the new door on real keys, because a door that exists
// in world.doors and a door a child can use are two different claims.
for (const [room, forms, onward] of [
  ['le', ['knight', 'dark_wolf', 'fire_wolf'], 'n1'],
  ['vz', ['knight', 'dark_wolf', 'fire_wolf'], 'g1'],
  ['tgl', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'], 'c1'],
]) {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: forms });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999;
    window.__game.state.settings.captions = false; window.__game.narration.skip(); });
  const before = await wk.page.evaluate(() => (window.__game.world.doors || []).map((d) => d.to));
  const fired = await wk.page.evaluate(() => {
    const w = window.__game.world;
    if (w.boss && w.boss.onDefeated) { w.boss.defeated = true; w.boss.onDefeated(); return 'boss'; }
    if (w.warden && w.onWardenDefeated) { w.warden.dead = true; w.onWardenDefeated(w.warden); return 'warden'; }
    return null;
  });
  check(`${room} has a defeat hook to fire`, !!fired, { fired });
  // the plug takes a beat and a half of GAME time to poof, and headless on
  // SwiftShader that is many wall-clock seconds
  // ...and the victory says a great deal, which BLOCKS the world clock. A
  // blocked clock never ticks the plug's countdown down, so the wait has to
  // keep clearing the narration the way a child clears it by tapping.
  // ...and the win also LEVELS THE CHILD UP, which opens the perk card, which
  // pauses the world (js/main.js: `if (paused || menuPaused) return` skips
  // world.animate). The plug's countdown is in game time on purpose, so it
  // simply waits there — exactly as it does for a child who is reading the
  // three cards. Pick one, the way they would.
  let after = before;
  for (let i = 0; i < 60; i++) {
    await quiet();
    const card = wk.page.locator('#perk-menu .perk-card').first();
    if (await card.count() && await card.isVisible()) {
      await card.dispatchEvent('pointerdown');
      await wk.page.waitForTimeout(300);
    }
    after = await wk.page.evaluate(() => (window.__game.world.doors || []).map((d) => d.to));
    if (after.includes(onward)) break;
    await wk.page.waitForTimeout(500);
  }
  check(`${room}: beating the boss opens ${onward} without leaving the room`,
    after.includes(onward), { before, after });
  if (!after.includes(onward)) continue;
  await quiet();
  const door = await wk.page.evaluate((to) => {
    const d = (window.__game.world.doors || []).find((x) => x.to === to);
    return d ? { x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 } : null;
  }, onward);
  // ROUND THE MIDDLE. Every one of these arenas has a hero prop dead centre —
  // the cage, the throne, the standing stones — plus whatever is left of the
  // boss's own body, so a straight line from the middle of the room to the
  // door walks into it. A child goes round; so does this.
  await wk.walkTo(door.x + 8, door.z + 6, { timeout: 30, arrive: 1.2 });
  await wk.walkTo(door.x + 3, door.z + 1.5, { timeout: 30, arrive: 1.0 });
  await wk.walkTo(door.x, door.z, { timeout: 45, arrive: 0.6 });
  for (let i = 0; i < 30; i++) {
    if (await wk.page.evaluate((r) => window.__wk.room !== r, room)) break;
    await wk.page.waitForTimeout(500);
  }
  check(`${room}: and a child can walk straight through it`,
    (await wk.wk('room')) === onward, { landedIn: await wk.wk('room'), wanted: onward });
}

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — every boss opens the way on where you beat it');
process.exit(errors.length ? 1 : 0);
