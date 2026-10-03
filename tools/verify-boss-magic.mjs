// BOSS MAGIC (js/bossmagic.js, design/COMBAT-SPEC.md "Boss magic", 2026-10-03).
//
// Dad: "Boss fights all feel too similar." Every boss now carries a move no
// other fight has. This suite holds each piece to the rules on the page he
// signed off, through the real classes in their real rooms:
//
//   1. THE KIT, piece by piece, against a real room and the real Player —
//      orbs (hurt / shield pops / shield bats back), floor circles (nothing
//      before the tell, then hands that a jump clears, shards that it does
//      not, a snare a jump frees), the knock ring (thrown away; jumped, not),
//      the shove never landing in lava, the vine (pulled; jumped, snapped),
//      the fire band (safe inside it), the bubble, the Binding (one wolf, the
//      ring greyed, broken after 6s / 3s Gentle, never saved, cleared by a
//      room change) and clear() leaving nothing behind.
//   2. EVERY BOSS, in its own arena, doing its own magic through its own
//      state machine: Shadowgrip's orbs fell it when shielded; Sylva's vine
//      pulls; Aria's thunder throws; Meri's bubble only bursts to fire;
//      Grimm's echoes change by the third and the Binding holds the wolf he
//      resists; Boreal's rain falls between dives; the Bone Warden's bubble
//      and grave hands.
//   3. EVERY MINI-BOSS likewise: the Cinder Drake's bubble bursts only on a
//      shield-crash; the Rootbound Wight snares; the Rime Warden's bubble
//      melts to fire; the Ash Warden's spin leaves fire; the Bone Sage's orbs
//      come back off a shield and burst its bubble; the Chancellor's coins.
//
// Ticking is synchronous inside one evaluate (the "tick the class, not the
// render loop" idiom): narration and toasts can hold the real loop for
// seconds, which reads as flakiness that is not a game bug.
import { readFileSync } from 'fs';
import { launch } from './wk-drive.mjs';
import { ATTACK, BOSS_FLOOR } from '../js/attacks.js';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

// ---- 0. static -------------------------------------------------------------
console.log('\n── 0. the clock and the save (static) ─────────────────');
const MAGIC_ROWS = ['shadow_orbs', 'sylva_vine', 'aria_thunder', 'grave_hands', 'ice_shards', 'grimm_binding',
  'boreal_shards', 'warden_hands', 'wight_snare', 'ash_firering', 'sage_orbs', 'chancellor_coins'];
for (const id of MAGIC_ROWS) {
  const a = ATTACK[id];
  check(`${id}: registered, tell >= 1.0s (boss floor ${BOSS_FLOOR}), punish >= 1.0s`,
    !!a && a.tier === 'boss' && a.windup >= 1.0 && a.recover + a.gap >= 1.0 && a.counterplay.length > 0,
    a && { windup: a.windup, punish: a.recover + a.gap });
}
const saveSrc = readFileSync('js/save.js', 'utf8');
check('the Binding is never saved (js/save.js does not name curseLock)', !/curseLock/.test(saveSrc));
const bossSrc = readFileSync('js/boss.js', 'utf8');
const borealSrc = bossSrc.slice(bossSrc.indexOf('export class Boreal'));
check('Boreal\'s second dive tell is no longer 0.55s (under the 0.9s floor)', !/actionT = 0\.55/.test(borealSrc));

const wk = await launch({ timescale: 1 });
await wk.newGame('MAGIC');
const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

