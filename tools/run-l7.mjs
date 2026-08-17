// LEVEL 7 — SHADOW COURT. Hub xh + 4 relic wings (ash/root/gale/mirror) +
// Recon in PROGRESS.md ledger item 5. Chassis proven by run-l3: room-anchored
// walks, aim-at-the-door-box, closed-loop facing, game-clock cooldown waits.
// Fire verbs on the braziers: L = breath MELTS the ice shell, K = slam LIGHTS
// the bowl. The frozen lake is slick: one contact push slides a boulder until
// something stops it — stopper first (east/west), then north up the lane.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const DIR = `test-evidence/level-7/route${TS !== 1 ? '-' + TS + 'x' : ''}`;
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
// xsh (ghost grant) -> xh -> 4 wings for 4 relics -> xh rebuild -> xst -> xth.
// Verbs: earth crack (K), frost shatter (L breath), tide quench (K splash),
// ghost walk (K). Grimm resists steel+moon below 16hp -> fight elemental.
async function aimHold(x, z) {                   // face (x,z), timescale-aware
  const s = await d.wk();
  const dx = x - s.pos.x, dz = z - s.pos.z;
  const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
  await d.page.keyboard.down(key); await d.page.waitForTimeout(200 / TS); await d.page.keyboard.up(key);
}
const flagCracked = (id) => d.page.evaluate((i) => !!window.__game.state.flags.cracked[i], id);
const wsCourt = (k) => d.page.evaluate((k2) => window.__game.WS.get('court', k2), k);
// The west-wing gates sit at x=-6.5 with a wall behind them at x=-9; the bot
// arrives from the EAST. STAND OFF the gate (x+2) and let the AoE/cone reach
// it — walking ONTO the gate jams on it (probe-l7-wing: (-4.5,0) cracks first
// try, the gate position itself does not).
async function crackGate(x, z, id) {             // earth STOMP (K) — AoE, no facing
  for (let a = 0; a < 5; a++) {
    if (!(await form('earth_wolf'))) return false;
    await d.walkTo(x + 2, z, { timeout: 16, arrive: 1.0 });
    await d.tap('k'); await gameWait(1.0);
    if (await flagCracked(id)) return true;
    await gameWait(3.2);
  }
  return false;
}
async function shatterGate(x, z, id) {           // frost BREATH (L) — 3.6u cone
  for (let a = 0; a < 6; a++) {
    if (!(await form('frost_wolf'))) return false;
    await d.walkTo(x + 2.4, z, { timeout: 16, arrive: 0.8 });   // east of the gate
    await aimHold(x, z);                                        // face WEST at it
    await d.tap('l'); await gameWait(1.2);
    if (await wsCourt('ice_' + id) || await d.page.evaluate((i) => !!window.__game.state.flags.cracked[i], id)) return true;
    await gameWait(1.5);
  }
  return false;
}
async function quenchPool(x, z, id) {            // tide SPLASH (K) — 3.4u
  for (let a = 0; a < 4; a++) {
    if (!(await form('tide_wolf'))) return false;
    await d.walkTo(x, z + 1.2, { timeout: 16, arrive: 1.0 });
    await d.tap('k'); await gameWait(1.0);
    if (await wsCourt('quench_' + id)) return true;
    await gameWait(6.2);
  }
  return false;
}
async function grabRelic(name, x, z) {
  await d.walkTo(x, z, { timeout: 20, arrive: 1.0 });
  await d.page.waitForTimeout(1500);
  const got = await wsCourt('relic_' + name);
  if (!got) bad(`${name} relic not collected (at ${JSON.stringify(await d.wk('pos'))})`);
  else say(`  ${name.toUpperCase()} RELIC collected`);
  return got;
}

