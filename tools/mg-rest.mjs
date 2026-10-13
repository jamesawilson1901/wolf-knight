// THE DEN AT REST, COUNTED — the one draw-call reading every mini-game suite
// takes before a round and after it (tools/verify-minigame.mjs,
// verify-mg-quiz, -tag, -hide, -howl, -herb). Written once because six copies
// had already started to drift.
//
// Stand at one spot, wait for the camera to stop MOVING (watched, not a frame
// count: headless rAF is bursty), then count with everything that LIVES
// hidden: Pip, Kael and his gear, every skinned creature already in the room
// at the first reading, and the shared spark cloud. They walk into and out
// of frame on their own (the known-fail entry this replaced was exactly
// that); anything a game left behind was not in that set and is still
// counted. Median of five.
// (No game's ring may sit within a ring's reach of REST — standing there
// would open it. Herb Match's did until v3.209.)
export const restCalls = (page, REST) => page.evaluate(async (p) => {
  const g = window.__game;
  const wait = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
  g.player.root.position.set(p.x, 0, p.z);
  let last = null, still = 0;
  for (let i = 0; i < 600 && still < 6; i++) {
    await wait(1);
    const c = g.camera.position;
    const moved = last ? Math.abs(c.x - last.x) + Math.abs(c.y - last.y) + Math.abs(c.z - last.z) : Infinity;
    still = moved < 0.0005 ? still + 1 : 0;
    last = { x: c.x, y: c.y, z: c.z };
  }
  if (!window.__restMovers) {
    // Kael himself (his pose and his gear are not a game's residue) and the
    // shared spark cloud (alive for a moment after any burst) count too
    const m = new Set([g.pip && g.pip.root, g.player.root, g.juice && g.juice._points].filter(Boolean));
    for (const top of [...g.scene.children, ...g.world.root.children]) {
      let skinned = false;
      top.traverse((n) => { if (n.isSkinnedMesh) skinned = true; });
      if (skinned && top !== g.world.root) m.add(top);
    }
    window.__restMovers = m;
  }
  const hid = [];
  for (const o of window.__restMovers) if (o.visible) { o.visible = false; hid.push(o); }
  await wait(2);
  const s = [];
  for (let i = 0; i < 5; i++) { s.push(g.renderer.info.render.calls); await wait(12); }
  for (const o of hid) o.visible = true;
  s.sort((a, c) => a - c);
  return { children: g.world.root.children.length, calls: s[2], samples: s };
}, REST);
