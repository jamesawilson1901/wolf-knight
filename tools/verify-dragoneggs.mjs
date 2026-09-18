// DRAGON EGGS & GRAND ELEMENTAL SHRINES (design/DRAGON-EGGS.md) — a hidden
// pickup finds its way into state.inventory.dragonEggs, a shrine gives only
// the generic Pip hint while the wrong egg (or no egg) is held, arms a
// visual confirm button (never auto-throwing) once the MATCHING egg is
// found, a completed throw hatches the dragon and marks the egg permanently
// spent, equipping a hatched dragon from the backpack makes it follow the
// player and bite a forced-into-range enemy for real damage, swapping the
// equipped dragon works, and all three fields survive a real save/load round
// trip (additive-forever — a save from before this system existed must
// still load). Ticked via direct world.updateDragonShrines()/
// CompanionDragon#update() calls in synchronous page.evaluate() blocks
// rather than real animation frames or real waits — this session's own
// established lesson (design/MINING.md, design/DEN-REBUILD.md): the real
// render loop's own !transitioning/!narration.blocking gates can add real
// wall-clock delay for reasons unrelated to the mechanic under test.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// Real narration lines and the real per-frame render loop are BOTH live
// while this suite's real #btn-dragon click drives an actual EMERGE_DELAY_MS
// wait — unlike every other check in this suite (ticked directly, no real
// waits), this ONE section deliberately waits on real time because the
// delay IS the behaviour under test. That means a real, non-repeat
// narration.say() (the shrine's own confirm/hatch lines) can race the real
// per-frame loop into blocking it at any point during that wait — on a real
// device the line simply finishes speaking within a couple of seconds
// regardless, well inside the delays this feature already uses, so draining
// it deterministically reaches that same real eventual state rather than
// depending on which side of a timing race one particular run landed on. A
// single skip() only promotes the NEXT queued line to speaking (queues can
// be several deep after force-setting a story flag directly, as this suite
// does) and a fresh one can start between one poll and the next, so this
// polls repeatedly rather than draining once and hoping nothing else queues
// behind it.
async function waitQuiet(maxMs = 2500) {
  const start = Date.now();
  let quietStreak = 0;
  while (Date.now() - start < maxMs && quietStreak < 3) {
    const speaking = await wk.page.evaluate(() => {
      const n = window.__game.narration;
      if (n.speaking) n.skip();
      return n.speaking;
    });
    quietStreak = speaking ? 0 : quietStreak + 1;
    await wk.page.waitForTimeout(80);
  }
}

const wk = await launch({ timescale: 1 });
await wk.newGame('DRAGONPROBE');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

