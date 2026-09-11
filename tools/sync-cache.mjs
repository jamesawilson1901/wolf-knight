// THE HAND-KEPT LISTS THAT BITE ON EVERY DEPLOY.
//
// 1. sw.js's PRECACHE module block. It was typed by hand, and on 2026-09-05 it
//    was missing FIVE modules the game actually imports — attacks, districts,
//    dressing, equipscene, ground — three of which every single level file
//    imports. That is not cosmetic. `install` only waits for CORE (the .js/
//    .html/.json entries), `activate` deletes every older cache, and the fetch
//    handler throws "offline and not cached" for anything absent. So a child
//    who opened the game right after an update, on a tablet with no signal,
//    could boot to the title and then fail to build any room at all.
//
// 2. The `#badge` version in index.html. CLAUDE.md says to bump it with
//    CACHE_NAME on every deploy, in bold, because letting them drift once cost
//    half an hour chasing a phantom cache bug (2026-08-29). A rule a human has
//    to remember on every deploy is a rule that gets forgotten; this is the
//    same rule, enforced.
//
// THE MODULE LIST IS COMPUTED FROM THE IMPORT GRAPH, not from `ls js/`. It
// walks static `from './x.js'` and dynamic `import('./x.js')` out from the
// entry in index.html. That is the difference between "every file in the
// folder" and "every file the game loads": js/skinify.js is in the folder,
// is imported by nothing, and correctly does NOT get precached. A dead file
// should not cost a child bandwidth on a phone.
//
//   node tools/sync-cache.mjs            check only; exit 1 if either drifted
//   node tools/sync-cache.mjs --write    rewrite both to match
//
// 3. sw.js's SPOKEN-LINE list. Since 2026-09-08 every narration line ships as
//    a pre-rendered ogg (tools/tts-narration.py), and there are two hundred of
//    them — a hand-kept list of two hundred filenames is a list that is wrong
//    the first time a line is added. It is generated from what is on disk.
//
// 4. sw.js's RUNTIME-ASSET list (2026-09-09, design/WIDER-WORLD.md §6
//    v3.126). Everything below the module and VO blocks was STILL hand-typed,
//    and measured against the tree it was wrong in two ways at once:
//
//      - assets/env/village/* — 20 GLBs `loadVillageKit` loads by literal
//        path — was ABSENT from sw.js entirely, though the Den and every
//        Village room load it. A child opening the game offline right after
//        an update could boot to the title and fail to build the Den.
//      - assets/generated/enemies/*.glb is loaded by TEMPLATE LITERAL
//        (`` `./assets/generated/enemies/${id}.glb` ``, js/enemies.js), which
//        no string-literal scan can see — so none of the 23 live KayKit
//        roster bodies were cached either, and the same offline child fails
//        to build any Court, Vale or Stormreach room with a roster enemy in
//        it. The folder also holds NINE dead bakes from an earlier pass
//        (`cinder-bat`, `ember-dragonling`, `frost-bat`, `frost-dragonling`,
//        `gloom-slime`, `magma-slime`, `rime-slime`, `shadow-dragonling`,
//        `toxin-slime` — all real MONSTER_ROSTER ids that load a shared
//        Quaternius base instead, per the comment at enemies.js:3661) that a
//        naive `readdirSync` would sweep in for nothing; this reads the live
//        id list out of `KAYKIT_ROSTER` itself instead, so a body is cached
//        exactly when something can load it, never before, never after it is
//        retired.
//
//    What a plain literal scan still cannot see: a GLB's OWN internal
//    material can point at a sibling texture (`props_atlas.png`, shared by
//    all 21 Small Props Pack pieces per the note in js/levelVillage.js:81-83)
//    that no JS source ever names. That is the same class of gap the sword
//    and shield .bin companions below have always needed a human to notice —
//    documented once here rather than silently missing again.
//
// verify-boot.mjs runs the check, so none of these can rot again quietly.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SW = join(ROOT, 'sw.js');
const HTML = join(ROOT, 'index.html');
const WRITE = process.argv.includes('--write');

// --- 1. the import graph, from the entry index.html actually loads ----------
const html = readFileSync(HTML, 'utf8');
const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="\.\/([^"]+)"/);
if (!entryMatch) throw new Error('index.html has no <script type="module" src="./...">');

// Both shapes, in one pass: `from './x.js'` / `from "./x.js"` and the dynamic
// `import('./x.js')`. Bare specifiers ("three") are import-map entries, not
// files in this repo, and are skipped — vendor/ is precached by hand.
const SPEC = /(?:from\s*|import\s*\(\s*)['"](\.[^'"]+\.js)['"]/g;

const seen = new Set();
const order = [];
const walk = (relPath) => {
  if (seen.has(relPath)) return;
  seen.add(relPath);
  order.push(relPath);
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`imported but missing on disk: ${relPath}`);
  const src = readFileSync(abs, 'utf8');
  for (const m of src.matchAll(SPEC)) {
    const next = relative(ROOT, resolve(dirname(abs), m[1])).split('\\').join('/');
    walk(next);
  }
};
walk(entryMatch[1]);

