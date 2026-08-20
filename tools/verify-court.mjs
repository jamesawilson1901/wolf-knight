// THE SHADOW COURT CAN BE FINISHED.
//
// The Court's four wings each end on a relic. js/level7.js built each one,
// pushed it on to world.markers.relicSpots, and stopped: nothing in the game
// read that marker and nothing ever wrote relic_* into the Court's world state.
// So relicCount() was permanently zero, the Great Hall never cut its north gap,
// never built the door to the throne stair, and walled the arch instead — and
// `xth`, with Shadow-Grimm in it, is a door target from `xst` alone.
//
// The last boss of the game could not be walked to by any route. Every suite
// passed, because every suite that visits a room goes there by naming it.
// Walking is what nobody did.
//
// Two rooms had the same shape of hole: xp1 and xp2 each declared a door home
// to the Great Hall, and the Hall declared no door to either.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'COURT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
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
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

// Stand on a marker and let the game run until it reacts. Game frames, not wall
// clock — under SwiftShader a second of wall time is a handful of frames.
const standOn = (getSpot, until, frames = 240) => page.evaluate(async (a) => {
  const g = window.__game;
  const s = (new Function('w', 'return ' + a.getSpot))(g.world);
  if (!s) return { err: 'no spot' };
  g.player.root.position.set(s.x, g.player.root.position.y, s.z);
  const done = new Function('g', 'return ' + a.until);
  for (let i = 0; i < a.frames; i++) {
    g.player.iframes = 9999;
    await new Promise((r) => requestAnimationFrame(r));
    if (done(g)) break;
  }
  return { ok: done(g) };
}, { getSpot: getSpot, until, frames });

console.log('\n── 1. every wing hands over its relic when you walk to it ──');
await page.evaluate(() => { window.__game.WS.set('court', 'relic_ember', false);
  window.__game.WS.set('court', 'relic_thorn', false);
  window.__game.WS.set('court', 'relic_tide', false);
  window.__game.WS.set('court', 'relic_moon', false); });
const WINGS = [['xa3', 'ember'], ['xr3', 'thorn'], ['xg3', 'tide'], ['xm3', 'moon']];
for (const [room, name] of WINGS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const spot = await page.evaluate(() => {
    const s = (window.__game.world.markers.relicSpots || [])[0];
    return s ? { x: s.x, z: s.z } : null;
  });
  check(`${room} holds the ${name} relic on a pedestal`, !!spot, spot);
  if (!spot) continue;
  const r = await standOn('(w.markers.relicSpots||[])[0]',
    `g.WS.get('court','relic_${name}')`);
  check(`walking to it takes the ${name} relic`,
    await page.evaluate((n) => !!window.__game.WS.get('court', 'relic_' + n), name), r);
}

console.log('\n── 2. four relics open the throne stair ──────────────');
const shut = await page.evaluate(async () => {
  const g = window.__game;
  for (const n of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + n, false);
  return true;
});
check('the relics can be cleared for the test', shut === true);
await go('xh');
const closed = await page.evaluate(() => ({
  toStair: (window.__game.world.doors || []).some((d) => d.to === 'xst'),
}));
check('with no relics the Great Hall has no way up', closed.toStair === false, closed);

await page.evaluate(() => { const g = window.__game;
  for (const n of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + n, true); });
await go('xh');
const opened = await page.evaluate(() => ({
  toStair: (window.__game.world.doors || []).some((d) => d.to === 'xst'),
  toPockets: (window.__game.world.doors || []).filter((d) => d.to === 'xp1' || d.to === 'xp2').map((d) => d.to),
}));
check('with all four it opens on to the throne stair', opened.toStair === true, opened);

console.log('\n── 3. and the two pockets can be walked into ─────────');
check('the Great Hall has a door to the Undercroft and the Long Gallery',
  opened.toPockets.includes('xp1') && opened.toPockets.includes('xp2'), opened);

console.log('\n── 4. the stair reaches Shadow-Grimm ─────────────────');
check('the throne stair builds', await go('xst'));
const stair = await page.evaluate(() => ({ doors: (window.__game.world.doors || []).map((d) => d.to) }));
check('...and its way on is the last boss', stair.doors.includes('xth'), stair);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n') : '\nALL CLEAN — the Court can be finished.');
await b.close();
process.exit(errors.length ? 1 : 0);
