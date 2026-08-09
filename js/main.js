// Wolf Knight — bootstrap + main loop.
// Phase 2: the three Ember Hollow rooms with door transitions, checkpoints,
// the dark nook (real-lighting darkness), geysers, and burnable props.
// Rooms rebuild on every entry (anti-soft-lock reset).

import * as THREE from 'three';
import { manager } from './assets.js';
import { Input } from './input.js';
import { buildRoom } from './rooms.js';
import { sameDistrict } from './districts.js';
import { makeHarness } from './minigame.js';
import { FETCH } from './mg-fetch.js';
import { Player } from './player.js';
import { state, resolveRoom } from './state.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { Pip, spawnPups } from './pip.js';
import { audio } from './audio.js';
import { Narration } from './narration.js';
import { applySave, persist, setSaveErrorHandler } from './save.js';
import { showTitle } from './title.js';
import { preloadLoot, spawnBreakables, spawnChests, spawnShards, updateShards, updateChests, lootEvents } from './loot.js';
import { spawnPowerup, updatePowerups, updateBuffVisuals, powerupEvents, POWERUPS } from './powerups.js';
import { progressEvents, xpForLevel, bumpCounter, checkStickers, grantXp } from './progress.js';
import { addGear } from './items.js';
import { Menus, bigToast } from './menus.js';
import { CONFIG } from './config.js';
import { WS, logMystery, resolveMystery } from './worldstate.js';
import { perf } from './perf.js';
import { juice } from './juice.js';
import { validateRegions } from './regions.js';
import { createTitleScene, buildPortraits } from './titlescene.js';
import { emberRestorationLive, stoneRestorationLive } from './rooms.js';

const FORM_CYCLE = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf'];

// A8 — THE PROMISE REGISTER. One row per "come back later" gate in the three
// rebuilt levels: the marker the room drops, the map entry it earns, and the
// condition that closes it. `done` reads the same flag the gate is built from,
// so the map can never claim a wall is open while the wall is still standing.
const PROMISES = [
  { marker: 'crackPromise', id: 'l1_crack', icon: '🪨', r: 4,
    label: 'A cracked wall — the Ashfall',
    done: () => !!state.flags.cracked.l1_crack_gate },
  { marker: 'firePromise', id: 'l1_scorched', icon: '🔥', r: 4.5,
    label: 'A scorched barricade — the Scorched Cubby',
    done: () => !!state.flags.burned.l1_scorched_gate },
  { marker: 'underwaterPromise', id: 'l2_sunken', icon: '💧', r: 4,
    label: 'A chest under the water — the Great Vault',
    done: () => WS.get('vault', 'drained') },
  { marker: 'bramblePromise', id: 'l2_bramble', icon: '🌿', r: 4,
    label: 'A thorny tangle — the Drowned Door',
    done: () => WS.get('vault', 'cut_l2_bramble_gate') },
  { marker: 'thornPromise', id: 'l3_thorn', icon: '🌿', r: 4,
    label: 'A thorn wall — Thornedge',
    done: () => WS.get('wild3', 'cut_w3_thorn_wall') },
  { marker: 'icePromise', id: 'l3_spring', icon: '❄️', r: 4,
    label: 'A spring sealed in ice — Thornedge',
    done: () => WS.get('wild3', 'ice_l3_spring_ice') },
  { marker: 'rootWallPromise', id: 'l3_rootwall', icon: '🌿', r: 4,
    label: 'A wall of roots — the Rootbound Deep', say: 'rootwall_hint',
    done: () => WS.get('wild3', 'rootCut') },
  { marker: 'logPromise', id: 'l3_greatlog', icon: '🪵', r: 4.5,
    label: 'A great log, tangled — the Bloomfall', say: 'greatlog_hint',
    done: () => WS.get('wild3', 'logDown') },
];
// contact-burst colors for the form-switch spectacle
const FORM_BURST = { knight: 0xbfe3ff, dark_wolf: 0xb08aff, fire_wolf: 0xff8a3a, earth_wolf: 0xd8b06a };

// World-rule validation (lock-before-key etc.) — loud in the console so
// region drift is caught the moment a dev build boots.
{
  const v = validateRegions();
  for (const e of v.errors) console.error('[regions]', e);
  for (const w of v.warnings) console.warn('[regions]', w);
}

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // METRICS.md budget
perf.attach(renderer);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17101f);
scene.fog = new THREE.Fog(0x17101f, 26, 52);

// near=1.5: the camera never comes closer than ~8u to anything, and a tight
// near plane is what keeps 16-bit mobile depth buffers from z-fighting the
// flat ground decals (lava sheets, path tiles) against the floor.
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1.5, 100);
const CAM_PITCH = THREE.MathUtils.degToRad(50);
const CAM_DIST = 11;
const CAM_OFFSET = new THREE.Vector3(
  0,
  CAM_DIST * Math.sin(CAM_PITCH),
  CAM_DIST * Math.cos(CAM_PITCH)
);
const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camLead = new THREE.Vector3(); // smoothed look-ahead (CONFIG.LOOKAHEAD_*)
const _lookTarget = new THREE.Vector3();

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
// THE SHADOW BOX FOLLOWS KAEL (see the render loop). It used to be nailed to
// the world origin at 28 x 28, which on a 32 x 26 island covered nearly the
// whole room — so every shadow-casting prop in the room was submitted a SECOND
// time for the depth pass, whether or not it was anywhere near the camera. On
// `la` dressed to ROOM-STANDARD that was 35 extra draw calls, a third of the
// room's whole budget, spent on shadows for things off screen.
//
// A 20 x 20 box centred on the player covers everything the camera can see
// (16.1u at the near edge, 22.2u at Kael — design/METRICS.md) and nothing it
// cannot. It is also the same box in every room, so a big island now costs what
// a small pocket costs, and the 1024 map is spread over 20 units instead of 28,
// which makes the shadows sharper as a side effect rather than softer.
const SHADOW_HALF = 10;
key.shadow.camera.left = -SHADOW_HALF;
key.shadow.camera.right = SHADOW_HALF;
key.shadow.camera.top = SHADOW_HALF;
key.shadow.camera.bottom = -SHADOW_HALF;
key.shadow.camera.near = 2;
key.shadow.camera.far = 34;
key.shadow.normalBias = 0.03;
const KEY_OFFSET = new THREE.Vector3(6, 13, 8);
const tmpCol = new THREE.Color();
const tmpHSL = { h: 0, s: 0, l: 0 };
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

// A SAVE THAT CANNOT WRITE MUST SAY SO. Quota exceeded, private browsing, a
// full disk — the child otherwise plays a whole evening and loses it silently.
// Loud but not fatal: the run keeps going, because throwing away an hour of
// play to punish the browser would be the worse bug.
setSaveErrorHandler((msg) => {
  showError(msg + '\n\nYour game is still playable, but it is NOT being saved.\n' +
    'Tell a grown-up: the browser may be out of space, or in private mode.');
});

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
  ctxShow(potionsEl);
}

function renderPups() {
  const found = Object.keys(state.flags.pups).length;
  // each opened region adds three pups to the count the HUD promises
  const total = state.spoken.wild_complete ? 12
    : state.spoken.stone_complete ? 9 : state.spoken.region_complete ? 6 : 3;
  const el = document.getElementById('pups');
  el.textContent = `🐺 ${found}/${total}`;
  ctxShow(el);
}

let savedToastTimer = null;

// Contextual HUD: non-critical readouts appear on change, then fade away.
// Persistent HUD is only hearts, the form badge and the special cooldown.
const ctxTimers = new Map();
function ctxShow(el, holdMs = 3500) {
  if (!el) return;
  el.classList.add('ctx');
  el.classList.remove('faded');
  clearTimeout(ctxTimers.get(el));
  ctxTimers.set(el, setTimeout(() => el.classList.add('faded'), holdMs));
}

// Floating damage numbers — Terranigma's answer to "did that count?"
const dmgNums = [];
const _dmgV = new THREE.Vector3();
function spawnDmgNum(x, y, z, v) {
  const el = document.createElement('div');
  const superHit = v === 'SUPER!'; // weakness landed — gold and loud
  const shatter = v === 'SHATTER!'; // frozen solid, then struck — icy and loud
  const block = typeof v === 'string' && !superHit && !shatter;
  const big = typeof v === 'number' && v >= 2;
  el.className = 'dmg-num' + (big ? ' big' : '') + (block ? ' block' : '')
    + (superHit ? ' super' : '') + (shatter ? ' shatter' : '');
  el.textContent = typeof v === 'string' ? v : (v % 1 ? v.toFixed(1) : String(v));
  document.body.appendChild(el);
  dmgNums.push({ el, x, y, z, life: (superHit || shatter) ? 1.1 : 0.9 });
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
    bar = { name: world.boss.name || 'The Shadowgrip', f: Math.max(0, world.boss.coreHp) / (world.boss.maxHp || 8) };
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
// The ✕ stays pinned in the corner even when the menu scrolls — there is
// ALWAYS a visible way back to the game.
document.getElementById('pause-close').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  audio.play('ui-click', { volume: 0.7 });
  setPaused(false);
});

