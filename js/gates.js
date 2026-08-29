// Ability gates — data-driven obstacles that open only to a specific wolf
// form (see design/SYSTEMS.md). A gate the player can't open yet must read
// as a PROMISE (distinct look + mystery log entry), never as a bug.
//
// Gate types are defined here once; rooms place them with one call.
// - boulder: Earth Wolf's stomp (rides the existing crackables system)
// - water:   Tide Wolf (region 6) — pure promise for now
// - brazier: Fire Wolf's slam lights it (dungeon mechanic; not a wall)

import * as THREE from 'three';
import { state } from './state.js';
import { audio } from './audio.js';
import { WS } from './worldstate.js';
import { canWade } from './water.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GATE_TYPES = {
  boulder: { ability: 'earth_wolf', icon: '🪨', label: 'A huge boulder blocks the way' },
  water: { ability: 'tide_wolf', icon: '💧', label: 'A rushing fire-water channel' },
  bramble: { ability: 'verdant_wolf', icon: '🌿', label: 'A thorny tangle chokes the way' },
  ice: { ability: 'frost_wolf', icon: '❄️', label: 'A spring sealed in old ice' },
  // A gale is the only gate in the game you can walk right up to and lean on.
  // It is not a wall: it pushes back, which says "not yet" without a bar and
  // without a word (design/LEVEL-DESIGN-5.md §3).
  gale: { ability: 'storm_wolf', icon: '🌀', label: 'A wind too strong to walk into' },
};

// Bramble tangle — the Verdant Wolf's VINE-LASH cuts it (v3.19: live).
// Until the form is earned it is a thorny PROMISE: a dense dark tangle with
// a faint green glint, blocking a visible reward. Cleared state lives in
// state.flags.world under its region (WS '<region>', 'cut_<id>').
export function brambleGate(world, prepareModel, bushGltf, id, x, z, region = 'stone') {
  if (WS.get(region, 'cut_' + id)) return null;
  const group = new THREE.Group();
  for (const [ox, oz, s, ry] of [[-0.55, 0, 1.2, 0.4], [0.5, -0.12, 1.35, 2.1], [0, 0.42, 1.05, 4.0]]) {
    const b = prepareModel(bushGltf.scene.clone());
    b.position.set(x + ox, 0, z + oz);
    b.rotation.y = ry;
    b.scale.setScalar(s);
    b.traverse((n) => {
      if (!n.isMesh) return;
      n.material = n.material.clone();
      if (n.material.color) n.material.color.setHex(0x2f4a26); // dark thorn green
    });
    group.add(b);
  }
  const glint = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.06, 0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8fdc6a, emissiveIntensity: 1.7, roughness: 1 })
  );
  glint.position.set(x, 0.95, z);
  group.add(glint);
  world.add(group);
  world.onAnimate((t) => {
    glint.position.y = 0.95 + Math.sin(t * 2.1) * 0.1;
    glint.rotation.y = t * 1.4;
  });
  const collider = { minX: x - 1.15, maxX: x + 1.15, minZ: z - 0.95, maxZ: z + 0.95 };
  world.boxColliders.push(collider);
  world.markers.brambleSpot = { x, z, id };

  registerCuttable(world, { id, x, z, region, group, collider });
  return { id, collider };
}

// REGISTER A CUTTABLE — the one place a bramble becomes something the vine-lash
// can clear. Level 3 grows its own brambles rather than going through
// brambleGate(), and it needs the SAME contract: the same `cut` bookkeeping,
// the same permanence (a WorldState flag, not a new namespace), and the same
// lazily-defined world.cutAt, which the lash in player.js calls directly.
//
// Splitting this out is what stops Level 3 inventing a second, subtly
// different cut system — it did exactly that, keying off a `state.flags.cut`
// that was never declared anywhere, so its brambles could never be cut at all.
export function registerCuttable(world, { id, x, z, region, group, collider, onCut, regrows, hitR = 0 }) {
  const entry = {
    id, x, z, cut: false, regrows: !!regrows, group, collider, region, hitR,
    clear: () => {
      if (group) world.root.remove(group);
      if (collider) {
        const i = world.boxColliders.indexOf(collider);
        if (i >= 0) world.boxColliders.splice(i, 1);
      }
      // a regrowing bramble is a TIMER, not a permanent change — flagging it
      // would make the level's develop step solve itself on the next visit
      if (!regrows) WS.set(region, 'cut_' + id);
      audio.play('gate-creak', { volume: 0.7, rate: 0.9 });
      audio.play('puff', { volume: 0.8, rate: 1.2 });
      if (onCut) onCut(entry);
    },
  };
  world.cuttables.push(entry);   // world.cutAt is a World method (js/world.js)
  return entry;
}

