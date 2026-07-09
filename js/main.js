// Wolf Knight — Phase 0 scaffold.
// Renders one lit volcanic test room (Kenney kit floor + rocks) with a fixed
// 3/4 camera. All gameplay logic in later phases runs flat on the XZ plane.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17101f);
scene.fog = new THREE.Fog(0x17101f, 26, 52);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
// Classic 3/4 view: behind and above, pitched ~50 degrees down at the room.
const CAM_PITCH = THREE.MathUtils.degToRad(50);
const CAM_DIST = 13;
const camTarget = new THREE.Vector3(0, 0, 0);
camera.position.set(
  camTarget.x,
  camTarget.y + CAM_DIST * Math.sin(CAM_PITCH),
  camTarget.z + CAM_DIST * Math.cos(CAM_PITCH)
);
camera.lookAt(camTarget);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Base light rig: hemisphere fill + one warm key directional (casts shadows)
// ---------------------------------------------------------------------------

const hemi = new THREE.HemisphereLight(0xa393b8, 0x5c4030, 1.9);
scene.add(hemi);

// Key comes from high front-right so the faces the player sees are lit.
const key = new THREE.DirectionalLight(0xffd2a0, 3.0);
key.position.set(6, 13, 8);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -14;
key.shadow.camera.right = 14;
key.shadow.camera.top = 14;
key.shadow.camera.bottom = -14;
key.shadow.camera.near = 2;
key.shadow.camera.far = 32;
key.shadow.normalBias = 0.03;
scene.add(key);
scene.add(key.target);

// ---------------------------------------------------------------------------
// Asset loading
// ---------------------------------------------------------------------------

const manager = new THREE.LoadingManager(
  () => { document.getElementById('loading').style.display = 'none'; },
  undefined,
  (url) => {
    document.getElementById('error-text').textContent = 'Failed to load: ' + url;
    document.getElementById('error').style.display = 'flex';
  }
);
const gltfLoader = new GLTFLoader(manager);

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

// Kenney models arrive with bright meadow colors; retint named materials to
// dark volcanic rock so Ember Hollow reads warm-but-shadowed. Tinted material
// instances are cached and shared across every model that uses the same name.
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
    // Kenney GLBs export metallicFactor 1 — fully metallic renders black away
    // from direct light (no env map). These are matte rocks: force non-metal.
    fixed.metalness = 0;
    fixed.roughness = 1;
    const tint = VOLCANIC_TINTS[material.name];
    if (tint !== undefined) fixed.color.setHex(tint);
    tintCache.set(material.name, fixed);
  }
  return tintCache.get(material.name);
}

