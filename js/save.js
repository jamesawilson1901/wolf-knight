// Save system — localStorage schema v1 per design/HUD-MENU-SAVE.md.
// Auto-saves on checkpoint, form unlock, pup collected, region complete and
// settings change; kids never manage saves. Keys are versioned and parsed in
// try/catch — anything missing or corrupt just starts fresh.
//
// wolfknight:profiles   = [ {id, name, icon, updatedAt}, ... ]
// wolfknight:save:<id>  = { profileId, name, region, checkpoint, maxHearts,
//                           formsUnlocked, pups, settings, updatedAt,
//                           flags, spoken, form }
// (`flags` + `spoken` + `form` extend the documented v1 shape additively so a
// run restores exactly; `checkpoint` stores the full {room,x,z,id} object.)

import { state, resolveRoom } from './state.js';

const PROFILES_KEY = 'wolfknight:profiles';
const SAVE_PREFIX = 'wolfknight:save:';

// ---------------------------------------------------------------------------
// A FAILED WRITE MUST BE LOUD.
//
// Every localStorage write in this file used to end `catch (e) {}`. That is
// fine for a READ — a corrupt profile should start fresh rather than crash a
// six-year-old's game. It is indefensible for a WRITE: quota exceeded, private
// browsing, a full disk, and the child plays a whole evening, quits, and finds
// the morning's progress gone with the game having cheerfully said nothing.
//
// So writes now report. The handler is injected by main.js (which owns the
// error overlay) rather than imported, because save.js must stay loadable in a
// headless test with no DOM.
// ---------------------------------------------------------------------------
let onSaveError = null;
export function setSaveErrorHandler(fn) { onSaveError = fn; }

let lastSaveOk = true;
export function saveHealthy() { return lastSaveOk; }

function reportSaveFailure(what, err) {
  lastSaveOk = false;
  const msg = `Could not save your game (${what}): ${err && err.name ? err.name : err}`;
  // console first, so it is in the log even if the UI itself is broken
  console.error('[save] ' + msg, err);
  if (onSaveError) {
    try { onSaveError(msg, err); } catch (e2) { /* the reporter must never mask the report */ }
  }
}

export function loadProfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES_KEY));
    if (Array.isArray(raw)) return raw.filter((p) => p && p.id && p.name);
  } catch (e) { /* corrupt -> fresh */ }
  return [];
}

export function saveProfiles(list) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
    return true;
  } catch (e) { reportSaveFailure('profile list', e); return false; }
}

export function createProfile(name, icon) {
  const profiles = loadProfiles();
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  profiles.push({ id, name, icon, updatedAt: Date.now() });
  saveProfiles(profiles);
  return id;
}

export function loadSave(profileId) {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_PREFIX + profileId));
    if (data && data.profileId === profileId && data.region) return data;
  } catch (e) { /* corrupt -> fresh */ }
  return null;
}

export function clearSave(profileId) {
  try { localStorage.removeItem(SAVE_PREFIX + profileId); } catch (e) {
    reportSaveFailure('clearing a profile', e);
  }
}

// ---------------------------------------------------------------------------
// BACKUP / RESTORE (js/title.js). Everything above lives in localStorage,
// which a full phone's "clear site data" (or a factory reset, or a new
// device) wipes right alongside the browser's own cache — the two are the
// same kind of storage from the OS's point of view, however clearly this
// codebase keeps them apart internally (sw.js never touches localStorage).
// A file on the child's own device, outside the browser's storage entirely,
// is the only thing that survives that. The BACKUP_VERSION marker exists so
// a future save-shape change can tell an old export apart from a new one —
// there is only one shape so far, so importProfile has nothing to migrate
// yet, but the field is real from day one rather than bolted on once it is
// needed and every export before that day is unmarked.
const BACKUP_VERSION = 1;

// A profile's whole save, as a plain object ready to hand to JSON.stringify.
// Returns null rather than throwing — a profile with no save yet (picked but
// never played) has nothing to back up, and the caller decides what that
// means for its own UI rather than catching an exception for it.
export function exportProfile(profileId) {
  const profiles = loadProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  const save = loadSave(profileId);
  if (!profile || !save) return null;
  return {
    wolfKnightBackup: BACKUP_VERSION,
    exportedAt: Date.now(),
    profile: { id: profile.id, name: profile.name, icon: profile.icon },
    save,
  };
}

