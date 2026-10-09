// THE FORGE AND THE LIVING CAMP (v3.200, js/forge.js, js/denRebuild.js,
// js/levelDenRebuild.js). Dad's parts 2 and 3: "make the Forge improve the
// sword you already love", "each restored building should change the town,
// not just pay out", and "everything pays out when you come home".
//
//   1. forging: the price list, the gate (only once the Forge stands, only
//      with the materials), three steps and no fourth, and the stats each step
//      really changes — through the same weaponDef()/shieldDef()/armourDef()
//      every hit and block reads, never the shipped tables;
//   2. it is SEEN: a forged blade glows in its colour, its stars show in the
//      Armoury, and step three trails light along a swing;
//   3. the Forge tab is a thing of the Forge: absent from the backpack
//      anywhere else, opened by walking up to the restored Forge in the Outer
//      Camp, and its Forge button pays out through the real DOM;
//   4. the town: a board of pictures over each ruined building that goes when
//      it is built; the Mill grows the pups and doubles the pen; the Monument
//      adds a piece to every rock and tree; the Tavern puts the fallen bridges
//      on the map — and only then;
//   5. coming home pays: three rooms away earns every building a collection,
//      arriving takes it all at once, and once more pays nothing.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('FORGE');
const { page } = wk;
await page.evaluate(() => setInterval(() => { const n = window.__game.narration; if (n && n.speaking) n.skip(); }, 80));
await page.evaluate(() => { window.__game.player.iframes = 999999; });

console.log('\n── 1. forging ────────────────────────────────────────');
const f = await page.evaluate(async () => {
  const F = await import('/js/forge.js');
  const I = await import('/js/items.js');
  const g = window.__game, S = g.state, inv = S.inventory;
  const id = inv.equipped.weapon;
  const base = I.WEAPONS[id].dmg;
  inv.materials = { ingot: 30, ore: 30, crystal: 10 };
  const closed = F.canForge(id);                          // the Forge is still a ruin
  S.flags.world = S.flags.world || {};
  S.flags.world.den = { ...(S.flags.world.den || {}), bld_forge_restored: true };
  const open = F.canForge(id);
  const steps = [];
  for (let i = 0; i < 4; i++) steps.push(F.forgeUp(id));
  const shipped = I.WEAPONS[id].dmg;
  const left = { ingot: inv.materials.ingot, ore: inv.materials.ore, crystal: inv.materials.crystal };
  const sh = inv.equipped.shield, ar = inv.equipped.armour;
  const shBase = I.SHIELDS[sh], arBase = I.ARMOURS[ar];
  F.forgeUp(sh); F.forgeUp(ar);
  return { closed, open, steps, base, shipped, now: I.weaponDef().dmg, level: I.forgeLevel(id),
    ingotLeft: left.ingot, oreLeft: left.ore, crystalLeft: left.crystal,
    shield: { blunt: [shBase.blunt, I.shieldDef().blunt], parry: [shBase.parryBonus || 0, I.shieldDef().parryBonus] },
    armour: { soak: [arBase.soak || 0, I.armourDef().soak] } };
});
check('the Forge cannot be used while it is a ruin', f.closed === false && f.open === true, f);
check('three steps, and no fourth', JSON.stringify(f.steps) === '[1,2,3,0]' && f.level === 3, f.steps);
check('each step is paid for: 9 ingots, 6 ore, 3 crystals for the three', f.ingotLeft === 21 && f.oreLeft === 24 && f.crystalLeft === 7, f);
check('a fully forged weapon hits 36% harder, through weaponDef()', Math.abs(f.now - Math.round(f.base * 1.36 * 100) / 100) < 1e-9, f);
check('...and the shipped table is untouched (verify-gear\'s rules still hold for every base item)', f.shipped === f.base, f);
check('a forged shield blocks better: less through, a wider parry', f.shield.blunt[1] < f.shield.blunt[0] && f.shield.parry[1] > f.shield.parry[0], f.shield);
check('forged armour soaks more, never past 1.5', f.armour.soak[1] > f.armour.soak[0] && f.armour.soak[1] <= 1.5, f.armour);

