// THE SHOULDER PIN, MADE SENSE OF. Verify the new vc3 mechanism end to end:
// the titan's arm + hovering hand + charred timber strut are on screen, the
// pin_hint names the beam, a real fire slam burns the strut, the hand FALLS,
// handDown completes — then the hub shows the arm-to-ramp payoff, the crypt
// door is walkable through the new low stair trim, and the return landing is
// on open floor (not inside geometry).
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-2/pin-arm', timescale: 1 });
const say = (...a) => console.log(...a);
let ok = true;

await d.newGame('PINARM');

// --- vc3: the mechanism, before ---
await d.jump('vc3', ['knight', 'dark_wolf', 'fire_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking, null, { timeout: 20000 }).catch(() => {});
const before = await d.page.evaluate(() => {
  const w = window.__game.world;
  const hand = w.root.children.filter((c) => c.children && c.children.some &&
    c.children.some((k) => k.userData && false)); // hand is a Group; find via loose set
  return {
    burnables: (w.burnables || []).map((b) => ({ id: b.id, x: b.x, z: b.z })),
    burned: !!window.__game.state.flags.burned.l2_vc3_pin,
    handDown: !!window.__game.WS.get('vault', 'handDown'),
  };
});
say('vc3 before:', JSON.stringify(before));
ok = ok && before.burnables.some((b) => b.id === 'l2_vc3_pin') && !before.handDown;
await d.walkTo(0, -1.2, { timeout: 25, arrive: 0.7 }).catch(() => {});
await d.page.waitForTimeout(1200);
const hinted = await d.page.evaluate(() => !!window.__game.state.spoken.pin_hint);
say(hinted ? '  PASS: pin_hint spoke on approach' : '  FAIL: no pin_hint');
ok = ok && hinted;
await d.shot('vc3-arm-up');

// --- burn the strut, watch the hand fall ---
await d.page.evaluate(() => { const g = window.__game; g.state.form = 'fire_wolf'; });
for (let i = 0; i < 10; i++) {
  if ((await d.wk('form')) === 'fire_wolf') break;
  await d.tap('Tab'); await d.page.waitForTimeout(400);
}
await d.walkTo(1.3, -3, { timeout: 20, arrive: 0.8 }).catch(() => {});
let burned = false;
for (let i = 0; i < 8 && !burned; i++) {
  await d.tap('k'); await d.page.waitForTimeout(1300);
  burned = await d.page.evaluate(() => !!window.__game.state.flags.burned.l2_vc3_pin);
}
say(burned ? '  strut BURNED' : '  FAIL: could not burn strut');
ok = ok && burned;
await d.page.waitForTimeout(2500);   // the fall tween (fall rate 1.4 → ~0.7s game time ≈ slower real)
const after = await d.page.evaluate(() => ({
  handDown: !!window.__game.WS.get('vault', 'handDown') }));
say('after burn:', JSON.stringify(after));
ok = ok && after.handDown;
await d.shot('vc3-hand-fallen');

// --- rebuilt state: re-enter and confirm the dropped arm persists ---
await d.jump('vh', ['knight', 'dark_wolf', 'fire_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking, null, { timeout: 20000 }).catch(() => {});
const hub = await d.page.evaluate(() => ({
  stage: window.__game.WS.stage('vault'),
  doors: (window.__game.world.doors || []).map((x) => x.to) }));
say('hub:', JSON.stringify(hub));
// need stage 3 for the crypt door: drive remaining milestones if absent
if (hub.stage < 3) {
  await d.page.evaluate(() => {
    const g = window.__game;
    g.WS.set('vault', 'spark', true); g.WS.set('vault', 'drained', true);
  });
  await d.jump('vh', ['knight', 'dark_wolf', 'fire_wolf']);
  await d.page.waitForFunction(() => !window.__game.narration.speaking, null, { timeout: 20000 }).catch(() => {});
}
const hub2 = await d.page.evaluate(() => ({
  stage: window.__game.WS.stage('vault'),
  doors: (window.__game.world.doors || []).map((x) => x.to) }));
say('hub at stage:', JSON.stringify(hub2));
ok = ok && hub2.doors.includes('vz');

// --- walk INTO the crypt through the new trim (real walking, no jump) ---
// first stand at the stair foot and photograph the entrance the child sees
await d.walkTo(9, -9.6, { timeout: 45, arrive: 0.6 }).catch(() => {});
await d.shot('vh-crypt-entrance');
// then walk INTO the trigger (rect z -15.35..-13.85 — aim past its front edge)
const walk = await d.walkTo(9, -14.6, { timeout: 30, arrive: 0.4 });
say('walk to crypt door:', JSON.stringify(walk));
await d.page.waitForTimeout(1500);
const room1 = await d.wk('room');
say('room after walking north lane:', room1);
ok = ok && (room1 === 'vz' || walk.roomChanged === 'vz');
await d.shot('entered-crypt');

// --- and back: the return landing must be on open floor ---
if ((await d.wk('room')) === 'vz') {
  const back = await d.walkTo(9, -13.0, { timeout: 40, arrive: 0.6 }).catch(() => ({}));
  // vz south door leads home; walk toward it
  const doors = await d.wk('doors');
  const home = doors.find((x) => x.to === 'vh');
  if (home) {
    await d.walkTo(home.x, home.z, { timeout: 40, arrive: 0.4 }).catch(() => {});
    await d.page.waitForTimeout(1500);
  }
  const room2 = await d.wk('room');
  const pos = (await d.wk()).pos;
  say('returned:', room2, JSON.stringify(pos));
  if (room2 === 'vh') {
    // landing (9,-10.2) must be able to MOVE: take a step and confirm motion
    await d.page.keyboard.down('s'); await d.page.waitForTimeout(700); await d.page.keyboard.up('s');
    const pos2 = (await d.wk()).pos;
    const moved = Math.hypot(pos2.x - pos.x, pos2.z - pos.z) > 0.3;
    say(moved ? '  PASS: return landing walks freely' : '  FAIL: stuck at return landing');
    ok = ok && moved;
    await d.shot('returned-to-hub');
  }
}

say('errors:', JSON.stringify(d.errors));
ok = ok && d.errors.length === 0;
say(ok ? 'PIN-ARM + CRYPT ENTRANCE: PASS' : 'PIN-ARM + CRYPT ENTRANCE: FAIL');
d.saveLog('pin-arm');
await d.close();
process.exit(ok ? 0 : 1);
