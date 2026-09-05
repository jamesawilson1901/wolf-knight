// WHY DOES §6 OF verify-looks CHANGE WHEN solidifyProps RUNS?
//
// The first investigation compared MESH DUMPS of the three failing rooms with
// and without the pass, found them byte-identical, and stalled. That was the
// wrong comparison twice over: §6 does not read the mesh list (it fires five
// rays and reports only when all five stop on the same NAME), and a mesh list
// does not record WHERE each mesh is.
//
// The hypothesis this probe tests: verify-looks builds every room with
// `rooms.buildRoom(id, new THREE.Scene())` — a detached scene that is never
// added to the renderer and never rendered — so nothing ever calls
// updateMatrixWorld on it and every object's matrixWorld stays identity.
// Box3.setFromObject, which solidifyProps calls once per placed prop, updates
// world matrices as a side effect. If that is the whole story, then:
//
//   * unrendered + no solidify  → props sit at the origin, rays miss;
//   * unrendered + solidify     → the props it walked are in their real
//                                 places, rays hit them;
//   * matrices updated by hand  → the SAME hits either way.
//
// The third line is the one that decides it.
import { launchBrowser } from './launch.mjs';

const ROOMS = (process.env.WK_ROOMS || 'vga,s1p,xsh').split(',');

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SOLID');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { window.__noBatch = true; });

const rows = await page.evaluate(async (ids) => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');

  // §6's own fan, lifted verbatim so this cannot drift from the check
  const fan = (w) => {
    const foe = new Set();
    for (const e of (w.enemies || [])) {
      if (!e.root) continue;
      e.root.traverse((n) => { if (n.isMesh) foe.add(n); });
    }
    const ray = new THREE.Raycaster();
    const eye = new THREE.Vector3(w.spawn.x, 1.15, w.spawn.z);
    const hits = [];
    for (let i = -2; i <= 2; i++) {
      const a = w.spawn.angle + i * 0.14;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).normalize();
      ray.set(eye, dir); ray.far = 4.2;
      const h = ray.intersectObject(w.root, true)
        .filter((x) => x.object.isMesh && x.object.visible
          && !(x.object.material && x.object.material.transparent))
        .filter((x) => x.distance > 0.8)
        .filter((x) => !foe.has(x.object))
        .filter((x) => !/floor|ground|path|patch|water|road/i.test(x.object.name || ''))[0];
      hits.push(h ? `${h.object.name || h.object.geometry.type}@${h.distance.toFixed(2)}` : '—');
    }
    return hits;
  };
  // how many meshes are still parked at the origin because nothing moved them
  const atOrigin = (w) => {
    let n = 0, tot = 0;
    const p = new THREE.Vector3();
    w.root.traverse((o) => {
      if (!o.isMesh) return;
      tot++;
      p.setFromMatrixPosition(o.matrixWorld);
      if (p.lengthSq() < 1e-6) n++;
    });
    return `${n}/${tot}`;
  };

  const out = [];
  for (const id of ids) {
    for (const noSolid of [false, true]) {
      window.__noSolid = noSolid;
      const w = await rooms.buildRoom(id, new THREE.Scene());
      const asBuilt = fan(w);
      const originBefore = atOrigin(w);
      // what a rendered frame would have done, and what the check never does
      w.root.updateMatrixWorld(true);
      out.push({ id, noSolid, asBuilt, originBefore,
        updated: fan(w), originAfter: atOrigin(w) });
    }
  }
  window.__noSolid = false;
  return out;
}, ROOMS);

console.log('room  __noSolid | rays AS BUILT (what §6 sees)            | at-origin | rays AFTER updateMatrixWorld');
for (const r of rows) {
  console.log(`${r.id.padEnd(5)} ${String(r.noSolid).padEnd(9)} | ${JSON.stringify(r.asBuilt).padEnd(40)} | ${r.originBefore.padEnd(9)} | ${JSON.stringify(r.updated)}  (${r.originAfter})`);
}
await b.close();
