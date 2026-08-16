// LEVEL 3 — WILD WOODS, THE RING, WALKED. State-driven: NEXT[room] says where
// to go and what work must happen there first. Real inputs only.
//
// From recon (PROGRESS.md L3 RECON): spine t1a>t1b>tc1>t2a>t2b>tsh>tc2>t3a>
// t3b>tkn>tc3>t4a>t4b>tc4>tgl, ring closes tgl-(w)->t1a. Verdant granted at
// tsh sparkSpot; lash = K in verdant form (cut/tether/snare, 7 game-s cd).
// Junction rooms carry a centre hero collider (r~2) + gate props at
// (+/-3.6,-11.2) — legs thread x=3.2 mid-room then centre for the door.
//
// Timescale 3x for this traversal pass (RUN2-REPORT lever). Timing-critical
// proofs (tc2 regrow at 1x, the Sylva duel) live in fight-sylva.mjs.
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
    await d.page.waitForTimeout(7600 / TS);
  }
  return false;
}
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

// t1a doors as built: den (south), t1b (north), tgl (east). No chord yet.
{
  const doors = (await d.wk('doors')).map((x) => x.to).sort();
  say('t1a doors:', doors.join(','));
  for (const want of ['den', 't1b', 'tgl']) {
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

// THE SHRINE: verdant from the spark, then the first cut is the way out.
{
  // the pedestal collider (r0.9 at (0,-2)) stops the walk ~1.3u from the spark
  // spot — well inside the 2.4u grant radius. WAIT for the grant, then nudge
  // closer once if it hasn't fired (arrive-slack jitter cost run 5 the grant).
  const granted = async () => d.page
    .waitForFunction(() => window.__wk.forms.includes('verdant_wolf'), null, { timeout: 9000 })
    .then(() => true).catch(() => false);
  await d.walkTo(0, -0.9, { timeout: 20, arrive: 0.7 });
  let got = await granted();
  if (!got) {
    await d.walkTo(0.5, -1.5, { timeout: 10, arrive: 0.4 });
    got = await granted();
  }
  await d.pickPerkIfOffered();
  const forms = await d.wk('forms');
  if (!got) bad(`shrine did not grant verdant (forms: ${forms})`);
  else say('  VERDANT GRANTED at the shrine');
  if (!(await ws('spark'))) bad('WS wild3.spark not set by shrine');
  await d.shot('tsh-verdant');
  if (!(await lashAt(0, -5, 0, -3.2, cutFlag('l3_tsh_teach')))) bad('teach bramble never cut (WS)');
  else say('  teach bramble CUT (WS ground truth)');
}
await goRoom('tc2', [[0, -6]]);

// TC2 at 3x: prove the MECHANISMS (cut opens, rope drops the log, bridge
// carries). The 1x timing-feel proof runs in fight-sylva.mjs.
{
  if (!(await lashAt(0, -1, 0, 0.9, cuttableCut('l3_tc2_2')))) bad('tc2 regrow bramble never cut');
  else say('  regrow bramble CUT (cuttable ground truth)');
  // round the gap's east end to the rope, lash, then cross the landed log
  await d.walkTo(10, -2, { timeout: 20 });
  await d.walkTo(9.5, -8.6, { timeout: 20 });
  if (!(await lashAt(5, -9.2, 6.8, -9.0, cutFlag('l3_tc2_bridge')))) bad('log-bridge rope never cut (WS)');
  await d.page.waitForTimeout(1600 / TS);         // the log swings
  const back = await d.walkTo(0, -3.2, { timeout: 16 });   // south across the gap
  const forth = await d.walkTo(0, -8.6, { timeout: 16 });  // and north again
  if (!back.ok || !forth.ok) bad('log bridge did not carry after the rope was cut');
  else say('  log bridge down and crossed both ways');
  await d.shot('tc2-bridge');
}
await goRoom('t3a', [[0, -8]]);

// T3A: cut the root-wall — the tsB chord's far-side unlock.
{
  await clearFoes(6);
  if (!(await lashAt(-13, 0, -10.6, 0, () => ws('rootCut')))) bad('rootwall never cut (WS rootCut)');
  else say('  root-wall CUT (tsB chord unlocked for next build)');
}
await goRoom('t3b', JVIA);
await goRoom('tkn', [[0, -6]]);

// THE KNOT — the probe-proven solution (tools/probe-knot.mjs, 3 iterations):
// tether the stone east with CLOSED-LOOP aim until it fully clears the
// channel, then 1u contact pushes from L-approaches that never cross its line.
{
  await clearFoes(7);
  const boulder = () => d.page.evaluate(() => {
    const b = (window.__game.world.boulders || [])[0];
    return b ? { x: +(b.x ?? b.collider.x).toFixed(2), z: +(b.z ?? b.collider.z).toFixed(2) } : null;
  });
  const pressed = () => d.page.evaluate(() => !!window.__game.state.flags.plates.l3_knot_p1);
  async function aimAt(x, z) {
    for (let i = 0; i < 5; i++) {
      const p = await d.wk('pos');
      const ry = await d.page.evaluate(() => window.__game.player.root.rotation.y);
      let diff = Math.atan2(x - p.x, z - p.z) - ry;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < 0.6) return true;
      const dx = x - p.x, dz = z - p.z;
      const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(key); await d.page.waitForTimeout(270); await d.page.keyboard.up(key);
    }
    return false;
  }
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
  while (b && b.x < -2.4 && guard++ < 16) {
    await form('verdant_wolf');
    await d.walkTo(3.0, 2, { timeout: 18, arrive: 0.7 });
    await d.walkTo(b.x + 4.4, 2, { timeout: 15, arrive: 0.5 });
    await aimAt(b.x, b.z);
    const p = await d.wk('pos');
    if (p.x < b.x + 2.0 || p.x > b.x + 5.6) { say(`  (bad lash spot ${JSON.stringify(p)} — restage)`); continue; }
    await d.tap('k');
    await d.page.waitForTimeout(8000 / TS);
    const nb = await boulder();
    say(`  tether: ${b.x} -> ${nb.x}  (from ${p.x},${p.z})`);
    b = nb;
  }
  guard = 0;
  while (b && b.x > -2.6 && guard++ < 26) {
    if (await pressed()) break;
    const p = await standBeside(b.x, b.z, -1.5, 0);
    if (p.x > b.x - 0.7) { say(`  (push stand failed: ${JSON.stringify(p)})`); continue; }
    await d.page.keyboard.down('d'); await d.page.waitForTimeout(320); await d.page.keyboard.up('d');
    let nb = await boulder();
    if (Math.abs(nb.z - 2) > 0.8 && !(await pressed())) {
      const side = nb.z > 2 ? 1 : -1;
      await d.walkTo(nb.x - 1.6, nb.z + side * 1.5, { timeout: 8, arrive: 0.5 });
      await d.walkTo(nb.x, nb.z + side * 1.5, { timeout: 8, arrive: 0.45 });
      const k = side > 0 ? 'w' : 's';
      await d.page.keyboard.down(k); await d.page.waitForTimeout(300); await d.page.keyboard.up(k);
      nb = await boulder();
    }
    b = nb;
    say(`  push: (${b.x},${b.z})  plate=${await pressed()}`);
    if (b.x > 7.5 && !(await pressed())) {
      say('  (overshot — pushing back west)');
      const p2 = await standBeside(b.x, b.z, 1.5, 0);
      if (p2.x > b.x + 0.7) {
        await d.page.keyboard.down('a'); await d.page.waitForTimeout(300); await d.page.keyboard.up('a');
        b = await boulder();
      }
    }
  }
  await d.page.waitForTimeout(1200 / TS);
  if (!(await plate('l3_knot_p1'))) bad('knot plate never pressed');
  else say('  KNOT SOLVED — plate pressed');
  const nDoor = (await d.wk('doors')).find((x) => x.to === 'tc3');
  if (!nDoor || nDoor.open === false) bad('tkn north door not open after plate');
  await d.shot('tkn-solved');
}
await goRoom('tc3', [[0, -7]]);
await goRoom('t4a', [[0, 5]]);

// T4A: the pack, then the great log — the tsA chord's far-side unlock.
{
  await clearFoes(12, 150);                       // two elders + three of the pack
  if (!(await lashAt(10.4, 0, 10.4, 2.5, () => ws('logDown')))) bad('great log never cut (WS logDown)');
  else say('  GREAT LOG DOWN (tsA chord unlocked for next build)');
  await d.shot('t4a-log');
}
await goRoom('t4b', JVIA);

// T4B: the great thorn-knot — the MANDATORY cut that opens the glade.
{
  await clearFoes(7);
  if (!(await lashAt(0, -7, 0, -5.2, () => ws('knotCut')))) bad('thorn-knot never cut (WS knotCut)');
  else say('  THORN-KNOT CUT — the glade opens');
  const r = await d.walkTo(0, -8.4, { timeout: 12 });
  if (!r.ok && !r.roomChanged) bad('thorn-knot still blocks after cut');
}
await goRoom('tc4', [[0, -6]]);
{
  const g = (await d.wk('doors')).find((x) => x.to === 'tgl');
  if (!g || g.open === false) bad('tc4 boss door not open despite knotCut');
  else say('  boss door open (knotCut live)');
}
await goRoom('tgl');

// THE GLADE: Sylva present, then the ring closes west. No fight this pass.
{
  const s = await d.wk();
  say('tgl:', JSON.stringify({ boss: s.boss && { name: s.boss.name, hp: s.boss.hp }, music: s.music }));
  if (!s.boss) bad('no boss in tgl on first entry');
  await d.shot('tgl-sylva');
}
await goRoom('t1a', [[-8, 8]]);                   // west door, ring CLOSED
say('RING CLOSED back to t1a');

// D1 EVIDENCE: the south door drops into the den — count the den's ways out.
await goRoom('den');
{
  const doors = (await d.wk('doors')).map((x) => x.to);
  say('den doors:', doors.join(','));
  if (!doors.includes('t1a') && !doors.includes('w1')) {
    say('  ** D1 CONFIRMED: den has no way back to the Wild Woods (doors: ' + doors.join(',') + ')');
  }
  await d.shot('den-trap');
}

// The two chords, walked (rebuilds carry the new doors after the cuts).
await d.jump('t1a', []);
await goRoom('tsA', [[-8, 0]]);
await goRoom('t4a');
say('CHORD A (fallen log) walked: t1a -> tsA -> t4a');
await d.jump('t3a', []);
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
