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

async function form(want) {
  for (let i = 0; i < 10; i++) {
    if ((await d.wk('form')) === want) return true;
    await d.tap('Tab');
    await d.page.waitForTimeout(260);
  }
  bad(`could not cycle to ${want}`);
  return false;
}

// Stand near (x,z), nudge to face it, lash. The lash is a forward corridor.
async function lashAt(x, z, standX, standZ) {
  await form('verdant_wolf');
  const r = await d.walkTo(standX, standZ, { timeout: 25, arrive: 0.7 });
  if (!r.ok) { bad(`lashAt could not reach stand point (${standX},${standZ})`); return false; }
  const s = await d.wk();
  const dx = x - s.pos.x, dz = z - s.pos.z;
  const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
  await d.page.keyboard.down(key); await d.page.waitForTimeout(130); await d.page.keyboard.up(key);
  await d.tap('k');
  await d.page.waitForTimeout(700 / TS);
  return true;
}

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

async function goRoom(to, via = []) {
  for (let t = 0; t < 4; t++) {
    let s = await d.wk();
    if (s.room === to) { say(`  -> ${to}`); return true; }
    const doors = await d.wk('doors');
    const door = doors.find((x) => x.to === to);
    if (!door) { bad(`no door to ${to} from ${s.room} (doors: ${doors.map((x) => x.to).join(',')})`); return false; }
    if (door.open === false) { bad(`door ${s.room}->${to} is CLOSED`); return false; }
    for (const p of via) {
      const rv = await d.walkTo(p[0], p[1], { timeout: 22 });
      say(`    via (${p[0]},${p[1]}): ${rv.ok ? 'ok' : rv.why} at ${JSON.stringify(rv.at)}${rv.roomChanged ? ' room->' + rv.roomChanged : ''}`);
      const now = await d.wk('room');
      if (now === to) return true;               // a leg that arrives mid-via arrived
      if (now !== s.room) break;                 // dragged off-room: restart try
    }
    if ((await d.wk('room')) === to) return true;
    // AIM AT THE BOX CENTRE AND STOP INSIDE IT. At 3x and ~4.5fps one frame
    // steps ~0.97u and the trigger box is ~1.05u deep: crossing it at speed
    // TUNNELS (walk out into the void, fall, silent respawn — measured at
    // t1a's north door). A player standing IN the box fires the transition
    // on the next frame at any timescale. arrive 0.4 < the box half-depth.
    const r = await d.walkTo(door.x, door.z, { timeout: 30, arrive: 0.4 });
    say(`  try ${t + 1} to ${to}: door(${door.x},${door.z}) -> ${JSON.stringify(r)}`);
    if (r.roomChanged === to || (await d.wk('room')) === to) return true;
    if (r.ok) {                                   // standing at centre, no fire: nudge
      const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0;
      const oz = ox === 0 ? Math.sign(door.z) : 0;
      const n = await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 });
      say(`    nudge -> ${JSON.stringify(n)}`);
      if (n.roomChanged === to || (await d.wk('room')) === to) return true;
    }
    await clearFoes(5, 40);
    s = await d.wk();
    if (s.room === to) return true;
  }
  bad(`could not reach ${to}`);
  return false;
}

// The junction bypass: skirt the centre hero, then come back to the door line.
const JVIA = [[3.2, 5], [3.2, -4], [0, -8]];

await d.newGame('RING');
await d.jump('t1a', ['fire_wolf', 'earth_wolf']);
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
  await d.walkTo(0, -0.5, { timeout: 20, arrive: 1.4 });   // inside grant range
  await d.page.waitForTimeout(2500 / TS);
  await d.pickPerkIfOffered();
  const forms = await d.wk('forms');
  if (!forms.includes('verdant_wolf')) bad(`shrine did not grant verdant (forms: ${forms})`);
  else say('  VERDANT GRANTED at the shrine');
  if (!(await ws('spark'))) bad('WS wild3.spark not set by shrine');
  await d.shot('tsh-verdant');
  await lashAt(0, -5, 0, -3.2);
  const r = await d.walkTo(0, -6, { timeout: 12, arrive: 0.6 });
  if (!r.ok && !r.roomChanged) bad('teach bramble still blocks after lash');
  else say('  teach bramble cut, way out open');
}
await goRoom('tc2', [[0, -6]]);

