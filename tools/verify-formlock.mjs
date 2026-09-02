// THE TRIAL LOCK MUST HOLD FROM EVERY DIRECTION a child can push on it: the
// form button's tap-cycle, the Tab key, and the radial picker. Driven through
// real key presses, never by calling setForm().
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
for (let i = 0; i < 3; i++) { await wk.page.keyboard.press('Tab'); await wk.page.waitForTimeout(250); }
const roamed = await wk.wk('form');
check('with no lock, Tab cycles forms', roamed !== before, { before, after: roamed });

// 2. LOCKED: Tab cannot move you
await wk.page.evaluate(() => { window.__game.state.formLock = 'fire_wolf'; });
await wk.page.evaluate(() => window.__game.player.setForm('fire_wolf', { silent: true }));
await wk.page.waitForTimeout(200);
const locked0 = await wk.wk('form');
for (let i = 0; i < 5; i++) { await wk.page.keyboard.press('Tab'); await wk.page.waitForTimeout(200); }
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
for (let i = 0; i < 3; i++) { await wk.page.keyboard.press('Tab'); await wk.page.waitForTimeout(250); }
const freed = await wk.wk('form');
check('with the lock lifted, Tab cycles again', freed !== 'fire_wolf', { after: freed });

console.log('\nERRORS', JSON.stringify(wk.errors));
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — the lock holds from every direction');
await wk.b.close();
process.exit(errors.length ? 1 : 0);
