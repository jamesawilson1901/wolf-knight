// THE ROOTBOUND WIGHT, FOUGHT BY HIS STATE MACHINE. From tools/fight-warden.mjs
// (v3.136, design/WIDER-WORLD.md §2.6): MINI_ROSTER's first guardian is the
// SAME class as the crypt's Bone Warden — `tower-wight.glb` on the identical
// BoneWarden machine, moss-tinted, weak to verdant — so the fight itself reads
// exactly like the Warden's: chop_tele ~0.7s → chop (130° cone, 2.9u —
// sidestep); spin_tele → spin (whole-circle ring — sprint out past its edge);
// tired ~2.6s (wide open — punish). Real keyboard input, dev-jump straight to
// the Tangled Hollow (vr2). Every loss diagnosed against the machine before
// any game code is suspected.
//
// Unlike the crypt Warden, the Wight's wound and defeat live in
// WS.set('vault','mini_rootbound_wight_hp'/'mini_rootbound_wight') rather than
// state.flags.wardenHp/wardenDefeated (BoneWarden's opts.hpGet/hpSet/
// onDefeated) — and defeat grants no wolf form. It also shares the room with
// 2 cinder-imp + 1 stone-colossus (the room's own trash), so the loop clears
// whichever engages first rather than assuming the Wight is s.boss from frame
// one.
//
// WK_TIMESCALE scales the world for the boss ladder (1 -> 0.5 -> 0.25). A win
// below 1x is a flagged partial; full-speed timing is proved by separate probes.
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-2/rootbound-wight${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

const wightDown = () => d.page.evaluate(() => {
  const f = window.__wk.flags;
  return !!(f.world && f.world.vault && f.world.vault.mini_rootbound_wight);
});

await d.newGame('ROOTWIGHT');
// enter with the region's earned kit, as a child who has cut the bramble with
// the Verdant Wolf and is standing in the Tangled Hollow
await d.page.evaluate(() => { const g = window.__game;
  for (const k of ['spark', 'drained', 'handDown']) g.WS.set('vault', k, true); });
await d.jump('vr2', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
say('arena:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('arena');

const seen = { states: new Set(), deaths: 0, respawns: [] };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts;

while ((Date.now() - t0) / 1000 < 45 * 60) {
  const s = await d.wk();
  if (s.room !== 'vr2') {
    if (await wightDown()) { say('DEFEATED (left arena after kill)'); break; }
    say('  left arena — walking back');
    const door = (await d.wk('doors')).find((x) => x.to === 'vr2');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    await d.page.evaluate(() => { window.__game.state.form = 'knight'; });
    continue;
  }
  const b = s.boss;
  if (!b) {
    if (await wightDown()) { say('DEFEATED'); break; }
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
    if (back.room !== 'vr2') { const dr = (await d.wk('doors')).find((x) => x.to === 'vr2'); if (dr) await d.walkTo(dr.x, dr.z, { timeout: 30 }); }
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

const flags = await d.page.evaluate(() => {
  const f = window.__wk.flags;
  return { wightDown: !!(f.world && f.world.vault && f.world.vault.mini_rootbound_wight),
    dungeonDone: !!(f.world && f.world.vault && f.world.vault.dungeon),
    forms: window.__wk.forms };
});
say('FLAGS:', JSON.stringify(flags));
say('SEEN:', JSON.stringify({ states: [...seen.states], deaths: seen.deaths, respawns: seen.respawns }));
await d.shot('post');
d.saveLog('rootbound-wight');
// no wolf form is granted — a MINI_ROSTER guardian is not a region boss
// (design/LEVEL-DESIGN-BRANCHES.md's 2026-09-10 amendment)
const won = flags.wightDown && flags.dungeonDone;
say(won ? `ROOTBOUND WIGHT DEFEATED at ${TS}x — no form granted (by design)` : 'NOT DEFEATED');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
