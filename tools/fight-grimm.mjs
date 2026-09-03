// SHADOW-GRIMM — the last fight (boss.js SKINS.grimm, Shadowgrip class). 32 hp,
// speedMult 1.1, dmg 1.5, saveKey grimmHp.
//
// TWO THINGS THIS FIGHT TEACHES THE DRIVER:
//  1. AIM AT THE CORE, NOT THE ROOT. __wk.boss.x/z is the boss ROOT; the
//     hittable is world.boss.coreHittable, which rides core.position and wanders
//     several metres out as he prowls/charges. Swinging at the root whiffs — the
//     first run stalled at 32 hp doing exactly that (every element "BLOCKED",
//     but at 32 hp he resists nothing: those were misses).
//  2. HIS ARMOUR (boss._resists, adapts:true):
//       coreHp <= 16    -> resists STEEL and MOON (knight/dark/ghost do nothing)
//       coreHp <= ~10.67 -> ALSO resists the LAST element that LANDED. He only
//         updates _lastElement on a hit that connects, so a forward cycle
//         through the six elementals (each != the previous) always lands.
// The reliable damage window is TIRED (2.6s, collapsed under the gold ring) —
// pile hits on the core there; shield windup/swipe; dodge crouch/charge.
// He is FREED, not killed: a ~27s cinematic then credits (pointer-only overlay).
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-7/grimm${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

const ELEMS = ['fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf'];
let elemIdx = 0;
const ALLFORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
async function form(want) {
  for (let i = 0; i < 12; i++) {
    const cur = await d.wk('form');
    if (cur === want) return true;
    await d.tap('Tab');
    await d.page.waitForFunction((c) => window.__wk.form !== c, cur, { timeout: 2000 }).catch(() => {});
  }
  return false;
}
const grimmFreed = () => d.page.evaluate(() => !!window.__game.state.flags.grimmFreed);
// the ACTUAL hittable: root + animated core offset (wanders as he moves)
const coreOf = () => d.page.evaluate(() => {
  const b = window.__game.world.boss;
  if (!b || !b.coreHittable) return null;
  return { x: b.coreHittable.x, z: b.coreHittable.z, hp: b.coreHp, action: b.action };
});
// Wait for the GAME clock to advance `gs`, but CAP the real-time wait: when the
// boss falls, the ending cinematic freezes player._time, and an uncapped wait
// would hang here forever (it did — the kill landed but the script never
// reported it). 4s real is far more than the ~2s a 0.35s game-wait needs at 5fps.
const gameWait = (gs) => d.page.evaluate(async (g) => {
  const t0 = window.__game.player._time, w0 = Date.now();
  while (window.__game.player._time < t0 + g && Date.now() - w0 < 4000) await new Promise((r) => setTimeout(r, 80));
}, gs);
// turn to face (x,z) via the bearing/rotation loop (run-l3/l7). Reliable facing
// is the whole ballgame for the bite: the ±70° arc needs the core in front, and
// a one-shot cardinal nudge left the bot facing away (diagnosed on Grimm).
async function aimAt(x, z) {
  for (let i = 0; i < 6; i++) {
    const p = await d.wk('pos');
    const ry = await d.page.evaluate(() => window.__game.player.root.rotation.y);
    let diff = Math.atan2(x - p.x, z - p.z) - ry;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.5) return true;
    const dx = x - p.x, dz = z - p.z;
    const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
    await d.page.keyboard.down(key); await d.page.waitForTimeout(200); await d.page.keyboard.up(key);
  }
  return false;
}