console.log('\n── 2. it is seen ─────────────────────────────────────');
const seen = await page.evaluate(async () => {
  const g = window.__game, P = g.player;
  await P.equipGear();
  let glow = 0;
  P._blade.traverse((n) => { if (n.isMesh) for (const m of [].concat(n.material)) glow = Math.max(glow, m.emissiveIntensity || 0); });
  const before = g.juice._cursor;
  P._forgeTrail();
  return { level: P._forgeL, glow: +glow.toFixed(2), trailParts: (g.juice._cursor - before + 256) % 256 };
});
check('the forged blade glows (emissive x3 steps)', seen.level === 3 && seen.glow >= 0.89, seen);
check('step three trails light along a swing', seen.trailParts >= 14, seen);

console.log('\n── 3. the Forge tab is a thing of the Forge ──────────');
await page.locator('#inv-btn').dispatchEvent('pointerdown');
await page.waitForSelector('#inv-menu', { state: 'visible' });
const tabsAnywhere = await page.evaluate(() => [...document.querySelectorAll('.arm-tab')].map((t) => t.textContent));
const starsInGear = await page.evaluate(() => [...document.querySelectorAll('.rack-row.on .forge-stars')].map((s) => s.textContent));
check('opened anywhere else, the backpack has no Forge tab', !tabsAnywhere.some((t) => t.includes('Forge')), tabsAnywhere);
check('the Gear rack shows a forged piece\'s stars', starsInGear.includes('★★★'), starsInGear);
await page.locator('#inv-menu .menu-btn', { hasText: 'Done' }).first().dispatchEvent('pointerdown');
await page.waitForFunction(() => getComputedStyle(document.getElementById('inv-menu')).display === 'none');

// the camp: restore the Tavern and the Forge for real, then walk to the Forge
await wk.jump('dr', ['knight']);
const camp = await page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const g = window.__game, S = g.state;
  S.flags.world.den = {};   // every building a ruin again
  return { boards: 0, ruins: ['tavern', 'forge', 'mill'].filter((id) => !d.isRestored(id)).length };
});
check('the camp starts in ruins for this check', camp.ruins === 3, camp);
await wk.jump('den', ['knight']);
await wk.jump('dr', ['knight']);
const boards = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  return w.root.children.filter((o) => o.isSprite && o.material.map && o.material.map.isCanvasTexture && o.visible).length;
});
check('a board of pictures stands over each ruined building', boards >= 3, { boards });
await page.evaluate(() => { const S = window.__game.state; S.inventory.materials = { wood: 40, ore: 40, ingot: 9, crystal: 3 };
  S.inventory.upgrades = {}; });
// walk up to the Forge (restores it), step away, walk up again (opens the tab)
await wk.walkTo(-3.2, 2.0, { timeout: 15 });
await page.waitForTimeout(400);
await wk.walkTo(2.5, 2.0, { timeout: 10 });
await wk.walkTo(-3.2, 2.0, { timeout: 15 });
await page.waitForFunction(() => getComputedStyle(document.getElementById('inv-menu')).display === 'flex', null, { timeout: 8000 }).catch(() => {});
const atForge = await page.evaluate(() => ({
  open: getComputedStyle(document.getElementById('inv-menu')).display === 'flex',
  on: (document.querySelector('.arm-tab.on') || {}).textContent || '',
  rows: document.querySelectorAll('.forge-row').length,
  boardsLeft: window.__game.world.root.children.filter((o) => o.isSprite && o.material.map && o.material.map.isCanvasTexture && o.visible).length,
}));
check('walking up to the restored Forge opens the backpack on the Forge tab', atForge.open && atForge.on.includes('Forge') && atForge.rows === 3, atForge);
check('...and the Forge\'s own board went when it was built', atForge.boardsLeft === boards - 1, atForge);
const btn = page.locator('.forge-row .craft-btn:not([disabled])').first();
const lvl0 = await page.evaluate(() => window.__game.state.inventory.upgrades[window.__game.state.inventory.equipped.weapon] || 0);
await btn.dispatchEvent('pointerdown');
await page.waitForTimeout(300);
const lvl1 = await page.evaluate(() => ({ L: window.__game.state.inventory.upgrades[window.__game.state.inventory.equipped.weapon] || 0,
  stars: document.querySelector('.forge-row .forge-stars').textContent, blade: window.__game.player._forgeL }));
