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
  return { attack: r('btn-attack') };
});
say('attack button:', JSON.stringify(rects.attack));
if (!rects.attack) bad('attack button missing');

const cdp = await ctx.newCDPSession(page);
const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

// THE JOYSTICK IS DYNAMIC — it anchors wherever the thumb first lands (the
// element rect reads 0x0 until then). Anchor at a natural left-thumb spot and
// steer CLOSED-LOOP: drag point = anchor + unit(world direction) * 42px.
// Screen y maps to world +z, so north (−z) is a drag upward.
const ORIGIN = { x: 120, y: 260 };
let fingerAt = { ...ORIGIN };
async function thumbSteer(tx, tz, timeoutS, midStride = null) {
  await touch('touchStart', [{ ...ORIGIN, id: 1 }]);
  const t0 = Date.now();
  let struck = false;
  try {
    while ((Date.now() - t0) / 1000 < timeoutS) {
      const s = await page.evaluate(() => ({ pos: window.__wk.pos, room: window.__wk.room }));
      if (s.room !== 't1a') return s.room;
      const dx = tx - s.pos.x, dz = tz - s.pos.z;
      if (Math.hypot(dx, dz) < 0.9) return 'arrived';
      const m = Math.hypot(dx, dz) || 1;
      fingerAt = { x: ORIGIN.x + (dx / m) * 42, y: ORIGIN.y + (dz / m) * 42 };
      await touch('touchMove', [{ ...fingerAt, id: 1 }]);
      if (midStride && !struck && (Date.now() - t0) > 1500) {
        struck = true;
        await touch('touchStart', [{ ...fingerAt, id: 1 }, { x: rects.attack.x, y: rects.attack.y, id: 2 }]);
        await touch('touchEnd', [{ x: rects.attack.x, y: rects.attack.y, id: 2 }]);
        midStride.swing = await page.waitForFunction(() =>
          window.__game.player._current && /attack|slash|thrust/i.test(window.__game.player._current),
          null, { timeout: 4000 }).then(() => true).catch(() => false);
      }
      await page.waitForTimeout(180);
    }
    return null;
  } finally {
    await touch('touchEnd', [{ ...fingerAt, id: 1 }]);
  }
}

const mid = { swing: false };
const r1 = await thumbSteer(3.2, 5, 25, mid);            // the junction bypass, by thumb
say('leg 1:', r1, '· mid-stride swing:', mid.swing);
if (!mid.swing) bad('attack tap during joystick hold produced no swing');
await thumbSteer(3.2, -4, 25);
await thumbSteer(0, -8, 25);
const end = await thumbSteer(0, -13.6, 45);              // into the door box
const room = await page.evaluate(() => window.__wk.room);
if (room !== 't1b') bad(`touch leg never reached t1b (at ${room} ${JSON.stringify(await page.evaluate(() => window.__wk.pos))})`);
else say('TOUCH LEG: t1a -> t1b walked by thumb, with a mid-stride swing');
void end;

say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(errors));
await b.close();
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
