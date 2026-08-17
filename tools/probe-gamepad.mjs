// DUALSENSE WITHOUT A DUALSENSE: inject a fake standard-mapping pad through
// the real navigator.getGamepads() poll path, then assert GAME effects via
// __wk: the stick walks Kael, cross swings, R1 raises the shield, triangle
// cycles the form. This drives the exact code a real pad drives — only the
// hardware object is synthetic.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/gamepad' });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

await d.newGame('PAD');
await d.jump('t1a', ['knight', 'dark_wolf', 'fire_wolf']);
await d.page.evaluate(() => {
  window.__pad = {
    connected: true, mapping: 'standard', id: 'Fake DualSense',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad] });
});
const setPad = (fn) => d.page.evaluate(fn);

// the D2 fix means t1a now opens on Pip's wild_enter line, which BLOCKS the
// world — wait the story out before judging whether inputs move anything
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});
await d.page.waitForTimeout(600);

// stick north — the player must walk
const p0 = await d.wk('pos');
await setPad(() => { window.__pad.axes[1] = -1; });
await d.page.waitForTimeout(2200);
await setPad(() => { window.__pad.axes[1] = 0; });
const p1 = await d.wk('pos');
say('stick north:', p0.z, '->', p1.z);
if (!(p1.z < p0.z - 0.8)) bad('left stick did not walk the player');

// cross — a swing
await setPad(() => { window.__pad.buttons[0].pressed = true; });
const swing = await d.page.waitForFunction(() =>
  window.__game.player._current && /attack|slash|thrust/i.test(window.__game.player._current),
  null, { timeout: 3000 }).then(() => true).catch(() => false);
await setPad(() => { window.__pad.buttons[0].pressed = false; });
say('cross swing:', swing);
if (!swing) bad('cross did not attack');

// R1 hold — shield up, release — shield down
await setPad(() => { window.__pad.buttons[5].pressed = true; });
await d.page.waitForTimeout(700);
const up = await d.page.evaluate(() => window.__game.input.defending);
await setPad(() => { window.__pad.buttons[5].pressed = false; });
await d.page.waitForTimeout(700);
const down = await d.page.evaluate(() => window.__game.input.defending);
say('R1 shield:', up, '-> release:', down);
if (!up || down) bad('R1 hold/release did not control the shield');

// triangle — form cycles
const f0 = await d.wk('form');
await setPad(() => { window.__pad.buttons[3].pressed = true; });
await d.page.waitForFunction((f) => window.__wk.form !== f, f0, { timeout: 3000 }).catch(() => {});
await setPad(() => { window.__pad.buttons[3].pressed = false; });
const f1 = await d.wk('form');
say('triangle form:', f0, '->', f1);
if (f0 === f1) bad('triangle did not cycle the form');

// pad ABSENT — keyboard still owns the world (no regression)
await d.page.evaluate(() => { Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }); });
const k0 = await d.wk('pos');
await d.page.keyboard.down('s'); await d.page.waitForTimeout(900); await d.page.keyboard.up('s');
const k1 = await d.wk('pos');
if (!(k1.z > k0.z + 0.3)) bad('keyboard movement broken with no pad');
else say('keyboard unaffected with no pad');

say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
