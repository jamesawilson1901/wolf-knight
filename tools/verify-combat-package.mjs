// THE v3.195 COMBAT PACKAGE, played. Dad: "the stats in the menu for different
// weapons don't actually correlate to anything... when you level up and click
// to increase your attack, it does nothing... armour and shields as well", and
// "it completely negates using the wolves in combat if you get good weapons",
// and the ten-face form wheel was "very messy". Each check states a rule the
// v3.194 build did not have (region-scaled hp, gear in every form, GUARD,
// full shield blocks, shells, the swap-in strike, the pack).
import { launch } from './wk-drive.mjs';
const errs = [];
const check = (name, ok, info) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`);
  if (!ok) errs.push(name);
};
const wk = await launch({ timescale: 1 });
await wk.newGame('PACKAGE');
const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf'];
async function go(room, forms = ALL) {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: forms });
  await wk.page.waitForFunction((r) => window.__wk.room === r && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { const n = window.__game.narration; for (let i = 0; i < 6 && n.speaking; i++) n.skip(); });
}
const tapBadge = async () => {
  await wk.page.locator('#form-badge').dispatchEvent('pointerdown');
  await wk.page.locator('#form-badge').dispatchEvent('pointerup');
};

console.log('\n── 1. levelling up is power you keep ──────────────────');
await go('va1');
const lvl = await wk.page.evaluate(async () => {
  const prog = await import('/js/progress.js');
  const g = window.__game;
  g.state.level = 1; const a = prog.enemyScale('va1');
  g.state.level = 12; const b = prog.enemyScale('va1');
  return { a, b, la: prog.enemyScale('la'), f1: prog.enemyScale('f1'), x1: prog.enemyScale('x1') };
});
check('enemy hp does not rise with the player\'s level', lvl.a === lvl.b, lvl);
check('...it rises with the region (Ember 1, Frostpeak ~1.7, Court capped 2.2)',
  lvl.la === 1 && lvl.f1 > 1.6 && lvl.f1 < 1.8 && lvl.x1 === 2.2, lvl);

console.log('\n── 2. your gear is every form\'s ────────────────────────');
const gear = await wk.page.evaluate(() => {
  const g = window.__game, st = g.state;
  st.perks.sword = 0;
  if (!st.inventory.gear.includes('sword_d')) st.inventory.gear.push('sword_d');
  st.inventory.equipped.weapon = 'sword_knight';
  g.player.setForm('earth_wolf', { silent: true }); const plain = g.player.attackConfig().dmg;
  st.inventory.equipped.weapon = 'sword_d';
  const moon = g.player.attackConfig().dmg;
  g.player.setForm('knight', { silent: true });
  return { plain, moon };
});
check('the Earth Wolf\'s bite grows with the equipped weapon (1.5 → 3 with the Moon Sword)',
  gear.plain === 1.5 && gear.moon === 3, gear);

console.log('\n── 3. armour and shields do something ──────────────────');
const def = await wk.page.evaluate(() => {
  const g = window.__game, st = g.state, p = g.player;
  p.maxHearts = 99; p.hearts = 99;
  const run = (armour) => {
    st.inventory.equipped.armour = armour;
    let guarded = 0;
    for (let i = 0; i < 300; i++) { p.iframes = 0; const h = p.hearts; p.hurt(1, {}); if (p.hearts === h) guarded++; p.hearts = 99; }
    return guarded;
  };
  if (!st.inventory.armours.includes('moon')) st.inventory.armours.push('moon');
  const plain = run('plain'); const moon = run('moon');
  st.inventory.equipped.armour = 'plain';
  // a raised shield against an ordinary hit, and against a heavy one
  p.setForm('knight', { silent: true });
  p.defending = true; p.defendStart = p._time - 5;         // held, not a fresh parry
  p.iframes = 0; p.hearts = 10; p.hurt(1, {}); const ordinary = 10 - p.hearts;
  p.iframes = 0; p.hearts = 10; p.hurt(2, {}); const heavy = 10 - p.hearts;
  p.defending = false;
  return { plain, moon, ordinary, heavy };
});
check('plain armour never guards a hit', def.plain === 0, def);
check('Moonplate guards about half of them (GUARD!)', def.moon > 120 && def.moon < 190, def);
check('a raised shield stops an ordinary hit completely', def.ordinary === 0, def);
check('...and a heavy hit still pushes a little through', def.heavy > 0 && def.heavy <= 0.5, def);

console.log('\n── 4. weakness and shells: fights that need the right wolf ──');
const shell = await wk.page.evaluate(async () => {
  const g = window.__game;
  const S = await import('/js/shells.js');
  const shelled = g.world.enemies.filter((e) => e.shell);
  const e = shelled[0] || g.world.enemies.find((q) => !q.dead && !q.scenery && q.weakness);
  if (!e.shell) S.giveShell(e, Array.isArray(e.weakness) ? e.weakness[0] : e.weakness);
  const el = e.shell.element;
  const badge = !!e.shell.badge, aura = !!e.shell.aura;
  e.hp = 50; e.stunned = 0;
  e.takeDamage(1, 'steel', 'melee'); const clang = 50 - e.hp;
  e.hp = 50; e.stunned = 0; e._weakStagAt = 0;
  e.takeDamage(1, el, 'melee'); const crack = 50 - e.hp; const stillOn = !!e.shell;
  e.hp = 50; e.stunned = 0; e._weakStagAt = 0;
  e.takeDamage(1, el, 'melee'); const brk = 50 - e.hp; const gone = !e.shell; const reels = e.stunned > 1;
  e.hp = 50; e.stunned = 0; e._weakStagAt = 0;
  e.takeDamage(1, el, 'melee'); const weak = 50 - e.hp;
  return { count: shelled.length, el, badge, aura, clang, crack, stillOn, brk, gone, reels, weak };
});
check('Stoneroot hands out at least one shell', shell.count >= 1, shell);
check('a shell glows round the body and shows the breaking wolf overhead', shell.aura && shell.badge, shell);
check('the wrong element clangs off for a fraction (never zero)', shell.clang > 0 && shell.clang < 0.5, shell);
check('the right element cracks it first (still on)', shell.stillOn && shell.crack === 1, shell);
check('...and breaks it on the second hit, the enemy reeling', shell.gone && shell.reels, shell);
check('a bare weakness hit does double (1 → 2)', shell.weak === 2, shell);

console.log('\n── 5. the swap-in strike (real tap) ─────────────────────');
const s0 = await wk.page.evaluate(() => {
  const g = window.__game; const P = g.player.root.position;
  const e = g.world.enemies.find((q) => !q.dead && !q.scenery && !q.shell);
  e.shell = null; e.hp = 30; e.stunned = 0;
  e.root.position.set(P.x + 1.2, 0, P.z);
  g.player._swapStrikeAt = -99; g.player.setForm('knight', { silent: true });
  window.__swapFoe = e; return { hp: e.hp };
});
await wk.page.waitForTimeout(900);
await tapBadge();
await wk.page.waitForTimeout(700);
const s1 = await wk.page.evaluate(() => ({ hp: window.__swapFoe.hp, form: window.__game.state.form }));
check('switching form beside a foe lands a free hit in the new form\'s element',
  s1.form !== 'knight' && s1.hp < s0.hp, { s0, s1 });

console.log('\n── 6. the pack of three ─────────────────────────────────');
const seen = new Set();
for (let i = 0; i < 12; i++) {
  await wk.page.evaluate(() => { window.__game.player._swapStrikeAt = 1e12; });
  await tapBadge();
  await wk.page.waitForTimeout(900);
  seen.add(await wk.page.evaluate(() => window.__game.state.form));
}
const pk = await wk.page.evaluate(async () => (await import('/js/state.js')).packForms());
check('the form button cycles at most five forms (Knight, Dark Wolf, three wolves)',
  seen.size <= 5 && pk.length === 5 && [...seen].every((f) => pk.includes(f)), { seen: [...seen], pk });
// the ring: hold the button
const ring = await wk.page.evaluate(() => {
  const g = window.__game; const b = document.getElementById('form-badge').getBoundingClientRect();
  g.ui = g.ui || null;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
await wk.page.mouse.move(ring.x, ring.y);
await wk.page.mouse.down();
await wk.page.waitForTimeout(700);
const faces = await wk.page.evaluate(() => document.querySelectorAll('#picker .pick-option').length);
await wk.page.mouse.up();
check('holding the button shows a ring of five faces, not ten', faces === 5, { faces });
// a new wolf joins the pack the moment it is earned
const fresh = await wk.page.evaluate(async () => {
  const S = await import('/js/state.js'); const st = window.__game.state;
  st.pack = ['fire_wolf', 'earth_wolf', 'verdant_wolf']; st.packKnown = st.formsUnlocked.filter((f) => f !== 'knight' && f !== 'dark_wolf');
  if (!st.formsUnlocked.includes('ghost_wolf')) st.formsUnlocked.push('ghost_wolf');
  return S.packWolves();
});
check('a newly earned wolf joins the pack at once', fresh.includes('ghost_wolf') && fresh.length === 3, fresh);
// the Pack tab: refused away from a campfire, works at the Den
await go('den', [...ALL, 'ghost_wolf']);
await wk.page.locator('#inv-btn').dispatchEvent('pointerdown');
await wk.page.waitForTimeout(400);
for (const t of await wk.page.$$('.arm-tab')) if ((await t.textContent()).includes('Pack')) await t.dispatchEvent('pointerdown');
await wk.page.waitForTimeout(300);
const before = await wk.page.evaluate(async () => (await import('/js/state.js')).packWolves());
const out = await wk.page.evaluate(() => [...document.querySelectorAll('.pack-row')].find((r) => !r.classList.contains('on'))?.dataset.form);
if (out) await wk.page.locator(`.pack-row[data-form="${out}"]`).dispatchEvent('pointerdown');
await wk.page.waitForTimeout(300);
const after = await wk.page.evaluate(async () => (await import('/js/state.js')).packWolves());
check('at the Den, tapping a wolf in the Pack tab brings it along (still three)',
  !!out && after.includes(out) && after.length === 3 && !before.includes(out), { before, out, after });

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — gear, levels, armour, shields, shells, the swap-in strike and the pack all do what they say');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
