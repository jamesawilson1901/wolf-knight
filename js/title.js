// Title screen: per-kid profiles (icon-first, big targets), Continue / New
// Game / Settings. Resolves with the chosen profile + save once the player
// commits, then the game boots into it.

import { loadProfiles, createProfile, loadSave, clearSave } from './save.js';
import { audio } from './audio.js';
import { state } from './state.js';
import { PORTRAITS, AVATARS } from './titlescene.js';
import { lockLandscape } from './orientation.js';

const ICONS = ['🐺', '🦊', '🌙', '🔥', '⚔️', '💜']; // legacy profiles only

// Avatar: new profiles store a character id ('knight','dark_wolf', …) and
// show the real 3D portrait once it's rendered; legacy emoji still work.
function avatarHTML(icon) {
  if (PORTRAITS[icon]) return `<img class="avatar-img" src="${PORTRAITS[icon]}" alt="">`;
  const av = AVATARS.find((a) => a.id === icon);
  return `<span class="profile-icon">${av ? '🐺' : icon}</span>`;
}

export function showTitle() {
  return new Promise((resolve) => {
    const el = document.getElementById('title');
    const list = document.getElementById('profile-list');
    const detail = document.getElementById('profile-detail');
    const create = document.getElementById('profile-create');
    el.style.display = 'flex';

    let selected = null;
    let confirmingNewGame = false;

    const finish = (profile, save) => {
      // Landscape lock + fullscreen ride on this tap — this is the one user
      // gesture we are guaranteed, and both APIs need one. The lock is chained
      // onto fullscreen inside lockLandscape(); firing them side by side (as
      // this did) means the lock is always rejected.
      lockLandscape();
      el.style.display = 'none';
      resolve({ profile, save });
    };

    const renderList = () => {
      const profiles = loadProfiles();
      list.innerHTML = '';
      detail.style.display = 'none';
      create.style.display = 'none';
      list.style.display = 'flex';
      for (const p of profiles) {
        const b = document.createElement('div');
        b.className = 'profile-btn ui';
        b.innerHTML = `${avatarHTML(p.icon)}<span>${p.name}</span>`;
        b.addEventListener('pointerdown', () => {
          audio.play('ui-click', { volume: 0.7 });
          selected = p;
          renderDetail();
        });
        list.appendChild(b);
      }
      const add = document.createElement('div');
      add.className = 'profile-btn new ui';
      add.innerHTML = `<span class="profile-icon">＋</span><span>New Player</span>`;
      add.addEventListener('pointerdown', () => {
        audio.play('ui-click', { volume: 0.7 });
        renderCreate();
      });
      list.appendChild(add);
    };

    const renderDetail = () => {
      list.style.display = 'none';
      detail.style.display = 'flex';
      confirmingNewGame = false;
      const save = loadSave(selected.id);
      detail.innerHTML = `
        <div class="detail-name">${avatarHTML(selected.icon)} ${selected.name}</div>
        ${save ? `<div class="menu-btn ui" id="t-continue">▶ Continue</div>` : ''}
        <div class="menu-btn ${save ? 'secondary' : ''} ui" id="t-newgame">✨ New Game</div>
        <div class="menu-btn secondary ui" id="t-back">← Back</div>`;
      if (save) {
        detail.querySelector('#t-continue').addEventListener('pointerdown', () => {
          audio.play('ui-click', { volume: 0.7 });
          finish(selected, save);
        });
      }
      const ng = detail.querySelector('#t-newgame');
      ng.addEventListener('pointerdown', () => {
        audio.play('ui-click', { volume: 0.7 });
        if (save && !confirmingNewGame) {
          confirmingNewGame = true;
          ng.textContent = '⚠️ Start over? Tap again';
          return;
        }
        clearSave(selected.id);
        finish(selected, null);
      });
      detail.querySelector('#t-back').addEventListener('pointerdown', () => {
        audio.play('ui-click', { volume: 0.7 });
        renderList();
      });
    };

    const renderCreate = () => {
      list.style.display = 'none';
      create.style.display = 'flex';
      create.innerHTML = `
        <input id="t-name" maxlength="12" placeholder="Your name" autocomplete="off">
        <div id="t-icons"></div>
        <div class="menu-btn ui" id="t-start">Let's go!</div>
        <div class="menu-btn secondary ui" id="t-cancel">← Back</div>`;
      // pick your character portrait (real 3D renders; emoji until ready)
      let icon = AVATARS[0].id;
      const iconsEl = create.querySelector('#t-icons');
      const renderPicker = () => {
        iconsEl.innerHTML = '';
        for (const av of AVATARS) {
          const s = document.createElement('span');
          s.className = 'icon-pick' + (av.id === icon ? ' picked' : '');
          s.innerHTML = avatarHTML(av.id);
          s.title = av.label;
          s.addEventListener('pointerdown', () => {
            icon = av.id;
            iconsEl.querySelectorAll('.icon-pick').forEach((n) => n.classList.toggle('picked', n === s));
            audio.play('ui-click', { volume: 0.6 });
          });
          iconsEl.appendChild(s);
        }
      };
      renderPicker();
      window.addEventListener('portraits-ready', renderPicker, { once: true });
      create.querySelector('#t-start').addEventListener('pointerdown', () => {
        const name = create.querySelector('#t-name').value.trim() || 'Hero';
        const id = createProfile(name, icon);
        audio.play('ui-click', { volume: 0.7 });
        finish({ id, name, icon }, null);
      });
      create.querySelector('#t-cancel').addEventListener('pointerdown', () => renderList());
    };

    renderList();
    // when the 3D portraits finish rendering, refresh whatever is visible
    window.addEventListener('portraits-ready', () => {
      if (list.style.display !== 'none') renderList();
    });
  });
}
