// WHAT IS STANDING IN THE MIDDLE OF THE DRAINED VAULT?
//
// verify-level2-progress §5 asserts that once the sunken ring drains, the
// centre of `vh` can be walked — dad's "a puddle of water with a character
// and a chest in the centre that you are unable to get to". It passes on
// main and fails on this branch, so something here has made the drained ring
// solid again and re-broken that promise.
//
// This asks the world directly, both ways, and names the collider rather than
// reporting a boolean: which one covers (0,0), what tagged it, and which prop
// solidifyProps claimed it from.
import { launchBrowser } from './launch.mjs';

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'VAULT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

const out = await page.evaluate(async () => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');
  const g = window.__game;
  const res = [];
  for (const noSolid of [false, true]) {
    window.__noSolid = noSolid;
    // stage() counts milestones FROM THE FRONT of the list, so `drained` on
    // its own leaves the vault at stage 0 and the ring still flooded — which
    // is a correctly walled centre and not the bug. `spark` first.
    g.WS.set('vault', 'spark', true);
    g.WS.set('vault', 'drained', true);
    const w = await rooms.buildRoom('vh', new THREE.Scene());
    w.root.updateMatrixWorld(true);
    const probe = (x, z) => {
      const r = w.resolveCircle(x, z, 0.32);
      return { push: +Math.hypot(r.x - x, r.z - z).toFixed(3) };
    };
    // every collider that actually covers the centre
    const covering = [];
    for (const c of (w.circleColliders || [])) {
      if (Math.hypot(c.x, c.z) < c.r + 0.32) {
        covering.push({ kind: 'circle', x: +c.x.toFixed(2), z: +c.z.toFixed(2),
          r: +c.r.toFixed(2), tag: c.tag || null });
      }
    }
    for (const c of (w.boxColliders || [])) {
      if (c.minX - 0.32 < 0 && c.maxX + 0.32 > 0 && c.minZ - 0.32 < 0 && c.maxZ + 0.32 > 0) {
        covering.push({ kind: 'box', minX: +c.minX.toFixed(2), maxX: +c.maxX.toFixed(2),
          minZ: +c.minZ.toFixed(2), maxZ: +c.maxZ.toFixed(2), tag: c.tag || null });
      }
    }
    // and what is actually MODELLED near the centre, so the collider can be
    // traced back to the thing a child would see
    const nearby = []; const parentNames = [];
    const p = new THREE.Vector3(); const bb = new THREE.Box3();
    for (const child of w.root.children) {
      const kids = (child.isMesh || !(child.children || []).length) ? [child] : child.children;
      for (const m of kids) {
        bb.setFromObject(m);
        if (!isFinite(bb.min.x)) continue;
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        if (Math.hypot(cx, cz) > 2.2) continue;
        const fx = bb.max.x - bb.min.x, fz = bb.max.z - bb.min.z;
        if (fx > 7 || fz > 7) continue;   // what solidifyProps itself skips
        parentNames.push(`${child.name || child.type} > ${m.name || m.type}`);
        nearby.push({ name: m.name || m.type, at: [+cx.toFixed(2), +cz.toFixed(2)],
          size: [+(bb.max.x - bb.min.x).toFixed(2), +(bb.max.y - bb.min.y).toFixed(2),
            +(bb.max.z - bb.min.z).toFixed(2)], minY: +bb.min.y.toFixed(2) });
      }
    }
    res.push({ noSolid, centre: probe(0, 0), stage: g.WS.stage('vault'),
      solid: w._solidified || null, covering, nearby: nearby.slice(0, 20), parents: parentNames });
  }
  window.__noSolid = false;
  return res;
});
for (const r of out) {
  console.log(`\n__noSolid = ${r.noSolid}  stage=${r.stage}  centre push = ${r.centre.push}`);
  console.log(`  solidifyProps: ${JSON.stringify(r.solid)}`);
  console.log(`  colliders covering (0,0): ${JSON.stringify(r.covering)}`);
  console.log('  modelled within 3u of the centre:');
  for (const n of r.nearby) console.log(`     ${JSON.stringify(n)}`);
  console.log(`  parent > model: ${JSON.stringify(r.parents)}`);
}
await b.close();