// ---------------------------------------------------------------------------
// 🎮 The backdoor: a retro controller pops up; enter the old code
// (↑ ↑ ↓ ↓ ○ □ □ ○) to open the level selector. Dad-only by obscurity.
// ---------------------------------------------------------------------------
{
  // Dad's code (v3.14.1 — as he remembers it, and his memory is the spec):
  // ↑ ↑ ↓ ↓ ← → ○ □ □ ○
  const CODE = ['up', 'up', 'down', 'down', 'left', 'right', 'circle', 'square', 'square', 'circle'];
  // LEVELS, not rooms (v3.18.3 — dad's rule): each entry skips to the
  // BEGINNING of a level and grants the whole journey up to that point
  // (forms, keys, boss flags), so the level is playable from its first step.
  const LEVELS = [
    { id: 'den', label: '🏡 Moonlit Den' },
    { id: 'la', label: '🌋 Level 1 — Ember Hollow' },
    {
      id: 'vh', label: '⛰️ Level 2 — Stoneroot Caverns',
      forms: ['fire_wolf'], // earned by finishing Level 1...
      emberDone: true,      // ...so Level 1 counts as complete
    },
    {
      id: 't1a', label: '🌲 Level 3 — Wild Woods',
      forms: ['fire_wolf', 'earth_wolf'],
      emberDone: true, stoneDone: true, // both earlier levels count as complete
    },
    {
      id: 'f1', label: '🏔️ Level 4 — Frostpeak',
      forms: ['fire_wolf', 'earth_wolf', 'verdant_wolf'],
      emberDone: true, stoneDone: true, wildDone: true,
    },
    // GREYBOX — not part of the played game. These two exist so a layout can
    // be walked and judged before a single art asset is placed (build order
    // law). They stay in the cheat menu, behind the code, until dressed.
    { id: 'zoo', label: '📏 Metrics Zoo (greybox)', noSave: true, greybox: true },
    {
      id: 'la', label: '🧱 Level 1 REBUILD (greybox)',
      forms: ['fire_wolf'], noSave: true, greybox: true,
    },
    {
      id: 'la', label: '🎨 Level 1 REBUILD (dressed)',
      forms: ['fire_wolf'], noSave: true, greybox: false,
    },
    {
      id: 'vh', label: '🪨 Level 2 REBUILD (greybox)',
      forms: ['fire_wolf'], emberDone: true, noSave: true, greybox: true,
    },
    {
      id: 'vh', label: '💎 Level 2 REBUILD (dressed)',
      forms: ['fire_wolf'], emberDone: true, noSave: true, greybox: false,
    },
    {
      id: 't1a', label: '🌲 Level 3 REBUILD (greybox)',
      forms: ['fire_wolf', 'earth_wolf'], emberDone: true, stoneDone: true,
      noSave: true, greybox: true,
    },
    {
      id: 't1a', label: '🍃 Level 3 REBUILD (dressed)',
      forms: ['fire_wolf', 'earth_wolf'], emberDone: true, stoneDone: true,
      noSave: true, greybox: false,
    },
  ];
  const pad = document.getElementById('cheat-pad');
  const levels = document.getElementById('cheat-levels');
  const lights = document.getElementById('cheat-lights');
  let progress = 0;
  for (let i = 0; i < CODE.length; i++) {
    const l = document.createElement('div');
    l.className = 'clight';
    lights.appendChild(l);
  }
  const renderLights = () => {
    [...lights.children].forEach((l, i) => l.classList.toggle('on', i < progress));
  };
  document.getElementById('cheat-btn').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    progress = 0;
    renderLights();
    pad.style.display = 'flex';
  });
  const closeAll = () => { pad.style.display = 'none'; levels.style.display = 'none'; };
  document.getElementById('cheat-close').addEventListener('pointerdown', (e) => { e.stopPropagation(); closeAll(); });
  document.getElementById('cheat-close2').addEventListener('pointerdown', (e) => { e.stopPropagation(); closeAll(); });
  // GHOST-TAP GUARD: some phones deliver pointerdown TWICE for one touch.
  // With a double-press code (↑↑↓↓…), one ghost on a ↓ silently advances the
  // counter and the kid's REAL second ↓ then "fails" — the pad looked
  // haunted. A same-key press inside 90ms can't be human; drop it.
  let lastKey = '';
  let lastKeyT = 0;
  for (const btn of pad.querySelectorAll('.cbtn[data-k]')) {
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault(); // also suppresses compat mouse events on touch
      const k = btn.dataset.k;
      const now = performance.now();
      if (k === lastKey && now - lastKeyT < 90) return;
      lastKey = k;
      lastKeyT = now;
      btn.classList.add('hit');
      setTimeout(() => btn.classList.remove('hit'), 160);
      if (k === CODE[progress]) {
        progress++;
        audio.play('ui-click', { volume: 0.6, rate: 1 + progress * 0.07 }); // rising chirps
        renderLights();
        if (progress >= CODE.length) {
          audio.play('checkpoint', { volume: 0.9, rate: 1.4 }); // the old unlock chime
          setTimeout(() => { pad.style.display = 'none'; levels.style.display = 'flex'; }, 350);
        }
      } else {
        // a stray ↑ RESTARTS the code (progress 1), anything else clears it —
        // and the lights blink red so a reset never looks like a glitch
        progress = k === CODE[0] ? 1 : 0;
        renderLights();
        lights.classList.remove('err');
        void lights.offsetWidth;
        lights.classList.add('err');
        audio.play('parry', { volume: 0.4, rate: 0.5 }); // dull buzz — wrong
      }
    });
  }
  const grid = document.getElementById('cheat-grid');
  for (const lvl of LEVELS) {
    const b = document.createElement('div');
    b.className = 'cheat-lvl ui';
    b.textContent = lvl.label;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.play('form-switch', { volume: 0.8 });
      // the same layout, either costume — greybox to judge the SPACE, dressed
      // to judge the art. Switching is a jump, not a rebuild of anything else.
      if (lvl.greybox !== undefined) state.settings.greybox = lvl.greybox;
      // grant the journey so far — the skip must never strand a kid
      // without the wolves/keys the level assumes they have
      for (const f of lvl.forms || []) {
        if (!state.formsUnlocked.includes(f)) state.formsUnlocked.push(f);
      }
      if (lvl.emberDone) {
        state.flags.bossDefeated = true;
        state.flags.shortcutOpen = true;
        state.flags.bossProgress = 0;
        state.flags.bossHp = 0;
        state.flags.keys.ember = true;
        state.flags.keys.kiln = true;
      }
      if (lvl.stoneDone) {
        state.flags.wardenDefeated = true;
        state.flags.plates.e2_gate = true;
        WS.set('stone', 'restored');
      }
      if (lvl.wildDone) {
        state.flags.sylvaDefeated = true;
        WS.set('wild', 'lanterns');
        WS.set('wild', 'restored');
        state.flags.plates.w3_p1 = true;
        state.flags.plates.w3_p2 = true;
      }
      // the save follows the jump: Continue and respawns use the level start.
      // Greybox spaces deliberately do NOT — a kid who tapped the wrong thing
      // must not find their save parked in an untextured prototype.
      if (!lvl.noSave) {
        state.checkpoint = { room: resolveRoom(lvl.id), x: 0, z: 0, id: 'spawn' };
        persist();
      }
      closeAll();
      setPaused(false);
      loadRoom(lvl.id);
    });
    grid.appendChild(b);
  }
}
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
  { line: 'boss_duel', timer: 0, cond: () =>
      !!world.boss && !world.boss.defeated },
];

function nearXZ(x, z, r) {
  const dx = player.root.position.x - x;
  const dz = player.root.position.z - z;
  return dx * dx + dz * dz < r * r;
}
function nearSpot(spot, r) { return nearXZ(spot.x, spot.z, r); }

