// GREYBOX TOOLKIT — plain geometry with a gridded prototype texture.
//
// Build order law (dad, 2026-08-07): greybox before art, without exception.
// The checker is deliberately NOT flat colour: a flat surface gives the eye no
// scale reference, so a room greyboxed in flat grey looks the same size at any
// dimension and you cannot judge whether a space is right. One checker square
// is exactly ONE WORLD UNIT (design/METRICS.md), so a doorway is visibly
// "two-and-a-bit squares" and an island is "thirty-two squares across".
//
// Every proto material carries a faint district tint so the colour-coded
// navigation can be evaluated before any art exists — the tint is the design,
// the art is only its costume.

import * as THREE from 'three';

let checkerTex = null;

// One 1u square = 64px. Two greys + a darker grid line at every square edge,
// plus a brighter line every 4 squares so distance is countable at a glance.
function checkerTexture() {
  if (checkerTex) return checkerTex;
  const S = 64, N = 8;                       // 8x8 squares per texture tile
  const c = document.createElement('canvas');
  c.width = c.height = S * N;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      g.fillStyle = (x + y) % 2 ? '#8a8a8a' : '#6e6e6e';
      g.fillRect(x * S, y * S, S, S);
    }
  }
  // every-square hairline
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= N; i++) {
    g.beginPath(); g.moveTo(i * S, 0); g.lineTo(i * S, S * N); g.stroke();
    g.beginPath(); g.moveTo(0, i * S); g.lineTo(S * N, i * S); g.stroke();
  }
  // every-4-squares major line — lets you count 4/8/12 without counting squares
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 4;
  for (let i = 0; i <= N; i += 4) {
    g.beginPath(); g.moveTo(i * S, 0); g.lineTo(i * S, S * N); g.stroke();
    g.beginPath(); g.moveTo(0, i * S); g.lineTo(S * N, i * S); g.stroke();
  }
  checkerTex = new THREE.CanvasTexture(c);
  checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping;
  checkerTex.colorSpace = THREE.SRGBColorSpace;
  checkerTex.anisotropy = 4;
  return checkerTex;
}

// A proto material tinted toward a district colour. `repeat` is in WORLD UNITS
// — pass the surface's real size and the squares stay 1u regardless of scale.
const protoCache = new Map();
export function protoMaterial(tint = 0xffffff, repeatX = 8, repeatZ = 8) {
  const key = `${tint}|${repeatX}|${repeatZ}`;
  if (protoCache.has(key)) return protoCache.get(key);
  const tex = checkerTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(repeatX / 8, repeatZ / 8);   // texture is 8 squares wide
  const m = new THREE.MeshStandardMaterial({
    map: tex, color: tint, roughness: 0.95, metalness: 0,
  });
  protoCache.set(key, m);
  return m;
}

// A greybox floor: one plane, one draw call, squares locked to the world grid.
export function protoFloor(world, w, d, tint) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), protoMaterial(tint, w, d));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

// A greybox wall run. Height 1.6 matches the shipped cliff-block wall height,
// so sightlines and the blind strip behave exactly as they will once dressed.
export function protoWall(world, x0, z0, x1, z1, { height = 1.6, tint = 0x5a5a5a, collide = true } = {}) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = Math.max(Math.abs(x1 - x0), 0.8), d = Math.max(Math.abs(z1 - z0), 0.8);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, height, d),
    protoMaterial(tint, Math.max(w, 1), Math.max(d, 1))
  );
  mesh.position.set(cx, height / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);
  if (collide) world.addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
  return mesh;
}

// A flat coloured decal for marking things ON the greybox floor (the spine,
// a footprint, the blind strip). Always offset from world.deckY — HEIGHT LAW.
export function protoDecal(world, x, z, w, d, color, opacity = 0.35) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, world.deckY + 0.02, z);
  world.add(m);
  return m;
}

// A floating label so a greybox space says what it IS while being walked.
// Canvas → sprite; cheap, always faces the camera, no font loading.
export function protoLabel(world, x, z, text, { color = '#ffd9c2', y = 2.6, size = 1.9 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,8,14,0.72)';
  g.fillRect(0, 0, 512, 128);
  g.font = 'bold 54px Segoe UI, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 256, 64, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.position.set(x, y, z);
  sp.scale.set(size * 4, size, 1);
  sp.renderOrder = 999;
  world.add(sp);
  return sp;
}

// Dispose everything this module cached. Called from the room teardown so a
// long session cannot accumulate canvas textures (the standard three.js leak).
export function disposeProtoCache() {
  for (const m of protoCache.values()) {
    if (m.map) m.map.dispose();
    m.dispose();
  }
  protoCache.clear();
  if (checkerTex) { checkerTex.dispose(); checkerTex = null; }
}
