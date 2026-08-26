// Asset loading + shared material helpers.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);

// KHR_materials_pbrSpecularGlossiness — the diffuse-texture side only.
//
// This vendored GLTFLoader (see its own header comment listing supported
// KHR_materials_* extensions) has never supported this one — it's the
// legacy Sketchfab-era workflow, superseded by pbrMetallicRoughness years
// ago, but several free packs in assets/ were exported with it anyway
// (chest-kit.glb — the standing chest every room uses — plus two unused
// props). Per the glTF spec an unrecognised extension is silently ignored,
// so the loader fell through to its own default: no baseColorTexture, a
// flat white baseColorFactor. Every chest in the game has been rendering
// flat white with no wood-grain texture since the chest kit was wired in —
// invisible in a screenshot review, obvious the moment someone actually
// played (real-play report: "chests are white with no texture").
//
// Full spec compliance means converting a specular+glossiness workflow
// into three.js's metallic-roughness `MeshStandardMaterial` — this game's
// low-poly, flat-shaded style has no need for that precision. Wiring the
// diffuse texture and colour through as `map`/`color` and leaving
// metalness/roughness at sensible flat-material defaults reads correctly
// at this game's visual fidelity, and needs no shader math to get there.
class KHRMaterialsPBRSpecularGlossiness {
  constructor(parser) {
    this.parser = parser;
    this.name = 'KHR_materials_pbrSpecularGlossiness';
  }
  _ext(materialIndex) {
    const def = this.parser.json.materials[materialIndex];
    return (def.extensions && def.extensions[this.name]) || null;
  }
  getMaterialType(materialIndex) {
    return this._ext(materialIndex) ? THREE.MeshStandardMaterial : null;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const ext = this._ext(materialIndex);
    if (!ext) return Promise.resolve();
    const pending = [];
    const d = ext.diffuseFactor || [1, 1, 1, 1];
    materialParams.color = new THREE.Color().setRGB(d[0], d[1], d[2], THREE.LinearSRGBColorSpace);
    materialParams.opacity = d[3] !== undefined ? d[3] : 1.0;
    if (ext.diffuseTexture !== undefined) {
      pending.push(this.parser.assignTexture(materialParams, 'map', ext.diffuseTexture, THREE.SRGBColorSpace));
    }
    // no metallic-roughness equivalent in this workflow — a flat, mostly
    // matte prop reads right at this game's fidelity without one
    materialParams.metalness = 0.1;
    materialParams.roughness = 1 - (ext.glossinessFactor !== undefined ? ext.glossinessFactor : 1) * 0.5;
    return Promise.all(pending);
  }
}
gltfLoader.register((parser) => new KHRMaterialsPBRSpecularGlossiness(parser));

const gltfCache = new Map();

// Everything a loaded GLB owns is SHARED across every room that uses it, so it
// must survive room teardown. Marking it here is what lets World.dispose()
// safely free everything a room actually created (v3.22): the rule becomes
// "dispose what is not marked shared" instead of "dispose nothing", which is
// what left the game leaking a geometry and a cloned material per room build.
// A Set of the actual OBJECTS, not a flag on them. `Material.clone()` deep-
// copies userData, so a per-room clone of a shared material would inherit
// `shared: true` and never be freed — the identity registry cannot be forged
// that way, because a clone is a different object.
export const SHARED = new Set();
export const isShared = (o) => !!o && SHARED.has(o);

function markShared(gltf) {
  gltf.scene.traverse((n) => {
    if (n.geometry) SHARED.add(n.geometry);
    const mats = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
    for (const m of mats) {
      SHARED.add(m);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        if (m[k]) SHARED.add(m[k]);
      }
    }
  });
  return gltf;
}

// A LOAD THAT HANGS WEDGES THE WHOLE GAME. Room transitions await this
// function with `transitioning = true`; a fetch that neither resolves nor
// rejects — one stalled socket on flaky wifi is enough — leaves the world
// rendering but never updating, silently, forever. The overnight play-test
// hit exactly that three times: room built, player placed, then frozen with
// the old room's music still playing because setupRoomExtras never returned.
//
// So every load gets a deadline and one retry. 20 seconds is geological for
// a local file and generous for bad wifi; the retry gets its own 20. A load
// that fails BOTH times rejects loudly — the door handler's catch names it —
// which is a diagnosable error instead of a silent freeze.
function loadOnce(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`asset load timed out: ${url}`)), timeoutMs);
    gltfLoader.load(url,
      (g) => { clearTimeout(timer); resolve(markShared(g)); },
      undefined,
      (e) => { clearTimeout(timer); reject(e); });
  });
}
export function loadGLB(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, loadOnce(url).catch((e) => {
      console.warn('[assets] retrying after', String(e && e.message || e));
      return loadOnce(url);
    }).catch((e) => {
      // a failed promise must not poison the cache forever — the next room
      // that needs this model deserves a fresh attempt
      gltfCache.delete(url);
      throw e;
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
    SHARED.add(fixed);   // cached for the session — never room-owned
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
// B1 — ONE CHARACTER, ONE SHADOW CASTER.
//
// This used to set `castShadow = true` on every mesh of every character, and
// that one line was the single most expensive thing in the renderer. A cast
// mesh is submitted TWICE — once to the shadow depth pass, once to the beauty
// pass — and a character is not one mesh: the knight is nine skinned parts
// (body, head, two arms, two legs, helmet, visor, cape) plus a sword and a
// shield, and every skeleton is nine more. Skinned meshes are also the one
// thing js/batch.js can never merge, so the cost is permanent.
//
// Measured in vc1, the worst room in the game: of 112 draw calls, 32 were
// characters entering the shadow map. Casting from only the LARGEST skinned
// mesh — the body, which is what the silhouette is made of — takes the room to
// 83. Turning character shadows off entirely gets 78, so this recovers all but
// five calls of the maximum possible saving.
//
// And it is invisible. Screenshots of the Bloomfall with five hounds, animation
// frozen so only the shadow policy differs, diffed against a control pair of
// identical renders:
//
//   control (same policy, two shots)   2.40% of pixels differ
//   body-only casting                  2.49%   <- inside the noise
//   no character shadows at all        3.26%   <- visibly different
//
// Held items (sword, shield, blade) come through here as their own root with no
// skinned mesh in it, so they stop casting too — which is what the fix plan
// suggested as a partial, and is worth 4 calls of the 29 on its own.
export function prepareCharacter(root) {
  let biggest = null, biggestVerts = -1;
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) { if (m.metalness === 1) m.metalness = 0; }
    if (!node.isSkinnedMesh) return;
    const pos = node.geometry && node.geometry.attributes && node.geometry.attributes.position;
    const verts = pos ? pos.count : 0;
    if (verts > biggestVerts) { biggestVerts = verts; biggest = node; }
  });
  if (biggest) biggest.castShadow = true;
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
// materialTints: {materialName: hex} overrides the shared volcanic tints with
// dedicated material clones (used e.g. to make path tiles pop).
export function instancePlacements(gltfScene, placements, { castShadow = true, materialTints = null } = {}) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const overrideCache = new Map();
  for (const part of collectMeshes(prepareModel(gltfScene, { castShadow }))) {
    let material = part.material;
    if (materialTints && materialTints[material.name] !== undefined) {
      if (!overrideCache.has(material.name)) {
        const m = material.clone();
        m.color.setHex(materialTints[material.name]);
        overrideCache.set(material.name, m);
      }
      material = overrideCache.get(material.name);
    }
    const inst = new THREE.InstancedMesh(part.geometry, material, placements.length);
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
