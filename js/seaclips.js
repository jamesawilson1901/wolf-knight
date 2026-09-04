// THE TWO CLIPS THE SEA DRAGON DID NOT COME WITH.
//
// Jenosuke's Sea-Dragon is the best character body anyone has supplied to this
// game: one SkinnedMesh, one material, 39 bones, 2,173 triangles, one draw
// call, properly skinned, and it needed no conversion at all — unlike the
// skeleton dragon, which arrived as 394 separate meshes.
//
// What it does not have is a fight. The file ships `DeathAnimation`, `Idol`
// and `Idol.001` (the two idles are the same 2.46 seconds and the same 21
// tracks). There is no attack and nothing that moves it through water. For a
// boss that is not cosmetic: COMBAT-SPEC's readability law is that the tell
// lives on the BODY and runs for at least 0.9s before the blow lands, so a
// boss that cannot wind up cannot be read by a five-year-old, and the fight
// becomes "watch the health bar" instead of "watch the animal".
//
// So the two missing clips are authored here, onto Jenosuke's own rig. This is
// the animation half of the 2026-08-23 amendment to the no-code-built-creatures
// rule and not a crack in it: no geometry is made here. Every vertex, every
// bone and every weight is the artist's, untouched. What this file writes is
// rotation over time for bones that already exist.
//
// HOW THE ANATOMY WAS FOUND. The rig names its bones `Bone002_01` through
// `Bone033_024`, so nothing about it can be read off the names. It was
// measured instead: every bone's rest position in model space, plus the
// centroid of the vertices it actually drives at weight ≥ 0.5. That gives an
// unambiguous map —
//
//   * Bone002_01 → Bone020_019, nineteen bones in one unbroken chain running
//     from z −2.42 (the tail tip, lowest and furthest back) forward and upward
//     to z −0.78, y 1.67. That is the SPINE, tail-first.
//   * Bone021_029 branches up and forward off the end of it to y 2.07, and
//     carries Bone031_030 (434 vertices — the skull, reaching z 1.07) and
//     Bone032_031 (90 vertices, hanging below it — the JAW).
//   * two mirrored three-bone branches off the same shoulder, one going to
//     x −0.66 and one to x +0.52, each ending in a 368/391-vertex fan. Those
//     are the great swept fins.
//
// Everything below is written in terms of that map, and asserts it on load: if
// a future version of the model renames a bone, this throws with the name it
// wanted rather than silently animating nothing, which is exactly how Meri
// spent a month fighting in her bind pose.
import * as THREE from 'three';

// The spine, tail tip first. Order matters: the swim is a wave that TRAVELS
// along this list, and a wave that travels the wrong way is a dragon swimming
// backwards.
const SPINE = [
  'Bone002_01', 'Bone003_02', 'Bone004_03', 'Bone005_04', 'Bone006_05',
  'Bone007_06', 'Bone008_07', 'Bone009_08', 'Bone010_09', 'Bone011_010',
  'Bone012_011', 'Bone013_012', 'Bone014_013', 'Bone015_014', 'Bone016_015',
  'Bone017_016', 'Bone018_017', 'Bone019_018', 'Bone020_019',
];
const NECK = 'Bone021_029';
const SKULL = 'Bone031_030';
const JAW = 'Bone032_031';
const FIN_L = ['Bone001_020', 'Bone022_021', 'Bone023_00'];
const FIN_R = ['Bone033_024', 'Bone027_025', 'Bone028_026'];

// The map is exported because a SECOND tool needs the same anatomy:
// tools/paint-sea-dragon.mjs bakes the body's texture by asking which bone
// drives each vertex. Two hand-copied lists of thirty bone names would drift
// the first time one of them was edited, and the drift would be silent —
// the paint would simply land on the wrong part of the animal.
export const SEA_DRAGON_BONES = { SPINE, NECK, SKULL, JAW, FIN_L, FIN_R };

// The body lies along Z with the head at +z, so a serpent's side-to-side
// undulation is rotation about Y, and rearing back is rotation about X
// (negative, which lifts +z).
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

// ANGLES ALONG A CHAIN ADD UP, AND NINETEEN OF THEM ADD UP FAST.
//
// The first cut of this file set a per-bone angle that looked reasonable on
// its own — about 0.21 radians at the peak of the wind-up. Across nineteen
// spine bones that is four radians, two hundred and twenty-nine degrees, and
// the measurement said so plainly: the skull ended the "rear back" 3.81 units
// BELOW where it started, because the body had folded over itself and put the
// head under the tail.
//
// So the spine is authored as a TOTAL bend for the whole chain, shared out
// along it. `bend` says what the animal does; the division is bookkeeping.
// Weights lean toward the shoulders, because a serpent rears from the front.
const spineShare = () => {
  const w = SPINE.map((_, i) => 0.4 + (i / (SPINE.length - 1)) * 1.6);
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);            // sums to 1: one total bend, split up
};

