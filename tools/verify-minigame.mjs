// THE MINI GAME CONTRACT, driven end to end.
//
// design/DEN-MINIGAMES.md §8 step 1: build the interface, the shared harness and
// Fetch, and "prove the contract end to end". This is that proof. It walks a
// child into the host ring, plays a round through the real tap path, lets the
// clock run out, reads the results screen, replays, and leaves — then checks the
// room is exactly as it was found.
//
// The last assertion is the one that matters most in six months. §3.4:
//
//   "Add a dev-only assertion after teardown that scene child count and draw
//    call count have returned to their pre-game values. Leaks here will surface
//    as a slow den after twenty rounds and will be miserable to trace later."
//
// So this opens and closes Fetch TEN times and requires the room to be
// byte-for-byte the same size at the end. A leak of one object per round is
// invisible once and obvious ten times, which is the whole point of doing it
// here rather than by eye.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'MINIGAME');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

// A RESCUE, so Tier 1 is unlocked. §4: unlocks read the COUNT, never which
// character was found — so any one pup opens Fetch.
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.flags.pups = { pup1: true };
  g.player.iframes = 999999;
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};
check('the Den builds', await go('den'));

const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);

// where is the host ring? walk to it the way a child does, rather than calling
// open() directly — a doorway nobody can reach is not a doorway
//
// The baseline is taken FROM THE SPOT THE FINAL READING IS TAKEN FROM. Draw
// calls depend on where the camera is — it is a fixed offset from the player,
// so standing somewhere else frustum-culls a different set of props. Comparing
// a reading at the spawn point against one by the meadow measures the walk, not
// the teardown. Same spot, same frame budget, or the number says nothing.
// It also waits for the camera to SETTLE, and then takes a MEDIAN. Two things
// make a single reading lie. The camera chases the player rather than snapping
// to them, so a reading six frames after a jump is a reading of a camera still
// in flight, culling a different set of props on the way in than on the way
// out. And the den runs transient effects — embers, dust — that are drawn on
// some frames and not others, so back-to-back frames legitimately differ by two
// or three. Sixty frames of settle, then the median of five samples spread over
// time, measures the room rather than the moment.
const REST = { x: -6, z: 0 };
const restCalls = () => page.evaluate(async (p) => {
  const g = window.__game;
  const wait = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
  g.player.root.position.set(p.x, 0, p.z);
  await wait(60);
  const s = [];
  for (let i = 0; i < 5; i++) { s.push(g.renderer.info.render.calls); await wait(12); }
  s.sort((a, b) => a - b);
  return { children: g.world.root.children.length, calls: s[2], samples: s };
}, REST);
const baseline = await restCalls();

await page.evaluate(() => {
  const g = window.__game;
  g.player.root.position.set(1.6, 0, 4.6);      // the Fetch ring, by the meadow
});
await frames(8);
const opened = await page.evaluate(() => ({
  active: window.__game.world.harness.active,
  phase: window.__game.world.harness.phase,
  hud: getComputedStyle(document.getElementById('mg-hud')).display !== 'none',
  demo: getComputedStyle(document.getElementById('mg-demo')).display !== 'none',
}));
check('walking into the ring opens the game', opened.active === true, opened);
check('a first-time player is shown the demo', opened.phase === 'demo', opened);
check('the HUD is up', opened.hud === true, opened);

// ONE TAP ANYWHERE skips the demo and starts the round (§2: winnable by mashing)
await page.locator('#mg-tap').dispatchEvent('pointerdown');
await frames(4);
// ...and the demo CARD goes with it. Checking the phase alone missed this:
// the round started, the card stayed, and a child played the whole thirty
// seconds behind a giant bone with Kael hidden underneath it.
const skipped = await page.evaluate(() => ({
  phase: window.__game.world.harness.phase,
  demo: getComputedStyle(document.getElementById('mg-demo')).display !== 'none',
}));
check('a tap skips the demo into play', skipped.phase === 'play', skipped);
check('and the demo card leaves the screen with it', skipped.demo === false, skipped);

// §2: the world's own HUD stands down. Hearts, potions and the attack button
// belong to a frozen world; three HUDs at once is not "no reading required".
const hudDown = await page.evaluate(() => ['hearts', 'potions', 'btn-attack', 'mg-chip']
  .map((id) => document.getElementById(id))
  .filter((n) => n && getComputedStyle(n).display !== 'none')
  .map((n) => n.id));
check('the world HUD stands down for a round', hudDown.length === 0, { stillUp: hudDown });

// A CONTROL IS ONLY REAL IF IT IS ON THE SCREEN AND BIG ENOUGH TO HIT. Each is
// measured on the screen it belongs to: the exit lives on the play HUD, replay
// and go-home live on the results screen, and an element on a hidden panel
// measures 0x0 — which is how the first version of this check "found" a
// missing exit button that was simply not that screen's business.
const measure = async (ids) => {
  const r = await page.evaluate((list) => {
    const out = list.map((id) => {
      const b = document.getElementById(id).getBoundingClientRect();
      return { id, x: Math.round(b.x), y: Math.round(b.y),
        w: Math.round(b.width), h: Math.round(b.height) };
    });
    return { out, vw: innerWidth, vh: innerHeight };
  }, ids);
  return {
    view: [r.vw, r.vh],
    offscreen: r.out.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > r.vw || b.y + b.h > r.vh),
    tooSmall: r.out.filter((b) => /mg-(exit|replay|leave|band)/.test(b.id))
      .filter((b) => b.w < 44 || b.h < 44),
  };
};
const playBoxes = await measure(['mg-exit', 'mg-clock', 'mg-score']);
check('the exit is on the screen and over the 44px floor during play',
  playBoxes.offscreen.length === 0 && playBoxes.tooSmall.length === 0, playBoxes);

