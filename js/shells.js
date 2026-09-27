// ELEMENTAL SHELLS (v3.195) — fights that need the right wolf.
//
// Dad: "It works well for puzzles but for combat it is lacking, it completely
// negates using the wolves in combat if you get good weapons." Puzzles already
// ask for a wolf (a thorn gate wants fire, a cracked stone wants the Earth
// Wolf); fights never did. A shell is that same question worn by an enemy: from
// the second region on, a few enemies arrive in a crust of the element they
// are WEAK to — stone skin, an ice crust, a thorn coat, a shadow cloak — and
//
//   * the matching wolf's hits crack it (two bites, or one special), with a
//     big CRACK! and a stagger, and after that it is an ordinary enemy;
//   * everything else CLANGS off for a third of its damage — a child is never
//     stuck, it is just slow;
//   * the shell glows in its element round the body, and the wolf that
//     breaks it floats over the enemy's head as its own portrait — the same
//     picture the map's come-back-later marks use. No words to read.
//
// A shell is only ever handed out when the wolf that breaks it is already
// unlocked, so a fight never asks for something the child has not earned.
import * as THREE from 'three';
import { state, regionOf } from './state.js';
import { PORTRAITS } from './titlescene.js';
import { audio } from './audio.js';
import { juice } from './juice.js';
import { REGION_TIER } from './progress.js';

export const SHELL_FORM = {
  fire: 'fire_wolf', earth: 'earth_wolf', frost: 'frost_wolf', verdant: 'verdant_wolf',
  storm: 'storm_wolf', tide: 'tide_wolf', moon: 'dark_wolf',
};
export const SHELL_COLOR = {
  fire: 0xff6a2a, earth: 0xd8a860, frost: 0x9be3ff, verdant: 0x7ad65a,
  storm: 0xfff08a, tide: 0x4fd0e0, moon: 0xb08aff,
};
// the hits of the RIGHT element a shell takes before it cracks (a special,
// kind 'aoe', counts double: a slam or a stomp cracks it on its own)
export const SHELL_HITS = 2;
// what the WRONG element does through a shell — never zero: a child with the
// wrong wolf in the pack is slowed, never stuck
export const SHELL_CLANG = 0.3;
const MAX_PER_ROOM = 2;

const tex = {};
function texture(url) {
  if (!tex[url]) tex[url] = new THREE.TextureLoader().load(url);
  return tex[url];
}

function weakOf(e) {
  const w = Array.isArray(e.weakness) ? e.weakness[0] : e.weakness;
  return w && SHELL_FORM[w] ? w : null;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Called once per room build, after spawnEnemies. Deterministic per room, so
// a room shells the same enemies every visit (a child learns the room).
export function applyShells(world) {
  const room = world.roomId || state.room;
  if ((REGION_TIER[regionOf(room || 'la')] ?? 0) < 1) return;   // Ember and its road: none yet
  const owned = state.formsUnlocked || [];
  const eligible = (world.enemies || []).filter((e) => {
    if (e.dead || e.scenery || e.flying || e.isBoss || e === world.miniBoss) return false;
    if (e.shell || !(e.maxHp >= 2)) return false;
    const w = weakOf(e);
    return w && owned.includes(SHELL_FORM[w]);
  });
  if (!eligible.length) return;
  const h = hash(room);
  const want = Math.min(MAX_PER_ROOM, Math.max(1, Math.floor(eligible.length / 3)));
  for (let k = 0; k < want; k++) {
    const e = eligible[(h + k * 7) % eligible.length];
    if (e.shell) continue;
    giveShell(e, weakOf(e));
  }
  if (!world._shellAnim) {
    world._shellAnim = true;
    world.onAnimate((t) => {
      for (const e of world.enemies || []) {
        if (!e.shell || !e.shell.aura) continue;
        const s = e.shell.auraBase * (1 + 0.06 * Math.sin(t * 3 + e.x));
        e.shell.aura.scale.set(s, s, 1);
        e.shell.aura.material.opacity = 0.55 + 0.2 * Math.sin(t * 3 + e.x);
        if (e.shell.badge) e.shell.badge.position.y = e.shell.badgeY + 0.08 * Math.sin(t * 2.2 + e.z);
      }
    });
  }
}

export function giveShell(e, element) {
  const color = SHELL_COLOR[element];
  const bb = new THREE.Box3().setFromObject(e.root);
  const inv = 1 / (e.root.scale.x || 1);
  const h = Math.max(0.8, (bb.max.y - bb.min.y)) * inv;
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture('./assets/fx/moon-ring.png'), color, transparent: true, opacity: 0.65,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const auraBase = Math.max(1.4, h * 1.25);
  aura.scale.set(auraBase, auraBase, 1);
  aura.position.set(0, h * 0.5, 0);
  aura.renderOrder = 6;
  e.root.add(aura);
  let badge = null;
  const portrait = PORTRAITS[SHELL_FORM[element]];
  const badgeY = h + 0.55 * inv;
  if (portrait) {
    badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(portrait), transparent: true, depthWrite: false }));
    badge.scale.set(0.8 * inv, 0.8 * inv, 1);
    badge.position.set(0, badgeY, 0);
    badge.renderOrder = 7;
    e.root.add(badge);
  }
  e.shell = { element, hits: SHELL_HITS, aura, auraBase, badge, badgeY, clangT: 0 };
}

// From Enemy.takeDamage: the multiplier a shell puts on this hit (1 once it
// cracks), and the cracking itself.
export function shellHit(e, element, kind) {
  const sh = e.shell;
  if (!sh) return 1;
  const right = element === sh.element || state.form === 'elemental_wolf';
  if (!right) {
    const now = performance.now();
    if (now - sh.clangT > 450) {
      sh.clangT = now;
      audio.play('parry', { volume: 0.5, rate: 1.7 });
      if (e.world.onDmgNum) e.world.onDmgNum(e.x, 1.5, e.z, 'CLANG');
    }
    return SHELL_CLANG;
  }
  sh.hits -= kind === 'aoe' ? 2 : 1;
  const color = SHELL_COLOR[sh.element];
  juice.burst(e.x, 0.9, e.z, color, 10);
  if (sh.hits > 0) {
    audio.play('parry', { volume: 0.6, rate: 1.2 });
    return 0.5;                       // the first right hit cracks, the next breaks
  }
  breakShell(e);
  return 1;
}

export function breakShell(e) {
  const sh = e.shell;
  if (!sh) return;
  const color = SHELL_COLOR[sh.element];
  juice.burst(e.x, 1.0, e.z, color, 22);
  juice.flare(e.x, 1.0, e.z, color);
  audio.play('parry', { volume: 0.9, rate: 0.8 });
  if (e.world.onDmgNum) e.world.onDmgNum(e.x, 1.7, e.z, 'CRACK!');
  if (sh.aura) e.root.remove(sh.aura);
  if (sh.badge) e.root.remove(sh.badge);
  e.shell = null;
  // it reels — the punish window. Enemy.takeDamage applies the stun AFTER
  // this hit lands, so the cracking blow does not double itself
  e._shellBroke = true;
}
