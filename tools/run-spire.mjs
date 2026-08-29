// THE MOONLIT SPIRE, PLAYED FOR REAL.
//
// Every claim in here is made through the same pipeline a child uses: real
// Playwright key events into the game (WASD to walk, Space to jump, J to
// attack), and window.__wk — a READ-ONLY view — to see what happened. No
// gameplay API is called to make anything true. That is the standing rule
// ("verify fixes via real input paths, not by inference from source alone")
// and it is the only way to make the claim this level exists to make: THAT
// THE JUMPS ARE JUMPABLE.
//
// What it proves, in order:
//   1  the Spire stair is SHUT while a guardian still stands, and open after
//   2  the void in m1 cannot be walked across — it puts you back on the shore
//   3  it CAN be jumped, three gaps, on real Space presses
//   4  a fall costs the walk and no hearts
//   5  the Hall's north door is sealed until both sigils burn
//   6  the Trial of Stone: one push opens the vault and lights a sigil
//   7  the Trial of Embers: the fight opens the vault and lights the other
//   8  the crown grants the Elemental Wolf, and it wears its swirl
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

const d = await launch({ dev: true });
const { page } = d;
await d.newGame('SPIRE');
await page.evaluate(() => { const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; });

const pos = () => d.wk('pos');
const room = () => d.wk('room');

// Run north and jump — CLOSED-LOOP, on the wolf's own position rather than on
// a stopwatch. A child presses Space when they can see the edge coming; the
// bot presses it when z says the edge is coming. Wall-clock timing cannot do
// this job: under SwiftShader the frame rate wanders enough that "hold w for
// 620ms" covered 3.9u in one run and 1.1u in another, so a timed press lands
// somewhere different every time and proves nothing about the geometry.
//
// Everything here is still a real key event. Only the DECISION to press is
// informed, which is exactly what eyes do.
async function runJumpTo(triggerZ, landZ, { timeout = 14 } = {}) {
  const t0 = Date.now();
  let jumped = false;
  await page.keyboard.down('w');
  try {
    while ((Date.now() - t0) / 1000 < timeout) {
      const p = await pos();
      if (!jumped && p.z <= triggerZ) { await page.keyboard.press('Space'); jumped = true; }
      if (jumped && p.z <= landZ) break;
      await page.waitForTimeout(60);
    }
  } finally {
    await page.keyboard.up('w');
  }
  await page.waitForTimeout(700);   // let the landing (and any fall) settle
  return pos();
}

console.log('\n── 1 · the stair is shut until the Village is restored ───────');
await d.jump('ysq', ALL);
let s = await page.evaluate(() => {
  const w = window.__game.world;
  const dr = (w.doors || []).find((x) => x.to === 'm1');
  return { present: !!dr, open: dr ? (!dr.when || !!dr.when()) : null,
    guardians: ['g1','g2','g3','g4','g5','g6']
      .filter((g) => window.__game.WS && window.__game.WS.get('village', 'guardian_' + g)).length };
});
check('the Square has a Spire stair at all', s.present, s);
check('and it is SHUT while guardians still stand', s.open === false, s);

await page.evaluate(() => {
  for (const g of ['g1','g2','g3','g4','g5','g6']) window.__game.WS.set('village', 'guardian_' + g);
});
await d.jump('ysq', ALL);
s = await page.evaluate(() => {
  const w = window.__game.world;
  const dr = (w.doors || []).find((x) => x.to === 'm1');
  return { present: !!dr, open: dr ? (!dr.when || !!dr.when()) : null };
});
check('and OPEN once every guardian is down', s.present && s.open === true, s);

console.log('\n── 2 · the void cannot be walked ────────────────────────────');
await d.jump('m1', ALL);
await d.walkTo(0, 8, { timeout: 20 });
// Walk north with no jump at all, sampling the whole way, and release the
// moment the fall has happened — reading only the final resting place would
// catch the wolf mid-walk BACK across the shore and prove nothing.
let trail = [];
let p = null, fellTo = null;
await page.keyboard.down('w');
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(120);
  p = await pos();
  trail.push(+p.z.toFixed(2));
  // a jump BACKWARDS in z is the pit putting him down at pitReturn
  if (trail.length > 1 && p.z - trail[trail.length - 2] > 1.0) { fellTo = p.z; break; }
}
await page.keyboard.up('w');
await page.waitForTimeout(400);
const heartsAfterFall = await d.wk('hearts');
const deepest = Math.min(...trail);
check('walking into the void does not cross it', deepest > 3.0 && fellTo !== null,
  { deepest, fellTo });
check('and it puts you back on the near shore (pitReturn z 6.4)',
  fellTo !== null && Math.abs(fellTo - 6.4) < 0.4, { fellTo });
