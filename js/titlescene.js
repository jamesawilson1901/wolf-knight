// The living title screen: a campfire diorama rendered behind the menus —
// the Knight and the wolves resting at the fire under a pale moon, embers
// drifting — plus real 3D PORTRAITS of every character, rendered once to
// images and used as profile avatars instead of emoji.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter, prepareModel } from './assets.js';
import { tintWolf, WOLF_TINTS } from './player.js';

// Filled asynchronously by buildPortraits(); title.js reads it live and a
// 'portraits-ready' window event tells it to re-render.
export const PORTRAITS = {};

const PUP_TINT = { main: 0xb9915d, eyes: 0x4a3b2b }; // warm brown pup

async function loadCast() {
  const [knight, wolf, fox, general] = await Promise.all([
    loadGLB('./assets/chars/knight.glb'),
    loadGLB('./assets/chars/wolf.gltf'),
    loadGLB('./assets/chars/fox.gltf'),
    loadGLB('./assets/anims/rig-medium-general.glb'),
  ]);
  return { knight, wolf, fox, general };
}

function poseIdle(model, animations, clipName) {
  const clip = animations.find((c) => c.name === clipName);
  if (!clip) return null;
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  mixer.update(0.4); // settle out of the bind pose
  return mixer;
}

// ---------------------------------------------------------------------------
// The diorama
// ---------------------------------------------------------------------------

