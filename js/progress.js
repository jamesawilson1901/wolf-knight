// Progression: XP → levels → perk picks, plus the sticker book tallies.
// Numbers stay small and readable — this is for kids. Enemies also scale
// gently with the REGION (see enemyScale) so fights stay interesting.

import { state, regionOf } from './state.js';
import { audio } from './audio.js';

// A9: SkeletonShield was missing, so Level 2's four shield-bearers — the
// toughest ordinary enemy in the game, armored and guarding — awarded NOTHING.
// `die()` guards with `|| 0` so it never corrupted a save, it just quietly
// starved the level curve, and a child arrived in the Wild Woods under-levelled.
// That matters more than it looks: since v3.29 enemy hp scales with player
// level, so the missing XP was making LEVEL 3 easier too.
export const XP_VALUES = { Shade: 5, Moth: 6, Hound: 20, Breakable: 0, Hittable: 0, Slime: 5, Bat: 6, SkeletonMinion: 8, SkeletonRogue: 12, SkeletonShield: 12, SkeletonWarrior: 12, SkeletonMage: 14, BoneWarden: 60,
  // Roster expansion (task #31) — same A9 lesson applies: every class the
  // roster spawns needs an entry here or a kid earns nothing for it.
  Flanker: 6, Stalker: 16, RangedKiter: 9, RangedLobber: 9, RangedBolter: 10,
  DashStriker: 18, Duellist: 15, HeavySwinger: 18, ShieldAdvancer: 15,
  MirrorKael: 18, Flurry: 15, Commander: 25, SlowStomper: 40, Hopper: 6, Dragonling: 16 };

export const progressEvents = { onLevelUp: null, onXp: null, onSticker: null };

export function xpForLevel(level) {
  return 20 + (level - 1) * 15;
}

export function grantXp(n) {
  if (n <= 0) return;
  state.xp += n;
  if (progressEvents.onXp) progressEvents.onXp();
  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level++;
    audio.play('pup-chime', { volume: 0.9, rate: 1.2 });
    if (progressEvents.onLevelUp) progressEvents.onLevelUp(state.level);
  }
}

// Gentle difficulty curve: enemy hp multiplier BY WHERE YOU ARE, not by
// who you are (v3.195, Dad: "when you level up and click to increase your
// attack, it does nothing in the game"). It used to be +8% per PLAYER level,
// which cancelled the level-up almost exactly: the +¼ Sharper Sword every
// third level (+25%) met +24% enemy hp in the same three levels. Now the
// region sets the number, and levelling up is power a child can feel.
//
// The curve is the SAME one a child on the expected level curve met before
// (GAME-CONTRACT: level ~1+3(N-1) entering region N, so +0.08 x 3 = +0.24 a
// region), capped x2.2 as ever — behaviour, not numbers, carries difficulty.
// The roads between regions sit half a step between their two ends.
export const REGION_TIER = {
  ember_hollow: 0, night_road: 0.5, stoneroot: 1, greenway: 1.5, wildwoods: 2,
  coldclimb: 2.5, frostpeak: 3, market: 3.5, stormreach: 4, plunge: 4.5,
  sunkenvale: 5, hollowroad: 5.5, shadowcourt: 6, village: 6, spire: 6.5,
};
export function enemyScale(room = state.room) {
  const tier = REGION_TIER[regionOf(room || 'la')] ?? 0;
  return Math.min(2.2, 1 + tier * 0.24);
}

// Perk cards: every 3rd level offers a pick-one-of-two.
export const PERKS = [
  { id: 'sword', icon: '⚔️', name: 'Sharper Sword', blurb: '+¼ sword damage' },
  { id: 'bolt', icon: '✨', name: 'Brighter Spark', blurb: '+¼ bolt damage' },
  { id: 'cooldown', icon: '⏱️', name: 'Quicker Moon', blurb: 'Specials charge faster · moon gauge fills faster' },
  { id: 'speed', icon: '👟', name: 'Swift Paws', blurb: 'Run a little faster' },
];

