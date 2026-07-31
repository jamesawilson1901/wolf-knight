// WorldState — named per-region flags that drive visible world changes
// (restoration, opened dungeon doors, calmed vents). Persisted through the
// existing save under state.flags.world. See design/SYSTEMS.md.

import { state } from './state.js';

export const WS = {
  get(region, key) {
    return !!(state.flags.world && state.flags.world[region] && state.flags.world[region][key]);
  },
  set(region, key, v = true) {
    if (!state.flags.world) state.flags.world = {};
    if (!state.flags.world[region]) state.flags.world[region] = {};
    state.flags.world[region][key] = v;
  },
};

// Mystery log — "come back later" promises shown as ??? on the map screen.
// Registered the first time the player SEES the obstacle.
export function logMystery(id, icon, label) {
  if (!state.flags.mysteries) state.flags.mysteries = {};
  if (state.flags.mysteries[id]) return false;
  state.flags.mysteries[id] = { icon, label, found: false };
  return true; // caller shows the "added to map" toast
}

export function resolveMystery(id) {
  if (state.flags.mysteries && state.flags.mysteries[id]) {
    state.flags.mysteries[id].found = true;
  }
}
