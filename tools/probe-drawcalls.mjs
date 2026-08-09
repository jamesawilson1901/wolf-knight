// WHICH FOUR OBJECTS? verify-minigame reports the draw-call delta; this says
// what is actually being drawn that was not there before. Same standing spot
// both times, so the camera frustum is identical and the diff is real.
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DRAWCALLS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.sfxVol = 0; g.state.flags.pups = { pup1: true }; g.player.iframes = 999999;
});
for (let a = 0; a < 8; a++) {
  await page.evaluate(() => { const g = window.__game;
    g.state.room = 'den'; g.player.iframes = 0; g.player.hearts = 0.5;
    g.player.hurt(99, { pierceDefend: true }); });
  try {
    await page.waitForFunction(() => window.__game.state.room === 'den' && window.__game.player.hearts > 1,
      null, { timeout: 45000 }); break;
  } catch { /* retry */ }
}

// Record what is ACTUALLY DRAWN, not what exists. renderer.info.render.calls
// counts draw calls including the shadow pass, and an object can be present,
// visible and still culled — so a diff of the scene graph can come back empty
// while the number moves. This hooks renderBufferDirect (an instance method on
// WebGLRenderer) and buckets every draw into the frame it belongs to.
await page.evaluate(() => {
  const r = window.__game.renderer;
  window.__frames = [];
  const render = r.render.bind(r);
  r.render = (scene, cam) => { window.__cur = []; window.__frames.push(window.__cur); render(scene, cam); };
  const draw = r.renderBufferDirect.bind(r);
  r.renderBufferDirect = (cam, scene, geo, mat, obj, group) => {
    if (window.__cur) window.__cur.push(
      `${obj.type}:${obj.name || '(anon)'}:${mat && mat.type}${mat && mat.isMeshDepthMaterial ? ':SHADOW' : ''}`);
    draw(cam, scene, geo, mat, obj, group);
  };
});

const snap = () => page.evaluate(async () => {
  const g = window.__game;
  g.player.root.position.set(-6, 0, 0);
  for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
  const seen = [];
  const scene = g.world.root.parent || g.world.root;
  scene.traverse((n) => {
    if (!(n.isMesh || n.isPoints || n.isLine || n.isSprite)) return;
    let vis = n.visible, p = n.parent;
    while (p) { if (!p.visible) vis = false; p = p.parent; }
    seen.push({ u: n.uuid, k: `${n.type}:${n.name || '(anon)'}:${(n.material && n.material.type) || '-'}`, vis });
  });
  const fr = window.__frames;
  const drawn = fr.length > 1 ? fr[fr.length - 2] : [];
  window.__frames = [];
  return { calls: g.renderer.info.render.calls, seen, drawn };
});

const before = await snap();

// one full round: walk in, tap through the demo, mash, run the clock out,
// take the results screen, exit
await page.evaluate(() => { window.__game.player.root.position.set(1.6, 0, 4.6); });
await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r)); });
await page.locator('#mg-tap').dispatchEvent('pointerdown');
await page.evaluate(async () => {
  const tap = document.getElementById('mg-tap');
  for (let i = 0; i < 120; i++) {
    tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
  }
  const h = window.__game.world.harness;
  for (let i = 0; i < 400 && h.phase === 'play'; i++) {
    h.update(0.12, i * 0.12);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
// ...then the rest of what verify-minigame does: replay, exit, and ten
// open/close cycles, so this probe walks the same road the check walks
await page.locator('#mg-replay').dispatchEvent('pointerdown');
await page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); });
await page.locator('#mg-exit').dispatchEvent('pointerdown');
await page.evaluate(async () => {
  const g = window.__game;
  for (const d of [...(g.world.drops || [])]) {
    if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
    if (d.root && d.root.parent) d.root.parent.remove(d.root);
  }
  g.world.drops = [];
  g.player.root.position.set(-6, 0, 0);
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  for (let i = 0; i < 10; i++) {
    g.player.root.position.set(1.6, 0, 4.6);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    if (g.world.harness.active) g.world.harness.exit();
    g.player.root.position.set(-6, 0, 0);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
  }
});
await page.evaluate(async () => {
  const g = window.__game;
  for (const d of [...(g.world.drops || [])]) {
    if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
    if (d.root && d.root.parent) d.root.parent.remove(d.root);
  }
  g.world.drops = [];
  for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
});

const after = await snap();
console.log('calls', before.calls, '->', after.calls);
const bu = new Map(before.seen.map((s) => [s.u, s]));
const au = new Map(after.seen.map((s) => [s.u, s]));
for (const [u, s] of au) if (!bu.has(u)) console.log('  ADDED   ', s.k, 'visible=' + s.vis);
for (const [u, s] of bu) if (!au.has(u)) console.log('  REMOVED ', s.k, 'visible=' + s.vis);
for (const [u, s] of au) {
  const p = bu.get(u);
  if (p && p.vis !== s.vis) console.log('  VIS ' + p.vis + '->' + s.vis, s.k);
}
// the real answer: a multiset diff of one settled frame's draw calls
const tally = (a) => a.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
const tb = tally(before.drawn), ta = tally(after.drawn);
console.log('drawn last frame', before.drawn.length, '->', after.drawn.length);
for (const k of new Set([...tb.keys(), ...ta.keys()])) {
  const x = tb.get(k) || 0, y = ta.get(k) || 0;
  if (x !== y) console.log(`  ${x} -> ${y}  ${k}`);
}
await b.close();
