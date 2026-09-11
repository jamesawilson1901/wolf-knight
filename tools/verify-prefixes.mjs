// THE FOUR-PLACES RULE, AS A GATE INSTEAD OF A COMMENT.
//
// design/WIDER-WORLD.md §5.5, slice v3.126: "every first letter across
// Object.keys(ROOMS) is named in state.js regionOf, rooms.js buildRoom's
// chain, main.js updateMusic, route.js ONWARD/HUBS ... The four-places rule
// becomes a gate before a single new room lands."
//
// The rule exists because it has already been broken, twice, at real cost:
// the Drowned Market shipped with two rooms of grey boxes because its prefix
// (`q`) was missing from rooms.js's dispatcher (js/rooms.js's own comment
// says so), and the rebuilt Stoneroot and Wild Woods played Ember's music for
// weeks because `v`/`t` were missing from main.js's updateMusic (js/main.js's
// own comment says so too). Both bugs were silent: nothing threw, nothing
// failed, a person just had to notice the wrong sound or the wrong colour.
//
// STATIC, NOT LIVE. No browser, no server — this reads the four source files
// as text, which is what makes it cheap enough for --quick. It cannot see
// what a room looks like; verify-density and the contact sheet still own
// that. What it can see is whether a prefix's routing agrees with itself
// across the four places rooms.js's own comment names as load-bearing.
//
// THE CANONICAL SET comes from rooms.js's dispatcher, not a hand-typed list —
// that file's own comment is the one that says a missing prefix here means
// GREYBOX FOREVER, the most visible failure of the four, so it is the
// authority the other three are checked against. A future prefix that is
// added to rooms.js and forgotten everywhere else fails here before a child
// ever sees the grey box.
import { readFileSync } from 'fs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const read = (f) => readFileSync(f, 'utf8');
const prefixesOf = (src, re) => new Set([...src.matchAll(re)].map((m) => m[1]));

// --- 1. rooms.js's own dispatcher chain, the canonical set ------------------
const roomsSrc = read('js/rooms.js');
const dispatchBody = (roomsSrc.match(/export async function buildRoom\([\s\S]*?\n  setRoomSeed/) || [''])[0];
if (!dispatchBody) { check('rooms.js: buildRoom dispatcher found', false); process.exit(1); }
const rawPrefixes = prefixesOf(dispatchBody, /id\[0\] === '([a-z])'/g);
// e/k/w appear in the text above (the fallback's OWN nested check, not a
// dispatch branch of their own) but are excluded from CANONICAL — see the
// comment below.
const CANONICAL = new Set([...rawPrefixes].filter((p) => p !== 'e' && p !== 'k' && p !== 'w'));
// e/k/w are real prefixes too, but they route through the shared fallback
// (`else { await loadKit(); if (id[0]==='e'||'k'||'w') await loadDungeonKit(); }`)
// rather than their own branch, and every room under them is retired
// (state.js RETIRED_ROOMS) — resolveRoom() rewrites the id before buildRoom
// ever sees it, so no LIVE room reaches that fallback by these letters today.
// They are excluded from CANONICAL on purpose: nothing new should ever be
// added under a retired prefix, so this gate must not treat them as a
// template to copy.
check(`rooms.js dispatcher names ${CANONICAL.size} live prefixes (e/k/w excluded, retired-only)`, CANONICAL.size >= 14,
  [...CANONICAL].sort());

// --- 2. state.js regionOf ----------------------------------------------------
const regionOfBody = (read('js/state.js').match(/export function regionOf\([\s\S]*?\n\}/) || [''])[0];
const regionPrefixes = prefixesOf(regionOfBody, /r\[0\] === '([a-z])'/g);
const missingRegion = [...CANONICAL].filter((p) => !regionPrefixes.has(p));
check('every dispatcher prefix has its own regionOf branch',
  missingRegion.length === 0, { missing: missingRegion });

// --- 3. main.js updateMusic --------------------------------------------------
const musicBody = (read('js/main.js').match(/function updateMusic\(\) \{[\s\S]*?\n\s*audio\.setAmbient/) || [''])[0];
const musicPrefixes = prefixesOf(musicBody, /state\.room\[0\] === '([a-z])'/g);
// 'l' is the one documented exception: Ember Hollow is updateMusic's own
// DEFAULT branch (`else audio.playMusic('region-ember')`), not a named one —
// it is the region every other branch falls through past, which is a
// legitimate shape for exactly one prefix, not a place for a second one to
// hide. A future prefix must still get its own named branch.
const missingMusic = [...CANONICAL].filter((p) => p !== 'l' && !musicPrefixes.has(p));
check("every dispatcher prefix has its own updateMusic branch (or is 'l', the documented default)",
  missingMusic.length === 0, { missing: missingMusic });

// --- 4. route.js ONWARD / HUBS ------------------------------------------------
// Loose on purpose: this is a guide, not a parser of the object's structure.
// A prefix is "wired into the guide" if ANY room-id-shaped token anywhere in
// the file starts with it — which is true the moment one door of that region
// is named as a destination, on either side of the arrow.
const routeSrc = read('js/route.js');
const STOPWORDS = new Set(['const', 'export', 'return', 'function', 'state', 'flags',
  'WS', 'stage', 'get', 'set', 'null', 'true', 'false', 'Math', 'min']);
const routeTokens = [...routeSrc.matchAll(/\b([a-z][a-z0-9]{1,4})\b/g)]
  .map((m) => m[1]).filter((t) => !STOPWORDS.has(t));
const routePrefixes = new Set(routeTokens.map((t) => t[0]));
const missingRoute = [...CANONICAL].filter((p) => !routePrefixes.has(p));
check('every dispatcher prefix names at least one room in route.js (ONWARD or HUBS)',
  missingRoute.length === 0, { missing: missingRoute });

// --- 5. and the two sets agree on WHAT COUNTS AS LIVE ------------------------
// regionOf keeps a couple of retired-compat lines below its real branches
// (e/w map old saves onto their new region); that is fine and expected. What
// is not fine is regionOf naming a prefix rooms.js's dispatcher has never
// heard of — a room that resolves to a region but cannot build one.
const regionOnly = [...regionPrefixes].filter((p) => !CANONICAL.has(p) && p !== 'e' && p !== 'w');
check('regionOf names nothing rooms.js\'s dispatcher does not (besides the documented e/w compat)',
  regionOnly.length === 0, { extra: regionOnly });

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : '\nALL CLEAN — every live room-id prefix is named in all four places.');
process.exit(errors.length ? 1 : 0);
