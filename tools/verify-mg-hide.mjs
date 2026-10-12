// PIP'S HIDE AND SEEK, driven end to end (js/mg-hide.js) on the shared
// harness. Same shape as verify-mg-tag.mjs. What this one has to prove is
// the game's one promise: when Pip is HIDDEN the camera cannot see him (a ray
// from the camera hits the prop first), and when he PEEKS it can. Every find
// is a real mouse press through the harness's #mg-tap layer.
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
await page.fill('#t-name', 'HIDE');
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
const RING = { x: 4.2, z: -2.4 };
const hasRing = () => page.evaluate(() => (window.__game.world.denGames || []).some((g) => g.id === 'hide'));

// 1. LOCKED with no rescue (Tier 0)
check('the Den builds', await go('den'));
check('no rescue yet: no Hide and Seek ring', !(await hasRing()));

// 2. the first rescue opens it
await page.evaluate(() => { window.__game.state.flags.rescued = { a: 1 }; });
await go('g1');
check('one rescue (Tier 1): the Den has a Hide and Seek ring', (await go('den')) && await hasRing());

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

// 3. walk into the ring
await page.evaluate((r) => { window.__game.player.root.position.set(r.x, 0, r.z); }, RING);
await frames(8);
const opened = await page.evaluate(() => ({ active: window.__game.world.harness.active, phase: window.__game.world.harness.phase,
  realPipShown: window.__game.pip.root.visible }));
check('walking into the ring opens Hide and Seek, with the demo for a first-timer', opened.active && opened.phase === 'demo', opened);
check('the real Pip steps out for the round (never two of him)', opened.realPipShown === false, opened);
await page.locator('#mg-tap').dispatchEvent('pointerdown');
await frames(3);

// THE PROMISE: hidden is hidden, a peek is seen — re-measured here with a
// fresh ray per spot, not taken from the game's own word
const vis = await page.evaluate(async () => {
  const THREE = await import('three');
  const g = window.__game, game = g.world.harness._live, cam = g.camera;
  const ray = new THREE.Raycaster();
  const seen = (x, z, y = 0.3) => {
    const p = new THREE.Vector3(x, y, z), dir = p.clone().sub(cam.position), dist = dir.length();
    ray.set(cam.position, dir.normalize()); ray.far = dist;
    const solids = g.world.root.children.filter((c) => c !== game.group && c.name !== 'ground' && c.name !== 'thresholdGlow');
    const hit = ray.intersectObjects(solids, true).find((h) => h.object.visible && !(h.object.material && h.object.material.transparent && h.object.material.opacity < 0.95));
    return !hit || hit.distance > dist - 0.25;
  };
  return { why: game._why, phase: g.world.harness.phase, n: game.spots.length,
    hiddenSeen: game.spots.filter((s) => seen(s.x, s.z)).length, peekSeen: game.spots.filter((s) => seen(s.peek.x, s.peek.z, (s.peek.y || 0) + 0.3)).length,
    ups: game.spots.filter((s) => s.peek.y).length };
});
check('play starts, with at least three hiding places in view of the ring', vis.phase === 'play' && vis.n >= 3, vis);
check('at every hiding place, the camera cannot see him', vis.hiddenSeen === 0, vis);
check('at every peek (beside it, or up over the top), the camera can', vis.peekSeen === vis.n, vis);

const pipOnScreen = () => page.evaluate(() => {
  const g = window.__game, game = g.world.harness._live, V = g.camera.position.constructor;
  const v = new V(game.model.position.x, 0.3, game.model.position.z).project(g.camera);
  return { phase: game.phase, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
});
const score = () => page.evaluate(() => Number(document.getElementById('mg-score').textContent));

// 4. a tap on empty grass finds nothing
const s0 = await score();
await page.mouse.click(30, 330);
await frames(3);
check('a tap on empty grass finds nothing', (await score()) === s0, { s0, after: await score() });

// 5. wait for a peek, tap him: one point
await page.waitForFunction(() => window.__game.world.harness._live.phase === 'peek', null, { timeout: 15000 }).catch(() => {});
let p = await pipOnScreen();
await page.mouse.click(p.x, p.y);
await frames(3);
const s1 = await score();
check('tapping Pip while he peeks finds him: +1', p.phase === 'peek' && s1 === s0 + 1, { p, s0, s1 });

// 6. he dashes to a NEW place
await page.waitForFunction(() => window.__game.world.harness._live.phase === 'hidden', null, { timeout: 8000 }).catch(() => {});
const moved = await page.evaluate(() => { const g = window.__game.world.harness._live; return { at: g.at, phase: g.phase, found: g.found }; });
check('...then he dashes off to hide somewhere else', moved.phase === 'hidden' && moved.found === 1, moved);

// 7. remembering where he went: tap the prop he is behind, mid-hide: +2
p = await pipOnScreen();
await page.mouse.click(p.x, p.y);
await frames(3);
const s2 = await score();
check('a tap where he is hiding (he was not peeking) finds him for double', p.phase === 'hidden' && s2 === s1 + 2, { p, s1, s2 });

// 8. the clock, results
await page.evaluate(() => { window.__game.world.harness.update(99, 0); });
await frames(3);
const res = await page.evaluate(() => ({ phase: window.__game.world.harness.phase, best: (window.__game.state.minigames.hide || {}).best }));
check('the clock ends on the results card, with a personal best', res.phase === 'results' && res.best > 0, res);

// 9. out: Pip is back, nothing left behind
await page.locator('#mg-leave').dispatchEvent('pointerdown');
await frames(4);
const back = await page.evaluate(() => window.__game.pip.root.visible);
check('the real Pip is back with Kael', back === true);
await page.evaluate(() => { window.__game.player.root.position.set(-6, 0, 0); });
const final = await restCalls();
check('leaving leaves nothing in the room', final.children === baseline.children, { before: baseline.children, after: final.children });
check('draw calls return to where they started (exact)', final.calls === baseline.calls, { before: baseline.calls, after: final.calls });

check('no page errors', !errors.some((e) => e.startsWith('PAGEERROR')), errors.filter((e) => e.startsWith('PAGEERROR')).slice(0, 3));
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — Pip hides where he cannot be seen, peeks where he can, and leaves nothing behind');
await b.close();
process.exit(errors.length ? 1 : 0);
