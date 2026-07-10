// Wolf Knight — bootstrap + main loop.
// Phase 2: the three Ember Hollow rooms with door transitions, checkpoints,
// the dark nook (real-lighting darkness), geysers, and burnable props.
// Rooms rebuild on every entry (anti-soft-lock reset).

import * as THREE from 'three';
import { manager } from './assets.js';
import { Input } from './input.js';
import { buildRoom } from './rooms.js';
import { Player } from './player.js';
import { state } from './state.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';

const FORM_CYCLE = ['knight', 'dark_wolf', 'fire_wolf'];

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
// Base light rig. Darkness (dark zones, boss phase 3) scales the rig down —
// lava pools and campfires are real lights, so they keep glowing in the dark.
// ---------------------------------------------------------------------------

const HEMI_BASE = 1.9;
const KEY_BASE = 3.0;
const hemi = new THREE.HemisphereLight(0xa393b8, 0x5c4030, HEMI_BASE);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffd2a0, KEY_BASE);
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

let darkness = 0; // 0 = normal rig, 1 = near-black (dark zone as the Knight)

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function showError(text) {
  document.getElementById('error-text').textContent = text;
  document.getElementById('error').style.display = 'flex';
}
manager.onError = (url) => showError('Failed to load: ' + url);

const fadeEl = document.getElementById('fade');
function fadeTo(opacity, ms = 300) {
  fadeEl.style.transition = `opacity ${ms}ms ease`;
  fadeEl.style.opacity = String(opacity);
  return new Promise((r) => setTimeout(r, ms));
}

const heartsEl = document.getElementById('hearts');
function renderHearts(player) {
  heartsEl.textContent = '❤️'.repeat(player.hearts) + '\u{1f5a4}'.repeat(player.maxHearts - player.hearts);
}

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

const input = new Input();
const timer = new THREE.Timer();

let world = null;
let player = null;
let transitioning = false;

async function loadRoom(id, entry) {
  transitioning = true;
  await fadeTo(1, 260);
  if (world) world.dispose();
  world = await buildRoom(id, scene);
  state.room = id;
  const at = entry || world.spawn;
  player.place(at.x, at.z, at.angle !== undefined ? at.angle : Math.PI);
  player.iframes = Math.max(player.iframes, 0.6);
  // mark already-reached checkpoints in this room as lit
  for (const cp of world.checkpoints) {
    if (state.checkpoint.id === cp.id) cp.reached = true;
  }
  snapCamera();
  window.__game = { player, world, state }; // debug/testing hook
  await fadeTo(0, 260);
  transitioning = false;
}

function snapCamera() {
  camGoal.copy(player.root.position).add(CAM_OFFSET);
  camera.position.copy(camGoal);
  camLook.copy(player.root.position);
  camera.lookAt(camLook.x, 0.6, camLook.z);
}

async function respawnAtCheckpoint() {
  transitioning = true;
  await fadeTo(1, 500);
  const cp = state.checkpoint;
  if (world) world.dispose();
  world = await buildRoom(cp.room, scene);
  state.room = cp.room;
  player.place(cp.x, cp.z + 0.9, Math.PI);
  player.healFull();
  player.iframes = 1.2;
  for (const c of world.checkpoints) {
    if (state.checkpoint.id === c.id) c.reached = true;
  }
  snapCamera();
  window.__game = { player, world, state };
  await fadeTo(0, 400);
  transitioning = false;
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

let effects = null;
let ui = null;

async function start() {
  player = new Player();
  await player.load();
  scene.add(player.root);
  player.onDamaged = () => renderHearts(player);
  player.onDefeated = () => { if (!transitioning) respawnAtCheckpoint(); };
  renderHearts(player);

  effects = new Effects(scene);
  ui = new UI({
    onFormPick: (id) => {
      if (player.setForm(id)) ui.refreshBadge();
      else flashLockedForm();
    },
    onSpecial: () => player.tryBloodMoon(effects, world),
  });
  player.onFormChanged = () => ui.refreshBadge();
  input.onHold = (x, y, pointerId) => {
    if (transitioning) return false;
    ui.openPicker(x, y, pointerId);
    return true;
  };

  await buildRoomInitial();

  document.getElementById('loading').style.display = 'none';

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    if (!world) return;

    if (!transitioning) {
      // Keyboard shortcuts: Tab cycles forms, K fires the special
      if (input.consumeFormCycle()) {
        const unlocked = FORM_CYCLE.filter((f) => state.formsUnlocked.includes(f));
        const next = unlocked[(unlocked.indexOf(state.form) + 1) % unlocked.length];
        if (player.setForm(next)) ui.refreshBadge();
      }
      if (input.consumeSpecial()) player.tryBloodMoon(effects, world);

      player.update(dt, input, world);

      // Door transitions
      const door = world.doorAt(player.root.position.x, player.root.position.z);
      if (door) loadRoom(door.to, door.entry);

      // Checkpoints: touch to set respawn
      for (const cp of world.checkpoints) {
        if (cp.reached) continue;
        const dx = player.root.position.x - cp.x;
        const dz = player.root.position.z - cp.z;
        if (dx * dx + dz * dz < cp.r * cp.r) {
          cp.reached = true;
          state.checkpoint = { room: state.room, x: cp.x, z: cp.z, id: cp.id };
        }
      }
    }

    world.animate(t, dt);

    // Real-lighting darkness: dark zones black out the base rig for the
    // Knight; the Dark Wolf (Phase 3) will see through it.
    const inDark = world.darknessAt(player.root.position.x, player.root.position.z);
    const target = state.form === 'dark_wolf' ? 0 : inDark;
    darkness += (target - darkness) * Math.min(1, dt * 5);
    hemi.intensity = HEMI_BASE * (1 - 0.94 * darkness);
    key.intensity = KEY_BASE * (1 - 0.97 * darkness);
    for (const zone of world.darkZones) {
      zone.veilMat.opacity = state.form === 'dark_wolf' ? 0.12 : 0.62 * (1 - darkness * 0.85);
    }

    effects.update(dt, t);
    ui.update(player);

    // Smooth camera follow (+ effect shake)
    const k = 1 - Math.exp(-6 * dt);
    camGoal.copy(player.root.position).add(CAM_OFFSET);
    camera.position.lerp(camGoal, k);
    camLook.lerp(player.root.position, k);
    camera.position.add(effects.shakeOffset);
    camera.lookAt(camLook.x + effects.shakeOffset.x, 0.6, camLook.z + effects.shakeOffset.z);

    key.position.set(player.root.position.x + 6, 13, player.root.position.z + 8);
    key.target.position.copy(player.root.position);

    renderer.render(scene, camera);
  });
}

async function buildRoomInitial() {
  world = await buildRoom(state.room, scene);
  player.place(world.spawn.x, world.spawn.z, world.spawn.angle);
  snapCamera();
  window.__game = { player, world, state };
}

function flashLockedForm() {
  const badge = document.getElementById('form-badge');
  badge.classList.remove('denied');
  void badge.offsetWidth; // restart the animation
  badge.classList.add('denied');
}

start().catch((err) => {
  console.error(err);
  showError(String((err && err.message) || err));
});
