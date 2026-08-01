// Den minigames — the villagers HOST little games (step into the gold ring
// by a host to play; gold = "act here", contract color law). One per host:
//
//   🎯 Rook's Sharp Eye  — targets pop up around the den; hit them all
//                          before his clock runs out (bolt, bite or blade).
//                          Available once Rook has arrived (Ember healed).
//   📦 Wren's Shuffle    — a coin drops into one of three crates, the crates
//                          dance, smash the right one. Watch CLOSELY.
//   🐾 Pip's Paw Path    — four glowing paw-pads chime a pattern; step it
//                          back. One more paw every round.
//
// Rewards are shards (big on a game's first win, small on repeats — the
// counters feed the sticker book) and every game is infinitely retryable,
// no fail-lockouts: these are campfire games, not exams. Gentle profiles
// get slower shuffles, longer clocks and shorter patterns (CONFIG.DEN_GAMES).

import * as THREE from 'three';
import { loadGLB, prepareModel } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { CONFIG } from './config.js';
import { juice } from './juice.js';
import { spawnShards } from './loot.js';
import { bumpCounter } from './progress.js';
import { bigToast } from './menus.js';
import { WS } from './worldstate.js';

const G = () => CONFIG.DEN_GAMES;
const gentle = () => !!state.settings.easy;

// shards for a win: generous the first time, pocket money after
function reward(counter) {
  return state.counters[counter] ? G().REWARD_REPEAT : G().REWARD_FIRST;
}

function actRing(world, x, z) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.78, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.05, z);
  world.add(ring);
  return ring;
}

function nearRing(player, ring, r = 0.8) {
  const dx = player.root.position.x - ring.position.x;
  const dz = player.root.position.z - ring.position.z;
  return dx * dx + dz * dz < r * r;
}

// ---------------------------------------------------------------------------
// 🎯 Rook's Sharp Eye
// ---------------------------------------------------------------------------

// safe target spots spread across the den (clear of tents/trees/furniture)
const TARGET_SPOTS = [
  [0, -1.6], [3.0, 0.6], [-3.2, -1.0], [2.2, -3.6], [-4.0, 0.2],
  [1.2, 3.2], [-2.0, 2.2], [4.2, -1.8], [-5.6, -1.2], [2.6, 2.4],
];

class GameTarget {
  constructor(world, x, z, onPop) {
    this.x = x; this.z = z;
    this.radius = 0.6;
    this.dead = false;
    this.scenery = true; // never feeds the moon, never body-resolved
    this.hp = 1;
    this._onPop = onPop;
    this.world = world;
    const group = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 1 })
    );
    post.position.y = 0.45;
    this.gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xffd76a, emissiveIntensity: 2.4, roughness: 1,
      })
    );
    this.gem.position.y = 1.15;
    group.add(post, this.gem);
    group.position.set(x, 0, z);
    world.add(group);
    this.root = group;
  }
  update(dt, t) {
    this.gem.rotation.y += dt * 2.5;
    this.gem.position.y = 1.15 + Math.sin(t * 3.1 + this.x) * 0.08;
  }
  takeStun() {}
  takeDamage() {
    if (this.dead) return;
    this.dead = true;
    juice.burst(this.x, 1.1, this.z, 0xffd76a, 10);
    audio.play('pup-chime', { volume: 0.8, rate: 1.3, vary: 0.06 });
    this.world.root.remove(this.root);
    this._onPop();
  }
}

