// THE STICKER BOOK AS PICTURES — design/WIDER-WORLD.md §3.3, slice v3.132.
//
// Seventeen tiles were an emoji a non-reader cannot decode; most of them
// stand for a thing the game already models, so this is the same no-emoji
// law BUILDLOG.md:3949-3958 already drew for the rest of the UI, extended to
// the one screen it had not reached yet. A row that keeps its emoji (a level
// number, a double jump, a minigame win) is not an oversight — it names an
// ABSTRACT idea with no object in any vendored pack to stand in for it, the
// same exception that already lets the form badges keep theirs.
//
// §1-2 are static (no server); §3-5 need the live game.
import { readFileSync, readdirSync } from 'fs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
const read = (f) => readFileSync(f, 'utf8');

// ============================================================================
console.log('── 1 · every row that names a model actually has one ────────');
// ============================================================================
const progSrc = read('js/progress.js');
const stickersMatch = progSrc.match(/export const STICKERS = \[[\s\S]*?\n\];/);
if (!stickersMatch) { check('STICKERS found in js/progress.js', false); process.exit(1); }
// Parse rows as data rather than eval — this file has no import to run stand-
// alone. Rows are not all one shape (some end after `at: N`, some carry a
// nested `model: {...}` object first), so a single-line-scoped regex misses
// whichever shape it was not written for — split on the one thing every row
// shares instead: the literal text that opens the next one.
const body = stickersMatch[0];
const starts = [...body.matchAll(/\{\s*id:\s*'(\w+)'/g)];
const ROWS = starts.map((m, i) => {
  const from = m.index;
  const to = i + 1 < starts.length ? starts[i + 1].index : body.length;
  const row = body.slice(from, to);
  const counterM = row.match(/counter:\s*'(\w+)'/);
  const fileM = row.match(/model:\s*\{\s*file:\s*'([^']+)'/);
  return { id: m[1], counter: counterM && counterM[1], hasModel: !!fileM, file: fileM && fileM[1] };
});
check(`STICKERS has 21 rows (17 original + 4 non-combat, v3.132)`, ROWS.length === 21, ROWS.map((r) => r.id));

const withModel = ROWS.filter((r) => r.hasModel);
const withoutModel = ROWS.filter((r) => !r.hasModel);
check(`${withModel.length} rows carry a rendered model`, withModel.length >= 12, withModel.map((r) => r.id));
console.log('   (kept as emoji — abstract, no object to render):', withoutModel.map((r) => r.id).join(', '));

// sw.js's precache is generated from every `'./assets/...'` literal in js/*.js
// (tools/sync-cache.mjs) and the deploy gate (verify-boot) already keeps it
// total, so it is the one list that cannot itself be incomplete — read from
// it rather than re-deriving a second copy of "what the game ships".
const swSrc = read('sw.js');
const precached = new Set([...swSrc.matchAll(/'(\.\/assets\/[^']+)'/g)].map((m) => m[1]));
const missing = withModel.filter((r) => !precached.has(r.file));
check('every sticker model is in sw.js’s precache', missing.length === 0,
  missing.map((r) => `${r.id}: ${r.file}`));

// ============================================================================
console.log('\n── 2 · every counter a row reads is bumped somewhere ─────────');
// ============================================================================
// Every counter could legitimately be bumped from anywhere (kills/pots/chests
// live in combat and loot code this slice never touched) — scan the whole
// directory rather than guess which files matter.
const JS_FILES = readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
const bumped = new Set();
for (const f of JS_FILES) {
  for (const m of read(f).matchAll(/bumpCounter\('(\w+)'/g)) bumped.add(m[1]);
}
// `level` is a derived pseudo-counter checkStickers() synthesises from
// state.level, never bumped directly — the one row allowed to name a counter
// with no bumpCounter call anywhere.
const unbumped = ROWS.filter((r) => r.counter !== 'level' && !bumped.has(r.counter));
check('every STICKERS counter is bumped somewhere in js/', unbumped.length === 0,
  unbumped.map((r) => `${r.id}: ${r.counter}`));

console.log(errors.length ? `\n${errors.length} PROBLEM(S) in §1-2:\n` + errors.join('\n')
  : '\n✓ §1-2 clean (static).');

// ============================================================================
let serverUp = !process.env.WK_QUICK;
if (serverUp) {
  try { await (await fetch('http://localhost:8901/', { signal: AbortSignal.timeout(1000) })).text(); }
  catch { serverUp = false; }
}
if (!serverUp) {
  console.log(process.env.WK_QUICK ? '\n(WK_QUICK — skipping §3-5, browser checks)'
    : '\n(no server on :8901 — skipping §3-5, browser checks)');
  process.exit(errors.length ? 1 : 0);
}

const { launch } = await import('./wk-drive.mjs');
const wk = await launch({ dev: true });
const { page } = wk;
await wk.newGame('STICKERS');
await page.evaluate(() => { window.__game.state.settings.captions = false; });

// Open it the way a thumb does — main.js wires no `menus` handle onto
// window.__game, so the real button is the only door in (js/menus.js:37,
// the same shape verify-map.mjs already uses for #map-btn) — and close it
// the same way, so a second open is a real re-render, not a stale DOM read.
const openBook = () => page.evaluate(async () => {
  document.getElementById('sticker-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
  const el = document.getElementById('sticker-menu');
  // The treasure shelf below reuses this same `.sticker`/`.ic.tre-art` markup
  // (js/menus.js showStickers()) but, by design, only paints a thumbnail once
  // a treasure is OWNED — an unfound one stays a blank frame, not a picture.
  // Scope every query to the sticker grid itself (`.grid` sans `.tre-grid`)
  // so that deliberate blank stays out of these checks entirely.
  const stickerSel = '.grid:not(.tre-grid) > .sticker';
  // itemThumb()'s GLB-load-and-render is async and none of these thumbnails
  // are pre-warmed at boot (unlike hudArt.pup/shard) — poll until every art
  // tile actually has a background, rather than guess a frame count.
  for (let i = 0; i < 100; i++) {
    const tiles = [...el.querySelectorAll(`${stickerSel} .ic.tre-art`)];
    if (tiles.every((t) => t.style.backgroundImage)) break;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const tiles = [...el.querySelectorAll(stickerSel)].map((d) => ({
    owned: d.classList.contains('owned'),
    hasArt: !!d.querySelector('.ic.tre-art'),
    hasBg: !!(d.querySelector('.ic.tre-art') && d.querySelector('.ic.tre-art').style.backgroundImage),
    icon: (d.querySelector('.ic:not(.tre-art)') || {}).textContent || null,
    name: (d.children[1] || {}).textContent || '',
  }));
  const hpRow = el.querySelector('.heartpiece-row');
  const out = {
    tiles,
    heartPiece: hpRow ? {
      hasArt: !!hpRow.querySelector('.ic.tre-art'),
      pips: [...hpRow.querySelectorAll('.hp-pips span')].map((s) => s.textContent),
    } : null,
    text: el.textContent,
  };
  const done = el.querySelector('.menu-btn');
  if (done) done.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  return out;
});

console.log('\n── 3 · a fresh save: pictures show, silhouettes for the unearned ──');
const fresh = await openBook();
const modeled = fresh.tiles.filter((t) => t.hasArt);
check('at least twelve tiles rendered a picture, not an emoji', modeled.length >= 12, modeled.length);
check('every pictured tile actually got a background image (art loaded)',
  modeled.every((t) => t.hasBg), modeled.filter((t) => !t.hasBg));
check('none of them are owned yet on a fresh save', fresh.tiles.every((t) => !t.owned));
check('unearned tiles read as ??? (the picture is the reveal, not the name)',
  fresh.tiles.every((t) => t.name === '???'), fresh.tiles.map((t) => t.name));
check('EMOJI (extended pictographic) survives ONLY on rows kept as pictograms',
  fresh.tiles.filter((t) => t.icon && /\p{Extended_Pictographic}/u.test(t.icon))
    .every((t) => !t.hasArt), fresh.tiles);

console.log('\n── 4 · earn one, and it stops being ??? ──────────────────');
await page.evaluate(async () => {
  const { bumpCounter } = await import('/js/progress.js');
  bumpCounter('kills'); // first_blood fires at 1
});
const earned = await openBook();
check('at least one tile is owned and named after earning a counter',
  earned.tiles.some((t) => t.owned && t.name !== '???'), earned.tiles.filter((t) => t.owned));

console.log('\n── 5 · the heart-piece readout: a picture, four pips, no text ──');
check('the heart-piece row exists with its own model', !!fresh.heartPiece && fresh.heartPiece.hasArt, fresh.heartPiece);
check('at 0 held, all four pips read empty', fresh.heartPiece && fresh.heartPiece.pips.every((p) => p === '🤍'),
  fresh.heartPiece && fresh.heartPiece.pips);
await page.evaluate(() => { window.__game.state.inventory.heartPieces = 2; });
const twoHeld = await openBook();
check('at 2 held, exactly two pips read filled', twoHeld.heartPiece
  && twoHeld.heartPiece.pips.filter((p) => p === '❤️').length === 2, twoHeld.heartPiece);
const hpText = await page.evaluate(() => {
  const el = document.querySelector('.heartpiece-row');
  return el ? [...el.childNodes].map((n) => n.textContent).join('') : '';
});
check('the heart-piece row carries no name text — only the pip glyphs',
  /^[❤️🤍\s]*$/u.test(hpText), hpText);

console.log('\n── 6 · no emoji with the map’s own rule, extended here ───────');
const EMOJI = /\p{Extended_Pictographic}/u;
const bookEl = await page.evaluate(() => {
  const el = document.getElementById('sticker-menu');
  const h = el.querySelector('h2');
  return { header: h ? h.textContent : '', tilesText: [...el.querySelectorAll('.grid:not(.tre-grid) > .sticker div:last-child')]
    .map((d) => d.textContent).join(' ') };
});
// The book's own "📒 Sticker Book" header is not one of the seventeen tiles —
// it is a screen title, the same class of exception the map's own emoji-free
// rule never touched (map CARDS, not the app chrome around them). The heart-
// piece row and the treasure shelf are excluded too: the pips are a
// deliberate, pre-existing exception (§5), and treasures are a separate
// screen sharing this markup, out of scope for the sticker rows this slice
// touched.
check('no emoji in any tile’s own label (owned or ???)', !EMOJI.test(bookEl.tilesText), bookEl.tilesText);

console.log(wk.errors.length ? '\nPAGE ERRORS:\n' + wk.errors.join('\n') : '');
for (const e of wk.errors) errors.push('PAGEERROR: ' + e);
await wk.b.close();
console.log(errors.length ? `\nFAIL (${errors.length}): ${errors.join(', ')}` : '\nPASS');
process.exit(errors.length ? 1 : 0);
