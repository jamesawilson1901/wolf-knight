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
    armours: ['plain'],
    // `armour` joined the slots later; save.js defaults it, so a profile written
    // before armour existed still loads (saves are additive forever).
    equipped: { weapon: 'sword_knight', shield: 'shield_badge', armour: 'plain' },
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
    // GENTLE MODE. Absent from this list until now, which is how the stuck-
    // guide came to be gated on a key that never existed. Written down so the
    // next thing that reads it can see what the default actually is.
    easy: false,
    // A7 — the DRESSED level is what a child gets. Greybox is a build-order
    // tool, not a costume to ship; it stays reachable from the cheat menu.
    greybox: false,
    // Turns off camera shake + the hit punch-in zoom (see CONFIG.ACCESSIBILITY).
    // Hitstop/particles/haptics are untouched — they aren't camera motion.
    reduceMotion: false },
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

// ---------------------------------------------------------------------------
// IS A REGION FINISHED?
//
// This used to be asked of `state.spoken.*` — the once-per-save record of which
// NARRATION LINES have been heard. Fast travel, the pup counter and the map
// screen all read `region_complete` / `stone_complete` / `wild_complete`, and
// all three of those lines were unsayable on the shipping path: each needed a
// RETIRED room id plus a marker only that retired room's builder publishes
// (`r3` + exitSpot, `e3` + petraSpot, `w5` + sylvaShrine), and RETIRED_ROOMS
// above redirects all three away. So the moonstone never grew a destination,
// the sticker book said x/3 forever, and the map never showed Stoneroot.
//
// A region is finished when its BOSS IS DOWN. That is a save flag, set by the
// defeat path itself, and it cannot drift apart from a line of dialogue.
// Whether a child heard Pip say so is a separate question, and not one the
// moonstone should be asking.
export const REGION_BOSS_FLAG = {
  ember: 'bossDefeated',        // the Shadowgrip
  stoneroot: 'wardenDefeated',  // the Bone Warden
  wildwoods: 'sylvaDefeated',
  frostpeak: 'borealDefeated',
  stormreach: 'ariaDefeated',
  sunkenvale: 'meriDefeated',
};

export function regionCleared(region) {
  const f = REGION_BOSS_FLAG[region];
  return !!(f && state.flags[f]);
}

