// THE VANES, ALONE. svn's exit opens when ALL THREE lanes blow e/w (the
// check crosses z=-2.2 every frame). Minimum-turn solve: dash EACH vane
// until ITS lane lies along the corridor, then stop touching it — every
// turn rebuilds the weather mesh, and hammering rebuilds is the prime
// suspect in two renderer deaths in this room.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-5/vane-probe', timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('VANES');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.borealDefeated = true;
  g.WS.set('storm', 'spark', true);
});
await d.jump('svn', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});

const gameWait = (gs) => d.page.evaluate(async (g) => {
  const t0 = window.__game.player._time;
  while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120));
}, gs);
async function form(want) {
  for (let i = 0; i < 12; i++) {
    const cur = await d.wk('form');
    if (cur === want) return true;
    await d.tap('Tab');
    await d.page.waitForFunction((c) => window.__wk.form !== c, cur, { timeout: 2000 }).catch(() => {});
  }
  return false;
}
const vanes = () => d.page.evaluate(() =>
  (window.__game.world.vanes || []).map((v) => ({ x: v.x, z: v.z, dir: v.dir })));
const turned = () => d.page.evaluate(() => !!window.__game.WS.get('storm', 'vanesTurned'));

await form('storm_wolf');
say('vanes start:', JSON.stringify(await vanes()));

// EVERY vane-direction change, timestamped with the player's position — the
// last run drove all three to e/w and one silently flipped back afterwards.
await d.page.evaluate(() => {
  window.__vaneLog = [];
  const dirs = () => (window.__game.world.vanes || []).map((v) => v.dir).join(',');
  let last = dirs();
  setInterval(() => {
    const now = dirs();
    if (now !== last) {
      const p = window.__game.player.root.position;
      window.__vaneLog.push({ t: +window.__game.player._time.toFixed(1), from: last, to: now,
        px: +p.x.toFixed(1), pz: +p.z.toFixed(1) });
      last = now;
    }
  }, 200);
});

// one vane at a time, minimum turns: dash from the open side until its lane
// lies e/w. The rightmost vane's clean floor is EAST; the others', WEST.
for (let vi = 0; vi < 3; vi++) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const v = (await vanes())[vi];
    if (v.dir === 'e' || v.dir === 'w') { say(`  vane ${vi} lies ${v.dir} — done`); break; }
    const side = v.x >= 6 ? 2.9 : -2.9;
    const sx = v.x + side, pre = v.x + side * 1.9;
    await d.walkTo(pre, v.z, { timeout: 16, arrive: 0.7 });
    await d.walkTo(sx, v.z, { timeout: 8, arrive: 0.45 });
    await d.tap('k');
    await gameWait(1.0);
    const nv = (await vanes())[vi];
    say(`  vane ${vi} dash: ${v.dir} -> ${nv.dir}  (turned=${await turned()})`);
    await gameWait(7.6);
  }
}
say('vane changes:', JSON.stringify(await d.page.evaluate(() => window.__vaneLog)));
const final = await vanes();
const ok = await turned();
say('vanes final:', JSON.stringify(final), 'vanesTurned:', ok);
const door = (await d.wk('doors')).find((x) => x.to === 'sc3');
say('east door open:', door && door.open !== false);
say('VANES', ok ? 'SOLVED' : 'NOT SOLVED');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(ok ? 0 : 1);
