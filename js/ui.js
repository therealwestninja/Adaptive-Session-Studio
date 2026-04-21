// ── ui.js ──────────────────────────────────────────────────────────────────
// All DOM rendering: sidebar lists, inspector panel, settings dialog.

import { state, persist, fmt, esc, $id, uid, clampInt, themeMap, applyCssVars, applyTheme, builtinThemes, normalizeBlock, normalizeSubtitleTrack, normalizeFunscriptTrack, fileToDataUrl, safeColor } from './state.js';
import { downloadAss } from './subtitle.js';
import { downloadFunScript, refreshTimelineVisibility,
         connectDevice, disconnectDevice, drawTimeline } from './funscript.js';
import { history } from './history.js';
import { renderSuggestions } from './suggestions.js';
import { duplicateBlock, deleteBlock, moveBlockUp, moveBlockDown } from './block-ops.js';
import { notify } from './notify.js';
import { validateMediaFile } from './import-validate.js';
import { refreshVolumes } from './audio-engine.js';
import { renderSceneInspector, attachSceneInspectorEvents } from './scenes.js';
import { addRule, updateRule, deleteRule, toggleRule,
         CONDITIONING_PRESETS, applyPreset } from './rules-engine.js';
import { renderModeSelector }               from './session-modes.js';
import { renderTriggersInspector,
         attachTriggersInspectorEvents }    from './trigger-windows.js';
import { renderAiAuthoringPanel }           from './ai-authoring.js';
import { renderVariablesPanel }             from './variables.js';
import { renderContentPacksPicker }         from './content-packs.js';
import { renderPatternPicker }              from './funscript-patterns.js';

// ── Sidebar ─────────────────────────────────────────────────────────────────
const DOT_COLORS = ['#5fa0dc','#f0a04a','#7dc87a','#b084cc','#e07a5f','#64b5c8'];
export const BLOCK_COLORS = {
  text:     '#5fa0dc',   // blue
  tts:      '#7dc87a',   // green
  audio:    '#f0a04a',   // amber
  video:    '#b084cc',   // lavender
  pause:    '#7a7875',   // grey
  macro:    '#ff8fc8',   // pink
  viz:      '#c8e060',   // lime
  subtitle: '#60d0e0',   // cyan
  breathing:'#80d4b0',   // mint  (new block type)
  entrainment:'#d0a0ff', // violet (new block type)
};
const BLOCK_ICONS  = { text:'T', tts:'◎', audio:'♪', video:'▶', pause:'⏸', funscript:'⚡', macro:'⚙', viz:'🌀', breathing:'💨', entrainment:'〰' };

export function renderSidebar() {
  const inner = $id('sidebarInner') ?? document.querySelector('.sidebar-inner');
  const savedScroll = inner?.scrollTop ?? 0;
  renderAudioList();
  renderVideoList();
  renderBlockList();
  renderSubtitleList();
  renderFunScriptList();
  renderScenesSummary();
  renderRulesSummary();
  renderTriggersSummary();
  renderVariablesPanel('sidebarVariables');
  renderContentPacksPicker('sidebarTemplates');
  renderModeSelector('sidebarModeSelector');
  refreshTimelineVisibility();
  if (inner) inner.scrollTop = savedScroll;
}

function renderRulesSummary() {
  const el = $id('rulesSummary');
  if (!el) return;
  const count  = state.session.rules?.length ?? 0;
  const active = state.session.rules?.filter(r => r.enabled).length ?? 0;
  const isSelected = state.selectedSidebarType === 'rules';
  el.innerHTML = `<div class="sb-item${isSelected ? ' selected' : ''}"
    data-sb-type="rules" style="cursor:pointer">
    <div class="sb-item-dot" style="background:#c8a4ff;border-radius:2px"></div>
    <span class="sb-item-name">Rules</span>
    <span class="sb-item-badge">${active}/${count}</span>
  </div>`;
}

function renderScenesSummary() {
  const el = $id('scenesSummary');
  if (!el) return;
  const count = state.session.scenes?.length ?? 0;
  el.innerHTML = count
    ? `<div class="sb-item${state.selectedSidebarType === 'scenes' ? ' selected' : ''}"
         data-sb-type="scenes" style="cursor:pointer">
         <div class="sb-item-dot" style="background:#7dc87a;border-radius:2px"></div>
         <span class="sb-item-name">Scenes</span>
         <span class="sb-item-badge">${count}</span>
       </div>`
    : `<div class="sb-empty" style="cursor:pointer" data-sb-type="scenes">+ Add scenes</div>`;
}

// ── Targeted selection update ────────────────────────────────────────────────
// Updates only the .selected class on sidebar items without rebuilding any
// innerHTML. Call this after a selection change instead of full renderSidebar().
export function updateSidebarSelection() {
  // Blocks
  document.querySelectorAll('[data-block-id]').forEach(el => {
    el.classList.toggle('selected', el.dataset.blockId === state.selectedBlockId);
  });
  // Audio / video / subtitle / funscript / scenes tracks
  document.querySelectorAll('[data-sb-type]').forEach(el => {
    const type    = el.dataset.sbType;
    const trackId = el.dataset.sbTrackId;
    let selected  = false;
    if (type === 'audio' || type === 'video') {
      selected = state.selectedSidebarType === type && state.selectedSidebarId === trackId;
    } else if (type === 'subtitle' || type === 'funscript') {
      selected = state.selectedSidebarType === type && state.selectedSidebarId === trackId;
    } else if (type === 'block') {
      selected = el.dataset.blockId === state.selectedBlockId;
    } else if (type === 'scenes') {
      selected = state.selectedSidebarType === 'scenes';
    } else if (type === 'rules') {
      selected = state.selectedSidebarType === 'rules';
    } else if (type === 'triggers') {
      selected = state.selectedSidebarType === 'triggers';
    }
    el.classList.toggle('selected', selected);
  });
}

function renderAudioList() {
  const el = $id('audioList');
  if (!el) return;
  const tracks = state.session.playlists.audio;
  if (!tracks.length) { el.innerHTML = '<div class="sb-empty">No audio tracks</div>'; return; }
  el.innerHTML = tracks.map((t, i) => `
    <div class="sb-item${state.selectedSidebarType==='audio'&&state.selectedSidebarId===t.id?' selected':''}" data-sb-type="audio" data-sb-track-id="${t.id}">
      <div class="sb-item-dot" style="background:${DOT_COLORS[i%6]}"></div>
      <span class="sb-item-name">${esc(t.name||`Audio ${i+1}`)}</span>
      <button class="sb-item-mute${t._muted?' muted':''}" data-mute-kind="audio" data-track-id="${t.id}" title="${t._muted?'Unmute':'Mute'}">${t._muted?'✕':'●'}</button>
      <button class="sb-item-del" data-del-kind="audio" data-track-id="${t.id}" title="Remove">×</button>
    </div>`).join('');
}

function renderVideoList() {
  const el = $id('videoList');
  if (!el) return;
  const tracks = state.session.playlists.video;
  if (!tracks.length) { el.innerHTML = '<div class="sb-empty">No video tracks</div>'; return; }
  el.innerHTML = tracks.map((t, i) => `
    <div class="sb-item${state.selectedSidebarType==='video'&&state.selectedSidebarId===t.id?' selected':''}" data-sb-type="video" data-sb-track-id="${t.id}">
      <div class="sb-item-dot" style="background:${DOT_COLORS[(i+3)%6]}"></div>
      <span class="sb-item-name">${esc(t.name||`Video ${i+1}`)}</span>
      <span class="sb-item-badge">${t.mediaKind||'vid'}</span>
      <button class="sb-item-del" data-del-kind="video" data-track-id="${t.id}" title="Remove">×</button>
    </div>`).join('');
}

function renderBlockList() {
  const el = $id('blockList');
  if (!el) return;
  const sorted  = [...state.session.blocks].sort((a, b) => a.start - b.start);
  const scenes  = [...(state.session.scenes ?? [])].sort((a, b) => a.start - b.start);
  if (!sorted.length) { el.innerHTML = '<div class="sb-empty">No blocks. Use the + buttons above.</div>'; return; }

  // Group blocks by scene
  const groups = [];
  if (scenes.length) {
    for (const sc of scenes) {
      const scBlocks = sorted.filter(b => b.start >= sc.start && b.start < sc.end);
      if (scBlocks.length) groups.push({ scene: sc, blocks: scBlocks });
    }
    const sceneBlocks = new Set(groups.flatMap(g => g.blocks.map(b => b.id)));
    const unscened = sorted.filter(b => !sceneBlocks.has(b.id));
    if (unscened.length) groups.push({ scene: null, blocks: unscened });
  } else {
    groups.push({ scene: null, blocks: sorted });
  }

  const blockHtml = (b) => {
    const col     = BLOCK_COLORS[b.type] || '#888';
    const icon    = BLOCK_ICONS[b.type]  || '?';
    const tooltip = `${b.type} · ${fmt(b.start)} → ${fmt(b.start + b.duration)} (${fmt(b.duration)})`;
    return `<div class="sb-item${b.id===state.selectedBlockId?' selected':''}"
      data-sb-type="block" data-block-id="${b.id}" title="${esc(tooltip)}"
      style="border-left-color:${col}" draggable="true">
      <span class="sb-drag-handle" title="Drag to reorder">⠿</span>
      <span style="font-size:11px;flex-shrink:0;width:14px;text-align:center">${icon}</span>
      <span class="sb-item-name">${esc(b.label)}</span>
      <span style="font-size:9px;color:var(--text3);flex-shrink:0;font-family:var(--mono)">${fmt(b.start)}</span>
      <span style="font-size:9px;color:${col};flex-shrink:0;opacity:0.8">·${fmt(b.duration)}</span>
    </div>`;
  };

  el.innerHTML = groups.map(g => {
    if (!g.scene) {
      return (scenes.length
        ? `<div class="sb-scene-lane sb-scene-lane--ungrouped">
            <div class="sb-scene-header">
              <span class="sb-scene-dot" style="background:#888"></span>
              <span class="sb-scene-name">Unscened</span>
              <span class="sb-scene-time">${fmt(g.blocks[0].start)}–${fmt(g.blocks.at(-1).start + g.blocks.at(-1).duration)}</span>
            </div>
            ${g.blocks.map(blockHtml).join('')}
          </div>`
        : g.blocks.map(blockHtml).join(''));
    }
    const sc = g.scene;
    const stateColors = { induction:'#5fa0dc', trance:'#9b7fd4', deepening:'#4baa82',
      peak:'#e05050', descent:'#f0a04a', integration:'#7dc87a', default:'#888' };
    const scColor = stateColors[sc.stateType] ?? stateColors.default;
    return `<div class="sb-scene-lane" style="--scene-col:${scColor}">
      <div class="sb-scene-header" data-scene-id="${sc.id}">
        <span class="sb-scene-dot" style="background:${scColor}"></span>
        <span class="sb-scene-name">${esc(sc.name)}</span>
        <span class="sb-scene-time">${fmt(sc.start)}–${fmt(sc.end)}</span>
        <span class="sb-scene-count">${g.blocks.length}b</span>
      </div>
      ${g.blocks.map(blockHtml).join('')}
    </div>`;
  }).join('');

  // Drag-to-reorder: swap start times between dragged and drop-target blocks
  let _dragId = null;
  el.querySelectorAll('.sb-item[data-block-id]').forEach(item => {
    item.addEventListener('dragstart', e => {
      _dragId = item.dataset.blockId;
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      _dragId = null;
      el.querySelectorAll('.sb-item').forEach(i => i.classList.remove('dragging','drag-over'));
    });
    item.addEventListener('dragover', e => {
      if (!_dragId || item.dataset.blockId === _dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.querySelectorAll('.sb-item').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dragId || item.dataset.blockId === _dragId) return;
      const dragBlock = state.session.blocks.find(b => b.id === _dragId);
      const dropBlock = state.session.blocks.find(b => b.id === item.dataset.blockId);
      if (!dragBlock || !dropBlock) return;
      history.push();
      const tmp = dragBlock.start;
      dragBlock.start = dropBlock.start;
      dropBlock.start = tmp;
      persist();
      renderBlockList();
      // Flag for 'Choreographer' achievement — first drag-to-reorder
      import('./user-profile.js').then(({ loadProfile, saveProfile }) => {
        const p = loadProfile();
        if (!p.hasDragReordered) { p.hasDragReordered = true; saveProfile(p); }
      }).catch(() => {});
    });
  });
}
function renderSubtitleList() {
  const el = $id('subtitleList');
  if (!el) return;
  const tracks = state.session.subtitleTracks;
  if (!tracks.length) { el.innerHTML = '<div class="sb-empty">No subtitle tracks</div>'; return; }
  el.innerHTML = tracks.map((t, i) => `
    <div class="sb-item${state.selectedSidebarType==='subtitle'&&state.selectedSidebarId===t.id?' selected':''}" data-sb-type="subtitle" data-sb-idx="${i}" data-sb-track-id="${t.id}">
      <div class="sb-item-dot" style="background:#5fa0dc;border-radius:2px"></div>
      <span class="sb-item-name">${esc(t.name)}</span>
      <span class="sb-item-badge">${t.events?.length||0}</span>
      <button class="sb-item-mute${t._disabled?' muted':''}" data-mute-kind="subtitle" data-track-id="${t.id}" title="${t._disabled?'Enable':'Disable'}">${t._disabled?'✕':'●'}</button>
      <button class="sb-item-del" data-del-kind="subtitle" data-track-id="${t.id}" title="Remove">×</button>
    </div>`).join('');
}