// mash for a few seconds — the spec's own acceptance is that this works
const scored = await page.evaluate(async () => {
  const tap = document.getElementById('mg-tap');
  for (let i = 0; i < 240; i++) {
    tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return +document.getElementById('mg-score').textContent;
});
check('mashing scores', scored > 0, { score: scored });

// run the clock out
await page.evaluate(async () => {
  const h = window.__game.world.harness;
  for (let i = 0; i < 400 && h.phase === 'play'; i++) {
    h.update(0.12, i * 0.12);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
const res = await page.evaluate(() => ({
  phase: window.__game.world.harness.phase,
  shown: getComputedStyle(document.getElementById('mg-results')).display !== 'none',
  score: document.getElementById('mg-r-score').textContent,
  best: document.getElementById('mg-r-best').textContent,
  newBest: getComputedStyle(document.getElementById('mg-r-new')).display !== 'none',
  bonus: getComputedStyle(document.getElementById('mg-r-bonus')).display !== 'none',
  stored: JSON.parse(JSON.stringify(window.__game.state.minigames || {})),
}));
check('the round ends on the clock, not on a failure', res.phase === 'results', { phase: res.phase });
check('the results screen appears', res.shown === true);
check('a first score is a personal best', res.newBest === true, { score: res.score, best: res.best });
check('the best is stored in THIS profile', (res.stored.fetch || {}).best > 0, res.stored);
// §6: an empty reward pool pays a bonus with its own flourish, never a silent
// nothing that reads as a reward which failed to arrive
check('an empty reward pool still pays, and says so differently', res.bonus === true);
// ...and it pays in SCORE. §2: every reward is cosmetic. Shards buy potions and
// upgrades, so a mini game that drops them is a mini game a child has to grind.
const dropped = await page.evaluate(() => (window.__game.world.drops || []).length);
check('a round pays no shards — mini games never pay the shop', dropped === 0,
  { drops: dropped });

// EVERY CONTROL IS ACTUALLY ON THE SCREEN. The first results screen was laid
// out as one tall column: on a 740x360 phone held sideways the bone was cut off
// the top and BOTH buttons — replay and go-home, the two a child needs most —
// were half off the bottom. Every assertion above it passed. So this measures
// the boxes, and also holds them to the v3.35 law: a 44px floor per control.
const boxes = await measure(['mg-replay', 'mg-leave',
  'mg-band-cub', 'mg-band-wolf', 'mg-band-alpha', 'mg-r-icon', 'mg-r-score']);
check('every results control is fully on the screen', boxes.offscreen.length === 0,
  { offscreen: boxes.offscreen, view: boxes.view });
check('no results control is under the 44px floor', boxes.tooSmall.length === 0,
  { tooSmall: boxes.tooSmall });

// §2: restart is one tap from the results screen
await page.locator('#mg-replay').dispatchEvent('pointerdown');
await frames(6);
const again = await page.evaluate(() => window.__game.world.harness.phase);
check('replay is one tap, and skips the demo second time', again === 'play', { phase: again });

// §2: exit is one tap, no confirmation dialog
await page.locator('#mg-exit').dispatchEvent('pointerdown');
await frames(6);
check('exit is one tap and closes everything',
  (await page.evaluate(() => window.__game.world.harness.active)) === false);
// and the world gets its HUD back — a child left holding no hearts and no
// attack button has been locked out of their own game
const hudBack = await page.evaluate(() => ['hearts', 'potions', 'btn-attack']
  .map((id) => document.getElementById(id))
  .filter((n) => n && getComputedStyle(n).display === 'none')
  .map((n) => n.id));
check('the world HUD comes back on the way out', hudBack.length === 0, { stillHidden: hudBack });

// --- §3.4 TEARDOWN DISCIPLINE ---------------------------------------------
// Ten rounds. A leak of a single object per round is invisible once.
const leak = await page.evaluate(async () => {
  const g = window.__game;
  // step off the ring first: it re-arms only when you leave it, which is the
  // whole reason exit works at all. A child walks away and comes back; so does
  // this loop.
  g.player.root.position.set(-6, 0, 0);
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  const before = g.world.root.children.length;
  for (let i = 0; i < 10; i++) {
    g.player.root.position.set(1.6, 0, 4.6);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    if (!g.world.harness.active) return { before, after: -1, failedToOpen: i };
    g.world.harness.exit();
    // step off so the ring re-arms, and give it a frame to notice
    g.player.root.position.set(-6, 0, 0);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { before, after: g.world.root.children.length };
});
check('ten rounds leave ZERO residue in the room', leak.after === leak.before, leak);

const final = await restCalls();
check('draw calls return to where they started', Math.abs(final.calls - baseline.calls) <= 3,
  { before: baseline.samples, after: final.samples });

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : '✓ the harness contract holds end to end, and Fetch leaves nothing behind'));
await b.close();
process.exit(errors.length ? 1 : 0);
