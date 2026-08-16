// THE KNOT, ALONE. Focused iteration on tkn's tether puzzle — the full route
// costs 15 minutes to reach this room; this probe costs two.
//
// Deterministic tether approach: STAGE on open floor east of the channel
// mouth, walk STRAIGHT west along the axis to the stand point, VERIFY the
// player is actually east of the stone before every lash (run-7 pulls went
// west because the walk wandered behind it and nothing checked).
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-3/knot-probe', timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('KNOT');
await d.page.evaluate(() => { window.__game.WS.set('wild3', 'spark', true); });
await d.jump('tkn', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);

async function form(want) {
  for (let i = 0; i < 12; i++) {
    const cur = await d.wk('form');
    if (cur === want) return true;
    await d.tap('Tab');
    await d.page.waitForFunction((c) => window.__wk.form !== c, cur, { timeout: 2000 }).catch(() => {});
  }
  return false;
}
const boulder = () => d.page.evaluate(() => {
  const b = (window.__game.world.boulders || [])[0];
  return b ? { x: +(b.x ?? b.collider.x).toFixed(2), z: +(b.z ?? b.collider.z).toFixed(2) } : null;
});
async function clearFoes(radius = 7, capS = 60) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < capS) {
    await d.pickPerkIfOffered();
    const foes = await d.page.evaluate((r) => {
      const g = window.__game, p = g.player.root.position;
      return (g.world.enemies || []).filter((e) => !e.dead &&
        Math.hypot(e.x - p.x, e.z - p.z) < r).map((e) => ({ x: e.x, z: e.z }));
    }, radius);
    if (!foes.length) return true;
    await d.walkTo(foes[0].x, foes[0].z, { timeout: 4, arrive: 1.6 });
    await d.tap('j'); await d.page.waitForTimeout(260 / TS); await d.tap('j');
    await d.page.waitForTimeout(160 / TS);
  }
  return false;
}

// AIM IS CLOSED-LOOP: facing = player.root.rotation.y (fx=sin, fz=cos). At 3x
// and ~4.5fps ONE FRAME of held key moves ~1u — every hold is a 1u quantum, so
// aim with 270ms (≈1 frame) holds and VERIFY the angle before firing.
async function aimAt(x, z) {
  for (let i = 0; i < 5; i++) {
    const p = await d.wk('pos');
    const ry = await d.page.evaluate(() => window.__game.player.root.rotation.y);
    let diff = Math.atan2(x - p.x, z - p.z) - ry;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.6) return true;
    const dx = x - p.x, dz = z - p.z;
    const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
    await d.page.keyboard.down(key); await d.page.waitForTimeout(270); await d.page.keyboard.up(key);
  }
  return false;
}

await clearFoes();
let b = await boulder();
say('boulder start:', JSON.stringify(b));

// PHASE A — tether east until it FULLY clears the channel (walls end at
// x=-4; the push approach needs b.x-1.5 > -4, so hand off at -2.4).
// Stand 4.4 east (drift budget), aim closed-loop, fire only from a sane spot.
let guard = 0;
while (b && b.x < -2.4 && guard++ < 16) {
  await form('verdant_wolf');
  await d.walkTo(3.0, 2, { timeout: 18, arrive: 0.7 });          // stage: open floor
  await d.walkTo(b.x + 4.4, 2, { timeout: 15, arrive: 0.5 });    // straight in west
  await aimAt(b.x, b.z);
  const p = await d.wk('pos');
  if (p.x < b.x + 2.0 || p.x > b.x + 5.6) { say(`  (bad lash spot ${JSON.stringify(p)} — restage)`); continue; }
  await d.tap('k');
  await d.page.waitForTimeout(8000 / TS);
  const nb = await boulder();
  say(`  tether: ${b.x} -> ${nb.x}  (from ${p.x},${p.z})`);
  b = nb;
}

// PHASE B — 1u contact pushes, plate flag polled. THE STAND APPROACH NEVER
// CROSSES THE STONE'S LINE: walkTo pathing straight at a west-side point
// walked THROUGH the boulder and shoved it 3.6u back into the channel. Every
// approach is an L through a clear lane, ending with a straight final step
// whose lateral clearance exceeds the collider sum.
const pressed = () => d.page.evaluate(() => !!window.__game.state.flags.plates.l3_knot_p1);
async function standBeside(bx, bz, dx, dz) {      // (dx,dz): where to stand, relative
  const lane = bz + 2.6 * (dz >= 0 ? 1 : 1);      // south lane is open east of the walls
  await d.walkTo(bx + dx * 0.1, lane, { timeout: 12, arrive: 0.6 });
  await d.walkTo(bx + dx, lane, { timeout: 8, arrive: 0.5 });
  await d.walkTo(bx + dx, bz + dz, { timeout: 8, arrive: 0.45 });
  return d.wk('pos');
}
guard = 0;
while (b && b.x > -2.6 && guard++ < 26) {
  if (await pressed()) break;
  const p = await standBeside(b.x, b.z, -1.5, 0);
  if (p.x > b.x - 0.7) { say(`  (push stand failed: ${JSON.stringify(p)})`); continue; }
  await d.page.keyboard.down('d'); await d.page.waitForTimeout(320); await d.page.keyboard.up('d');
  let nb = await boulder();
  if (Math.abs(nb.z - 2) > 0.8 && !(await pressed())) {   // drifted off the plate line
    const side = nb.z > 2 ? 1 : -1;               // stand on the drift side, push back
    await d.walkTo(nb.x - 1.6, nb.z + side * 1.5, { timeout: 8, arrive: 0.5 });
    await d.walkTo(nb.x, nb.z + side * 1.5, { timeout: 8, arrive: 0.45 });
    const k = side > 0 ? 'w' : 's';
    await d.page.keyboard.down(k); await d.page.waitForTimeout(300); await d.page.keyboard.up(k);
    nb = await boulder();
  }
  b = nb;
  say(`  push: (${b.x},${b.z})  from (${p.x},${p.z})  plate=${await pressed()}`);
  if (b.x > 7.5 && !(await pressed())) {
    say('  (overshot the plate — pushing back west)');
    const p2 = await standBeside(b.x, b.z, 1.5, 0);
    if (p2.x > b.x + 0.7) {
      await d.page.keyboard.down('a'); await d.page.waitForTimeout(300); await d.page.keyboard.up('a');
      b = await boulder();
    }
  }
}
await d.page.waitForTimeout(1200 / TS);

const done = await pressed();
const nDoor = (await d.wk('doors')).find((x) => x.to === 'tc3');
say('plate pressed:', done, '· north door open:', nDoor && nDoor.open !== false);
say('KNOT', done ? 'SOLVED' : 'NOT SOLVED');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(done ? 0 : 1);
