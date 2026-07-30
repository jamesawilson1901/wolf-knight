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
import { applySave, persist } from './save.js';
import { showTitle } from './title.js';
import { preloadLoot, spawnBreakables, spawnChests, spawnShards, updateShards, updateChests, lootEvents } from './loot.js';
import { spawnPowerup, updatePowerups, updateBuffVisuals, powerupEvents, POWERUPS } from './powerups.js';
import { progressEvents, xpForLevel, bumpCounter, checkStickers, grantXp } from './progress.js';
import { addGear } from './items.js';
import { Menus, bigToast } from './menus.js';

const FORM_CYCLE = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'];

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
  // blocked hits cost half a heart → 💔 shows the half
  const full = Math.floor(player.hearts);
  const half = player.hearts - full >= 0.5 ? 1 : 0;
  heartsEl.textContent =
    '❤️'.repeat(full) + '💔'.repeat(half) +
    '\u{1f5a4}'.repeat(Math.max(0, player.maxHearts - full - half));
  heartsEl.classList.toggle('low', player.hearts > 0 && player.hearts <= 2);
}

const potionsEl = document.getElementById('potions');
function renderPotions(player) {
  potionsEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement('div');
    slot.className = 'potion-slot ui' + (i < player.potions ? '' : ' empty');
    slot.textContent = '🧪';
    if (i < player.potions) {
      slot.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        player.tryPotion();
      });
    }
    potionsEl.appendChild(slot);
  }
}

function renderPups() {
  const found = Object.keys(state.flags.pups).length;
  const total = state.spoken.region_complete ? 6 : 3; // Stoneroot adds three
  document.getElementById('pups').textContent = `🐺 ${found}/${total}`;
}

let savedToastTimer = null;
// Floating damage numbers — Terranigma's answer to "did that count?"
const dmgNums = [];
const _dmgV = new THREE.Vector3();
function spawnDmgNum(x, y, z, v) {
  const el = document.createElement('div');
  const block = typeof v === 'string';
  const big = !block && v >= 2;
  el.className = 'dmg-num' + (big ? ' big' : '') + (block ? ' block' : '');
  el.textContent = block ? v : (v % 1 ? v.toFixed(1) : String(v));
  document.body.appendChild(el);
  dmgNums.push({ el, x, y, z, life: 0.9 });
}
function updateDmgNums(realDt) {
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i];
    d.life -= realDt;
    d.y += realDt * 1.1;
    if (d.life <= 0) {
      d.el.remove();
      dmgNums.splice(i, 1);
      continue;
    }
    _dmgV.set(d.x, d.y, d.z).project(camera);
    d.el.style.left = ((_dmgV.x + 1) / 2 * window.innerWidth) + 'px';
    d.el.style.top = ((1 - _dmgV.y) / 2 * window.innerHeight) + 'px';
    d.el.style.opacity = String(Math.min(1, d.life / 0.45));
  }
}
// Boss health bar — progress is never a mystery
const bossBarEl = document.getElementById('boss-bar');
const bossNameEl = document.getElementById('boss-name');
const bossFillEl = document.getElementById('boss-fill');
function updateBossBar() {
  let bar = null;
  if (world.boss && !world.boss.defeated) {
    bar = { name: 'The Shadowgrip', f: Math.max(0, world.boss.coreHp) / 8 };
  } else if (world.warden && !world.warden.dead && world.warden.state !== 'sleep') {
    bar = { name: 'The Bone Warden', f: Math.max(0, world.warden.hp) / world.warden.maxHp };
  }
  bossBarEl.style.display = bar ? 'block' : 'none';
  if (bar) {
    bossNameEl.textContent = bar.name;
    bossFillEl.style.width = (bar.f * 100) + '%';
  }
}

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
  { line: 'boulder_hint', timer: 0, cond: () =>
      state.room === 'e2' && !state.flags.plates.e2_gate && nearXZ(-1.6, 3, 5) },
];

function nearXZ(x, z, r) {
  const dx = player.root.position.x - x;
  const dz = player.root.position.z - z;
  return dx * dx + dz * dz < r * r;
}
function nearSpot(spot, r) { return nearXZ(spot.x, spot.z, r); }

