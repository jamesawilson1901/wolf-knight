# Wolf Knight — Voice Recording Script (v3.18)

Every spoken line in the game, grouped by character. Recorded lines will
replace the robot text-to-speech voice.

## How to record (keeps wiring easy later)

- **One audio file per line**, named exactly `<line id>.mp3` (or .ogg) —
  e.g. `moon_full.mp3`. The line id is the code above each line.
- Quiet room, phone or USB mic ~20 cm away, speak a touch slower than
  feels natural, leave ~0.3 s of silence at each end.
- Lines marked **(repeats)** play many times — keep those extra short and
  friendly so they never get annoying.
- It’s fine to do multiple takes in one file and trim later — but the
  final file should contain just the line.
- When you’re done, drop the files in a folder and send/commit them as
  `assets/voice/` — I’ll wire the game to prefer your recordings and fall
  back to the robot voice for anything missing.


## Pip — 72 lines

*Pip the fox — the kids’ cheerful guide. Bright, warm, encouraging, a little quick. He does nearly all the coaching.*


**Part A — story beats (fire once, in order along the critical path)**

- `intro_arrival`
  “This is Ember Hollow, Kael. The shadows crept in here… I feel it. Stay close.”
- `first_enemy`
  “Careful — a shadow! Tap to swing your sword.”
- `dark_nook`
  “It’s too dark to see in there. Hold the screen and become the Dark Wolf — you can see in the shadows.”
- `obstacle_first`
  “Burnt vines block the way. We’ll need fire for these. Let’s remember this spot.”
- `r2_enter`
  “Watch your step — lava ahead. Stay on the stone.”
- `moth_intro`
  “Shadow moths! Wait for them to dive, then move.”
- `geyser_intro`
  “Fire geysers! Cross when they rest. Watch the timing.”
- `hound_branch`
  “A shadow hound guards that way. Beat it for a pup — or skip it if you like.”
- `key_door`
  “Sealed by shadow! We need a key… I feel it east of here, past the broken bridges.”
- `key_found`
  “The Ember Key! The sealed door will open for us now!”
- `lava_cooled`
  “Feel that? With the shadow gone, the lava sleeps as black stone! New paths, Kael!”
- `kiln_enter`
  “The Kiln… the volcano’s own halls. Three doors, Kael — the mountain keeps its secrets locked.”
- `kiln_shrine`
  “A fire shrine! Cinder’s spark reaches out to you, Kael — take it!”
- `brazier_hint`
  “A cold brazier! Your fiery slam can light it. Try it!”
- `kiln_order`
  “Look — these braziers wear little rings. One, two, three… light them in that order!”
- `gate_promise` *(repeats)*
  “We can’t open this yet… but let’s remember it. We WILL come back.”
- `boss_door`
  “The spirit is near… but something’s wrong. Be ready, Kael.”
- `boss_intro`
  “There! The fire spirit — a shadow has it in its grip! Free it!”
- `boss_duel`
  “It’s just a wolf — a BIG one! It fights like the little ones: dodge its charge, shield its swipes!”
- `boss_charge_tell`
  “It’s crouching — a charge is coming! Get out of the way!”
- `boss_swipe_tell`
  “It’s rearing up — shield UP, Kael! A perfect block will stagger it!”
- `boss_bloodmoon`
  “The moon is full! Unleash your Blood Moon and tear into it!”
- `firewolf_howto`
  “You can be the Fire Wolf now! Hold the screen to change. Try the ground-slam!”
- `burn_prompt`
  “Now we can clear those burnt vines! Be the Fire Wolf and slam them.”
- `all_pups`
  “You found them all! The pups are safe now. Your heart grows stronger.”
- `region_complete`
  “Ember Hollow is free, Kael. The light is coming back. Let’s go on.”
- `den_intro`
  “The Moonlit Den! Luna keeps it safe. The pups we rescue will live here.”
- `darkwolf_intro`
  “Remember Luna’s gift, Kael! Tap the wolf badge and become the Dark Wolf — the moon fights beside you!”
