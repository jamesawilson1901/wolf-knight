// LEVEL 4 — FROSTPEAK, WALKED. Linear spine f1>f2>f3>f4>f5 with two pockets.
// Recon in PROGRESS.md ledger item 5. Chassis proven by run-l3: room-anchored
// walks, aim-at-the-door-box, closed-loop facing, game-clock cooldown waits.
// Fire verbs on the braziers: L = breath MELTS the ice shell, K = slam LIGHTS
// the bowl. The frozen lake is slick: one contact push slides a boulder until
// something stops it — stopper first (east/west), then north up the lane.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const DIR = `test-evidence/level-4/route${TS !== 1 ? '-' + TS + 'x' : ''}`;
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

await d.newGame('FROST');
await d.page.evaluate(() => { window.__game.state.flags.sylvaDefeated = true; });
await d.jump('f1', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await narrWait();
say('start:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('f1-arrival');

// F1 — doors, hounds, the pocket in and out
{
  const doors = (await d.wk('doors')).map((x) => x.to).sort();
  say('f1 doors:', doors.join(','));
  for (const want of ['w5', 'f2', 'f1b']) if (!doors.includes(want)) bad(`f1 missing door to ${want}`);
  await clearFoes(7);
  await goRoom('f1b');
  const pocketDoors = (await d.wk('doors')).map((x) => x.to);
  say('f1b doors:', pocketDoors.join(','), '· iceSpot:', JSON.stringify(await d.page.evaluate(() => window.__game.world.markers.iceSpot || null)));
  await goRoom('f1');
}
await goRoom('f2');
await narrWait();

// F2 — THE ICEBOUND HALL: melt with breath, light with slam, all three inside
// their refreeze windows. Ground truth per brazier: world.braziers[i].lit.
{
  const brazierState = () => d.page.evaluate(() =>
    (window.__game.world.braziers || []).map((b) => ({ id: b.id, x: b.x, z: b.z, iced: !!b.iced, lit: !!b.lit })));
  say('braziers:', JSON.stringify(await brazierState()));
  await form('fire_wolf');
  for (let round = 0; round < 3; round++) {
    const todo = (await brazierState()).filter((b) => !b.lit);
    if (!todo.length) break;
    for (const b of todo) {
      await clearFoes(5, 30);
      await d.walkTo(b.x, b.z + 2.2, { timeout: 20, arrive: 0.6 });
      await aimAt(b.x, b.z);
      await d.tap('l');                       // breath: melt the shell
      await gameWait(1.2);
      await d.walkTo(b.x, b.z + 1.4, { timeout: 8, arrive: 0.5 });
      await d.tap('k');                       // slam: light the bowl
      await gameWait(2.4);
      const now = (await brazierState()).find((x) => x.id === b.id);
      say(`  ${b.id}: iced=${now.iced} lit=${now.lit}`);
      if (!now.lit) { await d.tap('k'); await gameWait(2.6); }
    }
  }
  const final = await brazierState();
  say('braziers final:', JSON.stringify(final));
  if (!final.every((b) => b.lit)) bad('not all braziers lit');
  if (!(await ws('frost', 'braziers'))) bad("WS frost.braziers not set");
  else say('  ICEBOUND HALL SOLVED — the gate withers');
  await d.shot('f2-lit');
  await goRoom('f2b');
  await clearFoes(7);                          // the elder over the pup
  say('f2b doors:', (await d.wk('doors')).map((x) => x.to).join(','));
  await goRoom('f2');
}
await goRoom('f3');
await narrWait();

// F3 — THE FROZEN LAKE: each boulder east/west into its stopper, then north
// up the lane onto its plate. Slick floor: one push, one long slide.
{
  const boulders = () => d.page.evaluate(() =>
    (window.__game.world.boulders || []).map((b) => ({ x: +(b.x ?? b.collider.x).toFixed(2), z: +(b.z ?? b.collider.z).toFixed(2) })));
  say('lake boulders:', JSON.stringify(await boulders()));
  // push helper: L-approach a side of the stone, then a short contact hold
  async function push(bi, dx, dz, key) {
    const b = (await boulders())[bi];
    if (!b) return null;
    const lane = { x: b.x + (dx ? dx * 2.6 : 0), z: b.z + (dz ? dz * 2.6 : (dx ? 2.6 : 0)) };
    await d.walkTo(lane.x, lane.z, { timeout: 14, arrive: 0.5 });
    await d.walkTo(b.x + dx * 1.35, b.z + dz * 1.35, { timeout: 10, arrive: 0.4 });
    await d.page.keyboard.down(key); await d.page.waitForTimeout(420); await d.page.keyboard.up(key);
    await gameWait(2.2);                       // let the slide finish
    return (await boulders())[bi];
  }
  // west boulder (index by position: smaller x): east into the stopper, north to p1
  const idx = (await boulders())[0].x < 0 ? { w: 0, e: 1 } : { w: 1, e: 0 };
  let bw = await push(idx.w, -1, 0, 'd');      // stand west, push EAST
  say('  west boulder after east push:', JSON.stringify(bw));
  bw = await push(idx.w, 0, 1, 'w');           // stand south, push NORTH
  say('  west boulder after north push:', JSON.stringify(bw), 'p1:', await plate('f3_p1'));
  let be = await push(idx.e, 1, 0, 'a');       // stand east, push WEST
  say('  east boulder after west push:', JSON.stringify(be));
  be = await push(idx.e, 0, 1, 'w');           // stand south, push NORTH
  say('  east boulder after north push:', JSON.stringify(be), 'p2:', await plate('f3_p2'));
  for (let extra = 0; extra < 4 && !((await plate('f3_p1')) && (await plate('f3_p2'))); extra++) {
    // a slide that stopped short gets one more nudge along its axis
    const bs = await boulders();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (Math.abs(b.z - -4.6) < 0.9) continue;      // already home
      if (b.z > -1) await push(i, b.x < 0 ? -1 : 1, 0, b.x < -3 ? 'd' : (b.x > 3 ? 'a' : (b.x < 0 ? 'a' : 'd')));
      else await push(i, 0, 1, 'w');
    }
  }
  const solved = (await plate('f3_p1')) && (await plate('f3_p2'));
  if (!solved) bad(`lake not solved (boulders ${JSON.stringify(await boulders())})`);
  else say('  FROZEN LAKE SOLVED — both plates held');
  const gate = (await d.wk('doors')).find((x) => x.to === 'f4');
  if (!gate || gate.open === false) bad('f3 north door not open after plates');
  await d.shot('f3-solved');
}
await goRoom('f4');
await narrWait();

// F4 — the rime pack, the rest, the boss door
{
  await clearFoes(12, 150);
  say('f4 doors:', (await d.wk('doors')).map((x) => x.to).join(','));
  await d.shot('f4-cleared');
}
await goRoom('f5');
await narrWait();

// F5 — Boreal present; the duel belongs to fight-boreal.mjs
{
  const s = await d.wk();
  say('f5:', JSON.stringify({ boss: s.boss && { name: s.boss.name, hp: s.boss.hp, action: s.boss.action }, music: s.music }));
  if (!s.boss) bad('no Boreal in f5');
  await d.shot('f5-boreal');
  const back = (await d.wk('doors')).map((x) => x.to);
  say('f5 doors:', back.join(','));
  if (!back.includes('f4')) bad('f5 has no way back to f4');
}

say('WS frost:', JSON.stringify(await d.page.evaluate(() => window.__game.WS.get('frost'))));
say('music (settled):', await d.wk('music'));
d.saveLog('route');
say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
