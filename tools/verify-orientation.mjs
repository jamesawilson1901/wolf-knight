// THE HARD LANDSCAPE LOCK (BUILDLOG queue, v2.2.6).
//
// The game already showed a "please turn your device sideways" card in
// portrait. It was a HINT, not a lock: nothing under it stopped. The world
// kept ticking behind an opaque overlay, the window-level joystick and
// keyboard listeners kept firing through it, and a child holding the phone
// upright could walk, swing and DIE without seeing a frame of it.
//
// This measures the lock as three separate promises, because the CSS card
// only ever kept the first one:
//   1. the card appears in portrait and goes away in landscape
//   2. NOTHING MOVES while it is up — not Kael, not the room's own animation
//   3. the orientation lock is requested the only way a browser accepts it:
//      AFTER the fullscreen request has resolved, not fired alongside it
//
// (3) is stubbed rather than really locked — headless Chromium has no
// fullscreen and no orientation lock — so what is measured is the ORDER of
// the two calls, which is the part the code gets to control.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await b.newContext({ viewport: { width: 740, height: 360 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// Stub fullscreen + orientation lock BEFORE any script runs, and record the
// order. The real APIs reject in headless, and a rejection would look exactly
// like the bug this is here to catch.
// An init script runs at document START: `document.documentElement` is null
// at that moment, and the first draft of this stub threw on it, reported an
// empty log, and would have been read as "the game never asks for the lock".
// Stub the PROTOTYPE, which exists before any element does.
await page.addInitScript(() => {
  window.__lockLog = [];
  try {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: () => {
        window.__lockLog.push('fullscreen:call');
        return new Promise((res) => setTimeout(() => {
          window.__lockLog.push('fullscreen:resolve');
          res();
        }, 60));
      },
    });
  } catch (e) { window.__lockLog.push('stub-failed:fullscreen:' + e.message); }
  const lock = () => {
    window.__lockLog.push('lock:call');
    return Promise.resolve();
  };
  try {
    if (window.screen && screen.orientation) {
      Object.defineProperty(screen.orientation, 'lock', { configurable: true, value: lock });
    } else {
      Object.defineProperty(window.screen, 'orientation', {
        configurable: true, value: { lock, type: 'landscape-primary', addEventListener() {} },
      });
    }
  } catch (e) { window.__lockLog.push('stub-failed:lock:' + e.message); }
});

await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 25000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'TURN');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false;
  g.state.settings.voice = false;
  g.state.settings.sfxVol = 0;
  g.player.iframes = 99999; // this is about motion, not about surviving the Den
});
// story hints freeze the world on their own; wait them out before measuring
await page.waitForFunction(() => !window.__game.narration.blocking, null, { timeout: 30000 });

const portraitState = () => page.evaluate(() => ({
  mq: window.matchMedia('(orientation: portrait)').matches,
  card: getComputedStyle(document.getElementById('rotate')).display,
}));

// Hold a direction and report how far Kael actually travelled AND how far his
// animation clock advanced. Two measurements because they can only both stop
// if the loop itself stopped: distance alone would also read zero if he were
// simply walking into a wall.
//
// The first draft used the room's loose props as the clock, copying
// verify-den. That is a Den idiom: a new game starts in r1, whose two loose
// props do not move at all, so the "world animates" reading was 0 in
// landscape too — a ruler that reports the same number whatever it measures.
// The mixer is ticked from player.update(), inside the branch under test.
const measure = (ms) => page.evaluate(async (dur) => {
  const g = window.__game;
  const p = g.player.root.position;
  const clock = () => {
    const f = g.player.forms[g.state.form];
    return f && f.mixer ? f.mixer.time : 0;
  };
  const p0 = { x: p.x, z: p.z };
  const c0 = clock();
  // `player.attacking` does not exist — the first draft watched it, read
  // undefined every time, and reported a clean "no attack was swung" against
  // code that swings freely in portrait. `lockTime` is the real swing state.
  let attacked = false;
  const watch = setInterval(() => { if (g.player.lockTime > 0) attacked = true; }, 16);
  await new Promise((r) => setTimeout(r, dur));
  clearInterval(watch);
  return {
    walked: +Math.hypot(p.x - p0.x, p.z - p0.z).toFixed(3),
    animated: +(clock() - c0).toFixed(4),
    attacked,
  };
}, ms);

