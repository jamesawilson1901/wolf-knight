// THE COMPANION DRAGON (design/DRAGON-EGGS.md) — the hatched reward of the
// hidden dragon-egg side quest. Follows Kael the same way Pip does
// (js/pip.js `update(dt, t, player, world)` is the direct template for the
// follow half) and auto-attacks nearby enemies with the SAME Dragon.glb body
// Dragonling already uses (js/enemies.js `buildDragonBody`, extracted from
// Dragonling for exactly this reuse) — but with an entirely different state
// machine, because Dragonling's is built assuming hostility TOWARD the
// player and this dragon fights FOR him.
//
// No new geometry, per CLAUDE.md: Dragon.glb, retinted per element with the
// SAME {Main, Belly, Claws, Wings, Eyes} material-name tint map every other
// Dragon.glb reskin in the game already uses (js/enemies.js MONSTER_ROSTER's
// frost-dragonling/shadow-dragonling), using this game's own established
// elemental palette (js/player.js WOLF_TINTS) rather than inventing new
// colours — a fire dragon is exactly Fire Wolf orange, a tide dragon is
// exactly Tide Wolf teal, a storm dragon is exactly Storm Wolf periwinkle.
import * as THREE from 'three';
import { loadGLB, SHARED } from './assets.js';
import { buildDragonBody } from './enemies.js';
import { WOLF_TINTS } from './player.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

const DRAGON_URL = './assets/chars/monsters/Dragon.glb';

// {Main, Belly, Claws, Wings, Eyes} — the real material names on Dragon.glb
// (confirmed against MONSTER_ROSTER's own frost-dragonling/shadow-dragonling
// tint maps in js/enemies.js). Belly/Claws/Wings get a darker or lighter
// share of the same body colour rather than the wolf's own belly/claw
// shades, which were never designed for a dragon's proportions; Main and
// Eyes are lifted verbatim from WOLF_TINTS so the palette matches exactly.
function bodyTint(el) {
  const w = WOLF_TINTS[el + '_wolf'] || WOLF_TINTS.fire_wolf;
  const main = new THREE.Color(w.main);
  const dark = main.clone().multiplyScalar(0.45);
  const light = main.clone().lerp(new THREE.Color(0xffffff), 0.35);
  return {
    Main: main.getHex(), Belly: light.getHex(),
    Claws: dark.getHex(), Wings: main.clone().multiplyScalar(0.75).getHex(),
    Eyes: w.eyes,
  };
}

function makeTint(map) {
  return (m) => {
    if (map[m.name] === undefined) return;
    m.color && m.color.setHex(map[m.name]);
    if (m.name === 'Eyes') { m.emissive && m.emissive.setHex(map[m.name]); m.emissiveIntensity = 1.4; }
  };
}

// --- tunables ---------------------------------------------------------
const FOLLOW_DIST = 2.2;     // stays this far behind Kael while idle
// A FLAT SCALE, NOT fitHeight. `buildDragonBody`'s `fitHeight` path measures
// a fresh bind-pose bounding box via `Box3().setFromObject()`, which reports
// a wildly inflated height for Dragon.glb specifically (a SkinnedMesh's
// unposed bind-pose box, not the animated silhouette) — the companion
// rendered at an invisible ~0.002 scale the first time this shipped, caught
// by looking at the actual screenshot rather than trusting the number, per
// CLAUDE.md's own "verify via real input paths, not inference" rule.
// Dragonling itself has never hit this: every dragonling in MONSTER_ROSTER
// passes a flat `scale` (0.5), never `fitHeight`, and its own comment says
// so ("Dragon.glb has always come in at a flat 0.5"). 0.7 reads as a
// shoulder-height pet — bigger than Pip (0.22), smaller than Kael, and
// visibly bigger than the boss-scale Dragonling (0.5) so the two are never
// mistaken for each other.
const SCALE = 0.7;
const HUNT_RANGE = 6.5;      // an enemy within this of the PLAYER is worth breaking off to hunt
const GIVE_UP_RANGE = 9.5;   // stop chasing if the target drifts this far from the player (hysteresis)
const BITE_RANGE = 1.2;      // melee reach once alongside the target
const BITE_COOLDOWN = 0.9;   // seconds between bites once in range
const BITE_DMG = 1.5;        // modest support damage — a companion, not a second player
const CHASE_SPEED = 6.0;
const FOLLOW_SPEED_FAR = 6.4;
const FOLLOW_SPEED_NEAR = 3.6;
export const EMERGE_RISE_TIME = 0.9; // seconds the "jumps out of the portal" scale-up takes

