// THE HARD LANDSCAPE LOCK — the curtain and the frozen world are one fact.
//
// The game has always been landscape-only in INTENTION: the manifest asks for
// it, the title tap asks the browser to lock it, and a CSS media query drops a
// "please turn your device sideways" curtain in portrait. None of that stops
// the game. Measured with tools/probe-orientation.mjs against the code before
// this verifier existed:
//
//     portrait   Kael moved 0.188u while the overlay was up
//     portrait   hearts: {"enemies":2,"start":5,"end":4.5}  <- behind the curtain
//
// A child who turns the phone over in a fight loses hearts to enemies they
// cannot see, on a screen that is telling them to turn the phone back. That is
// the whole item: portrait must be a HALT, not a picture of one.
//
// What is asserted, all through the real page in a real browser:
//   1. landscape plays  — the curtain is down and Kael moves
//   2. portrait halts   — the curtain is up, Kael does NOT move, enemies do
//                         NOT move, and hearts do NOT drop
//   3. landscape resumes— the curtain drops and the world runs again
//   4. nothing fires on resume — a stick or a button held through the halt is
//                         released, so play does not restart with a free swing
//   5. the platform lock is actually ASKED, and asked again after a rotation
//   6. no page errors anywhere in the cycle
//
// 5 is best-effort by nature (iOS Safari has no screen.orientation.lock; Android
// only honours it in fullscreen), so what is checkable is that we keep asking.
// The lock function is wrapped at page-init and its calls counted.
import { chromium } from 'playwright';

const LAND = { width: 780, height: 360 };   // the pinned device model, landscape
const PORT = { width: 360, height: 780 };   // the same phone, turned over

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: LAND, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

// Count every lock attempt. Wrapped BEFORE any of the game's code runs, and it
// still rejects exactly as the real one would outside fullscreen, so the game
// sees no difference.
await ctx.addInitScript(() => {
  window.__lockCalls = [];
  const so = window.screen && window.screen.orientation;
  if (so) {
    const real = so.lock;
    so.lock = function (o) {
      window.__lockCalls.push(o);
      try { return real ? real.call(this, o) : Promise.reject(new Error('unsupported')); }
      catch (e) { return Promise.reject(e); }
    };
  }
});

const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
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
await page.waitForTimeout(700);

const curtain = () => page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
const pos = () => page.evaluate(() => {
  const p = window.__game.player.root.position;
  return { x: +p.x.toFixed(3), z: +p.z.toFixed(3) };
});
const dist = (a, c) => Math.hypot(c.x - a.x, c.z - a.z);

// Walk for a fixed wall-clock stretch through the real keyboard path. Under
// SwiftShader this page runs at 2-3 fps, so the moving case is asserted against
// a floor (measured: 0.35-0.7u per second at that frame rate) and never against
// an exact distance. WALK_MS is generous for the same reason.
const WALK_MS = 2500;
const WALKED = 0.35;   // u — clearly moving, at the worst frame rate observed
const FROZEN = 0.01;   // u — clearly not
async function walk(ms = WALK_MS) {
  const a = await pos();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(ms);
  await page.keyboard.up('ArrowUp');
  const c = await pos();
  return { a, c, d: +dist(a, c).toFixed(3) };
}

// --- 1. landscape plays ----------------------------------------------------
check('landscape: the curtain is down', (await curtain()) === 'none');
await walk(1200);                       // warm-up: the first frames after a room
                                        // build are the slowest in the run
const landWalk = await walk();
check('landscape: Kael walks', landWalk.d > WALKED, landWalk);

// The control for the portrait frame-counter assertion below: whatever "zero
// frames" means there, it has to mean something here first.
const landFrames = await page.evaluate(async () => {
  const g = window.__game;
  const before = g.renderer.info.render.frame;
  await new Promise((r) => setTimeout(r, 2000));
  return g.renderer.info.render.frame - before;
});
check('landscape: the loop draws', landFrames > 0, { framesIn2s: landFrames });

// --- 2. portrait halts -----------------------------------------------------
await page.setViewportSize(PORT);
await page.waitForTimeout(500);
check('portrait: the curtain is up', (await curtain()) === 'flex');

const portWalk = await walk();
check('portrait: Kael does not move', portWalk.d < FROZEN, portWalk);

