// EVERY ROOM IN THE GAME, ASKED OF THE GAME.
//
// Nine test files carried their own hand-written copy of the room list, and
// four of them are game-wide invariants — nothing hovers, no doorway is just a
// hole, every room has something to do, no door is locked. Not one of those
// four had ever heard of the Village, which shipped ten rooms; none had heard
// of the Spire. So they ran, they went green, and they were green about a
// smaller game than the one that exists.
//
// verify-landings' own header already predicted this in another context: "a
// hand-kept list of room ids rots every time a level is rebuilt, and this one
// rotted twice." It was right, and the answer is not to patch the fourth
// instance — it is to stop keeping the list by hand.
//
// `ROOMS` in js/rooms.js is the registry the game itself builds from, so it
// cannot be wrong about which rooms exist. Importing it from the page by its
// absolute URL resolves to the module instance the page ALREADY loaded (ES
// module identity is the resolved URL), so this reads the live registry rather
// than making a second copy of it — and it only ever reads the keys.
//
// ---------------------------------------------------------------------------
// WHAT THE HAND-KEPT LISTS WERE ACTUALLY MISSING
//
// The live registry holds 154 rooms; the hand-kept copy in verify-reachable
// held 108. The 46-room difference is three different things, and only one of
// them is safe to sweep in without thinking:
//
//   * 15 rooms of MISSING REGIONS — the Village (ysq, yhs, ylw, yg1-yg6, yrw)
//     and the Spire (m1, m2, ma, mb, m3). Modern, dressed, played. These are
//     the ones the rot cost us, and they come back automatically now.
//   * 3 SHORTCUT ROOMS in regions that ARE covered — tsA and tsB (the Wild
//     Woods' log and root shortcuts) and ssA (Stormreach's bridged stair).
//     Also modern, also played, also never checked by anything.
//   * 28 LEGACY rooms, below.
//
// LEGACY is excluded, and NOT because those rooms do not matter — several are
// live and played (Frostpeak's f1-f5 is the region's real, current build; so
// are the Den, w3, e2 and e2b). It is excluded because no hand-kept list ever
// contained it, so nothing here has ever been asserted about any of it, and
// switching five game-wide invariants onto 28 unexamined rooms at once turns
// "does my change break anything" into "here are forty pre-existing findings
// from rooms nobody touched". That is a deliberate piece of work with its own
// judgement calls, not a side effect of adding a region.
//
// The point of the split is that it is now VISIBLE and dated instead of being
// an accident of nine copy-pasted arrays. Shrink it on purpose.
export const LEGACY = [
  // retired hand-built rooms, superseded by the l/v/t rebuilds
  'r1', 'r1b', 'r2', 'r2b', 'k1', 'ka', 'kb', 'r3',
  'e1', 'e1b', 'e3', 'w1', 'w1b', 'w2', 'w2b', 'w4', 'w5',
  // live and played, but never covered by any hand-kept list either — this is
  // a REAL gap, written down rather than quietly perpetuated
  'den', 'e2', 'e2b', 'w3', 'f1', 'f1b', 'f2', 'f2b', 'f3', 'f4', 'f5',
  // the metrics greybox: a measuring space, not a played room
  'zoo',
];

export async function allRooms(page, { include = [], exclude = LEGACY } = {}) {
  const ids = await page.evaluate(async () => {
    const m = await import('/js/rooms.js');
    return Object.keys(m.ROOMS || {});
  });
  const drop = new Set(exclude);
  const out = ids.filter((id) => !drop.has(id));
  for (const id of include) if (!out.includes(id)) out.push(id);
  if (!out.length) throw new Error('allRooms: the registry came back empty — did js/rooms.js fail to load?');
  return out;
}
