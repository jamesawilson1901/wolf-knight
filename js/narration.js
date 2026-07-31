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
  lava_cooled: { voice: 'pip', text: 'Feel that? The key drank the fire — the lava sleeps as black stone! New paths, Kael!' },
  kiln_enter: { voice: 'pip', text: 'The Kiln… the volcano’s own halls. Three doors, Kael — the mountain keeps its secrets locked.' },
  kiln_shrine: { voice: 'pip', text: 'A fire shrine! Cinder’s spark reaches out to you, Kael — take it!' },
  brazier_hint: { voice: 'pip', text: 'A cold brazier! Your fiery slam can light it. Try it!' },
  kiln_order: { voice: 'pip', text: 'Look — these braziers wear little rings. One, two, three… light them in that order!' },
  gate_promise: { voice: 'pip', text: 'We can’t open this yet… but let’s remember it. We WILL come back.', repeat: true },
  boss_door: { voice: 'pip', text: 'The spirit is near… but something’s wrong. Be ready, Kael.' },
  boss_intro: { voice: 'pip', text: 'There! The fire spirit — a shadow has it in its grip! Free it!' },
  boss_p1: { voice: 'pip', text: 'It’s holding the spirit! When a tendril gets stuck, hit it — quick!' },
  boss_p1_telegraph: { voice: 'pip', text: 'Look out — move off the dark circle!' },
  boss_p2: { voice: 'pip', text: 'The core is open — strike it!' },
  boss_bloodmoon: { voice: 'pip', text: 'Your Blood Moon is ready — crash it down on the core!' },
  boss_p3: { voice: 'pip', text: 'It’s too dark! Become the Dark Wolf — you can see in the shadows!' },
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
  enemy_group: { voice: 'pip', text: 'Lots of shadows! Your Blood Moon can clear them — use it!', repeat: true },
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
  boulder_hint: { voice: 'pip', text: 'A round boulder! Lean on it to roll it. I bet it could hold that floor switch down.' },
  plate_open: { voice: 'pip', text: 'You did it! The gate remembers the weight. Onward!' },
  warden_door: { voice: 'pip', text: 'Something big rattles beyond this door… ready your shield, Kael.' },
  warden_intro: { voice: 'grimm', text: 'My warden of bone guards the stone spirit, little knight. It will grind you to dust.' },
  warden_block: { voice: 'pip', text: 'His big shield blocks the front! Circle behind him — or parry that chop!' },
  warden_defeat: { voice: 'petra', text: 'The bones fall still… Thank you, kind knight. I am Petra, keeper of the stone.' },
  earthwolf_grant: { voice: 'petra', text: 'Take my gift — the heart of the Earth Wolf. The mountain walks with you now.' },
  earthwolf_howto: { voice: 'pip', text: 'You can be the Earth Wolf now! Hold the screen to change. Your stomp can smash cracked rock!' },
  crack_prompt: { voice: 'pip', text: 'See those cracked rocks? Be the Earth Wolf and stomp them to bits!' },
  all_pups_stone: { voice: 'pip', text: 'Six pups safe and sound! The whole den will be full of happy howls. Your heart grows stronger!' },
  stone_complete: { voice: 'pip', text: 'The caverns hum with life again. Two lights found, Kael… five to go.' },
  luna_dream_2: { voice: 'luna', text: 'Rest now, brave one. The stone sings again. Beyond the caverns, the wild woods are waiting for us.' },
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
