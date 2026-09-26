// THE WORLD'S DOOR GRAPH, READ OUT OF THE LEVEL FILES (js/mapgraph.js).
//
// The map screen lays rooms out by their real connections: a door on a room's
// north wall puts the room beyond it north on the map. But the door graph has
// only ever existed as `sideDoor(world, 'n', …, 'lg1', …)` calls scattered
// through the level builders (tools/verify-loops.mjs says the same), and it is
// only known to the game once a room has been BUILT — so a map that learned it
// at runtime could never draw a room the child has not stood in, not even the
// faint "there is a door here" outline beside where they are.
//
// So this reads it the way sync-cache.mjs reads the import graph: from source,
// deterministically, into a generated module the map imports. Every door in
// the game is one of two literal forms —
//
//   sideDoor(world, '<n|s|e|w>', halfW, halfD, '<room>', …)   the level kit
//   world.addDoor(minX, maxX, minZ, maxZ, '<room>', …)          the Den + L4
//
// — attributed to the builder function it sits in, and every builder is named
// in its file's `*_ROOMS = { id: buildFn }` export. A raw addDoor's side is
// read from its box: the door zone is thin across the wall it sits in, and the
// sign of that thin coordinate says which wall.
//
//   node tools/gen-mapgraph.mjs            check only; exit 1 if stale
//   node tools/gen-mapgraph.mjs --write    rewrite js/mapgraph.js
//
// A room that ships without regenerating still reaches the map — the game
// records every built room's real doors as it goes (js/mapview.js) and places
// anything unknown beside its `loopsTo` room — but verify-map fails until this
// has been run, so the committed graph cannot quietly fall behind.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'js', 'mapgraph.js');

// Rooms the map never draws: the retired pre-rebuild rooms (state.js
// RETIRED_ROOMS redirects every one of them) and the dev zoo.
const RETIRED = new Set(['r1', 'r1b', 'r2', 'r2b', 'r3', 'k1', 'ka', 'kb',
  'e1', 'e1b', 'e2', 'e2b', 'e3', 'w1', 'w1b', 'w2', 'w2b', 'w3', 'w4', 'w5', 'zoo']);

