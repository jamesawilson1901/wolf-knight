// LAW P3 — MATERIAL INTEGRITY: every mesh resolves an intentional material.
//
// Known-bad (context pack §1.7/§11.4, fixed in 2a7c83d): the Den's trees
// (tree-a.glb/tree-b.glb) were tinted via a `denTint(m, {...})` call that
// only ever named `grass`/`dirt`/`foliage` — but those models' real
// material names are `leafsGreen`/`woodBark`/`woodInner`, and `foliage`
// doesn't exist on either model. The real leaf/trunk materials were never
// mentioned anywhere in buildDen, so the canopies rendered in the model's
// own baked turquoise for as long as the Den existed — a silent no-op,
// not an error, exactly LAW 10's "reports clean and is believed" failure.
//
// A first pass at this ruler tried to assert BOTH directions as hard
// failures for the Den's whole kit (every real material must be named by
// some denTint call; every denTint key must match a real material). Real
// run against live code: false-positived on flowers keeping their own
// natural color and barrel/crate/torch materials that were never meant to
// take the den palette — "every material must be tinted" isn't actually
// the law here, and the codebase has no way to declare "this one's
// deliberate." Downgraded to NOTES (a human call), and kept ONE hard,
// zero-false-positive check: a targeted regression guard for the exact
// materials this bug involved, per LAW 10 §6.5's "add durable checks for
// the specific incident" precedent (see check-variant-names.mjs,
// verify-combat-laws.mjs §9 — same pattern, same session).
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const problems = [];
const notes = [];
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { console.log(`✗ ${m}`); problems.push(m); };

const KIT = [
  './assets/env/den-survival/tent.glb', './assets/env/den-town/cart.glb',
  './assets/env/tree-a.glb', './assets/env/tree-b.glb',
  './assets/env/flower-a.glb', './assets/env/flower-b.glb',
  './assets/env/dungeon/Barrel.glb', './assets/env/dungeon/Crate.glb', './assets/env/dungeon/Torch.glb',
];
// The exact materials the known-bad involved — tree-a/tree-b's real leaf
// and trunk names. Any of these missing from every denTint() call in
// buildDen is the SAME bug shipping again, not a judgment call.
const MUST_BE_TINTED = ['leafsGreen', 'woodBark', 'woodInner'];

const rooms = readFileSync('js/rooms.js', 'utf8');
const denBlock = (rooms.match(/async function buildDen\(scene\) \{[\s\S]*?\n\}\n/) || [''])[0];
if (!denBlock) { console.log('✗ could not find buildDen — ruler is broken, stopping'); process.exit(1); }
const usedKeys = new Set();
for (const call of denBlock.matchAll(/denTint\([^,]+,\s*\{([^}]*)\}/gs)) {
  for (const k of call[1].matchAll(/(\w+):/g)) usedKeys.add(k[1]);
}

const n0 = problems.length;
for (const name of MUST_BE_TINTED) {
  if (!usedKeys.has(name)) bad(`'${name}' (tree-a/tree-b's real leaf/trunk material) is never named in any denTint() call — the turquoise-canopy bug, again`);
}
if (problems.length === n0) ok(`the known-bad materials (${MUST_BE_TINTED.join(', ')}) are all named by some denTint() call`);

// Informational sweep of the Den's whole kit vs the tint keys — real
// signal, but "should this be tinted?" needs a human, so these are NOTES.
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 400, height: 300 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
const kitMaterials = await page.evaluate(async (list) => {
  const { loadGLB } = await import('/js/assets.js');
  const names = new Map();
  for (const u of list) {
    const g = await loadGLB(u);
    const seen = new Set();
    g.scene.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) if (m && m.name) seen.add(m.name);
    });
    for (const name of seen) { if (!names.has(name)) names.set(name, []); names.get(name).push(u); }
  }
  return [...names.entries()];
}, KIT);
await b.close();

for (const [name, users] of kitMaterials) {
  if (!usedKeys.has(name)) notes.push(`material '${name}' (${users.join(', ')}) is never named in any denTint() call — check by eye: deliberate (keeps its own color) or missed?`);
}
const realNames = new Set(kitMaterials.map(([n]) => n));
for (const key of usedKeys) {
  if (!realNames.has(key)) notes.push(`denTint key '${key}' matches no material in this KIT list — dead key, a typo, or targets a model outside this ruler's scope (${KIT.length} of buildDen's models, not all of them)`);
}
if (notes.length) { console.log('\nNOTES (human judgment, not asserted failures):'); for (const n of notes) console.log('  · ' + n); }

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL CLEAN.');
process.exit(problems.length ? 1 : 0);
