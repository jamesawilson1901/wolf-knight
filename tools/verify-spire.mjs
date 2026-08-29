// THE MOONLIT SPIRE'S GEOMETRY, MEASURED RATHER THAN BELIEVED.
//
// tools/run-spire.mjs plays this level for real, with real key events, and it
// is the honest gate. But it takes two minutes and a browser that can hold
// frames steady, so it lives in the run-* tier with the other playthroughs and
// nothing in the nightly sweep watches the Spire at all.
//
// This is the cheap half: five room builds, no play, and it recomputes the
// jump gauntlet FROM THE ZONES THE ROOM ACTUALLY REGISTERED rather than from
// the numbers written in the comment beside them. The first draft of m1 had
// pads that did not line up with its own gaps — pad A touched the near shore
// (no jump at all) and the last gap was 3.4u (no jump possible) — and every
// number in the comment above them said otherwise. A suite that reads
// `world.pitAt` cannot be lied to by a comment.
//
// The laws:
//   1  the void spans the room WALL TO WALL, so it cannot be walked around
//   2  every gap is inside the jump budget, and no gap is zero
//   3  every gap has somewhere to land on the far side of it
//   4  a fall costs the walk: pitReturn exists and is on solid ground
//   5  the way BACK is never gated — only the way on
//   6  both trials pay: a chest AND the sigil that opens the last door
//   7  the crown carries the grant
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// THE JUMP BUDGET, DERIVED FROM player.js RATHER THAN GUESSED.
//   JUMP_V 6.8 against GRAVITY 21 → 2 * 6.8 / 21 = 0.648s airborne
//   the slowest form in the game is the knight at 4.6 u/s
//   → 2.98u of carry, at the WORST case, with no double jump
// A gap is capped well under that. MIN_GAP exists because a gap a child can
// walk across is not a jump, and this room's whole reason to exist is that
// one place in the game needs the button.
const CARRY = (2 * 6.8 / 21) * 4.6;
const MAX_GAP = 2.0;
const MIN_GAP = 1.0;
const MIN_PAD = 2.0;   // somewhere to stand, stop, and line the next one up

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SPIREGEO');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
});