function renderFunScriptList() {
  const el = $id('funscriptList');
  if (!el) return;
  const tracks = state.session.funscriptTracks;
  if (!tracks.length) { el.innerHTML = '<div class="sb-empty">No FunScript tracks</div>'; return; }
  el.innerHTML = tracks.map((t, i) => {
    const showHeatmap = state.session?.displayOptions?.showFsHeatmap !== false;
    const heatmap = showHeatmap ? _buildFsHeatmap(t.actions ?? [], t._color || '#f0a04a') : '';
    const variant = t.variant ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;
      background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.08);
      color:rgba(255,255,255,0.35);margin-left:3px">${esc(t.variant)}</span>` : '';
    return `
    <div class="sb-item${state.selectedSidebarType==='funscript'&&state.selectedSidebarId===t.id?' selected':''}" data-sb-type="funscript" data-sb-idx="${i}" data-sb-track-id="${t.id}" style="flex-direction:column;align-items:stretch;padding-bottom:0">
      <div style="display:flex;align-items:center;gap:6px;padding-bottom:4px">
        <div class="sb-item-dot" style="background:${t._color||'#f0a04a'};border-radius:2px"></div>
        <span class="sb-item-name">${esc(t.name)}${variant}</span>
        <span class="sb-item-badge">${t.actions?.length||0} pts</span>
        <button class="sb-item-mute${t._disabled?' muted':''}" data-mute-kind="funscript" data-track-id="${t.id}" title="${t._disabled?'Enable':'Disable'}">${t._disabled?'✕':'●'}</button>
        <button class="sb-item-del" data-del-kind="funscript" data-track-id="${t.id}" title="Remove">×</button>
      </div>
      ${heatmap}
    </div>`;
  }).join('');
}

/** Build a speed-color heatmap SVG strip for a FunScript track.
 *  Inspired by ScriptPlayer+ — each pixel-column shows average stroke speed
 *  in that time segment, colour-coded from cool (slow) to hot (fast). */
