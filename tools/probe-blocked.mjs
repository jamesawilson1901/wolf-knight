import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('ERR ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'WHY');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game; g.state.settings.greybox = false; g.player.iframes = 999999; });
const go = async (room) => { for (let a = 0; a < 8; a++) {
  await page.evaluate((r) => { const g = window.__game; g.state.room = r; g.player.iframes = 0;
    g.player.hearts = 0.5; g.player.hurt(99, { pierceDefend: true }); }, room);
  try { await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1, room, { timeout: 45000 }); return true; } catch {} }
  return false; };
for (const id of process.argv.slice(2)) {
  if (!await go(id)) { console.log(id + ' FAILED'); continue; }
  const r = await page.evaluate(() => ({
    blockedBy: window.__game.world._blockedBy || {},
    reserved: (window.__game.world._keepClear || []).map((k) => `${k.tag}@(${k.x},${k.z})r${k.r}`),
    children: window.__game.world.root.children.length,
  }));
  console.log(`\n${id}: ${r.children} root children`);
  console.log('  refused by: ' + JSON.stringify(r.blockedBy));
  console.log('  reservations: ' + r.reserved.join(', '));
}
await b.close();