await d.newGame('COURT');
await d.page.evaluate(() => { window.__game.state.flags.meriDefeated = true; });
// arrives with all six wolf gifts, NOT ghost — ghost is earned at xsh
await d.jump('x1', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf']);
await narrWait();
say('start:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('x1-arrival');
{
  const doors = (await d.wk('doors')).map((x) => x.to).sort();
  say('x1 doors:', doors.join(','), '· court music:', await d.wk('music'));
  if (!doors.includes('ddp')) bad('x1 missing return to ddp');
}
await goRoom('xsh', [[0, 4]]);
await narrWait();

// THE SHRINE — the GHOST WOLF
{
  const granted = async () => d.page.waitForFunction(() => window.__wk.forms.includes('ghost_wolf'), null, { timeout: 9000 }).then(() => true).catch(() => false);
  await d.walkTo(0, -1.0, { timeout: 20, arrive: 0.8 });
  let got = await granted();
  if (!got) { await d.walkTo(0.4, -1.8, { timeout: 10, arrive: 0.4 }); got = await granted(); }
  await d.pickPerkIfOffered();
  if (!got) bad(`shrine did not grant ghost (forms: ${await d.wk('forms')})`);
  else say('  GHOST GRANTED at the shrine');
  await d.shot('xsh-ghost');
}
await goRoom('xh', [[0, 5]]);
await narrWait();

// THE FOUR WINGS. Each wing room is 26x20 with entry walls at x=±6, z[-4,4];
// the doors are on the far x-edges. Straight walks jam on the walls (the
// run-1 failure), so every hop SKIRTS NORTH at z=7 (above z=4) to the far
// side, then drops to the door line — proven by probe-l7-wing (ASH first try).
async function goSkirt(to, skirt) {
  for (let t = 0; t < 3; t++) {
    if ((await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; }
    for (const w of skirt) { await d.walkTo(w[0], w[1], { timeout: 16 }); if ((await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; } }
    const door = (await d.wk('doors')).find((x) => x.to === to);
    if (!door) { bad(`no door to ${to} from ${await d.wk('room')}`); return false; }
    const r = await d.walkTo(door.x, door.z, { timeout: 20, arrive: 0.4 });
    if (r.roomChanged === to || (await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; }
    if (r.ok) { const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0, oz = ox === 0 ? Math.sign(door.z) : 0;
      await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 }); }
    if ((await d.wk('room')) === to) { await settle(); say(`  -> ${to}`); return true; }
  }
  bad(`could not reach ${to} (at ${JSON.stringify(await d.wk('pos'))})`); return false;
}
// skirt toward x-edge `dirX`: current-side top corner, cross north, drop down
async function skirtTo(to, dirX) {
  const here = await d.wk('pos');
  return goSkirt(to, [[here.x >= 0 ? 11 : -11, 7], [dirX, 7], [dirX, 0]]);
}

// side: W wings enter at x=11 (far door west, -11); E wings enter at x=-11
// (far door east, +11).
async function wing(label, sideKey, entry, mid, relicRoom, solve, relic) {
  say(`--- WING ${label} ---`);
  await goRoom('xh');
  const far = sideKey === 'W' ? -11 : 11, near = sideKey === 'W' ? 11 : -11;
  await clearFoes(6, 40);
  if (!(await goRoom(entry))) return;
  if (!(await skirtTo(mid, far))) return;
  if (solve) { const ok = await solve(); say(`  ${label} gate:`, ok ? 'cleared' : 'NOT cleared'); }
  if (!(await skirtTo(relicRoom, far))) return;
  await grabRelic(relic.name, relic.x, relic.z);
  await skirtTo(mid, near);
  await skirtTo(entry, near);
  await goRoom('xh');
}

// ASH (west): xa1 -> xa2 (EARTH crack) -> xa3 (ember). ROOT (west): FROST
// shatter. GALE (east): TIDE quench (ungated). MIRROR (east): ghost-walk.
await wing('ASH', 'W', 'xa1', 'xa2', 'xa3',
  () => crackGate(-6.5, 0, 'x_ash_vault'), { name: 'ember', x: -6, z: 0 });
await wing('ROOT', 'W', 'xr1', 'xr2', 'xr3',
  () => shatterGate(-6.5, 0, 'x_root_ice'), { name: 'thorn', x: -6, z: 0 });
await wing('GALE', 'E', 'xg1', 'xg2', 'xg3',
  async () => { let n = 0; for (const [bx, bz] of [[-3, -3], [0, 0], [3, 3]]) { if (await quenchPool(bx, bz, `${bx}_${bz}`)) n++; } say(`  quenched ${n}/3 pools`); return true; },
  { name: 'tide', x: 6, z: 0 });
await wing('MIRROR', 'E', 'xm1', 'xm2', 'xm3',
  async () => { await form('ghost_wolf'); await d.tap('k'); await gameWait(0.5); return true; },
  { name: 'moon', x: 6, z: 0 });

// FOUR RELICS -> the throne stair opens on the xh REBUILD
const relics = await d.page.evaluate(() => ['ember', 'thorn', 'tide', 'moon'].filter((n) => window.__game.WS.get('court', 'relic_' + n)));
say('relics held:', JSON.stringify(relics));
await goRoom('xh');
{
  const n = (await d.wk('doors')).find((x) => x.to === 'xst');
  say('  xh->xst door (needs 4 relics):', n ? (n.open !== false) : 'ABSENT');
  if (relics.length >= 4 && !n) bad('4 relics but no xst door on rebuild');
}
await goRoom('xst', [[0, 5]]);
await goRoom('xth', [[0, 5]]);
await narrWait();

// THE THRONE — Shadow-Grimm; the duel belongs to fight-grimm.mjs
{
  const s = await d.wk();
  say('xth:', JSON.stringify({ boss: s.boss && { name: s.boss.name, hp: s.boss.hp, action: s.boss.action }, music: s.music }));
  if (!s.boss) bad('no Grimm at the throne');
  await d.shot('xth-grimm');
}
say('WS court:', JSON.stringify(await d.page.evaluate(() => window.__game.WS.get('court'))));
d.saveLog('route');
say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
