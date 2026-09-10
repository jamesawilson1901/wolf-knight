// THE ROOT CELLAR, WALKED. Stoneroot's own dungeon (design/WIDER-WORLD.md
// §2.3/§2.6), from tools/verify-ashvault.mjs: is the door from `vc2` sealed
// before the bramble is cut and open after (and still open on a rebuild),
// does `vr2` hold its fight AND its own named guardian (the Rootbound
// Wight — the LEVEL-DESIGN-BRANCHES.md 2026-09-10 amendment this dungeon
// exists to prove out), does defeating the guardian set the dungeon
// milestone and pop the plug to `vr3` where the child is standing, and does
// the lost wolf / the gold chest behave. The gate itself and its own
// alcove chest (`l2_vc2_bramble`, in `vc2`) are UNCHANGED by this dungeon —
// only a second, separate door opens beside them.
import { launch } from './wk-drive.mjs';

const FORMS = ['knight', 'dark_wolf', 'earth_wolf', 'verdant_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('ROOTCELLAR');
const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// 0. THE DOOR IS SEALED BEFORE THE BRAMBLE IS CUT.
await wk.page.evaluate((f) => window.__wkJump('vc2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'vc2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
let vc2Doors = await wk.wk('doors');
check('vc2 has NO door to vr1 before the bramble is cut', !vc2Doors.some((d) => d.to === 'vr1'), vc2Doors.map((d) => d.to));
// the gate's own alcove chest is untouched by this dungeon
const brambleChestBefore = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'l2_vc2_bramble');
  return !!c && c.loot && c.loot.gear === 'spear_legion' && c.loot.shards === 24;
});
check('vc2 keeps its own bramble-alcove chest (l2_vc2_bramble) unmoved', brambleChestBefore);

// cut it directly — the cut mechanic itself is covered elsewhere
await wk.page.evaluate(() => { window.__game.WS.set('vault', 'cut_l2_bramble_gate', true); });
await wk.page.evaluate((f) => window.__wkJump('vc2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'vc2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
vc2Doors = await wk.wk('doors');
check('vc2 HAS a door to vr1 once cut (open on rebuild)', vc2Doors.some((d) => d.to === 'vr1'), vc2Doors.map((d) => d.to));

// 1. vr1 — no fight, the lost wolf.
for (const room of ['vr1', 'vr2', 'vr3']) {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: FORMS });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
  const m = await wk.page.evaluate(() => {
    const g = window.__game;
    let meshes = 0;
    g.world.root.traverse((n) => { if (n.isMesh) meshes++; });
    return { meshes, calls: g.renderer.info.render.calls,
      enemies: (g.world.enemies || []).length,
      chests: (g.world.markers.chestDefs || []).length,
      doors: (g.world.doors || []).map((d) => d.to) };
  });
  check(`${room} builds with content, calls < 125`, m.meshes > 20 && m.calls < 125, m);
}

await wk.page.evaluate((f) => window.__wkJump('vr1', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'vr1' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const vr1 = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    doors: (g.world.doors || []).map((d) => d.to),
    hasLostWolf: !!g.world.updateLostWolf };
});
check('vr1 has no fight', vr1.hostiles === 0, vr1);
check('vr1 has doors to both vc2 and vr2', vr1.doors.includes('vc2') && vr1.doors.includes('vr2'), vr1.doors);
check('vr1 spawns the lost-wolf update hook', vr1.hasLostWolf, vr1);

// walk up to the wolf and rescue it for real
await wk.walkTo(-6.5, 5, { timeout: 20, arrive: 1.0 });
await wk.page.waitForTimeout(300);
const rescued = await wk.page.evaluate(() => !!window.__game.state.flags.rescued.vr1_wolf);
check('walking up to the wolf writes state.flags.rescued.vr1_wolf', rescued);