// Reach the fire shrine (js/level1.js buildLe, "Heart of the Hollow") —
// gated on the region's own boss flag, the same "the story earned it" law
// js/level5.js buildScr / js/level6.js buildDdp already use for their own
// post-boss memorials, so it is set directly here rather than fought for.
await wk.page.evaluate(() => { window.__game.state.flags.bossDefeated = true; });
await wk.page.evaluate(() => window.__wkJump('le', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'le' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
// `le`'s own fast-travel spot sits close enough to the shrine's own (6,9)
// that teleporting the player there for these checks also satisfies the
// travel spot's own proximity trigger (js/main.js), which pops the map
// menu open (menuPaused=true) and freezes the very per-frame code — real
// input never causes this collision (walking in normally never lands
// exactly on both at once), but a test that teleports straight to (6,9)
// does. The exact same hazard `tools/shot-dragoneggs.mjs`'s own screenshot
// pass already found and stripped for this identical reason.
await wk.page.evaluate(() => { delete window.__game.world.markers.travelSpot; delete window.__game.world.markers.shopSpot; });
// `le`'s own room-arrival narration is already "speaking" the instant it
// loads, and headless Chromium has no real TTS to ever finish a line on its
// own — it would sit narration.blocking=true forever otherwise, freezing
// the very world.updateDragonShrines()/#btn-dragon.revealed/
// #caption.big-cover per-frame code this suite's later real-button section
// depends on. Forcing state.flags.bossDefeated directly (above) — rather
// than earning it through real play — queues MULTIPLE story beats back to
// back (confirmed directly: three, in a row) rather than the one a normal
// playthrough would ever see at once, so a SINGLE skip() only promotes the
// next queued line to "speaking" instead of actually quieting anything.
// Drain the whole queue, not just the current line — this session's own
// established lesson (design/MINING.md et al.): skip incidental narration
// from test SETUP rather than let it masquerade as a bug in the mechanic
// under test.
await waitQuiet();

// 1. the room really seeded exactly one fire dragon shrine.
const seeded = await wk.page.evaluate(() => {
  const w = window.__game.world;
  return { count: (w.dragonShrines || []).length,
    elements: (w.dragonShrines || []).map((s) => s.element) };
});
check('le seeds exactly one fire dragon shrine', seeded.count === 1 && seeded.elements[0] === 'fire', seeded);

// 1b. THE SHRINE VISUAL (v2 revision) — a real portal model, not the old
// light-only spiritShrine(), with its own disk material recoloured to the
// element's tint (the stone frame/moss/root stay whatever colour the
// vendored asset shipped with — only the disk mesh, 'PortalDisk', should
// ever change), plus a moat ring around it.
const visual = await wk.page.evaluate(() => {
  const s = window.__game.world.dragonShrines[0];
  let diskColor = null, diskMatCount = 0, frameMatCount = 0;
  s.portalRoot.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    if (n.material.name === 'PortalDisk') { diskColor = n.material.color.getHex(); diskMatCount++; }
    if (n.material.name === 'PortalFrame') frameMatCount++;
  });
  return {
    hasPortal: !!s.portalRoot, hasMoat: !!s.moatRing,
    diskColor, diskMatCount, frameMatCount,
    moatColor: s.moatRing.material.color.getHex(),
  };
});
check('the shrine is a real portal model (portalRoot exists)', visual.hasPortal, visual);
check("the portal's disk is recoloured to the fire tint (0xff5a2b), on its own material",
  visual.diskColor === 0xff5a2b && visual.diskMatCount === 1, visual);
check("the stone frame is a SEPARATE material from the disk (never repainted)",
  visual.frameMatCount >= 1, visual);
check('the shrine has a moat ring around it', visual.hasMoat, visual);

// 2. approaching WITHOUT any egg fires only the generic hint — never arms
// the confirm, and a tap on the (unrevealed) button does nothing.
const noEgg = await wk.page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const s = w.dragonShrines[0];
  g.player.root.position.x = s.x; g.player.root.position.z = s.z;
  w.updateDragonShrines(0.016, 0, g.player);
  return { event: w.dragonShrineEvent, armed: w.dragonPromptElement, confirmResult: w.confirmDragonThrow() };
});
check('approaching the shrine with no egg fires only the generic hint, never arms the confirm',
  noEgg.event && noEgg.event.type === 'hint' && !noEgg.armed, noEgg);
check('tapping confirm with nothing armed does nothing', noEgg.confirmResult === null, noEgg);

// 3. holding the WRONG element's egg (tide, at the FIRE shrine) behaves
// exactly like holding none — same generic hint, never confirms. This is
// "approach the wrong shrine" in miniature: a shrine never distinguishes
// "no egg" from "the wrong egg" before the right one shows up.
const wrongEgg = await wk.page.evaluate(async () => {
  const d = await import('/js/dragonEggs.js');
  const g = window.__game;
  const w = g.world;
  const s = w.dragonShrines[0];
  d.addEgg('tide');
  g.player.root.position.x = s.x + 20; g.player.root.position.z = s.z; // step away first —
  w.updateDragonShrines(0.016, 0, g.player);                          // the hint/confirm is edge-triggered
  g.player.root.position.x = s.x; g.player.root.position.z = s.z;      // — so re-approaching fires it again
  w.updateDragonShrines(0.016, 0, g.player);
  return { event: w.dragonShrineEvent, armed: w.dragonPromptElement };
});
check("holding a DIFFERENT element's egg at the fire shrine is treated the same as holding none",
  wrongEgg.event && wrongEgg.event.type === 'hint' && !wrongEgg.armed, wrongEgg);

