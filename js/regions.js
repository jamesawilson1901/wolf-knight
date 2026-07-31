// REGIONS — one data manifest per region (design/WORLD-DESIGN.md §1).
// The manifest carries the nine template beats, the gate declarations, the
// restoration block and the compounding hooks (ripple / scar / Den arrival).
// Room GEOMETRY stays in rooms.js builders; this layer is the contract that
// validateRegions() machine-checks — most importantly lock-before-key:
// a gate's ability must be SHOWN in an earlier (or same) region than it is
// GRANTED, and from region 2 on, strictly earlier.
// This module is dependency-free on purpose so verify scripts can import it
// straight into node.

export const REGION_ORDER = [
  'ember', 'stoneroot', 'wildwoods', 'frostpeak', 'stormreach',
  'sunkenvale', 'shadowcourt',
];

// ability id -> region that grants it (the "key" side of lock-and-key)
export const GRANTED_IN = {
  fire_wolf: 'ember',
  earth_wolf: 'stoneroot',
  verdant_wolf: 'wildwoods',
  frost_wolf: 'frostpeak',
  storm_wolf: 'stormreach',
  tide_wolf: 'sunkenvale',
  moonlight: 'shadowcourt',
};

export const REGIONS = {
  ember: {
    name: 'Ember Hollow', built: true, spirit: 'Cinder',
    grants: 'fire_wolf', grantAt: 'ka (Kiln shrine, mid-dungeon)',
    threshold: 'den', rooms: ['r1', 'r1b', 'r2', 'r2b', 'k1', 'ka', 'kb', 'r3'],
    beats: {
      approach: 'den → r1 stairs (safe)',
      lockVisible: 'r1 burnable cubby (minute one) + em_boulder + r2b water gate',
      ki: 'ka teach brazier (safe pocket)',
      sho: 'ka gutter pair (timing) + combat brazier',
      ten: 'kb numbered-brazier order puzzle; Ember Key cools the lava (twist)',
      boss: 'r3 Shadowgrip (severs → exposure windows)',
      grant30s: 'shrine grant opens the teach-brazier bars immediately',
      restoration: 'witnessed in r3 on boss defeat (see below)',
    },
    gates: [
      { id: 'r1_cubby', requires: 'fire_wolf', firstShownIn: 'ember', hint: 'Pip obstacle_first + visible pup' },
      { id: 'em_boulder', requires: 'earth_wolf', firstShownIn: 'ember', hint: 'gate_promise + mystery card + visible chest' },
      { id: 'r2b_water', requires: 'tide_wolf', firstShownIn: 'ember', hint: 'gate_promise + mystery card + visible chest' },
    ],
    restoration: {
      flag: 'restored', // WS.set('ember','restored')
      beats: ['warm light floods', 'green sprouts rise around the arena',
        'Cinder\'s ember climbs to the ridge', 'calm music takes over (exists)'],
      durationS: 9, skippable: false, // plays once per save, non-blocking
    },
    ripple: { room: 'e1', what: 'green shoots by the Stoneroot gate' },
    scar: { room: 'r1', what: 'one ash patch by the Den stairs never heals' },
    denArrival: 'Cinder\'s ember settles by the Den campfire',
  },

  stoneroot: {
    name: 'Stoneroot Caverns', built: true, spirit: 'Petra',
    grants: 'earth_wolf', grantAt: 'e3 (after the Bone Warden)',
    threshold: 'den (shared for now — Session B adds a camp at the mouth)',
    rooms: ['e1', 'e2', 'e3'],
    beats: {
      approach: 'r2 sealed door — Session B replaces with a real route',
      lockVisible: 'em_boulder seen in Ember; cracked piles in e1',
      ki: 'e1 cracked-rock pocket', sho: 'e2 plates + skeletons',
      ten: 'PENDING Session B (the Mill machinery twist per LEVEL-DESIGN-2)',
      boss: 'e3 Bone Warden (front-block, flank to punish)',
      grant30s: 'stomp opens cracked piles beside the crypt',
      restoration: 'PENDING Session B',
    },
    gates: [
      { id: 'e2_cracked', requires: 'earth_wolf', firstShownIn: 'stoneroot', hint: 'visible glitter behind cracks' },
      // Session B must place: bramble-choked vent (verdant lock, region 3)
    ],
    restoration: { flag: 'restored', beats: ['PENDING Session B'], durationS: 0, skippable: false },
    ripple: { room: 'PENDING', what: 'into Wild Woods approach' },
    scar: { room: 'PENDING', what: '' },
    denArrival: 'PENDING Session B',
  },

  wildwoods: { name: 'Wild Woods', built: false, spirit: 'Sylva', grants: 'verdant_wolf', gates: [] },
  frostpeak: { name: 'Frostpeak', built: false, spirit: 'Boreal', grants: 'frost_wolf', gates: [] },
  stormreach: { name: 'Stormreach Cliffs', built: false, spirit: 'Aria', grants: 'storm_wolf', gates: [] },
  sunkenvale: { name: 'Sunken Vale', built: false, spirit: 'Meri', grants: 'tide_wolf', gates: [] },
  shadowcourt: { name: 'The Shadow Court', built: false, spirit: 'Luna (and Grimm)', grants: 'moonlight', gates: [] },
};

// Machine-checked world rules. Returns { errors, warnings } — verify scripts
// fail on errors; boot logs them so drift is loud in dev.
export function validateRegions() {
  const errors = [];
  const warnings = [];
  const idx = (r) => REGION_ORDER.indexOf(r);

  for (const [ability, region] of Object.entries(GRANTED_IN)) {
    if (idx(region) === -1) errors.push(`GRANTED_IN['${ability}'] names unknown region '${region}'`);
  }
  for (const [rid, r] of Object.entries(REGIONS)) {
    if (idx(rid) === -1) errors.push(`region '${rid}' missing from REGION_ORDER`);
    if (r.grants && GRANTED_IN[r.grants] !== rid) {
      errors.push(`region '${rid}' grants '${r.grants}' but GRANTED_IN disagrees`);
    }
    for (const g of r.gates || []) {
      const grantRegion = GRANTED_IN[g.requires];
      if (!grantRegion) { errors.push(`gate '${g.id}': unknown ability '${g.requires}'`); continue; }
      const shown = idx(g.firstShownIn);
      const granted = idx(grantRegion);
      if (shown > granted) {
        errors.push(`gate '${g.id}': lock first shown in '${g.firstShownIn}' AFTER its key is granted in '${grantRegion}' — lock must come before key`);
      } else if (shown === granted && granted > 0 && !g.sameRegionOk) {
        warnings.push(`gate '${g.id}': lock and key both in '${grantRegion}' — fine inside a region's own loop, but the NEXT region's lock should be shown a region early`);
      }
      if (!g.hint) warnings.push(`gate '${g.id}': no hint declared (two organic cues rule)`);
    }
    if (r.built && r.restoration && r.restoration.beats.some((b) => String(b).includes('PENDING'))) {
      warnings.push(`region '${rid}' is built but its restoration is PENDING`);
    }
  }
  return { errors, warnings };
}
