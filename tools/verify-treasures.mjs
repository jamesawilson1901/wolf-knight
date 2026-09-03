// A KEEPSAKE HAS TO BE SOMEWHERE.
//
// `state.inventory.treasures` sat in the save file from the beginning —
// declared, persisted on every write, read by nothing at all. js/treasures.js
// is what was missing. This suite holds the four rules that make it safe to
// grow, and the third one is the one that will actually catch somebody:
//
//   1. A treasure is FOUND, never bought — nothing in SHOP_STOCK.
//   2. A treasure DOES NOTHING. No stat, no slot, no unlock. The moment one
//      grants a heart, a child who wants to keep up has to hunt them, and the
//      whole point is that they are optional.
//   3. EVERY REGISTERED TREASURE IS PLACED SOMEWHERE. The registry must not run
//      ahead of the world: an entry with no home shows in the collection as a
//      `???` that can never be filled, which teaches a non-reader they missed
//      something that was never there. Six of these are designed and one is
//      built; this is the check that keeps that order honest.
//   4. Its model file exists and actually loads.
//
// Plus the save law, which would have thrown rather than degraded: load()
// replaces the whole inventory object, so a profile written before treasures
// existed arrives without the array and addTreasure() pushes onto undefined.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'TREASURE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

const reg = await page.evaluate(async () => {
  const { TREASURES } = await import('/js/treasures.js');
  return Object.entries(TREASURES).map(([id, t]) => ({ id, ...t }));
});
console.log(`\n── the registry (${reg.length}) ───────────────────────────────`);
for (const t of reg) console.log(`  ${t.id.padEnd(16)} ${t.name} — ${t.from}`);
check('there are treasures at all', reg.length > 0, { count: reg.length });

console.log('\n── 1. found, never bought ──────────────────────────────');
const stocked = await page.evaluate(async () => {
  const { SHOP_STOCK } = await import('/js/items.js');
  return SHOP_STOCK.map((s) => s.id);
});
const forSale = reg.filter((t) => stocked.includes(t.id)).map((t) => t.id);
check('no treasure is on Maren’s shelf', forSale.length === 0, forSale);

console.log('\n── 2. a treasure does nothing ──────────────────────────');
// Anything that would make one MATTER in a fight. A keepsake that grants a
// heart stops being optional the moment a child notices.
const STAT_KEYS = ['dmg', 'hp', 'heart', 'hearts', 'soak', 'blunt', 'speed',
  'range', 'arc', 'stun', 'grants', 'form', 'perk', 'price'];
const loaded = reg.filter((t) => STAT_KEYS.some((k) => t[k] !== undefined))
  .map((t) => t.id);
check('no treasure carries a stat, a price or a grant', loaded.length === 0, loaded);

console.log('\n── 3. every treasure is placed where a child can reach it ──');
// Read the level sources for `treasure: 'id'` the same way verify-gear reads
// them for gear — the world is the authority on what exists, not this file.
const placed = await page.evaluate(async () => {
  const found = new Set();
  // WHICH FILES HOLD THE WORLD? Asked of sw.js, not written out here.
  //
  // This was a hand-written list of level modules and it was wrong within two
  // hours of being written: the Drowned Market shipped as js/levelMarket.js,
  // its treasure was placed in it, and this scan — not knowing the file existed
  // — reported the keepsake as homeless. A check whose own list can rot is a
  // check that fails correct work, which is the third time that shape of bug
  // has bitten in one session (verify-level1's room lists, verify-density's).
  //
  // sw.js's precache array is the one list that CANNOT be incomplete: a JS file
  // missing from it is missing from the PWA offline, so the deploy rule already
  // forces it to be total. Read the world's files out of that.
  const sw = await (await fetch('/sw.js')).text();
  const files = [...sw.matchAll(/'\.\/(js\/(?:level[A-Za-z0-9]*|rooms)\.js)'/g)]
    .map((m) => m[1]);
  for (const f of files) {
    const src = await (await fetch(`/${f}`)).text();
    for (const m of src.matchAll(/\btreasure:\s*'([a-z0-9_]+)'/g)) found.add(m[1]);
  }
  return [...found];
});
const homeless = reg.filter((t) => !placed.includes(t.id)).map((t) => t.id);
check('the registry has not run ahead of the world', homeless.length === 0,
  { homeless, placed });
const ghosts = placed.filter((id) => !reg.some((t) => t.id === id));
check('...and no chest hands out a treasure that does not exist', ghosts.length === 0, ghosts);

console.log('\n── 4. the models are real ──────────────────────────────');
const models = await page.evaluate(async (ids) => {
  const { loadGLB } = await import('/js/assets.js');
  const { TREASURES } = await import('/js/treasures.js');
  const out = [];
  for (const id of ids) {
    try { await loadGLB(TREASURES[id].file); out.push({ id, ok: true }); }
    catch (e) { out.push({ id, ok: false, file: TREASURES[id].file }); }
  }
  return out;
}, reg.map((t) => t.id));
check('every treasure model loads', models.every((m) => m.ok), models.filter((m) => !m.ok));

console.log('\n── 5. collecting one sticks, and sticks only once ──────');
const collect = await page.evaluate(async (id) => {
  const { addTreasure, ownsTreasure, treasureCount } = await import('/js/treasures.js');
  const g = window.__game;
  const before = treasureCount();
  const first = addTreasure(id);
  const second = addTreasure(id);   // idempotent: a re-opened chest must not double
  return { before, first, second, owns: ownsTreasure(id), after: treasureCount(),
    inState: [...g.state.inventory.treasures] };
}, reg[0].id);
check('collecting a treasure records it', collect.first === true && collect.owns, collect);
check('...and collecting it twice does not double it',
  collect.second === false && collect.after === collect.before + 1, collect);

console.log('\n── 6. a save without the field still loads ─────────────');
// The additive-forever law, tested the way it would actually break: load()
// replaces the whole inventory object.
const oldSave = await page.evaluate(async () => {
  const g = window.__game;
  delete g.state.inventory.treasures;          // a profile from before this existed
  const { addTreasure } = await import('/js/treasures.js');
  let threw = null;
  try { addTreasure('banked_ember'); } catch (e) { threw = String(e.message || e); }
  return { threw, treasures: g.state.inventory.treasures };
});
check('addTreasure survives an inventory with no treasures array',
  oldSave.threw === null, oldSave);

await b.close();
console.log(errors.length
  ? `\n✗ FAIL — ${errors.length} problem(s)`
  : '\n✓ PASS — every keepsake is findable, inert, and remembered');
process.exit(errors.length ? 1 : 0);
