// Wolf Knight — bootstrap + main loop.
// Phase 2: the three Ember Hollow rooms with door transitions, checkpoints,
// the dark nook (real-lighting darkness), geysers, and burnable props.
// Rooms rebuild on every entry (anti-soft-lock reset).

import * as THREE from 'three';
import { manager } from './assets.js';
import { Input } from './input.js';
import { buildRoom } from './rooms.js';
import { onwardSpot, nextRoom } from './route.js';
import { sameDistrict } from './districts.js';
import { makeHarness } from './minigame.js';
import { FETCH } from './mg-fetch.js';
import { Player } from './player.js';
import { state, resolveRoom, regionCleared } from './state.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { Pip, spawnPups } from './pip.js';
import { audio } from './audio.js';
import { Narration } from './narration.js';
import { applySave, persist, setSaveErrorHandler } from './save.js';
import { showTitle } from './title.js';
import { preloadLoot, spawnBreakables, spawnChests, spawnShards, updateShards, updateChests, lootEvents, preloadPotionDrop, spawnPotionDrop } from './loot.js';
import { spawnPowerup, updatePowerups, updateBuffVisuals, powerupEvents, POWERUPS } from './powerups.js';
import { progressEvents, xpForLevel, bumpCounter, checkStickers, grantXp } from './progress.js';
import { addGear, WEAPONS, SHIELDS, ARMOURS } from './items.js';
import { Menus, bigToast } from './menus.js';
import { CONFIG } from './config.js';
import { WS, logMystery, resolveMystery } from './worldstate.js';
import { perf } from './perf.js';
import { juice } from './juice.js';
import { validateRegions } from './regions.js';
import { createTitleScene, buildPortraits } from './titlescene.js';
import { emberRestorationLive, stoneRestorationLive } from './rooms.js';

const FORM_CYCLE = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

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
  const total = regionCleared('wildwoods') ? 12
    : regionCleared('stoneroot') ? 9 : regionCleared('ember') ? 6 : 3;
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

// STUCK HINTS, KEYED ON WHAT THE ROOM PUBLISHES — NOT ON ROOM IDS.
//
// The four that used to be here named r1, r2 and e2, all retired, with raw
// coordinates from rooms that no longer exist. They had been dead since the
// levels were rebuilt: a child standing at a gate they could finally open was
// told nothing at all.
//
// Every promise gate in the game already publishes a marker saying which verb
// opens it, in all six rebuilt regions. So the rule is one rule: if you are
// lingering at a gate, and you now own the wolf that opens it, the game says so
// — wherever that gate happens to be. A new gate in a new region is covered the
// day it publishes its marker, with nothing to remember.
const GATE_HINTS = [
  { marker: 'firePromise',       form: 'fire_wolf',    line: 'burn_prompt' },
  { marker: 'crackPromise',      form: 'earth_wolf',   line: 'crack_prompt' },
  // THE PILES A CHILD ACTUALLY MEETS. The rebuilt regions publish these three,
  // and not one of them had a hint — so standing at the very rock the level
  // wants you to break, the game said nothing at all. Only `crackPromise`, a
  // marker from a retired Level 1 room, was ever covered.
  { marker: 'teachCrack',        form: 'earth_wolf',   line: 'crack_prompt' },
  { marker: 'practiceCracks',    form: 'earth_wolf',   line: 'crack_prompt' },
  { marker: 'developCracks',     form: 'earth_wolf',   line: 'crack_prompt' },
  // Stoneroot is played with FIRE now — earth is its boss's reward.
  { marker: 'pinSpot',           form: 'fire_wolf',    line: 'pin_hint' },
  { marker: 'rattlePlate',       form: 'fire_wolf',    line: 'rattle_hint' },
  { marker: 'relightSpot',       form: 'fire_wolf',    line: 'brazier_hint' },
  { marker: 'bramblePromise',    form: 'verdant_wolf', line: 'bramble_teach' },
  { marker: 'thornPromise',      form: 'verdant_wolf', line: 'thornknot_hint' },
  { marker: 'rootWallPromise',   form: 'verdant_wolf', line: 'rootwall_hint' },
  { marker: 'logPromise',        form: 'verdant_wolf', line: 'greatlog_hint' },
  { marker: 'icePromise',        form: 'frost_wolf',   line: 'shatter_prompt' },
  { marker: 'galePromise',       form: 'storm_wolf',   line: 'storm_gale_promise' },
  { marker: 'tidePromise',       form: 'tide_wolf',    line: 'tide_quench' },
  { marker: 'deepPromise',       form: 'tide_wolf',    line: 'tide_howto' },
  { marker: 'ghostPromise',      form: 'ghost_wolf',   line: 'ghost_howto' },
  { marker: 'watcherPromise',    form: 'ghost_wolf',   line: 'court_watcher' },
  // Not every promise is a wolf. The vault's sunken chest is under water until
  // the ring DRAINS — no form opens it, so the honest line is the one that says
  // "later", not one that implies a verb the child has and should be using.
  { marker: 'underwaterPromise', form: null,           line: 'gate_promise' },
];

