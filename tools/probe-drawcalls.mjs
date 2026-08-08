// Round 2. Merging loose meshes only got r1 from 173 to 135 — not enough.
// Two more levers, measured one at a time so we learn which one actually pays:
//   A  FLATTEN: fold the InstancedMeshes into the merge as well, so all static
//      dressing sharing a material becomes ONE draw regardless of how it was
//      authored. Kenney kits share a single atlas material, so in theory a
//      whole room's scenery collapses to a handful of draws.
//   B  SHADOWS: a shadow map redraws every caster. Small ground clutter does
//      not need to cast. Measure what turning off small casters buys.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'MERGE2');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf'];
  g.state.flags.keys.ember=true; g.state.flags.keys.kiln=true; g.player.iframes=99999; });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.state.room===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };

await page.addScriptTag({ type: 'module', content: `
  import * as THREE from '/vendor/three.module.min.js';
  import { mergeGeometries } from '/vendor/addons/utils/BufferGeometryUtils.js';
  const norm = (geo) => {
    const g = geo.clone();
    for (const n of Object.keys(g.attributes)) if (!['position','normal','uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) { const c = g.attributes.position.count; g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c*2), 2)); }
    return g;
  };
  window.__flatten = (opts) => {
    const g = window.__game, w = g.world, root = w.root;
    const prot = new Set();
    for (const k of ['enemies','boulders','burnables','crackables','pups','plates','braziers','shatterables','cuttables','checkpoints'])
      for (const e of (w[k]||[])) { const r = e && (e.root||e.mesh||e.group||e.obj); if (r) prot.add(r); }
    const isProt = (o) => { let p=o; while(p){ if(prot.has(p)) return true; p=p.parent; } return false; };
    const buckets = new Map();
    const hide = [];
    const put = (mat, cast, recv, geo) => {
      const key = mat.uuid + '|' + (cast?1:0) + '|' + (recv?1:0);
      if (!buckets.has(key)) buckets.set(key, { mat, cast, recv, geos: [] });
      buckets.get(key).geos.push(geo);
    };
    let looseN = 0, instN = 0, instCopies = 0;
    root.traverse((o) => {
      if (o.isSkinnedMesh || o.isBatchedMesh || o.isSprite || o.isPoints) return;
      const m = o.material;
      if (!m || Array.isArray(m) || m.transparent || m.isMeshBasicMaterial) return;
      if (isProt(o)) return;
      if (o.isInstancedMesh) {
        if (!opts.instanced) return;
        o.updateWorldMatrix(true, false);
        const tmp = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, tmp);
          const gg = norm(o.geometry);
          gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, tmp));
          put(m, o.castShadow, o.receiveShadow, gg);
          instCopies++;
        }
        instN++; hide.push(o); return;
      }
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      o.updateWorldMatrix(true, false);
      const gg = norm(o.geometry); gg.applyMatrix4(o.matrixWorld);
      put(m, o.castShadow, o.receiveShadow, gg);
      looseN++; hide.push(o);
    });
    let made = 0, failed = 0;
    for (const [, bkt] of buckets) {
      let merged = null;
      try { merged = mergeGeometries(bkt.geos, false); } catch { merged = null; }
      if (!merged) { failed += bkt.geos.length; continue; }
      const mesh = new THREE.Mesh(merged, bkt.mat);
      mesh.castShadow = bkt.cast; mesh.receiveShadow = bkt.recv;
      mesh.frustumCulled = false;
      root.add(mesh); made++;
    }
    if (made) for (const o of hide) o.visible = false;
    return { loose: looseN, instanced: instN, instanceCopies: instCopies, draws: made, failed };
  };
  window.__cutShadows = (maxSize) => {
    const g = window.__game; let cut = 0;
    const box = new THREE.Box3(); const size = new THREE.Vector3();
    g.world.root.traverse((o) => {
      if (!o.visible || !o.castShadow || o.isSkinnedMesh) return;
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox); box.applyMatrix4(o.matrixWorld); box.getSize(size);
      if (Math.max(size.x, size.y, size.z) <= maxSize) { o.castShadow = false; cut++; }
    });
    return cut;
  };
`});
await page.waitForFunction(() => !!window.__flatten, null, { timeout: 20000 });

const test = async (room) => {
  if (!await go(room)) { console.log(room, 'FAILED'); return; }
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const now = () => ({ c: g.renderer.info.render.calls, t: g.renderer.info.render.triangles });
    await s(); await s();
    const a0 = now();
    const info = window.__flatten({ instanced: true });
    await s(); await s();
    const a1 = now();
    const cut = window.__cutShadows(1.4);
    await s(); await s();
    const a2 = now();
    return { a0, a1, a2, info, cut };
  });
  console.log(`${room.padEnd(4)} ${String(r.a0.c).padStart(3)} → flatten ${String(r.a1.c).padStart(3)} → +shadow-cull ${String(r.a2.c).padStart(3)} calls   ` +
    `tris ${r.a0.t} → ${r.a2.t}   [${r.info.loose} loose + ${r.info.instanced} instanced groups (${r.info.instanceCopies} copies) → ${r.info.draws} draws; ${r.cut} casters cut]` +
    (r.info.failed ? `  {${r.info.failed} unmergeable}` : ''));
};

console.log('\nFLATTEN + SHADOW-CULL EXPERIMENT   (budget: 100 calls / 500,000 tris)\n');
for (const room of ['r1','r2','r3','e1','w1','f5','lb']) await test(room);
await b.close();
