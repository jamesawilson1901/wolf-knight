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
import { loadGLB } from './assets.js';
import { buildDragonBody } from './enemies.js';
import { WOLF_TINTS } from './player.js';
import { audio } from './audio.js';

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
    this._seed = Math.random() * 10;
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

  // `dt`/`t`/`player`/`world` — the SAME signature as Pip's own
  // update(dt, t, player, world), the direct template for the follow half.
  update(dt, t, player, world) {
    if (!this._loaded || !this.root.visible) return;
    if (this.x === undefined) { this.x = this.root.position.x; this.z = this.root.position.z; }
    const px = player.root.position.x, pz = player.root.position.z;

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
        if (e.dead) continue;
        const d = Math.hypot(e.x - px, e.z - pz);
        if (d < bestD) { bestD = d; best = e; }
      }
      this._target = best;
    }

    if (this._target && !this._target.dead) {
      const tx = this._target.x, tz = this._target.z;
      const dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > BITE_RANGE) {
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
          this._target.takeDamage(BITE_DMG, this.element, 'melee');
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
}
