// TWO CHILDREN, TWO SAVES, AND NEITHER ONE TOUCHES THE OTHER.
//
// PROGRESS.md has carried this as a TODO since RUN 3 and nothing had ever
// checked it. It is the one bug in this game that cannot be undone: a
// five-year-old who loses an evening's progress because their sibling played
// after them does not get it back, and the failure is silent — the save writes
// fine, it just writes over the wrong child.
//
// It is also the suite that found something worse. §3 round-trips the whole
// flag set through a save and back, and four boss flags were not in it at all
// (ariaDefeated, meriDefeated, grimmFreed, gameComplete) along with three
// bosses' remembered wounds and the Trial's form lock. Beat Aria, close the
// app, and the Sunken Vale was locked again — while the Storm Wolf stayed in
// your paw, which is exactly why nobody noticed. Fixed in js/save.js; this is
// what keeps it fixed, and what will catch region eight.
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

const newProfile = async (name) => {
  await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
  await page.fill('#t-name', name);
  await page.locator('#t-start').dispatchEvent('pointerdown');
  await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
  await page.evaluate(() => { const g = window.__game;
    g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
    g.player.iframes = 999999; });
};

// ---------------------------------------------------------------------------
console.log('\n── 1 · two profiles, two save slots ──────────────────');
await newProfile('ALFIE');
const alfie = await page.evaluate(() => {
  const g = window.__game;
  g.state.shards = 137;
  g.state.maxHearts = 8;
  g.state.flags.bossDefeated = true;
  g.state.flags.pups.pup1 = true;
  g.state.inventory.treasures.push('banked_ember');
  g.persist();
  return { id: g.state.profileId, keys: Object.keys(localStorage).filter((k) => k.startsWith('wolfknight:')) };
});
check('the first profile writes a slot of its own',
  alfie.keys.some((k) => k === 'wolfknight:save:' + alfie.id), alfie);

// back to the title and make a second child
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await newProfile('BEA');
const bea = await page.evaluate(() => {
  const g = window.__game;
  g.state.shards = 4;
  g.persist();
  return { id: g.state.profileId, shards: g.state.shards, hearts: g.state.maxHearts,
    boss: !!g.state.flags.bossDefeated, pups: Object.keys(g.state.flags.pups),
    treasures: [...g.state.inventory.treasures] };
});
check('the second profile gets a DIFFERENT slot', bea.id !== alfie.id, { alfie: alfie.id, bea: bea.id });
check('...and starts fresh: no shards, no hearts, no boss, no pups, no keepsakes',
  bea.shards === 4 && bea.hearts === 5 && !bea.boss && bea.pups.length === 0
  && bea.treasures.length === 0, bea);

// ---------------------------------------------------------------------------
console.log('\n── 2 · and the first child still has everything ──────');
const back = await page.evaluate(({ id }) => {
  const raw = JSON.parse(localStorage.getItem('wolfknight:save:' + id));
  return { shards: raw.shards, hearts: raw.maxHearts, boss: !!raw.flags.bossDefeated,
    pups: Object.values(raw.pups || {}).flat(), treasures: raw.inventory.treasures };
}, { id: alfie.id });
check('nothing the second child did reached the first',
  back.shards === 137 && back.hearts === 8 && back.boss
  && back.pups.includes('pup1') && back.treasures.includes('banked_ember'), back);
const slots = await page.evaluate(() =>
  Object.keys(localStorage).filter((k) => k.startsWith('wolfknight:save:')).length);
check('exactly two save slots exist', slots === 2, { slots });

// ---------------------------------------------------------------------------
console.log('\n── 3 · everything gameplay sets survives a round trip ─');
// The general form of the bug this suite found. Every flag below is one a
// REGION hangs off — a locked door, a moonstone row, a map pin, an ending —
// so a flag that does not survive is a region a child has to beat twice.
const trip = await page.evaluate(() => {
  const g = window.__game;
  const want = {
    bossDefeated: true, wardenDefeated: true, sylvaDefeated: true,
    borealDefeated: true, ariaDefeated: true, meriDefeated: true,
    grimmFreed: true, gameComplete: true,
    bossHp: 3, sylvaHp: 5, borealHp: 7, wardenHp: 9, ariaHp: 11, meriHp: 13, grimmHp: 15,
    e2bCleared: true, shortcutOpen: true, bossProgress: 2,
  };
  Object.assign(g.state.flags, want);
  g.state.formLock = 'frost_wolf';
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'frost_wolf'];
  g.WS.set('vale', 'restored');
  g.state.flags.cracked.some_crack = true;
  g.state.flags.chests.some_chest = true;
  g.persist();
  // wipe the live state the way a fresh load does, then read the file back
  for (const k of Object.keys(want)) delete g.state.flags[k];
  g.state.formLock = null;
  g.state.flags.world = {};
  g.state.flags.cracked = {};
  g.state.flags.chests = {};
  const raw = JSON.parse(localStorage.getItem('wolfknight:save:' + g.state.profileId));
  g.applySave(g.state.profileId, g.state.profileName, raw);
  const missing = Object.entries(want).filter(([k, v]) => g.state.flags[k] !== v).map(([k]) => k);
  return { missing, formLock: g.state.formLock,
    vale: !!g.WS.get('vale', 'restored'),
    crack: !!g.state.flags.cracked.some_crack,
    chest: !!g.state.flags.chests.some_chest };
});
check('every boss flag and every remembered wound survives', trip.missing.length === 0, trip.missing);
check('...the Trial’s form lock survives (state.js says it must)',
  trip.formLock === 'frost_wolf', trip);
check('...and so do the world state, the cracks and the chests',
  trip.vale && trip.crack && trip.chest, trip);

// ---------------------------------------------------------------------------
console.log('\n── 4 · an old save still loads ───────────────────────');
// Additive-forever (CLAUDE.md). A profile written before any of the fields
// above existed must load clean, not crash and not strand a child.
const ancient = await page.evaluate(() => {
  const g = window.__game;
  const raw = { profileId: g.state.profileId, name: 'OLD', region: 'ember_hollow',
    checkpoint: { room: 'r1', x: 0, z: 0, id: 'spawn' }, maxHearts: 5,
    flags: { bossDefeated: true }, formsUnlocked: ['knight'] };
  let threw = null;
  try { g.applySave(g.state.profileId, 'OLD', raw); } catch (e) { threw = String(e); }
  return { threw, forms: [...g.state.formsUnlocked], aria: !!g.state.flags.ariaDefeated,
    lock: g.state.formLock, treasures: g.state.inventory.treasures,
    room: g.state.checkpoint.room };
});
check('a save from before any of this loads without throwing', !ancient.threw, ancient);
check('...the two starting forms are re-granted',
  ancient.forms.includes('knight') && ancient.forms.includes('dark_wolf'), ancient.forms);
check('...the missing flags come back as untouched, not undefined',
  ancient.aria === false && ancient.lock === null, ancient);
check('...and its retired room id is resolved on load', ancient.room !== 'r1', ancient);

console.log('\n' + (errors.length ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : '✓ two children can play the same tablet'));
await b.close();
process.exit(errors.length ? 1 : 0);