// 🌸 Gentle guide: when a Gentle-mode kid makes no progress for a while,
// Pip sprints ahead along the way forward, leaving a glowing paw trail
// (WORLD-DESIGN §4: an in-world cue, never a UI marker).
let guideIdle = 0;
let guideSnapshot = '';
function progressSnapshot() {
  const f = state.flags;
  return [state.room, state.counters.kills || 0, Object.keys(f.chests).length,
    Object.keys(f.keys).length, Object.keys(f.pups).length,
    Object.keys(f.burned).length, Object.keys(f.cracked).length,
    state.formsUnlocked.length].join('|');
}
// The way forward per room, following the same flags the stuck-hints use.
function guideTarget() {
  const f = state.flags;
  switch (state.room) {
    case 'den': return { x: 0, z: 7.4 };    // stairs up to the Hollow (south gate)
    case 'r1': return { x: 6, z: -6.3 };    // exit to the Causeway
    case 'r1b': return { x: 5.2, z: -5.0 }; // ledge drop home
    case 'r2': return f.keys.ember ? { x: 8.5, z: -6.2 } : { x: 10.2, z: 3.4 };
    case 'r2b': return f.keys.ember ? { x: -7.4, z: 0 } : { x: 5.5, z: -0.2 };
    case 'k1': return !state.formsUnlocked.includes('fire_wolf') ? { x: -5, z: -6.2 }
      : (f.keys.kiln ? { x: 5, z: -6.2 } : { x: 0, z: -6.2 }); // A, then C, else B
    case 'ka': return { x: 0, z: -2.6 };    // the fire shrine / braziers
    case 'kb': return { x: -4.4, z: -2.2 }; // brazier ONE of the order puzzle
    case 'r3': return f.bossDefeated ? { x: -7.4, z: 0.6 } : { x: 0, z: -0.5 };
    case 'e1': return { x: 0, z: -6.2 };    // deeper: the Deep Hall
    case 'e1b': return { x: 1.8, z: 3.2 };  // the treasure chest in the dark
    case 'e2': return f.plates.e2_gate ? { x: 9.6, z: 0 } : { x: -2.6, z: 1.4 }; // the boulder, then the crypt gate
    case 'e2b': return (f.e2bCleared || (f.plates.e2b_p1 && f.plates.e2b_p2))
      ? { x: 6.9, z: -5.0 } : { x: 0, z: -1.0 }; // the fight, then the vault
    case 'e3': return f.wardenDefeated ? { x: 5.5, z: -6.2 } : { x: 0, z: -2 }; // then: the vine way
    case 'w1': return { x: 0, z: -5.6 };    // deeper: the Gloomwood
    case 'w1b': return { x: -2.0, z: -3.6 }; // the pup in the dell
    case 'w2': return WS.get('wild', 'lanterns')
      ? { x: 0, z: -6.4 }
      : (f.cracked.w2_lantern ? { x: 0.5, z: -4.4 } : { x: 0.5, z: -2.6 }); // lanterns: crack, then light
    case 'w2b': return { x: 4.4, z: -3.4 };
    case 'w3': return (f.plates.w3_p1 && f.plates.w3_p2) ? { x: 0, z: -6.4 } : { x: -5.8, z: 2.2 };
    case 'w4': return { x: 0, z: -5.6 };    // the boss door
    case 'w5': return f.sylvaDefeated ? { x: 0, z: -6.6 } : { x: 0, z: -0.5 }; // then: the way up
    case 'f1': return { x: 0, z: -5.6 };    // deeper: the Icebound Hall
    case 'f1b': return { x: -2.2, z: -3.4 }; // the pup by the cairn
    case 'f2': return WS.get('frost', 'braziers') ? { x: 0, z: -6.4 } : { x: 0, z: -4.2 }; // the middle brazier
    case 'f2b': return { x: 4.4, z: -3.2 };
    case 'f3': return (f.plates.f3_p1 && f.plates.f3_p2) ? { x: 0, z: -6.4 } : { x: -7.0, z: 1.6 };
    case 'f4': return { x: 0, z: -5.6 };    // the summit door
    case 'f5': return f.borealDefeated ? { x: 6.4, z: -6.0 } : { x: 0, z: -1.0 };
    default: return null;
  }
}
function updateGentleGuide(dt) {
  if (!state.settings.easy || pip.guiding || transitioning) return;
  const snap = progressSnapshot();
  if (snap !== guideSnapshot) { guideSnapshot = snap; guideIdle = 0; return; }
  guideIdle += dt;
  if (guideIdle < CONFIG.DIFFICULTY.GUIDE_IDLE_S) return;
  guideIdle = -10; // cooldown before it may run again
  const tgt = guideTarget();
  if (!tgt) return;
  pip.startGuide(tgt.x, tgt.z, world);
  narration.say('guide_run');
}