- `guide_run` *(repeats)*
  “This way, Kael! Follow my glowing trail!”
- `restoration_1`
  “Look, Kael! The Hollow remembers the sun — everything is waking up!”
- `restoration_2`
  “The ash is turning green. You did this, Kael.”
- `cinder_den`
  “Cinder’s ember came to live by our fire! The Den feels warmer already.”
- `scar_r1`
  “This one patch won’t heal… so we remember. That’s okay.”
- `ripple_shoot`
  “A green shoot — all the way down here! Ember Hollow’s light is spreading.”
- `shop_intro`
  “That’s Maren the trader. Smash pots and beat shadows for shards, then buy something shiny!”
- `moonstone_intro`
  “Luna’s moonstone! Touch it and it will carry us to any land we’ve freed.”

**Teaching lines — each one reveals its button when it first fires**

- `learn_thrust`
  “Nice hit! Tap again right after a swing to POKE — the thrust reaches farther!”
- `learn_shield`
  “Take your shield! Hold it to block. Raise it JUST as they strike to knock them silly!”
- `learn_bolt`
  “Try your throwing spark! Tap the sparkle to zap flying shadows.”
- `learn_jump`
  “You can jump! Tap the arrow — and tap again in the air to jump higher. Jump over danger!”
- `parry_praise`
  “Perfect block! Hit them now while they’re dizzy!”

**Part B — contextual (repeatable)**

- `checkpoint` *(repeats)*
  “We can rest here. You’re safe.”
- `pup_found` *(repeats)*
  “A lost wolf pup! You found one. Good eyes, Kael.”
- `enemy_group` *(repeats)*
  “Lots of shadows! The moon is full — let the Blood Moon loose!”
- `moon_full`
  “The moon is FULL, Kael! Tap the glowing moon and Luna herself will crash down on your enemies!”
- `element_teach`
  “GOLD sparks — that one FEARS this attack! Every creature fears something. Try all your forms and find it!”
- `boss_tired`
  “It FELL! Now, Kael — strike with everything you have!”
- `shield_foe`
  “A shield-bearer! Blows just bounce off its front. Wait for its swing — or slip around BEHIND it!”
- `low_hearts` *(repeats)*
  “Careful, Kael… let’s find somewhere safe.”
- `respawn` *(repeats)*
  “It’s okay. Let’s try again — together.”
- `form_locked` *(repeats)*
  “We can’t be the Fire Wolf yet. First we free the fire spirit.”

**Stoneroot Caverns (region 2)**

- `stone_enter`
  “The Stoneroot Caverns… the stone here used to sing. Careful, Kael — something rattles in the dark.”
- `skeleton_intro`
  “Bones! They wake when you come close. Let them rise, then strike!”
- `rogue_intro`
  “That one’s quick! Watch for the crouch — then block, or jump away!”
- `spike_hint`
  “Floor spikes! They peek up before they bite. Cross while they rest — or jump right over.”
- `boulder_hint`
  “A round boulder! Lean on a side and it rolls one step. Roll it onto the glowing gold circle on the floor!”
- `plate_open`
  “You did it! The gate remembers the weight. Onward!”
- `warden_door`
  “Something big rattles beyond this door… ready your shield, Kael.”
- `warden_block`
  “His big shield blocks the front! Circle behind him — or parry that chop!”
- `earthwolf_howto`
  “You can be the Earth Wolf now! Hold the screen to change. Your stomp can smash cracked rock!”
- `crack_prompt`
  “See those cracked rocks? Be the Earth Wolf and stomp them to bits!”
- `all_pups_stone`
  “Six pups safe and sound! The whole den will be full of happy howls. Your heart grows stronger!”
- `stone_complete`
  “The caverns hum with life again. Two lights found, Kael… five to go.”

**Den villagers (v3.12: the den grows faces as regions heal)**

- `den_dog`
  “That’s Biscuit! She guards the den. Well… mostly she guards her dinner.”
- `stone_restore_1`
  “Kael, look! The caverns are lighting up — the stone remembers how to sing!”
- `stone_restore_2`
  “Glow-moss everywhere! You woke the mountain up.”
