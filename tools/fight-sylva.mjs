// SYLVA, THORNBOUND — fought by her real machine. She is the Shadowgrip class
// in green (boss.js SKINS.sylva): 24 core hp, 1.08x speed, saveKey sylvaHp.
// ACTIONS (read from the class, per the run-2 rule): prowl / stalk / windup /
// swipe (shield it) / crouch / charge (dodge PERPENDICULAR — the red lane) /
// tired (gold ring — punish) / recover. Arena hazard: standing-stones pillar
// ring r=6.2 around (0,-2); walkTo steers around colliders.
//
// This session runs at 1x by default — it is the timing-critical proof.
// WK_TIMESCALE 0.5/0.25 are the ladder rungs (flagged partials).
// Before the duel: the tc2 regrow gauntlet at THIS timescale, because the
// route pass proved its mechanisms at 3x and the feel needs 1x.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-3/sylva${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('SYLVA');
await d.page.evaluate(() => {
  const g = window.__game;
  for (const k of ['spark', 'rootCut', 'logDown', 'knotCut']) g.WS.set('wild3', k, true);
});

// ---- 1x TC2 PROOF: cut-and-go under the real clock ------------------------
await d.jump('tc2', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
{
  const form = async (want) => {
    for (let i = 0; i < 12; i++) {
      const cur = await d.wk('form');
      if (cur === want) return;
      await d.tap('Tab');
      await d.page.waitForFunction((c) => window.__wk.form !== c, cur, { timeout: 2000 }).catch(() => {});
    }
  };
  await form('verdant_wolf');
  await d.walkTo(0, 0.9, { timeout: 20, arrive: 0.6 });
  await d.page.keyboard.down('w'); await d.page.waitForTimeout(130); await d.page.keyboard.up('w');
  await d.tap('k');                                  // cut the middle bramble...
  await d.page.waitForTimeout(500 / TS);
  const r = await d.walkTo(0, -2.6, { timeout: 8, arrive: 0.6 });   // ...and GO
  say(r.ok ? 'TC2 1x: cut and crossed inside the regrow window' : 'TC2 1x: FAILED to cross after cut');
  if (!r.ok) { say('  at:', JSON.stringify(r.at)); }
}

// ---- THE DUEL -------------------------------------------------------------
await d.jump('tgl', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
say('arena:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('arena');

const seen = { actions: new Set(), deaths: 0, respawns: [] };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts;

while ((Date.now() - t0) / 1000 < 45 * 60) {
  await d.pickPerkIfOffered();
  const s = await d.wk();
  if (s.room !== 'tgl') {
    const won = await d.page.evaluate(() => !!window.__wk.flags.sylvaDefeated);
    if (won) { say('DEFEATED (left arena after kill)'); break; }
    say('  left arena — walking back');
    const door = (await d.wk('doors')).find((x) => x.to === 'tgl');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
    continue;
  }
  const b = s.boss;
  if (!b) {
    const won = await d.page.evaluate(() => !!window.__wk.flags.sylvaDefeated);
    if (won) { say('DEFEATED'); break; }
    await d.page.waitForTimeout(500); continue;
  }
  // the boss getter keeps returning the DISSOLVING corpse — hp<=0 is the win,
  // not boss-gone (learned from this fight: the kill idled to the 45-min cap)
  if (b.hp <= 0 && (await d.page.evaluate(() => !!window.__wk.flags.sylvaDefeated))) {
    say('DEFEATED (corpse still dissolving)'); break;
  }
  seen.actions.add(b.action);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++; say(`DEATH #${seen.deaths} [hp ${b.hp} action ${b.action}]`);
    await d.page.waitForTimeout(4500 / TS);
    const back = await d.wk(); seen.respawns.push(back.room);
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
  }
  lastHearts = s.hearts;
  if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');

  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const dist = Math.hypot(dx, dz);
  if (b.action === 'windup' || b.action === 'swipe') {
    await d.holdShield(1000 / TS);                       // the paw swipe: block it
  } else if (b.action === 'crouch' || b.action === 'charge') {
    // the red lane: step OUT of it, perpendicular to her facing
    const px = -dz / (dist || 1), pz = dx / (dist || 1);
    const side = ((s.pos.x * pz - s.pos.z * px) > 0) ? 1 : -1;   // toward open floor
    const tx = Math.max(-11, Math.min(11, s.pos.x + px * 4.5 * side));
    const tz = Math.max(-11, Math.min(9, s.pos.z + pz * 4.5 * side));
    await d.walkTo(tx, tz, { timeout: 1.8, arrive: 0.8 });
  } else if (b.action === 'tired') {
    if (dist > 1.6) await d.walkTo(b.x, b.z, { timeout: 2, arrive: 1.3 });
    else {
      const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(k); await d.page.waitForTimeout(120); await d.page.keyboard.up(k);
      await d.tap('j'); await d.page.waitForTimeout(180 / TS); await d.tap('j');
    }
  } else {                                               // prowl / stalk / recover / chase
    if (dist > 2.4) await d.walkTo(b.x, b.z, { timeout: 1.5, arrive: 2 });
    else { await d.tap('j'); await d.page.waitForTimeout(200 / TS); }
  }
  if (b.hp !== lastHp) { say(`hp ${lastHp} -> ${b.hp} [${b.action}]`); lastHp = b.hp; }
}

const flags = await d.page.evaluate(() => ({
  sylva: !!window.__wk.flags.sylvaDefeated,
  sylvaHp: window.__game.state.flags.sylvaHp,
}));
say('FLAGS:', JSON.stringify(flags));
say('SEEN:', JSON.stringify({ actions: [...seen.actions], deaths: seen.deaths, respawns: seen.respawns }));
await d.shot('post');

// the way onward appears on the REBUILD: leave for tc4, walk back in
let f1open = false, bossGone = false;
if (flags.sylva) {
  const sDoor = (await d.wk('doors')).find((x) => x.to === 'tc4');
  if (sDoor) await d.walkTo(sDoor.x, sDoor.z, { timeout: 40, arrive: 1.1 });
  if ((await d.wk('room')) === 'tc4') {
    const back = (await d.wk('doors')).find((x) => x.to === 'tgl');
    if (back) await d.walkTo(back.x, back.z, { timeout: 40, arrive: 1.1 });
  }
  if ((await d.wk('room')) === 'tgl') {
    const doors = await d.wk('doors');
    f1open = !!doors.find((x) => x.to === 'f1' && x.open !== false);
    bossGone = !(await d.wk('boss'));
    say('rebuilt tgl doors:', doors.map((x) => x.to).join(','), '· boss gone:', bossGone);
    await d.shot('tgl-freed');
  }
}
say('music:', await d.wk('music'));
d.saveLog('sylva');
const won = flags.sylva && f1open && bossGone;
say(won ? `SYLVA FREED at ${TS}x — the way to Frostpeak is open` : 'NOT COMPLETE');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
