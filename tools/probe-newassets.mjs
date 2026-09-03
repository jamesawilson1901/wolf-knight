// INSPECT A BATCH OF CANDIDATE MODELS BEFORE ANY OF THEM GOES IN THE GAME.
//
// The house rule (CLAUDE.md) is that every creature is a shipped asset-pack
// model, and the 2026-08-23 amendment lets a rigged real mesh in provided it
// (a) is a real mesh, (b) sits unremarked beside wolf.gltf / Slime.glb, and
// (c) carries the same clip vocabulary — idle/walk/attack/death — so it
// animates to the same standard rather than being a static prop wearing a
// monster's shape.
//
// So this measures exactly those three things, per file: real geometry (mesh
// and triangle counts), style fit (draw calls, material count, texture size,
// vertex-colour vs textured), and rig (skinned? which clips, how long?). Plus
// the size it comes in at, because everything in this game is scaled by
// measurement and never by a typed number.
import { launch } from './wk-drive.mjs';

const FILES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'asset-raw/new-2026-09-03/lowpoly_bennu_rebel_moon.glb',
  'asset-raw/new-2026-09-03/low_poly_rhino_rider.glb',
  'asset-raw/new-2026-09-03/low_poly_dragon.glb',
  'asset-raw/new-2026-09-03/minataur_low_poly.glb',
  'asset-raw/new-2026-09-03/stylized_blue_dragon_baby.glb',
  'asset-raw/new-2026-09-03/stylized_blackwhite_dragon.glb',
  'asset-raw/new-2026-09-03/stylized_redblack_dragon.glb',
  'asset-raw/new-2026-09-03/stylized_redblack_dragon_baby.glb',
  'asset-raw/new-2026-09-03/lowpoly_orc_archer.glb',
  'asset-raw/new-2026-09-03/low_poly_fantasy_owl__downloadable.glb',
  'asset-raw/new-2026-09-03/cartoony_wasp_animated.glb',
  'asset-raw/new-2026-09-03/griffin_animated.glb',
  'asset-raw/new-2026-09-03/young_dragon.glb',
  'asset-raw/new-2026-09-03/skeletondragon/source/model.gltf',
];
// ...and the same measurements taken of what already ships, so "does it sit
// beside the existing roster" is a comparison rather than an opinion.
const REFERENCE = [
  'assets/chars/wolf.gltf',
  'assets/chars/monsters/Slime.glb',
  'assets/chars/monsters/Dragon.glb',
  'assets/chars/skeletons/Skeleton_Warrior.glb',
];

const wk = await launch({ timescale: 1 });
await wk.newGame('ASSETS');

const rows = await wk.page.evaluate(async (files) => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const out = [];
  for (const url of files) {
    let g;
    try { g = await loader.loadAsync('/' + url); }
    catch (e) { out.push({ url, error: String(e && e.message || e) }); continue; }
    const scene = g.scene;
    scene.updateWorldMatrix(true, true);
    const bb = new THREE.Box3().setFromObject(scene);
    const size = bb.getSize(new THREE.Vector3());
    let meshes = 0, tris = 0, skinned = 0, verts = 0;
    const mats = new Set(), maps = new Set();
    let biggestMap = 0, vertexColours = 0;
    scene.traverse((n) => {
      if (!n.isMesh) return;
      meshes++;
      if (n.isSkinnedMesh) skinned++;
      const geo = n.geometry;
      const count = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      tris += Math.round(count);
      verts += geo.attributes.position.count;
      if (geo.attributes.color) vertexColours++;
      for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
        if (!m) continue;
        mats.add(m.uuid);
        if (m.map && m.map.image) {
          maps.add(m.map.uuid);
          biggestMap = Math.max(biggestMap, m.map.image.width || 0, m.map.image.height || 0);
        }
      }
    });
    out.push({ url,
      size: { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) },
      floorOffset: +bb.min.y.toFixed(2),
      pivotOffset: { x: +((bb.min.x + bb.max.x) / 2).toFixed(2), z: +((bb.min.z + bb.max.z) / 2).toFixed(2) },
      meshes, tris, verts, skinned, materials: mats.size, textures: maps.size,
      biggestTexture: biggestMap, vertexColourMeshes: vertexColours,
      clips: (g.animations || []).map((c) => `${c.name}:${c.duration.toFixed(2)}s`) });
  }
  return out;
}, [...FILES, ...REFERENCE]);

const pad = (s, n) => String(s).padEnd(n);
console.log('\n=== CANDIDATES =========================================================');
for (const r of rows) {
  const name = r.url.split('/').pop();
  if (r.error) { console.log(pad(name, 40), 'FAILED TO LOAD:', r.error); continue; }
  const isRef = REFERENCE.includes(r.url);
  if (isRef && rows.indexOf(r) === FILES.length) {
    console.log('\n=== ALREADY IN THE GAME, FOR COMPARISON =================================');
  }
  console.log(`\n${name}`);
  console.log(`   size      ${r.size.x} x ${r.size.y} x ${r.size.z}   (floor offset ${r.floorOffset}, pivot off-centre x${r.pivotOffset.x} z${r.pivotOffset.z})`);
  console.log(`   geometry  ${r.tris} tris, ${r.verts} verts, ${r.meshes} meshes (${r.skinned} skinned), ${r.materials} materials`);
  console.log(`   look      ${r.textures} texture(s), biggest ${r.biggestTexture}px, ${r.vertexColourMeshes} vertex-coloured mesh(es)`);
  console.log(`   clips     ${r.clips.length ? r.clips.join(', ') : 'NONE — a static prop, not a creature'}`);
}
console.log('\nerrors:', JSON.stringify(wk.errors.slice(0, 3)));
await wk.b.close();
