// DOES EQUIPPING A WEAPON CHANGE ANYTHING A CHILD CAN SEE?
//
// Dad: "add different weapons and armour that you can find and equip... your
// character should change when you equipped a different weapons. use the old
// developer trick of recolouring the same asset, give it a different name and
// stats and call it a day."
//
// Two halves, and the second is the one that rots quietly: a gear registry is
// easy to grow and easy to grow WRONG — a typo'd file path, a tint that never
// reaches the mesh, a recolour that repaints every skeleton in the game because
// the loader cache was shared. So this equips every single item and looks at
// what came out.
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
await page.fill('#t-name', 'GEAR');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.player.iframes = 999999;
});

console.log('\n── 1. every weapon and shield loads and mounts ────────');
const rack = await page.evaluate(async () => {
  const g = window.__game;
  const items = await import('/js/items.js');
  const THREE = await import('three');
  const out = [];
  for (const [kind, reg] of [['weapon', items.WEAPONS], ['shield', items.SHIELDS]]) {
    for (const id of Object.keys(reg)) {
      g.state.inventory.equipped[kind] = id;
      let err = null;
      try { await g.player.equipGear(); } catch (e) { err = String(e.message || e); }
      const hand = kind === 'weapon' ? g.player._handR : g.player._handL;
      let meshes = 0, colour = null;
      if (hand) hand.traverse((n) => {
        if (!n.isMesh) return;
        meshes++;
        const m = Array.isArray(n.material) ? n.material[0] : n.material;
        if (m && m.color && !colour) colour = '#' + m.color.getHexString();
      });
      const bb = hand ? new THREE.Box3().setFromObject(hand) : null;
      out.push({ id, kind, err, meshes, colour,
        size: bb ? +Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y,
          bb.max.z - bb.min.z).toFixed(2) : 0,
        tint: reg[id].tint ? '#' + reg[id].tint.toString(16).padStart(6, '0') : null });
    }
  }
  return out;
});
check('nothing threw while equipping', rack.every((r) => !r.err), rack.filter((r) => r.err));
check('every item actually puts a model in the hand', rack.every((r) => r.meshes > 0),
  rack.filter((r) => r.meshes === 0).map((r) => r.id));
check('...and it is a real size, not a speck or a tower',
  rack.every((r) => r.size > 0.05 && r.size < 4), rack.filter((r) => r.size <= 0.05 || r.size >= 4));
console.log('  rack: ' + rack.map((r) => `${r.id}(${r.meshes}m ${r.size}u)`).join(' '));

console.log('\n── 2. a recoloured weapon really is recoloured ────────');
// The trick dad asked for only works if the tint reaches the mesh — and only
// counts if the ORIGINAL is left alone, because the model comes out of a shared
// loader cache that skeletons draw from too.
const tinted = rack.filter((r) => r.tint);
check('there are recoloured variants at all', tinted.length >= 4, { count: tinted.length });
check('each recoloured item wears its tint',
  tinted.every((r) => r.colour === r.tint),
  tinted.map((r) => ({ id: r.id, want: r.tint, got: r.colour })));

const untouched = await page.evaluate(async () => {
  const g = window.__game;
  const { loadGLB } = await import('/js/assets.js');
  // re-read the cached source of a model that HAS a tinted variant
  const src = await loadGLB('./assets/gear/axe_B.gltf');
  let colour = null;
  src.scene.traverse((n) => {
    if (!n.isMesh || colour) return;
    const m = Array.isArray(n.material) ? n.material[0] : n.material;
    if (m && m.color) colour = '#' + m.color.getHexString();
  });
  return colour;
});
check('...and the shared cached model was NOT repainted',
  untouched !== '#ff6a2a' && untouched !== '#8fd8ff', { cached: untouched });

console.log('\n── 3. armour changes Kael, and changes it back ────────');
const armour = await page.evaluate(async () => {
  const g = window.__game;
  const items = await import('/js/items.js');
  const read = () => {
    const model = g.player.forms.knight.model;
    const out = [];
    model.traverse((n) => {
      if (!n.isMesh) return;
      const m = Array.isArray(n.material) ? n.material[0] : n.material;
      if (m && m.color) out.push('#' + m.color.getHexString());
    });
    return out.join(',');
  };
  g.state.inventory.equipped.armour = 'plain';
  g.player.equipArmour();
  const plain = read();
  const seen = {};
  for (const id of Object.keys(items.ARMOURS)) {
    g.state.inventory.equipped.armour = id;
    g.player.equipArmour();
    seen[id] = read();
  }
  g.state.inventory.equipped.armour = 'plain';
  g.player.equipArmour();
  return { plain, back: read(), seen, count: Object.keys(items.ARMOURS).length };
});
check('there are several suits', armour.count >= 5, { count: armour.count });
check('every suit but the plain one repaints Kael',
  Object.entries(armour.seen).filter(([id]) => id !== 'plain').every(([, v]) => v !== armour.plain),
  Object.entries(armour.seen).filter(([id, v]) => id !== 'plain' && v === armour.plain).map(([id]) => id));