// TC2 at 3x: prove the MECHANISMS (cut opens, rope drops the log, bridge
// carries). The 1x timing-feel proof runs in fight-sylva.mjs.
{
  await lashAt(0, -1, 0, 0.9);                    // middle regrow bramble
  const r = await d.walkTo(0, -2.4, { timeout: 10, arrive: 0.6 });
  if (!r.ok && !r.roomChanged) bad('tc2 regrow bramble still blocks right after cut');
  else say('  regrow bramble cut and crossed');
  // round the gap's east end to the rope, lash, then cross the landed log
  await d.walkTo(10, -2, { timeout: 20 });
  await d.walkTo(9.5, -8.6, { timeout: 20 });
  await lashAt(5, -9.2, 6.8, -9.0);
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
  await lashAt(-13, 0, -10.6, 0);
  if (!(await ws('rootCut'))) bad('rootwall lash did not set WS wild3.rootCut');
  else say('  root-wall cut (tsB chord unlocked for next build)');
}
await goRoom('t3b', JVIA);
await goRoom('tkn', [[0, -6]]);

// THE KNOT: tether the boulder out of its channel, push it onto the plate.
{
  await clearFoes(7);
  const boulder = () => d.page.evaluate(() => {
    const b = (window.__game.world.boulders || [])[0];
    return b ? { x: b.x ?? b.collider.x, z: b.z ?? b.collider.z } : null;
  });
  let b = await boulder();
  if (!b) bad('no boulder in tkn');
  let guard = 0;
  while (b && b.x < -3.6 && guard++ < 8) {        // phase A: tether it east
    await lashAt(b.x, b.z, Math.min(b.x + 3.1, -1.0), b.z);
    await d.page.waitForTimeout(7600 / TS);       // lash cooldown (7 game-s)
    const nb = await boulder();
    say(`  tether: boulder ${b.x.toFixed(1)} -> ${nb.x.toFixed(1)}`);
    if (Math.abs(nb.x - b.x) < 0.15 && Math.abs(nb.z - b.z) < 0.15) {
      say('  (tether did not move it — repositioning)');
    }
    b = nb;
  }
  guard = 0;
  while (b && b.x < 5.2 && guard++ < 14) {        // phase B: push it to the plate
    await d.walkTo(b.x - 1.05, b.z, { timeout: 12, arrive: 0.35 });
    await d.page.keyboard.down('d'); await d.page.waitForTimeout(1100 / TS); await d.page.keyboard.up('d');
    const nb = await boulder();
    if (Math.abs(nb.z - 2) > 0.8) {               // drifted off the plate line
      await d.walkTo(nb.x, nb.z + (nb.z > 2 ? 1.05 : -1.05), { timeout: 10, arrive: 0.35 });
      const k = nb.z > 2 ? 'w' : 's';
      await d.page.keyboard.down(k); await d.page.waitForTimeout(700 / TS); await d.page.keyboard.up(k);
    }
    b = await boulder();
    say(`  push: boulder at (${b.x.toFixed(1)},${b.z.toFixed(1)})`);
  }
  await d.page.waitForTimeout(900 / TS);
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
  await lashAt(10.4, 0, 10.4, 2.5);
  if (!(await ws('logDown'))) bad('great log lash did not set WS wild3.logDown');
  else say('  GREAT LOG DOWN (tsA chord unlocked for next build)');
  await d.shot('t4a-log');
}
await goRoom('t4b', JVIA);

// T4B: the great thorn-knot — the MANDATORY cut that opens the glade.
{
  await clearFoes(7);
  await lashAt(0, -7, 0, -5.2);
  if (!(await ws('knotCut'))) bad('thorn-knot lash did not set WS wild3.knotCut');
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