check('the Forge button forges through the real DOM, and the stars and the blade follow', lvl1.L === lvl0 + 1 && lvl1.stars.startsWith('★') && lvl1.blade === lvl1.L, { lvl0, lvl1 });
await page.locator('#inv-menu .menu-btn', { hasText: 'Done' }).first().dispatchEvent('pointerdown');

console.log('\n── 4. each building changes the town ─────────────────');
const town = await page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const M = await import('/js/mapdata.js');
  const N = await import('/js/nodes.js');
  const bridgeMarks = () => {
    const m = M.mapModel();
    return m.tiles.flatMap((t) => t.marks.filter((k) => String(k.key).startsWith('build_')).map((k) => k.key));
  };
  // a known room with a fallen bridge: walk the map's own visited list
  M.markVisited('la'); M.markVisited('la1');
  const beforeTavern = bridgeMarks();
  const tavern = d.restore('tavern');
  const afterTavern = bridgeMarks();
  // the Mill: pups twice the pen's pay
  const pen = d.BUILDINGS.pupPen.amount;
  d.restore('mill');
  return { tavern, beforeTavern, afterTavern, pen, all: d.allBuildingsRestored(), yieldBase: N.NODE_KINDS.rock.yield };
});
check('before the Tavern, no fallen bridge is on the map', town.beforeTavern.length === 0, town);
check('with the Tavern standing, the fallen bridges are marked', town.tavern && town.afterTavern.includes('build_ember'), town);
check('with all three standing, the Monument is lit', town.all, town);
// the Monument's extra piece, on a real rock
await wk.jump('lc', ['knight']);
const rock = await page.evaluate(async () => {
  const items = await import('/js/items.js');
  const g = window.__game, w = g.world;
  items.addGear('pickaxe');
  const r = w.nodes.find((n) => n.kind === 'rock');
  g.player.root.position.set(r.x, 0, r.z);
  const before = (w.drops || []).length;
  for (let i = 0; i < 3; i++) w.updateNodes(0.7, 0, g.player);
  return { spilled: (w.drops || []).filter((d) => d.kind === 'ore').length - before };
});
check('with the Monument lit, a rock spills one more piece (4)', rock.spilled === 4, rock);

console.log('\n── 5. coming home pays ───────────────────────────────');
// zero every clock so only the homecoming bonus can pay, then walk three rooms
await page.evaluate(() => { const den = window.__game.state.flags.world.den;
  for (const id of ['tavern', 'forge', 'mill', 'pupPen']) { den['bld_' + id + '_since'] = Date.now(); den['bld_' + id + '_collected'] = 0;
    den['bld_' + id + '_bonus'] = 0; } });
for (const r of ['la', 'la1', 'lg1']) await wk.jump(r, ['knight']);
const purse0 = await page.evaluate(() => ({ shards: window.__game.state.shards, ingot: window.__game.state.inventory.materials.ingot || 0,
  wood: window.__game.state.inventory.materials.wood || 0 }));
await wk.jump('dr', ['knight']);
await page.waitForTimeout(1500);
const purse1 = await page.evaluate(() => ({ shards: window.__game.state.shards, ingot: window.__game.state.inventory.materials.ingot || 0,
  wood: window.__game.state.inventory.materials.wood || 0, toast: document.getElementById('big-toast').textContent }));
check('home after an adventure, every building has paid: coins, ingots, wood', purse1.shards >= purse0.shards + 6
  && purse1.ingot >= purse0.ingot + 2 && purse1.wood >= purse0.wood + 4, { purse0, purse1 });
check('...with one toast saying what came in', /While you were away/.test(purse1.toast), purse1.toast);
await wk.jump('den', ['knight']);
await wk.jump('dr', ['knight']);
const purse2 = await page.evaluate(() => ({ shards: window.__game.state.shards, ingot: window.__game.state.inventory.materials.ingot || 0 }));
check('popping straight back without an adventure pays nothing more', purse2.shards === purse1.shards && purse2.ingot === purse1.ingot, { purse1, purse2 });

check('no page errors', wk.errors.length === 0, wk.errors.slice(0, 4));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Forge forges, the camp lives, home pays');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
