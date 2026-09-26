// MOLTEN LAVA — one shader, shared by every lava surface in the game.
//
// Dad: "Replace the lava texture with a better one." It was a 256x64 canvas —
// flat orange with soft dark blobs drifting sideways — which read as a
// patterned rug, not as something that would burn you. This draws what lava
// actually looks like from above: plates of cooled black crust with molten
// seams glowing between them, hot flow churning underneath, the plates slowly
// drifting and the heat breathing. It is procedural (cellular noise + fbm), so
// there is no asset to load, and it samples WORLD position, so two channels
// side by side line up and the pattern never stretches with the plane's size.
//
// Still one draw call per surface, like the plane it replaces. The fragment
// cost is a 3x3 cell search plus two small fbm calls — fine on a phone for
// the few square metres of lava a room shows. Fog and the renderer's output
// colour space are honoured, so it sits in each room's grade like everything
// else.
import * as THREE from 'three';

const VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uHeat;
  varying vec2 vW;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash2(i).x, b = hash2(i + vec2(1.0, 0.0)).x;
    float c = hash2(i + vec2(0.0, 1.0)).x, d = hash2(i + vec2(1.0, 1.0)).x;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }
  // cellular crust: F1 = distance to the nearest plate centre, F2 = second nearest
  vec2 cells(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float f1 = 8.0, f2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      o = 0.5 + 0.38 * sin(uTime * 0.35 + 6.2831 * o);   // plates jostle slowly
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
    return vec2(f1, f2);
  }

  void main() {
    vec2 w = vW;
    // the plates drift downstream; the flow beneath churns a little faster
    vec2 drift = vec2(uTime * 0.06, uTime * 0.018);
    vec2 warp = vec2(fbm(w * 0.45 + drift), fbm(w * 0.45 - drift + 5.3)) - 0.5;
    vec2 c = cells(w * 0.46 + drift + warp * 0.9);
    float seam = 1.0 - smoothstep(0.02, 0.16, c.y - c.x);        // bright cracks
    float core = 1.0 - smoothstep(0.0, 0.55, c.x);                // plate middles cool most
    float flow = fbm(w * 1.3 - vec2(uTime * 0.22, uTime * 0.05) + warp * 2.0);

    vec3 crustDark = vec3(0.09, 0.03, 0.025);
    vec3 crustWarm = vec3(0.46, 0.12, 0.04);
    vec3 crust = mix(crustDark, crustWarm, smoothstep(0.35, 0.8, fbm(w * 2.1 + 3.0)) * (1.0 - core * 0.6));
    vec3 hot = mix(vec3(0.95, 0.22, 0.03), vec3(1.0, 0.62, 0.12), flow);
    vec3 white = vec3(1.0, 0.9, 0.55);

    // how much of this texel is exposed melt: the seams, plus melt welling
    // up where the flow runs hot between plates
    float melt = clamp(seam + smoothstep(0.42, 0.72, flow) * (1.0 - core * 0.7), 0.0, 1.0);
    vec3 col = mix(crust, hot, melt);
    col = mix(col, white, seam * smoothstep(0.6, 1.0, flow) * 0.55);   // the hottest seams go pale
    col *= 0.75 + 0.5 * uHeat;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// A fresh material per surface (room teardown frees materials; a shared one
// would be disposed under the next room). `update(t, heat)` is called from the
// room's own onAnimate so the lava only moves while its room is live.
export function makeLavaMaterial() {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uTime: { value: 0 }, uHeat: { value: 0.5 } },
  ]);
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true,
  });
  return {
    material,
    update(t, heat) { uniforms.uTime.value = t; uniforms.uHeat.value = heat; },
  };
}
