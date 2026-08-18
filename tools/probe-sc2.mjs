// SC2 — THE DEVELOP STAIR, ALONE. The bot pins in the gale field and never
// reaches the north door (0,-6.6) across 4 full-route iterations. Focused:
// jump in, log position every step, find the reliable path, and prove the
// hop to s3a. Stair 24x12 (x[-12,12] z[-6,6]). Spawn (9,0) from the east.
// Lanes (all d=11 -> z[-5.5,5.5]): gust x=5.5 w4 SOUTH; gale x=-1.5 w4 SOUTH;
// breeze x=-8 w5 NORTH. Low walls at (0,-5) and (0,5), len 5 (x[-2.5,2.5]).
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-5/sc2-probe', timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('SC2');
await d.page.evaluate(() => { const g = window.__game; g.state.flags.borealDefeated = true; g.WS.set('storm', 'spark', true); });
await d.jump('sc2', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});

const gameWait = (gs) => d.page.evaluate(async (g) => {
  const t0 = window.__game.player._time;
  while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120));
}, gs);
async function form(want) {
  for (let i = 0; i < 12; i++) { const c = await d.wk('form'); if (c === want) return true;
    await d.tap('Tab'); await d.page.waitForFunction((cc) => window.__wk.form !== cc, c, { timeout: 2000 }).catch(() => {}); }
  return false;
}
const pos = () => d.wk('pos');
async function dash(x, z, sx, sz) {
  await form('storm_wolf');
  const dx = x - sx, dz = z - sz, m = Math.hypot(dx, dz) || 1;
  await d.walkTo(sx - (dx / m) * 2.4, sz - (dz / m) * 2.4, { timeout: 16, arrive: 0.7 });
  await d.walkTo(sx, sz, { timeout: 8, arrive: 0.45 });
  await d.tap('k'); await gameWait(1.0);
  say('  dash ->', JSON.stringify(await pos()));
}
async function step(x, z, label) {
  const r = await d.walkTo(x, z, { timeout: 16, arrive: 0.7 });
  say(`  ${label} -> ${JSON.stringify(await pos())} (${r.ok ? 'ok' : r.why}${r.roomChanged ? ' room:' + r.roomChanged : ''})`);
  return r;
}

say('spawn:', JSON.stringify(await pos()), 'form:', await d.wk('form'));

// dash NORTH through the door. Facing follows INPUT, so holding 'w' faces
// north even while the gale pushes south; the dash then overrides the gale
// (i-framed, 20 u/s) and carries 5.2u north through the door trigger.
async function dashNorth() {
  await form('storm_wolf');
  await d.page.keyboard.down('w'); await d.page.waitForTimeout(400); await d.page.keyboard.up('w');
  await d.tap('k'); await gameWait(1.0);
}

// THE STORM SOLUTION — the door x[-1.2,1.2] sits at the north end of the
// gale lane (x=-1.5, covers x[-3.5,0.5]). FACING FOLLOWS NET VELOCITY, so
// inside the gale 'w' nets south and dashes south. Stage at x=1.0 — EAST of
// the gale (x>0.5) yet inside the door width — where 'w' nets clean north.
await step(3, -1, 'shoulder the gust');
await step(1.0, -2, 'east edge of the door column, clear of the gale');
let p = await pos();
say('  staged:', JSON.stringify(p));
for (let a = 0; a < 5 && (await d.wk('room')) === 'sc2'; a++) {
  p = await pos();
  if (p.x < 0.4 || p.x > 1.6 || p.z < -5 || p.z > 1) await step(1.0, -2, `re-stage ${a}`);
  await dashNorth();
  say(`  dash-north ${a} -> ${JSON.stringify(await pos())} room=${await d.wk('room')}`);
  await gameWait(7.6);
}

const room = await d.wk('room');
say('final room:', room);
say('SC2->S3A', room === 's3a' ? 'CROSSED' : 'NOT CROSSED');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(room === 's3a' ? 0 : 1);
