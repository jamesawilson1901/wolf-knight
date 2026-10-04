// THE DRAGONS' ELEMENT MOVES (design/DRAGON-EGGS.md "Dragon specials",
// 2026-09-28). Until this, all three companion dragons were one pet in three
// colours: follow, bite, repeat. Now:
//
//   * EMBER breathes a cone of fire — every foe inside singed once, the one
//     behind it untouched, and not again until its clock comes round;
//   * TIDE mends half a heart while Kael is hurt — never over the top, never
//     on a knocked-out Kael, never faster than its own clock;
//   * STORM's bite jumps on to the next foe and the next — the nearest first,
//     never the same foe twice, never to one out of reach.
//
// And each move is the dragon's OWN: a fire dragon never mends, a tide dragon
// never chains. Everything is driven the way verify-dragoneggs.mjs drives the
// companion — real CompanionDragon instances ticked synchronously against the
// REAL room and REAL Enemy#takeDamage (the "tick the class, not the render
// loop" idiom, since narration can hold the loop for seconds at a time). The
// visuals are checked the same way: a breath really puts fire sprites in the
// scene, a chain really lays a bolt between two foes, and every one of them is
// gone again once its life is spent — a companion that fights all game long
// must not leak a sprite per breath.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('DRAGONMOVES');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

// A room with at least four live enemies, so the cone and the chain each have
// a crowd to choose from. Real enemies, real hit resolution.
// (g1: two slimes, a spitter, two bats on a fresh save; vb2 the fallback)
const ROOMS = ['g1', 'vb2', 'vb1'];
let room = null;
for (const r of ROOMS) {
  const ok = await wk.page.evaluate((id) => window.__wkJump(id, ['knight']), r).then(() => true).catch(() => false);
  if (!ok) continue;
  try {
    await wk.page.waitForFunction((id) => window.__wk.room === id && !window.__wk.gates.transitioning,
      r, { timeout: 45000 });
  } catch { continue; }
  const n = await wk.page.evaluate(() => window.__game.world.enemies
    .filter((e) => !e.dead && !e.scenery && !/^(Breakables?|Hittable)$/.test(e.constructor.name)).length);
  if (n >= 4) { room = r; break; }
}
check('found a room with four live enemies to fight with', !!room, { room });

const res = await wk.page.evaluate(async () => {
  const { CompanionDragon, SPECIAL } = await import('/js/companionDragon.js');
  const g = window.__game, w = g.world, P = g.player;
  const n = g.narration; if (n.speaking) n.skip();
  const px = P.root.position.x, pz = P.root.position.z;
  const foes = w.enemies.filter((e) => !e.dead && !e.scenery
    && !/^(Breakables?|Hittable)$/.test(e.constructor.name)).slice(0, 4);
  // freeze them where they are put: this is about the dragon, not their AI
  for (const e of foes) { e.hp = 999; e.update = () => {}; }
  const put = (e, x, z) => { e.root.position.x = x; e.root.position.z = z; };
  const make = async (el) => {
    const d = new CompanionDragon();
    await d.load(el);
    d.root.visible = true;
    g.scene.add(d.root);
    return d;
  };
  const fxIn = (d) => d._fx.filter((f) => f.obj.parent === g.scene).length;
  const drain = (d, secs) => { for (let i = 0; i < secs * 20; i++) d.update(0.05, 100 + i * 0.05, P, w); };
  const out = {};

  // ---- EMBER: the cone ----------------------------------------------------
  {
    const d = await make('fire');
    d.place(px, pz); d._specialT = 0;
    // three in front (+x), inside the cone; one behind (-x)
    put(foes[0], px + 1.4, pz);
    put(foes[1], px + 2.4, pz + 0.7);
    put(foes[2], px + 2.8, pz - 0.6);
    put(foes[3], px - 2.0, pz);
    const hp0 = foes.map((e) => e.hp);
    // tick until the breath starts, then a little into it for the puffs
    let started = false, sprites = 0;
    for (let i = 0; i < 40; i++) {
      d.update(0.05, i * 0.05, P, w);
      if (d._breath) { started = true; sprites = Math.max(sprites, fxIn(d)); }
    }
    const hp1 = foes.map((e) => e.hp);
    out.fire = {
      started,
      hitInCone: [0, 1, 2].map((i) => hp1[i] < hp0[i]),
      behindUntouched: hp1[3] === hp0[3],
      lastSpecial: d.lastSpecial,
      spritesDuringBreath: sprites,
      clockAfter: +d._specialT.toFixed(2),
    };
    // one breath, one hit each: the same foes, the breath is over — nothing
    // more lands until the clock comes round
    const hp2 = foes.map((e) => e.hp);
    for (let i = 0; i < 40; i++) d.update(0.05, 3 + i * 0.05, P, w);
    const hp3 = foes.map((e) => e.hp);
    // bites may still land on the nearest (foes[0]) — the CONE ones further
    // out must not take a second breath inside the cooldown
    out.fire.noSecondBreath = hp3[1] === hp2[1] && hp3[2] === hp2[2];
    drain(d, 2);
    out.fire.spritesAfter = fxIn(d);
    out.fire.fxLeft = d._fx.length;
    // a fire dragon never mends
    P.hearts = P.maxHearts - 2; const h0 = P.hearts;
    for (const e of foes) put(e, px + 40, pz + 40);   // nothing to fight
    d._specialT = 0; drain(d, 1);
    out.fire.neverMends = P.hearts === h0;
    g.scene.remove(d.root);
  }

  // ---- TIDE: the mend -----------------------------------------------------
  {
    const d = await make('tide');
    d.place(px - 1, pz);
    for (const e of foes) put(e, px + 40, pz + 40);
    P.hearts = P.maxHearts - 2;
    d._specialT = 0;
    const h0 = P.hearts;
    d.update(0.05, 0, P, w);
    const h1 = P.hearts;
    const twirls = fxIn(d);
    // the clock: nothing more for most of SPECIAL.tide.every seconds
    for (let i = 0; i < (SPECIAL.tide.every - 1) * 20; i++) d.update(0.05, 1 + i * 0.05, P, w);
    const h2 = P.hearts;
    for (let i = 0; i < 2 * 20; i++) d.update(0.05, 20 + i * 0.05, P, w);
    const h3 = P.hearts;
    // never over the top
    P.hearts = P.maxHearts - 0.25; d._specialT = 0; d.update(0.05, 30, P, w);
    const capped = P.hearts;
    // never on a knocked-out Kael
    P.hearts = 0; d._specialT = 0; d.update(0.05, 31, P, w);
    const ko = P.hearts;
    P.hearts = P.maxHearts;
    drain(d, 2);
    out.tide = { h0, h1, h2, h3, heal: SPECIAL.tide.heal, twirls, capped, max: P.maxHearts, ko,
      fxLeft: d._fx.length };
    // a tide dragon's bite never chains
    put(foes[0], d.x + 0.8, d.z); put(foes[1], d.x + 2.0, d.z);
    const b0 = foes[1].hp; d._specialT = 0; d._biteT = 0;
    for (let i = 0; i < 30; i++) d.update(0.05, 40 + i * 0.05, P, w);
    out.tide.neverChains = foes[1].hp === b0 || Math.hypot(foes[1].x - d.x, foes[1].z - d.z) <= 1.3;
    g.scene.remove(d.root);
  }

  // ---- STORM: the chain ---------------------------------------------------
  {
    const d = await make('storm');
    d.place(px, pz); d._specialT = 0; d._biteT = 0;
    // A bitten next to the dragon; B within reach of A; C within reach of B
    // but not of A; D far from everyone
    put(foes[0], px + 0.9, pz);
    put(foes[1], px + 0.9 + 2.6, pz + 0.6);
    put(foes[2], px + 0.9 + 5.0, pz + 1.4);
    put(foes[3], px - 9, pz - 9);
    const hp0 = foes.map((e) => e.hp);
    let bolts = 0;
    for (let i = 0; i < 12; i++) {
      d.update(0.05, i * 0.05, P, w);
      bolts = Math.max(bolts, d._fx.filter((f) => f.flat && f.obj.parent === g.scene).length);
    }
    const hp1 = foes.map((e) => e.hp);
    out.storm = {
      bitten: hp1[0] < hp0[0],
      chainedB: hp1[1] < hp0[1], chainedC: hp1[2] < hp0[2], farUntouched: hp1[3] === hp0[3],
      links: d.lastSpecial && d.lastSpecial.links, bolts,
    };
    // the clock: the next bites inside SPECIAL.storm.every do not chain
    const hpB = foes[1].hp, hpC = foes[2].hp;
    for (let i = 0; i < (SPECIAL.storm.every - 0.5) * 20; i++) d.update(0.05, 5 + i * 0.05, P, w);
    out.storm.noChainInCooldown = foes[1].hp === hpB && foes[2].hp === hpC;
    drain(d, 1);
    out.storm.fxLeft = d._fx.length;
    g.scene.remove(d.root);
  }
  return out;
});

