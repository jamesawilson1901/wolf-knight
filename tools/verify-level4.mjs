// FROSTPEAK, REBUILT AND WALKED (js/level4.js).
//
// The last region to leave rooms.js. It keeps v3.21's seven-room graph, both
// puzzle doors, Boreal, every room id and every world-state key — so this
// suite asks the questions that rebuild could have broken, and asks them with
// real keys:
//
//   THE CHAIN     tgl opens onto f1 once Sylva is freed; f1→f2→f3→f4→f5, and
//                 both pockets loop back.
//   THE HALL      fire breath MELTS a bowl's ice, the fire slam LIGHTS it,
//                 three lit bowls open the frost gate (WS frost.braziers).
//   THE LAKE      the boulders skid: west stone east into its stopper, then
//                 north onto its plate — the numbers copied to the decimal.
//   THE PROMISES  the three ice blocks actually seal their chests (flood-fill
//                 from the spawn), and frost breath opens one.
//   THE SUMMIT    Boreal spawns, the way down is plugged, and calming her
//                 opens it onto the Drowned Market.
//   THE LAW       campfire + potion side by side before the boss door; no
//                 pups outside f1b/f2b/f4; every room under 125 draw calls.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf'];
const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const wk = await launch({ timescale: 1 });
await wk.newGame('FROST');
await wk.page.evaluate(() => { window.__game.state.flags.sylvaDefeated = true; });

const go = async (room, forms = FORMS) => {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: forms });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; window.__game.narration.blocking = false; });
};
const quiet = () => wk.page.evaluate(() => { window.__game.narration.blocking = false; });
// flood-fill from the spawn on the real colliders — the same fill verify-reachable uses
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
const shape = () => wk.page.evaluate(() => {
  const g = window.__game, w = g.world;
  return { calls: g.renderer.info.render.calls, doors: (w.doors || []).map((d) => d.to),
    pups: Object.keys(w.markers).filter((k) => /^pup\d*Spot$/.test(k)),
    rest: w.markers.restSpot || null, potion: w.markers.potionSpot || null,
    bossDoor: w.markers.bossDoorSpot || null, boss: !!w.boss, plug: !!w.openOnward };
});

console.log('\n── 1. the chain ────────────────────────────────────────');
await go('tgl');
const glade = await wk.wk('doors');
check('Sylva freed: the glade opens onto the Rime Gate', glade.some((d) => d.to === 'f1'), glade.map((d) => d.to));
const rooms = {};
for (const [room, want] of [['f1', ['tgl', 'f2', 'f1b']], ['f1b', ['f1']], ['f2', ['f1', 'f3', 'f2b']],
  ['f2b', ['f2']], ['f3', ['f2', 'f4']], ['f4', ['f3', 'f5']], ['f5', ['f4']]]) {
  await go(room);
  rooms[room] = await shape();
  check(`${room} goes where it should`, want.every((d) => rooms[room].doors.includes(d)), rooms[room].doors);
}
const worst = Object.entries(rooms).reduce((a, [id, m]) => (m.calls > a.calls ? { id, calls: m.calls } : a), { id: '—', calls: 0 });
check('every room under 125 draw calls', worst.calls < 125, worst);
const pupRooms = Object.entries(rooms).filter(([, m]) => m.pups.length).map(([id]) => id).sort();
check('pups 10, 11 and 12 live in f1b, f2b and f4 and nowhere else',
  pupRooms.join() === 'f1b,f2b,f4', { pupRooms, marks: Object.fromEntries(Object.entries(rooms).map(([k, m]) => [k, m.pups])) });
const f4 = rooms.f4;
check('rest before the summit door: flame and potion side by side',
  !!f4.rest && !!f4.potion && Math.hypot(f4.rest.x - f4.potion.x, f4.rest.z - f4.potion.z) < 6
  && !!f4.bossDoor && f4.rest.z < 0, { rest: f4.rest, potion: f4.potion, door: f4.bossDoor });

