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
    rescued: {},  // grown-wolf id -> true (dungeon room one, no fight — §2.5)
    chests: {},   // chest id -> opened
    keys: {},     // key id -> owned (dungeon locks)
    // THE MAP'S MEMORY (js/mapdata.js). `visited`: room id -> true, stamped on
    // every arrival — the map's fog lifts from it. `mapMarks`: every promise
    // gate the child has walked near, drawn on the map until it opens.
    visited: {},
    mapMarks: {},
  },
  formsUnlocked: ['knight', 'dark_wolf'],
  // THE PACK (v3.195): the three wolves a child has chosen to bring. Empty
  // until there are more than three to choose from (packForms fills it).
  pack: [],
  packKnown: [],                 // the wolves packWolves() has already seen
  form: 'knight',
  // THE TRIAL LOCKS YOU INTO ONE FORM (design/LEVEL-DESIGN-TRIAL.md). null
  // everywhere else in the game. Persisted rather than transient because a
  // child who quits mid-fight must come back still locked — the wolf they
  // spent at that arch has been spent.
  formLock: null,
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
    materials: {},               // crafting materials (design/CRAFTING.md), id -> count
    crafted: [],                 // ids of every unique thing ever crafted (unlock ladder)
    recipesKnown: [],            // hidden recipe ids discovered (design/CRAFTING.md §2)
    draughts: {},                // crafted drinks HELD for later, id -> count (v3.194)
    // DRAGON EGGS (design/DRAGON-EGGS.md) — element -> true. Deliberately
    // three small flag bags rather than one shape, so "found" / "hatched" /
    // "currently worn" can each be answered with a single lookup.
    dragonEggs: {},               // element -> true (egg found, not yet thrown)
    dragonsHatched: {},           // element -> true (thrown at its shrine, hatched forever)
    dragonEquipped: null,         // element | null — which hatched dragon runs with Kael
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
// WHICH FORMS MAY BE WORN RIGHT NOW.
//
// Every path that changes form — setForm(), the form button's cycle, the Tab
// shortcut, the radial picker — asked `state.formsUnlocked` directly, which
// made "lock the player into one wolf" four separate edits that could drift
// apart. It is one question, so it is one function, and setForm() consults it
// too: no caller can route around the lock by accident.
//
// Returns the unlocked list normally. Under a Trial lock it returns exactly
// the locked form, so the picker greys out everything else, the cycle has
// nowhere to go, and setForm() refuses.
export function formsAvailable() {
  if (state.formLock && state.formsUnlocked.includes(state.formLock)) return [state.formLock];
  return state.formsUnlocked;
}

// THE PACK OF THREE (v3.195). Dad: "It's very messy by the end of it with the
// selection wheel." Ten faces in one fan. The form button now cycles only the
// Knight, the Dark Wolf (the story's own wolf — it takes no pack slot and gets
// no extra button) and the THREE wolves in the pack; the pack is chosen at
// the Den or by any rest flame / campfire (js/menus.js Pack tab).
//
// While a child owns three or fewer other wolves there is nothing to choose,
// so the pack is simply all of them. Past that, it is state.pack, topped up
// with the most recently earned wolves if it is short (a new wolf joins the
// pack the moment it is earned, so the gift is in hand, never in a menu).
// formsAvailable() is left alone: puzzles and gates still ask what is OWNED.
export const PACK_SIZE = 3;
export function packWolves() {
  const owned = state.formsUnlocked.filter((f) => f !== 'knight' && f !== 'dark_wolf');
  // a wolf earned since the pack was last looked at goes straight IN (the
  // ten or so unlock sites across boss.js/main.js need not know packs exist)
  const known = state.packKnown || [];
  const fresh = owned.filter((f) => !known.includes(f));
  if (fresh.length) {
    if (owned.length > PACK_SIZE && (state.pack || []).length) {
      state.pack = [...fresh, ...state.pack.filter((f) => !fresh.includes(f))].slice(0, PACK_SIZE);
    }
    state.packKnown = [...owned];
  }
  if (owned.length <= PACK_SIZE) return owned;
  const pack = (state.pack || []).filter((f) => owned.includes(f)).slice(0, PACK_SIZE);
  for (let i = owned.length - 1; i >= 0 && pack.length < PACK_SIZE; i--) {
    if (!pack.includes(owned[i])) pack.push(owned[i]);
  }
  return pack;
}
export function packForms() {
  const avail = formsAvailable();
  if (state.formLock && avail.length === 1) return avail;      // a Trial lock
  return ['knight', 'dark_wolf', ...packWolves()].filter((f) => avail.includes(f));
}

export function resolveRoom(id) {
  return RETIRED_ROOMS[id] || id;
}

// WHICH PART OF THE WORLD IS THIS ROOM IN? Region = the room id's first letter
// (rooms.js's kit dispatcher, main.js's music and the map all key on it). This
// lived in main.js; it is here because the map screen (menus.js) needs the same
// answer and must not import main to get it. Every prefix in ROOMS is named —
// a new one has to be added here as well as in rooms.js's dispatcher, or it
// falls through to Ember, which is how both roads played the Den's lullaby.
export function regionOf(id) {
  const r = resolveRoom(id);
  if (r[0] === 'v') return 'stoneroot';
  if (r[0] === 't') return 'wildwoods';
  if (r[0] === 'f') return 'frostpeak';
  if (r[0] === 's') return 'stormreach';
  // 'dr' is the Den's own rebuilt outer camp (design/DEN-REBUILD.md) — a
  // pocket room off the Den, not a Sunken Vale room, so it is excluded here
  // the same way 'den' itself already is and falls through to the same
  // 'ember_hollow' default the Den uses.
  if (r[0] === 'd' && r !== 'den' && r !== 'dr') return 'sunkenvale';
  if (r[0] === 'x') return 'shadowcourt';
  if (r[0] === 'y') return 'village';
  if (r[0] === 'm') return 'spire';
  if (r[0] === 'l') return 'ember_hollow';
  if (r[0] === 'n') return 'night_road';   // the road out of Ember (levelNight.js)
  if (r[0] === 'q') return 'market';       // the road into Stormreach (levelMarket.js)
  if (r[0] === 'g') return 'greenway';     // the road into the Wild Woods (levelGreen.js)
  if (r[0] === 'c') return 'coldclimb';    // the road up to Frostpeak (levelClimb.js)
  if (r[0] === 'p') return 'plunge';       // the road down to the Vale (levelPlunge.js)
  if (r[0] === 'h') return 'hollowroad';   // the last road, into the Court (levelHollow.js)
  // retired ids that somehow reach here keep their original mapping
  if (r[0] === 'e') return 'stoneroot';
  if (r[0] === 'w') return 'wildwoods';
  return 'ember_hollow';
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

