// BOREAL, THE RIMEBOUND — the first boss that FLIES (boss.js:742, read whole).
// Machine: circle | windup | dive | grounded | rise. She wheels AROUND KAEL
// (r2.5, hover 1.9). Windup paints the red lane (8.5x3.2 — step >1.6u off the
// line); the dive ends grounded under the gold ring: the punish. BOLTS (L,
// knight) hit flyers for FULL damage — the region-1 law's payoff — so the
// rhythm is: bolt while she wheels, sidestep the lane, maul her on the ground.
// A parry also swats her down (takeStun) — not scripted, the ring is enough.
// 22 hp, wounds persist via borealHp. Kill: borealDefeated + frost_wolf push.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-4/boreal${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('BOREAL');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.sylvaDefeated = true;
  g.WS.set('frost', 'braziers', true);
  g.state.flags.plates.f3_p1 = true;
  g.state.flags.plates.f3_p2 = true;
});
await d.jump('f5', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});
say('eyrie:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('eyrie');

const seen = { actions: new Set(), deaths: 0, respawns: [], bolts: 0 };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts, lastBolt = 0;

while ((Date.now() - t0) / 1000 < 45 * 60) {
  await d.pickPerkIfOffered();
  const s = await d.wk();
  if (s.room !== 'f5') {
    const won = await d.page.evaluate(() => !!window.__wk.flags.borealDefeated);
    if (won) { say('DEFEATED (left eyrie after kill)'); break; }
    const door = (await d.wk('doors')).find((x) => x.to === 'f5');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
    continue;
  }
  const b = s.boss;
  if (!b) {
    const won = await d.page.evaluate(() => !!window.__wk.flags.borealDefeated);
    if (won) { say('DEFEATED'); break; }
    await d.page.waitForTimeout(500); continue;
  }
  if (b.hp <= 0 && (await d.page.evaluate(() => !!window.__wk.flags.borealDefeated))) {
    say('DEFEATED (corpse dissolving)'); break;
  }
  seen.actions.add(b.action);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++; say(`DEATH #${seen.deaths} [hp ${b.hp} action ${b.action}]`);
    await d.page.waitForTimeout(4500 / TS);
    seen.respawns.push(await d.wk('room'));
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
  }
  lastHearts = s.hearts;
  if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');

  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const dist = Math.hypot(dx, dz);
  if (b.action === 'windup' || b.action === 'dive') {
    // the red lane runs boss->Kael: step OUT of it, perpendicular, hard
    const px = -dz / (dist || 1), pz = dx / (dist || 1);
    const side = ((s.pos.x * pz - s.pos.z * px) > 0) ? 1 : -1;
    const tx = Math.max(-8, Math.min(8, s.pos.x + px * 4.2 * side));
    const tz = Math.max(-8, Math.min(8, s.pos.z + pz * 4.2 * side));
    await d.walkTo(tx, tz, { timeout: 1.6, arrive: 0.8 });
  } else if (b.action === 'grounded') {
    if (dist > 1.7) await d.walkTo(b.x, b.z, { timeout: 2, arrive: 1.4 });
    else {
      const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(k); await d.page.waitForTimeout(120); await d.page.keyboard.up(k);
      await d.tap('j'); await d.page.waitForTimeout(180 / TS); await d.tap('j');
    }
  } else {                                   // circle / rise: the bolt's moment
    if (Date.now() - lastBolt > 900) {
      // face her, then throw
      const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(key); await d.page.waitForTimeout(150); await d.page.keyboard.up(key);
      await d.tap('l');
      seen.bolts++; lastBolt = Date.now();
    }
    if (dist > 5.5) await d.walkTo(b.x, b.z, { timeout: 1.2, arrive: 4 });
    await d.page.waitForTimeout(160);
  }
  if (b.hp !== lastHp) { say(`hp ${lastHp} -> ${b.hp} [${b.action}]`); lastHp = b.hp; }
}

