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
    pups: {},     // pup id -> true
  },
  formsUnlocked: ['knight', 'dark_wolf'],
  form: 'knight',
};
