// GRIMM CLEAN-WINDOW MELEE PROBE. Pre-wound 15. KITE safely (back off from any
// attack so we never take a hit -> never in hitstun), and swing ONLY during the
// stationary tired/recover windows, with aimAt + rich logging (ry, aim diff,
// hp before/after). Settles the question: can a clean, well-aimed bite land?
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-7/grimm-clean', timescale: 1 });
const say = (...a) => console.log(...a);
const ALLFORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
async function form(want) { for (let i = 0; i < 12; i++) { const c = await d.wk('form'); if (c === want) return true; await d.tap('Tab'); await d.page.waitForFunction((cc) => window.__wk.form !== cc, c, { timeout: 2000 }).catch(() => {}); } return false; }
const gameWait = (gs) => d.page.evaluate(async (g) => { const t0 = window.__game.player._time; while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 100)); }, gs);
const geom = () => d.page.evaluate(() => {
  const b = window.__game.world.boss, p = window.__game.player;
  if (!b || !b.coreHittable) return null;
  return { a: b.action, hp: b.coreHp, cx: +b.coreHittable.x.toFixed(2), cz: +b.coreHittable.z.toFixed(2),
    px: +p.root.position.x.toFixed(2), pz: +p.root.position.z.toFixed(2), ry: +p.root.rotation.y.toFixed(2),
    hearts: p.hearts, iframes: +(p.iframes || 0).toFixed(2), lock: +(p.lockTime || 0).toFixed(2) };
});
async function aimAt(x, z) {
  for (let i = 0; i < 6; i++) {
    const p = await d.wk('pos');
    const ry = await d.page.evaluate(() => window.__game.player.root.rotation.y);
    let diff = Math.atan2(x - p.x, z - p.z) - ry;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.4) return +diff.toFixed(2);
    const dx = x - p.x, dz = z - p.z;
    const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
    await d.page.keyboard.down(key); await d.page.waitForTimeout(200); await d.page.keyboard.up(key);
  }
  const p = await d.wk('pos');
  const ry = await d.page.evaluate(() => window.__game.player.root.rotation.y);
  let diff = Math.atan2(x - p.x, z - p.z) - ry;
  while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
  return +diff.toFixed(2);
}
async function backOff(cx, cz, reach) {
  const s = await d.wk('pos'); const away = Math.hypot(s.x - cx, s.z - cz) || 1;
  await d.walkTo(Math.max(-8, Math.min(8, s.x + (s.x - cx) / away * reach)), Math.max(-8, Math.min(8, s.z + (s.z - cz) / away * reach)), { timeout: 1.0, arrive: 0.6 });
}

await d.newGame('CLEAN');
await d.page.evaluate(() => { const g = window.__game; g.state.flags.meriDefeated = true; g.state.flags.grimmHp = 15; });
await d.jump('xth', ALLFORMS);
await d.page.evaluate(() => { window.__game.state.form = 'fire_wolf'; });
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});
await form('fire_wolf');
say('start:', JSON.stringify(await geom()));

const t0 = Date.now(); let swings = 0, lands = 0;
while ((Date.now() - t0) / 1000 < 110) {
  const g = await geom();
  if (!g) { say('no boss'); break; }
  const dd = Math.hypot(g.cx - g.px, g.cz - g.pz);
  if (g.a === 'tired' || g.a === 'recover') {
    if (dd > 2.2) { await d.walkTo(g.cx, g.cz, { timeout: 1.4, arrive: 1.5 }); continue; }
    const before = g.hp;
    const diff = await aimAt(g.cx, g.cz);
    await d.page.waitForTimeout(120);                 // settle (release momentum)
    await d.tap('j'); await gameWait(0.25); await d.tap('j'); await gameWait(0.4);
    const after = await geom();
    swings++;
    const landed = after && after.hp < before;
    if (landed) lands++;
    const p2 = await d.wk('pos');
    say(`SWING ${swings} a=${g.a} hp ${before}->${after ? after.hp : '?'} ${landed ? 'LAND' : 'miss'} aimdiff=${diff} dd=${Math.hypot(g.cx - p2.x, g.cz - p2.z).toFixed(2)} ry=${g.ry} hearts=${g.hearts} ifr=${g.iframes}`);
  } else if (g.a === 'windup' || g.a === 'swipe' || g.a === 'crouch' || g.a === 'charge') {
    if (g.a === 'swipe' || g.a === 'charge') await d.tap('Space');
    await backOff(g.cx, g.cz, 4.5);
  } else {
    if (dd < 3.2) await backOff(g.cx, g.cz, 3.2);      // stay out of swipe range
  }
}
say(`RESULT: ${lands}/${swings} swings landed; final hp=${(await geom())?.hp}`);
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(0);
