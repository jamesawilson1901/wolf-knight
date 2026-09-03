// The Shadowgrip — Ember Hollow's boss, per design/COMBAT-SPEC.md.
// v3.18 (dad's playtest law): NO tentacles, NO phase machinery — the boss is
// simply a GIANT shadow wolf that fights exactly like the little shadow
// hounds, with a lot more health and a harder bite. Same telegraph language
// the kids already learned: deep crouch + eyes flare + claws scraping dust =
// a charge is coming (dodge/roll it); a close-up snarl windup = a paw swipe
// (block or parry it with the shield). After every charge it collapses,
// tired, under a gold act-here ring. Always hittable — every swing counts.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareCharacter } from './assets.js';
import { smokePuff } from './enemies.js';
import { state } from './state.js';
import { galeLane } from './wind.js';
import { waterZone, buildWaterField } from './water.js';
import { audio } from './audio.js';
import { juice } from './juice.js';
import { bumpCounter } from './progress.js';

const MAX_HP = 20;        // "a lot more health" — the little hounds have 3
const HIT_CAP = 3;        // any single strike caps at 3 (surges stay strong, never trivial)
const ATTACK_DMG = 1.5;   // "his attack is more" — hounds hit for 1

// The clip lookup every SKIN uses unless it sets its own `clips` map. wolf.gltf
// (shadowgrip/sylva/aria/grimm's body) happens to name its clips exactly
// these five words, so this table doubles as "the wolf's own names."
const DEFAULT_CLIPS = { idle: 'Idle', walk: 'Walk', run: 'Gallop', attack: 'Attack', death: 'Death' };

// v3.19: the class is now a reusable GIANT-WOLF DUEL — the Shadowgrip wears
// it by default; Sylva the Thornbound (Wild Woods) wears it in green. Same
// grammar the kids mastered (bosses fight like their family), new skin/stats.
export // ---------------------------------------------------------------------------
// DIFFICULTY, AND WHY IT IS SHAPED LIKE THIS
//
// Dad, 2026-09-03: "boss fights are far too easy and are all beatable by
// spamming the attack button. there needs to be multiple different attacks,
// different attack patterns, different timing, different openings. difficulty
// of bosses should scale with the increasing levels."
//
// He is right, and the reason is structural rather than a number being too
// low. Read the old machine: `prowl` lasted 2.2-3.2 seconds and did nothing
// but circle, `recover` was 1.6s of panting and `tired` 2.6s of lying down —
// so the great majority of the fight WAS a free-hit window. A child standing
// next to the boss swinging never had to read anything. tools/fight-sylva.mjs
// proves it in its own log: twenty of her twenty-four health came off during
// `prowl`.
//
// Four changes, and every one of them respects §2 of the combat context:
//
//   1. A GUARD BETWEEN OPENINGS. While the boss is up and watching, hits land
//      for a FRACTION and ring off with a clang. It is the Bone Warden's
//      shield grammar, which the kids already read, applied to the whole
//      family. Crucially it never blocks a child completely — `guard` is a
//      reduction, not immunity — so mashing still wins, slowly, and the taught
//      answer wins fast. That is the kid-appropriate version of "not beatable
//      by spamming": make mashing SLOW, not impossible.
//   2. A THIRD SHARED ATTACK, the POUNCE — rear up, leap onto where you stood,
//      land with a shockwave — and it leaves a DIFFERENT-SHAPED opening: 1.4s
//      dazed but on its feet and right next to you, against the charge's 2.6s
//      collapse across the room. Different openings, which is what was asked.
//   3. A NO-REPEAT PICKER. The old chooser was a distance test and two coin
//      flips, so it settled into swipe/charge/swipe/charge. `_pickMove` never
//      plays the same move twice running.
//   4. PACING BY REGION. `tier` is the region number. `guard` rises with it,
//      the gap between attacks falls with it, and the move list grows with it.
//
// WHAT IS *NOT* SCALED, because §2 forbids it: no telegraph goes below the
// 0.9s boss floor (LAW 1 — a child's choice reaction is ~800ms) and no punish
// window below 1.0s (LAW 6). `tellMult` therefore only ever makes an EARLY
// boss telegraph LONGER than the floor; it reaches 1.0 and stops. Difficulty
// comes from what a child has to DO, never from taking their reading time away.
// ---------------------------------------------------------------------------
const SKINS = {
  shadowgrip: {
    tier: 1, guard: 0.35, gap: 3.2, tellMult: 1.15,
    moves: ['swipe', 'charge'],
    name: 'The Shadowgrip',
    hide: 0x161020, glow: 0x2a1040, eyes: 0xb9a8ff, burst: 0x8f6bff,
    maxHp: MAX_HP, dmg: ATTACK_DMG, saveKey: 'bossHp', legacyPhases: true,
    cinder: 0xffb25a, // the caged fire spirit
    // ELEMENT AUDIT (2026-08-23): matches Ember Hollow's own mook weakness
    // (js/enemies.js TRAITS, region 1 = moon) — every boss now answers to the
    // same tool its region has been teaching all along, not just its mooks.
    weakness: 'moon',
  },
  // P7 audit (2026-08-22): Sylva was the exact "same boss, no different
  // moves, recoloured" pattern this law exists to catch — same class, same
  // model, same moveset as the Shadowgrip, only `speedMult` set. `snares`
  // gives her a genuine unique move (js/attacks.js sylva_thornburst): below
  // half health she plants down and thorns erupt in a ring around her —
  // foreshadows the Vine-Lash's own root effect, the exact form she's
  // about to grant.
  //
  // SHE IS NOT A WOLF ANY MORE (2026-09-03). She was the second wolf of four,
  // and the P7 note above already caught her being "the same boss, no
  // different moves, recoloured" once. Now she is the horned thing the Wild
  // Woods grew around a stolen heart: minotaur.glb, 3,234 tris, six flat
  // materials in exactly the Quaternius register, and — the reason it was
  // chosen over nine other candidates — its OWN idle / Walk / Attack /
  // Attack Double / Death clips. `Attack Double` is a second swing the wolf
  // never had, which is what her `swipe` reaches for below half health.
  //
  // Her horns and hooves keep their modelled colour; only the hide takes the
  // forest green, so she reads as a creature with a coat rather than a
  // silhouette painted one flat colour.
  //
  // NAMING: `body` used to be the skin's COLOUR. It is the skin's MODEL now,
  // and the colour moved to `hide`. Both are read in this file only, and the
  // rename is deliberate rather than an alias — a field that means a hex in
  // four entries and a model in one is the shape of a bug waiting to happen.
  sylva: {
    tier: 3, guard: 0.50, gap: 2.8, tellMult: 1.08,
    moves: ['swipe', 'charge', 'pounce', 'root'],
    name: 'Sylva, Thornbound',
    body: {
      url: './assets/chars/monsters/minotaur.glb',
      // the wolf bosses stand 3.47u (2.67u model x 1.3). She stands with them.
      stands: 3.5,
      eyes: ['material'],          // the model's own red eye material
      keep: ['black', 'Material.002', 'Material.001'],  // horns, hooves, belt
    },
    clips: { idle: 'Armature|idle', walk: 'Armature|Walk', run: 'Armature|Walk',
      attack: 'Armature|Attack', death: 'Armature|Death' },
    hide: 0x24381c, glow: 0x2e5220, eyes: 0xcaff8a, burst: 0x8fdc6a,
    maxHp: 24, dmg: 1.5, saveKey: 'sylvaHp', legacyPhases: false,
    cinder: 0xb8ffc8, // her own leaf-light, smothered in thorns
    speedMult: 1.08,  // the forest is quicker than the shadow
    snares: { radius: 2.6 },
    weakness: 'fire', // matches the Wild Woods' own mook weakness
  },
  // ARIA, THE GALEBOUND — Stormreach's guardian (region 5).
  //
  // BOSSES FIGHT LIKE THEIR FAMILY, so she wears the same class as the
  // Shadowgrip and Sylva: the crouch, the charge, the red lane and the gold
  // collapse ring the kids have been reading since region one.
  //
  // At half health she does not simply hunt harder — she raises two gales that
  // squeeze the arena from both sides (gale strength beats walking speed, so
  // the flanks stop being usable escape room). L5/L6 RE-KEY (2026-08-22):
  // storm_wolf is HER OWN reward (main.js grants it on ariaDefeated), so a
  // child fighting her has never had the Thunder Dash and never needs it here
  // — the crouch telegraph is the same ~1s hound tell every charge in the
  // game already gives, and the open middle band (|x|<5) is room enough to
  // clear it on foot (see tools/fight-aria.mjs). The gale is what the fight
  // is FOR, not a lock only the reward can open.
  //
  // AND SHE IS NOT A WOLF EITHER (2026-09-03). She was the third of four, and
  // the most obviously wrong of them: a wolf that prowls a clifftop is not
  // what "the Galebound" means. She wears the Quaternius dragon now — the body
  // Boreal used to wear before Frostpeak's rebuild moved her onto the wyrm, so
  // this costs the build nothing new — and she HOVERS: `body.hover` lifts her
  // half a metre off the crown, so the storm-spirit reads as airborne while
  // still fighting the ground fight the class gives her.
  //
  // Dragon.glb has no idle and no walk, only Flying — which is exactly right
  // here. A thing that never touches the stone has no walk cycle to play.
  aria: {
    tier: 5, guard: 0.60, gap: 2.4, tellMult: 1.02,
    moves: ['swipe', 'charge', 'pounce'],
    name: 'Aria, the Galebound',
    body: {
      url: './assets/chars/monsters/Dragon.glb',
      stands: 3.4,
      hover: 0.55,                 // she does not land
      eyes: ['Eyes'],
    },
    clips: { idle: 'DragonArmature|Dragon_Flying', walk: 'DragonArmature|Dragon_Flying',
      run: 'DragonArmature|Dragon_Flying', attack: 'DragonArmature|Dragon_Attack',
      death: 'DragonArmature|Dragon_Death' },
    hide: 0x8f9bb8, glow: 0x5a6a94, eyes: 0xfff4b0, burst: 0xc9d4ff,
    maxHp: 26, dmg: 1.5, saveKey: 'ariaHp', legacyPhases: false,
    cinder: 0xfff4b0, // her own stormlight, held down by the gale
    speedMult: 1.14,  // the sky is quicker than the forest
    gales: [
      { x: -8.5, z: 0, w: 7.0, d: 24, dir: 'e', strength: 'gale' },
      { x: 8.5, z: 0, w: 7.0, d: 24, dir: 'w', strength: 'gale' },
    ],
    // matches Stormreach's own mook weakness — the region's one deliberate
    // pivot off fire (js/enemies.js, region 5 TRAITS comment)
    weakness: 'earth',
  },
  // MERI, THE DROWNED — the Sunken Vale's guardian (region 6).
  //
  // Three wolf-shaped bosses is enough wolf-shaped bosses. Meri's family is the
  // TIDE BLOBS the kids have fought all region, and she fights like one: the
  // same deep crouch before a hop, the same helpless moment after she lands.
  // Same class, because the fight underneath is the same fight — crouch, red
  // ring, dodge, punish the recovery — and that is the law working rather than
  // being worked around.
  //
  // What is new is the FLOOR. As she loses she floods it: standing ground
  // shrinks, deep water grows, and the gift the region gave stops being optional.
  meri: {
    tier: 6, guard: 0.65, gap: 2.2, tellMult: 1.0,
    moves: ['swipe', 'charge', 'pounce'],
    name: 'Meri, the Drowned',
    // Her body was already a slime — but it was hard-coded in the SPAWNER
    // (js/rooms.js) while this table still said nothing, so the table lied
    // about a third of what it described. Naming it here is what lets
    // tools/verify-bosses.mjs check that a skin's clips exist on the body it
    // actually wears; that check is exactly what would have caught her fighting
    // in her bind pose for a month.
    body: {
      url: './assets/chars/monsters/Slime.glb',
      stands: 2.54,   // Slime.glb is 1.95u; the old flat 1.3x scalar made 2.54
    },
    hide: 0x2f7f96, glow: 0x14495c, eyes: 0x8fe4ff, burst: 0x4fd0e0,
    maxHp: 28, dmg: 1.5, saveKey: 'meriHp', legacyPhases: false,
    cinder: 0x8fe4ff, // her own tide-light, held under
    speedMult: 0.92,  // deep water is not quick
    floods: [
      { x: -9.5, z: 0, w: 7.0, d: 24 },
      { x: 9.5, z: 0, w: 7.0, d: 24 },
    ],
    weakness: 'fire', // matches the Sunken Vale's own mook weakness
    // BOSS OVERHAUL (2026-08-23): she is the one SKINS entry whose body
    // (Slime.glb) isn't wolf.gltf, and its clips are named
    // 'Armature|Slime_Idle' etc, not the bare 'Idle'/'Walk'/... DEFAULT_CLIPS
    // looks for — so every mixer.clipAction() lookup below was silently
    // finding nothing and she has been fighting fully unanimated (frozen bind
    // pose) since the day this class started taking a slimeGltf. No 'Gallop'
    // equivalent exists on Slime.glb, so `run` reuses the walk cycle — a
    // faster-paced walk during her charge, not a true gallop, but real motion
    // instead of none.
    clips: { idle: 'Armature|Slime_Idle', walk: 'Armature|Slime_Walk',
      run: 'Armature|Slime_Walk', attack: 'Armature|Slime_Attack', death: 'Armature|Slime_Death' },
  },
  // SHADOW-GRIMM — the last fight (region 7).
  //
  // He was the FIRST guardian: the great wolf whose heart the shadow took
  // before any of the others, and every form Kael carries is a piece of his
  // stolen strength in a kinder bearer (STORY-BIBLE, "The reveal"). That is
  // canon, and it decides the fight — he wears the SAME CLASS as the
  // Shadowgrip, because the Shadowgrip WAS a piece of him. A child fights the
  // region-one boss again, enormous, at the end of the game, and every single
  // thing they learned on it still works.
  //
  // What is new is that he ARMOURS, and below a third he armours against
  // whatever hit him last. That is the whole game in one mechanic: a child who
  // only ever learned one wolf cannot finish it, and a child who has been
  // switching all along will barely notice it is happening.
  //
  // He is FREED, not killed.
  grimm: {
    tier: 7, guard: 0.75, gap: 1.9, tellMult: 1.0,
    moves: ['swipe', 'charge', 'pounce'],
    name: 'Shadow-Grimm',
    hide: 0x0f0a18, glow: 0x3a1f5c, eyes: 0xd8cfff, burst: 0xb9a8ff,
    maxHp: 32, dmg: 1.5, saveKey: 'grimmHp', legacyPhases: false,
    cinder: 0xd8cfff,
    speedMult: 1.1,
    adapts: true,
  },
};

