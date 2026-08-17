// LEVEL 5 — STORMREACH CLIFFS, CLIMBED. Switchback spine s1a>s1b>sc1>s2a>
// s2b>ssh>sc2>s3a>s3b>svn>sc3>s4a>s4b>sc4>scr, four pockets, the ssA wind
// bridge (whose WS key nothing ever sets — D-L5-1, verified here by play).
// Wind rules (js/wind.js): breeze walkable, gust crossable sideways, gale is
// the LOCK — only the thunder-dash (K, storm form, 5.2u in 0.26s, i-framed)
// crosses. Vanes turn one clockwise step when DASHED INTO.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const DIR = `test-evidence/level-5/route${TS !== 1 ? '-' + TS + 'x' : ''}`;
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

// dash toward (x,z) from a stand point. FACING IS THE FINAL APPROACH: the
// bot walks to the stand FROM the side opposite the target, so its last
// movement vector aims the dash — aimAt's correction holds drifted ~1u per
// step at 3x and walked the bot into the gale before K fired (run-1 lesson).
async function dashAt(x, z, standX, standZ) {
  if (!(await form('storm_wolf'))) return false;
  // FACING FOLLOWS NET VELOCITY, and a walkTo's arrival can face any way (the
  // sc2/teach lesson — an aimed dash flew EAST into the payoff gale). So:
  // stage at the stand point, then HOLD the cardinal key toward the target
  // for a beat — from OUTSIDE the gale that hold nets cleanly toward it and
  // sets facing — then dash. The stand point must be chosen gale-clear.
  await d.walkTo(standX, standZ, { timeout: 16, arrive: 0.6 });
  const dx = x - standX, dz = z - standZ;
  const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
  await d.page.keyboard.down(key); await d.page.waitForTimeout(260); await d.page.keyboard.up(key);
  await d.tap('k');
  await gameWait(1.0);
  return true;
}
const vanes = () => d.page.evaluate(() =>
  (window.__game.world.vanes || []).map((v) => ({ x: v.x, z: v.z, dir: v.dir })));
const lanes = () => d.page.evaluate(() =>
  (window.__game.world.galeLanes || []).map((l) => ({ x: l.x, z: l.z, w: l.w, d: l.d, dir: l.dir, s: l.strength })));

