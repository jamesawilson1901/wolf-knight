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
import { Pip, spawnPups } from './pip.js';
import { audio } from './audio.js';
import { Narration } from './narration.js';

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
  heartsEl.classList.toggle('low', player.hearts > 0 && player.hearts <= 2);
}

function renderPups() {
  const found = Object.keys(state.flags.pups).length;
  document.getElementById('pups').textContent = `🐺 ${found}/3`;
}

let savedToastTimer = null;
function showSavedToast() {
  const el = document.getElementById('saved-toast');
  el.style.opacity = '1';
  clearTimeout(savedToastTimer);
  savedToastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

let paused = false;
function setPaused(v) {
  paused = v;
  document.getElementById('pause-menu').style.display = v ? 'flex' : 'none';
}
document.getElementById('pause-btn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  audio.play('ui-click', { volume: 0.7 });
  setPaused(true);
});
document.getElementById('resume-btn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  audio.play('ui-click', { volume: 0.7 });
  setPaused(false);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') setPaused(!paused);
});

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

const input = new Input();
const timer = new THREE.Timer();

let world = null;
let player = null;
let pip = null;
let transitioning = false;
let narration = null;

// ---------------------------------------------------------------------------
// Narration triggers (design/NARRATION-SCRIPT.md). Story lines fire once per
// save (Narration tracks that); this section decides WHEN.
// ---------------------------------------------------------------------------

const throttles = {}; // repeatable-line id -> next allowed time
function sayThrottled(id, t, wait) {
  if ((throttles[id] || 0) > t) return;
  if (narration.say(id)) throttles[id] = t + wait;
}

const stuckHints = [
  { line: 'dark_nook', timer: 0, cond: () =>
      state.room === 'r1' && !state.flags.pups.pup1 && state.form !== 'dark_wolf' &&
      world.markers.darkNookMouth && nearSpot(world.markers.darkNookMouth, 4) },
  { line: 'geyser_intro', timer: 0, cond: () =>
      state.room === 'r2' && !state.spoken.boss_door && nearXZ(4.5, -4.4, 4) },
  { line: 'burn_prompt', timer: 0, cond: () =>
      state.room === 'r1' && state.formsUnlocked.includes('fire_wolf') &&
      !state.flags.burned.r1_cubby && nearXZ(-3.95, 4.4, 4) },
];

function nearXZ(x, z, r) {
  const dx = player.root.position.x - x;
  const dz = player.root.position.z - z;
  return dx * dx + dz * dz < r * r;
}
function nearSpot(spot, r) { return nearXZ(spot.x, spot.z, r); }

function narrationTriggers(dt, t) {
  const m = world.markers;

  if (state.room === 'r1') {
    const shade = (world.enemies || []).find((e) => e.constructor.name === 'Shade' && !e.dead);
    if (shade && nearXZ(shade.x, shade.z, 5.5)) narration.say('first_enemy');
    if (m.darkNookMouth && nearSpot(m.darkNookMouth, 2.4)) narration.say('dark_nook');
    if (!state.formsUnlocked.includes('fire_wolf') && nearXZ(-3.95, 4.4, 2.2)) narration.say('obstacle_first');
    if (state.formsUnlocked.includes('fire_wolf') && !state.flags.burned.r1_cubby && nearXZ(-3.95, 4.4, 3.2)) {
      narration.say('burn_prompt');
    }
  }

  if (state.room === 'r2') {
    const moth = (world.enemies || []).find((e) => e.constructor.name === 'Moth' && e.state === 'telegraph');
    if (moth) narration.say('moth_intro');
    if (nearXZ(4.5, -4.4, 3.2)) narration.say('geyser_intro');
    if (m.branchMouth && nearSpot(m.branchMouth, 2.6)) narration.say('hound_branch');
    if (nearXZ(8.6, -3.6, 2.4)) narration.say('boss_door');
  }

  const boss = world.boss;
  if (boss && !boss.defeated) {
    if (boss.phase === 1 && boss.stateT > 1.2) narration.say('boss_p1');
    if (boss.slamState === 'telegraph') narration.say('boss_p1_telegraph');
    if (boss.phase === 2) narration.say('boss_p2');
    if (boss.phase >= 2 && player.specialCooldown <= 0 && state.form === 'dark_wolf') {
      narration.say('boss_bloodmoon');
    }
    if (boss.phase === 3) narration.say('boss_p3');
  }

  if (m.exitSpot && nearSpot(m.exitSpot, 1.6)) {
    if (narration.say('region_complete')) {
      narration.say('grimm_taunt_1');
      narration.say('luna_dream_1');
    }
  }

  // contextual (repeatable, throttled)
  const shadesNear = (world.enemies || []).filter((e) =>
    e.constructor.name === 'Shade' && !e.dead && nearXZ(e.x, e.z, 6.5)).length;
  if (shadesNear >= 2) sayThrottled('enemy_group', t, 35);

  // stuck re-hints: linger ~22s at a gate → replay the teach line
  for (const h of stuckHints) {
    if (h.cond()) {
      h.timer += dt;
      if (h.timer > 22) {
        h.timer = 0;
        narration.say(h.line, { force: true });
      }
    } else h.timer = 0;
  }
}

function updateMusic() {
  if (state.room === 'r3' && world.boss && !world.boss.defeated) audio.playMusic('boss');
  else audio.playMusic('region-ember');
}

function onPupCollected() {
  renderPups();
  const found = Object.keys(state.flags.pups).length;
  if (found >= 3 && state.maxHearts === 5) {
    // all pups safe → a permanent extra heart, granted full
    state.maxHearts = 6;
    player.maxHearts = 6;
    player.healFull();
    effects.warmFlood();
    narration.say('all_pups');
  } else {
    narration.say('pup_found');
  }
}

