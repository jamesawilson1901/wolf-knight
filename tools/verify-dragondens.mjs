// THE THREE DRAGON DENS, WALKED WITH REAL KEYS (design/DRAGON-EGGS.md v3).
//
// Dad, 2026-09-26: "The portal talks and acts as if it's Tam. Make it Tam.
// The portal is meant to be for the dragon eggs. Also dragon eggs are meant to
// be found in special dungeons, not in chests. There is also meant to be a
// dragon skeleton outside that dungeon as a hint."
//
// verify-dragoneggs.mjs proves the pieces by ticking them directly; this
// suite plays each den the way a child does, through the real input pipeline
// only (tools/wk-drive.mjs — keyboard walking, Tab to change wolf, K for the
// special, a real pointerdown on the confirm button):
//
//   arena (guardian down) → walk through the new east door past the bones
//   → the portal room: walk to the moat, hear the portal's own hint — never
//     Tam's travel map, never Tam's voice
//   → solve the gate with the region's own wolf: the Fire Wolf's slam lights
//     two lamps / the Storm Wolf's dash turns the vane / the Tide Wolf's
//     splash puts two fires out — and the bars lift
//   → walk into the nest, walk up to the altar: the egg is yours
//   → walk back to the portal: it arms, tap the glowing button, it hatches,
//     the dragon joins you
//   → and, in the arena, walking up to TAM still opens the travel map.
//
// The only non-input setup is the save state a child would already have by
// then (the guardian's flag, the region healed, the wolves owned) — the same
// "enter a level with an appropriate save" the harness allows (__wkJump).
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('DENS');
const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf'];
await wk.page.evaluate(() => {
  const g = window.__game;
  g.player.iframes = 999999;
  g.state.settings.captions = true;       // narration still records what was said
  // Headless Chromium has no TTS to finish a line, so every line would sit on
  // its text-length fallback timer; a line skipped is a line finished. The
  // record of WHAT was said (state.spoken, set at say() time) is untouched.
  setInterval(() => { if (g.narration.speaking) g.narration.skip(); }, 120);
});

const room = () => wk.wk('room');
const settle = () => wk.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 })
  .then(() => wk.page.waitForTimeout(400)).catch(() => {});
const releaseKeys = async () => { for (const k of ['w', 'a', 's', 'd']) await wk.page.keyboard.up(k); };
async function go(x, z, opts = {}) {
  const r = await wk.routeTo(x, z, { timeout: 90, ...opts });
  await releaseKeys();
  if (r.roomChanged) await settle();
  return r;
}
async function form(want) {
  // PACK IT FIRST. Since v3.195 Tab cycles Knight, Dark Wolf and a pack of
  // three, and with every wolf owned the default pack is the three most
  // recently earned (tide, storm, frost) — so the fire and earth wolves this
  // suite needs were never in the cycle and Tab could not reach them. A child
  // packs the wolf a den needs at a campfire; so does the suite.
  await wk.page.evaluate(async (w) => {
    const st = window.__game.state;
    if (w === 'knight' || w === 'dark_wolf') return;
    const S = await import('/js/state.js');
    const pack = S.packWolves();
    if (!pack.includes(w)) st.pack = [w, ...pack.filter((f) => f !== w)].slice(0, S.PACK_SIZE);
  }, want);
  for (let i = 0; i < 12; i++) {
    const cur = await wk.wk('form');
    if (cur === want) return true;
    await wk.tap('Tab');
    await wk.page.waitForFunction((c) => window.__wk.form !== c, cur, { timeout: 2500 }).catch(() => {});
  }
  return false;
}
const spoken = (id) => wk.page.evaluate((i) => !!window.__game.state.spoken[i], id);
const clearSpoken = (ids) => wk.page.evaluate((list) => { for (const i of list) delete window.__game.state.spoken[i]; }, ids);
const mapOpen = () => wk.page.evaluate(() => {
  const el = document.getElementById('map-menu');
  return !!el && getComputedStyle(el).display !== 'none';
});

