// HOW MANY SHARDS CAN A CHILD HAVE BY NOW?
//
// The shop tier work needed this answered before it could gate anything: a rung
// held back is only worth holding back if a child could otherwise reach it.
// Chests are one-off and persist per save; POTS DO NOT. loot.js says so in its
// header ("breakables respawn with the room — small change, not farming gold"),
// but a comment is not a measurement, and "small change" is doing a lot of work
// there when a room can be re-entered forever.
//
// So: smash every pot in a room through the real damage path, leave, come back,
// and count what is standing. Whatever this prints is a per-lap income a child
// can repeat as many times as they like.
//
// Measured 2026-08-09 on Level 1's four islands: 16 / 12 / 12 / 12 shards,
// fully restored on every return.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'GRIND');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false; g.player.iframes = 99999; });
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try { await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
      room, { timeout: 45000 }); return true; } catch {}
  }
  return false;
};
const pots = () => page.evaluate(() => (window.__game.world.enemies || [])
  .filter((e) => e.constructor.name === 'Breakable' && !e.dead)
  .reduce((a, e) => a + (e.shardCount || 0), 0));
const rooms = ["la", "lb", "lc", "ld"];
for (const r of rooms) {
  if (!await go(r)) { console.log(r, 'FAILED TO BUILD'); continue; }
  const first = await pots();
  // smash them all through the real damage path
  await page.evaluate(async () => {
    const g = window.__game, s = () => new Promise((x) => requestAnimationFrame(x));
    for (const e of [...(g.world.enemies || [])]) if (e.constructor.name === 'Breakable') e.takeDamage(99);
    for (let i = 0; i < 5; i++) await s();
  });
  const emptied = await pots();
  await go('den');
  await go(r);
  const second = await pots();
  console.log(`${r}: pot shards on arrival ${first}, after smashing ${emptied}, after leaving and returning ${second}`);
}
await b.close();
