// NOTHING STANDS INSIDE ANYTHING ELSE.
//
// Dad, on a screenshot of the Den with four things circled: "a house, a wagon,
// a character and a barrel all merged and placed on top of and cutting through
// one another... these appear everywhere in the entire game making it look
// amateur and cheap."
//
// The cause, in one sentence: every prop position in this game is a hand-typed
// coordinate, and until v3.186 nothing had ever measured whether the model
// DRAWN at that spot hits the model already there. The only footprints the game
// knew about were hand-typed circles — and measured in the Den, those run 35-45%
// smaller than the models they stand for (the cart is drawn 1.3 x 1.6 and
// declared r0.7; its neighbour 1.1 x 1.5 declared r0.42; the merchant 1.1 x 1.0
// declared r0.35). So every clearance check in the codebase has been asking
// whether a spot is clear of a fiction.
//
// World.separateProps() (js/world.js, run from flattenStatic) now pushes
// clutter out of whatever it is standing in. This is the proof that it worked,
// and the gate that stops the next room reintroducing it.
//
// WHY THIS SUCCEEDS WHERE tools/check-overlap.mjs DID NOT.
//
// That tool measures real mesh bounds too, and it was run by hand once
// (2026-08-22) and closed as "all false positives" — because, in its own words,
// "a hero-prop sculpture built from deliberately stacked/touching pieces (the
// Kiln) reads geometrically identical to two props accidentally placed on top
// of each other. This tool cannot tell the two apart."
//
// It can, and the signal was already in the scene graph. A deliberate
// composition is built into ONE group by ONE helper — heroProp() stacks the
// Kiln's boulders into a single THREE.Group, ruinedHome() puts its walls,
// doorway and spilled goods into a single THREE.Group. Two things a person
// placed separately are separate top-level props. So: pieces sharing a
// top-level parent are composition and are ignored; two different props sharing
// space is always a bug. That one line turns an un-actionable report into a
// gate, and it is why this runs over all 193 rooms instead of a hand-picked 32.
import { launchBrowser } from './launch.mjs';

// Deliberate compositions that are NOT one group, named one at a time with a
// reason each. A blanket tolerance would hide the next real one; this cannot.
// { room, x, z, r, why } — touching props inside this circle are intended.
const ALLOWED = [];

const errors = [];
const check = (n, ok, d) => {
  console.log(`${ok ? '✓ ' : '✗ '}${n}` + (d !== undefined ? ' ' + JSON.stringify(d) : ''));
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
// Before any module runs: rooms must build UNMERGED or every prop's bounds are
// the bounds of the batch it was welded into (verify-grounded's own lesson).
// separateProps still runs — it sits above this escape hatch in flattenStatic
// on purpose, so what is measured here is what the game actually ships.
await page.addInitScript(() => { window.__noBatch = true; });
// `--raw` measures the room with the separation pass OFF: the state the game
// was in before v3.186, by the identical ruler, so "how bad was it" and "is it
// fixed" are the same number asked twice rather than two different tools.
const RAW = process.argv.includes('--raw');
if (RAW) await page.addInitScript(() => { window.__noSeparate = true; });
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'INTERPEN');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.voice = false; g.state.settings.musicVol = 0;
  g.state.settings.greybox = false;
});

const PEN = 0.12;   // the same whisker World.separateProps() works to

const report = await page.evaluate(async ({ PEN, ALLOWED }) => {
  window.__noBatch = true;
  const roomsMod = await import('/js/rooms.js');
  const THREE = await import('three');
  const out = [];
  for (const id of Object.keys(roomsMod.ROOMS)) {
    let w;
    try { w = await roomsMod.buildRoom(id, new THREE.Scene()); }
    catch (e) { out.push({ id, error: String((e && e.message) || e) }); continue; }
    const props = w.propFootprints();
    const hits = [];
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const a = props[i], bb2 = props[j];
        if (a.comp === bb2.comp) continue;   // one prop's own pieces
        const d = Math.hypot(a.x - bb2.x, a.z - bb2.z);
        const pen = (a.r + bb2.r) - d;
        if (pen <= PEN) continue;
        const x = (a.x + bb2.x) / 2, z = (a.z + bb2.z) / 2;
        if (ALLOWED.some((k) => k.room === id && Math.hypot(k.x - x, k.z - z) <= k.r)) continue;
        hits.push({ x: +x.toFixed(1), z: +z.toFixed(1), pen: +pen.toFixed(2) });
      }
    }
    hits.sort((p, q) => q.pen - p.pen);
    out.push({ id, props: props.length, hits: hits.length, worst: hits.slice(0, 5),
      sep: w._separated || null });
  }
  return out;
}, { PEN, ALLOWED });

const built = report.filter((r) => !r.error);
const broke = report.filter((r) => r.error);
const totalHits = built.reduce((n, r) => n + r.hits, 0);
const roomsHit = built.filter((r) => r.hits > 0);
const moved = built.reduce((n, r) => n + ((r.sep && r.sep.moved) || 0), 0);
const dropped = built.reduce((n, r) => n + ((r.sep && r.sep.dropped) || 0), 0);

console.log('\n── what the separation pass did ───────────────────────');
console.log(RAW ? '   --raw: separation OFF, this is the room as it was authored'
  : `   ${moved} prop(s) pushed clear, ${dropped} removed with nowhere clear to stand`);

console.log('\n── what is left ───────────────────────────────────────');
check('every room builds', broke.length === 0, broke.slice(0, 5));
for (const r of roomsHit.sort((a, c) => c.hits - a.hits).slice(0, 25)) {
  console.log(`   ${r.id.padEnd(6)} ${String(r.hits).padStart(3)} pair(s) of ${r.props} props   `
    + r.worst.map((h) => `(${h.x}, ${h.z}) by ${h.pen}u`).join('  '));
}
check('no prop stands inside another prop',
  totalHits === 0, { pairs: totalHits, rooms: roomsHit.length, of: built.length });

console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)`
  : `\n✓ PASS — ${built.length} rooms, nothing merged into anything else`);
await b.close();
process.exit(errors.length ? 1 : 0);