console.log('\n── 2. the promises seal their chests ───────────────────');
for (const [room, id, cx, cz] of [['f1b', 'c_f1b_ice', 7.5, -6.5], ['f4', 'c_f4_scour', 13.5, -9.0], ['f5', 'c_f5_ice', 10.5, -11.5]]) {
  await go(room);
  const r = await reachable(cx, cz, 1.2);
  const ice = await wk.page.evaluate(() => (window.__game.world.shatterables || []).filter((s) => !s.broken).length);
  check(`${room}: ${id} cannot be walked to while the ice stands`, !r && ice >= 1, { reachable: r, ice });
}
// ...and the frost wolf opens one: breathe at f4's block, then the chest is reachable
await go('f4', [...FORMS, 'frost_wolf']);
await wk.page.evaluate(() => window.__game.player.setForm('frost_wolf'));
await wk.walkTo(13.0, -3.6, { timeout: 60, arrive: 1.2 });
for (let i = 0; i < 5; i++) { await wk.page.keyboard.press('k'); await wk.page.waitForTimeout(600); await quiet(); }
const scour = await wk.page.evaluate(() => ({
  ice: (window.__game.world.shatterables || []).filter((s) => !s.broken).length,
  flag: !!window.__game.WS.get('frost', 'ice_f_scour') }));
const scourOpen = await reachable(13.5, -9.0, 1.2);
check('the Frost Wolf shatters the scour ice and the chest is reachable', scour.ice === 0 && scour.flag && scourOpen, { ...scour, reachable: scourOpen });

console.log('\n── 3. the Icebound Hall ────────────────────────────────');
await go('f2');
await wk.page.evaluate(() => window.__game.player.setForm('fire_wolf'));
const gateShut = await reachable(0, -12.4, 0.6);
check('the frost gate blocks the way north while the bowls are cold', !gateShut);
// each bowl, the way run-l4 does it: stand south of it and step IN so the
// last movement faces the bowl (breath is a cone), BREATHE (l) to melt the
// shell, wait a beat of game time, step closer, SLAM (k) to light it.
const gameWait = (gs) => wk.page.evaluate(async (g) => {
  const t0 = window.__game.player._time;
  while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120));
}, gs);
const bowls = () => wk.page.evaluate(() => (window.__game.world.braziers || []).map((b) => ({ id: b.id, iced: !!b.iced, lit: !!b.lit })));
for (let round = 0; round < 2; round++) {
  for (const [bx, bz] of [[-5.4, -1.2], [0, -4.2], [5.4, -1.2]]) {
    await wk.walkTo(bx, bz + 3.0, { timeout: 40, arrive: 0.6 });
    await wk.walkTo(bx, bz + 2.0, { timeout: 10, arrive: 0.4 });
    await wk.page.keyboard.press('l'); await gameWait(1.2); await quiet();
    await wk.walkTo(bx, bz + 1.4, { timeout: 8, arrive: 0.4 });
    await wk.page.keyboard.press('k'); await gameWait(2.4); await quiet();
    const b = (await bowls()).find((x) => Math.abs(x.id.length) && true);
    if (b && !b.lit) { await wk.page.keyboard.press('k'); await gameWait(2.6); await quiet(); }
  }
  if ((await bowls()).every((b) => b.lit)) break;
}
console.log('  bowls:', JSON.stringify(await bowls()));
const hall = await wk.page.evaluate(() => ({
  lit: (window.__game.world.braziers || []).filter((b) => b.lit).length,
  flag: !!window.__game.WS.get('frost', 'braziers') }));
const gateOpen = await reachable(0, -12.4, 0.6);
check('melt then light, three times, opens the gate', hall.lit === 3 && hall.flag && gateOpen, { ...hall, gateOpen });

console.log('\n── 4. the Frozen Lake ──────────────────────────────────');
await go('f3');
const stones = () => wk.page.evaluate(() => (window.__game.world.boulders || []).map((b) => ({
  x: +b.collider.x.toFixed(2), z: +b.collider.z.toFixed(2), locked: !!b._locked })));