function narrationTriggers(dt, t) {
  const m = world.markers;

  // teaching reveals: shield when a shade closes in, bolt when moths appear,
  // jump at the geyser crossing
  if ((state.counters.kills || 0) >= 1) narration.say('learn_thrust');
  // the first WEAKNESS hit: teach that every creature fears something
  if ((state.counters.weakHits || 0) >= 1) narration.say('element_teach');
  const anyShade = (world.enemies || []).find((e) => e.constructor.name === 'Shade' && !e.dead);
  if (anyShade && nearXZ(anyShade.x, anyShade.z, 3.5)) narration.say('learn_shield');
  const anyMoth = (world.enemies || []).find((e) => e.constructor.name === 'Moth' && !e.dead);
  if (anyMoth && nearXZ(anyMoth.x, anyMoth.z, 6.5)) narration.say('learn_bolt');
  if (state.room === 'r2' && nearXZ(4.5, -4.4, 5)) narration.say('learn_jump');
  // the FIRST full moon: Pip teaches the surge — but the Blood Moon is the
  // DARK WOLF's power, so the teach (and the ready-nag) only speak to the wolf
  if (state.form === 'dark_wolf' && state.moonGauge >= 1 &&
      !player.surging && !player.ceremonyActive) narration.say('moon_full');
  refreshControlReveal();

  if (state.room === 'r1') {
    if (state.flags.bossDefeated) narration.say('lava_cooled');
    const shade = (world.enemies || []).find((e) => e.constructor.name === 'Shade' && !e.dead);
    if (shade && nearXZ(shade.x, shade.z, 5.5)) narration.say('first_enemy');
    // Dark Wolf is Luna's gift from minute one — introduce it ON the critical
    // path (right after the first victory), not just at the optional dark nook
    if ((state.counters.kills || 0) >= 1) narration.say('darkwolf_intro');
    if (m.darkNookMouth && nearSpot(m.darkNookMouth, 2.4)) narration.say('dark_nook');
    if (!state.formsUnlocked.includes('fire_wolf') && nearXZ(-3.95, 4.4, 2.2)) narration.say('obstacle_first');
    if (state.formsUnlocked.includes('fire_wolf') && !state.flags.burned.r1_cubby && nearXZ(-3.95, 4.4, 3.2)) {
      narration.say('burn_prompt');
    }
    if (m.scarSpot && nearSpot(m.scarSpot, 2.4)) narration.say('scar_r1');
  }

  if (state.room === 'den') {
    narration.say('den_intro');
    if (m.shopSpot && nearSpot(m.shopSpot, 3)) narration.say('shop_intro');
    if (m.travelSpot && nearSpot(m.travelSpot, 3)) narration.say('moonstone_intro');
    if (m.cinderHome && nearSpot(m.cinderHome, 2.6)) narration.say('cinder_den');
    if (m.petraHome && nearSpot(m.petraHome, 2.6)) narration.say('petra_den');
    // villagers: intro once, then gentle repeatable chat (throttled)
    if (m.wrenSpot && nearSpot(m.wrenSpot, 2.6)) {
      if (!narration.say('wren_intro')) sayThrottled('wren_rumour', t, 45);
    }
    if (m.rookSpot && nearSpot(m.rookSpot, 2.6)) {
      if (!narration.say('rook_intro')) sayThrottled('rook_chat', t, 45);
    }
    if (m.bramSpot && nearSpot(m.bramSpot, 2.6)) narration.say('bram_den');
    if (m.dogSpot && nearSpot(m.dogSpot, 1.8)) narration.say('den_dog');
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
    if (m.rippleShoots && nearSpot(m.rippleShoots, 2.6)) narration.say('ripple_shoot');
    if (m.campSpot && nearSpot(m.campSpot, 3)) {
      narration.say(WS.get('stone', 'restored') ? 'camp_healed' : 'camp_rumour');
    }
    const skel = (world.enemies || []).find((e) => e.constructor.name === 'SkeletonMinion' && !e.dead);
    if (skel && nearXZ(skel.x, skel.z, 4.6)) narration.say('skeleton_intro');
  }
  if (state.room === 'e2') {
    if (m.scarSpot && nearSpot(m.scarSpot, 2.4)) narration.say('scar_e2');
    if (m.brambleSpot && nearSpot(m.brambleSpot, 3)) {
      if (logMystery('stone_bramble', '🌿', 'A thorny tangle — the Deep Hall')) bigToast('🗺️ Added to the map: ???');
      narration.say('gate_promise');
    }
    const rogue = (world.enemies || []).find((e) => e.constructor.name === 'SkeletonRogue' && !e.dead);
    if (rogue && nearXZ(rogue.x, rogue.z, 5)) narration.say('rogue_intro');
    if (m.spikeSpot && nearSpot(m.spikeSpot, 4)) narration.say('spike_hint');
    if (m.boulderSpot && nearSpot(m.boulderSpot, 3)) narration.say('boulder_hint');
    if (state.flags.plates.e2_gate) narration.say('plate_open');
    if (state.flags.plates.e2_gate && nearXZ(8.6, 0, 3)) narration.say('warden_door');
  }
  if (state.room === 'e1b') narration.say('darkcave_enter');
  if (state.room === 'e2b') {
    narration.say('quarry_enter');
    if (world.quarryCleared && world.quarryCleared()) narration.say('quarry_clear');
  }
  if (state.room === 'e3') {
    if (m.wildwoodsWay && nearSpot(m.wildwoodsWay, 3)) {
      narration.say('ripple_vine');
      if (logMystery('wildwoods_way', '🌿', 'A vine through the stone — the way onward')) bigToast('🗺️ Added to the map: ???');
    }
    if (world.warden && world.warden.state !== 'sleep' && !world.warden.dead) narration.say('warden_intro');
    if (world.warden && world.warden._blockedOnce) narration.say('warden_block');
    if (state.flags.wardenDefeated && m.petraSpot && nearSpot(m.petraSpot, 2.6)) {
      if (narration.say('stone_complete')) {
        narration.say('luna_dream_2');
        persist();
      }
    }
    if (WS.get('stone', 'restored') && nearXZ(5.5, -5.5, 3.4)) narration.say('wildwoods_open');
  }

  // The Wild Woods (region 3)
  if (state.room[0] === 'w') {
    narration.say('wild_enter');
    if (state.room === 'w1') {
      const th = (world.enemies || []).find((e) => e.constructor.name === 'Hound' && !e.dead);
      if (th && nearXZ(th.x, th.z, 6)) narration.say('thornhound_intro');
    }
    if (state.room === 'w1b' && m.iceSpot && nearSpot(m.iceSpot, 3.2)) {
      if (logMystery('frost_spring', '❄️', 'A spring sealed in ice — the Mossy Dell')) bigToast('🗺️ Added to the map: ???');
      narration.say('gate_promise');
    }
    if (state.room === 'w2') {
      const ls = m.lanternSpots || [];
      if (!WS.get('wild', 'lanterns')) {
        if (ls.some((l) => nearXZ(l.x, l.z, 4.2))) narration.say('lantern_hint');
        if (m.crackSpot && !state.flags.cracked.w2_lantern && nearSpot(m.crackSpot, 3.6)) narration.say('lantern_rock');
      } else {
        narration.say('lantern_open');
      }
    }
    if (state.room === 'w3') {
      if (m.boulderSpot && nearSpot(m.boulderSpot, 4.2)) narration.say('plates2_hint');
      if (state.flags.plates.w3_p1 && state.flags.plates.w3_p2) narration.say('plates2_open');
    }
    if (state.room === 'w4' && m.bossDoorSpot && nearSpot(m.bossDoorSpot, 3.2)) narration.say('wild_boss_door');
    if (state.room === 'w5' && state.flags.sylvaDefeated &&
        m.sylvaShrine && nearSpot(m.sylvaShrine, 2.8)) {
      if (narration.say('wild_complete')) persist();
    }
    if (m.frostWaySpot && nearSpot(m.frostWaySpot, 3.4)) narration.say('frostpeak_open');
  }

  // Frostpeak (region 4)
  if (state.room[0] === 'f') {
    narration.say('frost_enter');
    if (state.room === 'f1') {
      const rh = (world.enemies || []).find((e) => e.constructor.name === 'Hound' && !e.dead);
      if (rh && nearXZ(rh.x, rh.z, 6)) narration.say('rimehound_intro');
    }
    if (state.room === 'f2') {
      const bs = m.brazierSpots || [];
      if (!WS.get('frost', 'braziers')) {
        if (bs.some((b) => nearXZ(b.x, b.z, 4.2))) narration.say('icebrazier_hint');
        // the cold creeping back is the one thing a kid must be TOLD about
        if ((world.braziers || []).some((b) => !b.lit && !b.iced)) {
          sayThrottled('icebrazier_thaw', t, 30);
        }
      } else {
        narration.say('icebrazier_open');
      }
    }
    if (state.room === 'f3') {
      if (m.boulderSpot && nearSpot(m.boulderSpot, 4.6)) narration.say('slide_hint');
      if (state.flags.plates.f3_p1 && state.flags.plates.f3_p2) narration.say('slide_open');
    }
    if (state.room === 'f4' && m.bossDoorSpot && nearSpot(m.bossDoorSpot, 3.2)) narration.say('frost_boss_door');
    if (state.room === 'f5' && state.flags.borealDefeated &&
        m.borealShrine && nearSpot(m.borealShrine, 2.8)) {
      if (narration.say('frost_complete')) persist();
    }
    // every ice block on the mountain is a promise until Boreal falls
    if (m.iceSpot && !state.formsUnlocked.includes('frost_wolf') && nearSpot(m.iceSpot, 3.2)) {
      if (logMystery('frost_ice_' + state.room, '❄️', 'Ice sealing a way — Frostpeak')) bigToast('🗺️ Added to the map: ???');
      narration.say('gate_promise');
    }
    if (state.formsUnlocked.includes('frost_wolf') && m.iceSpot && nearSpot(m.iceSpot, 3.2)) {
      narration.say('shatter_prompt');
    }
  }
  // the first shield-bearer: teach the three ways past a raised shield
  if (state.region === 'stoneroot') {
    const sh = (world.enemies || []).find((e) => e.constructor.name === 'SkeletonShield' && !e.dead);
    if (sh && nearXZ(sh.x, sh.z, 5.5)) narration.say('shield_foe');
  }

  // A4 — THE CONCLUDE STEP. The gift is the answer to the boss: a stomp at the
  // Warden's feet drops his guard. The MECHANIC already worked (a stomp stuns,
  // and shieldUp is false while stunned) — what was missing was any way for a
  // child to find that out. So this teaches it, at the moment it applies:
  // standing in front of a raised shield, holding the wolf that answers it.
  if (m.stompStagger && world.warden && !world.warden.dead) {
    if (world.warden.shieldUp && nearSpot(m.stompStagger, 6) &&
        state.formsUnlocked.includes('earth_wolf')) {
      narration.say('warden_stagger');
    }
    if (player.brokeGuardAt && performance.now() - player.brokeGuardAt < 900) {
      narration.say('guard_broken');
    }
  }

  // Earth Wolf verb prompts (both regions carry cracked rocks)
  if (state.formsUnlocked.includes('earth_wolf') && m.crackSpot &&
      !state.flags.cracked.e1_alcove && nearSpot(m.crackSpot, 3.4)) {
    narration.say('crack_prompt');
  }

  // The Kiln
  if (state.room === 'k1') narration.say('kiln_enter');
  if (state.room === 'ka' && m.shrineSpot) {
    if (nearSpot(m.shrineSpot, 2.4) && !state.formsUnlocked.includes('fire_wolf')) {
      state.formsUnlocked.push('fire_wolf');
      effects.warmFlood();
      narration.say('kiln_shrine');
      narration.say('firewolf_grant');
      narration.say('firewolf_howto');
      ui.refreshBadge();
      bigToast('🔥 The Fire Wolf awakens!');
      persist();
    }
    if (state.formsUnlocked.includes('fire_wolf') && nearXZ(1.8, -2.6, 3)) narration.say('brazier_hint');
  }
  if (state.room === 'kb' && m.orderSpot && nearSpot(m.orderSpot, 4)) narration.say('kiln_order');

  // -------------------------------------------------------------------------
  // LEVEL 2 — THE VAULT CHANGES. Each spoke ends by doing something to the
  // titan; recording it here is the ONLY place a milestone is ever set, and
  // the hub reads WS.stage('vault') when it rebuilds. Nothing about the vault
  // is toggled directly, which is what makes "quit halfway and come back"
  // correct by construction rather than by remembering to handle it.
  // -------------------------------------------------------------------------
  // A spirit's spark grants whatever THAT spirit gives. This used to hardcode
  // the Earth Wolf and the vault's milestone, so walking into Sylva's shrine in
  // Level 3 handed the child the wrong wolf and advanced Level 2's state
  // (fix plan A3). The marker has carried `grants` all along; now it is read.
  if (m.sparkSpot && nearSpot(m.sparkSpot, 2.4)) {
    const gift = m.sparkSpot.grants || 'earth_wolf';
    if (!state.formsUnlocked.includes(gift)) {
      state.formsUnlocked.push(gift);
      effects.warmFlood();
      ui.refreshBadge();
      const SPARK = {
        earth_wolf: { region: 'vault', key: 'spark', toast: '🪨 The Earth Wolf awakens!' },
        verdant_wolf: { region: 'wild3', key: 'spark', toast: '🌿 The Verdant Wolf awakens!' },
      }[gift];
      if (SPARK) { WS.complete(SPARK.region, SPARK.key); bigToast(SPARK.toast); }
      narration.say(gift === 'verdant_wolf' ? 'verdant_grant' : 'earthwolf_grant');
      persist();
    }
  }
  // THE RATTLE: the stomp is not a hammer, it is a SOUND. Standing on the
  // resonant plate and stomping rings the chamber — the bell-stone answers and
  // the dam gives way, which is hub change 2.
  if (m.rattlePlate && !WS.get('vault', 'drained') && nearSpot(m.rattlePlate, 1.9)) {
    narration.say('rattle_hint');
    if (player.stompedAt && performance.now() - player.stompedAt < 400) {
      player.stompedAt = 0;
      juice.shake(0.5, 0.5);
      audio.play('slam', { volume: 1, rate: 0.7 });
      if (WS.complete('vault', 'drained')) bigToast('🔔 Something far away answers…');
      persist();
    }
  }
  // THE SHOULDER PIN: the last thing holding the titan's arm up.
  if (m.pinSpot && !WS.get('vault', 'handDown') && state.flags.cracked.l2_vc3_pin) {
    if (WS.complete('vault', 'handDown')) bigToast('🪨 Far off, something enormous moves.');
    persist();
  }

  // -------------------------------------------------------------------------
  // LEVEL 3 — THE LASH CUTS (fix plan A2a). Introduce, then develop.
  // Prompts only: the cutting itself is world.cutAt, driven by the lash in
  // player.js, so there is no second implementation of the verb here.
  // -------------------------------------------------------------------------
  if (m.teachBramble && nearSpot(m.teachBramble, 4) &&
      state.formsUnlocked.includes('verdant_wolf')) {
    narration.say('bramble_teach');
  }
  if ((m.developBrambles || []).some((b) => nearSpot(b, 4.5))) {
    narration.say('bramble_regrow');
  }
  if (m.logBridge && nearSpot(m.logBridge, 4)) narration.say('log_rope');

  // THE KNOT (A2b) — the lash HOLDS. Prompts only; tetherAt and the snare live
  // in world.js and player.js, so the verb has exactly one implementation.
  if (m.knotTether && nearSpot(m.knotTether, 5) && !state.flags.plates.l3_knot_p1) {
    narration.say('knot_tether');
  }
  if (m.knotSnare && nearSpot(m.knotSnare, 5)) narration.say('knot_snare');

  // A8 — EVERY "come back later" gate in the rebuilt levels, as one table.
  //
  // Six of the eight used to be silent: a child walked up to a wall with a
  // chest plainly visible behind it and got no line from Pip and no ??? on the
  // map, so it read as a dead end rather than as a place to return to. Written
  // as a table rather than six near-identical `if` blocks because that is
  // exactly how the shipping rooms and the rebuilt levels drifted apart in the
  // first place — a new gate now adds one row, and gets the prompt, the map
  // entry and the resolve for free.
  //
  // `done` is the SAME condition the gate itself is built from (js/levelkit.js
  // promiseGate), so a resolved mystery and an opened gate can never disagree.
  for (const p of PROMISES) {
    const spot = m[p.marker];
    if (spot && !p.done() && nearSpot(spot, p.r || 4)) {
      if (logMystery(p.id, p.icon, p.label)) bigToast('🗺️ Added to the map: ???');
      narration.say(p.say || 'gate_promise');
    }
    if (p.done()) resolveMystery(p.id);
  }
  if (m.thornKnot && nearSpot(m.thornKnot, 5)) narration.say('thornknot_hint');
  if (WS.get('wild3', 'knotCut') && state.room === 'tc4') narration.say('woods_bloom');

  // "not yet" gates: log the promise + Pip acknowledges it
  if (m.boulderGateSpot && nearSpot(m.boulderGateSpot, 3) && !state.flags.cracked.em_boulder) {
    if (logMystery('boulder_ember', '🪨', 'A huge boulder — Ember Causeway')) bigToast('🗺️ Added to the map: ???');
    narration.say('gate_promise');
  }
  if (state.flags.cracked.em_boulder) resolveMystery('boulder_ember');
  if (m.waterGateSpot && nearSpot(m.waterGateSpot, 3)) {
    if (logMystery('water_ember', '💧', 'A rushing channel — Cinder Bridges')) bigToast('🗺️ Added to the map: ???');
    narration.say('gate_promise');
  }

  const boss = world.boss;
  if (boss && !boss.defeated) {
    if (state.room === 'f5') {
      // Boreal reads NOTHING like the wolves: she is overhead, so the teach
      // is "throw at her, and hit her hard when she crashes"
      narration.say('boreal_duel');
      if (boss.action === 'windup') narration.say('boreal_dive_tell');
      if (boss.action === 'grounded') narration.say('boreal_grounded');
    } else {
      narration.say('boss_duel'); // it fights like the little wolves — same reads
      if (boss.action === 'crouch') narration.say('boss_charge_tell');
      if (boss.action === 'windup') narration.say('boss_swipe_tell');
      if (boss.action === 'tired') narration.say('boss_tired'); // the collapse
    }
    // the Blood Moon belongs to the Dark Wolf — only nag when it applies
    if (state.form === 'dark_wolf' && state.moonGauge >= 1) {
      narration.say('boss_bloodmoon');
    }
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
  if (shadesNear >= 2 && state.moonGauge >= 1 && state.form === 'dark_wolf') {
    sayThrottled('enemy_group', t, 35); // "moon is full" only nags the wolf
  }

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
  else if ((state.room === 'r3' || state.room === 'w5' || state.room === 'f5') && world.boss && !world.boss.defeated) {
    audio.playMusic('boss-loop', { intro: 'boss-intro' });
  } else if (state.room[0] === 'f') audio.playMusic('stone-deep'); // the cold, high hush (custom track: polish list)
  else if (state.room[0] === 'w') audio.playMusic('causeway'); // woods loop (custom track: polish list)
  else if (state.room[0] === 'k') audio.playMusic('kiln');
  else if (state.room === 'e3') audio.playMusic('stone-deep');
  else if (state.room[0] === 'e') audio.playMusic('region-stone');
  else if (state.flags.bossDefeated) audio.playMusic('ember-calm'); // the healed Hollow sings softly
  else if (state.room === 'r2') audio.playMusic('causeway');
  else audio.playMusic('region-ember');
  audio.setAmbient({ r1: 0.5, r2: 0.75, r3: 0.65, den: 0, e1: 0.3, e2: 0.35, e3: 0.3, k1: 0.8, ka: 0.7, kb: 0.7 }[state.room] ?? 0.5);
}

// ---------------------------------------------------------------------------
// HUD: shards, level + XP bar, active buffs
// ---------------------------------------------------------------------------

function renderShards() {
  const el = document.getElementById('shards');
  el.textContent = `🔸 ${state.shards}`;
  ctxShow(el);
}

function renderLevel() {
  const el = document.getElementById('level-badge');
  el.firstChild.textContent = `Lv ${state.level}`;
  document.getElementById('xp-fill').style.width =
    Math.round((state.xp / xpForLevel(state.level)) * 100) + '%';
  ctxShow(el);
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
  // any wolf form always shows its throw — each wolf has a signature one
  document.getElementById('btn-ranged').classList.toggle(
    'revealed', !!state.spoken.learn_bolt || state.form !== 'knight');
  // jump is a CORE verb (lava gaps, dodges) — always available, never gated
  // behind reaching the geyser lesson. Pip's line there still teaches timing.
  document.getElementById('btn-jump').classList.add('revealed');
  const formsRevealed =
    !!state.spoken.darkwolf_intro || !!state.spoken.dark_nook ||
      state.form !== 'knight' || state.formsUnlocked.includes('fire_wolf');
  document.getElementById('form-badge').classList.toggle('revealed', formsRevealed);
  // the moon gauge rides with the forms: once the wolf exists, the moon waits
  document.getElementById('moon-gauge').classList.toggle('revealed', formsRevealed);
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
  } else if (found >= 9 && state.maxHearts === 7) {
    // all Wild Woods pups → the den is FULL of happy howls
    state.maxHearts = 8;
    player.maxHearts = 8;
    player.healFull();
    effects.warmFlood();
    narration.say('all_pups_wild');
  } else if (found >= 12 && state.maxHearts === 8) {
    // all Frostpeak pups → the den's warmest night yet
    state.maxHearts = 9;
    player.maxHearts = 9;
    player.healFull();
    effects.warmFlood();
    narration.say('all_pups_frost');
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
    // WITNESSED RESTORATION: the crypt blooms glow-moss around the player
    WS.set('stone', 'restored');
    stoneRestorationLive(world);
    narration.say('stone_restore_1');
    setTimeout(() => narration.say('stone_restore_2'), 8000);
    persist(); // form unlock + healed caverns is a save point
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

// CARRY THE CHILD THROUGH THE DOOR.
//
// A transition used to cost three separate things, and only the first was
// obvious: 520ms of black, then player.place() stopping them dead and resetting
// their facing to a fixed per-door angle, then snapCamera() hard-cutting. You
// walked into a doorway with momentum and heading and came out of it standing
// still, pointed wherever the door said, with the camera jumping.
//
// This records what a child had when they crossed so the next room can give it
// straight back. Rooms stay the authoring unit — Zelda, Terranigma and Hollow
// Knight are all room-based underneath — what changes is that the SEAM stops
// announcing itself.
function handoffAt(door) {
  // which way does this doorway run? the wide axis of its trigger box
  const alongX = (door.maxX - door.minX) >= (door.maxZ - door.minZ);
  const cx = (door.minX + door.maxX) / 2, cz = (door.minZ + door.maxZ) / 2;
  const half = (alongX ? door.maxX - door.minX : door.maxZ - door.minZ) / 2;
  const off = alongX ? player.root.position.x - cx : player.root.position.z - cz;
  return {
    alongX,
    // WHERE ALONG THE DOORWAY they crossed. Exit three units left of the arch
    // and you arrive three units left of the arch on the other side. Children
    // track that spatially long before they could describe it — and n/s and
    // w/e doors always pair on the same world axis in this topology, so the
    // offset carries directly. Clamped so nobody arrives inside a wall.
    off: Math.max(-half + 0.5, Math.min(half - 0.5, off)),
    heading: player.root.rotation.y,
    vx: player._vel.x, vz: player._vel.z,
    leadX: camLead.x, leadZ: camLead.z,
  };
}

// HOW HARD SHOULD A DOORWAY BE?
//
// Every doorway in the game used the same 260ms fade in both directions, which
// makes a step between two halves of the Ashfall feel exactly like walking in
// on a boss. A door that always means something ends up meaning nothing.
//
//   within a district — barely a blink. You are still in the same place.
//   between districts — a beat, because the colour and the music change.
//   into a boss arena  — the full ceremony. This is the one that should land.
//
// The rule a five-year-old ends up learning is: if the screen takes its time,
// something is about to happen.
const BOSS_ROOMS = new Set(['le', 'vz', 'tgl', 'r3', 'w5', 'f5']);
function seamMs(from, to) {
  if (BOSS_ROOMS.has(to)) return 300;
  if (regionOf(from) !== regionOf(to)) return 260;
  return sameDistrict(from, to) ? 90 : 170;
}

async function loadRoom(id, entry, handoff = null) {
  transitioning = true;
  const ms = seamMs(state.room, id);
  await fadeTo(1, ms);
  player.clearProjectiles();
  document.getElementById('mg-chip').style.display = 'none'; // room chips never linger
  if (world) world.dispose();
  world = await buildRoom(id, scene);
  world.harness = harness;   // den hosts open mini games through it
  state.room = id;
  state.region = regionOf(id);
  applyRoomMood();
  const at = entry || world.spawn;
  let px = at.x, pz = at.z;
  let angle = at.angle !== undefined ? at.angle : Math.PI;
  if (handoff) {
    if (handoff.alongX) px += handoff.off; else pz += handoff.off;
    // KEEP THEIR OWN HEADING when it broadly agrees with the way the door
    // faces. A child who walks in at a slant should come out at that slant; one
    // who scraped through sideways along a wall gets the door's angle instead,
    // because arriving faced at the wall you just came through is worse than
    // being politely turned.
    const fwd = { x: Math.sin(angle), z: Math.cos(angle) };
    const own = { x: Math.sin(handoff.heading), z: Math.cos(handoff.heading) };
    if (fwd.x * own.x + fwd.z * own.z > 0.17) angle = handoff.heading;   // within ~80°
  }
  player.place(px, pz, angle);
  if (handoff) {
    // momentum survives the seam: they walked in moving, they come out moving
    player._vel.x = handoff.vx; player._vel.z = handoff.vz;
    camLead.set(handoff.leadX, 0, handoff.leadZ);
  }
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
  if (id === 'w5' && world.boss && !world.boss.defeated) narration.say('sylva_intro');
  if (id === 'f5' && world.boss && !world.boss.defeated) narration.say('boreal_intro');
  window.__game = { player, world, state, effects, pip, narration, audio, juice, CONFIG, camera, perf, renderer, WS, persist, resolveRoom, applySave, bigToast }; // debug/testing hook
  await fadeTo(0, ms);
  transitioning = false;
}

// Per-room mood: the caverns run darker (torches carry the light) with a
// deeper background/fog color.
// Which region a room belongs to. The rebuilt levels use their own prefixes
// (l = Level 1, v = Level 2, t = Level 3) alongside the retired ones, and this
// is the single place that knows the mapping — it used to be duplicated as two
// slightly different inline ternaries, one of which had never learned about
// Wild Woods or Frostpeak at all.
function regionOf(id) {
  const r = resolveRoom(id);
  if (r[0] === 'v') return 'stoneroot';
  if (r[0] === 't') return 'wildwoods';
  if (r[0] === 'f') return 'frostpeak';
  if (r[0] === 's') return 'stormreach';
  if (r[0] === 'l') return 'ember_hollow';
  // retired ids that somehow reach here keep their original mapping
  if (r[0] === 'e') return 'stoneroot';
  if (r[0] === 'w') return 'wildwoods';
  return 'ember_hollow';
}

function applyRoomMood() {
  const bg = world.bgColor !== undefined ? world.bgColor : 0x17101f;
  scene.background.setHex(bg);
  scene.fog.color.setHex(bg);
  // a room may recolour the light itself (Frostpeak runs cold; everywhere
  // else keeps the warm ember rig the earlier regions were tuned against)
  const lt = world.lightTint;
  // A LIGHT'S COLOUR IS A HUE, NOT A SWATCH.
  //
  // Each region hands the rig its own district tints for wayfinding — the room's
  // colour temperature tells a child which part of the level they are in before
  // they read a single prop, which is the right idea. But the values handed over
  // are SURFACE colours, chosen to look right lit, and several are very dark:
  // Stoneroot's vaultDark ships floorTint 0x555c68 and wallTint 0x22262e. Used
  // raw as light colours those multiply the whole room down — the key light ran
  // at about a third of its intensity and the hemisphere bounce at a tenth,
  // which is why the Great Vault came out almost unreadable once it had props in
  // it worth seeing.
  //
  // So the HUE is kept and the VALUE is normalised. Wayfinding by colour
  // survives; the room stops being dark by accident. The ground bounce stays
  // deliberately low — it is bounced light — but never black.
  const lit = (hex, want, sat) => {
    tmpCol.setHex(hex).getHSL(tmpHSL);
    return tmpCol.setHSL(tmpHSL.h, Math.max(tmpHSL.s, sat), want);
  };
  hemi.color.copy(lit(lt ? lt.sky : 0xa393b8, 0.62, 0.18));
  hemi.groundColor.copy(lit(lt ? lt.ground : 0x5c4030, 0.30, 0.22));
  key.color.copy(lit(lt ? lt.key : 0xffd2a0, 0.74, 0.22));
}

function snapCamera() {
  camGoal.copy(player.root.position).add(CAM_OFFSET);
  key.position.set(Math.round(player.root.position.x) + KEY_OFFSET.x, KEY_OFFSET.y,
    Math.round(player.root.position.z) + KEY_OFFSET.z);
  key.target.position.set(Math.round(player.root.position.x), 0, Math.round(player.root.position.z));
  key.target.updateMatrixWorld();
  camera.position.copy(camGoal);
  camLook.copy(player.root.position);
  camera.lookAt(camLook.x, 0.6, camLook.z);
}

let deathStreak = 0;
let deathStreakCp = '';

async function respawnAtCheckpoint() {
  transitioning = true;
  // Respawn at the ENTRANCE of the room you fell in (user rule, v3.4) —
  // never sent back through earlier rooms. The room rebuilds (enemies
  // reset) but keys/burns/chests persist as always.
  const room = state.room;
  if (room === deathStreakCp) deathStreak++;
  else { deathStreak = 1; deathStreakCp = room; }
  player.softenDamage = deathStreak >= 3; // quietly go easier after 3 falls
  await fadeTo(1, 500);
  player.clearProjectiles();
  if (world) world.dispose();
  world = await buildRoom(room, scene);
  world.harness = harness;
  state.region = regionOf(room);
  applyRoomMood();
  player.place(world.spawn.x, world.spawn.z, world.spawn.angle);
  player.healFull();
  player.iframes = 1.2;
  for (const c of world.checkpoints) {
    if (state.checkpoint.id === c.id) c.reached = true;
  }
  await setupRoomExtras();
  snapCamera();
  updateMusic();
  narration.say('respawn');
  window.__game = { player, world, state, effects, pip, narration, audio, juice, CONFIG, camera, perf, renderer, WS, persist, resolveRoom, applySave, bigToast };
  await fadeTo(0, 400);
  transitioning = false;
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

let effects = null;
let ui = null;
let menus = null;
const surgeVignetteEl = document.getElementById('surge-vignette');

// THE BLOOD MOON SURGE trigger — tap the full moon gauge (or the special
// button/K in a form with no cooldown special). Guarded so the ceremony can
// never collide with scripted beats, room transitions or menus.
function triggerSurge() {
  if (!player || !world || !effects) return false;
  if (transitioning || paused || menuPaused || narration.blocking) return false;
  // playtest law: the Blood Moon is the DARK WOLF's power — no other form
  // shows the button, hears the nag, or can fire it
  if (state.form !== 'dark_wolf') return false;
  return player.startSurge(effects, world);
}
let titleScene = null;
let menuPaused = false;

// THE MINI GAME HARNESS (js/minigame.js). One instance for the whole game: the
// contract is that only one round can be live at a time, and a single owner is
// the simplest way to make that true rather than merely intended.
const harness = makeHarness();
function wireHarness() {
  const tap = document.getElementById('mg-tap');
  tap.addEventListener('pointerdown', (e) => harness._onTap(e));
  document.getElementById('mg-exit').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); harness.exit();          // ONE TAP, no confirmation (§2)
  });
  document.getElementById('mg-replay').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); harness.replay();        // replaying IS the loop (§2)
  });
  document.getElementById('mg-leave').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); harness.exit(); persist();
  });
  for (const b of ['cub', 'wolf', 'alpha']) {
    document.getElementById('mg-band-' + b).addEventListener('pointerdown', (e) => {
      e.stopPropagation(); harness.chooseBand(b); persist();
    });
  }
}
let shopWasNear = false;
let travelWasNear = false;

