// SHADOW-GRIMM — the last fight (boss.js SKINS.grimm, Shadowgrip class). 32 hp,
// 1.1x, saveKey grimmHp. Same action machine. HIS ARMOUR (boss._resists):
//   hp <= 16      -> resists STEEL and MOON: knight, dark_wolf, ghost_wolf all
//                    do NOTHING. Fight with an ELEMENTAL form.
//   hp <= ~10.67  -> ALSO resists the LAST element that hit him -> ROTATE the
//                    elemental form every landed hit.
// Strategy: always attack from an elemental form; if a hit does NOT drop his
// hp (a BLOCKED/resisted swing), rotate to the next element and try again.
// He is FREED, not killed; the ending is a 27s cinematic (keyboard unaffected;
// the #credits overlay only blocks POINTER input — we tap it once at the end).
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '1');
const DIR = `test-evidence/level-7/grimm${TS !== 1 ? '-' + TS + 'x' : ''}`;
const d = await launch({ evidenceDir: DIR, timescale: TS });
const say = (...a) => console.log(...a);

await d.newGame('ARIA');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.borealDefeated = true;
  g.WS.set('storm', 'vanesTurned', true);
});
await d.jump('scr', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf']);
await d.page.evaluate(() => { window.__game.state.form = 'storm_wolf'; });
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking,
  null, { timeout: 30000 }).catch(() => {});
say('crown:', JSON.stringify(await d.wk()), 'timescale', TS);
await d.shot('crown');

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
  if (s.room !== 'scr') {
    const won = await d.page.evaluate(() => !!window.__wk.flags.grimmFreed);
    if (won) { say('DEFEATED (left the crown after kill)'); break; }
    const door = (await d.wk('doors')).find((x) => x.to === 'scr');
    if (door) await d.walkTo(door.x, door.z, { timeout: 30 });
    await d.page.evaluate(() => { window.__game.state.form = 'storm_wolf'; });
    continue;
  }
  const b = s.boss;
  if (!b) {
    const won = await d.page.evaluate(() => !!window.__wk.flags.grimmFreed);
    if (won) { say('DEFEATED'); break; }
    await d.page.waitForTimeout(500); continue;
  }
  if (b.hp <= 0 && (await d.page.evaluate(() => !!window.__wk.flags.grimmFreed))) {
    say('DEFEATED (corpse dissolving)'); break;
  }
  seen.actions.add(b.action);
  if (s.hearts <= 0.5 && lastHearts > 0.5) {
    seen.deaths++; say(`DEATH #${seen.deaths} [hp ${b.hp} action ${b.action}]`);
    await d.page.waitForTimeout(4500 / TS);
    seen.respawns.push(await d.wk('room'));
    await d.page.evaluate(() => { window.__game.state.form = 'storm_wolf'; });
  }
  lastHearts = s.hearts;
  if (s.hearts <= 2 && s.hearts > 0.5) await d.tap('h');

  const dx = b.x - s.pos.x, dz = b.z - s.pos.z;
  const dist = Math.hypot(dx, dz);
  if (b.action === 'windup' || b.action === 'swipe') {
    await d.holdShield(1000 / TS);
  } else if (b.action === 'crouch' || b.action === 'charge') {
    // out of the red lane — DASH perpendicular (her gales cannot stop it)
    const px = -dz / (dist || 1), pz = dx / (dist || 1);
    const side = ((s.pos.x * pz - s.pos.z * px) > 0) ? 1 : -1;
    const tx = Math.max(-7, Math.min(7, s.pos.x + px * 4 * side));
    const tz = Math.max(-9, Math.min(9, s.pos.z + pz * 4 * side));
    await aim(tx, tz);
    await d.tap('k');
    seen.dashes++;
    await d.page.waitForTimeout(400 / TS);
  } else if (b.action === 'tired') {
    if (dist > 1.6) await d.walkTo(b.x, b.z, { timeout: 2, arrive: 1.3 });
    else {
      // attack from an ELEMENTAL form; if the hit was resisted (hp unchanged),
      // rotate the element — this satisfies both of Grimm's armour phases.
      const before = b.hp;
      await form(ELEMS[elemIdx % ELEMS.length]);
      const k = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'd' : 'a') : (dz > 0 ? 's' : 'w');
      await d.page.keyboard.down(k); await d.page.waitForTimeout(120); await d.page.keyboard.up(k);
      await d.tap('j'); await d.page.waitForTimeout(220 / TS); await d.tap('j');
      await d.page.waitForTimeout(200 / TS);
      const after = (await d.wk()).boss;
      if (after && after.hp >= before - 0.01) { elemIdx++; say(`  BLOCKED at hp ${before} in ${ELEMS[(elemIdx - 1) % ELEMS.length]} — rotating`); }
    }
  } else {
    if (dist > 2.4) await d.walkTo(b.x, b.z, { timeout: 1.5, arrive: 2 });
    else { await form(ELEMS[elemIdx % ELEMS.length]); await d.tap('j'); await d.page.waitForTimeout(200 / TS); }
  }
  if (b.hp !== lastHp) { say(`hp ${lastHp} -> ${b.hp} [${b.action}]`); lastHp = b.hp; }
}

const flags = await d.page.evaluate(() => ({
  grimm: !!window.__wk.flags.grimmFreed,
  grimmHp: window.__game.state.flags.grimmHp,
}));
say('FLAGS:', JSON.stringify(flags));
say('SEEN:', JSON.stringify({ actions: [...seen.actions], deaths: seen.deaths, respawns: seen.respawns, dashes: seen.dashes }));
await d.shot('post');

// THE END. Grimm is FREED (grimmFreed + gameComplete). The ending runs ~27s
// of narration then rollCredits; the #credits overlay blocks POINTER only, so
// wait it out on the keyboard-driven clock, then dismiss credits with a tap.
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
say(won ? `ARIA FREED at ${TS}x — the gale drops off the crown` : 'NOT COMPLETE');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(won && d.errors.length === 0 ? 0 : 1);
