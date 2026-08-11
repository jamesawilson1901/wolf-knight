// CAN YOU JUST RUN PAST EVERYTHING?
//
// Dad, after playing: "the game is too easy. not in terms of hp and attack power
// etc, its easy because I can literally run straight through each level without
// getting hurt. the terranigma games that was near impossible on most levels."
//
// So this does exactly that and counts the cost. It drives the player from the
// spawn to the far door at full Dark Wolf speed, never attacking, never dodging,
// and reports how many hearts the crossing cost and how close anything got.
//
// A room that charges nothing is a room a child can ignore.
import { chromium } from 'playwright';

const ROOMS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['la', 'lb', 'lc', 'ld', 'le', 'vh', 'va1', 'va2', 'vb1', 'vb2', 'vc1', 'vc2',
     't1b', 't2b', 't3b', 's2b', 's3b', 'd2b', 'd3b', 'xa1', 'xr1', 'xm1'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SPRINT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.state.flags.bossDefeated = true;
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

console.log('room   foes  hearts lost  closest foe  time    verdict');
const rows = [];
for (const room of ROOMS) {
  if (!(await go(room))) { console.log(room.padEnd(6), 'BUILD FAILED'); continue; }
  const r = await page.evaluate(async () => {
    const g = window.__game, w = g.world;
    g.player.iframes = 0;
    g.state.form = 'dark_wolf';
    if (g.player.setForm) g.player.setForm('dark_wolf');
    g.player.hearts = g.player.maxHearts || 5;
    const start = g.player.hearts;
    const sp = w.spawn || { x: 0, z: 0 };
    g.player.root.position.set(sp.x, g.player.root.position.y, sp.z);
    // the far door: what a child is heading for
    const mid = (d) => ({ x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2, to: d.to });
    let far = null, best = -1;
    for (const d of (w.doors || []).map(mid)) {
      const dd = Math.hypot(d.x - sp.x, d.z - sp.z);
      if (dd > best) { best = dd; far = d; }
    }
    if (!far) return null;
    const foes = (w.enemies || []).filter((e) => !e.dead && !e.scenery && e.takeStun).length;
    // HOLD THE STICK FORWARD AND NOTHING ELSE. No attack, no dodge, no defend.
    let closest = Infinity, elapsed = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 40000) {
      await new Promise((res) => requestAnimationFrame(res));
      const p = g.player.root.position;
      const dx = far.x - p.x, dz = far.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 1.2) break;
      // drive the real input axis, so movement goes through the real controller
      if (g.input) { g.input.move.x = dx / len; g.input.move.z = dz / len; }
      for (const e of (w.enemies || [])) {
        if (e.dead || e.scenery) continue;
        closest = Math.min(closest, Math.hypot(e.x - p.x, e.z - p.z));
      }
    }
    elapsed = (performance.now() - t0) / 1000;
    if (g.input) { g.input.move.x = 0; g.input.move.z = 0; }
    // AND CAN YOU ACTUALLY LEAVE?
    //
    // The first version of this walked to the doorway and stopped, so a SEALED
    // room measured exactly like an open one — it reported the encounter lock as
    // having changed nothing, when what it had really done was fail to look. The
    // question is not "did I reach the doorway", it is "did the doorway let me
    // through", and world.doorAt is the game's own answer to that.
    const p = g.player.root.position;
    const canLeave = !!(w.doorAt && w.doorAt(far.x, far.z));
    return { foes, lost: +(start - g.player.hearts).toFixed(2),
      closest: closest === Infinity ? null : +closest.toFixed(2),
      secs: +elapsed.toFixed(1), sealed: !!w.sealed, canLeave,
      reached: Math.hypot(far.x - p.x, far.z - p.z) < 1.6, to: far.to };
  });
  if (!r) { console.log(room.padEnd(6), 'no door'); continue; }
  rows.push({ room, ...r });
  const verdict = r.sealed && !r.canLeave ? 'SEALED — cannot leave until cleared'
    : r.lost === 0 ? 'FREE — walked past everything'
    : r.lost < 0.5 ? 'nearly free' : 'costs something';
  console.log(room.padEnd(6), String(r.foes).padEnd(5), String(r.lost).padEnd(11),
    String(r.closest).padEnd(12), String(r.secs).padEnd(7), verdict);
}
// FREE means you crossed it AND walked out the other side untouched. A room you
// cannot leave is not free, whatever the crossing cost.
const free = rows.filter((r) => r.lost === 0 && r.canLeave);
const sealed = rows.filter((r) => r.sealed);
console.log(`\n${free.length}/${rows.length} rooms can be crossed AND left for nothing.`);
console.log(`${sealed.length}/${rows.length} rooms sealed on entry.`);
if (free.length) console.log('free: ' + free.map((r) => `${r.room}(${r.foes} foes)`).join(' '));
await b.close();
