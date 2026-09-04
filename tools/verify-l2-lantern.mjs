// LEVEL 2 RUNS ON LANTERNS, NOT ON A GIANT'S ARM.
//
// Dad, from play: "the second level makes zero sense in terms of things you
// need to do to unlock the door. get rid of the 'the giants arm is trapped'
// and all that crap that has no logical sense. just make it they have to use
// the fire wolf to light different lanterns in different areas and one area is
// in the dark and has pitfall to the beginning of that room, so you have to use
// the dark wolf to get to the lantern."
//
// This asserts the shape of that: the titan and its pin are gone, the crypt is
// opened by the deep lantern, the dark room is genuinely dark and genuinely
// holed, the holes send a child back to the door rather than killing them, and
// the Dark Wolf can see where the other forms cannot.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
const page = await b.newPage({ viewport: { width: 740, height: 360 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'L2');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'];
const go = async (room) => {
  await page.evaluate(({ room, forms }) => window.__wkJump(room, forms), { room, forms: FORMS });
  await page.waitForFunction((r) => window.__game.world
    && window.__game.world.roomId === window.__game.resolveRoom(r)
    && window.__game.player.hearts > 1 && !window.__wk.gates.transitioning,
  room, { timeout: 45000 });
  await page.waitForTimeout(250);
};

// ---- 1. the dark room is dark, holed, and has a lantern --------------------
await go('vc3');
const deep = await page.evaluate(() => {
  const w = window.__game.world;
  return {
    pits: (w.pitZones || []).length,
    darkZones: (w.darkZones || []).length,
    lantern: w.markers.deepLanternSpot || null,
    pinGone: !w.markers.pinSpot,
    pitReturn: w.pitReturn,
    braziers: (w.braziers || []).map((x) => x.id),
    // is the middle of the room actually a hole, and the doorway not?
    holeAtCentre: w.pitAt(0, 0),
    floorAtDoor: !w.pitAt(0, 5.5),
    darkAtCentre: w.darknessAt(0, 0) === 1,
  };
});
check('vc3 has holes in the floor', deep.pits >= 2, { pits: deep.pits });
check('vc3 is a dark zone', deep.darkZones >= 1 && deep.darkAtCentre, deep.darkZones);
check('vc3 has the deep lantern', !!deep.lantern && deep.braziers.includes('l2_deep_lantern'), deep.braziers);
check('the shoulder pin is gone', deep.pinGone);
check('the middle is a hole, the doorway is floor', deep.holeAtCentre && deep.floorAtDoor,
  { holeAtCentre: deep.holeAtCentre, floorAtDoor: deep.floorAtDoor });
check('a fall returns to the room entry', !!deep.pitReturn, deep.pitReturn);

// ---- 2. falling costs the walk, never a heart ------------------------------
const fall = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.player;
  p.hearts = 5;
  const before = p.hearts;
  p.root.position.set(0, 0, 0);         // stand in the hole
  p.airY = 0; p._pitFall = null;
  for (let i = 0; i < 60; i++) p._hazards(1 / 60, g.world);   // ~1s of falling
  return { before, after: p.hearts,
    x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2) };
});
check('falling in costs no hearts', fall.after === fall.before, fall);
check('falling in puts you back at the door', Math.abs(fall.z - 5.5) < 0.6, fall);

// ---- 3. the Dark Wolf sees what the others cannot --------------------------
// Reads the LIGHT RIG, which is the darkness. It used to read a veil quad's
// opacity — a proxy that is now gone, because painting a volume of darkness
// onto a plane is what put a visible seam across dad's floor.
const sight = await page.evaluate(async () => {
  const g = window.__game;
  const read = () => g.lights.hemi.intensity / g.lights.HEMI_BASE;
  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r)); };
  g.player.setForm('knight', { silent: true });
  await settle();
  const asKnight = read();
  g.player.setForm('dark_wolf', { silent: true });
  await settle();
  const asDark = read();
  return { asKnight: +asKnight.toFixed(3), asDark: +asDark.toFixed(3) };
});
check('the Dark Wolf lifts the dark, other forms do not',
  sight.asKnight < 0.15 && sight.asDark > 0.8, sight);

// ---- 4. the crypt opens on the lantern, not on a hand ----------------------
const crypt = await page.evaluate(async () => {
  const g = window.__game;
  const before = g.WS.stage('vault');
  g.WS.set('vault', 'spark', true);
  g.WS.set('vault', 'drained', true);
  const mid = g.WS.stage('vault');
  g.WS.set('vault', 'deepLantern', true);
  const after = g.WS.stage('vault');
  // and a LEGACY save that opened it the old way must stay open
  g.state.flags.world.vault = { spark: true, drained: true, handDown: true };
  const legacy = g.WS.stage('vault');
  return { before, mid, after, legacy };
});
check('lighting the deep lantern reaches stage 3', crypt.after === 3, crypt);
check('a legacy handDown save still reaches stage 3', crypt.legacy === 3, crypt);

// ---- 5. the hub anchor is a beacon, and the titan is nowhere ---------------
await go('vh');
const hub = await page.evaluate(() => {
  const w = window.__game.world;
  const names = [];
  w.root.traverse((n) => { if (n.name) names.push(n.name); });
  return { hero: w.markers.heroSpot,
    titanish: names.filter((n) => /titan|fist|hand/i.test(n)) };
});
check('the hub still has its anchor', !!hub.hero, hub.hero);
check('nothing named titan/fist/hand is left in the hub', hub.titanish.length === 0, hub.titanish);

console.log(errors.length ? `\n✗ ${errors.length} FAILED` : '\n✓ ALL CLEAN');
await b.close();
process.exit(errors.length ? 1 : 0);
