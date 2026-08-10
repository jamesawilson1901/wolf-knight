// LEVEL KIT — the build vocabulary shared by every rebuilt level.
//
// Level 1 proved the pattern: describe a space ONCE as data, render it either
// as gridded greybox or as dressed art, and the box that gets walked and
// approved is provably the layout that ships. That pattern is not Ember-
// specific, and copying four hundred lines of it into Level 2 would guarantee
// the two costumes drift apart in one level and not the other — which is the
// exact failure greyboxing exists to prevent.
//
// So the shell, the doors, the wall runs, the scatter and the tint cache live
// here, once. A level supplies:
//
//   kit()     a function returning its loaded GLB kit (or null before load)
//   isGrey()  a function answering "greybox right now?"
//
// and gets back builders whose call signatures are identical in both levels.
// Everything below is geometry and colour; gameplay stays in the level module.

import * as THREE from 'three';
import { prepareModel, instancePlacements, SHARED } from './assets.js';
import { protoFloor, protoWall, protoDecal, protoLabel, protoMaterial } from './proto.js';
import { ground, pathsThroughDoors, roomSeed } from './ground.js';
import { districtTint } from './districts.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { WS } from './worldstate.js';
import { registerCuttable, alreadyCut } from './gates.js';

// METRICS.md — locked, inherited unchanged by every level built on this kit.
export const DOOR_HALF = 1.2;      // 2.4 u standard door
export const BOSS_DOOR_HALF = 1.3; // 2.6 u wide/boss door
export const WALL_T = 1.0;         // wall band thickness
export const DOOR_ZONE = 1.35;     // trigger band depth
export const BLIND_STRIP = 2.5;    // camera cannot see this band at the south wall

// The module sizes, also locked. A level picks from this list; if a space
// seems to want a size that is not here, the module gets redesigned rather
// than the grid getting bent (dad's rule).
export const MODULES = {
  island:  { w: 32, d: 26 },   // two camera-widths — cannot be seen at once
  choke:   { w: 14, d: 10 },   // smaller than one screen, on purpose
  pocket:  { w: 20, d: 16 },   // one screen-ish; a reward, not a maze
  arena:   { w: 26, d: 26 },   // a boss charge plus dodging room both sides
  hub:     { w: 36, d: 28 },   // NEW in Level 2 — see the note in METRICS.md
};

// A door gap in a shell wall. `centre` exists for the Level 2 hub, which needs
// FIVE doorways (an entrance, three spokes and the crypt) on four walls — so
// two of them share the north wall, 18 u apart, which reads as two clearly
// separate archways rather than one ambiguous opening.
export const gap = (side, half = DOOR_HALF, centre = 0) =>
  ({ side, from: centre - half, to: centre + half });

// ---------------------------------------------------------------------------
// The tint cache. Materials here outlive the room that made them, so they are
// registered SHARED — otherwise World.dispose() frees a material the next room
// is still pointing at, and the room after that renders black.
// ---------------------------------------------------------------------------
const tintCache = new Map();
// SURFACE CLASSES.
//
// A Quaternius dungeon piece is not one material. Wall_Modular alone carries
// Wall_Dark, Wall_Medium, Wall_Highlights and Grey_Floor — so eleven wall
// fragments arrive as forty-four meshes in four material buckets, and
// flattenStatic() buckets PER SPATIAL CELL as well, which splits each of those
// again. Measured on the rebuilt `la`: 309 loose meshes, 36 merged draws, and
// 107 stranded in buckets of one or two that merging will not touch.
//
// The materials are all flat colours with no map, so the only thing those four
// names carry is a VALUE step. Collapsing them to three shared classes keeps
// the light-and-shade and triples every bucket size.
const SURFACE = {
  // darkest step
  Wall_Dark: 'dark', StoneDark: 'dark', Stone_Dark: 'dark', DarkWood: 'dark',
  DarkMetal: 'dark', dirt: 'dark',
  // the body of the surface
  Wall_Medium: 'mid', Stone: 'mid', Grey_Floor: 'mid', Grey: 'mid', Main: 'mid',
  colormap: 'mid', grass: 'mid', Ceramic: 'mid', Wood: 'mid', stone: 'mid',
  stoneDark: 'dark',
  // catch the light
  Wall_Highlights: 'light', Metal: 'light',
};
// what each class does to the tint it is given
const SURFACE_VALUE = { dark: 0.66, mid: 1.0, light: 1.26 };

