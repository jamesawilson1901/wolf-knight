// THE SHADOWGRIP, FOUGHT BY READING HIM. Per the boss ladder: poll the state
// hook for his action, respond the way the spec says a player should — the
// crouch telegraphs the charge (sidestep it), the windup telegraphs the swipe
// (shield up, a perfect block staggers), tired is the window every swing
// counts in. All inputs are real keys. Every loss is diagnosed from the log
// before any game code is suspected.
import { launch } from './wk-drive.mjs';

const TIMESCALE = parseFloat(process.argv[2] || '1');
const DIR = `test-evidence/level-1/boss${TIMESCALE !== 1 ? '-' + TIMESCALE + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TIMESCALE });
const say = (...a) => console.log(...a);

await d.newGame('BOSSBOT');
await d.jump('le', ['knight', 'dark_wolf']);
say('arena:', JSON.stringify(await d.wk()));
await d.shot('arena-entry');

const seen = { actions: new Set(), phases: new Set(), deaths: 0, respawnRooms: [] };
const t0 = Date.now();
let lastHearts = (await d.wk()).hearts;
let held = null;
let lastHp = null;
// THE SWING IS A CONE IN FACING DIRECTION, and facing follows movement — a
// bot that stops walking and swings hits whatever it last walked toward.
// One brief step toward the boss sets the facing before every swing.
const face = async (b) => {
  const s = await d.wk();
  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
  await d.page.keyboard.down(k); await d.page.waitForTimeout(120); await d.page.keyboard.up(k);
};
const hold = async (k) => { if (held !== k) { if (held) await d.page.keyboard.up(held); held = k; if (k) await d.page.keyboard.down(k); } };

let shielded = false;
while ((Date.now() - t0) / 1000 < 80 * 60) {
  const s = await d.wk();
  const b = s.boss;
  if (!b) {
    say('boss gone — defeated?', JSON.stringify(s));
    break;
  }
  seen.actions.add(b.action);
  seen.phases.add(b.phase);
  if (s.hearts < lastHearts) say(`hit: ${lastHearts} -> ${s.hearts} during ${b.action} phase ${b.phase}`);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++;
    say(`DEATH #${seen.deaths} at phase ${b.phase}`);
    await d.page.waitForTimeout(5000);
    const back = await d.wk();
    seen.respawnRooms.push(back.room);
    say('respawned:', JSON.stringify(back));
    if (back.room !== 'le') {
      // walk back in through the boss door — respawn checkpoint test
      const doors = await d.wk('doors');
      const door = doors.find((x) => x.to === 'le');
      if (door) await d.walkTo(door.x, door.z, { timeout: 40 });
      await d.page.waitForTimeout(1500);
    }
  }
  lastHearts = s.hearts;

  if (shielded && b.action !== 'windup' && b.action !== 'swipe') {
    await d.page.keyboard.up('i'); shielded = false;
  }
  if (s.hearts <= 1.5 && s.hearts > 0.5) { await d.tap('h'); }
  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const dist = Math.hypot(dx, dz);
  // THE POUNCE, 2026-09-03. `rear` is its on-body tell (it RISES rather than
  // coiling) and `pounce` is the leap; both are answered by not being there,
  // the same as the charge. `dazed` is its opening — shorter than the collapse
  // and right on top of you, so it is punished the same way `tired` is.
  if (b.action === 'crouch' || b.action === 'charge' || b.action === 'rear' || b.action === 'pounce') {
    // sidestep the telegraphed line: strafe perpendicular
    await hold(null); await d.tap('i').catch(() => {});
    const perp = Math.abs(dx) > Math.abs(dz) ? (dz > 0 ? 'w' : 's') : (dx > 0 ? 'a' : 'd');
    await d.page.keyboard.down(perp); await d.page.waitForTimeout(600); await d.page.keyboard.up(perp);
  } else if (b.action === 'windup' || b.action === 'swipe') {
    // HOLD THE SHIELD THROUGH THE WHOLE WINDOW. Timed 900ms bursts leaked
    // swipes at 5fps polling latency — three deaths, all during swipe.
    await hold(null);
    if (!shielded) { await d.page.keyboard.down('i'); shielded = true; }
    await d.page.waitForTimeout(250);
  } else if (b.action === 'tired' || b.action === 'dazed') {
    await hold(null);
    if (dist > 1.4) await d.walkTo(b.x, b.z, { timeout: 3, arrive: 1.2 });
    await face(b); await d.tap('j'); await d.page.waitForTimeout(200); await d.tap('j');
  } else { // prowl | stalk | recover — poke and keep moving
    await hold(null);
    if (dist > 1.6) await d.walkTo(b.x, b.z, { timeout: 2.5, arrive: 1.3 });
    else { await face(b); await d.tap('j'); await d.page.waitForTimeout(220); }
  }
  if (b.hp !== lastHp) { say(`boss hp ${lastHp} -> ${b.hp} (phase ${b.phase})`); lastHp = b.hp; }
}
await hold(null);

const end = await d.wk();
const flags = await d.page.evaluate(() => ({
  bossDefeated: !!window.__wk.flags.bossDefeated,
  forms: window.__wk.forms }));
say('END:', JSON.stringify(end));
say('SEEN:', JSON.stringify({ actions: [...seen.actions], phases: [...seen.phases],
  deaths: seen.deaths, respawnRooms: seen.respawnRooms }));
say('FLAGS:', JSON.stringify(flags));
await d.shot('end');
d.saveLog('boss');
say('uncaught errors:', JSON.stringify(d.errors));
const win = flags.bossDefeated && flags.forms.includes('fire_wolf');
say(win ? `BOSS DEFEATED at ${TIMESCALE}x — fire wolf granted` : 'NOT DEFEATED');
await d.close();
process.exit(win && d.errors.length === 0 ? 0 : 1);