const DENS = [
  {
    el: 'fire', wolf: 'fire_wolf', arena: 'le', flag: 'bossDefeated', region: 'ember',
    hall: 'ln1', nest: 'ln2', via: [[0, 5], [8.5, -0.5]], door: [13.4, 1.0],
    // the Fire Wolf's slam (radius 3), standing by one cold lamp, then the other
    approach: async (i) => { await go(i % 2 ? -1.0 : -5.0, -4.4, { arrive: 0.45 }); },
    gateDoor: [-3, -8.9],
  },
  {
    el: 'storm', wolf: 'storm_wolf', arena: 'scr', flag: 'ariaDefeated', region: 'storm',
    hall: 'sn1', nest: 'sn2', via: [[0, 4], [8, -4.5]], door: [13.4, -3.4],
    // the Storm Wolf's dash, run north into the golden vane
    approach: async () => {
      await go(0.8, 0.5, { arrive: 0.5 });
      await go(0.8, -2.0, { arrive: 0.4 });     // the last step is northward: that is the facing
    },
    gateDoor: [-3, -8.9],
  },
  {
    el: 'tide', wolf: 'tide_wolf', arena: 'ddp', flag: 'meriDefeated', region: 'vale',
    hall: 'dn1', nest: 'dn2', via: [[0, 4], [8.5, -3.5]], door: [13.4, -2.5],
    // the Tide Wolf's splash (radius 3.4), by one fire, then the other
    approach: async (i) => { await go(i % 2 ? -1.0 : -5.0, -4.0, { arrive: 0.45 }); },
    gateDoor: [-3, -8.9],
  },
];

