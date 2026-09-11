// A MINI_ROSTER GUARDIAN, FOUGHT BY ITS STATE MACHINE. From
// tools/fight-warden.mjs (v3.136, design/WIDER-WORLD.md §2.6): every
// MINI_ROSTER guardian is the SAME class as the crypt's Bone Warden — a
// different body/tint/weakness on the identical BoneWarden machine — so
// every guardian's fight reads exactly like the Warden's: chop_tele ~0.7s →
// chop (130° cone, 2.9u — sidestep); spin_tele → spin (whole-circle ring —
// sprint out past its edge); tired ~2.6s (wide open — punish). Real keyboard
// input, dev-jump straight to the guardian's own room. Every loss diagnosed
// against the machine before any game code is suspected.
//
// GENERIC BY DESIGN (§2.6's own table names this file ONCE, not once per
// dungeon — every later MINI_ROSTER guardian reuses it, parameterized):
//   WK_ROOM        room id to jump into (default 'vr2', the Rootbound Wight)
//   WK_REGION      WS region the guardian's wound/defeat live under (default 'vault')
//   WK_MINI_KEY    the MINI_ROSTER `key` (default 'rootbound_wight')
//   WK_FORMS       comma-separated forms to grant (default the Rootbound Wight's own)
//   WK_SETUP_WS    comma-separated region:key pairs set true before the jump
//                  (default 'vault:spark,vault:drained,vault:handDown')
//   WK_NAME        profile/evidence-dir name (default 'MINIFIGHT')
//   WK_TIMESCALE   world timescale for the boss ladder (1 -> 0.5 -> 0.25);
//                  a win below 1x is a flagged partial, full-speed timing is
//                  proved by separate probes
//
// e.g. for the Sunken Hearth's Rime Warden (v3.148):
//   WK_ROOM=f1d WK_REGION=frost WK_MINI_KEY=rime_warden \
//   WK_FORMS=knight,dark_wolf,fire_wolf,earth_wolf \
//   WK_SETUP_WS= WK_NAME=RIMEWARDEN node tools/fight-mini.mjs
//
// Unlike the crypt Warden, a MINI_ROSTER guardian's wound and defeat live in
// WS.set(region,'mini_<key>_hp'/'mini_<key>') rather than
// state.flags.wardenHp/wardenDefeated (BoneWarden's opts.hpGet/hpSet/
// onDefeated) — and defeat grants no wolf form. A guardian's room may also
// hold trash mooks, so the loop clears whichever engages first rather than
// assuming the guardian is s.boss from frame one.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const ROOM = process.env.WK_ROOM || 'vr2';
const REGION = process.env.WK_REGION || 'vault';
const MINI_KEY = process.env.WK_MINI_KEY || 'rootbound_wight';
const FORMS = (process.env.WK_FORMS || 'knight,dark_wolf,fire_wolf,earth_wolf,verdant_wolf').split(',');
const SETUP_WS = (process.env.WK_SETUP_WS !== undefined ? process.env.WK_SETUP_WS : 'vault:spark,vault:drained,vault:handDown')
  .split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(':'));
const NAME = process.env.WK_NAME || 'MINIFIGHT';

const DIR = `test-evidence/mini-roster/${MINI_KEY}${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

const guardianDown = () => d.page.evaluate(({ region, key }) => {
  const f = window.__wk.flags;
  return !!(f.world && f.world[region] && f.world[region]['mini_' + key]);
}, { region: REGION, key: MINI_KEY });

await d.newGame(NAME);
for (const [region, key] of SETUP_WS) {
  await d.page.evaluate(({ region, key }) => { window.__game.WS.set(region, key, true); }, { region, key });
}
await d.jump(ROOM, FORMS);
await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
say('arena:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('arena');

const seen = { states: new Set(), deaths: 0, respawns: [] };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts;

while ((Date.now() - t0) / 1000 < 45 * 60) {
  const s = await d.wk();
  if (s.room !== ROOM) {
    if (await guardianDown()) { say('DEFEATED (left arena after kill)'); break; }
    say('  left arena — walking back');
    const door = (await d.wk('doors')).find((x) => x.to === ROOM);
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
    continue;
  }
  const b = s.boss;
  if (!b) {
    if (await guardianDown()) { say('DEFEATED'); break; }
    // no engaged mini/boss this tick — the trash may still be up; chip it
    const foe = (await d.wk('foes'))[0];
    if (foe) await d.walkTo(foe.x, foe.z, { timeout: 2, arrive: 1.6 });
    else await d.page.waitForTimeout(500);
    continue;
  }
  seen.states.add(b.state);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++; say(`DEATH #${seen.deaths} [hp ${b.hp} state ${b.state}]`);
    await d.page.waitForTimeout(4500 / TS);
    const back = await d.wk(); seen.respawns.push(back.room);
    if (back.room !== ROOM) { const dr = (await d.wk('doors')).find((x) => x.to === ROOM); if (dr) await d.walkTo(dr.x, dr.z, { timeout: 30 }); }
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
  }
  lastHearts = s.hearts;
  if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');

  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const dist = Math.hypot(dx, dz);
  if (b.state === 'spin_tele' || b.state === 'spin') {
    const nx = dist < 0.01 ? 1 : -dx / dist, nz = dist < 0.01 ? 0 : -dz / dist;
    const tx = s.pos.x + nx * 5, tz = s.pos.z + nz * 5;
    await d.walkTo(Math.max(-14, Math.min(14, tx)), Math.max(-11, Math.min(11, tz)), { timeout: 2.2, arrive: 0.7 });
  } else if (b.state === 'chop_tele' || b.state === 'chop') {
    const px = Math.abs(dx) > Math.abs(dz) ? (dz > 0 ? 'w' : 's') : (dx > 0 ? 'a' : 'd');
    await d.page.keyboard.down(px); await d.page.waitForTimeout(500 / TS); await d.page.keyboard.up(px);
  } else if (b.state === 'tired') {
    if (dist > 1.5) await d.walkTo(b.x, b.z, { timeout: 2, arrive: 1.3 });
    else { const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(k); await d.page.waitForTimeout(120); await d.page.keyboard.up(k);
      await d.tap('j'); await d.page.waitForTimeout(180 / TS); await d.tap('j'); }
  } else { // chase
    if (dist > 2.2) await d.walkTo(b.x, b.z, { timeout: 1.5, arrive: 2 });
    else { await d.tap('j'); await d.page.waitForTimeout(200 / TS); }
  }
  if (b.hp !== lastHp) { say(`hp ${lastHp} -> ${b.hp} [${b.state}]`); lastHp = b.hp; }
}

const flags = await d.page.evaluate(({ region, key }) => {
  const f = window.__wk.flags;
  return { guardianDown: !!(f.world && f.world[region] && f.world[region]['mini_' + key]),
    dungeonDone: !!(f.world && f.world[region] && f.world[region].dungeon),
    forms: window.__wk.forms };
}, { region: REGION, key: MINI_KEY });
say('FLAGS:', JSON.stringify(flags));
say('SEEN:', JSON.stringify({ states: [...seen.states], deaths: seen.deaths, respawns: seen.respawns }));
await d.shot('post');
d.saveLog(MINI_KEY);
// no wolf form is granted — a MINI_ROSTER guardian is not a region boss
// (design/LEVEL-DESIGN-BRANCHES.md's 2026-09-10 amendment)
const won = flags.guardianDown && flags.dungeonDone;
say(won ? `${MINI_KEY.toUpperCase()} DEFEATED at ${TS}x — no form granted (by design)` : 'NOT DEFEATED');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
