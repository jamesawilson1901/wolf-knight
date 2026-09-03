// THE GREENWAY, WALKED (js/levelGreen.js).
//
// The road between Stoneroot and the Wild Woods, at gap two. Two jobs, and a
// suite that asks about both with real keys:
//
//   EARTH, GRADUATED — the road north out of g1 is cracked rock wall to wall,
//     so the stomp Stoneroot taught in a side room is the way you walk. It has
//     to actually BLOCK until stomped (flood-fill from the spawn), and open
//     when the Earth Wolf stomps it.
//   THE LOCK AHEAD — the first bramble seals a spoil, and a child without the
//     Verdant Wolf cannot get behind it however hard they push.
//
// And the keepsake: behind a crack a child can open TODAY, walked onto for
// real and found in the bag afterwards (js/treasures.js rule 3).
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'];
const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const wk = await launch({ timescale: 1 });
await wk.newGame('GREEN');
const go = async (room) => {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: FORMS });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; window.__game.narration.blocking = false; });
};
const quiet = () => wk.page.evaluate(() => { window.__game.narration.blocking = false; });
const reachable = (x, z, r = 1.3) => wk.page.evaluate(([x, z, r]) => {
  const w = window.__game.world, step = 0.5, rad = 0.32;
  const solid = (a, b) => { const s = w.resolveCircle(a, b, rad); return Math.abs(s.x - a) > 1e-6 || Math.abs(s.z - b) > 1e-6; };
  const ci = (v) => Math.round(v / step), key = (i, j) => i + ',' + j;
  const inside = (a, b) => Math.abs(a) <= w.halfW + 0.01 && Math.abs(b) <= w.halfD + 0.01;
  const seen = new Set(); const st = [[ci(w.spawn.x), ci(w.spawn.z)]]; seen.add(key(...st[0]));
  while (st.length) { const [i, j] = st.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj;
      if (!inside(ni * step, nj * step)) continue; const k = key(ni, nj);
      if (seen.has(k) || solid(ni * step, nj * step)) continue; seen.add(k); st.push([ni, nj]); } }
  for (let a = x - r; a <= x + r + 1e-6; a += step) for (let b = z - r; b <= z + r + 1e-6; b += step)
    if (seen.has(key(ci(a), ci(b)))) return true;
  return false;
}, [x, z, r]);
// A STOMP IS A WALK FIRST, AND THE WALK HAS TO TAKE THE ROAD. g1's rockfall
// wall runs the full width of the room at z -4 with one 2.6u mouth at x 0, so
// a straight line from the spawn to the east nook drives into stone and the
// stomp never happens (the first cut of this suite read that as "the chest
// gave nothing"). `via` is the waypoints a child would actually walk.
const stomp = async (x, z, via = []) => {
  await wk.page.evaluate(() => window.__game.player.setForm('earth_wolf'));
  for (const [vx, vz] of via) await wk.walkTo(vx, vz, { timeout: 50, arrive: 0.9 });
  await wk.walkTo(x, z + 2.4, { timeout: 50, arrive: 0.8 });
  await wk.walkTo(x, z + 1.7, { timeout: 10, arrive: 0.5 });
  // AND THE STOMP HAS AN EIGHT-SECOND COOLDOWN. Five presses 600ms apart is
  // three seconds — every press after the first landed inside the cooldown of
  // the one before, so a second pile stomped in the same minute never broke and
  // the run read it as "the chest gave nothing". Wait the cooldown out.
  for (let i = 0; i < 4; i++) {
    for (let t = 0; t < 60; t++) {
      if (await wk.page.evaluate(() => window.__game.player.specialCooldown <= 0)) break;
      await wk.page.waitForTimeout(500);
    }
    await wk.page.keyboard.press('k');
    await wk.page.waitForTimeout(700);
    await quiet();
    if (await wk.page.evaluate(() => (window.__game.world.crackables || []).every((c) => c.cracked))) break;
  }
};