async function goto(room) {
  for (let a = 0; a < 4; a++) {
    try {
      await wk.page.evaluate(({ r, f }) => { window.__game.player.iframes = 0; window.__wkJump(r, f); }, { r: room, f: ALL });
      await wk.page.waitForFunction((r) => window.__wk.room === r && !window.__wk.gates.transitioning
        && window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r), room, { timeout: 60000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
}

// ---- 1. THE KIT --------------------------------------------------------------
console.log('\n── 1. the kit, piece by piece ─────────────────────────');
check('arrived in a room to test the kit in', await goto('g1'));
const kit = await wk.page.evaluate(async () => {
  const { BossMagic } = await import('/js/bossmagic.js');
  const { formsAvailable } = await import('/js/state.js');
  const g = window.__game, w = g.world, P = g.player, S = g.state;
  const n = g.narration; if (n.speaking) n.skip();
  // the room's own foes stand still — this is about the magic
  for (const e of w.enemies) { e.update = () => {}; }
  const out = {};
  const px = P.root.position.x, pz = P.root.position.z;
  const reset = () => { P.iframes = 0; P.hearts = P.maxHearts = 40; P.defending = false; P.airY = 0; P.airV = 0;
    P.jumpsUsed = 0; P._airGrace = 0; P._snareT = 0; P._shove = null; P.lockTime = 0;
    P.root.position.set(px, 0, pz); };
  const tick = (m, secs, withPlayer = false) => {
    for (let i = 0; i < secs * 30; i++) {
      m.update(1 / 30, P);
      if (withPlayer) P.update(1 / 30, g.input, w);
    }
  };
  const air = () => { P.jumpsUsed = 1; P.airY = 0.6; P.airV = 0.5; };
  const sceneN = () => w.root.children.length;
  const before = sceneN();

  // ORBS — hurt, popped by a shield, batted back
  {
    const m = new BossMagic(w);
    reset(); P.setForm('knight', { silent: true });
    m.orbVolley(px + 5, pz, px, pz, { count: 1, dmg: 1 });
    const h0 = P.hearts; tick(m, 2.5);
    out.orbHurts = P.hearts < h0;
    reset(); P.defending = true;
    const h1 = P.hearts; m.orbVolley(px + 5, pz, px, pz, { count: 3, spread: 0.0, dmg: 1 });
    tick(m, 2.5);
    out.orbShield = { hearts: P.hearts === h1, blocked: m.stats.orbsBlocked };
    reset(); P.defending = true;
    let home = 0;
    m.orbVolley(px + 5, pz, px, pz, { count: 1, dmg: 1, reflect: true,
      target: () => ({ x: px + 5, z: pz, r: 0.9 }), onReflectHit: () => { home++; } });
    tick(m, 3.5);
    out.orbReflect = { home, reflected: m.stats.orbsReflected };
    out.orbLeft = m.orbs.length;
    m.clear(P);
  }

  // CIRCLES — nothing before the tell; hands jumpable, shards not; the snare
  {
    const m = new BossMagic(w);
    reset();
    m.floorCircles([{ x: px, z: pz }], { tell: 1.2, kind: 'hands', dmg: 1 });
    const h0 = P.hearts; tick(m, 1.1);
    out.handsEarly = P.hearts === h0;
    tick(m, 0.2);
    out.handsHit = P.hearts < h0;
    tick(m, 0.5);
    reset(); air();
    m.floorCircles([{ x: px, z: pz }], { tell: 1.2, kind: 'hands', dmg: 1 });
    const h1 = P.hearts; tick(m, 1.4);
    out.handsJumped = P.hearts === h1;
    reset(); air();
    m.floorCircles([{ x: px, z: pz }], { tell: 1.2, kind: 'shards', dmg: 1 });
    const h2 = P.hearts; tick(m, 1.4);
    out.shardsNotJumpable = P.hearts < h2;
    reset();
    m.floorCircles([{ x: px + 4, z: pz }], { tell: 1.2, kind: 'shards', dmg: 1 });
    const h3 = P.hearts; tick(m, 1.4);
    out.offTheCircle = P.hearts === h3;
    reset();
    m.floorCircles([{ x: px, z: pz }], { tell: 1.2, kind: 'snare', hold: 2.5 });
    const h4 = P.hearts; tick(m, 1.4);
    out.snare = { held: P._snareT > 0, noDamage: P.hearts === h4, ring: !!m._snareFx };
    // held: stick input does nothing (pressing right for a second)
    const sx = P.root.position.x;
    const fake = { move: { x: 1, z: 0 }, getMove: () => ({ x: 1, z: 0 }), defending: false };
    for (let i = 0; i < 20; i++) P.update(1 / 30, fake, w);
    out.snare.stayed = Math.abs(P.root.position.x - sx) < 0.05;
    out.snare.jumpFrees = P.tryJump() === true && P._snareT === 0;
    tick(m, 0.4);
    out.snare.ringGone = !m._snareFx;
    m.clear(P);
  }

  // KNOCK RING — thrown away from the caster; jumped, not
  {
    const m = new BossMagic(w);
    reset();
    const cx = px - 2.5;
    m.knockRing(cx, pz, { tell: 1.0, maxR: 6, speed: 6, push: 3.5, dmg: 0.5 });
    const d0 = Math.abs(P.root.position.x - cx);
    tick(m, 1.0, true);
    const midTell = Math.abs(P.root.position.x - cx);
    tick(m, 1.6, true);
    out.ring = { untouchedInTell: Math.abs(midTell - d0) < 0.05, thrown: Math.abs(P.root.position.x - cx) - d0,
      shoves: m.stats.shoves };
    reset();
    m.knockRing(cx, pz, { tell: 1.0, maxR: 6, speed: 6, push: 3.5, dmg: 0.5 });
    tick(m, 1.0);
    const h = P.hearts;
    // in the air for the whole pass of the wave (the jump, held)
    for (let i = 0; i < 30; i++) { air(); m.update(1 / 30, P); }
    out.ring.jumped = P.hearts === h && Math.abs(P.root.position.x - px) < 0.05;
    m.clear(P);
  }

  // THE SHOVE NEVER LANDS IN LAVA — a lava strip right behind Kael, thrown at it
  {
    reset();
    const zone = { minX: px + 1.0, maxX: px + 4, minZ: pz - 3, maxZ: pz + 3 };
    w.lavaZones.push(zone);
    P.shove(1, 0, 4.0);
    let inLava = 0;
    for (let i = 0; i < 30; i++) {
      P.update(1 / 30, g.input, w);
      if (w.hazardAt(P.root.position.x, P.root.position.z)) inLava++;
    }
    out.lava = { inLava, stoppedAt: +(P.root.position.x - px).toFixed(2), short: P.root.position.x < zone.minX };
    w.lavaZones.splice(w.lavaZones.indexOf(zone), 1);
  }

  // THE VINE — dragged in on the ground; snapped in the air
  {
    const m = new BossMagic(w);
    reset();
    const from = { x: px - 6, z: pz };
    m.vine(() => from, P, { tell: 1.0, stop: 2.2, maxPull: 4.5 });
    tick(m, 1.0, true);
    tick(m, 0.8, true);
    // moved toward the caster (the room's walls may stop it short of 2.2u —
    // the arena test below measures the full pull)
    out.vine = { pulled: +(Math.abs(px - from.x) - Math.abs(P.root.position.x - from.x)).toFixed(2) };
    reset();
    m.vine(() => from, P, { tell: 1.0, stop: 2.2, maxPull: 4.5 });
    tick(m, 0.95);
    for (let i = 0; i < 6; i++) { air(); m.update(1 / 30, P); }
    out.vine.snapped = m.stats.snaps === 1 && Math.abs(P.root.position.x - px) < 0.05;
    tick(m, 0.6);
    out.vine.gone = m.vines.length === 0;
    m.clear(P);
  }

  // THE FIRE BAND — red first; burns in the band; safe inside it
  {
    const m = new BossMagic(w);
    reset();
    m.fireRing(px - 2, pz, { tell: 1.0, life: 3, r0: 1.4, r1: 2.7 });
    const h0 = P.hearts; tick(m, 0.9);
    out.fire = { quietInTell: P.hearts === h0 };
    tick(m, 0.4);
    out.fire.burns = P.hearts < h0;
    reset();
    P.root.position.set(px - 2 + 0.6, 0, pz);       // inside the band, by the caster
    const h1 = P.hearts; tick(m, 1.0);
    out.fire.insideSafe = P.hearts === h1;
    tick(m, 3);
    out.fire.burnsOut = m.fires.length === 0;
    m.clear(P);
  }

  // THE BUBBLE — bounces all but its own breaker
  {
    const m = new BossMagic(w);
    m.raiseBubble(() => ({ x: px + 3, y: 1, z: pz }), { breaks: 'fire' });
    tick(m, 0.5);
    out.bubble = { steel: m.bubbleTest('steel'), earth: m.bubbleTest('earth'), up: m.bubbleUp,
      fire: m.bubbleTest('fire'), after: m.bubbleUp };
    m.raiseBubble(() => ({ x: px + 3, y: 1, z: pz }), { breaks: 'crash' });
    out.bubble.crashFire = m.bubbleTest('fire');
    out.bubble.crash = m.bubbleTest(null, 'crash');
    m.raiseBubble(() => ({ x: px + 3, y: 1, z: pz }), { breaks: 'reflect' });
    out.bubble.reflect = m.bubbleTest(null, 'reflect');
    m.clear(P);
  }

  // THE BINDING — one wolf, greyed ring, 6s / 3s Gentle, never saved
  {
    const m = new BossMagic(w);
    reset(); P.setForm('knight', { silent: true });
    const ok = m.bind(P, 'fire_wolf');
    out.bind = { ok, form: S.form, lock: S.curseLock, avail: formsAvailable(),
      refuses: P.setForm('knight') === false && S.form === 'fire_wolf',
      badge: document.getElementById('form-badge').classList.contains('cursed') };
    g.persist && g.persist();
    const saved = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('');
    out.bind.notSaved = !/curseLock/.test(saved);
    tick(m, 5.8);
    out.bind.stillAt58 = S.curseLock === 'fire_wolf';
    tick(m, 0.4);
    out.bind.broke = { lock: S.curseLock, bonus: !!P._curseBonus, badge: document.getElementById('form-badge').classList.contains('cursed') };
    out.bind.switchAgain = P.setForm('knight', { silent: true }) && S.form === 'knight';
    P._curseBonus = false;
    S.settings.easy = true;
    m.bind(P, 'fire_wolf');
    tick(m, 2.8); const g28 = S.curseLock;
    tick(m, 0.4);
    out.bind.gentle = { at28: g28, at32: S.curseLock };
    S.settings.easy = false;
    P._curseBonus = false;
    // and a bind that is still running when the fight ends lets go
    m.bind(P, 'fire_wolf');
    m.clear(P);
    out.bind.clearFrees = S.curseLock === null;
    P.setForm('knight', { silent: true });
  }
  out.sceneLeak = sceneN() - before;
  // one more Binding, left running across a room change (checked after the jump)
  {
    const m = new BossMagic(w);
    m.bind(P, 'fire_wolf');
    window.__magicLeft = m;
  }
  return out;
});
check('an orb that touches Kael hurts', kit.orbHurts);
check('a raised shield pops every orb, no damage', kit.orbShield.hearts && kit.orbShield.blocked === 3, kit.orbShield);
check('a reflect orb comes back off the shield and hits home', kit.orbReflect.home === 1 && kit.orbReflect.reflected === 1, kit.orbReflect);
check('no orb outlives its flight', kit.orbLeft === 0, kit.orbLeft);
check('a circle does nothing until its tell is spent', kit.handsEarly);
check('...then the grave hands hit whoever stands in it', kit.handsHit);
check('a jump clears the grave hands', kit.handsJumped);
check('a jump does NOT clear falling ice (only stepping off does)', kit.shardsNotJumpable);
check('off the circle is safe', kit.offTheCircle);
check('the snare holds Kael, does no damage, and shows its roots', kit.snare.held && kit.snare.noDamage && kit.snare.ring, kit.snare);
check('held means held: the stick does not move him', kit.snare.stayed, kit.snare);
check('a jump frees him (and the jump goes ahead)', kit.snare.jumpFrees, kit.snare);
check('the roots go when he is free', kit.snare.ringGone, kit.snare);
check('the knock ring does nothing during its tell', kit.ring.untouchedInTell, kit.ring);
check('the knock ring throws Kael away from the caster', kit.ring.thrown > 2.0 && kit.ring.shoves === 1, kit.ring);
check('a jump lets the ring pass under him (no damage, no throw)', kit.ring.jumped, kit.ring);
check('a shove at lava stops short — never a step in it', kit.lava.inLava === 0 && kit.lava.short, kit.lava);
check('the vine drags a grounded Kael toward the caster', kit.vine.pulled > 2.0, kit.vine);
check('a jump snaps the vine (no pull)', kit.vine.snapped, kit.vine);
check('the vine is cleaned up once spent', kit.vine.gone, kit.vine);
check('the fire band is only red during its tell', kit.fire.quietInTell, kit.fire);
check('the fire band burns in the band', kit.fire.burns, kit.fire);
check('inside the band, by the caster, is safe', kit.fire.insideSafe, kit.fire);
check('the fire burns out', kit.fire.burnsOut, kit.fire);
check('the bubble bounces everything but its breaker, and bursts to it',
  kit.bubble.steel === 'blocked' && kit.bubble.earth === 'blocked' && kit.bubble.up
  && kit.bubble.fire === 'popped' && !kit.bubble.after, kit.bubble);
check('a crash bubble ignores fire, bursts to a crash', kit.bubble.crashFire === 'blocked' && kit.bubble.crash === 'popped', kit.bubble);
check('a reflect bubble bursts to its own orb', kit.bubble.reflect === 'popped', kit.bubble);
check('the Binding holds Kael in one wolf', kit.bind.ok && kit.bind.form === 'fire_wolf'
  && kit.bind.lock === 'fire_wolf' && kit.bind.avail.length === 1, kit.bind);
check('...and the switch is refused', kit.bind.refuses, kit.bind);
check('...and the form badge shows the chains', kit.bind.badge, kit.bind);
check('the Binding is never written to the save', kit.bind.notSaved, kit.bind);
check('it holds for the whole 6s', kit.bind.stillAt58, kit.bind);
check('then breaks, owing the first switch a bonus', kit.bind.broke.lock === null && kit.bind.broke.bonus && !kit.bind.broke.badge, kit.bind.broke);
check('free means free: switching works again', kit.bind.switchAgain, kit.bind);
check('Gentle: 3s, not 6', kit.bind.gentle.at28 === 'fire_wolf' && kit.bind.gentle.at32 === null, kit.bind.gentle);
check('a fight that ends mid-Binding lets go', kit.bind.clearFrees, kit.bind);
check('clear() leaves nothing in the room', kit.sceneLeak === 0, { leak: kit.sceneLeak });

// a room change frees a Binding still running
check('jumped rooms with a Binding still running', await goto('g2'));
const roomFree = await wk.page.evaluate(() => ({ lock: window.__game.state.curseLock,
  badge: document.getElementById('form-badge').classList.contains('cursed') }));
check('a room change clears the Binding (and its badge)', roomFree.lock === null && !roomFree.badge, roomFree);

// ---- 2. THE BOSSES ------------------------------------------------------------
console.log('\n── 2. every boss, its own magic ───────────────────────');
// common setup: a boss in its arena, Kael placed relative to it, a ticker
const PRELUDE = `
  const g = window.__game, w = g.world, P = g.player, S = g.state, B = w.boss;
  const n = g.narration; if (n.speaking) n.skip();
  P.iframes = 0; P.hearts = P.maxHearts = 60; P.defending = false; P._snareT = 0; P._shove = null;
  P.airY = 0; P.airV = 0; P.jumpsUsed = 0; P.lockTime = 0;
  const wpos = () => ({ x: B.x + B.core.position.x, z: B.z + B.core.position.z });
  const place = (dx, dz) => { const c = wpos(); const s = w.resolveCircle(c.x + dx, c.z + dz, 0.32);
    P.root.position.set(s.x, 0, s.z); };
  const dist = () => { const c = wpos(); return Math.hypot(P.root.position.x - c.x, P.root.position.z - c.z); };
  const tick = (secs, withPlayer = true) => { for (let i = 0; i < secs * 30; i++) {
    B.update(1 / 30, 100 + i / 30, P); if (withPlayer) P.update(1 / 30, g.input, w); } };
  const cast = (move) => { const c = wpos(); B.openT = 0; B.action = 'prowl';
    B._startCast(move, P, P.root.position.x, P.root.position.z, c.x, c.z); };
`;
async function bossRoom(room, label) {
  const ok = await goto(room);
  const has = ok && await wk.page.evaluate(() => !!(window.__game.world.boss && !window.__game.world.boss.defeated));
  check(`${label}: arena ${room} has its boss`, !!has);
  return has;
}
const run = (body) => wk.page.evaluate(new Function(`return (async () => { ${PRELUDE} ${body} })();`));

if (await bossRoom('le', 'Shadowgrip')) {
  const r = await run(`
    const moves = B._movesNow();
    place(6, 0); P.setForm('knight', { silent: true });
    cast('orbs');
    let orbs = 0, opened = false;
    for (let i = 0; i < 6 * 30; i++) {
      P.defending = true;              // the shield up, held (P.update re-reads input, so no player tick)
      B.update(1 / 30, 100 + i / 30, P);
      orbs = Math.max(orbs, B.magic.orbs.length);
      if (B.openT > 0) { opened = true; break; }
    }
    return { moves, orbs, opened, why: B.action };`);
  check('Shadowgrip carries the orbs', r.moves.includes('orbs'), r.moves);
  check('Shadowgrip throws three orbs from range', r.orbs === 3, r);
  check('a shielded orb fells the Shadowgrip (a block is a block)', r.opened, r);
}

if (await bossRoom('tgl', 'Sylva')) {
  const r = await run(`
    place(6.5, 0); const d0 = dist();
    cast('vine');
    tick(2.0);
    return { moves: B._movesNow(), d0: +d0.toFixed(2), d1: +dist().toFixed(2), vines: B.magic.vines.length };`);
  check('Sylva carries the vine', r.moves.includes('vine'), r.moves);
  check('her vine drags a grounded Kael in', r.d1 < r.d0 - 2, r);
}

if (await bossRoom('scr', 'Aria')) {
  const r = await run(`
    place(2.8, 0); const d0 = dist();
    cast('thunder');
    tick(2.2);
    return { moves: B._movesNow(), d0: +d0.toFixed(2), d1: +dist().toFixed(2), shoves: B.magic.stats.shoves };`);
  check('Aria carries the thunderclap', r.moves.includes('thunder'), r.moves);
  check('her thunderclap throws Kael away from her', r.shoves === 1 && r.d1 > r.d0 + 1.5, r);
}

if (await bossRoom('ddp', 'Meri')) {
  const r = await run(`
    place(5, 0);
    // below half through the real hit path: the flinch, then the bubble
    B.openT = 9; B.action = 'dazed';
    B._hitCore(B.coreHp - B.maxHp * 0.45, 'steel');
    const flinch = B.action;
    for (let i = 0; i < 120 && B.action === 'flinch'; i++) B.update(1 / 30, 200 + i / 30, P);
    tick(0.6, false);
    const up = B.magic.bubbleUp;
    B.openT = 0; B.action = 'prowl';
    const hp0 = B.coreHp;
    B._hitCore(1, 'steel'); B._hitCore(1, 'earth');
    const bounced = B.coreHp === hp0 && B.magic.bubbleUp;
    B._hitCore(1, 'fire');
    return { flinch, up, bounced, popped: !B.magic.bubbleUp, open: +B.openT.toFixed(2),
      secs: B.skin.open.secs };`);
  check('Meri raises her bubble when the half-health flinch ends', r.flinch === 'flinch' && r.up, r);
  check('every blow but fire bounces off it', r.bounced, r);
  check('fire bursts it and puts her down for longer (x1.3)', r.popped && Math.abs(r.open - r.secs * 1.3) < 0.1, r);
}

if (await bossRoom('xth', 'Grimm')) {
  const r = await run(`
    const at = (f) => { B.coreHp = B.maxHp * f; return B._movesNow(); };
    const m1 = at(0.9), m2 = at(0.5), m3 = at(0.2);
    // THE BINDING below a third, after a fire blow: he resists fire, so the
    // curse holds the FIRE wolf
    B.coreHp = B.maxHp * 0.25; B._lastElement = 'fire';
    P.setForm('knight', { silent: true });
    place(5, 0);
    cast('bind');
    let bound = null;
    for (let i = 0; i < 6 * 30; i++) {
      B.update(1 / 30, 300 + i / 30, P);
      if (S.curseLock) { bound = S.curseLock; break; }
    }
    const form = S.form, refused = P.setForm('earth_wolf') === false;
    // bound and OPEN: the resisted blow lands at 0.4, not BLOCKED
    B.openT = 3; B.action = 'dazed'; B._lastElement = 'fire';
    const hp0 = B.coreHp; B._hitCore(2, 'fire'); const took = +(hp0 - B.coreHp).toFixed(3);
    // ...and bound but NOT open: still the guard
    B.openT = 0; B.action = 'prowl'; const hp1 = B.coreHp; B._hitCore(2, 'fire');
    const guarded = B.coreHp === hp1;
    // let it run out
    for (let i = 0; i < 7 * 30; i++) B.magic.update(1 / 30, P);
    return { m1, m2, m3, bound, form, refused, took, guarded, after: S.curseLock, bonus: !!P._curseBonus };`);
  check('Grimm\'s first third echoes the Shadowgrip\'s orbs', r.m1.includes('orbs') && !r.m1.includes('bind'), r.m1);
  check('his middle third echoes Boreal\'s ice and the Warden\'s hands, and binds',
    r.m2.includes('shards') && r.m2.includes('hands') && r.m2.includes('bind'), r.m2);
  check('his last third echoes Aria\'s thunder, and binds', r.m3.includes('thunder') && r.m3.includes('bind'), r.m3);
  check('the Binding holds the wolf he resists (fire, after a fire blow)', r.bound === 'fire_wolf' && r.form === 'fire_wolf' && r.refused, r);
  check('bound and open, the resisted wolf still lands at x0.4 (never immune)', Math.abs(r.took - 0.8) < 1e-6, r);
  check('bound but not open, the guard still holds', r.guarded, r);
  check('the Binding runs out and owes the bonus switch', r.after === null && r.bonus, r);
}

if (await bossRoom('f5', 'Boreal')) {
  const r = await run(`
    place(2, 2);
    B.action = 'circle'; B.attackIn = 99; B._shardIn = 0.5;
    let peak = 0;
    for (let i = 0; i < 2 * 30; i++) { B.update(1 / 30, 400 + i / 30, P); peak = Math.max(peak, B.magic.circles.length); }
    // never in the last 1.5s before a dive
    B.magic.clear(P); B.action = 'circle'; B.attackIn = 1.2; B._shardIn = 0;
    let during = 0;
    for (let i = 0; i < 30; i++) { B.update(1 / 30, 500 + i / 30, P); during = Math.max(during, B.magic.circles.length); }
    return { peak, during };`);
  check('Boreal rains three circles of ice while she wheels', r.peak === 3, r);
  check('...never in the last 1.5s before a dive', r.during === 0, r);
}

// ---- the Bone Warden family + the other guardians (enemies.js) ----
const FOE = `
  const g = window.__game, w = g.world, P = g.player, S = g.state;
  const n = g.narration; if (n.speaking) n.skip();
  P.iframes = 0; P.hearts = P.maxHearts = 60; P.defending = false; P._snareT = 0; P._shove = null;
  P.airY = 0; P.airV = 0; P.jumpsUsed = 0; P.lockTime = 0;
  P.setForm('knight', { silent: true });          // a shield to raise (the Grimm check leaves a wolf)
  const E = w.miniBoss || w.warden;
  for (const e of w.enemies) if (e !== E) e.update = () => {};
  const place = (dx, dz) => { const s = w.resolveCircle(E.x + dx, E.z + dz, 0.32); P.root.position.set(s.x, 0, s.z); };
  const tick = (secs, withPlayer = false) => { for (let i = 0; i < secs * 30; i++) {
    E.update(1 / 30, 100 + i / 30, P); if (withPlayer) P.update(1 / 30, g.input, w); } };
  if (E.state === 'sleep' || E.state === 'awaken') { E.state = 'chase'; E.stateT = 0; }
  // to just past half health without the blow itself being the test (front
  // shields, weaknesses and quarter rounding all have their own suites)
  const toHalf = () => { E.hp = E.maxHp * 0.5 + 0.25; E.stunned = 0;
    const st = E.state; E.state = 'tired'; E.takeDamage(0.5, 'steel', 'bolt'); if (!E.dead && E.state === 'tired') E.state = st; };
`;
async function foeRoom(room, label) {
  const ok = await goto(room);
  const has = ok && await wk.page.evaluate(() => !!((window.__game.world.miniBoss || window.__game.world.warden)
    && !(window.__game.world.miniBoss || window.__game.world.warden).dead));
  check(`${label}: room ${room} has its guardian`, !!has);
  return has;
}
const runFoe = (body) => wk.page.evaluate(new Function(`return (async () => { ${FOE} ${body} })();`));

const WARDEN_BUBBLE = `
  const kind = E.magicKind;
  toHalf();
  E.state = 'chase';
  // flank so the front shield is not what answers
  E._pp = { x: E.x - Math.sin(E.root.rotation.y) * 3, z: E.z - Math.cos(E.root.rotation.y) * 3 };
  const up = E.magic.bubbleUp;
  const hp0 = E.hp;
  E.takeDamage(1, 'steel', 'melee'); E.takeDamage(1, 'earth', 'melee');
  const bounced = E.hp === hp0 && E.magic.bubbleUp;
  E.takeDamage(1, 'fire', 'melee');
  return { kind, up, bounced, popped: !E.magic.bubbleUp, state: E.state, hpKept: E.hp === hp0 };`;

if (await foeRoom('vz', 'Bone Warden')) {
  const r = await runFoe(WARDEN_BUBBLE);
  check('the Bone Warden carries the grave magic', r.kind === 'grave', r);
  check('his cracked bubble goes up at half health and bounces all but fire', r.up && r.bounced, r);
  check('fire shatters it and leaves him winded (tired)', r.popped && r.state === 'tired', r);
  const c = await runFoe(`
    E.state = 'chase'; E.attackTimer = 9; E._magicIn = 0; place(0, 5);
    tick(0.1);
    const st = E.state, circles = E.magic.circles.map((c) => c.kind), shield = E.shieldUp;
    tick(2.6);
    return { st, circles, shield, back: E.state };`);
  check('the Warden casts grave hands: three circles round Kael', c.st === 'cast_tele' && c.circles.length === 3
    && c.circles.every((k) => k === 'hands'), c);
  check('his shield is DOWN while he casts (the punish)', c.shield === false, c);
  check('...and he goes back to the hunt', c.back === 'chase', c);
}

if (await foeRoom('lb', 'Cinder Drake')) {
  const r = await runFoe(`
    toHalf();
    const up = E.magic.bubbleUp, hp0 = E.hp;
    E.takeDamage(1, 'moon', 'melee'); E.takeDamage(1, 'fire', 'bolt'); E.takeDamage(1, 'spark', 'bolt');
    const bounced = E.hp === hp0 && E.magic.bubbleUp;
    E.state = 'dive'; E.onBlocked();
    return { up, bounced, popped: !E.magic.bubbleUp, state: E.state };`);
  check('the Cinder Drake raises a flame bubble at half health', r.up, r);
  check('blades, bolts and fire all bounce off it', r.bounced, r);
  check('a shield-crash bursts it and floors the drake', r.popped && r.state === 'floored', r);
}

if (await foeRoom('vr2', 'Rootbound Wight')) {
  const r = await runFoe(`
    E.state = 'chase'; E.attackTimer = 9; E._magicIn = 0; place(0, 5);
    tick(0.1);
    const kinds = E.magic.circles.map((c) => c.kind);
    // stand in the middle one and let it close
    const c0 = E.magic.circles[0]; P.root.position.set(c0.x, 0, c0.z);
    tick(1.4);
    return { kind: E.magicKind, kinds, snared: P._snareT > 0 };`);
  check('the Rootbound Wight casts snares', r.kind === 'snare' && r.kinds.length === 3 && r.kinds.every((k) => k === 'snare'), r);
  check('...and a snare holds a Kael who stood in it', r.snared, r);
}

if (await foeRoom('f1d', 'Rime Warden')) {
  const r = await runFoe(WARDEN_BUBBLE);
  check('the Rime Warden\'s ice bubble bounces all but fire', r.kind === 'rime' && r.up && r.bounced, r);
  check('fire melts it and leaves her winded', r.popped && r.state === 'tired', r);
}

if (await foeRoom('s1d', 'Ash Warden')) {
  const r = await runFoe(`
    E.state = 'spin'; E.stateT = 0.4; E._spinHit = false; place(0, 6);
    tick(0.2);
    const f = E.magic.fires[0];
    return { kind: E.magicKind, fires: E.magic.fires.length, r0: f && f.r0, r1: f && f.r1, life: f && f.life };`);
  check('the Ash Warden\'s spin leaves a band of fire for 3s', r.kind === 'ashring' && r.fires === 1 && r.life === 3, r);
}

if (await foeRoom('d1d', 'Bone Sage')) {
  const r = await runFoe(`
    place(0, 6);
    E._casts = 2; E._windup = 0.01; E._shotT = 9;
    tick(0.1);
    const volley = E.magic.orbs.length;
    E.magic.clear(P);
    toHalf();
    const up = E.magic.bubbleUp, hp0 = E.hp;
    E.takeDamage(2, 'fire', 'melee');
    const bounced = E.hp === hp0;
    // its own orb, batted back off a raised shield
    E._windup = 0.01; E._shotT = 9; E.stunned = 0;
    let stunned = false;
    for (let i = 0; i < 6 * 30; i++) {
      P.defending = true;
      E.update(1 / 30, 600 + i / 30, P);
      if (!E.magic.bubbleUp) { stunned = E.stunned > 0; break; }
    }
    return { volley, up, bounced, popped: !E.magic.bubbleUp, stunned, reflected: E.magic.stats.orbsReflected };`);
  check('the Bone Sage throws a volley every third cast', r.volley === 3, r);
  check('its bubble (half health) bounces even fire', r.up && r.bounced, r);
  check('its own orb, batted back with the shield, bursts the bubble and stuns it',
    r.popped && r.stunned && r.reflected >= 1, r);
}

if (await foeRoom('xc2', 'Court Chancellor')) {
  const r = await runFoe(`
    E.state = 'chase'; E._coinIn = 0; place(0, 3);
    const d0 = Math.hypot(P.root.position.x - E.x, P.root.position.z - E.z);
    tick(0.05);
    const st = E.state, rings = E.magic.rings.length;
    tick(2.2, true);
    const d1 = Math.hypot(P.root.position.x - E.x, P.root.position.z - E.z);
    return { st, rings, d0: +d0.toFixed(2), d1: +d1.toFixed(2), back: E.state, sy: +E.model.scale.y.toFixed(3),
      sx: +E.model.scale.x.toFixed(3) };`);
  check('the Court Chancellor slams a coin shockwave', r.st === 'coin_tele' && r.rings === 1, r);
  check('...which throws Kael back', r.d1 > r.d0 + 1.5, r);
  check('...and he stands back up at his own size (no squash left behind)', Math.abs(r.sy - r.sx) < 0.002, r);
}

check('no page errors', wk.errors.length === 0, wk.errors.slice(0, 4));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — every boss its own magic, every magic its own answer');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