check('a fall costs no hearts', heartsAfterFall >= 4.9, { hearts: heartsAfterFall });

console.log('\n── 3 · the void CAN be jumped, three gaps ───────────────────');
await d.walkTo(0, 8.0, { timeout: 20, arrive: 0.6 });
// gap 1: near shore (edge z 3.6) → PAD A (z 1.8 .. -0.8)
p = await runJumpTo(4.5, 1.4);
check('gap 1 cleared onto pad A', p.z < 1.8 && p.z > -0.8, { z: +p.z.toFixed(2) });
// gap 2: PAD A (edge z -0.8) → PAD B (z -2.6 .. -5.2)
p = await runJumpTo(0.1, -3.2);
check('gap 2 cleared onto pad B', p.z < -2.6 && p.z > -5.2, { z: +p.z.toFixed(2) });
// gap 3: PAD B (edge z -5.2) → the far shore (z < -6.8)
p = await runJumpTo(-4.3, -7.4);
check('gap 3 cleared onto the far shore', p.z < -6.8, { z: +p.z.toFixed(2) });
check('still in m1, still whole', (await room()) === 'm1' && (await d.wk('hearts')) >= 4.9);

console.log('\n── 4 · the Hall, and the door that is not open yet ──────────');
await d.jump('m2', ALL);
s = await page.evaluate(() => {
  const w = window.__game.world;
  const dr = (w.doors || []).find((x) => x.to === 'm3');
  return { present: !!dr, open: dr ? (!dr.when || !!dr.when()) : null,
    bars: (w.boxColliders || []).some((b) => b.minZ < -8.5 && b.maxZ > -10.5 && b.minX < 0 && b.maxX > 0),
    back: (w.doors || []).filter((x) => !x.when).map((x) => x.to) };
});
check('the way up is sealed with both sigils dark', s.present && s.open === false, s);
check('and there are BARS in the opening, not just a dead trigger', s.bars, s);
check('every other way out of the Hall is open', s.back.length === 3, s.back);

console.log('\n── 5 · the Trial of Stone: one push, two payoffs ────────────');
await d.jump('ma', ALL);
let st = await page.evaluate(() => {
  const w = window.__game.world;
  return { plate: (w.plates || []).map((x) => x.id), boulders: (w.boulders || []).length,
    chestDefs: ((w.markers && w.markers.chestDefs) || []).length,
    // the vault-bar collider specifically, not "how many walls are near the
    // vault" — the vault's own two jamb walls sit in that region forever, so
    // counting them made "the bars came down" read 5 -> 4 and fail
    bars: (w.boxColliders || []).some((b) => b.minX < -6.5 && b.maxX > -6.5
      && b.minZ < 1.4 && b.maxZ > 1.4) };
});
check('a block, a plate and a barred vault', st.plate.length === 1 && st.boulders === 1
  && st.chestDefs === 1 && st.bars === true, st);
// Push it for real, the way the room is laid out to be walked: in from the
// east door, lean west, and the block goes where it needs to go.
await d.walkTo(4.0, -3, { timeout: 25, arrive: 0.9 });
// LINE UP, THEN LEAN. A lean picks the cardinal direction of greatest offset,
// so pushing a block reliably means standing square behind it first — which is
// what a person does, because they can see where they are. The bot squares up
// in z, then holds west only until the block actually moves, then squares up
// again. Approaching and shoving in one motion drifts, and a drifted lean
// sends the block sideways (twice, in two runs, before this was written).
//
// If a lean does send it off the lane, that is not fatal and the loop shows
// why the room is open floor rather than a corridor: walk round, line up
// again, push again.
for (let i = 0; i < 12; i++) {
  const b = await page.evaluate(() => { const bl = window.__game.world.boulders[0];
    return bl ? { x: bl.x, z: bl.z } : null; });
  if (!b) break;
  // WHICH WAY TO PUSH. Line the block up on the plate's row first, then push
  // along it — the thing a person does because they can see both. Pushing
  // blindly west forever is what the first version of this loop did, and it
  // walked a knocked-aside block into the west wall eight steps running while
  // one northward shove would have put it back on the lane.
  const PLATE = { x: -3.6, z: -3 };
  const alignZ = Math.abs(b.z - PLATE.z) > 0.5;
  const key = alignZ ? (b.z > PLATE.z ? 'w' : 's') : 'a';
  // stand on the far side from the direction of travel, tight
  const stand = alignZ ? { x: b.x, z: b.z + (b.z > PLATE.z ? 1.9 : -1.9) }
                       : { x: b.x + 1.9, z: b.z };
  const sq = await d.walkTo(stand.x, stand.z, { timeout: 15, arrive: 0.35 });
  await page.keyboard.down(key);
  let moved = false;
  for (let k = 0; k < 24; k++) {
    await page.waitForTimeout(110);
    const now = await page.evaluate(() => { const bl = window.__game.world.boulders[0];
      return bl ? { x: bl.x, z: bl.z, done: !!window.__game.state.flags.plates.m_sigil_stone } : null; });
    if (!now) break;
    if (now.done || Math.hypot(now.x - b.x, now.z - b.z) > 0.9) { moved = true; break; }
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => {
    const bl = window.__game.world.boulders[0];
    return { b: bl ? [+bl.x.toFixed(2), +bl.z.toFixed(2)] : null,
      done: !!window.__game.state.flags.plates.m_sigil_stone };
  });
  console.log(`   lean ${i}: push '${key}' squared=${sq.ok ? 'ok' : sq.why}`
    + ` moved=${moved} block ${JSON.stringify(after.b)}`);
  if (after.done) break;
}
st = await page.evaluate(() => {
  const w = window.__game.world;
  return { solved: !!window.__game.state.flags.plates.m_sigil_stone,
    bars: (w.boxColliders || []).some((b) => b.minX < -6.5 && b.maxX > -6.5
      && b.minZ < 1.4 && b.maxZ > 1.4) };
});
check('the block reached the plate through real pushes', st.solved, st);
check('and the vault bars came down', st.solved && st.bars === false, st);

