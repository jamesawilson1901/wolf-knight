// Progression: XP → levels → perk picks, plus the sticker book tallies.
// Numbers stay small and readable — this is for kids. Enemies also scale
// gently with level (see enemyScale) so fights stay interesting.

import { state } from './state.js';
import { audio } from './audio.js';

export const XP_VALUES = { Shade: 5, Moth: 6, Hound: 20, Breakable: 0, Hittable: 0, Slime: 5, Bat: 6, SkeletonMinion: 8, SkeletonRogue: 12, SkeletonWarrior: 12, SkeletonMage: 14, BoneWarden: 60 };

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

// Gentle difficulty curve: enemy hp/damage multiplier by player level.
// +8% hp per level, capped ×2.2 — behaviors (not numbers) carry the real
// difficulty, this just keeps early enemies from becoming trivial.
export function enemyScale() {
  return Math.min(2.2, 1 + (state.level - 1) * 0.08);
}

// Perk cards: every 3rd level offers a pick-one-of-two.
export const PERKS = [
  { id: 'sword', icon: '⚔️', name: 'Sharper Sword', blurb: '+¼ sword damage' },
  { id: 'bolt', icon: '✨', name: 'Brighter Spark', blurb: '+¼ bolt damage' },
  { id: 'cooldown', icon: '⏱️', name: 'Quicker Moon', blurb: 'Special charges faster' },
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

export const STICKERS = [
  { id: 'first_blood', icon: '⚔️', name: 'Shadow Basher', counter: 'kills', at: 1 },
  { id: 'slayer10', icon: '🗡️', name: 'Ten Shadows Down', counter: 'kills', at: 10 },
  { id: 'slayer50', icon: '🏆', name: 'Shadow Champion', counter: 'kills', at: 50 },
  { id: 'parry1', icon: '🛡️', name: 'Perfect Block!', counter: 'parries', at: 1 },
  { id: 'parry10', icon: '✨', name: 'Parry Master', counter: 'parries', at: 10 },
  { id: 'smasher', icon: '📦', name: 'Pot Smasher', counter: 'pots', at: 5 },
  { id: 'rich', icon: '🪙', name: 'Shard Collector', counter: 'shardsEarned', at: 100 },
  { id: 'chest1', icon: '🎁', name: 'Treasure Finder', counter: 'chests', at: 1 },
  { id: 'shopper', icon: '🛒', name: 'First Purchase', counter: 'purchases', at: 1 },
  { id: 'pups', icon: '🐺', name: 'Pup Rescuer', counter: 'pupsFound', at: 3 },
  { id: 'boss1', icon: '🔥', name: 'Hollow Hero', counter: 'bosses', at: 1 },
  { id: 'jumper', icon: '🦘', name: 'Sky Dancer', counter: 'doubleJumps', at: 20 },
  { id: 'level5', icon: '⭐', name: 'Level 5!', counter: 'level', at: 5 },
  { id: 'level10', icon: '🌟', name: 'Level 10!', counter: 'level', at: 10 },
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