class Hittable {
  // Minimal enemy-shaped adapter so sword arcs / bolts / the Blood Moon land.
  constructor(x, z, radius, onHit) {
    this.x = x; this.z = z;
    this.radius = radius;
    this.dead = false;
    this._onHit = onHit;
  }
  // The ELEMENT is passed through now. It used to be dropped on the floor here,
  // which was fine while no boss cared what hit it — Shadow-Grimm cares very
  // much, and a resistance that cannot see the element is not a resistance.
  takeDamage(n, element = 'steel') {
    if (!this.dead) this._onHit(Math.min(n, HIT_CAP), element);
  }
  update() {}
}

export class Shadowgrip {
  constructor(world, x, z, wolfGltf, skinName = 'shadowgrip') {
    this.skin = SKINS[skinName] || SKINS.shadowgrip;
    this.name = this.skin.name;
    this.world = world;
    this.x = x; this.z = z;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);

    this.maxHp = this.skin.maxHp;
    // dying never resets the duel: the wounds Kael landed are REMEMBERED
    // (state.flags[saveKey], additive save field). Old Ember saves that
    // reached the legacy "phase 2/3" get the same courtesy.
    const legacy = (this.skin.legacyPhases && state.flags.bossProgress >= 2)
      ? this.maxHp * 0.6 : this.maxHp;
    this.coreHp = Math.min(state.flags[this.skin.saveKey] || legacy, this.maxHp);
    this.defeated = false;
    this.onDefeated = null;

