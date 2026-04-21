// ── funscript.js ──────────────────────────────────────────────────────────
// FunScript import/export, timeline canvas editor, playback interpolation,
// and optional device output via Intiface Central WebSocket.

import { state, persist, $id, uid, fileToDataUrl, normalizeFunscriptTrack } from './state.js';
import { validateFunScript, validateMediaFile } from './import-validate.js';
import { history } from './history.js';

// ── Overview lane canvas ───────────────────────────────────────────────────
const OVERVIEW_H = 32;
let _overviewCanvas = null;
let _overviewCtx    = null;
let _sceneDrag = null; // { sceneId, edge: 'start'|'end', origX }

function initOverviewCanvas(canvasEl) {
  _overviewCanvas = canvasEl;
  _overviewCtx    = canvasEl.getContext('2d');

  canvasEl.addEventListener('mousedown', onOverviewMouseDown);
  canvasEl.addEventListener('mousemove', onOverviewMouseMove);
  canvasEl.addEventListener('mouseup',   onOverviewMouseUp);
  canvasEl.addEventListener('mouseleave', () => {
    if (!_sceneDrag) { canvasEl.style.cursor = 'default'; }
  });
  // Click overview to centre the zoom window on that time (only useful when zoomed)
  canvasEl.addEventListener('click', e => {
    if (_sceneDrag) return;
    if (_viewEnd === null) return; // not zoomed — nothing to do
    const rect = canvasEl.getBoundingClientRect();
    const x    = (e.clientX - rect.left) * (canvasEl.width / rect.width);
    const sec  = overviewSecFromX(x);
    const half = viewRange() / 2;
    _viewStart = sec * 1000 - half;
    _viewEnd   = _viewStart + viewRange();
    clampView();
    drawTimeline(state.runtime?.sessionTime ?? null);
  });
  // Wheel zoom on overview mirrors the FunScript canvas
  canvasEl.addEventListener('wheel', onCanvasWheel, { passive: false });
}

function overviewX(sec) {
  if (!_overviewCanvas) return 0;
  return (sec / (state.session.duration || 1)) * _overviewCanvas.width;
}

function overviewSecFromX(x) {
  if (!_overviewCanvas) return 0;
  return Math.max(0, Math.min(state.session.duration, (x / _overviewCanvas.width) * state.session.duration));
}

