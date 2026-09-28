// WHERE EVERY ROOM SITS ON THE MAP — derived from the doors, never typed.
//
// Dad, 2026-09-26: "The whole map is confusing to me as an adult. A child has
// no chance of understanding. It needs to be a real map." The old screen was a
// list of text cards per region. A real map needs every room at a PLACE, and
// the only honest source for where a room is, is the door that leads to it: a
// door on a room's north wall puts the room beyond it north (js/mapgraph.js,
// read from the builders' own sideDoor() calls by tools/gen-mapgraph.mjs).
//
// Two passes, because the world is not a perfect grid and a single BFS over
// ~180 rooms snarls where a hub has two doors on one wall:
//
//   1. EACH REGION ON ITS OWN. BFS from the region's first room over its own
//      doors, each room one step from the room that found it in the door's
//      direction; a taken cell goes to the nearest free cell that still lies
//      on the door's side. A region is then a rigid little block.
//   2. THE REGIONS, IN WALK ORDER. Each block is set down so the room a child
//      walks into sits one step beyond the door they walked out of — then slid
//      to the nearest spot that overlaps nothing already placed, never to the
//      wrong side of that door.
//
// When two rooms disagree about which way their shared door faces (the Den's
// door to the Ashfall is on the Den's south wall AND on the Ashfall's south
// wall: the stair turns), the room being ENTERED wins: the child arrives in it
// through that wall, and the rest of its region is laid out from it.
//
// Pure data in, positions out: no DOM, no three.js, so verify-map can hold it
// in node as well as in the page.

const DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

// Which way is `b` from `a`? The entered room's own door back wins.
function stepDir(doors, a, b, side) {
  const back = (doors[b] || []).find(([, to]) => to === a);
  return DIR[back ? OPP[back[0]] : side];
}

// Nearest free cell to (x, y) that is not behind `from` along `d`.
function nearestFree(taken, x, y, from, d) {
  for (let r = 0; r < 12; r++) {
    let best = null, bestCost = Infinity;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = x + dx, cy = y + dy;
        if (taken.has(cx + ',' + cy)) continue;
        // must stay on the door's side of the room that found it
        if (from && d && ((cx - from[0]) * d[0] + (cy - from[1]) * d[1]) <= 0) continue;
        // prefer sliding further along the door's own direction
        const along = d ? Math.abs(dx * d[1]) + Math.abs(dy * d[0]) : 0;
        const cost = Math.abs(dx) + Math.abs(dy) + along * 0.5;
        if (cost < bestCost) { bestCost = cost; best = [cx, cy]; }
      }
    }
    if (best) return best;
  }
  return [x, y];
}

// Lay one region out from `start` over its own doors. Returns id -> [x, y].
function layoutRegion(doors, ids, start) {
  const inR = new Set(ids);
  const pos = new Map([[start, [0, 0]]]);
  const taken = new Set(['0,0']);
  const queue = [start];
  const place = (id, at) => { pos.set(id, at); taken.add(at[0] + ',' + at[1]); queue.push(id); };
  const drain = () => {
    while (queue.length) {
      const a = queue.shift();
      const pa = pos.get(a);
      for (const [side, b] of doors[a] || []) {
        if (!inR.has(b) || pos.has(b)) continue;
        const d = stepDir(doors, a, b, side);
        place(b, nearestFree(taken, pa[0] + d[0], pa[1] + d[1], pa, d));
      }
    }
  };
  drain();
  // Rooms of this region that none of its own doors reach (a room only
  // entered from another region, or one the graph has not heard of yet):
  // reached through a door INTO them from a placed room, else set beside the
  // region's edge. Nothing is ever left without a position.
  for (const id of ids) {
    if (pos.has(id)) continue;
    let at = null;
    for (const [side, to] of doors[id] || []) {
      if (pos.has(to)) {
        const p = pos.get(to), d = DIR[OPP[side]];
        at = nearestFree(taken, p[0] + d[0], p[1] + d[1], p, d);
        break;
      }
    }
    if (!at) {
      let maxX = 0;
      for (const [x] of pos.values()) maxX = Math.max(maxX, x);
      at = nearestFree(taken, maxX + 1, 0, null, null);
    }
    place(id, at);
    drain();
  }
  return pos;
}

// rooms: [{ id, region, loopsTo? }] in authoring order; regionOrder: walk order.
// Returns Map id -> { x, y } in grid cells.
export function layoutWorld(doors, rooms, regionOrder) {
  const byRegion = new Map();
  for (const r of rooms) {
    if (!byRegion.has(r.region)) byRegion.set(r.region, []);
    byRegion.get(r.region).push(r.id);
  }
  const order = [...regionOrder.filter((k) => byRegion.has(k)),
    ...[...byRegion.keys()].filter((k) => !regionOrder.includes(k))];
  const regionOfId = new Map(rooms.map((r) => [r.id, r.region]));
  const world = new Map();       // id -> [x, y]
  const taken = new Set();       // world cells, with a one-cell moat round each block
  const placedRegions = [];

  for (const key of order) {
    const ids = byRegion.get(key);
    // the room a child walks INTO this region through, from the latest region
    // already on the map that has a door onto it (walk order: the road in)
    let link = null;
    for (let i = placedRegions.length - 1; i >= 0 && !link; i--) {
      const P = placedRegions[i];
      for (const a of byRegion.get(P)) {
        for (const [side, b] of doors[a] || []) {
          if (regionOfId.get(b) === key) { link = { a, b, side }; break; }
        }
        if (link) break;
      }
    }
    // a region no placed door reaches may still have a door OUT to one
    if (!link) {
      for (const b of ids) {
        for (const [side, a] of doors[b] || []) {
          if (world.has(a)) { link = { a, b, side: OPP[side] }; break; }
        }
        if (link) break;
      }
    }
    const start = link ? link.b : ids[0];
    const local = layoutRegion(doors, ids, start);
    // ideal offset: `start` one step beyond the door it is entered by
    let ox = 0, oy = 0, d = null, from = null;
    if (link) {
      d = stepDir(doors, link.a, link.b, link.side);
      from = world.get(link.a);
      ox = from[0] + d[0]; oy = from[1] + d[1];
    }
    const fits = (dx, dy) => {
      for (const [x, y] of local.values()) if (taken.has((x + dx) + ',' + (y + dy))) return false;
      return true;
    };
    let best = [ox, oy];
    if (!fits(ox, oy)) {
      let bestCost = Infinity;
      for (let r = 1; r < 40 && bestCost === Infinity; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const cx = ox + dx, cy = oy + dy;
            if (from && d && ((cx - from[0]) * d[0] + (cy - from[1]) * d[1]) <= 0) continue;
            if (!fits(cx, cy)) continue;
            const cost = Math.hypot(dx, dy);
            if (cost < bestCost) { bestCost = cost; best = [cx, cy]; }
          }
        }
      }
    }
    for (const [id, [x, y]] of local) {
      const wx = x + best[0], wy = y + best[1];
      world.set(id, [wx, wy]);
      for (let mx = -1; mx <= 1; mx++) for (let my = -1; my <= 1; my++) taken.add((wx + mx) + ',' + (wy + my));
    }
    placedRegions.push(key);
  }
  const out = new Map();
  for (const [id, [x, y]] of world) out.set(id, { x, y });
  return out;
}