    // --- THE BOSS BODY, AND IT IS NOT ALWAYS A WOLF.
    //
    // Dad, 2026-09-03: "every boss fight should be a different asset. scale
    // assets, change their colour schemes, their bodies, their health and
    // attack sets. the first boss is a giant wolf, no more giant wolf bosses
    // after that." He was right and the count was worse than it looks: FOUR of
    // the seven wore wolf.gltf — the Shadowgrip, Sylva, Aria and Grimm — so
    // more than half the game's bosses were the same animal in a different
    // colour.
    //
    // A skin now names its own `body`: which model, how tall it stands, which
    // of its materials are eyes, and which to leave alone. The wolf's own
    // numbers are the DEFAULTS, so the Shadowgrip and Grimm are untouched.
    //
    // Grimm stays a wolf on purpose, and it is not an oversight: he IS the
    // great wolf. The Shadowgrip was a piece of him, and every form Kael
    // carries is a piece of his stolen strength (STORY-BIBLE, "The reveal").
    // The first fight in the game and the last being the same animal is the
    // bookend the whole story is built on. Everything BETWEEN them is now its
    // own creature.
    const B = this.skin.body || {};
    this.core = new THREE.Group();
    const wolf = prepareCharacter(SkeletonUtils.clone(wolfGltf.scene));
    // MEASURE, OR TAKE THE WOLF'S OWN 1.3. Every model in this batch arrives
    // in different units — the minotaur is modelled 193 units tall — so a
    // second typed scalar would be the crate/vase/chest mistake for the fifth
    // time. `stands` is how tall the boss should be in the room, in metres.
    if (B.stands) {
      // MEASURE THE SOURCE, NOT THE CLONE — and this one cost an evening.
      //
      // three.js's Box3.setFromObject walks a SkinnedMesh through
      // SkinnedMesh.computeBoundingBox(), which poses every vertex through the
      // CURRENT skeleton. On a clone whose bone matrices have not been updated
      // yet, those matrices are garbage, and the box comes back garbage with
      // them: the minotaur measured 19,372 units tall instead of 193, so the
      // scale came out a hundred times too small and the boss rendered as
      // nothing at all — present in the graph, visible:true, correct bounding
      // box, and simply not there.
      //
      // The loaded gltf's own scene has settled matrices and is never posed by
      // a mixer, so it is the honest ruler. Measured once per body, and the
      // clone is scaled to match.
      const src = wolfGltf.scene;
      src.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(src);
      const h = Math.max(0.01, bb.max.y - bb.min.y);
      wolf.scale.setScalar(B.stands / h);
      // ...and put its feet ON the floor: the minotaur's mesh sits five of its
      // own units BELOW its origin, which at this scale is ankle-deep grass.
      // `hover` then lifts a body that is not supposed to be standing at all.
      wolf.position.y = -bb.min.y * (B.stands / h) + (B.hover || 0);
      this._bodyY = wolf.position.y;
    } else {
      wolf.scale.setScalar(1.3);
    }
    const eyeNames = B.eyes || ['Eyes_Black'];
    const keepNames = B.keep || ['Nose'];
    this.eyeMat = null;
    wolf.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (eyeNames.includes(m.name)) {
          c.emissive = new THREE.Color(this.skin.eyes);
          c.emissiveIntensity = 1.2;
          this.eyeMat = c;
        } else if (keepNames.includes(m.name)) {
          // the wolf's nose goes near-black; a body that names its own keeps
          // (the minotaur's horns and hooves) keeps them exactly as modelled
          if (B.keep) return c;
          c.color.setHex(0x0a0710);
        } else {
          if (c.color) c.color.setHex(this.skin.hide);
          c.emissive = new THREE.Color(this.skin.glow);
          c.emissiveIntensity = 0.35;
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    if (!this.eyeMat) {
      this.eyeMat = new THREE.MeshStandardMaterial({ emissive: this.skin.eyes, emissiveIntensity: 1.2 });
    }
    this.core.add(wolf);
    this.dragon = wolf; // legacy name kept: the boss's body
    this.mixer = new THREE.AnimationMixer(wolf);
    // BOSS OVERHAUL (2026-08-23): a skin can override DEFAULT_CLIPS with its
    // own clip names — Meri's Slime.glb needs this (see her SKINS entry);
    // every other skin still shares wolf.gltf, whose clips ARE named Idle/
    // Walk/Gallop/Attack/Death, so they're unaffected by this indirection.
    const clipNames = this.skin.clips || DEFAULT_CLIPS;
    const clip = (key) => wolfGltf.animations.find((c) => c.name === clipNames[key]);
    this.flyAction = clip('idle') ? this.mixer.clipAction(clip('idle')) : null;
    if (this.flyAction) this.flyAction.play();
    this.walkAction = clip('walk') ? this.mixer.clipAction(clip('walk')) : null;
    this.runAction = clip('run') ? this.mixer.clipAction(clip('run')) : null;
    this.attackAction = clip('attack') ? this.mixer.clipAction(clip('attack')) : null;
    if (this.attackAction) this.attackAction.setLoop(THREE.LoopOnce);
    // THE COLLAPSE: the Death clip plays and HOLDS while the wolf lies tired
    this.collapseAction = clip('death') ? this.mixer.clipAction(clip('death')) : null;
    if (this.collapseAction) {
      this.collapseAction.setLoop(THREE.LoopOnce);
      this.collapseAction.clampWhenFinished = true;
    }
    this._anim = 'idle';
    this.core.position.set(0, 0, -1.4); // starts just behind the caged light
    this.root.add(this.core);

    // --- the caged spirit-light the great wolf is guarding ---
    this.cinder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: this.skin.cinder, emissiveIntensity: 1.6, roughness: 1 })
    );
    this.cinder.position.y = 1.1;
    this.root.add(this.cinder);
    this.cinderLight = new THREE.PointLight(this.skin.cinder, 3.5, 8, 1.9);
    this.cinderLight.position.set(0, 1.3, 0);
    this.root.add(this.cinderLight);
    // a dark shell smothers the light; it thins as the wolf weakens —
    // the fight's progress is readable in the room itself
    this.cageShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.52, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0d0716, transparent: true, opacity: 0.8,
        emissive: 0x2a1040, emissiveIntensity: 0.4, roughness: 1,
      })
    );
    this.cageShell.position.y = 1.1;
    this.root.add(this.cageShell);

    // --- hunter state machine (hound grammar, boss size) ---
    this.action = 'prowl';   // prowl | stalk | windup | swipe | crouch | charge | tired | recover
    this.actionT = 0;
    this.attackIn = 3.2;
    this.orbitSign = 1;
    this.chargeDir = { x: 0, z: 1 };
    this.wolfOff = { x: 0, z: 0 };
    this._scrapeAcc = 0;
    this._halfHowled = this.coreHp <= this.maxHp / 2;
    // legacy fields some old saves/tests may read — inert now
    this.phase = 1;
    this.chargeState = 'rest';
    this.slamState = 'wait';

    // gold "hit it NOW" ring under the collapsed wolf (act-here law)
    this.tiredRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.05, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.tiredRing.rotation.x = -Math.PI / 2;
    this.tiredRing.position.y = world.deckY + 0.06;
    this.tiredRing.visible = false;
    world.add(this.tiredRing);

    // the wolf's body is ALWAYS a real target — like every other wolf. FORWARD
    // THE ELEMENT: Hittable.takeDamage passes it, but this callback used to drop
    // it, so every hit read as 'steel' — and Shadow-Grimm resists steel below
    // half health, which made the final boss UNBEATABLE (a kid's fire/earth/etc.
    // all counted as the one thing he shrugs off). His whole armour is elemental.
    this.coreHittable = new Hittable(x, z - 1.4, 1.45, (n, element) => this._hitCore(n, element));
    world.enemies.push(this.coreHittable);
    this.coreExposed = true; // legacy readers: there is no armor anymore

    // body materials for the red hurt-flash
    this._dragonMats = [];
    this.dragon.traverse((n) => {
      if (!n.isMesh) return;
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) {
        if (m === this.eyeMat || !m.emissive) continue;
        m.userData.be = m.emissive.getHex();
        m.userData.bi = m.emissiveIntensity;
        this._dragonMats.push(m);
      }
    });
    this._hurtFlash = 0;

    world.boss = this;
  }

  // ------------------------------------------------------------------

  // WHAT HE IS ARMOURED AGAINST, right now. Nothing above half; steel and moon
  // below it — the two things a child starts the game with; and below a third,
  // whatever landed last, which is the fight asking them to keep changing.
  //
  // THE POSE NEVER LIES: a resisted hit says BLOCKED and throws no damage
  // number, the same as every shielded enemy since region two, so a child is
  // never left wondering whether they are doing anything.
  _resists(element) {
    if (!this.skin.adapts) return false;
    if (this.coreHp <= this.maxHp / 3) return element === this._lastElement;
    if (this.coreHp <= this.maxHp / 2) return element === 'steel' || element === 'moon';
    return false;
  }

  // ELEMENT AUDIT (2026-08-23): every mook family has carried a weakness
  // since region one (js/enemies.js TRAITS) — bosses never did, so any
  // element dealt the same flat damage and the region's own lesson stopped
  // mattering the moment the fight got big. `skin.weakness` closes that,
  // reusing the exact SUPER!/gold-burst vocabulary takeDamage() already
  // teaches on every mook (js/enemies.js:597-619).
  _isWeak(element) {
    const w = this.skin.weakness;
    if (!w) return false;
    return Array.isArray(w) ? w.includes(element) : element === w;
  }

  _hitCore(n, element = 'steel') {
    if (this.defeated) return;
    if (this._resists(element)) {
      const bx = this.x + this.core.position.x, bz = this.z + this.core.position.z;
      if (this.world.onDmgNum) this.world.onDmgNum(bx, 2.2, bz, 'BLOCKED');
      audio.play('parry', { volume: 0.5, rate: 0.7 });
      juice.burst(bx, 1.4, bz, 0x8f7fc0, 5);
      return;
    }
    // THE GUARD. A boss that is UP AND WATCHING turns most of a blow aside —
    // clang, spark, a fraction of the damage — and a boss in an opening does
    // not. It is the Bone Warden's shield grammar (js/enemies.js) applied to
    // the whole duel family, and it is why mashing no longer wins a fight on
    // its own: the openings the fight already teaches are now where the damage
    // actually is.
    //
    // IT IS A REDUCTION, NEVER IMMUNITY. A five-year-old who only ever swings
    // still gets there, just slowly; a child who waits for the gold ring gets
    // there fast. `guard` rises with the region number (SKINS.tier), which is
    // the difficulty ramp dad asked for, spent on what a child has to DO
    // rather than on taking their reading time away.
    if (this._guarded()) {
      const g = this.skin.guard || 0;
      const bx0 = this.x + this.core.position.x, bz0 = this.z + this.core.position.z;
      n *= (1 - g);
      audio.play('parry', { volume: 0.35, rate: 1.35, vary: 0.1 });
      juice.burst(bx0, 1.5, bz0, 0xcfd6de, 4);
    }
    const weak = this._isWeak(element);
    if (weak) n *= 1.5;
    this._lastElement = element;
    this.coreHp -= n;
    // SNAP the floating-point residual: elemental damage (1.5, 2.2, ...) leaves
    // coreHp at ~1e-15 instead of 0, so `coreHp <= 0` below never fired and the
    // boss survived on an invisible sliver — the fight looked won but wasn't.
    if (this.coreHp < 1e-6) this.coreHp = 0;
    state.flags[this.skin.saveKey] = Math.max(0, this.coreHp); // wounds are remembered
    const wx = this.x + this.core.position.x, wz = this.z + this.core.position.z;
    if (weak) {
      // same gold-flare + SUPER! callout every mook's weakness gives —
      // a child should never learn "this element works" for the first time
      // on a boss and be given a different signal than the one Pip taught
      juice.burst(wx, 1.2, wz, 0xffe14a, 8);
      if (this.world.onDmgNum) this.world.onDmgNum(wx, 2.5, wz, 'SUPER!');
      bumpCounter('weakHits');
    }
    if (this.world.onDmgNum) this.world.onDmgNum(wx, 2.2, wz, n);
    this._hurtFlash = 0.2;
    this.eyeMat.emissiveIntensity = 3;
    this._eyeFlash = 0.25;
    // the midpoint beat: at half health it howls and hunts HARDER
    if (!this._halfHowled && this.coreHp <= this.maxHp / 2) {
      this._halfHowled = true;
      audio.howl({ volume: 0.95, rate: 0.7 });
      juice.burst(wx, 1.2, wz, this.skin.burst, 14);
      this._raiseGales();
      this._flood();
    }
    if (this.coreHp <= 0) this._defeat();
  }

  // HER SECOND HALF. The arena narrows from both sides. Nothing is added to
  // the fight's grammar — the charge, the tell and the punish window are all
  // unchanged — the FLOOR just gets smaller, and the open middle is still
  // room enough to answer it on foot (see the aria SKINS comment above).
  _raiseGales() {
    if (!this.skin.gales || this._galesUp) return;
    this._galesUp = true;
    for (const g of this.skin.gales) {
      galeLane(this.world, { x: this.x + g.x, z: this.z + g.z, w: g.w, d: g.d,
        dir: g.dir, strength: g.strength, id: 'aria' });
    }
    if (this.world.rebuildWind) this.world.rebuildWind();
    audio.play('whoosh', { volume: 0.9, rate: 0.6 });
  }

  // ...and when she falls, the wind goes with her. A gale still blowing across
  // a beaten boss's arena would be the room refusing to admit the fight is over.
  _dropGales() {
    if (!this._galesUp) return;
    this._galesUp = false;
    this.world.galeLanes = this.world.galeLanes.filter((l) => l.id !== 'aria');
    if (this.world.rebuildWind) this.world.rebuildWind();
  }

  // HER SECOND HALF. The arena does not narrow with wind, it narrows with
  // WATER: two channels open at the edges and the standing ground shrinks to
  // the middle.
  //
  // L5/L6 RE-KEY (2026-08-22): tide_wolf is HER OWN reward now (main.js grants
  // it on meriDefeated) — a child fighting her has never had it. waterZone()'s
  // normal rule (deep + no gift = a wall) would drop a hard collider wherever
  // Kael happens to be standing the instant she crosses half health, which is
  // exactly the "gate that changes state mid-room" water.js's own canWade()
  // comment says never to build. noCollide keeps the flood a real, crossable,
  // SLOW zone for everyone — the floor still visibly shrinks, nobody gets
  // walled in by a form they haven't been given yet.
  _flood() {
    if (!this.skin.floods || this._flooded) return;
    this._flooded = true;
    for (const f of this.skin.floods) {
      waterZone(this.world, { x: this.x + f.x, z: this.z + f.z, w: f.w, d: f.d,
        deep: true, id: 'meri', noCollide: true });
    }
    if (this.world._waterMeshes) {
      for (const m of this.world._waterMeshes) {
        this.world.root.remove(m);
        m.geometry.dispose();
        if (m.material.map) m.material.map.dispose();
        m.material.dispose();
      }
    }
    this.world._waterMeshes = buildWaterField(this.world);
    audio.play('puff', { volume: 0.9, rate: 0.55 });
  }

  _drain() {
    if (!this._flooded) return;
    this._flooded = false;
    const gone = this.world.waterZones.filter((z) => z.id === 'meri');
    for (const z of gone) {
      if (z.collider) {
        const i = this.world.boxColliders.indexOf(z.collider);
        if (i >= 0) this.world.boxColliders.splice(i, 1);
      }
    }
    this.world.waterZones = this.world.waterZones.filter((z) => z.id !== 'meri');
    if (this.world._waterMeshes) {
      for (const m of this.world._waterMeshes) {
        this.world.root.remove(m);
        m.geometry.dispose();
        if (m.material.map) m.material.map.dispose();
        m.material.dispose();
      }
    }
    this.world._waterMeshes = buildWaterField(this.world);
  }

  // A perfect parry (or a stunning blow) staggers even the great wolf —
  // the shield is a real answer, not just a wall.
  takeStun(sec) {
    if (this.defeated || this.action === 'tired') return;
    this.action = 'recover';
    this.actionT = Math.max(1.4, sec);
    this.core.scale.y = 1;
    if (this.attackAction) this.attackAction.fadeOut(0.15);
    this._setAnim('idle');
    this.eyeMat.emissiveIntensity = 0.4;
    audio.play('parry', { volume: 0.6, rate: 0.85 });
  }

  _defeat() {
    this.defeated = true;
    state.flags[this.skin.saveKey] = 0;
    // DRAMATIC END: triple shockwave + spark storm + heavy shake before
    // the long dissolve (which sheds smoke and embers each frame in update)
    if (juice.effects) {
      juice.effects.shake(0.65, 1.3);
      juice.effects.hitStop(0.14);
      juice.effects.groundSlam(this.root.position.clone(), 0xff5a3a);
      setTimeout(() => juice.effects && juice.effects.groundSlam(this.root.position.clone(), 0x8f6bff), 350);
      setTimeout(() => juice.effects && juice.effects.groundSlam(this.root.position.clone(), 0xffd76a), 750);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      juice.burst(this.x + Math.cos(a) * 1.2, 0.5 + (i % 3) * 0.6, this.z + Math.sin(a) * 1.2,
        i % 2 ? 0xff8a3a : this.skin.burst, 12);
    }
    audio.play('slam', { volume: 1, rate: 0.5 });
    audio.howl({ volume: 0.85, rate: 0.5 }); // the long dying howl
    this.tiredRing.visible = false;
    this.coreHittable.dead = true;
    this._dissolveT = 1.6;

    if (this.skin === SKINS.shadowgrip) {
      state.flags.bossDefeated = true;
      state.flags.bossProgress = 0;
      state.flags.shortcutOpen = true;
      // the Fire Wolf grant lives in main.js now, watching this flag — with
      // the toast, the narration and the HOWTO a silent push here would skip
    } else if (this.skin === SKINS.sylva) {
      state.flags.sylvaDefeated = true;
      if (!state.formsUnlocked.includes('verdant_wolf')) state.formsUnlocked.push('verdant_wolf');
    } else if (this.skin === SKINS.aria) {
      state.flags.ariaDefeated = true;
      // the Storm Wolf was earned at her shrine, not here — but a save that
      // somehow reached the crown without it is not a save to strand
      if (!state.formsUnlocked.includes('storm_wolf')) state.formsUnlocked.push('storm_wolf');
      this._dropGales();
    } else if (this.skin === SKINS.grimm) {
      // HE IS FREED, NOT KILLED. The flag says so in its name, and the room
      // rebuilds with him sitting on his own seat, old and tired and himself.
      state.flags.grimmFreed = true;
      state.flags.gameComplete = true;
      if (!state.formsUnlocked.includes('ghost_wolf')) state.formsUnlocked.push('ghost_wolf');
    } else if (this.skin === SKINS.meri) {
      state.flags.meriDefeated = true;
      if (!state.formsUnlocked.includes('tide_wolf')) state.formsUnlocked.push('tide_wolf');
      this._drain();       // the water goes out — that IS the restoration
    }
    if (this.onDefeated) this.onDefeated();
  }

  // ------------------------------------------------------------------

  update(dt, t, player) {
    if (this.defeated) {
      // dissolve with a long exhale: shrink, fade, free the light
      if (this._dissolveT > 0) {
        this._dissolveT -= dt;
        const f = Math.max(0, this._dissolveT / 1.6);
        this.core.scale.setScalar(f);
        this.core.position.y = (1 - f) * 1.2; // the shadow lifts away as it burns
        this._burstAcc = (this._burstAcc || 0) + dt;
        if (this._burstAcc > 0.18) {
          this._burstAcc = 0;
          const a = Math.random() * Math.PI * 2;
          const r = 0.4 + Math.random() * 1.6;
          juice.burst(this.x + Math.cos(a) * r, 0.5 + Math.random() * 1.6, this.z + Math.sin(a) * r,
            Math.random() < 0.5 ? 0xff8a3a : this.skin.burst, 10);
          smokePuff(this.world, this.x + Math.cos(a) * r, 0.8, this.z + Math.sin(a) * r, 0x241238);
        }
        this.cageShell.visible = false;
        this.cinder.material.emissiveIntensity = 1.6 + (1 - f) * 2.2;
        this.cinderLight.intensity = 3.5 + (1 - f) * 8;
        this.cinder.position.y = 1.1 + (1 - f) * 0.7;
        if (this._dissolveT <= 0) {
          this.root.remove(this.core);
          this.root.remove(this.cageShell);
        }
      } else {
        this.cinder.position.y = 1.8 + Math.sin(t * 1.7) * 0.15;
      }
      return;
    }

    this.mixer.update(dt);
    // PAWS ON THE GROUND, ALWAYS — but "the ground" is not always y 0.
    //
    // This forced the body to zero every frame, which was right while every
    // boss was the same wolf standing on its own origin. It is wrong the
    // moment a skin brings its own body: the minotaur's mesh sits five of its
    // own units BELOW its origin, and Aria is supposed to HOVER. Both of those
    // are set once at build time and were being wiped sixty times a second.
    // `_bodyY` is where this body belongs; the line still does its real job,
    // which is refusing to let anything else drift the body vertically.
    this.dragon.position.y = this._bodyY || 0;

    if (this._hurtFlash > 0) {
      this._hurtFlash -= dt;
      const on = this._hurtFlash > 0;
      for (const m of this._dragonMats) {
        m.emissive.setHex(on ? 0xff2a1a : m.userData.be);
        m.emissiveIntensity = on ? 0.8 : m.userData.bi;
      }
    }
    if (this._eyeFlash > 0) {
      this._eyeFlash -= dt;
      if (this._eyeFlash <= 0) this.eyeMat.emissiveIntensity = 1.2;
    }
    // Cinder breathes; the smothering shell THINS as the wolf weakens
    this.cinder.material.emissiveIntensity = 1.4 + Math.sin(t * 2.6) * 0.3;
    const hpFrac = Math.max(0, this.coreHp) / MAX_HP;
    this.cageShell.material.opacity = 0.15 + 0.65 * hpFrac;
    this.cageShell.scale.setScalar(0.65 + 0.35 * hpFrac + Math.sin(t * 2.1) * 0.04);
    this.cageShell.position.y = 1.1 + Math.sin(t * 1.7) * 0.05;
    this.cinderLight.intensity = 3.5 + (1 - hpFrac) * 2.5;

    this._updateWolf(dt, t, player);

    // the HITBOX and the gold ring RIDE THE WOLF — you always hit the wolf,
    // wherever it stands (playtest law: a boss is a creature, never a turret)
    const wwx = this.x + this.core.position.x;
    const wwz = this.z + this.core.position.z;
    this.coreHittable.x = wwx;
    this.coreHittable.z = wwz;
    if (this.tiredRing.visible) {
      this.tiredRing.position.x = wwx;
      this.tiredRing.position.z = wwz;
      const pulse = 1 + Math.sin(t * 5) * 0.06;
      this.tiredRing.scale.set(pulse, pulse, 1);
      this.tiredRing.material.opacity = 0.6 + Math.sin(t * 5) * 0.25;
    }
  }

  // Crossfaded locomotion so the walk/gallop always match the movement.
  _setAnim(name) {
    if (this._anim === name) return;
    const map = { idle: this.flyAction, walk: this.walkAction, run: this.runAction };
    const next = map[name];
    const prev = map[this._anim];
    if (next) next.reset().fadeIn(0.2).play();
    if (prev && prev !== next) prev.fadeOut(0.2);
    this._anim = name;
  }

  // The duel: EXACTLY the little hounds' dance, scaled up.
  //   prowl  — circles Kael (walk), never a statue
  //   stalk  — trots in when it wants the close swipe
  //   windup — 0.9s snarl + coil: THE SWIPE IS COMING (shield/parry answer)
  //   swipe  — one big paw arc in front (blockable; jumping clears it)
  //   crouch — 1.0s ON-BODY charge telegraph: deep crouch, eyes FLARE,
  //            claws scrape dust — the hounds' language, boss-sized
  //   charge — a straight run THROUGH where you stood (dodge/roll answer)
  //   tired  — THE COLLAPSE after every charge: falls over under a gold
  //            ring for 2.6s — the big free-hits window
  //   recover— short pant after a swipe (also the parry-stagger state)
  _updateWolf(dt, t, player) {
    const px = player.root.position.x, pz = player.root.position.z;
    const wx = this.x + this.wolfOff.x;
    const wz = this.z - 1.4 + this.wolfOff.z;
    const dx = px - wx, dz = pz - wz;
    const d = Math.hypot(dx, dz) || 0.01;
    this.actionT -= dt;
    const enraged = this._halfHowled; // below half health it hunts harder
    const SM = this.skin.speedMult || 1;
    const facePlayer = () => { this.core.rotation.y = Math.atan2(dx, dz); };
    const move = (mx, mz, speed) => {
      const nx = wx + mx * speed * dt, nz = wz + mz * speed * dt;
      const s = this.world.resolveCircle(nx, nz, 0.85);
      this.wolfOff.x = s.x - this.x;
      this.wolfOff.z = s.z - (this.z - 1.4);
      this.core.position.x = this.wolfOff.x;
      this.core.position.z = -1.4 + this.wolfOff.z;
    };
    const A = this.action;

    if (A === 'prowl') {
      facePlayer();
      this._setAnim('walk');
      const R = 4.0;
      const nxr = dx / d, nzr = dz / d;
      let mx = -nzr * this.orbitSign, mz = nxr * this.orbitSign; // tangent
      if (d > R + 0.8) { mx = mx * 0.4 + nxr * 0.8; mz = mz * 0.4 + nzr * 0.8; }
      else if (d < R - 1.2) { mx = mx * 0.4 - nxr * 0.8; mz = mz * 0.4 - nzr * 0.8; }
      // IT WILL NOT BE STOOD ON.
      //
      // The guard made mashing SLOWER; it did not make it stop working — a
      // masher still took the Shadowgrip down in ninety seconds without once
      // reading a tell (tools/probe-masher.mjs). The reason is that standing
      // inside a prowling wolf's face was FREE: it circled politely at whatever
      // distance the child chose and let them swing into it all day.
      //
      // A wary animal does not do that. Crowd it while it is up and watching
      // and it gives ground — backs off fast, keeps its eyes on you — so the
      // child has to chase, and the damage they can land outside an opening is
      // whatever they get in before it is gone. No new attack, no telegraph to
      // read, nothing taken away from a five-year-old: it is the hounds' own
      // orbit, honest about its personal space.
      //
      // It never retreats out of the ARENA, and it never retreats while it is
      // winding up, attacking, or open — only while it is guarded, which is
      // exactly the window a child should not be free-hitting in.
      // MEASURED, NOT GUESSED. The first cut of this had the wolf BACK OFF when
      // crowded, and tools/probe-masher.mjs said that made it easier: the
      // retreat carried the child out of the swipe cone, so a masher lost one
      // heart in ninety seconds instead of eating the paw. It holds its ground
      // and ANSWERS instead — press your face into a wolf and the wolf is on
      // you sooner, which is the thing a child learns in one go.
      const CROWD = 2.4;
      if (d < CROWD) this.attackIn -= dt * 2.5;
      move(mx, mz, (enraged ? 2.7 : 2.1) * SM);
      this.attackIn -= dt;
      if (this.attackIn <= 0) {
        if (Math.random() < 0.35) this.orbitSign *= -1; // keep the circling fresh
        const move = this._pickMove(d);
        if (move === 'root') {
          // HER UNIQUE MOVE (P7 tell): thorns erupt where she stands.
          this.action = 'root';
          this.actionT = this._tell(1.0); // js/attacks.js sylva_thornburst.windup
          this._setAnim('idle');
          audio.play('growl', { volume: 0.7, rate: 0.5 }); // lower, different growl — new pattern
        } else if (move === 'pounce') {
          // THE POUNCE (js/attacks.js boss_pounce) — rears up, leaps onto
          // where you stood, lands with a shockwave. Its opening is a
          // different SHAPE: 1.4s dazed on its feet and right next to you,
          // against the charge's 2.6s collapse the length of the arena away.
          this.action = 'rear';
          this.actionT = this._tell(1.0);
          this._scrapeAcc = 0;
          this._setAnim('idle');
          facePlayer();
          audio.play('growl', { volume: 0.85, rate: 0.62, vary: 0.05 });
        } else if (move === 'swipe') {
          // close enough: the SWIPE (shield lesson)
          this.action = 'windup';
          this.actionT = this._tell(0.9);
          this._setAnim('idle');
          audio.play('growl', { volume: 0.6, rate: 0.42, vary: 0.05 }); // GROWL
        } else if (Math.random() < 0.4) {
          // trot in for the swipe
          this.action = 'stalk';
          this.actionT = 2.4;
        } else {
          // THE CHARGE (dodge lesson) — hound telegraph, boss-sized
          this.action = 'crouch';
          this.actionT = this._tell(1.0);
          this._scrapeAcc = 0;
          facePlayer();
          audio.play('growl', { volume: 0.9, rate: 0.5 }); // deep snarl wind-up
        }
      }
    } else if (A === 'stalk') {
      facePlayer();
      this._setAnim('run');
      move(dx / d, dz / d, (enraged ? 3.6 : 3.1) * SM);
      if (d < 2.6 || this.actionT <= 0) {
        this.action = 'windup';
        this.actionT = 0.9;
        this._setAnim('idle');
        audio.play('growl', { volume: 0.6, rate: 0.42, vary: 0.05 });
      }
    } else if (A === 'windup') {
      // snarl + coil: the paw is coming — raise the shield NOW (or roll)
      facePlayer();
      const f = 1 - Math.max(0, this.actionT) / 0.9;
      this.core.scale.y = 1 - 0.22 * f;
      this.eyeMat.emissiveIntensity = 1.2 + f * 2.6;
      if (this.actionT <= 0) {
        this.core.scale.y = 1;
        const dd = Math.hypot(px - wx, pz - wz) || 0.01;
        this.chargeDir = { x: (px - wx) / dd, z: (pz - wz) / dd };
        this.action = 'swipe';
        this.actionT = 0.55;
        this._swipeHit = false;
        if (this.attackAction) this.attackAction.reset().fadeIn(0.06).play();
        audio.play('whoosh', { volume: 0.85, rate: 0.65 });
      }
    } else if (A === 'swipe') {
      facePlayer();
      if (!this._swipeHit && this.actionT <= 0.35) {
        this._swipeHit = true;
        // frontal arc: close + in front = hit. Blockable, parryable
        // (attacker passed so a perfect parry STAGGERS the wolf), and a
        // jump clears it (groundAttack).
        const cone = (dx * this.chargeDir.x + dz * this.chargeDir.z) / d;
        if (d < 2.8 && cone > 0.35) player.hurt(this.skin.dmg, { attacker: this, groundAttack: true });
        juice.burst(wx + this.chargeDir.x * 1.6, 0.4, wz + this.chargeDir.z * 1.6, this.skin.burst, 8);
        audio.play('slam', { volume: 0.6, rate: 1.1 });
      }
      if (this.actionT <= 0) {
        this.action = 'recover';
        this.actionT = 1.6;
        this.eyeMat.emissiveIntensity = 0.5;
      }
    } else if (A === 'crouch') {
      // ON-BODY charge telegraph — same as the little hounds: coils LOW,
      // eyes flare bright, claws scrape up dust. ~1s to get out of the lane.
      facePlayer();
      const f = 1 - Math.max(0, this.actionT) / 1.0;
      this.core.scale.y = 0.78;
      this.eyeMat.emissiveIntensity = 1.4 + f * 3.2;
      this._scrapeAcc += dt;
      if (this._scrapeAcc > 0.22) {
        this._scrapeAcc = 0;
        juice.burst(wx - (dx / d) * 0.9, 0.2, wz - (dz / d) * 0.9, 0x9a8f80, 5); // dust
      }
      if (this.actionT <= 0) {
        this.core.scale.y = 1;
        const dd = Math.hypot(px - wx, pz - wz) || 0.01;
        this.chargeDir = { x: (px - wx) / dd, z: (pz - wz) / dd };
        this.action = 'charge';
        this.actionT = 1.0;
        this._chargeDist = 0;
        this._chargeHit = false;
        if (this.runAction) this.runAction.reset().play();
        if (this.attackAction) this.attackAction.reset().fadeIn(0.06).play();
        audio.play('whoosh', { volume: 0.9, rate: 0.7 });
        audio.play('growl', { volume: 0.8, rate: 0.55 });
      }
    } else if (A === 'charge') {
      this.core.rotation.y = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      move(this.chargeDir.x, this.chargeDir.z, (enraged ? 11.5 : 10.0) * SM);
      this._chargeDist += (enraged ? 11.5 : 10.0) * SM * dt;
      if (!this._chargeHit && d < 1.4) {
        this._chargeHit = true; // one hit per charge — never a grinder
        player.hurt(this.skin.dmg, { attacker: this, groundAttack: true });
      }
      if (this._chargeDist > 6.5 || this.actionT <= 0) {
        // THE COLLAPSE — the charge spends everything and the wolf visibly
        // FALLS OVER (Death clip, held). Slow-mo blip sells the crash and
        // stretches the window for small hands.
        this.action = 'tired';
        this.actionT = 2.6;
        if (this.runAction) this.runAction.fadeOut(0.2);
        if (this.attackAction) this.attackAction.fadeOut(0.15);
        if (this.collapseAction) {
          if (this.flyAction) this.flyAction.fadeOut(0.15);
          if (this.walkAction) this.walkAction.fadeOut(0.15);
          this.collapseAction.reset().fadeIn(0.1).play();
          this._anim = 'collapsed';
        }
        this.tiredRing.visible = true;
        juice.burst(this.x + this.core.position.x, 0.5, this.z + this.core.position.z, this.skin.burst, 12);
        juice.burst(this.x + this.core.position.x, 0.3, this.z + this.core.position.z, 0x9a8f80, 10); // dust
        if (juice.effects) {
          juice.effects.shake(0.4, 0.5);
          if (juice.effects.slow) juice.effects.slow(0.75, 0.6);
        }
        audio.play('slam', { volume: 0.95, rate: 0.6 }); // the THUD
      }
    } else if (A === 'root') {
      // SYLVA'S UNIQUE MOVE — ON-BODY telegraph, no ground decal (LAW 4):
      // she plants down, eyes flare green, thorns visibly grow up from the
      // ground at her own feet. ~1s to back off, the same reading time as
      // her charge crouch.
      facePlayer();
      const f = 1 - Math.max(0, this.actionT) / 1.0;
      this.core.scale.y = 0.85 - 0.1 * f;
      this.eyeMat.emissiveIntensity = 1.2 + f * 2.8;
      this._scrapeAcc += dt;
      if (this._scrapeAcc > 0.18) {
        this._scrapeAcc = 0;
        juice.burst(wx, 0.15, wz, 0x8fdc6a, 6); // thorns pushing up, not dust
      }
      if (this.actionT <= 0) {
        this.core.scale.y = 1;
        this.action = 'rootburst';
        this.actionT = 0.35; // js/attacks.js sylva_thornburst.active
        this._rootHit = false;
        audio.play('slam', { volume: 0.8, rate: 0.9 });
      }
    } else if (A === 'rootburst') {
      // THE RESOLVE — a single ring check, once, exactly like the charge
      // ("never a grinder"): caught inside the radius when the thorns snap
      // up, or you got out in time.
      if (!this._rootHit) {
        this._rootHit = true;
        juice.burst(wx, 0.4, wz, 0x8fdc6a, 16);
        if (juice.effects) juice.effects.shake(0.2, 0.3);
        if (d < this.skin.snares.radius) {
          player.hurt(this.skin.dmg, { attacker: this, groundAttack: true });
        }
      }
      if (this.actionT <= 0) {
        this.action = 'recover';
        this.actionT = 1.8; // js/attacks.js sylva_thornburst.recover
      }
    } else if (A === 'rear') {
      // ON-BODY tell (LAW 4): it RISES instead of crouching — the opposite
      // shape to the charge's coil, so a child can tell the two apart at a
      // glance without reading a decal. Eyes flare, dust falls off it.
      facePlayer();
      const f = 1 - Math.max(0, this.actionT) / this._tell(1.0);
      this.core.scale.y = 1 + 0.26 * f;
      this.core.position.y = 0.35 * f;
      this.eyeMat.emissiveIntensity = 1.3 + f * 3.0;
      this._scrapeAcc += dt;
      if (this._scrapeAcc > 0.2) {
        this._scrapeAcc = 0;
        juice.burst(wx, 1.6, wz, this.skin.burst, 4);
      }
      if (this.actionT <= 0) {
        this.core.scale.y = 1;
        // it leaps at WHERE YOU STAND WHEN IT COMMITS, not at where you end
        // up — the whole answer is to be somewhere else by the time it lands.
        this._pounceFrom = { x: wx, z: wz };
        this._pounceTo = { x: px, z: pz };
        this.action = 'pounce';
        this.actionT = 0.7;   // js/attacks.js boss_pounce.active
        this._pounceHit = false;
        if (this.attackAction) this.attackAction.reset().fadeIn(0.06).play();
        audio.play('whoosh', { volume: 0.95, rate: 0.8 });
      }
    } else if (A === 'pounce') {
      const f = 1 - Math.max(0, this.actionT) / 0.7;
      const from = this._pounceFrom, to = this._pounceTo;
      const nx = from.x + (to.x - from.x) * f, nz = from.z + (to.z - from.z) * f;
      const solved = this.world.resolveCircle(nx, nz, 0.85);
      this.wolfOff.x = solved.x - this.x;
      this.wolfOff.z = solved.z - (this.z - 1.4);
      this.core.position.x = this.wolfOff.x;
      this.core.position.z = -1.4 + this.wolfOff.z;
      this.core.position.y = Math.sin(f * Math.PI) * 1.5;      // the arc
      this.core.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      if (this.actionT <= 0 && !this._pounceHit) {
        this._pounceHit = true;
        this.core.position.y = 0;
        // THE LANDING. One shockwave, one hit, never a grinder — and it is
        // 2.4u so standing where it landed is the mistake and rolling out is
        // the answer, the same reading the Bone Warden's stomp teaches.
        const lx = this.x + this.core.position.x, lz = this.z + this.core.position.z;
        const ddx = px - lx, ddz = pz - lz;
        if (ddx * ddx + ddz * ddz < 2.4 * 2.4) {
          player.hurt(this.skin.dmg, { attacker: this, groundAttack: true });
        }
        juice.burst(lx, 0.4, lz, this.skin.burst, 14);
        juice.burst(lx, 0.25, lz, 0x9a8f80, 10);
        if (juice.effects) juice.effects.shake(0.32, 0.4);
        audio.play('slam', { volume: 0.9, rate: 0.75 });
        // ...and it is OPEN where it landed: on its feet, dazed, in reach.
        this.action = 'dazed';
        this.actionT = 1.4;   // js/attacks.js boss_pounce.recover — LAW 6 floor is 1.0
        this.tiredRing.visible = true;
        this.eyeMat.emissiveIntensity = 0.4;
        this._setAnim('idle');
      }
    } else if (A === 'dazed') {
      // the pounce's own opening: shorter than the collapse, but the boss is
      // standing right on top of the child, so it is the easiest one to reach
      if (this.actionT <= 0) {
        this.tiredRing.visible = false;
        this._backToProwl();
      }
    } else if (A === 'tired') {
      // COLLAPSED under the gold ring: eyes dim — pile the hits on
      this.eyeMat.emissiveIntensity = 0.3;
      if (this.actionT <= 0) {
        this.tiredRing.visible = false;
        if (this.collapseAction) this.collapseAction.fadeOut(0.3);
        this._anim = 'x';
        this._setAnim('idle');
        this._backToProwl();
      }
    } else if (A === 'recover') {
      // panting after the swipe (or staggered by a parry)
      facePlayer();
      this._setAnim('idle');
      if (this.actionT <= 0) this._backToProwl();
    }
  }

  // UP AND WATCHING = GUARDED. Every other action is either the boss winding
  // up (which is the child's cue, not their punish) or the boss OPEN. The two
  // openings that matter are named here rather than inferred, so adding a move
  // can never quietly turn a punish window into a guarded one.
  _guarded() {
    return this.action === 'prowl' || this.action === 'stalk';
  }

  // NEVER THE SAME MOVE TWICE RUNNING.
  //
  // The old chooser was a distance test and two coin flips, so in practice it
  // settled into swipe / charge / swipe / charge and a child learned the whole
  // fight in one cycle. This picks from the moves the SKIN carries, drops
  // whatever it just did, and drops anything the current distance makes
  // nonsense — a lunge from across the arena, a swipe from six metres away.
  _pickMove(d) {
    const all = this.skin.moves || ['swipe', 'charge'];
    let legal = all.filter((m) => {
      if (m === 'swipe') return d < 3.4;          // close work only
      if (m === 'pounce') return d > 2.2 && d < 8.5;
      if (m === 'root') return !!(this.skin.snares && this._halfHowled);
      return true;                                 // charge works at any range
    });
    if (legal.length > 1) legal = legal.filter((m) => m !== this._lastMove);
    if (!legal.length) legal = [d < 3.4 ? 'swipe' : 'charge'];
    const pick = legal[Math.floor(Math.random() * legal.length)];
    this._lastMove = pick;
    return pick;
  }

  // A TELL IS NEVER SHORTER THAN THE LAW. 0.9s is the boss floor (combat
  // context §2 LAW 1 — a child's choice reaction is around 800ms), and
  // `tellMult` only ever stretches it: region one telegraphs at 1.15x and the
  // last fight sits on the floor. Difficulty never buys itself reading time.
  _tell(base) {
    return Math.max(0.9, base * (this.skin.tellMult || 1));
  }

  _backToProwl() {
    this.action = 'prowl';
    this.eyeMat.emissiveIntensity = 1.2;
    // ...and the GAP between attacks is the region's, not one number for
    // everyone. Floored at 1.6s so even Shadow-Grimm leaves a child room to
    // breathe, reposition and pick a wolf.
    const base = this.skin.gap || 3.2;
    this.attackIn = Math.max(1.6, this._halfHowled ? base - 1.0 : base);
  }
}

