// GRIMM MELEE-LANDING PROBE. The fight stalled: hp stuck at 32 while every
// element read "BLOCKED" — but at 32 hp Grimm resists nothing, so those were
// MISSES. __wk.boss.x/z is the ROOT; the hittable core sits at
// this.x+core.position.x, this.z+core.position.z (starts 1.4u behind). Measure
// the real core, then swing at IT and confirm coreHp drops.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-7/grimm-probe', timescale: 1 });
const say = (...a) => console.log(...a);
const ALLFORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
async function form(want) { for (let i = 0; i < 12; i++) { const c = await d.wk('form'); if (c === want) return true; await d.tap('Tab'); await d.page.waitForFunction((cc) => window.__wk.form !== cc, c, { timeout: 2000 }).catch(() => {}); } return false; }

await d.newGame('GPROBE');
await d.page.evaluate(() => { window.__game.state.flags.meriDefeated = true; });
await d.jump('xth', ALLFORMS);
await d.page.evaluate(() => { window.__game.state.form = 'fire_wolf'; });
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});

const bossGeom = () => d.page.evaluate(() => {
  const b = window.__game.world.boss;
  const ch = b.coreHittable;
  return {
    root: { x: +b.x.toFixed(2), z: +b.z.toFixed(2) },
    core: { x: +ch.x.toFixed(2), z: +ch.z.toFixed(2), r: ch.radius, dead: ch.dead },
    corePos: { x: +b.core.position.x.toFixed(2), z: +b.core.position.z.toFixed(2) },
    coreHp: b.coreHp, action: b.action,
    player: { x: +window.__game.player.root.position.x.toFixed(2), z: +window.__game.player.root.position.z.toFixed(2) },
  };
});
say('start geom:', JSON.stringify(await bossGeom()));

// Approach the CORE (not the root), stand ~1.2u north of it, face south, swing.
const gameWait = (gs) => d.page.evaluate(async (g) => { const t0 = window.__game.player._time; while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 100)); }, gs);
await form('fire_wolf');
for (let i = 0; i < 10; i++) {
  const g = await bossGeom();
  const before = g.coreHp;
  // walk to just north of the actual hittable core
  await d.walkTo(g.core.x, g.core.z + 1.15, { timeout: 6, arrive: 0.5 });
  // face the core (south, since we're north of it)
  await d.page.keyboard.down('s'); await d.page.waitForTimeout(120); await d.page.keyboard.up('s');
  await d.tap('j'); await gameWait(0.4); await d.tap('j'); await gameWait(0.4);
  const after = await bossGeom();
  say(`swing ${i}: coreHp ${before} -> ${after.coreHp} [action ${after.action}] player ${JSON.stringify(after.player)} core ${JSON.stringify(after.core)}`);
  if (after.coreHp < before) { say('  >> HIT LANDS aiming at the core'); }
}
say('final coreHp:', (await bossGeom()).coreHp);
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(0);
