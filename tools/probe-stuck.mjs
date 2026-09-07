// WHAT IS EACH STUCK BODY ACTUALLY STUCK IN, and where is the nearest ground?
// verify-spawn-clear names eight; it does not say what they are inside, and a
// slime sitting in a water zone is a different problem from a skeleton inside
// a rock. Reports the offending collider and the closest clear spot for each.
import { launchBrowser } from './launch.mjs';
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 400 } })).newPage();
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'STUCK');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

const ROOMS = ['q2', 'mb', 'la', 'vc1', 'd4a', 'dlg'];
for (const id of ROOMS) {
  const r = await page.evaluate(async (room) => {
    const rooms = await import('/js/rooms.js'); const THREE = await import('three');
    const w = await rooms.buildRoom(room, new THREE.Scene());
    const out = [];
    for (const e of (w.enemies || [])) {
      if (e.scenery || !e.root || e.flying) continue;
      const x = e.x, z = e.z, R = e.radius || 0.4;
      let hit = null;
      for (const c of w.boxColliders) {
        const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) {
          hit = { kind: 'box', tag: c.tag || c.kind || '(untagged)',
            box: [+c.minX.toFixed(1), +c.maxX.toFixed(1), +c.minZ.toFixed(1), +c.maxZ.toFixed(1)] };
          break;
        }
      }
      if (!hit) for (const c of w.circleColliders) {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + R) ** 2) {
          hit = { kind: 'circle', tag: c.tag || c.kind || '(untagged)',
            at: [+c.x.toFixed(1), +c.z.toFixed(1)], r: +c.r.toFixed(2) };
          break;
        }
      }
      if (!hit) continue;
      // nearest clear ground, same overlap test, searched outward
      let best = null;
      for (let rad = 0.5; rad <= 6 && !best; rad += 0.5) {
        for (let a = 0; a < 32 && !best; a++) {
          const nx = +(x + rad * Math.cos(a * Math.PI / 16)).toFixed(1);
          const nz = +(z + rad * Math.sin(a * Math.PI / 16)).toFixed(1);
          if (Math.abs(nx) > w.halfW - 1 || Math.abs(nz) > w.halfD - 1) continue;
          let bad = false;
          for (const c of w.boxColliders) {
            const cx = Math.max(c.minX, Math.min(nx, c.maxX)), cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
            if ((nx - cx) ** 2 + (nz - cz) ** 2 < R * R) { bad = true; break; }
          }
          if (!bad) for (const c of w.circleColliders) {
            if ((nx - c.x) ** 2 + (nz - c.z) ** 2 < (c.r + R) ** 2) { bad = true; break; }
          }
          if (!bad) best = [nx, nz, +rad.toFixed(1)];
        }
      }
      out.push({ cls: e.constructor.name, at: [+x.toFixed(2), +z.toFixed(2)], R, hit, nearestClear: best });
    }
    return { room: w.roomId, stuck: out };
  }, id);
  if (r.stuck.length) console.log(JSON.stringify(r, null, 1));
}
await b.close();
