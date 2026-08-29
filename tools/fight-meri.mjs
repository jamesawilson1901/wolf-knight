// MERI, THE DROWNED — the Shadowgrip class as a giant TIDE BLOB (boss.js
// SKINS.meri, Slime.glb): 28 hp, 0.92x speed, saveKey meriHp. Same action
// machine: prowl/stalk/windup/swipe/crouch/charge/tired/recover. Her twist:
// at hp<=14 she FLOODS the arena — two deep zones grow at world x[-13,-6] and
// [6,13]; standing ground shrinks.
//
// L5/L6 RE-KEY (2026-08-22): tide_wolf is HER OWN reward now (main.js grants
// it on meriDefeated) — a real child reaches this fight WITHOUT it, fighting
// as whatever form they last carried. The flood is still real deep water
// (visually, and it still slows), but water.js's noCollide keeps it walkable
// for everyone precisely because nobody here can own the gift yet — see
// boss.js's _flood(). This run deliberately does NOT pre-grant tide_wolf, so
// it is also the regression test for that fix: if the flood ever regresses
// back to a hard collider, this run gets a player stuck in a wall.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-6/meri${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('MERI');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.ariaDefeated = true;
  g.WS.set('vale', 'spark', true);
  g.WS.set('vale', 'poolsQuenched', true);
});
await d.jump('ddp', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});
say('deep:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('deep');

const seen = { actions: new Set(), deaths: 0, respawns: [], dashes: 0 };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts;

const aim = async (x, z) => {
  const s = await d.wk();
  const dx = x - s.pos.x, dz = z - s.pos.z;
  const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
  await d.page.keyboard.down(key); await d.page.waitForTimeout(150); await d.page.keyboard.up(key);
};

while ((Date.now() - t0) / 1000 < 45 * 60) {
  await d.pickPerkIfOffered();
  const s = await d.wk();
  if (s.room !== 'ddp') {
    const won = await d.page.evaluate(() => !!window.__wk.flags.meriDefeated);
    if (won) { say('DEFEATED (left the crown after kill)'); break; }
    const door = (await d.wk('doors')).find((x) => x.to === 'ddp');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    continue;
  }
  const b = s.boss;
  if (!b) {
    const won = await d.page.evaluate(() => !!window.__wk.flags.meriDefeated);
    if (won) { say('DEFEATED'); break; }
    await d.page.waitForTimeout(500); continue;
  }
  if (b.hp <= 0 && (await d.page.evaluate(() => !!window.__wk.flags.meriDefeated))) {
    say('DEFEATED (corpse dissolving)'); break;
  }
  seen.actions.add(b.action);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++; say(`DEATH #${seen.deaths} [hp ${b.hp} action ${b.action}]`);
    await d.page.waitForTimeout(4500 / TS);
    seen.respawns.push(await d.wk('room'));
  }
  lastHearts = s.hearts;
  if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');

  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const dist = Math.hypot(dx, dz);
  if (b.action === 'windup' || b.action === 'swipe') {
    await d.holdShield(1000 / TS);
  } else if (b.action === 'crouch' || b.action === 'charge') {
    // out of the red lane — step perpendicular, but stay in the DRY-ISH
    // middle (|x|<6): the flanks flood at half health and, since noCollide
    // keeps them walkable-but-slow rather than walled, straying into them
    // just costs speed exactly when a wolf needs it least
    const px = -dz / (dist || 1), pz = dx / (dist || 1);
    const side = ((s.pos.x * pz - s.pos.z * px) > 0) ? 1 : -1;
    const tx = Math.max(-5.5, Math.min(5.5, s.pos.x + px * 4 * side));
    const tz = Math.max(-9, Math.min(9, s.pos.z + pz * 4 * side));
    await d.walkTo(tx, tz, { timeout: 1.6, arrive: 0.8 });
    seen.dashes++;
  } else if (b.action === 'tired') {
    if (dist > 1.6) await d.walkTo(b.x, b.z, { timeout: 2, arrive: 1.3 });
    else {
      const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(k); await d.page.waitForTimeout(120); await d.page.keyboard.up(k);
      await d.tap('j'); await d.page.waitForTimeout(180 / TS); await d.tap('j');
    }
  } else {
    if (dist > 2.4) await d.walkTo(b.x, b.z, { timeout: 1.5, arrive: 2 });
    else { await d.tap('j'); await d.page.waitForTimeout(200 / TS); }
  }
  if (b.hp !== lastHp) { say(`hp ${lastHp} -> ${b.hp} [${b.action}]`); lastHp = b.hp; }
}