export function tintedModel(gltf, key, tint, darken = 1) {
  const root = prepareModel(gltf.scene.clone());
  root.traverse((n) => {
    if (!n.isMesh) return;
    // THE CACHE KEY IS THE MATERIAL'S SURFACE CLASS, NOT ITS NAME.
    //
    // It started as the caller's label, which meant a rock and a stump cut from
    // the same atlas at the same tint got two materials and could never merge.
    // Keying on the material NAME fixed that. Keying on the CLASS fixes the
    // next order of the same problem: four names that differ only in brightness
    // become one material at three values, so a house's wall fragments land in
    // one bucket instead of four.
    const tex = n.material.map ? n.material.map.uuid : 'nomap';
    const cls = SURFACE[n.material.name] || n.material.name;
    const v = SURFACE_VALUE[cls] !== undefined ? SURFACE_VALUE[cls] : 1;
    const ck = `${cls}|${tex}|${tint}|${darken}`;
    if (!tintCache.has(ck)) {
      const m = n.material.clone();
      m.name = `kit_${ck}`;
      m.color.setHex(tint).multiplyScalar(darken * v);
      SHARED.add(m);
      tintCache.set(ck, m);
    }
    n.material = tintCache.get(ck);
  });
  return root;
}

// Kit materials are named per surface — Kenney's floor-tile.glb is `grass`,
// cliff-block.glb is `grass` + `dirt`, Quaternius dungeon pieces are `Stone`,
// `StoneDark`, `Wood`. Naming every one is how a single kit becomes eight
// districts across two levels with no new downloads. A name NOT in the map
// keeps its original colour, so a miss shows up as a green patch in a cave
// rather than as a silent nothing.
export const floorTintMap = (D) => ({
  grass: D.floorTint, dirt: D.wallTint, colormap: D.floorTint,
  Stone: D.floorTint, StoneDark: D.wallTint, Stone_Dark: D.wallTint,
  Grey: D.floorTint, Main: D.floorTint,
});
export const wallTintMap = (D) => ({
  grass: D.wallTint, dirt: D.wallTint, stone: D.wallTint, stoneDark: D.wallTint,
  colormap: D.wallTint, Stone: D.wallTint, StoneDark: D.wallTint,
  Stone_Dark: D.wallTint, Grey: D.wallTint, Main: D.wallTint, Wood: D.wallTint,
});