// 2. vr2 — the fight, the guardian, the plug, the milestone.
await wk.page.evaluate((f) => window.__wkJump('vr2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'vr2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });
const vr2before = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hostiles: (g.world.enemies || []).filter((e) => e.constructor.name !== 'Breakable').length,
    hasMini: !!g.world.miniBoss,
    miniWeakness: g.world.miniBoss && g.world.miniBoss.weakness,
    doors: (g.world.doors || []).map((d) => d.to),
    dungeonDone: g.WS.get('vault', 'dungeon') };
});
check('vr2 holds 3 mooks (stone-colossus + 2 cinder-imp) + the Rootbound Wight, no door to vr3 yet',
  vr2before.hostiles === 4 && vr2before.hasMini && vr2before.miniWeakness === 'verdant'
    && !vr2before.doors.includes('vr3') && !vr2before.dungeonDone, vr2before);

// FORMS in the harness's own dev-jump already pre-unlocks earth_wolf/
// verdant_wolf so the fight is reachable in the first place — the guardian
// amendment claim ("never grants a wolf form") has to be checked against
// forms BEFORE vs AFTER the kill, not against a fixed form id.
const formsBefore = await wk.wk('forms');
await wk.page.evaluate(() => {
  const g = window.__game;
  for (const e of g.world.enemies) {
    if (e === g.world.miniBoss) continue;   // die() below, not a blunt flag
    e.hp = 0; e.dead = true;
  }
  // die() is what fires the wound/defeat hooks (js/enemies.js BoneWarden) —
  // flagging dead is not enough on its own for the mini-boss's onDefeated.
  if (g.world.miniBoss && !g.world.miniBoss.dead) g.world.miniBoss.die();
});
await wk.page.waitForTimeout(500);
const vr2after = await wk.page.evaluate(() => {
  const g = window.__game;
  return { wightDown: g.WS.get('vault', 'mini_rootbound_wight'),
    dungeonDone: g.WS.get('vault', 'dungeon'),
    doors: (g.world.doors || []).map((d) => d.to) };
});
const formsAfter = await wk.wk('forms');
check('killing the Rootbound Wight sets WS(vault,mini_rootbound_wight) and WS(vault,dungeon), pops the plug to vr3',
  vr2after.wightDown && vr2after.dungeonDone && vr2after.doors.includes('vr3'), vr2after);

// THE GUARDIAN AMENDMENT, PROVEN: this fight room never grants a wolf form —
// the whole point of design/LEVEL-DESIGN-BRANCHES.md's 2026-09-10 amendment.
check('no wolf form is granted by the guardian (it is not a region boss)',
  formsAfter.length === formsBefore.length && formsAfter.every((f) => formsBefore.includes(f)),
  { formsBefore, formsAfter });

// re-entering vr2 no longer spawns a second Wight — the wound/defeat lives in
// WS, not a fresh in-memory flag, so a rebuild must read it back.
await wk.page.evaluate((f) => window.__wkJump('vc2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'vc2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate((f) => window.__wkJump('vr2', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'vr2' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const vr2rebuilt = await wk.page.evaluate(() => !!window.__game.world.miniBoss);
check('the Rootbound Wight does not respawn once defeated (persists via WS)', !vr2rebuilt);

// 3. THE PROMISE — the ??? card resolves on the milestone, not the cut.
const promiseResolvesOnDungeon = await wk.page.evaluate(() => window.__game.WS.get('vault', 'dungeon'));
check('the l2_bramble promise condition (vault/dungeon) is now true', promiseResolvesOnDungeon);

// 4. vr3 — the gold chest, reachable now the plug is gone.
await wk.page.evaluate((f) => window.__wkJump('vr3', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'vr3' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const vr3 = await wk.page.evaluate(() => {
  const g = window.__game;
  const c = (g.world.markers.chestDefs || []).find((x) => x.id === 'vr3_rootbound');
  return { id: c && c.id, tier: c && c.tier, heartPiece: c && c.loot.heartPiece,
    gear: c && c.loot.gear, doors: (g.world.doors || []).map((d) => d.to) };
});
check('vr3 gold chest exists with a heart piece and a gear id',
  !!vr3.id && vr3.heartPiece === 1 && !!vr3.gear, vr3);
check('vr3 has a door back to vr2', vr3.doors.includes('vr2'), vr3.doors);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Root Cellar holds together');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