function _buildFsHeatmap(actions, trackColor) {
  if (!actions || actions.length < 2) return '';
  const W = 200, H = 6;
  const totalMs = actions.at(-1)?.at ?? 0;
  if (totalMs <= 0) return '';
  const COLS = W;
  const msPerCol = totalMs / COLS;

  // Compute per-column max velocity (pos change per ms)
  const cols = new Float32Array(COLS).fill(0);
  for (let j = 1; j < actions.length; j++) {
    const dt  = actions[j].at - actions[j-1].at;
    if (dt <= 0) continue;
    const vel = Math.abs(actions[j].pos - actions[j-1].pos) / dt; // pos/ms
    const col = Math.min(COLS - 1, Math.floor(actions[j-1].at / msPerCol));
    if (vel > cols[col]) cols[col] = vel;
  }
  const maxVel = Math.max(...cols, 0.001);

  // Build coloured rects — from track color (slow) toward white (fast)
  const rects = [];
  for (let c = 0; c < COLS; c++) {
    if (cols[c] === 0) continue;
    const intensity = cols[c] / maxVel; // 0–1
    // Interpolate: low-speed=trackColor dim, high-speed=white-hot
    const alpha = 0.2 + intensity * 0.75;
    rects.push(`<rect x="${c}" y="0" width="1" height="${H}" fill="${trackColor}" opacity="${alpha.toFixed(2)}"/>`);
  }
  if (!rects.length) return '';
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg" style="display:block;border-radius:0 0 4px 4px;opacity:${actions.length > 5 ? 1 : 0.4}"
    title="Speed heatmap — brighter = faster strokes">
    <rect width="${W}" height="${H}" fill="rgba(0,0,0,0.3)"/>
    ${rects.join('')}
  </svg>`;
}

// ── Inspector ───────────────────────────────────────────────────────────────
export function renderInspector() {
  const body = $id('inspBody');
  if (!body) return;
  // Clean up any active viz preview animation before re-rendering
  const existingViz = $id('viz_preview');
  if (existingViz?._unmountOnNextRender) {
    import('./viz-blocks.js').then(({ unmountVizBlock }) => unmountVizBlock(existingViz)).catch(() => {});
  }
  // Session and Status tabs removed — always render the overlay/block inspector
  state.inspTab = 'overlay';
  body.innerHTML = renderOverlayTab();
  attachOverlayTabEvents();
}


function renderOverlayTab() {
  const block = state.session.blocks.find(b => b.id === state.selectedBlockId);

  // Audio playlist track selected?
  if (state.selectedSidebarType === 'audio' && state.selectedSidebarId) {
    const track = state.session.playlists.audio.find(t => t.id === state.selectedSidebarId);
    return track ? renderAudioTrackInspector(track) : '<div class="insp-status">Track not found.</div>';
  }
  // Video/image playlist track selected?
  if (state.selectedSidebarType === 'video' && state.selectedSidebarId) {
    const track = state.session.playlists.video.find(t => t.id === state.selectedSidebarId);
    return track ? renderVideoTrackInspector(track) : '<div class="insp-status">Track not found.</div>';
  }
  // Scenes panel?
  if (state.selectedSidebarType === 'scenes') {
    return renderSceneInspector();
  }
  // Rules panel?
  if (state.selectedSidebarType === 'rules') {
    return renderRulesInspector();
  }
  if (state.selectedSidebarType === 'triggers') {
    return renderTriggersInspector();
  }
  // FunScript track selected?
  if (state.selectedSidebarType === 'funscript' && state.selectedSidebarId) {
    return renderFunScriptInspector();
  }
  // Subtitle track selected?
  if (state.selectedSidebarType === 'subtitle' && state.selectedSidebarId) {
    return renderSubtitleInspector();
  }

  if (!block) {
    // Session overview panel — shown when nothing is selected
    const blocks    = state.session.blocks;
    const ttsBlocks = blocks.filter(b => b.type === 'tts' && b.content);
    const totalWords  = ttsBlocks.reduce((n, b) => n + b.content.trim().split(/\s+/).filter(Boolean).length, 0);
    const totalChars  = ttsBlocks.reduce((n, b) => n + b.content.length, 0);
    const estSpokenSec= Math.round(totalWords / 2.5 / (state.session.speechRate ?? 1));
    const blocksByType= {};
    for (const b of blocks) blocksByType[b.type] = (blocksByType[b.type] || 0) + 1;
    const typeRows = Object.entries(blocksByType)
      .sort((a,b) => b[1]-a[1])
      .map(([t,n]) => `<div class="insp-row"><span>${BLOCK_ICONS[t]||'?'} ${t}</span><span style="color:var(--text);font-weight:500">${n}</span></div>`)
      .join('');
    const scenes = state.session.scenes ?? [];
    const rules  = (state.session.rules ?? []).filter(r => r.enabled);
    return `
    <div class="insp-block-name" style="margin-bottom:10px">📋 Session Overview</div>

    <div class="insp-group">
      <div class="insp-group-label">Composition</div>
      <div class="insp-row"><span>Duration</span><span style="color:var(--text);font-weight:500">${fmt(state.session.duration)}</span></div>
      <div class="insp-row"><span>Total blocks</span><span style="color:var(--text);font-weight:500">${blocks.length}</span></div>
      <div class="insp-row"><span>Scenes</span><span style="color:var(--text);font-weight:500">${scenes.length}</span></div>
      <div class="insp-row"><span>Active rules</span><span style="color:var(--text);font-weight:500">${rules.length}</span></div>
      ${typeRows}
    </div>

    ${ttsBlocks.length ? `<div class="insp-group">
      <div class="insp-group-label">Spoken Content</div>
      <div class="insp-row"><span>TTS blocks</span><span style="color:var(--text)">${ttsBlocks.length}</span></div>
      <div class="insp-row"><span>Total words</span><span style="color:var(--text)">${totalWords.toLocaleString()}</span></div>
      <div class="insp-row"><span>Total chars</span><span style="color:var(--text)">${totalChars.toLocaleString()}</span></div>
      <div class="insp-row"><span>Est. spoken time</span><span style="color:var(--accent);font-weight:500">${fmt(estSpokenSec)}</span></div>
      <div style="margin-top:6px;font-size:10px;color:var(--text3);line-height:1.5">
        At ${state.session.speechRate ?? 1}× speech rate · ~150 wpm baseline
      </div>
    </div>` : ''}

    <div style="margin-top:6px;font-size:10.5px;color:var(--text3);font-style:italic;text-align:center;padding:8px">
      Click a block in the sidebar to edit it
    </div>`;
  }

  // ── Compact block timeline strip ────────────────────────────────────────
  // Shows all blocks proportionally on a duration bar, with the selected
  // block highlighted — gives authors instant visual context.
  const dur = state.session.duration || 1;
  const TYPE_COLORS = {
    text:  '#7fb0ff', tts:  '#7dc87a', audio: '#f0a04a',
    video: '#b084cc', pause: 'rgba(255,255,255,0.1)', macro: '#f0e04a',
  };
  const blockBars = state.session.blocks.map(b => {
    const x = (b.start / dur) * 100;
    const w = Math.max(0.5, (b.duration / dur) * 100);
    const isSelected = b.id === state.selectedBlockId;
    const fill = TYPE_COLORS[b.type] ?? '#888';
    return `<rect x="${x}%" width="${w}%" y="${isSelected ? 0 : 3}" height="${isSelected ? 14 : 8}"
              fill="${fill}" rx="1.5" opacity="${isSelected ? 1 : 0.55}"
              ${isSelected ? '' : ''} />`;
  }).join('');
  const positionStrip = `
    <div style="margin-bottom:10px">
      <svg width="100%" height="14" xmlns="http://www.w3.org/2000/svg"
           style="display:block;border-radius:3px;overflow:hidden">
        <rect width="100%" height="14" fill="rgba(255,255,255,0.04)" rx="3" />
        ${blockBars}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:2px">
        <span>0:00</span>
        <span style="color:var(--accent);font-weight:600">${fmt(block.start)}–${fmt(block.start + block.duration)}</span>
        <span>${fmt(dur)}</span>
      </div>
    </div>`;

  const colorTag = { text:'tag-blue', tts:'tag-green', audio:'tag-amber', video:'tag-purple', pause:'', macro:'tag-pink', viz:'tag-teal', breathing:'tag-green', entrainment:'tag-teal' }[block.type] || '';
  const col = BLOCK_COLORS[block.type] || '#888';
  let html = `
    ${positionStrip}
    <div class="insp-block-header" style="border-left:3px solid ${col}">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span style="font-size:18px;flex-shrink:0">${BLOCK_ICONS[block.type]||'?'}</span>
        <div style="flex:1;min-width:0">
          <input type="text" data-field="label" value="${esc(block.label)}"
            style="font-size:13px;font-weight:600;color:var(--text);background:transparent;
              border:none;outline:none;width:100%;caret-color:${col};
              border-bottom:1px solid transparent"
            onfocus="this.style.borderBottomColor='${col}'"
            onblur="this.style.borderBottomColor='transparent'" />
          <div style="display:flex;align-items:center;gap:5px;margin-top:2px">
            <span style="font-size:9px;padding:1px 6px;border-radius:3px;
              background:${col}22;color:${col};font-weight:600;letter-spacing:.04em;text-transform:uppercase">
              ${block.type}
            </span>
            <span style="font-size:9px;color:var(--text3);font-family:var(--mono)">
              ${fmt(block.start)} → ${fmt(block.start+block.duration)} · ${fmt(block.duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
    <div class="insp-group">
      <div class="insp-group-label">Timing</div>
      <div class="insp-row"><span>Start (s)</span><input type="number" data-field="start" value="${block.start}" min="0" step="1" style="width:80px"/></div>
      <div class="insp-row"><span>Duration (s)</span><input type="number" data-field="duration" value="${block.duration}" min="1" step="1" style="width:80px"/></div>
      <div class="insp-row"><span>End (s)</span><span style="color:var(--text3)">${block.start+block.duration}</span></div>
      <div class="insp-row" style="margin-top:4px;gap:5px">
        <span style="font-size:10px;color:var(--text3)">BPM→duration</span>
        <input id="bpm_input" type="number" placeholder="BPM" min="20" max="300" step="1"
          style="width:52px;font-size:10px" title="Set duration to N beats at this BPM"/>
        <input id="bpm_beats" type="number" placeholder="beats" min="1" max="256" step="1" value="8"
          style="width:46px;font-size:10px"/>
        <button id="bpm_apply_btn" style="font-size:10px;padding:2px 6px" title="Set block duration to beats ÷ BPM">Apply</button>
      </div>
    </div>`;

  if (block.type === 'text') {
    html += `
      <div class="insp-group"><div class="insp-group-label">Content</div>
        <textarea data-field="content" rows="4" style="width:100%;font-size:11px;resize:vertical">${esc(block.content)}</textarea>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;line-height:1.5">
          Template vars: <code>{{intensity}}</code> <code>{{speed}}</code> <code>{{loop}}</code> <code>{{time}}</code> <code>{{scene}}</code>
        </div>
      </div>
      <div class="insp-group"><div class="insp-group-label">Typography</div>
        <div class="insp-row"><span>Size</span><input type="number" data-field="fontSize" value="${block.fontSize||1.2}" min="0.5" max="5" step="0.05" style="width:80px"/></div>
      </div>
      <div class="insp-group"><div class="insp-group-label">Position</div>
        <div class="pos-grid">${['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'].map(p=>`<button class="pos-btn${(block._position||'center')===p?' active':''}" data-pos="${p}">${posLabel(p)}</button>`).join('')}</div>
      </div>`;
  } else if (block.type === 'tts') {
    // Rough speech duration: average speaking rate ~150 wpm ≈ 12.5 chars/sec
    const charCount    = (block.content || '').length;
    const wordCount    = (block.content || '').trim().split(/\s+/).filter(Boolean).length;
    const estSec       = wordCount ? Math.round(wordCount / 2.5) : 0; // ~150 wpm
    const rateHint     = charCount
      ? `${charCount} chars · ~${wordCount} words · ~${estSec}s at default rate`
      : 'No text yet';
    html += `
      <div class="insp-group"><div class="insp-group-label">Spoken text</div>
        <textarea data-field="content" rows="4" style="width:100%;font-size:11px;resize:vertical">${esc(block.content)}</textarea>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;line-height:1.4">${rateHint}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;line-height:1.5">
          Template vars: <code>{{intensity}}</code> <code>{{speed}}</code> <code>{{loop}}</code> <code>{{time}}</code> <code>{{scene}}</code>
        </div>
      </div>
      <div class="insp-row"><span>Volume</span><input type="number" data-field="volume" value="${block.volume??1}" min="0" max="1" step="0.05" style="width:80px"/></div>
      <div class="insp-row" style="align-items:flex-start;flex-direction:column;gap:5px">
        <span style="font-size:11px;color:var(--text2)">Voice</span>
        <div style="display:flex;gap:5px;width:100%">
          <select id="tts_voice_select" style="flex:1;font-size:11px">
            <option value="">— System default —</option>
            ${(typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [])
              .map(v => `<option value="${esc(v.name)}"${block.voiceName===v.name?' selected':''}>${esc(v.name)} (${v.lang})</option>`).join('')}
          </select>
          <button id="tts_preview_btn" title="Preview voice with current text" style="font-size:11px;padding:3px 8px;flex-shrink:0">▶ Preview</button>
        </div>
      </div>`;
  } else if (block.type === 'audio') {
    html += `
      <div class="insp-group"><div class="insp-group-label">File</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:4px">${block.dataUrlName?esc(block.dataUrlName):'No file'}</p>
        <label class="file-pick-btn">Browse…<input type="file" accept="audio/*" data-file-field="dataUrl" hidden /></label>
      </div>
      <div class="insp-row"><span>Volume</span><input type="number" data-field="volume" value="${block.volume??1}" min="0" max="1" step="0.05" style="width:80px"/></div>
      <label style="font-size:11px;color:var(--text2)">Notes<textarea data-field="content" rows="3" style="width:100%;font-size:11px;resize:vertical">${esc(block.content)}</textarea></label>`;
  } else if (block.type === 'video') {
    html += `
      <div class="insp-group"><div class="insp-group-label">File</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:4px">${block.dataUrlName?esc(block.dataUrlName):'No file'}</p>
        <label class="file-pick-btn">Browse…<input type="file" accept="video/*,image/*" data-file-field="dataUrl" hidden /></label>
      </div>
      <div class="insp-row"><span>Mute</span>
        <select data-field="mute" style="width:80px"><option value="true"${block.mute!==false?' selected':''}>Yes</option><option value="false"${block.mute===false?' selected':''}>No</option></select>
      </div>`;
  } else if (block.type === 'pause') {
    html += `<p style="font-size:11px;color:var(--text2);line-height:1.6">Pause block — stage stays quiet while playlist layers continue.</p>`;
  } else if (block.type === 'macro') {
    // Populate macro slot options from current session library + slots
    const macros = state.session.macroLibrary ?? [];
    const slots  = [1,2,3,4,5];
    html += `
      <div class="insp-group"><div class="insp-group-label">Macro trigger</div>
        <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:8px">
          Injects a macro at the start of this block (once per loop).
        </p>
        <div class="insp-row"><span>Slot</span>
          <select data-field="macroSlot" style="width:80px">
            <option value="">—</option>
            ${slots.map(s => `<option value="${s}"${block.macroSlot===s?' selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        ${macros.length ? `
        <div class="insp-row"><span>Macro (override slot)</span>
          <select data-field="macroId" style="width:130px">
            <option value="">Use slot</option>
            ${macros.map(m => `<option value="${m.id}"${block.macroId===m.id?' selected':''}>${esc(m.name)}</option>`).join('')}
          </select>
        </div>` : '<p style="font-size:10.5px;color:var(--text3)">No macros in library. Import or create one.</p>'}
      </div>`;

  } else if (block.type === 'viz') {

    html += `
      <div class="insp-group">
        <div class="insp-group-label">Visualization</div>
        <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:8px">
          Renders a hypnotic animation as the stage background during this block.
          Best used in induction or trance sessions with a 🌀 Guided Induction mode.
        </p>
        <div class="insp-row"><span>Pattern</span>
          <select data-field="vizType" style="width:130px">
            ${VIZ_TYPES.map(v => `<option value="${v.id}"${block.vizType===v.id?' selected':''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="insp-row"><span>Speed</span>
          <input type="number" data-field="vizSpeed" value="${block.vizSpeed??1}" min="0.25" max="4" step="0.25" style="width:70px"/>
          <span style="font-size:10px;color:var(--text3)">×</span>
        </div>
        <div class="insp-row"><span>Color</span>
          <input type="color" data-field="vizColor" value="${block.vizColor||'#c49a3c'}" style="width:40px;height:24px;border:none;background:none;cursor:pointer;padding:0"/>
          <span style="font-size:10px;color:var(--text3)">${block.vizColor||'#c49a3c'}</span>
        </div>
        <div style="margin-top:10px;padding:10px;background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);border-radius:6px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:6px">
            ${VIZ_TYPES.find(v=>v.id===block.vizType)?.desc ?? ''}
          </div>
          <canvas id="viz_preview" width="220" height="100"
            style="display:block;width:100%;border-radius:4px;background:#000"></canvas>
        </div>
      </div>`;

  } else if (block.type === 'breathing') {
    const cycleSec = (block.breathInSec??4)+(block.breathHold1Sec??0)+(block.breathOutSec??6)+(block.breathHold2Sec??0);
    const cycles   = block.breathCycles ?? 0;
    html += `
      <div class="insp-group">
        <div class="insp-group-label">Breathing Exercise</div>
        <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:8px">
          Guides the subject through a breath cycle with visual cues. TTS announces the pattern on entry.
        </p>
        <div class="insp-row"><span>Inhale (s)</span>
          <input type="number" data-field="breathInSec"    value="${block.breathInSec??4}"     min="1" max="30" step="1" style="width:60px"/></div>
        <div class="insp-row"><span>Hold after in</span>
          <input type="number" data-field="breathHold1Sec" value="${block.breathHold1Sec??0}"  min="0" max="30" step="1" style="width:60px"/></div>
        <div class="insp-row"><span>Exhale (s)</span>
          <input type="number" data-field="breathOutSec"   value="${block.breathOutSec??6}"    min="1" max="30" step="1" style="width:60px"/></div>
        <div class="insp-row"><span>Hold after out</span>
          <input type="number" data-field="breathHold2Sec" value="${block.breathHold2Sec??0}"  min="0" max="30" step="1" style="width:60px"/></div>
        <div class="insp-row"><span>Repeat cycles</span>
          <input type="number" data-field="breathCycles"   value="${block.breathCycles??0}"    min="0" max="60" step="1" style="width:60px"/>
          <span style="font-size:10px;color:var(--text3)">0 = fill duration</span></div>
        <div class="insp-row"><span>TTS cue</span>
          <input type="checkbox" data-field="breathCue" ${block.breathCue!==false?'checked':''}/>
          <span style="font-size:10px;color:var(--text3)">Announce pattern via speech</span></div>
        <div style="margin-top:8px;padding:8px;background:rgba(128,212,176,0.06);border:0.5px solid rgba(128,212,176,0.2);border-radius:6px;font-size:11px;color:var(--text2)">
          Cycle: ${cycleSec}s · ${cycles>0?cycles+' cycles ≈ '+fmt(cycleSec*cycles):'fills '+fmt(block.duration)}
        </div>
      </div>`;

  } else if (block.type === 'entrainment') {
    const presets = [
      {l:'Delta · Sleep (2 Hz)',  c:200,b:2},  {l:'Theta · Trance (6 Hz)',c:200,b:6},
      {l:'Alpha · Calm (10 Hz)', c:200,b:10}, {l:'Beta  · Focus (18 Hz)', c:200,b:18},
      {l:'Gamma · Peak (40 Hz)', c:200,b:40},
    ];
    html += `
      <div class="insp-group">
        <div class="insp-group-label">Binaural / Isochronal Entrainment</div>
        <p style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:8px">
          Generates a binaural beat (two tones offset by the beat Hz). Requires stereo headphones.
        </p>
        <div class="insp-row"><span>Preset</span>
          <select id="ent_preset" style="width:160px">
            <option value="">— custom —</option>
            ${presets.map(p=>`<option value="${p.c}:${p.b}">${esc(p.l)}</option>`).join('')}
          </select></div>
        <div class="insp-row"><span>Carrier Hz</span>
          <input type="number" data-field="entCarrierHz" value="${block.entCarrierHz??200}" min="40" max="500" step="10" style="width:70px"/></div>
        <div class="insp-row"><span>Beat Hz</span>
          <input type="number" data-field="entBeatHz"    value="${block.entBeatHz??10}"    min="0.5" max="40" step="0.5" style="width:70px"/></div>
        <div class="insp-row"><span>Waveform</span>
          <select data-field="entWaveform" style="width:100px">
            <option value="sine"${block.entWaveform==='sine'?' selected':''}>Sine</option>
            <option value="square"${block.entWaveform==='square'?' selected':''}>Square</option>
            <option value="sawtooth"${block.entWaveform==='sawtooth'?' selected':''}>Sawtooth</option>
          </select></div>
        <div class="insp-row"><span>Volume</span>
          <input type="range" data-field="entVolume" value="${block.entVolume??0.3}" min="0" max="1" step="0.05" style="flex:1"/>
          <span style="font-size:10px;color:var(--text3);width:34px">${Math.round((block.entVolume??0.3)*100)}%</span></div>
        <div style="margin-top:8px;padding:8px;background:rgba(208,160,255,0.06);border:0.5px solid rgba(208,160,255,0.2);border-radius:6px;font-size:11px;color:var(--text2)">
          ${block.entCarrierHz??200} Hz carrier · ${block.entBeatHz??10} Hz beat · headphones for binaural effect
        </div>
      </div>`;

  } // end block-type if/else chain


  const blockIdx  = state.session.blocks.findIndex(b => b.id === block.id);
  const isFirst   = blockIdx === 0;
  const isLast    = blockIdx === state.session.blocks.length - 1;
  html += `<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
    <button id="ib_up"  style="flex:1;font-size:11px;min-width:60px" title="Move block earlier"${isFirst ? ' disabled' : ''}>↑ Up</button>
    <button id="ib_dn"  style="flex:1;font-size:11px;min-width:60px" title="Move block later"${isLast ? ' disabled' : ''}>↓ Down</button>
    <button id="ib_dup" style="flex:1;font-size:11px;min-width:72px">Duplicate</button>
    <button id="ib_del" style="flex:1;font-size:11px;min-width:56px;color:var(--danger)">Delete</button>
  </div>`;
  // Session-level panels: AI authoring only (templates+variables moved to sidebar)
  html += `
  <div class="insp-group" id="aiAuthoringPanel"></div>
  <div class="insp-group">
    <details id="session_notes_details">
      <summary style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;
        align-items:center;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
        color:rgba(255,255,255,0.25);padding:2px 0">
        <span>Session Notes</span>
        <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:9px;color:rgba(255,255,255,0.15)">
          ${state.session.notes ? state.session.notes.length + ' chars' : 'empty'}
        </span>
      </summary>
      <textarea id="si_notes" rows="4"
        placeholder="Design intent, timing notes, credits… (saved with session, not shown during playback)"
        style="width:100%;font-size:11px;resize:vertical;color:var(--text2);margin-top:6px"
      >${esc(state.session.notes || '')}</textarea>
    </details>
  </div>`;
  return html;
}

// Returns a human-readable file-size estimate from a base64 data URL.
// base64 encodes 3 bytes per 4 characters; the header prefix is negligible.
function _dataUrlSizeMB(dataUrl) {
  if (!dataUrl) return '0';
  const base64Len = dataUrl.length - (dataUrl.indexOf(',') + 1);
  const bytes = Math.round(base64Len * 0.75);
  return (bytes / 1_000_000).toFixed(1);
}

function renderAudioTrackInspector(track) {
  const previewHtml = track.dataUrl
    ? `<div class="insp-group">
        <div class="insp-group-label">Preview</div>
        <audio controls src="${track.dataUrl}"
          style="width:100%;height:36px;margin-top:4px;accent-color:var(--accent,#7fb0ff)">
        </audio>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">
          ~${_dataUrlSizeMB(track.dataUrl)} MB embedded
        </div>
      </div>`
    : `<div class="insp-group"><div style="font-size:11px;color:var(--text3)">No audio file loaded.</div></div>`;

  // Curated CC0 ambient sound library (hosted on freesound.org CDN or similar free CDNs)
  // Each entry has a name, icon, and a direct URL to a loopable audio file
  const AMBIENT_LIBRARY = [
    { name:'Rain on window',    icon:'🌧', url:'https://freesound.org/data/previews/399/399928_4770800-lq.mp3' },
    { name:'Thunderstorm',      icon:'⛈', url:'https://freesound.org/data/previews/398/398726_4770800-lq.mp3' },
    { name:'Ocean waves',       icon:'🌊', url:'https://freesound.org/data/previews/371/371262_6687700-lq.mp3' },
    { name:'Forest birds',      icon:'🌿', url:'https://freesound.org/data/previews/416/416529_5121236-lq.mp3' },
    { name:'Campfire crackling', icon:'🔥', url:'https://freesound.org/data/previews/112/112623_1787186-lq.mp3' },
    { name:'Brown noise',       icon:'〰', url:'https://freesound.org/data/previews/467/467227_9497060-lq.mp3' },
    { name:'Tibetan singing bowl', icon:'🎵', url:'https://freesound.org/data/previews/432/432877_7037-lq.mp3' },
    { name:'Wind through trees', icon:'💨', url:'https://freesound.org/data/previews/398/398699_4770800-lq.mp3' },
    { name:'Coffee shop',       icon:'☕', url:'https://freesound.org/data/previews/341/341695_5858296-lq.mp3' },
    { name:'Deep humming drone',icon:'🔔', url:'https://freesound.org/data/previews/476/476178_9497060-lq.mp3' },
  ];

  const ambientPicker = `
    <div class="insp-group">
      <div class="insp-group-label">Ambient Sound Library <span style="font-weight:400;color:var(--text3);font-size:9px">(CC0)</span></div>
      <p style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.5">
        Click a sound to preview it in a new tab, or use "Load" to embed it directly into this track.
      </p>
      <div style="display:flex;flex-direction:column;gap:3px">
        ${AMBIENT_LIBRARY.map(s => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;
          background:rgba(255,255,255,0.025);border:0.5px solid rgba(255,255,255,0.06)">
          <span style="font-size:13px;flex-shrink:0">${esc(s.icon)}</span>
          <span style="flex:1;font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
          <a href="${esc(s.url)}" target="_blank" rel="noopener"
            style="font-size:10px;color:var(--text3);text-decoration:none;padding:2px 5px;
              border:0.5px solid rgba(255,255,255,0.1);border-radius:3px;flex-shrink:0">▶</a>
        </div>`).join('')}
      </div>
      <p style="font-size:9.5px;color:rgba(255,255,255,0.2);margin-top:6px;line-height:1.5">
        To embed: download a file and use the Browse button on an Audio track. Sounds from freesound.org under CC0 license.
      </p>
    </div>`;

  return `
    <div class="insp-block-name">♪ ${esc(track.name)}</div>
    <div class="insp-group">
      <div class="insp-group-label">Identity</div>
      <label style="font-size:11px;color:var(--text2)">Name<input type="text" id="ai_name" value="${esc(track.name)}" /></label>
    </div>
    ${previewHtml}
    <div class="insp-group">
      <div class="insp-group-label">Volume</div>
      <div class="insp-row">
        <span>Level</span>
        <input type="number" id="ai_volume" value="${track.volume ?? 1}" min="0" max="2" step="0.05" style="width:80px" />
      </div>
      <div class="insp-row">
        <span>Muted</span>
        <button id="ai_mute" class="sb-item-mute${track._muted?' muted':''}"
          data-mute-kind="audio" data-track-id="${track.id}"
          style="min-width:60px;padding:3px 8px;font-size:11px">
          ${track._muted ? '✕ Muted' : '● Active'}
        </button>
      </div>
    </div>
    ${ambientPicker}
    <div style="display:flex;gap:5px;margin-top:8px">
      <button class="danger-btn" data-del-kind="audio" data-track-id="${track.id}"
        style="flex:1;font-size:11px;color:var(--danger)">Remove track</button>
    </div>`;
}

function renderVideoTrackInspector(track) {
  let previewHtml = '';
  if (track.dataUrl) {
    if (track.mediaKind === 'image') {
      previewHtml = `<div class="insp-group">
        <div class="insp-group-label">Preview</div>
        <img src="${track.dataUrl}"
          style="width:100%;max-height:130px;object-fit:contain;border-radius:4px;
                 background:rgba(0,0,0,0.4);display:block;margin-top:4px" />
        <div style="font-size:10px;color:var(--text3);margin-top:3px">
          ~${_dataUrlSizeMB(track.dataUrl)} MB embedded
        </div>
      </div>`;
    } else {
      previewHtml = `<div class="insp-group">
        <div class="insp-group-label">Preview</div>
        <video src="${track.dataUrl}" controls muted
          style="width:100%;max-height:130px;border-radius:4px;background:#000;display:block;margin-top:4px">
        </video>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">
          ~${_dataUrlSizeMB(track.dataUrl)} MB embedded
        </div>
      </div>`;
    }
  } else {
    previewHtml = `<div class="insp-group"><div style="font-size:11px;color:var(--text3)">No media file loaded.</div></div>`;
  }

  return `
    <div class="insp-block-name">${track.mediaKind === 'image' ? '🖼' : '▶'} ${esc(track.name)}</div>
    <div class="insp-group">
      <div class="insp-group-label">Identity</div>
      <label style="font-size:11px;color:var(--text2)">Name<input type="text" id="vi_name" value="${esc(track.name)}" /></label>
      <div class="insp-row"><span>Kind</span><span style="color:var(--text3)">${track.mediaKind || 'video'}</span></div>
    </div>
    ${previewHtml}
    <div class="insp-group">
      <div class="insp-group-label">Playback</div>
      <div class="insp-row">
        <span>Mute audio</span>
        <select id="vi_mute" style="width:70px">
          <option value="true"${track.mute!==false?' selected':''}>Yes</option>
          <option value="false"${track.mute===false?' selected':''}>No</option>
        </select>
      </div>
      <div class="insp-row">
        <span>Volume</span>
        <input type="number" id="vi_volume" value="${track.volume ?? 1}" min="0" max="2" step="0.05" style="width:80px" />
      </div>
    </div>
    <div style="display:flex;gap:5px;margin-top:8px">
      <button data-del-kind="video" data-track-id="${track.id}"
        style="flex:1;font-size:11px;color:var(--danger)">Remove track</button>
    </div>`;
}

function renderRulesInspector() {
  const rules = state.session.rules ?? [];
  const METRICS = ['attention','intensity','speed','engagement','sessionTime','loopCount','timeInScene','variableEquals'];
  const OPS     = ['<','>','<=','>=','=='];
  const ACTIONS = ['pause','resume','stop','injectMacro','setIntensity','setSpeed',
                   'nextScene','gotoScene','setVar','showMessage','flashColor'];
  const METRIC_LABELS = { attention:'Attention', intensity:'Intensity', speed:'Speed',
    engagement:'Engagement', sessionTime:'Session time (s)', loopCount:'Loop count',
    timeInScene:'Time in scene (s)', variableEquals:'Variable equals' };
  const ACTION_LABELS = { pause:'Pause', resume:'Resume', stop:'Stop',
    injectMacro:'Inject macro (slot)', setIntensity:'Set intensity', setSpeed:'Set speed',
    nextScene:'Next scene (sequential)', gotoScene:'Go to scene…', setVar:'Set variable',
    showMessage:'Show message overlay', flashColor:'Flash stage colour' };

  const rulesHtml = rules.map(r => {
    // Build scene param selector for gotoScene
    let paramHtml = '';
    if (r.action.type === 'injectMacro' || r.action.type === 'setIntensity' || r.action.type === 'setSpeed') {
      paramHtml = `
        <div style="margin-top:4px;font-size:11px;color:var(--text2)">
          Param: <input type="number"
            class="rule-param" data-rule-id="${r.id}" value="${r.action.param ?? ''}"
            step="${r.action.type === 'injectMacro' ? '1' : '0.1'}"
            style="font-size:11px;width:80px"
            placeholder="${r.action.type === 'injectMacro' ? 'slot 1–5' : r.action.type === 'setIntensity' ? '0–2' : '0.25–4'}" />
          <span style="color:var(--text3)">${r.action.type === 'injectMacro' ? '(macro slot)' : r.action.type === 'setIntensity' ? '(0=off 1=100% 2=200%)' : '(×)'}</span>
        </div>`;
    } else if (r.action.type === 'gotoScene') {
      const sceneOpts = (state.session.scenes ?? []).map(s =>
        `<option value="${s.id}"${r.action.param === s.id ? ' selected' : ''}>${esc(s.name)}</option>`
      ).join('');
      paramHtml = `
        <div style="margin-top:4px;font-size:11px;color:var(--text2)">
          Target: <select class="rule-param rule-scene-param" data-rule-id="${r.id}"
            style="font-size:11px;width:130px">
            <option value="">— pick scene —</option>${sceneOpts}
          </select>
        </div>`;
    } else if (r.action.type === 'setVar') {
      const varNames = Object.keys(state.session.variables ?? {});
      const hint = varNames.length ? varNames.map(n => `${n}=…`).join(', ') : 'define variables in Variables panel';
      paramHtml = `
        <div style="margin-top:4px;font-size:11px;color:var(--text2)">
          <input type="text" class="rule-param rule-str-param" data-rule-id="${r.id}"
            value="${esc(typeof r.action.param === 'string' ? r.action.param : '')}"
            placeholder="name=value" style="font-size:11px;width:160px" />
          <span style="color:var(--text3);font-size:10px"> e.g. ${esc(hint)}</span>
        </div>`;
    } else if (r.action.type === 'showMessage') {
      paramHtml = `
        <div style="margin-top:4px;font-size:11px;color:var(--text2)">
          Message: <input type="text" class="rule-param rule-str-param" data-rule-id="${r.id}"
            value="${esc(typeof r.action.param === 'string' ? r.action.param : '')}"
            placeholder="Message text to display…" style="font-size:11px;width:180px" />
        </div>`;
    } else if (r.action.type === 'flashColor') {
      paramHtml = `
        <div style="margin-top:4px;font-size:11px;color:var(--text2);display:flex;align-items:center;gap:6px">
          Color: <input type="color" class="rule-param rule-str-param" data-rule-id="${r.id}"
            value="${typeof r.action.param === 'string' && r.action.param.startsWith('#') ? r.action.param : '#ff0000'}"
            style="width:36px;height:24px;border:none;background:none;cursor:pointer;padding:0" />
          <span style="color:var(--text3);font-size:10px">flashes stage for 0.5s</span>
        </div>`;
    }
    return `
    <div class="rule-row" data-rule-id="${r.id}" style="
      background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);
      border-radius:6px;padding:8px 10px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <input type="checkbox" class="rule-enabled" data-rule-id="${r.id}"
          ${r.enabled ? 'checked' : ''} style="margin:0;cursor:pointer" />
        <input type="text" class="rule-name" data-rule-id="${r.id}" value="${esc(r.name)}"
          style="flex:1;font-size:11px;background:transparent;border:none;color:var(--text);min-width:0" />
        <button class="rule-dup" data-rule-id="${r.id}"
          style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:11px;padding:0 3px;line-height:1" title="Duplicate rule">⧉</button>
        <button class="rule-del" data-rule-id="${r.id}"
          style="background:transparent;border:none;color:var(--danger,#e05050);cursor:pointer;font-size:14px;padding:0;line-height:1">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:4px;margin-bottom:4px;align-items:center;font-size:11px">
        <select class="rule-metric" data-rule-id="${r.id}" style="font-size:11px">
          ${METRICS.map(m => `<option value="${m}"${r.condition.metric===m?' selected':''}>${METRIC_LABELS[m]}</option>`).join('')}
        </select>
        <select class="rule-op" data-rule-id="${r.id}" style="font-size:11px;width:44px">
          ${OPS.map(o => `<option value="${o}"${r.condition.op===o?' selected':''}>${o}</option>`).join('')}
        </select>
        <input type="number" class="rule-val" data-rule-id="${r.id}" value="${r.condition.value}"
          step="0.05" style="font-size:11px;width:100%" />
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px;font-size:11px;color:var(--text2)">
        <span style="align-self:center">for</span>
        <input type="number" class="rule-dur" data-rule-id="${r.id}" value="${r.durationSec}"
          min="0" step="0.5" style="font-size:11px" title="Duration (s) condition must hold" />
        <span style="align-self:center">s →</span>
        <select class="rule-action" data-rule-id="${r.id}" style="font-size:11px">
          ${ACTIONS.map(a => `<option value="${a}"${r.action.type===a?' selected':''}>${ACTION_LABELS[a]}</option>`).join('')}
        </select>
      </div>
      ${paramHtml}
      <div style="margin-top:4px;font-size:10.5px;color:var(--text3)">
        Cooldown: <input type="number" class="rule-cool" data-rule-id="${r.id}"
          value="${r.cooldownSec}" min="0" step="5" style="font-size:11px;width:60px" />s
      </div>
    </div>`;
  }).join('');

  return `
    <div class="insp-block-name">⚙ Rules</div>
    <p style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:10px">
      Rules fire actions when metric conditions hold for a set duration.
      Active during playback only.
    </p>
    <div id="rulesListBody">${rulesHtml || '<div class="sb-empty">No rules yet.</div>'}</div>
    <button id="addRuleBtn" style="width:100%;font-size:11px;margin-top:6px">+ Add rule</button>
    <div style="margin-top:8px">
      <div class="insp-group-label">Conditioning presets</div>
      <select id="condPresetSelect" style="font-size:11px;width:100%;margin-top:4px">
        <option value="">— Apply a preset template —</option>
        ${CONDITIONING_PRESETS.map(p =>
          `<option value="${p.id}" title="${p.description}">${p.name}</option>`).join('')}
      </select>
    </div>
    <div style="margin-top:10px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:10.5px;color:var(--text3);line-height:1.6">
      <strong style="color:var(--text2)">Metrics:</strong> attention (0–1), intensity (0–2), speed (0.25–4), engagement (0–1), sessionTime (s), loopCount<br>
      <strong style="color:var(--text2)">Actions:</strong> pause, resume, stop, injectMacro (slot 1–5), setIntensity, setSpeed, nextScene, gotoScene (scene id)
    </div>`;
}

function attachRulesInspectorEvents() {
  const body = $id('inspBody');
  if (!body) return;

  body.querySelector('#addRuleBtn')?.addEventListener('click', () => {
    addRule({ name: `Rule ${(state.session.rules?.length ?? 0) + 1}` });
    renderInspector();
  });

  body.querySelector('#condPresetSelect')?.addEventListener('change', e => {
    const presetId = e.target.value;
    if (!presetId) return;
    applyPreset(presetId);
    e.target.value = '';           // reset dropdown
    renderInspector();
    renderSidebar();
  });

  // Delegated events for all rule fields
  body.querySelectorAll('.rule-enabled').forEach(el => {
    el.addEventListener('change', () => { toggleRule(el.dataset.ruleId); renderSidebar(); });
  });
  body.querySelectorAll('.rule-dup').forEach(el => {
    el.addEventListener('click', () => {
      const orig = state.session.rules?.find(r => r.id === el.dataset.ruleId);
      if (!orig) return;
      history.push();
      const copy = JSON.parse(JSON.stringify(orig));
      copy.id   = uid();
      copy.name = orig.name + ' (copy)';
      state.session.rules.push(copy);
      persist();
      renderInspector();
      renderSidebar();
    });
  });
  body.querySelectorAll('.rule-del').forEach(el => {
    el.addEventListener('click', () => { deleteRule(el.dataset.ruleId); renderInspector(); renderSidebar(); });
  });

  const patchCondition = (el, field) => el.addEventListener('input', () => {
    let val;
    if (field === 'value') {
      const n = Number(el.value);
      val = Number.isFinite(n) ? n : 0;
    } else {
      val = el.value;
    }
    _snapOnce(el);
    updateRule(el.dataset.ruleId, { condition: { [field]: val } });
  });
  body.querySelectorAll('.rule-name').forEach(el => {
    el.addEventListener('input', () => {
      _snapOnce(el); // debounce: one snapshot per focus session, not per keystroke
      updateRule(el.dataset.ruleId, { name: el.value });
    });
  });
  body.querySelectorAll('.rule-metric').forEach(el  => patchCondition(el, 'metric'));
  body.querySelectorAll('.rule-op').forEach(el      => patchCondition(el, 'op'));
  body.querySelectorAll('.rule-val').forEach(el     => patchCondition(el, 'value'));
  body.querySelectorAll('.rule-dur').forEach(el  => el.addEventListener('input', () => {
    const v = Number(el.value);
    _snapOnce(el);
    updateRule(el.dataset.ruleId, { durationSec: Number.isFinite(v) ? Math.max(0, v) : 0 });
  }));
  body.querySelectorAll('.rule-cool').forEach(el => el.addEventListener('input', () => {
    const v = Number(el.value);
    _snapOnce(el);
    updateRule(el.dataset.ruleId, { cooldownSec: Number.isFinite(v) ? Math.max(0, v) : 0 });
  }));
  body.querySelectorAll('.rule-action').forEach(el  => el.addEventListener('change', () => {
    history.push(); // one-shot: type change is always a discrete undo point
    updateRule(el.dataset.ruleId, { action: { type: el.value, param: null } });
    renderInspector(); // re-render to show/hide param field
  }));
  body.querySelectorAll('.rule-param').forEach(el => {
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const isSceneParam = el.classList.contains('rule-scene-param');
      const isStrParam   = el.classList.contains('rule-str-param');
      const v = el.value === '' ? null
              : isSceneParam ? el.value
              : isStrParam   ? el.value
              : Number(el.value);
      updateRule(el.dataset.ruleId, { action: { param: v } });
    });
  });
}

function renderTriggersSummary() {
  const el = $id('triggersSummary');
  if (!el) return;
  const count   = state.session.triggers?.length ?? 0;
  const enabled = state.session.triggers?.filter(t => t.enabled).length ?? 0;
  const sel     = state.selectedSidebarType === 'triggers';
  el.innerHTML  = `<div class="sb-item${sel ? ' selected' : ''}"
    data-sb-type="triggers" style="cursor:pointer">
    <div class="sb-item-dot" style="background:#f0a04a;border-radius:2px"></div>
    <span class="sb-item-name">Triggers</span>
    <span class="sb-item-badge">${enabled}/${count}</span>
  </div>`;
}

function renderFunScriptInspector() {
  const track = state.selectedSidebarId
    ? state.session.funscriptTracks.find(t => t.id === state.selectedSidebarId)
    : state.session.funscriptTracks[state.selectedSidebarIdx];
  if (!track) return '<div class="insp-status">Track not found.</div>';
  const settings = state.session.funscriptSettings;
  return `
    <div class="insp-block-name">⚡ ${esc(track.name)}</div>

    <!-- Primary CTA: open fullscreen editor -->
    <button id="fs_openEditor" style="
      width:100%;padding:10px;margin-bottom:14px;font-size:13px;font-weight:600;
      background:linear-gradient(135deg,rgba(232,100,58,0.18),rgba(196,154,60,0.14));
      border:1px solid rgba(196,154,60,0.35);border-radius:8px;
      color:var(--accent);cursor:pointer;letter-spacing:.04em;
      display:flex;align-items:center;justify-content:center;gap:8px">
      ✎ Open Timeline Editor
    </button>
    <div class="insp-group">
      <div class="insp-group-label">Track info</div>
      <div class="insp-row"><span>Points</span><span style="color:var(--text)">${track.actions?.length||0}</span></div>
      <div class="insp-row"><span>Duration</span><span style="color:var(--text)">${fmt((track.actions?.at(-1)?.at||0)/1000)}</span></div>
      <div class="insp-row"><span>Range</span><span style="color:var(--text)">0–${track.range||100}</span></div>
      <div class="insp-row"><span>Variant</span>
        <select id="fs_variant" style="width:100px">
          <option value=""${track.variant===''?' selected':''}>— none —</option>
          <option value="Soft"${track.variant==='Soft'?' selected':''}>Soft</option>
          <option value="Standard"${track.variant==='Standard'?' selected':''}>Standard</option>
          <option value="Intense"${track.variant==='Intense'?' selected':''}>Intense</option>
          <option value="Custom"${track.variant==='Custom'?' selected':''}>Custom</option>
        </select>
      </div>
      <div class="insp-row"><span>Axis</span>
        <select id="fs_axis" style="width:130px" title="Motion axis for multi-axis export (.axis.funscript naming)">
          ${['stroke','surge','sway','twist','roll','pitch','vibrate','custom'].map(a =>
            `<option value="${a}"${(track.axis||'stroke')===a?' selected':''}>${a}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div style="font-size:9.5px;color:var(--text3);padding:0 2px 10px;line-height:1.5">
      Axis sets the file suffix on export: <code style="font-family:var(--mono)">${esc(track.name || 'track')}.${track.axis||'stroke'}.funscript</code>
    </div>
    ${track.actions?.length > 1 ? `<div class="insp-group" style="padding:0;overflow:hidden">
      <div style="padding:8px 8px 5px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3)">Speed heatmap</div>
      ${(h => h ? h.replace('height="6"', 'height="18"').replace('viewBox="0 0 200 6"', 'viewBox="0 0 200 18"') : '<div style="padding:0 8px 8px;font-size:10px;color:var(--text3)">No data</div>')(_buildFsHeatmap(track.actions, track._color || '#f0a04a'))}
    </div>` : ''}
    <div class="insp-group">
      <div class="insp-group-label">Global FunScript settings</div>
      <div class="insp-row"><span>Speed</span>
        <input type="number" id="fs_speed" value="${settings.speed||1}" min="0.25" max="4" step="0.25" style="width:70px"/>
        <span style="font-size:10px;color:var(--text3)">×</span>
      </div>
      <div class="insp-row"><span>Invert</span>
        <select id="fs_invert" style="width:70px">
          <option value="false"${!settings.invert?' selected':''}>No</option>
          <option value="true"${settings.invert?' selected':''}>Yes</option>
        </select>
      </div>
      <div class="insp-row"><span>Range</span>
        <input type="number" id="fs_range" value="${settings.range||100}" min="1" max="100" step="1" style="width:70px"/>
      </div>
    </div>
    <div class="insp-group">
      <div class="insp-group-label">Device</div>
      <div class="device-status-display" style="font-size:11px;color:var(--text3);margin-bottom:6px">Disconnected</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        <input type="text" id="fs_wsUrl" value="${esc(state.session.advanced?.deviceWsUrl ?? 'ws://localhost:12345')}" style="font-size:11px" placeholder="ws://localhost:12345" />
        <div style="display:flex;gap:5px">
          <button id="fs_connect" class="btn-primary" style="flex:1;font-size:11px">Connect</button>
          <button id="fs_disconnect" style="flex:1;font-size:11px">Disconnect</button>
        </div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;margin-top:4px">
      <button id="fs_export" style="font-size:11px">Export .funscript</button>
      <button id="fs_delete" style="font-size:11px;color:var(--danger)">Remove track</button>
    </div>
    <div id="fsPatternPicker" style="margin-top:14px;padding-top:12px;border-top:0.5px solid rgba(255,255,255,0.06)"></div>
    <div id="fsBpmPanel" style="margin-top:10px;padding-top:10px;border-top:0.5px solid rgba(255,255,255,0.06)">
      <div style="font-size:9px;color:rgba(196,154,60,0.5);text-transform:uppercase;letter-spacing:.10em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        BPM Generator <span style="flex:1;height:0.5px;background:rgba(196,154,60,0.12);display:block"></span>
      </div>
      <p style="font-size:10.5px;color:var(--text2);line-height:1.5;margin-bottom:10px">
        Generate a FunScript track synchronized to a musical tempo.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px">
        <label style="font-size:10px;color:var(--text2)">BPM
          <input id="bpm_bpm" type="number" value="80" min="30" max="240" step="1"
            style="width:100%;margin-top:2px;font-size:11px"/>
        </label>
        <label style="font-size:10px;color:var(--text2)">Duration (s)
          <input id="bpm_dur" type="number" value="60" min="5" max="600" step="5"
            style="width:100%;margin-top:2px;font-size:11px"/>
        </label>
        <label style="font-size:10px;color:var(--text2)">Shape
          <select id="bpm_shape" style="width:100%;margin-top:2px;font-size:11px">
            <option value="sine">Sine</option>
            <option value="square">Square</option>
            <option value="sawtooth">Sawtooth</option>
            <option value="bounce">Bounce</option>
          </select>
        </label>
        <label style="font-size:10px;color:var(--text2)">Subdivision
          <select id="bpm_bars" style="width:100%;margin-top:2px;font-size:11px">
            <option value="1">Quarter note</option>
            <option value="2">Eighth note</option>
            <option value="4">Sixteenth note</option>
          </select>
        </label>
        <label style="font-size:10px;color:var(--text2)">Peak pos (%)
          <input id="bpm_amp" type="number" value="90" min="10" max="100" step="5"
            style="width:100%;margin-top:2px;font-size:11px"/>
        </label>
        <label style="font-size:10px;color:var(--text2)">Base pos (%)
          <input id="bpm_base" type="number" value="10" min="0" max="90" step="5"
            style="width:100%;margin-top:2px;font-size:11px"/>
        </label>
      </div>
      <button id="bpm_generate" class="btn-accent" style="width:100%;font-size:11px">♩ Generate from BPM</button>
    </div>

    <div id="fsAudioAnalysisPanel" style="margin-top:10px;padding-top:10px;border-top:0.5px solid rgba(255,255,255,0.06)">
      <div style="font-size:9px;color:rgba(127,176,255,0.6);text-transform:uppercase;letter-spacing:.10em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        🎵 Audio Analysis <span style="flex:1;height:0.5px;background:rgba(127,176,255,0.12);display:block"></span>
        <span style="font-size:8px;background:rgba(127,176,255,0.12);padding:1px 5px;border-radius:3px;text-transform:none;letter-spacing:0;color:rgba(127,176,255,0.7)">Tier 3</span>
      </div>
      <p style="font-size:10.5px;color:var(--text2);line-height:1.5;margin-bottom:10px">
        Analyse an audio file's amplitude envelope and generate a FunScript that mirrors its rhythm and energy. Peaks in the audio become peaks in the motion.
      </p>

      <!-- File picker -->
      <div style="margin-bottom:8px">
        <label class="file-pick-btn" style="width:100%;display:block;text-align:center">
          📂 Choose audio file
          <input id="audio_analyze_file" type="file" accept="audio/*,audio/mpeg,audio/wav,audio/ogg,audio/flac" hidden />
        </label>
        <div id="audio_analyze_name" style="font-size:10px;color:var(--text3);margin-top:4px;text-align:center;font-style:italic">
          No file selected
        </div>
      </div>

      <!-- Parameters grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px">
        <label style="font-size:10px;color:var(--text2)">Window (ms)
          <input id="aa_window" type="number" value="80" min="20" max="500" step="10"
            style="width:100%;margin-top:2px;font-size:11px" title="Analysis window size — smaller = more detail" />
        </label>
        <label style="font-size:10px;color:var(--text2)">Smoothing
          <input id="aa_smooth" type="number" value="5" min="1" max="30" step="1"
            style="width:100%;margin-top:2px;font-size:11px" title="Pass count for moving-average smoothing" />
        </label>
        <label style="font-size:10px;color:var(--text2)">Base pos (%)
          <input id="aa_base" type="number" value="5" min="0" max="60" step="5"
            style="width:100%;margin-top:2px;font-size:11px" />
        </label>
        <label style="font-size:10px;color:var(--text2)">Peak pos (%)
          <input id="aa_peak" type="number" value="95" min="40" max="100" step="5"
            style="width:100%;margin-top:2px;font-size:11px" />
        </label>
        <label style="font-size:10px;color:var(--text2)">Onset boost
          <select id="aa_onset" style="width:100%;margin-top:2px;font-size:11px" title="Sharpen transient peaks">
            <option value="0">None</option>
            <option value="0.5">Light</option>
            <option value="1" selected>Medium</option>
            <option value="2">Strong</option>
          </select>
        </label>
        <label style="font-size:10px;color:var(--text2)">Axis
          <select id="aa_axis" style="width:100%;margin-top:2px;font-size:11px">
            <option value="stroke" selected>stroke</option>
            <option value="surge">surge</option>
            <option value="vibrate">vibrate</option>
            <option value="twist">twist</option>
          </select>
        </label>
      </div>

      <!-- Preview waveform canvas -->
      <canvas id="aa_waveform" width="220" height="40"
        style="display:none;width:100%;border-radius:4px;background:#000;margin-bottom:8px"></canvas>
      <div id="aa_status" style="font-size:10px;color:var(--text3);margin-bottom:6px;text-align:center;min-height:14px"></div>

      <!-- Generate button -->
      <button id="aa_generate" class="btn-accent" style="width:100%;font-size:11px" disabled>
        🎵 Generate FunScript from Audio
      </button>
    </div>`;
}

function renderSubtitleInspector() {
  const track = state.selectedSidebarId
    ? state.session.subtitleTracks.find(t => t.id === state.selectedSidebarId)
    : state.session.subtitleTracks[state.selectedSidebarIdx];
  if (!track) return '<div class="insp-status">Track not found.</div>';
  return `
    <div class="insp-block-name">◌ ${esc(track.name)}</div>
    <div class="insp-group">
      <div class="insp-group-label">Track info</div>
      <div class="insp-row"><span>Cues</span><span style="color:var(--text)">${track.events?.length||0}</span></div>
      <div class="insp-row"><span>Styles</span><span style="color:var(--text)">${Object.keys(track.styles||{}).map(k => esc(k)).join(', ')||'Default'}</span></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;margin-top:4px">
      <button id="ass_export" style="font-size:11px">Export .ass</button>
      <button id="ass_delete" style="font-size:11px;color:var(--danger)">Remove track</button>
    </div>`;
}

function attachOverlayTabEvents() {
  const body = $id('inspBody');
  if (!body) return;

  // ── Ensure AI panel container exists in DOM ──────────────────────────────
  if (!$id('aiAuthoringPanel')) {
    const div = document.createElement('div');
    div.className = 'insp-group'; div.id = 'aiAuthoringPanel';
    body.appendChild(div);
  }

  // ── Mount AI authoring panel (templates+variables moved to sidebar) ──────
  renderAiAuthoringPanel('aiAuthoringPanel');

  // Session notes textarea (always at bottom of inspector)
  $id('si_notes')?.addEventListener('input', e => {
    _snapOnce(e.target);
    state.session.notes = e.target.value.slice(0, 10_000);
    const details = $id('session_notes_details');
    const summary = details?.querySelector('summary span:last-child');
    if (summary) summary.textContent = state.session.notes ? state.session.notes.length + ' chars' : 'empty';
    // Keep menubar notes preview in sync
    const notesPreview = document.getElementById('sessionNotesPreview');
    if (notesPreview) {
      const first = state.session.notes?.split('\n')[0]?.slice(0,80) ?? '';
      notesPreview.textContent = first;
      notesPreview.style.display = first ? '' : 'none';
    }
    persist();
  });

  // ── Scene inspector events ──────────────────────────────────────────────
  if (state.selectedSidebarType === 'scenes') {
    attachSceneInspectorEvents();
    return;
  }
  if (state.selectedSidebarType === 'rules') {
    attachRulesInspectorEvents();
    return;
  }
  if (state.selectedSidebarType === 'triggers') {
    attachTriggersInspectorEvents();
    return;
  }

  // ── Block field events ──────────────────────────────────────────────────
  body.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('input',  handleBlockFieldChange);
    el.addEventListener('change', handleBlockFieldChange);
  });
  body.querySelectorAll('[data-file-field]').forEach(el => el.addEventListener('change', handleBlockFileChange));
  body.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
      if (!block) return;
      history.push();
      block._position = btn.dataset.pos;
      persist();
      body.querySelectorAll('.pos-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  $id('ib_up')?.addEventListener('click',  moveBlockUp);
  $id('ib_dn')?.addEventListener('click',  moveBlockDown);
  $id('ib_dup')?.addEventListener('click', duplicateBlock);
  $id('ib_del')?.addEventListener('click', deleteBlock);

  // ── Viz block preview canvas ─────────────────────────────────────────────
  const vizCanvas = $id('viz_preview');
  if (vizCanvas) {
    const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
    if (block?.type === 'viz') {
      import('./viz-blocks.js').then(({ mountVizBlock }) => {
        // Fit canvas to its display size
        const rect = vizCanvas.getBoundingClientRect();
        if (rect.width > 0) { vizCanvas.width = rect.width * devicePixelRatio; vizCanvas.height = rect.height * devicePixelRatio; }
        mountVizBlock(vizCanvas, block);
      }).catch(() => {});
      // Stop the preview when the inspector rebuilds — the canvas element will be replaced
      vizCanvas._unmountOnNextRender = true;
    }
  }

  // ── Entrainment preset selector ────────────────────────────────────────────
  $id('ent_preset')?.addEventListener('change', e => {
    if (!e.target.value) return;
    const [carrier, beat] = e.target.value.split(':').map(Number);
    const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
    if (!block) return;
    history.push();
    block.entCarrierHz = carrier;
    block.entBeatHz    = beat;
    persist();
    renderInspector();
  });

  // ── FunScript: open editor dialog ──────────────────────────────────────────
  $id('fs_openEditor')?.addEventListener('click', () => {
    const trackId = state.selectedSidebarId;
    if (typeof window.openFsDialog === 'function') window.openFsDialog(trackId);
  });

  // ── BPM → duration helper ──────────────────────────────────────────────────
  $id('bpm_apply_btn')?.addEventListener('click', () => {
    const bpm   = parseFloat($id('bpm_input')?.value);
    const beats = parseFloat($id('bpm_beats')?.value ?? 8);
    if (!Number.isFinite(bpm) || bpm <= 0) { notify.warn('Enter a valid BPM.'); return; }
    const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
    if (!block) return;
    const durSec = Math.max(1, Math.round((beats / bpm) * 60));
    history.push();
    block.duration = durSec;
    persist();
    renderInspector();
    notify.info(`Duration set to ${durSec}s (${beats} beats @ ${bpm} BPM)`);
  });

  // ── TTS voice selector + preview ────────────────────────────────────────────
  $id('tts_voice_select')?.addEventListener('change', e => {
    const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
    if (!block) return;
    history.push();
    block.voiceName = e.target.value;
    persist();
  });
  $id('tts_preview_btn')?.addEventListener('click', () => {
    const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
    if (!block?.content) { notify.warn('No text to preview.'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(block.content.slice(0, 200));
    u.rate   = state.session.speechRate ?? 1;
    u.volume = 0.9;
    const voice = speechSynthesis.getVoices().find(v => v.name === block.voiceName);
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    notify.info('Previewing voice…');
  });

  // ── Audio track inspector events ────────────────────────────────────────
  $id('ai_name')?.addEventListener('input', e => {
    const t = state.session.playlists.audio.find(a => a.id === state.selectedSidebarId);
    if (!t) return;
    _snapOnce(e.target);
    t.name = e.target.value;
    persist(); renderSidebar();
  });
  $id('ai_volume')?.addEventListener('input', e => {
    const t = state.session.playlists.audio.find(a => a.id === state.selectedSidebarId);
    if (!t) return;
    _snapOnce(e.target);
    t.volume = Math.min(2, Math.max(0, Number(e.target.value) || 0));
    persist();
    if (state.runtime?.usingAudioEngine) refreshVolumes();
  });

  // ── Video track inspector events ────────────────────────────────────────
  $id('vi_name')?.addEventListener('input', e => {
    const t = state.session.playlists.video.find(v => v.id === state.selectedSidebarId);
    if (!t) return;
    _snapOnce(e.target);
    t.name = e.target.value;
    persist(); renderSidebar();
  });
  $id('vi_mute')?.addEventListener('change', e => {
    const t = state.session.playlists.video.find(v => v.id === state.selectedSidebarId);
    if (!t) return;
    history.push();
    t.mute = e.target.value === 'true';
    persist();
    if (state.runtime) {
      state.runtime.backgroundVideo.forEach(el => { if (el.src === t.dataUrl) el.muted = t.mute; });
    }
  });
  $id('vi_volume')?.addEventListener('input', e => {
    const t = state.session.playlists.video.find(v => v.id === state.selectedSidebarId);
    if (!t) return;
    _snapOnce(e.target);
    t.volume = Math.min(2, Math.max(0, Number(e.target.value) || 0));
    persist();
    if (state.runtime) {
      const { session } = state;
      state.runtime.backgroundVideo.forEach(el => {
        if (el.src === t.dataUrl) el.volume = session.masterVolume * session.advanced.playlistVideoVolume * t.volume;
      });
    }
  });

  // ── FunScript inspector events ──────────────────────────────────────────
  renderPatternPicker('fsPatternPicker');
  $id('fs_variant')?.addEventListener('change', e => {
    const track = state.session.funscriptTracks.find(t => t.id === state.selectedSidebarId);
    if (!track) return;
    history.push();
    track.variant = e.target.value;
    persist(); renderSidebar();
  });

  $id('fs_axis')?.addEventListener('change', e => {
    const track = state.session.funscriptTracks.find(t => t.id === state.selectedSidebarId);
    if (!track) return;
    history.push();
    track.axis = e.target.value;
    persist(); renderInspector(); // re-render to update the filename preview
  });

  $id('bpm_generate')?.addEventListener('click', async () => {
    const btn = $id('bpm_generate');
    if (btn?.disabled) return;                // guard double-click
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

    const bpm       = parseInt($id('bpm_bpm')?.value,  10) || 80;
    const durSec    = parseInt($id('bpm_dur')?.value,  10) || 60;
    const shape     = $id('bpm_shape')?.value  ?? 'sine';
    const bars      = parseInt($id('bpm_bars')?.value, 10) || 1;
    const amplitude = parseInt($id('bpm_amp')?.value,  10) || 90;
    const baseline  = parseInt($id('bpm_base')?.value, 10) || 10;

    try {
      const { generateFromBPM } = await import('./viz-blocks.js');
      const actions = generateFromBPM({ bpm, durationSec: durSec, shape, barsPerBeat: bars, amplitude, baseline });

      if (!actions.length) { notify.warn('BPM generation produced no actions — check inputs.'); return; }

      const TRACK_COLORS = ['#f0a04a','#5fa0dc','#7dc87a','#b084cc','#e07a5f','#64b5c8'];
      const newTrack = normalizeFunscriptTrack({
        id:       uid(),
        name:     `BPM ${bpm} ${shape}`,
        version:  1,
        inverted: false,
        range:    100,
        actions,
        _disabled: false,
        _color:   TRACK_COLORS[state.session.funscriptTracks.length % TRACK_COLORS.length],
        variant:  '',
      });
      history.push(); // single snapshot before mutation
      state.session.funscriptTracks.push(newTrack);
      state.selectedSidebarType = 'funscript';
      state.selectedSidebarId   = newTrack.id;
      persist();
      renderSidebar();
      renderInspector();
      notify.success(`Generated "${newTrack.name}" — ${actions.length} actions, ${durSec}s at ${bpm} BPM.`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '♩ Generate from BPM'; }
    }
  });
  $id('fs_speed')?.addEventListener('input', e => {
    _snapOnce(e.target);
    state.session.funscriptSettings.speed = Number(e.target.value) || 1; persist();
  });
  $id('fs_invert')?.addEventListener('change', e => {
    history.push();
    state.session.funscriptSettings.invert = e.target.value === 'true'; persist();
  });
  $id('fs_range')?.addEventListener('input', e => {
    _snapOnce(e.target);
    state.session.funscriptSettings.range = clampInt(e.target.value, 1, 100, 100); persist();
  });
  $id('fs_connect')?.addEventListener('click', () => {
    const url = $id('fs_wsUrl')?.value?.trim() || state.session.advanced?.deviceWsUrl || 'ws://localhost:12345';
    connectDevice(url);
  });
  $id('fs_disconnect')?.addEventListener('click', () => disconnectDevice());
  // Persist URL changes from the inspector — keep in sync with Settings dialog
  $id('fs_wsUrl')?.addEventListener('change', e => {
    const url = e.target.value.trim();
    if (url && /^wss?:\/\/./.test(url)) {
      history.push();
      state.session.advanced.deviceWsUrl = url.slice(0, 200);
      const sv = $id('s_deviceWsUrl');
      if (sv) sv.value = state.session.advanced.deviceWsUrl;
      persist();
    }
  });
  $id('fs_export')?.addEventListener('click', () => {
    const trackId = state.selectedSidebarId;
    if (trackId) downloadFunScript(trackId);
  });

  // ── Audio-driven FunScript generation (Tier 3) ────────────────────────────
  let _aaFile = null; // holds the selected audio File object

  $id('audio_analyze_file')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    _aaFile = file;
    const nameEl = $id('audio_analyze_name');
    if (nameEl) nameEl.textContent = `${file.name} (${(file.size / 1_000_000).toFixed(1)} MB)`;
    // Enable generate button
    const btn = $id('aa_generate');
    if (btn) { btn.disabled = false; btn.textContent = '🎵 Generate FunScript from Audio'; }
    // Clear previous waveform
    const canvas = $id('aa_waveform');
    if (canvas) canvas.style.display = 'none';
    const status = $id('aa_status');
    if (status) status.textContent = 'File ready — click Generate to analyse.';
  });

  $id('aa_generate')?.addEventListener('click', async () => {
    if (!_aaFile) { notify.warn('Select an audio file first.'); return; }

    const btn    = $id('aa_generate');
    const status = $id('aa_status');
    const canvas = $id('aa_waveform');

    if (btn?.dataset.running) return;
    if (btn) { btn.dataset.running = '1'; btn.disabled = true; btn.textContent = '⏳ Analysing…'; }
    if (status) status.textContent = 'Starting…';

    const opts = {
      windowMs:    parseInt($id('aa_window')?.value, 10) || 80,
      smoothPasses:parseInt($id('aa_smooth')?.value, 10) || 5,
      basePct:     parseInt($id('aa_base')?.value,   10) || 5,
      peakPct:     parseInt($id('aa_peak')?.value,   10) || 95,
      onsetBoost:  parseFloat($id('aa_onset')?.value)    || 1.0,
      axis:        $id('aa_axis')?.value || 'stroke',
    };

    const onProgress = (msg, pct) => {
      if (status) status.textContent = `${msg} (${pct}%)`;
    };

    try {
      const { generateFsFromAudio, drawEnvelopePreview } = await import('./audio-analyze.js');
      const track = await generateFsFromAudio(_aaFile, opts, onProgress);

      // Draw waveform preview
      if (canvas && track._envelope) {
        canvas.style.display = 'block';
        canvas.width  = canvas.offsetWidth * devicePixelRatio || 440;
        canvas.height = 40 * devicePixelRatio;
        drawEnvelopePreview(canvas, track._envelope, track._peaks || []);
      }

      // Strip internal fields before adding to session
      const { _envelope, _hopMs, _peaks, ...cleanTrack } = track;

      history.push();
      state.session.funscriptTracks.push(cleanTrack);
      // Auto-expand session duration to fit audio if needed
      if (track._generated?.durationMs) {
        const needed = Math.ceil(track._generated.durationMs / 1000);
        if (needed > state.session.duration) {
          state.session.duration = needed;
          const tEl = document.getElementById('tTotal');
          if (tEl) tEl.textContent = fmt(needed);
        }
      }
      persist();
      renderSidebar();

      if (status) status.textContent = `✓ Generated ${track.actions.length.toLocaleString()} points · ${fmt(Math.round((track._generated?.durationMs||0)/1000))} duration`;
      notify.success(`FunScript generated from "${_aaFile.name}" — ${track.actions.length.toLocaleString()} points`);

    } catch (err) {
      console.error('Audio analysis failed:', err);
      if (status) status.textContent = `Error: ${err.message || 'Analysis failed'}`;
      notify.error('Audio analysis failed — see console for details.');
    } finally {
      if (btn) { delete btn.dataset.running; btn.disabled = false; btn.textContent = '🎵 Generate FunScript from Audio'; }
    }
  });
  $id('fs_delete')?.addEventListener('click', () => {
    const trackId = state.selectedSidebarId;
    if (!trackId) return;
    history.push();
    state.session.funscriptTracks = state.session.funscriptTracks.filter(t => t.id !== trackId);
    state.selectedSidebarType = null; state.selectedSidebarIdx = null; state.selectedSidebarId = null;
    persist(); renderSidebar(); renderInspector();
    drawTimeline();
  });

  // ── Subtitle inspector events ───────────────────────────────────────────
  $id('ass_export')?.addEventListener('click', () => {
    const track = state.selectedSidebarId
      ? state.session.subtitleTracks.find(t => t.id === state.selectedSidebarId)
      : state.session.subtitleTracks[state.selectedSidebarIdx];
    if (track) downloadAss(state.session.subtitleTracks.indexOf(track));
  });
  $id('ass_delete')?.addEventListener('click', () => {
    const trackId = state.selectedSidebarId;
    if (!trackId) return;
    history.push();
    state.session.subtitleTracks = state.session.subtitleTracks.filter(t => t.id !== trackId);
    state.selectedSidebarType = null; state.selectedSidebarIdx = null; state.selectedSidebarId = null;
    persist(); renderSidebar(); renderInspector();
  });
}

function handleBlockFieldChange(e) {
  const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
  if (!block) return;
  // Snapshot before first keystroke in a field (debounced — only if field identity changes)
  if (handleBlockFieldChange._lastField !== e.target) {
    history.push();
    handleBlockFieldChange._lastField = e.target;
  }
  const field = e.target.dataset.field;
  let val = e.target.value;
  if (field === 'start' || field === 'duration') val = clampInt(val, field==='duration'?1:0, 86400, block[field]);
  if (field === 'fontSize' || field === 'volume') {
    const n = Number(val);
    val = Number.isFinite(n) ? n : block[field]; // keep existing value on invalid input
  }
  if (field === 'mute') val = val === 'true';
  if (field === 'macroSlot') val = val === '' ? null : Number(val);
  if (field === 'vizSpeed') val = Math.max(0.25, Math.min(4, Number(val) || 1));
  if (field === 'breathCue') val = (val === true || val === 'true');
  if (['breathInSec','breathHold1Sec','breathOutSec','breathHold2Sec','breathCycles'].includes(field))
    val = Math.max(0, Math.min(60, parseInt(val) || 0));
  if (field === 'entCarrierHz') val = Math.max(40, Math.min(500, Number(val) || 200));
  if (field === 'entBeatHz')    val = Math.max(0.5, Math.min(40, Number(val) || 10));
  if (field === 'entVolume')    val = Math.max(0, Math.min(1, Number(val) || 0.3));
  block[field] = val;
  persist();
  // Re-render inspector for viz/breathing/entrainment so preview refreshes
  if (['viz','breathing','entrainment'].includes(block.type)) { renderInspector(); return; }
  renderSidebar();
}
handleBlockFieldChange._lastField = null;

async function handleBlockFileChange(e) {
  const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
  const file  = e.target.files?.[0];
  if (!block || !file) return;
  try {
    validateMediaFile(file, file.type.startsWith('audio/') ? 'Audio' : file.type.startsWith('video/') ? 'Video' : 'Image');
  } catch (err) {
    notify.error(err.message);
    e.target.value = '';
    return;
  }
  history.push();
  block.dataUrl     = await fileToDataUrl(file);
  block.dataUrlName = file.name;
  block.mediaKind   = file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'image';
  persist();
  renderInspector();
}

// ── Undo debounce helper ─────────────────────────────────────────────────────
// Snapshot at most once per (handler, element) pair. Prevents spamming history
// on rapid input events while still capturing the state before the first edit.
const _undoDebounce = new WeakMap();
function _snapOnce(el) {
  if (!_undoDebounce.has(el)) {
    history.push();
    _undoDebounce.set(el, true);
    // Clear after a short idle so the next distinct editing session gets a snapshot
    el.addEventListener('blur', () => _undoDebounce.delete(el), { once: true });
  }
}

// Syncs loop toggle, master volume slider, and tTotal from session state.
// Called by main.js after any session mutation; also called internally from
// session inspector changes that affect transport-bar values.
export function syncTransportControls() {
  const s  = state.session;
  const lb = $id('loopToggle');
  const ll = { none: '↺ Off', count: '↺ Loop', minutes: '↺ Min', forever: '↺ ∞' };
  if (lb) {
    lb.textContent = ll[s.loopMode] ?? '↺ Loop';
    lb.classList.toggle('active', s.loopMode !== 'none');
  }
  const mvSlider = $id('masterVolumeSlider');
  if (mvSlider) mvSlider.value = s.masterVolume;
  const tot = $id('tTotal');
  if (tot) tot.textContent = fmt(s.duration);
  // Show Next Scene button only when scenes are defined
  const nsBtn = $id('nextSceneBtn');
  if (nsBtn) nsBtn.style.display = (s.scenes?.length) ? '' : 'none';
  // Sync the header session-name quick-edit (don't override while the user is typing)
  const sni = $id('sessionNameInput');
  if (sni && document.activeElement !== sni) sni.value = s.name ?? '';
}

export function syncSettingsForms() {
  const s  = state.session;
  const v  = (id, val) => { const el = $id(id); if (el) el.value = val; };
  const c  = (id, val) => { const el = $id(id); if (el) el.checked = val; };
  v('s_sessionName', s.name);
  v('s_duration', s.duration);
  v('s_loopMode', s.loopMode);
  v('s_loopCount', s.loopCount);
  v('s_runtimeMinutes', s.runtimeMinutes);
  v('s_speechRate', s.speechRate);
  v('s_masterVolume', s.masterVolume);
  const mvLabel = $id('s_masterVolumeVal');
  if (mvLabel) mvLabel.textContent = `${Math.round((s.masterVolume ?? 0.8) * 100)}%`;
  const srLabel = $id('s_speechRateVal');
  if (srLabel) srLabel.textContent = s.speechRate ?? 1.0;
  v('s_playlistAudioVolume', s.advanced.playlistAudioVolume);
  const pavLabel = $id('s_pavVal');
  if (pavLabel) pavLabel.textContent = (s.advanced.playlistAudioVolume ?? 0.7).toFixed(2);
  v('s_playlistVideoVolume', s.advanced.playlistVideoVolume);
  const pvvLabel = $id('s_pvvVal');
  if (pvvLabel) pvvLabel.textContent = (s.advanced.playlistVideoVolume ?? 0.6).toFixed(2);
  v('s_crossfadeSeconds', s.advanced.crossfadeSeconds);
  v('s_backgroundColor', s.backgroundColor);
  v('s_textColor', s.textColor);
  v('s_accentColor', s.accentColor);
  v('s_stageBlur', s.advanced.stageBlur);
  v('s_fontFamily', s.advanced.fontFamily);
  v('s_assTextColor', s.subtitleSettings.textColor);
  v('s_assFontSize', s.subtitleSettings.fontSize);
  v('s_assPosition', s.subtitleSettings.position);
  v('s_assOverride', s.subtitleSettings.override);
  c('s_trackingEnabled', s.tracking.enabled);
  c('s_autoPauseOnAttentionLoss', s.tracking.autoPauseOnAttentionLoss);
  c('s_autoResumeOnAttentionReturn', s.advanced.autoResumeOnAttentionReturn);
  v('s_attentionThreshold', s.tracking.attentionThreshold);
  // Webcam → FS options
  const tfo = s.trackingFsOptions ?? {};
  c('s_pauseFsOnLoss',       tfo.pauseFsOnLoss       ?? false);
  c('s_injectMacroOnLoss',   tfo.injectMacroOnLoss   ?? false);
  v('s_lossInjectSlot',      tfo.lossInjectSlot      ?? 0);
  c('s_injectMacroOnReturn', tfo.injectMacroOnReturn ?? false);
  v('s_returnInjectSlot',    tfo.returnInjectSlot    ?? 0);
  // FunScript settings
  v('s_fsSpeed',  s.funscriptSettings.speed);
  const fsSpeedLabel = $id('s_fsSpeedVal');
  if (fsSpeedLabel) fsSpeedLabel.textContent = `${s.funscriptSettings.speed ?? 1}×`;
  v('s_fsRange',  s.funscriptSettings.range);
  c('s_fsInvert', s.funscriptSettings.invert);
  v('s_deviceWsUrl', s.advanced.deviceWsUrl ?? 'ws://localhost:12345');
  // ── Display / HUD options ──────────────────────────────────────────────────
  const hud = s.hudOptions ?? {};
  const disp = s.displayOptions ?? {};
  c('s_hudMetricBars',  hud.showMetricBars  !== false);
  c('s_hudScene',       hud.showScene       !== false);
  c('s_hudMacroSlots',  hud.showMacroSlots  !== false);
  c('s_hudVariables',   hud.showVariables   !== false);
  c('s_hudHint',        !!hud.showHint);
  v('s_hudHideAfter',   hud.hideAfterSec ?? 2.5);
  const hudHideLabel = $id('s_hudHideAfterVal');
  if (hudHideLabel) hudHideLabel.textContent = `${hud.hideAfterSec ?? 2.5}s`;
  // Metric bar position + individual toggles
  v('s_hudMetricsPos',    hud.metricsPosition ?? 'bottom');
  c('s_showAttention',    hud.showAttention   !== false);
  c('s_showEngagement',   hud.showEngagement  !== false);
  c('s_showIntensity',    hud.showIntensity   !== false);
  c('s_displayRichIdle',   disp.richIdleScreen   !== false);
  c('s_displayFsHeatmap',  disp.showFsHeatmap    !== false);
  v('s_sensorBridgeUrl',   disp.sensorBridgeUrl  ?? 'ws://localhost:8765');
  c('s_sensorBridgeAuto',  !!disp.sensorBridgeAuto);
  c('s_toastXp',           disp.toastXp           !== false);
  c('s_toastLevelUp',      disp.toastLevelUp      !== false);
  c('s_toastAchievements', disp.toastAchievements !== false);
  c('s_toastQuests',       disp.toastQuests       !== false);
  // Webcam fullscreen preview
  c('s_webcamPreview',  !!disp.webcamPreview);
  v('s_webcamCorner',   disp.webcamCorner ?? 'bottom-right');
  v('s_webcamSize',     disp.webcamSize   ?? 15);
  // Session mode display
  const modeEl = $id('s_currentModeDisplay');
  if (modeEl) {
    if (s.mode) {
      const modeLabel = s.mode.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      modeEl.textContent = `Active: ${modeLabel}`;
      modeEl.style.color = 'var(--accent)';
    } else {
      modeEl.textContent = 'None applied';
      modeEl.style.color = '';
    }
  }
  // Safety settings — use session values if set, otherwise fall back to defaults
  // so sliders always render at correct positions even before the user has saved any.
  const ss = s.safetySettings ?? {
    maxIntensity: 2.0, maxSpeed: 4.0, warnAbove: 1.5,
    emergencyCooldownSec: 30, autoReduceOnLoss: false, autoReduceTarget: 0.8,
  };
  v('s_safetyMaxInt',       ss.maxIntensity);
  v('s_safetyMaxSpd',       ss.maxSpeed);
  v('s_safetyWarn',         ss.warnAbove);
  v('s_safetyCool',         ss.emergencyCooldownSec);
  c('s_safetyAutoReduce',   ss.autoReduceOnLoss);
  v('s_safetyReduceTarget', ss.autoReduceTarget);
  // Update range labels
  const setL = (id, val, fmt) => { const el = $id(id); if (el) el.textContent = fmt(val); };
  setL('s_safetyMaxIntVal',       ss.maxIntensity,     v => `${Math.round(v*100)}%`);
  setL('s_safetyMaxSpdVal',       ss.maxSpeed,         v => `${v.toFixed(2)}×`);
  setL('s_safetyWarnVal',         ss.warnAbove,        v => `${Math.round(v*100)}%`);
  setL('s_safetyReduceTargetVal', ss.autoReduceTarget, v => `${Math.round(v*100)}%`);
  const row = $id('s_safetyReduceTargetRow');
  if (row) row.style.display = ss.autoReduceOnLoss ? '' : 'none';
  renderThemeGrid();
}

export function syncSessionFromSettings() {
  const gv = id => $id(id)?.value;
  const gc = id => $id(id)?.checked;
  const s  = state.session;
  s.name = gv('s_sessionName')?.trim() ?? s.name;
  // Keep the menubar quick-edit in sync
  const sni = $id('sessionNameInput');
  if (sni && document.activeElement !== sni) sni.value = s.name;
  s.duration = clampInt(gv('s_duration'), 10, 86400, s.duration);
  s.loopMode = gv('s_loopMode') || s.loopMode;
  s.loopCount = clampInt(gv('s_loopCount'), 1, 100000, s.loopCount);
  s.runtimeMinutes = clampInt(gv('s_runtimeMinutes'), 1, 100000, s.runtimeMinutes);
  s.speechRate = Number(gv('s_speechRate')) || s.speechRate;
  const mvVal = parseFloat(gv('s_masterVolume'));
  if (!isNaN(mvVal)) s.masterVolume = Math.max(0, Math.min(1, mvVal));
  const numOr = (raw, fallback) => { const n = Number(raw); return Number.isFinite(n) ? n : fallback; };
  s.advanced.playlistAudioVolume = Math.max(0, Math.min(2, numOr(gv('s_playlistAudioVolume'), s.advanced.playlistAudioVolume)));
  s.advanced.playlistVideoVolume = Math.max(0, Math.min(2, numOr(gv('s_playlistVideoVolume'), s.advanced.playlistVideoVolume)));
  s.advanced.crossfadeSeconds    = Math.max(0, Math.min(10, numOr(gv('s_crossfadeSeconds'),    s.advanced.crossfadeSeconds)));
  // Run theme colors through safeColor — same guard as normalizeSession and saveCustomTheme
  s.backgroundColor = safeColor(gv('s_backgroundColor'), s.backgroundColor);
  s.textColor   = safeColor(gv('s_textColor'),   s.textColor);
  s.accentColor = safeColor(gv('s_accentColor'), s.accentColor);
  s.advanced.stageBlur  = clampInt(gv('s_stageBlur'), 0, 24, s.advanced.stageBlur);
  s.advanced.fontFamily = gv('s_fontFamily')?.trim() || s.advanced.fontFamily;
  s.subtitleSettings.textColor = gv('s_assTextColor') || s.subtitleSettings.textColor;
  s.subtitleSettings.fontSize  = Math.max(0.6, Math.min(4, numOr(gv('s_assFontSize'), s.subtitleSettings.fontSize)));
  s.subtitleSettings.position  = gv('s_assPosition') || s.subtitleSettings.position;
  s.subtitleSettings.override  = gv('s_assOverride')  || s.subtitleSettings.override;
  s.tracking.enabled = gc('s_trackingEnabled');
  s.tracking.autoPauseOnAttentionLoss = gc('s_autoPauseOnAttentionLoss');
  s.advanced.autoResumeOnAttentionReturn = gc('s_autoResumeOnAttentionReturn');
  s.tracking.attentionThreshold = clampInt(gv('s_attentionThreshold'), 1, 120, 5);
  // Webcam → FS options
  if (!s.trackingFsOptions) s.trackingFsOptions = {};
  s.trackingFsOptions.pauseFsOnLoss       = gc('s_pauseFsOnLoss');
  s.trackingFsOptions.injectMacroOnLoss   = gc('s_injectMacroOnLoss');
  s.trackingFsOptions.lossInjectSlot      = clampInt(gv('s_lossInjectSlot') ?? '0', 0, 5, 0);
  s.trackingFsOptions.injectMacroOnReturn = gc('s_injectMacroOnReturn');
  s.trackingFsOptions.returnInjectSlot    = clampInt(gv('s_returnInjectSlot') ?? '0', 0, 5, 0);
  // FunScript
  s.funscriptSettings.speed  = Number(gv('s_fsSpeed'))  || 1;
  s.funscriptSettings.range  = clampInt(gv('s_fsRange'), 1, 100, 100);
  s.funscriptSettings.invert = gc('s_fsInvert');
  const wsUrl = gv('s_deviceWsUrl')?.trim();
  if (wsUrl && /^wss?:\/\/./.test(wsUrl)) s.advanced.deviceWsUrl = wsUrl.slice(0, 200);
  // ── Display / HUD options ──────────────────────────────────────────────────
  if (!s.hudOptions) s.hudOptions = {};
  s.hudOptions.showMetricBars  = gc('s_hudMetricBars')  ?? true;
  s.hudOptions.showScene       = gc('s_hudScene')       ?? true;
  s.hudOptions.showMacroSlots  = gc('s_hudMacroSlots')  ?? true;
  s.hudOptions.showVariables   = gc('s_hudVariables')   ?? true;
  s.hudOptions.showHint        = gc('s_hudHint')        ?? false;
  const hideAfter = parseFloat(gv('s_hudHideAfter'));
  if (!isNaN(hideAfter)) s.hudOptions.hideAfterSec = Math.max(0.5, Math.min(30, hideAfter));
  // Metric bar position + per-bar visibility
  const metricsPos = gv('s_hudMetricsPos');
  if (metricsPos) s.hudOptions.metricsPosition = metricsPos;
  s.hudOptions.showAttention  = gc('s_showAttention')  ?? true;
  s.hudOptions.showEngagement = gc('s_showEngagement') ?? true;
  s.hudOptions.showIntensity  = gc('s_showIntensity')  ?? true;
  if (!s.displayOptions) s.displayOptions = {};
  s.displayOptions.richIdleScreen   = gc('s_displayRichIdle')   ?? true;
  s.displayOptions.showFsHeatmap    = gc('s_displayFsHeatmap')  ?? true;
  const sbUrl = gv('s_sensorBridgeUrl')?.trim();
  if (sbUrl && /^wss?:\/\/./.test(sbUrl)) s.displayOptions.sensorBridgeUrl = sbUrl.slice(0, 200);
  s.displayOptions.sensorBridgeAuto = gc('s_sensorBridgeAuto')  ?? false;
  s.displayOptions.toastXp           = gc('s_toastXp')           ?? true;
  s.displayOptions.toastLevelUp      = gc('s_toastLevelUp')      ?? true;
  s.displayOptions.toastAchievements = gc('s_toastAchievements') ?? true;
  s.displayOptions.toastQuests       = gc('s_toastQuests')       ?? true;
  // Webcam fullscreen preview
  s.displayOptions.webcamPreview = gc('s_webcamPreview') ?? false;
  s.displayOptions.webcamCorner  = gv('s_webcamCorner')  ?? 'bottom-right';
  s.displayOptions.webcamSize    = clampInt(gv('s_webcamSize'), 5, 40, 15);
  // Safety settings — only write if the section was populated (safetySettings may be null → use defaults)
  const maxInt = parseFloat(gv('s_safetyMaxInt'));
  if (!isNaN(maxInt)) {
    if (!s.safetySettings) s.safetySettings = {};
    s.safetySettings.maxIntensity      = Math.max(0, Math.min(2,    maxInt));
    s.safetySettings.maxSpeed          = Math.max(0.25, Math.min(4,    parseFloat(gv('s_safetyMaxSpd'))  || 4));
    // warnAbove, emergencyCooldownSec, and autoReduceTarget can legitimately be 0
    // — use isNaN check instead of || to avoid swallowing a deliberate zero
    const warn = parseFloat(gv('s_safetyWarn'));
    s.safetySettings.warnAbove         = Math.max(0, Math.min(2, isNaN(warn) ? 1.5 : warn));
    const cool = Number(gv('s_safetyCool'));
    s.safetySettings.emergencyCooldownSec = Math.max(0, isNaN(cool) ? 30 : cool);
    s.safetySettings.autoReduceOnLoss  = gc('s_safetyAutoReduce');
    const target = parseFloat(gv('s_safetyReduceTarget'));
    s.safetySettings.autoReduceTarget  = Math.max(0, Math.min(2, isNaN(target) ? 0.8 : target));
  }
  applyCssVars();
  persist();
}

export function renderThemeGrid() {
  const grid = $id('themeGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(themeMap()).map(([key, t]) => `
    <button class="theme-chip${state.session.theme===key?' active':''}" data-theme-key="${key}">
      <div class="theme-dot" style="background:${t.backgroundColor};border:2px solid ${t.accentColor}"></div>
      ${esc(t.name)}
    </button>`).join('');
}

export function saveCustomTheme() {
  const key = $id('s_customThemeKey')?.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const name= $id('s_customThemeName')?.value.trim() || key;
  if (!key) {
    notify.warn('Enter a theme key (e.g. "oceanic") first.');
    return;
  }
  history.push();
  // Run colors through _safeColor (imported from state.js) so values stored
  // here match the invariant that all color fields are validated hex strings —
  // exactly as normalizeSession does on import.  Color pickers always produce
  // #rrggbb, but this is a defense-in-depth guard against programmatic callers.
  state.session.customThemes[key] = {
    name,
    backgroundColor: _safeColor($id('s_customThemeBg')?.value,    '#05070a'),
    accentColor:     _safeColor($id('s_customThemeAccent')?.value, '#7fb0ff'),
    textColor:       _safeColor($id('s_customThemeText')?.value,   '#eef4fb'),
  };
  applyTheme(key);
  persist();
  renderThemeGrid();
  notify.success(`Theme "${name}" saved.`);
}

export function deleteCustomTheme() {
  if (builtinThemes[state.session.theme]) {
    notify.warn('Built-in themes cannot be deleted. Select a custom theme first.');
    return;
  }
  const name = state.session.customThemes[state.session.theme]?.name ?? state.session.theme;
  history.push();
  delete state.session.customThemes[state.session.theme];
  applyTheme('midnight');
  persist();
  renderThemeGrid();
  notify.info(`Theme "${name}" deleted.`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function posLabel(p) {
  return { 'top-left':'↖', top:'↑', 'top-right':'↗', left:'←', center:'·', right:'→', 'bottom-left':'↙', bottom:'↓', 'bottom-right':'↘' }[p] || p;
}
