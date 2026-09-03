// THE NIGHT ROAD, WALKED (js/levelNight.js).
//
// The road between Ember Hollow and Stoneroot, and the first interstitial a
// child is guaranteed to reach. Its whole design rests on one claim, and that
// claim is the thing this suite exists to hold:
//
//     THE DARK WOLF IS THE ANSWER, AND NOTHING IS LOCKED BEHIND IT.
//
// Both halves matter. If the dark is not really dark, the room is a field with
// some rocks in it. If the dark is IMPASSABLE without the Dark Wolf, a child
// who has not worked out the form wheel is stuck on the road out of level one,
// which is the worst place in the game to strand somebody. So it is walked
// twice — once measuring the dark, once through it as the Knight.
//
// ONE ROOM, ONE BUILD. Everything asked of `n1` is asked in a single visit,
// in the order a child meets it: the dark, the road through it, the hole in
// the middle, the nook off the side. A room rebuild is the most expensive
// thing this harness does (asset load, dressing, batching) and the first cut
// of this file paid for it eleven times to answer seven questions.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'fire_wolf'];
const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const wk = await launch({ timescale: 1 });
await wk.newGame('NIGHT');

const go = async (room) => {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: FORMS });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
};
const frames = (n = 8) => wk.page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);
const roomShape = () => wk.page.evaluate(() => {
  const g = window.__game, w = g.world;
  let meshes = 0;
  w.root.traverse((n) => { if (n.isMesh) meshes++; });
  // NOTHING INTERACTIVE IN THE BLIND STRIP — verify-level1's rule 7, which
  // only ever ran over Level 1's own rooms. The 2.5u nearest the wall a child
  // arrives through is behind the camera on arrival, so a chest or a pot put
  // there is a thing they can only find by walking backwards into a wall.
  let southEdge = -Infinity;
  for (const c of w.boxColliders) southEdge = Math.max(southEdge, c.maxZ);
  const blind = [];
  for (const [k, v] of Object.entries(w.markers)) {
    const look = (o) => { if (o && typeof o.z === 'number' && o.z > southEdge - 2.5) blind.push(`${k}@${o.z}`); };
    if (Array.isArray(v)) v.forEach(look); else look(v);
  }
  return { meshes, calls: g.renderer.info.render.calls,
    doors: (w.doors || []).map((d) => d.to),
    dark: (w.darkZones || []).length,
    chests: (w.markers.chestDefs || []).length,
    blind,
    // NO BRANCH MAY CARRY PUPS (design/LEVEL-DESIGN-BRANCHES.md): the heart
    // awards key on a GLOBAL running count, so a pup on the road out of
    // region one would hand a child Stoneroot's heart before Stoneroot.
    pups: (w.markers.pupSpots || []).length
      + Object.keys(w.markers).filter((k) => /^pup\d*Spot$/.test(k)).length };
});

console.log('\n── 1. the road runs through it ─────────────────────────');
await go('le');
await wk.page.evaluate(() => { window.__game.state.flags.bossDefeated = true; });
await go('le');
const heart = await wk.wk('doors');
check('Ember\'s heart now opens onto the road', heart.some((d) => d.to === 'n1'),
  heart.map((d) => d.to));
check('...and no longer straight into the Great Vault', !heart.some((d) => d.to === 'vh'),
  heart.map((d) => d.to));

console.log('\n── 2. the two rooms, and what they are made of ─────────');
await go('n2');
const m2 = await roomShape();
check('n2 builds, is dark, and goes where it should',
  m2.meshes > 40 && m2.calls < 125 && m2.dark >= 1 && m2.chests >= 2
  && ['n1', 'vh'].every((d) => m2.doors.includes(d)), m2);
check('n2 carries no pups and keeps the blind strip clear',
  m2.pups === 0 && m2.blind.length === 0, { pups: m2.pups, blind: m2.blind });

await go('n1');
const m1 = await roomShape();
check('n1 builds, is dark, and goes where it should',
  m1.meshes > 40 && m1.calls < 125 && m1.dark >= 1 && m1.chests >= 2
  && ['le', 'n2'].every((d) => m1.doors.includes(d)), m1);
check('n1 carries no pups and keeps the blind strip clear',
  m1.pups === 0 && m1.blind.length === 0, { pups: m1.pups, blind: m1.blind });

console.log('\n── 3. the dark is real, and the wolf is the answer ─────');
const dark = await wk.page.evaluate(() => {
  const w = window.__game.world;
  const z = w.darkZones[0];
  return { atSpawn: w.darknessAt(w.spawn.x, w.spawn.z),
    onTheRoad: w.darknessAt(-6, -4), farEnd: w.darknessAt(0, -11),
    zone: { minZ: z.minZ, maxZ: z.maxZ } };
});
check('the camp end is lit and everything past it is not',
  dark.atSpawn === 0 && dark.onTheRoad === 1 && dark.farEnd === 1, dark);

