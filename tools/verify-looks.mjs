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

// UNBATCHED, for the door raycast below: flattenStatic merges scenery by
// material and cell, and a ray that hits "batched" cannot say what it hit.
await page.evaluate(() => { window.__noBatch = true; });
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
    // WHAT COUNTS AS "IN THE WAY" IS MUCH NARROWER THAN "SOMETHING IS THERE".
    // The first cut of this test cast ONE ray, from the spawn, and reported
    // twelve rooms. Eleven were a pedestal or a column standing eight metres
    // off in a twenty-two metre sightline — a thing a child walks two steps
    // around and never notices. Dad's complaint was not "a prop crossed my
    // line": it was "it's currently not viable behind the giant pillar", a
    // door you cannot find AT ALL. So the question the suite asks is the one
    // he actually asked: is there ANYWHERE in this room you can stand and see
    // this doorway? Spawn plus a ring of standing spots around the room; a
    // door seen from none of them is hidden, a door seen from one is fine.
    //
    //   * a monster is not level design — it moves, and it is supposed to be
    //     between you and the way on;
    //   * a puzzle gate blocking a door is the gate WORKING (bars, roots, ice);
    //   * and the room must be measured UNBATCHED, because flattenStatic
    //     merges forty props into one mesh called "batched" and then the
    //     answer to "what is in the way" is always the same useless word.
    const foeMeshes = new Set();
    for (const e of (w.enemies || [])) {
      if (!e.root) continue;
      e.root.traverse((n) => { if (n.isMesh) foeMeshes.add(n); });
    }
    const MEANT_TO_BLOCK = /bars|gate|thorn|rootbar|ice|arch|plug|bramble/i;

    // Where a child can stand: the arrival point first, then a ring of spots
    // the collision solver agrees are floor. blocked() is the game's own
    // ruler, so every viewpoint here is a place the child can really be.
    const eyes = w.spawn ? [{ x: w.spawn.x, z: w.spawn.z }] : [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const f of [0.35, 0.62]) {
        const x = Math.cos(a) * w.halfW * f, z = Math.sin(a) * w.halfD * f;
        if (!w.blocked(x, z, 0.6)) eyes.push({ x, z });
      }
    }

    const ray = new THREE.Raycaster();
    const hidden = [];
    for (const dr of (w.doors || [])) {
      const cx = (dr.minX + dr.maxX) / 2, cz = (dr.minZ + dr.maxZ) / 2;
      // aim a little INSIDE the doorway, so the shell wall around it is not
      // itself the thing we hit
      const inx = cx * 0.86, inz = cz * 0.86;
      let seen = 0, firstBlock = null;
      for (const eye of eyes) {
        const from = new THREE.Vector3(eye.x, 1.15, eye.z);
        const dir = new THREE.Vector3(inx, 1.15, inz).sub(from);
        const dist = dir.length();
        if (dist < 1.5) { seen++; continue; }   // standing in it already
        ray.set(from, dir.normalize());
        ray.far = dist - 0.6;
        const hits = ray.intersectObject(w.root, true)
          .filter((h) => h.object.isMesh && h.object.visible
            && !(h.object.material && h.object.material.transparent))
          .filter((h) => h.distance > 0.8)
          .filter((h) => !foeMeshes.has(h.object))
          .filter((h) => {
            let n = h.object, name = '';
            while (n) { name += ' ' + (n.name || ''); n = n.parent; }
            return !MEANT_TO_BLOCK.test(name);
          });
        if (!hits.length) seen++;
        else if (!firstBlock) firstBlock = { name: hits[0].object.name
          || hits[0].object.geometry.type, at: +hits[0].distance.toFixed(1) };
      }
      if (seen === 0) {
        hidden.push({ to: dr.to, at: { x: +cx.toFixed(1), z: +cz.toFixed(1) },
          blockedBy: firstBlock && firstBlock.name,
          atDistance: firstBlock && firstBlock.at, standingSpots: eyes.length });
      }
    }

    // --- the arrival view: what is standing right in front of a child? ----
    // The door test above asks "can this doorway be seen from ANYWHERE", and
    // that is the right question for a door. It is not the whole of what dad
    // photographed. He arrives in a room, and a pillar is dead ahead of him,
    // three metres away, filling the middle of the screen — and the way on is
    // behind it. n2 was exactly that: spawn at (0, 11) facing north, a road
    // running north, and a roadside pillar planted at (0.0, 7.5), on the axis.
    //
    // So this measures the first frame. A narrow fan along the spawn's own
    // facing angle — the direction the camera is pointed the instant the room
    // loads — and if EVERY ray in it hits the same prop close in, that prop is
    // standing in the doorway of the child's own view.
    const blocking = [];
    if (w.spawn && typeof w.spawn.angle === 'number') {
      const eye = new THREE.Vector3(w.spawn.x, 1.15, w.spawn.z);
      const hitNames = [];
      for (let i = -2; i <= 2; i++) {
        const a = w.spawn.angle + i * 0.14;          // ±16° across the fan
        const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).normalize();
        ray.set(eye, dir);
        ray.far = 4.2;                                // "right in front of me"
        const h = ray.intersectObject(w.root, true)
          .filter((x) => x.object.isMesh && x.object.visible
            && !(x.object.material && x.object.material.transparent))
          .filter((x) => x.distance > 0.8)
          .filter((x) => !foeMeshes.has(x.object))
          .filter((x) => !/floor|ground|path|patch|water|road/i.test(x.object.name || ''))[0];
        hitNames.push(h ? (h.object.name || h.object.geometry.type) : null);
      }
      // all five rays stopped, and on the same thing: that is a wall of prop,
      // not a fencepost the eye slides past
      if (hitNames.every(Boolean) && new Set(hitNames).size === 1) {
        blocking.push({ prop: hitNames[0] });
      }
    }

    // --- nothing flat hangs in the air over the floor ---------------------
    // The dark zones' veils used to be parked at y = 1.65: a translucent quad
    // lying flat, at head height, over a rectangle of floor. From the game's
    // 3/4 top-down camera that is a grey square hovering in mid-air with a
    // hard edge, and there was one in every room with darkness in it — dad's
    // "get rid of the random flying grey squares", photographed from play.
    //
    // A quad lying FLAT is either ground (on the ground) or a mistake. Things
    // that legitimately hang — banners, cobwebs, portal haze — hang VERTICAL,
    // facing the camera, so the test is about orientation and height, not
    // about a list of names that would need touching every time a new hanging
    // prop ships.
    const floaters = [];
    {
      const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), p = new THREE.Vector3();
      w.root.updateWorldMatrix(true, true);
      w.root.traverse((o) => {
        if (!o.isMesh || !o.geometry || o.geometry.type !== 'PlaneGeometry') return;
        n.set(0, 0, 1).transformDirection(o.matrixWorld);
        if (Math.abs(n.dot(up)) < 0.94) return;          // not lying flat
        o.getWorldPosition(p);
        if (p.y < 0.6) return;                            // on the ground, fine
        floaters.push({ y: +p.y.toFixed(2), name: o.name || '(unnamed plane)',
          size: [o.geometry.parameters.width, o.geometry.parameters.height] });
      });
    }

    out.push({ id, dark, pots, rings, hidden, blocking, floaters });
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
check('no doorway is invisible from every standing spot in its room',
  blocked.length === 0, blocked.slice(0, 12));

console.log('\n── 6. nothing stands in the middle of the arrival view ─');
const inTheFace = [];
for (const r of rows) for (const p of (r.blocking || [])) inTheFace.push({ room: r.id, ...p });
check('no prop fills the view a child arrives looking at',
  inTheFace.length === 0, inTheFace.slice(0, 12));

console.log('\n── 7. nothing flat hangs in the air ───────────────────');
const hanging = [];
for (const r of rows) for (const f of (r.floaters || [])) hanging.push({ room: r.id, ...f });
check('no flat quad is parked above the floor', hanging.length === 0, hanging.slice(0, 12));

check('nothing threw during the run', errors.filter((e) => e.startsWith('PAGEERROR')).length === 0);
await b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the rooms look like places');
process.exit(errors.length ? 1 : 0);