check('...and each suit is its own colour, not all the same',
  new Set(Object.values(armour.seen)).size === armour.count,
  { distinct: new Set(Object.values(armour.seen)).size, suits: armour.count });
// REVERSIBLE. A one-way paint job would strand a child in whatever they tried on.
check('going back to Squire Plate restores the original knight',
  armour.back === armour.plain, { plain: armour.plain.slice(0, 40), back: armour.back.slice(0, 40) });

console.log('\n── 4. armour is a TRADE, not a free upgrade ──────────');
const trade = await page.evaluate(async () => {
  const items = await import('/js/items.js');
  return Object.entries(items.ARMOURS).map(([id, a]) => ({ id, soak: a.soak, weight: a.weight }));
});
check('the heaviest soak also costs speed',
  trade.filter((t) => t.soak >= 1).every((t) => t.weight > 0 || t.id === 'moon'), trade);
check('nothing soaks so much that a hit stops costing anything',
  trade.every((t) => t.soak <= 1.5), trade.filter((t) => t.soak > 1.5));

console.log('\n── 5. the shop and the chests can actually hand these out ──');
const reach = await page.evaluate(async () => {
  const items = await import('/js/items.js');
  const { CONFIG } = await import('/js/config.js');
  // A LINE ON A RUNG THAT DOES NOT EXIST IS NOT STOCK.
  //
  // This counted an item as obtainable if SHOP_STOCK named it. Five weapons and
  // a suit of armour were then shipped on tier 5 while the ladder stopped at
  // four — in the table, in the shop's own data, and impossible to be offered
  // once in a whole playthrough. Membership was never the question; whether the
  // rung can open is.
  const rungs = new Set(CONFIG.SHOP.TIERS.map((t) => t.tier));
  const stocked = new Set(items.SHOP_STOCK
    .filter((s) => s.kind !== 'potion' && rungs.has(s.tier || 1)).map((s) => s.id));
  const all = [...Object.keys(items.WEAPONS), ...Object.keys(items.SHIELDS), ...Object.keys(items.ARMOURS)];
  const free = ['sword_knight', 'shield_badge', 'plain'];
  const badStock = items.SHOP_STOCK.filter((s) => s.kind !== 'potion' &&
    !items.WEAPONS[s.id] && !items.SHIELDS[s.id] && !items.ARMOURS[s.id]).map((s) => s.id);
  return { stocked: [...stocked], all, free, badStock };
});
check('every stock line names an item that exists', reach.badStock.length === 0, reach.badStock);

// FOUND COUNTS TOO. The first version of this check only knew about the shop,
// which would have called a chest prize "unobtainable" — a suite that is wrong
// in the other direction is no better. The level sources are read for chest
// loot, so a weapon reachable ONLY by finding it still passes.
const sources = await page.evaluate(async () => {
  const found = new Set();
  for (const f of ['level1', 'level2', 'level3', 'level5', 'level6', 'level7', 'rooms']) {
    const src = await (await fetch(`/js/${f}.js`)).text();
    for (const m of src.matchAll(/\b(?:gear|armour):\s*'([a-z0-9_]+)'/g)) found.add(m[1]);
  }
  return [...found];
});
const obtainable = new Set([...reach.stocked, ...sources, ...reach.free]);
const unreachable = reach.all.filter((id) => !obtainable.has(id));
check('no item is unobtainable — all are bought, found, or start on you',
  unreachable.length === 0, { unreachable, total: reach.all.length });
check('...and some are FOUND, not only bought',
  sources.filter((id) => !reach.stocked.includes(id)).length > 0 || sources.length >= 5,
  { inChests: sources });

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : `ALL CLEAN — ${rack.length} weapons and shields, and Kael changes when you wear them.`));
await b.close();
process.exit(errors.length ? 1 : 0);
