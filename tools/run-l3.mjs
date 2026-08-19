// LEVEL 3 — WILD WOODS, THE RING, WALKED. State-driven: NEXT[room] says where
// to go and what work must happen there first. Real inputs only.
//
// From recon (PROGRESS.md L3 RECON): spine t1a>t1b>tc1>t2a>t2b>tsh>tc2>t3a>
// t3b>tkn>tc3>t4a>t4b>tc4>tgl, ring closes tgl-(w)->t1a.
//
// VERDANT MOVED TO SYLVA'S REWARD (dad's law: each wolf is locked behind its
// own element's boss, and the next level runs on it). This walk carries the
// REAL pre-boss loadout — knight/dark/fire/earth, nothing green — the whole
// way round. tsh's shrine is a promise now, not a grant; tc2's log-bridge
// rope and t4b's great thorn-knot both burn with fire (K in fire_wolf form);
// tkn is an honest push-and-plate room, no lash required. The optional
// verdant content (tc2's regrowing tangles, the t3a/t4a chords) is walked
// AFTER Sylva falls, in the ring-closed section, once the grant has actually
// landed — proving the post-boss return works, not just the shrine-era path.
//
// Junction rooms carry a centre hero collider (r~2) + gate props at
// (+/-3.6,-11.2) — legs thread x=3.2 mid-room then centre for the door.
//
// Timescale 3x for this traversal pass (RUN2-REPORT lever).
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const DIR = `test-evidence/level-3/route${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

const ws = (k) => d.page.evaluate((k2) => window.__game.WS.get('wild3', k2), k);
const flag = (k) => d.page.evaluate((k2) => window.__game.state.flags[k2], k);
const plate = (k) => d.page.evaluate((k2) => !!window.__game.state.flags.plates[k2], k);

// Tab-cycle to a form, WAITING for each cycle to land: a read raced one frame
// behind the tap at 4.5fps and could miss the wanted form on every pass.
async function form(want) {
  for (let i = 0; i < 12; i++) {
    const cur = await d.wk('form');
    if (cur === want) return true;
    await d.tap('Tab');
    await d.page.waitForFunction((c) => window.__wk.form !== c, cur, { timeout: 2000 }).catch(() => {});
  }
  bad(`could not cycle to ${want} (at ${await d.wk('form')})`);
  return false;
}

// Stand near (x,z), face it, lash — then PROVE the cut landed via `check`
// (WorldState or cuttable ground truth). Brambles are walk-aroundable, so
// "we got past" proves nothing. Retries respect the 7 game-s lash cooldown.
//
// FACING IS A HELD KEY, NEVER A NUDGE: at 4.5fps a 130ms tap lives inside one
// frame and samples unreliably — half the run-6 lashes fired sideways. 600ms
// spans ~3 frames; facing follows movement, and the target's collider stops
// the walk-in harmlessly.
async function faceToward(x, z) {
  const s = await d.wk();
  const dx = x - s.pos.x, dz = z - s.pos.z;
  const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
  await d.page.keyboard.down(key); await d.page.waitForTimeout(600); await d.page.keyboard.up(key);
}
async function lashAt(x, z, standX, standZ, check = null) {
  for (let a = 0; a < 4; a++) {
    if (!(await form('verdant_wolf'))) return false;
    const sx = standX + (a === 2 ? 0.7 : a === 3 ? -0.7 : 0), sz = standZ + (a === 1 ? 0.7 : 0);
    await d.walkTo(sx, sz, { timeout: 25, arrive: 0.7 });
    await faceToward(x, z);
    await d.tap('k');
    if (!check) return true;
    for (let w = 0; w < 7; w++) {                 // the cut lands on the K frame —
      if (await check()) return true;            // an immediate read races it
      await d.page.waitForTimeout(450);
    }
    say(`    (lash ${a + 1} at (${x},${z}) missed — cooldown, retry)`);
    await gameWait(7.4);
  }
  return false;
}
// The fire equivalent of lashAt: stand within slam range (3.0u, no facing
// needed — it's AoE) and ground-slam. Verdant's lash needed facing because
// it's a directional whip; fire's slam does not care which way Kael looks.
async function slamAt(x, z, standX, standZ, check = null) {
  for (let a = 0; a < 4; a++) {
    if (!(await form('fire_wolf'))) return false;
    await d.walkTo(standX, standZ, { timeout: 25, arrive: 0.7 });
    await d.tap('k');
    if (!check) return true;
    for (let w = 0; w < 7; w++) {
      if (await check()) return true;
      await d.page.waitForTimeout(450);
    }
    say(`    (slam ${a + 1} at (${x},${z}) missed — cooldown, retry)`);
    await gameWait(7.4);
  }
  return false;
}
// Wait in GAME seconds. /TS wall math was backwards: at 3x the game advances
// ~0.6 game-s per wall-s, so 8000/TS waited 1.6 game-s against the lash's
// 7 game-s cooldown — half of every run's lashes were silently swallowed.
const gameWait = (gs) => d.page.evaluate(async (g) => {
  const t0 = window.__game.player._time;
  while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120));
}, gs);
const cutFlag = (id) => async () =>
  !!(await d.page.evaluate((i) => window.__game.WS.get('wild3', 'cut_' + i), id));
const cuttableCut = (id) => async () =>
  !!(await d.page.evaluate((i) => {
    const c = (window.__game.world.cuttables || []).find((e) => e.id === i);
    return c && c.cut;
  }, id));

// Fight everything close by with real swings until the radius is clear.
async function clearFoes(radius = 5, capS = 90) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < capS) {
    await d.pickPerkIfOffered();
    const s = await d.wk();
    if (s.hearts <= 2) await d.tap('h');
    const foes = await d.page.evaluate((r) => {
      const g = window.__game, p = g.player.root.position;
      return (g.world.enemies || []).filter((e) => !e.dead &&
        Math.hypot(e.x - p.x, e.z - p.z) < r).map((e) => ({ x: e.x, z: e.z }));
    }, radius);
    if (!foes.length) return true;
    const f = foes[0];
    await d.walkTo(f.x, f.z, { timeout: 4, arrive: 1.6 });
    await d.tap('j'); await d.page.waitForTimeout(260 / TS); await d.tap('j');
    await d.page.waitForTimeout(160 / TS);
  }
  say('  (clearFoes cap hit — moving on)');
  return false;
}

// A transition returns mid-fade: wait it out before the next read or input.
const settle = () =>
  d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 })
    .then(() => d.page.waitForTimeout(300)).catch(() => {});

async function goRoom(to, via = []) {
  const arrived = async () => { await settle(); say(`  -> ${to}`); return true; };
  const here = async () => (await d.wk('room')) === to;
  for (let t = 0; t < 4; t++) {
    let s = await d.wk();
    if (s.room === to) return arrived();
    const doors = await d.wk('doors');
    const door = doors.find((x) => x.to === to);
    if (!door) { bad(`no door to ${to} from ${s.room} (doors: ${doors.map((x) => x.to).join(',')})`); return false; }
    if (door.open === false) { bad(`door ${s.room}->${to} is CLOSED`); return false; }
    for (const p of via) {
      const rv = await d.walkTo(p[0], p[1], { timeout: 22 });
      say(`    via (${p[0]},${p[1]}): ${rv.ok ? 'ok' : rv.why} at ${JSON.stringify(rv.at)}${rv.roomChanged ? ' room->' + rv.roomChanged : ''}`);
      if (await here()) return arrived();
      if ((await d.wk('room')) !== s.room) break; // dragged off-room: restart try
    }
    if (await here()) return arrived();
    // Walk INTO the trigger box and let it fire — the walkTo start-room anchor
    // returns the moment the room flips, even mid-fade.
    const r = await d.walkTo(door.x, door.z, { timeout: 30, arrive: 0.4 });
    say(`  try ${t + 1} to ${to}: door(${door.x},${door.z}) -> ${JSON.stringify(r)}`);
    if (r.roomChanged === to || (await here())) return arrived();
    if (r.ok) {                                   // standing at centre, no fire: nudge
      const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0;
      const oz = ox === 0 ? Math.sign(door.z) : 0;
      const n = await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 });
      say(`    nudge -> ${JSON.stringify(n)}`);
      if (n.roomChanged === to || (await here())) return arrived();
    }
    await clearFoes(5, 40);
    if (await here()) return arrived();
  }
  bad(`could not reach ${to}`);
  return false;
}

// The junction bypass: skirt the centre hero, then come back to the door line.
const JVIA = [[3.2, 5], [3.2, -4], [0, -8]];

await d.newGame('RING');
// __wkJump REPLACES formsUnlocked (main.js:1562) — pass the real kid loadout,
// not just the region gifts, or the profile arrives without knight/dark.
await d.jump('t1a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf']);
say('start:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('t1a-arrival');

// t1a doors as built: vz (south — re-pointed off the D1 dead-end den, see
// buildT1a's own comment), t1b (north), tgl (east). No chord yet.
{
  const doors = (await d.wk('doors')).map((x) => x.to).sort();
  say('t1a doors:', doors.join(','));
  for (const want of ['vz', 't1b', 'tgl']) {
    if (!doors.includes(want)) bad(`t1a missing door to ${want}`);
  }
}

// ---- the outward spine ----------------------------------------------------
await goRoom('t1b', JVIA);
await clearFoes(6);                              // first thorn hounds
await goRoom('tc1');
await goRoom('t2a', [[0, 5]]);
await goRoom('t2b', JVIA);
await goRoom('tsh', [[0, 4]]);

// THE SHRINE — a PROMISE now, not a grant. Verdant is Sylva's reward (dad's
// law); standing here must NOT hand it out, and there is no bramble left to
// cut — the room's whole job pre-boss is naming the fight ahead.
{
  await d.walkTo(0, -0.9, { timeout: 20, arrive: 0.7 });
  await d.page.waitForTimeout(1500 / TS);
  const forms = await d.wk('forms');
  if (forms.includes('verdant_wolf')) bad(`shrine granted verdant directly — it should not (forms: ${forms})`);
  else say('  shrine correctly grants NOTHING (verdant is Sylva\'s reward)');
  const cuttables = await d.page.evaluate(() => window.__game.world.cuttables.length);
  if (cuttables !== 0) bad(`tsh still carries a cuttable (${cuttables}) — the teach bramble should be gone`);
  await d.shot('tsh-promise');
}
await goRoom('tc2', [[0, -6]]);

// TC2 — the log bridge burns with FIRE now (the wolf the child actually
// holds this early). The regrowing tangles are optional verdant content;
// walked for real in the post-boss return section below, not here.
{
  await d.walkTo(10, -2, { timeout: 20 });
  await d.walkTo(9.5, -8.6, { timeout: 20 });
  if (!(await slamAt(5, -9.2, 6.8, -9.0, cutFlag('l3_tc2_bridge')))) bad('log-bridge rope never burned (WS)');
  await d.page.waitForTimeout(1600 / TS);         // the log swings
  const back = await d.walkTo(0, -3.2, { timeout: 16 });   // south across the gap
  const forth = await d.walkTo(0, -8.6, { timeout: 16 });  // and north again
  if (!back.ok || !forth.ok) bad('log bridge did not carry after the rope was burned');
  else say('  log bridge down and crossed both ways');
  await d.shot('tc2-bridge');
}
await goRoom('t3a', [[0, -8]]);

// T3A: the root-wall stays verdant-only, optional chord content — walked for
// real in the post-boss return section, not here (the child has no lash yet).
{
  await clearFoes(6);
}
await goRoom('t3b', JVIA);
await goRoom('tkn', [[0, -6]]);

// THE KNOT — an honest push-and-plate room now, no tether, no verdant.
// The old "no floor behind it" fiction was never enforced; a straight
// contact push from the west, standing beside the boulder, is the whole
// puzzle. Real form: knight (or whatever's current) — no lash needed at all.
{
  // radius 7 from the SOUTH spawn (0,10) never reaches the thorn hound at
  // (3,3) — 7.6u away — so it survived every earlier attempt here and was
  // free to wander into the push lane mid-puzzle. A hound has no collider of
  // its own, so it can't deflect the BOULDER, but it can bump the PLAYER off
  // the lane while standBeside is lining up the next push, which is exactly
  // what a 15-push, ever-drifting log (2 -> 6.8 -> 4.4 -> 5.6, never near
  // the plate) looked like. 18u comfortably covers the room from any door.
  await clearFoes(18);
  const boulder = () => d.page.evaluate(() => {
    const b = (window.__game.world.boulders || [])[0];
    return b ? { x: +(b.x ?? b.collider.x).toFixed(2), z: +(b.z ?? b.collider.z).toFixed(2) } : null;
  });
  const pressed = () => d.page.evaluate(() => !!window.__game.state.flags.plates.l3_knot_p1);
  async function standBeside(bx, bz, dx, dz) {
    const lane = bz + 2.6;
    await d.walkTo(bx + dx * 0.1, lane, { timeout: 12, arrive: 0.6 });
    await d.walkTo(bx + dx, lane, { timeout: 8, arrive: 0.5 });
    await d.walkTo(bx + dx, bz + dz, { timeout: 8, arrive: 0.45 });
    return d.wk('pos');
  }
  let b = await boulder();
  if (!b) bad('no boulder in tkn');
  let guard = 0;
  // the boulder starts WEST of the plate (-8,2) and (6,2) — push EAST, so the
  // loop keeps going while it is still short of the plate, not past it
  // Diagnosed directly: standBeside + a plain east hold pushes the boulder in
  // a dead straight line (2 -> -7.56 -> -6.44 -> -5.6, z exactly 2 the whole
  // way) with NOTHING extra needed — the boulder mechanic is one clean 1.2u
  // cardinal step per lean, and standBeside re-reads the boulder's ACTUAL
  // current (x,z) every iteration, so it can't accumulate drift on its own.
  // A "correct the z if it wandered" step used to run after every push and
  // an "undo it if we overshot east" step after that — both assumed the
  // plain push was unreliable, and running a SECOND push (in whatever
  // direction the drift-symptom implied) on a boulder that had not actually
  // drifted was what manufactured the drift: 15 pushes zigzagged the boulder
  // from z=2 up past z=6 and back down to z=0.21, missing the plate by 1.8u
  // in a room the direct mechanic solves in ~11 clean pushes. Removed both.
  while (b && b.x < 5.4 && guard++ < 30) {
    if (await pressed()) break;
    const p = await standBeside(b.x, b.z, -1.5, 0);
    if (p.x > b.x - 0.7) { say(`  (push stand failed: ${JSON.stringify(p)})`); continue; }
    await d.page.keyboard.down('d'); await d.page.waitForTimeout(320); await d.page.keyboard.up('d');
    b = await boulder();
    say(`  push: (${b.x},${b.z})  plate=${await pressed()}`);
  }
  await d.page.waitForTimeout(1200 / TS);
  if (!(await plate('l3_knot_p1'))) bad('knot plate never pressed');
  else say('  KNOT SOLVED — plate pressed (no lash used)');
  const nDoor = (await d.wk('doors')).find((x) => x.to === 'tc3');
  if (!nDoor || nDoor.open === false) bad('tkn north door not open after plate');
  await d.shot('tkn-solved');
}
await goRoom('tc3', [[0, -7]]);
await goRoom('t4a', [[0, 5]]);

// T4A: the pack. The great log stays verdant-only, optional chord content —
// walked for real in the post-boss return section below.
{
  await clearFoes(12, 150);                       // two elders + three of the pack
  await d.shot('t4a-pack-clear');
}
await goRoom('t4b', JVIA);

// T4B: the great thorn-knot burns now (fire) — the MANDATORY gate that opens
// the boss door. Same WS 'knotCut' key as before.
{
  await clearFoes(7);
  if (!(await slamAt(0, -7, 0, -5.2, () => ws('knotCut')))) bad('thorn-knot never burned (WS knotCut)');
  else say('  THORN-KNOT BURNED — the glade opens');
  const r = await d.walkTo(0, -8.4, { timeout: 12 });
  if (!r.ok && !r.roomChanged) bad('thorn-knot still blocks after burning');
}
await goRoom('tc4', [[0, -6]]);
{
  const g = (await d.wk('doors')).find((x) => x.to === 'tgl');
  if (!g || g.open === false) bad('tc4 boss door not open despite knotCut');
  else say('  boss door open (knotCut live)');
}
await goRoom('tgl');

// THE GLADE: Sylva present. No fight this pass (fight-sylva.mjs owns that) —
// instead simulate the kill flag, exactly as the ceremony in main.js expects,
// and prove verdant arrives through the REAL grant path (watching
// state.flags.sylvaDefeated), not a hand-set forms array.
{
  const s = await d.wk();
  say('tgl:', JSON.stringify({ boss: s.boss && { name: s.boss.name, hp: s.boss.hp }, music: s.music }));
  if (!s.boss) bad('no boss in tgl on first entry');
  const before = await d.wk('forms');
  if (before.includes('verdant_wolf')) bad('verdant already held before Sylva falls — grant fired too early somewhere');
  await d.shot('tgl-sylva');
  await d.page.evaluate(() => { window.__game.state.flags.sylvaDefeated = true; });
  await d.page.waitForFunction(() => window.__wk.forms.includes('verdant_wolf'), null, { timeout: 9000 }).catch(() => {});
  const forms = await d.wk('forms');
  if (!forms.includes('verdant_wolf')) bad(`verdant never granted after sylvaDefeated (forms: ${forms})`);
  else say('  VERDANT GRANTED (real ceremony, watching the flag)');
}

// POST-BOSS RETURN CONTENT — verdant's actual home. Everything that used to
// be taught pre-boss now lives here: the tc2 regrow tangle, and the two
// chords (t3a root-wall, t4a great log). Jumped to directly, matching this
// file's own established pattern for structural return-content checks (the
// chord walk two sections below already did this) — the forward ROUTE was
// proven above with the real pre-boss loadout; this proves the wolf actually
// works once earned.
{
  await d.jump('tc2', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
  if (!(await lashAt(0, -1, 0, 0.9, cuttableCut('l3_tc2_2')))) bad('tc2 regrow bramble never cut (post-boss)');
  else say('  regrow bramble CUT with real verdant (post-boss return)');

  await d.jump('t3a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
  await clearFoes(6);
  if (!(await lashAt(-13, 0, -10.6, 0, () => ws('rootCut')))) bad('rootwall never cut (WS rootCut, post-boss)');
  else say('  root-wall CUT (tsB chord unlocked for next build)');

  await d.jump('t4a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
  await clearFoes(12, 150);
  // Approach from the WEST (x-offset stand point), not the south. The great
  // log's bramble box is w=1.2/d=3.0 — deep along z, thin along x. faceToward
  // holds a direction key for 600ms to guarantee it registers at 4.5fps, and
  // at 3x timescale that hold is also ~4u of real travel: standing south and
  // facing north drove the player clean through the 3.0u-deep box and out
  // the far side, ending up past the target and facing further away from it
  // (measured: stood at (10.13,2.68), ended the hold at (9.48,-1.37), missed
  // by 2+u on both cutAt reach checks). Standing west and facing east crosses
  // the box's 1.2u-thin axis instead, and the log's own trunk collider at
  // (12,0) arrests the slide right at the target — verified directly, lands
  // at (9.48,0.05) facing east, lash connects on the first swing.
  if (!(await lashAt(10.4, 0, 7.9, 0, () => ws('logDown')))) bad('great log never cut (WS logDown, post-boss)');
  else say('  GREAT LOG DOWN (tsA chord unlocked for next build)');
  await d.shot('t4a-log');

  await d.jump('tgl', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
  await d.page.evaluate(() => { window.__game.state.flags.sylvaDefeated = true; });
  await d.page.waitForTimeout(600 / TS);
}

await goRoom('t1a', [[-8, 8]]);                   // west door, ring CLOSED
say('RING CLOSED back to t1a');

// D1 is already fixed: t1a's south door used to drop into the den, a dead
// end whose only exit was Ember Hollow — buildT1a re-pointed it at 'vz'
// (Stoneroot's Warden's Crypt, itself a real connective room with its own
// ways out) once that was found. den is no longer even DIRECTLY reachable
// from t1a, which is the fix working, not a regression — nothing left here
// to gather evidence of.

// The two chords, walked (rebuilds carry the new doors — rootCut/logDown are
// already true from the post-boss return section above).
await d.jump('t1a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await goRoom('tsA', [[-8, 0]]);
await goRoom('t4a');
say('CHORD A (fallen log) walked: t1a -> tsA -> t4a');
await d.jump('t3a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await goRoom('tsB', [[-8, 0]]);
await goRoom('t2a');
say('CHORD B (cut root-wall) walked: t3a -> tsB -> t2a');

const music = await d.wk('music');
say('final music:', music);
d.saveLog('route');
say('WS wild3:', JSON.stringify(await d.page.evaluate(() => window.__game.WS.get('wild3'))));
say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
