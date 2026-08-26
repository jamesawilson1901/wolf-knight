// THE DRESSING VOCABULARY — clusters, not props.
//
// design/ROOM-STANDARD.md, written after dad's first playthrough: the rooms
// "are largely filled with nothing… big but bare… they aren't like a Zelda game
// or terranigma game or even a Pokemon game that uses space effectively", and
// of all the vendored art "there is only a handful used".
//
// The reason the old rooms were bare is not that placing props is hard. It is
// that the vocabulary was wrong. scatter() sprinkles rocks, and a room
// sprinkled with rocks is DECORATED, not INHABITED. You do not dress a burnt
// village by placing a barrel — you place the REMAINS OF A HOUSE, and the
// barrel is one of the things left in it.
//
// So everything here is a CLUSTER, and each one is a sentence about what
// happened in this place. They are bound to a kit rather than hard-wired to
// one, because a ruined home is a ruined home whether its walls are Ember's
// burnt masonry, Stoneroot's cut rock or the Wild Woods' overgrown stone — and
// a vocabulary that only Level 1 can speak is how Level 3 ended up using zero
// of its fourteen forest models.
//
// Two rules run through all of them, from ROOM-STANDARD §2:
//   BIG THINGS BLOCK    — walls, columns, statues, hearths take colliders and
//                         you navigate around them; this is what SHAPES a room
//   SMALL THINGS DON'T  — bricks, skulls, coins, spilled belongings have no
//                         collider at all, so a five-year-old running at the
//                         screen never snags on scenery
//
// Draw calls are not the constraint they look like: tintedModel() keys its
// cache on surface class plus tint, so every prop in a district shares three
// materials and flattenStatic folds each spatial cell's worth into one draw.
// A thirty-prop cluster costs about one call. Measured on `la`: 351 loose
// meshes became 30 draws.
//
// Every cluster is missing-asset safe — place() returns null for a kit key the
// bound kit does not have, so a region can adopt the vocabulary before it has
// vendored every model.

import * as THREE from 'three';

