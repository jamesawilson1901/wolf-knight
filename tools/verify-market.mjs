// THE DROWNED MARKET, WALKED (js/levelMarket.js).
//
// The first interstitial: a road between Frostpeak and Stormreach that grants
// no wolf. It has two jobs and this suite asks about both.
//
//   FROST'S GRADUATION — the town is under ice and the stalls worth opening are
//   sealed in it, so the Frost Wolf's breath has to actually open them.
//   THE LOCK FOR THE ONE AHEAD — the black channels are deep water, a hard wall
//   until Meri's gift in region SIX, with the far quay in plain sight. If a
//   child can walk across that channel the whole point of the room is gone, so
//   it is tested by walking AT it.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'earth_wolf', 'fire_wolf', 'verdant_wolf', 'frost_wolf'];
const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const wk = await launch({ timescale: 1 });
await wk.newGame('MARKET');

const go = async (room) => {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: FORMS });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
};

console.log('\n── 1. the road runs through it ─────────────────────────');
await go('f5');
// Boreal has to be down for Frostpeak's north to open at all
await wk.page.evaluate(() => { window.__game.state.flags.borealDefeated = true; });
await go('f5');
const f5 = await wk.wk('doors');
check('Frostpeak now comes down into the market', f5.some((d) => d.to === 'q1'),
  f5.map((d) => d.to));

for (const [room, wantDoors] of [['q1', ['f5', 'q2']], ['q2', ['q1', 's1a']]]) {
  await go(room);
  const m = await wk.page.evaluate(() => {
    const g = window.__game;
    let meshes = 0;
    g.world.root.traverse((n) => { if (n.isMesh) meshes++; });
    return { meshes, calls: g.renderer.info.render.calls,
      doors: (g.world.doors || []).map((d) => d.to),
      ice: (g.world.shatterables || []).length,
      water: (g.world.waterZones || []).length,
      deep: (g.world.waterZones || []).filter((z) => z.deep).length,
      slick: !!g.world.slickFloor,
      chests: (g.world.markers.chestDefs || []).length };
  });
  check(`${room} builds, is slick, and goes where it should`,
    m.meshes > 40 && m.calls < 125 && m.slick
    && wantDoors.every((d) => m.doors.includes(d)), m);
}

console.log('\n── 2. frost opens the stalls ───────────────────────────');
await go('q2');
const iceBefore = await wk.page.evaluate(() =>
  (window.__game.world.shatterables || []).filter((s) => !s.broken).length);
await wk.page.evaluate(() => window.__game.player.setForm('frost_wolf'));
await wk.walkTo(0, -2.0, { timeout: 45, arrive: 1.6 });
for (let i = 0; i < 6; i++) {
  await wk.page.keyboard.press('k');            // the special: frost breath
  await wk.page.waitForTimeout(700);
  await wk.page.evaluate(() => { window.__game.narration.blocking = false; });
}
const iceAfter = await wk.page.evaluate(() =>
  (window.__game.world.shatterables || []).filter((s) => !s.broken).length);
check('the Frost Wolf shatters a sealed stall', iceAfter < iceBefore,
  { before: iceBefore, after: iceAfter });

console.log('\n── 3. the far quay is out of reach, and stays that way ──');
// Walk AT the channel. Deep water is a box collider until Meri's gift, so the
// player must end up west of it however hard they push.
const swim = await wk.page.evaluate(() => {
  const z = (window.__game.world.waterZones || []).find((w) => w.deep);
  return z ? { minX: z.minX, maxX: z.maxX, x: z.x, z: z.z } : null;
});
check('there is deep water to be stopped by', !!swim, swim);
if (swim) {
  await wk.walkTo(swim.maxX + 3, swim.z, { timeout: 40, arrive: 0.9 });
  const pos = await wk.wk('pos');
  check('a child without the Tide Wolf cannot cross it',
    pos.x < swim.minX + 0.6, { stoppedAt: pos, channelStartsAt: +swim.minX.toFixed(2) });
}

console.log('\n── 4. the market pays in a keepsake ────────────────────');
const paid = await wk.page.evaluate(async () => {
  const src = await (await fetch('/js/levelMarket.js')).text();
  const m = [...src.matchAll(/treasure:\s*'([a-z0-9_]+)'/g)].map((x) => x[1]);
  const { TREASURES } = await import('/js/treasures.js');
  return { placed: m, known: m.every((id) => !!TREASURES[id]) };
});
check('it hands out a treasure, and the treasure exists',
  paid.placed.length === 1 && paid.known, paid);

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length
  ? `\n✗ FAIL — ${errors.length} problem(s)`
  : '\n✓ PASS — the road runs through it, frost opens it, the deep water holds');
process.exit(errors.length ? 1 : 0);