const flags = await d.page.evaluate(() => ({
  meri: !!window.__wk.flags.meriDefeated,
  meriHp: window.__game.state.flags.meriHp,
  tideGranted: window.__game.state.formsUnlocked.includes('tide_wolf'),
}));
say('FLAGS:', JSON.stringify(flags));
if (flags.meri && !flags.tideGranted) {
  say('FAIL: meriDefeated is set but tide_wolf was never granted — see main.js ceremony block');
  d.errors.push('tide_wolf not granted on meriDefeated');
}
say('SEEN:', JSON.stringify({ actions: [...seen.actions], deaths: seen.deaths, respawns: seen.respawns, dashes: seen.dashes }));
await d.shot('post');

// THE WAY ON OPENS WHERE YOU STAND (v3.74.0): a beat and a half of game
// time after the kill, the rock plug goes up in a smoke poof and the x1
// door appears IN the live deep — no walking out and back. See
// fight-boreal.mjs for the full note.
let inPlace = true;  // vacuously true if Kael already left — the rebuild path covers that
if (flags.meri && (await d.wk('room')) === 'ddp') {
  inPlace = false;
  const it0 = Date.now();
  while ((Date.now() - it0) / 1000 < 150 && !inPlace) {
    await d.pickPerkIfOffered();
    inPlace = !!(await d.wk('doors')).find((x) => x.to === 'x1');
    if (!inPlace) await d.page.waitForTimeout(500);
  }
  say('the way on opened IN PLACE:', inPlace, 'after', ((Date.now() - it0) / 1000).toFixed(1) + 's');
  await d.shot('ddp-onward-in-place');
}

// the way onward on the rebuild — leave and re-enter
let onward = false, bossGone = false;
if (flags.meri) {
  // task #32's lesson, applied here too (it only ever landed in
  // fight-boreal): the victory narration holds gates.blocking for tens of
  // seconds at 1x, and a walk attempted under it times out in place — the
  // suite then reads the corpse world and reports boss gone: false. The
  // old 4x runs outran it by accident. Wait the gates out before walking.
  const nt0 = Date.now();
  while ((Date.now() - nt0) / 1000 < 150) {
    await d.pickPerkIfOffered();
    const g = await d.wk('gates');
    if (!g.blocking && !g.speaking && !g.transitioning) break;
    await d.page.waitForTimeout(500);
  }
  say('post-defeat gates settled after', ((Date.now() - nt0) / 1000).toFixed(1) + 's');
  const sDoor = (await d.wk('doors')).find((x) => x.to === 'dg4');
  if (sDoor) await d.walkTo(sDoor.x, sDoor.z, { timeout: 40, arrive: 0.4 });
  await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  if ((await d.wk('room')) === 'dg4') {
    const back = (await d.wk('doors')).find((x) => x.to === 'ddp');
    if (back) await d.walkTo(back.x, back.z, { timeout: 40, arrive: 0.4 });
    await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  }
  if ((await d.wk('room')) === 'ddp') {
    const doors = await d.wk('doors');
    bossGone = !(await d.wk('boss'));
    onward = !!doors.find((x) => x.to === 'x1' && x.open !== false);   // the way to the Shadow Court
    say('drained deep doors:', doors.map((x) => x.to).join(','), '· boss gone:', bossGone);
    await d.shot('scr-freed');
  }
}
say('music:', await d.wk('music'));
d.saveLog('aria');
const won = flags.meri && bossGone && inPlace;
say(won ? `MERI FREED at ${TS}x — the vale drains, the way to the Court opens` : 'NOT COMPLETE');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