// 4. holding the MATCHING egg arms the confirm (the visual/button prompt) —
// but standing there does NOT throw it by itself.
const rightEgg = await wk.page.evaluate(async () => {
  const d = await import('/js/dragonEggs.js');
  const g = window.__game;
  const w = g.world;
  const s = w.dragonShrines[0];
  d.addEgg('fire');
  g.player.root.position.x = s.x + 20; g.player.root.position.z = s.z;
  w.updateDragonShrines(0.016, 0, g.player);
  g.player.root.position.x = s.x; g.player.root.position.z = s.z;
  w.updateDragonShrines(0.016, 0, g.player);
  // stand there a while longer — no auto-throw no matter how many ticks pass
  for (let i = 0; i < 30; i++) w.updateDragonShrines(0.1, i * 0.1, g.player);
  return { event: w.dragonShrineEvent, armed: w.dragonPromptElement, hatchedYet: d.isHatched('fire') };
});
check('holding the matching egg arms the confirm button (world.dragonPromptElement)',
  rightEgg.armed === 'fire', rightEgg);
check('the egg is NOT auto-thrown merely by standing at the shrine, however long',
  rightEgg.hatchedYet === false, rightEgg);

// 5. THE REAL BUTTON, through the whole v2 sequence (design/DRAGON-EGGS.md)
// — a real #btn-dragon pointerdown, not a direct confirmDragonThrow() call,
// so this exercises main.js's own click handler: the state flips
// immediately (hatched, auto-equipped, egg spent, a second tap does
// nothing), but the COMPANION does not appear until EMERGE_DELAY_MS later,
// at the SHRINE's position (dad: "the baby dragon after a few seconds
// jumps out"), and #caption wears '.big-cover' for the whole wait (dad:
// "use the pop up question to cover up the player... no throwing animation
// needed"). A real wait for the real delay — this is the ACTUAL designed
// behaviour under test, not a workaround for render-loop timing noise the
// way this session's other suites avoid waiting on animation frames.
await wk.page.locator('#btn-dragon').dispatchEvent('pointerdown');
// A SHORT, FIXED wait — deliberately NOT waitQuiet() here. waitQuiet()'s own
// polling loop can itself eat unpredictable real time (up to ~2.5s draining
// a stubborn queue), and this specific check needs to land WELL inside the
// 2200ms EMERGE_DELAY_MS window — using a variable-length wait to get there
// risks overshooting it and catching the dragon already emerged, which is
// exactly the flake this rewrite is fixing. None of these three assertions
// depend on narration or the real per-frame loop at all (state.inventory
// flips and dragon.root.visible are read directly), so a short fixed wait
// is both sufficient and safe here.
await wk.page.waitForTimeout(150);
const immediate = await wk.page.evaluate(async () => {
  const d = await import('/js/dragonEggs.js');
  const g = window.__game;
  return {
    hatched: d.isHatched('fire'), equipped: g.state.inventory.dragonEquipped,
    secondThrow: g.world.confirmDragonThrow(),
    dragonVisibleYet: g.dragon ? g.dragon.root.visible : false,
  };
});
check('the state flips the instant the button is tapped: hatched + auto-equipped',
  immediate.hatched && immediate.equipped === 'fire', immediate);
check('a second confirmDragonThrow() call does nothing — no wasting a second throw',
  immediate.secondThrow === null, immediate);
check('the companion is NOT visible yet — it is still "in the moat", covered by the popup',
  !immediate.dragonVisibleYet, immediate);

// world.dragonPromptElement/#caption.big-cover are ONLY ever refreshed by
// the REAL per-frame render loop (js/main.js), which the shrine's own
// non-repeat confirm line can freeze for as long as it is "speaking" —
// exactly the real, load-bearing "a hint never hides an incoming attack"
// law this whole game runs on, not a bug. Rather than race that freeze with
// a fixed wait, call the SAME exported function directly (the same thing
// the render loop itself would call, the moment it is next allowed to)
// to observe the deterministic result of the state change without
// depending on when — or whether — narration happens to be blocking it at
// the instant this check runs.
const disarmed = await wk.page.evaluate(() => {
  const g = window.__game;
  g.world.updateDragonShrines(0.016, 0, g.player);
  return { armedAfter: g.world.dragonPromptElement };
});
check('the confirm disarms itself the instant the egg is spent', !disarmed.armedAfter, disarmed);

