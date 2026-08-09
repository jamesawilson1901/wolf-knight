// ROOM CONTACT SHEET. Walks to each room through the real load path and
// screenshots it from the game's own camera. A verifier cannot tell you a room
// is boring; this is how a human finds out without playing fifty-two rooms.
//
//   node tools/shot.mjs <outdir> <room> [room...]
// DPR=1 halves the resolution, which is what the contact sheet uses: fifty-two
// rooms at 2x is 26 MB of PNG and an Artifact page has to fit in 16.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = process.argv[2] || '/tmp/shots';
const ROOMS = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: Number(process.env.DPR || 2) })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SHOT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf','frost_wolf'];
  g.player.iframes = 999999;
  g.WS.set('wild3','rootCut',true); g.WS.set('wild3','logDown',true);
  // hide the HUD: this sheet is about the ROOM
  for (const el of document.querySelectorAll('.ui, #joy-base, #joy-knob, #joy-hint, #hearts, #shards, #level-badge, #xp-bar, #potions, #pause-btn, #inv-btn, #form-badge, #moon-gauge, #btn-attack, #special-btn, #btn-ranged, #btn-defend, #btn-jump, #caption, #toast')) {
    el.style.display = 'none';
  }
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
for (const id of ROOMS) {
  if (!await go(id)) { console.log(`${id}  FAILED TO BUILD`); continue; }
  // let the camera settle and any onAnimate hooks tick
  await page.evaluate(async () => { for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r)); });
  const calls = await page.evaluate(() => window.__game.renderer.info.render.calls);
  await page.screenshot({ path: `${outDir}/${id}.png` });
  console.log(`${id.padEnd(6)} ${String(calls).padStart(4)} calls  -> ${outDir}/${id}.png`);
}
if (errs.length) console.log('\n' + errs.join('\n'));
await b.close();
