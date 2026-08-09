// THE WATER — the Sunken Vale's world system (design/LEVEL-DESIGN-6.md §3).
//
// Two depths, and they are not the same kind of thing at all.
//
//   SHALLOW  you walk through it, a little slower. Always. Ripples at the
//            ankle and the floor visible through it.
//   DEEP     a wall you can see across, until the Tide Wolf. Dark, moving,
//            no bottom.
//
// Deep water is the best locked door this game has found. Ember's boulder and
// the Wild Woods' brambles are opaque — you cannot see what you are missing.
// Stormreach's gale you can see through but it shoves you out. Water just says
// no, and lets a child stand at the edge looking at the thing they cannot reach
// yet for as long as they like.
//
// ---------------------------------------------------------------------------
// ONE DELIBERATE CHANGE FROM THE DESIGN DOC, and the reason for it.
//
// The doc has the bubble as a special with a 4-second duration. Built that way
// it can stand a child in the middle of a lagoon with the timer running out,
// and there are only two ways that ends: they drown (this game has no drowning
// and is not getting any) or they are moved to shore, which is a teleport, and
// NOTHING TELEPORTS THE PLAYER.
//
// So the bubble is AUTOMATIC. Own the Tide Wolf and deep water carries you,
// with the bubble appearing around you while you are over it. No button, no
// timer, nothing to run out. That also puts the region back in line with every
// other one: the FORM is the key — fire burns, earth cracks, the lash cuts,
// the breath shatters, the dash crosses, and the tide WALKS.
//
// The special button then does the other half of Meri's gift: a SPLASH that
// soaks what is near it and puts fires out. Which is the first time one gift
// has ever undone another's work, and is the whole of the Tide Pools puzzle.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { state } from './state.js';

export const WATER = {
  shallow: { slow: 0.72, tint: 0x4d8fa0, alpha: 0.42 },
  deep:    { slow: 0.88, tint: 0x123a4e, alpha: 0.86 },
};

// Can this profile stand on deep water? Asked at BUILD time, once, because a
// gate that changes state mid-room is a gate that can drop a child through the
// floor. Every other gate in the game is decided the same way.
export const canWade = () => state.formsUnlocked.includes('tide_wolf');

export function waterZone(world, { x, z, w, d, deep = false, id = null }) {
  const zone = {
    id, deep,
    minX: x - w / 2, maxX: x + w / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
    x, z, w, d,
  };
  world.waterZones.push(zone);
  // DEEP WATER IS A WALL until the gift. Laid as a box collider, so it stops
  // Kael exactly the way the cliff walls do — no special case in movement, and
  // no chance of clipping into it from an odd angle.
  if (deep && !canWade()) {
    const c = { minX: zone.minX, maxX: zone.maxX, minZ: zone.minZ, maxZ: zone.maxZ };
    world.boxColliders.push(c);
    zone.collider = c;
  }
  return zone;
}

// The surface. Two meshes per room at most — one for each depth — because they
// need different colours and different speeds, and two is still a rounding
// error against a 125 draw-call ceiling.
export function buildWaterField(world) {
  const out = [];
  for (const kind of ['shallow', 'deep']) {
    const zones = world.waterZones.filter((z) => (kind === 'deep') === !!z.deep);
    if (!zones.length) continue;
    const look = WATER[kind];
    const pos = [], uv = [], idx = [];
    let base = 0;
    for (const z of zones) {
      const y = world.deckY + (z.deep ? 0.10 : 0.06);
      for (const [cx, cz] of [[z.minX, z.minZ], [z.maxX, z.minZ], [z.maxX, z.maxZ], [z.minX, z.maxZ]]) {
        pos.push(cx, y, cz);
        // UVs in WORLD units, so neighbouring pools share one continuous
        // surface instead of each showing its own little tile of sea
        uv.push(cx * 0.16, cz * 0.16);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const tex = ripples();
    const mat = new THREE.MeshBasicMaterial({
      map: tex.clone(), color: look.tint, transparent: true, opacity: look.alpha,
      depthWrite: false, side: THREE.DoubleSide,
    });
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.needsUpdate = true;
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 2;
    mesh.name = 'water-' + kind;
    world.add(mesh);
    // deep water moves slower and further; shallow chops
    const rate = kind === 'deep' ? 0.035 : 0.09;
    world.onAnimate((t) => {
      mat.map.offset.x = Math.sin(t * 0.21) * 0.05 + t * rate * 0.3;
      mat.map.offset.y = t * rate;
    });
    out.push(mesh);
  }
  return out;
}

let rippleTex = null;
function ripples() {
  if (rippleTex) return rippleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7f7f7f';
  g.fillRect(0, 0, 128, 128);
  // deterministic, for the same reason the wind's streaks are: a room that
  // looks different every time you walk into it is a room a child stops
  // trusting
  let s = 20260810;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 128, y = rnd() * 128, r = 4 + rnd() * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.10 + rnd() * 0.22;
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.7, `rgba(255,255,255,${a * 0.4})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  rippleTex = new THREE.CanvasTexture(c);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  return rippleTex;
}

// ---------------------------------------------------------------------------
// A BRAZIER THAT THE SPLASH PUTS OUT — the Tide Pools' piece, and the first
// time one gift undoes another's. Fire lit these; water ends them.
// ---------------------------------------------------------------------------
export function quenchable(world, { x, z, id, onQuench }) {
  const q = { x, z, id, out: false, quench: null };
  q.quench = () => {
    if (q.out) return false;
    q.out = true;
    if (onQuench) onQuench();
    return true;
  };
  world.quenchables.push(q);
  return q;
}
