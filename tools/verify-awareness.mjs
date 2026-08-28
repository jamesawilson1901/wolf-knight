// THE MOMENT BEFORE BEING SEEN.
//
// `alert` has always named three states — unaware, suspicious, aware — and the
// code only ever used two. A shadow was oblivious or it was hunting you, and
// the change happened between one frame and the next.
//
// That is the one thing a stealth rule must not do to a five-year-old. There
// was no moment in which the game told her she was about to be seen, and none
// in which she could do anything about it. This checks the middle state exists,
// that it is reachable and escapable, and that it shows on the body.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'AWARE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});
for (let a = 0; a < 8; a++) {
  await page.evaluate(() => { const g = window.__game;
    g.state.room = 'xh'; g.player.iframes = 0; g.player.hearts = 0.5;
    g.player.hurt(99, { pierceDefend: true }); });
  // world.roomId (stamped by the room's own builder, the rebuild's last
  // step) is the identity a race can't forge — state.room flips the instant
  // a jump is requested, before that rebuild even starts. See
  // verify-level3.mjs for the false failure this raced into once.
  try { await page.waitForFunction(() => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom('xh')
    && window.__game.player.hearts > 1, null, { timeout: 45000 }); break; } catch { /* retry */ }
}

// The eyes live in one of two shapes depending on the enemy — a single material
// on some, a list on others — so read whichever this one has.
await page.evaluate(() => {
  window.eyeOf = (e) => {
    if (e.eyeMat) return +e.eyeMat.emissiveIntensity.toFixed(2);
    if (e.eyeMats && e.eyeMats.length) return +e.eyeMats[0].emissiveIntensity.toFixed(2);
    return null;
  };
});

// Put Kael a long way off, drop every shadow into `unaware`, and let it settle.
const setup = async (dist) => page.evaluate(async (d) => {
  const g = window.__game, w = g.world;
  const foes = (w.enemies || []).filter((e) => e._sleeps && !e.dead);
  if (!foes.length) return null;
  const e = foes[0];
  e.alert = 'unaware'; e._suspT = 0; e._calmT = 0;
  g.player.root.position.set(e.x + d, g.player.root.position.y, e.z);
  g.player.iframes = 99999;
  for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  return { alert: e.alert, eyes: eyeOf(e) };
}, dist);

// SECONDS, NOT FRAMES. Under SwiftShader a frame can be 30ms or 300, so a
// frame count says nothing about how long the shadow has been deciding — the
// first version of this file "waited half a second" and the enemy had already
// had two.
const settleFrames = (secs) => page.evaluate(async (s) => {
  const g = window.__game;
  const until = performance.now() + s * 1000;
  while (performance.now() < until) { g.player.iframes = 99999; await new Promise((r) => requestAnimationFrame(r)); }
  const e = (g.world.enemies || []).filter((x) => x._sleeps && !x.dead)[0];
  return e ? { alert: e.alert, susp: +(e._suspT || 0).toFixed(2),
    eyes: eyeOf(e) } : null;
}, secs);

console.log('\n── 1. far away, a shadow does not know you are there ──');
const far = await setup(9);
check('the Great Hall has a shadow that can sleep', !!far, far);
check('at nine units it is unaware', far && far.alert === 'unaware', far);
const farEyes = far && far.eyes;

console.log('\n── 2. walk closer and it half-notices ────────────────');
await setup(9);
await page.evaluate(() => {
  const g = window.__game;
  const e = (g.world.enemies || []).filter((x) => x._sleeps && !x.dead)[0];
  g.player.root.position.set(e.x + 4, g.player.root.position.y, e.z);
});
const susp = await settleFrames(0.6);
check('inside five units it becomes SUSPICIOUS, not instantly aware',
  susp && susp.alert === 'suspicious', susp);

// WAIT ON THE GAME'S CLOCK, NOT THE WALL'S. Headless under SwiftShader the
// world advances perhaps a fifth of real time, so "wait three seconds" gave the
// shadow half a second of thinking and the test called it a bug.
const waitUntil = (fn, capSecs = 40) => page.evaluate(async ([src, cap]) => {
  const test = new Function('e', 'return (' + src + ')(e);');
  const g = window.__game;
  const until = performance.now() + cap * 1000;
  let e;
  while (performance.now() < until) {
    g.player.iframes = 99999;
    e = (g.world.enemies || []).filter((x) => x._sleeps && !x.dead)[0];
    if (e && test(e)) break;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return e ? { alert: e.alert, susp: +(e._suspT || 0).toFixed(2), eyes: window.eyeOf(e) } : null;
}, [fn.toString(), capSecs]);

const rising = await waitUntil((e) => (e._suspT || 0) > 0.4);
check('...and its eyes come up, so the pose says so',
  rising && farEyes !== null && rising.eyes > farEyes,
  { unaware: farEyes, deciding: rising && rising.eyes });

console.log('\n── 3. it takes a beat, and you can still get away ─────');
check('a good way in, it is still only deciding',
  rising && rising.alert === 'suspicious', rising);
// back off, and it should settle rather than commit
await page.evaluate(() => {
  const g = window.__game;
  const e = (g.world.enemies || []).filter((x) => x._sleeps && !x.dead)[0];
  g.player.root.position.set(e.x + 12, g.player.root.position.y, e.z);
});
const backedOff = await waitUntil((e) => e.alert === 'unaware');
check('back away and it settles again — one mistake is not fatal',
  backedOff && backedOff.alert === 'unaware', backedOff);

console.log('\n── 4. stay put and it does commit ───────────────────');
await setup(9);
await page.evaluate(() => {
  const g = window.__game;
  const e = (g.world.enemies || []).filter((x) => x._sleeps && !x.dead)[0];
  g.player.root.position.set(e.x + 2.5, g.player.root.position.y, e.z);
});
const seen = await waitUntil((e) => e.alert === 'aware');
check('stand in front of it long enough and it sees you', seen && seen.alert === 'aware', seen);

console.log('\n── 5. ghosting is still the answer ──────────────────');
await setup(9);
await page.evaluate(() => {
  const g = window.__game;
  const e = (g.world.enemies || []).filter((x) => x._sleeps && !x.dead)[0];
  g.player.root.position.set(e.x + 3, g.player.root.position.y, e.z);
  g.state.form = 'ghost_wolf';
  g.player.ghostUntil = g.player._time + 60;   // held ghosted
});
const ghosted = await settleFrames(3.0);
check('a ghost standing right beside it is never noticed',
  ghosted && ghosted.alert === 'unaware', ghosted);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — there is a moment before being seen.'));
await b.close();
process.exit(errors.length ? 1 : 0);
