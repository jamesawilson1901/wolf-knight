// THE KNOT — now an honest push-and-plate room, same shared furniture as
// Stoneroot and Frostpeak (js/gates.js pushableBoulder + plateSwitch).
//
// It used to be a lash-TETHER puzzle whose own fiction ("no floor behind the
// boulder") was never enforced — the channel was open at its west end the
// whole time, so a child could walk around and push it home regardless. Dad,
// from play: "the lashing the boulder is weak and it doesn't work properly.
// get rid of it." The tether verb also belonged to a wolf granted several
// districts too early. Gone: tetherAt (world.js), the tether call in
// player.js, the channel walls, and the false premise. What is left is what
// was always physically true. Drives the real push (world.updateBoulders),
// not a hand-set position.
import { launchBrowser } from './launch.mjs';
const errors = [];
const check = (n, ok, d) => { console.log((ok?'✓ ':'✗ ')+n, d!==undefined?JSON.stringify(d):''); if(!ok) errors.push(n); };
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e)=>errors.push('PAGEERROR: '+e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'KNOT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  // KNIGHT ONLY — verdant is not required here any more, and the point of
  // this room's redesign is that it never was physically. Prove it with a
  // form that cannot lash at all.
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf'];
  g.state.form='knight'; g.player.iframes=99999; g.state.flags.plates={}; });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.world&&window.__game.world.roomId===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };

console.log('\n── the room sets up an honest push puzzle ──────────────');
await page.evaluate(() => { window.__game.state.flags.plates = {}; });
await go('tkn');
const setup = await page.evaluate(() => {
  const w = window.__game.world;
  return { boulders: w.boulders.length, plates: (w.plates||[]).length,
           doors: w.doors.map((d)=>({to:d.to, gated:!!d.when})),
           noTether: typeof w.tetherAt !== 'function',
           noMarkers: !w.markers.knotTether && !w.markers.knotSnare };
});
check('the Knot has a boulder and a plate', setup.boulders === 1 && setup.plates === 1, setup);
check('the way onward is GATED on the plate', setup.doors.some((d)=>d.to==='tc3' && d.gated), setup);
check('the tether is gone entirely — no world.tetherAt, no leftover markers',
  setup.noTether && setup.noMarkers, setup);
const shut = await page.evaluate(() => {
  const w = window.__game.world;
  const d = w.doors.find((x)=>x.to==='tc3');
  return d.when ? d.when() : true;
});
check('...and that gate is shut before the puzzle is solved', shut === false, { open: shut });

// AND THE GATE IS A THING, NOT ONLY A PREDICATE.
//
// Every check above this line asks the `when` condition and nothing else, and
// that is exactly the hole this room was rebuilt to close: the way on used to
// live entirely in a predicate, so a child walked up to an open arch and
// nothing happened (js/level3.js, the rootBar note). A physical bar went
// across the doorway to fix that — and this suite, written before it existed,
// would still have passed green if the bar never opened, or opened and left
// its collider standing. verify-playthrough was the only thing in seventy-odd
// suites that noticed, and it noticed by failing to walk through.
//
// So: measure the doorway itself, with the game's own collision, on both
// sides of the puzzle.
const barred = await page.evaluate(() => {
  const w = window.__game.world;
  const z = -w.halfD + 1.0;                       // where rootBar() puts it
  return { blocked: w.blocked(0, z, 0.35), boxes: w.boxColliders.length, z };
});
check('the roots PHYSICALLY block the doorway before the plate is pressed',
  barred.blocked === true, barred);

console.log('\n── a KNIGHT (no verdant at all) can push it home ───────');
// updateBoulders is the real physics: standing within reach for >0.12s
// (b._lean) starts a cardinal step AWAY from the player, exactly the lean
// mechanic a real walk into the boulder triggers. No lash, no form but
// knight — proving the room never needed the tether. The boulder (-8,2) and
// plate (6,2) share a Z — this is a straight EAST push, one axis, the whole
// way; no 2D pathing needed, and inventing any adds ways to misfire it.
const solved = await page.evaluate(async () => {
  const g = window.__game;
  const plate = g.world.plates[0];
  for (let n = 0; n < 40 && !plate.pressed; n++) {
    const b = g.world.boulders[0];
    // stand due WEST of the boulder, on its exact Z — dx>0, dz=0, so the
    // cardinal-snap in updateBoulders can only choose +x (east)
    g.player.root.position.set(b.x - 1.0, g.player.root.position.y, b.z);
    // one full step (1.2u @ 2.4u/s = 0.5s game time) plus the 0.12s lean
    // trigger — give each lean room to complete before repositioning
    for (let i = 0; i < 5; i++) g.world.updateBoulders(0.15, g.player);
  }
  const bo = g.world.boulders[0];
  return { pressed: plate.pressed, flag: !!g.state.flags.plates.l3_knot_p1,
           bx: +bo.x.toFixed(2), bz: +bo.z.toFixed(2) };
});
check('the boulder can be pushed onto the plate with knight alone', solved.pressed, solved);
check('...and the plate records itself in the save flags', solved.flag, solved);
const nowOpen = await page.evaluate(() => {
  const d = window.__game.world.doors.find((x)=>x.to==='tc3');
  return d.when ? d.when() : true;
});
check('solving the puzzle OPENS the way onward', nowOpen === true, { open: nowOpen });

const cleared = await page.evaluate((z) => {
  const w = window.__game.world;
  return { blocked: w.blocked(0, z, 0.35), boxes: w.boxColliders.length };
}, barred.z);
check('...and the roots LET GO of it, where the child is standing',
  cleared.blocked === false, { before: barred, after: cleared });
check('...and the bar took its collider with it',
  cleared.boxes === barred.boxes - 1, { before: barred.boxes, after: cleared.boxes });

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
