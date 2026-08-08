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

export const GATE_TYPES = {
  boulder: { ability: 'earth_wolf', icon: '🪨', label: 'A huge boulder blocks the way' },
  water: { ability: 'tide_wolf', icon: '💧', label: 'A rushing fire-water channel' },
  bramble: { ability: 'verdant_wolf', icon: '🌿', label: 'A thorny tangle chokes the way' },
  ice: { ability: 'frost_wolf', icon: '❄️', label: 'A spring sealed in old ice' },
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
export function registerCuttable(world, { id, x, z, region, group, collider, onCut, regrows }) {
  const entry = {
    id, x, z, cut: false, regrows: !!regrows, group, collider, region,
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
  if (!world.shatterables) world.shatterables = [];
  world.shatterables.push({
    id, x, z, broken: false,
    clear: () => {
      world.root.remove(group);
      const i = world.circleColliders.indexOf(collider);
      if (i >= 0) world.circleColliders.splice(i, 1);
      WS.set(region, 'ice_' + id);
      audio.play('parry', { volume: 0.7, rate: 1.8 });   // the crack
      audio.play('puff', { volume: 0.8, rate: 1.3 });
    },
  });
  if (!world.shatterAt) {
    world.shatterAt = (cx, cz, r) => {
      let n = 0;
      for (const c of world.shatterables) {
        if (c.broken) continue;
        const dx = c.x - cx, dz = c.z - cz;
        if (dx * dx + dz * dz > r * r) continue;
        c.broken = true;
        c.clear();
        n++;
      }
      return n;
    };
  }
  return { id, collider };
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
export function waterGate(world, x, z, w, d) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({
      color: 0x1d3a52, emissive: 0x3a7aa8, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.9, roughness: 0.4,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.03, z);
  world.add(water);
  world.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
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
