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

import { state } from './state.js';

const PROFILES_KEY = 'wolfknight:profiles';
const SAVE_PREFIX = 'wolfknight:save:';

export function loadProfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILES_KEY));
    if (Array.isArray(raw)) return raw.filter((p) => p && p.id && p.name);
  } catch (e) { /* corrupt -> fresh */ }
  return [];
}

export function saveProfiles(list) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch (e) {}
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
  try { localStorage.removeItem(SAVE_PREFIX + profileId); } catch (e) {}
}

// Serialize the live run into the profile's save slot.
export function persist() {
  if (!state.profileId) return;
  const pupList = Object.keys(state.flags.pups).filter((k) => state.flags.pups[k]);
  const data = {
    profileId: state.profileId,
    name: state.profileName,
    region: state.region,
    checkpoint: state.checkpoint,
    maxHearts: state.maxHearts,
    formsUnlocked: [...state.formsUnlocked],
    pups: { [state.region]: pupList },
    settings: { ...state.settings },
    flags: {
      bossDefeated: state.flags.bossDefeated,
      shortcutOpen: state.flags.shortcutOpen,
      burned: { ...state.flags.burned },
    },
    spoken: { ...state.spoken },
    form: state.form,
    updatedAt: Date.now(),
  };
  try { localStorage.setItem(SAVE_PREFIX + state.profileId, JSON.stringify(data)); } catch (e) {}

  const profiles = loadProfiles();
  const p = profiles.find((x) => x.id === state.profileId);
  if (p) { p.updatedAt = Date.now(); saveProfiles(profiles); }
}

// Apply a loaded save (or defaults for a fresh game) onto the run state.
export function applySave(profileId, profileName, data) {
  state.profileId = profileId;
  state.profileName = profileName;
  if (!data) return;
  state.region = data.region || 'ember_hollow';
  if (data.checkpoint && data.checkpoint.room) {
    state.checkpoint = data.checkpoint;
    state.room = data.checkpoint.room;
  }
  state.maxHearts = data.maxHearts || 5;
  state.formsUnlocked = Array.isArray(data.formsUnlocked) && data.formsUnlocked.length
    ? data.formsUnlocked : ['knight', 'dark_wolf'];
  state.form = data.form && state.formsUnlocked.includes(data.form) ? data.form : 'knight';
  const pupList = (data.pups && data.pups[state.region]) || [];
  state.flags.pups = Object.fromEntries(pupList.map((id) => [id, true]));
  if (data.flags) {
    state.flags.bossDefeated = !!data.flags.bossDefeated;
    state.flags.shortcutOpen = !!data.flags.shortcutOpen;
    state.flags.burned = data.flags.burned || {};
  }
  state.spoken = data.spoken || {};
  if (data.settings) Object.assign(state.settings, data.settings);
}
