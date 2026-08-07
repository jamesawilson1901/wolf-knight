// STATIC BATCHING — the guardrail that makes a dressed room affordable.
//
// Measured on the shipping rooms before this existed (740x360, SwiftShader,
// renderer.info):
//     r1  173 draw calls      r2  155      e1  265      w1  112
// against a budget of 100. Every one of those rooms is over, and the cause is
// not triangles (r1 draws 38k of a 500,000 budget) — it is that a kit-bashed
// room is assembled from dozens of separate objects, and each object is a
// draw call, then a SECOND draw call when the shadow map redraws it.
//
// Folding every static prop that shares a material into one geometry took r1
// from 173 to 108, and culling shadow-casting on small clutter took it to 99.
// That is the whole difference between "Level 1 can be dressed" and "Level 1
// cannot be dressed", so it lives in the engine rather than in one room.
//
// WHAT IS SAFE TO FOLD: a mesh that never moves, never animates, is opaque,
// and is not something gameplay holds a handle on. Everything else is left
// exactly where it is:
//   - skinned meshes (characters) — they deform every frame
//   - anything registered in a world gameplay list (enemies, boulders,
//     burnables, crackables, pups, plates, braziers, shatterables, cuttables,
//     checkpoints) — gates need their own object to burn, crack or open
//   - transparent and MeshBasicMaterial objects — draw order matters, and the
//     decals/veils are positioned per-frame relative to the deck
//   - sprites, points, lights
//   - anything a builder explicitly protected with world.keepLoose(obj)
//
// Folding is done AFTER the room is fully built, so a builder writes ordinary
// readable placement code and pays batched cost.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isShared } from './assets.js';

// Merging needs every geometry to carry the SAME attribute set. Kit GLBs vary
// (some have tangents, some have a second UV, some have none), so normalise to
// position/normal/uv and bake the world transform in.
function bakeGeometry(source, matrix) {
  const g = source.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  g.applyMatrix4(matrix);
  return g;
}

const triCount = (g) =>
  (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;

// An InstancedMesh is already ONE draw call, so expanding it only pays when it
// can then be merged in with other groups sharing its material. Expanding a
// 600-tile floor would cost hundreds of thousands of duplicated vertices in
// GPU memory to save a single call — never worth it. This is the line.
const EXPAND_TRI_LIMIT = 20000;

export function flattenStatic(world, { shadowCullBelow = 1.4 } = {}) {
  const root = world.root;

  // Things gameplay holds a handle on, and everything under them.
  const held = new Set(world._keepLoose || []);
  for (const key of ['enemies', 'boulders', 'burnables', 'crackables', 'pups', 'plates',
    'braziers', 'shatterables', 'cuttables', 'checkpoints']) {
    for (const e of (world[key] || [])) {
      if (!e || typeof e !== 'object') continue;
      // don't guess the field name — a brazier keeps its flame on `.flame`, a
      // boulder its model on `.mesh`, an enemy its rig on `.root`. Protect
      // EVERY Object3D the entry holds; guessing wrong folds a flame into the
      // wall and it can never be lit.
      if (e.isObject3D) { held.add(e); continue; }
      for (const v of Object.values(e)) if (v && v.isObject3D) held.add(v);
    }
  }
  const isHeld = (o) => { for (let p = o; p; p = p.parent) if (held.has(p)) return true; return false; };

  const buckets = new Map();
  let looseSeen = 0, instancedSeen = 0, instanceCopies = 0;

  const put = (mat, cast, recv, geo, owner) => {
    const key = `${mat.uuid}|${cast ? 1 : 0}|${recv ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { mat, cast, recv, geos: [], owners: new Set() });
    const b = buckets.get(key);
    b.geos.push(geo);
    b.owners.add(owner);
  };

  root.traverse((o) => {
    if (o.isSkinnedMesh || o.isBatchedMesh || o.isSprite || o.isPoints || o.isLine) return;
    if (!o.isMesh) return;
    // a hidden mesh is hidden for a reason (an unlit flame, a boss-defeated
    // variant); merging it would either make it permanently visible or
    // permanently gone, and both are worse than one extra draw call
    if (!o.visible) return;
    const mat = o.material;
    if (!mat || Array.isArray(mat) || mat.transparent || mat.isMeshBasicMaterial) return;
    if (isHeld(o)) return;
    if (!o.geometry || !o.geometry.attributes.position) return;

    if (o.isInstancedMesh) {
      if (triCount(o.geometry) * o.count > EXPAND_TRI_LIMIT) return;   // leave it instanced
      o.updateWorldMatrix(true, false);
      const local = new THREE.Matrix4();
      const world4 = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, local);
        put(mat, o.castShadow, o.receiveShadow,
          bakeGeometry(o.geometry, world4.multiplyMatrices(o.matrixWorld, local)), o);
        instanceCopies++;
      }
      instancedSeen++;
      return;
    }

    o.updateWorldMatrix(true, false);
    put(mat, o.castShadow, o.receiveShadow, bakeGeometry(o.geometry, o.matrixWorld), o);
    looseSeen++;
  });

  let draws = 0, failed = 0;
  for (const bucket of buckets.values()) {
    // a bucket of one saves nothing: one merged draw replaces one draw
    let merged = null;
    if (bucket.geos.length >= 2) {
      try { merged = mergeGeometries(bucket.geos, false); } catch { merged = null; }
    }
    // the baked clones are scratch either way — merge copies out of them
    for (const g of bucket.geos) g.dispose();
    if (!merged) {
      // FAILED (or not worth it): the originals STAY. A room that silently
      // loses its floor because mergeGeometries threw is far worse than a
      // room that costs a few more draw calls.
      failed += bucket.geos.length;
      continue;
    }
    const mesh = new THREE.Mesh(merged, bucket.mat);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.recv;
    // one mesh now spans the whole room; per-object culling is meaningless —
    // the bounding-sphere test would only ever answer "yes"
    mesh.frustumCulled = false;
    mesh.name = 'batched';
    root.add(mesh);
    draws++;
    // retire only THIS bucket's originals
    for (const o of bucket.owners) {
      if (!o.parent) continue;
      o.parent.remove(o);
      if (o.isInstancedMesh) { o.dispose(); continue; }
      // geometry from the shared asset cache must NOT be disposed — other
      // rooms still reference it (see World.dispose / assets.SHARED)
      if (o.geometry && !isShared(o.geometry)) o.geometry.dispose();
    }
  }

  // SHADOW CULL. The shadow map redraws every caster, so a caster is a second
  // draw call. Ground clutter smaller than a wolf casts a shadow nobody will
  // ever notice from a 50-degree camera — but pays full price for it.
  let culled = 0;
  if (shadowCullBelow > 0) {
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.castShadow || o.isSkinnedMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox);
      o.updateWorldMatrix(true, false);
      box.applyMatrix4(o.matrixWorld);
      box.getSize(size);
      if (Math.max(size.x, size.y, size.z) <= shadowCullBelow) { o.castShadow = false; culled++; }
    });
  }

  const stats = { loose: looseSeen, instanced: instancedSeen, instanceCopies, draws, unmerged: failed, shadowCulled: culled };
  world._batchStats = stats;
  return stats;
}
