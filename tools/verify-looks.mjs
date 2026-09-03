// THE THINGS A CHILD SEES AND SAYS "THAT LOOKS WRONG".
//
// Dad's 2026-09-03 play-test was twenty screenshots, and four of them were not
// bugs in any system — they were rooms LOOKING wrong:
//
//   "breakables like the jar should be clean of other objects. not half
//    through them."
//   "do not have random dark spots partially in a room. either the whole room
//    is dark or it's not."
//   "keep the pitfalls but remove the grey geometric marks on them."
//   "the roots need to look bigger and more menacing and be blocking entrance
//    to the boss."
//
// Nothing in the suite set could see any of them. verify-density counts things
// and verify-grounded catches what hovers; neither has an opinion about a jar
// standing inside a column or a rectangle of darkness lying in the middle of a
// lit floor. This is that opinion, asked of every room in the live registry.
import { launchBrowser } from './launch.mjs';
import { allRooms } from './all-rooms.mjs';

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
await page.fill('#t-name', 'LOOKS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const ROOM_IDS = only.length ? only : await allRooms(page);
console.log(`asking the game: ${ROOM_IDS.length} rooms`);

const rows = await page.evaluate(async (ids) => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');
  const out = [];
  for (const id of ids) {
    let w;
    try { w = await rooms.buildRoom(id, new THREE.Scene()); }
    catch (e) { out.push({ id, error: String(e && e.message || e) }); continue; }

    // --- the dark: is it a BAND or an island? ---------------------------
    const dark = (w.darkZones || []).map((z) => {
      const touch = [
        z.minX <= -w.halfW + 1.2, z.maxX >= w.halfW - 1.2,
        z.minZ <= -w.halfD + 1.2, z.maxZ >= w.halfD - 1.2,
      ].filter(Boolean).length;
      return { minX: +z.minX.toFixed(1), maxX: +z.maxX.toFixed(1),
        minZ: +z.minZ.toFixed(1), maxZ: +z.maxZ.toFixed(1), walls: touch };
    });

    // --- the pots: does any stand inside something? ----------------------
    // resolveCircle is the same ruler the game moves a child with, so a pot it
    // pushes is a pot the child can SEE intersecting the thing beside it.
    const pots = [];
    for (const e of (w.enemies || [])) {
      if (!e.scenery || !e.radius) continue;
      const solved = w.resolveCircle(e.x, e.z, e.radius);
      const push = Math.hypot(solved.x - e.x, solved.z - e.z);
      if (push > 0.06) pots.push({ kind: e.kind, x: +e.x.toFixed(2), z: +e.z.toFixed(2), push: +push.toFixed(2) });
    }

    // --- the pits: no geometric outline drawn on them ---------------------
    let rings = 0;
    w.root.traverse((n) => {
      if (!n.isMesh || !n.geometry) return;
      const t = n.geometry.type;
      // a 4- or 6-segment ring lying flat is a diamond/hexagon painted on the
      // floor — the exact "grey geometric mark" that came off the pits
      if (t === 'RingGeometry' && (n.geometry.parameters.thetaSegments || 0) <= 8) rings++;
    });

    // --- the doors: can you SEE the way on from where you arrive? ---------
    // Dad, from play: "move the door to the left more so players can see it.
    // it's currently not viable behind the giant pillar." A doorway a child
    // cannot see is a doorway that does not exist, and nothing had ever
    // stood at the arrival point and LOOKED.
    //
    // A ray from eye height at the spawn to the middle of each doorway. If it
    // hits anything before it gets there, something is standing in the way.
    const ray = new THREE.Raycaster();
    const from = new THREE.Vector3(w.spawn.x, 1.15, w.spawn.z);
    const hidden = [];
    for (const dr of (w.doors || [])) {
      const cx = (dr.minX + dr.maxX) / 2, cz = (dr.minZ + dr.maxZ) / 2;
      // aim a little INSIDE the doorway, so the shell wall around it is not
      // itself the thing we hit
      const inx = cx * 0.86, inz = cz * 0.86;
      const to = new THREE.Vector3(inx, 1.15, inz);
      const dir = to.clone().sub(from);
      const dist = dir.length();
      if (dist < 1.5) continue;                 // standing in it already
      ray.set(from, dir.normalize());
      ray.far = dist - 0.6;
      const hits = ray.intersectObject(w.root, true)
        .filter((h) => h.object.isMesh && h.object.visible
          && !(h.object.material && h.object.material.transparent))
        .filter((h) => h.distance > 0.8);
      if (hits.length) {
        hidden.push({ to: dr.to, at: { x: +cx.toFixed(1), z: +cz.toFixed(1) },
          blockedBy: hits[0].object.name || hits[0].object.geometry.type,
          atDistance: +hits[0].distance.toFixed(1), doorAt: +dist.toFixed(1) });
      }
    }

    out.push({ id, dark, pots, rings, hidden });
  }
  return out;
}, ROOM_IDS);

console.log('\n── 1. every room builds ────────────────────────────────');
const broke = rows.filter((r) => r.error);
check('no room threw', broke.length === 0, broke.slice(0, 5));

console.log('\n── 2. the dark is a threshold, never a patch ───────────');
// A band reaches three walls (full width plus one end). An island reaches two
// or fewer, and that is dad's "random dark spot partially in a room".
const islands = [];
for (const r of rows) for (const z of (r.dark || [])) {
  if (z.walls < 3) islands.push({ room: r.id, zone: z });
}
check('no dark zone is an island in a lit floor', islands.length === 0, islands);
const zoneCount = rows.reduce((n, r) => n + (r.dark ? r.dark.length : 0), 0);
console.log(`   (${zoneCount} dark zones across ${rows.length} rooms, all of them bands)`);

console.log('\n── 3. every breakable stands clear ────────────────────');
const jammed = [];
for (const r of rows) for (const p of (r.pots || [])) jammed.push({ room: r.id, ...p });
check('no pot, crate or jar is standing inside something else',
  jammed.length === 0, jammed.slice(0, 12));

console.log('\n── 4. nothing draws a geometric mark on the floor ─────');
const marked = rows.filter((r) => r.rings > 0).map((r) => ({ room: r.id, rings: r.rings }));
check('no low-segment ring is painted on any floor', marked.length === 0, marked.slice(0, 10));

console.log('\n── 5. you can see the way on from where you arrive ────');
const blocked = [];
for (const r of rows) for (const h of (r.hidden || [])) blocked.push({ room: r.id, ...h });
check('no doorway is hidden behind something from the room\'s own arrival point',
  blocked.length === 0, blocked.slice(0, 12));

check('nothing threw during the run', errors.filter((e) => e.startsWith('PAGEERROR')).length === 0);
await b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the rooms look like places');
process.exit(errors.length ? 1 : 0);
