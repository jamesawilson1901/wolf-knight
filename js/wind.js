// THE WIND — Stormreach Cliffs' one new world system (design/LEVEL-DESIGN-5.md §3).
//
// A GALE LANE is a rectangle with a direction and a strength. Standing in one
// pushes you along it. It never damages anybody: the region already has
// creatures for that, and a five-year-old should be able to stand in the
// weather and look around without losing a heart for it.
//
// It is also the region's LOCKED DOOR, and the reason it is a better lock than
// a wall: you can walk right up to a gale, lean into it, and be pushed back
// out. That teaches "not yet" without a word, without a bar across a doorway,
// and without a child ever wondering whether they are stuck or just wrong.
//
//   breeze  1.6 u/s   you can walk against it, slowly
//   gust    4.2 u/s   you can cross it sideways; you cannot walk INTO it
//   gale    7.2 u/s   it carries you back out. Only the thunder-dash crosses it.
//
// Those numbers are set against Kael's own 5.0-5.6 u/s, not picked for feel:
// into a breeze he makes 3.4, into a gust 0.8 (visibly crawling, still moving,
// so it never reads as a bug), and into a gale -2.2, which is the lock.
//
// THE POSE NEVER LIES applies to weather. Every lane is drawn as exactly what
// it does — streaks along its own axis, moving in the direction it pushes, at a
// speed proportional to its strength. A lane that pushes north looks like it
// pushes north, and a gale visibly streams faster than a breeze.

import * as THREE from 'three';

export const WIND = { breeze: 1.6, gust: 4.2, gale: 7.2 };

// how fast the streaks run, and how bright, per strength. `rep` is how many
// texture repeats fit along one world unit of the lane — a gale is finer AND
// faster, which is what makes it read as more violent rather than just quicker.
const LOOK = {
  breeze: { rep: 0.16, speed: 0.30, alpha: 0.16, tint: 0xdfe9f2 },
  gust:   { rep: 0.22, speed: 0.75, alpha: 0.26, tint: 0xe6f0f8 },
  gale:   { rep: 0.30, speed: 1.55, alpha: 0.38, tint: 0xf2f8ff },
};

// which way each name pushes. -z is "north"/away from the camera, the same
// convention every room in the game uses.
export const PUSH = {
  n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 },
};

// The streak sheet. Soft vertical smears on transparent, so it can be additively
// blended into any district's palette without carrying a colour of its own —
// the per-lane tint rides in the vertex colours instead.
let streakTex = null;
function streaks() {
  if (streakTex) return streakTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 256);
  // a deterministic scatter — the wind should look the same every time a room
  // is entered, because a child who notices the pattern changed is a child who
  // has stopped trusting the room
  let s = 20260809;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 64;
    const y = rnd() * 256;
    const len = 30 + rnd() * 120;
    const w = 0.7 + rnd() * 1.8;
    const a = 0.20 + rnd() * 0.7;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, w, len);
    // ...and the same smear wrapped over the seam, so the loop is invisible
    if (y + len > 256) g.fillRect(x, y - 256, w, len);
  }
  streakTex = new THREE.CanvasTexture(c);
  streakTex.wrapS = THREE.RepeatWrapping;
  streakTex.wrapT = THREE.RepeatWrapping;
  return streakTex;
}

// ---------------------------------------------------------------------------
// PLACING A LANE
//
// Registers the push zone and remembers how to draw it. Nothing is built here:
// every lane in a room is merged into ONE mesh by buildWindField, because the
// draw-call ceiling is 125 and a dressed island already spends 111 of it.
// ---------------------------------------------------------------------------
export function galeLane(world, { x, z, w, d, dir = 'n', strength = 'gale', id = null }) {
  const p = PUSH[dir] || PUSH.n;
  const v = WIND[strength] || WIND.gale;
  const lane = {
    id, dir, strength,
    minX: x - w / 2, maxX: x + w / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
    px: p.x * v, pz: p.z * v,
    x, z, w, d,
  };
  world.galeLanes.push(lane);
  return lane;
}