// THE ELEMENT MOVES (2026-09-28, design/DRAGON-EGGS.md "Dragon specials").
// Until now all three dragons were the same pet in three colours: follow,
// bite, repeat. Each now does the one thing its element is FOR, on its own
// clock, with nothing for the child to press — a companion acts, it is not
// a second set of controls.
//
//   * EMBER breathes fire: a short cone in front of it, every foe inside
//     singed once. The bite is one enemy; the breath is the crowd.
//   * TIDE mends: while Kael is hurt, half a heart back on a slow clock —
//     the same half heart an enemy's ember drop gives, so the number is one
//     the game already tuned, just delivered by a friend.
//   * STORM chains: a bite that jumps on to the next foe and the next.
//
// Every number is a SUPPORT number, kept under the player's own: one breath
// is less than one sword swing per foe, the mend is slower than a potion by a
// wide margin, a chain link is half a bite. A dragon helps; it never plays the
// game for the child (the same "a companion, not a second player" line
// BITE_DMG was drawn on).
export const SPECIAL = {
  fire:  { every: 6.0, reach: 3.4, halfArc: 0.62, dmg: 1.25, dur: 0.55 },
  tide:  { every: 12.0, heal: 0.5 },
  storm: { every: 3.0, jumps: 2, reach: 3.6, dmg: 0.75 },
};

const FX_URLS = { fire: './assets/fx/fire.png', twirl: './assets/fx/twirl.png', bolt: './assets/fx/bolt.png' };
let fxTex = null;
function fxTextures() {
  if (fxTex) return fxTex;
  fxTex = {};
  const loader = new THREE.TextureLoader();
  for (const [k, url] of Object.entries(FX_URLS)) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    SHARED.add(t);          // lives for the session; no room teardown may free it
    fxTex[k] = t;
  }
  return fxTex;
}

let cachedGltf = null;
async function dragonGltf() {
  if (!cachedGltf) cachedGltf = await loadGLB(DRAGON_URL);
  return cachedGltf;
}