function drawOverviewLane(playheadSec = null) {
  const oc = _overviewCanvas, ctx = _overviewCtx;
  if (!oc || !ctx) return;
  const W = oc.width, H = OVERVIEW_H;
  oc.height = H;
  const { session } = state;

  // Background
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, W, H);

  // Block bands (lower half)
  const BLOCK_ROW_Y = Math.floor(H * 0.55);
  const BLOCK_ROW_H = H - BLOCK_ROW_Y;
  for (const b of session.blocks) {
    const x1 = overviewX(b.start), x2 = overviewX(b.start + b.duration);
    ctx.fillStyle = (BLOCK_COLORS[b.type] || '#888') + '55';
    ctx.fillRect(x1, BLOCK_ROW_Y, Math.max(1, x2 - x1), BLOCK_ROW_H);
    ctx.fillStyle = (BLOCK_COLORS[b.type] || '#888') + 'aa';
    ctx.fillRect(x1, BLOCK_ROW_Y, 1, BLOCK_ROW_H);
  }

  // Scene bands (upper half)
  const SCENE_ROW_H = Math.floor(H * 0.5);
  for (const sc of (session.scenes || [])) {
    const x1 = overviewX(sc.start), x2 = overviewX(sc.end);
    if (x2 < 0 || x1 > W) continue;
    ctx.fillStyle = sc.color + '33';
    ctx.fillRect(x1, 0, Math.max(1, x2 - x1), SCENE_ROW_H);
    // Scene edge handles
    ctx.fillStyle = sc.color + 'cc';
    ctx.fillRect(x1, 0, 2, SCENE_ROW_H);
    ctx.fillRect(x2 - 2, 0, 2, SCENE_ROW_H);
    // Label — prefix with state type icon when set
    if (x2 - x1 > 20) {
      const icon  = sc.stateType ? (STATE_PROFILES[sc.stateType]?.icon ?? '') : '';
      const label = icon ? `${icon} ${sc.name}` : sc.name;
      ctx.fillStyle = sc.color + 'dd';
      ctx.font = '8px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x1 + 4, 2);
    }
  }

  // Scene branch arrows — dashed arcs from scene end to branch target start
  // Drawn after scene bands so they appear on top
  for (const sc of (session.scenes || [])) {
    if (!sc.nextSceneId) continue;
    const target = session.scenes.find(s => s.id === sc.nextSceneId);
    if (!target) continue;
    const x1 = overviewX(sc.end);
    const x2 = overviewX(target.start);
    if (x1 < 0 && x2 < 0) continue;
    if (x1 > W && x2 > W) continue;
    const arrowY  = Math.floor(SCENE_ROW_H * 0.6);
    const cpY     = arrowY - Math.max(8, Math.abs(x2 - x1) * 0.4); // control point height
    // Draw curved dashed arc
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = sc.color + 'cc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, arrowY);
    ctx.quadraticCurveTo((x1 + x2) / 2, cpY, x2, arrowY);
    ctx.stroke();
    // Arrowhead at target
    const angle = Math.atan2(arrowY - cpY, x2 - (x1 + x2) / 2);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x2, arrowY);
    ctx.lineTo(x2 - 6 * Math.cos(angle - 0.4), arrowY - 6 * Math.sin(angle - 0.4));
    ctx.moveTo(x2, arrowY);
    ctx.lineTo(x2 - 6 * Math.cos(angle + 0.4), arrowY - 6 * Math.sin(angle + 0.4));
    ctx.stroke();
    ctx.restore();
  }

  // Subtitle cue ticks (thin lines at bottom)
  for (const track of session.subtitleTracks) {
    if (track._disabled) continue;
    ctx.fillStyle = '#5fa0dc66';
    for (const ev of (track.events || [])) {
      const x = overviewX(ev.start);
      ctx.fillRect(x, H - 3, Math.max(1, overviewX(ev.end) - x), 3);
    }
  }

  // Time grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  const step = session.duration <= 120 ? 10 : session.duration <= 600 ? 30 : 60;
  for (let t = 0; t <= session.duration; t += step) {
    const x = overviewX(t);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Trigger window markers — amber diamonds at atSec with duration band
  for (const tr of (session.triggers ?? [])) {
    if (!tr.enabled) continue;
    const tx1 = overviewX(tr.atSec);
    const tx2 = overviewX(tr.atSec + tr.windowDurSec);
    if (tx2 < 0 || tx1 > W) continue;
    // Duration band
    ctx.fillStyle = 'rgba(240,160,74,0.18)';
    ctx.fillRect(tx1, 0, Math.max(1, tx2 - tx1), H);
    // Diamond marker at open time
    ctx.strokeStyle = '#f0a04a';
    ctx.lineWidth = 1.5;
    const cy = H / 2, r = 4;
    ctx.beginPath();
    ctx.moveTo(tx1, cy - r); ctx.lineTo(tx1 + r, cy);
    ctx.lineTo(tx1, cy + r); ctx.lineTo(tx1 - r, cy);
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(240,160,74,0.5)';
    ctx.fill();
  }

  // Playhead — shows what the FunScript canvas is displaying
  if (_viewEnd !== null) {
    const vx1 = overviewX(_viewStart / 1000);
    const vx2 = overviewX(_viewEnd   / 1000);
    // Dimmed region outside the viewport
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,   0, vx1,      H);
    ctx.fillRect(vx2, 0, W - vx2,  H);
    // Viewport border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx1, 0, vx2 - vx1, H);
  }
}

// ── Scene ruler strip (above FunScript canvas in the dialog) ──────────────
// Renders named, colour-coded scene bands in the #fsDlgSceneRuler div.
// Called by drawTimeline() so it stays in sync with zoom/scroll.
function drawSceneRuler() {
  const ruler = document.getElementById('fsDlgSceneRuler');
  if (!ruler) return;
  const { session } = state;
  const scenes = session.scenes ?? [];
  const dur    = session.duration || 1;
  const W      = ruler.offsetWidth;
  if (!W) return;

  if (!scenes.length) {
    ruler.innerHTML = '';
    return;
  }

  // Use the same viewport as the main canvas
  const vStart = _viewStart / 1000;                      // ms→s
  const vEnd   = (_viewEnd ?? dur * 1000) / 1000;        // ms→s
  const vRange = Math.max(1, vEnd - vStart);

  ruler.innerHTML = scenes.map(sc => {
    const x1  = Math.max(0,  ((sc.start - vStart) / vRange) * W);
    const x2  = Math.min(W,  ((sc.end   - vStart) / vRange) * W);
    if (x2 <= 0 || x1 >= W) return '';
    const w   = x2 - x1;
    const col = sc.color || '#888';
    const STATE_ICONS = { calm:'🌊', build:'📈', peak:'⚡', recovery:'🌱',
      induction:'🌀', trance:'💫', deepening:'🔽', integration:'🌿' };
    const icon  = STATE_ICONS[sc.stateType] ?? '';
    const label = icon ? `${icon} ${sc.name}` : sc.name;
    return `<div style="position:absolute;top:0;bottom:0;left:${x1.toFixed(1)}px;width:${w.toFixed(1)}px;
      background:${col}22;border-left:1.5px solid ${col}88;overflow:hidden;
      display:flex;align-items:center;padding:0 5px;box-sizing:border-box">
      <span style="font-size:8.5px;font-weight:600;color:${col};white-space:nowrap;
        overflow:hidden;text-overflow:ellipsis;letter-spacing:.03em">${label}</span>
    </div>`;
  }).join('');
}