function prepareModel(root, { castShadow = true, receiveShadow = true } = {}) {
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

// Kenney GLBs with several materials arrive as several mesh primitives —
// instancing must include every one of them or parts of the model vanish.
function collectMeshes(root) {
  const meshes = [];
  root.traverse((node) => { if (node.isMesh) meshes.push(node); });
  return meshes;
}

// One InstancedMesh per primitive, sharing the same placement matrices.
function instancePlacements(gltfScene, placements, { castShadow = true } = {}) {
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

// ---------------------------------------------------------------------------
// Test room: 16 x 12 tile floor, cliff-block walls, rocks, pillars, lava
// ---------------------------------------------------------------------------

const ROOM_W = 16; // tiles along X
const ROOM_D = 12; // tiles along Z

async function buildTestRoom() {
  const [floorGltf, cliffGltf, rockLA, rockLB, rockLC, rockSA, rockSB, pillarGltf] =
    await Promise.all([
      loadGLB('./assets/env/floor-tile.glb'),
      loadGLB('./assets/env/cliff-block.glb'),
      loadGLB('./assets/env/rock-large-a.glb'),
      loadGLB('./assets/env/rock-large-b.glb'),
      loadGLB('./assets/env/rock-large-c.glb'),
      loadGLB('./assets/env/rock-small-a.glb'),
      loadGLB('./assets/env/rock-small-b.glb'),
      loadGLB('./assets/env/pillar.glb'),
    ]);

  const halfW = ROOM_W / 2;
  const halfD = ROOM_D / 2;

  // Floor: instanced tiles rotated in 90° steps so the surface doesn't look
  // stamped. One draw call for the whole floor.
  const floorPlacements = [];
  for (let tx = 0; tx < ROOM_W; tx++) {
    for (let tz = 0; tz < ROOM_D; tz++) {
      floorPlacements.push({
        x: tx - halfW + 0.5,
        z: tz - halfD + 0.5,
        ry: ((tx * 7 + tz * 13) % 4) * Math.PI / 2,
      });
    }
  }
  scene.add(instancePlacements(floorGltf.scene, floorPlacements, { castShadow: false }));

  // Walls: a ring of cliff blocks just outside the floor, with deterministic
  // rotation + height variation so the cave rim feels hand-stacked.
  const wallPlacements = [];
  const addWallCell = (tx, tz) => wallPlacements.push({
    x: tx - halfW + 0.5,
    z: tz - halfD + 0.5,
    ry: (Math.abs(tx * 11 + tz * 5) % 4) * Math.PI / 2,
    sy: 1.9 + (Math.abs(tx * 31 + tz * 17) % 3) * 0.18,
  });
  for (let tx = -1; tx <= ROOM_W; tx++) { addWallCell(tx, -1); addWallCell(tx, ROOM_D); }
  for (let tz = 0; tz < ROOM_D; tz++) { addWallCell(-1, tz); addWallCell(ROOM_W, tz); }
  scene.add(instancePlacements(cliffGltf.scene, wallPlacements));

  // Rocks: hand-placed boulders, center left walkable for later phases.
  const rockPlacements = [
    { gltf: rockLA, x: -5.6, z: -3.4, s: 2.6, ry: 0.4 },
    { gltf: rockLB, x: 5.9, z: -3.9, s: 3.0, ry: 2.1 },
    { gltf: rockLC, x: -6.3, z: 3.6, s: 2.3, ry: 4.2 },
    { gltf: rockLA, x: 4.8, z: 4.1, s: 2.1, ry: 5.5 },
    { gltf: rockSA, x: -2.9, z: -4.6, s: 1.9, ry: 1.2 },
    { gltf: rockSB, x: 2.2, z: -4.8, s: 1.6, ry: 3.3 },
    { gltf: rockSB, x: -4.4, z: 0.6, s: 1.4, ry: 0.9 },
    { gltf: rockSA, x: 6.4, z: 0.9, s: 1.7, ry: 2.6 },
    { gltf: rockSB, x: 0.8, z: 4.7, s: 1.3, ry: 4.8 },
  ];
  for (const p of rockPlacements) {
    const rock = prepareModel(p.gltf.scene.clone());
    rock.position.set(p.x, 0, p.z);
    rock.rotation.y = p.ry;
    rock.scale.setScalar(p.s);
    scene.add(rock);
  }

  // Two castle pillars framing the lava pool (base already at y=0 in the GLB).
  const PILLAR_SCALE = 0.6;
  for (const px of [-7.0, -3.0]) {
    const pillar = prepareModel(pillarGltf.scene.clone());
    pillar.position.set(px, 0, -5.2);
    pillar.scale.setScalar(PILLAR_SCALE);
    scene.add(pillar);
  }

  // Lava pool: emissive plane + warm point light, gently pulsing. This is the
  // signature look of Ember Hollow — lava genuinely lights the cave.
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff5a2b,
      emissiveIntensity: 1.8,
      roughness: 1,
    })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(-5, 0.02, -5.1);
  scene.add(lava);

  const lavaLight = new THREE.PointLight(0xff6a33, 14, 12, 1.8);
  lavaLight.position.set(-5, 1.2, -5.1);
  scene.add(lavaLight);

  return { lava, lavaLight };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const timer = new THREE.Timer();

buildTestRoom()
  .then(({ lava, lavaLight }) => {
    renderer.setAnimationLoop(() => {
      timer.update();
      const t = timer.getElapsed();
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
      lava.material.emissiveIntensity = 1.5 + pulse * 0.9;
      lavaLight.intensity = 11 + pulse * 7;
      renderer.render(scene, camera);
    });
  })
  .catch((err) => {
    console.error(err);
    document.getElementById('error-text').textContent = String(err && err.message || err);
    document.getElementById('error').style.display = 'flex';
  });
