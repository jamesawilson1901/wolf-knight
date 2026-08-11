// WHY DOES THIS ROOM END UP WITH NOTHING TO BREAK?
//
// probe-emptyrooms found thirteen rooms with no smashables. Six are deliberate
// (two boss arenas, the quiet room before Ember's boss, three Stormreach chokes
// where every candidate sits in a gale lane). Seven are not, and relaxing the
// clearance did not fix them — so the answer is not "not enough elbow room" and
// guessing again would be the third guess in a row.
//
// potSpots throws a candidate out for one of seven reasons. This asks it which.
import { chromium } from 'playwright';

const ROOMS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['dg2', 'xa2', 'xa3', 'xr2', 'xg3', 'xm1', 'xm3', 'sc1', 'xr3', 'd1p'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'POTS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
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

console.log('room   got  want   edge blind blockd inside hazard huddle penned   half');
for (const room of ROOMS) {
  if (!(await go(room))) { console.log(room.padEnd(6), 'BUILD FAILED'); continue; }
  const r = await page.evaluate(async (rm) => {
    const g = window.__game, w = g.world;
    const lk = await import('/js/levelkit.js');
    const stats = { edge: 0, blind: 0, blocked: 0, inside: 0, hazard: 0, huddle: 0, penned: 0 };
    const spots = lk.potSpots(w, w.halfW, w.halfD, { label: rm }, undefined, { stats });
    return { got: spots.length, want: stats.want, stats,
      half: [w.halfW, w.halfD] };
  }, room);
  const s = r.stats;
  console.log(room.padEnd(6), String(r.got).padEnd(4), String(r.want).padEnd(6),
    String(s.edge).padEnd(4), String(s.blind).padEnd(5), String(s.blocked).padEnd(6),
    String(s.inside).padEnd(6), String(s.hazard).padEnd(6), String(s.huddle).padEnd(6),
    String(s.penned).padEnd(8), JSON.stringify(r.half));
}
await b.close();