await d.newGame('STORM');
await d.page.evaluate(() => { window.__game.state.flags.borealDefeated = true; });
await d.jump('s1a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf']);
await narrWait();
say('start:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('s1a-arrival');

// TERRACE 1 — the landing
{
  const doors = (await d.wk('doors')).map((x) => x.to).sort();
  say('s1a doors:', doors.join(','));
  for (const want of ['f5', 's1b']) if (!doors.includes(want)) bad(`s1a missing door to ${want}`);
  if (doors.includes('ssA')) say('  (ssA door present at s1a — windBridge set?)');
  else say('  s1a has NO ssA door (windBridge unset — D-L5-1 near-side evidence)');
}
await goRoom('s1b');
await clearFoes(7);
await goRoom('s1b');                                 // a chase can shove us through a door
await goRoom('s1p'); say('s1p doors:', (await d.wk('doors')).map((x) => x.to).join(','));
await goRoom('s1b');
await goRoom('sc1');
await goRoom('s2a', [[0, 5]]);
await clearFoes(7);
await goRoom('s2a', [[0, 5]]);
await goRoom('s2p'); await goRoom('s2a');
await goRoom('s2b', [[-6, 0]]);
await clearFoes(7);
await goRoom('ssh', [[0, 4]]);
await narrWait();

// THE SHRINE — storm wolf, then the first dash is the way out
{
  const granted = async () => d.page
    .waitForFunction(() => window.__wk.forms.includes('storm_wolf'), null, { timeout: 9000 })
    .then(() => true).catch(() => false);
  await d.walkTo(0, -3.2, { timeout: 20, arrive: 0.8 });
  let got = await granted();
  if (!got) { await d.walkTo(0.4, -4.0, { timeout: 10, arrive: 0.4 }); got = await granted(); }
  await d.pickPerkIfOffered();
  if (!got) bad(`shrine did not grant storm (forms: ${await d.wk('forms')})`);
  else say('  STORM GRANTED at the shrine');
  await d.shot('ssh-storm');
  // the teach gale bars the way west — dash it from the lane's NORTH end so
  // even a slightly short landing sits at the far edge, clear of the sweep
  await dashAt(-8, -5.5, -2.4, -5.5);
  let p = await d.wk('pos');
  say('  after teach dash:', JSON.stringify(p));
  if (p.x > -5.6) { await gameWait(7.6); await dashAt(-8.5, p.z, Math.min(p.x, -2.2), p.z); p = await d.wk('pos'); }
  if (p.x > -5.6) bad(`teach gale not crossed (at ${JSON.stringify(p)})`);
  else say('  TEACH GALE CROSSED by dash');
}
await goRoom('sc2');
await narrWait();

// DEVELOP — three winds. Shoulder the gust, then EXIT by dashing north up
// through the door: the door x[-1.2,1.2] caps the gale lane (x=-1.5), and
// facing follows NET velocity, so we stage at x=1.0 (east of the gale, still
// under the door) where 'w' nets clean north, and dash up. The thin strip
// north of the lanes is un-walkable at any timescale (probe-sc2 proved it).
async function dashNorth() {
  await form('storm_wolf');
  await d.page.keyboard.down('w'); await d.page.waitForTimeout(400); await d.page.keyboard.up('w');
  await d.tap('k'); await gameWait(1.0);
}
async function exitNorthDoor(to) {
  await d.walkTo(3, -1, { timeout: 16, arrive: 1.0 });          // shoulder the gust
  await d.walkTo(1.0, -2, { timeout: 12, arrive: 0.7 });        // east edge of the door
  for (let a = 0; a < 6 && (await d.wk('room')) !== to; a++) {
    const p = await d.wk('pos');
    if (p.x < 0.4 || p.x > 1.6 || p.z < -5 || p.z > 1) await d.walkTo(1.0, -2, { timeout: 10, arrive: 0.6 });
    if ((await d.wk('room')) === to) break;
    await dashNorth();
    say(`  dash-north ${a} -> ${JSON.stringify(await d.wk('pos'))} room=${await d.wk('room')}`);
    await gameWait(7.6);
  }
  await settle();
}
{
  say('sc2 lanes:', JSON.stringify(await lanes()));
  await d.walkTo(8, 2.5, { timeout: 16 });
  await d.walkTo(2.6, 0.5, { timeout: 16 });         // shoulder through the gust
  await dashAt(-5.5, 0.5, 1.0, 0.5);                 // demonstrate the gale dash
  let p = await d.wk('pos');
  if (p.x > -2.8) { await gameWait(7.6); await dashAt(-6, p.z, Math.min(p.x, 0.8), p.z); }
  say('  develop crossing shown; exiting north by dash');
  await exitNorthDoor('s3a');
  if ((await d.wk('room')) !== 's3a') bad('sc2 develop: could not reach s3a');
  else say('  DEVELOP done -> s3a');
}
await clearFoes(7);
await goRoom('s3p'); await goRoom('s3a');
await goRoom('s3b', [[6, 0]]);
await clearFoes(7);
await goRoom('svn', [[0, 4]]);
await narrWait();

// TWIST — THE VANES (probe-vanes proven): one vane at a time until ITS lane
// lies e/w, then never touch it again — every turn rebuilds the weather mesh,
// and hammering rebuilds killed the renderer twice. Rightmost vane dashes
// from the open EAST floor; the others from the WEST gap.
{
  say('svn vanes:', JSON.stringify(await vanes()), 'lanes:', JSON.stringify(await lanes()));
  if ((await d.wk('room')) !== 'svn') bad('not in svn for the vane twist');
  else {
    for (let vi = 0; vi < 3; vi++) {
      for (let attempt = 0; attempt < 6 && !(await ws('storm', 'vanesTurned')); attempt++) {
        const v = (await vanes())[vi];
        if (!v || v.dir === 'e' || v.dir === 'w') { say(`  vane ${vi} lies ${v && v.dir}`); break; }
        const side = v.x >= 6 ? 2.9 : -2.9;       // rightmost from the east floor
        await dashAt(v.x, v.z, v.x + side, v.z);
        say(`  vane ${vi}: ${v.dir} -> ${(await vanes())[vi].dir} turned=${await ws('storm', 'vanesTurned')}`);
        await gameWait(7.6);
      }
    }
    await gameWait(1.5);
    if (!(await ws('storm', 'vanesTurned'))) bad('vanes never satisfied the exit check');
    else say('  VANES TURNED — the way east opens');
    await d.shot('svn-turned');
  }
}
await goRoom('sc3', [[6, 0]]);
await goRoom('s4a', [[0, -5]]);
{
  const doors = (await d.wk('doors')).map((x) => x.to);
  say('s4a doors:', doors.join(','), doors.includes('ssA') ? '(bridge mouth OPEN from the top)' : '(no bridge mouth)');
}
await goRoom('s4b', [[-6, 0]]);
await clearFoes(9);

// CONCLUDE — THE WIND GATE: two vanes, one gale across the way west; turn
// both until the crossing lane is gone, then walk out
{
  say('s4b vanes:', JSON.stringify(await vanes()), 'lanes:', JSON.stringify(await lanes()));
  let dashes = 0;
  const westBarred = async () =>
    (await lanes()).some((l) => l.s === 'gale' && l.x < -6 && (l.dir === 'n' || l.dir === 's'));
  for (let vi = 0; vi < 2; vi++) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const v = (await vanes())[vi];
      if (!v || v.dir === 'e' || v.dir === 'w') { say(`  gate vane ${vi} lies ${v && v.dir}`); break; }
      await dashAt(v.x, v.z, v.x + 3.4, v.z);   // lanes at x=-10: stand east, dash west
      say(`  gate vane ${vi}: ${v.dir} -> ${(await vanes())[vi].dir}`);
      await gameWait(7.6);
    }
  }
  await gameWait(1.5);
  void dashes;
  if (await westBarred()) bad('wind gate never cleared the west way');
  else say('  WIND GATE OPEN — the crossing gale is gone');
  say('  WS storm after gate:', JSON.stringify(await d.page.evaluate(() => window.__game.WS.get('storm'))));
  await d.shot('s4b-gate');
}
await goRoom('s4p'); say('s4p doors:', (await d.wk('doors')).map((x) => x.to).join(','));
await goRoom('s4b');
await goRoom('sc4');
await goRoom('scr', [[0, 5]]);
await narrWait();

// THE CROWN — Aria present; the duel belongs to fight-aria.mjs
{
  const s = await d.wk();
  say('scr:', JSON.stringify({ boss: s.boss && { name: s.boss.name, hp: s.boss.hp, action: s.boss.action }, music: s.music }));
  if (!s.boss) bad('no Aria at the crown');
  await d.shot('scr-aria');
}

say('WS storm:', JSON.stringify(await d.page.evaluate(() => window.__game.WS.get('storm'))));
say('music (settled):', await d.wk('music'));
d.saveLog('route');
say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