// The whole loop is idle, not just the player's branch. The renderer's own
// frame counter is the bluntest possible statement of that: the halt returns
// before anything is drawn, so it must not tick at all. (Asserting on enemy
// positions instead looks stronger and is weaker — a room's cast can be asleep
// and standing still in BOTH orientations, which passes without proving a
// thing. This counter discriminates: 2-3 per second against zero.)
const framesDrawn = await page.evaluate(async () => {
  const g = window.__game;
  const before = g.renderer.info.render.frame;
  await new Promise((r) => setTimeout(r, 2000));
  return g.renderer.info.render.frame - before;
});
check('portrait: nothing is drawn and nothing ticks', framesDrawn === 0, { framesIn2s: framesDrawn });

// the one that matters to a child: no damage behind the curtain
const hurt = await page.evaluate(async () => {
  const g = window.__game;
  g.player.hearts = g.player.maxHearts;
  g.player.iframes = 0;
  const p = g.player.root.position;
  for (const e of g.world.enemies || []) {
    if (e.scenery) continue;
    e.root.position.set(p.x + 0.4, e.root.position.y, p.z + 0.4);
    if (e.awake !== undefined) e.awake = true;
  }
  const start = g.player.hearts;
  await new Promise((r) => setTimeout(r, 2500));
  return { start, end: g.player.hearts };
});
check('portrait: hearts do not drop with enemies on top of Kael', hurt.end === hurt.start, hurt);

// --- 5. the lock is asked, and asked again ---------------------------------
const locksAfterPortrait = await page.evaluate(() => window.__lockCalls.slice());
check('the platform lock is asked for landscape', locksAfterPortrait.some((o) => String(o).includes('landscape')),
  { calls: locksAfterPortrait.length, asked: locksAfterPortrait });

// Put the cast back where it was before resuming — an enemy standing on Kael
// would knock him about and make the "the world runs again" walk meaningless.
await page.evaluate(() => {
  for (const e of window.__game.world.enemies || []) {
    if (!e.scenery) e.root.position.set(-14, e.root.position.y, -14);
  }
  window.__game.player.iframes = 9999;
});

// --- 3 + 4. landscape resumes, and nothing fires ---------------------------
// Hold the attack button THROUGH the rotation: a queued swing that survives the
// halt would land the instant the child rotates back, which is exactly the sort
// of free hit the halt exists to prevent.
await page.keyboard.down('ArrowUp');
await page.keyboard.down('KeyJ');
await page.waitForTimeout(300);
await page.setViewportSize(LAND);
// Read the input state in the same turn the resize lands, before the game's
// next frame can consume anything — at 2 fps a later sample proves nothing.
const resumeState = await page.evaluate(() => {
  const g = window.__game;
  const m = g.input.getMove();
  return {
    move: { x: +m.x.toFixed(3), z: +m.z.toFixed(3) },
    attackQueued: g.input.consumeAttack(),   // reading it also clears it
    lockTime: +g.player.lockTime.toFixed(3),
  };
});
await page.keyboard.up('KeyJ');
await page.keyboard.up('ArrowUp');
check('resume: no swing survives the halt', resumeState.attackQueued === false && resumeState.lockTime === 0, resumeState);
check('resume: the stick and the keys are released',
  Math.abs(resumeState.move.x) < 0.001 && Math.abs(resumeState.move.z) < 0.001, resumeState.move);

await page.waitForTimeout(400);
check('landscape: the curtain is down again', (await curtain()) === 'none');
const backWalk = await walk();
check('landscape: the world runs again', backWalk.d > WALKED, backWalk);

const locksEnd = await page.evaluate(() => window.__lockCalls.length);
check('the lock is asked again after the rotation', locksEnd > locksAfterPortrait.length,
  { before: locksAfterPortrait.length, after: locksEnd });

check('no page errors', errors.filter((e) => e.startsWith('PAGEERROR')).length === 0,
  errors.filter((e) => e.startsWith('PAGEERROR')));

await b.close();
console.log('');
if (errors.length) { console.log('FAILED:', errors.join(' | ')); process.exit(1); }
console.log('ALL CLEAN — landscape plays, portrait halts, the lock keeps asking');
