// ARIA, THE GALEBOUND — the Shadowgrip class in stormlight (boss.js SKINS.aria):
// 26 hp, 1.14x speed, saveKey ariaHp. Same action machine as Sylva and the
// Shadowgrip: prowl/stalk/windup/swipe/crouch/charge/tired/recover. Her twist:
// at HALF HP she raises two flanking gales (x=+/-8.5, 7u wide, pushing inward,
// gale strength exceeds walking top speed) — the escape lane narrows to the
// dry middle band, roughly |x|<5.
//
// L5/L6 RE-KEY (2026-08-22): storm_wolf is HER OWN reward now (main.js grants
// it on ariaDefeated) — a real child reaches this fight WITHOUT the Thunder
// Dash, and can never have it here. The crouch→charge telegraph is the same
// ~1s hound tell every mini-boss in the game already uses and is walked out
// of by every other fight; this run dodges it the ordinary way — sidestep
// within the open middle band — to confirm that still clears a charge once
// the gales are up, with nothing here assuming the dash exists yet.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-5/aria${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('ARIA');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.borealDefeated = true;
  g.WS.set('storm', 'vanesTurned', true);
});
await d.jump('scr', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});
say('crown:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('crown');

const seen = { actions: new Set(), deaths: 0, respawns: [], dashes: 0 };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts;

while ((Date.now() - t0) / 1000 < 45 * 60) {
  await d.pickPerkIfOffered();
  const s = await d.wk();
  if (s.room !== 'scr') {
    const won = await d.page.evaluate(() => !!window.__wk.flags.ariaDefeated);
    if (won) { say('DEFEATED (left the crown after kill)'); break; }
    const door = (await d.wk('doors')).find((x) => x.to === 'scr');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    continue;
  }
  const b = s.boss;
  if (!b) {
    const won = await d.page.evaluate(() => !!window.__wk.flags.ariaDefeated);
    if (won) { say('DEFEATED'); break; }
    await d.page.waitForTimeout(500); continue;
  }
  if (b.hp <= 0 && (await d.page.evaluate(() => !!window.__wk.flags.ariaDefeated))) {
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
    // out of the red lane — step perpendicular, but stay in the open middle
    // (|x|<5): the flanks gale up at half health and the wind alone outruns
    // a walking retreat out there, same shape as Meri's flood on the other
    // side of the re-key
    const px = -dz / (dist || 1), pz = dx / (dist || 1);
    const side = ((s.pos.x * pz - s.pos.z * px) > 0) ? 1 : -1;
    const tx = Math.max(-4.5, Math.min(4.5, s.pos.x + px * 4 * side));
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
  aria: !!window.__wk.flags.ariaDefeated,
  ariaHp: window.__game.state.flags.ariaHp,
  stormGranted: window.__game.state.formsUnlocked.includes('storm_wolf'),
}));
say('FLAGS:', JSON.stringify(flags));
if (flags.aria && !flags.stormGranted) {
  say('FAIL: ariaDefeated is set but storm_wolf was never granted — see main.js ceremony block');
  d.errors.push('storm_wolf not granted on ariaDefeated');
}
say('SEEN:', JSON.stringify({ actions: [...seen.actions], deaths: seen.deaths, respawns: seen.respawns, dashes: seen.dashes }));
await d.shot('post');

// the way onward on the rebuild — leave and re-enter
let onward = false, bossGone = false;
if (flags.aria) {
  const sDoor = (await d.wk('doors')).find((x) => x.to === 'sc4');
  if (sDoor) await d.walkTo(sDoor.x, sDoor.z, { timeout: 40, arrive: 0.4 });
  await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  if ((await d.wk('room')) === 'sc4') {
    const back = (await d.wk('doors')).find((x) => x.to === 'scr');
    if (back) await d.walkTo(back.x, back.z, { timeout: 40, arrive: 0.4 });
    await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  }
  if ((await d.wk('room')) === 'scr') {
    const doors = await d.wk('doors');
    bossGone = !(await d.wk('boss'));
    onward = doors.length > 1;               // whatever the freed crown grows
    say('freed crown doors:', doors.map((x) => x.to).join(','), '· boss gone:', bossGone);
    await d.shot('scr-freed');
  }
}
say('music:', await d.wk('music'));
d.saveLog('aria');
const won = flags.aria && bossGone;
say(won ? `ARIA FREED at ${TS}x — the gale drops off the crown` : 'NOT COMPLETE');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
