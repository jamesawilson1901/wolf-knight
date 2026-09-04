// THE OTHER HALF OF THE MASHER.
//
// probe-masher proves a boss CANNOT be beaten by holding one button. On its own
// that is a dangerous thing to prove: the cheapest way to pass it is to make the
// boss unbeatable, and a fight a child cannot win is far worse than one they can
// mash. So this plays the fight the way it is meant to be played — shield up
// when it lunges, swing only while it is down — and insists that WORKS.
//
// The two probes are a pair and neither means much alone. Masher must lose;
// blocker must win.
import { launch } from './wk-drive.mjs';

const room = process.argv[2] || 'le';
const SECONDS = +(process.argv[3] || 150);
const forms = { le: ['knight', 'dark_wolf', 'fire_wolf'],
  tgl: ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'],
  xth: ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
    'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'] }[room];

const wk = await launch({ timescale: 1 });
await wk.newGame('BLOCK');
await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: forms });
await wk.page.waitForFunction(() => window.__game && window.__game.world
  && window.__game.world.boss, null, { timeout: 60000 });
await wk.page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0;
});

const read = () => wk.page.evaluate(() => {
  const g = window.__game, b = g.world.boss;
  const p = g.player.root.position, c = b.core.getWorldPosition(new (Object.getPrototypeOf(p).constructor)());
  return { hp: b.coreHp, action: b.action, openT: b.openT || 0,
    hearts: g.player.hearts, dead: !!b.defeated,
    bx: c.x, bz: c.z, d: Math.hypot(c.x - p.x, c.z - p.z) };
});

const t0 = Date.now();
let toppled = 0, swings = 0, blocks = 0;
let start = null;
while ((Date.now() - t0) / 1000 < SECONDS) {
  const s = await read();
  if (start === null) start = s.hp;
  if (s.dead || s.hp <= 0) break;

  if (s.openT > 0.15) {
    // IT IS DOWN. Close the distance and swing — this is the only damage in
    // the fight now, so if the window is too short or too far away to use, the
    // fight is unwinnable and this probe is what says so.
    // step to just outside its body and swing; walkTo is the driver's own
    // real-input walk, so nothing here teleports
    if (s.d > 2.0) await wk.walkTo(s.bx, s.bz, { arrive: 1.8, timeout: 3 }).catch(() => {});
    await wk.tap('j');
    swings++;
  } else if (s.action === 'crouch' || s.action === 'windup') {
    // THE TELL. Shield up and hold through the blow — the block is what topples
    // it, and a five-year-old holds the button rather than timing a parry.
    blocks++;
    await wk.holdShield(1100);
    const after = await read();
    if (after.openT > 0) toppled++;
  } else {
    // close in so the boss commits to something worth blocking
    await wk.walkTo(s.bx, s.bz, { arrive: 2.6, timeout: 3 }).catch(() => {});
  }
}

const end = await read();
const out = {
  room, seconds: +((Date.now() - t0) / 1000).toFixed(1),
  from: start, to: end.hp, dealt: +(start - end.hp).toFixed(1),
  killed: end.dead || end.hp <= 0,
  toppled, blocksAttempted: blocks, swingsInWindow: swings,
  heartsLeft: end.hearts,
};
console.log(JSON.stringify(out));
console.log(out.killed
  ? '✓ a child who blocks and punishes WINS'
  : (out.dealt > 0
    ? `✗ blocking works but is too slow — only ${out.dealt} of ${start} in ${out.seconds}s`
    : '✗ UNWINNABLE — blocking never opened it'));
await wk.close();
process.exit(out.killed ? 0 : 1);