// ── Scene drag on overview canvas ─────────────────────────────────────────
const SCENE_EDGE_HIT_PX = 6; // px tolerance for clicking a scene edge

function _overviewHitTest(x) {
  const sec = overviewSecFromX(x);
  const H   = OVERVIEW_H;
  const scenes = state.session.scenes || [];
  for (const sc of scenes) {
    const x1 = overviewX(sc.start), x2 = overviewX(sc.end);
    if (Math.abs(x - x1) <= SCENE_EDGE_HIT_PX) return { sceneId: sc.id, edge: 'start' };
    if (Math.abs(x - x2) <= SCENE_EDGE_HIT_PX) return { sceneId: sc.id, edge: 'end' };
  }
  return null;
}

function onOverviewMouseDown(e) {
  const rect = _overviewCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (_overviewCanvas.width / rect.width);
  const hit = _overviewHitTest(x);
  if (hit) {
    _sceneDrag = { ...hit, origX: x };
    history.push();
    e.preventDefault();
  }
}

function onOverviewMouseMove(e) {
  const rect = _overviewCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (_overviewCanvas.width / rect.width);

  if (_sceneDrag) {
    const sec = overviewSecFromX(x);
    const scene = state.session.scenes.find(s => s.id === _sceneDrag.sceneId);
    if (scene) {
      if (_sceneDrag.edge === 'start') {
        scene.start = Math.max(0, Math.min(scene.end - 1, Math.round(sec)));
      } else {
        scene.end = Math.min(state.session.duration, Math.max(scene.start + 1, Math.round(sec)));
      }
      drawOverviewLane(state.runtime?.sessionTime ?? null);
      drawTimeline(state.runtime?.sessionTime ?? null);
    }
    _overviewCanvas.style.cursor = 'ew-resize';
    return;
  }

  const hit = _overviewHitTest(x);
  _overviewCanvas.style.cursor = hit ? 'ew-resize' : 'default';
}

function onOverviewMouseUp() {
  if (_sceneDrag) {
    persist();
    // Re-render scene inspector if open (ui.js imports funscript.js so must stay lazy)
    if (state.selectedSidebarType === 'scenes') {
      import('./ui.js').then(({ renderInspector }) => renderInspector()).catch(() => {});
    }
    _sceneDrag = null;
  }
}
// { "version": 1, "inverted": false, "range": 100,
//   "actions": [{"at": 0, "pos": 0}, {"at": 500, "pos": 100}, ...] }
// "at" = milliseconds from start, "pos" = 0-100

// Accepts either a raw JSON string or an already-parsed object.
// importFunScriptFile passes an object to avoid double-parsing.
export function parseFunScript(textOrObj) {
  const raw = (typeof textOrObj === 'string') ? JSON.parse(textOrObj) : textOrObj;
  const actions = (raw.actions || [])
    .map(a => ({ at: Number(a.at), pos: Number(a.pos) }))
    .filter(a => Number.isFinite(a.at) && Number.isFinite(a.pos))
    .sort((a, b) => a.at - b.at);
  return {
    version:  raw.version  ?? 1,
    inverted: raw.inverted ?? false,
    range:    raw.range    ?? 100,
    actions,
  };
}

export function exportFunScript(track) {
  const { version, inverted, range, actions } = track;
  return JSON.stringify({ version: version ?? 1, inverted: !!inverted, range: range ?? 100, actions }, null, 2);
}

// Linearly interpolate position at a given time (ms)
export function interpolatePosition(actions, timeMs, inverted = false, range = 100) {
  if (!actions || !actions.length) return 0;
  if (!Number.isFinite(timeMs)) return 0;  // guard NaN/Infinity from upstream bugs
  if (timeMs <= actions[0].at)                   return applyMods(actions[0].pos, inverted, range);
  if (timeMs >= actions[actions.length - 1].at)  return applyMods(actions[actions.length - 1].pos, inverted, range);
  let lo = 0, hi = actions.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (actions[mid].at <= timeMs) lo = mid; else hi = mid; }
  const dAt = actions[hi].at - actions[lo].at;
  // Guard duplicate timestamps (dAt=0 means two points at same time — snap to lo position)
  const t = dAt > 0 ? (timeMs - actions[lo].at) / dAt : 0;
  const pos = actions[lo].pos + t * (actions[hi].pos - actions[lo].pos);
  return applyMods(pos, inverted, range);
}

function applyMods(pos, inverted, range) {
  const scaled = (pos / 100) * range;
  return Math.round(inverted ? range - scaled : scaled);
}

