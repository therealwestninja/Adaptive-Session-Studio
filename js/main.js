// ── main.js ────────────────────────────────────────────────────────────────
// App entry point: event wiring, keyboard shortcuts, initialization.

import { state, persist, fmt, $id, uid, fileToDataUrl,
         normalizeBlock, normalizeSession, normalizeAudioTrack, normalizeVideoTrack, normalizeSubtitleTrack,
         defaultSession, applyCssVars, applyTheme, sessionReady ,
         SETTINGS_KEYS } from './state.js';

// Wait for IndexedDB session load to complete before rendering.
// (top-level await is valid in ES modules — supported in all modern browsers)
await sessionReady;

// ── App-open tracking (engagement analytics) ──────────────────────────────
// loadProfile/saveProfile/updateMenubarAvatar are statically imported below;
// ES module imports are hoisted so they are available here at evaluation time.
{
  const p = loadProfile();
  p.appOpens = (p.appOpens ?? 0) + 1;
  saveProfile(p);
  updateMenubarAvatar(p);
}

import { startPlayback, stopPlayback, pausePlayback, resumePlayback,
         seekTo, skipBy, emergencyStop } from './playback.js';
import { refreshVolumes, crossfade, startSingleTrack, removeSingleTrack, resumeAudioEngine } from './audio-engine.js';
import { parseAss, updateSubtitleCue } from './subtitle.js';
import { importFunScriptFile, initTimeline, drawTimeline,
         connectDevice, disconnectDevice,
         selectAllPoints, transformPoints,
         getCurrentPosition, updatePositionIndicator,
         resetZoom, saveZoom, restoreZoom } from './funscript.js';

// ── Cross-module imports (previously missing — caused ReferenceError at runtime) ──
import { renderSidebar, updateSidebarSelection, renderInspector,
         syncSettingsForms, syncSessionFromSettings, syncTransportControls,
         renderThemeGrid, saveCustomTheme, deleteCustomTheme,
         BLOCK_COLORS } from './ui.js';
import { notify }                 from './notify.js';
import { history }                from './history.js';
import { renderMacroLibrary, initMacroLibraryEvents } from './macro-ui.js';
import { renderSensorBridgePanel } from './sensor-bridge.js';
import { initFullscreenHud, renderIdleScreen, showLiveControlToast } from './fullscreen-hud.js';
import { initLiveControl, setLiveIntensity, setLiveSpeed, defaultLiveControl } from './live-control.js';
import { makeTrackingModule }     from './tracking.js';
import { detectCapabilities, applyCapabilityGates,
         warnMissingCapabilities, checkStorageBudget } from './capabilities.js';
import { validateImportedSession, validateSubtitleText, validateMediaFile } from './import-validate.js';
import { injectMacro, getSlotMacro, toggleFsPause } from './macros.js';
import { duplicateBlock, deleteBlock,
         registerBlockOpRenderers } from './block-ops.js';
import { skipToNextScene } from './scenes.js';
import { resetStateEngine } from './state-engine.js';
import { clearRuleState }   from './rules-engine.js';
import { clearProfile, saveProfile, loadProfile, updateMenubarAvatar, renderProfilePanel } from './user-profile.js';
import { hasSeenProfileTour, startProfileTour, resetProfileTour, closeProfileTour } from './profile-tour.js';
import { clearStoredAnalytics } from './session-analytics.js';
import { clearMetricsHistory }  from './metrics-history.js';
import { checkAndNotify }        from './suggestions.js';
import { idbDel }           from './idb-storage.js';

// ── After-load helper ────────────────────────────────────────────────────────
// Called after any operation that replaces/resets the session (new, import,
// apply JSON, content pack, clear) to bring all UI into sync.
function _afterSessionLoad({ persist: doPersist = true } = {}) {
  stopPlayback({ silent: true });
  resetZoom();
  resetStateEngine();
  clearRuleState();
  // Reset live-control overrides so intensity/speed from the previous session
  // don't silently bleed into the new one. Operator can re-apply with []/,. keys.
  state.liveControl = defaultLiveControl();
  import('./live-control.js').then(({ renderLiveControl }) => renderLiveControl()).catch(() => {});
  applyCssVars();
  renderSidebar();
  renderInspector();
  syncSettingsForms();
  syncTransportControls();
  if (doPersist) persist();
}


// Expose for inspector button handlers
window._funscriptModule = { connectDevice, disconnectDevice }; // kept for external tooling compat
window.openFsDialog = openFsDialog; // called by inspector "Open Timeline Editor" button

// Register renderers for block-ops (avoids circular dep: block-ops ← ui.js)
// Must be called after ui.js module initialises — deferred one microtask.
Promise.resolve().then(() => registerBlockOpRenderers(renderSidebar, renderInspector));

// ── Transport controls ───────────────────────────────────────────────────────
$id('playBtn').addEventListener('click', () => {
  if (!state.runtime)            startPlayback();
  else if (state.runtime.paused) resumePlayback();
  else                           pausePlayback();
});
$id('stopBtn').addEventListener('click', stopPlayback);
$id('skipBackBtn').addEventListener('click',  () => skipBy(-10));
$id('skipFwdBtn').addEventListener('click',   () => skipBy(10));
$id('nextSceneBtn')?.addEventListener('click', skipToNextScene);

$id('loopToggle').addEventListener('click', () => {
  const modes = ['none', 'count', 'minutes', 'forever'];
  const idx = modes.indexOf(state.session.loopMode);
  history.push();
  state.session.loopMode = modes[(idx === -1 ? 0 : idx + 1) % modes.length];
  syncTransportControls();
  persist();
});

// ── Session name quick-edit (menubar center input) ────────────────────────────
// Initialise with the current session name immediately
const sni = $id('sessionNameInput');
let _sniSnapped = false;

// Notes preview — shows first line of session.notes under session name
function syncNotesPreview() {
  const el = $id('sessionNotesPreview');
  if (!el) return;
  const notes = state.session.notes?.trim() ?? '';
  if (notes) {
    const firstLine = notes.split('\n')[0].slice(0, 80);
    el.textContent = firstLine;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}
syncNotesPreview();
if (sni) {
  sni.value = state.session.name ?? '';
  sni.addEventListener('input', () => {
    // Snapshot at most once per focus session — same debounce as block field editing.
    // Per-keystroke history.push() would flood the undo stack with character-level snapshots.
    if (!_sniSnapped) {
      history.push();
      _sniSnapped = true;
    }
    state.session.name = sni.value.trim() || 'session';
    // Keep the Settings dialog in sync if it's open
    const settingsInput = $id('s_sessionName');
    if (settingsInput) settingsInput.value = state.session.name;
    persist();
    renderIdleScreen();
  });
  // On blur: normalise empty value back to something sensible, clear snap guard
  sni.addEventListener('blur', () => {
    _sniSnapped = false;
    if (!sni.value.trim()) {
      sni.value = state.session.name || 'session';
    }
  });
  // Select-all on focus so the user can immediately type a new name
  sni.addEventListener('focus', () => sni.select());
  // Enter key commits and blurs
  sni.addEventListener('keydown', e => { if (e.key === 'Enter') sni.blur(); });
}

const mvSlider = $id('masterVolumeSlider');
mvSlider.value = state.session.masterVolume;
let _mvSnapped = false;
mvSlider.addEventListener('input', e => {
  if (!_mvSnapped) { history.push(); _mvSnapped = true; }
  state.session.masterVolume = Number(e.target.value);
  if (state.runtime?.usingAudioEngine) refreshVolumes();
  else state.runtime?.backgroundAudio.forEach(a => a.volume = state.session.masterVolume * state.session.advanced.playlistAudioVolume);
  // Keep settings dialog in sync if open
  const sv = $id('s_masterVolume');
  if (sv) { sv.value = e.target.value; const sl = $id('s_masterVolumeVal'); if (sl) sl.textContent = `${Math.round(Number(e.target.value) * 100)}%`; }
  persist();
});
mvSlider.addEventListener('blur', () => { _mvSnapped = false; });

// Progress bar — click/drag to seek
let _pbDragging = false;
const _pbSeek = (e) => {
  const bar = $id('progressBar');
  if (!bar) return;
  const r = bar.getBoundingClientRect();
  if (r.width <= 0) return;
  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  if (state.runtime) {
    seekTo(pct);
  } else {
    const fill  = $id('progressFill');  if (fill)  fill.style.width = `${pct*100}%`;
    const thumb = $id('progressThumb'); if (thumb) thumb.style.left  = `${pct*100}%`;
    const cur   = $id('tCurrent');      const previewSec = pct * state.session.duration;
    if (cur) cur.textContent = fmt(previewSec);
    if (e.shiftKey || _pbDragging) {
      const hud = $id('stageHud'); if (hud) hud.textContent = `Preview ${fmt(previewSec)}`;
      updateSubtitleCue(previewSec);
      updatePositionIndicator(getCurrentPosition(previewSec));
      const ab = state.session.blocks.find(b => previewSec >= b.start && previewSec < b.start + b.duration);
      const ot = $id('overlayText');
      if (ot && ab?.type === 'text') {
        ot.textContent = ab.content;
        ot.style.opacity = '0.45';
        ot.style.fontSize = `${(ab.fontSize || 1.2) * 2.2}rem`;
      }
      if ($id('fsDialog')?.open) drawTimeline(previewSec);
    }
  }
};
$id('progressBar').addEventListener('mousedown', e => { _pbDragging = true; _pbSeek(e); });
window.addEventListener('mousemove',  e => { if (_pbDragging) _pbSeek(e); });
window.addEventListener('mouseup',    () => { _pbDragging = false; });
$id('progressBar').addEventListener('click', _pbSeek);

$id('fullscreenBtn').addEventListener('click', () => {
  if (!document.fullscreenElement) $id('mainStage').requestFullscreen?.();
  else document.exitFullscreen?.();
});

// ── Session actions ──────────────────────────────────────────────────────────
$id('newSessionBtn').addEventListener('click', async () => {
  const ok = await notify.confirm('Start a new session? Unsaved changes will be lost.', { confirmLabel: 'New session', danger: true });
  if (!ok) return;
  history.clear();
  state.session = normalizeSession(defaultSession());
  // Clear all sidebar selection so the inspector doesn't try to render stale state
  state.selectedBlockId = null;
  state.selectedSidebarType = null; state.selectedSidebarIdx = null; state.selectedSidebarId = null;
  $id('tTotal').textContent = fmt(state.session.duration);
  _afterSessionLoad();
  renderIdleScreen();
});


$id('exportPackageBtn').addEventListener('click', () => {
  const json     = JSON.stringify(state.session, null, 2);
  const sizeMB   = (new Blob([json]).size / 1_000_000).toFixed(1);
  const safeName = (state.session.name || 'session')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80).trim() || 'session';
  const filename = `${safeName}.assp`;
  const blob     = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click(); URL.revokeObjectURL(a.href);
  if (Number(sizeMB) > 50) {
    notify.warn(`Exported as ${filename} (${sizeMB} MB) — large file. Consider removing unused media to reduce size.`);
  } else {
    notify.success(`Exported as ${filename} (${sizeMB} MB)`);
  }
});

