// PUP TAG, driven end to end — the third game on the shared harness
// (js/minigame.js, js/mg-tag.js). Mirrors verify-mg-quiz.mjs's shape. What
// differs is what differs in the game: the target is a RUNNING pup, so every
// catch here is a real mouse press at that pup's place on screen, through the
// harness's own #mg-tap layer — the input a child's finger makes.
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
await page.fill('#t-name', 'TAG');
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
const RING = { x: 4.8, z: 6.6 };
const hasRing = () => page.evaluate(() => (window.__game.world.denGames || []).some((g) => g.id === 'tag'));

// 1. LOCKED below Tier 2: three rescues is Tier 1
await page.evaluate(() => { window.__game.state.flags.rescued = { a: 1, b: 1, c: 1 }; });
check('the Den builds', await go('den'));
check('three rescues (Tier 1): no Pup Tag ring yet', !(await hasRing()));

// 2. the fourth rescue opens it
await page.evaluate(() => { window.__game.state.flags.rescued.d = 1; });
await go('g1');
check('four rescues (Tier 2): the Den has a Pup Tag ring', (await go('den')) && await hasRing());

// the draw-call baseline, the verify-minigame discipline (creatures hidden)
const REST = { x: -6, z: 0 };
const restCalls = () => page.evaluate(async (p) => {
  const g = window.__game;
  const wait = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
  g.player.root.position.set(p.x, 0, p.z);
  let last = null, still = 0;
  for (let i = 0; i < 600 && still < 6; i++) {
    await wait(1);
    const c = g.camera.position;
    const moved = last ? Math.abs(c.x - last.x) + Math.abs(c.y - last.y) + Math.abs(c.z - last.z) : Infinity;
    still = moved < 0.0005 ? still + 1 : 0;
    last = { x: c.x, y: c.y, z: c.z };
  }
  if (!window.__restMovers) {
    const m = new Set([g.pip && g.pip.root].filter(Boolean));
    for (const top of [...g.scene.children, ...g.world.root.children]) {
      let skinned = false;
      top.traverse((n) => { if (n.isSkinnedMesh) skinned = true; });
      if (skinned && top !== g.player.root && top !== g.world.root) m.add(top);
    }
    window.__restMovers = m;
  }
  const hid = [];
  for (const o of window.__restMovers) if (o.visible) { o.visible = false; hid.push(o); }
  await wait(2);
  const s = [];
  for (let i = 0; i < 5; i++) { s.push(g.renderer.info.render.calls); await wait(12); }
  for (const o of hid) o.visible = true;
  s.sort((a, c) => a - c);
  return { children: g.world.root.children.length, calls: s[2] };
}, REST);
const baseline = await restCalls();

// 3. walk into the ring: the demo
await page.evaluate((r) => { window.__game.player.root.position.set(r.x, 0, r.z); }, RING);
await frames(8);
const opened = await page.evaluate(() => ({ active: window.__game.world.harness.active, phase: window.__game.world.harness.phase }));
check('walking into the ring opens Pup Tag, with the demo for a first-timer', opened.active && opened.phase === 'demo', opened);
// a tap anywhere skips the demo into play (the harness's own rule)
await page.locator('#mg-tap').dispatchEvent('pointerdown');
await frames(3);

// where a pup is on screen right now (the same projection the game uses)
const pupsOnScreen = () => page.evaluate(() => {
  const g = window.__game, THREE = g.camera.position.constructor;
  const game = g.world.harness._live;
  const out = [];
  for (const p of (game ? game.pups : [])) {
    const v = new THREE(p.x, 0.35, p.z).project(g.camera);
    out.push({ caught: !!p.caught, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight });
  }
  return out;
});
const score = () => page.evaluate(() => Number(document.getElementById('mg-score').textContent));

const play = await page.evaluate(() => {
  const game = window.__game.world.harness._live;
  return { phase: window.__game.world.harness.phase, pups: game && game.pups.length, field: game && game.field.length,
    caught: game && game.pups.filter((p) => p.caught).length, draws: game && game.pups.map((p) => { let n = 0; p.model.traverse((m) => { if (m.isMesh && m.visible) n++; }); return n; }) };
});
check('play starts on a whole litter (the demo\'s catch does not carry over)', play.phase === 'play' && play.pups >= 3 && play.caught === 0, play);
check('each pup is ONE drawn part (the pen\'s rule), and the field has room to run', play.draws.every((n) => n === 1) && play.field >= 10, play);

