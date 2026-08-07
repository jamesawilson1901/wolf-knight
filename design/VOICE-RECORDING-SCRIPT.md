# Wolf Knight — Voice Recording Script (v3.21)

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


## Pip — 102 lines

*Pip the fox — the kids’ cheerful guide. Bright, warm, encouraging, a little quick. He does nearly all the coaching.*

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
- `wildwoods_open`
  “The vine grew into a doorway! The Wild Woods are open, Kael — the trees are calling us.”
- `wild_enter`
  “The Wild Woods… the trees here grew WRONG. Thorns everywhere. Something has the forest by the roots.”
- `thornhound_intro`
  “A thorn hound! The brambles are wearing the animals like coats… FIRE burns thorns, Kael!”
- `lantern_hint`
  “Cold wisp-lanterns! Light ALL THREE and the thorn gate will wither. Your fiery slam should wake them!”
- `lantern_rock`
  “This lantern is walled in cracked stone… Stone first, THEN fire. Stomp it open as the Earth Wolf!”
- `lantern_open`
  “All three burning! Hear the thorns creak — the way north is open!”
- `plates2_hint`
  “TWO boulders, TWO floor circles — one for each side of the hedge. Line each boulder up with its gap first!”
- `plates2_open`
  “Both circles hold their weight! The rootbound door remembers. Onward!”
- `wild_boss_door`
  “Beyond here… I hear a wolf crying, Kael. A BIG one. Something has her tangled tight. Be brave.”
- `verdant_howto`
  “You can be the Verdant Wolf now! Hold the screen to change. Your vine-lash CUTS thorn tangles — try that one right there!”
- `wild_restore_1`
  “Look! The thorns are melting away — the woods remember how to be green!”
- `wild_complete`
  “The Wild Woods breathe again. Three lights found, Kael… four to go.”
- `all_pups_wild`
  “NINE pups safe! The den is bursting with happy howls. Your heart grows stronger!”
- `frostpeak_open`
  “The trees stop up there, Kael. That white line above them? That’s Frostpeak. Wrap up warm — well, you’ve got fur.”
- `frost_enter`
  “Frostpeak! Brrr. Everything up here is frozen SOLID… and I don’t think it froze on its own.”
- `rimehound_intro`
  “A rime hound! Ice for a coat — and ice HATES fire. You know exactly which wolf to be.”
- `icebrazier_hint`
  “Three fire bowls, all sealed in ice! BREATHE fire to melt the ice, then SLAM to light the bowl. Melt, then light!”
- `icebrazier_thaw`
  “Quick, Kael — melted ice freezes back over if you leave the bowl unlit. Finish what you start!”
- `icebrazier_open`
  “All three burning! The frost gate cracks apart. Well done!”
- `slide_hint`
  “Careful — the lake is SLIPPERY. Push a boulder and it slides until something stops it. Bump it sideways into a rock FIRST, then send it north!”
- `slide_open`
  “Both circles held! You planned that, Kael. That was proper clever.”
- `frost_boss_door`
  “Something huge is circling up there. Wings, Kael. Great big frozen wings. Keep your feet moving.”
- `boreal_duel`
  “She’s too high to bite! THROW at her — flying things take the worst of it. Then run when she lines up!”
- `boreal_dive_tell`
  “The red stripe! That’s where she’s coming down — get OUT of it!”
- `boreal_grounded`
  “She’s crashed! Gold ring — that’s your moment. HIT HER!”
- `frost_howto`
  “You can be the Frost Wolf now! Hold the screen to change. Your frost breath SHATTERS ice — there’s a block right over there, go on!”
- `shatter_prompt`
  “Ice! Be the Frost Wolf and breathe on it — it’ll shatter like a window.”
- `frost_restore_1`
  “The storm is lifting! Look — you can see the whole world from up here.”
- `frost_complete`
  “Frostpeak is still and safe. Four lights found, Kael… three to go.”
- `all_pups_frost`
  “TWELVE pups home! Luna will never get them all to sleep. Your heart grows stronger!”

## Luna — 4 lines