// #caption.big-cover DOES need the real per-frame loop to have actually
// ticked at least once — poll for it rather than pick one fixed instant,
// since exactly when narration.blocking allows that next tick through is
// real wall-clock timing this suite does not control.
let sawBigCover = false;
for (let i = 0; i < 15 && !sawBigCover; i++) {
  sawBigCover = await wk.page.evaluate(() =>
    document.getElementById('caption').classList.contains('big-cover'));
  if (!sawBigCover) await wk.page.waitForTimeout(100);
}
check("#caption wears '.big-cover' at some point during the wait — this IS the cover-the-player popup",
  sawBigCover, { sawBigCover });

await wk.page.waitForTimeout(4000); // EMERGE_DELAY_MS (2200) + EMERGE_RISE_TIME (900) + the 100ms gap before the hatch line + buffer
// The confirm line's own text-length-based fallback timer (js/narration.js
// — real TTS never runs in headless Chromium to finish it early) can run
// well past this suite's whole window, so it is very likely STILL
// "speaking" here — real, and by design (the confirm line does pause the
// game deliberately), but it means the per-frame loop has had zero chances
// to apply dragonEmerging's own already-cleared value to '.big-cover' the
// whole time. On a real device the SAME line finishes speaking for real
// after a few seconds, well before a child would still be looking at this
// screen — actively skip()ping it here reaches that real eventual point
// deterministically rather than depending on whether this run's confirm
// line happened to be short enough to have already finished on its own.
await waitQuiet();
const emerged = await wk.page.evaluate(() => {
  const g = window.__game;
  const s = g.world.dragonShrines[0];
  return {
    visible: g.dragon ? g.dragon.root.visible : false,
    x: g.dragon ? g.dragon.x : null, z: g.dragon ? g.dragon.z : null,
    shrineX: s.x, shrineZ: s.z,
    bigCover: document.getElementById('caption').classList.contains('big-cover'),
  };
});
check('the companion appears AT THE SHRINE once the delay elapses ("jumps out of the portal")',
  emerged.visible && emerged.x === emerged.shrineX && emerged.z === emerged.shrineZ, emerged);
check("'.big-cover' clears once the dragon has actually emerged", !emerged.bigCover, emerged);

// 6. hatch a second dragon directly (storm) and prove the equip rules: you
// can swap to any HATCHED dragon, but never to one merely found (the tide
// egg from step 3 was found, never thrown).
const swap = await wk.page.evaluate(async () => {
  const d = await import('/js/dragonEggs.js');
  d.addEgg('storm'); d.hatchEgg('storm');
  const swapped = d.setEquippedDragon('storm');
  const afterSwap = d.equippedDragon();
  const rejected = d.setEquippedDragon('tide'); // found in step 3, never hatched
  return { swapped, afterSwap, rejected, stillStorm: d.equippedDragon(),
    hatchedList: d.hatchedDragons().sort() };
});
check('setEquippedDragon swaps to a different hatched dragon', swap.swapped && swap.afterSwap === 'storm', swap);
check('setEquippedDragon refuses an egg that was found but never hatched',
  swap.rejected === false && swap.stillStorm === 'storm', swap);
check('hatchedDragons() lists exactly the two thrown so far',
  JSON.stringify(swap.hatchedList) === JSON.stringify(['fire', 'storm']), swap);

