// MAREN'S LADDER — the shop's stock arrives with the world, not all at once.
//
// The Den shop offered its whole catalogue from the first minute of a new game:
// a five-year-old standing in front of Maren on their very first visit saw the
// 300-shard Boulder Hammer next to the 15-shard potion. The contract's shop
// ladder ("per region tier ≈ 60/90/150/250/400 — a kid who explores buys one
// big thing per region") only means anything if the tiers actually arrive one
// at a time.
//
// This drives the REAL menu: it starts a real game, sets the real region flags
// the narration sets, and calls the real `showShop()`, then reads the cards the
// child would actually see. It does not test the tier table in isolation,
// because the filter living in `showShop` is the thing that can rot.
//
// It also re-asserts the rule that was ALREADY there and is easy to break while
// editing the same loop: gear you own vanishes from the stock.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 25000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SHOP');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
});

const hasMenus = await page.evaluate(() => !!(window.__game && window.__game.menus));
if (!hasMenus) {
  check('the shop menu is reachable from the test hook (window.__game.menus)', false);
  console.log('\n✗ SHOP LADDER BROKEN');
  await b.close();
  process.exit(1);
}

// The stock table, read from the module the game itself imports, so the
// verifier can never drift from the registry it is checking.
const stock = await page.evaluate(async () => {
  const m = await import('/js/items.js');
  return m.SHOP_STOCK.map((s) => ({
    kind: s.kind, id: s.id || 'potion', tier: s.tier, price: s.price,
    name: s.kind === 'potion' ? s.name : (s.kind === 'weapon' ? m.WEAPONS[s.id].name : m.SHIELDS[s.id].name),
  }));
});

// What a child sees, having freed the regions named. Region completion is
// `state.spoken.<id>_complete` — the same flag the map screen and the pup
// counter already read, so nothing new is persisted.
const FLAGS = { ember: 'region_complete', stone: 'stone_complete', wild: 'wild_complete', frost: 'frost_complete' };
const offered = (freed, owned = []) => page.evaluate(([freed, owned, FLAGS]) => {
  const g = window.__game;
  g.state.spoken = {};
  for (const r of freed) g.state.spoken[FLAGS[r]] = true;
  g.state.inventory.gear = owned.slice();
  g.menus.showShop();
  return [...document.querySelectorAll('#shop-menu .item-card .nm')].map((e) => e.textContent);
}, [freed, owned, FLAGS]);

console.log('\n── every row declares a tier ───────────────────────────────────');
const untiered = stock.filter((s) => !Number.isInteger(s.tier) || s.tier < 1);
check('every shop row carries a tier', untiered.length === 0, untiered.map((s) => s.id));
const tiers = [...new Set(stock.map((s) => s.tier))].sort((a, b) => a - b);
check('the tiers are a gapless ladder from 1', tiers.every((t, i) => t === i + 1), tiers);
check('tier 1 holds the potion', stock.some((s) => s.kind === 'potion' && s.tier === 1));
// A ladder is only a ladder if the rungs climb. Prices within a tier may sit in
// any order; the tiers themselves must not overlap, or "one big thing per
// region" stops being true.
let climbs = true;
for (let t = 1; t < tiers.length; t++) {
  const below = Math.max(...stock.filter((s) => s.tier === t && s.kind !== 'potion').map((s) => s.price));
  const above = Math.min(...stock.filter((s) => s.tier === t + 1).map((s) => s.price));
  if (!(above > below)) climbs = false;
}
check('each tier is dearer than the one below it', climbs,
  tiers.map((t) => stock.filter((s) => s.tier === t).map((s) => s.price)));

console.log('\n── the stock arrives with the world ────────────────────────────');
const nameOf = (t) => stock.filter((s) => s.tier === t).map((s) => s.name);
const upTo = (t) => stock.filter((s) => s.tier <= t).map((s) => s.name);

const stages = [
  { freed: [], tier: 1, label: 'a brand new game' },
  { freed: ['ember'], tier: 1, label: 'Ember Hollow freed' },
  { freed: ['ember', 'stone'], tier: 2, label: 'Stoneroot freed' },
  { freed: ['ember', 'stone', 'wild'], tier: 3, label: 'the Wild Woods freed' },
  { freed: ['ember', 'stone', 'wild', 'frost'], tier: 4, label: 'Frostpeak freed' },
];
for (const st of stages) {
  const seen = await offered(st.freed);
  const want = upTo(st.tier).sort();
  const got = seen.slice().sort();
  check(`${st.label} → tiers 1..${st.tier}`, JSON.stringify(want) === JSON.stringify(got),
    { got: seen, missing: want.filter((n) => !seen.includes(n)), extra: seen.filter((n) => !want.includes(n)) });
}

// The item this run exists for, stated on its own so a regression names itself.
const beforeStone = await offered(['ember']);
const afterStone = await offered(['ember', 'stone']);
const t2 = nameOf(2);
check('tier 2 is hidden until Stoneroot sings', t2.every((n) => !beforeStone.includes(n)), t2);
check('tier 2 is on the shelf the moment it does', t2.every((n) => afterStone.includes(n)), t2);
check('nothing tier 1 disappeared when tier 2 arrived',
  upTo(1).filter((n) => n !== 'Healing Potion').every((n) => afterStone.includes(n)));

console.log('\n── the rules that were already there ───────────────────────────');
const everything = stock.filter((s) => s.kind !== 'potion').map((s) => s.id);
const ownAll = await offered(['ember', 'stone', 'wild', 'frost'], everything);
check('gear you already own vanishes from the stock',
  ownAll.length === 1 && ownAll[0] === 'Healing Potion', ownAll);
const ownOne = await offered(['ember', 'stone', 'wild', 'frost'], [stock.find((s) => s.tier === 1 && s.kind !== 'potion').id]);
check('owning one thing hides only that thing',
  ownOne.length === stock.length - 1, { offered: ownOne.length, stock: stock.length });

// A locked tier the child cannot see must not become a silent wall: with stock
// still to come there is a line saying so, and with none left there is not.
console.log('\n── the child is told more is coming ────────────────────────────');
const noteWhenLocked = await page.evaluate(([FLAGS]) => {
  const g = window.__game;
  g.state.spoken = {}; g.state.inventory.gear = [];
  g.menus.showShop();
  const a = !!document.querySelector('#shop-menu .shop-later');
  for (const k of Object.values(FLAGS)) g.state.spoken[k] = true;
  g.menus.showShop();
  const b = !!document.querySelector('#shop-menu .shop-later');
  return { locked: a, all: b };
}, [FLAGS]);
check('a "more to come" line shows while stock is still locked', noteWhenLocked.locked);
check('...and is gone once the whole ladder is out', !noteWhenLocked.all);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' PROBLEM(S)\n  ' + errors.join('\n  ') : '✓ ALL CLEAN'));
await b.close();
process.exit(errors.length ? 1 : 0);
