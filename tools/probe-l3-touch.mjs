// L3 TOUCH LEG — the run-brief's "test like kids play" item. Phone-landscape
// viewport, REAL multi-touch via CDP: one finger holds the joystick north
// while a second taps ATTACK mid-stride. Assertions are game-visible effects
// (movement, the swing, the room change), never synthetic-event bookkeeping.
import { chromium } from 'playwright';

const errors = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'THUMB3');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });
await page.evaluate(() => { window.__wkJump('t1a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf']); });
await page.waitForFunction(() => window.__wk.room === 't1a' && window.__wk.hearts > 1, null, { timeout: 60000 });
await page.waitForTimeout(1200);

const rects = await page.evaluate(() => {
  const r = (id) => { const el = document.getElementById(id); if (!el) return null;
    const q = el.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; };
  return { joy: r('joy-base'), attack: r('btn-attack') };
});
say('controls:', JSON.stringify(rects));
if (!rects.joy || !rects.attack) { bad('touch controls missing'); }

const cdp = await ctx.newCDPSession(page);
const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

const start = await page.evaluate(() => ({ ...window.__wk.pos }));
// finger 1 down on the joystick, dragged north, HELD
await touch('touchStart', [{ x: rects.joy.x, y: rects.joy.y, id: 1 }]);
await touch('touchMove', [{ x: rects.joy.x, y: rects.joy.y - 40, id: 1 }]);
await page.waitForTimeout(1500);
const moved = await page.evaluate(() => ({ ...window.__wk.pos }));
say('joystick hold: z', start.z, '->', moved.z);
if (!(moved.z < start.z - 0.5)) bad('joystick hold did not move the player north');

// finger 2 taps ATTACK while finger 1 keeps steering — the two-pointer moment
await touch('touchStart', [{ x: rects.joy.x, y: rects.joy.y - 40, id: 1 }, { x: rects.attack.x, y: rects.attack.y, id: 2 }]);
await touch('touchEnd', [{ x: rects.attack.x, y: rects.attack.y, id: 2 }]);
const swing = await page.waitForFunction(() =>
  window.__game.player._current && /attack|slash|thrust/i.test(window.__game.player._current),
  null, { timeout: 4000 }).then(() => true).catch(() => false);
const stillMoving = await page.evaluate(() => ({ ...window.__wk.pos }));
say('mid-stride attack:', swing, '· pos z', stillMoving.z);
if (!swing) bad('attack tap during joystick hold produced no swing');

// keep the hold — the leg is t1a's junction bypass to the north door by thumb
await touch('touchMove', [{ x: rects.joy.x + 22, y: rects.joy.y - 32, id: 1 }]);  // NE, skirt the statue
await page.waitForTimeout(2600);
await touch('touchMove', [{ x: rects.joy.x - 6, y: rects.joy.y - 42, id: 1 }]);   // back north
const reached = await page.waitForFunction(() => window.__wk.room === 't1b', null, { timeout: 90000 })
  .then(() => true).catch(() => false);
await touch('touchEnd', [{ x: rects.joy.x - 6, y: rects.joy.y - 42, id: 1 }]);
if (!reached) bad(`touch leg never reached t1b (at ${await page.evaluate(() => window.__wk.room)} ${JSON.stringify(await page.evaluate(() => window.__wk.pos))})`);
else say('TOUCH LEG: t1a -> t1b walked by thumb, with a mid-stride swing');

say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(errors));
await b.close();
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
