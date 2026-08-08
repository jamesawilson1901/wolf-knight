// Narration — design/NARRATION-SCRIPT.md verbatim, stored as data. Web Speech
// API with per-character rate/pitch; captions bar (default ON); music ducks
// while a line speaks. Story lines fire ONCE per save; Part B contextual
// lines can repeat (with gentle throttles handled by the callers).

import { state } from './state.js';
import { audio } from './audio.js';

const VOICES = {
  pip: { rate: 1.0, pitch: 1.3, label: 'Pip' },
  cinder: { rate: 0.85, pitch: 0.8, label: 'Cinder' },
  grimm: { rate: 0.85, pitch: 0.6, label: 'Grimm' },
  luna: { rate: 0.9, pitch: 1.1, label: 'Luna' },
  petra: { rate: 0.82, pitch: 0.95, label: 'Petra' },
  bram: { rate: 0.85, pitch: 0.7, label: 'Old Bram' },
  wren: { rate: 0.95, pitch: 1.05, label: 'Wren' },
  rook: { rate: 0.9, pitch: 0.9, label: 'Rook' },
  sylva: { rate: 0.92, pitch: 1.15, label: 'Sylva' },
  boreal: { rate: 0.8, pitch: 0.75, label: 'Boreal' }, // slow, vast, wintry
};