async function start() {
  // Assets stream in while the title screen is up.
  player = new Player();
  pip = new Pip();
  const loading = Promise.all([player.load(), pip.load()]);
  document.getElementById('loading').style.display = 'none';

  // The LIVING title: campfire diorama fades in behind the menu once its
  // models are ready, and the 3D avatar portraits render in the background.
  (async () => {
    titleScene = await createTitleScene(renderer);
    document.getElementById('title').classList.add('live');
    // the game loop isn't installed yet — the diorama drives its own until
    // a profile is chosen (then the game loop takes the renderer over)
    const tClock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      if (titleScene) titleScene.render(Math.min(tClock.getDelta(), 0.05));
    });
    await buildPortraits(renderer); // main renderer: one context, one truth
  })().catch((e) => console.warn('title scene skipped:', e));

  document.body.classList.add('titling'); // no gameplay HUD over the title
  const { profile, save } = await showTitle();
  document.body.classList.remove('titling');
  renderer.setAnimationLoop(null); // hand the renderer back to the game
  if (titleScene) { titleScene.dispose(); titleScene = null; }
  document.getElementById('title').classList.remove('live');
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
  player.onParry = (attacker) => {
    juice.onHit('heavy', {
      x: attacker ? attacker.x : player.root.position.x,
      z: attacker ? attacker.z : player.root.position.z,
      color: 0xbfe3ff, // parry sparks ring bright and cold
    });
    narration.say('parry_praise');    // once per save
    bumpCounter('parries');
  };
  player.onHitConnected = (e, killed) => juice.onHit(killed ? 'heavy' : 'medium', {
    x: e ? e.x : player.root.position.x,
    z: e ? e.z : player.root.position.z,
  });
  renderHearts(player);
  renderPotions(player);
  refreshControlReveal();

  effects = new Effects(scene);
  juice.init(scene, effects);
  narration = new Narration();
  ui = new UI({
    onFormPick: (id) => {
      if (player.setForm(id)) { ui.refreshBadge(); audio.play('ui-click', { volume: 0.6 }); }
      else { flashLockedForm(); narration.say('form_locked'); }
    },
    // knight/dark have no cooldown special — a full moon gauge answers instead
    onSpecial: () => { if (!player.trySpecial(effects, world)) triggerSurge(); },
    onSurge: () => triggerSurge(),
  });

  // ORDINARY-SWITCH SPECTACLE: every transformation is a tiny event — a
  // heartbeat of hitstop, a form-colored burst, nearby enemies shoved back
  // (no damage), and a quick camera punch. ~0.5s total, all pooled.
  player.onFormFx = (name) => {
    const P = player.root.position;
    effects.hitStop(CONFIG.SWITCH_FX.STOP);
    effects.punch(CONFIG.SWITCH_FX.PUNCH, CONFIG.SWITCH_FX.PUNCH_T);
    juice.burst(P.x, 0.8, P.z, FORM_BURST[name] || 0xffffff, 14);
    if (world && world.enemies) {
      for (const e of world.enemies) {
        if (e.dead || !e.takeStun || e.scenery || !e.root) continue; // real foes only
        const dx = e.x - P.x, dz = e.z - P.z;
        const d = Math.hypot(dx, dz);
        if (d > CONFIG.SWITCH_FX.PUSH_RADIUS || d < 0.05) continue;
        const s = world.resolveCircle(e.x + (dx / d) * 0.9, e.z + (dz / d) * 0.9, e.radius || 0.3);
        // x/z are getters over root.position — write the root, never the getter
        e.root.position.x = s.x;
        e.root.position.z = s.z;
      }
    }
  };
  player.onDamaged = () => {
    juice.onHurt(player.root.position.x, 0.8, player.root.position.z);
    renderHearts(player);
    if (player.hearts <= player.maxHearts / 2) ctxShow(potionsEl, 5000); // remind: potions exist
    if (player.hearts > 0 && player.hearts <= 2) {
      sayThrottled('low_hearts', timer.getElapsed(), 30);
    }
  };
  wireSettings();
  wireHarness();

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
    audio.fanfare(); // C-E-G-C — a real moment, not a chime
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
  // CONTEXTUAL BUTTONS: the throw belongs to the form, so the button that
  // fires it has to appear and disappear WITH the form, not just at load.
  player.onFormChanged = () => { ui.refreshBadge(); refreshControlReveal(); };
  input.onHold = (x, y, pointerId) => {
    if (transitioning) return false;
    ui.openPicker(x, y, pointerId);
    return true;
  };
  // form button tap = cycle to the next unlocked form
  input.onFormTap = () => {
    if (transitioning) return;
    const unlocked = FORM_CYCLE.filter((f) => state.formsUnlocked.includes(f));
    const next = unlocked[(unlocked.indexOf(state.form) + 1) % unlocked.length];
    if (player.setForm(next)) ui.refreshBadge();
  };

  await buildRoomInitial();
  renderPups();

  document.getElementById('loading').style.display = 'none';

  renderer.setAnimationLoop(() => {
    timer.update();
    const realDt = timer.getDelta();
    const dt = Math.min(realDt, 0.05);
    const t = timer.getElapsed();
    if (!world) {
      if (titleScene) titleScene.render(dt); // the campfire lives behind the menu
      return;
    }

    if (paused || menuPaused) {
      renderer.render(scene, camera);
      perf.sample(realDt, state.room);
      return;
    }

    // A MINI GAME HOLDS THE WORLD STILL. Nothing can hurt a child mid-round —
    // §2 is explicit that there is no death and no fail state — so the den's
    // clock, its villagers and Kael himself all wait while the round plays.
    // The game's own props still animate, because the harness ticks them here.
    if (harness.active) {
      harness.update(dt, t);
      world.animate(t, dt);
      renderer.render(scene, camera);
      perf.sample(realDt, state.room);
      return;
    }

    // Story hints freeze the world while they play (tap the caption to skip)
    if (narration.blocking) {
      renderer.render(scene, camera);
      perf.sample(realDt, state.room);
      return;
    }

    // hit-stop: a solid hit freezes the world for a few frames
    if (effects.hitStopTime > 0) {
      effects.hitStopTime -= realDt;
      renderer.render(scene, camera);
      perf.sample(realDt, state.room);
      return;
    }

    if (!transitioning) {
      // Keyboard shortcuts: Tab cycles forms, K fires the special
      if (input.consumeFormCycle()) {
        const unlocked = FORM_CYCLE.filter((f) => state.formsUnlocked.includes(f));
        const next = unlocked[(unlocked.indexOf(state.form) + 1) % unlocked.length];
        if (player.setForm(next)) ui.refreshBadge();
      }
      if (input.consumeSpecial()) { if (!player.trySpecial(effects, world)) triggerSurge(); }
      if (input.consumeAttack()) player.tryAttack(world, input);
      if (input.consumeRanged()) player.tryRanged(world);
      if (input.consumeJump()) {
        const wasAirborne = player.jumpsUsed >= 1;
        if (player.tryJump() && wasAirborne) bumpCounter('doubleJumps');
      }
      if (input.consumePotion()) player.tryPotion();

      player.update(dt, input, world);
      world.updateBoulders(dt, player);
      pip.update(dt, t, player, world);
      // 🌸 Gentle profiles: the whole enemy world runs at 80% time —
      // slower moves AND longer telegraphs, one lever (CONFIG.DIFFICULTY).
      // effects.timeScale bends it further (the surge morph's slow-motion).
      const edt = (state.settings.easy ? dt * CONFIG.DIFFICULTY.GENTLE_ENEMY_TIME : dt) * effects.timeScale;
      if (world.updateEnemies) world.updateEnemies(edt, t, player);
      if (world.updatePups) world.updatePups(dt, t, player);
      if (world.updateNpcs) world.updateNpcs(dt, t, player); // den villagers + Biscuit
      if (world.updateMinigames) world.updateMinigames(dt, t, player); // den games
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
            bumpCounter('bosses');
            grantXp(60);
            spawnShards(world, world.boss.x, world.boss.z + 1.5, 15); // shard shower
            spawnPowerup(world, world.boss.x, world.boss.z + 2, 'star'); // victory gift
            if (state.room === 'f5') {
              // BOREAL FALLS — the storm lifts off Frostpeak and the Frost
              // Wolf is earned (boss.js set the flags; here is the party)
              audio.playMusic('victory', { loop: false, then: 'den' });
              narration.say('boreal_defeat');
              narration.say('frost_grant');
              narration.say('frost_howto');
              WS.set('frost', 'restored');
              narration.say('frost_restore_1');
              setTimeout(() => narration.say('luna_dream_4'), 9000);
            } else if (state.room === 'w5') {
              // SYLVA FREED — the Wild Woods breathe again, the Verdant
              // Wolf is earned (boss.js set the flags; here is the party)
              audio.playMusic('victory', { loop: false, then: 'den' });
              narration.say('sylva_defeat');
              narration.say('verdant_grant');
              narration.say('verdant_howto');
              WS.set('wild', 'restored');
              narration.say('wild_restore_1');
              setTimeout(() => narration.say('luna_dream_3'), 9000);
            } else {
              if (world.openShortcut) world.openShortcut(); // the way home opens
              audio.playMusic('victory', { loop: false, then: 'ember-calm' });
              narration.say('boss_defeat');
              narration.say('firewolf_grant');
              narration.say('firewolf_howto');
              // WITNESSED RESTORATION (WORLD-DESIGN §3): the Hollow heals
              // around the player, live — green rises, Cinder climbs the ridge.
              WS.set('ember', 'restored');
              emberRestorationLive(world);
              narration.say('restoration_1');
              setTimeout(() => narration.say('restoration_2'), 8000);
            }
            persist(); // form unlock + healed world is a save point
          };
        }
        world.boss.update((state.settings.easy ? dt * CONFIG.DIFFICULTY.GENTLE_ENEMY_TIME : dt) * effects.timeScale, t, player);
      }

      // Door transitions
      const door = world.doorAt(player.root.position.x, player.root.position.z);
      if (door) loadRoom(door.to, door.entry, handoffAt(door));

      // (v3.18: the Echo Chasm drop-hole teleports are gone — dad's law:
      // nothing moves the player without a door they walked through.)

      narrationTriggers(dt, t);
      updateGentleGuide(dt);

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
    juice.update(dt);
    updateDmgNums(realDt);
    updateBossBar();
    ui.update(player);
    // the blood-red vignette breathes with the ceremony + surge
    surgeVignetteEl.style.opacity = String(player.surgeGlow);
    // ranged button dims while on cooldown
    document.getElementById('btn-ranged').style.opacity =
      player.rangedCooldown > 0 ? '0.35' : '1';

    // Smooth camera follow with look-ahead (+ shake + Blood Moon punch-in).
    // The camera leads into the direction of travel; the lead itself is
    // smoothed so stick wiggles don't jitter the frame.
    const topSpeed = player.form ? player.form.def.speed : 5;
    const vf = Math.min(1, Math.hypot(player._vel.x, player._vel.z) / topSpeed);
    const leadK = 1 - Math.exp(-CONFIG.LOOKAHEAD_SMOOTH * dt);
    camLead.x += ((player._vel.x / topSpeed) * CONFIG.LOOKAHEAD_DIST * vf - camLead.x) * leadK;
    camLead.z += ((player._vel.z / topSpeed) * CONFIG.LOOKAHEAD_DIST * vf - camLead.z) * leadK;
    const k = 1 - Math.exp(-CONFIG.CAM_DAMPING * dt);
    camGoal.copy(player.root.position).add(camLead).addScaledVector(CAM_OFFSET, 1 - 0.14 * effects.zoom);

    // the shadow box rides with Kael (see the light rig above). Snapped to
    // whole units so the depth map's texel grid does not crawl underneath
    // static geometry as he walks — an unsnapped shadow camera makes every
    // stationary shadow edge shimmer.
    const sx = Math.round(player.root.position.x), sz = Math.round(player.root.position.z);
    key.position.set(sx + KEY_OFFSET.x, KEY_OFFSET.y, sz + KEY_OFFSET.z);
    key.target.position.set(sx, 0, sz);
    key.target.updateMatrixWorld();
    camera.position.lerp(camGoal, k);
    _lookTarget.copy(player.root.position).add(camLead);
    camLook.lerp(_lookTarget, k);
    camera.position.add(effects.shakeOffset);
    camera.lookAt(camLook.x + effects.shakeOffset.x, 0.6, camLook.z + effects.shakeOffset.z);

    key.position.set(player.root.position.x + 6, 13, player.root.position.z + 8);
    key.target.position.copy(player.root.position);

    renderer.render(scene, camera);
    perf.sample(realDt !== undefined ? realDt : 0.016, state.room);
  });
}

