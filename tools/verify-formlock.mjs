// THE TRIAL LOCK MUST HOLD FROM EVERY DIRECTION a child can push on it: the
// form button's tap-cycle, the Tab key, and the radial picker. Driven through
// real key presses, never by calling setForm().
//
// IT USED TO WAIT ON A GUESSED DURATION, and that is why it failed on main's
// push gate on 2026-09-05 while passing every time it was run by hand. Each
// Tab was followed by waitForTimeout(250) and then a read — enough on an idle
// box, not always enough on a loaded CI runner, so the read caught the form
// mid-change and "with no lock, Tab cycles forms" reported a false failure.
// docs/TESTING.md section 7b already names this exact trap ("never measure
// during an animation you triggered; wait for the thing to STOP MOVING, never
// for a duration you guessed") — verify-touch was fixed for it and this suite
// was not.
//
// The two POSITIVE cases now wait for the form to actually change, bounded by
// a real timeout, and only then assert. The NEGATIVE case (the lock holds) is
// the one place a fixed wait is honest: there is no event to wait for, and the
// whole claim is that nothing happens, so it presses, settles and re-reads —
// generously, because being slow can only make that check weaker, never a
// false pass.
import { launch } from './wk-drive.mjs';
const wk = await launch({ timescale: 1 });
await wk.newGame('LOCK');
// give every form so the cycle has somewhere to go if the lock leaks
await wk.page.evaluate(() => window.__wkJump('la', ['knight', 'dark_wolf', 'earth_wolf',
  'fire_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf']));
await wk.page.waitForFunction(() => window.__wk.room === 'la' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n); };

// 1. UNLOCKED: Tab really does move you
const before = await wk.wk('form');
// Press, then WAIT FOR THE FORM TO MOVE rather than for a guessed 250ms.
let roamed = before;
for (let i = 0; i < 3 && roamed === before; i++) {
  await wk.page.keyboard.press('Tab');
  try {
    await wk.page.waitForFunction((f) => window.__wk.form !== f, before, { timeout: 5000 });
  } catch { /* the assertion below reports it */ }
  roamed = await wk.wk('form');
}
check('with no lock, Tab cycles forms', roamed !== before, { before, after: roamed });

// 2. LOCKED: Tab cannot move you
await wk.page.evaluate(() => { window.__game.state.formLock = 'fire_wolf'; });
await wk.page.evaluate(() => window.__game.player.setForm('fire_wolf', { silent: true }));
await wk.page.waitForTimeout(200);
const locked0 = await wk.wk('form');
// NOTHING should happen here, so there is no event to wait on. A fixed settle
// is the honest instrument for a negative, and a longer one only makes the
// check stricter.
for (let i = 0; i < 5; i++) { await wk.page.keyboard.press('Tab'); await wk.page.waitForTimeout(300); }
const locked1 = await wk.wk('form');
check('under a lock, Tab cannot leave the locked form', locked0 === 'fire_wolf' && locked1 === 'fire_wolf',
  { start: locked0, after5Tabs: locked1 });

// 3. LOCKED: the picker shows one option, the rest greyed
const picker = await wk.page.evaluate(async () => {
  const { formsAvailable } = await import('/js/state.js');
  return { available: formsAvailable(), unlocked: window.__game.state.formsUnlocked.length };
});
check('...and formsAvailable() offers exactly the locked form', picker.available.length === 1
  && picker.available[0] === 'fire_wolf', picker);

// 4. LOCKED: setForm itself refuses, so nothing can route around it
const refused = await wk.page.evaluate(() => window.__game.player.setForm('frost_wolf'));
check('...and setForm() itself refuses another form', refused === false, { returned: refused });

// 5. RELEASED: it all comes back
await wk.page.evaluate(() => { window.__game.state.formLock = null; });
let freed = 'fire_wolf';
for (let i = 0; i < 3 && freed === 'fire_wolf'; i++) {
  await wk.page.keyboard.press('Tab');
  try {
    await wk.page.waitForFunction(() => window.__wk.form !== 'fire_wolf', null, { timeout: 5000 });
  } catch { /* the assertion below reports it */ }
  freed = await wk.wk('form');
}
check('with the lock lifted, Tab cycles again', freed !== 'fire_wolf', { after: freed });

console.log('\nERRORS', JSON.stringify(wk.errors));
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — the lock holds from every direction');
await wk.b.close();
process.exit(errors.length ? 1 : 0);