export function makeDressers({ kit, tint, isGrey }) {
  const K = kit;
  const TINT = tint;
  // GREYBOX IS NOT DRESSED. The build-order law is greybox before art, without
  // exception — the greybox exists to have its LAYOUT walked and approved, and
  // a greybox room with kit art standing in it is not the thing that was
  // approved. It also wrecked the measurement: finish() returns before
  // flattenStatic in greybox, so every unbatched cluster prop counted as its
  // own draw call and verify-level1 reported `lb` at 272 against a room that
  // measures 102 dressed.
  //
  // A room's SHAPE in greybox still comes from shell() and wallRun(), exactly
  // as it did before the vocabulary existed.
  const GREY = isGrey || (() => false);

  // blend two packed hex colours — used to DRAIN a sick tree toward the
  // corruption's colour rather than merely darkening it
  const mixHex = (a, b, t) => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(ar + (br - ar) * t) << 16)
          | (Math.round(ag + (bg - ag) * t) << 8)
          | Math.round(ab + (bb - ab) * t));
  };


  // ---------------------------------------------------------------------------
  // THE RUIN VOCABULARY
  //
  // design/ROOM-STANDARD.md, written after dad's first playthrough: the rooms
  // "are largely filled with nothing… big but bare… they aren't like a Zelda game
  // or terranigma game or even a Pokemon game that uses space effectively."
  //
  // The reason the old rooms were bare is not that placing props is hard. It is
  // that the vocabulary was wrong. `scatter()` sprinkles rocks, and a room
  // sprinkled with rocks is decorated, not INHABITED. You do not dress Ember
  // Hollow by placing a barrel — you place the REMAINS OF A HOUSE, and the barrel
  // is one of the things left in it.
  //
  // So these are CLUSTERS. Each one is a sentence about what happened here.
  //
  // Two rules run through all of them, from ROOM-STANDARD §2:
  //   BIG THINGS BLOCK    — walls, columns, statues, hearths get colliders and
  //                         you navigate around them; this is what shapes a room
  //   SMALL THINGS DON'T  — bricks, skulls, coins, cobwebs, spilled belongings
  //                         have no collider at all, so a five-year-old running
  //                         at the screen never snags on scenery
  //
  // Draw calls are not the constraint they look like: tintedModel() keys its
  // cache on material identity, so every prop cut from the dungeon atlas at one
  // district tint shares ONE material, and flattenStatic() folds the lot into a
  // single merged draw. A thirty-prop cluster costs about one call.
  // ---------------------------------------------------------------------------

  // Small deterministic PRNG, so a ruin looks the same every time a child walks
  // back into the room. A room that reshuffles on re-entry tells them the world
  // is not real.
  function srnd(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One placement helper shared by every cluster below. Returns the mesh so a
  // caller can nudge it; adds nothing to any gameplay list, so flattenStatic
  // folds it away.
  // Solid props ask the world before they stand anywhere. `place` itself stays
// dumb — clutter with no collider may sit wherever it likes, and stopping a
// tuft of grass from overlapping a spawn point would only make rooms emptier.
function place(world, g, gltf, key, x, y, z, s, ry = 0, rz = 0, colour = 0x808080, shadow = true,
    centre = false) {
    if (!gltf) return null;
    const m = TINT(gltf, key, colour);
    // SOME MODELS ARE NOT MODELLED ON THEIR OWN ORIGIN.
    //
    // `Vase.glb` sits 1.09u away from its pivot in Z (tools/probe-modelsize.mjs
    // prints this for any GLB), so a vase asked for at a spot was DRAWN a metre
    // and a bit from it — through a wall, or outside the house it belonged to.
    // Nothing in the codebase had ever measured a model against its own pivot,
    // so nothing had ever noticed. Callers that place a thing AT a point rather
    // than aligned to a grid ask for it to be centred first; the shell and the
    // arch pieces do not, because their offsets are how they tile.
    if (centre) {
      const bb = new THREE.Box3().setFromObject(m);
      const ox = (bb.min.x + bb.max.x) / 2, oz = (bb.min.z + bb.max.z) / 2;
      for (const c of m.children) { c.position.x -= ox; c.position.z -= oz; }
    }
    m.position.set(x, y, z);
    m.rotation.set(0, ry, rz);
    m.scale.setScalar(s);
    // THE SHADOW PASS IS A SECOND DRAW CALL, per caster, forever. flattenStatic
    // culls casters under 1.4u AFTER merging — but a merged cell of forty bricks
    // is sixteen units across and sails through that test, so the cull never sees
    // the bricks it was written for. Small clutter therefore opts out HERE,
    // before it is merged, and its shadowless batch buckets separately.
    if (!shadow) m.traverse((n) => { if (n.isMesh) n.castShadow = false; });
    g.add(m);
    return m;
  }

  // --- THE REMAINS OF A HOUSE -------------------------------------------------
  // A footprint of wall, a doorway still standing because doorways always are,
  // and the things the family did not take with them. `ry` turns the whole house.
  //
  // The doorway is the point. A ruin without a doorway is a pile; a ruin WITH one
  // is a home, because a child knows what a door is for.
  function ruinedHome(world, x, z, ry, D, opts = {}) {
    if (GREY()) return null;
    const W = opts.w !== undefined ? opts.w : 6;      // footprint
    const Dp = opts.d !== undefined ? opts.d : 5;
    const hw = W / 2, hd = Dp / 2;
    // a house doesn't stand IN the lake it's next to — walls, a hearth and
    // spilled belongings floating on open water reads as a bug, not a ruin
    if (world.nearWater(x, z, Math.max(hw, hd))) return null;
    const r = srnd(Math.round(x * 73 + z * 31 + 17));
    const g = new THREE.Group();
    const P = D.propTint || D.floorTint;

    // --- the walls, broken down to different heights on each run --------------
    // Modular wall pieces are ~2u wide. Dropping some below the floor is how a
    // wall becomes a RUINED wall without a second model: the top is simply gone.
    const runWall = (x0, z0, x1, z1, keep) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2));
      const a = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i < n; i++) {
        if (r() > keep) continue;                     // this stretch has fallen
        const t = (i + 0.5) / n;
        const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        if (world.blocked(x + px, z + pz, 0.7)) continue;
        const sink = r() < 0.45 ? -(0.3 + r() * 0.8) : 0;   // slumped, not level
        place(world, g, K().wallMod, 'ruinWall', px, sink, pz,
          1.0, a + Math.PI / 2, 0, P);
        if (sink > -0.5) world.addBox(x + px - 0.5, x + px + 0.5, z + pz - 0.5, z + pz + 0.5);
      }
    };
    runWall(-hw, -hd, hw, -hd, opts.keep || 0.72);        // back wall
    runWall(-hw, -hd, -hw, hd, opts.keep || 0.6);         // left
    runWall(hw, -hd, hw, hd, opts.keep || 0.55);          // right
    // the front is open — you can see in, and walk in

    // --- the doorway, still standing ------------------------------------------
    if (opts.door !== false && !world.blocked(x, z + hd, 1.4)) {
      place(world, g, K().archDoor, 'ruinDoor', 0, 0, hd, 1.0, 0, 0, P);
      world.addBox(x - 1.4, x - 0.7, z + hd - 0.4, z + hd + 0.4);
      world.addBox(x + 0.7, x + 1.4, z + hd - 0.4, z + hd + 0.4);
    }

    // --- what they left ------------------------------------------------------
    coldHearth(world, x + (r() - 0.5) * 1.5, z - hd + 1.2, D, g);
    const spill = 3 + Math.round(r() * 3);
    for (let i = 0; i < spill; i++) {
      const px = (r() - 0.5) * (W - 1.2), pz = (r() - 0.5) * (Dp - 1.6);
      const pick = r();
      const gltf = pick < 0.4 ? K().barrel : pick < 0.75 ? K().crate : K().vase;
      const sc = gltf === K().vase ? 1.6 : 1.0;
      // knocked over: a barrel lying on its side says "left in a hurry" in a way
      // an upright one never does
      const down = r() < 0.5;
      // THE LIFT IS FOR ROUND THINGS ONLY. Rolling a barrel or a vase onto its
      // side puts it on its curved face, so it needs raising by its radius. A
      // CRATE rolled ninety degrees is still a box sitting flat — lifting it
      // leaves it hanging 0.28 above the floor, which is what the Court's
      // pockets were doing.
      const round = gltf !== K().crate;
      place(world, g, gltf, 'ruinGoods', px, down && round ? 0.28 : 0, pz,
        sc, r() * 6.28, down ? Math.PI / 2 : 0, P, false, true);
    }
    // brick spill from the fallen courses — small, so you walk through it
    for (let i = 0; i < 6 + r() * 6; i++) {
      place(world, g, K().brick, 'ruinBrick',
        (r() - 0.5) * (W + 2.5), 0, (r() - 0.5) * (Dp + 2.5),
        0.8 + r() * 0.5, r() * 6.28, 0, P, false);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    world.add(g);
    return g;
  }

  // A hearth nobody has lit in a long time. The one thing in a burnt village that
  // is unmistakably domestic.
  function coldHearth(world, x, z, D, parent = null) {
    if (GREY()) return null;
    // a fire, out in the open water — no ground under it to have burned on.
    // Skipped only when called on its own; nested inside ruinedHome it's a
    // few units off that home's own x/z, already checked by ITS bail.
    if (!parent && world.nearWater(x, z, 1.3)) return null;
    const g = parent || new THREE.Group();
    const px = parent ? x : 0, pz = parent ? z : 0;
    place(world, g, K().woodfire, 'hearth', px, 0, pz, 1.1, 0, 0, D.propTint || D.wallTint);
    const r = srnd(Math.round(x * 41 + z * 97));
    for (let i = 0; i < 7; i++) {                     // the stone ring around it
      const a = (i / 7) * Math.PI * 2 + r();
      place(world, g, i % 2 ? K().rockSA : K().rockSB, 'hearthRing',
        px + Math.cos(a) * 1.1, 0, pz + Math.sin(a) * 1.1, 0.42 + r() * 0.18, a, 0, D.propTint || D.wallTint, false);
    }
    if (!parent) { g.position.set(0, 0, 0); world.add(g); }
    return g;
  }

  // A column that came down, plus the drum sections that rolled. Reads as
  // COLLAPSE rather than as decoration, because the pieces are scattered along
  // the direction it fell.
  function fallenColumn(world, x, z, dir, D, len = 4) {
    if (GREY()) return null;
    const g = new THREE.Group();
    const r = srnd(Math.round(x * 13 + z * 57));
    const dx = Math.sin(dir), dz = Math.cos(dir);
    if (!world.blocked(x, z, 0.7)) {
      place(world, g, K().column, 'fallCol', 0, 0, 0, 1.0, 0, 0, D.propTint || D.wallTint);
      world.addCircle(x, z, 0.6, 'decor');
    }
    for (let i = 1; i <= 3; i++) {                    // the drums, lying down
      const t = i * (len / 3);
      if (world.blocked(x + dx * t, z + dz * t, 0.6)) continue;
      place(world, g, K().column2, 'fallCol',
        dx * t + (r() - 0.5) * 0.5, 0.42, dz * t + (r() - 0.5) * 0.5,
        0.9, r() * 6.28, Math.PI / 2, D.propTint || D.wallTint);
      world.addCircle(x + dx * t, z + dz * t, 0.5, 'decor');
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }

  // Rubble: bricks, chips and dust. NO colliders — this is the stuff that fills
  // the gaps between the things that matter, and a child must be able to run
  // straight through it.
  function rubbleField(world, x, z, rad, D, n = 14) {
    if (GREY()) return null;
    const g = new THREE.Group();
    const r = srnd(Math.round(x * 29 + z * 83 + n));
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad;
      const pick = r();
      const gltf = pick < 0.55 ? K().brick
                 : pick < 0.8 ? K().rockSA : K().rockSB;
      place(world, g, gltf, 'rubble', Math.cos(a) * dd, 0, Math.sin(a) * dd,
        0.6 + r() * 0.6, r() * 6.28, 0, D.propTint || D.wallTint, false);
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }

  // A wayside shrine: pedestal, arch, a banner that did not burn all the way.
  // Somewhere people STOPPED — the strongest signal a space was lived in.
  function wayshrine(world, x, z, ry, D) {
    if (GREY()) return null;
    if (world.blocked(x, z, 1.1) || world.nearWater(x, z, 1.1)) return null;
    const g = new THREE.Group();
    place(world, g, K().arch, 'shrine', 0, 0, 0, 1.1, 0, 0, D.propTint || D.wallTint);
    place(world, g, K().pedestal, 'shrine', 0, 0, -0.2, 1.0, 0, 0, D.propTint || D.wallTint);
    place(world, g, K().banner, 'shrine', 0, 0, -1.0, 1.0, 0, 0, D.propTint || D.floorTint);
    world.addCircle(x, z, 0.9, 'decor');
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    world.add(g);
    return g;
  }

  // A cart that did not make it out. Timbers, a wheel-less axle, and whatever
  // was being carried spilled around it. This is the clearest single image of
  // "people were LEAVING" that the kit can make, and it is small enough to sit
  // mid-room without taking the fighting floor away.
  function cartWreck(world, x, z, ry, D) {
    if (GREY()) return null;
    if (world.blocked(x, z, 1.2) || world.nearWater(x, z, 1.2)) return null;
    const g = new THREE.Group();
    const r = srnd(Math.round(x * 51 + z * 23));
    const P = D.propTint || D.floorTint;
    place(world, g, K().logStack, 'cart', 0, 0, 0, 1.0, 0, 0, P);
    place(world, g, K().logStack, 'cart', 0.9, 0.35, -0.6, 0.8, 0.7, 0.5, P);
    for (let i = 0; i < 4; i++) {
      const gl = r() < 0.5 ? K().barrel : K().crate;
      // ONE decision about whether this thing fell over, not two. The lift and
      // the tip were separate random draws, so a crate could be raised 0.28
      // without being rotated at all — a box hanging in the air beside a
      // wrecked cart. And the lift is for ROUND things: a barrel on its side
      // rests on its curve, a crate stays a box.
      const down = r() < 0.6;
      const round = gl !== K().crate;
      place(world, g, gl, 'cart', (r() - 0.5) * 3.4, down && round ? 0.28 : 0, (r() - 0.5) * 2.8,
        1.0, r() * 6.28, down ? Math.PI / 2 : 0, P, false);
    }
    world.addCircle(x, z, 1.0, 'decor');        // the wreck itself blocks; the spill does not
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    world.add(g);
    return g;
  }

  // A stub of wall left standing chest-high. THIS IS COVER, and it is the one
  // piece of the vocabulary placed INSIDE the fighting floor on purpose:
  // ROOM-STANDARD §1 asks for open ground where fights happen and §2 asks that
  // you navigate around things, and the way both are true at once is a few
  // discrete pieces with clear space between them — which is how a Zelda arena
  // with pillars in it works.
  function lowWall(world, x, z, ry, D, len = 3) {
    if (GREY()) return null;
    const g = new THREE.Group();
    const n = Math.max(1, Math.round(len / 2));
    const r = srnd(Math.round(x * 67 + z * 11));
    const P = D.propTint || D.floorTint;
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) * 2;
      place(world, g, K().wallMod, 'lowWall', t, -(0.55 + r() * 0.5), 0, 1.0, Math.PI / 2, 0, P);
    }
    for (let i = 0; i < 5; i++) {
      place(world, g, K().brick, 'lowWall', (r() - 0.5) * (len + 2), 0, (r() - 0.5) * 2.4,
        0.75 + r() * 0.4, r() * 6.28, 0, P, false);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    world.add(g);
    // the collider follows the run, in world space
    const dx = Math.sin(ry) * len / 2, dz = Math.cos(ry) * len / 2;
    const steps = Math.max(2, Math.round(len / 1.2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps * 2 - 1;
      // COVER MUST NOT STAND ON A SPAWN POINT. la's second stub ran straight
      // through the Shade at (6, -1), and t1b's through a thorn hound, and the
      // sweep had to declaw all four of them on every single load.
      if (world.blocked(x + dx * t, z + dz * t, 0.7)) continue;
      world.addCircle(x + dx * t, z + dz * t, 0.62, 'decor');
    }
    return g;
  }

  // The things the fire left behind, scattered where they fell. Skulls and coins
  // are SMALL — no colliders, and deliberately sparse: one skull is a story, six
  // is a haunted house, and this is a sad place rather than a spooky one.
  function aftermath(world, x, z, rad, D, seed = 1) {
    if (GREY()) return null;
    const g = new THREE.Group();
    const r = srnd(Math.round(x * 19 + z * 61 + seed));
    const n = 2 + Math.round(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad;
      const gltf = r() < 0.6 ? K().skull : K().coins;
      place(world, g, gltf, 'aftermath', Math.cos(a) * dd, 0, Math.sin(a) * dd,
        gltf === K().coins ? 1.0 : 0.9, r() * 6.28, 0, D.propTint || D.floorTint, false);
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }



  // ==========================================================================
  // THE FOREST VOCABULARY
  //
  // Ember and Stoneroot are built things that fell down; the Wild Woods is a
  // GROWN thing that is being eaten. Dad's brief: "it was the loveliest place
  // in the world and something is rotting it from the inside. Gorgeous colour
  // with the corruption spreading visibly through it — you can see what it's
  // losing." So these clusters come in matched pairs — a grove and a dead
  // grove, a thicket and a blighted one — and a room says how far the rot has
  // reached by which of the pair it is dressed with, and where.
  //
  // The kit keys here (treeQ1..4, bareQ1..2, bushQ1..3, grassQ1..2, rockQ1..3)
  // are the Quaternius forest pack, which was vendored, licence-cleared and
  // used ZERO times — Level 3 shipped dressed with two generic Kenney trees.
  // ==========================================================================

  const TREES = ['treeQ1', 'treeQ2', 'treeQ3', 'treeQ4'];
  const BARE = ['bareQ1', 'bareQ2'];
  const BUSHES = ['bushQ1', 'bushQ2', 'bushQ3'];
  const GRASS = ['grassQ1', 'grassQ2'];
  const FROCKS = ['rockQ1', 'rockQ2', 'rockQ3'];
  const pick = (arr, r) => K()[arr[Math.floor(r() * arr.length) % arr.length]];

  // A stand of trees with the undergrowth that belongs under them. TREES BLOCK
  // (ROOM-STANDARD §2 — you navigate around them and they are what shapes a
  // forest room); grass, flowers and small bushes do NOT, so a five-year-old
  // running at the screen brushes straight through the greenery.
  function grove(world, x, z, rad, D, opts = {}) {
    if (GREY()) return null;
    const g = new THREE.Group();
    const r = srnd(Math.round(x * 37 + z * 91 + rad * 7));
    const P = D.propTint || D.floorTint;
    const sick = opts.sick || 0;                 // 0 = whole, 1 = wholly rotten
    const n = opts.trees !== undefined ? opts.trees : 3 + Math.round(rad * 0.5);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad;
      const px = Math.cos(a) * dd, pz = Math.sin(a) * dd;
      if (world.blocked(x + px, z + pz, 0.7)) continue;   // this is where the hound stands
      const dead = r() < sick;
      const gltf = dead ? pick(BARE, r) : pick(TREES, r);
      const sc = (dead ? 0.9 : 1.0) * (0.8 + r() * 0.5);
      // a sick tree is drained toward the corruption's colour rather than
      // simply darker — you can SEE what the wood is losing
      const col = dead ? mixHex(P, 0x4a3a52, 0.55) : P;
      place(world, g, gltf, 'grove', px, 0, pz, sc, r() * 6.28, 0, col);
      world.addCircle(x + px, z + pz, 0.55 * sc, 'decor');
    }
    // undergrowth: walk straight through it
    const under = Math.round(rad * 3.2);
    for (let i = 0; i < under; i++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad * 1.25;
      const roll = r();
      const gltf = roll < 0.42 ? pick(GRASS, r) : roll < 0.72 ? pick(BUSHES, r) : pick(FROCKS, r);
      place(world, g, gltf, 'grove', Math.cos(a) * dd, 0, Math.sin(a) * dd,
        0.6 + r() * 0.7, r() * 6.28, 0, r() < sick ? mixHex(P, 0x4a3a52, 0.5) : P, false);
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }

  // Undergrowth with no canopy — the gaps between groves, and the thing that
  // makes a forest floor read as ALIVE rather than as a green plane. Nothing
  // here takes a collider.
  function thicket(world, x, z, rad, D, opts = {}) {
    if (GREY()) return null;
    const g = new THREE.Group();
    const r = srnd(Math.round(x * 53 + z * 17 + rad * 11));
    const P = D.propTint || D.floorTint;
    const sick = opts.sick || 0;
    const n = opts.n !== undefined ? opts.n : Math.round(rad * 5);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad;
      const roll = r();
      const gltf = roll < 0.5 ? pick(GRASS, r) : roll < 0.85 ? pick(BUSHES, r) : pick(FROCKS, r);
      place(world, g, gltf, 'thicket', Math.cos(a) * dd, 0, Math.sin(a) * dd,
        0.55 + r() * 0.8, r() * 6.28, 0, r() < sick ? mixHex(P, 0x4a3a52, 0.5) : P, false);
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }

  // Where the rot has actually WON: bare trunks, dead ground, and the fallen
  // ones lying where they came down. This is the image the region is built
  // around, so it is worth placing deliberately rather than scattering.
  function blight(world, x, z, rad, D) {
    if (GREY()) return null;
    const g = new THREE.Group();
    const r = srnd(Math.round(x * 71 + z * 29));
    const P = mixHex(D.propTint || D.floorTint, 0x3a2c44, 0.62);
    const n = 3 + Math.round(rad * 0.6);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad;
      const px = Math.cos(a) * dd, pz = Math.sin(a) * dd;
      if (world.blocked(x + px, z + pz, 0.8)) continue;
      const down = r() < 0.3;
      const sc = 0.75 + r() * 0.5;
      place(world, g, pick(BARE, r), 'blight', px, down ? 0.5 : 0, pz, sc,
        r() * 6.28, down ? Math.PI / 2 : 0, P);
      world.addCircle(x + px, z + pz, (down ? 0.75 : 0.5) * sc, 'decor');
    }
    for (let i = 0; i < rad * 2.5; i++) {
      const a = r() * Math.PI * 2, dd = Math.sqrt(r()) * rad * 1.2;
      place(world, g, pick(FROCKS, r), 'blight', Math.cos(a) * dd, 0, Math.sin(a) * dd,
        0.5 + r() * 0.6, r() * 6.28, 0, P, false);
    }
    g.position.set(x, 0, z);
    world.add(g);
    return g;
  }

  // Somewhere people built, that the forest has taken back. The Wild Woods is
  // "overgrown and forgotten" as well as sick, and a wall with a bush growing
  // out of it says both at once.
  function mossyRuin(world, x, z, ry, D, opts = {}) {
    if (GREY()) return null;
    const g = ruinedHome(world, x, z, ry, D, opts);
    const r = srnd(Math.round(x * 23 + z * 47 + 5));
    const P = D.propTint || D.floorTint;
    const W = (opts.w !== undefined ? opts.w : 6) / 2;
    const Dp = (opts.d !== undefined ? opts.d : 5) / 2;
    for (let i = 0; i < 9; i++) {
      const roll = r();
      const gltf = roll < 0.45 ? pick(BUSHES, r) : roll < 0.8 ? pick(GRASS, r) : pick(FROCKS, r);
      place(world, g, gltf, 'mossyRuin', (r() - 0.5) * (W * 2 + 3), 0,
        (r() - 0.5) * (Dp * 2 + 3), 0.6 + r() * 0.7, r() * 6.28, 0, P, false);
    }
    return g;
  }

  return { ruinedHome, coldHearth, fallenColumn, rubbleField, wayshrine,
    aftermath, cartWreck, lowWall, grove, thicket, blight, mossyRuin,
    place, srnd };
}
