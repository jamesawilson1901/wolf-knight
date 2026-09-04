// ONE DRAW CALL OUT OF FOUR HUNDRED PIECES.
//
// The skeleton dragon dad sent is the best boss body in his batch — 4,728
// triangles, ONE material, and a full attack / fly / dive / walk / idle
// vocabulary — and it was held back because it arrives as 394 separate meshes
// against a 125 draw-call ceiling for a whole room.
//
// The obvious answer, merging the geometry, destroys it. `skins: 0`: nothing in
// this file is rigged. It is a Blockbench-shaped export where every bone IS a
// mesh and the animation moves the NODES. Merge the meshes and the animation
// has nothing left to move.
//
// So this converts instead of merging. One bone per animated node, in the same
// hierarchy and — critically — under the SAME NAMES, because the animation
// tracks address nodes by name and will drive the bones without being touched.
// Every vertex of a piece is skinned to that piece's bone with weight 1, so
// nothing bends that did not bend before: each block still moves rigidly with
// its own node, exactly as the artist authored it. The geometry then merges
// into a single SkinnedMesh, because it all shares one material.
//
// Result: 394 draw calls become 1, the five clips still play, and the silhouette
// is unchanged. It is a general conversion, not a fix for one file — any
// node-animated model in this shape can come through it.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

export function skinifyNodeAnimated(root) {
  root.updateMatrixWorld(true);

  // 1. EVERY NODE BECOMES A BONE, hierarchy and names preserved. The names are
  //    the whole trick: AnimationClip tracks are addressed as "<nodeName>.
  //    position" and so on, so a bone wearing the node's name inherits its
  //    animation with no retargeting at all.
  // EVERY node, mesh or not. The first cut skipped mesh nodes when recursing,
  // on the assumption that a mesh hangs off a node — but in a Blockbench-shaped
  // export the meshes ARE the nodes, and they have children of their own. That
  // truncated the hierarchy at the first piece: 94 bones out of 487 nodes, every
  // deeper piece welded to a distant ancestor, and the dragon came out 1.3 units
  // wide where it should be 7.3. The rest pose is the check that caught it —
  // comparing a converted model mid-animation against an original at rest says
  // nothing at all.
  const boneFor = new Map();
  const makeBone = (node, parentBone) => {
    const bone = new THREE.Bone();
    bone.name = node.name;
    bone.position.copy(node.position);
    bone.quaternion.copy(node.quaternion);
    bone.scale.copy(node.scale);
    if (parentBone) parentBone.add(bone);
    boneFor.set(node, bone);
    for (const child of node.children) makeBone(child, bone);
    return bone;
  };

  const rootBone = makeBone(root, null);
  rootBone.updateMatrixWorld(true);

  // 2. COLLECT THE PIECES, each flattened into the skeleton's own space at bind
  //    pose and tagged with the index of the bone that will carry it.
  const bones = [];
  rootBone.traverse((b) => { if (b.isBone) bones.push(b); });
  const indexOf = new Map(bones.map((b, i) => [b, i]));

  const parts = [];
  let material = null;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    material = material || o.material;
    // the bone this piece belongs to: itself if it is a node, else its parent
    const owner = boneFor.get(o) || boneFor.get(o.parent);
    if (!owner) return;
    const bi = indexOf.get(owner);
    if (bi === undefined) return;

    // BAKE TO MODEL SPACE AND STOP THERE. The first cut then multiplied by the
    // bone's inverse as well — which is the job the Skeleton's own boneInverses
    // already do, so every piece got its transform taken off twice and the
    // dragon came out rotated and the wrong size. Skinning wants geometry in
    // BIND space and an inverse-bind matrix per bone; supplying both halves
    // yourself is doing the work and then undoing it.
    const g = o.geometry.clone();
    o.updateMatrixWorld(true);
    g.applyMatrix4(o.matrixWorld);

    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    // merge refuses to run on geometries whose attribute sets differ at all
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const uv = new Float32Array(n * 2);
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    parts.push(g);
  });

  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  if (!merged) return null;
  for (const g of parts) g.dispose();

  // 3. ONE SKINNED MESH, one skeleton, one draw call.
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = (root.name || 'skinified') + '_merged';
  const holder = new THREE.Group();
  holder.name = root.name || 'skinified';
  holder.add(rootBone);
  holder.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;   // a boss that vanishes at the arena edge is worse
  return { holder, mesh, skeleton, boneCount: bones.length, pieces: parts.length };
}
