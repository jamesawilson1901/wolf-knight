// L7 GALE WING, ALONE. The only real barrier is the storm-gale in xg1
// (x[0.1,3.9], blows west): a plain walk east nets west and stalls (~0.8).
// Storm thunder-dash is i-framed + wind-immune, covers 5.2u -> one dash from
// x~=-1 lands past 3.9. Then xg1->xg2 (quench the fires, tide K) -> xg3 (tide
// relic at 6,0). Nail it here, then the pattern lives in run-l7 wing('GALE').
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-7/gale-probe', timescale: TS });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

const ws = (r, k) => d.page.evaluate(({ rr, kk }) => window.__game.WS.get(rr, kk), { rr: r, kk: k });
const gameWait = (gs) => d.page.evaluate(async (g) => { const t0 = window.__game.player._time; while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120)); }, gs);
const settle = () => d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).then(() => d.page.waitForTimeout(300)).catch(() => {});
async function form(want) { for (let i = 0; i < 12; i++) { const c = await d.wk('form'); if (c === want) return true; await d.tap('Tab'); await d.page.waitForFunction((cc) => window.__wk.form !== cc, c, { timeout: 2000 }).catch(() => {}); } return false; }

await d.newGame('GALE');
await d.page.evaluate(() => { const g = window.__game; g.state.flags.meriDefeated = true; g.WS.set('court', 'spark', true); });
await d.jump('xg1', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});
say('xg1 start:', JSON.stringify(await d.wk('pos')), 'doors:', (await d.wk('doors')).map((x) => x.to).join(','));

async function dashEast(fromX, fromZ) {
  await form('storm_wolf');
  await d.walkTo(fromX, fromZ, { timeout: 16, arrive: 0.6 });
  await d.page.keyboard.down('d'); await d.page.waitForTimeout(200 / TS); await d.page.keyboard.up('d');
  await d.tap('k'); await gameWait(1.0);
}
// cross the gale
let crossed = false;
for (let a = 0; a < 4; a++) {
  if ((await d.wk('pos')).x > 4.5) { crossed = true; break; }
  await dashEast(-1, 0);
  say(`  gale dash ${a}: at ${JSON.stringify(await d.wk('pos'))}`);
}
if (!crossed && (await d.wk('pos')).x <= 4.5) bad(`did not clear the gale (at ${JSON.stringify(await d.wk('pos'))})`);
else say('  gale crossed');

// xg1 -> xg2: skirt north to the east door
async function goSkirt(to, skirt) {
  for (let t = 0; t < 3; t++) {
    if ((await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; }
    for (const w of skirt) { await d.walkTo(w[0], w[1], { timeout: 16 }); if ((await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; } }
    const door = (await d.wk('doors')).find((x) => x.to === to);
    if (!door) { bad(`no door to ${to} from ${await d.wk('room')}`); return false; }
    const r = await d.walkTo(door.x, door.z, { timeout: 20, arrive: 0.4 });
    if (r.roomChanged === to || (await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; }
    if (r.ok) { const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0, oz = ox === 0 ? Math.sign(door.z) : 0; await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 }); }
    if ((await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; }
  }
  bad(`could not reach ${to} (at ${JSON.stringify(await d.wk('pos'))})`); return false;
}
await goSkirt('xg2', [[11, 7], [11, 7], [11, 0]]);

if ((await d.wk('room')) === 'xg2') {
  say('  in xg2 at', JSON.stringify(await d.wk('pos')));
  await form('tide_wolf');
  const ready = () => d.page.evaluate(() => window.__game.player.specialCooldown <= 0);
  for (const [bx, bz] of [[-3, -3], [0, 0], [3, 3]]) {   // splash has a 6s cd
    await d.walkTo(bx, bz + 1.0, { timeout: 12, arrive: 0.9 });
    for (let w = 0; w < 30 && !(await ready()); w++) await gameWait(0.3);
    await d.tap('k'); await gameWait(0.6);
  }
  say('  galeQuenched:', await ws('court', 'galeQuenched'));
  await goSkirt('xg3', [[11, 7], [11, 7], [11, 0]]);
}

if ((await d.wk('room')) === 'xg3') {
  say('  in xg3 at', JSON.stringify(await d.wk('pos')));
  await d.walkTo(6, 0, { timeout: 20, arrive: 1.0 });
  await d.page.waitForTimeout(1500);
  const got = await ws('court', 'relic_tide');
  if (!got) bad(`tide relic not collected (at ${JSON.stringify(await d.wk('pos'))})`);
  else say('  TIDE RELIC collected');
}

say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