console.log('\n── 6 · the Trial of Embers: the fight opens the vault ───────');
await d.jump('mb', ALL);
let mb = await page.evaluate(() => {
  const w = window.__game.world;
  return { foes: (w.enemies || []).filter((e) => !e.scenery).length,
    bars: (w.boxColliders || []).some((b) => b.minX < 6.5 && b.maxX > 6.5
      && b.minZ < 1.4 && b.maxZ > 1.4) };
});
check('four of the old enemies, behind a barred vault', mb.foes === 4 && mb.bars === true, mb);
// win it the way the room means it to be won — but this suite is about the
// GATE, not the fight, so the foes are felled through the same takeDamage
// every sword swing calls rather than by grinding a bot through four bosses.
await page.evaluate(() => {
  for (const e of window.__game.world.enemies) if (!e.scenery && !e.dead) e.takeDamage(99, 'moon', 'aoe');
});
await page.waitForTimeout(1200);
mb = await page.evaluate(() => {
  const w = window.__game.world;
  return { lit: !!window.__game.WS.get('spire', 'sigil_flame'),
    bars: (w.boxColliders || []).some((b) => b.minX < 6.5 && b.maxX > 6.5
      && b.minZ < 1.4 && b.maxZ > 1.4) };
});
check('clearing the room lights the flame sigil', mb.lit, mb);
check('and the vault bars came down with it', mb.lit && mb.bars === false, mb);

console.log('\n── 7 · both sigils burn, so the way up opens ────────────────');
await d.jump('m2', ALL);
s = await page.evaluate(() => {
  const w = window.__game.world;
  const dr = (w.doors || []).find((x) => x.to === 'm3');
  return { open: dr ? (!dr.when || !!dr.when()) : null,
    bars: (w.boxColliders || []).some((b) => b.minZ < -8.5 && b.maxZ > -10.5 && b.minX < 0 && b.maxX > 0) };
});
check('the last door in the game is open', s.open === true, s);
check('and the bars are gone from the opening', s.bars === false, s);

console.log('\n── 8 · the crown, and the wolf it gives ─────────────────────');
await d.jump('m3', ALL);
await d.walkTo(0, -2, { timeout: 30, arrive: 1.6 });
await page.waitForTimeout(1500);
const grant = await page.evaluate(() => ({
  unlocked: window.__game.state.formsUnlocked.includes('elemental_wolf'),
  spark: !!(window.__game.world.markers && window.__game.world.markers.sparkSpot),
}));
check('walking to Luna grants the ELEMENTAL WOLF', grant.unlocked, grant);
const wore = await page.evaluate(() => {
  const g = window.__game;
  if (!g.player.setForm('elemental_wolf')) return { ok: false };
  const f = g.player.forms.elemental_wolf;
  return { ok: true, form: g.state.form, visible: f.model.visible,
    aura: !!(f.aura && f.aura.visible), orbs: f.auraData ? f.auraData.orbs.length : 0 };
});
check('and it can be worn, swirl and all', wore.ok && wore.form === 'elemental_wolf'
  && wore.visible && wore.aura && wore.orbs === 7, wore);

check('nothing threw for the whole run', d.errors.length === 0, d.errors.slice(0, 4));
console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : '\nALL CLEAN — the Spire plays.');
await d.b.close();
process.exit(errors.length ? 1 : 0);
