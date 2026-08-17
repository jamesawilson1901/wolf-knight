// HARNESS INERTNESS — the kid build. No ?dev=1: the harness must not exist,
// and sixty seconds of real keyboard play must run clean.
import { chromium } from 'playwright';

const errors = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'INERT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player._time > 0, null, { timeout: 90000 });

const wk = await page.evaluate(() => ({ wk: typeof window.__wk, jump: typeof window.__wkJump }));
console.log('harness surface without ?dev=1:', JSON.stringify(wk));
const inert = wk.wk === 'undefined' && wk.jump === 'undefined';

const t0 = Date.now();
const keys = ['w', 'a', 's', 'd'];
let i = 0;
while (Date.now() - t0 < 60000) {
  const k = keys[i++ % keys.length];
  await page.keyboard.down(k); await page.waitForTimeout(900); await page.keyboard.up(k);
  if (i % 3 === 0) await page.keyboard.press('j');
  await page.waitForTimeout(150);
}
const alive = await page.evaluate(() => ({ room: window.__game.state.room, hearts: window.__game.player.hearts }));
console.log('after 60s play:', JSON.stringify(alive), 'errors:', JSON.stringify(errors));
console.log(inert && errors.length === 0 ? 'INERT + CLEAN' : 'NOT INERT / NOT CLEAN');
await b.close();
process.exit(inert && errors.length === 0 ? 0 : 1);