// main.js writes the veil every frame off the CURRENT FORM, so this has to be
// measured with the loop running, in each shape, not read off the material.
await wk.page.evaluate(() => window.__game.player.setForm('knight'));
await frames();
const veilKnight = await wk.page.evaluate(() => window.__game.world.darkZones[0].veilMat.opacity);
await wk.page.evaluate(() => window.__game.player.setForm('dark_wolf'));
await frames();
const veilWolf = await wk.page.evaluate(() => window.__game.world.darkZones[0].veilMat.opacity);
check('the Dark Wolf lifts the veil the Knight cannot see through',
  veilKnight > 0.5 && veilWolf < 0.2, { knight: +veilKnight.toFixed(2), wolf: +veilWolf.toFixed(2) });

console.log('\n── 4. ...but the dark is not a wall ────────────────────');
// The Knight walks the whole road, in the black, to the far door. Nothing here
// may be gated on a form: a child who never opens the form wheel must still be
// able to leave. Down the WEST LANE, the one the painted path draws — a
// straight line from the camp goes through the washout, and this is asking
// whether the road works, not whether a bot can fall in a hole.
await wk.page.evaluate(() => window.__game.player.setForm('knight'));
await wk.walkTo(-10, -1, { timeout: 40, arrive: 1.4 });
await wk.walkTo(-10, -9, { timeout: 40, arrive: 1.4 });
await wk.walkTo(-4, -11.5, { timeout: 40, arrive: 1.4 });
const gotThere = await wk.wk('pos');
check('the Knight can walk the road in the dark',
  gotThere.z < -7, { endedAt: { x: +gotThere.x.toFixed(1), z: +gotThere.z.toFixed(1) } });

console.log('\n── 5. the washout costs the walk, never a heart ────────');
// KEEP THE IFRAMES ON. A pit deals no damage in the first place (player.js
// repositions and takes nothing), so dropping them would only let the moths out
// in the dark kill the bot and stall the run in the respawn path. Invulnerable
// isolates the hole from everything else in the room.
const hpBefore = await wk.page.evaluate(() => window.__game.player.hearts);
await wk.walkTo(0, -5, { timeout: 30, arrive: 1.2 });   // straight INTO the hole
await wk.page.waitForTimeout(1500);
const fell = await wk.page.evaluate(() => ({
  hearts: window.__game.player.hearts,
  pos: { x: window.__game.player.root.position.x, z: window.__game.player.root.position.z },
  ret: window.__game.world.pitReturn,
}));
check('a fall puts a child back on the near lip and takes nothing',
  fell.hearts >= hpBefore && fell.pos.z > -3.0,
  { hearts: `${hpBefore} → ${fell.hearts}`, landedAt: { x: +fell.pos.x.toFixed(1), z: +fell.pos.z.toFixed(1) },
    lip: fell.ret });

console.log('\n── 6. fire opens the nook off the road ─────────────────');
const burnBefore = await wk.page.evaluate(() =>
  (window.__game.world.burnables || []).filter((b) => !b.burned).length);
await wk.page.evaluate(() => window.__game.player.setForm('fire_wolf'));
// round the washout the EAST way — the road forks either side of the hole and
// the nook is off the east lane.
await wk.walkTo(12, 4, { timeout: 40, arrive: 1.6 });
await wk.walkTo(13, -2, { timeout: 40, arrive: 1.6 });
await wk.walkTo(13.5, -5.4, { timeout: 40, arrive: 1.6 });
for (let i = 0; i < 6; i++) {
  await wk.page.keyboard.press('k');            // the special: ground slam
  await wk.page.waitForTimeout(700);
  await wk.page.evaluate(() => { window.__game.narration.blocking = false; });
}
const burnAfter = await wk.page.evaluate(() =>
  (window.__game.world.burnables || []).filter((b) => !b.burned).length);
check('the Fire Wolf burns the thorn out of the nook mouth', burnAfter < burnBefore,
  { before: burnBefore, after: burnAfter });

console.log('\n── 7. the wardstone: a promise, and a keepsake ─────────');
await go('n2');
const crack = await wk.page.evaluate(() => ({
  crackables: (window.__game.world.crackables || []).length,
  hasEarth: window.__game.state.formsUnlocked.includes('earth_wolf'),
}));
// walk AT it: a promise gate a child can walk around is decoration
await wk.walkTo(-14, -1, { timeout: 40, arrive: 0.9 });
const stopped = await wk.wk('pos');
check('a child without the Earth Wolf cannot get behind the cracked rock',
  crack.crackables >= 1 && !crack.hasEarth && stopped.x > -12.0,
  { ...crack, stoppedAt: +stopped.x.toFixed(2) });

const before = await wk.page.evaluate(() => [...window.__game.state.inventory.treasures]);
await wk.walkTo(12.5, -9.0, { timeout: 50, arrive: 0.8 });
await wk.page.waitForTimeout(2500);
await wk.page.evaluate(() => { window.__game.narration.blocking = false; });
const after = await wk.page.evaluate(() => [...window.__game.state.inventory.treasures]);
check('walking onto the gold chest hands over the Wayfarer\'s Key',
  !before.includes('wayfarers_key') && after.includes('wayfarers_key'), { before, after });

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length
  ? `\n✗ FAIL — ${errors.length} problem(s)`
  : '\n✓ PASS — the road is dark, walkable in any shape, and pays what it promised');
process.exit(errors.length ? 1 : 0);