function makeTargetGame(world) {
  const ring = actRing(world, 4.2, -0.4); // beside Rook's watch spot
  const g = {
    id: 'rook', state: 'idle', chip: '', cool: 0,
    count: 0, goal: 0, timeLeft: 0, target: null,
  };
  const clearTarget = () => {
    if (!g.target) return;
    const i = world.enemies.indexOf(g.target);
    if (i >= 0) world.enemies.splice(i, 1);
    if (!g.target.dead) world.root.remove(g.target.root);
    g.target = null;
  };
  const nextTarget = () => {
    const spot = TARGET_SPOTS[Math.floor(Math.random() * TARGET_SPOTS.length)];
    g.target = new GameTarget(world, spot[0], spot[1], () => {
      const i = world.enemies.indexOf(g.target);
      if (i >= 0) world.enemies.splice(i, 1);
      g.target = null;
      g.count++;
      if (g.count >= g.goal) {
        g.state = 'cool'; g.cool = 4; g.chip = '';
        audio.play('checkpoint', { volume: 0.9, rate: 1.2 });
        const n = reward('gameRook');
        bumpCounter('gameRook');
        spawnShards(world, ring.position.x, ring.position.z + 1, n);
        bigToast(`🎯 Sharp Eye! Rook salutes you · 🔸 ${n}`);
      } else {
        nextTarget();
      }
    });
    world.enemies.push(g.target);
  };
  g.update = (dt, t, player, busy) => {
    ring.material.opacity = g.state === 'idle' ? 0.55 + Math.sin(t * 3) * 0.2 : 0.2;
    if (g.state === 'idle') {
      if (!busy && nearRing(player, ring)) {
        g.state = 'play';
        g.count = 0;
        g.goal = G().TARGET_COUNT - (gentle() ? 1 : 0);
        g.timeLeft = G().TARGET_TIME + (gentle() ? 15 : 0);
        audio.play('ui-click', { volume: 0.8, rate: 1.2 });
        bigToast(`🎯 Rook: "Hit ${g.goal} gold targets! Go!"`);
        nextTarget();
      }
    } else if (g.state === 'play') {
      g.timeLeft -= dt;
      g.chip = `🎯 ${g.count}/${g.goal} · ${Math.ceil(g.timeLeft)}s`;
      if (g.timeLeft <= 0) {
        clearTarget();
        g.state = 'cool'; g.cool = 4; g.chip = '';
        audio.play('parry', { volume: 0.4, rate: 0.6 });
        bigToast(`🎯 ${g.count}/${g.goal} — "Nearly! Step in to try again."`);
      }
    } else if (g.state === 'cool') {
      g.cool -= dt;
      if (g.cool <= 0 && !nearRing(player, ring, 1.4)) g.state = 'idle';
    }
  };
  g.busy = () => g.state === 'play';
  return g;
}

// ---------------------------------------------------------------------------
// 📦 Wren's Shuffle
// ---------------------------------------------------------------------------

const SLOT_X = [-6.2, -4.8, -3.4]; // wide spacing — a swing can't straddle all three
const SLOT_Z = 4.2;

class ShuffleCrate {
  constructor(world, mesh, slot, game) {
    this.world = world;
    this.mesh = mesh;
    this.slot = slot;         // current slot index (0..2)
    this.hasCoin = false;
    this.x = SLOT_X[slot]; this.z = SLOT_Z;
    this.radius = 0.45;
    this.dead = false;
    this.scenery = true;
    this.hp = 1;
    this.g = game;
  }
  update() {}
  takeStun() {}
  takeDamage() {
    if (this.g.state !== 'pick') return; // only smashable at answer time
    // one swing can clip TWO crates — candidates collect for a frame and
    // the one nearest the player wins, so the kid's aim decides, not
    // array order
    this.g.pickCandidates.push(this);
  }
  place() {
    this.x = SLOT_X[this.slot];
    this.mesh.position.set(this.x, 0, this.z);
  }
}

