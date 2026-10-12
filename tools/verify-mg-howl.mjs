// HOWL ECHO, driven end to end (js/mg-howl.js) on the shared harness. Same
// shape as verify-mg-hide.mjs. Every press is a real pointerdown on a pad a
// child would press. What it has to prove is §4's promise: colour AND shape
// AND note agree for every element, the fire sings each note, a right
// sequence grows by one, and a wrong press replays it — never a lockout.
import { launchBrowser } from './launch.mjs';
import { restCalls as restCallsAt } from './mg-rest.mjs';

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
await page.fill('#t-name', 'HOWL');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.player.iframes = 999999;
  g.CONFIG.DIFFICULTY.GUIDE_IDLE_S = 1e9;
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};
const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);
const RING = { x: 1.6, z: 1.8 };
const hasRing = () => page.evaluate(() => (window.__game.world.denGames || []).some((g) => g.id === 'howl'));

// 1. LOCKED with no rescue
check('the Den builds', await go('den'));
check('no rescue yet: no Howl Echo ring', !(await hasRing()));
await page.evaluate(() => { window.__game.state.flags.rescued = { a: 1 }; });
await go('g1');
check('one rescue (Tier 1): the Den has a Howl Echo ring', (await go('den')) && await hasRing());

// the draw-call baseline, the verify-minigame discipline (creatures hidden)
const REST = { x: -6, z: 0 };
const restCalls = () => restCallsAt(page, REST);
const baseline = await restCalls();

// 2. walk in, skip the demo
await page.evaluate((r) => { window.__game.player.root.position.set(r.x, 0, r.z); }, RING);
await frames(8);
const opened = await page.evaluate(() => ({ active: window.__game.world.harness.active, phase: window.__game.world.harness.phase,
  pads: document.querySelectorAll('.mgh-pad').length }));
check('walking into the ring opens Howl Echo with its pads up', opened.active && opened.phase === 'demo' && opened.pads >= 3, opened);
await page.locator('#mg-tap').dispatchEvent('pointerdown');
await frames(3);

// 3. every pad: its own colour, its own shape, its own note; big enough to aim at
const pads = await page.evaluate(() => {
  const game = window.__game.world.harness._live;
  const boxes = [...document.querySelectorAll('.mgh-pad')].map((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  return { els: game.pads.map((p) => p.el), shapes: game.pads.map((p) => p.shape), rates: game.pads.map((p) => p.rate), boxes };
});
check('each pad is its own element, its own shape AND its own note (not colour alone)',
  new Set(pads.els).size === pads.els.length && new Set(pads.shapes).size === pads.shapes.length
  && new Set(pads.rates).size === pads.rates.length, pads);
check('every pad clears the 44px floor', pads.boxes.every(([w, h]) => w >= 44 && h >= 44), pads.boxes);

// 4. the fire sings: during playback the hearth's light wears the note's colour
const sang = await page.evaluate(async () => {
  const g = window.__game, game = g.world.harness._live;
  const { elementColor } = await import('/js/juice.js');
  const cp = g.world.checkpoints.find((c) => c.id === 'cp_den');
  for (let i = 0; i < 400 && game.phase !== 'play'; i++) await new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < 600 && game.step === 0; i++) await new Promise((r) => requestAnimationFrame(r));
  const want = elementColor(game.pads[game.seq[0]].el);
  return { got: cp.light.color.getHex(), want, base: game.fire.col };
});
check('the den fire flashes each note\'s colour', sang.got === sang.want && sang.want !== sang.base, sang);

const listen = () => page.waitForFunction(() => window.__game.world.harness._live.phase === 'listen', null, { timeout: 20000 });
const seq = () => page.evaluate(() => [...window.__game.world.harness._live.seq]);
const score = () => page.evaluate(() => Number(document.getElementById('mg-score').textContent));
const press = (i) => page.locator('.mgh-pad').nth(i).dispatchEvent('pointerdown');

// 5. echo it back right: +length, and it grows by one
await listen();
let s1 = await seq();
const sc0 = await score();
for (const i of s1) await press(i);
await frames(4);
await page.waitForFunction((n) => window.__game.world.harness._live.seq.length === n + 1, s1.length, { timeout: 8000 }).catch(() => {});
const s2 = await seq();
const sc1 = await score();
check('echoing the sequence right scores its length and grows it by one', sc1 === sc0 + s1.length && s2.length === s1.length + 1
  && s2.slice(0, s1.length).join() === s1.join(), { s1, s2, sc0, sc1 });

// 6. a wrong press: nothing scored, the SAME sequence plays again
await listen();
const wrong = (s2[0] + 1) % pads.els.length;
await press(wrong);
await frames(4);
await page.waitForFunction(() => window.__game.world.harness._live.phase === 'play', null, { timeout: 8000 }).catch(() => {});
const s3 = await seq();
check('a wrong press scores nothing and replays the same sequence (no lockout)', (await score()) === sc1 && s3.join() === s2.join(), { s2, s3 });

// 7. the clock, results
await page.evaluate(() => { window.__game.world.harness.update(99, 0); });
await frames(3);
const res = await page.evaluate(() => ({ phase: window.__game.world.harness.phase, best: (window.__game.state.minigames.howl || {}).best }));
check('the clock ends on the results card, with a personal best', res.phase === 'results' && res.best > 0, res);

// 8. out: the fire is the fire again, the pads are gone, nothing left behind
await page.locator('#mg-leave').dispatchEvent('pointerdown');
await frames(4);
const after = await page.evaluate(() => { const g = window.__game; const cp = g.world.checkpoints.find((c) => c.id === 'cp_den');
  return { light: cp.light.color.getHex(), row: !!document.getElementById('mgh-row') }; });
check('the hearth gets its own colour back and the pads leave the screen', after.light === sang.base && !after.row, after);
await page.evaluate(() => { window.__game.player.root.position.set(-6, 0, 0); });
const final = await restCalls();
check('leaving leaves nothing in the room', final.children === baseline.children, { before: baseline.children, after: final.children });
check('draw calls return to where they started (exact)', final.calls === baseline.calls, { before: baseline.calls, after: final.calls });

check('no page errors', !errors.some((e) => e.startsWith('PAGEERROR')), errors.filter((e) => e.startsWith('PAGEERROR')).slice(0, 3));
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — Howl Echo: colour, shape and note agree, the fire sings, and nobody is ever locked out');
await b.close();
process.exit(errors.length ? 1 : 0);