*Luna — the great white wolf, Kael’s mother-figure. Calm, slow, dreamlike; she speaks in his sleep.*

- `luna_dream_1`
  “You did well, Kael. One light returned… six to go. Follow the path to the stone caves. I am with you, always.”
- `luna_dream_2`
  “Rest now, brave one. The stone sings again. Beyond the caverns, the wild woods are waiting for us.”
- `luna_dream_3`
  “Three lights burn beside you now, brave one. Rest. Far to the north, the frost peaks glitter… and wait.”
- `luna_dream_4`
  “Four lights, brave one. The frost has forgiven you. Now listen for water — something calls beneath the waves.”

## Grimm — 4 lines

*Grimm — the villain. Low, unhurried, amused. Never shouty; the menace is in how relaxed he is.*

- `grimm_taunt_1`
  “So… the little knight saved one spark. You cannot save them all. The shadow always returns.”
- `warden_intro`
  “My warden of bone guards the stone spirit, little knight. It will grind you to dust.”
- `sylva_intro`
  “Behold the forest’s precious guardian, little knight — wrapped in my thorns, wild with pain. She will tear you apart for me.”
- `boreal_intro`
  “The sky-serpent of the peak, little knight. My frost sits deep in her bones. She will not even see you fall.”

## Cinder — 2 lines

*Cinder — the fire spirit of Ember Hollow. Crackly, grateful, warm.*

- `boss_defeat`
  “You broke the shadow’s hold, kind knight. I am Cinder, keeper of the flame.”
- `firewolf_grant`
  “Take this gift — the heart of the Fire Wolf.”

## Petra — 2 lines

*Petra — the stone spirit of Stoneroot. Deep, slow, patient as rock.*

- `warden_defeat`
  “The bones fall still… Thank you, kind knight. I am Petra, keeper of the stone.”
- `earthwolf_grant`
  “Take my gift — the heart of the Earth Wolf. The mountain walks with you now.”

## Sylva — 2 lines

*Sylva — the forest spirit of the Wild Woods. Green and gentle, a little wild.*

- `sylva_defeat`
  “The thorns… are gone. You fought me to free me, little knight. I am Sylva, keeper of the green.”
- `verdant_grant`
  “Run with my gift — the heart of the Verdant Wolf. The forest runs with you now.”

## Boreal — 2 lines

*Boreal — the sky-serpent of Frostpeak. Vast, slow, wintry; a long-held cold that finally lets go.*

- `boreal_defeat`
  “The cold… lets go of me. I am Boreal, who was the storm. You struck me kindly, little knight.”
- `frost_grant`
  “Take the winter in my heart — the Frost Wolf. Breathe, and even stone must let you pass.”

## Bram — 3 lines

*Old Bram — a prospector at the Stoneroot camp. Gruff, kindly, weather-beaten.*

- `camp_rumour`
  “Old Bram, at your service. The stone used to SING, knight… now something rattles down in the Deep Hall. Rest by my fire, then go careful.”
- `bram_den`
  “Ha! Thought I’d see this famous fire of yours. The caverns sing so sweet now, my pick near swings itself. You’ve a fine den, knight.”
- `camp_healed`
  “You hear it? The singing is BACK. My old pick and I can work again. Bless you, little knight!”

## Wren — 2 lines

*Wren — a traveller full of rumours. Quick, curious, gossipy.*

- `wren_intro`
  “A knight who turns into wolves… I walk every road, and I’ve never seen THAT. Call me Wren. I hear things — come find me when you want a rumour.”
- `wren_rumour` *(repeats)*
  “A rumour, then: past the caverns the trees grow WRONG — the wild woods have gone thorny and strange. Somebody should look into that…”

## Rook — 2 lines

*Rook — a ranger. Even, watchful, reassuring.*

- `rook_intro`
  “So you’re the one who freed the Hollow! Rook, ranger of the old roads. I watched the smoke stop from this very hill. I’ll keep watch while you wander.”
- `rook_chat` *(repeats)*
  “The horizon’s quiet today. Quiet is GOOD, little knight.”

---

**Total: 125 lines.** Pip is the big role — record him first; every other character is a handful of lines.
