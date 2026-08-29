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
// `zoo` is excluded by default: the metrics greybox is a measuring space, not
// a played room, and every suite that hard-coded a list had left it out.
export async function allRooms(page, { include = [], exclude = ['zoo'] } = {}) {
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