const flags = await d.page.evaluate(() => ({
  boreal: !!window.__wk.flags.borealDefeated,
  frost: window.__wk.forms.includes('frost_wolf'),
}));
say('FLAGS:', JSON.stringify(flags));
say('SEEN:', JSON.stringify({ actions: [...seen.actions], deaths: seen.deaths, respawns: seen.respawns, bolts: seen.bolts }));
await d.shot('post');

// THE WAY ON OPENS WHERE YOU STAND (v3.74.0): a beat and a half of game
// time after the kill, the rock plug goes up in a smoke poof and the s1a
// door appears IN the live eyrie — no walking out and back. The countdown
// runs on world.animate, which narration blocking pauses, so give it the
// patience a watching child has. Checked only if the kill ended with Kael
// still standing in the room, which is the case the feature exists for.
let inPlace = true;  // vacuously true if Kael already left — the rebuild path covers that
if (flags.boreal && (await d.wk('room')) === 'f5') {
  inPlace = false;
  const it0 = Date.now();
  while ((Date.now() - it0) / 1000 < 150 && !inPlace) {
    await d.pickPerkIfOffered();
    inPlace = !!(await d.wk('doors')).find((x) => x.to === 's1a');
    if (!inPlace) await d.page.waitForTimeout(500);
  }
  say('the way on opened IN PLACE:', inPlace, 'after', ((Date.now() - it0) / 1000).toFixed(1) + 's');
  await d.shot('f5-onward-in-place');
}

// the way to Stormreach appears on the rebuild
let onward = false, bossGone = false;
if (flags.boreal) {
  // task #32 root cause: onDefeated queues several narration.say() lines
  // (Web Speech + captions), which hold gates.blocking/speaking for ~50s —
  // walking to the door WHILE input is blocked timed out before ever
  // leaving the room, so the "rebuild" below was reading the same
  // never-rebuilt world the boss died in. Wait it out first.
  const nt0 = Date.now();
  let ntLast = null;
  while ((Date.now() - nt0) / 1000 < 150) {
    await d.pickPerkIfOffered();
    const g = await d.wk('gates');
    ntLast = g;
    if (!g.blocking && !g.speaking && !g.transitioning) break;
    await d.page.waitForTimeout(500);
  }
  say('post-defeat gates settled after', ((Date.now() - nt0) / 1000).toFixed(1) + 's:', JSON.stringify(ntLast));
  // task #32 SECOND finding (see fight-sylva.mjs): a door's real trigger box
  // is a shallow band around its reported center — walkTo's arrive radius
  // can report "ok" short of it. Aim past the door's center (outward along
  // the radial from room-origin) so the walk necessarily crosses it.
  const past = (door) => {
    const dd = Math.hypot(door.x, door.z) || 1;
    return { x: door.x + (door.x / dd) * 1.4, z: door.z + (door.z / dd) * 1.4 };
  };
  const sDoor = (await d.wk('doors')).find((x) => x.to === 'f4');
  if (sDoor) { const p = past(sDoor); await d.walkTo(p.x, p.z, { timeout: 40, arrive: 0.6 }); }
  await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  if ((await d.wk('room')) === 'f4') {
    const back = (await d.wk('doors')).find((x) => x.to === 'f5');
    if (back) { const p = past(back); await d.walkTo(p.x, p.z, { timeout: 40, arrive: 0.6 }); }
    await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  }
  if ((await d.wk('room')) === 'f5') {
    const doors = await d.wk('doors');
    onward = !!doors.find((x) => x.to === 's1a' && x.open !== false);
    bossGone = !(await d.wk('boss'));
    say('calmed summit doors:', doors.map((x) => x.to).join(','), '· boss gone:', bossGone);
    await d.shot('f5-calmed');
  }
}
say('music:', await d.wk('music'));
d.saveLog('boreal');
const won = flags.boreal && flags.frost && onward && bossGone && inPlace;
say(won ? `BOREAL CALMED at ${TS}x — FROST WOLF earned, the sea cliffs open` : 'NOT COMPLETE');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