function narrationTriggers(dt, t) {
  const m = world.markers;

  // teaching reveals: shield when a shade closes in, bolt when moths appear,
  // jump at the geyser crossing
  if ((state.counters.kills || 0) >= 1) narration.say('learn_thrust');
  const anyShade = (world.enemies || []).find((e) => e.constructor.name === 'Shade' && !e.dead);
  if (anyShade && nearXZ(anyShade.x, anyShade.z, 3.5)) narration.say('learn_shield');
  const anyMoth = (world.enemies || []).find((e) => e.constructor.name === 'Moth' && !e.dead);
  if (anyMoth && nearXZ(anyMoth.x, anyMoth.z, 6.5)) narration.say('learn_bolt');
  if (state.room === 'r2' && nearXZ(4.5, -4.4, 5)) narration.say('learn_jump');
  refreshControlReveal();

  if (state.room === 'r1') {
    const shade = (world.enemies || []).find((e) => e.constructor.name === 'Shade' && !e.dead);
    if (shade && nearXZ(shade.x, shade.z, 5.5)) narration.say('first_enemy');
    if (m.darkNookMouth && nearSpot(m.darkNookMouth, 2.4)) narration.say('dark_nook');
    if (!state.formsUnlocked.includes('fire_wolf') && nearXZ(-3.95, 4.4, 2.2)) narration.say('obstacle_first');
    if (state.formsUnlocked.includes('fire_wolf') && !state.flags.burned.r1_cubby && nearXZ(-3.95, 4.4, 3.2)) {
      narration.say('burn_prompt');
    }
  }

  if (state.room === 'den') {
    narration.say('den_intro');
    if (m.shopSpot && nearSpot(m.shopSpot, 3)) narration.say('shop_intro');
    if (m.travelSpot && nearSpot(m.travelSpot, 3)) narration.say('moonstone_intro');
  }

  if (state.room === 'r2') {
    const moth = (world.enemies || []).find((e) => e.constructor.name === 'Moth' && e.state === 'telegraph');
    if (moth) narration.say('moth_intro');
    if (!state.flags.keys.ember && nearXZ(8.5, -5.2, 2.6)) narration.say('key_door');
    if (nearXZ(4.5, -4.4, 3.2)) narration.say('geyser_intro');
    if (m.branchMouth && nearSpot(m.branchMouth, 2.6)) narration.say('hound_branch');
    if (nearXZ(8.6, -3.6, 2.4)) narration.say('boss_door');
  }

  // Stoneroot Caverns
  if (state.room === 'e1') {
    narration.say('stone_enter');
    const skel = (world.enemies || []).find((e) => e.constructor.name === 'SkeletonMinion' && !e.dead);
    if (skel && nearXZ(skel.x, skel.z, 4.6)) narration.say('skeleton_intro');
  }
  if (state.room === 'e2') {
    const rogue = (world.enemies || []).find((e) => e.constructor.name === 'SkeletonRogue' && !e.dead);
    if (rogue && nearXZ(rogue.x, rogue.z, 5)) narration.say('rogue_intro');
    if (m.spikeSpot && nearSpot(m.spikeSpot, 4)) narration.say('spike_hint');
    if (m.boulderSpot && nearSpot(m.boulderSpot, 3)) narration.say('boulder_hint');
    if (state.flags.plates.e2_gate) narration.say('plate_open');
    if (state.flags.plates.e2_gate && nearXZ(8.6, 0, 3)) narration.say('warden_door');
  }
  if (state.room === 'e3') {
    if (world.warden && world.warden.state !== 'sleep' && !world.warden.dead) narration.say('warden_intro');
    if (world.warden && world.warden._blockedOnce) narration.say('warden_block');
    if (state.flags.wardenDefeated && m.petraSpot && nearSpot(m.petraSpot, 2.6)) {
      if (narration.say('stone_complete')) {
        narration.say('luna_dream_2');
        persist();
      }
    }
  }
  // Earth Wolf verb prompts (both regions carry cracked rocks)
  if (state.formsUnlocked.includes('earth_wolf') && m.crackSpot &&
      !state.flags.cracked.e1_alcove && nearSpot(m.crackSpot, 3.4)) {
    narration.say('crack_prompt');
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
      persist(); // region complete is a save point
      showCompleteScreen();
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
  if (state.room === 'den') audio.playMusic('den');
  else if (state.room === 'r3' && world.boss && !world.boss.defeated) {
    audio.playMusic('boss-loop', { intro: 'boss-intro' });
  } else if (state.room === 'r2') audio.playMusic('causeway');
  else if (state.room === 'e3') audio.playMusic('stone-deep');
  else if (state.room[0] === 'e') audio.playMusic('region-stone');
  else audio.playMusic('region-ember');
  audio.setAmbient({ r1: 0.5, r2: 0.75, r3: 0.65, den: 0, e1: 0.3, e2: 0.35, e3: 0.3 }[state.room] ?? 0.5);
}

// ---------------------------------------------------------------------------
// HUD: shards, level + XP bar, active buffs
// ---------------------------------------------------------------------------

function renderShards() {
  document.getElementById('shards').textContent = `🔸 ${state.shards}`;
}

function renderLevel() {
  const el = document.getElementById('level-badge');
  el.firstChild.textContent = `Lv ${state.level}`;
  document.getElementById('xp-fill').style.width =
    Math.round((state.xp / xpForLevel(state.level)) * 100) + '%';
}

function renderBuffs() {
  const el = document.getElementById('buffs');
  el.innerHTML = '';
  if (!player) return;
  for (const [k, def] of Object.entries(POWERUPS)) {
    if (player.buffs[k] > 0) {
      const chip = document.createElement('div');
      chip.className = 'buff-chip';
      chip.textContent = def.icon;
      chip.style.opacity = Math.min(1, 0.35 + player.buffs[k] / def.time);
      el.appendChild(chip);
    }
  }
}

// Chest contents flow through here (shards are scattered by the chest itself).
function giveLoot(chest) {
  const L = chest.loot || {};
  const lines = [];
  if (L.shards) lines.push(`🔸 ${L.shards}`);
  if (L.potion) {
    state.potions = Math.min(3, state.potions + L.potion);
    renderPotions(player);
    lines.push('🧪 potion');
  }
  if (L.heartPiece) {
    state.inventory.heartPieces += L.heartPiece;
    lines.push('💗 heart piece');
    if (state.inventory.heartPieces >= 4) {
      state.inventory.heartPieces -= 4;
      state.maxHearts++;
      player.maxHearts = state.maxHearts;
      player.healFull();
      effects.warmFlood();
      bigToast('💖 A whole new heart!');
    }
  }
  if (L.gear) {
    addGear(L.gear);
    lines.push('🗡️ new gear');
  }
  if (L.key) {
    state.flags.keys[L.key] = true;
    lines.push('🗝️ ' + (L.keyName || 'a key'));
    narration.say('key_found');
    if (world.openBossDoor) world.openBossDoor(); // unseal in the live room
  }
  if (L.powerup) spawnPowerup(world, chest.x, chest.z + 0.8, L.powerup);
  if (lines.length) bigToast(`🎁 ${lines.join(' · ')}`);
  persist();
}

// Progressive controls: buttons appear when Pip teaches them (persisted via
// the narration once-per-save memory, so Continue restores the layout).
function refreshControlReveal() {
  document.getElementById('btn-defend').classList.toggle('revealed', !!state.spoken.learn_shield);
  document.getElementById('btn-ranged').classList.toggle('revealed', !!state.spoken.learn_bolt);
  document.getElementById('btn-jump').classList.toggle('revealed', !!state.spoken.learn_jump);
  document.getElementById('form-badge').classList.toggle(
    'revealed',
    !!state.spoken.dark_nook || state.form !== 'knight' || state.formsUnlocked.includes('fire_wolf')
  );
}

function showCompleteScreen() {
  const found = Object.keys(state.flags.pups).length;
  document.getElementById('complete-stats').innerHTML =
    `🔥 Fire Wolf earned!<br>🐺 Pups rescued: ${found}/3${found === 3 ? ' — extra heart!' : ''}`;
  document.getElementById('complete').style.display = 'flex';
}
document.getElementById('complete-btn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  audio.play('ui-click', { volume: 0.7 });
  document.getElementById('complete').style.display = 'none';
});