// A track is authored as a rotation to COMPOSE with the bone's rest pose, never
// as an absolute one. The rest pose is the artist's shape; adding to it keeps
// the dragon looking like itself in every frame of both new clips.
function track(bone, times, angles, axis) {
  const q = new THREE.Quaternion();
  const d = new THREE.Quaternion();
  const out = new Float32Array(times.length * 4);
  for (let i = 0; i < times.length; i++) {
    d.setFromAxisAngle(axis, angles[i]);
    q.copy(bone.quaternion).multiply(d);
    out[i * 4] = q.x; out[i * 4 + 1] = q.y; out[i * 4 + 2] = q.z; out[i * 4 + 3] = q.w;
  }
  return new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion',
    Float32Array.from(times), out);
}

function boneMap(skeleton) {
  const by = new Map(skeleton.bones.map((b) => [b.name, b]));
  const need = [...SPINE, NECK, SKULL, JAW, ...FIN_L, ...FIN_R];
  const missing = need.filter((n) => !by.has(n));
  if (missing.length) {
    throw new Error('sea dragon rig has changed — no bone named ' + missing.join(', '));
  }
  return by;
}

// THE SWIM.
//
// WHICH END IS PINNED. The obvious reading of the bone map — tail at z −2.42,
// head at z +1.07 — is that the tail is the far end of the animal, and the
// first version of this clip put the biggest amplitude there so the tail would
// drive. Measured, the tail tip moved 0.000 and the SKULL swung 1.9: in this
// rig the tail is the ROOT of the chain and the head is the free end, so the
// tail can no more swish than a shoulder can wave itself. Every rotation moves
// what is downstream of it, which here means everything toward the head.
//
// AND IT CANNOT RIPPLE. The next attempt was a travelling wave with the shape
// carried by phase rather than by amplitude, which is how an eel swims. The
// deviation was measured at every bone along the body, at one instant, at six
// combinations of amplitude and wavelength — and it came out MONOTONIC every
// single time. The first eleven bones never left their rest line by more than
// six thousandths of a unit, because they are the long straight run of tail
// closest to the root and there is nothing upstream of them to move them.
//
// So this animal does not have an eel's swim in it, and no amount of tuning
// will find one. What it has is what the artist posed it as and what it looks
// like on screen: a serpent REARING, its lower body a coil resting below, its
// forebody and head free above. The clip is written to that — the body sways
// from the shoulders up and the head leads the weave — rather than to a swim
// the rig would only ever fake badly.
//
// The amount is budgeted by measurement: 0.05 radians on every spine bone
// swings the skull 1.10 units, which on a four-unit animal is a head thrashing.
// This is a third of that.
//
// 2.4 seconds, matching the idle it has to blend with.
export function swimClip(skeleton) {
  const by = boneMap(skeleton);
  const DUR = 2.4;
  const STEPS = 24;
  const times = [];
  for (let i = 0; i <= STEPS; i++) times.push((i / STEPS) * DUR);
  const tracks = [];

  // Uniform amplitude with a lag of one and a half wavelengths: measured, that
  // puts the weave in the forebody where this rig can actually express it.
  // 0.04 swung the head 1.76 units end to end — a four-unit animal shaking its
  // head about. Tuned against the measurement rather than the arithmetic,
  // because the neck's counter-steer adds to it: 0.016 lands near 0.7.
  const AMP = 0.016;
  SPINE.forEach((name, i) => {
    const along = i / (SPINE.length - 1);           // 0 at the tail (the root)
    const lag = along * Math.PI * 1.5;
    const angles = times.map((t) => Math.sin((t / DUR) * Math.PI * 2 - lag) * AMP);
    tracks.push(track(by.get(name), times, angles, Y));
  });

  // the fins sweep on the same beat, mirrored
  [[FIN_L, 1], [FIN_R, -1]].forEach(([chain, sign]) => {
    chain.forEach((name, i) => {
      const amp = 0.13 - i * 0.03;
      const angles = times.map((t) =>
        Math.sin((t / DUR) * Math.PI * 2 - i * 0.5) * amp * sign);
      tracks.push(track(by.get(name), times, angles, X));
    });
  });

  // and the neck counter-steers, so the head stays pointed where it is going
  // instead of being flung about on the end of the body — a swimming animal
  // keeps its eyes on the thing it is swimming at.
  const headAngles = times.map((t) => Math.sin((t / DUR) * Math.PI * 2 - Math.PI) * 0.10);
  tracks.push(track(by.get(NECK), times, headAngles, Y));

  return new THREE.AnimationClip('Authored|Weave', DUR, tracks);
}