// ---------------------------------------------------------------------------
// BOREAL, THE RIMEBOUND — Frostpeak's boss (v3.21).
// Obeys the same law as the wolves (a boss fights like its family, bigger):
// its family is the DIVERS — the Ember Moths taught this read in region 1.
// It circles overhead, telegraphs on its body, DIVES along a red lane, then
// crash-lands and lies grounded under a gold ring: the collapse window, in
// the air-to-ground register. And because flyers take full damage from bolts
// (an existing law), the throwing spark finally gets its moment.
// ---------------------------------------------------------------------------

const BOREAL_HP = 22;
// ELEMENT AUDIT (2026-08-23): matches Frostpeak's own mook weakness
// (js/enemies.js TRAITS, region 4 = fire) — Boreal took flat damage
// regardless of element until now, the one boss with zero elemental
// handling of any kind (not even Grimm's more elaborate adapts system).
const BOREAL_WEAKNESS = 'fire';
const BOREAL_DMG = 1.5;
// Cruising height + orbit radius (v3.21 sighting pass): the camera is pitched
// 50° and only 11 units back, so a boss circling the ARENA centre at 2.6 up
// and 4.2 out sailed clean off the top of a phone screen. She now wheels
// around the PLAYER, lower and tighter — always in frame, always menacing.
const HOVER_Y = 1.9;
const ORBIT_R = 2.5;
// ...and the wheel is biased NORTH of Kael. The camera sits ~7 units south of
// him: a flyer that swings behind it leaves the frame entirely. Measured on a
// phone-landscape viewport, not guessed.
const ORBIT_BIAS_Z = -0.9;
const ORBIT_CLAMP = 5.5;
const DIVE_BOUND = 6.6;   // she lands inside the arena, never in the treeline  // she never wheels out past the arena's standing stones