// The inverse. NEVER overwrites an existing profile silently: if the
// backup's own id is already in use (restoring onto the same browser that
// still has it, most likely) a fresh id is minted instead, so a restore can
// only ever ADD a profile, never destroy one already on this device. Throws
// on anything that is not a Wolf Knight backup — title.js decides how to
// tell a parent that, this module only tells the truth about what it read.
export function importProfile(payload) {
  if (!payload || typeof payload !== 'object' || !payload.wolfKnightBackup
      || !payload.profile || !payload.profile.name || !payload.save) {
    throw new Error('not a Wolf Knight save file');
  }
  const profiles = loadProfiles();
  const taken = new Set(profiles.map((p) => p.id));
  let id = payload.profile.id;
  if (!id || taken.has(id)) {
    id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  }
  profiles.push({ id, name: payload.profile.name, icon: payload.profile.icon, updatedAt: Date.now() });
  if (!saveProfiles(profiles)) throw new Error('could not write the restored profile');
  try {
    localStorage.setItem(SAVE_PREFIX + id, JSON.stringify({ ...payload.save, profileId: id }));
  } catch (e) {
    reportSaveFailure('restoring a backup', e);
    throw e;
  }
  return { id, name: payload.profile.name, icon: payload.profile.icon };
}

// Serialize the live run into the profile's save slot.
export function persist() {
  if (!state.profileId) return false;
  const pupList = Object.keys(state.flags.pups).filter((k) => state.flags.pups[k]);
  const data = {
    profileId: state.profileId,
    name: state.profileName,
    region: state.region,
    checkpoint: state.checkpoint,
    maxHearts: state.maxHearts,
    potions: state.potions,
    shards: state.shards,
    inventory: JSON.parse(JSON.stringify(state.inventory)),
    moonGauge: state.moonGauge || 0,
    xp: state.xp,
    level: state.level,
    perks: { ...state.perks },
    counters: { ...state.counters },
    stickers: { ...state.stickers },
    // PERSONAL BESTS, PER CHILD (design/DEN-MINIGAMES.md §2). Deliberately in
    // the profile and nowhere shared: the youngest will never beat the eldest
    // on a common leaderboard, and will stop playing.
    minigames: JSON.parse(JSON.stringify(state.minigames || {})),
    formsUnlocked: [...state.formsUnlocked],
    pups: { [state.region]: pupList },
    settings: { ...state.settings },
    flags: {
      bossDefeated: state.flags.bossDefeated,
      shortcutOpen: state.flags.shortcutOpen,
      wardenDefeated: state.flags.wardenDefeated,
      burned: { ...state.flags.burned },
      cracked: { ...state.flags.cracked },
      plates: { ...state.flags.plates },
      chests: { ...state.flags.chests },
      keys: { ...(state.flags.keys || {}) },
      world: JSON.parse(JSON.stringify(state.flags.world || {})),
      mysteries: JSON.parse(JSON.stringify(state.flags.mysteries || {})),
      bossProgress: state.flags.bossProgress || 0,
      bossHp: state.flags.bossHp || 0,        // v3.18: the duel remembers wounds
      e2bCleared: !!state.flags.e2bCleared,   // v3.18: the Old Quarry stays open
      sylvaHp: state.flags.sylvaHp || 0,      // v3.19: Sylva's duel remembers too
      sylvaDefeated: !!state.flags.sylvaDefeated,
      borealHp: state.flags.borealHp || 0,    // v3.21: Boreal's duel remembers too
      borealDefeated: !!state.flags.borealDefeated,
      wardenHp: state.flags.wardenHp || 0,    // v3.49: the Warden's duel remembers across app-close, like every boss since v3.18
      // THE LAST THREE BOSSES WERE NOT IN THE SAVE AT ALL (found 2026-09-08
      // while writing the profile-isolation suite, which is what that suite
      // was for). Ember, Stoneroot, the Wild Woods and Frostpeak each got
      // their flag added the day their region shipped; Stormreach, the Sunken
      // Vale and the Shadow Court never did. So a child could beat Aria, close
      // the app, and come back to a locked Vale, a moonstone that had never
      // heard of it, a crown whose onward door was shut again, and a map that
      // had forgotten. The forms survived — formsUnlocked is saved — which is
      // exactly why nobody noticed: you kept the Storm Wolf and lost the world.
      // Same for Meri, and same for Grimm, which took the ENDING with it.
      ariaDefeated: !!state.flags.ariaDefeated,
      meriDefeated: !!state.flags.meriDefeated,
      grimmFreed: !!state.flags.grimmFreed,
      gameComplete: !!state.flags.gameComplete,
      // ...and their remembered wounds, on the same law as bossHp/sylvaHp/
      // borealHp/wardenHp: a duel a child left half-won stays half-won.
      ariaHp: state.flags.ariaHp || 0,
      meriHp: state.flags.meriHp || 0,
      grimmHp: state.flags.grimmHp || 0,
      // THE LOST WOLVES (v3.130, design/WIDER-WORLD.md §2.5) — one per pocket
      // dungeon's first room, no fight, no heart: the map's own rescueCount()
      // has read state.flags.rescued since DEN-MINIGAMES §5.1 and nothing had
      // ever written it. Additive-forever, same as pups.
      rescued: { ...(state.flags.rescued || {}) },
    },
    // THE TRIAL LOCK. js/state.js says out loud that it is "persisted rather
    // than transient because a child who quits mid-fight must come back still
    // locked — the wolf they spent at that arch has been spent." It was not
    // persisted. Now it is.
    formLock: state.formLock || null,
    spoken: { ...state.spoken },
    form: state.form,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_PREFIX + state.profileId, JSON.stringify(data));
    // READ IT BACK. A write that "succeeded" into a storage layer which then
    // dropped it is the failure mode that loses a whole evening quietly, and
    // it costs one parse to rule out.
    const check = localStorage.getItem(SAVE_PREFIX + state.profileId);
    if (!check) throw new Error('write reported success but nothing was stored');
    lastSaveOk = true;
  } catch (e) {
    reportSaveFailure(state.profileName || 'this profile', e);
    return false;
  }

  const profiles = loadProfiles();
  const p = profiles.find((x) => x.id === state.profileId);
  if (p) { p.updatedAt = Date.now(); saveProfiles(profiles); }
  return true;
}

