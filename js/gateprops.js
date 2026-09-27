// GATE PROPS — what a "come back later" obstacle is MADE of (2026-09-27).
//
// Dad, with a photo each: the thorn gates were "green rocks" and "hedges" —
// three tinted boulders or bush cubes standing across a gap with daylight
// between them — and the frozen gates were blue pebbles that did not
// "actually visually block the path". A gate is a promise, and a promise that
// looks like scattered scenery reads as a glitch, not as "later".
//
// So every gate of those two kinds is now built HERE, from one real model
// each, laid shoulder to shoulder across the whole collider:
//
//   * THORNS — assets/env/thorns.glb, dad's own Meshy "Tangled Thorns"
//     upload, cut to ~2.5k triangles with one 512px colour map
//     (assets/LICENSES/meshy-thorns-guardian-attestation.txt). Used by every
//     Verdant-Wolf cut gate: levelkit promiseGate('cut'), gates.js
//     brambleGate, and Level 3's own brambles.
//   * ICE — the Frostpeak kit's own snow/rocks-large.glb cluster (Kenney),
//     pulled toward ice-blue, stacked to above Kael's head. Used by the
//     frozen shatter gates (promiseGate kind 'ice', gates.js iceGate).
//
// Each wall is ONE merged mesh per material, so a gate costs one draw call
// however many pieces fill it (a room's budget is 125), and it keeps a name
// verify-looks' MEANT_TO_BLOCK recognises ("thorn" / "ice").
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGLB, prepareModel } from './assets.js';

const THORNS_URL = './assets/env/thorns.glb';
const ICE_URL = './assets/env/cliff-block.glb';
let thornsGltf = null, iceGltf = null;
let iceMats = null;

export async function loadGateProps() {
  if (thornsGltf && iceGltf) return;
  [thornsGltf, iceGltf] = await Promise.all([loadGLB(THORNS_URL), loadGLB(ICE_URL)]);
}
export const gatePropsReady = () => !!(thornsGltf && iceGltf);

// A model normalised to sit on the floor, centred, with its footprint's
// longer side 1 unit — so a caller scales in plain metres.
function unit(gltf) {
  const root = prepareModel(gltf.scene.clone());
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  const s = 1 / Math.max(0.001, bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  const wrap = new THREE.Group();
  root.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  wrap.add(root);
  wrap.scale.setScalar(s);
  return { wrap, height: (bb.max.y - bb.min.y) * s };
}

// Bake a list of placed pieces into one mesh per material.
function merge(pieces, name, matFor = (m) => m) {
  const byMat = new Map();
  for (const p of pieces) {
    p.updateMatrixWorld(true);
    p.traverse((n) => {
      if (!n.isMesh) return;
      const mat = matFor(n.material);
      const g = n.geometry.clone().applyMatrix4(n.matrixWorld);
      // mergeGeometries needs matching attribute sets; the two kits here each
      // ship one consistent set, so only drop what a merge cannot carry
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(g.index ? g.toNonIndexed() : g);
    });
  }
  const out = new THREE.Group();
  out.name = name;
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

// Lay `n` pieces along the long axis of a w×d footprint, a second staggered
// row behind when the footprint is deep enough to show a gap.
function layout(w, d, pitch) {
  const along = w >= d;
  const span = Math.max(w, d), depth = Math.min(w, d);
  const n = Math.max(2, Math.ceil(span / pitch));
  const rows = depth > 1.7 ? 2 : 1;
  const spots = [];
  for (let r = 0; r < rows; r++) {
    const off = rows === 1 ? 0 : (r - 0.5) * depth * 0.45;
    const cnt = r === 0 ? n : Math.max(1, n - 1);
    for (let i = 0; i < cnt; i++) {
      const f = cnt === 1 ? 0 : i / (cnt - 1) - 0.5;
      const t = f * (span - pitch * 0.6);
      spots.push({ x: along ? t : off, z: along ? off : t, i: i + r * 7 });
    }
  }
  return spots;
}

// How big each piece is. `height` is what the wall should stand to; a piece
// scaled uniformly to that height can be far wider than the gate (the rock
// cluster is squat: 2.3u tall made it 3.8u across, twice a 2u ice collider),
// so the footprint is capped to the gate and the height is kept by stretching
// up — never more than 1.6x, past which a low-poly rock stops reading as one.
function fit(w, d, height, h1) {
  const want = height / h1;
  const sxz = Math.min(want, Math.max(w, d) * 0.8, Math.min(w, d) * 1.25);
  const sy = Math.min(want, sxz * 1.6);
  return { sxz, sy };
}

// THORNS across a w×d gap, centred on the origin. `height` is the tangle's
// height in metres — over a five-year-old's eye line, under the canopy.
export function thornWall(w, d, { height = 1.9 } = {}) {
  const { wrap, height: h1 } = unit(thornsGltf);
  const { sxz, sy } = fit(w, d, height, h1);
  const pieces = layout(w, d, sxz * 0.6).map((s) => {
    const p = wrap.clone();
    const k = 0.92 + (s.i % 3) * 0.08;
    p.scale.set(sxz * k * wrap.scale.x, sy * k * wrap.scale.x, sxz * k * wrap.scale.x);
    p.position.set(s.x, 0, s.z);
    p.rotation.y = s.i * 1.7;
    return p;
  });
  return merge(pieces, 'thorn-gate');
}

// ICE across a w×d gap: blocks of solid ice, shoulder to shoulder, of
// uneven heights and slightly out of true, so it reads as a frozen wall and
// not as masonry. The Kenney cliff block is the body (its grass top and earth
// sides both repainted to the same pale, faintly glowing ice), because the
// first try — the Frostpeak kit's snow-capped rock cluster — came out as a
// heap of dark blue rocks: it read as rocks, not ice, and not as a wall.
export function iceWall(w, d, { height = 2.3 } = {}) {
  const { wrap } = unit(iceGltf);
  if (!iceMats) iceMats = new Map();
  const matFor = (m) => {
    if (!iceMats.has(m)) {
      const c = m.clone();
      c.name = 'ice-gate_' + m.name;
      c.color = new THREE.Color(0xcdeefc);
      c.emissive = new THREE.Color(0x5aa8dc);
      c.emissiveIntensity = 0.32;
      c.roughness = 0.25;
      c.transparent = true;
      c.opacity = 0.92;
      iceMats.set(m, c);
    }
    return iceMats.get(m);
  };
  const along = w >= d;
  const span = Math.max(w, d), depth = Math.min(w, d);
  const n = Math.max(2, Math.round(span / 1.15));
  const block = span / n;
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * block - span / 2;
    const h = height * (0.78 + ((i * 7) % 5) * 0.08);
    const p = wrap.clone();
    // cliff-block is a unit cube once normalised: x/z footprint, y height
    p.scale.set(block * 1.08 * wrap.scale.x, h * wrap.scale.x, Math.min(depth, 1.6) * wrap.scale.x);
    p.position.set(along ? t : 0, 0, along ? 0 : t);
    p.rotation.set(((i % 3) - 1) * 0.06, (along ? 0 : Math.PI / 2) + ((i % 2) ? 0.12 : -0.1), ((i % 2) - 0.5) * 0.08);
    pieces.push(p);
  }
  return merge(pieces, 'ice-gate', matFor);
}