// Back to the title = save + clean reload (simplest reliable full reset).
document.getElementById('title-btn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  persist();
  location.reload();
});

// Auto-save when the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

function onPupCollected() {
  renderPups();
  bumpCounter('pupsFound');
  const found = Object.keys(state.flags.pups).length;
  if (found >= 3 && state.maxHearts === 5) {
    // all Ember pups safe → a permanent extra heart, granted full
    state.maxHearts = 6;
    player.maxHearts = 6;
    player.healFull();
    effects.warmFlood();
    narration.say('all_pups');
  } else if (found >= 6 && state.maxHearts === 6) {
    // all Stoneroot pups too → another heart
    state.maxHearts = 7;
    player.maxHearts = 7;
    player.healFull();
    effects.warmFlood();
    narration.say('all_pups_stone');
  } else {
    narration.say('pup_found');
  }
  persist(); // pup collected is a save point
}

async function setupRoomExtras() {
  world.onDmgNum = spawnDmgNum;
  // The Bone Warden falls → Petra is freed, the Earth Wolf is earned.
  // Fired from the warden's death (not polled) so a simultaneous level-up
  // perk card can't swallow the celebration.
  world.onWardenDefeated = (w) => {
    if (state.flags.wardenDefeated) return;
    state.flags.wardenDefeated = true;
    effects.warmFlood();
    effects.shake(0.35, 0.8);
    if (world.freePetra) world.freePetra();
    audio.playMusic('victory', { loop: false, then: 'stone-deep' });
    bumpCounter('bosses');
    grantXp(80);
    spawnShards(world, w.x, w.z + 1.5, 18);
    spawnPowerup(world, w.x, w.z + 2, 'star');
    if (!state.formsUnlocked.includes('earth_wolf')) state.formsUnlocked.push('earth_wolf');
    ui.refreshBadge();
    narration.say('warden_defeat');
    narration.say('earthwolf_grant');
    narration.say('earthwolf_howto');
    persist(); // form unlock is a save point
  };
  await preloadLoot();
  await spawnBreakables(world, world.markers.breakables || []);
  await spawnChests(world, world.markers.chestDefs || []);
  await spawnPups(world, onPupCollected);
  shopWasNear = true; // don't pop the shop just from spawning next to it
  travelWasNear = true;
  // every so often a smashed pot hides a power-up
  const potDrops = ['fury', 'feather', 'magnet', 'star'];
  world.onBreakableSmashed = (x, z) => {
    const n = state.counters.pots || 0;
    if (n % 9 === 4) spawnPowerup(world, x, z, potDrops[n % potDrops.length]);
  };
  if (pip) {
    pip.place(player.root.position.x - 0.9, player.root.position.z + 0.9, player.root.rotation.y);
  }
}

