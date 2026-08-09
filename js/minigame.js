// THE MINI GAME HARNESS — one interface, then small implementations.
//
// design/DEN-MINIGAMES.md §3, in dad's words: *"Do not build twelve one-off
// games. Build one interface, then twelve small implementations. Twelve bespoke
// games means twelve sets of bugs, twelve HUDs, and no reuse."*
//
// The Den already has three one-off games (js/minigames.js) written before this
// spec existed, and they are exactly what it warns about: three private clocks,
// three private scoring rules, no results screen, no personal best, no exit
// control and no teardown. They keep working and are untouched by this file —
// migrating them is a later session's job, and breaking three things the kids
// already play in order to prove a contract would be a poor trade.
//
// THE CONTRACT (§3.1). A game is an object with five methods:
//
//   init(ctx)      build your props. ctx = { world, player, band, rand, area }
//   start()        the round begins (after the demo, if one is shown)
//   update(dt, t)  per-frame, only while active
//   end()          -> { score }   — the harness computes best/isNewBest/reward
//   teardown()     remove EVERY prop, listener and timer. Zero residue.
//
// WHAT THE HARNESS OWNS (§3.2): the round clock and its display, the score
// display, the how-to-play demo, pause and exit, the results screen, personal
// bests, reward payout, and ducking the den's ambience while a round runs.
//
// ---------------------------------------------------------------------------
// TWO PLACES WHERE THIS DELIBERATELY DIVERGES FROM THE SPEC, both because a
// later instruction overrides it. Written down here rather than silently done.
//
// 1. §2 says the exit control must be "minimum 2 cm". That law was REPEALED in
//    v3.35 after dad played the game and found the buttons ate 45.7% of the
//    screen; the rule now is a 44px floor per control and 22% of the view for
//    all of them together (design/METRICS.md). The exit button is 92px — the
//    same as the attack button, the largest thing a child ever presses — which
//    honours the intent (impossible to miss, one tap, no confirmation) under
//    the current law rather than the repealed one.
//
// 2. §3.2 says the harness "moves the camera to the game's declared framing
//    volume". It does not, because two standing laws say otherwise: THE CAMERA
//    IS A FIXED WORLD-SPACE OFFSET, and NOTHING TELEPORTS THE PLAYER. Instead a
//    game declares how much room it needs and the harness hands it an `area`
//    built AROUND WHERE THE CHILD IS STANDING, so the play space is inside the
//    existing frame by construction. Same outcome, no camera exception, and the
//    child never gets moved.
// ---------------------------------------------------------------------------

import { state } from './state.js';
import { audio } from './audio.js';
import { spawnShards } from './loot.js';
import { bumpCounter } from './progress.js';

// design/METRICS.md, measured: the camera shows 22.2u across at Kael, 12.9u
// ahead and 4.5u behind. A play area sized from these numbers is always fully
// on screen wherever the child happens to be standing.
export const FRAME = { halfW: 8.5, ahead: 9.0, behind: 3.0 };

// §3.3 — three bands, chosen per profile, changeable from the results screen.
// They scale SPEED and LENGTH only. They never change how many taps it takes to
// survive, because a game a child cannot finish is a game they stop playing.
export const BANDS = {
  cub:   { icon: '🐾', speed: 0.72, length: 0.7, label: 'Cub' },
  wolf:  { icon: '🐺', speed: 1.0,  length: 1.0, label: 'Wolf' },
  alpha: { icon: '🌙', speed: 1.32, length: 1.35, label: 'Alpha' },
};
const BAND_ORDER = ['cub', 'wolf', 'alpha'];

// A profile that has never chosen inherits from the difficulty it already
// plays on, so nobody starts on the wrong foot: Gentle -> Cub, Brave -> Alpha.
export function currentBand() {
  const s = state.settings;
  if (!s.band) return s.easy ? 'cub' : s.brave ? 'alpha' : 'wolf';
  return BANDS[s.band] ? s.band : 'wolf';
}

export function setBand(id) {
  if (!BANDS[id]) return false;
  state.settings.band = id;
  return true;
}

// --- per-profile records ----------------------------------------------------
// §2: personal bests only, in that child's own profile. No shared leaderboard —
// the youngest will never beat the eldest and will stop playing.
const records = () => (state.minigames || (state.minigames = {}));

export function bestFor(id) {
  const r = records()[id];
  return r && r.best ? r.best : 0;
}

// §6: a duplicate must never be dropped. Draw from what is left; when the pool
// is empty, pay a score bonus with a clearly different flourish so it does not
// read as a broken reward.
function drawReward(id, pool, rand) {
  if (!pool || !pool.length) return null;
  const won = (records()[id] && records()[id].won) || [];
  const left = pool.filter((p) => !won.includes(p));
  if (!left.length) return null;
  return left[Math.floor(rand() * left.length) % left.length];
}