// ---------------------------------------------------------------------------
export function makeBuilders({ kit, isGrey }) {
  const K = () => kit();
  const GREY = () => isGrey();

  // Wall segments with the door gaps cut out of them.
  const segments = (gaps, side, lo, hi) => {
    const cuts = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
    let start = lo; const out = [];
    for (const c of cuts) { if (c.from > start) out.push([start, c.from]); start = c.to; }
    if (start < hi) out.push([start, hi]);
    return out;
  };

  // --- GREYBOX shell -------------------------------------------------------
  function protoShell(world, w, d, gaps, tint) {
    const halfW = w / 2, halfD = d / 2;
    world.deckY = 0;
    // +6 in both axes: three units of ground OUTSIDE the wall, so the camera
    // never sees the void past a 1.9u wall (Level 1 shipped without this and
    // a third of the screen was empty on entry)
    protoFloor(world, w + 6, d + 6, tint);

    const H = 1.6;
    for (const [a, b] of segments(gaps, 'n', -halfW, halfW)) protoWall(world, a, -halfD - WALL_T / 2, b, -halfD + WALL_T / 2, { height: H, tint });
    for (const [a, b] of segments(gaps, 's', -halfW, halfW)) protoWall(world, a, halfD - WALL_T / 2, b, halfD + WALL_T / 2, { height: H, tint });
    for (const [a, b] of segments(gaps, 'w', -halfD, halfD)) protoWall(world, -halfW - WALL_T / 2, a, -halfW + WALL_T / 2, b, { height: H, tint });
    for (const [a, b] of segments(gaps, 'e', -halfD, halfD)) protoWall(world, halfW - WALL_T / 2, a, halfW + WALL_T / 2, b, { height: H, tint });

    // BLIND-STRIP LAW made visible: the band along the south wall the camera
    // cannot see over. Painting it means the rule gets checked by eye while
    // the space is being walked, not only by a script afterwards.
    protoDecal(world, 0, halfD - BLIND_STRIP / 2, w, BLIND_STRIP, 0xff3a3a, 0.13);
    return { halfW, halfD };
  }

  // --- DRESSED shell: same rectangle, same gaps, same colliders ------------
  function dressShell(world, w, d, gaps, D, opts = {}) {
    const halfW = w / 2, halfD = d / 2;
    world.deckY = 0;
    const kit0 = K();

    // THE FLOOR. Until v3.36 this instanced Kenney's floor-tile.glb across the
    // rectangle under one district tint — one tile, one colour, every room,
    // which is exactly what dad saw: "the floor is just a generic colour
    // everywhere". js/ground.js paints it instead: a district PATTERN, several
    // materials meeting inside the room via `patches`, and a worn path along
    // the route that replaces the guide-orbs v3.35 deleted. Still one call.
    //
    // +6 on both axes for the same reason protoFloor uses an apron: three units
    // of ground outside the wall so the camera never sees the void past it.
    const APRON = 3;
    ground(world, w + APRON * 2, d + APRON * 2, D, {
      seed: opts.seed || roomSeed(),
      style: opts.groundStyle,
      patches: opts.patches || [],
      pathWidth: opts.pathWidth,
      paths: opts.paths || pathsThroughDoors(gaps, halfW, halfD, { hub: opts.hub }),
    });

    const inGap = (side, c) => gaps.some((g) => g.side === side && c > g.from && c < g.to);
    const walls = [];
    const cell = (tx, tz, side, coord) => {
      if (inGap(side, coord)) return;
      walls.push({
        x: tx - halfW + 0.5, z: tz - halfD + 0.5,
        ry: (Math.abs(tx * 11 + tz * 5) % 4) * Math.PI / 2,
        sy: 1.9 + (Math.abs(tx * 31 + tz * 17) % 3) * 0.18,
      });
    };
    for (let tx = -1; tx <= w; tx++) { cell(tx, -1, 'n', tx - halfW + 0.5); cell(tx, d, 's', tx - halfW + 0.5); }
    for (let tz = 0; tz < d; tz++) { cell(-1, tz, 'w', tz - halfD + 0.5); cell(w, tz, 'e', tz - halfD + 0.5); }
    world.add(instancePlacements(kit0.cliff.scene, walls, { materialTints: wallTintMap(D) }));

    // colliders sit at the SAME coordinates the greybox used, so every
    // distance measured while walking the box still holds
    for (const [a, b] of segments(gaps, 'n', -halfW, halfW)) world.addBox(a, b, -halfD - WALL_T / 2, -halfD + WALL_T / 2);
    for (const [a, b] of segments(gaps, 's', -halfW, halfW)) world.addBox(a, b, halfD - WALL_T / 2, halfD + WALL_T / 2);
    for (const [a, b] of segments(gaps, 'w', -halfD, halfD)) world.addBox(-halfW - WALL_T / 2, -halfW + WALL_T / 2, a, b);
    for (const [a, b] of segments(gaps, 'e', -halfD, halfD)) world.addBox(halfW - WALL_T / 2, halfW + WALL_T / 2, a, b);

    return { halfW, halfD };
  }

  // ONE entry point, TWO costumes. A builder never decides for itself which
  // mode it is in — that is what keeps the two provably the same layout.
  // `opts` reaches the ground painter: { seed, groundStyle, patches, paths,
  // pathWidth, hub }. A room that passes nothing still gets a textured,
  // patterned floor with a worn route between its doors.
  function shell(world, spec, gaps, D, opts = {}) {
    // The room's own extent, recorded rather than computed-and-discarded.
    // Anything asking "is this point inside the room" — the reachability
    // verifier especially — had no way to know, and guessing it from door
    // positions fails for rooms whose doors are all on one axis.
    world.halfW = spec.w / 2;
    world.halfD = spec.d / 2;
    return GREY()
      ? protoShell(world, spec.w, spec.d, gaps, D.tint)
      : dressShell(world, spec.w, spec.d, gaps, D, opts);
  }

  // A door on a wall side, in the gap the shell already cut.
  function sideDoor(world, side, halfW, halfD, to, entry, opts = {}) {
    const T = DOOR_ZONE;
    // the mouth of the door, and room to walk out of it
    const rc = opts.centre || 0;
    // 2.0, not 2.8: the opening is 2.4u wide (DOOR_HALF 1.2), so a reservation
    // wider than that starts claiming the ground beside the door — which is
    // exactly where gateposts belong, and they were losing their colliders.
    const rtag = 'door→' + to;
    if (side === 'n') world.reserve(rc, -halfD + 1.6, 2.0, rtag);
    else if (side === 's') world.reserve(rc, halfD - 1.6, 2.0, rtag);
    else if (side === 'w') world.reserve(-halfW + 1.6, rc, 2.0, rtag);
    else if (side === 'e') world.reserve(halfW - 1.6, rc, 2.0, rtag);
    const half = opts.half || DOOR_HALF;
    const c = opts.centre || 0;          // offset ALONG the wall — see gap()
    const when = opts.when || null;
    if (side === 'n') world.addDoor(c - half, c + half, -halfD - T, -halfD + 0.15, to, entry, when);
    if (side === 's') world.addDoor(c - half, c + half, halfD - 0.15, halfD + T, to, entry, when);
    if (side === 'w') world.addDoor(-halfW - T, -halfW + 0.15, c - half, c + half, to, entry, when);
    if (side === 'e') world.addDoor(halfW - 0.15, halfW + T, c - half, c + half, to, entry, when);

    // THE NEXT ROOM'S LIGHT, SPILLING THROUGH. Collected here and built as one
    // mesh in thresholdGlow() below — see the note there for why it is one.
    const tint = districtTint(to);
    if (tint !== null) {
      (world._thresholds || (world._thresholds = [])).push({ side, c, half, halfW, halfD, tint, when });
    }
  }

  // An INTERIOR wall run — what makes a room a shape instead of a box.
  function wallRun(world, x0, z0, x1, z1, D, height = 1.6) {
    if (GREY()) return protoWall(world, x0, z0, x1, z1, { height, tint: D.tint });
    const dx = x1 - x0, dz = z1 - z0;
    const count = Math.max(1, Math.round(Math.hypot(dx, dz)));
    const places = [];
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0.5 : i / (count - 1);
      places.push({ x: x0 + dx * f, z: z0 + dz * f, ry: ((i * 3) % 4) * Math.PI / 2,
        sy: height + (i % 3) * 0.12 });
    }
    world.add(instancePlacements(K().cliff.scene, places, { materialTints: wallTintMap(D) }));
    const pad = 0.5;
    world.addBox(Math.min(x0, x1) - pad, Math.max(x0, x1) + pad,
      Math.min(z0, z1) - pad, Math.max(z0, z1) + pad);
    return null;
  }

  // Scatter along the walls: silhouette variety without eating the playfield.
  // Everything sits in the outer ring, never mid-room where the fighting is,
  // and never in a doorway.
  //
  // `density` and `spin` exist because players notice repeated CLUTTER long
  // before they notice repeated architecture — two spokes built from the same
  // modules read as different places if their small stuff differs hardest.
  function scatter(world, halfW, halfD, D, seed = 1, count = 14, opts = {}) {
    if (GREY()) return;
    const kinds = opts.kinds || ['rockLA', 'rockLB', 'rockLC', 'rockSA', 'rockSB'];
    const spin = opts.spin !== undefined ? opts.spin : 1;      // 0 = grid-aligned, 1 = free
    const scale = opts.scale || 1;
    const kit0 = K();
    let s = seed * 9301;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < count; i++) {
      const edge = i % 4;
      const along = (rnd() - 0.5) * 2;
      const inset = 1.2 + rnd() * 2.6;
      let x, z;
      if (edge === 0) { x = along * (halfW - 2); z = -halfD + inset; }
      else if (edge === 1) { x = along * (halfW - 2); z = halfD - inset; }
      else if (edge === 2) { x = -halfW + inset; z = along * (halfD - 2); }
      else { x = halfW - inset; z = along * (halfD - 2); }
      if (Math.abs(x) < DOOR_HALF + 1.2 && edge < 2) continue;
      if (Math.abs(z) < DOOR_HALF + 1.2 && edge >= 2) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      if (!kit0[kind]) continue;
      // scatter() picks its spots at random, which makes it the likeliest thing
      // in the whole toolkit to drop a rock on a chest's only approach
      if (world.blocked(x, z, 0.9)) continue;
      const big = /rockL|Column|Brick/.test(kind);
      // SHADE IN THREE STEPS, NOT CONTINUOUSLY. A per-prop random float gave
      // every rock its own material and so its own draw call — twenty props
      // meant forty calls with shadows. Three discrete shades read the same to
      // the eye and merge into three draws. Variety comes from rotation and
      // scale below, which are free.
      const shade = [0.88, 1.0, 1.1][Math.floor(rnd() * 3)];
      const rock = tintedModel(kit0[kind], kind, D.wallTint, shade);
      rock.position.set(x, 0, z);
      // spin 0 snaps to quarter turns (fitted masonry); spin 1 is free
      rock.rotation.y = spin ? rnd() * Math.PI * 2 : Math.floor(rnd() * 4) * Math.PI / 2;
      rock.scale.setScalar((big ? 0.8 + rnd() * 0.5 : 0.6 + rnd() * 0.4) * scale);
      world.add(rock);
      if (big) world.addCircle(x, z, 0.75 * scale, 'decor');
    }
  }

  // A "come back later" gate. It must read as LATER, never as broken: a
  // shaped, coloured obstacle with the reward VISIBLE beyond it.
  //
  // A8 — AND IT MUST ACTUALLY OPEN. Until v3.27 this function drew the gate,
  // dropped a box collider in front of it and stopped. It registered with no
  // gate system at all, so Level 1's cracked wall, Level 1's scorched
  // barricade, Level 2's thorn tangle and Level 3's ice-sealed spring were
  // permanent walls with a visible chest behind them. The promise was a lie:
  // a child who came back with the very form the gate advertises found the
  // stomp, the slam, the lash and the breath all did nothing.
  //
  // `gate` is now REQUIRED and says which tool opens it:
  //   {system: 'crack'|'burn'|'cut'|'shatter', id, region}
  // Each system is the SAME one the shipping rooms use, so a promise gate
  // breaks with the same verb, the same feel and the same permanence as every
  // other obstacle of its kind — no second, subtly-different code path.
  function promiseGate(world, x, z, w, d, color, label, kindModel, gate) {
    if (!gate || !gate.system) throw new Error('promiseGate needs a gate system — see A8');
    const { system, id, region } = gate;
    // Already opened on an earlier visit? Then there is nothing here at all —
    // no geometry, and crucially no collider.
    const opened =
      system === 'crack'   ? !!state.flags.cracked[id]
      : system === 'burn'  ? !!state.flags.burned[id]
      : system === 'cut'   ? alreadyCut(region, id)
      : /* shatter */        WS.get(region, 'ice_' + id);
    if (opened) return null;

    // The gate and the ground immediately behind it belong to the gate: the
    // whole promise is that THIS is the way through, and a prop dressed into
    // the gap turns a solved puzzle into a locked door.
    world.reserve(x, z, Math.max(w, d) * 0.6 + 1.4, 'gate:' + id);
    // The group is positioned at the gate and its pieces sit RELATIVE to it,
    // so when a crack or a burn scatters the chunks they fly apart from the
    // gate rather than from the room's origin.
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const span = Math.max(w, d);
    if (GREY()) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.5, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: color, emissiveIntensity: 0.18 })
      );
      m.position.set(0, 0.75, 0);
      g.add(m);
      protoLabel(world, x, z, label, { color: '#ffd54a', y: 2.4, size: 1.2 });
    } else {
      const kit0 = K();
      const src = kit0[kindModel] || kit0.rockLB;
      const n = Math.max(2, Math.round(span / 1.6));
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : (i / (n - 1) - 0.5);
        const piece = tintedModel(src, 'gate_' + kindModel, color);
        piece.position.set(w > d ? f * w : 0, 0, d >= w ? f * d : 0);
        piece.rotation.y = i * 1.31;
        piece.scale.setScalar(1.05);
        g.add(piece);
      }
      // the "later" tell: a cold glow in the future tool's own colour, at ankle
      // height, so it reads as a promise rather than as a wall
      const hint = new THREE.Mesh(
        new THREE.RingGeometry(span * 0.42, span * 0.55, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32,
          side: THREE.DoubleSide, depthWrite: false })
      );
      hint.rotation.x = -Math.PI / 2;
      hint.position.set(0, world.deckY + 0.04, 0);
      g.add(hint);
    }
    world.add(g);

    // A gate across a doorway blocks with a BOX, not the circle a rock clump
    // uses, so it hands its own collider-removal to whichever system takes it.
    const collider = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    world.boxColliders.push(collider);
    const dropCollider = () => {
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
    };

    if (system === 'cut') {
      // the lash owns the whole clear (group + collider + flag + sound)
      registerCuttable(world, { id, x, z, region, group: g, collider, hitR: span / 2 });
    } else if (system === 'shatter') {
      world.shatterables.push({
        id, x, z, broken: false, hitR: span / 2, group: g,
        clear: () => {
          world.root.remove(g);
          dropCollider();
          WS.set(region, 'ice_' + id);
          audio.play('parry', { volume: 0.7, rate: 1.8 });   // the crack
          audio.play('puff', { volume: 0.8, rate: 1.3 });
        },
      });
    } else if (system === 'none') {
      // A gate that no VERB opens. The Stormreach sea cave is one: it is water,
      // and water opens by being walkable — the room simply does not build this
      // at all once the child can wade (js/water.js). Registering it as a
      // crackable or a shatterable would have handed it to the wrong wolf.
    } else {
      // crack + burn ride World._shatter, which does the break-apart itself
      // and writes the permanent flag; `clear` only takes the box away.
      const list = system === 'crack' ? world.crackables : world.burnables;
      list.push({ id, x, z, group: g, collider: null, hitR: span / 2, clear: dropCollider });
    }
    return g;
  }

  // The reward you can SEE but not reach yet — the other half of a promise.
  function visibleReward(world, x, z, id, loot = { shards: 14 }, tier = 'wood') {
    if (GREY()) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.7, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0xffd54a, emissiveIntensity: 0.5, roughness: 0.7 })
      );
      m.position.set(x, 0.35, z);
      world.add(m);
      return m;
    }
    (world.markers.chestDefs || (world.markers.chestDefs = []))
      .push({ id, tier, x, z, ry: 0.4, loot });
    // A CHEST OWNS ITS APPROACH. vc2 shipped with the thorn gate cut, the
    // puzzle solved, and the reward still 2.06u out of reach because a rock
    // had been scattered into the alcove afterwards. 2.6u is enough for a
    // child to walk up from any side.
    world.reserve(x, z, 2.6, 'chest:' + id);
    return null;
  }

  // A dark zone. main.js writes `zone.veilMat.opacity` every frame, so the
  // material is not optional — a zone without one crashes the render loop.
  function darkZone(world, minX, maxX, minZ, maxZ) {
    const veilMat = new THREE.MeshBasicMaterial({
      color: 0x0a0714, transparent: true, opacity: 0.62, depthWrite: false,
    });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), veilMat);
    veil.rotation.x = -Math.PI / 2;
    veil.position.set((minX + maxX) / 2, 1.65, (minZ + maxZ) / 2);
    world.add(veil);
    world.darkZones.push({ minX, maxX, minZ, maxZ, veilMat });
  }

  return { protoShell, dressShell, shell, sideDoor, wallRun, scatter,
    promiseGate, visibleReward, darkZone, protoMaterial };
}