// 7. THE BACKPACK UI — a real DOM click, not just the underlying functions.
// The Dragons tab must now exist (a dragon has hatched) and swapping the
// equipped dragon there must actually change state.inventory.dragonEquipped.
await wk.page.locator('#inv-btn').dispatchEvent('pointerdown');
await wk.page.waitForSelector('#inv-menu', { state: 'visible' });
const tabs = await wk.page.$$('.arm-tab');
let dragonsTab = null;
for (const t of tabs) { if ((await t.textContent()).includes('Dragons')) dragonsTab = t; }
check('a Dragons tab appears in the backpack once a dragon has hatched', !!dragonsTab);
if (dragonsTab) {
  await dragonsTab.dispatchEvent('pointerdown');
  await wk.page.waitForTimeout(50);
  const rowsBefore = await wk.page.evaluate(() => [...document.querySelectorAll('#inv-menu .rack-row')]
    .map((r) => ({ name: r.querySelector('.rack-name').textContent, on: r.classList.contains('on') })));
  check('the Dragons tab lists exactly the two hatched dragons plus a "None" row, Storm currently worn',
    rowsBefore.length === 3 && rowsBefore.some((r) => r.name.includes('Storm') && r.on), rowsBefore);
  // tap the Ember row to swap back to fire through the real UI
  const emberRow = (await wk.page.$$('#inv-menu .rack-row'))[
    rowsBefore.findIndex((r) => r.name.includes('Ember'))];
  await emberRow.dispatchEvent('pointerdown');
  await wk.page.waitForTimeout(50);
  const equippedAfterClick = await wk.page.evaluate(() => window.__game.state.inventory.dragonEquipped);
  check('tapping a hatched dragon\'s row in the real backpack UI equips it',
    equippedAfterClick === 'fire', { equippedAfterClick });
}
await wk.page.locator('#pause-close, .arm-foot').first().evaluate(() => {}).catch(() => {});
await wk.page.evaluate(() => { const el = document.getElementById('inv-menu'); if (el) el.style.display = 'none'; });

// 8. THE COMPANION — a real room with real enemies (lc, Cinder Bridges,
// the same room design/MINING.md's own suite already uses for this reason).
// Directly instantiate CompanionDragon (design/DRAGON-EGGS.md), the same
// "tick the class, not the render loop" idiom design/MINING.md's own suite
// documents, rather than wait on main.js's per-frame wiring.
await wk.page.evaluate(() => window.__wkJump('lc', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'lc' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });

const companion = await wk.page.evaluate(async () => {
  const { CompanionDragon } = await import('/js/companionDragon.js');
  const g = window.__game;
  const w = g.world;
  const px = g.player.root.position.x, pz = g.player.root.position.z;
  const dragon = new CompanionDragon();
  await dragon.load('fire');
  dragon.root.visible = true;

  // FOLLOW, in isolation — `world` deliberately omitted (the class falls
  // back to unresolved movement, js/companionDragon.js's own `world ? ... :
  // ...`), so this is pure AI math rather than a bet on this particular
  // room's own geometry: starts 6u from Kael, ticks toward him the way
  // Pip's own follow idiom (js/pip.js) already does.
  dragon.place(px + 6, pz);
  const distBefore = Math.hypot(dragon.x - px, dragon.z - pz);
  for (let i = 0; i < 30; i++) dragon.update(0.1, i * 0.1, g.player, null);
  const distAfterFollow = Math.hypot(dragon.x - px, dragon.z - pz);

  // ATTACK: force a real, live enemy right next to KAEL (guaranteeing it is
  // within hunting range regardless of room layout), and the dragon itself
  // right there too, then run it against the real world for a real
  // Enemy#takeDamage hit.
  dragon.place(px + 1, pz);
  const foe = w.enemies.find((e) => !e.dead && !e.scenery);
  // Enemy#x/#z are READ-ONLY getters onto root.position (js/enemies.js) —
  // assigning through them silently no-ops, which is exactly the bug this
  // suite itself caught on its first run: the enemy stayed at its spawn
  // spot, out of hunting range, and "no damage" looked like a companion bug
  // that was really a test bug. Move the body, not the getter.
  foe.root.position.x = px + 1; foe.root.position.z = pz;
  const hpBefore = foe.hp;
  for (let i = 0; i < 30; i++) dragon.update(0.1, 30 + i * 0.1, g.player, w); // several bite cooldowns' worth
  const hpAfter = foe.hp;

  // ONCE THE FOE IS GONE, it goes back to following.
  foe.hp = 0; foe.die();
  dragon.place(px + 6, pz);
  const distDuringChase = Math.hypot(dragon.x - px, dragon.z - pz);
  for (let i = 0; i < 30; i++) dragon.update(0.1, 60 + i * 0.1, g.player, null);
  const distAfterReturn = Math.hypot(dragon.x - px, dragon.z - pz);

  return { distBefore, distAfterFollow, hpBefore, hpAfter, foeDamaged: hpAfter < hpBefore,
    distDuringChase, distAfterReturn };
});
check("with nothing to fight, the dragon follows Kael (closes distance every tick)",
  companion.distAfterFollow < companion.distBefore, companion);
