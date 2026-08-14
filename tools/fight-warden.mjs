// THE BONE WARDEN, FOUGHT BY HIS STATE MACHINE. Focused: dev-jump straight to
// the crypt (vz), knight/dark/fire, warden present. His machine (js/enemies.js
// BoneWarden): chop_tele ~0.7s → chop (130° cone, 2.9u — sidestep); spin_tele
// → spin (whole-circle ring — sprint out past its edge, never toward the south
// crypt door); tired ~2.6s (wide open — punish). Real keyboard input. Every
// loss diagnosed against the machine before any game code is suspected.
//
// WK_TIMESCALE scales the world for the boss ladder (1 → 0.5 → 0.25). A win
// below 1x is a flagged partial; full-speed timing is proved by separate probes.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-2/warden${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('WARDEN');
// enter with the region's earned kit and all three milestones done, as a child
// arrives at the crypt after solving Stoneroot with fire
await d.page.evaluate(() => { const g = window.__game;
  for (const k of ['spark', 'drained', 'handDown']) g.WS.set('vault', k, true); });
await d.jump('vz', ['knight', 'dark_wolf', 'fire_wolf']);
await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
say('arena:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('arena');

const seen = { states: new Set(), deaths: 0, respawns: [] };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts;

while ((Date.now() - t0) / 1000 < 45 * 60) {
  const s = await d.wk();
  if (s.room !== 'vz') {
    const won = await d.page.evaluate(() => !!window.__wk.flags.wardenDefeated);
    if (won) { say('DEFEATED (left arena after kill)'); break; }
    say('  left arena — walking back');
    const door = (await d.wk('doors')).find((x) => x.to === 'vz');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
    continue;
  }
  const b = s.boss;
  if (!b) {
    const won = await d.page.evaluate(() => !!window.__wk.flags.wardenDefeated);
    if (won) { say('DEFEATED'); break; }
    await d.page.waitForTimeout(500); continue;
  }
  seen.states.add(b.state);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++; say(`DEATH #${seen.deaths} [hp ${b.hp} state ${b.state}]`);
    await d.page.waitForTimeout(4500 / TS);
    const back = await d.wk(); seen.respawns.push(back.room);
    if (back.room !== 'vz') { const dr = (await d.wk('doors')).find((x) => x.to === 'vz'); if (dr) await d.walkTo(dr.x, dr.z, { timeout: 30 }); }
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
  }
  lastHearts = s.hearts;
  if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');

  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const dist = Math.hypot(dx, dz);
  if (b.state === 'spin_tele' || b.state === 'spin') {
    const nx = dist < 0.01 ? 1 : -dx / dist, nz = dist < 0.01 ? 0 : -dz / dist;
    let tx = s.pos.x + nx * 5, tz = s.pos.z + nz * 5;
    if (tz > 4) { tz = -6; tx = b.x + (s.pos.x >= b.x ? 5 : -5); }  // door is south
    await d.walkTo(Math.max(-11, Math.min(11, tx)), Math.max(-11, Math.min(4, tz)), { timeout: 2.2, arrive: 0.7 });
  } else if (b.state === 'chop_tele' || b.state === 'chop') {
    const px = Math.abs(dx) > Math.abs(dz) ? (dz > 0 ? 'w' : 's') : (dx > 0 ? 'a' : 'd');
    await d.page.keyboard.down(px); await d.page.waitForTimeout(500 / TS); await d.page.keyboard.up(px);
  } else if (b.state === 'tired') {
    if (dist > 1.5) await d.walkTo(b.x, b.z, { timeout: 2, arrive: 1.3 });
    else { const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(k); await d.page.waitForTimeout(120); await d.page.keyboard.up(k);
      await d.tap('j'); await d.page.waitForTimeout(180 / TS); await d.tap('j'); }
  } else { // chase
    if (dist > 2.2) await d.walkTo(b.x, b.z, { timeout: 1.5, arrive: 2 });
    else { await d.tap('j'); await d.page.waitForTimeout(200 / TS); }
  }
  if (b.hp !== lastHp) { say(`hp ${lastHp} -> ${b.hp} [${b.state}]`); lastHp = b.hp; }
}

const flags = await d.page.evaluate(() => ({ warden: !!window.__wk.flags.wardenDefeated, forms: window.__wk.forms }));
say('FLAGS:', JSON.stringify(flags));
say('SEEN:', JSON.stringify({ states: [...seen.states], deaths: seen.deaths, respawns: seen.respawns }));
await d.shot('post');
d.saveLog('warden');
const won = flags.warden && flags.forms.includes('earth_wolf');
say(won ? `WARDEN DEFEATED at ${TS}x — EARTH WOLF granted` : 'NOT DEFEATED');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