// ---------------------------------------------------------------------------
// THE THRESHOLD GLOW
//
// A district's colour temperature is the game's wayfinding — a child recalls
// "the orange bit" long before they could read a map. But you only see a
// district once you are standing in it, so the colour says where you ARE and
// never where you are GOING, and a doorway that shows you nothing gives you no
// reason to walk through it. Terranigma and Zelda pull you forward because you
// can SEE the next thing and want it.
//
// So each doorway spills a little of the next room's colour across the floor in
// front of it. It costs no new geometry and reads instantly: warm light through
// that arch means the Kiln is that way.
//
// ONE MESH FOR THE WHOLE ROOM. A separate quad per door would be five extra
// draw calls in the Great Vault, which sits at 110 of a 125 budget — so every
// doorway's fan goes into a single geometry and the destination colour rides on
// the VERTICES. One material, one call, however many doors a room has.
//
// Additive and depth-write-off so it reads as light lying on the ground rather
// than as paint. flattenStatic already skips transparent MeshBasicMaterial, so
// it is left alone by the batcher without needing to be marked.
// ---------------------------------------------------------------------------
let glowTex = null;
function thresholdTexture() {
  if (glowTex) return glowTex;
  const N = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / (N - 1), v = y / (N - 1);
      // v: 0 at the doorway, 1 deep into the room. u: 0..1 across the opening.
      const along = Math.pow(1 - v, 1.9);            // falls off fast, like light
      const across = Math.pow(Math.cos((u - 0.5) * Math.PI), 1.4);
      const a = Math.max(0, Math.min(1, along * across));
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  SHARED.add(glowTex);
  return glowTex;
}