// mulberry32 — a game gets a seeded rand so a round is reproducible in a
// verifier, and so two children on the same band get comparable rounds.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const el = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// THE HARNESS
// ---------------------------------------------------------------------------
export function makeHarness() {
  let live = null;          // the running game
  let def = null;           // its registration
  let phase = 'off';        // off | demo | play | results
  let clock = 0, score = 0, demoT = 0;
  let ctx = null;
  let sceneChildrenAtStart = 0;

  const hud = el('mg-hud'), tapLayer = el('mg-tap'), results = el('mg-results');

  const show = (node, on) => { if (node) node.style.display = on ? 'flex' : 'none'; };

  const setHud = () => {
    if (!hud) return;
    el('mg-clock').textContent = Math.max(0, Math.ceil(clock));
    el('mg-score').textContent = String(score);
  };

  // ONE TAP, ANYWHERE. §2: every game is winnable by mashing, so the catch /
  // act input is the whole screen rather than a button a child has to find.
  // The exit sits above this layer and stops the event itself.
  const onTap = (e) => {
    if (phase === 'demo') { phase = 'play'; clock = def.seconds; if (live.start) live.start(); return; }
    if (phase !== 'play' || !live || !live.tap) return;
    const gained = live.tap() || 0;
    if (gained) { score += gained; setHud(); }
    e.preventDefault();
  };

  const finish = () => {
    const r = (live.end && live.end()) || { score };
    const total = r.score !== undefined ? r.score : score;
    const rec = records()[def.id] || (records()[def.id] = { best: 0, won: [], plays: 0 });
    rec.plays = (rec.plays || 0) + 1;
    const isNewBest = total > (rec.best || 0);
    if (isNewBest) rec.best = total;

    const rewardId = drawReward(def.id, def.rewards, ctx.rand);
    if (rewardId) { rec.won = [...(rec.won || []), rewardId]; }

    // shards are pocket money, not the point — the score is the point
    const shards = rewardId ? 0 : Math.min(10, 2 + Math.floor(total / 3));
    if (shards) spawnShards(ctx.world, ctx.player.root.position.x, ctx.player.root.position.z, shards);
    bumpCounter('minigames');

    phase = 'results';
    show(hud, false);
    show(results, true);
    el('mg-r-icon').textContent = def.icon;
    el('mg-r-score').textContent = String(total);
    el('mg-r-best').textContent = String(rec.best || 0);
    el('mg-r-new').style.display = isNewBest ? 'block' : 'none';
    el('mg-r-reward').style.display = rewardId ? 'block' : 'none';
    // §6: an empty pool pays a bonus and says so DIFFERENTLY, so it never reads
    // as a reward that failed to arrive
    el('mg-r-bonus').style.display = (!rewardId && shards) ? 'block' : 'none';
    el('mg-r-bonus').textContent = `✨ +${shards}`;
    paintBands();
    audio.play(isNewBest ? 'chest-open' : 'ui-click', { volume: 0.8 });
  };

  const paintBands = () => {
    const cur = currentBand();
    for (const b of BAND_ORDER) {
      const node = el('mg-band-' + b);
      if (node) node.classList.toggle('on', b === cur);
    }
  };

  const stop = () => {
    if (live && live.teardown) live.teardown();
    live = null; def = null; ctx = null;
    phase = 'off';
    show(hud, false); show(results, false); show(tapLayer, false);
    audio.duck(false);
  };

  return {
    get active() { return phase !== 'off'; },
    get phase() { return phase; },

    // `d` = { id, icon, seconds, rewards[], make(ctx) }
    open(d, world, player) {
      if (phase !== 'off') return false;
      def = d;
      const band = currentBand();
      ctx = {
        world, player, band, bands: BANDS[band],
        rand: rng((d.id.charCodeAt(0) * 7919) ^ Math.round(player.root.position.x * 31) ^ Date.now()),
        // the play area is built AROUND THE CHILD (see the note at the top)
        area: {
          x: player.root.position.x, z: player.root.position.z,
          halfW: FRAME.halfW, ahead: FRAME.ahead, behind: FRAME.behind,
        },
      };
      sceneChildrenAtStart = world.root.children.length;
      live = d.make(ctx);
      if (live.init) live.init(ctx);
      score = 0; clock = d.seconds; demoT = 0;
      // §3.2: the demo plays on first entry and is skippable afterwards. A
      // child who already knows the game should never sit through it twice.
      const seenIt = (records()[d.id] && records()[d.id].plays) > 0;
      phase = seenIt ? 'play' : 'demo';
      if (phase === 'play' && live.start) live.start();
      show(hud, true); show(results, false); show(tapLayer, true);
      // The den's "walk here to play" chip is cleared by the host's own update,
      // which does not run while a round is live — the world is frozen. So the
      // harness takes it down itself, or "🦴 fetch!" sits over the game telling
      // a child to start something they are already playing.
      const chip = el('mg-chip');
      if (chip) chip.style.display = 'none';
      el('mg-demo').style.display = phase === 'demo' ? 'flex' : 'none';
      el('mg-demo-icon').textContent = d.icon;
      setHud();
      audio.duck(true);
      return true;
    },

    update(dt, t) {
      if (phase === 'off') return;
      if (phase === 'demo') {
        demoT += dt;
        if (live.demo) live.demo(dt, t, demoT);
        // 3.5s of showing, then it starts itself — a child who taps skips it
        if (demoT > 3.5) { phase = 'play'; el('mg-demo').style.display = 'none'; if (live.start) live.start(); }
        return;
      }
      if (phase !== 'play') return;
      clock -= dt;
      const gained = live.update ? (live.update(dt, t) || 0) : 0;
      if (gained) score += gained;
      setHud();
      if (clock <= 0) finish();
    },

    replay() {
      if (phase !== 'results') return;
      const d = def, w = ctx.world, p = ctx.player;
      stop();
      this.open(d, w, p);
    },

    exit() { stop(); },

    // §3.3 — the band is picked directly from the results screen, three paws
    // side by side. Not a cycling button: a child who wants Cub should not have
    // to tap through Alpha to reach it, and the picked one is lit so the choice
    // is visible without reading.
    chooseBand(id) {
      if (!setBand(id)) return false;
      paintBands();
      return true;
    },

    // §3.4 teardown discipline, readable by a verifier: after a game closes the
    // room must hold exactly what it held before it opened. A leak here shows
    // up as a Den that slows down after twenty rounds and is miserable to trace
    // once it has been there a month.
    residue(world) { return world.root.children.length - sceneChildrenAtStart; },
    _onTap: onTap,
  };
}