check('a forced-into-range enemy takes real damage from the dragon\'s bite (Enemy#takeDamage)',
  companion.foeDamaged, companion);
check('once its target is gone, the dragon resumes following and closes distance again',
  companion.distAfterReturn < companion.distDuringChase, companion);

// 9. SAVE/LOAD — a real persist -> loadSave -> applySave round trip carries
// found eggs, hatched dragons and the equipped choice through, the same
// additive-forever contract js/materials.js's own suite already proves for
// crafting materials.
const roundTrip = await wk.page.evaluate(async () => {
  const s = await import('/js/save.js');
  const g = window.__game;
  g.state.inventory.dragonEggs = { fire: true, tide: true, storm: true };
  g.state.inventory.dragonsHatched = { fire: true, storm: true };
  g.state.inventory.dragonEquipped = 'storm';
  s.persist();
  const data = s.loadSave(g.state.profileId);
  g.state.inventory.dragonEggs = {};
  g.state.inventory.dragonsHatched = {};
  g.state.inventory.dragonEquipped = null;
  s.applySave(g.state.profileId, g.state.profileName, data);
  return {
    dragonEggs: { ...g.state.inventory.dragonEggs },
    dragonsHatched: { ...g.state.inventory.dragonsHatched },
    dragonEquipped: g.state.inventory.dragonEquipped,
  };
});
check('found eggs survive a real save/load round trip',
  roundTrip.dragonEggs.fire && roundTrip.dragonEggs.tide && roundTrip.dragonEggs.storm, roundTrip);
check('hatched dragons survive a real save/load round trip',
  roundTrip.dragonsHatched.fire && roundTrip.dragonsHatched.storm && !roundTrip.dragonsHatched.tide, roundTrip);
check('the equipped dragon survives a real save/load round trip', roundTrip.dragonEquipped === 'storm', roundTrip);

// 10. ADDITIVE-FOREVER BACKFILL — a save written before this system existed
// has none of these three fields at all; applySave must not throw and must
// backfill the untouched-game defaults (js/save.js applySave, mirroring the
// exact backfill pattern materials/crafted/recipesKnown already got).
const backfill = await wk.page.evaluate(async () => {
  const s = await import('/js/save.js');
  const g = window.__game;
  const data = s.loadSave(g.state.profileId);
  delete data.inventory.dragonEggs;
  delete data.inventory.dragonsHatched;
  delete data.inventory.dragonEquipped;
  let threw = false;
  try { s.applySave(g.state.profileId, g.state.profileName, data); } catch (e) { threw = true; }
  return {
    threw, dragonEggs: { ...g.state.inventory.dragonEggs },
    dragonsHatched: { ...g.state.inventory.dragonsHatched },
    dragonEquipped: g.state.inventory.dragonEquipped,
  };
});
check('loading a save with no dragon fields at all does not throw', !backfill.threw, backfill);
check('a pre-dragon-eggs save backfills to the untouched-game defaults ({}, {}, null)',
  Object.keys(backfill.dragonEggs).length === 0 && Object.keys(backfill.dragonsHatched).length === 0
    && backfill.dragonEquipped === null, backfill);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}`
  : '\n✓ PASS — dragon eggs hint/confirm/hatch correctly, the companion follows and bites, equip UI works, saves round-trip');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
