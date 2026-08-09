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
    keys: {},     // key id -> owned (dungeon locks)
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
  moonGauge: 0,                 // 0..1 — the Blood Moon Surge charge
  xp: 0,
  level: 1,
  perks: { sword: 0, bolt: 0, cooldown: 0, speed: 0 },
  counters: {},                 // sticker-book tallies (kills, parries, ...)
  minigames: {},                // id -> { best, plays, won[] } — per profile only
  stickers: {},                 // sticker id -> true
  settings: { captions: true, voice: true, musicVol: 0.6, sfxVol: 0.8, voiceRate: 0.95,
    // '' = let the ranked picker choose; a child's own choice from Settings
    // overrides it and is remembered per profile. Old saves simply lack the
    // key and fall back to the picker, which is the additive-forever rule.
    voiceName: '', brave: false,
    // A7 — the DRESSED level is what a child gets. Greybox is a build-order
    // tool, not a costume to ship; it stays reachable from the cheat menu.
    greybox: false },
  spoken: {}, // narration line id -> true (story lines fire once per save)
};

// ---------------------------------------------------------------------------
// THE REBUILT LEVELS ARE NOW THE GAME (v3.25). Levels 1-3 are the expanded,
// non-linear spaces; the old small rooms are retired.
//
// They are NOT deleted. A child's save may be parked in any of them, and the
// additive-forever law says an old profile must always load. So the old ids
// stay in the registry and are REDIRECTED here — a save in `r2` resumes at the
// matching place in the rebuilt Ember Hollow rather than failing to build.
//
// Mapped by POSITION IN THE LEVEL, not alphabetically: a child who stopped at
// the Kiln shrine should come back to the Kiln shrine, not to the front door.
export const RETIRED_ROOMS = {
  // Ember Hollow  →  Level 1 rebuild
  r1: 'la', r1b: 'la1', r2: 'lb', r2b: 'lb1', r3: 'le',
  k1: 'ld', ka: 'ld', kb: 'ld1',
  // Stoneroot Caverns  →  Level 2 rebuild
  e1: 'vh', e1b: 'va1', e2: 'vb1', e2b: 'vbp', e3: 'vz',
  // Wild Woods  →  Level 3 rebuild
  w1: 't1a', w1b: 't1p', w2: 't2a', w2b: 't2p', w3: 't3a', w4: 't4a', w5: 'tgl',
  // Frostpeak (f*) was never rebuilt and is untouched.
};

// Resolve any room id — new, retired, or unknown — to the one to actually
// build. Everything that loads a room goes through this: doors, saves,
// respawns and the cheat menu, so there is no path that can miss it.
export function resolveRoom(id) {
  return RETIRED_ROOMS[id] || id;
}