// Entry first (it is the one that must be there), then alphabetical, so the
// generated block is stable and a diff shows only what really changed.
const entry = order[0];
const modules = [entry, ...order.slice(1).sort()];
const block = modules.map((m) => `  './${m}',`).join('\n');

// --- 2. splice it into sw.js between the sentinels --------------------------
const swSrc = readFileSync(SW, 'utf8');
const OPEN = '  // <<< generated by tools/sync-cache.mjs — do not edit by hand';
const CLOSE = '  // >>> end generated modules';
const region = new RegExp(`${OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
if (!region.test(swSrc)) throw new Error('sw.js is missing the generated-module sentinels');
let swWanted = swSrc.replace(region, `${OPEN}\n${block}\n${CLOSE}`);

// --- 2b. the spoken lines, from what is actually rendered -------------------
const VO_DIR = join(ROOT, 'assets/audio/vo');
const vo = existsSync(VO_DIR)
  ? readdirSync(VO_DIR).filter((f) => f.endsWith('.ogg')).sort()
  : [];
const VO_OPEN = '  // <<< spoken lines, generated by tools/sync-cache.mjs — do not edit by hand';
const VO_CLOSE = '  // >>> end generated spoken lines';
const voRegion = new RegExp(`${VO_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${VO_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
if (!voRegion.test(swWanted)) throw new Error('sw.js is missing the generated spoken-line sentinels');
const voBlock = vo.map((f) => `  './assets/audio/vo/${f}',`).join('\n');
swWanted = swWanted.replace(voRegion, `${VO_OPEN}\n${voBlock}\n${VO_CLOSE}`);

// --- 2c. the runtime assets: literal paths + the roster's own id list ------
//
// EVERY js/*.js FILE, not just the ones the module walk above reached — the
// walk exists to answer "which JS modules does the entry load", and an asset
// path sitting in a string literal is not a JS import either way, so it costs
// nothing to read the whole folder for this pass.
const ASSET_LIT = /['"](\.\/assets\/[^'"]+\.(?:glb|gltf|bin|png|jpg|jpeg|ogg|mp3|json))['"]/g;
const jsFiles = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const literalAssets = new Set();
for (const f of jsFiles) {
  const src = readFileSync(join(ROOT, 'js', f), 'utf8');
  for (const m of src.matchAll(ASSET_LIT)) literalAssets.add(m[1]);
}

// KAYKIT_ROSTER's own keys — the ids a template literal builds a path from,
// which no string scan can see. Parsed the same way tools/check-roster.mjs
// parses SKINS: the object literal's own top-level `'id': {` lines, bounded
// by the assignment and the matching close-brace this codebase's formatting
// always uses (2-space indent, trailing comma).
const enemiesSrc = readFileSync(join(ROOT, 'js/enemies.js'), 'utf8');
const rosterBlock = (enemiesSrc.match(/const KAYKIT_ROSTER = \{[\s\S]*?\n\};/) || [''])[0];
if (!rosterBlock) throw new Error('js/enemies.js: could not find KAYKIT_ROSTER — the roster body list would silently go empty');
const rosterIds = [...rosterBlock.matchAll(/^ {2}'([a-z0-9-]+)':/gm)].map((m) => m[1]);
for (const id of rosterIds) literalAssets.add(`./assets/generated/enemies/${id}.glb`);

// The one documented exception a literal scan cannot reach (see the header
// note above): props_atlas.png is named only inside the Small Props Pack's
// own GLB materials, never in JS source.
literalAssets.add('./assets/env/village/props_atlas.png');

const runtimeAssets = [...literalAssets].sort();
const RUNTIME_OPEN = '  // <<< runtime assets, generated by tools/sync-cache.mjs — do not edit by hand';
const RUNTIME_CLOSE = '  // >>> end generated runtime assets';
const runtimeRegion = new RegExp(`${RUNTIME_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${RUNTIME_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
if (!runtimeRegion.test(swWanted)) throw new Error('sw.js is missing the generated runtime-asset sentinels');
const runtimeBlock = runtimeAssets.map((p) => `  '${p}',`).join('\n');
swWanted = swWanted.replace(runtimeRegion, `${RUNTIME_OPEN}\n${runtimeBlock}\n${RUNTIME_CLOSE}`);

// Anything the hand-typed lines still list ANYWHERE in PRECACHE that the
// generated block above now covers is a duplicate, not a bug — cache.addAll
// tolerates a repeated URL — but a duplicate is exactly the kind of thing
// that hides real drift on the next read-through, so it is deleted rather
// than left to rot. There are three generated regions in this array by now
// (modules, spoken lines, runtime assets) and the hand-typed lines fall
// BETWEEN and AFTER them, not only after the last one — the music block that
// sits between the module close and the spoken-line open is exactly the case
// a scan of only "after the runtime block" would miss.
{
  const handSet = new Set(runtimeAssets);
  const lines = swWanted.split('\n');
  const arrStart = lines.findIndex((l) => l.includes('const PRECACHE = ['));
  const arrEnd = lines.findIndex((l, i) => i > arrStart && l.trim() === '];');
  const OPENS = new Set([
    '  // <<< generated by tools/sync-cache.mjs — do not edit by hand',
    VO_OPEN, RUNTIME_OPEN,
  ]);
  const CLOSES = new Set([CLOSE, VO_CLOSE, RUNTIME_CLOSE]);
  let inGenerated = false, cut = 0;
  const kept = lines.slice(0, arrStart + 1);
  // A hand-typed line is not always one entry: the gear and forest packs
  // list a companion .bin beside its .gltf on the same physical line
  // (`'./assets/gear/dagger_A.gltf', './assets/gear/dagger_A.bin',`), and the
  // first half of a line like that is exactly as much a duplicate as a
  // whole line would be — the companion .bin stays because a literal scan
  // can never find it, but the .gltf half is now the generated block's job.
  const ONE_ASSET = /'(\.\/assets\/[^']+)'/g;
  for (let i = arrStart + 1; i < arrEnd; i++) {
    const line = lines[i];
    if (OPENS.has(line)) inGenerated = true;
    if (!inGenerated && ONE_ASSET.test(line)) {
      ONE_ASSET.lastIndex = 0;
      const parts = [...line.matchAll(ONE_ASSET)].map((m) => m[1]);
      const keptParts = parts.filter((p) => !handSet.has(p));
      if (keptParts.length !== parts.length) {
        cut += parts.length - keptParts.length;
        if (!keptParts.length) continue;
        const indent = line.match(/^\s*/)[0];
        kept.push(`${indent}${keptParts.map((p) => `'${p}',`).join(' ')}`);
        if (CLOSES.has(line)) inGenerated = false;
        continue;
      }
    }
    kept.push(line);
    if (CLOSES.has(line)) inGenerated = false;
  }
  kept.push(...lines.slice(arrEnd));
  if (cut) swWanted = kept.join('\n');
}

// --- 3. the badge follows CACHE_NAME ---------------------------------------
const version = (swSrc.match(/CACHE_NAME\s*=\s*'wolfknight-(v[\d.]+)'/) || [])[1];
if (!version) throw new Error("sw.js has no CACHE_NAME of the form 'wolfknight-vX.Y.Z'");
const BADGE = /(<div id="badge">Wolf Knight &middot; )v[\d.]+(<\/div>)/;
if (!BADGE.test(html)) throw new Error('index.html has no #badge div in the expected shape');
const htmlWanted = html.replace(BADGE, `$1${version}$2`);

// --- 3b. the byte total — every slice that adds to this list sees its cost -
//
// design/WIDER-WORLD.md §6 v3.126 asks for this printed on every clean run:
// the runtime-asset fix alone is real weight (village GLBs + 23 roster
// bodies), and a plan that keeps adding hearths, dungeons and a fish has to
// see the number moving before it becomes a problem on the tablet this is
// actually played on, not after.
const precacheArray = (swWanted.match(/const PRECACHE = \[([\s\S]*?)\n\];/) || [, ''])[1];
const allUrls = [...precacheArray.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]);
let totalBytes = 0, unreadable = 0;
for (const url of allUrls) {
  if (url === './') continue;
  try { totalBytes += statSync(join(ROOT, url.slice(2))).size; }
  catch { unreadable++; }
}
const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

// --- 4. report or write -----------------------------------------------------
const swDrift = swWanted !== swSrc;
const badgeDrift = htmlWanted !== html;

if (swDrift) {
  const listed = new Set([...swSrc.matchAll(/'\.\/(js\/[^']+)'/g)].map((m) => m[1]));
  const missing = modules.filter((m) => !listed.has(m));
  const extra = [...listed].filter((m) => !modules.includes(m));
  if (missing.length) console.log('precache MISSING (imported but not cached):', missing.join(' '));
  if (extra.length) console.log('precache EXTRA (cached but never imported):', extra.join(' '));
  if (!missing.length && !extra.length) console.log('precache module or spoken-line block is out of date');
}
if (badgeDrift) {
  const was = html.match(/id="badge">Wolf Knight &middot; (v[\d.]+)</);
  console.log(`badge drift: index.html says ${was ? was[1] : '(unreadable)'}, sw.js CACHE_NAME says ${version}`);
}

if (unreadable) console.log(`byte total: ${unreadable} precached url(s) do not resolve to a file on disk — check them by hand`);

if (!swDrift && !badgeDrift) {
  console.log(`ALL CLEAN — ${modules.length} modules, ${runtimeAssets.length} runtime assets and `
    + `${vo.length} spoken lines precached (${totalMB} MB total), badge and CACHE_NAME both ${version}`);
  process.exit(0);
}
if (!WRITE) {
  console.log('\nrun: node tools/sync-cache.mjs --write');
  process.exit(1);
}
if (swDrift) writeFileSync(SW, swWanted);
if (badgeDrift) writeFileSync(HTML, htmlWanted);
console.log(`written — ${modules.length} modules, ${runtimeAssets.length} runtime assets and `
  + `${vo.length} spoken lines precached (${totalMB} MB total), badge and CACHE_NAME both ${version}`);
