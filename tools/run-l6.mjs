// LEVEL 6 — SUNKEN VALE, walked. RIM ring d1a..ddp + pockets + lagoon (dlg).
// Recon in PROGRESS.md ledger item 5. Chassis proven by run-l3: room-anchored
// walks, aim-at-the-door-box, closed-loop facing, game-clock cooldown waits.
// Fire verbs on the braziers: L = breath MELTS the ice shell, K = slam LIGHTS
// the bowl. The frozen lake is slick: one contact push slides a boulder until
// something stops it — stopper first (east/west), then north up the lane.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const DIR = `test-evidence/level-6/route${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

const ws = (region, k) => d.page.evaluate(({ r, k2 }) => window.__game.WS.get(r, k2), { r: region, k2: k });
const plate = (k) => d.page.evaluate((k2) => !!window.__game.state.flags.plates[k2], k);
const gameWait = (gs) => d.page.evaluate(async (g) => {
  const t0 = window.__game.player._time;
  while (window.__game.player._time < t0 + g) await new Promise((r) => setTimeout(r, 120));
}, gs);
const settle = () =>
  d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 })
    .then(() => d.page.waitForTimeout(300)).catch(() => {});
const narrWait = () =>
  d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
    null, { timeout: 30000 }).catch(() => {});

async function form(want) {
  for (let i = 0; i < 12; i++) {
    const cur = await d.wk('form');
    if (cur === want) return true;
    await d.tap('Tab');
    await d.page.waitForFunction((c) => window.__wk.form !== c, cur, { timeout: 2000 }).catch(() => {});
  }
  bad(`could not cycle to ${want}`);
  return false;
}
async function aimAt(x, z) {
  for (let i = 0; i < 5; i++) {
    const p = await d.wk('pos');
    const ry = await d.page.evaluate(() => window.__game.player.root.rotation.y);
    let diff = Math.atan2(x - p.x, z - p.z) - ry;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.55) return true;
    const dx = x - p.x, dz = z - p.z;
    const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
    await d.page.keyboard.down(key); await d.page.waitForTimeout(270); await d.page.keyboard.up(key);
  }
  return false;
}
async function clearFoes(radius = 6, capS = 90) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < capS) {
    await d.pickPerkIfOffered();
    const s = await d.wk();
    if (s.hearts <= 2) await d.tap('h');
    const foes = await d.page.evaluate((r) => {
      const g = window.__game, p = g.player.root.position;
      return (g.world.enemies || []).filter((e) => !e.dead && !e.flying &&
        Math.hypot(e.x - p.x, e.z - p.z) < r).map((e) => ({ x: e.x, z: e.z }));
    }, radius);
    if (!foes.length) return true;
    await d.walkTo(foes[0].x, foes[0].z, { timeout: 4, arrive: 1.6 });
    await d.tap('j'); await d.page.waitForTimeout(260 / TS); await d.tap('j');
    await d.page.waitForTimeout(160 / TS);
  }
  say('  (clearFoes cap hit — moving on)');
  return false;
}
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
      if (await here()) return arrived();
      if ((await d.wk('room')) !== s.room) break;
      void rv;
    }
    if (await here()) return arrived();
    const r = await d.walkTo(door.x, door.z, { timeout: 30, arrive: 0.4 });
    say(`  try ${t + 1} to ${to}: door(${door.x},${door.z}) -> ${JSON.stringify(r)}`);
    if (r.roomChanged === to || (await here())) return arrived();
    if (r.ok) {
      const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0;
      const oz = ox === 0 ? Math.sign(door.z) : 0;
      const n = await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 });
      if (n.roomChanged === to || (await here())) return arrived();
    }
    await clearFoes(5, 40);
    if (await here()) return arrived();
  }
  bad(`could not reach ${to}`);
  return false;
}
// tide SPLASH (K) quenches a pool brazier within 3.4u; frost BREATH (L)
// shatters an ice/ghost gate. Both need their form.
async function splashAt(x, z, check) {
  for (let a = 0; a < 4; a++) {
    if (!(await form('tide_wolf'))) return false;
    await d.walkTo(x, z + 1.2, { timeout: 16, arrive: 1.0 });
    await d.tap('k');
    await gameWait(1.0);
    if (!check) return true;
    if (await check()) return true;
    await gameWait(6.2);                         // splash cooldown
  }
  return false;
}
async function breatheAt(x, z, check) {
  for (let a = 0; a < 4; a++) {
    if (!(await form('frost_wolf'))) return false;
    await d.walkTo(x, z + 2.2, { timeout: 16, arrive: 0.8 });
    const s = await d.wk();
    const key = Math.abs(x - s.pos.x) > Math.abs(z - s.pos.z) ? (x > s.pos.x ? 'd' : 'a') : (z > s.pos.z ? 's' : 'w');
    await d.page.keyboard.down(key); await d.page.waitForTimeout(200 / TS); await d.page.keyboard.up(key);
    await d.tap('l');
    await gameWait(1.2);
    if (!check) return true;
    if (await check()) return true;
    await gameWait(1.5);
  }
  return false;
}
const wsVale = (k) => d.page.evaluate((k2) => window.__game.WS.get('vale', k2), k);

