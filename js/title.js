// Title screen: per-kid profiles (icon-first, big targets), Continue / New
// Game / Settings. Resolves with the chosen profile + save once the player
// commits, then the game boots into it.

import { loadProfiles, createProfile, loadSave, clearSave } from './save.js';
import { audio } from './audio.js';
import { state } from './state.js';

const ICONS = ['🐺', '🦊', '🌙', '🔥', '⚔️', '💜'];

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
      // Landscape lock + fullscreen ride on this tap (best effort).
      try {
        document.documentElement.requestFullscreen &&
          document.documentElement.requestFullscreen().catch(() => {});
      } catch (e) {}
      try {
        screen.orientation && screen.orientation.lock &&
          screen.orientation.lock('landscape').catch(() => {});
      } catch (e) {}
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
        b.innerHTML = `<span class="profile-icon">${p.icon}</span><span>${p.name}</span>`;
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
        <div class="detail-name">${selected.icon} ${selected.name}</div>
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
      let icon = ICONS[0];
      const iconsEl = create.querySelector('#t-icons');
      for (const ic of ICONS) {
        const s = document.createElement('span');
        s.className = 'icon-pick' + (ic === icon ? ' picked' : '');
        s.textContent = ic;
        s.addEventListener('pointerdown', () => {
          icon = ic;
          iconsEl.querySelectorAll('.icon-pick').forEach((n) => n.classList.toggle('picked', n === s));
          audio.play('ui-click', { volume: 0.6 });
        });
        iconsEl.appendChild(s);
      }
      create.querySelector('#t-start').addEventListener('pointerdown', () => {
        const name = create.querySelector('#t-name').value.trim() || 'Hero';
        const id = createProfile(name, icon);
        audio.play('ui-click', { volume: 0.7 });
        finish({ id, name, icon }, null);
      });
      create.querySelector('#t-cancel').addEventListener('pointerdown', () => renderList());
    };

    renderList();
  });
}
