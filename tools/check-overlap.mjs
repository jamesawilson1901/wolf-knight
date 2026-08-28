// LAW P1 — NO INTERPENETRATION: no prop may visibly intersect another prop,
// wall, or interactable. Placement is 100% hand-authored coordinates with
// ZERO validation anywhere in the codebase (context pack §1.7/§11.3) — this
// is the runtime complement §10.4 calls for: a `?dev=1` scene walk computing
// real Box3 intersections over world.root's children, which catches what
// static coordinate parsing can't (a model's actual rendered footprint, not
// its declared placement point).
//
// Reuses verify-grounded.mjs's prop-grouping technique (charge every mesh to
// its top-level prop, not the mesh itself — the same "measure the whole
// thing, not a nose" lesson) so this and that suite read the same anatomy.
//
// KNOWN LIMITATION, STATED PLAINLY (LAW 10): a hero-prop sculpture built
// from deliberately stacked/touching pieces (the Kiln — "a cone of stacked
// boulders," level1.js) reads geometrically identical to two props
// accidentally placed on top of each other. This tool cannot tell the two
// apart — that's exactly what §10.4 means by "not a substitute for eyes on
// the room." Read every reported pair before treating it as a bug; the core
// pairwise-overlap math itself is validated (LAW 10) against synthetic
// known-bad/known-good/known-touching cases, not against a live scene.
import { launchBrowser } from './launch.mjs';

const check = (name, ok, extra) => {
  console.log(`${ok ? '✓' : '✗'} ${name}` + (extra ? ' ' + JSON.stringify(extra) : ''));
  if (!ok) errors.push(name);
};
const errors = [];

// Fraction of the SMALLER prop's own volume that must be shared before it
// counts as a real interpenetration, not two things merely close together.
const OVERLAP_FRACTION = 0.35;

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
// Set BEFORE any module code runs — verify-grounded.mjs's own lesson ("Prove
// the switch took hold on a room built AFTER it was set... tested the boot
// room, which was already merged") applies here too: setting __noBatch only
// after window.__game exists is too late for the FIRST room, which builds
// during game-start.
await page.addInitScript(() => { window.__noBatch = true; });
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'OVERLAP');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.voice = false; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  window.__noBatch = true; // build rooms unmerged, so every prop keeps its own bounds
});

const ROOMS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['la', 'lb', 'lc', 'ld', 'le', 'vh', 'va1', 'va3', 'vb1', 'vc1', 'vc3', 'vz',
     't1a', 't2a', 't3a', 't4a', 'tgl', 's1a', 's2a', 's3a', 's4a', 'scr',
     'd1a', 'd2a', 'd3a', 'd4a', 'dlg', 'x1', 'xa1', 'xg1', 'xm1', 'xth'];

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game; g.state.room = r; }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r),
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

console.log('\n── nothing lives inside anything else ─────────────────');
let worstAll = null;
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const hits = await page.evaluate((FRAC) => {
    const w = window.__game.world;
    const topOf = (o) => { let n = o; while (n.parent && n.parent !== w.root) n = n.parent; return n; };
    const props = new Map();
    w.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      // InstancedMesh (assets.js's instancePlacements — "NEVER EXPAND an
      // InstancedMesh," batch.js) keeps its per-instance transforms in an
      // instance buffer, not in matrixWorld — reading matrixWorld on one
      // reports every scattered copy at the same single origin box, which
      // reads as dozens of "100% overlapping" clutter rocks that were never
      // actually placed on top of each other. Mass-scattered decoration
      // isn't what this hand-placement law is checking anyway.
      if (o.isInstancedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // flames, glows, decals and ground-plane sheets aren't "props" for this
      // law — they're meant to sit inside/against things.
      if (mats.some((m) => m && ((m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) || m.transparent))) return;
      const top = topOf(o);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone();
      o.updateWorldMatrix(true, false);
      bb.applyMatrix4(o.matrixWorld);
      let rec = props.get(top);
      if (!rec) props.set(top, rec = { box: bb.clone(), name: (top.name || o.name || '(unnamed)').slice(0, 34), x: 0, z: 0 });
      rec.box.union(bb);
    });
    // GROUND-PLANE SHEETS AREN'T PROPS. Floor tiles and ground patches
    // (water/moss/mud overlay disks — level*.js's `patches:` — are
    // INTENTIONALLY layered on the base floor by design, matching the
    // codebase's own "decal" category (LAW 4). A real 3D prop has real
    // height; anything under ~0.1u tall is a flat sheet, not a prop.
    const DECAL_THIN = 0.1;
    const list = [...props.values()]
      .filter((r) => r.box.isEmpty() === false)
      .filter((r) => (r.box.max.y - r.box.min.y) >= DECAL_THIN);
    for (const r of list) { r.x = (r.box.min.x + r.box.max.x) / 2; r.z = (r.box.min.z + r.box.max.z) / 2; }
    const vol = (bx) => Math.max(0, bx.max.x - bx.min.x) * Math.max(0, bx.max.y - bx.min.y) * Math.max(0, bx.max.z - bx.min.z);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b2 = list[j];
        if (Math.abs(a.x - b2.x) > 4 || Math.abs(a.z - b2.z) > 4) continue; // cheap prune
        const ix = {
          min: { x: Math.max(a.box.min.x, b2.box.min.x), y: Math.max(a.box.min.y, b2.box.min.y), z: Math.max(a.box.min.z, b2.box.min.z) },
          max: { x: Math.min(a.box.max.x, b2.box.max.x), y: Math.min(a.box.max.y, b2.box.max.y), z: Math.min(a.box.max.z, b2.box.max.z) },
        };
        const iv = vol(ix);
        if (iv <= 0) continue;
        const smaller = Math.min(vol(a.box), vol(b2.box));
        if (smaller <= 0) continue;
        const frac = iv / smaller;
        if (frac >= FRAC) out.push({ a: a.name, b: b2.name, frac: +frac.toFixed(2), at: [+a.x.toFixed(1), +a.z.toFixed(1)] });
      }
    }
    out.sort((x, y) => y.frac - x.frac);
    return out;
  }, OVERLAP_FRACTION);
  const worst = hits[0];
  if (worst && (!worstAll || worst.frac > worstAll.frac)) worstAll = { room, ...worst };
  check(`${room}: nothing overlaps`, hits.length === 0,
    hits.length ? { count: hits.length, worst: hits.slice(0, 3) } : undefined);
}
if (worstAll) console.log('\nworst offender:', JSON.stringify(worstAll));

console.log(errors.length ? `\n✗ ${errors.length} FAILED\n` + errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