// THE ATTACK, AND ITS TELEGRAPH.
//
// Shaped by COMBAT-SPEC rather than by what looks good in isolation:
//
//   0.00 → 0.95   REAR BACK. The neck arches up and back, the spine coils, the
//                 jaw opens wide. Nearly a full second of one unmistakable
//                 shape, held at the top — this is the whole tell, and it is
//                 the reason a child can beat this fight.
//   0.95 → 1.20   LUNGE. Everything snaps forward and down. Fast, because the
//                 contrast with the wind-up is what makes the wind-up legible.
//   1.20 → 1.75   Settle back to rest, and the mouth closes.
//
// The punish window the fight opens afterwards is boss.js's business; what
// this owes it is a body that is visibly committed and visibly slow to
// recover.
export function attackClip(skeleton) {
  const by = boneMap(skeleton);
  const DUR = 1.75;
  //        rest   coil  ...held...  strike  follow  settle
  const T = [0, 0.35, 0.70, 0.95, 1.10, 1.20, 1.45, 1.75];

  const tracks = [];

  // THE HEAD'S OWN JOINTS carry most of the rear-back, because they are two
  // bones rather than nineteen and can be swung hard without compounding.
  // Negative about X lifts the head (the body runs along +z).
  tracks.push(track(by.get(NECK), T,
    [0, -0.34, -0.54, -0.60, 0.22, 0.40, 0.12, 0], X));
  // the skull follows a beat later, so the head whips rather than swings rigid
  tracks.push(track(by.get(SKULL), T,
    [0, -0.16, -0.30, -0.36, 0.30, 0.42, 0.11, 0], X));
  // the jaw: opens through the whole wind-up, widest at the top, shut on impact
  tracks.push(track(by.get(JAW), T,
    [0, 0.30, 0.54, 0.62, 0.40, 0.06, 0.02, 0], X));

  // and the spine adds a long slow arch UNDER that — 0.5 radians of total
  // bend, shared along the chain, not 0.5 per bone
  const COIL = 0.5;
  const share = spineShare();
  SPINE.forEach((name, i) => {
    const k = COIL * share[i];
    tracks.push(track(by.get(name), T,
      [0, -0.5 * k, -0.85 * k, -k, 0.55 * k, 0.75 * k, 0.25 * k, 0], X));
  });

  // the fins flare on the wind-up — the silhouette gets BIGGER before the
  // blow, which is the oldest readable tell there is. Three bones a side, so
  // these can stay generous without folding anything.
  [[FIN_L, 1], [FIN_R, -1]].forEach(([chain, sign]) => {
    chain.forEach((name, i) => {
      const a = (0.30 - i * 0.07) * sign;
      tracks.push(track(by.get(name), T,
        [0, a * 0.6, a, a, a * 0.7, a * 0.3, a * 0.1, 0], Y));
    });
  });

  return new THREE.AnimationClip('Authored|Attack', DUR, tracks);
}

// Everything the boss class asks a body for, in the names its `clips` map will
// use. Called once, on the loaded gltf, before a mixer is built.
export function fitSeaDragon(gltf) {
  let skinned = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) throw new Error('sea-dragon.glb has no SkinnedMesh');
  const already = new Set(gltf.animations.map((c) => c.name));
  if (!already.has('Authored|Weave')) gltf.animations.push(swimClip(skinned.skeleton));
  if (!already.has('Authored|Attack')) gltf.animations.push(attackClip(skinned.skeleton));
  return gltf;
}

// The clip names ARIA's SKINS entry points at (js/boss.js) — it was written
// for Meri and moved on 2026-09-05, because Meri's fight is built out of the
// nine clips her own body brought and Aria's had no idle and no walk at all.
// `run` reuses the weave on purpose: a serpent has one way of moving and does
// it faster, and the boss class plays `run` at a raised timeScale during a
// charge.
export const SEA_DRAGON_CLIPS = {
  idle: 'Sea-Dragon|Idol',
  walk: 'Authored|Weave',
  run: 'Authored|Weave',
  attack: 'Authored|Attack',
  death: 'Sea-Dragon|DeathAnimation',
};
