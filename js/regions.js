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
      ten: 'kb numbered-brazier order puzzle (the dungeon\'s own twist)',
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
        'Cinder\'s ember climbs to the ridge', 'calm music takes over (exists)',
        'coolable lava sleeps to walkable basalt (r1/r2 rebuilds)'],
      durationS: 9, skippable: false, // plays once per save, non-blocking
    },
    ripple: { room: 'e1', what: 'green shoots by the Stoneroot gate' },
    scar: { room: 'r1', what: 'one ash patch by the Den stairs never heals' },
    denArrival: 'Cinder\'s ember settles by the Den campfire',
  },

  stoneroot: {
    name: 'Stoneroot Caverns', built: true, spirit: 'Petra',
    grants: 'earth_wolf', grantAt: 'e3 (after the Bone Warden)',
    threshold: 'e1 camp — Old Bram the prospector (fire, rest, rumour; new line after healing)',
    rooms: ['e1', 'e1b', 'e2', 'e2b', 'e3'],
    beats: {
      approach: 'r3 → e1 (post-boss); fast travel home via the moonstone',
      lockVisible: 'em_boulder seen back in Ember; cracked piles glitter in e1; the DEAD MACHINERY grate (mystery) in e1',
      ki: 'e1 cracked-rock pocket + spike/skeleton wake-up beats',
      sho: 'e2 spike gauntlet, rogue ambush, the millstone boulder',
      ten: 'THE MILL WAKES: the millstone on the plate starts the old machinery — wheels turn in e1/e2 and the e1 grate grinds open (WS stone.mill)',
      boss: 'e3 Bone Warden (front-block, flank/parry to punish)',
      grant30s: 'stomp opens cracked piles beside the crypt (e3_treasure)',
      restoration: 'witnessed in e3 on warden defeat (glow-moss blooms live)',
    },
    gates: [
      { id: 'e2_cracked', requires: 'earth_wolf', firstShownIn: 'stoneroot', hint: 'visible glitter behind cracks', sameRegionOk: true },
      { id: 'e2_bramble', requires: 'verdant_wolf', firstShownIn: 'stoneroot', hint: 'gate_promise + mystery card + visible chest' },
    ],
    restoration: {
      flag: 'restored',
      beats: ['glow-moss blooms around the crypt', 'moss light spreads to e1/e2 on rebuild',
        'Bram cheers up at the camp', 'ripple vine appears at the way onward'],
      durationS: 9, skippable: false,
    },
    ripple: { room: 'e3', what: 'a living vine through the NE wall — the Wild Woods calling (mystery: wildwoods_way)' },
    scar: { room: 'e2', what: 'one floor crack never closes' },
    denArrival: 'Petra\'s stone-heart hums beside the moonstone',
  },

  wildwoods: { name: 'Wild Woods', built: false, spirit: 'Sylva', grants: 'verdant_wolf', gates: [] },
  frostpeak: { name: 'Frostpeak', built: false, spirit: 'Boreal', grants: 'frost_wolf', gates: [] },
  stormreach: { name: 'Stormreach Cliffs', built: false, spirit: 'Aria', grants: 'storm_wolf', gates: [] },
  sunkenvale: { name: 'Sunken Vale', built: false, spirit: 'Meri', grants: 'tide_wolf', gates: [] },
  shadowcourt: {
    name: 'The Shadow Court', built: false, spirit: 'Luna (and Grimm)', grants: 'moonlight',
    gates: [],
    // Moonlight = the GHOST WOLF (user-approved): white → translucent;
    // enemies stay unaware until Kael attacks, breaks something, or bumps
    // one (contact works both ways). The wings are stealth levels built on
    // an enemy-awareness system (new engine work for Session G).
    mechanic: 'ghost-wolf stealth (awareness on contact/attack/breakage)',
  },
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