async function makeShuffleGame(world) {
  const crateGltf = await loadGLB('./assets/loot/survival/crate.glb');
  const ring = actRing(world, -4.8, 2.8); // in front of Wren's tent row
  const coin = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffd76a, emissiveIntensity: 2.6, roughness: 1,
    })
  );
  coin.visible = false;
  world.add(coin);

  const g = {
    id: 'wren', state: 'idle', chip: '', crates: [], pickCandidates: [],
    swapLeft: 0, swapT: 0, pair: null, waitT: 0, pickT: 0,
  };

  const teardown = () => {
    for (const c of g.crates) {
      const i = world.enemies.indexOf(c);
      if (i >= 0) world.enemies.splice(i, 1);
      world.root.remove(c.mesh);
    }
    g.crates = [];
    coin.visible = false;
  };
  const setup = () => {
    teardown();
    for (let s = 0; s < 3; s++) {
      const mesh = prepareModel(crateGltf.scene.clone());
      mesh.scale.setScalar(0.8);
      const c = new ShuffleCrate(world, mesh, s, g);
      c.place();
      world.add(mesh);
      g.crates.push(c);
    }
    const lucky = g.crates[Math.floor(Math.random() * 3)];
    lucky.hasCoin = true;
    // the reveal: coin hovers over its crate, then sinks in
    coin.visible = true;
    coin.position.set(lucky.x, 1.15, SLOT_Z);
    g.state = 'show';
    g.waitT = 1.4;
    audio.play('coin', { volume: 0.8, rate: 1.1 });
  };
  const startSwap = () => {
    const a = Math.floor(Math.random() * 3);
    let b = Math.floor(Math.random() * 3);
    if (b === a) b = (a + 1) % 3;
    g.pair = [g.crates.find((c) => c.slot === a), g.crates.find((c) => c.slot === b)];
    g.swapT = 0;
    audio.play('whoosh', { volume: 0.35, rate: 1.5, vary: 0.15 });
  };
  g.picked = (crate) => {
    g.state = 'reveal';
    g.chip = '';
    if (crate.hasCoin) {
      coin.visible = true;
      coin.position.set(crate.x, 0.9, crate.z);
      world.root.remove(crate.mesh);
      audio.play('coin', { volume: 0.9, rate: 1.0 });
      audio.play('checkpoint', { volume: 0.8, rate: 1.3 });
      const n = reward('gameWren');
      bumpCounter('gameWren');
      spawnShards(world, crate.x, crate.z - 0.8, n);
      bigToast(`📦 Found it! Wren winks · 🔸 ${n}`);
      g.waitT = 1.6;
      g.win = true;
    } else {
      world.root.remove(crate.mesh);
      juice.burst(crate.x, 0.5, crate.z, 0x9a8ab0, 8);
      audio.play('parry', { volume: 0.4, rate: 0.55 });
      bigToast('📦 Empty! Watch closer this time…');
      g.waitT = 1.4;
      g.win = false;
    }
  };
  g.update = (dt, t, player, busy) => {
    ring.material.opacity = g.state === 'idle' ? 0.55 + Math.sin(t * 3 + 1) * 0.2 : 0.2;
    if (g.state === 'idle') {
      if (!busy && nearRing(player, ring)) {
        audio.play('ui-click', { volume: 0.8, rate: 1.2 });
        bigToast('📦 Wren: "Coin goes in a crate. Eyes on it!"');
        g.swapLeft = G().SHUFFLE_SWAPS - (gentle() ? 1 : 0);
        setup();
      }
      return;
    }
    if (g.state === 'show') {
      g.waitT -= dt;
      coin.rotation.y = t * 3;
      if (g.waitT > 0.4) coin.position.y = 1.15;
      else coin.position.y = Math.max(0.35, 1.15 - (0.4 - g.waitT) * 2.2); // sink in
      if (g.waitT <= 0) {
        coin.visible = false;
        g.state = 'shuffle';
        startSwap();
      }
    } else if (g.state === 'shuffle') {
      const dur = G().SWAP_TIME + (gentle() ? 0.13 : 0);
      g.swapT += dt / dur;
      const [a, b] = g.pair;
      const f = Math.min(1, g.swapT);
      const e = f * f * (3 - 2 * f); // smoothstep
      const ax = SLOT_X[a.slot], bx = SLOT_X[b.slot];
      a.mesh.position.x = ax + (bx - ax) * e;
      b.mesh.position.x = bx + (ax - bx) * e;
      // a little arc so the crossing crates read as two separate movers
      a.mesh.position.z = SLOT_Z - Math.sin(f * Math.PI) * 0.45;
      b.mesh.position.z = SLOT_Z + Math.sin(f * Math.PI) * 0.45;
      if (f >= 1) {
        const s = a.slot; a.slot = b.slot; b.slot = s;
        a.place(); b.place();
        g.swapLeft--;
        if (g.swapLeft > 0) startSwap();
        else {
          g.state = 'pick';
          g.pickT = 45; // wander-off timeout
          g.chip = '📦 Smash the coin crate!';
          for (const c of g.crates) world.enemies.push(c); // smashable NOW
        }
      }
    } else if (g.state === 'pick') {
      if (g.pickCandidates.length) {
        let best = g.pickCandidates[0], bd = Infinity;
        for (const c of g.pickCandidates) {
          const dx = player.root.position.x - c.x, dz = player.root.position.z - c.z;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = c; }
        }
        g.pickCandidates.length = 0;
        g.picked(best);
        return;
      }
      g.pickT -= dt;
      if (g.pickT <= 0) { teardown(); g.state = 'idle'; g.chip = ''; }
    } else if (g.state === 'reveal') {
      g.waitT -= dt;
      if (coin.visible) { coin.rotation.y = t * 4; coin.position.y = 0.9 + Math.sin(t * 5) * 0.06; }
      if (g.waitT <= 0) {
        if (g.win) {
          teardown();
          g.state = 'cool'; g.cool = 3;
        } else {
          // same session, fresh shuffle — watch again, no shame
          g.swapLeft = G().SHUFFLE_SWAPS - (gentle() ? 1 : 0);
          setup();
        }
      }
    } else if (g.state === 'cool') {
      g.cool -= dt;
      if (g.cool <= 0 && !nearRing(player, ring, 1.4)) g.state = 'idle';
    }
  };
  g.busy = () => g.state !== 'idle' && g.state !== 'cool';
  return g;
}

