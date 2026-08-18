// THE VANES, ALONE — with the ROUTE's exact dashAt (timescale-aware facing
// hold). Confirm all three turn to e/w reliably (esp. vane 2, the rightmost,
// whose own gale kept flipping the facing) before another 15-min route run.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-5/vane-probe', timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('VANES');
await d.page.evaluate(() => { const g = window.__game; g.state.flags.borealDefeated = true; g.WS.set('storm', 'spark', true); });
await d.jump('svn', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});

const gameWait = (gs) => d.page.evaluate(async (g) => {
  const t0 = window.__game.player._time;
  while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120));
}, gs);
async function form(want) {
  for (let i = 0; i < 12; i++) { const c = await d.wk('form'); if (c === want) return true;
    await d.tap('Tab'); await d.page.waitForFunction((cc) => window.__wk.form !== cc, c, { timeout: 2000 }).catch(() => {}); }
  return false;
}
async function dashAt(x, z, standX, standZ) {
  if (!(await form('storm_wolf'))) return false;
  await d.walkTo(standX, standZ, { timeout: 16, arrive: 0.6 });
  const dx = x - standX, dz = z - standZ;
  const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
  await d.page.keyboard.down(key); await d.page.waitForTimeout(200 / TS); await d.page.keyboard.up(key);
  await d.tap('k'); await gameWait(1.0);
  return true;
}
const vanes = () => d.page.evaluate(() => (window.__game.world.vanes || []).map((v) => ({ x: v.x, z: v.z, dir: v.dir })));
const turned = () => d.page.evaluate(() => !!window.__game.WS.get('storm', 'vanesTurned'));

say('vanes start:', JSON.stringify(await vanes()), 'TS', TS);
for (let vi = 0; vi < 3; vi++) {
  for (let attempt = 0; attempt < 8 && !(await turned()); attempt++) {
    const v = (await vanes())[vi];
    if (!v || v.dir === 'e' || v.dir === 'w') { say(`  vane ${vi} lies ${v && v.dir}`); break; }
    const side = v.x >= 6 ? 2.9 : -2.9;
    await dashAt(v.x, v.z, v.x + side, v.z);
    say(`  vane ${vi} att${attempt}: ${v.dir} -> ${(await vanes())[vi].dir} turned=${await turned()}`);
    await gameWait(7.6);
  }
}
const ok = await turned();
say('vanes final:', JSON.stringify(await vanes()), 'vanesTurned:', ok);
say('VANES', ok ? 'SOLVED' : 'NOT SOLVED');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(ok ? 0 : 1);
