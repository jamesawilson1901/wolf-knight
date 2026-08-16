// PROFILE ISOLATION — two kids share one tablet. Profile A's save must not
// bleed into B's game, and B playing must not touch A's save. Real title-screen
// flow: create A, play, create B, play, then continue A and compare.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/profile-isolation' });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

const saves = () => d.page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('wolfknight:save:')) out[k] = JSON.parse(localStorage.getItem(k));
  }
  return out;
});

// ---- profile A: new game, distinctive progress, saved ---------------------
await d.newGame('KID-A');
await d.jump('vh', ['fire_wolf']);                 // A stands in Stoneroot with fire
await d.page.evaluate(() => { const g = window.__game; g.state.flags.chests.iso_probe_a = true; g.persist(); });
const idA = await d.page.evaluate(() => window.__game.state.profileId);
const afterA = await saves();
const keyA = 'wolfknight:save:' + idA;
if (!afterA[keyA]) bad('profile A has no save slot');
say('A saved:', keyA, 'room', afterA[keyA]?.room, 'forms', JSON.stringify(afterA[keyA]?.formsUnlocked));

// ---- profile B: fresh game from the title, its own progress ---------------
await d.newGame('KID-B');
const idB = await d.page.evaluate(() => window.__game.state.profileId);
if (idA === idB) bad('profile B got profile A\'s id');
{
  const s = await d.wk();
  const forms = await d.wk('forms');
  if (forms.includes('fire_wolf')) bad(`B starts with A's fire wolf (forms: ${forms})`);
  const bleed = await d.page.evaluate(() => !!window.__game.state.flags.chests.iso_probe_a);
  if (bleed) bad("B sees A's chest flag");
  say('B fresh:', JSON.stringify({ room: s.room, forms }));
}
await d.page.evaluate(() => { const g = window.__game; g.state.flags.chests.iso_probe_b = true; g.persist(); });

// A's save must be byte-identical after B's session (updatedAt aside)
const afterB = await saves();
{
  const a1 = { ...afterA[keyA], updatedAt: 0 };
  const a2 = { ...(afterB[keyA] || {}), updatedAt: 0 };
  if (JSON.stringify(a1) !== JSON.stringify(a2)) bad("B's play modified A's save");
  else say("A's save untouched by B's session");
  if (!afterB['wolfknight:save:' + idB]) bad('profile B has no save slot');
}

// ---- continue A from the title: A's world, not B's ------------------------
await d.page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await d.page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
{
  // the title lists profiles; press A's button by its name, then Continue
  const btn = d.page.locator('.profile-btn', { hasText: 'KID-A' }).first();
  if (!(await btn.isVisible().catch(() => false))) bad('KID-A button not on title');
  else {
    await btn.dispatchEvent('pointerdown');
    await d.page.waitForSelector('#t-continue', { state: 'visible', timeout: 10000 });
    await d.page.locator('#t-continue').dispatchEvent('pointerdown');
    await d.page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });
    const forms = await d.wk('forms');
    const flagsOk = await d.page.evaluate(() => ({
      a: !!window.__game.state.flags.chests.iso_probe_a,
      b: !!window.__game.state.flags.chests.iso_probe_b,
      id: window.__game.state.profileId,
    }));
    if (flagsOk.id !== idA) bad('continue loaded the wrong profile');
    if (!flagsOk.a) bad("A's own chest flag missing after continue");
    if (flagsOk.b) bad("A sees B's chest flag");
    if (!forms.includes('fire_wolf')) bad("A lost the fire wolf");
    say('A continued:', JSON.stringify({ room: await d.wk('room'), forms, flagsOk }));
  }
}

say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