await d.newGame('GRIMM');
// WK_GRIMM_HP pre-wounds Grimm (wounds persist via grimmHp) so the dangerous
// enraged/rotation phases can be tested fast without the ~2min descent.
const preHp = process.env.WK_GRIMM_HP ? parseFloat(process.env.WK_GRIMM_HP) : 0;
await d.page.evaluate((hp) => {
  const g = window.__game;
  g.state.flags.meriDefeated = true;
  ['ember', 'thorn', 'tide', 'moon'].forEach((n) => g.WS.set('court', 'relic_' + n, true));
  if (hp > 0) g.state.flags.grimmHp = hp;
}, preHp);
await d.jump('xth', ALLFORMS);
await d.page.evaluate(() => { window.__game.state.form = 'fire_wolf'; });
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});
say('throne:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('throne');

const seen = { actions: new Set(), deaths: 0, respawns: [], hits: 0, rotations: 0 };
const t0 = Date.now();
let lastHp = null, lastHearts = (await d.wk()).hearts;

// A SAFE DAMAGE WINDOW: hammer the (stationary) core while the boss stays in one
// of `actions` (tired 2.6s / recover 1.6s — no attack is out in either). Aim at
// the CORE, not the root; rotate the element on a stall (resist) or below 11hp.
async function punish(actions, secs) {
  const winEnd = Date.now() + (secs * 1000) / TS;
  let hits = 0;
  while (Date.now() < winEnd) {
    const c = await coreOf();
    if (!c || !actions.includes(c.action)) break;
    await form(ELEMS[elemIdx % ELEMS.length]);
    // Approach to a CLEAR standoff (~1.5u), then AIM at the core and swing. The
    // bite is a ±70° frontal arc (range 1.7 + core r 1.45): reliable facing is
    // everything. Overshoot to overlap OR a one-shot nudge both whiff — aimAt
    // turns to the bearing so the core is genuinely in front.
    const p = await d.wk('pos');
    if (Math.hypot(c.x - p.x, c.z - p.z) > 2.2) {
      await d.walkTo(c.x, c.z, { timeout: 1.4, arrive: 1.5 });
    }
    const before = c.hp;
    await aimAt(c.x, c.z);
    await d.tap('j'); await gameWait(0.35);
    const after = await coreOf();
    if (!after) break;
    if (after.hp < before) {
      seen.hits++; hits++;
      if (after.hp <= 11) elemIdx++;   // else the same element resists next time
    } else {
      elemIdx++; seen.rotations++;     // resisted (or a graze): rotate
    }
  }
  return hits;
}
// step away from the core so the swipe cone (needs d<2.8) and charge lane miss
async function backOff(cx, cz, reach) {
  const s = await d.wk('pos');
  const away = Math.hypot(s.x - cx, s.z - cz) || 1;
  const tx = Math.max(-8, Math.min(8, s.x + (s.x - cx) / away * reach));
  const tz = Math.max(-8, Math.min(8, s.z + (s.z - cz) / away * reach));
  await d.walkTo(tx, tz, { timeout: 1.0, arrive: 0.6 });
}
// THE FINISH. Below ~3hp the last-element resist makes a single-swing-per-window
// pace too slow (a wasted resisted swing eats the window). Pile in and swing,
// advancing the element EVERY swing so consecutive hits are different elements —
// so the last-landed is never the one you throw next, and nothing is resisted.
async function finisher() {
  say('  >> FINISHER engaged');
  for (let i = 0; i < 50; i++) {
    if (await grimmFreed()) return true;
    const c = await coreOf();
    if (!c || c.hp <= 0) return await grimmFreed();
    const s = await d.wk();
    if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');
    const el = ELEMS[elemIdx % ELEMS.length];
    await form(el);
    const dd = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
    if (dd > 2.0) await d.walkTo(c.x, c.z, { timeout: 1.2, arrive: 1.4 });
    await aimAt(c.x, c.z);
    const before = c.hp;
    await d.tap('j'); await gameWait(0.3);
    const after = await coreOf();
    if (i % 4 === 0 || (after && after.hp < before)) say(`  fin ${i}: ${el} hp ${before}->${after ? after.hp : '?'} dd=${dd.toFixed(1)} hearts=${s.hearts} act=${c.action}`);
    elemIdx++;                          // different element next swing, always
  }
  return await grimmFreed();
}
async function sidestep(cx, cz, reach) {
  const s = await d.wk('pos');
  const dist = Math.hypot(cx - s.x, cz - s.z) || 1;
  const px = -(cz - s.z) / dist, pz = (cx - s.x) / dist;
  const side = ((s.x * pz - s.z * px) > 0) ? 1 : -1;
  const tx = Math.max(-7.5, Math.min(7.5, s.x + px * reach * side));
  const tz = Math.max(-7.5, Math.min(7.5, s.z + pz * reach * side));
  await d.walkTo(tx, tz, { timeout: 1.2, arrive: 0.8 });
}

while ((Date.now() - t0) / 1000 < 45 * 60) {
  await d.pickPerkIfOffered();
  const s = await d.wk();
  if (s.room !== 'xth') {
    if (await grimmFreed()) { say('FREED (left the throne after the fight)'); break; }
    const door = (await d.wk('doors')).find((x) => x.to === 'xth');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    await d.page.evaluate(() => { window.__game.state.form = 'fire_wolf'; });
    continue;
  }
  const b = s.boss;
  if (!b) {
    if (await grimmFreed()) { say('FREED'); break; }
    await d.page.waitForTimeout(500); continue;
  }
  if (b.hp <= 0 && (await grimmFreed())) { say('FREED (form dissolving)'); break; }
  seen.actions.add(b.action);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++; say(`DEATH #${seen.deaths} [hp ${b.hp} action ${b.action}]`);
    await d.page.waitForTimeout(4500 / TS);
    seen.respawns.push(await d.wk('room'));
    await d.page.evaluate(() => { window.__game.state.form = 'fire_wolf'; });
  }
  lastHearts = s.hearts;
  if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');

  // ENDGAME: low health, where clean windows are scarce and the last-element
  // resist wastes them — stop kiting and pile in (rotating every swing) until
  // he falls. Potions cover the hits taken; he is nearly down anyway.
  if (b.hp > 0 && b.hp <= 6) { if (await finisher()) { say('FREED (finisher)'); break; } continue; }

  // WOLVES CAN'T BLOCK (form.def.shield is knight-only) — they DODGE. Every
  // Grimm attack is a groundAttack (airborne negates it). His safe punish
  // windows are TIRED (2.6s, collapsed) and RECOVER (1.6s, panting) — no attack
  // is out in either. Swipe (frontal, d<2.8) and charge are the only real hits.
  const c = await coreOf();
  const cx = c ? c.x : b.x, cz = c ? c.z : b.z;
  const dist = Math.hypot(cx - s.pos.x, cz - s.pos.z);
  if (b.action === 'tired' || b.action === 'dazed') {
    await punish(['tired'], 2.6);
  } else if (b.action === 'recover') {
    await punish(['recover'], 1.6);       // free hits while he pants
  } else if (b.action === 'swipe') {
    await d.tap('Space');                 // jump: airborne clears the paw
    await backOff(cx, cz, 4.5);           // and leave the frontal cone
  } else if (b.action === 'windup') {
    await backOff(cx, cz, 4.0);           // the swipe is coming — open distance
  // THE POUNCE, 2026-09-03. `rear` is its on-body tell (it RISES rather than
  // coiling) and `pounce` is the leap; both are answered by not being there,
  // the same as the charge. `dazed` is its opening — shorter than the collapse
  // and right on top of you, so it is punished the same way `tired` is.
  } else if (b.action === 'crouch' || b.action === 'rear' || b.action === 'pounce') {
    await sidestep(cx, cz, 4.0);          // charge telegraph — get off the lane
  } else if (b.action === 'charge') {
    await d.tap('Space');                 // airborne clears the charge
    await sidestep(cx, cz, 4.5);
  } else {
    // prowl / stalk: keep a ~3.5u standoff (out of swipe range, biases him to
    // charge -> a tired window) — do not chase into the paw.
    if (dist < 3.0) await backOff(cx, cz, 3.0);
    else if (dist > 5.0) await d.walkTo(cx, cz + 3.5, { timeout: 1.2, arrive: 1.5 });
  }
  if (b.hp !== lastHp) { say(`hp ${lastHp} -> ${b.hp} [${b.action}] elem ${ELEMS[elemIdx % ELEMS.length]}`); lastHp = b.hp; }
}