const go = async (room) => {
  for (let a = 0; a < 6; a++) {
    await page.evaluate((r) => {
      const g = window.__game;
      g.state.flags.plates = {};                // judge every room UNSOLVED
      // and the sigils with them — WS has no clear(), and a room that
      // remembers being solved is a room this suite never judges
      if (g.state.flags.world) delete g.state.flags.world.spire;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true });
    }, room);
    try {
      await page.waitForFunction((r) => window.__game.world
        && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

console.log(`\n── 1-4 · the gauntlet (jump budget ${CARRY.toFixed(2)}u at the worst case) ──`);
if (!(await go('m1'))) check('m1 builds', false);
else {
  const m1 = await page.evaluate(() => {
    const w = window.__game.world;
    // walk the centre line in 5cm steps and ask the WORLD, not the source,
    // where the floor stops
    const step = 0.05, out = [];
    for (let z = w.halfD - 0.5; z >= -w.halfD + 0.5; z -= step) out.push(w.pitAt(0, z) ? 1 : 0);
    return { step, out, start: w.halfD - 0.5,
      halfW: w.halfW, halfD: w.halfD,
      pitZones: w.pitZones.map((p) => ({ ...p })),
      safeZones: w.safeZones.map((z) => ({ ...z })),
      pitReturn: w.pitReturn, returnSolid: w.pitReturn ? !w.pitAt(w.pitReturn.x, w.pitReturn.z) : null,
      pits: w.pitZones.length, safes: w.safeZones.length };
  });
  // turn the sampled line into runs
  const runs = [];
  for (let i = 0; i < m1.out.length; i++) {
    const v = m1.out[i];
    if (!runs.length || runs[runs.length - 1].v !== v) runs.push({ v, n: 1 });
    else runs[runs.length - 1].n++;
  }
  const gaps = runs.filter((r) => r.v === 1).map((r) => +(r.n * m1.step).toFixed(2));
  const pads = runs.filter((r) => r.v === 0).map((r) => +(r.n * m1.step).toFixed(2));
  // the gaps as REAL z ranges, walked back down the sampled line
  const gapRanges = [];
  {
    let z = m1.start;
    for (const r of runs) {
      const z1 = z - r.n * m1.step;
      if (r.v === 1) gapRanges.push({ minZ: +z1.toFixed(2), maxZ: +z.toFixed(2) });
      z = z1;
    }
  }

  // "IT CANNOT BE WALKED AROUND" IS TWO PROPERTIES, NOT ONE ROW OF SAMPLES.
  //
  // The first version of this check swept the pit's CENTRE row and asked for a
  // hole at every x. It failed — correctly reporting a fact, incorrectly
  // calling it a fault: the pit's centre row happens to pass through the
  // OPTIONAL east ledge, which is supposed to be solid. Sampling one row tests
  // where the hole is, not whether you can get round it.
  //
  // What actually has to be true is:
  //   a) the hole reaches both side walls, so there is no verge to walk along
  //   b) no safe pad BRIDGES a gap — a pad spanning a gap's whole depth is a
  //      plank across it, and the jump stops being required
  const spansWalls = m1.pitZones.every((p) => p.minX <= -m1.halfW + 0.1 && p.maxX >= m1.halfW - 0.1);
  check('the void reaches both side walls — there is no verge to walk along',
    m1.pitZones.length > 0 && spansWalls, m1.pitZones);
  const bridged = gapRanges.filter((g) =>
    m1.safeZones.some((z) => z.minZ <= g.minZ + 0.01 && z.maxZ >= g.maxZ - 0.01));
  check('no pad bridges a gap — every gap still has to be jumped',
    bridged.length === 0, { bridged, gapRanges });
  check('there are at least three gaps to jump', gaps.length >= 3, { gaps });
  check(`every gap is a real jump and inside the budget (${MIN_GAP}-${MAX_GAP}u)`,
    gaps.length > 0 && gaps.every((g) => g >= MIN_GAP && g <= MAX_GAP), { gaps, CARRY: +CARRY.toFixed(2) });
  // the pads BETWEEN gaps (drop the two shores at either end of the line)
  const inner = pads.slice(1, -1);
  check(`every gap has somewhere to land (pads >= ${MIN_PAD}u)`,
    inner.length > 0 && inner.every((p) => p >= MIN_PAD), { pads: inner });
  check('a miss costs the walk: pitReturn is set, and on solid ground',
    !!m1.pitReturn && m1.returnSolid === true,
    // NOT the whole `m1` object — it carries the 500-sample centre line, and a
    // suite that prints half a screen of ones and zeroes per check is a suite
    // nobody reads
    { pitReturn: m1.pitReturn, onSolidGround: m1.returnSolid, pits: m1.pits, pads: m1.safes });
}

console.log('\n── 5 · the way back is never gated ──────────────────────');
for (const [room, onward] of [['m1', 'm2'], ['m2', 'm3'], ['ma', null], ['mb', null], ['m3', null]]) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const s = await page.evaluate(() => {
    const w = window.__game.world;
    return (w.doors || []).map((d) => ({ to: d.to, gated: !!d.when }));
  });
  const gated = s.filter((d) => d.gated).map((d) => d.to);
  check(`${room}: only the way ON can be gated`,
    gated.length === 0 || (gated.length === 1 && gated[0] === onward), { room, doors: s });
}

console.log('\n── 6-7 · both trials pay, and the crown grants ──────────');
for (const [room, id] of [['ma', 'stone'], ['mb', 'flame']]) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const s = await page.evaluate(() => {
    const w = window.__game.world;
    return { chestDefs: ((w.markers && w.markers.chestDefs) || []).length,
      chests: (w.chests || []).length,
      plates: (w.plates || []).map((p) => p.id),
      foes: (w.enemies || []).filter((e) => !e.scenery).length };
  });
  check(`the trial of ${id} pays a reward of its own`, s.chestDefs > 0 || s.chests > 0, s);
  check(`the trial of ${id} has something to actually do`,
    s.plates.length > 0 || s.foes > 0, s);
}
if (!(await go('m2'))) check('m2 builds', false);
else {
  const s = await page.evaluate(() => {
    const w = window.__game.world;
    const up = (w.doors || []).find((d) => d.to === 'm3');
    return { hasUp: !!up, shut: up ? (up.when ? !up.when() : false) : null,
      barred: (w.boxColliders || []).some((c) => c.minX < 0 && c.maxX > 0
        && c.minZ < -8.5 && c.maxZ > -10.5) };
  });
  check('the last door is shut, and there are BARS in it, until both sigils burn',
    s.hasUp && s.shut === true && s.barred, s);
}
if (!(await go('m3'))) check('m3 builds', false);
else {
  const s = await page.evaluate(() => {
    const m = window.__game.world.markers || {};
    return { grants: m.sparkSpot ? m.sparkSpot.grants : null,
      chestDefs: (m.chestDefs || []).length };
  });
  check('the crown grants the Elemental Wolf', s.grants === 'elemental_wolf', s);
  check('and pays the last chest in the game', s.chestDefs > 0, s);
}

check('nothing threw while building the Spire', pageErrors.length === 0, pageErrors.slice(0, 4));
console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : '\nALL CLEAN — the Spire measures the way it reads.');
await b.close();
process.exit(errors.length ? 1 : 0);