// Has this bramble already been cut, for good, in a previous visit?
export function alreadyCut(region, id) { return WS.get(region, 'cut_' + id); }

// Ice block — a pale crystal mound the Frost Wolf's breath SHATTERS (v3.21).
// Until that form is earned it is a promise: a cold glow guarding a reward.
// `region` scopes the cleared flag so each region remembers its own ice.
export function iceGate(world, x, z, id = 'w_ice', region = 'wild') {
  if (WS.get(region, 'ice_' + id)) return null;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xbfe8ff, emissive: 0x7ab8e8, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.85, roughness: 0.25,
  });
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), mat);
  ice.position.set(x, 0.5, z);
  ice.scale.y = 0.75;
  group.add(ice);
  const shard = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 5), mat);
  shard.position.set(x - 0.5, 0.4, z + 0.4);
  shard.rotation.z = 0.4;
  group.add(shard);
  world.add(group);
  world.onAnimate((t) => {
    mat.emissiveIntensity = 0.3 + 0.12 * Math.sin(t * 1.6 + x);
  });
  const collider = { x, z, r: 1.0 };
  world.circleColliders.push(collider);
  world.markers.iceSpot = { x, z, id };

  // register for the frost breath: world.shatterAt(x, z, r) breaks any ice
  // in reach — a burst of shards, a crack, the collider gone for good
  // `group` is not decoration on this entry: flattenStatic() protects every
  // Object3D it can find on a gate entry, and an entry that names none has its
  // geometry merged into the static batch — after which removing the group on
  // clear() takes nothing off the screen and the ice shatters invisibly.
  world.shatterables.push({
    id, x, z, broken: false, group,
    clear: () => {
      world.root.remove(group);
      const i = world.circleColliders.indexOf(collider);
      if (i >= 0) world.circleColliders.splice(i, 1);
      WS.set(region, 'ice_' + id);
      audio.play('parry', { volume: 0.7, rate: 1.8 });   // the crack
      audio.play('puff', { volume: 0.8, rate: 1.3 });
    },
  });
  return { id, collider };   // world.shatterAt is a World method (js/world.js)
}

// FROZEN BRAZIER (v3.21, Frostpeak's puzzle verb): a brazier sealed under a
// shell of ice. The Fire Wolf's slam MELTS the shell, and only then can the
// brazier be lit — two learned verbs chained. The cold re-forms the shell on
// an unlit brazier after `refreeze` seconds, so all of them must be done in
// one push: the Kiln's order puzzle plus the gutter timing, grown up.
export function freezeBrazier(world, br, refreeze = 22) {
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 1),
    new THREE.MeshStandardMaterial({
      color: 0xbfe8ff, emissive: 0x7ab8e8, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.78, roughness: 0.25,
    })
  );
  shell.position.set(br.x, 1.15, br.z);
  world.add(shell);
  br.iced = true;
  br.refreeze = refreeze;
  br.shell = shell;
  world.onAnimate((t, dt) => {
    shell.visible = br.iced;
    if (br.iced) {
      shell.material.emissiveIntensity = 0.35 + 0.15 * Math.sin(t * 2 + br.x);
      shell.scale.setScalar(1 + 0.03 * Math.sin(t * 1.7 + br.z));
      return;
    }
    // thawed but still unlit — the cold is creeping back
    if (!br.lit) {
      br._thawT = (br._thawT || 0) + dt;
      if (br._thawT > br.refreeze) {
        br._thawT = 0;
        br.iced = true;
        audio.play('puff', { volume: 0.5, rate: 0.8 }); // it seals over again
      }
    } else {
      br._thawT = 0;
    }
  });
  // melting rides the existing burn system (Fire Wolf slam → world.burnAt)
  if (!world.meltAt) {
    world.meltAt = (mx, mz, r) => {
      let n = 0;
      for (const b of (world.braziers || [])) {
        if (!b.iced) continue;
        const dx = b.x - mx, dz = b.z - mz;
        if (dx * dx + dz * dz > r * r) continue;
        b.iced = false;
        b._thawT = 0;
        audio.play('burn', { volume: 0.6, rate: 1.2 });
        n++;
      }
      return n;
    };
  }
  return br;
}

