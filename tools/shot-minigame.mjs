// WHAT THE MINI GAME ACTUALLY LOOKS LIKE. Four frames on the way through a
// round of Fetch: the invitation, the demo, play, and the results screen. A
// verifier proves the contract holds; only a picture shows whether a five-year-
// old can tell what to do without reading a word.
//
//   node tools/shot-minigame.mjs <outdir>
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = process.argv[2] || '/tmp/mgshots';
mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 },
  deviceScaleFactor: Number(process.env.DPR || 2) })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'FETCH');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.flags.pups = { pup1: true };     // one rescue: Tier 1 is open
  g.player.iframes = 999999;
});
for (let a = 0; a < 8; a++) {
  await page.evaluate(() => { const g = window.__game;
    g.state.room = 'den'; g.player.iframes = 0; g.player.hearts = 0.5;
    g.player.hurt(99, { pierceDefend: true }); });
  try {
    await page.waitForFunction(() => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom('den') && window.__game.player.hearts > 1,
      null, { timeout: 45000 }); break;
  } catch { /* retry */ }
}
const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });

// 1. THE INVITATION — standing just short of the ring, chip up
await page.evaluate(() => { window.__game.player.root.position.set(1.6, 0, 6.6); });
await frames(50);
await shot('1-invitation');

// 2. THE DEMO — first ever round, the game shows itself
await page.evaluate(() => { window.__game.player.root.position.set(1.6, 0, 4.6); });
await frames(30);
await shot('2-demo');

// 3. PLAY — mid-throw, the ring closing on the catch
await page.locator('#mg-tap').dispatchEvent('pointerdown');
await page.evaluate(async () => {
  const tap = document.getElementById('mg-tap');
  for (let i = 0; i < 90; i++) {
    tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
  }
});
await shot('3-play');

// 4. THE RESULTS SCREEN — score, best, band picker, replay and go home
await page.evaluate(async () => {
  const h = window.__game.world.harness;
  for (let i = 0; i < 400 && h.phase === 'play'; i++) {
    h.update(0.12, i * 0.12);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
await frames(10);
await shot('4-results');

console.log('wrote 4 frames to ' + outDir);
await b.close();
