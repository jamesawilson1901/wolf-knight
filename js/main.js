// Wolf Knight — bootstrap + main loop.
// Phase 1: Kael (KayKit knight) with idle/walk/run, virtual joystick +
// keyboard, smooth-follow 3/4 camera, flat-plane collisions, hurting lava.

import * as THREE from 'three';
import { manager } from './assets.js';
import { Input } from './input.js';
import { buildTestRoom } from './world.js';
import { Player } from './player.js';

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
// Classic 3/4 view: behind and above, pitched ~50° down, smooth-following Kael.
const CAM_PITCH = THREE.MathUtils.degToRad(50);
const CAM_DIST = 11;
const CAM_OFFSET = new THREE.Vector3(
  0,
  CAM_DIST * Math.sin(CAM_PITCH),
  CAM_DIST * Math.cos(CAM_PITCH)
);
const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Base light rig: hemisphere fill + one warm key directional (casts shadows).
// The key light follows Kael so its tight shadow frustum stays useful in
// larger rooms later.
// ---------------------------------------------------------------------------

const hemi = new THREE.HemisphereLight(0xa393b8, 0x5c4030, 1.9);
scene.add(hemi);

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
// Loading overlay wiring
// ---------------------------------------------------------------------------

function showError(text) {
  document.getElementById('error-text').textContent = text;
  document.getElementById('error').style.display = 'flex';
}
manager.onError = (url) => showError('Failed to load: ' + url);

// ---------------------------------------------------------------------------
// Temporary hearts readout (top-left) — replaced by the real HUD in Phase 5.
// ---------------------------------------------------------------------------

const heartsEl = document.getElementById('hearts');
function renderHearts(player) {
  heartsEl.textContent = '❤️'.repeat(player.hearts) + '\u{1f5a4}'.repeat(player.maxHearts - player.hearts);
}

// ---------------------------------------------------------------------------
// Game setup
// ---------------------------------------------------------------------------

const input = new Input();
const timer = new THREE.Timer();

async function start() {
  const [world, player] = await Promise.all([
    buildTestRoom(scene),
    (async () => { const p = new Player(); await p.load(); return p; })(),
  ]);

  player.place(world.spawn.x, world.spawn.z, Math.PI);
  scene.add(player.root);
  renderHearts(player);

  player.onDamaged = () => renderHearts(player);
  player.onDefeated = () => {
    // Gentle respawn: brief fade, back to the spawn point at full hearts.
    const fade = document.getElementById('fade');
    fade.style.opacity = '1';
    setTimeout(() => {
      player.place(world.spawn.x, world.spawn.z, Math.PI);
      player.healFull();
      player.iframes = 1.2;
      fade.style.opacity = '0';
    }, 650);
  };

  // Snap the camera to Kael before the first frame.
  camGoal.copy(player.root.position).add(CAM_OFFSET);
  camera.position.copy(camGoal);
  camLook.copy(player.root.position);
  camera.lookAt(camLook.x, 0.6, camLook.z);

  document.getElementById('loading').style.display = 'none';
  window.__game = { player, world }; // debug/testing hook

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05); // clamp tab-switch spikes
    const t = timer.getElapsed();

    player.update(dt, input, world);
    world.animate(t);

    // Smooth follow (exponential damping — framerate independent).
    const k = 1 - Math.exp(-6 * dt);
    camGoal.copy(player.root.position).add(CAM_OFFSET);
    camera.position.lerp(camGoal, k);
    camLook.lerp(player.root.position, k);
    camera.lookAt(camLook.x, 0.6, camLook.z);

    // Key light + shadow frustum track the player.
    key.position.set(player.root.position.x + 6, 13, player.root.position.z + 8);
    key.target.position.copy(player.root.position);

    renderer.render(scene, camera);
  });
}

start().catch((err) => {
  console.error(err);
  showError(String((err && err.message) || err));
});