// Big single boulder — visually distinct from cracked-rock piles (one huge
// smooth stone with faint golden veins = "a form can move this someday").
export function boulderGate(world, prepareModel, rockGltf, id, x, z) {
  if (state.flags.cracked[id]) return null; // already smashed on a return trip
  const rock = prepareModel(rockGltf.scene.clone());
  rock.traverse((n) => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    n.material.color.setHex(0x6e7076);
    n.material.emissive = new THREE.Color(0xd8b06a);
    n.material.emissiveIntensity = 0.1;
  });
  rock.scale.setScalar(3.1);
  rock.position.set(x, 0, z);
  world.add(rock);
  const collider = { x, z, r: 1.25 };
  world.circleColliders.push(collider);
  // rides the crackables list so the Earth Wolf's stomp clears it later
  world.crackables.push({ id, x, z, group: rock, collider, cracked: false });
  return rock;
}

// Water channel — animated blue band + colliders. Nothing opens it yet;
// it exists to be remembered (Tide Wolf, region 6).
// THE PROMISE THE GAME HAS BEEN KEEPING SINCE MINUTE TEN.
//
// This channel has been in Ember Hollow's r2b since the first build, with a
// gold chest and two heart pieces plainly visible on the other side of it, and
// until region six there was no way to cross it — the collider went down
// unconditionally and nothing anywhere could take it up again. A child who
// remembered it for five regions would have found it still shut.
//
// It opens to the Tide Wolf now, by the same rule the Sunken Vale's deep water
// uses (js/water.js): the collider is simply not laid for a profile that can
// walk on water. A kid who comes back here after Meri walks straight across.
export function waterGate(world, x, z, w, d) {
  const wade = canWade();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({
      color: 0x1d3a52, emissive: 0x3a7aa8, emissiveIntensity: wade ? 0.8 : 0.5,
      transparent: true, opacity: wade ? 0.7 : 0.9, roughness: 0.4,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.03, z);
  world.add(water);
  if (!wade) world.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  world.onAnimate((t) => {
    water.material.emissiveIntensity = 0.4 + 0.2 * Math.sin(t * 1.8 + x);
    water.position.y = 0.03 + Math.sin(t * 2.4) * 0.008;
  });
  return water;
}

// Brazier — a cold iron bowl the Fire Wolf's ground-slam ignites. Rooms
// wire consequences through onLit; world.igniteAt is called by the slam.
export function brazier(world, prepareModel, torchGltf, id, x, z, onLit) {
  const stand = prepareModel(torchGltf.scene.clone());
  stand.scale.setScalar(2.0);
  stand.position.set(x, 0, z);
  stand.traverse((n) => {
    if (n.isMesh && n.material.name === 'Fire') {
      n.material = n.material.clone();
      n.material.emissive = new THREE.Color(0x333333);
      n.material.emissiveIntensity = 0.2; // cold — waiting for flame
    }
  });
  world.add(stand);
  world.addCircle(x, z, 0.3);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa03a, emissiveIntensity: 2.4, roughness: 1 })
  );
  flame.position.set(x, 1.65, z);
  flame.visible = false;
  world.add(flame);
  const light = new THREE.PointLight(0xffa03a, 0, 6, 1.9);
  light.position.set(x, 1.9, z);
  world.add(light);

  // ACT-HERE ring while COLD (v3.20): an unlit brazier in a dark room is
  // invisible — the same failure that hid the Deep Hall's pressure plate.
  // A pulsing gold ring says "this one is waiting for you"; it fades out the
  // moment the brazier catches, so lit and unlit never read the same.
  const waiting = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.68, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  waiting.rotation.x = -Math.PI / 2;
  waiting.position.set(x, world.deckY + 0.03, z);
  world.add(waiting);

  const b = { id, x, z, lit: false, gutterT: 0, flame, light, waiting, onLit };
  if (!world.braziers) {
    world.braziers = [];
    // the Fire Wolf's slam calls this (hooked from player.tryGroundSlam)
    world.igniteAt = (ix, iz, r) => {
      let n = 0;
      for (const br of world.braziers) {
        if (br.lit || br.iced) continue; // sealed in ice: melt it first (v3.21)
        const dx = br.x - ix, dz = br.z - iz;
        if (dx * dx + dz * dz > r * r) continue;
        br.lit = true;
        br.flame.visible = true;
        br.light.intensity = 5;
        if (br.waiting) br.waiting.visible = false; // it's lit: stop asking
        audio.play('burn', { volume: 0.7 });
        if (br.onLit) br.onLit(br);
        n++;
      }
      return n;
    };
    world.onAnimate((t, dt) => {
      for (const br of world.braziers) {
        if (br.waiting) {
          br.waiting.visible = !br.lit;
          if (!br.lit) {
            br.waiting.material.opacity = 0.35 + 0.25 * Math.sin(t * 2.4 + br.x);
            const s = 1 + 0.07 * Math.sin(t * 2.4 + br.x);
            br.waiting.scale.set(s, s, 1);
          }
        }
        if (!br.lit) continue;
        br.flame.scale.setScalar(1 + 0.15 * Math.sin(t * 9 + br.x));
        br.light.intensity = 4.5 + Math.sin(t * 11 + br.z);
        if (br.gutterAfter) { // timed braziers die back down (the "twist")
          br.gutterT += dt;
          if (br.gutterT > br.gutterAfter) {
            br.lit = false; br.gutterT = 0;
            br.flame.visible = false; br.light.intensity = 0;
            if (br.onGutter) br.onGutter(br);
          }
        }
      }
    });
  }
  world.braziers.push(b);
  return b;
}