// ---------------------------------------------------------------------------
// DRAWING ALL OF THEM, ONCE
//
// Three horizontal sheets per lane — floor level, waist, head — stacked so the
// air between them reads as moving. Horizontal on purpose: the camera is a
// fixed 50-degree pitch, so an UPRIGHT sheet is edge-on and invisible for any
// lane running north-south, and half the lanes in the region run north-south.
//
// The flow direction is baked into the UVs rather than into the material, so
// one scrolling offset drives every lane in the room at its own speed and along
// its own axis. That is what lets the whole room's weather be a single mesh.
// ---------------------------------------------------------------------------
export function buildWindField(world) {
  if (!world.galeLanes.length) return null;
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const HEIGHTS = [0.06, 0.72, 1.44];
  let base = 0;

  for (const lane of world.galeLanes) {
    const look = LOOK[lane.strength] || LOOK.gale;
    c.setHex(look.tint);
    // along = the push axis, across = the other one
    const alongX = Math.abs(lane.px) > Math.abs(lane.pz);
    const alongLen = alongX ? lane.w : lane.d;
    const vRep = alongLen * look.rep;
    // sign so that increasing v runs WITH the push, whichever way it points
    const sgn = alongX ? Math.sign(lane.px) : Math.sign(lane.pz);

    for (let h = 0; h < HEIGHTS.length; h++) {
      const y = world.deckY + HEIGHTS[h];
      // a sheet fades out with height: the ground scours, the air thins
      const a = 1 - h * 0.28;
      const corners = [
        [lane.minX, lane.minZ], [lane.maxX, lane.minZ],
        [lane.maxX, lane.maxZ], [lane.minX, lane.maxZ],
      ];
      for (const [cx, cz] of corners) {
        pos.push(cx, y, cz);
        // u across the lane, v along it
        const u = alongX ? (cz - lane.minZ) / Math.max(0.001, lane.d)
                         : (cx - lane.minX) / Math.max(0.001, lane.w);
        let vv = alongX ? (cx - lane.minX) / Math.max(0.001, lane.w)
                        : (cz - lane.minZ) / Math.max(0.001, lane.d);
        if (sgn < 0) vv = 1 - vv;
        uv.push(u * Math.max(1, alongX ? lane.d * 0.5 : lane.w * 0.5), vv * vRep);
        col.push(c.r * a, c.g * a, c.b * a);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);

  // The material is per-room, not shared: it owns a scrolling texture offset,
  // and two rooms sharing one would scroll each other's weather.
  const tex = streaks().clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.34, vertexColors: true,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 3;
  world.add(mesh);

  // one scroll rate for the room; each lane's baked v-repeat turns that into
  // its own apparent speed
  const rate = LOOK.gale.speed;
  world.onAnimate((t, dt) => { tex.offset.y -= rate * dt; });
  return mesh;
}

// ---------------------------------------------------------------------------
// A WEATHERVANE — the puzzle-room piece (§4, THE VANES).
//
// Dash into it and it turns a quarter, and the lane standing in it turns with
// it. That is the twist: the tool does not only carry Kael, it moves the world.
// The turn is permanent for the room and there is no reset button, because a
// reset button is an admission that a child can get stuck — and a vane can
// always be dashed again, all the way round.
// ---------------------------------------------------------------------------
const CLOCKWISE = ['n', 'e', 's', 'w'];

export function turnVane(world, vane) {
  const i = CLOCKWISE.indexOf(vane.dir);
  vane.dir = CLOCKWISE[(i + 1) % 4];
  const p = PUSH[vane.dir];
  const v = WIND[vane.lane.strength] || WIND.gale;
  vane.lane.px = p.x * v;
  vane.lane.pz = p.z * v;
  vane.lane.dir = vane.dir;
  if (vane.onTurn) vane.onTurn(vane.dir);
  // the lane's geometry is baked, so the room rebuilds its weather. Rooms with
  // vanes are the only ones that ever do this, and they have at most three.
  if (world.rebuildWind) world.rebuildWind();
  return vane.dir;
}
