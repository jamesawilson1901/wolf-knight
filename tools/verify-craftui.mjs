// THE CRAFTING TAB (design/CRAFTING.md §3) — dad's own words: "through the
// backpack button and then a crafting tab". Does the tab exist inside the
// Armoury (not a separate screen), does switching to it swap the rack
// column while leaving the knight/slots alone, do locked/hidden recipes
// read like the sticker book's own "???" idiom, does tapping a craftable
// recipe actually pay out through the real DOM (not just the underlying
// js/crafting.js functions — tools/verify-crafting.mjs already owns those),
// and does an unaffordable recipe refuse the tap.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('CRAFTUI');
const { page } = wk;

// open the Armoury (the backpack button)
await page.evaluate(() => { window.__game.state.inventory.recipesKnown = []; window.__game.state.inventory.crafted = []; });
await page.locator('#inv-btn').dispatchEvent('pointerdown');
await page.waitForSelector('#inv-menu', { state: 'visible' });
const gearFirst = await page.evaluate(() => {
  const on = document.querySelector('.arm-tab.on');
  return { onTab: on ? on.textContent : null, hasRacks: !!document.querySelector('.rack-row') };
});
check('the Armoury opens on the Gear tab by default, with rack rows visible',
  gearFirst.onTab && gearFirst.onTab.includes('Gear') && gearFirst.hasRacks, gearFirst);

// switch to Craft
const tabs = await page.$$('.arm-tab');
let craftTab = null;
for (const t of tabs) { if ((await t.textContent()).includes('Craft')) craftTab = t; }
check('a Craft tab exists beside Gear', !!craftTab);
const spokenBefore = await page.evaluate(() => !!window.__game.state.spoken.craft_intro);
await craftTab.dispatchEvent('pointerdown');
await page.waitForTimeout(50);
const spokenAfter = await page.evaluate(() => !!window.__game.state.spoken.craft_intro);
check('opening the Craft tab for the first time fires the craft_intro tutorial line, once per save',
  !spokenBefore && spokenAfter, { spokenBefore, spokenAfter });

const craftState = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#inv-menu .rack-row')];
  return rows.map((r) => ({
    name: r.querySelector('.rack-name').textContent,
    locked: r.classList.contains('locked'),
    hasBtn: !!r.querySelector('.craft-btn'),
  }));
});
check('the Craft tab shows the Healing Draught and Might Draught as tier-1, unlocked, with a Craft button',
  craftState.some((r) => r.name === 'Healing Draught' && !r.locked && r.hasBtn)
    && craftState.some((r) => r.name === 'Might Draught' && !r.locked && r.hasBtn), craftState);
check('shield_ultimate (tier 2) reads as a locked "???" row before 2 things are crafted',
  craftState.filter((r) => r.name === '???' && r.locked).length >= 2, craftState);
check('the hidden sword_ultimate never shows its real name before discovery',
  !craftState.some((r) => r.name === 'Wolf Fang'), craftState);

// tap Healing Draught without materials — should refuse (no potion gained).
const potionsBefore = await page.evaluate(() => window.__game.state.potions);
await page.evaluate(() => { window.__game.state.inventory.materials = {}; });
const healRow = await page.$$('#inv-menu .rack-row');
let healBtn = null;
for (const r of healRow) {
  const name = await r.$eval('.rack-name', (n) => n.textContent).catch(() => null);
  if (name === 'Healing Draught') healBtn = await r.$('.craft-btn');
}
await healBtn.dispatchEvent('pointerdown');
await page.waitForTimeout(50);
const afterRefuse = await page.evaluate(() => window.__game.state.potions);
check('tapping Craft without materials does not pay out', afterRefuse === potionsBefore, { potionsBefore, afterRefuse });

// give the materials, tap again — should craft for real, through the DOM.
await page.evaluate(() => { window.__game.state.inventory.materials = { wisp: 2 }; window.__game.state.potions = 1; });
await healBtn.dispatchEvent('pointerdown');
await page.waitForTimeout(50);
const afterCraft = await page.evaluate(() => ({
  potions: window.__game.state.potions,
  wisp: window.__game.state.inventory.materials.wisp || 0,
  crafted: [...window.__game.state.inventory.crafted],
}));
check('tapping a real Craft button in the live UI adds a potion, spends materials, and tracks it as crafted',
  afterCraft.potions === 2 && afterCraft.wisp === 0 && afterCraft.crafted.includes('healing_draught'), afterCraft);

// switching back to Gear leaves the knight/slots panel untouched (still there).
for (const t of tabs) { if ((await t.textContent()).includes('Gear')) { await t.dispatchEvent('pointerdown'); break; } }
await page.waitForTimeout(50);
const backToGear = await page.evaluate(() => ({
  onTab: document.querySelector('.arm-tab.on').textContent,
  stillHasKnightStage: !!document.querySelector('.arm-stage'),
  stillHasSlots: document.querySelectorAll('.arm-slot').length === 3,
}));
check('switching back to Gear restores the rack view; the knight/slots panel was never rebuilt away',
  backToGear.onTab.includes('Gear') && backToGear.stillHasKnightStage && backToGear.stillHasSlots, backToGear);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the crafting tab lives in the backpack and actually crafts');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