// ---------------------------------------------------------------------------
// Shared puzzle furniture, lifted out of rooms.js so every level uses the SAME
// boulder and the SAME plate. Both were private to rooms.js, which is how
// Level 3 ended up with its own incompatible copy of the cut system.
// ---------------------------------------------------------------------------
// Pushable boulder (Kenney rock, stone-gray) — the Stoneroot puzzle verb.
export function pushableBoulder(world, prepareModel, rockGltf, x, z) {
  // ONE MESH, ONE MATERIAL. rock-small-a ships as TWO meshes (its "grass" and
  // "dirt" materials) — but this boulder tints both to the same grey, so the
  // split buys nothing and costs a draw call per boulder, per frame, forever.
  // A pushable can never join the static batch (it moves), so it pays its own
  // way: merge the clone's geometry into one mesh under one material.
  // castShadow stays off — grounding comes from the ring and floor contact,
  // and a mover's shadow pass is a second draw the budget feels
  // (probe-drawcall-attrib on lb, 2026-08-29: 134 calls against 125).
  const src = prepareModel(rockGltf.scene.clone());
  src.updateWorldMatrix(true, true);
  const geos = [];
  src.traverse((n) => {
    if (!n.isMesh) return;
    const gclone = n.geometry.clone();
    gclone.applyMatrix4(n.matrixWorld);
    for (const extra of Object.keys(gclone.attributes)) {
      if (extra !== 'position' && extra !== 'normal') gclone.deleteAttribute(extra);
    }
    geos.push(gclone);
  });
  let rock;
  try {
    rock = new THREE.Mesh(mergeGeometries(geos, false),
      new THREE.MeshStandardMaterial({ color: 0x8a8d95, roughness: 0.95 }));
  } catch {
    // a merge that throws must never cost the room its boulder
    rock = prepareModel(rockGltf.scene.clone());
    rock.traverse((n) => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.setHex(0x8a8d95); } });
  }
  rock.castShadow = false;
  rock.scale.setScalar(2.0);
  const group = new THREE.Group();
  group.add(rock);
  group.position.set(x, 0, z);
  world.add(group);
  const collider = { x, z, r: 0.62 };
  world.circleColliders.push(collider);
  // GOLD marks "act here" (contract grammar): a pulsing ring says PUSH ME
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.88, 26),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = world.deckY + 0.035; // height law: clear of THIS room's floor
  group.add(ring);
  world.onAnimate((t) => { ring.material.opacity = 0.35 + 0.25 * Math.sin(t * 2.4); });
  const b = { x, z, r: 0.62, group, mesh: rock, collider };
  world.boulders.push(b);
  return b;
}

