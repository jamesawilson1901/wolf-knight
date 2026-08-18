// GRIMM FIGHT DIAGNOSTIC. Pre-wound to 15 (enraged). For ~70s, chase the CORE
// and tap J when close, logging action + coreHp + core/player positions every
// iteration. Reveals: the action cadence under the ~5fps headless clock, where
// the core sits in tired/recover, and whether a J from ~1u actually lands.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-7/grimm-diag', timescale: 1 });
const say = (...a) => console.log(...a);
const ALLFORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
async function form(want) { for (let i = 0; i < 12; i++) { const c = await d.wk('form'); if (c === want) return true; await d.tap('Tab'); await d.page.waitForFunction((cc) => window.__wk.form !== cc, c, { timeout: 2000 }).catch(() => {}); } return false; }
const gameWait = (gs) => d.page.evaluate(async (g) => { const t0 = window.__game.player._time; while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 100)); }, gs);
const geom = () => d.page.evaluate(() => {
  const b = window.__game.world.boss, p = window.__game.player;
  if (!b || !b.coreHittable) return null;
  return {
    a: b.action, hp: b.coreHp,
    cx: +b.coreHittable.x.toFixed(2), cz: +b.coreHittable.z.toFixed(2),
    px: +p.root.position.x.toFixed(2), pz: +p.root.position.z.toFixed(2),
    hearts: p.hearts, iframes: +(p.iframes || 0).toFixed(2),
    form: window.__game.state.form, lastEl: b._lastElement || null,
    ry: +p.root.rotation.y.toFixed(2), lock: +(p.lockTime || 0).toFixed(2),
    pend: p._pendingHit ? 1 : 0,
  };
});
const PROBE_HP = process.env.WK_GRIMM_HP ? parseFloat(process.env.WK_GRIMM_HP) : 15;
// turn to face (x,z) using the bearing/rotation loop proven in run-l3/l7
async function aimAt(x, z) {
  for (let i = 0; i < 6; i++) {
    const p = await d.wk('pos');
    const ry = await d.page.evaluate(() => window.__game.player.root.rotation.y);
    let diff = Math.atan2(x - p.x, z - p.z) - ry;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.5) return true;
    const dx = x - p.x, dz = z - p.z;
    const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
    await d.page.keyboard.down(key); await d.page.waitForTimeout(200); await d.page.keyboard.up(key);
  }
  return false;
}

await d.newGame('DIAG');
await d.page.evaluate((hp) => {
  const g = window.__game;
  g.state.flags.meriDefeated = true;
  g.state.flags.grimmHp = hp;
}, PROBE_HP);
await d.jump('xth', ALLFORMS);
await d.page.evaluate(() => { window.__game.state.form = 'fire_wolf'; });
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});
await form('fire_wolf');
say('start:', JSON.stringify(await geom()));

const t0 = Date.now();
let i = 0;
while ((Date.now() - t0) / 1000 < 70) {
  const g = await geom();
  if (!g) { say('no boss'); break; }
  const distN = Math.hypot(g.cx - g.px, g.cz - g.pz);
  const dist = distN.toFixed(2);
  const before = g.hp;
  // keep a CLEAR standoff (~1.5u), then AIM at the core, then swing. The bug was
  // facing: at overlap/offset the swing pointed away. aimAt turns to the bearing.
  if (distN > 2.4) await d.walkTo(g.cx, g.cz, { timeout: 1.6, arrive: 1.5 });
  await aimAt(g.cx, g.cz);
  const p2 = await d.wk('pos');
  const standoff = Math.hypot(g.cx - p2.x, g.cz - p2.z).toFixed(2);
  await d.tap('j'); await gameWait(0.4);   // GAME-time: let the 0.2s hitAt resolve
  void standoff;
  const after = await geom();
  say(`i${i} a=${g.a} form=${g.form} hp ${before}->${after ? after.hp : '?'} dist=${dist} standoff=${standoff} ry=${g.ry} lock=${g.lock} pend=${g.pend} lastEl=${g.lastEl} hearts=${g.hearts}`);
  i++;
}
say('final:', JSON.stringify(await geom()));
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(0);
