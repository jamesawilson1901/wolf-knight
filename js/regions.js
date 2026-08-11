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
  storm_wolf: 'stormreach',
  tide_wolf: 'sunkenvale',
  moonlight: 'shadowcourt',
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
    denArrival: 'Cinder\'s ember settles by the Den campfire; Rook the ranger arrives',
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
    denArrival: 'Petra\'s stone-heart hums beside the moonstone; Old Bram visits the fire',
  },

  wildwoods: {
    name: 'Wild Woods', built: true, spirit: 'Sylva',
    grants: 'verdant_wolf', grantAt: 'w5 (Sylva freed at the glade)',
    threshold: 'e3 vine doorway (opens when Stoneroot is restored)',
    rooms: ['w1', 'w1b', 'w2', 'w2b', 'w3', 'w4', 'w5'],
    beats: {
      approach: 'e3 → w1 through the living vine (post-Warden)',
      lockVisible: 'e2 bramble seen back in Stoneroot; the ICE-SEALED SPRING (frost, region 4) shown in w1b',
      ki: 'w1 thorn hounds teach "fire burns thorns"; w1b dell branch',
      sho: 'w2 GLOOMWOOD LANTERN DOOR: three cold wisp-lanterns lit by Fire slams — one walled behind cracked rock (Earth first). Skills from regions 1+2, braided.',
      ten: 'w3 ROOTBOUND DOOR: twin boulders onto twin plates through a two-gap hedge — the Stoneroot push skill with real routing',
      boss: 'w5 Sylva, Thornbound — the giant-wolf duel grammar in green (charge/collapse, swipe/parry), slightly quicker, 24 hp',
      grant30s: 'a bramble tangle in the glade itself hides gold — the fresh vine-lash cuts it within 30s',
      restoration: 'witnessed: flowers bloom in the glade; her leaf-light rests free',
    },
    gates: [
      { id: 'w2b_cracked', requires: 'earth_wolf', firstShownIn: 'stoneroot', hint: 'glittering cracks by the hollow oak' },
      { id: 'w5_reward', requires: 'verdant_wolf', firstShownIn: 'stoneroot', hint: 'the e2 bramble taught the look; Pip verdant_howto points at it' },
      { id: 'w_ice', requires: 'frost_wolf', firstShownIn: 'wildwoods', hint: 'gate_promise + mystery card + visible chest' },
    ],
    restoration: {
      flag: 'restored',
      beats: ['flowers bloom across the glade', 'Sylva\'s leaf-light floats free at the shrine',
        'thorn gates already opened stay open', 'victory sting → den theme'],
      durationS: 8, skippable: false,
    },
    ripple: { room: 'w5', what: 'Luna speaks of the glittering frost peaks (luna_dream_3)' },
    scar: { room: 'w4', what: 'the bare thorn-trees of the Bramble Heart never regrow leaves' },
    denArrival: 'polish list: Sylva\'s leaf-light joining the den fire',
  },
  frostpeak: {
    name: 'Frostpeak', built: true, spirit: 'Boreal',
    grants: 'frost_wolf', grantAt: 'f5 (Boreal calmed at the summit)',
    threshold: 'w5 north treeline (opens when Sylva is freed)',
    rooms: ['f1', 'f1b', 'f2', 'f2b', 'f3', 'f4', 'f5'],
    beats: {
      approach: 'w5 → f1 up past the last trees (post-Sylva)',
      lockVisible: 'the ICE-SEALED SPRING was already shown back in w1b; ice blocks recur in f1b, f4 and the summit itself',
      ki: 'f1 rime hounds teach "the cold burns off" (fire-weak, same as thorns); f1b cairn branch',
      sho: 'f2 ICEBOUND HALL: three braziers sealed in ice — fire BREATH melts the shell, the fire SLAM lights the bowl. Two fire verbs chained, and anything melted-but-unlit seals over again.',
      ten: 'f3 FROZEN LAKE: the Stoneroot boulders on slick ice — a push skids until something stops it, so each stone must be bumped sideways into a stopper rock to line up its lane, then sent north onto its plate',
      boss: 'f5 Boreal the Rimebound — the first FLYING boss: circle, red dive lane, crash-and-punish. Bolts hit flyers for full, so the region-1 law finally decides a fight. 22 hp',
      grant30s: 'an ice block in the eyrie itself hides gold — the fresh frost breath shatters it within 30s',
      restoration: 'the storm lifts off the summit; her rime-light rests on the standing stones',
    },
    gates: [
      { id: 'f_cairn', requires: 'frost_wolf', firstShownIn: 'wildwoods', hint: 'the w1b spring taught the look; visible chest behind it' },
      { id: 'f_scour', requires: 'frost_wolf', firstShownIn: 'wildwoods', hint: 'in plain sight of the boss door; visible gold chest' },
      { id: 'f_eyrie', requires: 'frost_wolf', firstShownIn: 'wildwoods', hint: 'the grant+30s payout; Pip frost_howto points at it' },
      { id: 'f2b_alcove', requires: 'earth_wolf', firstShownIn: 'stoneroot', hint: 'glittering cracks in the glacier nook' },
    ],
    restoration: {
      flag: 'restored',
      beats: ['the blizzard thins and the sky opens', 'Boreal\'s rime-light rests at the shrine',
        'frost gates already opened stay open', 'victory sting → den theme'],
      durationS: 8, skippable: false,
    },
    ripple: { room: 'f5', what: 'Luna hears the wind crying on the cliffs (luna_dream_4)' },
    scar: { room: 'f3', what: 'the frozen lake never thaws — it only ever goes quiet' },
    denArrival: 'polish list: Boreal\'s rime-light joining the den fire',
  },
  stormreach: {
    name: 'Stormreach Cliffs', built: true, spirit: 'Aria',
    grants: 'storm_wolf', grantAt: 'ssh (Aria\'s Spark, mid-climb)',
    threshold: 'f5 north — the cliff path down off the summit, once Boreal is calmed',
    rooms: ['s1a', 's1b', 's1p', 'sc1', 's2a', 's2b', 's2p', 'ssh', 'sc2',
      's3a', 's3b', 's3p', 'svn', 'sc3', 's4a', 's4b', 's4p', 'sc4', 'scr', 'ssA'],
    beats: {
      approach: 'f5 → s1a, down off the calmed summit onto the sea cliffs',
      lockVisible: 'the first gale lane is in s1b, in the first minute, with the way on plainly behind it',
      ki: 'ssh — the shrine grants the dash, and one short gale stands between it and the door',
      sho: 'sc2 — three lanes in a row, then one that runs ALONG the stair instead of across it',
      ten: 'svn THE VANES — the dash does not only carry Kael, it PUSHES: spin a vane and its lane turns with it',
      boss: 'scr Aria, the Galebound — a Gale Hound the size of the arena. Phase 1 is the charge they have read since region 1; phase 2 adds her gale, and the dash is the only way out of it',
      grant30s: 'a second lane in the shrine room itself, with a gold chest visible behind it',
      restoration: 'the gale drops off the crown; her light rests on the standing stones',
    },
    gates: [
      { id: 's_gale_stair', requires: 'storm_wolf', firstShownIn: 'stormreach', hint: 'the first lane, in s1b, with the path on behind it' },
      { id: 's_sail', requires: 'storm_wolf', firstShownIn: 'stormreach', hint: 'the great sail-gate at s4b — two lanes turned at once' },
      { id: 's1a_seacave', requires: 'tide_wolf', firstShownIn: 'stormreach', hint: 'gate_promise + visible chest in the flooded cave mouth' },
      { id: 's3b_crack', requires: 'earth_wolf', firstShownIn: 'stoneroot', hint: 'a tool they already own, rewarded in a region that is not its own' },
    ],
    restoration: {
      flag: 'restored',
      beats: ['the gale drops and the cliff goes quiet', 'Aria\'s light rests on the crown stones',
        'the sky opens over the whole climb', 'victory sting → den theme'],
      durationS: 8, skippable: false,
    },
    ripple: { room: 'scr', what: 'Luna hears the sea under the cliffs (luna_dream_5)' },
    scar: { room: 's3b', what: 'the lightning-struck mast on the Thunderhead is never re-raised' },
    denArrival: 'polish list: Aria\'s stormlight joining the den fire',
  },
  // THE VALE WAS A ONE-LINE STUB while the region itself was finished.
  //
  // Twenty rooms, a shrine, a puzzle room, a boss and a restoration — all built,
  // all walked clean by verify-playthrough — and this file still said
  // `built: false` with no room list and no beats, because the entry was written
  // before the region was and nobody came back to it. Anything that reads this
  // table to ask "what is in the game" — the credits, region-complete tracking,
  // the gate audit in checkRegions below — has been quietly leaving the Sunken
  // Vale out.
  sunkenvale: {
    name: 'Sunken Vale', built: true, spirit: 'Meri',
    grants: 'tide_wolf', grantAt: "dsh (Meri's Spring, the reed pocket)",
    threshold: 'scr north — down off the cliffs into the drowned valley, once Aria is calmed',
    rooms: ['d1a', 'd1b', 'd1p', 'dg1', 'd2a', 'd2b', 'd2p', 'dsh', 'dg2',
      'd3a', 'd3b', 'd3p', 'dtp', 'dg3', 'd4a', 'd4b', 'd4p', 'dg4', 'dlg', 'ddp'],
    beats: {
      approach: 'scr → d1a, out of the storm and down into still, deep water',
      lockVisible: 'the deep channel in d1b, in the first minute, with the chest on the islet beyond it',
      ki: 'dsh — the spring grants the Tide Wolf, and one deep channel lies across the way out',
      sho: 'dg2 and d3a — deeper water, and current that carries you off your line',
      ten: 'dtp THE TIDE POOLS — the pools rise and fall on a clock, so the floor you crossed is gone when you come back',
      boss: 'ddp Meri, the Drowned — a tide blob the size of the arena, the family fought all region, made enormous',
      grant30s: 'a second channel in the spring room itself, with a gold chest visible through it',
      restoration: 'the vale drains to a valley; her light rests on the drowned door',
    },
    gates: [
      { id: 'd_deep_channel', requires: 'tide_wolf', firstShownIn: 'sunkenvale', hint: 'the channel in d1b, with the islet chest plainly behind it' },
      { id: 'd_shrine', requires: 'tide_wolf', firstShownIn: 'sunkenvale', hint: 'across the way out of the spring room' },
      { id: 'd_lagoon', requires: 'tide_wolf', firstShownIn: 'sunkenvale', hint: 'the lagoon is THE ROAD, once you can walk it' },
      { id: 'ddp_out', requires: 'tide_wolf', firstShownIn: 'sunkenvale', hint: 'the way out of the deep, which opens when the vale drains' },
    ],
    restoration: {
      flag: 'restored',
      beats: ['the water falls and the valley comes back', "Meri's light rests on the drowned door",
        'the reeds green from the spring outward', 'victory sting → den theme'],
      durationS: 8, skippable: false,
    },
    ripple: { room: 'ddp', what: 'Luna hears the shadow above the water (luna_dream_6)' },
    scar: { room: 'd3b', what: 'the sunken house on the deep shelf is never raised' },
    denArrival: "polish list: Meri's tidelight joining the den fire",
  },
  shadowcourt: {
    name: 'The Shadow Court', built: true, spirit: 'Luna (and Grimm)', grants: 'moonlight',
    grantAt: "xsh (Luna's Light, the second room)",
    threshold: "ddp north — the way out of Meri's Deep, once the vale drains",
    rooms: ['x1', 'xsh', 'xh', 'xa1', 'xa2', 'xa3', 'xr1', 'xr2', 'xr3',
      'xg1', 'xg2', 'xg3', 'xm1', 'xm2', 'xm3', 'xp1', 'xp2', 'xst', 'xth'],
    beats: {
      approach: 'ddp → x1, out of the drowned vale and up to his house',
      lockVisible: 'a watcher in the first room, standing over a gold chest, unpassable and harmless',
      ki: "xsh — Luna's own light, and one watcher between it and the door",
      sho: 'xh THE GREAT HALL — two watchers pacing, four wing doors to reach past them',
      ten: 'xm2 THE STANDING MIRRORS — the mirrors are shadow, and shadow does not stop a ghost',
      boss: 'xth Shadow-Grimm — the Shadowgrip again, enormous, armoured against whatever hit him last',
      grant30s: 'the watcher in the shrine room itself, three steps from the light that opens it',
      restoration: 'he is FREED, not killed; the shadow goes and Grimm is left, old and tired and himself',
    },
    gates: [],
    restoration: {
      flag: 'restored',
      beats: ['the shadow lifts off the court', 'Grimm sits on his own seat again',
        "Luna's moonlight comes home", 'the Den is full', 'credits'],
      durationS: 27, skippable: false,
    },
    ripple: { room: 'den', what: 'every rescued soul is in the Den at once' },
    scar: { room: 'xth', what: 'the throne is never repaired — he does not want it' },
    denArrival: 'the ending itself: everyone, at once, by the fire',
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