// Pressure plate: a floor switch a boulder holds down. v3.18 readability
// pass — it is now a big, IN-THE-FLOOR target: recessed stone base, glowing
// disc, and a pulsing GOLD act-here ring that matches the boulder's own gold
// ring, so "roll THIS onto THAT" reads at a glance.
export function plateSwitch(world, id, x, z, onPressed) {
  // HEIGHT LAW (v3.18, generalised in v3.20): a decal below the room's floor
  // top is BURIED and invisible — that is why "there is no pressure plate".
  // Heights now key off world.deckY, so the same plate reads correctly on
  // Stoneroot's raised stone tiles AND on the Wild Woods' bare ground
  // (where the old hard-coded stone offsets left it floating in mid-air).
  const deck = world.deckY;
  // a round stone plate (NOT the dungeon-kit trap grid — that reads as
  // "danger, keep off", the exact opposite of an act-here target)
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.66, 0.74, 0.1, 26),
    new THREE.MeshStandardMaterial({ color: 0x707684, roughness: 0.95 })
  );
  base.position.set(x, deck - 0.015, z);
  world.add(base);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 24),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.75, roughness: 1, depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, deck + 0.05, z);
  world.add(glow);
  // the GOLD "act here" ring — same grammar (and same gold) as the boulder
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.92, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, deck + 0.04, z);
  world.add(ring);
  if (!world.plates) world.plates = [];
  const pressed = !!state.flags.plates[id];
  const p = {
    id, x, z, pressed,
    onPressed: () => {
      glow.material.emissive.setHex(0x7aff8a);
      ring.material.color.setHex(0x7aff8a); // the ring agrees: DONE
      audio.play('checkpoint', { volume: 0.8, rate: 1.3 });
      if (onPressed) onPressed();
    },
  };
  if (pressed) {
    glow.material.emissive.setHex(0x7aff8a);
    ring.material.color.setHex(0x7aff8a);
  }
  world.plates.push(p);
  world.onAnimate((t) => {
    glow.material.emissiveIntensity = p.pressed ? 1.4 : 0.7 + 0.35 * Math.sin(t * 2.6 + x);
    ring.material.opacity = p.pressed ? 0.4 : 0.4 + 0.3 * Math.sin(t * 2.4 + x);
    const s = p.pressed ? 1 : 1 + 0.06 * Math.sin(t * 2.4 + x);
    ring.scale.set(s, s, 1);
  });
  return p;
}

// A BARRED WAY — the road, or the reward, that you can SEE and cannot take yet.
//
// Bars rather than rubble, deliberately. A rock pile is the crackables'
// grammar ("break me") and a tinted gate is a promiseGate ("a wolf you have
// not earned"). Iron bars in front of a lit chest say only "something opens
// these" — which is exactly the question a pressure plate answers, and the
// only question a five-year-old has to ask to solve the room.
//
// Cleared state is the PLATE'S OWN save flag, so a room the child already
// solved rebuilds with no bars and — the promiseGate lesson, learned the hard
// way in A8 — no leftover collider either. A cleared gate that keeps its
// collider is a locked door with nothing left in the room to unlock it.
// `opts.solved` matters when a room needs TWO plates: keyed off one plate's
// own flag, a half-solved room would rebuild with the bars gone and the door
// still shut — an opening with nothing in it and nothing left to open it.
export function plateBars(world, prepareModel, barsGltf, id, x, z, opts = {}) {
  const { span = 2.6, ry = 0, tint = 0x4a4350 } = opts;
  const solved = opts.solved || (() => !!state.flags.plates[id]);
  if (solved()) return { open() {} };
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // Arch_bars measures 2.48 x 3.39 (tools/probe-modelsize.mjs), so one panel
  // covers a 2.4u doorway exactly and a wider mouth takes as many as it needs.
  const n = Math.max(1, Math.round(span / 2.4));
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1) - 0.5) * (span - 2.4);
    const bar = prepareModel(barsGltf.scene.clone());
    bar.traverse((m) => {
      if (!m.isMesh || !m.material) return;
      m.material = m.material.clone();
      m.material.color.setHex(tint);
      // NO SHADOW PASS. A thin grate's shadow is stripes nobody reads, and a
      // castShadow mesh renders twice (depth + beauty). lb measured 134 calls
      // against the 125 budget with the sho furniture in, and the shadow
      // passes on the unbatchable puzzle pieces were the honest place to pay
      // it back (probe-drawcall-attrib, 2026-08-29).
      m.castShadow = false;
    });
    bar.position.set(ry ? 0 : f, 0, ry ? f : 0);
    bar.rotation.y = ry;
    g.add(bar);
  }
  world.add(g);
  // The panel is flat, so the collider is thin ACROSS and wide ALONG — and it
  // is a box, not a circle, because the whole job of these bars is to seal a
  // straight opening from jamb to jamb with no shoulder to squeeze past.
  const halfSpan = span / 2, halfThick = 0.45;
  const collider = ry
    ? { minX: x - halfThick, maxX: x + halfThick, minZ: z - halfSpan, maxZ: z + halfSpan }
    : { minX: x - halfSpan, maxX: x + halfSpan, minZ: z - halfThick, maxZ: z + halfThick };
  world.boxColliders.push(collider);
  world.reserve(x, z, halfSpan + 0.6, 'bars:' + id);
  return {
    open(silent = false) {
      world.root.remove(g);
      const i = world.boxColliders.indexOf(collider);
      if (i >= 0) world.boxColliders.splice(i, 1);
      if (!silent) {
        audio.play('slam', { volume: 0.75, rate: 0.8 });   // the bars go up
        audio.play('puff', { volume: 0.6, rate: 1.1 });
      }
    },
  };
}
