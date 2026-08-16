// WHY DOES T1A'S NORTH DOOR NOT FIRE? Raw geometry + a slow instrumented walk.
// Three route-driver attempts died on this leg with the bot displaced to the
// statue; theories exhausted, so: dump the door boxes, then walk the doorway
// strip logging pos/room/hearts every tick.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-3/door-probe', timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('PROBE');
await d.jump('t1a', ['fire_wolf', 'earth_wolf']);

say('RAW DOORS:', JSON.stringify(await d.page.evaluate(() =>
  (window.__game.world.doors || []).map((x) => ({ to: x.to, minX: x.minX, maxX: x.maxX, minZ: x.minZ, maxZ: x.maxZ, when: !!x.when }))
)));
say('spawn/pos:', JSON.stringify(await d.wk('pos')),
  'boxColliders near north wall:', JSON.stringify(await d.page.evaluate(() =>
    (window.__game.world.boxColliders || []).filter((b) => b.minZ < -10.5).slice(0, 12))));

await d.walkTo(3.2, 5, { timeout: 22 });
await d.walkTo(3.2, -4, { timeout: 22 });
await d.walkTo(0, -8, { timeout: 22 });
say('staged at', JSON.stringify(await d.wk('pos')));

// hold 'w' and sample every 120ms until room change, death, or 12s
await d.page.keyboard.down('w');
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 12000) {
  const s = await d.page.evaluate(() => ({
    x: +window.__game.player.root.position.x.toFixed(2),
    z: +window.__game.player.root.position.z.toFixed(2),
    room: window.__wk.room, hearts: window.__wk.hearts,
    gates: window.__wk.gates,
  }));
  const line = JSON.stringify(s);
  if (line !== last) { say('tick', ((Date.now() - t0) / 1000).toFixed(1), line); last = line; }
  if (s.room !== 't1a') { say('TRANSITIONED to', s.room); break; }
  if (s.hearts <= 0.5) { say('DIED'); break; }
  await d.page.waitForTimeout(120);
}
await d.page.keyboard.up('w');
say('final:', JSON.stringify(await d.wk()));
say('errors:', JSON.stringify(d.errors));
await d.close();