async function loadRoom(id, entry) {
  transitioning = true;
  await fadeTo(1, 260);
  player.clearProjectiles();
  if (world) world.dispose();
  world = await buildRoom(id, scene);
  state.room = id;
  state.region = id[0] === 'e' ? 'stoneroot' : 'ember_hollow';
  applyRoomMood();
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

// Per-room mood: the caverns run darker (torches carry the light) with a
// deeper background/fog color.
function applyRoomMood() {
  const bg = world.bgColor !== undefined ? world.bgColor : 0x17101f;
  scene.background.setHex(bg);
  scene.fog.color.setHex(bg);
}

function snapCamera() {
  camGoal.copy(player.root.position).add(CAM_OFFSET);
  camera.position.copy(camGoal);
  camLook.copy(player.root.position);
  camera.lookAt(camLook.x, 0.6, camLook.z);
}

let deathStreak = 0;
let deathStreakCp = '';

async function respawnAtCheckpoint() {
  transitioning = true;
  if (state.checkpoint.id === deathStreakCp) deathStreak++;
  else { deathStreak = 1; deathStreakCp = state.checkpoint.id; }
  player.softenDamage = deathStreak >= 3; // quietly go easier after 3 falls
  await fadeTo(1, 500);
  player.clearProjectiles();
  const cp = state.checkpoint;
  if (world) world.dispose();
  world = await buildRoom(cp.room, scene);
  state.room = cp.room;
  state.region = cp.room[0] === 'e' ? 'stoneroot' : 'ember_hollow';
  applyRoomMood();
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
let menus = null;
let menuPaused = false;
let shopWasNear = false;
let travelWasNear = false;

async function start() {
  // Assets stream in while the title screen is up.
  player = new Player();
  pip = new Pip();
  const loading = Promise.all([player.load(), pip.load()]);
  document.getElementById('loading').style.display = 'none';

  const { profile, save } = await showTitle();
  applySave(profile.id, profile.name, save);

  document.getElementById('loading').style.display = 'flex';
  await loading;
  scene.add(player.root);
  scene.add(pip.root);

  // Restore the loaded run onto the already-built player.
  player.maxHearts = state.maxHearts;
  player.healFull();
  player.setForm(state.form, { silent: true });

  player.onDefeated = () => { if (!transitioning) respawnAtCheckpoint(); };
  player.onPotionsChanged = () => renderPotions(player);
  player.onParry = () => {
    effects.shake(0.15, 0.2);
    effects.hitStop(0.09);            // freeze the perfect moment
    narration.say('parry_praise');    // once per save
    bumpCounter('parries');
  };
  player.onHitConnected = () => effects.hitStop(0.07);
  renderHearts(player);
  renderPotions(player);
  refreshControlReveal();

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

  menus = new Menus({
    player,
    onPauseGame: () => { menuPaused = true; },
    onResumeGame: () => { menuPaused = false; },
    onTravel: (room) => {
      audio.play('form-switch', { volume: 0.7, rate: 0.8 }); // moonstone chime
      loadRoom(room);
    },
  });
  menus.onHudChanged = () => { renderShards(); renderPotions(player); };
  lootEvents.onShards = () => renderShards();
  progressEvents.onXp = () => renderLevel();
  progressEvents.onLevelUp = (level) => {
    renderLevel();
    player.hearts = Math.min(player.maxHearts, player.hearts + 1);
    renderHearts(player);
    bigToast(`⭐ Level ${level}!`);
    effects.warmFlood();
    if (level % 3 === 0) setTimeout(() => menus.showPerkPick(level), 900);
    persist();
  };
  progressEvents.onSticker = (sticker) => {
    bigToast(`📒 New sticker: ${sticker.icon} ${sticker.name}`);
  };
  powerupEvents.onGained = (kind, def) => {
    bigToast(`${def.icon} ${def.name}!`);
    renderBuffs();
  };
  renderShards();
  renderLevel();
  checkStickers();
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
    const realDt = timer.getDelta();
    const dt = Math.min(realDt, 0.05);
    const t = timer.getElapsed();
    if (!world) return;

    if (paused || menuPaused) {
      renderer.render(scene, camera);
      return;
    }

    // Story hints freeze the world while they play (tap the caption to skip)
    if (narration.blocking) {
      renderer.render(scene, camera);
      return;
    }

    // hit-stop: a solid hit freezes the world for a few frames
    if (effects.hitStopTime > 0) {
      effects.hitStopTime -= realDt;
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
      if (input.consumeRanged()) player.tryRanged(world);
      if (input.consumeJump()) {
        const wasAirborne = player.jumpsUsed >= 1;
        if (player.tryJump() && wasAirborne) bumpCounter('doubleJumps');
      }
      if (input.consumePotion()) player.tryPotion();

      player.update(dt, input, world);
      world.updateBoulders(dt, player);
      pip.update(dt, t, player, world);
      if (world.updateEnemies) world.updateEnemies(dt, t, player);
      if (world.updatePups) world.updatePups(dt, t, player);
      updateShards(world, dt, t, player);
      updateChests(world, player, giveLoot);
      updatePowerups(world, dt, t, player);
      updateBuffVisuals(world, dt, t, player);
      renderBuffs();

      // the Den shop opens when Kael walks up to the mage
      if (world.markers.shopSpot) {
        const near = nearSpot(world.markers.shopSpot, 1.7);
        if (near && !shopWasNear) menus.showShop();
        shopWasNear = near;
      }
      // ...and the moonstone opens fast travel
      if (world.markers.travelSpot) {
        const near = nearSpot(world.markers.travelSpot, 1.5);
        if (near && !travelWasNear) menus.showTravel();
        travelWasNear = near;
      }
      if (world.boss) {
        if (!world.boss.onDefeated) {
          world.boss.onDefeated = () => {
            effects.warmFlood();
            effects.shake(0.35, 0.8);
            ui.refreshBadge();
            if (world.openShortcut) world.openShortcut(); // the way home opens
            audio.playMusic('victory', { loop: false, then: 'region-ember' });
            bumpCounter('bosses');
            grantXp(60);
            spawnShards(world, world.boss.x, world.boss.z + 1.5, 15); // shard shower
            spawnPowerup(world, world.boss.x, world.boss.z + 2, 'star'); // victory gift
            narration.say('boss_defeat');
            narration.say('firewolf_grant');
            narration.say('firewolf_howto');
            persist(); // form unlock is a save point
          };
        }
        world.boss.update(dt, t, player);
      }

      // Door transitions
      const door = world.doorAt(player.root.position.x, player.root.position.z);
      if (door) loadRoom(door.to, door.entry);

      narrationTriggers(dt, t);

      // Potion pickups
      for (const p of world.potionSpots) {
        if (p.taken) continue;
        const dx = player.root.position.x - p.x;
        const dz = player.root.position.z - p.z;
        if (dx * dx + dz * dz < 0.75 * 0.75 && player.addPotion()) {
          p.taken = true;
          world.root.remove(p.group);
        }
      }

      // Checkpoints: touch to set respawn
      for (const cp of world.checkpoints) {
        if (cp.reached) continue;
        const dx = player.root.position.x - cp.x;
        const dz = player.root.position.z - cp.z;
        if (dx * dx + dz * dz < cp.r * cp.r) {
          cp.reached = true;
          state.checkpoint = { room: state.room, x: cp.x, z: cp.z, id: cp.id };
          deathStreak = 0;
          player.softenDamage = false;
          showSavedToast();
          audio.play('checkpoint', { volume: 0.7 });
          narration.say('checkpoint');
          persist();
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
    const rig = world.lightScale !== undefined ? world.lightScale : 1;
    hemi.intensity = HEMI_BASE * rig * (1 - 0.94 * darkness);
    key.intensity = KEY_BASE * rig * (1 - 0.97 * darkness);
    for (const zone of world.darkZones) {
      zone.veilMat.opacity = state.form === 'dark_wolf' ? 0.12 : 0.62 * (1 - darkness * 0.85);
    }

    effects.update(dt, t);
    updateDmgNums(realDt);
    updateBossBar();
    ui.update(player);
    // ranged button dims while on cooldown
    document.getElementById('btn-ranged').style.opacity =
      player.rangedCooldown > 0 ? '0.35' : '1';

    // Smooth camera follow (+ effect shake + Blood Moon punch-in)
    const k = 1 - Math.exp(-6 * dt);
    camGoal.copy(player.root.position).addScaledVector(CAM_OFFSET, 1 - 0.14 * effects.zoom);
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
  applyRoomMood();
  // Continue resumes at the saved checkpoint; a fresh game uses the spawn.
  const cp = state.checkpoint;
  if (cp && cp.room === state.room && cp.id !== 'spawn') {
    player.place(cp.x, cp.z + 0.9, Math.PI);
  } else {
    player.place(world.spawn.x, world.spawn.z, world.spawn.angle);
  }
  for (const c of world.checkpoints) {
    if (state.checkpoint.id === c.id) c.reached = true;
  }
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
  const brave = document.getElementById('brave-toggle');
  brave.checked = !!state.settings.brave;
  brave.addEventListener('change', () => { state.settings.brave = brave.checked; persist(); });
  music.value = state.settings.musicVol;
  sfx.value = state.settings.sfxVol;
  captions.checked = state.settings.captions;
  voice.checked = state.settings.voice;
  music.addEventListener('input', () => { state.settings.musicVol = +music.value; audio.applyVolumes(); persist(); });
  sfx.addEventListener('input', () => {
    state.settings.sfxVol = +sfx.value;
    audio.applyVolumes();
    audio.play('ui-click', { volume: 0.7 });
    persist();
  });
  captions.addEventListener('change', () => { state.settings.captions = captions.checked; persist(); });
  voice.addEventListener('change', () => {
    state.settings.voice = voice.checked;
    if (!voice.checked && 'speechSynthesis' in window) speechSynthesis.cancel();
    persist();
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