// ---------------------------------------------------------------------------
// 🐾 Pip's Paw Path
// ---------------------------------------------------------------------------

const PADS = [
  { x: -2.6, z: -0.6, color: 0x5aa0ff, rate: 0.8 },
  { x: -1.4, z: -0.6, color: 0xffd76a, rate: 1.0 },
  { x: -2.6, z: 0.6, color: 0x7ad078, rate: 1.2 },
  { x: -1.4, z: 0.6, color: 0xb48aff, rate: 1.5 },
];

function makePawGame(world) {
  const ring = actRing(world, -3.6, 0.0); // beside the pad square
  const pads = PADS.map((p) => {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({
        color: p.color, transparent: true, opacity: 0.28, depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, 0.04, p.z);
    world.add(mesh);
    return { ...p, mesh, lit: 0 };
  });
  const light = (i, hold = 0.45) => {
    pads[i].lit = hold;
    audio.play('pup-chime', { volume: 0.7, rate: pads[i].rate });
  };
  const g = {
    id: 'pip', state: 'idle', chip: '', seq: [], step: 0, inIdx: 0,
    round: 1, target: 5, waitT: 0, lastPad: -1, fails: 0,
  };
  const extend = () => {
    let n = Math.floor(Math.random() * 4);
    if (g.seq.length && n === g.seq[g.seq.length - 1]) n = (n + 1) % 4; // no doubles
    g.seq.push(n);
  };
  const playback = () => {
    g.state = 'playback';
    g.step = 0;
    g.waitT = 0.7; // breath before the first chime
    g.chip = '🐾 watch…';
  };
  g.update = (dt, t, player, busy) => {
    ring.material.opacity = g.state === 'idle' ? 0.55 + Math.sin(t * 3 + 2) * 0.2 : 0.2;
    for (const p of pads) {
      if (p.lit > 0) p.lit -= dt;
      p.mesh.material.opacity = p.lit > 0 ? 0.95 : 0.28;
    }
    const stepTime = G().PAW_STEP_TIME + (gentle() ? 0.2 : 0);
    const padAt = () => {
      for (let i = 0; i < 4; i++) {
        const dx = player.root.position.x - pads[i].x;
        const dz = player.root.position.z - pads[i].z;
        if (dx * dx + dz * dz < 0.55 * 0.55) return i;
      }
      return -1;
    };
    if (g.state === 'idle') {
      if (!busy && nearRing(player, ring)) {
        g.seq = []; g.round = 1; g.fails = 0;
        g.target = G().PAW_ROUNDS - (gentle() ? 1 : 0);
        extend(); extend(); // round 1 = two paws
        audio.play('ui-click', { volume: 0.8, rate: 1.2 });
        bigToast('🐾 Pip: "Watch the paws sing — then step the same song!"');
        playback();
      }
      return;
    }
    if (g.state === 'playback') {
      g.waitT -= dt;
      if (g.waitT <= 0) {
        if (g.step < g.seq.length) {
          light(g.seq[g.step], stepTime * 0.8);
          g.step++;
          g.waitT = stepTime;
        } else {
          g.state = 'input';
          g.inIdx = 0;
          g.lastPad = padAt(); // standing here doesn't count — step fresh
          g.chip = `🐾 Round ${g.round}/${g.target} — your turn!`;
        }
      }
    } else if (g.state === 'input') {
      const on = padAt();
      if (on !== g.lastPad) {
        g.lastPad = on;
        if (on >= 0) {
          if (on === g.seq[g.inIdx]) {
            light(on, 0.35);
            g.inIdx++;
            if (g.inIdx >= g.seq.length) {
              if (g.round >= g.target) {
                g.state = 'cool'; g.cool = 4; g.chip = '';
                audio.play('checkpoint', { volume: 0.9, rate: 1.25 });
                const n = reward('gamePip');
                bumpCounter('gamePip');
                spawnShards(world, -2.0, 0.0, n);
                bigToast(`🐾 Paw Path PERFECT! Pip zooms happy laps · 🔸 ${n}`);
              } else {
                g.round++;
                extend();
                audio.play('coin', { volume: 0.5, rate: 1.4 });
                g.waitT = 0.9;
                playback();
              }
            }
          } else {
            g.fails++;
            audio.play('parry', { volume: 0.4, rate: 0.5 });
            if (g.fails >= 3) {
              g.state = 'cool'; g.cool = 4; g.chip = '';
              spawnShards(world, -2.0, 0.0, 2); // consolation sparkle
              bigToast('🐾 "Great try! The paws will sing again."');
            } else {
              bigToast('🐾 Oops! Listen once more…');
              g.waitT = 0.9;
              playback();
            }
          }
        }
      }
    } else if (g.state === 'cool') {
      g.cool -= dt;
      if (g.cool <= 0 && !nearRing(player, ring, 1.4)) g.state = 'idle';
    }
  };
  g.busy = () => g.state !== 'idle' && g.state !== 'cool';
  return g;
}

// ---------------------------------------------------------------------------

export async function setupDenGames(world) {
  const games = [];
  if (WS.get('ember', 'restored')) games.push(makeTargetGame(world)); // Rook must be home
  games.push(await makeShuffleGame(world));
  games.push(makePawGame(world));
  world.denGames = games;
  const chipEl = document.getElementById('mg-chip');
  world.updateMinigames = (dt, t, player) => {
    const busy = games.some((g) => g.busy());
    let text = '';
    for (const g of games) {
      // a game only STARTS when no sibling is mid-round
      g.update(dt, t, player, busy && !g.busy());
      if (g.chip) text = g.chip;
    }
    if (chipEl.textContent !== text) chipEl.textContent = text;
    chipEl.style.display = text ? 'block' : 'none';
  };
}
