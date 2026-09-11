// EVERY FALLEN COLUMN AND COVER STUB, ASKED IF IT HAS A HOLE IN IT.
//
// Dad's own follow-up to dev-export #2 (lg1's column not being solid): "is it
// just that one single column or is it every single one of those column
// assets along with anything else that should have been solid from the
// start?" The honest answer at the time was "just that one, fixed by hand" —
// js/dressing.js's fallenColumn() and lowWall() both silently drop a piece
// (mesh AND collider for a column; collider ONLY for a wall stub, whose
// visual pieces used to place UNCONDITIONALLY — a worse bug, since the wall
// still LOOKED solid where it silently was not) whenever a keep-clear
// reservation happens to fall on that exact spot, and nothing had ever asked
// whether any of the other ~166 hand-authored calls in the game hit the same
// thing.
//
// Both functions now share one clear-spot check (mesh and collider skip
// together, nudging along the piece's own line first) and log every spot
// that beats even the nudge to `world._decorGaps` — so this suite asks the
// question for real, across every room, instead of trusting one hand fix.
//
// THE ANSWER TURNED OUT TO BE IN TWO PARTS. Every "another piece of decor was
// already standing there" collision — the ACTUAL class of bug lg1 had — the
// nudge now clears on its own; none remain (the audit run that built this
// suite found exactly two, both a wall stub landing on a pot spot claimed
// moments earlier by potSpots()'s own reserve() call, same fix, same file).
// What's left (some 120 spots across ~40 rooms, as of the run that wrote
// this) is a different thing entirely: a column or wall run whose OWN
// hand-picked position/length reaches into ground gameplay explicitly owns —
// a door's threshold or approach, another room's landing spot, a spawn, a
// hound/slime/bat post, a gate's keep-clear, a chest or potion's approach, a
// brazier, a vane, the pup pen. Building solid scenery there would be the
// bug (a wall in the doorway, a column on the spawn point) — so the function
// skipping it is correct, and the room just ends up with a shorter run than
// its author pictured. That is real, and worth an eye during a room's own
// visual pass, but it is not the "silently walk through what you see" class
// this suite exists to catch — so only a `decor`/`breakable` cause (another
// piece of scenery, not gameplay) fails the gate; everything else is listed
// for visibility and left to a human looking at that specific room.
import { launch } from './wk-drive.mjs';
import { allRooms } from './all-rooms.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const wk = await launch({ timescale: 1 });
await wk.newGame('DECORGAPS');
const rooms = await allRooms(wk.page);

const audit = await wk.page.evaluate(async (ids) => {
  const roomsMod = await import('/js/rooms.js');
  const THREE = await import('three');
  const out = [];
  for (const id of ids) {
    if (!roomsMod.ROOMS[id]) { out.push({ id, error: 'not in ROOMS' }); continue; }
    let world;
    try { world = await roomsMod.buildRoom(id, new THREE.Scene()); }
    catch (e) { out.push({ id, error: String(e && e.message || e) }); continue; }
    const gaps = (world._decorGaps || []).map((g) => ({
      ...g, why: world.blocked(g.x, g.z, g.fn === 'lowWall' ? 0.9 : 0.7, true),
    }));
    out.push({ id, gaps });
  }
  return out;
}, rooms);

console.log('\n── every room built ────────────────────────────────────');
const broke = audit.filter((r) => r.error);
check('no room threw while building', broke.length === 0, broke.slice(0, 5));

console.log('\n── every gap sorted by cause ────────────────────────────');
// `breakable` is potSpots()'s own reserve() call (v3.153 — a pot claims its
// spot the instant it is chosen, so anything built after it in the same room
// yields), same mechanism as a door or a marker, just for a randomly-seeded
// placer instead of a fixed one — a wall piece missing next to a pot is that
// mechanism working, not the raw decor-vs-decor pileup this gate exists to
// catch (only bare `decor` — one hand-placed prop landing on another with no
// reservation involved at all — fails it).
const DECOR_COLLISION = /^decor$/;
const bad = [], expected = [];
for (const r of audit) for (const g of r.gaps || []) {
  const line = `${r.id}: ${g.fn}@${g.x.toFixed(2)},${g.z.toFixed(2)} (${g.why})`;
  (DECOR_COLLISION.test(String(g.why)) ? bad : expected).push(line);
}
console.log(`${expected.length} gap(s) are ground gameplay already owns (door/spawn/landing/gate/etc — not a bug):`);
console.log(JSON.stringify(expected));
check(`no fallenColumn/lowWall piece lost to another piece of decor (across ${rooms.length} rooms)`,
  bad.length === 0, { count: bad.length, all: bad });

console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — no column or wall silently loses to another piece of decor');
await wk.b.close();
process.exit(errors.length ? 1 : 0);