await d.newGame('VALE');
await d.page.evaluate(() => { window.__game.state.flags.ariaDefeated = true; });
// arrives with L1-L5's gifts, NOT tide — tide is earned at the dsh shrine
await d.jump('d1a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf']);
await narrWait();
say('start:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('d1a-arrival');

{
  const doors = (await d.wk('doors')).map((x) => x.to).sort();
  say('d1a doors:', doors.join(','));
  if (!doors.includes('scr')) bad('d1a missing return to scr');
  // D6-6 check: what music does the Vale play?
  say('  vale music:', await d.wk('music'));
}
await goRoom('d1b', [[0, 5]]);
await clearFoes(7);
await goRoom('dg1');
await goRoom('d2a', [[0, 5]]);
await clearFoes(7);
await goRoom('d2b', [[0, 5]]);
await goRoom('dsh', [[0, 4]]);
await narrWait();

// THE SHRINE — the TIDE WOLF, then the deep water opens to it
{
  const granted = async () => d.page
    .waitForFunction(() => window.__wk.forms.includes('tide_wolf'), null, { timeout: 9000 })
    .then(() => true).catch(() => false);
  await d.walkTo(0, -3.4, { timeout: 20, arrive: 0.9 });
  let got = await granted();
  if (!got) { await d.walkTo(0.4, -4.2, { timeout: 10, arrive: 0.4 }); got = await granted(); }
  await d.pickPerkIfOffered();
  if (!got) bad(`shrine did not grant tide (forms: ${await d.wk('forms')})`);
  else say('  TIDE GRANTED at the shrine');
  if (!(await wsVale('spark'))) bad('WS vale.spark not set');
  await d.shot('dsh-tide');
  // canWade is read at BUILD: dsh was built BEFORE the grant, so its deep
  // water (which bars the west exit to dg2) is a stale collider. Leave and
  // re-enter so dsh rebuilds with wading on — the same step a kid takes.
  say('  re-entering dsh so the deep clears (canWade rebuild)');
  await goRoom('d2b', [[0, -4]]);
  await goRoom('dsh', [[0, 4]]);
}
await goRoom('dg2', [[0, 4]]);
await narrWait();
// dg2 develop: a deep band mid-room — re-enter is not needed since dg2 built
// after the grant (canWade true), so it should be crossable as tide
{
  await form('tide_wolf');
  const r = await d.walkTo(0, -6, { timeout: 20, arrive: 1.0 });
  say('  dg2 deep crossing:', r.ok ? 'crossed as tide' : r.why, JSON.stringify(await d.wk('pos')));
}
await goRoom('d3a', [[0, -5]]);
await clearFoes(7);

// d3b — the frost-shatter gate that is HINTED as ghost (D6-4 candidate)
await goRoom('d3b', [[0, 5]]);
{
  const ghostSpot = await d.page.evaluate(() => window.__game.world.markers.ghostPromise || window.__game.world.markers.iceSpot || null);
  say('  d3b gate marker:', JSON.stringify(ghostSpot));
  if (ghostSpot) {
    const opened = await breatheAt(ghostSpot.x, ghostSpot.z, () => wsVale('ice_d3b_ghost'));
    say('  d3b gate frost-shatter:', opened ? 'OPENED by frost breath' : 'not opened');
    if (opened) say('  D6-4: the ghost-hinted gate opens to FROST (verify the hint text)');
  }
}
await goRoom('dtp', [[0, 5]]);
await narrWait();

// dtp TWIST — splash-quench the three pool braziers (tide K)
{
  const pools = await d.page.evaluate(() => (window.__game.world.braziers || []).map((b) => ({ id: b.id, x: b.x, z: b.z, lit: !!b.lit })));
  say('  pool braziers:', JSON.stringify(pools));
  const spots = pools.length ? pools : [{ x: -8, z: -1 }, { x: 0, z: -5 }, { x: 8, z: -1 }];
  for (const p of spots) {
    const id = p.id || `tp${p.x}`;
    const done = await splashAt(p.x, p.z, () => wsVale('quench_' + id));
    say(`  quench ${id}:`, done ? 'QUENCHED' : 'no');
  }
  if (!(await wsVale('poolsQuenched'))) bad('dtp pools not all quenched');
  else say('  DEPTHS QUENCHED (all three pools)');
  // D6-2 check: is the north door gated by the puzzle at all?
  const n = (await d.wk('doors')).find((x) => x.to === 'dg3');
  say('  dtp->dg3 door open:', n && n.open !== false, '(D6-2: is it gated by the quench?)');
  await d.shot('dtp-quenched');
}
await goRoom('dg3', [[0, 5]]);
await goRoom('d4a', [[0, -5]]);
await clearFoes(7);

// d4b conclude — cross the deep lock as tide, fight the pack beyond
await goRoom('d4b', [[0, 5]]);
{
  await form('tide_wolf');
  const r = await d.walkTo(-8, 0, { timeout: 20, arrive: 1.2 });   // west across the lock
  say('  d4b deep-lock crossing:', r.ok ? 'crossed as tide' : r.why, JSON.stringify(await d.wk('pos')));
  await clearFoes(9);
}
await goRoom('dg4', [[0, -5]]);
await goRoom('ddp', [[1.7, 5]]);
await narrWait();

// THE DEEP — Meri present; the duel belongs to fight-meri.mjs
{
  const s = await d.wk();
  say('ddp:', JSON.stringify({ boss: s.boss && { name: s.boss.name, hp: s.boss.hp, action: s.boss.action }, music: s.music }));
  if (!s.boss) bad('no Meri in the deep');
  await d.shot('ddp-meri');
  const back = (await d.wk('doors')).map((x) => x.to);
  say('ddp doors:', back.join(','));
  if (!back.includes('dg4')) bad('ddp has no way back to dg4');
}

say('WS vale:', JSON.stringify(await d.page.evaluate(() => window.__game.WS.get('vale'))));
say('music (settled):', await d.wk('music'));
d.saveLog('route');
say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