export function thresholdGlow(world) {
  const list = world._thresholds;
  if (!list || !list.length) return null;
  const pos = [], uv = [], col = [], idx = [];
  const c3 = new THREE.Color();
  let n = 0;
  for (const t of list) {
    if (t.when && !t.when()) continue;         // a sealed door glows for nothing
    const w = t.half + 1.1;                    // a touch wider than the opening
    // 3.4, not 5.0. At five units the fan from lb's south door washed most of
    // the lower frame and read as a stain rather than as light through a
    // doorway. It only has to be seen from across the room, not light it.
    const D = 3.4;
    // origin on the wall, and the direction pointing INTO this room
    let ox, oz, fx, fz;
    if (t.side === 'n') { ox = t.c; oz = -t.halfD; fx = 0; fz = 1; }
    else if (t.side === 's') { ox = t.c; oz = t.halfD; fx = 0; fz = -1; }
    else if (t.side === 'w') { ox = -t.halfW; oz = t.c; fx = 1; fz = 0; }
    else { ox = t.halfW; oz = t.c; fx = -1; fz = 0; }
    const rx = fz, rz = -fx;                   // across the opening
    // SATURATE THE TINT before it becomes light. Several districts are close to
    // neutral (the Ashfall is a grey), and neutral light added to an orange
    // floor is invisible — the first version of this was so subtle I mistook a
    // painted ash patch for it. Pushing the hue keeps the wayfinding readable
    // without making the room look lit by a disco.
    c3.setHex(t.tint);
    const hsl = { h: 0, s: 0, l: 0 };
    c3.getHSL(hsl);
    c3.setHSL(hsl.h, Math.max(hsl.s, 0.40), Math.max(0.42, hsl.l));

    // `k` scales this quad's share of the light. The spill on the FLOOR is a
    // fraction of what stands in the opening: light falls off, and a floor fan
    // as bright as the doorway reads as a glowing portal rather than as a lit
    // room beyond a dark wall.
    const quad = (fn, k = 1) => {
      const base = n * 4;
      for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const [px, py, pz] = fn(du, dv);
        pos.push(px, py, pz);
        uv.push(du, dv);
        col.push(c3.r * k, c3.g * k, c3.b * k);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      n++;
    };

    // 1. the fan of light lying on the floor in front of the opening
    quad((du, dv) => {
      const across = (du - 0.5) * 2 * w, into = dv * D;
      return [ox + rx * across + fx * into, 0, oz + rz * across + fz * into];
    }, 0.42);
    // 2. THE OPENING ITSELF, standing upright in the gap. This is the image
    //    that actually reads: a lit doorway in a dark wall, seen from across
    //    the room. The floor fan alone was almost invisible against a bright
    //    floor, because additive light on a lit surface has little to add — but
    //    the wall beside it is nearly black, and against that it sings.
    quad((du, dv) => {
      const across = (du - 0.5) * 2 * (t.half + 0.15);
      return [ox + rx * across + fx * 0.25, 1.85 * dv, oz + rz * across + fz * 0.25];
    });
  }
  if (!n) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: thresholdTexture(), transparent: true, vertexColors: true, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
  }));
  mesh.position.y = (world.deckY || 0) + 0.03;   // above the ground, below decals
  mesh.renderOrder = 2;
  mesh.name = 'thresholdGlow';
  world.add(mesh);
  world.keepLoose(mesh);
  return mesh;
}