- `scar_e2`
  “This crack won’t close… so the mountain remembers. That’s okay.”
- `ripple_vine`
  “A green vine — growing through solid stone! The Wild Woods are calling us.”
- `petra_den`
  “Petra’s stone-heart hums by our fire now. Two spirits home!”
- `darkcave_enter`
  “The Hidden Hollow… it’s pitch dark in here. Become the Dark Wolf and let your eyes shine!”
- `quarry_enter`
  “The Old Quarry! Bones everywhere… they’re waiting for us. Clear them out and the treasure gate will open!”
- `quarry_clear`
  “You cleared the quarry! Hear that? The treasure gate is open!”

## Cinder — 2 lines

*Cinder — the fire spirit freed from the first boss. Warm, gentle, grateful. Slow and glowing.*


**Part A — story beats (fire once, in order along the critical path)**

- `boss_defeat`
  “You broke the shadow’s hold, kind knight. I am Cinder, keeper of the flame.”
- `firewolf_grant`
  “Take this gift — the heart of the Fire Wolf.”

## Luna — 2 lines

*Luna — the moon spirit. Calm, kind, a lullaby voice.*


**Part C — bridge to the next region**

- `luna_dream_1`
  “You did well, Kael. One light returned… six to go. Follow the path to the stone caves. I am with you, always.”

**Den villagers (v3.12: the den grows faces as regions heal)**

- `luna_dream_2`
  “Rest now, brave one. The stone sings again. Beyond the caverns, the wild woods are waiting for us.”

## Petra — 2 lines

*Petra — the stone spirit. Steady, deep-ish, motherly; like a mountain talking softly.*


**Stoneroot Caverns (region 2)**

- `warden_defeat`
  “The bones fall still… Thank you, kind knight. I am Petra, keeper of the stone.”
- `earthwolf_grant`
  “Take my gift — the heart of the Earth Wolf. The mountain walks with you now.”

## Grimm — 2 lines

*Grimm — the shadow villain. Low, slow, theatrical menace (scary-fun, never terrifying).*


**Part C — bridge to the next region**

- `grimm_taunt_1`
  “So… the little knight saved one spark. You cannot save them all. The shadow always returns.”

**Stoneroot Caverns (region 2)**

- `warden_intro`
  “My warden of bone guards the stone spirit, little knight. It will grind you to dust.”

## Old Bram — 3 lines

*Old Bram — a gruff old miner with a big heart. Gravelly, jolly.*


**Stoneroot Caverns (region 2)**

- `camp_rumour`
  “Old Bram, at your service. The stone used to SING, knight… now something rattles down in the Deep Hall. Rest by my fire, then go careful.”

**Den villagers (v3.12: the den grows faces as regions heal)**

- `bram_den`
  “Ha! Thought I’d see this famous fire of yours. The caverns sing so sweet now, my pick near swings itself. You’ve a fine den, knight.”
- `camp_healed`
  “You hear it? The singing is BACK. My old pick and I can work again. Bless you, little knight!”

## Wren — 2 lines

*Wren — a well-travelled wanderer. Light, sly, storyteller energy.*


**Den villagers (v3.12: the den grows faces as regions heal)**

- `wren_intro`
  “A knight who turns into wolves… I walk every road, and I’ve never seen THAT. Call me Wren. I hear things — come find me when you want a rumour.”
- `wren_rumour` *(repeats)*
  “A rumour, then: past the caverns the trees grow WRONG — the wild woods have gone thorny and strange. Somebody should look into that…”

## Rook — 2 lines

*Rook — a ranger. Even, watchful, reassuring.*


**Den villagers (v3.12: the den grows faces as regions heal)**

- `rook_intro`
  “So you’re the one who freed the Hollow! Rook, ranger of the old roads. I watched the smoke stop from this very hill. I’ll keep watch while you wander.”
- `rook_chat` *(repeats)*
  “The horizon’s quiet today. Quiet is GOOD, little knight.”

---

**Total: 87 lines.** Pip is the big role — record him first; every other character is a handful of lines.
