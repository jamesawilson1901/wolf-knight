// Title screen: per-kid profiles (icon-first, big targets), Continue / New
// Game / Settings. Resolves with the chosen profile + save once the player
// commits, then the game boots into it.

import { loadProfiles, createProfile, loadSave, clearSave, exportProfile, importProfile } from './save.js';
import { audio } from './audio.js';
import {  } from './state.js';
import { PORTRAITS, AVATARS } from './titlescene.js';


// Avatar: new profiles store a character id ('knight','dark_wolf', …) and
// show the real 3D portrait once it's rendered; legacy emoji still work.
function avatarHTML(icon) {
  if (PORTRAITS[icon]) return `<img class="avatar-img" src="${PORTRAITS[icon]}" alt="">`;
  const av = AVATARS.find((a) => a.id === icon);
  return `<span class="profile-icon">${av ? '🐺' : icon}</span>`;
}

// BACKUP: a save downloaded onto the child's own device, outside the
// browser's storage entirely — the one copy that survives a full "clear
// site data", a factory reset, or a move to a new phone (js/save.js says
// why localStorage alone cannot).
function downloadBackup(profile) {
  const data = exportProfile(profile.id);
  if (!data) return false;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wolfknight-${(profile.name || 'save').replace(/[^a-z0-9]+/gi, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoked on a delay, not immediately: the download itself is async in
  // some browsers and an instantly-revoked blob URL can lose the race.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

// RESTORE: a hidden, one-shot file picker. `onDone(payload, error)` gets
// exactly one of the two — title.js decides what to tell a parent about a
// bad file, this function only reads it.
function pickRestoreFile(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { onDone(JSON.parse(reader.result), null); }
      catch (e) { onDone(null, e); }
    };
    reader.onerror = () => onDone(null, reader.error);
    reader.readAsText(file);
  });
  input.click();
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

      // A quiet link, not a button the same weight as New Player: this is
      // the way back after a wipe, not a thing most sessions ever touch.
      const restore = document.createElement('div');
      restore.className = 'title-restore ui';
      restore.textContent = '📥 Restore from a backup file';
      restore.addEventListener('pointerdown', () => {
        audio.play('ui-click', { volume: 0.6 });
        pickRestoreFile((payload, err) => {
          if (err || !payload) { restore.textContent = '⚠️ Not a Wolf Knight save file'; }
          else {
            try {
              importProfile(payload);
              renderList(); // the restored profile now needs to appear
              return;
            } catch (e) { restore.textContent = '⚠️ Could not restore that file'; }
          }
          setTimeout(() => { restore.textContent = '📥 Restore from a backup file'; }, 2600);
        });
      });
      list.appendChild(restore);
    };

    const renderDetail = () => {
      list.style.display = 'none';
      detail.style.display = 'flex';
      confirmingNewGame = false;
      const save = loadSave(selected.id);
      detail.innerHTML = `
        <div class="detail-name">${avatarHTML(selected.icon)} ${selected.name}</div>
        ${save ? `<div class="menu-btn ui" id="t-continue">▶ Continue</div>` : ''}
        ${save ? `<div class="menu-btn secondary ui" id="t-backup">💾 Backup Save</div>` : ''}
        <div class="menu-btn ${save ? 'secondary' : ''} ui" id="t-newgame">✨ New Game</div>
        <div class="menu-btn secondary ui" id="t-back">← Back</div>`;
      if (save) {
        detail.querySelector('#t-continue').addEventListener('pointerdown', () => {
          audio.play('ui-click', { volume: 0.7 });
          finish(selected, save);
        });
        // A FILE ON THE DEVICE, not another copy in the same storage a
        // "clear site data" wipes alongside everything else (js/save.js).
        const backup = detail.querySelector('#t-backup');
        backup.addEventListener('pointerdown', () => {
          audio.play('ui-click', { volume: 0.6 });
          backup.textContent = downloadBackup(selected) ? '✓ Saved to your files' : '⚠️ Could not back up';
          setTimeout(() => { backup.textContent = '💾 Backup Save'; }, 2200);
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