export function extractGraph() {
  const files = readdirSync(join(ROOT, 'js')).filter((f) => /^(level.*|rooms)\.js$/.test(f));
  const doorsOf = {};     // builder name -> [[side, to]]
  const builderRooms = {}; // builder name -> [room ids]
  for (const f of files.sort()) {
    const src = readFileSync(join(ROOT, 'js', f), 'utf8');
    // builder spans: from one `function buildXxx(` to the next
    const fnRe = /function\s+(build\w+)\s*\(/g;
    const marks = [];
    for (let m; (m = fnRe.exec(src));) marks.push({ name: m[1], at: m.index });
    const ownerAt = (i) => {
      let o = null;
      for (const k of marks) { if (k.at <= i) o = k.name; else break; }
      return o;
    };
    // CONDITIONAL doors — built only once something is true (a dungeon gate
    // broken, a boss down, the Tide Wolf owned, a hub stage reached) — carry a
    // third element, 1. The map draws their path but does not let them reveal
    // the room beyond: a door that is not there yet must not fill in the map.
    // A door is conditional when an `if (` precedes it on its own line, or it
    // sits deeper than a builder's own top-level statements (two spaces) —
    // i.e. inside an if-block or a deferred callback.
    const isCond = (at) => {
      const ls = src.lastIndexOf('\n', at) + 1;
      const lead = src.slice(ls, at);
      return /\bif\s*\(/.test(lead) || /\(\)\s*=>\s*$/.test(lead) || (lead.length - lead.trimStart().length) > 2;
    };
    const add = (owner, side, to, cond) => {
      if (!owner) return;
      const l = doorsOf[f + ':' + owner] || (doorsOf[f + ':' + owner] = []);
      const had = l.find(([s, t]) => s === side && t === to);
      if (!had) l.push(cond ? [side, to, 1] : [side, to]);
      else if (!cond && had.length > 2) had.length = 2;   // an always-there twin wins
    };
    const sdRe = /sideDoor\(\s*world\s*,\s*'([nsew])'\s*,[^,]+,[^,]+,\s*'([A-Za-z0-9_]+)'/g;
    for (let m; (m = sdRe.exec(src));) add(ownerAt(m.index), m[1], m[2], isCond(m.index));
    // levelkit dungeonMouth() (v3.192) is a sideDoor with a live `when` — the
    // gate's own flag — so its doors are conditional by definition
    const dmRe = /dungeonMouth\(\s*world\s*,\s*'([nsew])'\s*,[^,]+,[^,]+,\s*'([A-Za-z0-9_]+)'/g;
    for (let m; (m = dmRe.exec(src));) add(ownerAt(m.index), m[1], m[2], true);
    const adRe = /world\.addDoor\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*'([A-Za-z0-9_]+)'/g;
    for (let m; (m = adRe.exec(src));) {
      // halfW/halfD stand in as 10: only the SIGN and the thinness matter
      const num = (e) => {
        try { return Function('halfW', 'halfD', 'return (' + e + ')')(10, 10); } catch { return NaN; }
      };
      const [x0, x1, z0, z1] = [m[1], m[2], m[3], m[4]].map(num);
      if ([x0, x1, z0, z1].some(Number.isNaN)) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const thinX = Math.abs(x1 - x0) < Math.abs(z1 - z0);
      const side = thinX ? (cx < 0 ? 'w' : 'e') : (cz < 0 ? 'n' : 's');
      add(ownerAt(m.index), side, m[5], isCond(m.index));
    }
    // `*_ROOMS = { la: buildLa, … }` — and rooms.js's one big ROOMS spread
    const tblRe = /(?:_ROOMS|\bROOMS)\s*=\s*\{([\s\S]*?)\};/g;
    for (let m; (m = tblRe.exec(src));) {
      for (const e of m[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*(build\w+)/g)) {
        (builderRooms[f + ':' + e[2]] || (builderRooms[f + ':' + e[2]] = [])).push(e[1]);
      }
    }
  }
  const graph = {};
  for (const [key, rooms] of Object.entries(builderRooms)) {
    for (const id of rooms) {
      if (RETIRED.has(id)) continue;
      const doors = (doorsOf[key] || []).filter(([, to]) => !RETIRED.has(to));
      graph[id] = doors.slice().sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]));
    }
  }
  return Object.fromEntries(Object.keys(graph).sort().map((k) => [k, graph[k]]));
}

export function render(graph) {
  const lines = Object.entries(graph).map(([id, d]) =>
    `  ${/^[a-z_][a-z0-9_]*$/i.test(id) ? id : `'${id}'`}: [${d.map(([s, t, c]) => `['${s}', '${t}'${c ? ', 1' : ''}]`).join(', ')}],`);
  return `// GENERATED by tools/gen-mapgraph.mjs — do not edit by hand; run
// \`node tools/gen-mapgraph.mjs --write\` after adding or moving a door.
//
// Every room's doors as [wall side, room beyond, 1 if conditional], read from the level
// builders' own sideDoor()/addDoor() calls. The map screen (js/mapview.js)
// lays the world out from this: a door on the north wall puts its room north.
export const DOORS = {
${lines.join('\n')}
};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = render(extractGraph());
  let cur = '';
  try { cur = readFileSync(OUT, 'utf8'); } catch { /* first run */ }
  if (process.argv.includes('--write')) {
    writeFileSync(OUT, text);
    console.log('wrote', OUT);
  } else if (cur !== text) {
    console.log('✗ js/mapgraph.js is stale — run: node tools/gen-mapgraph.mjs --write');
    process.exit(1);
  } else {
    console.log('✓ js/mapgraph.js matches the level files');
  }
}
