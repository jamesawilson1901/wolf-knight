// WHAT COLOUR IS THE NEXT ROOM?
//
// Every district already carries its own colour temperature, and that is the
// game's wayfinding: a child recalls "the orange bit" long before they could
// read a map. But you can only see a district once you are standing in it, so
// the colour tells you where you ARE and never where you are GOING — and a
// doorway that shows you nothing gives you no reason to walk through it.
//
// Terranigma and Zelda pull you forward because you can see the next thing and
// want it. This registry is the cheapest possible version of that: a doorway
// asks what colour the room beyond is, and spills a little of it onto the floor
// at your feet. No preview geometry, no streaming, one draw call.
//
// A registry rather than an import because levelkit.js is imported BY level1,
// level2 and level3 — reaching back into them for their district tables would
// be a cycle. Each level registers its own rooms as it loads; anything not
// registered simply has no bleed, which is the correct behaviour for the Den
// and the retired rooms.

const TINTS = new Map();

// EVERYTHING THE MAP SCREEN NEEDS TO KNOW ABOUT A ROOM, recorded here at the
// same moment as its tint and from the same table — the level's own spec
// (`L1`, `L2`, … `LN`), which is the one place a room's name, kind and place on
// the spine are already written down. The map used to keep its own hand list
// of rooms, and that list rotted two rebuilds ago: Ember's rows pointed at
// retired ids that `resolveRoom` redirects, so "you are here" could never
// light in Level 1, and seven regions were simply not on it. A room cannot
// exist without passing through here, so the map cannot be wrong about which
// rooms exist. Insertion order is authoring order, which every table writes
// as the walk.
const META = new Map();

// Called once per level module at load, from its own district table.
export function registerDistrictTints(table, districts) {
  for (const [id, spec] of Object.entries(table)) {
    const d = districts[spec.district];
    if (d && d.tint !== undefined) TINTS.set(id, d.tint);
    META.set(id, {
      id,
      label: spec.label || id,
      kind: spec.kind || '',
      spine: !!spec.spine,
      loopsTo: spec.loopsTo || null,
      district: d ? (d.name || spec.district) : spec.district,
      tint: d && d.tint !== undefined ? d.tint : null,
    });
  }
}

// Every registered room, in authoring order. The map screen filters this by
// region; nothing else should need the whole list.
export function registeredRooms() {
  return [...META.values()];
}

export function roomMeta(id) {
  return META.get(id) || null;
}

// The display tint of a room's district, or null if it is not a dressed
// district room. Callers must treat null as "draw nothing".
export function districtTint(roomId) {
  const t = TINTS.get(roomId);
  return t === undefined ? null : t;
}

// Do two rooms belong to the same district? Used to decide how hard a
// transition should be: within a district a door is barely a door, between
// districts it is a threshold worth marking.
export function sameDistrict(a, b) {
  const ta = TINTS.get(a), tb = TINTS.get(b);
  return ta !== undefined && ta === tb;
}