async function buildRoomInitial() {
  world = await buildRoom(state.room, scene);
  world.harness = harness;
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
  window.__game = { player, world, state, effects, pip, narration, audio, juice, CONFIG, camera, perf, renderer, WS, persist, resolveRoom, applySave, bigToast };
}

// Settings (pause menu) — wired to state.settings; persisted in Phase 9.
function wireSettings() {
  const music = document.getElementById('music-vol');
  const sfx = document.getElementById('sfx-vol');
  const captions = document.getElementById('captions-toggle');
  const voice = document.getElementById('voice-toggle');
  // 🌸 Gentle vs 🦁 Brave: per-profile, mutually exclusive (both off = Cozy)
  const brave = document.getElementById('brave-toggle');
  const gentle = document.getElementById('gentle-toggle');
  brave.checked = !!state.settings.brave;
  gentle.checked = !!state.settings.easy;
  brave.addEventListener('change', () => {
    state.settings.brave = brave.checked;
    if (brave.checked) { state.settings.easy = false; gentle.checked = false; }
    persist();
  });
  gentle.addEventListener('change', () => {
    state.settings.easy = gentle.checked;
    if (gentle.checked) { state.settings.brave = false; brave.checked = false; }
    persist();
  });
  // --- the voice chooser ---------------------------------------------------
  const vpick = document.getElementById('voice-pick');
  const vrow = document.getElementById('voice-pick-row');
  const vrate = document.getElementById('voice-rate');
  const refreshVoiceBtn = () => {
    const names = narration.voiceNames ? narration.voiceNames() : [];
    vrow.style.display = names.length > 1 ? '' : 'none';
    vpick.textContent = names.length ? narration.voiceLabel() + ' ▸' : '—';
  };
  vpick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    narration.nextVoice();          // speaks a sample with the new voice
    refreshVoiceBtn();
    persist();
  });
  // the device usually reports its voices asynchronously, so the row is
  // refreshed once they land rather than only at open
  if ('speechSynthesis' in window) {
    speechSynthesis.addEventListener('voiceschanged', refreshVoiceBtn);
  }
  refreshVoiceBtn();
  vrate.value = state.settings.voiceRate || 1;
  vrate.addEventListener('input', () => {
    state.settings.voiceRate = +vrate.value;
    persist();
  });
  // release rather than input: sampling on every step of the drag would stack
  // a dozen utterances
  vrate.addEventListener('change', () => { if (narration.sampleVoice) narration.sampleVoice(); });

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
  // ONE master switch for all of Pip's talking (voice + captions together) —
  // flipping it off also cuts the line that is playing RIGHT NOW.
  const talk = document.getElementById('talk-toggle');
  const syncTalk = () => { talk.checked = state.settings.captions || state.settings.voice; };
  syncTalk();
  const silenceNow = () => {
    narration.queue.length = 0;               // drop everything waiting
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    narration.skip();                          // end the current line cleanly
  };
  talk.addEventListener('change', () => {
    state.settings.captions = talk.checked;
    state.settings.voice = talk.checked;
    captions.checked = talk.checked;
    voice.checked = talk.checked;
    if (!talk.checked) silenceNow();
    persist();
  });
  captions.addEventListener('change', () => { state.settings.captions = captions.checked; syncTalk(); persist(); });
  voice.addEventListener('change', () => {
    state.settings.voice = voice.checked;
    if (!voice.checked && 'speechSynthesis' in window) speechSynthesis.cancel();
    syncTalk();
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