// Every walk starts from the same open floor, so the three runs are
// comparable and none of them is quietly measuring a wall. Staging only —
// the walking itself is real key events through the real listeners.
const spawn = await page.evaluate(() => {
  const p = window.__game.player.root.position;
  return { x: p.x, z: p.z };
});
const restage = () => page.evaluate((s0) => {
  window.__game.player.root.position.set(s0.x, window.__game.player.root.position.y, s0.z);
}, spawn);

// WARM UP BEFORE THE BASELINE. Under SwiftShader the first second after the
// room builds runs at a fraction of the rate the rest of the run does — the
// baseline walk measured 0.17 u where the identical walk later in the same
// session measured 0.83. Discarding one window is honest; lowering the bar to
// fit the cold frames would have made every later assertion weaker for it.
await measure(1200);

console.log('\n── landscape: the game runs ───────────────────────────────────');
let s = await portraitState();
check('the rotate card is hidden in landscape', s.card === 'none', s);
await page.keyboard.down('KeyW');
const landscapeA = await measure(800);
await page.keyboard.up('KeyW');
check('Kael walks when the phone is sideways', landscapeA.walked > 0.3, landscapeA);
check('Kael animates when the phone is sideways', landscapeA.animated > 0.02, landscapeA);

console.log('\n── portrait: EVERYTHING stops ─────────────────────────────────');
await restage();
await page.setViewportSize({ width: 360, height: 740 });
await page.waitForTimeout(200);
s = await portraitState();
check('the viewport really reads as portrait', s.mq === true, s);
check('the rotate card covers the screen', s.card === 'flex', s);

await page.keyboard.down('KeyW');
await page.keyboard.press('KeyJ');
await page.keyboard.press('KeyJ');
const portraitRun = await measure(800);
await page.keyboard.up('KeyW');
check('Kael does not walk behind the rotate card', portraitRun.walked < 0.03, portraitRun);
check('the world clock does not run behind the rotate card',
  portraitRun.animated < 0.005, portraitRun);
check('no attack can be swung behind the rotate card', portraitRun.attacked === false, portraitRun);

console.log('\n── back to landscape: it picks up, it does not lurch ──────────');
await page.setViewportSize({ width: 740, height: 360 });
await page.waitForTimeout(200);
s = await portraitState();
check('the rotate card goes away again', s.card === 'none', s);

// nothing pressed: a press banked during portrait must not fire on the turn
const resume = await measure(500);
check('presses made in portrait are dropped, not banked',
  resume.attacked === false && resume.walked < 0.03, resume);

await restage();
await page.keyboard.down('KeyW');
const landscapeB = await measure(800);
await page.keyboard.up('KeyW');
check('Kael walks again once the phone is sideways', landscapeB.walked > 0.3, landscapeB);
check('the world clock runs again', landscapeB.animated > 0.02, landscapeB);

console.log('\n── the lock itself ────────────────────────────────────────────');
const log = await page.evaluate(() => window.__lockLog);
const fsCall = log.indexOf('fullscreen:call');
const fsDone = log.indexOf('fullscreen:resolve');
const lockAt = log.indexOf('lock:call');
check('fullscreen is requested when a child starts playing', fsCall >= 0, log);
check('the landscape lock is requested at all', lockAt >= 0, log);
check('the lock is requested AFTER fullscreen resolves (browsers refuse it otherwise)',
  lockAt >= 0 && fsDone >= 0 && lockAt > fsDone, log);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED:\n  ' + errors.join('\n  ')
  : '✓ ALL CLEAN'));
await b.close();
process.exit(errors.length ? 1 : 0);