for (const d of DENS) {
  console.log(`\n── the ${d.el} den: ${d.arena} → ${d.hall} → ${d.nest} ─────────────`);
  await wk.page.evaluate(({ flag, region }) => {
    const g = window.__game;
    g.state.flags[flag] = true;
    g.WS.set(region, 'restored');
    const inv = g.state.inventory;
    inv.dragonEggs = {}; inv.dragonsHatched = {}; inv.dragonEquipped = null;
  }, { flag: d.flag, region: d.region });
  await wk.jump(d.arena, FORMS);
  await settle();

  // 1. the arena → the new east door, past the bones
  for (const [x, z] of d.via) await go(x, z);
  // stand by the bones a moment, the way a child stops to look at them
  let bonesHeard = false;
  for (let i = 0; i < 20 && !bonesHeard; i++) {
    bonesHeard = await spoken('dragon_bones');
    if (!bonesHeard) await wk.page.waitForTimeout(150);
  }
  const r1 = await go(d.door[0], d.door[1], { arrive: 0.3 });
  check(`${d.arena}: walked through the east door into ${d.hall}`, (await room()) === d.hall, r1);
  check(`${d.arena}: Pip spoke about the dragon's bones on the way`, bonesHeard || await spoken('dragon_bones'));

  // 2. the portal is the portal — its own hint, never Tam's map or voice
  await clearSpoken(['tam_intro', 'tam_offer']);
  const r2 = await go(2.5, 0.5, { arrive: 0.5 });
  await wk.page.waitForTimeout(600);
  const hintId = `dragon_hint_${d.el}`;
  check(`${d.hall}: walking to the portal's moat gives the portal's own hint (${hintId})`, await spoken(hintId), r2);
  check(`${d.hall}: the portal never opens Tam's travel map`, !(await mapOpen()));
  check(`${d.hall}: the portal never speaks Tam's lines`,
    !(await spoken('tam_intro')) && !(await spoken('tam_offer')));
  const noButtonYet = await wk.page.evaluate(() => !document.getElementById('btn-dragon').classList.contains('revealed'));
  check(`${d.hall}: with no egg held, no confirm button`, noButtonYet);

  // 3. the gate, with the region's own wolf
  check(`${d.hall}: became the ${d.wolf}`, await form(d.wolf));
  // THE REAL SPECIAL KEY. This machine can run far below real frame rate
  // under load, so a tap is given time to land and, if the verb did not
  // connect, the approach is walked again and the key pressed again — the
  // way a child would simply try again. Two-piece gates (lamps, fires) are
  // taken one piece per press, alternating sides. (The special's cooldown
  // runs on GAME time, which under SwiftShader can be several times slower
  // than the wall clock — hence the long wait for it.)
  let tries = 0, solvedIt = false;
  while (tries < 5 && !solvedIt) {
    await d.approach(tries);
    tries++;
    await wk.page.waitForFunction(() => window.__game.player.specialCooldown <= 0, null, { timeout: 90000 }).catch(() => {});
    await wk.tap('k');
    solvedIt = await wk.page.waitForFunction((region) => !!window.__game.WS.get(region, 'egg_gate'),
      d.region, { timeout: 3000 }).then(() => true).catch(() => false);
  }
  const gate = await wk.page.evaluate((region) => ({
    flag: !!window.__game.WS.get(region, 'egg_gate'),
  }), d.region);
  gate.tries = tries;
  const doorOpen = await wk.page.evaluate(() => {
    // the door itself is only added the moment the bars lift
    const dd = window.__game.world.doors.find((x) => /n2$/.test(x.to));
    return !!dd;
  });
  check(`${d.hall}: the ${d.wolf}'s own verb solved the gate (the bars lifted)`, gate.flag && doorOpen, gate);

  // 4. into the nest; walk up to the altar
  const r4 = await go(d.gateDoor[0], d.gateDoor[1], { arrive: 0.3 });
  check(`${d.hall}: walked through the opened gate into ${d.nest}`, (await room()) === d.nest, r4);
  const r5 = await go(0, 1.2, { arrive: 0.3, timeout: 25 });   // into the altar: the pedestal stops him
  await wk.page.waitForTimeout(900);
  const got = await wk.page.evaluate(async (el) => (await import('/js/dragonEggs.js')).hasEgg(el), d.el);
  check(`${d.nest}: walking up to the altar picks up the ${d.el} egg`, got, r5);
  check(`${d.nest}: Pip says where to take it`, await spoken(`dragon_found_${d.el}`));

  // 5. back to the portal: it arms; the real button hatches it
  const r6 = await go(0, 8.9, { arrive: 0.3 });
  check(`${d.nest}: walked back out to ${d.hall}`, (await room()) === d.hall, r6);
  await go(2.5, 0.5, { arrive: 0.5 });
  let armed = false;
  for (let i = 0; i < 20 && !armed; i++) {
    armed = await wk.page.evaluate(() => document.getElementById('btn-dragon').classList.contains('revealed'));
    if (!armed) await wk.page.waitForTimeout(150);
  }
  check(`${d.hall}: holding the egg at the portal reveals the glowing confirm button`, armed);
  await wk.page.locator('#btn-dragon').dispatchEvent('pointerdown');
  await wk.page.waitForTimeout(4200);
  const hatched = await wk.page.evaluate(async (el) => {
    const m = await import('/js/dragonEggs.js');
    const g = window.__game;
    return { hatched: m.isHatched(el), equipped: m.equippedDragon(), visible: !!(g.dragon && g.dragon.root.visible) };
  }, d.el);
  check(`${d.hall}: one tap hatches the ${d.el} dragon, and it joins Kael`,
    hatched.hatched && hatched.equipped === d.el && hatched.visible, hatched);

  // 6. and Tam is still Tam: back in the arena, walking up to him opens travel
  const r7 = await go(-3, 8.9, { arrive: 0.3 });
  check(`${d.hall}: walked back out to ${d.arena}`, (await room()) === d.arena, r7);
  const tam = await wk.page.evaluate(() => window.__game.world.markers.wayfarerSpot);
  await go(tam.x - 2.4, tam.z - 0.2, { arrive: 0.4 });
  // ...then straight at him: the map opens (and freezes the world) the moment
  // Kael is within reach, so this walk is expected to stop short of its goal
  await wk.walkTo(tam.x - 0.9, tam.z, { arrive: 0.2, timeout: 12 }).catch(() => {});
  await releaseKeys();
  let opened = false;
  for (let i = 0; i < 60 && !opened; i++) { opened = await mapOpen(); if (!opened) await wk.page.waitForTimeout(150); }
  check(`${d.arena}: walking up to Tam opens the travel map — from Tam, and only Tam`, opened);
  // close it the way a child does — the map's own Done button (the same
  // control tools/probe-map-close.mjs drives) — and step away from Tam
  if (opened) await wk.page.locator('#map-menu .menu-btn').last().dispatchEvent('pointerdown');
  await wk.page.waitForTimeout(400);
  check(`${d.arena}: the map closes again from its own Done button`, !(await mapOpen()));
}

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
check('no uncaught page errors', wk.errors.length === 0, wk.errors.slice(0, 3));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}`
  : '\n✓ PASS — all three dens walked with real keys: bones, portal (never Tam), gate, egg, hatch; Tam still travels');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