export function perkChoices(level) {
  // deterministic pair per level so reloads offer the same choice
  const a = PERKS[level % PERKS.length];
  let b = PERKS[(level + 1) % PERKS.length];
  if (b === a) b = PERKS[(level + 2) % PERKS.length];
  return [a, b];
}

export function applyPerk(id) {
  state.perks[id] = (state.perks[id] || 0) + 1;
}

// ---------------------------------------------------------------------------
// Sticker book — kid achievements. Counters bump, stickers pop.
// ---------------------------------------------------------------------------
// PICTURES, NOT LETTERS (v3.132, design/WIDER-WORLD.md §3.3). `icon` was the
// only art a tile ever had — an emoji a non-reader cannot decode — for
// seventeen rows that mostly stand for a thing the game already models. A row
// with a `model` renders that model's own thumbnail instead (js/menus.js,
// the same itemThumb() path the Armoury and treasure shelf already use);
// `icon` stays as the fallback for the handful left that name an ABSTRACT
// idea (a level, a double jump, a minigame win) rather than an object — the
// exact line BUILDLOG.md:3949-3958 already drew for the rest of the game's
// emoji, extended here rather than redrawn.
export const STICKERS = [
  { id: 'first_blood', icon: '⚔️', name: 'Shadow Basher', counter: 'kills', at: 1,
    model: { file: './assets/chars/sword_1handed.gltf' } },
  { id: 'slayer10', icon: '🗡️', name: 'Ten Shadows Down', counter: 'kills', at: 10,
    model: { file: './assets/chars/sword_1handed.gltf' } },
  { id: 'slayer50', icon: '🏆', name: 'Shadow Champion', counter: 'kills', at: 50,
    model: { file: './assets/chars/sword_1handed.gltf' } },
  { id: 'parry1', icon: '🛡️', name: 'Perfect Block!', counter: 'parries', at: 1,
    model: { file: './assets/chars/shield_badge.gltf' } },
  { id: 'parry10', icon: '✨', name: 'Parry Master', counter: 'parries', at: 10,
    model: { file: './assets/chars/shield_badge.gltf' } },
  { id: 'smasher', icon: '📦', name: 'Pot Smasher', counter: 'pots', at: 5,
    model: { file: './assets/env/dungeon/Crate.glb' } },
  // the SAME coin the shard counter itself renders (js/main.js hudArt.shard)
  // — the tally on the sticker and the thing it is a tally OF stay one object.
  { id: 'rich', icon: '🪙', name: 'Coin Collector', counter: 'shardsEarned', at: 100,
    model: { file: './assets/loot/treasure/coin-gold-a.glb', tint: 0xffc843 } },
  { id: 'chest1', icon: '🎁', name: 'Treasure Finder', counter: 'chests', at: 1,
    model: { file: './assets/loot/survival/chest-wood.glb' } },
  { id: 'shopper', icon: '🛒', name: 'First Purchase', counter: 'purchases', at: 1,
    model: { file: './assets/env/village/Cart_1_A.glb' } },
  // the SAME pose main.js's own pup-rescue HUD counter renders at (hudArt.pup)
  // — a wolf shrinks to a smudge end-on, so both places share the one angle
  // that was actually measured (js/main.js:230-238).
  { id: 'pups', icon: '🐺', name: 'Pup Rescuer', counter: 'pupsFound', at: 3,
    model: { file: './assets/chars/wolf.gltf', pose: { yaw: Math.PI * 0.75, tiltZ: 0, zoom: 1.2 } } },
  { id: 'boss1', icon: '🔥', name: 'Hollow Hero', counter: 'bosses', at: 1 },
  { id: 'jumper', icon: '🦘', name: 'Sky Dancer', counter: 'doubleJumps', at: 20 },
  { id: 'game_rook', icon: '🎯', name: 'Sharp Eye', counter: 'gameRook', at: 1 },
  { id: 'game_wren', icon: '📦', name: 'Never Fooled', counter: 'gameWren', at: 1 },
  { id: 'game_pip', icon: '🐾', name: 'Paw Path Pro', counter: 'gamePip', at: 1 },
  { id: 'game_quiz', icon: '🧠', name: 'Which Wolf?', counter: 'gameQuiz', at: 1 },
  { id: 'level5', icon: '⭐', name: 'Level 5!', counter: 'level', at: 5 },
  { id: 'level10', icon: '🌟', name: 'Level 10!', counter: 'level', at: 10 },

  // NON-COMBAT ROWS (v3.132) — each names a deed the wider-world slices
  // already record somewhere; `bumpCounter` was simply never called at that
  // site. Two of §3.3's suggested rows (feeds, harvests) wait on the garden
  // bed (§3.2, unbuilt — a counter for a mechanic that does not exist yet is
  // the kind of thing the additive-forever law exists to prevent); "roads
  // walked back" waits on a per-road once-only flag this slice does not
  // build. The four below need nothing new.
  { id: 'petter', icon: '🐾', name: 'Gentle Hands', counter: 'pupsPetted', at: 5,
    model: { file: './assets/chars/wolf.gltf', pose: { yaw: Math.PI * 0.75, tiltZ: 0, zoom: 1.2 } } },
  { id: 'settler1', icon: '🔥', name: 'A Fire Returns', counter: 'hearthsGrown', at: 1,
    model: { file: './assets/env/village/FirePlace_1_1_A.glb' } },
  { id: 'dungeon1', icon: '🗝️', name: 'Vault Breaker', counter: 'dungeonsCleared', at: 1,
    model: { file: './assets/loot/pirate/chest-gold.glb' } },
  { id: 'rescuer1', icon: '🐺', name: 'A Friend Found', counter: 'wolvesRescued', at: 1,
    model: { file: './assets/chars/wolf.gltf', tint: 0x9c948a,
      pose: { yaw: Math.PI * 0.75, tiltZ: 0, zoom: 1.2 } } },
  // THE GARDEN BED (§3.2, v3.148) — the two rows §3.3 left as a named stub
  // ("wait on the garden bed... unbuilt"), now that it exists.
  { id: 'garden1', icon: '🌱', name: 'First Bloom', counter: 'harvests', at: 1,
    model: { file: './assets/env/flower-a.glb' } },
  { id: 'garden5', icon: '🌸', name: 'Green Thumb', counter: 'harvests', at: 5,
    model: { file: './assets/env/flower-b.glb' } },
  // THINGS I'VE MADE (v3.199) — dad's "no real reward" for building and
  // crafting answered partly here: the sticker book notices. `itemsCrafted`
  // was already bumped by every craft (js/crafting.js) and had no row at all.
  { id: 'maker1', icon: '🔨', name: 'I Made It!', counter: 'itemsCrafted', at: 1,
    model: { file: './assets/loot/platformer/key.glb', tint: 0xfff0c0 } },
  { id: 'maker10', icon: '🔨', name: 'Master Maker', counter: 'itemsCrafted', at: 10,
    model: { file: './assets/loot/platformer/key.glb', tint: 0xffd76a } },
  { id: 'builder1', icon: '🌉', name: 'Bridge Builder', counter: 'bridgesBuilt', at: 1,
    model: { file: './assets/env/bridge-stone.glb', tint: 0x9a6a3e } },
  { id: 'builder7', icon: '🌉', name: 'Every Bridge Mended', counter: 'bridgesBuilt', at: 7,
    model: { file: './assets/env/bridge-stone.glb', tint: 0xffd76a } },
];

export function bumpCounter(name, n = 1) {
  state.counters[name] = (state.counters[name] || 0) + n;
  checkStickers();
}

export function checkStickers() {
  const counters = { ...state.counters, level: state.level };
  for (const s of STICKERS) {
    if (state.stickers[s.id]) continue;
    if ((counters[s.counter] || 0) >= s.at) {
      state.stickers[s.id] = true;
      audio.play('checkpoint', { volume: 0.8, rate: 1.3 });
      if (progressEvents.onSticker) progressEvents.onSticker(s);
    }
  }
}
