// HOW BRIGHT IS A ROOM, ACTUALLY.
//
// "Too dark" is a thing you say after looking at a screen, so this measures the
// screen. It reports, per room, the mean luminance of the frame and — the part
// that matters for a child — how much of the frame is so dark that nothing in it
// can be told apart (below 12/255).
//
// Usage: node tools/probe-brightness.mjs [room | room@x,z ...]
//
// The camera is a fixed world-space offset, so WHERE you stand decides what is
// in frame. `xh@0,0` measures the middle of the Great Hall — which is where a
// child actually stands to choose a door — not the doorway they arrived in.
import { chromium } from 'playwright';

const ROOMS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['la', 'va1', 't1b', 'f1', 's1b', 'd1b', 'x1', 'xh', 'xst', 'xm2'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'LUX');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.greybox = false; g.state.settings.musicVol = 0;
  for (const r of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + r);
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

console.log('room       mean   p10   unreadable%   (unreadable = below 12/255)');
for (const spec of ROOMS) {
  const [room, at] = spec.split('@');
  const stand = at ? at.split(',').map(Number) : null;
  if (!(await go(room))) { console.log(spec.padEnd(10), 'FAILED TO ENTER'); continue; }
  await page.evaluate(async (s) => {
    const g = window.__game;
    if (g.narration) g.narration.blocking = false;
    if (s) g.player.root.position.set(s[0], g.player.root.position.y, s[1]);
    // the camera lerps toward its fixed offset; 60 frames is enough to settle
    for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
  }, stand);
  const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
  // decoded in the browser rather than adding a PNG library to the repo
  const m = await page.evaluate(async (data) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej;
      img.src = 'data:image/png;base64,' + data; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    // the top strip is the HUD and the bottom is the touch pad — neither is the room
    const y0 = 40, y1 = img.height - 70;
    const px = ctx.getImageData(0, y0, img.width, y1 - y0).data;
    const lum = [];
    for (let i = 0; i < px.length; i += 8) {
      lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    }
    lum.sort((a, b) => a - b);
    return {
      mean: lum.reduce((a, b) => a + b, 0) / lum.length,
      p10: lum[Math.floor(lum.length * 0.10)],
      dark: lum.filter((v) => v < 12).length / lum.length * 100,
    };
  }, b64);
  console.log(spec.padEnd(10), m.mean.toFixed(1).padStart(5), m.p10.toFixed(1).padStart(5),
    (m.dark.toFixed(1) + '%').padStart(9));
}
await b.close();