export const LINES = {
  // Part A — story beats (fire once, in order along the critical path)
  intro_arrival: { voice: 'pip', text: 'This is Ember Hollow, Kael. The shadows crept in here… I feel it. Stay close.' },
  first_enemy: { voice: 'pip', text: 'Careful — a shadow! Tap to swing your sword.' },
  dark_nook: { voice: 'pip', text: 'It’s too dark to see in there. Hold the screen and become the Dark Wolf — you can see in the shadows.' },
  obstacle_first: { voice: 'pip', text: 'Burnt vines block the way. We’ll need fire for these. Let’s remember this spot.' },
  r2_enter: { voice: 'pip', text: 'Watch your step — lava ahead. Stay on the stone.' },
  moth_intro: { voice: 'pip', text: 'Shadow moths! Wait for them to dive, then move.' },
  geyser_intro: { voice: 'pip', text: 'Fire geysers! Cross when they rest. Watch the timing.' },
  hound_branch: { voice: 'pip', text: 'A shadow hound guards that way. Beat it for a pup — or skip it if you like.' },
  key_door: { voice: 'pip', text: 'Sealed by shadow! We need a key… I feel it east of here, past the broken bridges.' },
  key_found: { voice: 'pip', text: 'The Ember Key! The sealed door will open for us now!' },
  lava_cooled: { voice: 'pip', text: 'Feel that? With the shadow gone, the lava sleeps as black stone! New paths, Kael!' },
  kiln_enter: { voice: 'pip', text: 'The Kiln… the volcano’s own halls. Three doors, Kael — the mountain keeps its secrets locked.' },
  kiln_shrine: { voice: 'pip', text: 'A fire shrine! Cinder’s spark reaches out to you, Kael — take it!' },
  brazier_hint: { voice: 'pip', text: 'A cold brazier! Your fiery slam can light it. Try it!' },
  kiln_order: { voice: 'pip', text: 'Look — these braziers wear little rings. One, two, three… light them in that order!' },
  gate_promise: { voice: 'pip', text: 'We can’t open this yet… but let’s remember it. We WILL come back.', repeat: true },
  boss_door: { voice: 'pip', text: 'The spirit is near… but something’s wrong. Be ready, Kael.' },
  boss_intro: { voice: 'pip', text: 'There! The fire spirit — a shadow has it in its grip! Free it!' },
  boss_duel: { voice: 'pip', text: 'It’s just a wolf — a BIG one! It fights like the little ones: dodge its charge, shield its swipes!' },
  boss_charge_tell: { voice: 'pip', text: 'It’s crouching — a charge is coming! Get out of the way!' },
  boss_swipe_tell: { voice: 'pip', text: 'It’s rearing up — shield UP, Kael! A perfect block will stagger it!' },
  boss_bloodmoon: { voice: 'pip', text: 'The moon is full! Unleash your Blood Moon and tear into it!' },
  boss_defeat: { voice: 'cinder', text: 'You broke the shadow’s hold, kind knight. I am Cinder, keeper of the flame.' },
  firewolf_grant: { voice: 'cinder', text: 'Take this gift — the heart of the Fire Wolf.' },
  firewolf_howto: { voice: 'pip', text: 'You can be the Fire Wolf now! Hold the screen to change. Try the ground-slam!' },
  burn_prompt: { voice: 'pip', text: 'Now we can clear those burnt vines! Be the Fire Wolf and slam them.' },
  all_pups: { voice: 'pip', text: 'You found them all! The pups are safe now. Your heart grows stronger.' },
  region_complete: { voice: 'pip', text: 'Ember Hollow is free, Kael. The light is coming back. Let’s go on.' },

  den_intro: { voice: 'pip', text: 'The Moonlit Den! Luna keeps it safe. The pups we rescue will live here.' },
  darkwolf_intro: { voice: 'pip', text: 'Remember Luna’s gift, Kael! Tap the wolf badge and become the Dark Wolf — the moon fights beside you!' },
  guide_run: { voice: 'pip', text: 'This way, Kael! Follow my glowing trail!', repeat: true },
  restoration_1: { voice: 'pip', text: 'Look, Kael! The Hollow remembers the sun — everything is waking up!' },
  restoration_2: { voice: 'pip', text: 'The ash is turning green. You did this, Kael.' },
  cinder_den: { voice: 'pip', text: 'Cinder’s ember came to live by our fire! The Den feels warmer already.' },
  scar_r1: { voice: 'pip', text: 'This one patch won’t heal… so we remember. That’s okay.' },
  ripple_shoot: { voice: 'pip', text: 'A green shoot — all the way down here! Ember Hollow’s light is spreading.' },
  shop_intro: { voice: 'pip', text: 'That’s Maren the trader. Smash pots and beat shadows for shards, then buy something shiny!' },
  moonstone_intro: { voice: 'pip', text: 'Luna’s moonstone! Touch it and it will carry us to any land we’ve freed.' },

  // Teaching lines — each one reveals its button when it first fires
  learn_thrust: { voice: 'pip', text: 'Nice hit! Tap again right after a swing to POKE — the thrust reaches farther!' },
  learn_shield: { voice: 'pip', text: 'Take your shield! Hold it to block. Raise it JUST as they strike to knock them silly!' },
  learn_bolt: { voice: 'pip', text: 'Try your throwing spark! Tap the sparkle to zap flying shadows.' },
  learn_jump: { voice: 'pip', text: 'You can jump! Tap the arrow — and tap again in the air to jump higher. Jump over danger!' },
  parry_praise: { voice: 'pip', text: 'Perfect block! Hit them now while they’re dizzy!' },

  // Part B — contextual (repeatable)
  checkpoint: { voice: 'pip', text: 'We can rest here. You’re safe.', repeat: true },
  pup_found: { voice: 'pip', text: 'A lost wolf pup! You found one. Good eyes, Kael.', repeat: true },
  enemy_group: { voice: 'pip', text: 'Lots of shadows! The moon is full — let the Blood Moon loose!', repeat: true },
  moon_full: { voice: 'pip', text: 'The moon is FULL, Kael! Tap the glowing moon and Luna herself will crash down on your enemies!' },
  element_teach: { voice: 'pip', text: 'GOLD sparks — that one FEARS this attack! Every creature fears something. Try all your forms and find it!' },
  boss_tired: { voice: 'pip', text: 'It FELL! Now, Kael — strike with everything you have!' },
  shield_foe: { voice: 'pip', text: 'A shield-bearer! Blows just bounce off its front. Wait for its swing — or slip around BEHIND it!' },
  low_hearts: { voice: 'pip', text: 'Careful, Kael… let’s find somewhere safe.', repeat: true },
  respawn: { voice: 'pip', text: 'It’s okay. Let’s try again — together.', repeat: true },
  form_locked: { voice: 'pip', text: 'We can’t be the Fire Wolf yet. First we free the fire spirit.', repeat: true },

  // Part C — bridge to the next region
  grimm_taunt_1: { voice: 'grimm', text: 'So… the little knight saved one spark. You cannot save them all. The shadow always returns.' },
  luna_dream_1: { voice: 'luna', text: 'You did well, Kael. One light returned… six to go. Follow the path to the stone caves. I am with you, always.' },

  // Stoneroot Caverns (region 2)
  stone_enter: { voice: 'pip', text: 'The Stoneroot Caverns… the stone here used to sing. Careful, Kael — something rattles in the dark.' },
  skeleton_intro: { voice: 'pip', text: 'Bones! They wake when you come close. Let them rise, then strike!' },
  rogue_intro: { voice: 'pip', text: 'That one’s quick! Watch for the crouch — then block, or jump away!' },
  spike_hint: { voice: 'pip', text: 'Floor spikes! They peek up before they bite. Cross while they rest — or jump right over.' },
  boulder_hint: { voice: 'pip', text: 'A round boulder! Lean on a side and it rolls one step. Roll it onto the glowing gold circle on the floor!' },
  plate_open: { voice: 'pip', text: 'You did it! The gate remembers the weight. Onward!' },
  warden_door: { voice: 'pip', text: 'Something big rattles beyond this door… ready your shield, Kael.' },
  warden_intro: { voice: 'grimm', text: 'My warden of bone guards the stone spirit, little knight. It will grind you to dust.' },
  warden_block: { voice: 'pip', text: 'His big shield blocks the front! Circle behind him — or parry that chop!' },
  warden_defeat: { voice: 'petra', text: 'The bones fall still… Thank you, kind knight. I am Petra, keeper of the stone.' },
  earthwolf_grant: { voice: 'petra', text: 'Take my gift — the heart of the Earth Wolf. The mountain walks with you now.' },
  earthwolf_howto: { voice: 'pip', text: 'You can be the Earth Wolf now! Hold the screen to change. Your stomp can smash cracked rock!' },
  crack_prompt: { voice: 'pip', text: 'See those cracked rocks? Be the Earth Wolf and stomp them to bits!' },
  // LEVEL 2 — the twist. Say the IDEA, never the button: "listen" is the clue.
  rattle_hint: { voice: 'pip', text: 'Ooh — stand right on the round stone and STOMP. Then listen!' },
  // LEVEL 3, the vine-lash teach. Say the IDEA, never the button.
  bramble_teach: { voice: 'pip', text: 'Thorns in the way! Be the Verdant Wolf and LASH them — they snap right open.' },
  bramble_regrow: { voice: 'pip', text: 'Careful — these ones grow back! Cut and RUN, Kael.' },
  log_rope: { voice: 'pip', text: 'That big log is tied up. Lash the rope and see what happens!' },
  vault_changed: { voice: 'pip', text: 'Kael, look! The big room is different. It changed because of YOU.' },
  all_pups_stone: { voice: 'pip', text: 'Six pups safe and sound! The whole den will be full of happy howls. Your heart grows stronger!' },
  stone_complete: { voice: 'pip', text: 'The caverns hum with life again. Two lights found, Kael… five to go.' },
  camp_rumour: { voice: 'bram', text: 'Old Bram, at your service. The stone used to SING, knight… now something rattles down in the Deep Hall. Rest by my fire, then go careful.' },
  // Den villagers (v3.12: the den grows faces as regions heal)
  wren_intro: { voice: 'wren', text: 'A knight who turns into wolves… I walk every road, and I’ve never seen THAT. Call me Wren. I hear things — come find me when you want a rumour.' },
  wren_rumour: { voice: 'wren', text: 'A rumour, then: past the caverns the trees grow WRONG — the wild woods have gone thorny and strange. Somebody should look into that…', repeat: true },
  rook_intro: { voice: 'rook', text: 'So you’re the one who freed the Hollow! Rook, ranger of the old roads. I watched the smoke stop from this very hill. I’ll keep watch while you wander.' },
  rook_chat: { voice: 'rook', text: 'The horizon’s quiet today. Quiet is GOOD, little knight.', repeat: true },
  bram_den: { voice: 'bram', text: 'Ha! Thought I’d see this famous fire of yours. The caverns sing so sweet now, my pick near swings itself. You’ve a fine den, knight.' },
  den_dog: { voice: 'pip', text: 'That’s Biscuit! She guards the den. Well… mostly she guards her dinner.' },
  camp_healed: { voice: 'bram', text: 'You hear it? The singing is BACK. My old pick and I can work again. Bless you, little knight!' },
  stone_restore_1: { voice: 'pip', text: 'Kael, look! The caverns are lighting up — the stone remembers how to sing!' },
  stone_restore_2: { voice: 'pip', text: 'Glow-moss everywhere! You woke the mountain up.' },
  scar_e2: { voice: 'pip', text: 'This crack won’t close… so the mountain remembers. That’s okay.' },
  ripple_vine: { voice: 'pip', text: 'A green vine — growing through solid stone! The Wild Woods are calling us.' },
  petra_den: { voice: 'pip', text: 'Petra’s stone-heart hums by our fire now. Two spirits home!' },
  darkcave_enter: { voice: 'pip', text: 'The Hidden Hollow… it’s pitch dark in here. Become the Dark Wolf and let your eyes shine!' },
  quarry_enter: { voice: 'pip', text: 'The Old Quarry! Bones everywhere… they’re waiting for us. Clear them out and the treasure gate will open!' },
  quarry_clear: { voice: 'pip', text: 'You cleared the quarry! Hear that? The treasure gate is open!' },
  luna_dream_2: { voice: 'luna', text: 'Rest now, brave one. The stone sings again. Beyond the caverns, the wild woods are waiting for us.' },

  // The Wild Woods (region 3)
  wildwoods_open: { voice: 'pip', text: 'The vine grew into a doorway! The Wild Woods are open, Kael — the trees are calling us.' },
  wild_enter: { voice: 'pip', text: 'The Wild Woods… the trees here grew WRONG. Thorns everywhere. Something has the forest by the roots.' },
  thornhound_intro: { voice: 'pip', text: 'A thorn hound! The brambles are wearing the animals like coats… FIRE burns thorns, Kael!' },
  lantern_hint: { voice: 'pip', text: 'Cold wisp-lanterns! Light ALL THREE and the thorn gate will wither. Your fiery slam should wake them!' },
  lantern_rock: { voice: 'pip', text: 'This lantern is walled in cracked stone… Stone first, THEN fire. Stomp it open as the Earth Wolf!' },
  lantern_open: { voice: 'pip', text: 'All three burning! Hear the thorns creak — the way north is open!' },
  plates2_hint: { voice: 'pip', text: 'TWO boulders, TWO floor circles — one for each side of the hedge. Line each boulder up with its gap first!' },
  plates2_open: { voice: 'pip', text: 'Both circles hold their weight! The rootbound door remembers. Onward!' },
  wild_boss_door: { voice: 'pip', text: 'Beyond here… I hear a wolf crying, Kael. A BIG one. Something has her tangled tight. Be brave.' },
  sylva_intro: { voice: 'grimm', text: 'Behold the forest’s precious guardian, little knight — wrapped in my thorns, wild with pain. She will tear you apart for me.' },
  sylva_defeat: { voice: 'sylva', text: 'The thorns… are gone. You fought me to free me, little knight. I am Sylva, keeper of the green.' },
  verdant_grant: { voice: 'sylva', text: 'Run with my gift — the heart of the Verdant Wolf. The forest runs with you now.' },
  verdant_howto: { voice: 'pip', text: 'You can be the Verdant Wolf now! Hold the screen to change. Your vine-lash CUTS thorn tangles — try that one right there!' },
  wild_restore_1: { voice: 'pip', text: 'Look! The thorns are melting away — the woods remember how to be green!' },
  wild_complete: { voice: 'pip', text: 'The Wild Woods breathe again. Three lights found, Kael… four to go.' },
  all_pups_wild: { voice: 'pip', text: 'NINE pups safe! The den is bursting with happy howls. Your heart grows stronger!' },
  luna_dream_3: { voice: 'luna', text: 'Three lights burn beside you now, brave one. Rest. Far to the north, the frost peaks glitter… and wait.' },

  // --- FROSTPEAK (region 4, v3.21)
  frostpeak_open: { voice: 'pip', text: 'The trees stop up there, Kael. That white line above them? That’s Frostpeak. Wrap up warm — well, you’ve got fur.' },
  frost_enter: { voice: 'pip', text: 'Frostpeak! Brrr. Everything up here is frozen SOLID… and I don’t think it froze on its own.' },
  rimehound_intro: { voice: 'pip', text: 'A rime hound! Ice for a coat — and ice HATES fire. You know exactly which wolf to be.' },
  icebrazier_hint: { voice: 'pip', text: 'Three fire bowls, all sealed in ice! BREATHE fire to melt the ice, then SLAM to light the bowl. Melt, then light!' },
  icebrazier_thaw: { voice: 'pip', text: 'Quick, Kael — melted ice freezes back over if you leave the bowl unlit. Finish what you start!' },
  icebrazier_open: { voice: 'pip', text: 'All three burning! The frost gate cracks apart. Well done!' },
  slide_hint: { voice: 'pip', text: 'Careful — the lake is SLIPPERY. Push a boulder and it slides until something stops it. Bump it sideways into a rock FIRST, then send it north!' },
  slide_open: { voice: 'pip', text: 'Both circles held! You planned that, Kael. That was proper clever.' },
  frost_boss_door: { voice: 'pip', text: 'Something huge is circling up there. Wings, Kael. Great big frozen wings. Keep your feet moving.' },
  boreal_intro: { voice: 'grimm', text: 'The sky-serpent of the peak, little knight. My frost sits deep in her bones. She will not even see you fall.' },
  boreal_duel: { voice: 'pip', text: 'She’s too high to bite! THROW at her — flying things take the worst of it. Then run when she lines up!' },
  boreal_dive_tell: { voice: 'pip', text: 'The red stripe! That’s where she’s coming down — get OUT of it!' },
  boreal_grounded: { voice: 'pip', text: 'She’s crashed! Gold ring — that’s your moment. HIT HER!' },
  boreal_defeat: { voice: 'boreal', text: 'The cold… lets go of me. I am Boreal, who was the storm. You struck me kindly, little knight.' },
  frost_grant: { voice: 'boreal', text: 'Take the winter in my heart — the Frost Wolf. Breathe, and even stone must let you pass.' },
  frost_howto: { voice: 'pip', text: 'You can be the Frost Wolf now! Hold the screen to change. Your frost breath SHATTERS ice — there’s a block right over there, go on!' },
  shatter_prompt: { voice: 'pip', text: 'Ice! Be the Frost Wolf and breathe on it — it’ll shatter like a window.' },
  frost_restore_1: { voice: 'pip', text: 'The storm is lifting! Look — you can see the whole world from up here.' },
  frost_complete: { voice: 'pip', text: 'Frostpeak is still and safe. Four lights found, Kael… three to go.' },
  all_pups_frost: { voice: 'pip', text: 'TWELVE pups home! Luna will never get them all to sleep. Your heart grows stronger!' },
  luna_dream_4: { voice: 'luna', text: 'Four lights, brave one. The frost has forgiven you. Now listen for water — something calls beneath the waves.' },
};