// ── ZIP export ────────────────────────────────────────────────────────────────
$id('exportZipBtn')?.addEventListener('click', async () => {
  try {
    const { exportSessionZip } = await import('./zip-export.js');
    exportSessionZip();
    // Flag for 'Archivist' achievement
    import('./user-profile.js').then(({ loadProfile, saveProfile }) => {
      const p = loadProfile(); if (!p.hasZipExported) { p.hasZipExported = true; saveProfile(p); }
    }).catch(() => {});
  } catch (err) {
    notify.error('ZIP export failed to load. See console.');
    console.error('zip-export load error:', err);
  }
});
$id('exportMdBtn')?.addEventListener('click', () => {
  const s = state.session;
  const sorted = [...(s.blocks ?? [])].sort((a, b) => a.start - b.start);
  let md = `# ${s.name || 'Untitled Session'}\n\n`;
  md += `**Duration:** ${fmt(s.duration)}  **Mode:** ${s.mode || 'None'}  **Loop:** ${s.loopMode}\n\n`;
  if (s.notes) md += `> ${s.notes.replace(/\n/g, '\n> ')}\n\n`;
  md += `---\n\n## Blocks\n\n`;
  for (const b of sorted) {
    const typeLabel = b.type.toUpperCase();
    md += `### [${fmt(b.start)}] ${b.label} *(${typeLabel} · ${fmt(b.duration)})*\n`;
    if (b.content) md += `\n${b.content}\n`;
    md += '\n';
  }
  if (s.scenes?.length) {
    md += `---\n\n## Scenes\n\n`;
    for (const sc of s.scenes)
      md += `- **${sc.name}** (${fmt(sc.start)} → ${fmt(sc.end)}) — ${sc.stateType || 'default'}\n`;
    md += '\n';
  }
  if (s.rules?.length) {
    md += `---\n\n## Rules\n\n`;
    for (const r of s.rules.filter(r => r.enabled))
      md += `- **${r.label}**: if ${r.condition?.metric} ${r.condition?.operator} ${r.condition?.threshold} → ${r.action?.type}\n`;
    md += '\n';
  }
  const safeName = (s.name || 'session').replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'session';
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.md`;
  a.click(); URL.revokeObjectURL(a.href);
  notify.success(`Script exported as ${safeName}.md`);
});

// ── Keyboard shortcut overlay ─────────────────────────────────────────────────
function toggleShortcutOverlay(show) {
  const el = $id('shortcutOverlay');
  if (!el) return;
  el.style.display = show ? 'flex' : 'none';
}
$id('shortcutHelpBtn')?.addEventListener('click', () => toggleShortcutOverlay(true));
$id('shortcutOverlayClose')?.addEventListener('click', () => toggleShortcutOverlay(false));
$id('shortcutOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) toggleShortcutOverlay(false); });

// ── Block search / filter ──────────────────────────────────────────────────────
$id('blockSearch')?.addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#blockList [data-block-id]').forEach(item => {
    const blockId = item.dataset.blockId;
    const block   = state.session.blocks.find(b => b.id === blockId);
    const match   = !q || [block?.label, block?.content, block?.type]
      .some(s => s?.toLowerCase().includes(q));
    item.style.display = match ? '' : 'none';
  });
});


// ── Mini session scrubber ─────────────────────────────────────────────────────
function updateMiniScrubber() {
  const fill    = $id('miniScrubberFill');
  const markers = $id('miniScrubberMarkers');
  if (!fill) return;
  const dur = state.session.duration;
  const cur = state.runtime?.sessionTime ?? 0;
  fill.style.width = dur > 0 ? `${Math.min(100, (cur / dur) * 100).toFixed(2)}%` : '0%';
  // Render block markers once on session change (detected by block count)
  if (markers && markers.dataset.blockCount !== String(state.session.blocks.length)) {
    markers.dataset.blockCount = state.session.blocks.length;
    markers.innerHTML = state.session.blocks.map(b => {
      const col  = BLOCK_COLORS[b.type] || '#888';
      const left = dur > 0 ? ((b.start / dur) * 100).toFixed(2) : '0';
      return `<div class="mini-scrubber-marker" style="left:${left}%;background:${col}"></div>`;
    }).join('');
  }
}
// Click / drag to seek
const _scrubberEl = $id('miniScrubberWrap');
if (_scrubberEl) {
  const _scrubSeek = (e) => {
    const rect = _scrubberEl.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct);
  };
  let _scrubDragging = false;
  _scrubberEl.addEventListener('mousedown', e => { _scrubDragging = true; _scrubSeek(e); });
  window.addEventListener('mousemove', e => { if (_scrubDragging) _scrubSeek(e); });
  window.addEventListener('mouseup',   () => { _scrubDragging = false; });
}

// Tick — 500ms polling for timer, scrubber, vars HUD
setInterval(() => {
  // Session timer
  const timerEl = $id('sessionTimer');
  if (timerEl) {
    if (state.runtime) {
      timerEl.style.display = '';
      timerEl.textContent = `${fmt(state.runtime.sessionTime)} / ${fmt(state.session.duration)}`;
    } else {
      timerEl.style.display = 'none';
    }
  }
  // Mini scrubber
  updateMiniScrubber();
  // Variables HUD — shows non-zero variables as chips during playback
  const varsHud = $id('varsHud');
  if (varsHud) {
    if (state.runtime) {
      const vars = state.session.variables ?? {};
      const active = Object.entries(vars).filter(([, v]) =>
        v !== 0 && v !== false && v !== '' && v !== null
      );
      if (active.length) {
        varsHud.style.display = '';
        varsHud.innerHTML = active.map(([name, val]) =>
          `<span class="var-chip"><span class="var-chip-name">{{${esc(name)}}}</span><span class="var-chip-val">${esc(String(val))}</span></span>`
        ).join('');
      } else {
        varsHud.style.display = 'none';
      }
    } else {
      varsHud.style.display = 'none';
    }
  }
}, 500);

$id('importPackageInput').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    // Reject by file.size BEFORE reading — avoids loading a multi-GB bomb into JS memory
    if (file.size > 20_000_000) {
      throw new Error(`Session file is too large (${(file.size / 1e6).toFixed(1)} MB). Max allowed: 20 MB.`);
    }
    const text = await file.text();
    // Secondary guard on decoded string length (unicode expansion can differ from byte count)
    if (text.length > 20_000_000) {
      throw new Error(`Session file is too large (${(text.length / 1e6).toFixed(1)} MB). Max allowed: 20 MB.`);
    }
    let raw;
    try { raw = JSON.parse(text); } catch (pe) { throw new Error(`Not valid JSON: ${pe.message}`); }
    // Validate structure and budgets before mutating any state
    validateImportedSession(raw, text.length);
    history.clear();
    state.session = normalizeSession(raw);
    state.selectedBlockId = state.session.blocks[0]?.id || null;
    state.selectedSidebarType = null; state.selectedSidebarIdx = null; state.selectedSidebarId = null;
    _afterSessionLoad();
    renderIdleScreen();
    notify.success(`Imported "${state.session.name}" (v${raw.packageVersion ?? '?'})`);
  } catch (err) {
    notify.error(`Import failed: ${err.message}`);
  }
  e.target.value = '';
});

// ── Media file inputs ────────────────────────────────────────────────────────
$id('addAudioInput').addEventListener('change', async e => {
  const files = [...e.target.files];
  let added = 0;
  for (const f of files) {
    try {
      validateMediaFile(f, 'Audio');
      const dataUrl = await fileToDataUrl(f); // decode first — push only on success
      history.push();
      state.session.playlists.audio.push(normalizeAudioTrack({ name: f.name, dataUrl, volume: 1, _muted: false }));
      added++;
    } catch (err) {
      notify.error(`Audio import failed for "${f.name}": ${err.message}`);
    }
  }
  if (added > 0) { persist(); renderSidebar(); notify.success(`Added ${added} audio track${added > 1 ? 's' : ''}.`); }
  e.target.value = '';
});

$id('addVideoInput').addEventListener('change', async e => {
  const files = [...e.target.files];
  let added = 0;
  for (const f of files) {
    try {
      validateMediaFile(f, f.type.startsWith('image/') ? 'Image' : 'Video');
      const dataUrl = await fileToDataUrl(f); // decode first — push only on success
      history.push();
      state.session.playlists.video.push(normalizeVideoTrack({ name: f.name, dataUrl, mediaKind: f.type.startsWith('image/') ? 'image' : 'video', mute: true, volume: 1 }));
      added++;
    } catch (err) {
      notify.error(`Video/image import failed for "${f.name}": ${err.message}`);
    }
  }
  if (added > 0) { persist(); renderSidebar(); notify.success(`Added ${added} video/image track${added > 1 ? 's' : ''}.`); }
  e.target.value = '';
});

$id('addAssInput').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    // Reject by file.size BEFORE reading — subtitle text is capped at 5 MB, not 100 MB
    if (file.size > 5_000_000) throw new Error(
      `Subtitle file is too large (${(file.size/1e6).toFixed(1)} MB). Max: 5 MB.`
    );
    const rawText = await file.text();
    validateSubtitleText(rawText);         // secondary text-size check after read
    const parsed  = parseAss(rawText);
    if (!parsed.events?.length) {
      notify.warn(`"${file.name}" imported but has no cues — check the [Events] section.`);
    } else {
      notify.success(`Imported "${file.name}" — ${parsed.events.length} cues.`);
    }
    history.push(); // snapshot BEFORE mutation so undo removes the track
    state.session.subtitleTracks.push(normalizeSubtitleTrack({ name: file.name, rawAss: rawText, styles: parsed.styles, events: parsed.events, _disabled: false }));
    persist(); renderSidebar();
  } catch (err) {
    notify.error(`Subtitle import failed for "${file.name}":\n${err.message}`);
  }
  e.target.value = '';
});

$id('addFunscriptInput').addEventListener('change', async e => {
  let imported = 0;
  for (const f of e.target.files) {
    try { await importFunScriptFile(f); imported++; }
    catch (err) { notify.error(`FunScript import failed for "${f.name}":\n${err.message}`); }
  }
  if (imported > 0) notify.success(`Imported ${imported} FunScript track${imported > 1 ? 's' : ''}.`);
  renderSidebar(); renderInspector(); if ($id('fsDialog')?.open) drawTimeline();
  e.target.value = '';
});

// ── Block add buttons ────────────────────────────────────────────────────────
document.querySelectorAll('[data-add-block]').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.addBlock;
    const nextStart = state.session.blocks.length ? Math.max(...state.session.blocks.map(b => b.start + b.duration)) + 2 : 0;
    const block = normalizeBlock({ id: uid(), type, label: `New ${type}`, start: nextStart, duration: type === 'pause' ? 5 : 10 });
    history.push();
    state.session.blocks.push(block);
    state.selectedBlockId = block.id; state.selectedSidebarType = 'block';
    persist(); renderSidebar(); renderInspector();
  });
});

$id('sortBlocksBtn').addEventListener('click', () => {
  history.push();
  state.session.blocks.sort((a, b) => a.start - b.start); persist(); renderSidebar();
});

// ── Delegated events ─────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const itab = e.target.closest('.insp-tab');
  if (itab) {
    state.inspTab = itab.dataset.tab;
    document.querySelectorAll('.insp-tab').forEach(t => {
      t.classList.toggle('active', t === itab);
      t.setAttribute('aria-selected', t === itab ? 'true' : 'false');
    });
    renderInspector(); return;
  }

  const stab = e.target.closest('.settings-tab');
  if (stab) {
    state.settingsTab = stab.dataset.stab;
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t === stab));
    document.querySelectorAll('.settings-section').forEach(s => s.classList.toggle('active', s.dataset.section === state.settingsTab));
    if (state.settingsTab === 'macros')   renderMacroLibrary();
    if (state.settingsTab === 'profile')  { _wireProfileSettings(); syncProfileSettingsTab(); }
    if (state.settingsTab === 'ai')       syncApiKeyDisplay();
    if (state.settingsTab === 'packs') {
      import('./content-packs.js').then(({ renderContentPacksPicker, renderContentPackEditor }) => {
        renderContentPacksPicker('contentPacksPickerSettings');
        renderContentPackEditor('contentPackEditorSettings');
        // Give the editor state access
        window._assState = { state };
      });
    }
    if (state.settingsTab === 'advanced') {
      renderSensorBridgePanel('sensorBridgePanel');
      const jp = $id('s_jsonPreview');
      if (jp) jp.value = JSON.stringify(state.session, null, 2);
    }    return;
  }

  const tc = e.target.closest('[data-theme-key]');
  if (tc) { applyTheme(tc.dataset.themeKey); syncSettingsForms(); return; }

  const muteBtn = e.target.closest('[data-mute-kind]');
  if (muteBtn) {
    const kind    = muteBtn.dataset.muteKind;
    const trackId = muteBtn.dataset.trackId;
    const idx     = Number(muteBtn.dataset.muteIdx);
    history.push();
    if (kind === 'audio') {
      const t = trackId
        ? state.session.playlists.audio.find(a => a.id === trackId)
        : state.session.playlists.audio[idx];
      if (t) {
        t._muted = !t._muted;
        // Update audio engine live so mute takes effect immediately during playback.
        if (state.runtime?.usingAudioEngine) {
          const fadeSec = state.session.advanced.crossfadeSeconds ?? 0.6;
          if (t._muted) {
            // Muting: fade out existing node
            crossfade(t.id, null, fadeSec);
          } else {
            // Unmuting: if track never started (was muted at playback start),
            // create its node first, then crossfade handles the fade-in.
            startSingleTrack(t).then(() => crossfade(null, t.id, fadeSec));
          }
        } else if (state.runtime) {
          refreshVolumes();
        }
      }
    }
    if (kind === 'subtitle') {
      const t = trackId
        ? state.session.subtitleTracks.find(s => s.id === trackId)
        : state.session.subtitleTracks[idx];
      if (t) t._disabled = !t._disabled;
    }
    if (kind === 'funscript') {
      const t = trackId
        ? state.session.funscriptTracks.find(f => f.id === trackId)
        : state.session.funscriptTracks[idx];
      if (t) t._disabled = !t._disabled;
    }
    persist(); renderSidebar(); if ($id('fsDialog')?.open) drawTimeline(); return;
  }

  const delBtn = e.target.closest('[data-del-kind]');
  if (delBtn) {
    const kind    = delBtn.dataset.delKind;
    const trackId = delBtn.dataset.trackId;
    const idx     = Number(delBtn.dataset.delIdx);
    history.push();

    // ── Live teardown: stop the deleted track's media immediately ──────────
    // Without this the track keeps playing even though state says it's gone.
    if (state.runtime) {
      if (kind === 'audio') {
        if (state.runtime.usingAudioEngine) {
          // Resolve the actual id (may have been passed by index, not id)
          const resolvedId = trackId || state.session.playlists.audio[idx]?.id;
          if (resolvedId) removeSingleTrack(resolvedId);
        } else {
          // Fallback HTMLAudioElement path — stop everything, rebuild survivors after state mutation
          state.runtime.backgroundAudio.forEach(a => { try { a.pause(); a.src = ''; } catch {} });
          state.runtime.backgroundAudio = [];
          // Rebuild is deferred to after the playlist state mutation below (via queueMicrotask)
          queueMicrotask(() => {
            if (!state.runtime) return;
            const survivors = state.session.playlists.audio.filter(t => !t._muted);
            survivors.forEach(track => {
              if (!track.dataUrl) return;
              const el = new Audio(track.dataUrl);
              el.loop   = true;
              el.volume = Math.max(0, Math.min(1,
                (Number.isFinite(state.session.masterVolume) ? state.session.masterVolume : 0.8) *
                (Number.isFinite(state.session.advanced?.playlistAudioVolume) ? state.session.advanced.playlistAudioVolume : 0.7) *
                (track.volume ?? 1)
              ));
              el.play().catch(() => {});
              state.runtime.backgroundAudio.push(el);
            });
          });
        }
      }
      if (kind === 'video') {
        // Rebuild bgHost from the remaining video tracks (after state is updated below)
        // We schedule this after state mutation via queueMicrotask.
        queueMicrotask(() => {
          const bh = document.getElementById('bgHost');
          if (!bh || !state.runtime) return;
          // Stop all current video elements
          state.runtime.backgroundVideo.forEach(v => { try { v.pause?.(); v.src = ''; } catch {} });
          state.runtime.backgroundVideo = [];
          bh.innerHTML = '';
          // Re-add remaining tracks
          state.session.playlists.video.forEach(track => {
            const el = track.mediaKind === 'image'
              ? document.createElement('img')
              : document.createElement('video');
            el.src = track.dataUrl;
            if (el.tagName === 'VIDEO') {
              el.loop = true; el.autoplay = true; el.muted = !!track.mute; el.playsInline = true;
              el.volume = state.session.masterVolume * state.session.advanced.playlistVideoVolume * (track.volume ?? 1);
              el.play().catch(() => {});
            }
            bh.appendChild(el);
            state.runtime.backgroundVideo.push(el);
          });
        });
      }
    }

    if (kind === 'audio')    state.session.playlists.audio  = trackId
      ? state.session.playlists.audio.filter(t => t.id !== trackId)
      : (state.session.playlists.audio.splice(idx, 1), state.session.playlists.audio);
    if (kind === 'video')    state.session.playlists.video  = trackId
      ? state.session.playlists.video.filter(t => t.id !== trackId)
      : (state.session.playlists.video.splice(idx, 1), state.session.playlists.video);
    if (kind === 'subtitle') state.session.subtitleTracks = trackId
      ? state.session.subtitleTracks.filter(t => t.id !== trackId)
      : (state.session.subtitleTracks.splice(idx, 1), state.session.subtitleTracks);
    if (kind === 'funscript') {
      state.session.funscriptTracks = trackId
        ? state.session.funscriptTracks.filter(t => t.id !== trackId)
        : (state.session.funscriptTracks.splice(idx, 1), state.session.funscriptTracks);
      if ($id('fsDialog')?.open) drawTimeline();
    }
    state.selectedSidebarType = null; state.selectedSidebarIdx = null; state.selectedSidebarId = null;
    persist(); renderSidebar(); renderInspector(); return;
  }

  const sbItem = e.target.closest('[data-sb-type]');
  if (sbItem && !e.target.closest('[data-mute-kind],[data-del-kind]')) {
    const type    = sbItem.dataset.sbType;
    const idx     = sbItem.dataset.sbIdx !== undefined ? Number(sbItem.dataset.sbIdx) : null;
    const bid     = sbItem.dataset.blockId;
    const trackId = sbItem.dataset.sbTrackId;
    state.selectedSidebarType = type;
    state.selectedSidebarIdx  = idx;
    state.selectedSidebarId   = trackId ?? null;
    if (type === 'block' && bid) {
      state.selectedBlockId = bid;
      state.inspTab = 'overlay';
      document.querySelectorAll('.insp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'overlay'));
    }
    // For non-block sidebar types (tracks, scenes), also ensure the overlay tab is active
    if (type !== 'block') {
      state.inspTab = 'overlay';
      document.querySelectorAll('.insp-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'overlay');
        t.setAttribute('aria-selected', t.dataset.tab === 'overlay' ? 'true' : 'false');
      });
    }
    // Targeted class update — avoids full innerHTML rebuild just to flip .selected
    updateSidebarSelection();
    renderInspector();
    return;
  }
});

// ── Settings dialog ──────────────────────────────────────────────────────────
let _tracking = null;

function stopAndClearTracking() { _tracking?.stop(); _tracking = null; }

// ── Profile avatar button — opens dedicated full-window profile dialog ───────
$id('profileAvatarBtn')?.addEventListener('click', openProfileDialog);

export function openProfileDialog() {
  const dlg = document.getElementById('profileDialog');
  if (!dlg || dlg.open) return; // already open — guard against InvalidStateError
  dlg.showModal();
  // renderProfilePanel statically imported from user-profile.js
  renderProfilePanel('profileDialogBody').then(() => {
    if (!hasSeenProfileTour()) {
      // Delay tour start slightly so content has rendered.
      // Re-check dialog.open before starting — user may have closed it within 400ms.
      setTimeout(() => {
        if (document.getElementById('profileDialog')?.open) startProfileTour();
      }, 400);
    }
  }).catch(() => {});
}

// Close profile dialog
document.getElementById('closeProfileDialog')?.addEventListener('click', () => {
  document.getElementById('profileDialog')?.close();
});
// Close on backdrop click
document.getElementById('profileDialog')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});
// Clean up profile tour (overlay + keyboard handler) whenever the dialog closes
document.getElementById('profileDialog')?.addEventListener('close', () => {
  closeProfileTour(); // removes overlay AND the capture-phase keydown handler
});

$id('settingsBtn').addEventListener('click', () => {
  stopAndClearTracking();
  syncSettingsForms(); renderMacroLibrary();
  syncProfileSettingsTab();   // populate Profile tab fields
  syncApiKeyDisplay();         // populate AI tab key display
  if (!$id('settingsDialog')?.open) $id('settingsDialog')?.showModal();
  // Re-activate whichever tab was open last time
  const lastTab = state.settingsTab ?? 'appearance';
  document.querySelectorAll('.settings-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.stab === lastTab));
  document.querySelectorAll('.settings-section').forEach(s =>
    s.classList.toggle('active', s.dataset.section === lastTab));
  if (lastTab === 'macros')   renderMacroLibrary();
  if (lastTab === 'advanced') {
    renderSensorBridgePanel('sensorBridgePanel');
    const jp = $id('s_jsonPreview');
    if (jp) jp.value = JSON.stringify(state.session, null, 2);
  }
  syncSettingsForms();
  _tracking = makeTrackingModule();
});
const closeSettings = () => {
  syncSessionFromSettings();
  applyCssVars();
  syncTransportControls();
  renderIdleScreen();
  $id('settingsDialog').close();
};
$id('closeSettings').addEventListener('click', closeSettings);
$id('settingsDoneBtn').addEventListener('click', closeSettings);
// Release camera on any close, including ESC-dismissed dialog
$id('settingsDialog').addEventListener('close', stopAndClearTracking);
$id('settingsDialog').addEventListener('input', e => {
  // s_masterVolume is handled by its own dedicated listener below (transport sync).
  // s_jsonPreview is a readonly textarea — skip it to avoid re-serialising on every keystroke.
  if (e.target.id === 's_jsonPreview' || e.target.id === 's_masterVolume') return;
  // Live-update HUD hide-after label
  if (e.target.id === 's_hudHideAfter') {
    const lbl = $id('s_hudHideAfterVal');
    if (lbl) lbl.textContent = `${e.target.value}s`;
  }
  // Live-update rich idle screen when toggled
  if (e.target.id === 's_displayRichIdle') {
    if (e.target.checked) renderIdleScreen();
    else {
      const el = $id('idleHint');
      if (el) el.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="12" stroke="currentColor" stroke-width="1" opacity=".25"/><path d="M11 8.5l7 4.5-7 4.5V8.5z" fill="currentColor" opacity=".3"/></svg><span>Space to play</span>';
    }
  }
  syncSessionFromSettings(); applyCssVars(); renderThemeGrid();
});

// Mode selector button — opens Settings > Playback tab where session modes live
$id('s_openModeSelector')?.addEventListener('click', () => {
  $id('settingsDoneBtn')?.click(); // close settings first
  setTimeout(() => {
    // Reopen Settings at the Playback tab so the mode picker is visible
    const playbackTab = document.querySelector('.settings-tab[data-stab="playback"]');
    if (playbackTab) playbackTab.click();
    $id('settingsBtn')?.click();
    setTimeout(() => {
      $id('sidebarModeSelector')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 200);
  }, 80);
});
$id('saveCustomThemeBtn')?.addEventListener('click', saveCustomTheme);
$id('deleteCustomThemeBtn')?.addEventListener('click', deleteCustomTheme);

// ── Profile Settings Tab ──────────────────────────────────────────────────────
function syncProfileSettingsTab() {
  const p = loadProfile();
  const sv = (id, val) => { const el = $id(id); if (el) el.value = val ?? ''; };
  sv('sp_displayName', p.displayName);
  sv('sp_avatarEmoji', p.avatarEmoji || '🧘');
  sv('sp_goals',       p.goals);
  sv('sp_primaryUse',  p.primaryUse || 'self');
  sv('sp_role',        p.role || 'primary');
  sv('sp_dobDay',      p.dobDay);
  sv('sp_dobMonth',    p.dobMonth);
  sv('sp_ageRange',    p.ageRange);
  sv('sp_gender',      p.gender);
  sv('sp_fitnessLevel',p.fitnessLevel);
  sv('sp_unitSystem',  p.unitSystem || 'metric');
  sv('sp_focusWindow', p.focusAvgWindow || 14);
  _syncProfileImperialMetric(p);
  _updateSettingsZodiac(p);
  _updateSettingsBmi(p);
}

function _syncProfileImperialMetric(p) {
  const imp = (p.unitSystem || 'metric') === 'imperial';
  const hLabel = $id('sp_heightLabel'), wLabel = $id('sp_weightLabel');
  if (hLabel) hLabel.firstChild.textContent = imp ? 'Height (ft/in)' : 'Height (cm)';
  if (wLabel) wLabel.firstChild.textContent = imp ? 'Weight (lbs)' : 'Weight (kg)';
  const hEl = $id('sp_heightCm'), wEl = $id('sp_weightKg');
  if (hEl) { hEl.id = imp ? 'sp_heightImp' : 'sp_heightCm'; hEl.value = imp && p.heightCm ? Math.round(p.heightCm/2.54/12)+'ft '+(Math.round(p.heightCm/2.54)%12)+'in' : (p.heightCm || ''); }
  if (wEl) { wEl.value = imp && p.weightKg ? +(p.weightKg * 2.20462).toFixed(1) : (p.weightKg || ''); }
  if (hEl) { hEl.id = 'sp_heightCm'; hEl.type = imp ? 'text' : 'number'; hEl.placeholder = imp ? "5\'10\"" : '175'; }
  const bf = $id('sp_bodyFatPct'); if (bf) bf.value = p.bodyFatPct || '';
}

function _updateSettingsZodiac(p) {
  const z = document.getElementById('sp_zodiacDisplay');
  if (!z) return;
  const { _zodiacSign } = window._profileHelpers ?? {};
  const day = $id('sp_dobDay')?.value, month = $id('sp_dobMonth')?.value;
  // Use simple lookup inline
  const cuts = [[1,20,'Capricorn','Aquarius'],[2,19,'Aquarius','Pisces'],[3,21,'Pisces','Aries'],
    [4,20,'Aries','Taurus'],[5,21,'Taurus','Gemini'],[6,21,'Gemini','Cancer'],
    [7,23,'Cancer','Leo'],[8,23,'Leo','Virgo'],[9,23,'Virgo','Libra'],
    [10,23,'Libra','Scorpio'],[11,22,'Scorpio','Sagittarius'],[12,22,'Sagittarius','Capricorn']];
  const d = Number(day), m = Number(month);
  const sign = (d && m) ? (d < cuts[m-1][1] ? cuts[m-1][2] : cuts[m-1][3]) : null;
  z.textContent = sign ? `✦ ${sign}` : '—';
}

function _updateSettingsBmi(p) {
  const el = $id('sp_bmiDisplay'); if (!el) return;
  const h = p.heightCm, w = p.weightKg;
  if (!h || !w) { el.textContent = ''; return; }
  const bmi = +(w / ((h/100)**2)).toFixed(1);
  const cat = bmi<18.5?'Underweight':bmi<25?'Healthy weight':bmi<30?'Overweight':'Obese range';
  const col = bmi<18.5?'#5fa0dc':bmi<25?'#7dc87a':bmi<30?'#f0a04a':'#e05050';
  el.innerHTML = `<span style="color:${col};font-weight:600">BMI ${bmi}</span> <span style="color:rgba(255,255,255,0.3)">${cat}</span>`;
}

// Wire Profile Settings tab change handlers (once, on first call)
let _profileSettingsWired = false;
function _wireProfileSettings() {
  if (_profileSettingsWired) return; _profileSettingsWired = true;
  const save = (key, val) => { const p = loadProfile(); p[key] = val; saveProfile(p); updateMenubarAvatar(p); };
  [['sp_displayName','displayName'],['sp_avatarEmoji','avatarEmoji'],['sp_goals','goals'],
   ['sp_primaryUse','primaryUse'],['sp_role','role'],['sp_ageRange','ageRange'],
   ['sp_gender','gender'],['sp_fitnessLevel','fitnessLevel']].forEach(([id,key]) => {
    $id(id)?.addEventListener('input',  e => save(key, e.target.value));
    $id(id)?.addEventListener('change', e => save(key, e.target.value));
  });
  ['sp_dobDay','sp_dobMonth'].forEach(id => $id(id)?.addEventListener('change', () => {
    const p = loadProfile();
    p.dobDay   = $id('sp_dobDay')?.value || '';
    p.dobMonth = $id('sp_dobMonth')?.value || '';
    saveProfile(p); _updateSettingsZodiac(p);
  }));
  $id('sp_heightCm')?.addEventListener('change', e => {
    const p = loadProfile();
    const v = parseFloat(e.target.value);
    p.heightCm = Number.isFinite(v) && v >= 100 ? v : null;
    saveProfile(p); _updateSettingsBmi(p);
  });
  $id('sp_weightKg')?.addEventListener('change', e => {
    const p = loadProfile();
    const v = parseFloat(e.target.value);
    p.weightKg = Number.isFinite(v) && v >= 30 ? v : null;
    saveProfile(p); _updateSettingsBmi(p);
  });
  $id('sp_bodyFatPct')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    const p = loadProfile();
    p.bodyFatPct = Number.isFinite(v) && v >= 3 ? v : null;
    saveProfile(p);
  });
  $id('sp_unitSystem')?.addEventListener('change', e => {
    const p = loadProfile(); p.unitSystem = e.target.value; saveProfile(p);
    _syncProfileImperialMetric(p);
  });
  $id('sp_focusWindow')?.addEventListener('change', e => {
    const p = loadProfile(); p.focusAvgWindow = Number(e.target.value); saveProfile(p);
  });
}

// ── AI Settings Tab ───────────────────────────────────────────────────────────
async function syncApiKeyDisplay() {
  const { getApiKey, hasApiKey, setApiKey, clearApiKey } = await import('./ai-authoring.js').catch(() => ({}));
  if (!hasApiKey) return;
  const el = $id('sp_apiKeyDisplay'); if (!el) return;
  const has = hasApiKey();
  el.innerHTML = has
    ? `<div style="display:flex;align-items:center;gap:8px">
         <span style="font:11px var(--mono);color:var(--c-green);flex:1">••••••••${getApiKey().slice(-4)} ✓</span>
         <button id="sp_clearApiKey" style="font-size:10.5px;padding:2px 8px;color:var(--danger)">Remove</button>
       </div>`
    : `<div style="display:flex;gap:6px">
         <input type="password" id="sp_apiKeyInput" placeholder="sk-ant-…"
           style="flex:1;font-size:11px;font-family:var(--mono)" autocomplete="off" spellcheck="false"/>
         <button id="sp_saveApiKey" class="btn-accent" style="font-size:11px;padding:4px 10px">Save</button>
       </div>`;
  $id('sp_clearApiKey')?.addEventListener('click', async () => {
    await clearApiKey?.();
    syncApiKeyDisplay();
    notify.success('API key removed.');
  });
  $id('sp_saveApiKey')?.addEventListener('click', async () => {
    const key = $id('sp_apiKeyInput')?.value?.trim();
    if (!key?.startsWith('sk-ant-')) { notify.warn('Key must start with "sk-ant-"'); return; }
    await setApiKey?.(key);
    syncApiKeyDisplay();
    notify.success('API key saved.');
  });
}

// ── System tab buttons ─────────────────────────────────────────────────────────
$id('restartOnboardingBtn')?.addEventListener('click', () => {
  try { localStorage.removeItem(ONBOARD_KEY); } catch {}
  $id('settingsDialog').close();
  setTimeout(() => _showOnboardingModal(), 300);
});

$id('clearProfileSettingsBtn')?.addEventListener('click', async () => {
  const step1 = await notify.confirm(
    'Clear all profile data and session history?',
    { confirmLabel: 'Yes, clear it', danger: true }
  );
  if (!step1) return;
  const step2 = await notify.confirm(
    'Are you really, really sure? 😢\nThis permanently erases your streak, history, and profile. No undo.',
    { confirmLabel: 'Yes, delete everything', cancelLabel: 'No, keep it', danger: true }
  );
  if (!step2) return;
  clearProfile();
  await clearStoredAnalytics();
  await clearMetricsHistory();
  notify.success('Profile and history cleared.');
  const _pdlgClear = document.getElementById('profileDialog');
  if (_pdlgClear?.open) renderProfilePanel('profileDialogBody').catch(() => {});
  updateMenubarAvatar(loadProfile());
});

$id('resetAllSettingsBtn')?.addEventListener('click', async () => {
  const ok = await notify.confirm(
    'Reset all settings (appearance, playback, FunScript, safety, advanced) to their factory defaults?\n\nSession content and profile data are not affected.',
    { confirmLabel: 'Reset settings', danger: true }
  );
  if (!ok) return;
  // Replace session settings fields with fresh defaults while preserving content
  const fresh = normalizeSession(defaultSession());
  // Selectively restore settings keys (not blocks/scenes/rules/playlists/tracks)
  // SETTINGS_KEYS imported from state.js — single source of truth shared with profile panel
  history.push(); // make this reset undoable, consistent with profile-panel reset
  for (const key of SETTINGS_KEYS) {
    if (key in fresh) state.session[key] = fresh[key];
  }
  persist();
  syncSettingsForms();
  applyCssVars();
  notify.success('All settings restored to defaults.');
});

// ── Quarantine recovery ────────────────────────────────────────────────────────
// Show the recovery card only when a quarantined session payload exists
(async () => {
  // QUARANTINE_KEY already imported statically from state.js at top of file
  const hasQuarantine = (() => {
    try { return !!localStorage.getItem(QUARANTINE_KEY); } catch { return false; }
  })();
  if (hasQuarantine) {
    const card = $id('quarantineRecoveryCard');
    if (card) card.style.display = 'block';
  }

  $id('loadQuarantinedBtn')?.addEventListener('click', async () => {
    let raw;
    try { raw = localStorage.getItem(QUARANTINE_KEY); } catch { raw = null; }
    if (!raw) { notify.warn('No quarantined session found.'); return; }

    // Write payload into the JSON preview textarea
    const preview = $id('s_jsonPreview');
    if (preview) preview.value = raw;

    // Open the settings dialog and navigate to the Advanced tab
    // (JSON editor lives in the Advanced section — tabs use data-stab, sections use data-section)
    if (!$id('settingsDialog')?.open) $id('settingsDialog')?.showModal();
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    const advTab     = document.querySelector('.settings-tab[data-stab="advanced"]');
    const advSection = document.querySelector('.settings-section[data-section="advanced"]');
    if (advTab)     advTab.classList.add('active');
    if (advSection) advSection.classList.add('active');

    // Focus the JSON editor so the user can see it immediately
    setTimeout(() => preview?.focus(), 80);
    notify.info('Quarantined session loaded. Review the JSON, then click Apply to restore.');
  });

  $id('discardQuarantinedBtn')?.addEventListener('click', async () => {
    const ok = await notify.confirm(
      'Permanently discard the quarantined session? This cannot be undone.',
      { confirmLabel: 'Discard', danger: true }
    );
    if (!ok) return;
    try { localStorage.removeItem(QUARANTINE_KEY); } catch {}
    const card = $id('quarantineRecoveryCard');
    if (card) card.style.display = 'none';
    notify.success('Quarantined session discarded.');
  });
})();
$id('startTrackingBtn').addEventListener('click', () => _tracking?.start());
$id('stopTrackingBtn').addEventListener('click',  () => _tracking?.stop());
$id('s_connectDevice')?.addEventListener('click', () => {
  const url = $id('s_deviceWsUrl')?.value?.trim()
    || state.session.advanced?.deviceWsUrl
    || 'ws://localhost:12345';
  connectDevice(url);
});
$id('s_disconnectDevice')?.addEventListener('click', disconnectDevice);

// ── FunScript Editor Dialog ──────────────────────────────────────────────────
let _fsDialogInitialized = false;

function openFsDialog(trackId) {
  const dlg = $id('fsDialog');
  if (!dlg) return;

  // Update header track name
  const track = state.session.funscriptTracks?.find(t => t.id === trackId)
    ?? state.session.funscriptTracks?.[0];
  const nameEl = $id('fsDlgTrackName');
  if (nameEl) nameEl.textContent = track ? `— ${track.name}` : '';

  // Select this track
  if (track) {
    state.selectedSidebarType = 'funscript';
    state.selectedSidebarId   = track.id;
  }

  // Initialize the timeline canvas (once)
  const fsCanvas = $id('fsCanvas');
  if (fsCanvas && !_fsDialogInitialized) {
    _fsDialogInitialized = true;
    initTimeline(fsCanvas);
  }

  dlg.showModal();
  // Restore previously saved zoom, then resize canvases
  restoreZoom();
  requestAnimationFrame(() => {
    const fsCanvas = $id('fsCanvas');
    if (fsCanvas) {
      fsCanvas.width  = fsCanvas.offsetWidth  * devicePixelRatio;
      fsCanvas.height = fsCanvas.offsetHeight * devicePixelRatio;
    }
    const oc = $id('overviewCanvas');
    if (oc) oc.width = oc.offsetWidth;
    drawTimeline(state.runtime?.sessionTime ?? null);
  });

  // Observe canvas size changes while dialog is open
  if (fsCanvas && !fsCanvas._resizeObserver) {
    fsCanvas._resizeObserver = new ResizeObserver(() => {
      if (!$id('fsDialog')?.open) return;
      fsCanvas.width  = fsCanvas.offsetWidth  * devicePixelRatio;
      fsCanvas.height = fsCanvas.offsetHeight * devicePixelRatio;
      const oc = $id('overviewCanvas');
      if (oc) oc.width = oc.offsetWidth;
      drawTimeline(state.runtime?.sessionTime ?? null);
    });
    fsCanvas._resizeObserver.observe(fsCanvas.parentElement);
  }
}

function closeFsDialog() {
  const dlg = $id('fsDialog');
  if (dlg?.open) dlg.close();
  // Reset edit mode
  state.fsEditMode = false;
  const btn = $id('fsEditToggle');
  if (btn) { btn.classList.remove('active'); btn.textContent = '✎ Edit'; }
}

// Close button inside dialog
$id('fsDialogCloseBtn')?.addEventListener('click', closeFsDialog);

// Close on backdrop click (click on the <dialog> element itself)
$id('fsDialog')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeFsDialog();
});

// Close on Escape (browser fires 'cancel' on dialog)
$id('fsDialog')?.addEventListener('cancel', e => {
  e.preventDefault();
  closeFsDialog();
});

// Audio-from-file quick-launch in dialog header
$id('fsDlgAudioFile')?.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = ''; // reset so same file can be re-selected

  const { generateFsFromAudio, drawEnvelopePreview } = await import('./audio-analyze.js').catch(err => {
    notify.error('Audio analysis module failed to load.');
    console.error(err);
    return {};
  });
  if (!generateFsFromAudio) return;
  notify.info(`Analysing "${file.name}"…`);

  try {
    const track = await generateFsFromAudio(file, {}, (msg, pct) => {
      document.title = `ASS · ${pct}% ${msg}`;
    });

    const { _envelope, _hopMs, _peaks, ...cleanTrack } = track;

    history.push();
    state.session.funscriptTracks.push(cleanTrack);
    if (track._generated?.durationMs) {
      const needed = Math.ceil(track._generated.durationMs / 1000);
      if (needed > state.session.duration) {
        state.session.duration = needed;
        const tEl = $id('tTotal');
        if (tEl) tEl.textContent = fmt(state.session.duration);
      }
    }
    persist();
    renderSidebar();

    // Switch to the new track in the editor
    state.selectedSidebarType = 'funscript';
    state.selectedSidebarId   = cleanTrack.id;
    const nameEl = $id('fsDlgTrackName');
    if (nameEl) nameEl.textContent = `— ${cleanTrack.name}`;
    if ($id('fsDialog')?.open) drawTimeline();

    document.title = 'Adaptive Session Studio';
    notify.success(`Generated from "${file.name}" — ${cleanTrack.actions.length.toLocaleString()} points`);

  } catch (err) {
    console.error('Audio analysis failed:', err);
    document.title = 'Adaptive Session Studio';
    notify.error(`Analysis failed: ${err.message || 'unknown error'}`);
  }
});

// Edit mode toggle (inside dialog header)
$id('fsEditToggle')?.addEventListener('click', () => {
  state.fsEditMode = !state.fsEditMode;
  const btn = $id('fsEditToggle');
  btn.classList.toggle('active', state.fsEditMode);
  btn.textContent = state.fsEditMode ? '✎ Editing' : '✎ Edit';
  drawTimeline(state.runtime?.sessionTime ?? null);
  updateTransformBar();
});

// Zoom reset (inside dialog header)
$id('zoomResetBtn')?.addEventListener('click', () => {
  resetZoom();
  saveZoom();
  drawTimeline(state.runtime?.sessionTime ?? null);
});

// FunScript transform bar + single-point editor
function updateTransformBar() {
  const bar = $id('fsTransformBar');
  if (!bar) return;
  const show = state.fsEditMode;
  bar.style.display = show ? 'flex' : 'none';
  const count = $id('fs_selectionCount');
  if (count) count.textContent = state.selectedFsPoints.size ? `${state.selectedFsPoints.size} pts selected` : '';

  // Single-point editor — shown when exactly one point is selected in edit mode
  const ptEditor = $id('fsPointEditor');
  if (!ptEditor) return;
  const singlePoint = show && state.selectedFsPoints.size === 1 ? state.selectedFsPoint : null;
  if (singlePoint?.actionRef) {
    ptEditor.style.display = 'flex';
    const a = singlePoint.actionRef;
    const ptTime = $id('pt_time'), ptPos = $id('pt_pos'), ptInfo = $id('pt_info');
    if (ptTime) ptTime.value = a.at ?? 0;
    if (ptPos)  ptPos.value  = a.pos ?? 0;
    if (ptInfo) ptInfo.textContent = `at ${a.at}ms`;
  } else {
    ptEditor.style.display = 'none';
  }
}

$id('fs_applyTransform')?.addEventListener('click', () => {
  history.push();
  transformPoints({
    timeScale:  Number($id('fs_timeScale')?.value  ?? 1),
    posScale:   Number($id('fs_posScale')?.value   ?? 1),
    timeOffset: Number($id('fs_timeOffset')?.value ?? 0),
    posOffset:  Number($id('fs_posOffset')?.value  ?? 0),
  });
  updateTransformBar();
  notify.success('Transform applied.');
});
$id('fs_selectAll')?.addEventListener('click',   () => { selectAllPoints(); updateTransformBar(); });
$id('fs_clearSelect')?.addEventListener('click', () => {
  state.selectedFsPoints.clear(); state.selectedFsPoint = null;
  drawTimeline(state.runtime?.sessionTime ?? null); updateTransformBar();
});

// Single-point editor apply / delete
$id('pt_apply')?.addEventListener('click', () => {
  const sp = state.selectedFsPoint;
  if (!sp?.actionRef) return;
  const newAt  = parseInt($id('pt_time')?.value ?? sp.actionRef.at, 10);
  const newPos = parseInt($id('pt_pos')?.value  ?? sp.actionRef.pos, 10);
  if (!Number.isFinite(newAt) || !Number.isFinite(newPos)) return;
  history.push();
  sp.actionRef.at  = Math.max(0, newAt);
  sp.actionRef.pos = Math.max(0, Math.min(100, newPos));
  // Re-sort track by time after position change
  const track = state.session.funscriptTracks.find(t => t.id === sp.trackId);
  if (track) track.actions.sort((a, b) => a.at - b.at);
  persist();
  drawTimeline(state.runtime?.sessionTime ?? null);
  updateTransformBar();
  notify.success('Point updated.');
});
$id('pt_delete')?.addEventListener('click', () => {
  const sp = state.selectedFsPoint;
  if (!sp?.actionRef) return;
  const track = state.session.funscriptTracks.find(t => t.id === sp.trackId);
  if (!track) return;
  history.push();
  track.actions = track.actions.filter(a => a !== sp.actionRef);
  state.selectedFsPoints.delete(sp.actionRef);
  state.selectedFsPoint = null;
  persist();
  drawTimeline(state.runtime?.sessionTime ?? null);
  updateTransformBar();
  notify.success('Point deleted.');
});

// Update transform bar point count on canvas interaction
document.addEventListener('mouseup', () => {
  if (state.fsEditMode) updateTransformBar();
});

// ── Keyboard shortcuts (per README) ─────────────────────────────────────────
let _shiftAlone    = false; // true if Shift pressed without another key

document.addEventListener('keydown', e => {
  const inField = e.target.matches('input,textarea,select');

  // ? key opens shortcut reference overlay
  if (e.key === '?' && !inField && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const ov = $id('shortcutOverlay');
    if (ov) ov.style.display = ov.style.display === 'flex' ? 'none' : 'flex';
    return;
  }

  // Escape closes shortcut overlay if open
  if (e.key === 'Escape' && $id('shortcutOverlay')?.style.display === 'flex') {
    $id('shortcutOverlay').style.display = 'none';
    return;
  }

  // Escape in a focused field:
  //   – if session is running → emergency stop takes priority (time-critical)
  //   – otherwise → blur the field (standard UX)
  if (e.key === 'Escape' && inField) {
    if (state.runtime) {
      e.preventDefault();
      e.target.blur();
      emergencyStop();
      document.exitFullscreen?.().catch(() => {});
    } else {
      e.target.blur();
    }
    return;
  }

  // Ctrl+, opens settings (common convention)
  if (e.key === ',' && e.ctrlKey && !inField) {
    e.preventDefault();
    $id('settingsBtn')?.click();
    return;
  }

  if (inField && e.key !== 'Escape' && !e.ctrlKey) return;

  // If any non-modifier key pressed while Shift held → not standalone
  if (e.shiftKey && e.key !== 'Shift') _shiftAlone = false;

  switch (e.key) {
    case 'Shift':
      _shiftAlone = true; // may be cleared by subsequent key
      break;

    case ' ':
      e.preventDefault();
      if (!state.runtime)            startPlayback();
      else if (state.runtime.paused) resumePlayback();
      else                           pausePlayback();
      break;

    // Arrow keys: L/R = ±10s, U/D = ±30s  (per README)
    case 'ArrowLeft':  e.preventDefault(); skipBy(-10); break;
    case 'ArrowRight': e.preventDefault(); skipBy(10);  break;
    case 'ArrowUp':    e.preventDefault(); skipBy(30);  break;
    case 'ArrowDown':  e.preventDefault(); skipBy(-30); break;

    // Graceful stop + exit fullscreen
    case 'Enter':
    case 'F12':
      e.preventDefault();
      stopPlayback();
      document.exitFullscreen?.().catch(() => {});
      break;

    // ESC: immediate emergency stop — time-critical, no double-press required
    case 'Escape': {
      e.preventDefault();
      emergencyStop();
      document.exitFullscreen?.().catch(() => {});
      break;
    }

    // Macro injection slots 1–5 (per README)
    case '1': case '2': case '3': case '4': case '5': {
      if (inField) break;
      _shiftAlone = false;
      const macro = getSlotMacro(Number(e.key));
      if (macro) { e.preventDefault(); injectMacro(macro.id); }
      break;
    }

    // Editor shortcuts
    case 'd': case 'D':
      if (!inField && state.selectedBlockId) duplicateBlock(); break;
    case 'n': case 'N':
      if (!inField && state.session.scenes?.length) { e.preventDefault(); skipToNextScene(); }
      break;
    case 'f': case 'F':
      if (!inField) {
        if (!document.fullscreenElement) $id('mainStage').requestFullscreen?.();
        else document.exitFullscreen?.();
      }
      break;
    case 'e': case 'E':
      if (!inField) {
        state.fsEditMode = !state.fsEditMode;
        const btn = $id('fsEditToggle');
        btn?.classList.toggle('active', state.fsEditMode);
        if (btn) btn.textContent = state.fsEditMode ? '✎ Editing' : '✎ Edit';
        drawTimeline(state.runtime?.sessionTime ?? null);
      }
      break;
    // A = select all FunScript points (edit mode only)
    case 'a': case 'A':
      if (!inField && state.fsEditMode) { e.preventDefault(); selectAllPoints(); }
      break;
    case 'Delete': case 'Backspace':
      if (!inField && state.selectedBlockId) { e.preventDefault(); deleteBlock(); }
      break;
    case 's':
      if (e.ctrlKey && e.shiftKey) { e.preventDefault(); $id('exportZipBtn').click(); break; }
      if (e.ctrlKey) { e.preventDefault(); $id('exportPackageBtn').click(); }
      break;
    case '0':
      if (e.ctrlKey) { e.preventDefault(); resetZoom(); drawTimeline(state.runtime?.sessionTime ?? null); }
      break;

    // ── Phase 2 Live Override controls ──────────────────────────────────────
    // [ / ] → Intensity -10% / +10%   , / . → Speed -0.1× / +0.1×   r → Reset
    case '[': {
      if (inField) break;
      e.preventDefault();
      const cur = state.liveControl?.intensityScale ?? 1;
      setLiveIntensity(Math.max(0, +(cur - 0.1).toFixed(2)));
      const pct = Math.round((state.liveControl?.intensityScale ?? cur) * 100);
      showLiveControlToast(`Intensity ${pct}%`);
      break;
    }
    case ']': {
      if (inField) break;
      e.preventDefault();
      const cur = state.liveControl?.intensityScale ?? 1;
      setLiveIntensity(Math.min(2, +(cur + 0.1).toFixed(2)));
      const pct = Math.round((state.liveControl?.intensityScale ?? cur) * 100);
      showLiveControlToast(`Intensity ${pct}%`);
      break;
    }
    case ',': {
      if (inField) break;
      e.preventDefault();
      const cur = state.liveControl?.speedScale ?? 1;
      setLiveSpeed(Math.max(0.25, +(cur - 0.1).toFixed(2)));
      const spd = (state.liveControl?.speedScale ?? cur).toFixed(2);
      showLiveControlToast(`Speed ${spd}×`);
      break;
    }
    case '.': {
      if (inField) break;
      e.preventDefault();
      const cur = state.liveControl?.speedScale ?? 1;
      setLiveSpeed(Math.min(4, +(cur + 0.1).toFixed(2)));
      const spd = (state.liveControl?.speedScale ?? cur).toFixed(2);
      showLiveControlToast(`Speed ${spd}×`);
      break;
    }
    case 'r': case 'R': {
      if (inField || e.ctrlKey) break;
      e.preventDefault();
      if (state.liveControl) {
        state.liveControl.intensityScale = 1.0;
        state.liveControl.speedScale = 1.0;
        state.liveControl.randomness = 0.0;
        // Sync sliders if panel is visible
        const iSlider = $id('lc_intensity'); if (iSlider) iSlider.value = 1.0;
        const iLabel  = $id('lc_intensityVal'); if (iLabel) iLabel.textContent = '100%';
        const sSlider = $id('lc_speed'); if (sSlider) sSlider.value = 1.0;
        const sLabel  = $id('lc_speedVal'); if (sLabel) sLabel.textContent = '1.00×';
        const rSlider = $id('lc_random'); if (rSlider) rSlider.value = 0;
        const rLabel  = $id('lc_randomVal'); if (rLabel) rLabel.textContent = '0%';
        showLiveControlToast('Controls reset ↺');
      }
      break;
    }

    // Undo / Redo
    case 'z':
      if (e.ctrlKey && !e.shiftKey) { e.preventDefault(); history.undo(); }
      break;
    case 'Z':
    case 'y':
      if (e.ctrlKey) { e.preventDefault(); history.redo(); }
      break;
    case '?':
    case '/':
      if (!inField) { e.preventDefault(); toggleShortcutsOverlay(); }
      break;
  }
});

// Shift keyup: if no other key was pressed during hold → toggle FS pause
document.addEventListener('keyup', e => {
  if (e.key === 'Shift' && _shiftAlone) {
    _shiftAlone = false;
    if (state.runtime) toggleFsPause();
  }
});

// ── Keyboard shortcuts overlay (? key) ───────────────────────────────────────
// Handler hoisted to module scope so all close paths (toggle, ✕ btn, backdrop,




// ── AudioContext resume (browser autoplay policy) ─────────────────────────────
// Browsers suspend AudioContext until a user gesture. This resumes it on the
// first click or keydown anywhere on the page.
let _audioCtxResumed = false;
function tryResumeAudio() {
  if (_audioCtxResumed) return;
  _audioCtxResumed = true;
  resumeAudioEngine(); // statically imported from audio-engine.js
}
document.addEventListener('click',   tryResumeAudio, { once: true });
document.addEventListener('keydown',  tryResumeAudio, { once: true });

initMacroLibraryEvents();

// ── Live Control Panel ────────────────────────────────────────────────────────
initLiveControl();

// ── Fullscreen HUD ────────────────────────────────────────────────────────────
initFullscreenHud();
renderIdleScreen();

// Keep vizStageCanvas pixel-crisp on window resize during active viz playback
window.addEventListener('resize', () => {
  const vizStage = $id('vizStageCanvas');
  if (vizStage && vizStage.dataset.blockId && vizStage.style.display !== 'none') {
    vizStage.width  = vizStage.offsetWidth  * devicePixelRatio || vizStage.width;
    vizStage.height = vizStage.offsetHeight * devicePixelRatio || vizStage.height;
    // mountVizBlock will be called on the next RAF tick via playback — canvas clears automatically
  }
}, { passive: true });

// ── Undo / Redo ───────────────────────────────────────────────────────────────
history.onchange(() => {
  renderSidebar(); renderInspector(); syncSettingsForms(); syncTransportControls(); applyCssVars();
  $id('tTotal').textContent = fmt(state.session.duration);
  renderIdleScreen();
  if ($id('fsDialog')?.open) drawTimeline(state.runtime?.sessionTime ?? null);
});
$id('undoBtn')?.addEventListener('click', () => history.undo());
$id('redoBtn')?.addEventListener('click', () => history.redo());

// ── Capabilities ───────────────────────────────────────────────────────────────
detectCapabilities();
applyCapabilityGates();
// Defer capability warnings slightly so UI is fully painted first
setTimeout(warnMissingCapabilities, 1200);

// ── Settings JSON apply / format ────────────────────────────────────────────
$id('applyJsonBtn').addEventListener('click', () => {
  const raw = $id('s_jsonPreview').value;
  try {
    // Guard oversized pasted JSON before parsing — prevents tab freeze
    if (raw.length > 2_000_000) throw new Error(`Pasted JSON is too large (${(raw.length/1e6).toFixed(1)} MB). Max: 2 MB.`);
    history.push();
    const parsed = JSON.parse(raw);
    // Route through the same validator as file import — no separate trust boundary.
    validateImportedSession(parsed, raw.length);
    state.session = normalizeSession(parsed);
    state.selectedBlockId      = state.session.blocks[0]?.id || null;
    state.selectedSidebarType  = null;
    state.selectedSidebarIdx   = null;
    state.selectedSidebarId    = null;
    _afterSessionLoad({ persist: false });
    renderIdleScreen();
    notify.success('JSON applied.');
  } catch (err) {
    history.undo(); // roll back the push
    notify.error(`Apply failed: ${err.message}`);
  }
});
$id('formatJsonBtn').addEventListener('click', () => {
  try { $id('s_jsonPreview').value = JSON.stringify(JSON.parse($id('s_jsonPreview').value), null, 2); }
  catch (err) { notify.error(`Invalid JSON: ${err.message}`); }
});

// ── Slider live value labels ──────────────────────────────────────────────────
const sliderLabels = [
  ['s_speechRate',         's_speechRateVal',       v => v],
  ['s_masterVolume',       's_masterVolumeVal',      v => `${Math.round(v * 100)}%`],
  ['s_playlistAudioVolume','s_pavVal',               v => v],
  ['s_playlistVideoVolume','s_pvvVal',               v => v],
  ['s_fsSpeed',            's_fsSpeedVal',           v => `${v}×`],
  ['s_hudHideAfter',       's_hudHideAfterVal',      v => `${v}s`],
  ['s_safetyMaxInt',       's_safetyMaxIntVal',      v => `${Math.round(v * 100)}%`],
  ['s_safetyMaxSpd',       's_safetyMaxSpdVal',      v => `${parseFloat(v).toFixed(2)}×`],
  ['s_safetyWarn',         's_safetyWarnVal',        v => `${Math.round(v * 100)}%`],
  ['s_safetyReduceTarget', 's_safetyReduceTargetVal',v => `${Math.round(v * 100)}%`],
];
sliderLabels.forEach(([sliderId, labelId, fmtFn]) => {
  const slider = $id(sliderId), label = $id(labelId);
  if (!slider || !label) return;
  slider.addEventListener('input', () => {
    label.textContent = fmtFn(parseFloat(slider.value).toFixed(2).replace(/\.?0+$/, ''));
  });
});

// ── Bidirectional master volume sync (transport bar ↔ settings dialog) ───────
// The transport slider input handler already pushes to s_masterVolume (above).
// This adds the reverse: settings slider → transport bar + state, so either
// control is the canonical source.
$id('settingsDialog')?.addEventListener('input', e => {
  if (e.target.id !== 's_masterVolume') return;
  const val = Number(e.target.value);
  state.session.masterVolume = val;
  const t = $id('masterVolumeSlider');
  if (t) t.value = val;
  if (state.runtime?.usingAudioEngine) refreshVolumes();
  else state.runtime?.backgroundAudio.forEach(a =>
    a.volume = val * state.session.advanced.playlistAudioVolume);
  persist();
});

// Show/hide safety auto-reduce target row when checkbox toggles
$id('settingsDialog')?.addEventListener('change', e => {
  if (e.target.id === 's_safetyAutoReduce') {
    const row = $id('s_safetyReduceTargetRow');
    if (row) row.style.display = e.target.checked ? '' : 'none';
  }
});

// ── Storage budget check ──────────────────────────────────────────────────────
setTimeout(() => {
  const budget = checkStorageBudget();
  if (budget.warning) {
    notify.info(`localStorage is ${budget.percentUsed}% full — consider clearing browser data. Session data is safely stored in IndexedDB.`, 6000);
  }
}, 2000);

// ── Suggestions on startup (deferred so UI paints first) ─────────────────────
setTimeout(() => checkAndNotify(), 3000);

// ── First-run onboarding tutorial ────────────────────────────────────────────
// Shows once per installation. Dismissed permanently via localStorage.
const ONBOARD_KEY = 'ass-onboarded-v1';
if (!((() => { try { return localStorage.getItem(ONBOARD_KEY); } catch { return '1'; } })())) {
  setTimeout(() => _showOnboardingModal(), 800);
}

// Allow profile panel to trigger onboarding restart
window.addEventListener('ass:restartOnboarding', () => {
  try { localStorage.removeItem(ONBOARD_KEY); } catch {}
  _showOnboardingModal();
});

// Module-level reference to the active onboarding dismiss function.
// Allows _showOnboardingModal() to cleanly tear down any previous instance
// (removing its ESC handler) before creating a new one.
let _dismissOnboarding = null;
let _dismissOnboardingNow = null; // instant removal — used by the restart guard

function _showOnboardingModal() {
  // If onboarding is already open, tear it down instantly before building a new one.
  // We bypass the 260ms fade so the old overlay is gone before the new one appears,
  // preventing a brief duplicate-overlay / duplicate-id state in the DOM.
  if (_dismissOnboardingNow) { _dismissOnboardingNow(); _dismissOnboardingNow = null; }
  _dismissOnboarding = null;

  const ov = document.createElement('div');
  ov.id = 'onboardingOverlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'Welcome to Adaptive Session Studio');
  ov.style.cssText = `position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.75);
    backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;
    font-family:Inter,system-ui,sans-serif;`;

  const steps = [
    { icon:'🌱', title:'Welcome to Adaptive Session Studio',
      body:'ASS is a browser-native platform for designing and running immersive adult sessions with adaptive haptics, attention tracking, and behavioral automation. Everything stays on your device — no accounts, no cloud.',
      spotlight: null },
    { icon:'📦', title:'Start with a Content Pack',
      body:'The <b>Tracks</b> sidebar on the left lists your session\'s audio, video, FunScript, and subtitle tracks. Click the <b>Session</b> inspector tab on the right and scroll down to <b>Content Packs</b> to load a ready-made session instantly.',
      spotlight: '.track-panel' },
    { icon:'🧩', title:'Blocks are your timeline',
      body:'Sessions are built from timed <b>Blocks</b> — add them with the chips at the top of the Tracks panel: Text overlays, TTS narration, Audio one-shots, Pause checkpoints, Viz hypnotic animations, and Macro haptic triggers.',
      spotlight: '[data-add-block="text"]' },
    { icon:'🎬', title:'Scenes shape the experience arc',
      body:'<b>Scenes</b> divide the session into phases (Calm → Build → Peak → Recovery). Open the Overlay inspector and click the Scenes row in the sidebar to create scenes and assign automatic intensity profiles.',
      spotlight: '#scenesSummary' },
    { icon:'⚙', title:'Rules make it adaptive',
      body:'<b>Rules</b> fire automatic actions when metrics cross thresholds — pause on attention loss, jump scenes on low engagement. Find them in the Overlay inspector\'s Rules row.',
      spotlight: '#rulesSummary' },
    { icon:'🕹', title:'Haptic devices via Intiface',
      body:'Import a <b>FunScript</b> track using the + in the FunScript section of the Tracks panel. The Timeline Editor below lets you draw and edit stroke patterns. Connect a device via the FunScript inspector.',
      spotlight: '#funscriptList' },
    { icon:'▶', title:'Playback controls',
      body:'Use the transport bar at the bottom to play, pause, seek, and loop your session. During playback, <b>[ ]</b> adjusts intensity, <b>, .</b> adjusts speed, <b>1–5</b> fires macro slots, and <b>ESC</b> is the emergency stop.',
      spotlight: '#playBtn' },
    { icon:'👤', title:'Your profile tracks your journey',
      body:'Click your <b>avatar</b> in the top-right to open your Profile — XP, levels, daily quests, achievements, and session history. A short tour will explain everything the first time.',
      spotlight: '#profileAvatarBtn' },
  ];

  let step = 0;

  const card = document.createElement('div');
  card.style.cssText = `background:#16161c;border:0.5px solid rgba(255,255,255,0.12);
    border-radius:16px;padding:28px 28px 22px;max-width:420px;width:90vw;
    box-shadow:0 12px 50px rgba(0,0,0,0.7);`;

  // Spotlight element — adds a pulsing ring around the target UI element
  let _spotlightEl = null;
  function _clearSpotlight() {
    if (_spotlightEl) {
      _spotlightEl.style.outline = '';
      _spotlightEl.style.outlineOffset = '';
      _spotlightEl.style.boxShadow = '';
      _spotlightEl.style.transition = '';
      _spotlightEl = null;
    }
  }
  function _applySpotlight(selector) {
    _clearSpotlight();
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    _spotlightEl = el;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    el.style.transition = 'outline 0.2s, box-shadow 0.2s';
    el.style.outline = '2px solid rgba(127,176,255,0.9)';
    el.style.outlineOffset = '3px';
    el.style.boxShadow = '0 0 0 6px rgba(127,176,255,0.15), 0 0 20px rgba(127,176,255,0.25)';
  }

  function render() {
    const s = steps[step];
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-family:Syne,sans-serif;font-size:13px;font-weight:600;color:#e2e0d8;letter-spacing:.03em">
          Getting started
        </div>
        <span style="font-size:11px;color:rgba(255,255,255,0.25)">${step+1} / ${steps.length}</span>
      </div>
      <div style="font-size:2.2rem;margin-bottom:12px;line-height:1">${s.icon}</div>
      <div style="font-size:15px;font-weight:600;color:#e2e0d8;margin-bottom:8px;font-family:Syne,sans-serif">${s.title}</div>
      <div style="font-size:12.5px;color:rgba(255,255,255,0.6);line-height:1.7;margin-bottom:24px">${s.body}</div>
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center">
        <button id="ob_skip" style="background:transparent;border:none;color:rgba(255,255,255,0.25);
          font-size:11px;cursor:pointer;padding:0;font-family:inherit">Skip tour</button>
        <div style="display:flex;gap:6px">
          ${step > 0 ? `<button id="ob_back" style="padding:7px 16px;border-radius:7px;
            border:0.5px solid rgba(255,255,255,0.12);background:transparent;
            color:rgba(255,255,255,0.5);font-size:12px;cursor:pointer;font-family:inherit">← Back</button>` : ''}
          <button id="ob_next" style="padding:7px 18px;border-radius:7px;
            border:0.5px solid rgba(127,176,255,0.35);background:rgba(127,176,255,0.1);
            color:#7fb0ff;font-size:12px;cursor:pointer;font-family:inherit;font-weight:500">
            ${step === steps.length - 1 ? 'Get started →' : 'Next →'}
          </button>
        </div>
      </div>`;

    // Spotlight the referenced element after a short delay so layout settles
    setTimeout(() => _applySpotlight(s.spotlight), 80);

    card.querySelector('#ob_skip')?.addEventListener('click', dismiss);
    card.querySelector('#ob_back')?.addEventListener('click', () => { step--; render(); });
    card.querySelector('#ob_next')?.addEventListener('click', () => {
      if (step < steps.length - 1) { step++; render(); }
      else dismiss();
    });
  }

  function dismiss() {
    _clearSpotlight();
    _dismissOnboarding = null; // clear module-level ref so guard doesn't re-enter
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch {}
    document.removeEventListener('keydown', _obEscHandler, true); // always clean up
    ov.style.opacity = '0';
    ov.style.transition = 'opacity 0.25s';
    setTimeout(() => ov.remove(), 260);
  }
  _dismissOnboarding = dismiss; // expose so ESC/backdrop close works externally
  // Instant-removal variant: removes the overlay from DOM without the fade animation.
  // Used by the guard at the top of _showOnboardingModal() to prevent duplicate overlays.
  _dismissOnboardingNow = () => {
    _clearSpotlight();
    _dismissOnboarding = null;
    document.removeEventListener('keydown', _obEscHandler, true);
    ov.remove(); // immediate, no fade
  };

  ov.addEventListener('click', e => { if (e.target === ov) dismiss(); });
  // Escape key dismisses the onboarding overlay — stopPropagation prevents
  // the global handler from also firing emergencyStop() simultaneously
  const _obEscHandler = e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    dismiss();
  };
  document.addEventListener('keydown', _obEscHandler, true);
  ov.appendChild(card);
  document.body.appendChild(ov);
  render();
}

// ── Safety banner dismiss ─────────────────────────────────────────────────────
// IMPORTANT: hide the banner, never remove() it — _showEmergencyBanner() in
// playback.js uses $id('safetyBanner') and will silently fail if the node is gone.
$id('safetyDismiss')?.addEventListener('click', () => {
  const banner = $id('safetyBanner');
  if (banner) banner.style.display = 'none';
});

// ── Init ──────────────────────────────────────────────────────────────────────
applyCssVars();
renderSidebar();
renderInspector();
syncTransportControls();
drawTimeline();