const flags = await d.page.evaluate(() => ({
  grimm: !!window.__game.state.flags.grimmFreed,
  grimmHp: window.__game.state.flags.grimmHp,
  gameComplete: !!window.__game.state.flags.gameComplete,
}));
say('FLAGS:', JSON.stringify(flags));
say('SEEN:', JSON.stringify({ actions: [...seen.actions], deaths: seen.deaths, respawns: seen.respawns, hits: seen.hits, rotations: seen.rotations }));
await d.shot('post');

// THE END. Grimm is FREED (grimmFreed + gameComplete). The ending runs ~27s of
// narration then rollCredits; the #credits overlay blocks POINTER only, so wait
// it out on the keyboard-driven clock, then dismiss credits with a tap.
let complete = false;
if (flags.grimm) {
  say('  Grimm freed — waiting out the ending cinematic (~30s)');
  await d.page.waitForTimeout(31000 / TS);
  complete = await d.page.evaluate(() => !!window.__game.state.flags.gameComplete);
  const credits = await d.page.evaluate(() => { const el = document.getElementById('credits'); return el ? getComputedStyle(el).display !== 'none' : false; });
  say('  gameComplete:', complete, '· credits overlay shown:', credits);
  if (credits) { await d.page.locator('#credits').dispatchEvent('pointerdown').catch(() => {}); say('  tapped the credits closed'); }
  await d.shot('ending');
}
say('music:', await d.wk('music'));
d.saveLog('grimm');
const won = flags.grimm && complete;
say(won ? `SHADOW-GRIMM FREED at ${TS}x — the Court wakes, the game is complete` : 'NOT COMPLETE');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