console.log('\n── 1. the road runs through it ─────────────────────────');
await go('vz');
await wk.page.evaluate(() => { window.__game.state.flags.wardenDefeated = true; });
await go('vz');
const crypt = await wk.wk('doors');
check('the Warden\'s crypt now opens onto the road', crypt.some((d) => d.to === 'g1'), crypt.map((d) => d.to));
check('...and no longer straight into Thornedge', !crypt.some((d) => d.to === 't1a'), crypt.map((d) => d.to));
const rooms = {};
for (const [room, want] of [['g1', ['vz', 'g2']], ['g2', ['g1', 't1a']]]) {
  await go(room);
  rooms[room] = await wk.page.evaluate(() => {
    const g = window.__game, w = g.world;
    let southEdge = -Infinity;
    for (const c of w.boxColliders) southEdge = Math.max(southEdge, c.maxZ);
    const blind = [];
    for (const [k, v] of Object.entries(w.markers)) {
      const look = (o) => { if (o && typeof o.z === 'number' && o.z > southEdge - 2.5) blind.push(`${k}@${o.z}`); };
      if (Array.isArray(v)) v.forEach(look); else look(v);
    }
    return { calls: g.renderer.info.render.calls, doors: (w.doors || []).map((d) => d.to),
      cracks: (w.crackables || []).length, cuts: (w.cuttables || []).length,
      chests: (w.markers.chestDefs || []).length, blind,
      pups: Object.keys(w.markers).filter((k) => /^pup\d*Spot$/.test(k)).length };
  });
  const m = rooms[room];
  check(`${room} builds and goes where it should`, m.calls < 125 && want.every((d) => m.doors.includes(d)) && m.chests >= 2, m);
  check(`${room} carries no pups and keeps the blind strip clear`, m.pups === 0 && m.blind.length === 0, { pups: m.pups, blind: m.blind });
}

console.log('\n── 2. earth is the way you walk ────────────────────────');
await go('g1');
const shut = await reachable(0, -12.4, 0.6);
check('the rockfall blocks the road north while it stands', !shut && rooms.g1.cracks === 3, { reachable: shut, cracks: rooms.g1.cracks });
await stomp(0, -4.0);
const road = await wk.page.evaluate(() => ({
  flag: !!window.__game.state.flags.cracked.g1_road,
  left: (window.__game.world.crackables || []).filter((c) => !c.cracked).length }));
const open = await reachable(0, -12.4, 0.6);
check('the Earth Wolf stomps it open', road.flag && open, { ...road, open });

console.log('\n── 3. the keepsake, behind a crack a child can open today ─');
const sealed = await reachable(13.5, -10.0, 1.2);
check('the Rootstone\'s chest is sealed until its crack is stomped', !sealed);
await stomp(13.4, -7.0, [[0, -2.6], [0, -6.4], [11.0, -6.4]]);
const before = await wk.page.evaluate(() => [...window.__game.state.inventory.treasures]);
await wk.walkTo(13.5, -10.0, { timeout: 50, arrive: 0.8 });
await wk.page.waitForTimeout(2500);
await quiet();
const after = await wk.page.evaluate(() => [...window.__game.state.inventory.treasures]);
check('walking onto the gold chest hands over the Rootstone',
  !before.includes('rootstone') && after.includes('rootstone'), { before, after });

console.log('\n── 4. the first bramble holds until the Woods ──────────');
await go('g2');
const bramble = await wk.page.evaluate(() => ({
  cuts: (window.__game.world.cuttables || []).length,
  hasVerdant: window.__game.state.formsUnlocked.includes('verdant_wolf') }));
await wk.walkTo(-14, 1.5, { timeout: 50, arrive: 0.9 });      // walk AT it
const stopped = await wk.wk('pos');
check('a child without the Verdant Wolf cannot get behind it',
  bramble.cuts >= 1 && !bramble.hasVerdant && stopped.x > -11.5, { ...bramble, stoppedAt: +stopped.x.toFixed(2) });

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the road out of the stone, walked, stomped and paid');
process.exit(errors.length ? 1 : 0);
