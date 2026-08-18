// L7 ASH WING, ALONE. Nail the skirt-navigation past the wing walls, the earth
// crack, and the ember relic — then port the pattern to all four wings.
// Geometry: wings are 26x20 (x[-13,13] z[-10,10]). Entry walls x=±6 z[-4,4].
// xa1 enter (11,0), w->xa2. xa2 spawn (8,0), gate crack (-6.5,0), wall x=-9
// z[-4,4], w->xa3. xa3 enter (11,0), ember relic (-6,0).
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-7/wing-probe', timescale: TS });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

await d.newGame('WING');
await d.page.evaluate(() => { const g = window.__game; g.state.flags.meriDefeated = true; g.WS.set('court', 'spark', true); });
await d.jump('xa1', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});

const gameWait = (gs) => d.page.evaluate(async (g) => { const t0 = window.__game.player._time; while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120)); }, gs);
const settle = () => d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).then(() => d.page.waitForTimeout(300)).catch(() => {});
async function form(want) { for (let i = 0; i < 12; i++) { const c = await d.wk('form'); if (c === want) return true; await d.tap('Tab'); await d.page.waitForFunction((cc) => window.__wk.form !== cc, c, { timeout: 2000 }).catch(() => {}); } return false; }
const flagCracked = (id) => d.page.evaluate((i) => !!window.__game.state.flags.cracked[i], id);

// go to `to`, walking the given skirt waypoints first (each a [x,z]).
async function goSkirt(to, skirt) {
  for (let t = 0; t < 3; t++) {
    if ((await d.wk('room')) === to) { await settle(); return true; }
    for (const w of skirt) { await d.walkTo(w[0], w[1], { timeout: 16 }); if ((await d.wk('room')) === to) { await settle(); return true; } }
    const door = (await d.wk('doors')).find((x) => x.to === to);
    if (!door) { bad(`no door to ${to} from ${await d.wk('room')}`); return false; }
    const r = await d.walkTo(door.x, door.z, { timeout: 20, arrive: 0.4 });
    if (r.roomChanged === to || (await d.wk('room')) === to) { await settle(); return true; }
    if (r.ok) { const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0, oz = ox === 0 ? Math.sign(door.z) : 0;
      await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 }); }
    if ((await d.wk('room')) === to) { await settle(); return true; }
  }
  bad(`could not reach ${to} (at ${JSON.stringify(await d.wk('pos'))})`); return false;
}

say('xa1 doors:', (await d.wk('doors')).map((x) => x.to).join(','), 'pos', JSON.stringify(await d.wk('pos')));
// xa1 -> xa2: skirt the entry walls north (z=7), cross west, drop to the door
await goSkirt('xa2', [[11, 7], [-11, 7], [-11, 0]]);
say('  in', await d.wk('room'), 'at', JSON.stringify(await d.wk('pos')));

// crack the gate at (-6.5,0): earth STOMP is AoE, stand within reach
if ((await d.wk('room')) === 'xa2') {
  let cracked = false;
  for (let a = 0; a < 5 && !cracked; a++) {
    await form('earth_wolf');
    await d.walkTo(-4.5, 0, { timeout: 16, arrive: 1.0 });   // east of the gate, in stomp range
    await d.tap('k'); await gameWait(1.0);
    cracked = await flagCracked('x_ash_vault');
    say(`  crack ${a}: cracked=${cracked} at ${JSON.stringify(await d.wk('pos'))}`);
    if (!cracked) await gameWait(3.2);
  }
  if (!cracked) bad('x_ash_vault not cracked');
  // xa2 -> xa3: past the x=-9 wall, skirt north
  await goSkirt('xa3', [[-4, 7], [-11, 7], [-11, 0]]);
}

// grab the ember relic at (-6,0)
if ((await d.wk('room')) === 'xa3') {
  say('  in xa3 at', JSON.stringify(await d.wk('pos')));
  await d.walkTo(-6, 0, { timeout: 20, arrive: 1.0 });
  await d.page.waitForTimeout(1500);
  const got = await d.page.evaluate(() => window.__game.WS.get('court', 'relic_ember'));
  if (!got) bad(`ember relic not collected (at ${JSON.stringify(await d.wk('pos'))})`);
  else say('  EMBER RELIC collected');
}

say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
