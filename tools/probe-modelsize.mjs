// HOW BIG IS THAT MODEL, ACTUALLY, AND WHERE IS ITS ORIGIN?
//
// Two of the longest-running visual bugs in the game were both invisible to
// every suite and both would have taken one run of this to find:
//
//   * `assets/loot/survival/crate.glb` is not a crate. It is a stack of PLANKS
//     nine centimetres tall, and it was the game's default smashable for
//     months. Dad: "little boxes on the ground... they are so small whatever
//     they are you can barely see them." He was right, and scaling it up was
//     never going to help, because it was never a box.
//
//   * `assets/env/dungeon/Vase.glb` is modelled a metre and a bit off its own
//     origin in Z. Every vase in the game — and every potion dropped out of
//     one, since the drop borrows the same mesh — was DRAWN over a metre from
//     the spot the level gave it, with its collider somewhere else again.
//
// Nothing in the codebase had ever measured a model against its own pivot. So:
// point this at any GLB and it prints the size, where the origin sits inside
// it, and every mesh it contains.
//
//   node tools/probe-modelsize.mjs assets/loot/survival/crate.glb ...
//   node tools/probe-modelsize.mjs            (the whole loot and smashable kit)
import { chromium } from 'playwright';

const DEFAULTS = [
  './assets/env/dungeon/Crate.glb', './assets/env/dungeon/Barrel.glb',
  './assets/env/dungeon/Vase.glb', './assets/env/dungeon/Pedestal.glb',
  './assets/loot/survival/crate.glb', './assets/loot/survival/barrel.glb',
  './assets/loot/survival/chest-wood.glb', './assets/loot/pirate/chest-gold.glb',
  './assets/loot/platformer/coin.glb', './assets/loot/platformer/heart-piece.glb',
];
const urls = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => (p.startsWith('.') || p.startsWith('/') ? p : './' + p))
  : DEFAULTS;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 400, height: 300 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });

const out = await page.evaluate(async (list) => {
  const THREE = await import('three');
  const { loadGLB, prepareModel } = await import('/js/assets.js');
  const res = [];
  for (const u of list) {
    let g;
    try { g = await loadGLB(u); } catch (e) { res.push({ u, error: String(e.message || e) }); continue; }
    const p = prepareModel(g.scene.clone());
    const bb = new THREE.Box3().setFromObject(p);
    const parts = [];
    p.traverse((n) => {
      if (!n.isMesh) return;
      const mb = new THREE.Box3().setFromObject(n);
      parts.push({ name: n.name || '(unnamed)',
        material: (n.material && n.material.name) || '',
        size: [mb.max.x - mb.min.x, mb.max.y - mb.min.y, mb.max.z - mb.min.z]
          .map((v) => +v.toFixed(2)) });
    });
    res.push({ u,
      size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => +v.toFixed(2)),
      // where (0,0,0) sits inside the box. A well-behaved prop is centred in X
      // and Z and rests its base on y=0, so this reads 0 / 0 / 0.
      originOff: [ (bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2 ]
        .map((v) => +v.toFixed(2)),
      meshes: parts });
  }
  return res;
}, urls);

let bad = 0;
for (const r of out) {
  if (r.error) { console.log(r.u, 'FAILED TO LOAD —', r.error); bad++; continue; }
  const [ox, oy, oz] = r.originOff;
  const off = Math.max(Math.abs(ox), Math.abs(oy), Math.abs(oz));
  const flat = r.size[1] < Math.max(r.size[0], r.size[2]) * 0.4;
  console.log(`${r.u}\n  size ${r.size.join(' x ')}   origin offset ${r.originOff.join(', ')}`
    + (off > 0.05 ? '   ← NOT CENTRED ON ITS OWN PIVOT' : '')
    + (flat ? '   ← FLAT: this is not a box, whatever it is called' : ''));
  for (const m of r.meshes) console.log(`    ${m.name}  ${m.size.join(' x ')}  [${m.material}]`);
}
await b.close();
process.exit(bad ? 1 : 0);