async function setupRoomExtras() {
  await spawnPups(world, onPupCollected);
  if (pip) {
    pip.place(player.root.position.x - 0.9, player.root.position.z + 0.9, player.root.rotation.y);
  }
}

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
  await setupRoomExtras();
  snapCamera();
  updateMusic();
  if (id === 'r2') narration.say('r2_enter');
  if (id === 'r3' && world.boss && !world.boss.defeated) narration.say('boss_intro');
  window.__game = { player, world, state, effects, pip, narration, audio }; // debug/testing hook
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
  await setupRoomExtras();
  snapCamera();
  updateMusic();
  narration.say('respawn');
  window.__game = { player, world, state, effects, pip, narration, audio };
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
  pip = new Pip();
  await pip.load();
  scene.add(pip.root);
  player.onDamaged = () => renderHearts(player);
  player.onDefeated = () => { if (!transitioning) respawnAtCheckpoint(); };
  renderHearts(player);

  effects = new Effects(scene);
  narration = new Narration();
  ui = new UI({
    onFormPick: (id) => {
      if (player.setForm(id)) { ui.refreshBadge(); audio.play('ui-click', { volume: 0.6 }); }
      else { flashLockedForm(); narration.say('form_locked'); }
    },
    onSpecial: () => player.trySpecial(effects, world),
  });
  player.onDamaged = () => {
    renderHearts(player);
    if (player.hearts > 0 && player.hearts <= 2) {
      sayThrottled('low_hearts', timer.getElapsed(), 30);
    }
  };
  wireSettings();
  player.onFormChanged = () => ui.refreshBadge();
  input.onHold = (x, y, pointerId) => {
    if (transitioning) return false;
    ui.openPicker(x, y, pointerId);
    return true;
  };

  await buildRoomInitial();
  renderPups();

  document.getElementById('loading').style.display = 'none';

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    if (!world) return;

    if (paused) {
      renderer.render(scene, camera);
      return;
    }

    if (!transitioning) {
      // Keyboard shortcuts: Tab cycles forms, K fires the special
      if (input.consumeFormCycle()) {
        const unlocked = FORM_CYCLE.filter((f) => state.formsUnlocked.includes(f));
        const next = unlocked[(unlocked.indexOf(state.form) + 1) % unlocked.length];
        if (player.setForm(next)) ui.refreshBadge();
      }
      if (input.consumeSpecial()) player.trySpecial(effects, world);
      if (input.consumeAttack()) player.tryAttack(world);

      player.update(dt, input, world);
      pip.update(dt, t, player, world);
      if (world.updateEnemies) world.updateEnemies(dt, t, player);
      if (world.updatePups) world.updatePups(dt, t, player);
      if (world.boss) {
        if (!world.boss.onDefeated) {
          world.boss.onDefeated = () => {
            effects.warmFlood();
            effects.shake(0.35, 0.8);
            ui.refreshBadge();
            if (world.openShortcut) world.openShortcut(); // the way home opens
            audio.playMusic('victory', { loop: false, then: 'region-ember' });
            narration.say('boss_defeat');
            narration.say('firewolf_grant');
            narration.say('firewolf_howto');
          };
        }
        world.boss.update(dt, t, player);
      }

      // Door transitions
      const door = world.doorAt(player.root.position.x, player.root.position.z);
      if (door) loadRoom(door.to, door.entry);

      narrationTriggers(dt, t);

      // Checkpoints: touch to set respawn
      for (const cp of world.checkpoints) {
        if (cp.reached) continue;
        const dx = player.root.position.x - cp.x;
        const dz = player.root.position.z - cp.z;
        if (dx * dx + dz * dz < cp.r * cp.r) {
          cp.reached = true;
          state.checkpoint = { room: state.room, x: cp.x, z: cp.z, id: cp.id };
          showSavedToast();
          audio.play('checkpoint', { volume: 0.7 });
          narration.say('checkpoint');
        }
      }
    }

    world.animate(t, dt);

    // Real-lighting darkness: dark zones black out the base rig for the
    // Knight; the Dark Wolf (Phase 3) will see through it.
    const inDark = world.bossDarkness
      ? 1
      : world.darknessAt(player.root.position.x, player.root.position.z);
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
  await setupRoomExtras();
  snapCamera();
  updateMusic();
  narration.say('intro_arrival');
  window.__game = { player, world, state, effects, pip, narration, audio };
}

// Settings (pause menu) — wired to state.settings; persisted in Phase 9.
function wireSettings() {
  const music = document.getElementById('music-vol');
  const sfx = document.getElementById('sfx-vol');
  const captions = document.getElementById('captions-toggle');
  const voice = document.getElementById('voice-toggle');
  music.value = state.settings.musicVol;
  sfx.value = state.settings.sfxVol;
  captions.checked = state.settings.captions;
  voice.checked = state.settings.voice;
  music.addEventListener('input', () => { state.settings.musicVol = +music.value; audio.applyVolumes(); });
  sfx.addEventListener('input', () => {
    state.settings.sfxVol = +sfx.value;
    audio.applyVolumes();
    audio.play('ui-click', { volume: 0.7 });
  });
  captions.addEventListener('change', () => { state.settings.captions = captions.checked; });
  voice.addEventListener('change', () => {
    state.settings.voice = voice.checked;
    if (!voice.checked && 'speechSynthesis' in window) speechSynthesis.cancel();
  });
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
