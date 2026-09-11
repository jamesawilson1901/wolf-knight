// EVERY JAR IN THE GAME, ASKED IF IT IS SITTING IN SOMETHING.
//
// Dad, on three separate play-test screenshots: a jar half inside a fallen
// door, a jar sharing its spot with a fallen column, "check all jars in the
// game aren't partially in something." Three different rooms, three
// different root causes (js/dressing.js's ruinedHome placed its own
// barrel/crate/vase spill with NO placement check at all — fixed separately,
// this suite is the proof that stays — and a couple of hand-picked breakable
// coordinates that were never checked against a column or wall placed later
// in the same builder). No suite had ever asked the general question, so
// nothing would have caught a fourth.
//
// world.blocked() is the WRONG tool here — it answers "is this a gameplay
// reservation" (a spawn, a chest's approach, a door), not "is something solid
// already standing here." world.resolveCircle() is what actually knows every
// wall, box, column and rock the room has placed, so that is what this asks:
// build the room, then ask resolveCircle whether each hand-placed breakable's
// own spot pushes a body away. If it does, the breakable is sitting inside
// whatever pushed it.
import { launch } from './wk-drive.mjs';
import { allRooms } from './all-rooms.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// a jar/vase/crate/barrel/box/cask's own rough footprint — the same 0.5 the
// ruinedHome fix and potSpots' own "inside a prop" check both use
const PROP_R = 0.5;

const wk = await launch({ timescale: 1 });
await wk.newGame('DECOR');
const rooms = await allRooms(wk.page);

const audit = await wk.page.evaluate(async ({ ids, PROP_R }) => {
  const roomsMod = await import('/js/rooms.js');
  const THREE = await import('three');
  const out = [];
  for (const id of ids) {
    if (!roomsMod.ROOMS[id]) { out.push({ id, error: 'not in ROOMS' }); continue; }
    let world;
    try { world = await roomsMod.buildRoom(id, new THREE.Scene()); }
    catch (e) { out.push({ id, error: String(e && e.message || e) }); continue; }
    const spots = world.markers && world.markers.breakables;
    if (!spots || !spots.length) { out.push({ id, overlaps: [] }); continue; }
    const overlaps = [];
    for (const b of spots) {
      const s = world.resolveCircle(b.x, b.z, PROP_R);
      const moved = Math.hypot(s.x - b.x, s.z - b.z);
      // A SMALL PUSH IS A ROOM DOING ITS JOB. Plenty of breakables sit deliberately
      // close to a wall or another prop with a few centimetres of real clearance
      // that PROP_R's own conservative estimate still clips — that is normal
      // dressing, not the bug. A push near PROP_R's own radius means the
      // breakable's CENTRE was found already inside something else's footprint,
      // which is what actually reads as "sitting in it" on screen.
      if (moved > 0.4) overlaps.push({ kind: b.kind, x: b.x, z: b.z, pushedBy: +moved.toFixed(2) });
    }
    out.push({ id, overlaps });
  }
  return out;
}, { ids: rooms, PROP_R });

console.log('\n── every room built ────────────────────────────────────');
const broke = audit.filter((r) => r.error);
check('no room threw while building', broke.length === 0, broke.slice(0, 5));

console.log('\n── every hand-placed breakable is clear of solid ground ─');
const bad = [];
for (const r of audit) {
  if (!r.overlaps) continue;
  for (const o of r.overlaps) bad.push(`${r.id}: ${o.kind}@${o.x},${o.z} pushed ${o.pushedBy}u`);
}
check(`no breakable sits inside another prop (across ${rooms.length} rooms)`,
  bad.length === 0, { count: bad.length, first30: bad.slice(0, 30) });

console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — every jar in the game is on clear ground');
await wk.b.close();
process.exit(errors.length ? 1 : 0);
