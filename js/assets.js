// Asset loading + shared material helpers.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);

const gltfCache = new Map();

export function loadGLB(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, new Promise((resolve, reject) => {
      gltfLoader.load(url, resolve, undefined, reject);
    }));
  }
  return gltfCache.get(url);
}

// Kenney models arrive with bright meadow colors; retint named materials to
// dark volcanic rock so Ember Hollow reads warm-but-shadowed. Kenney GLBs also
// export metallicFactor 1 — fully metallic renders black away from direct
// light (no env map) — so every cached material is forced matte. Tinted
// instances are shared across all models that use the same material name.
const VOLCANIC_TINTS = {
  grass: 0x6f585c,   // ashen moss
  dirt: 0x6a5148,    // scorched earth
  stone: 0x7d6d73,   // basalt
  colormap: 0xa89aa0 // castle kit texture multiply — darkened, keeps detail
};
const tintCache = new Map();

function volcanicMaterial(material) {
  if (!tintCache.has(material.name)) {
    const fixed = material.clone();
    fixed.metalness = 0;
    fixed.roughness = 1;
    const tint = VOLCANIC_TINTS[material.name];
    if (tint !== undefined) fixed.color.setHex(tint);
    tintCache.set(material.name, fixed);
  }
  return tintCache.get(material.name);
}

export function prepareModel(root, { castShadow = true, receiveShadow = true } = {}) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = castShadow;
    node.receiveShadow = receiveShadow;
    node.material = Array.isArray(node.material)
      ? node.material.map(volcanicMaterial)
      : volcanicMaterial(node.material);
  });
  return root;
}

// Characters keep their own materials (KayKit/Quaternius export sane PBR),
// only shadow flags + a safety metalness clamp are applied.
export function prepareCharacter(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = false;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) { if (m.metalness === 1) m.metalness = 0; }
  });
  return root;
}

// Kenney GLBs with several materials arrive as several mesh primitives —
// instancing must include every one of them or parts of the model vanish.
export function collectMeshes(root) {
  const meshes = [];
  root.traverse((node) => { if (node.isMesh) meshes.push(node); });
  return meshes;
}

// One InstancedMesh per primitive, sharing the same placement matrices.
export function instancePlacements(gltfScene, placements, { castShadow = true } = {}) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  for (const part of collectMeshes(prepareModel(gltfScene, { castShadow }))) {
    const inst = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y || 0, p.z);
      dummy.rotation.set(0, p.ry || 0, 0);
      dummy.scale.set(p.sx || 1, p.sy || 1, p.sz || 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    group.add(inst);
  }
  return group;
}