export class Boreal {
  constructor(world, x, z, dragonGltf) {
    this.world = world;
    this.name = 'Boreal, the Rimebound';
    this.x = x; this.z = z;
    this.maxHp = BOREAL_HP;
    this.coreHp = Math.min(state.flags.borealHp || BOREAL_HP, BOREAL_HP);
    this.defeated = false;
    this.onDefeated = null;

    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);

    this.core = new THREE.Group();
    const dragon = prepareCharacter(SkeletonUtils.clone(dragonGltf.scene));
    dragon.scale.setScalar(1.15);
    this.eyeMat = null;
    dragon.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (c.color) c.color.setHex(0x9fd0ea);        // rime-blue hide
        c.emissive = new THREE.Color(0x5f9fd0);
        c.emissiveIntensity = 0.3;
        if (!this.eyeMat) this.eyeMat = c;            // something to flare
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    this.core.add(dragon);
    this.dragon = dragon;
    this.mixer = new THREE.AnimationMixer(dragon);
    // EXACT NAME FIRST, SUBSTRING SECOND.
    //
    // A plain `includes()` match is one clip-order change away from a bug on
    // this body: it carries both "Attack" and "AttackPose", so whichever the
    // exporter happens to write first is what a substring search returns — and
    // AttackPose is a single held frame, which would make the dive a statue.
    // (The shipped file lists Attack first, so a substring match works today;
    // that is luck, not a guarantee, and re-exporting could quietly reverse
    // it.) Exact match first, then a trailing "Rig|Name" form, then substring
    // so the Quaternius body's "DragonArmature|Dragon_Attack" still resolves.
    const clip = (name) => dragonGltf.animations.find((c) => c.name === name)
      || dragonGltf.animations.find((c) => c.name.endsWith('|' + name))
      || dragonGltf.animations.find((c) => c.name.includes(name));
    const mk = (name, once) => {
      const c = clip(name);
      if (!c) return null;
      const a = this.mixer.clipAction(c);
      if (once) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
      return a;
    };
    // Named for what the fight needs, then resolved against whichever dragon
    // is mounted — the Quaternius body used Flying/Attack/Death/Hit; this one
    // brings a ground game the fight never had a body for.
    this.flyAction = mk('Flying_loop') || mk('Flying');
    if (this.flyAction) this.flyAction.play();
    this.attackAction = mk('Attack', true);
    this.deathAction = mk('Death', true);
    this.hitAction = mk('Hit', true);
    // NEW, and the reason this body is worth the swap: she can now LIE on the
    // ice and HEAVE herself back into the air, instead of sliding down and up
    // an invisible wire playing the same flight loop the whole time.
    this.idleGroundAction = mk('Idle_loop');
    this.stalkAction = mk('Walk_menacing_loop');
    this.riseAction = mk('GroundToFly', true);
    this.core.position.set(ORBIT_R, HOVER_Y, 0); // already on her wheel
    this.root.add(this.core);

