// PROBE — what actually happens when a child turns the phone portrait mid-game.
//
// The rotate overlay is CSS-only (`@media (orientation: portrait)`), so the
// question this answers is not "is there an overlay" — there is — but "is the
// GAME still running behind it". Screenshots cannot answer that; the world
// clock can.
//
// Measures, in one landscape→portrait→landscape cycle:
//   1. the overlay's computed visibility in each orientation
//   2. whether Kael MOVES while portrait with the joystick held
//   3. whether an enemy standing on him still takes his hearts
//   4. the camera aspect the renderer is using in portrait
import { chromium } from 'playwright';

const LAND = { width: 780, height: 360 };
const PORT = { width: 360, height: 780 };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: LAND, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'TURN');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0;
});
await page.waitForTimeout(600);

const vis = () => page.evaluate(() => {
  const r = document.getElementById('rotate');
  return { display: getComputedStyle(r).display, w: innerWidth, h: innerHeight };
});

console.log('landscape  overlay:', JSON.stringify(await vis()));

// --- 2. does Kael move while portrait? -------------------------------------
// Held via the real keyboard path (input.js's fallback), not by writing
// velocity — the point is whether the game LOOP is running.
const posOf = () => page.evaluate(() => {
  const p = window.__game.player.root.position;
  return { x: +p.x.toFixed(3), z: +p.z.toFixed(3) };
});

await page.setViewportSize(PORT);
await page.waitForTimeout(400);
console.log('portrait   overlay:', JSON.stringify(await vis()));

const before = await posOf();
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1200);
await page.keyboard.up('ArrowUp');
const after = await posOf();
const moved = Math.hypot(after.x - before.x, after.z - before.z);
console.log(`portrait   Kael moved ${moved.toFixed(3)}u while the overlay was up`, JSON.stringify({ before, after }));

// --- 3. do hearts still drain in portrait? ---------------------------------
const hurt = await page.evaluate(async () => {
  const g = window.__game;
  g.player.hearts = g.player.maxHearts;
  g.player.iframes = 0;
  // put every enemy in the room on top of Kael so contact is certain
  const p = g.player.root.position;
  for (const e of g.world.enemies || []) {
    if (e.scenery) continue;
    e.root.position.set(p.x + 0.4, e.root.position.y, p.z + 0.4);
    if (e.awake !== undefined) e.awake = true;
  }
  const n = (g.world.enemies || []).filter((e) => !e.scenery).length;
  const start = g.player.hearts;
  await new Promise((r) => setTimeout(r, 2500));
  return { enemies: n, start, end: g.player.hearts };
});
console.log('portrait   hearts:', JSON.stringify(hurt), hurt.end < hurt.start ? '← DAMAGE TAKEN BEHIND THE OVERLAY' : '← safe');

// --- 4. camera aspect while portrait ---------------------------------------
console.log('portrait   camera aspect:', await page.evaluate(() => +window.__game.camera.aspect.toFixed(3)));

await page.setViewportSize(LAND);
await page.waitForTimeout(400);
console.log('landscape  overlay:', JSON.stringify(await vis()));
console.log('landscape  camera aspect:', await page.evaluate(() => +window.__game.camera.aspect.toFixed(3)));

await b.close();