// ── File handling ──────────────────────────────────────────────────────────
export async function importFunScriptFile(file) {
  // Size-check by file.size BEFORE reading — FunScript is JSON, not binary media
  if (!file) throw new Error('No FunScript file provided.');
  if (file.size > 5_000_000) throw new Error(`FunScript file is too large (${(file.size/1e6).toFixed(1)} MB). Max: 5 MB.`);
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`Not valid JSON: ${e.message}`); }
  validateFunScript(raw);                   // structure + action-count check
  const parsed = parseFunScript(raw);  // pass the already-parsed object — no re-parse
  // Route through the full normalizer so _safeId, range clamping [1,100],
  const track = normalizeFunscriptTrack({
    id: uid(),
    name: file.name.replace(/\.funscript$/i, ''),
    version:  parsed.version,
    inverted: parsed.inverted,
    range:    parsed.range,
    actions:  parsed.actions,
    _disabled: false,
    _color: TRACK_COLORS[state.session.funscriptTracks.length % TRACK_COLORS.length],
    variant: '',
  });
  history.push(); // make import undoable — consistent with all other track mutations
  state.session.funscriptTracks.push(track);
  persist();
}

export function downloadFunScript(trackId) {
  const track = state.session.funscriptTracks.find(t => t.id === trackId);
  if (!track) return;
  const blob = new Blob([exportFunScript(track)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // Multi-axis naming convention: <name>.<axis>.funscript (stroke is default/primary)
  const axis = track.axis || 'stroke';
  const baseName = (track.name || 'funscript').replace(/\s+/g, '_');
  a.download = axis === 'stroke' ? `${baseName}.funscript` : `${baseName}.${axis}.funscript`;
  a.click(); URL.revokeObjectURL(a.href);
}

const TRACK_COLORS = ['#f0a04a', '#5fa0dc', '#7dc87a', '#b084cc', '#e07a5f', '#64b5c8'];

// ── Device connection (Intiface Central WebSocket) ─────────────────────────
export function connectDevice(wsUrl = 'ws://localhost:12345') {
  if (state.deviceSocket?.readyState === WebSocket.OPEN) { state.deviceSocket.close(); }
  _deviceIndex = null;
  try {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      state.deviceSocket = ws;
      updateDeviceStatus('Connecting…', '#f0a04a');
      // Step 1: handshake
      ws.send(JSON.stringify([{ RequestServerInfo: { Id: 1, ClientName: 'AdaptiveSessionStudio', MessageVersion: 3 } }]));
    };
    ws.onclose = () => { state.deviceSocket = null; _deviceIndex = null; updateDeviceStatus('Disconnected', null); };
    ws.onerror = () => { state.deviceSocket = null; _deviceIndex = null; updateDeviceStatus('Error', '#e05050'); };
    ws.onmessage = e => {
      try { handleDeviceMessage(JSON.parse(e.data)); }
      catch { /* ignore malformed Buttplug messages */ }
    };
  } catch (err) {
    updateDeviceStatus('Failed', '#e05050');
  }
}

export function disconnectDevice() {
  if (state.deviceSocket?.readyState === WebSocket.OPEN) {
    try { state.deviceSocket.send(JSON.stringify([{ StopAllDevices: { Id: 99 } }])); } catch {}
  }
  state.deviceSocket?.close();
  state.deviceSocket = null;
  _deviceIndex = null;
  updateDeviceStatus('Disconnected', null);
}

function updateDeviceStatus(text, color) {
  // Update all elements with class 'device-status-display' to avoid duplicate-ID issues
  document.querySelectorAll('.device-status-display').forEach(el => {
    el.textContent = text;
    el.style.color = color || 'var(--text3)';
  });
}

let _deviceIndex = null;
let _msgId = 10;
function nextId() { return ++_msgId; }

function handleDeviceMessage(msgs) {
  const ws = state.deviceSocket;
  for (const msg of msgs) {
    if (msg.ServerInfo) {
      // Step 2: request already-connected device list
      ws?.send(JSON.stringify([{ RequestDeviceList: { Id: nextId() } }]));
      // Step 3: start scanning for new devices
      ws?.send(JSON.stringify([{ StartScanning: { Id: nextId() } }]));
      updateDeviceStatus('Scanning…', '#f0a04a');
    }
    if (msg.DeviceList) {
      const devices = msg.DeviceList.Devices ?? [];
      if (devices.length > 0) {
        _deviceIndex = devices[0].DeviceIndex;
        updateDeviceStatus(`Device: ${devices[0].DeviceName}`, '#7dc87a');
      } else {
        updateDeviceStatus('Scanning… (no device yet)', '#f0a04a');
      }
    }
    if (msg.DeviceAdded) {
      _deviceIndex = msg.DeviceAdded.DeviceIndex;
      updateDeviceStatus(`Device: ${msg.DeviceAdded.DeviceName}`, '#7dc87a');
    }
    if (msg.DeviceRemoved) {
      if (msg.DeviceRemoved.DeviceIndex === _deviceIndex) {
        _deviceIndex = null;
        updateDeviceStatus('Device disconnected', '#e07a5f');
      }
    }
    if (msg.ScanningFinished) {
      if (_deviceIndex === null) updateDeviceStatus('No device found', '#e07a5f');
    }
    if (msg.Error) {
      updateDeviceStatus(`Error: ${msg.Error.ErrorMessage ?? 'unknown'}`, '#e05050');
    }
  }
}

// Send a linear position command (0-1) to connected device
export function sendDevicePosition(pos01) {
  if (!state.deviceSocket || state.deviceSocket.readyState !== WebSocket.OPEN || _deviceIndex === null) return;
  const cmd = [{ LinearCmd: { Id: 1, DeviceIndex: _deviceIndex, Vectors: [{ Index: 0, Duration: 150, Position: pos01 }] } }];
  state.deviceSocket.send(JSON.stringify(cmd));
}

// ── Timeline canvas ────────────────────────────────────────────────────────
// The FunScript timeline is a canvas element that:
//  • Renders all enabled funscript tracks as position curves
//  • Renders session blocks as background bands
//  • Renders subtitle cue markers
//  • Shows a playhead that updates during playback
//  • Supports adding, moving, deleting points in edit mode

const CANVAS_H = 110; // px
let _canvas = null;
let _ctx = null;
// _dragState now holds { trackId, actionRef } where actionRef is the actual object
let _dragState = null;
// _hoverPoint holds { trackId, actionRef }
let _hoverPoint = null;
// Selection is now track-specific
// state.selectedFsPoint = { trackId, actionRef } | null

export function initTimeline(canvasEl) {
  _canvas = canvasEl;
  _ctx = canvasEl.getContext('2d');
  canvasEl.style.cursor = 'crosshair';

  // Init the overview lane canvas if present in the DOM
  const oc = document.getElementById('overviewCanvas');
  if (oc) initOverviewCanvas(oc);

  canvasEl.addEventListener('mousedown', onCanvasMouseDown);
  canvasEl.addEventListener('mousemove', onCanvasMouseMove);
  canvasEl.addEventListener('mouseup',   onCanvasMouseUp);
  canvasEl.addEventListener('contextmenu', onCanvasContextMenu);
  canvasEl.addEventListener('mouseleave', () => { _hoverPoint = null; drawTimeline(); });
  // Wheel zoom on the FunScript canvas
  canvasEl.addEventListener('wheel', onCanvasWheel, { passive: false });
}

// ── Zoom viewport ─────────────────────────────────────────────────────────
// _viewStart/_viewEnd are in milliseconds, defaulting to the full session.
// Both canvases share the same viewport so they scroll and zoom together.
let _viewStart = 0;        // ms from start — left edge of visible window
let _viewEnd   = null;     // ms — right edge; null means "use session end"

function viewEnd() {
  return _viewEnd ?? (state.session.duration * 1000);
}

function viewRange() {
  return Math.max(1000, viewEnd() - _viewStart);
}

// Clamp viewport so it never goes outside the session or collapses below 2s
function clampView() {
  const totalMs = state.session.duration * 1000;
  const range   = viewRange();
  _viewStart = Math.max(0, Math.min(_viewStart, totalMs - range));
  _viewEnd   = _viewStart + range;
  if (_viewEnd > totalMs) { _viewEnd = totalMs; _viewStart = Math.max(0, _viewEnd - range); }
}

export function resetZoom() {
  _viewStart = 0;
  _viewEnd   = null;
  // Clear any in-progress drag state so stale refs don't bleed into a new session
  _dragState  = null;
  _sceneDrag  = null;
}

// Persist zoom viewport to session so it survives tab switches and reloads
export function saveZoom() {
  if (!state.session.displayOptions) state.session.displayOptions = {};
  state.session.displayOptions.tlViewStart = _viewStart;
  state.session.displayOptions.tlViewEnd   = _viewEnd;
}

// Restore a previously saved zoom viewport
export function restoreZoom() {
  const opts = state.session.displayOptions;
  if (!opts) return;
  if (Number.isFinite(opts.tlViewStart)) _viewStart = opts.tlViewStart;
  if (Number.isFinite(opts.tlViewEnd))   _viewEnd   = opts.tlViewEnd;
  clampView();
}

function canvasToTime(x) {
  return _viewStart + (x / _canvas.width) * viewRange();
}

function timeToX(ms) {
  return ((ms - _viewStart) / viewRange()) * _canvas.width;
}

function posToY(pos) {
  return CANVAS_H - 8 - (pos / 100) * (CANVAS_H - 16);
}

function yToPos(y) {
  return Math.min(100, Math.max(0, Math.round(((CANVAS_H - 8 - y) / (CANVAS_H - 16)) * 100)));
}

// ── Mouse-wheel zoom ───────────────────────────────────────────────────────
function onCanvasWheel(e) {
  e.preventDefault();
  const rect   = _canvas.getBoundingClientRect();
  const cx     = (e.clientX - rect.left) * (_canvas.width / rect.width);
  const pivotMs = canvasToTime(cx);
  const factor  = e.deltaY < 0 ? 0.75 : 1 / 0.75;
  const totalMs = state.session.duration * 1000;
  const minRange = 2000;
  const newRange = Math.min(totalMs, Math.max(minRange, viewRange() * factor));
  _viewStart = pivotMs - (cx / _canvas.width) * newRange;
  _viewEnd   = _viewStart + newRange;
  clampView();
  saveZoom();
  drawTimeline(state.runtime?.sessionTime ?? null);
}

// Returns { trackId, actionRef } where actionRef is the actual action object
function hitTest(x, y, radius = 8) {
  for (const track of state.session.funscriptTracks) {
    if (track._disabled) continue;
    for (const a of track.actions) {
      if (Math.hypot(x - timeToX(a.at), y - posToY(a.pos)) < radius) {
        return { trackId: track.id, actionRef: a };
      }
    }
  }
  return null;
}

function onCanvasMouseDown(e) {
  if (!state.fsEditMode) return;
  const rect = _canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (_canvas.width / rect.width);
  const y = (e.clientY - rect.top)  * (_canvas.height / rect.height);

  const hit = hitTest(x, y);
  if (hit) {
    if (e.shiftKey) {
      // Shift+click toggles multi-selection
      if (state.selectedFsPoints.has(hit.actionRef)) {
        state.selectedFsPoints.delete(hit.actionRef);
      } else {
        state.selectedFsPoints.add(hit.actionRef);
      }
      state.selectedFsPoint = hit;
    } else {
      // Plain click: if this point is not in multi-selection, start fresh
      if (!state.selectedFsPoints.has(hit.actionRef)) {
        state.selectedFsPoints.clear();
        state.selectedFsPoints.add(hit.actionRef);
      }
      _dragState = hit;
      state.selectedFsPoint = hit;
      history.push(); // snapshot before drag begins so the move is undoable
    }
    drawTimeline();
  } else {
    if (!e.shiftKey) {
      // Click empty space: clear selection, add new point
      state.selectedFsPoints.clear();
      const track = state.session.funscriptTracks.find(t => !t._disabled);
      if (!track) return;
      history.push();
      const action = { at: Math.round(canvasToTime(x)), pos: yToPos(y) };
      track.actions.push(action);
      track.actions.sort((a, b) => a.at - b.at);
      state.selectedFsPoint = { trackId: track.id, actionRef: action };
      state.selectedFsPoints.add(action);
      persist();
      drawTimeline();
    }
  }
}

function onCanvasMouseMove(e) {
  const rect = _canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (_canvas.width / rect.width);
  const y = (e.clientY - rect.top)  * (_canvas.height / rect.height);

  if (_dragState && state.fsEditMode) {
    const newAt  = Math.max(0, Math.round(canvasToTime(x)));
    const newPos = yToPos(y);
    const dAt    = newAt  - _dragState.actionRef.at;
    const dPos   = newPos - _dragState.actionRef.pos;
    // Move ALL selected points by the same delta
    for (const actionRef of state.selectedFsPoints) {
      actionRef.at  = Math.max(0, actionRef.at  + dAt);
      actionRef.pos = Math.min(100, Math.max(0, actionRef.pos + dPos));
    }
    // Keep primary drag point at exact cursor position
    _dragState.actionRef.at  = newAt;
    _dragState.actionRef.pos = newPos;
    drawTimeline(); return;
  }

  _hoverPoint = hitTest(x, y);
  _canvas.style.cursor = _hoverPoint ? 'grab' : (state.fsEditMode ? 'crosshair' : 'default');
  drawTimeline();
}

function onCanvasMouseUp() {
  if (_dragState) {
    // Sort only on release, once dragging is complete
    const track = state.session.funscriptTracks.find(t => t.id === _dragState.trackId);
    track?.actions.sort((a, b) => a.at - b.at);
    persist();
  }
  _dragState = null;
}

function onCanvasContextMenu(e) {
  e.preventDefault();
  if (!state.fsEditMode) return;
  const rect = _canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (_canvas.width / rect.width);
  const y = (e.clientY - rect.top)  * (_canvas.height / rect.height);
  const hit = hitTest(x, y);
  if (hit) {
    const track = state.session.funscriptTracks.find(t => t.id === hit.trackId);
    if (track) {
      const idx = track.actions.indexOf(hit.actionRef);
      if (idx !== -1) {
        history.push(); // snapshot before delete so it's undoable
        track.actions.splice(idx, 1);
      }
      if (state.selectedFsPoint?.actionRef === hit.actionRef) state.selectedFsPoint = null;
      state.selectedFsPoints.delete(hit.actionRef);
      persist(); drawTimeline();
    }
  }
}

export function drawTimeline(playheadSec = null) {
  if (!_canvas || !_ctx) return;
  if (_canvas.width <= 0 || _canvas.offsetWidth <= 0) return;
  if (_overviewCanvas) {
    _overviewCanvas.width = _overviewCanvas.offsetWidth;
    drawOverviewLane(playheadSec);
  }
  drawSceneRuler(); // update the named-scene ruler strip above the canvas
  const { session } = state;
  const W = _canvas.width, H = CANVAS_H;
  _canvas.height = H;
  const ctx = _ctx;
  ctx.clearRect(0, 0, W, H);

  // Update zoom UI indicators
  const totalMs  = session.duration * 1000;
  const isZoomed = _viewEnd !== null && Math.round(viewRange()) < Math.round(totalMs);
  const zl = $id('zoomLabel'),   zb = $id('zoomResetBtn');
  if (zl) { zl.style.display = isZoomed ? '' : 'none'; zl.textContent = `${Math.round(totalMs / viewRange() * 100)}%`; }
  if (zb) zb.style.display = isZoomed ? '' : 'none';

  // Background
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, W, H);

  // Session block bands
  for (const b of session.blocks) {
    const x1 = timeToX(b.start * 1000);
    const x2 = timeToX((b.start + b.duration) * 1000);
    ctx.fillStyle = (BLOCK_COLORS[b.type] || '#888') + '22';
    ctx.fillRect(x1, 0, x2 - x1, H);
    ctx.fillStyle = (BLOCK_COLORS[b.type] || '#888') + '55';
    ctx.fillRect(x1, 0, 1, H);
  }

  // Scene markers — bands drawn on top of block bands for visibility
  if (session.scenes?.length) {
    for (const sc of session.scenes) {
      const x1 = timeToX(sc.start * 1000);
      const x2 = timeToX(sc.end   * 1000);
      if (x2 < 0 || x1 > W) continue;
      // Tinted band
      ctx.fillStyle = sc.color + '18';
      ctx.fillRect(x1, 0, x2 - x1, H);
      // Left edge marker
      ctx.strokeStyle = sc.color + 'bb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke();
      ctx.setLineDash([]);
      // Name label with state type icon prefix
      if (x2 - x1 > 16) {
        const STATE_ICONS = { calm: '🌊', build: '📈', peak: '⚡', recovery: '🌱' };
        const icon  = sc.stateType ? (STATE_ICONS[sc.stateType] ?? '') : '';
        const label = icon ? `${icon} ${sc.name}` : sc.name;
        ctx.fillStyle = sc.color + 'dd';
        ctx.font = 'bold 8.5px Inter, system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x1 + 4, 16);
      }
    }
  }

  // Time grid lines (every 10s)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  for (let t = 0; t <= session.duration; t += 10) {
    const x = timeToX(t * 1000);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Subtitle cue markers
  for (const track of session.subtitleTracks) {
    if (track._disabled) continue;
    ctx.fillStyle = '#5fa0dc88';
    for (const ev of (track.events || [])) {
      const x = timeToX(ev.start * 1000);
      ctx.fillRect(x, H - 4, Math.max(2, timeToX(ev.end * 1000) - x), 4);
    }
  }

  // Funscript curves
  for (const track of session.funscriptTracks) {
    if (track._disabled || !track.actions.length) continue;
    const col = track._color || '#f0a04a';
    const settings = session.funscriptSettings;

    ctx.beginPath();
    ctx.strokeStyle = col + 'cc';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    let first = true;
    for (const a of track.actions) {
      const pos = applyMods(a.pos, settings.invert, settings.range);
      const x = timeToX(a.at);
      const y = posToY(pos);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Points
    for (let i = 0; i < track.actions.length; i++) {
      const a = track.actions[i];
      const pos = applyMods(a.pos, settings.invert, settings.range);
      const x = timeToX(a.at);
      const y = posToY(pos);
      const isHovered  = _hoverPoint?.trackId === track.id && _hoverPoint?.actionRef === a;
      const isSelected = state.selectedFsPoint?.trackId === track.id && state.selectedFsPoint?.actionRef === a;
      const isMulti    = state.selectedFsPoints?.has(a) && !isSelected;
      ctx.beginPath();
      const radius = (isHovered || isSelected || isMulti) ? 5 : 3;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ffffff' : isMulti ? col : (isHovered ? col : col + 'aa');
      ctx.fill();
      if (isSelected || isMulti) { ctx.strokeStyle = col; ctx.lineWidth = isSelected ? 1.5 : 1; ctx.stroke(); }
    }
  }

  // Playhead
  if (playheadSec !== null) {
    const x = timeToX(playheadSec * 1000);
    ctx.strokeStyle = '#f0a04a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    // Time label
    ctx.fillStyle = '#f0a04a';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillText(formatMs(playheadSec * 1000), x + 3, 10);
  }

  // Edit mode overlay hint
  if (state.fsEditMode) {
    ctx.fillStyle = 'rgba(240,160,74,0.06)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f0a04a44';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText('Edit mode — click to add, drag to move, right-click to delete', 8, 12);
  }

  // Legend
  let lx = 8;
  for (const track of session.funscriptTracks) {
    const col = track._color || '#f0a04a';
    ctx.fillStyle = col;
    ctx.fillRect(lx, H - 14, 8, 4);
    ctx.fillStyle = track._disabled ? '#555' : col;
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillText(track.name, lx + 10, H - 11);
    lx += ctx.measureText(track.name).width + 24;
  }
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000), min = Math.floor(s / 60);
  return `${String(min).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

// ── Position indicator ────────────────────────────────────────────────────
// Returns current 0-100 position across all active funscript tracks (max)
// timeMsOverride: when set by live-control, uses pre-scaled time instead of computing from session speed
export function getCurrentPosition(sessionTimeSec, timeMsOverride = null) {
  const settings = state.session.funscriptSettings;
  const timeMs   = timeMsOverride !== null ? timeMsOverride : sessionTimeSec * 1000 * (1 / settings.speed);
  let maxPos = 0;
  for (const track of state.session.funscriptTracks) {
    if (track._disabled) continue;
    const pos = interpolatePosition(track.actions, timeMs, settings.invert, settings.range);
    if (pos > maxPos) maxPos = pos;
  }
  return maxPos;
}

export function updatePositionIndicator(pos) {
  const meter = $id('fsPositionMeter');
  const bar   = $id('fsPositionBar');
  const label = $id('fsPositionLabel');
  const hasTracks = state.session.funscriptTracks.some(t => !t._disabled);
  if (meter) meter.style.display = hasTracks ? 'flex' : 'none';
  if (bar)   {
    bar.style.height     = `${pos}%`;
    bar.style.background = pos > 70 ? '#e05050' : pos > 40 ? '#f0a04a' : '#5fa0dc';
  }
  if (label) label.textContent = `${Math.round(pos)}%`;
}

// ── Timeline show/hide ────────────────────────────────────────────────────
export function refreshTimelineVisibility() {
  const panel = $id('fsTimelinePanel');
  if (!panel) return;
  const hasTracks = state.session.funscriptTracks.length > 0;
  if (!hasTracks) {
    panel.dataset.collapsed = 'true';
    panel.style.display = 'none';
  } else if (panel.dataset.collapsed !== 'false') {
    // Auto-expand when first track is added
    panel.dataset.collapsed = 'false';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
  }
}

// ── Multi-select: select all points on the active track ────────────────────
export function selectAllPoints() {
  const track = state.session.funscriptTracks.find(t => !t._disabled);
  if (!track) return;
  state.selectedFsPoints = new Set(track.actions);
  state.selectedFsPoint  = track.actions.length
    ? { trackId: track.id, actionRef: track.actions[0] } : null;
  drawTimeline();
}

// ── Transform selected points ──────────────────────────────────────────────
// opts: { timeScale, posScale, timeOffset, posOffset }
// Operations are applied in order: scale first, then offset.
// If selectedFsPoints is empty, operates on the entire active track.
export function transformPoints(opts = {}) {
  const {
    timeScale  = 1,
    posScale   = 1,
    timeOffset = 0,
    posOffset  = 0,
  } = opts;

  const targets = state.selectedFsPoints.size > 0
    ? Array.from(state.selectedFsPoints)
    : state.session.funscriptTracks.find(t => !t._disabled)?.actions ?? [];

  if (!targets.length) return;

  // Find anchor time (minimum at in selection) for scale-from-start behaviour
  const minAt = Math.min(...targets.map(a => a.at));

  for (const a of targets) {
    // Scale relative to the start of selection
    a.at  = Math.max(0, Math.round((a.at - minAt) * timeScale + minAt + timeOffset));
    a.pos = Math.min(100, Math.max(0, Math.round(a.pos * posScale + posOffset)));
  }

  // Re-sort all tracks that were touched
  for (const track of state.session.funscriptTracks) {
    if (track._disabled) continue;
    const touched = track.actions.some(a => targets.includes(a));
    if (touched) track.actions.sort((a, b) => a.at - b.at);
  }

  persist();
  drawTimeline();
}