// Apply a loaded save (or defaults for a fresh game) onto the run state.
export function applySave(profileId, profileName, data) {
  state.profileId = profileId;
  state.profileName = profileName;
  if (!data) return;
  state.region = data.region || 'ember_hollow';
  if (data.checkpoint && data.checkpoint.room) {
    // A profile saved before the level rebuild points at a retired room.
    // Resolve it HERE rather than only at build time, so state.room and the
    // room actually built are the same string — main.js compares room ids in
    // a dozen places and a mismatch would silently disable those checks.
    state.checkpoint = { ...data.checkpoint, room: resolveRoom(data.checkpoint.room) };
    state.room = state.checkpoint.room;
  }
  state.maxHearts = data.maxHearts || 5;
  state.potions = data.potions !== undefined ? data.potions : 2;
  state.shards = data.shards || 0;
  if (data.inventory && data.inventory.gear) {
    state.inventory = data.inventory;
    // SAVES ARE ADDITIVE FOREVER. The armour slot arrived after these profiles
    // were written, so a save from before it existed has no `armour` key and
    // must still load and still be equippable — not crash, and not silently
    // strand the child in a slot the menu cannot show.
    state.inventory.equipped = state.inventory.equipped || {};
    if (!state.inventory.equipped.armour) state.inventory.equipped.armour = 'plain';
    if (!state.inventory.armours) state.inventory.armours = ['plain'];
    // SAME REASON, and it would have thrown rather than merely degraded.
    // `state.inventory = data.inventory` above replaces the WHOLE object, so a
    // save written without a field arrives without it — and addTreasure()
    // pushes onto this array. A profile from before treasures existed would
    // have crashed on the first one found rather than quietly missing it.
    if (!state.inventory.treasures) state.inventory.treasures = [];
  }
  state.moonGauge = data.moonGauge || 0; // additive: old saves start empty
  state.xp = data.xp || 0;
  state.level = data.level || 1;
  if (data.perks) Object.assign(state.perks, data.perks);
  state.counters = data.counters || {};
  state.stickers = data.stickers || {};
  // additive forever: a profile saved before mini games existed simply has none
  state.minigames = data.minigames || {};
  // THE TWO STARTING FORMS ARE A FLOOR, NOT A SAVED VALUE. Kael is the Knight
  // and the Dark Wolf from minute one — that is the premise of the game, not
  // something earned — so they are re-granted on every load no matter what the
  // file says. A profile written before the Dark Wolf became a starting form
  // (or one that lost it any other way) restored a list without it and the
  // child could never reach him again: Tab only ever found the Knight. Merging
  // rather than replacing also keeps this additive-forever — every form the
  // save DID earn survives untouched.
  const saved = Array.isArray(data.formsUnlocked) ? data.formsUnlocked : [];
  state.formsUnlocked = ['knight', 'dark_wolf', ...saved.filter((f) => f !== 'knight' && f !== 'dark_wolf')];
  state.form = data.form && state.formsUnlocked.includes(data.form) ? data.form : 'knight';
  // pups may be keyed under whichever region was current at save time —
  // flatten every list so travelling between regions never loses them
  const pupList = data.pups ? Object.values(data.pups).flat() : [];
  state.flags.pups = Object.fromEntries(pupList.map((id) => [id, true]));
  if (data.flags) {
    state.flags.bossDefeated = !!data.flags.bossDefeated;
    state.flags.bossProgress = data.flags.bossProgress || 0;
    state.flags.shortcutOpen = !!data.flags.shortcutOpen;
    state.flags.wardenDefeated = !!data.flags.wardenDefeated;
    state.flags.burned = data.flags.burned || {};
    state.flags.cracked = data.flags.cracked || {};
    state.flags.plates = data.flags.plates || {};
    state.flags.chests = data.flags.chests || {};
    state.flags.keys = data.flags.keys || {};
    state.flags.world = data.flags.world || {};
    state.flags.mysteries = data.flags.mysteries || {};
    state.flags.bossHp = data.flags.bossHp || 0;
    state.flags.e2bCleared = !!data.flags.e2bCleared;
    state.flags.sylvaHp = data.flags.sylvaHp || 0;
    state.flags.sylvaDefeated = !!data.flags.sylvaDefeated;
    // v3.21 — additive: a pre-Frostpeak profile simply has no boreal keys,
    // and `|| 0` / `!!undefined` give exactly the fresh-mountain state
    state.flags.borealHp = data.flags.borealHp || 0;
    state.flags.borealDefeated = !!data.flags.borealDefeated;
    // v3.49 — additive, same law: a pre-Stoneroot-fix profile has no wardenHp
    // key, `|| 0` gives the untouched-crypt state, and old builds ignore it
    state.flags.wardenHp = data.flags.wardenHp || 0;
    // The last three regions, restored on the same additive law as the four
    // above: a profile written before this shipped has none of these keys and
    // `!!undefined` / `|| 0` give exactly the untouched state.
    state.flags.ariaDefeated = !!data.flags.ariaDefeated;
    state.flags.meriDefeated = !!data.flags.meriDefeated;
    state.flags.grimmFreed = !!data.flags.grimmFreed;
    state.flags.gameComplete = !!data.flags.gameComplete;
    state.flags.ariaHp = data.flags.ariaHp || 0;
    state.flags.meriHp = data.flags.meriHp || 0;
    state.flags.grimmHp = data.flags.grimmHp || 0;
    // THE LOST WOLVES (v3.130) — additive-forever, same law as pups: an old
    // save has no `rescued` key at all, and `data.flags.rescued || {}` gives
    // exactly the untouched state rather than throwing on the missing field.
    state.flags.rescued = { ...(data.flags.rescued || {}) };
    // v3.18: the "dead machinery" mystery was retired with the mill fiction —
    // old saves that logged it get it quietly marked found (additive law:
    // old profiles must always load clean)
    if (state.flags.mysteries.stone_mill) state.flags.mysteries.stone_mill.found = true;
  }
  state.formLock = data.formLock || null;
  state.spoken = data.spoken || {};
  if (data.settings) {
    // `greybox` is a build-order tool, not a child's preference. An old
    // profile saved while the rebuilt levels were still dev-only carries
    // greybox:true, and restoring it would hand a child a checkerboard. So it
    // is pulled OUT of the spread and thrown away, and the rest is applied.
    //
    // AND THE LINT ATE IT ONCE (v3.117.0 → put back 2026-09-08). The burn-down
    // that made no-unused-vars blocking saw `greybox` here as an unused
    // binding — eslint's `ignoreRestSiblings` defaults to FALSE — and deleted
    // the name, leaving `const { ...prefs }`, which spreads greybox back in.
    // It is the whole point of the line and it read as dead code. Nothing
    // caught it for a day: verify-progression's A7 did, on the push gate. The
    // rule now sets ignoreRestSiblings and tools/eslint.config.mjs says why.
    const { greybox, ...prefs } = data.settings;
    Object.assign(state.settings, prefs);
  }
}