const stuckHints = GATE_HINTS.map((g) => ({
  line: g.line, timer: 0, cond: () => {
    const spot = world.markers && world.markers[g.marker];
    if (!spot) return false;
    if (g.form && !state.formsUnlocked.includes(g.form)) return false;
    return nearSpot(spot, 4);
  },
})).concat([
  { line: 'boss_duel', timer: 0, cond: () =>
      !!world.boss && !world.boss.defeated },
]);

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
// The way forward per room.
//
// THIS USED TO BE THE WHOLE ANSWER, AND EVERY ROOM IN IT IS RETIRED. The switch
// below names r1, r2, k1, e1, w1… — the rooms the rebuilt levels replaced. Five
// of the seven regions a child plays had no entry, so Pip had nowhere to run
// and the one system meant to rescue a lost child did nothing at all.
//
// js/route.js answers it properly now: it stores which room is NEXT and asks
// the room where that door is, so moving a door moves the guide with it. The
// switch is kept underneath for Frostpeak, which is still the old build, and
// for the Den — and it will shrink to nothing as the last rooms are rebuilt.
function guideTarget() {
  // LEVEL 2 — the way on from a spoke's last room is an ACTION on an object, not
  // a door. Until the lantern is lit / the plate rung / the pin burned, send Pip
  // TO that object; `onwardSpot` would otherwise trot him back to the hub past
  // the very thing the child came to do — and the trail LEADING AWAY from the
  // objective is what turned dad's seven-year-old's Spoke C into a loop. Once the
  // milestone lands, these fall through and the door target takes over.
  const vm = world.markers || {};
  if (vm.relightSpot && !WS.get('vault', 'spark'))   return { x: 0, z: -1.1 };  // the cold lantern
  if (vm.rattlePlate && !WS.get('vault', 'drained')) return { x: vm.rattlePlate.x, z: vm.rattlePlate.z };
  if (vm.pinSpot && !WS.get('vault', 'handDown'))    return { x: vm.pinSpot.x, z: vm.pinSpot.z };
  // FROSTPEAK'S PUZZLE ROOMS, same law. These two cases existed below the
  // switch for years and were DEAD CODE: onwardSpot() answered first (route.js
  // maps f2→f3, f3→f4), so a stuck child was walked to the SEALED ice gate —
  // which, one room after "Ice sealing a way… we'll come back" taught them
  // that ice means frost, manufactured dad's "you need the frost wolf to
  // proceed" read. The action beats the door here too.
  if (state.room === 'f2' && !WS.get('frost', 'braziers')) return { x: 0, z: -4.2 };  // the middle brazier
  if (state.room === 'f3' && !(state.flags.plates.f3_p1 && state.flags.plates.f3_p2)) {
    return { x: -7.0, z: 1.6 };                                                       // the west boulder
  }
  const onward = onwardSpot(world);
  if (onward) return onward;
  const f = state.flags;
  switch (state.room) {
    case 'den': return { x: 0, z: 7.4 };    // stairs up to the Hollow (south gate)
    case 'f1': return { x: 0, z: -5.6 };    // deeper: the Icebound Hall
    case 'f1b': return { x: -2.2, z: -3.4 }; // the pup by the cairn
    case 'f2': return { x: 0, z: -6.4 };    // braziers lit → the opened gate
    case 'f2b': return { x: 4.4, z: -3.2 };
    case 'f3': return { x: 0, z: -6.4 };    // plates pressed → the opened gate
    case 'f4': return { x: 0, z: -5.6 };    // the summit door
    case 'f5': return f.borealDefeated ? { x: 6.4, z: -6.0 } : { x: 0, z: -1.0 };
    default: return null;
  }
}
function updateGentleGuide(dt) {
  // IT USED TO REQUIRE GENTLE MODE, WHICH IS OFF UNLESS A PARENT FINDS IT.
  // `settings.easy` is not in the defaults, so this returned on the first line
  // for every child who ever played. Being lost is not a difficulty setting —
  // Gentle changes what enemies do, and showing a stuck child the way is not
  // that. It runs for everyone now, after the same 20 seconds of no progress
  // at all; a child who is exploring is making progress and never sees it.
  if (pip.guiding || transitioning) return;
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
  if (m.geyserSpots && m.geyserSpots.some((g) => nearSpot(g, 5))) narration.say('learn_jump');
  // the FIRST full moon: Pip teaches the surge — but the Blood Moon is the
  // DARK WOLF's power, so the teach (and the ready-nag) only speak to the wolf
  if (state.form === 'dark_wolf' && state.moonGauge >= 1 &&
      !player.surging && !player.ceremonyActive) narration.say('moon_full');
  refreshControlReveal();

  if (state.room === 'la') {
    if (state.flags.bossDefeated) narration.say('lava_cooled');
    const shade = (world.enemies || []).find((e) => e.constructor.name === 'Shade' && !e.dead);
    if (shade && nearXZ(shade.x, shade.z, 5.5)) narration.say('first_enemy');
    // Dark Wolf is Luna's gift from minute one — introduce it ON the critical
    // path (right after the first victory), not just at the optional dark nook
    if ((state.counters.kills || 0) >= 1) narration.say('darkwolf_intro');
    if (m.darkNookMouth && nearSpot(m.darkNookMouth, 2.4)) narration.say('dark_nook');
    // the fire gate's prompts moved to GATE_HINTS, which finds it by marker
    if (!state.formsUnlocked.includes('fire_wolf') && m.firePromise && nearSpot(m.firePromise, 3))
      narration.say('obstacle_first');
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

  if (state.room === 'lb') {
    const moth = (world.enemies || []).find((e) => e.constructor.name === 'Moth' && e.state === 'telegraph');
    if (moth) narration.say('moth_intro');
    if (!state.flags.keys.ember && m.sealSpot && nearSpot(m.sealSpot, 2.6)) narration.say('key_door');
    if (m.geyserSpots && m.geyserSpots.some((g) => nearSpot(g, 3.2))) narration.say('geyser_intro');
    if (m.branchMouth && nearSpot(m.branchMouth, 2.6)) narration.say('hound_branch');
    if (m.bossDoorSpot && nearSpot(m.bossDoorSpot, 2.4)) narration.say('boss_door');
  }

  // Stoneroot Caverns
  if (state.room === 'vh') {
    narration.say('stone_enter');
    if (m.rippleShoots && nearSpot(m.rippleShoots, 2.6)) narration.say('ripple_shoot');
    if (m.campSpot && nearSpot(m.campSpot, 3)) {
      narration.say(WS.get('stone', 'restored') ? 'camp_healed' : 'camp_rumour');
    }
    const skel = (world.enemies || []).find((e) => e.constructor.name === 'SkeletonMinion' && !e.dead);
    if (skel && nearXZ(skel.x, skel.z, 4.6)) narration.say('skeleton_intro');
  }
  if (state.room === 'vb1') {
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
    if (m.wardenSpot && nearSpot(m.wardenSpot, 3)) narration.say('warden_door');
  }
  if (state.room === 'va1') narration.say('darkcave_enter');
  if (state.room === 'vbp') {
    narration.say('quarry_enter');
    if (world.quarryCleared && world.quarryCleared()) narration.say('quarry_clear');
  }
  if (state.room === 'vz') {
    if (m.wildwoodsWay && nearSpot(m.wildwoodsWay, 3)) {
      narration.say('ripple_vine');
      if (logMystery('wildwoods_way', '🌿', 'A vine through the stone — the way onward')) bigToast('🗺️ Added to the map: ???');
    }
    if (world.warden && world.warden.state !== 'sleep' && !world.warden.dead) narration.say('warden_intro');
    if (world.warden && world.warden._blockedOnce) narration.say('warden_block');
    if (WS.get('stone', 'restored') && nearXZ(5.5, -5.5, 3.4)) narration.say('wildwoods_open');
  }

  // ---- THE THREE REGION-COMPLETION LINES ---------------------------------
  //
  // All three used to hang off a RETIRED room id plus a marker only that
  // retired room's builder publishes, so none of them could fire on the
  // shipping path: `r3` + exitSpot, `e3` + petraSpot, `w5` + sylvaShrine, while
  // RETIRED_ROOMS redirects r3→le, e3→vz, w5→tgl. They are keyed now to the
  // spirit each one is ABOUT — the marker the rebuilt arena really publishes —
  // and to the boss flag, which is what "complete" has always meant.
  if (state.flags.bossDefeated && resolveRoom(state.room) === 'le' &&
      m.heroSpot && nearSpot(m.heroSpot, 2.6)) {
    // Cinder's cage: `le` is the only Level 1 room whose heroSpot is the cage,
    // and the boss flag is what opens its doors, so the room guard stays.
    if (narration.say('region_complete')) {
      narration.say('grimm_taunt_1');
      narration.say('luna_dream_1');
      persist();                 // region complete is a save point
      showCompleteScreen();
    }
  }
  if (state.flags.wardenDefeated && m.petraSpot && nearSpot(m.petraSpot, 2.6)) {
    if (narration.say('stone_complete')) {
      narration.say('grimm_taunt_2');
      narration.say('luna_dream_2');
      persist();
    }
  }
  if (state.flags.sylvaDefeated && m.sylvaSpot && nearSpot(m.sylvaSpot, 3.0)) {
    if (narration.say('wild_complete')) persist();
  }

  // The Wild Woods (region 3). The rebuilt rooms are t-prefixed; this block
  // gated on the RETIRED 'w' prefix, so Pip never introduced region 3 at all
  // (and the hound line watched t1a while the first hounds live in t1b).
  if (state.room[0] === 't') {
    narration.say('wild_enter');
    if (state.room === 't1b') {
      const th = (world.enemies || []).find((e) => e.constructor.name === 'Hound' && !e.dead);
      if (th && nearXZ(th.x, th.z, 6)) narration.say('thornhound_intro');
    }
    if (state.room === 't1p' && m.iceSpot && nearSpot(m.iceSpot, 3.2)) {
      if (logMystery('frost_spring', '❄️', 'A spring sealed in ice — the Mossy Dell')) bigToast('🗺️ Added to the map: ???');
      narration.say('gate_promise');
    }
    if (state.room === 't2a') {
      const ls = m.lanternSpots || [];
      if (!WS.get('wild', 'lanterns')) {
        if (ls.some((l) => nearXZ(l.x, l.z, 4.2))) narration.say('lantern_hint');
        if (m.crackSpot && !state.flags.cracked.w2_lantern && nearSpot(m.crackSpot, 3.6)) narration.say('lantern_rock');
      } else {
        narration.say('lantern_open');
      }
    }
    if (state.room === 't3a') {
      if (m.boulderSpot && nearSpot(m.boulderSpot, 4.2)) narration.say('plates2_hint');
      if (state.flags.plates.w3_p1 && state.flags.plates.w3_p2) narration.say('plates2_open');
    }
    if (state.room === 't4a' && m.bossDoorSpot && nearSpot(m.bossDoorSpot, 3.2)) narration.say('wild_boss_door');
    // (`wild_complete` used to be triggered here, on `w5` + sylvaShrine — both
    // retired. It lives with the other two completion lines above.)
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
        // throttled, not once-per-save: the melt-then-light chain is the whole
        // room, and a child who missed the line must hear it again (45s apart)
        if (bs.some((b) => nearXZ(b.x, b.z, 4.2))) sayThrottled('icebrazier_hint', t, 45);
        // ...and the sealed door itself explains what it answers to — the
        // antidote to reading every ice wall as "come back with the frost wolf"
        if (m.frostDoorSpot && nearSpot(m.frostDoorSpot, 3.4)) sayThrottled('frostdoor_bowls', t, 40);
        // the cold creeping back is the one thing a kid must be TOLD about
        if ((world.braziers || []).some((b) => !b.lit && !b.iced)) {
          sayThrottled('icebrazier_thaw', t, 30);
        }
      } else {
        narration.say('icebrazier_open');
      }
    }
    if (state.room === 'f3') {
      if (m.boulderSpot && nearSpot(m.boulderSpot, 4.6)) sayThrottled('slide_hint', t, 45);
      if (m.frostDoorSpot && !(state.flags.plates.f3_p1 && state.flags.plates.f3_p2) &&
          nearSpot(m.frostDoorSpot, 3.4)) sayThrottled('frostdoor_plates', t, 40);
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
  if (state.room === 'ld') narration.say('kiln_enter');
  if (state.room === 'ld' && m.shrineSpot) {
    // THE SHRINE PROMISES; THE BOSS PAYS. Dad: "each wolf form should be
    // locked behind a boss battle. you complete the boss battle and get
    // awarded the new wolf transformation." The Kiln's shrine granted fire the
    // moment a child brushed it, three rooms before the Shadowgrip — so the
    // grant moved to the boss (see the watcher below) and the shrine is the
    // promise of it: cold, waiting, naming the fight ahead.
    if (nearSpot(m.shrineSpot, 2.4) && !state.formsUnlocked.includes('fire_wolf')) {
      narration.say('kiln_shrine');
    }
    if (state.formsUnlocked.includes('fire_wolf') && nearXZ(1.8, -2.6, 3)) narration.say('brazier_hint');
  }
  // FIRE IS THE SHADOWGRIP'S REWARD. boss.js sets the flag; the ceremony lives
  // here where the toast, the narration and the HOWTO all are — and because it
  // watches the FLAG rather than the kill frame, a save from the shrine era
  // (which already has fire) passes straight through, and an old save that
  // somehow beat the boss without fire is repaired the moment it loads.
  if (state.flags.bossDefeated && !state.formsUnlocked.includes('fire_wolf')) {
    state.formsUnlocked.push('fire_wolf');
    effects.warmFlood();
    narration.say('firewolf_grant');
    narration.say('firewolf_howto');
    ui.refreshBadge();
    bigToast('🔥 The Fire Wolf awakens!');
    persist();
  }
  if (state.room === 'ld1' && m.orderSpot && nearSpot(m.orderSpot, 4)) narration.say('kiln_order');

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
  if (m.sparkSpot && nearSpot(m.sparkSpot, 2.4) && m.sparkSpot.grants) {
    // NO DEFAULT. `grants` used to fall back to 'earth_wolf', which is exactly
    // how a marker with a typo would quietly hand out the wrong wolf. A shrine
    // that grants nothing says nothing.
    const gift = m.sparkSpot.grants;
    if (!state.formsUnlocked.includes(gift)) {
      state.formsUnlocked.push(gift);
      effects.warmFlood();
      ui.refreshBadge();
      const SPARK = {
        earth_wolf: { region: 'vault', key: 'spark', toast: '🪨 The Earth Wolf awakens!' },
        verdant_wolf: { region: 'wild3', key: 'spark', toast: '🌿 The Verdant Wolf awakens!' },
        storm_wolf: { region: 'storm', key: 'spark', toast: '🌩️ The Storm Wolf awakens!' },
        tide_wolf: { region: 'vale', key: 'spark', toast: '🌊 The Tide Wolf awakens!' },
        ghost_wolf: { region: 'court', key: 'spark', toast: '👻 The Ghost Wolf awakens!' },
      }[gift];
      if (SPARK) { WS.complete(SPARK.region, SPARK.key); bigToast(SPARK.toast); }
      narration.say({ verdant_wolf: 'verdant_grant', storm_wolf: 'storm_grant', tide_wolf: 'tide_grant', ghost_wolf: 'ghost_grant' }[gift] || 'earthwolf_grant');
      // AND HOW TO HOLD IT. Dad, an adult, on Stoneroot: "tell me how I'm meant
      // to get through level two. I honestly don't know how or what to do."
      //
      // This was three `if`s naming three forms. Storm, tide and ghost were
      // told how their wolf works; EARTH AND VERDANT WERE NOT — and the earth
      // line is the only place in the entire game that says the thing you
      // cannot play without: HOLD THE SCREEN TO CHANGE FORM. It existed, it was
      // written, and it was wired to the retired Bone-Warden path, which on the
      // rebuilt route you reach after the boss you needed it to get to.
      //
      // So Stoneroot handed a child the Earth Wolf, said "The Earth Wolf
      // awakens!", and never mentioned that they could become it, that the
      // round button was now a stomp, or that a stomp breaks cracked rock —
      // which is the whole region. A table, so a form cannot be added without
      // one, and every grant teaches its own verb.
      const HOWTO = {
        fire_wolf: 'firewolf_howto', earth_wolf: 'earthwolf_howto',
        verdant_wolf: 'verdant_howto', frost_wolf: 'frost_howto',
        storm_wolf: 'storm_howto', tide_wolf: 'tide_howto', ghost_wolf: 'ghost_howto',
      };
      if (HOWTO[gift]) narration.say(HOWTO[gift]);
      persist();
    }
  }
  // THE FOUR RELICS OF THE SHADOW COURT — and the reason the game could not be
  // finished.
  //
  // js/level7.js builds a relic on its pedestal at the end of each of the four
  // wings, pushes it on to `world.markers.relicSpots`, and that is where it
  // stopped: nothing in the game ever read that marker, and nothing anywhere
  // ever wrote `relic_*` into the Court's world state. So `relicCount()` was
  // permanently zero, `buildXh` never cut its north gap (level7.js:404), never
  // built the door to the throne stair (:421) and walled the arch instead
  // (:451) — which means `xst` was unreachable, and `xth` with Shadow-Grimm in
  // it is a door target from `xst` alone. The last boss of the game could not
  // be walked to by any route.
  //
  // Every suite passed because every suite that visits a room goes there by id.
  // Walking is what nobody did.
  if (m.relicSpots) {
    for (const r of m.relicSpots) {
      if (WS.get('court', 'relic_' + r.name)) continue;
      if (!nearSpot(r, 1.9)) continue;
      WS.set('court', 'relic_' + r.name, true);
      if (r.gem) r.gem.visible = false;
      if (r.light) r.light.intensity = 0;
      effects.warmFlood();
      effects.shake(0.4, 0.45);
      audio.play('checkpoint', { volume: 0.9 });
      const LEFT = 4 - ['ember', 'thorn', 'tide', 'moon']
        .filter((n) => WS.get('court', 'relic_' + n)).length;
      bigToast(LEFT ? `🔮 A relic! ${4 - LEFT} of 4.` : '🔮 The last relic! The throne stair opens…');
      narration.say(LEFT ? 'court_relic' : 'court_relic_last');
      persist();
    }
  }
  // PETRA'S LANTERN: the fire slam lights it, and the vault wakes. This is
  // Stoneroot's first milestone under boss-earned forms — solved with the wolf
  // the LAST boss gave you. The brazier machinery does the lighting; this is
  // only the ceremony, in the one file where toast and narration live.
  if (m.relightSpot && !WS.get('vault', 'spark')) {
    const lb = (world.braziers || []).find((b2) => b2.id === 'l2_lantern');
    if (lb && lb.lit) {
      if (WS.complete('vault', 'spark')) bigToast('\u{1F3EE} The lantern blazes! Far away, doors grind open\u2026');
      narration.say('lantern_lit');
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
      // effects.shake, NOT juice.shake — juice has no shake and never has. This
      // line threw every time a child stomped on the rattle plate, and it threw
      // BEFORE the milestone below it, so Stoneroot's dam could not be brought
      // down by playing the game: stage 2 of the hub was unreachable. It is the
      // sort of typo that cannot survive being run once, which is exactly what
      // it never was — every suite that needed `drained` set the flag directly.
      effects.shake(0.5, 0.5);
      audio.play('slam', { volume: 1, rate: 0.7 });
      if (WS.complete('vault', 'drained')) bigToast('🔔 Something far away answers…');
      persist();
    }
  }
  // THE SHOULDER PIN: the last thing holding the titan's arm up. It is a CHARRED
  // post standing dead-centre of Spoke C's last room, and burning it is what
  // opens the crypt back in the hub — but a rock-pile silhouette reads as an
  // EARTH-stomp target, the one wolf the child does NOT have yet (it is the
  // boss's reward). So the moment they walk up to it, Pip names the fire verb —
  // the same immediate nudge the rattle plate gets — instead of leaving them to
  // linger 22 seconds for the stuck-hint. Without this a child does Spoke C,
  // never realises the post is theirs to burn, and loops back to the hub: the
  // exact "new rooms just loop back with nothing to do" dad reported.
  if (m.pinSpot && !WS.get('vault', 'handDown')) {
    if (state.formsUnlocked.includes('fire_wolf') && nearSpot(m.pinSpot, 3.2)) narration.say('pin_hint');
    if (state.flags.burned.l2_vc3_pin) {
      if (WS.complete('vault', 'handDown')) bigToast('🪨 Far off, something enormous moves.');
      persist();
    }
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

  // (`region_complete` used to be triggered here, on `exitSpot` — a marker that
  // exists in exactly one place in the codebase, `buildR3`, which is retired.
  // It lives with the other two completion lines above.)

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
  // BOSS MUSIC, FROM THE ONE LIST THAT KNOWS WHICH ROOMS ARE BOSS ROOMS.
  //
  // This used to name r3, w5 and f5 — and r3 and w5 are RETIRED. The rooms the
  // kids actually fight in are le, vz and tgl, so the rebuilt Ember, Stoneroot
  // and Wild Woods bosses have been fighting to region music this whole time,
  // and the three new ones would have joined them. BOSS_ROOMS is the same set
  // the doorway timing uses, so a new arena can never again be a boss room for
  // one system and an ordinary room for the other.
  if (state.room === 'den') audio.playMusic('den');
  // ...and `world.warden` counts. The Bone Warden is the one boss that is not
  // stored as world.boss — Stoneroot's arena has been playing region music
  // through the whole fight because of it.
  else if (BOSS_ROOMS.has(state.room)
    && ((world.boss && !world.boss.defeated) || (world.warden && !world.warden.dead))) {
    audio.playMusic('boss-loop', { intro: 'boss-intro' });
  }
  // REGIONS 5-7. Five distinct loops exist for seven regions, so reuse is
  // forced — but it is arranged so no two ADJACENT regions share one, which is
  // the only part a child can actually notice. Frostpeak has stone-deep, so
  // Stormreach takes causeway; the Vale takes region-stone; the Court takes
  // stone-deep again, four regions later. All three are placeholders and want
  // their own track (polish list, same as the woods and the cold hush).
  // THE REBUILT LEVELS WERE NEVER ROUTED. This whole chain keyed off the OLD
  // room ids — e for Stoneroot, w for the Wild Woods — and the rebuilt levels
  // use v and t. So the rebuilt Stoneroot and Wild Woods, which are the levels
  // the kids actually play, have been falling through to Ember Hollow's loop
  // since the day they were built. Nothing was ever checking.
  else if (state.room[0] === 'v') audio.playMusic('region-stone');   // Stoneroot, rebuilt
  else if (state.room[0] === 't') audio.playMusic('causeway');       // Wild Woods, rebuilt
  else if (state.room[0] === 's') audio.playMusic('causeway');
  else if (state.room[0] === 'd' && state.room !== 'den') audio.playMusic('region-stone');
  else if (state.room[0] === 'x') audio.playMusic('stone-deep');
  else if (state.room[0] === 'f') audio.playMusic('stone-deep'); // the cold, high hush (custom track: polish list)
  // THE KILN HAD NO BRANCH AT ALL. This read `state.room[0] === 'k'`, and the
  // k-rooms are RETIRED — the live Kiln is ld/ld1/lg4 inside the rebuilt Level 1.
  // So the one district in the game with its own track has been playing the
  // ordinary Ember loop. Now that loadRoom resolves the id (Q6), every retired
  // branch below it was provably dead, so they are gone rather than left to rot.
  else if (state.room === 'ld' || state.room === 'ld1' || state.room === 'lg4') {
    audio.playMusic('kiln');
  }
  else if (state.flags.bossDefeated) audio.playMusic('ember-calm'); // the healed Hollow sings softly
  else if (state.room === 'lb') audio.playMusic('causeway');
  else audio.playMusic('region-ember');
  audio.setAmbient({ la: 0.5, lb: 0.75, le: 0.65, den: 0, vh: 0.3, vb1: 0.35, vz: 0.3, ld: 0.8, ld1: 0.7 }[state.room] ?? 0.5);
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
    // NAME THE THING. "new gear" tells a child nothing about what they just
    // found; the whole point of a chest is the moment you learn what was in it.
    const gd = WEAPONS[L.gear] || SHIELDS[L.gear];
    lines.push(gd ? `${gd.icon} ${gd.name}` : '🗡️ new gear');
  }
  // ARMOUR is found, not only bought — dad: "different weapons and armour that
  // you can find and equip".
  if (L.armour && ARMOURS[L.armour]) {
    state.inventory.armours = state.inventory.armours || ['plain'];
    if (!state.inventory.armours.includes(L.armour)) state.inventory.armours.push(L.armour);
    lines.push(`${ARMOURS[L.armour].icon} ${ARMOURS[L.armour].name}`);
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
  await preloadPotionDrop();
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
// Every arena in the game. Read by the doorway timing (a boss door takes the
// full 300ms ceremony) AND by the music, so the two can never disagree about
// what a boss room is.
// f5 is Boreal's arena and is still LIVE — Frostpeak has not been rebuilt yet.
// r3 and w5 were retired, and since Q6 they can no longer reach state.room.
const BOSS_ROOMS = new Set(['le', 'vz', 'tgl', 'f5', 'scr', 'ddp', 'xth']);
function seamMs(from, to) {
  if (BOSS_ROOMS.has(to)) return 300;
  if (regionOf(from) !== regionOf(to)) return 260;
  return sameDistrict(from, to) ? 90 : 170;
}

// THE ID STORED IS THE ROOM ON SCREEN. `buildRoom` resolves retired ids
// (RETIRED_ROOMS in state.js) and always has, but loadRoom used to store the
// RAW one — so walking Frostpeak's f1 door south left `state.room === 'tgl'`
// with `tgl` built and rendered. js/save.js already resolves for exactly this
// reason and says so in its comment ("main.js compares room ids in a dozen
// places and a mismatch would silently disable those checks"); loadRoom was the
// hole in that invariant, and the same physical arena behaved differently
// depending on which door a child came through.
async function loadRoom(rawId, entry, handoff = null) {
  const id = resolveRoom(rawId);
  transitioning = true;
  const ms = seamMs(state.room, id);
  await fadeTo(1, ms);
  player.clearProjectiles();
  document.getElementById('mg-chip').style.display = 'none'; // room chips never linger
  if (world) world.dispose();
  world = await buildRoom(id, scene);
  world.harness = harness;   // den hosts open mini games through it
  world.player = player;     // watchers and mirrors ask it whether Kael is ghosted
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
  // Resolved ids: `r2`/`r3`/`w5` are retired and can no longer appear here.
  if (id === 'lb') narration.say('r2_enter');
  if (id === 'le' && world.boss && !world.boss.defeated) narration.say('boss_intro');
  if (id === 'tgl' && world.boss && !world.boss.defeated) narration.say('sylva_intro');
  if (id === 'f5' && world.boss && !world.boss.defeated) narration.say('boreal_intro');
  if (id === 'scr' && world.boss && !world.boss.defeated) narration.say('aria_intro');
  if (id === 's1a' && regionOf(id) === 'stormreach') narration.say('storm_arrive');
  if (id === 'd1a') narration.say('vale_arrive');
  if (id === 'ddp' && world.boss && !world.boss.defeated) narration.say('meri_intro');
  if (id === 'x1') narration.say('court_arrive');
  if (id === 'xh') narration.say('court_wings');
  if (id === 'xm2') narration.say('court_mirrors');
  if (id === 'xth' && world.boss && !world.boss.defeated) narration.say('grimm_intro');
  window.__game = { player, world, state, effects, pip, narration, audio, juice, CONFIG, camera, perf, renderer, WS, persist, resolveRoom, applySave, bigToast, input, guideTarget, nextRoom }; // debug/testing hook
  initDevHarness();
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
// ---------------------------------------------------------------------------
// DEV HARNESS (overnight play-testing). Two-part gate: CONFIG.DEV_HARNESS at
// build time AND ?dev=1 on the URL. With either half missing this whole block
// is three inert constants — no listeners, no globals, no behaviour change.
//
// The contract, and why it is shaped this way:
//   * window.__wk is a READ-ONLY view. Every getter returns a copy. The test
//     driver reads it to steer, and drives the game ONLY through real input
//     events (keyboard/pointer) — the input layer is part of what is under
//     test, so nothing here moves the player.
//   * window.__wkJump(room, forms?) is the one allowed mutation: entering a
//     level directly with an appropriate save state, because "play level 4"
//     cannot mean "first play levels 1-3 for an hour".
//   * DEV_TIMESCALE (?timescale=) scales the already-clamped delta step and
//     nothing else — the whole game slows or quickens together. Below 1 is the
//     boss ladder (0.5/0.25 verification rungs). Above 1 exists because the
//     headless test renderer draws ~5fps and the 0.05s step clamp then runs the
//     game at quarter speed; 3-4x restores traversal to real time. Ceiling 4:
//     above that a sprint step exceeds a thin wall's depth and can tunnel.
//     Fights, hazard rooms, and timing checks are driven at 1x per the brief.
// ---------------------------------------------------------------------------
const DEV_ON = CONFIG.DEV_HARNESS && new URLSearchParams(location.search).has('dev');
const DEV_TIMESCALE = DEV_ON
  ? Math.max(0.1, Math.min(4, parseFloat(new URLSearchParams(location.search).get('timescale')) || 1))
  : 1;

function initDevHarness() {
  if (!DEV_ON || window.__wk) return;
  window.__wk = {
    get pos() { const p = player.root.position; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; },
    get hearts() { return player.hearts; },
    get maxHearts() { return player.maxHearts; },
    get room() { return resolveRoom(state.room); },   // retired ids resolve — the eye reports the room actually built
    get form() { return state.form; },
    get forms() { return [...state.formsUnlocked]; },
    get music() { return audio._musicName; },
    get timescale() { return DEV_TIMESCALE; },
    get doors() {
      return (world.doors || []).map((d) => ({ to: d.to,
        x: +((d.minX + d.maxX) / 2).toFixed(1), z: +((d.minZ + d.maxZ) / 2).toFixed(1),
        open: !d.when || !!d.when() }));
    },
    get boss() {
      const b = world.boss || world.warden;
      if (!b) return null;
      return { name: b.name || b.skin || 'boss',
        hp: b.hp !== undefined ? b.hp : (b.coreHp !== undefined ? b.coreHp : null),
        maxHp: b.maxHp,
        state: b.state || null, action: b.action || null,
        phase: b.phase !== undefined ? b.phase : null,
        x: b.x !== undefined ? +b.x.toFixed(2) : null,
        z: b.z !== undefined ? +b.z.toFixed(2) : null };
    },
    get foes() {
      return (world.enemies || []).filter((e) => !e.dead && !e.scenery && e.takeStun)
        .map((e) => ({ x: +e.x.toFixed(1), z: +e.z.toFixed(1), hp: e.hp,
          kind: e.constructor.name, state: e.state || null }));
    },
    get flags() { return JSON.parse(JSON.stringify(state.flags)); },
    get ws() { return { vault: WS.stage('vault'), wild3: WS.stage('wild3') }; },
    // THE GATES OF THE FROZEN WORLD. Every flag that can make the main loop
    // skip updates, read from inside the module where they are closured —
    // findable in one read instead of a night of inference.
    get gates() {
      return { transitioning, paused, menuPaused, harness: harness.active,
        hitStop: effects.hitStopTime, blocking: narration.blocking,
        speaking: narration.speaking };
    },
  };
  window.__wkJump = (room, forms) => {
    if (forms) state.formsUnlocked = forms;
    state.room = room;
    player.iframes = 0;
    player.hearts = 0.5;
    player.hurt(99, { pierceDefend: true });   // the respawn path IS the loader
  };
}

function regionOf(id) {
  const r = resolveRoom(id);
  if (r[0] === 'v') return 'stoneroot';
  if (r[0] === 't') return 'wildwoods';
  if (r[0] === 'f') return 'frostpeak';
  if (r[0] === 's') return 'stormreach';
  if (r[0] === 'd' && r !== 'den') return 'sunkenvale';
  if (r[0] === 'x') return 'shadowcourt';
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
  world.player = player;
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
  window.__game = { player, world, state, effects, pip, narration, audio, juice, CONFIG, camera, perf, renderer, WS, persist, resolveRoom, applySave, bigToast, input, guideTarget, nextRoom };
  initDevHarness();
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
// THE CREDITS. The game has never had an ending, so it has never had these
// either. Icons and one short line each, on the same no-reading rule as the
// rest of the game: the names are for dad, the pictures are for the kids, and
// tapping anywhere puts it away.
function rollCredits() {
  if (document.getElementById('credits')) return;
  const el = document.createElement('div');
  el.id = 'credits';
  el.innerHTML = `
    <div class="cr-inner">
      <div class="cr-moon">🌕</div>
      <div class="cr-title">WOLF KNIGHT</div>
      <div class="cr-line">🐺 Kael &middot; 🦊 Pip &middot; 🌙 Luna</div>
      <div class="cr-line">🔥 Cinder &middot; ⛰️ Petra &middot; 🌿 Sylva &middot; ❄️ Boreal</div>
      <div class="cr-line">🌩️ Aria &middot; 🌊 Meri &middot; 🖤 Grimm</div>
      <div class="cr-seven">🌕🌕🌕🌕🌕🌕🌕</div>
      <div class="cr-small">seven lights, all of them home</div>
      <div class="cr-tap">👆</div>
    </div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); };
  el.addEventListener('pointerdown', close);
  setTimeout(() => { if (document.getElementById('credits')) close(); }, 45000);
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

  // LOUD ON FAILURE. These two async paths set `transitioning = true` and are
  // called fire-and-forget: if buildRoom ever rejects mid-flight, the flag
  // wedges true forever and the world freezes silently — renders, never
  // updates, no message. The overnight bot hit exactly that signature twice in
  // vgb (game clock halted, no menu, no caption). A catch cannot un-wedge the
  // world safely, but it CAN say what broke, which turns the next silent
  // freeze into a diagnosable error.
  player.onDefeated = () => {
    if (!transitioning) respawnAtCheckpoint()
      .catch((e) => console.error('[respawn] room rebuild failed — world wedged:', e));
  };
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
  // A breakable can drop a potion — but only if the child has room for it, or
  // the reward vanishes on pickup and teaches that smashing things is pointless.
  lootEvents.onPotionDrop = (x, z) => {
    if (player.potions >= 3) return;
    spawnPotionDrop(world, x, z);
  };
  lootEvents.onPotion = () => { player.addPotion(); renderPotions(player); };
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
    const dt = Math.min(realDt, 0.05) * DEV_TIMESCALE;
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
              narration.say('grimm_taunt_4');
              setTimeout(() => narration.say('luna_dream_4'), 9000);
            } else if (state.room === 'scr') {
              // ARIA FREED — the gale drops off the crown and the whole climb
              // opens out below (boss.js set the flags; here is the party)
              audio.playMusic('victory', { loop: false, then: 'den' });
              narration.say('aria_defeat');
              WS.set('storm', 'restored');
              narration.say('storm_restore_1');
              narration.say('grimm_taunt_5');
              setTimeout(() => narration.say('luna_dream_5'), 9000);
            } else if (state.room === 'xth') {
              // THE END OF THE STORY. He is FREED, not destroyed — the shadow
              // goes and Grimm is left, old and tired and himself. The last
              // thing the game shows is the Den, full.
              audio.playMusic('victory', { loop: false, then: 'den' });
              WS.set('court', 'restored');
              narration.say('end_1');
              setTimeout(() => narration.say('end_2'), 5000);
              setTimeout(() => narration.say('end_3'), 11000);
              setTimeout(() => narration.say('end_4'), 16000);
              setTimeout(() => { narration.say('end_5'); rollCredits(); }, 21000);
              setTimeout(() => narration.say('end_6'), 27000);
            } else if (state.room === 'ddp') {
              // MERI FREED — the vale drains and the drowned town stands up
              audio.playMusic('victory', { loop: false, then: 'den' });
              narration.say('meri_defeat');
              WS.set('vale', 'restored');
              narration.say('vale_restore_1');
              narration.say('grimm_taunt_6');
              setTimeout(() => narration.say('luna_dream_6'), 9000);
            } else if (state.room === 'tgl') {
              // SYLVA FREED — the Wild Woods breathe again, the Verdant
              // Wolf is earned (boss.js set the flags; here is the party)
              audio.playMusic('victory', { loop: false, then: 'den' });
              narration.say('sylva_defeat');
              narration.say('verdant_grant');
              narration.say('verdant_howto');
              WS.set('wild', 'restored');
              narration.say('wild_restore_1');
              narration.say('grimm_taunt_3');
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
      if (door) loadRoom(door.to, door.entry, handoffAt(door))
        .catch((e) => console.error('[door] room load failed — world wedged:', e));

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
  world.player = player;
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
  window.__game = { player, world, state, effects, pip, narration, audio, juice, CONFIG, camera, perf, renderer, WS, persist, resolveRoom, applySave, bigToast, input, guideTarget, nextRoom };
  initDevHarness();
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
