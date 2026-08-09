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

// Called once per level module at load, from its own district table.
export function registerDistrictTints(table, districts) {
  for (const [id, spec] of Object.entries(table)) {
    const d = districts[spec.district];
    if (d && d.tint !== undefined) TINTS.set(id, d.tint);
  }
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
