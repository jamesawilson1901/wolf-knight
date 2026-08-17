// THE FROZEN LAKE, ALONE. Focused iteration (the knot lesson: 2 minutes per
// try, not 15). First job: dump world.boulders RAW — the route's position
// reads looked stale for these old-style stones. Then solve with VERIFIED
// pushes, and recover from any bad slide the way a kid does: leave the room
// and come back — stones reset, PRESSED PLATES PERSIST (flags.plates).
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-4/lake-probe', timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('LAKE');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.sylvaDefeated = true;
  g.WS.set('frost', 'braziers', true);
});
await d.jump('f3', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});

say('RAW boulders:', JSON.stringify(await d.page.evaluate(() =>
  (window.__game.world.boulders || []).map((b) => ({
    keys: Object.keys(b), x: b.x, z: b.z,
    collider: b.collider ? { x: b.collider.x, z: b.collider.z, r: b.collider.r } : null,
    locked: !!b._locked, slide: !!b._slide,
  })))));

// live position: prefer the collider (the physics truth), fall back to x/z
const stones = () => d.page.evaluate(() =>
  (window.__game.world.boulders || []).map((b) => ({
    x: +((b.collider && b.collider.x != null ? b.collider.x : b.x)).toFixed(2),
    z: +((b.collider && b.collider.z != null ? b.collider.z : b.z)).toFixed(2),
    locked: !!b._locked,
  })));
const plates = () => d.page.evaluate(() => ({
  p1: !!window.__game.state.flags.plates.f3_p1, p2: !!window.__game.state.flags.plates.f3_p2 }));

// a VERIFIED contact push: stand exactly beside the stone on its row/column,
// hold, confirm it moved; realign and retry up to 3 times
async function push(i, dx, dz, key) {
  for (let a = 0; a < 3; a++) {
    const b = (await stones())[i];
    if (!b) return null;
    const sx = Math.max(-8.3, Math.min(8.3, b.x + dx * 1.35));
    const sz = Math.max(-6.2, Math.min(5.8, b.z + dz * 1.35));
    // the knot's L-approach: side lane, far corner, contact row — a straight
    // walk at a wall-side stand point jams and turns the contact diagonal
    const lane = b.z + 2.6 <= 5.8 ? b.z + 2.6 : b.z - 2.6;
    await d.walkTo(b.x + (dx ? 0 : dz * 0.1), lane, { timeout: 12, arrive: 0.6 }).catch(() => {});
    await d.walkTo(sx, lane, { timeout: 10, arrive: 0.5 }).catch(() => {});
    await d.walkTo(sx, sz, { timeout: 10, arrive: 0.3 });
    await d.page.keyboard.down(key); await d.page.waitForTimeout(430); await d.page.keyboard.up(key);
    await d.page.evaluate(async () => {         // wait until nothing slides
      for (let w = 0; w < 40; w++) {
        if (!(window.__game.world.boulders || []).some((x) => x._slide)) break;
        await new Promise((r) => setTimeout(r, 150));
      }
    });
    const nb = (await stones())[i];
    say(`    push[${i}] ${key}: (${b.x},${b.z}) -> (${nb.x},${nb.z})`);
    if (Math.abs(nb.x - b.x) > 0.2 || Math.abs(nb.z - b.z) > 0.2) return nb;
  }
  return (await stones())[i];
}

// reset the stones by walking out south and back in (plates persist)
async function resetRoom() {
  say('  (resetting the lake by re-entry)');
  const s = (await d.wk('doors')).find((x) => x.to === 'f2');
  await d.walkTo(s.x, s.z, { timeout: 30, arrive: 0.4 });
  await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  const back = (await d.wk('doors')).find((x) => x.to === 'f3');
  await d.walkTo(back.x, back.z, { timeout: 30, arrive: 0.4 });
  await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  await d.page.waitForTimeout(400);
}

for (let round = 0; round < 5; round++) {
  const p = await plates();
  if (p.p1 && p.p2) break;
  const bs = await stones();
  say(`round ${round}: stones ${JSON.stringify(bs)} plates ${JSON.stringify(p)}`);
  // fresh stones sit at (±7,1.6); anything else is a bad state — reset
  const fresh = bs.filter((b) => !b.locked).every((b) => Math.abs(b.z - 1.6) < 0.4 && (Math.abs(b.x + 7) < 0.5 || Math.abs(b.x - 7) < 0.5));
  if (!fresh && bs.some((b) => !b.locked)) { await resetRoom(); continue; }
  for (let i = 0; i < bs.length; i++) {
    const cur = (await stones())[i];
    if (!cur || cur.locked) continue;
    const west = cur.x < 0;
    if ((west && (await plates()).p1) || (!west && (await plates()).p2)) continue;
    // east/west into the stopper...
    let b2 = await push(i, west ? -1 : 1, 0, west ? 'd' : 'a');
    if (!b2 || Math.abs(Math.abs(b2.x) - 3) > 0.6) { say('  (stopper missed — reset next round)'); continue; }
    // ...then north up the lane onto the plate
    await push(i, 0, 1, 'w');
    say('  plates now:', JSON.stringify(await plates()));
  }
}

const done = await plates();
const gate = (await d.wk('doors')).find((x) => x.to === 'f4');
say('plates:', JSON.stringify(done), '· f4 door open:', gate && gate.open !== false);
say('LAKE', done.p1 && done.p2 ? 'SOLVED' : 'NOT SOLVED');
await d.shot('lake');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(done.p1 && done.p2 ? 0 : 1);