// EVERY PUP IS WHERE A FINGER CAN REACH IT: on screen, left of the action
// buttons, below the HUD band — sampled across a couple of seconds of running
// (the first cut ran a third of its field off the right-hand edge)
const reach = [];
for (let k = 0; k < 6; k++) {
  for (const p of await pupsOnScreen()) reach.push([Math.round(p.x), Math.round(p.y)]);
  await frames(10);
}
const vw = 740, vh = 360;
check('every pup stays on screen and clear of the HUD while it runs',
  reach.every(([x, y]) => x > vw * 0.05 && x < vw * 0.78 && y > vh * 0.18 && y < vh * 0.92), reach.filter(([x, y]) => !(x > vw * 0.05 && x < vw * 0.78 && y > vh * 0.18 && y < vh * 0.92)).slice(0, 5));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, type: 'jpeg', quality: 88 });

// 4. a tap on empty grass catches nothing and costs nothing
const s0 = await score();
await page.mouse.click(30, 330);
await frames(3);
check('a tap on empty grass scores nothing', (await score()) === s0, { before: s0, after: await score() });

// 5. a tap ON a running pup catches it
let pups = await pupsOnScreen();
const target = pups.find((p) => !p.caught);
await page.mouse.click(target.x, target.y);
await frames(3);
const s1 = await score();
pups = await pupsOnScreen();
check('a tap on a pup catches it: +1 and that pup sits down', s1 === s0 + 1 && pups.filter((p) => p.caught).length === 1, { s0, s1 });

// 6. catch the whole litter: the bonus, then a new litter tumbles in
for (let k = 0; k < 8; k++) {
  pups = await pupsOnScreen();
  const t = pups.find((p) => !p.caught);
  if (!t) break;
  await page.mouse.click(t.x, t.y);
  await frames(2);
}
const s2 = await score();
check('the whole litter caught pays a bonus on top of one a pup', s2 >= s1 + (play.pups - 1) + 3, { s1, s2, pups: play.pups });
await page.waitForFunction(() => { const g = window.__game.world.harness._live;
  return g && g.pups.length && g.pups.every((p) => !p.caught); }, null, { timeout: 8000 }).catch(() => {});
const fresh = await page.evaluate(() => { const g = window.__game.world.harness._live; return { n: g.pups.length, caught: g.pups.filter((p) => p.caught).length, litters: g.litters }; });
check('...and a fresh litter tumbles in', fresh.n === play.pups && fresh.caught === 0 && fresh.litters >= 2, fresh);

// 7. the pups never run through the furniture
const clear = await page.evaluate(() => {
  const g = window.__game, w = g.world, game = w.harness._live;
  return game.pups.map((p) => { const s = w.resolveCircle(p.x, p.z, 0.25); return +Math.hypot(s.x - p.x, s.z - p.z).toFixed(3); });
});
check('no pup stands inside anything solid', clear.every((d) => d < 0.02), clear);

// 8. the clock runs out: results, a best recorded
await page.evaluate(() => { window.__game.world.harness.update(99, 0); });
await frames(3);
const res = await page.evaluate(() => ({ phase: window.__game.world.harness.phase,
  best: (window.__game.state.minigames.tag || {}).best }));
check('the clock ends the round on the results card, with a personal best', res.phase === 'results' && res.best > 0, res);

// 9. one tap out, and zero residue
await page.locator('#mg-leave').dispatchEvent('pointerdown');
await frames(4);
await page.evaluate(() => { window.__game.player.root.position.set(-6, 0, 0); });
const final = await restCalls();
check('leaving leaves nothing in the room', final.children === baseline.children, { before: baseline.children, after: final.children });
check('draw calls return to where they started (exact)', final.calls === baseline.calls, { before: baseline.calls, after: final.calls });

check('no page errors', !errors.some((e) => e.startsWith('PAGEERROR')), errors.filter((e) => e.startsWith('PAGEERROR')).slice(0, 3));
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — Pup Tag: tap the pups, catch the litter, leave nothing behind');
await b.close();
process.exit(errors.length ? 1 : 0);