    // the DIVE lane — red marks danger (contract grammar)
    this.lane = new THREE.Mesh(
      // 3.2 wide, because the dive hits anything within 1.6u of the flight
      // line. It was 1.3 — less than half — so a child who stepped just off
      // the red stripe was still squarely in the dragon's path.
      new THREE.PlaneGeometry(8.5, 3.2),
      new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0, depthWrite: false })
    );
    this.lane.rotation.x = -Math.PI / 2;
    this.lane.position.y = world.deckY + 0.05;
    world.add(this.lane);

    // GOLD "hit it now" ring for the grounded window (act-here law)
    this.tiredRing = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.95, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.tiredRing.rotation.x = -Math.PI / 2;
    this.tiredRing.position.y = world.deckY + 0.06;
    this.tiredRing.visible = false;
    world.add(this.tiredRing);

    // ALWAYS hittable — hovering low enough for a brave melee, and bolts
    // hit flyers for full (the region-1 law finally pays off)
    this.coreHittable = new Hittable(x, z, 1.5, (n, element) => this._hit(n, element));
    this.coreHittable.flying = true;
    world.enemies.push(this.coreHittable);
    this.coreExposed = true;

    this._mats = [];
    dragon.traverse((n) => {
      if (!n.isMesh) return;
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) {
        if (!m.emissive) continue;
        m.userData.be = m.emissive.getHex();
        m.userData.bi = m.emissiveIntensity;
        this._mats.push(m);
      }
    });
    this._hurtFlash = 0;

    this.action = 'circle';   // circle | windup | dive | grounded | rise
    this.actionT = 0;
    this.attackIn = 3.0;
    this.orbitA = 0;
    this.off = { x: ORBIT_R, z: 0 };
    this.cx = 0; this.cz = 0;   // orbit centre, relative to the arena anchor
    this.diveDir = { x: 0, z: 1 };
    this._enraged = this.coreHp <= BOREAL_HP / 2;
    this._dives = 0;
    world.boss = this;
  }

  _hit(n, element = 'steel') {
    if (this.defeated) return;
    // while airborne it is a hard target for a sword — bolts are the answer,
    // but the grounded window doubles up (that is where the fight is won)
    const weak = element === BOREAL_WEAKNESS;
    if (weak) n *= 1.5;
    this.coreHp -= n;
    state.flags.borealHp = Math.max(0, this.coreHp);
    const wx = this.x + this.off.x, wz = this.z + this.off.z;
    if (weak) {
      juice.burst(wx, HOVER_Y, wz, 0xffe14a, 8);
      if (this.world.onDmgNum) this.world.onDmgNum(wx, HOVER_Y + 0.9, wz, 'SUPER!');
      bumpCounter('weakHits');
    }
    if (this.world.onDmgNum) this.world.onDmgNum(wx, HOVER_Y + 0.6, wz, n);
    this._hurtFlash = 0.2;
    if (this.hitAction && this.action !== 'grounded') this.hitAction.reset().play();
    if (!this._enraged && this.coreHp <= BOREAL_HP / 2) {
      this._enraged = true;
      audio.howl({ volume: 0.95, rate: 1.5 });          // a shriek, not a howl
      juice.burst(wx, HOVER_Y, wz, 0xbfefff, 16);
    }
    if (this.coreHp <= 0) this._defeat();
  }

  // a parry or heavy stun swats it out of the air — the shield answers here too
  takeStun(sec) {
    if (this.defeated || this.action === 'grounded') return;
    this._ground(Math.max(2.2, sec));
  }

  _ground(dur) {
    this.action = 'grounded';
    this.actionT = dur;
    this.lane.material.opacity = 0;
    this.tiredRing.visible = true;
    if (this.flyAction) this.flyAction.fadeOut(0.2);
    juice.burst(this.x + this.off.x, 0.5, this.z + this.off.z, 0xbfefff, 14);
    juice.burst(this.x + this.off.x, 0.3, this.z + this.off.z, 0xeaffff, 10);
    if (juice.effects) {
      juice.effects.shake(0.45, 0.5);
      if (juice.effects.slow) juice.effects.slow(0.75, 0.6);
    }
    audio.play('slam', { volume: 0.95, rate: 0.7 });
  }

  _defeat() {
    this.defeated = true;
    state.flags.borealHp = 0;
    if (juice.effects) {
      juice.effects.shake(0.65, 1.3);
      juice.effects.hitStop(0.14);
      juice.effects.groundSlam(this.root.position.clone(), 0x9be3ff);
      setTimeout(() => juice.effects && juice.effects.groundSlam(this.root.position.clone(), 0xeaffff), 350);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      juice.burst(this.x + Math.cos(a) * 1.2, 0.6 + (i % 3) * 0.6, this.z + Math.sin(a) * 1.2, 0xbfefff, 12);
    }
    audio.play('slam', { volume: 1, rate: 0.55 });
    audio.howl({ volume: 0.85, rate: 1.3 });
    this.tiredRing.visible = false;
    this.lane.material.opacity = 0;
    this.coreHittable.dead = true;
    if (this.deathAction) {
      if (this.flyAction) this.flyAction.fadeOut(0.2);
      this.deathAction.reset().play();
    } else if (this.riseAction) {
      // NO DEATH CLIP ON THIS BODY — so take the one that carries her INTO
      // the air and run it backwards: a dragon dropping out of flight is
      // exactly what a beaten flyer should do, in her own motion rather than
      // a pose borrowed from somewhere else. The dissolve below does the rest.
      if (this.flyAction) this.flyAction.fadeOut(0.2);
      if (this.idleGroundAction) this.idleGroundAction.fadeOut(0.2);
      this.riseAction.reset();
      this.riseAction.timeScale = -1;
      this.riseAction.time = this.riseAction.getClip().duration;
      this.riseAction.fadeIn(0.1).play();
    }
    this._dissolveT = 1.6;
    state.flags.borealDefeated = true;
    if (!state.formsUnlocked.includes('frost_wolf')) state.formsUnlocked.push('frost_wolf');
    if (this.onDefeated) this.onDefeated();
  }

  update(dt, t, player) {
    this.mixer.update(dt);
    if (this.defeated) {
      if (this._dissolveT > 0) {
        this._dissolveT -= dt;
        const f = Math.max(0, this._dissolveT / 1.6);
        this.core.position.y = Math.max(0.1, HOVER_Y * f);
        this.core.scale.setScalar(Math.max(0.02, f));
        this._burstAcc = (this._burstAcc || 0) + dt;
        if (this._burstAcc > 0.18) {
          this._burstAcc = 0;
          const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.6;
          juice.burst(this.x + Math.cos(a) * r, 0.5 + Math.random() * 1.6, this.z + Math.sin(a) * r, 0xbfefff, 10);
          smokePuff(this.world, this.x + Math.cos(a) * r, 0.8, this.z + Math.sin(a) * r, 0xdff2ff);
        }
        if (this._dissolveT <= 0) this.root.remove(this.core);
      }
      return;
    }

    if (this._hurtFlash > 0) {
      this._hurtFlash -= dt;
      const on = this._hurtFlash > 0;
      for (const m of this._mats) {
        m.emissive.setHex(on ? 0xff2a1a : m.userData.be);
        m.emissiveIntensity = on ? 0.8 : m.userData.bi;
      }
    }

    const px = player.root.position.x, pz = player.root.position.z;
    const wx = this.x + this.off.x, wz = this.z + this.off.z;
    const dx = px - wx, dz = pz - wz;
    const d = Math.hypot(dx, dz) || 0.01;
    this.actionT -= dt;
    const face = () => { this.core.rotation.y = Math.atan2(dx, dz); };
    const A = this.action;

    if (A === 'circle') {
      // she wheels around KAEL, not around the arena — so she is never a
      // dot in the corner of the screen, and the pressure never lets up
      face();
      const spd = this._enraged ? 1.15 : 0.85;
      const tx = Math.max(-ORBIT_CLAMP, Math.min(ORBIT_CLAMP, px - this.x));
      const tz = Math.max(-ORBIT_CLAMP, Math.min(ORBIT_CLAMP, pz + ORBIT_BIAS_Z - this.z));
      const ease = Math.min(1, dt * 1.1);   // a slow wheel, never a snap
      this.cx += (tx - this.cx) * ease;
      this.cz += (tz - this.cz) * ease;
      this.orbitA += dt * spd;
      this.off.x = this.cx + Math.cos(this.orbitA) * ORBIT_R;
      this.off.z = this.cz + Math.sin(this.orbitA) * ORBIT_R;
      this.core.position.set(this.off.x, HOVER_Y + Math.sin(t * 1.6) * 0.25, this.off.z);
      this.attackIn -= dt;
      if (this.attackIn <= 0) {
        this.action = 'windup';
        this.actionT = 0.9;                       // the ≥0.9s boss telegraph
        this.diveDir = { x: dx / d, z: dz / d };
      }
    } else if (A === 'windup') {
      // ON-BODY tell: it rears, wings beat hard, frost gathers — plus the
      // RED lane on the ground, the one floor decal a boss charge is allowed
      face();
      const f = 1 - Math.max(0, this.actionT) / 0.9;
      this.core.position.y = HOVER_Y + 0.5 * f;
      this.core.scale.setScalar(1 + 0.06 * f);
      this.lane.material.opacity = 0.2 + 0.35 * f;
      this.lane.position.set(wx + this.diveDir.x * 4, this.world.deckY + 0.05, wz + this.diveDir.z * 4);
      // Same mirror-instead-of-rotate error the Bone Warden's chop arc had:
      // the plane is laid flat by rotation.x = -PI/2, so its long axis ends up
      // along world (cos z, -sin z) and the heading must be atan2(-dz, dx).
      // The old form was only right on the cardinals — at a diagonal the red
      // stripe lay PERPENDICULAR to the dive it was warning about.
      this.lane.rotation.z = Math.atan2(-this.diveDir.z, this.diveDir.x);
      if (this.actionT <= 0) {
        this.core.scale.setScalar(1);
        // SHE DIVES WHERE THE LANE SAID. This used to re-aim at the child at
        // the instant the dive began, throwing away the direction it had just
        // spent 0.9s advertising — so the one floor decal a boss charge is
        // allowed to draw was decoration, and stepping off it did nothing.
        // A telegraph you cannot act on is worse than no telegraph.
        this.action = 'dive';
        this.actionT = 0.85;
        this._diveHit = false;
        this._diveDist = 0;
        if (this.attackAction) this.attackAction.reset().play();
        audio.play('whoosh', { volume: 0.95, rate: 0.85 });
      }
    } else if (A === 'dive') {
      this.core.rotation.y = Math.atan2(this.diveDir.x, this.diveDir.z);
      const speed = this._enraged ? 11.5 : 9.5;
      this.off.x += this.diveDir.x * speed * dt;
      this.off.z += this.diveDir.z * speed * dt;
      this._diveDist += speed * dt;
      // swoops down to head height through the middle of the run, then up
      const f = Math.min(1, this._diveDist / 6.5);
      this.core.position.set(this.off.x, HOVER_Y - Math.sin(f * Math.PI) * (HOVER_Y - 0.75), this.off.z);
      this.lane.material.opacity = Math.max(0, this.lane.material.opacity - dt * 2);
      if (!this._diveHit && d < 1.6 && this.core.position.y < 1.7) {
        this._diveHit = true;                     // one hit per dive, never a grinder
        player.hurt(BOREAL_DMG, { attacker: this, groundAttack: false });
      }
      // she must never crash half-inside the mountainside: the run ends at the
      // arena's edge, which reads as her clipping a standing stone
      const edge = Math.max(Math.abs(this.off.x), Math.abs(this.off.z)) > DIVE_BOUND;
      if (edge) {
        this.off.x = Math.max(-DIVE_BOUND, Math.min(DIVE_BOUND, this.off.x));
        this.off.z = Math.max(-DIVE_BOUND, Math.min(DIVE_BOUND, this.off.z));
      }
      if (edge || this._diveDist > 6.5 || this.actionT <= 0) {
        this._dives++;
        // enraged, it strings TWO dives before it has to land (but a dive cut
        // short by the arena edge always crashes — that IS the punish window)
        if (!edge && this._enraged && this._dives % 2 === 1) {
          this.action = 'windup';
          this.actionT = 0.55;                    // shorter second tell
          this.diveDir = { x: dx / d, z: dz / d };
        } else {
          this._ground(2.6);                      // THE CRASH — the punish window
        }
      }
    } else if (A === 'grounded') {
      // wings folded, sprawled on the ice: hit it with everything
      if (this.idleGroundAction && !this._onGroundClip) {
        this._onGroundClip = true;
        if (this.flyAction) this.flyAction.fadeOut(0.25);
        if (this.riseAction) this.riseAction.stop();
        this.idleGroundAction.reset().fadeIn(0.25).play();
      }
      this.core.position.y += (0.2 - this.core.position.y) * Math.min(1, dt * 6);
      this.tiredRing.position.x = this.x + this.off.x;
      this.tiredRing.position.z = this.z + this.off.z;
      const pulse = 1 + Math.sin(t * 5) * 0.06;
      this.tiredRing.scale.set(pulse, pulse, 1);
      this.tiredRing.material.opacity = 0.6 + Math.sin(t * 5) * 0.25;
      if (this.actionT <= 0) {
        this.action = 'rise';
        this.actionT = 0.8;
        this.tiredRing.visible = false;
        this._onGroundClip = false;
        // GroundToFly is exactly this beat, so play it and let the flight loop
        // take over underneath as it finishes. Bodies without that clip fall
        // straight back to the loop, which is what shipped before.
        if (this.idleGroundAction) this.idleGroundAction.fadeOut(0.2);
        if (this.riseAction) this.riseAction.reset().fadeIn(0.1).play();
        if (this.flyAction) this.flyAction.reset().fadeIn(this.riseAction ? 0.6 : 0.2).play();
        audio.play('whoosh', { volume: 0.7, rate: 1.2 });
      }
    } else if (A === 'rise') {
      face();
      this.core.position.y += (HOVER_Y - this.core.position.y) * Math.min(1, dt * 4);
      if (this.actionT <= 0) {
        this.action = 'circle';
        // resume the wheel from exactly where she is — pick the angle first,
        // then place the centre behind her, so the orbit starts with no jump
        this.orbitA = Math.atan2(this.off.z - this.cz, this.off.x - this.cx);
        this.cx = this.off.x - Math.cos(this.orbitA) * ORBIT_R;
        this.cz = this.off.z - Math.sin(this.orbitA) * ORBIT_R;
        this.attackIn = this._enraged ? 2.0 : 3.0;
      }
    }

    // the hitbox RIDES the dragon (a boss is a creature, never a turret)
    this.coreHittable.x = this.x + this.off.x;
    this.coreHittable.z = this.z + this.off.z;
    // grounded, it is a normal target; airborne, it is a FLYER (bolts shine)
    this.coreHittable.flying = this.action !== 'grounded';
  }
}