export class Narration {
  constructor() {
    this.captionEl = document.getElementById('caption');
    this.queue = [];
    this.speaking = false;
    this._pauseLine = false;
    this._done = null;
    // tap the caption bubble to skip the line
    this.captionEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.skip();
    });
    if (!state.spoken) state.spoken = {};
    this._voice = null;
    if ('speechSynthesis' in window) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this._voice =
          vs.find((v) => v.lang && v.lang.startsWith('en') && v.localService) ||
          vs.find((v) => v.lang && v.lang.startsWith('en')) || vs[0] || null;
      };
      pick();
      speechSynthesis.addEventListener('voiceschanged', pick);
    }
  }

  // Speak line `id`. Story lines fire once per save; `repeat` lines always.
  say(id, { force = false } = {}) {
    const line = LINES[id];
    if (!line) return false;
    if (!line.repeat && state.spoken[id] && !force) return false;
    if (this.speaking) {
      if (line.repeat) return false;           // drop contextual chatter
      if (!this.queue.includes(id)) this.queue.push(id); // queue story beats
      state.spoken[id] = true;
      return true;
    }
    state.spoken[id] = true;
    this._speak(id, line);
    return true;
  }

  // Story lines (non-repeat) freeze the game while they play so a hint never
  // hides an incoming attack; contextual chatter never blocks. main.js reads
  // this each frame.
  get blocking() {
    return this.speaking && this._pauseLine &&
      (state.settings.captions || state.settings.voice);
  }

  // Skip the current line (tap the caption). Queued lines follow, each
  // skippable in turn.
  skip() {
    if (!this.speaking) return;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this._done) this._done();
  }

  _speak(id, line) {
    this.speaking = true;
    this._pauseLine = !line.repeat;
    const meta = VOICES[line.voice];
    audio.duck(true);

    // captions (default ON)
    if (state.settings.captions) {
      this.captionEl.textContent = `${meta.label}: ${line.text}`;
      this.captionEl.style.opacity = '1';
      this.captionEl.classList.add('show');
    }

    let finished = false;
    const done = () => {
      if (finished) return; // onend + safety timer may both fire
      finished = true;
      this.speaking = false;
      this.captionEl.classList.remove('show');
      setTimeout(() => {
        if (!this.speaking) this.captionEl.style.opacity = '0';
      }, 900);
      audio.duck(false);
      const next = this.queue.shift();
      if (next) this._speak(next, LINES[next]);
    };
    this._done = done;

    if (state.settings.voice && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(line.text);
      u.rate = meta.rate * (state.settings.voiceRate || 1);
      u.pitch = meta.pitch;
      if (this._voice) u.voice = this._voice;
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
      // safety: some engines never fire onend
      setTimeout(() => { if (this.speaking) done(); }, 1200 + line.text.length * 90);
    } else {
      // captions-only pacing
      setTimeout(done, 900 + line.text.length * 55);
    }
  }
}
