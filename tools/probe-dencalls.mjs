// WHERE THE DEN'S DRAW CALLS ACTUALLY GO.
//
// The Den is the room with the tightest budget in the game and the least
// obvious cost: it has no combat, so what it measures standing still IS its
// worst frame, and it carries more CHARACTERS than anywhere else — skinned
// meshes, which js/batch.js's flattenStatic correctly refuses to merge.
//
// verify-den says PASS or FAIL. This says WHY: the same twelve-position sweep,
// plus a count of meshes by material name, at each stage of the room's life
// (nothing freed, the old two spirits, all six). It is what found that 39 of
// the Den's 113 meshes were the five people standing in it — `rogue` alone at
// SIXTEEN, because a KayKit humanoid is eight primitives sharing one material
// and every one of them was its own draw call. Merging them per material
// (js/assets.js prepareCharacter) took the room from 137 to 102.
//
//   node tools/probe-dencalls.mjs
import { launchBrowser } from './launch.mjs';
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('ERR ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'CALL');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try { await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === r && window.__game.player.hearts > 1, room, { timeout: 45000 }); return true; }
    catch { /* retry */ }
  }
  return false;
};
const measure = async (label, setup) => {
  await page.evaluate(setup);
  await go('den');
  const r = await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) await new Promise((res) => requestAnimationFrame(res));
    const g = window.__game;
    const step = () => new Promise((res) => requestAnimationFrame(res));
    let worst = 0, at = null;
    for (const x of [-5, 0, 5]) for (const z of [-4, 0, 4, 8]) {
      const p = g.world.resolveCircle(x, z, 0.32);
      g.player.root.position.set(p.x, g.player.root.position.y, p.z);
      for (let i = 0; i < 5; i++) await step();
      const c = g.renderer.info.render.calls;
      if (c > worst) { worst = c; at = [Math.round(p.x), Math.round(p.z)]; }
    }
    const byMat = new Map();
    g.world.root.traverse((n) => {
      if (!n.isMesh && !n.isInstancedMesh) return;
      const k = (n.material && n.material.name) || n.type;
      byMat.set(k, (byMat.get(k) || 0) + 1);
    });
    let meshes = 0; g.world.root.traverse((n) => { if (n.isMesh || n.isInstancedMesh) meshes++; });
    let lights = 0; g.world.root.traverse((n) => { if (n.isLight) lights++; });
    const top = [...byMat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    const inst = []; g.world.root.traverse((n) => { if (n.isInstancedMesh) inst.push(((n.material||{}).name||'?') + 'x' + n.count); });
    return { worst, at, calls: g.renderer.info.render.calls, meshes, lights, top, inst: inst.length };
  });
  console.log(label.padEnd(34), JSON.stringify(r));
};
await measure('nothing restored', () => {
  const g = window.__game;
  g.state.settings.greybox = false; g.player.iframes = 999999;
  for (const k of ['ember','stone','wild','frost','storm','vale']) g.WS.set(k, 'restored', false);
  for (const gk of ['g1','g2','g3','g4','g5','g6']) g.WS.set('village', 'guardian_' + gk, false);
});
await measure('ember+stone (the old two)', () => {
  const g = window.__game;
  for (const k of ['ember','stone']) g.WS.set(k, 'restored', true);
});
await measure('all six spirits', () => {
  const g = window.__game;
  for (const k of ['ember','stone','wild','frost','storm','vale']) g.WS.set(k, 'restored', true);
});
await measure('...+ village cleared (Tam gate n/a)', () => {
  const g = window.__game;
  for (const gk of ['g1','g2','g3','g4','g5','g6']) g.WS.set('village', 'guardian_' + gk, true);
});
await b.close();