export class CompanionDragon {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;
    this.element = null;
    this._loaded = false;
    this._target = null;
    this._biteT = 0;
    this._emergeT = 0;
    this._seed = Math.random() * 10;
    // the element move's own clock, and what is in flight
    this._specialT = 2.0;   // a first move comes a moment after it arrives, not on frame one
    this._breath = null;    // { t, hit:Set } while breathing
    this._fx = [];          // short-lived sprites/planes this dragon owns
    this.lastSpecial = null; // { kind, at, ... } — the dev harness and suites read it
  }

  async load(element) {
    const gltf = await dragonGltf();
    const body = buildDragonBody(gltf, {
      scale: SCALE,
      clips: { fly: 'DragonArmature|Dragon_Flying', bite: 'DragonArmature|Dragon_Attack' },
      tint: makeTint(bodyTint(element)),
    });
    this.model = body.model;
    this.mixer = body.mixer;
    this.actions = body.actions;
    this.syncEyes = body.syncEyes;
    this.root.add(this.model);
    if (this.actions.fly) { this.actions.fly.play(); this.actions.fly.timeScale = 0.5; }
    this._current = 'fly';
    this._loaded = true;
    this.element = element;
  }

  // Swapping the equipped dragon RETINTS the same body rather than
  // despawning and reloading Dragon.glb a second time — one fewer network
  // fetch (it is already cached, loadGLB memoizes by URL, but rebuilding the
  // skinned mesh from scratch is not free) and one fewer pop of the model
  // vanishing and reappearing mid-session. Documented per the brief's own
  // "your call, document it".
  setElement(element) {
    if (!this._loaded || this.element === element) return;
    this.element = element;
    this._breath = null;
    this._specialT = 2.0;
    const tint = makeTint(bodyTint(element));
    this.model.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) tint(m);
    });
  }

  _play(name) {
    if (this._current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset().play();
    if (this._current && this.actions[this._current]) this.actions[this._current].crossFadeTo(next, 0.15, false);
    this._current = name;
  }

  place(x, z) {
    this.root.position.set(x, 0.9, z);
    this.x = x; this.z = z;
  }

  // THE HATCH MOMENT (design/DRAGON-EGGS.md) — dad's own ask: "the baby
  // dragon after a few seconds jumps out." js/main.js's #btn-dragon handler
  // calls this once the covering popup's own delay has elapsed, at the
  // SHRINE's position rather than the player's own (place()'s usual spot) —
  // it visibly comes OUT of the portal, not out of thin air beside Kael.
  // Scales up from near-nothing over EMERGE_RISE_TIME; `update()` below
  // holds off on follow/hunt logic for exactly that long so it does not
  // immediately dash toward the player mid-reveal.
  emergeAt(x, z) {
    this.x = x; this.z = z;
    this.emergedFrom = { x, z };   // where it came out — it follows Kael a moment later
    this.root.position.set(x, 0.9, z);
    this.root.visible = true;
    this.root.scale.setScalar(0.05);
    this._emergeT = EMERGE_RISE_TIME;
    juice.burst(x, 0.9, z, WOLF_TINTS[this.element + '_wolf']?.main ?? 0xffffff, 22);
    audio.play('checkpoint', { volume: 0.7, rate: 1.3 });
  }

  // `dt`/`t`/`player`/`world` — the SAME signature as Pip's own
  // update(dt, t, player, world), the direct template for the follow half.
  update(dt, t, player, world) {
    if (!this._loaded || !this.root.visible) return;
    if (this.x === undefined) { this.x = this.root.position.x; this.z = this.root.position.z; }
    if (this._emergeT > 0) {
      this._emergeT -= dt;
      const p = 1 - Math.max(0, this._emergeT) / EMERGE_RISE_TIME;
      this.root.scale.setScalar(0.05 + 0.95 * Math.min(1, p));
      this._play('fly');
      this.mixer.update(dt);
      if (this.syncEyes) this.syncEyes();
      return; // no follow/hunt while still rising out of the portal
    }
    const px = player.root.position.x, pz = player.root.position.z;
    this._specialT -= dt;
    this._tickFx(dt);
    if (this._breath) this._tickBreath(dt, world);
    // THE MEND runs on its own clock, fight or no fight: a hurt child standing
    // still after a scrape is exactly when a friend should help.
    if (this.element === 'tide') this._tryMend(player);

    // Pick or drop a hunt target. Enemies live in world.enemies (the same
    // list js/enemies.js's own updateEnemies drives and the player's own
    // attacks resolve damage against — js/enemies.js Enemy#takeDamage).
    if (this._target && (this._target.dead ||
        Math.hypot(this._target.x - px, this._target.z - pz) > GIVE_UP_RANGE)) {
      this._target = null;
    }
    if (!this._target && world && world.enemies && world.enemies.length) {
      let best = null, bestD = HUNT_RANGE;
      for (const e of world.enemies) {
        // a pot is in world.enemies so a sword can break it (loot.js
        // Breakable, `scenery`), but it is not a foe — a dragon that flew
        // off to bite jars mid-fight, and spent its breath on them, is not
        // helping anybody
        if (e.dead || e.scenery) continue;
        const d = Math.hypot(e.x - px, e.z - pz);
        if (d < bestD) { bestD = d; best = e; }
      }
      this._target = best;
    }

    if (this._target && !this._target.dead) {
      const tx = this._target.x, tz = this._target.z;
      const dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      // THE BREATH: once a foe is inside the cone's reach, the fire dragon
      // stops closing and breathes instead of biting — from where it hovers
      if (this.element === 'fire' && !this._breath && this._specialT <= 0
          && d <= SPECIAL.fire.reach) {
        this.root.rotation.y = Math.atan2(dx, dz);
        this._startBreath(dx / (d || 1), dz / (d || 1));
      }
      if (this._breath) {
        this.root.rotation.y = Math.atan2(this._breath.dx, this._breath.dz);
        this._play('bite');
      } else if (d > BITE_RANGE) {
        const step = CHASE_SPEED * dt;
        const s = world ? world.resolveCircle(this.x + (dx / d) * step, this.z + (dz / d) * step, 0.4)
          : { x: this.x + (dx / d) * step, z: this.z + (dz / d) * step };
        this.x = s.x; this.z = s.z;
        this.root.rotation.y = Math.atan2(dx, dz);
        this._play('fly');
        if (this.actions.fly) this.actions.fly.timeScale = 1.6;
      } else {
        this.root.rotation.y = Math.atan2(dx, dz);
        this._biteT -= dt;
        if (this._biteT <= 0) {
          this._biteT = BITE_COOLDOWN;
          this._play('bite');
          audio.play('hit', { volume: 0.5, rate: 1.15 });
          // takeDamage(n, element, kind) — the SAME hit-resolution path the
          // player's own melee/bolt/aoe attacks already use (js/enemies.js
          // Enemy#takeDamage), reused rather than a parallel damage function.
          const bitten = this._target;
          this._target.takeDamage(BITE_DMG, this.element, 'melee');
          if (this.element === 'storm' && this._specialT <= 0) this._chain(bitten, world);
        }
      }
    } else {
      // FOLLOW — Pip's own idiom: stay ~FOLLOW_DIST behind Kael, trot or
      // sprint to catch up, idle bob otherwise.
      const dx = px - this.x, dz = pz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > FOLLOW_DIST) {
        const speed = d > 5 ? FOLLOW_SPEED_FAR : FOLLOW_SPEED_NEAR;
        const step = Math.min(d - FOLLOW_DIST * 0.8, speed * dt);
        const s = world ? world.resolveCircle(this.x + (dx / d) * step, this.z + (dz / d) * step, 0.4)
          : { x: this.x + (dx / d) * step, z: this.z + (dz / d) * step };
        this.x = s.x; this.z = s.z;
        this.root.rotation.y = Math.atan2(dx, dz);
      }
      this._play('fly');
      if (this.actions.fly) this.actions.fly.timeScale = d > FOLLOW_DIST ? 1.1 : 0.5;
    }

    this.root.position.x = this.x;
    this.root.position.z = this.z;
    this.root.position.y = 0.9 + Math.sin(t * 2.1 + this._seed) * 0.12;
    this.mixer.update(dt);
    if (this.syncEyes) this.syncEyes();
  }

  // ---------------------------------------------------------------------
  // THE ELEMENT MOVES
  // ---------------------------------------------------------------------

  // EMBER — a cone of fire in front of it for SPECIAL.fire.dur seconds. Each
  // foe inside is singed ONCE per breath (the Set), so standing in it longer
  // is no different from being caught at the edge: one breath, one hit.
  _startBreath(dx, dz) {
    const F = SPECIAL.fire;
    this._breath = { t: F.dur, dx, dz, hit: new Set(), puff: 0 };
    this._specialT = F.every;
    this.lastSpecial = { kind: 'breath', at: performance.now(), hits: 0 };
    audio.play('burn', { volume: 0.55, rate: 1.25 });
  }

  _tickBreath(dt, world) {
    const F = SPECIAL.fire, b = this._breath;
    b.t -= dt;
    // the fire itself: puffs thrown down the cone, growing as they go
    b.puff -= dt;
    if (b.puff <= 0) {
      b.puff = 0.05;
      const spread = (Math.random() - 0.5) * 2 * F.halfArc * 0.8;
      const c = Math.cos(spread), sn = Math.sin(spread);
      const vx = (b.dx * c - b.dz * sn) * 6.2, vz = (b.dx * sn + b.dz * c) * 6.2;
      this._sprite('fire', this.x + b.dx * 0.5, this.root.position.y - 0.1, this.z + b.dz * 0.5,
        Math.random() < 0.5 ? 0xff8a2b : 0xffc24a,
        { size: 0.55, grow: 2.6, life: F.reach / 6.2, vx, vz, vy: -0.4 });
    }
    if (world && world.enemies) {
      for (const e of world.enemies) {
        if (e.dead || e.scenery || b.hit.has(e)) continue;
        const ex = e.x - this.x, ez = e.z - this.z;
        const dist = Math.hypot(ex, ez);
        if (dist > F.reach || dist < 0.01) continue;
        const cos = (ex * b.dx + ez * b.dz) / dist;
        if (cos < Math.cos(F.halfArc)) continue;
        b.hit.add(e);
        e.takeDamage(F.dmg, 'fire', 'melee');
        juice.burst(e.x, 0.9, e.z, 0xff7a2a, 10);
        this.lastSpecial.hits = b.hit.size;
      }
    }
    if (b.t <= 0) this._breath = null;
  }

  // TIDE — half a heart back while Kael is hurt, on a slow clock. Never over
  // the top, never on a knocked-out Kael (a mend is not a revive).
  _tryMend(player) {
    if (this._specialT > 0 || !player || player.hearts <= 0) return;
    if (player.hearts >= player.maxHearts) return;
    const T = SPECIAL.tide;
    player.hearts = Math.min(player.maxHearts, player.hearts + T.heal);
    this._specialT = T.every;
    this.lastSpecial = { kind: 'mend', at: performance.now(), heal: T.heal };
    const x = player.root.position.x, z = player.root.position.z;
    for (let i = 0; i < 3; i++) {
      this._sprite('twirl', x, 0.3 + i * 0.35, z, 0x7fe8f0,
        { size: 1.1 + i * 0.25, grow: 1.5, life: 0.9, vy: 1.4, spin: 3 + i });
    }
    juice.burst(x, 1.0, z, 0x3fb0c4, 14);
    audio.play('potion', { volume: 0.45, rate: 1.2 });
  }

  // STORM — the bite jumps on: from the bitten foe to the nearest other live
  // one inside reach, then from THAT one on again, never the same foe twice.
  _chain(from, world) {
    const S = SPECIAL.storm;
    if (!world || !world.enemies || !from) return;
    this._specialT = S.every;
    const struck = new Set([from]);
    let at = { x: from.x, z: from.z };
    const links = [];
    for (let j = 0; j < S.jumps; j++) {
      let best = null, bestD = S.reach;
      for (const e of world.enemies) {
        if (e.dead || e.scenery || struck.has(e)) continue;
        const d = Math.hypot(e.x - at.x, e.z - at.z);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) break;
      struck.add(best);
      this._arc(at.x, at.z, best.x, best.z);
      links.push({ x: best.x, z: best.z });
      best.takeDamage(S.dmg, 'storm', 'melee');
      juice.burst(best.x, 1.0, best.z, 0xc9d4ff, 10);
      at = { x: best.x, z: best.z };
    }
    this.lastSpecial = { kind: 'chain', at: performance.now(), links: links.length };
    if (links.length) audio.play('parry', { volume: 0.5, rate: 2.2 });
  }

  // --- the moves' own visuals: billboards and a flat arc, all short-lived ---

  _scene() { return this.root.parent || null; }

  _sprite(key, x, y, z, color, o) {
    const scene = this._scene();
    if (!scene) return;
    const mat = new THREE.SpriteMaterial({ map: fxTextures()[key], color, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.setScalar(o.size);
    sp.frustumCulled = false;
    scene.add(sp);
    this._fx.push({ obj: sp, mat, t: 0, ...o });
  }

  // A BOLT LIES FLAT between two foes, a metre up — a sprite always faces the
  // camera and cannot point from one enemy to another; a plane can, and the
  // 3/4 camera looks down onto it.
  _arc(x0, z0, x1, z1) {
    const scene = this._scene();
    if (!scene) return;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const mat = new THREE.MeshBasicMaterial({ map: fxTextures().bolt, color: 0xdfe6ff,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.7), mat);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, -Math.atan2(z1 - z0, x1 - x0), 0);
    m.position.set((x0 + x1) / 2, 1.0, (z0 + z1) / 2);
    m.frustumCulled = false;
    scene.add(m);
    this._fx.push({ obj: m, mat, geo: m.geometry, t: 0, life: 0.22, size: 0, grow: 1, flat: true });
  }

  _tickFx(dt) {
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const f = this._fx[i];
      f.t += dt;
      const p = Math.min(1, f.t / f.life);
      if (!f.flat) {
        f.obj.scale.setScalar(f.size * (1 + (f.grow - 1) * p));
        f.obj.position.x += (f.vx || 0) * dt;
        f.obj.position.y += (f.vy || 0) * dt;
        f.obj.position.z += (f.vz || 0) * dt;
        if (f.spin) f.mat.rotation += f.spin * dt;
      }
      f.mat.opacity = 1 - p;
      if (p >= 1) {
        if (f.obj.parent) f.obj.parent.remove(f.obj);
        f.mat.dispose();
        if (f.geo) f.geo.dispose();
        this._fx.splice(i, 1);
      }
    }
  }
}