// A SKID STARTS AFTER THE LEAN, NOT ON THE KEY. world.js needs 0.12s of
// leaning before it commits a slide, so the first cut of this waited for
// "nothing is sliding" the instant the key came up, found nothing sliding
// yet, and read the stone's OLD position — the slide happened after the
// check. Wait for a slide to begin (up to 2s), then for it to end.
const settled = () => wk.page.evaluate(async () => {
  const sliding = () => (window.__game.world.boulders || []).some((b) => b._slide);
  for (let w = 0; w < 14 && !sliding(); w++) await new Promise((r) => setTimeout(r, 150));
  for (let w = 0; w < 80 && sliding(); w++) await new Promise((r) => setTimeout(r, 150));
  await new Promise((r) => setTimeout(r, 400));   // the snap-to-plate and the flag
});
// lean on a stone from the far side of the way it should go, hold the key
const push = async (i, dx, dz, key) => {
  // BACK THROUGH THE LANE FIRST. After a north push the player stands north of
  // the ridge, in a 2u lane; a straight walk to the next stone hits the ridge
  // and wedges. Straight south down the lane is always open.
  const pos = await wk.wk('pos');
  if (pos.z < -1.0) await wk.walkTo(pos.x, 3.2, { timeout: 15, arrive: 0.5 }).catch(() => {});
  const b = (await stones())[i];
  const lane = b.z + 2.6;                                  // approach from the south bank side
  await wk.walkTo(b.x - dx * 1.35, lane, { timeout: 20, arrive: 0.5 }).catch(() => {});
  await wk.walkTo(b.x - dx * 1.35, b.z - dz * 1.35, { timeout: 20, arrive: 0.3 });
  // HOLD THE KEY UNTIL THE STONE COMMITS. The lean only accrues while Kael is
  // pressed within 1.04u of the stone, and the collider holds him at 0.94, so
  // at 1x speed the 0.12s of lean takes the best part of a second of jitter
  // to add up (measured: 0.11 at 900ms). A fixed 600ms hold pushed the west
  // stone by luck and the east one not at all.
  await wk.page.keyboard.down(key);
  await wk.page.evaluate(async (idx) => {
    for (let w = 0; w < 30; w++) {
      if ((window.__game.world.boulders || [])[idx]?._slide) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, i);
  await wk.page.keyboard.up(key);
  await settled();
  await quiet();
};
const before = await stones();
check('two stones on the lake, at v3.21\'s marks', before.length === 2
  && Math.abs(before[0].x + 7) < 0.1 && Math.abs(before[1].x - 7) < 0.1, before);
await push(0, 1, 0, 'd');                                  // west stone EAST into its stopper
let s = await stones();
check('the west stone skids and stops in its lane at x -3.0', Math.abs(s[0].x + 3.0) < 0.15 && Math.abs(s[0].z - 1.6) < 0.15, s[0]);
await push(0, 0, -1, 'w');                                 // then NORTH onto its plate
s = await stones();
const p1 = await wk.page.evaluate(() => !!window.__game.state.flags.plates.f3_p1);
check('...and north onto plate f3_p1', p1 && s[0].locked, { stone: s[0], p1 });
await push(1, -1, 0, 'a');                                 // east stone WEST into its stopper
s = await stones();
check('the east stone stops at x 3.0', Math.abs(s[1].x - 3.0) < 0.15, s[1]);
await push(1, 0, -1, 'w');
const lake = await wk.page.evaluate(() => ({
  p1: !!window.__game.state.flags.plates.f3_p1, p2: !!window.__game.state.flags.plates.f3_p2 }));
const lakeOpen = await reachable(0, -12.4, 0.6);
check('both plates pressed and the gate north is open', lake.p1 && lake.p2 && lakeOpen, { ...lake, lakeOpen });

console.log('\n── 5. the summit ───────────────────────────────────────');
await go('f5');
const eyrie = await shape();
check('Boreal is here and the way down is plugged', eyrie.boss && eyrie.plug && !eyrie.doors.includes('q1'), eyrie);
await wk.page.evaluate(() => { window.__game.state.flags.borealDefeated = true; });
await go('f5');
const calmed = await shape();
const shrine = await wk.page.evaluate(() => window.__game.world.markers.borealShrine || null);
check('calmed: her rime-light rests and the road to the Drowned Market is open',
  !calmed.boss && calmed.doors.includes('q1') && !!shrine, { doors: calmed.doors, shrine });

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the mountain rebuilt, and every door on it earned');
process.exit(errors.length ? 1 : 0);