export async function createTitleScene(renderer) {
  const cast = await loadCast();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120c1c);
  scene.fog = new THREE.Fog(0x120c1c, 9, 20);
  const cam = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0x9a8ab8, 0x4a3a2a, 1.5));
  const moonLight = new THREE.DirectionalLight(0xa8bcff, 0.8);
  moonLight.position.set(-4, 8, -6);
  scene.add(moonLight);

  // ground: a soft dark disc
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(9, 40),
    new THREE.MeshStandardMaterial({ color: 0x241a2e, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // the pale moon, low on the horizon
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 40),
    new THREE.MeshBasicMaterial({ color: 0xd8e2ff, fog: false })
  );
  moon.position.set(-4.5, 4.4, -12);
  scene.add(moon);

  // campfire + firelight
  const fireGltf = await loadGLB('./assets/env/dungeon/Woodfire.glb');
  const fire = prepareModel(fireGltf.scene.clone());
  fire.position.set(0, 0, 0);
  fire.scale.setScalar(1.3);
  scene.add(fire);
  const fireLight = new THREE.PointLight(0xffa54a, 7, 14, 1.6);
  fireLight.position.set(0, 1.0, 0);
  scene.add(fireLight);

  // the cast around the fire
  const mixers = [];
  const knight = prepareCharacter(SkeletonUtils.clone(cast.knight.scene));
  knight.scale.setScalar(0.55);
  knight.position.set(-1.9, 0, -0.5);
  knight.rotation.y = 1.6; // firelight on his face, sword at rest
  scene.add(knight);
  const km = poseIdle(knight, cast.general.animations, 'Idle_A');
  if (km) mixers.push(km);

  for (const [form, x, z, ry] of [
    ['dark_wolf', 1.6, 0.5, -0.9],
    ['fire_wolf', 0.7, -1.6, -2.6],
  ]) {
    const w = prepareCharacter(tintWolf(SkeletonUtils.clone(cast.wolf.scene), WOLF_TINTS[form]));
    w.scale.setScalar(0.56);
    w.position.set(x, 0, z);
    w.rotation.y = ry;
    scene.add(w);
    const m = poseIdle(w, cast.wolf.animations, 'Idle');
    if (m) mixers.push(m);
  }
  const fox = prepareCharacter(SkeletonUtils.clone(cast.fox.scene));
  fox.scale.setScalar(0.22);
  fox.position.set(-0.6, 0, 1.5);
  fox.rotation.y = 0.4;
  scene.add(fox);
  const fm = poseIdle(fox, cast.fox.animations, 'Idle');
  if (fm) mixers.push(fm);

  // drifting embers (one pooled Points cloud)
  const N = 42;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 3;
    pos[i * 3 + 1] = Math.random() * 3;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 3;
    seed[i] = Math.random() * 10;
  }
  const eGeo = new THREE.BufferGeometry();
  const eAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  eGeo.setAttribute('position', eAttr);
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
    color: 0xffb25a, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  scene.add(embers);

  let t = 0;
  return {
    render(dt) {
      t += dt;
      for (const m of mixers) m.update(dt);
      fireLight.intensity = 6.2 + Math.sin(t * 7.3) * 1.0 + Math.sin(t * 13.7) * 0.5;
      for (let i = 0; i < N; i++) {
        pos[i * 3 + 1] += dt * (0.35 + (seed[i] % 0.4));
        pos[i * 3] += Math.sin(t * 0.8 + seed[i]) * dt * 0.15;
        if (pos[i * 3 + 1] > 3.4) pos[i * 3 + 1] = 0.1;
      }
      eAttr.needsUpdate = true;
      // slow, gentle camera drift around the fire
      const a = Math.sin(t * 0.11) * 0.35 - 0.25;
      cam.position.set(Math.sin(a) * 5.0, 2.1 + Math.sin(t * 0.07) * 0.2, Math.cos(a) * 5.0);
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
      cam.lookAt(2.3, 0.8, 0); // tableau sits LEFT of the centered menu
      renderer.render(scene, cam);
    },
    dispose() {
      scene.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Portraits — each character rendered once to a small image (data URL)
// ---------------------------------------------------------------------------

export const AVATARS = [
  { id: 'knight', label: 'Kael' },
  { id: 'dark_wolf', label: 'Dark Wolf' },
  { id: 'fire_wolf', label: 'Fire Wolf' },
  { id: 'earth_wolf', label: 'Earth Wolf' },
  { id: 'pip', label: 'Pip' },
  { id: 'pup', label: 'Pup' },
];

export async function buildPortraits() {
  const cast = await loadCast();
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setSize(220, 220);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
  scene.add(new THREE.HemisphereLight(0xbfb0d8, 0x4a3a30, 1.5));
  const key = new THREE.DirectionalLight(0xffd2a0, 2.2);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.PointLight(0x8f6bff, 3, 10, 1.8);
  rim.position.set(-2, 2, -2);
  scene.add(rim);

  const shoot = (model, animations, clipName) => {
    poseIdle(model, animations, clipName);
    scene.add(model);
    // auto-frame on the model's bounds, a warm 3/4 angle
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z);
    cam.position.set(c.x + d * 0.85, c.y + d * 0.55, c.z + d * 1.25);
    cam.lookAt(c.x, c.y + d * 0.05, c.z);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(model);
    return url;
  };

  const knight = prepareCharacter(SkeletonUtils.clone(cast.knight.scene));
  PORTRAITS.knight = shoot(knight, cast.general.animations, 'Idle_A');
  for (const form of ['dark_wolf', 'fire_wolf', 'earth_wolf']) {
    const w = prepareCharacter(tintWolf(SkeletonUtils.clone(cast.wolf.scene), WOLF_TINTS[form]));
    PORTRAITS[form] = shoot(w, cast.wolf.animations, 'Idle');
  }
  const fox = prepareCharacter(SkeletonUtils.clone(cast.fox.scene));
  PORTRAITS.pip = shoot(fox, cast.fox.animations, 'Idle');
  const pup = prepareCharacter(tintWolf(SkeletonUtils.clone(cast.wolf.scene), PUP_TINT));
  pup.scale.setScalar(0.75); // framing handles size; a hint of smallness
  PORTRAITS.pup = shoot(pup, cast.wolf.animations, 'Idle_2_HeadLow');
  r.dispose();
  r.forceContextLoss && r.forceContextLoss();
  window.dispatchEvent(new Event('portraits-ready'));
}
