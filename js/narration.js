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
};

export class Narration {
  constructor() {
    this.captionEl = document.getElementById('caption');
    this.queue = [];
    this.speaking = false;
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

  _speak(id, line) {
    this.speaking = true;
    const meta = VOICES[line.voice];
    audio.duck(true);

    // captions (default ON)
    if (state.settings.captions) {
      this.captionEl.textContent = `${meta.label}: ${line.text}`;
      this.captionEl.style.opacity = '1';
    }

    let finished = false;
    const done = () => {
      if (finished) return; // onend + safety timer may both fire
      finished = true;
      this.speaking = false;
      setTimeout(() => {
        if (!this.speaking) this.captionEl.style.opacity = '0';
      }, 900);
      audio.duck(false);
      const next = this.queue.shift();
      if (next) this._speak(next, LINES[next]);
    };

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
