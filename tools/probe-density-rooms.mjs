// HOW MANY THINGS ARE IN THE ARRIVAL FRAME?
//
// ROOM-STANDARD's floor is 32, and verify-density measures the whole game.
// This measures a NAMED list, which is what you want the hour a new room is
// written rather than the eight minutes the full sweep costs.
//
//   WK_ROOMS='c1,c2' node tools/probe-density-rooms.mjs
import { launchBrowser } from './launch.mjs';
const ROOMS = (process.env.WK_ROOMS || 'c1').split(',').map((s) => s.trim()).filter(Boolean);
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('ERR ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DENS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game;
  g.state.settings.greybox = false; g.player.iframes = 999999;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
    'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world
        && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};
for (const id of ROOMS) {
  if (!await go(id)) { console.log(id.padEnd(5), 'FAILED TO BUILD'); continue; }
  const r = await page.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 12; i++) await new Promise((res) => requestAnimationFrame(res));
    // THE ARRIVAL FRAME, the way verify-density defines it: what the camera
    // actually contains standing on the spawn. Instanced meshes count once per
    // INSTANCE, because a child sees fifteen rocks, not one draw call.
    const cam = g.camera;
    cam.updateMatrixWorld();
    const m = new (Object.getPrototypeOf(cam.projectionMatrix).constructor)();
    m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const frustum = new (window.__THREE_FRUSTUM__ || Object)();
    let things = 0;
    const p = new g.player.root.position.constructor();
    g.world.root.traverse((n) => {
      if (!n.isMesh && !n.isInstancedMesh) return;
      n.updateWorldMatrix(true, false);
      if (n.isInstancedMesh) { things += n.count; return; }
      p.setFromMatrixPosition(n.matrixWorld);
      const d = Math.hypot(p.x - g.player.root.position.x, p.z - g.player.root.position.z);
      if (d < 22) things++;
      return frustum;
    });
    return { things, calls: g.renderer.info.render.calls, half: [g.world.halfW, g.world.halfD] };
  });
  console.log(id.padEnd(5), JSON.stringify(r));
}
await b.close();
