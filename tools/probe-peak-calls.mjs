// A9 — THE PEAK, not the entry.
//
// probe-encounters.mjs measures a room the moment you walk in. That is not
// when it is busiest. A fight adds bodies and objects the entry snapshot never
// sees: shard and heart DROPS on every kill, and a Bramble Blob SPLITS into two
// minis when it dies. The two fullest rooms after the A9 pass sit at 95 of a
// 100 draw-call budget, so "under 100 on arrival" is not the question.
//
// This kills everything in the room through the real damage path and watches
// the draw calls the whole way, reporting the WORST frame.
import { chromium } from 'playwright';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'PEAK');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
  g.state.settings.greybox = false;
  g.player.iframes = 99999;
  g.WS.set('wild3', 'rootCut', true); g.WS.set('wild3', 'logDown', true);
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

// The rooms that actually carry a fight after the A9 pass.
const ROOMS = ['t1b', 't2a', 't2b', 't2p', 't3a', 't3b', 't3p', 'tkn', 't4a', 't4b'];

console.log('room   arrive   PEAK  when            bodies at peak  cast');
console.log('─'.repeat(76));
let worst = { calls: 0 };
for (const id of ROOMS) {
  if (!await go(id)) { console.log(`${id}  FAILED`); continue; }
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise((res) => requestAnimationFrame(res));
    await s(); await s();
    const arrive = g.renderer.info.render.calls;
    let peak = arrive, peakAt = 'arrival', peakBodies = (g.world.enemies || []).length;
    const sample = (label) => {
      const c = g.renderer.info.render.calls;
      if (c > peak) { peak = c; peakAt = label; peakBodies = (g.world.enemies || []).filter((e) => !e.dead).length; }
    };
    // kill them one at a time through the real damage path, so drops
    // accumulate on the floor exactly as they would in play
    const initial = [...(g.world.enemies || [])];
    for (let i = 0; i < initial.length; i++) {
      const e = initial[i];
      if (!e || e.dead || !e.takeDamage) continue;
      for (let k = 0; k < 40 && !e.dead; k++) e.takeDamage(3, 'moon', 'aoe');
      for (let f = 0; f < 6; f++) { await s(); sample(`after kill ${i + 1}`); }
    }
    // let any splits finish spawning and settle
    for (let f = 0; f < 30; f++) { await s(); sample('after splits settle'); }
    const alive = (g.world.enemies || []).filter((e) => !e.dead);
    // ...and kill the splits too
    for (const e of alive) { for (let k = 0; k < 40 && !e.dead; k++) e.takeDamage(3, 'moon', 'aoe'); }
    for (let f = 0; f < 20; f++) { await s(); sample('after splits die'); }
    return { arrive, peak, peakAt, peakBodies, drops: (g.world.drops || []).length };
  });
  const flag = r.peak >= 100 ? '  ✗ OVER BUDGET' : r.peak > 94 ? '  ⚠' : '';
  console.log(`${id.padEnd(6)} ${String(r.arrive).padStart(5)}  ${String(r.peak).padStart(5)}  ` +
    `${r.peakAt.padEnd(18)} ${String(r.peakBodies).padStart(3)}${flag}`);
  if (r.peak > worst.calls) worst = { calls: r.peak, id, at: r.peakAt };
}
console.log(`\nworst frame anywhere in Level 3: ${worst.id} at ${worst.calls} calls (${worst.at})`);
console.log(worst.calls < 100 ? '✓ the 100-call budget holds THROUGH the fight, not just on arrival'
                              : '✗ OVER BUDGET during combat');
if (errs.length) console.log('\nPAGE ERRORS:\n' + errs.join('\n'));
await b.close();
process.exit(worst.calls < 100 ? 0 : 1);
