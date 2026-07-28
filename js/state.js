// Run state for the current play session. Persistence (per-kid profiles,
// localStorage schema v1) arrives in Phase 9 — everything routes through this
// object so the save system can serialize it later without refactors.

export const state = {
  region: 'ember_hollow',
  room: 'r1',
  checkpoint: { room: 'r1', x: -1, z: 4, id: 'spawn' },
  flags: {
    bossDefeated: false,
    shortcutOpen: false,
    burned: {},   // burnable id -> true
    cracked: {},  // cracked-rock id -> true (Earth Wolf stomp)
    plates: {},   // pressure-plate id -> true (boulder puzzles)
    wardenDefeated: false, // Stoneroot mini-boss
    pups: {},     // pup id -> true
    chests: {},   // chest id -> opened
  },
  formsUnlocked: ['knight', 'dark_wolf'],
  form: 'knight',
  maxHearts: 5,
  potions: 2,
  shards: 0,                    // ember shards (currency)
  inventory: {
    gear: ['sword_knight', 'shield_badge'],
    equipped: { weapon: 'sword_knight', shield: 'shield_badge' },
    treasures: [],
    heartPieces: 0,
  },
  xp: 0,
  level: 1,
  perks: { sword: 0, bolt: 0, cooldown: 0, speed: 0 },
  counters: {},                 // sticker-book tallies (kills, parries, ...)
  stickers: {},                 // sticker id -> true
  settings: { captions: true, voice: true, musicVol: 0.6, sfxVol: 0.8, voiceRate: 0.95, brave: false },
  spoken: {}, // narration line id -> true (story lines fire once per save)
};