console.log('\n── EMBER: the breath ────────────────────────────────');
check('the fire dragon breathes once a foe is in reach', res.fire.started, res.fire);
check('every foe inside the cone is singed', res.fire.hitInCone.every(Boolean), res.fire.hitInCone);
check('the foe behind it is untouched', res.fire.behindUntouched);
check('the breath reports the three it caught', res.fire.lastSpecial && res.fire.lastSpecial.hits === 3,
  res.fire.lastSpecial);
check('real fire sprites are in the scene during the breath', res.fire.spritesDuringBreath >= 3,
  { sprites: res.fire.spritesDuringBreath });
check('no second breath lands inside the cooldown', res.fire.noSecondBreath);
check('every breath sprite is gone once spent (nothing leaks)',
  res.fire.spritesAfter === 0 && res.fire.fxLeft === 0, res.fire);
check('a fire dragon never mends', res.fire.neverMends);

console.log('\n── TIDE: the mend ───────────────────────────────────');
const T = res.tide;
check('a hurt Kael gets half a heart back', Math.abs(T.h1 - T.h0 - T.heal) < 1e-9, T);
check('the mend is seen — swirls rise round Kael', T.twirls >= 1, { twirls: T.twirls });
check('nothing more until its own clock comes round', T.h2 === T.h1, T);
check('...and then it mends again', T.h3 > T.h2, T);
check('never over the top', T.capped === T.max, T);
check('never on a knocked-out Kael (a mend is not a revive)', T.ko === 0, T);
check('the swirls are gone once spent', T.fxLeft === 0, T);
check('a tide dragon\'s bite never chains', T.neverChains);

console.log('\n── STORM: the chain ─────────────────────────────────');
const S = res.storm;
check('the bite lands', S.bitten, S);
check('it jumps to the next foe in reach', S.chainedB, S);
check('...and on again from there', S.chainedC, S);
check('never to a foe out of reach', S.farUntouched, S);
check('two links, and a bolt laid between foes', S.links === 2 && S.bolts >= 1, S);
check('no chain inside its own cooldown', S.noChainInCooldown, S);
check('the bolts are gone once spent', S.fxLeft === 0, S);

check('no page errors', wk.errors.length === 0, wk.errors.slice(0, 3));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — three dragons, three moves');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
