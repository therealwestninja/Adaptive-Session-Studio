// ── macros.js ──────────────────────────────────────────────────────────────
// Macro Library: built-in presets, user macros, injection engine.
// Injection blends a short macro into a running FunScript with ease in/out.

import { state, persist, uid } from './state.js';
import { validateMacro, validateMediaFile } from './import-validate.js';
import { interpolatePosition, sendDevicePosition } from './funscript.js';
import { history } from './history.js';

// ── Built-in presets ────────────────────────────────────────────────────────
// Each preset is {at (ms), pos (0-100)}. Designed for haptic clarity.

export const BUILTIN_MACROS = [
  {
    id: 'preset_thrust_in',
    name: 'Thrust in',
    builtin: true,
    actions: [
      { at: 0,    pos: 0   },
      { at: 300,  pos: 20  },
      { at: 700,  pos: 80  },
      { at: 900,  pos: 100 },
    ],
  },
  {
    id: 'preset_pull_out',
    name: 'Pull out',
    builtin: true,
    actions: [
      { at: 0,   pos: 100 },
      { at: 150, pos: 70  },
      { at: 350, pos: 0   },
    ],
  },
  {
    id: 'preset_pump',
    name: 'Pump',
    builtin: true,
    actions: [
      { at: 0,    pos: 0   },
      { at: 300,  pos: 100 },
      { at: 500,  pos: 10  },
      { at: 800,  pos: 100 },
      { at: 1000, pos: 10  },
      { at: 1300, pos: 100 },
      { at: 1500, pos: 0   },
    ],
  },
  {
    id: 'preset_piston',
    name: 'Piston',
    builtin: true,
    actions: [
      { at: 0,    pos: 0   },
      { at: 150,  pos: 100 },
      { at: 300,  pos: 0   },
      { at: 450,  pos: 100 },
      { at: 600,  pos: 0   },
      { at: 750,  pos: 100 },
      { at: 900,  pos: 0   },
      { at: 1050, pos: 100 },
      { at: 1200, pos: 0   },
      { at: 1350, pos: 100 },
      { at: 1500, pos: 0   },
    ],
  },
  {
    id: 'preset_prod',
    name: 'Prod',
    builtin: true,
    actions: [
      { at: 0,   pos: 0   },
      { at: 180, pos: 100 },
      { at: 400, pos: 0   },
    ],
  },
  {
    id: 'preset_poke',
    name: 'Poke',
    builtin: true,
    actions: [
      { at: 0,   pos: 0  },
      { at: 200, pos: 70 },
      { at: 500, pos: 0  },
    ],
  },
  {
    id: 'preset_stroke',
    name: 'Stroke',
    builtin: true,
    actions: [
      { at: 0,    pos: 0   },
      { at: 500,  pos: 30  },
      { at: 900,  pos: 90  },
      { at: 1100, pos: 100 },
      { at: 1400, pos: 70  },
      { at: 1800, pos: 10  },
      { at: 2000, pos: 0   },
    ],
  },
  {
    id: 'preset_rub',
    name: 'Rub',
    builtin: true,
    actions: [
      { at: 0,    pos: 40 },
      { at: 120,  pos: 60 },
      { at: 240,  pos: 40 },
      { at: 360,  pos: 60 },
      { at: 480,  pos: 40 },
      { at: 600,  pos: 60 },
      { at: 720,  pos: 40 },
      { at: 840,  pos: 60 },
      { at: 960,  pos: 40 },
      { at: 1080, pos: 60 },
      { at: 1200, pos: 50 },
    ],
  },
];

// ── Library helpers ────────────────────────────────────────────────────────
// Merged view: builtins + user macros from session
export function allMacros() {
  return [
    ...BUILTIN_MACROS,
    ...(state.session.macroLibrary || []),
  ];
}

export function getMacro(id) {
  return allMacros().find(m => m.id === id) || null;
}

// Slot assignments: slots 1-5 map to macro IDs
export function getSlotMacro(slot) {
  const slots = state.session.macroSlots || {};
  const id    = slots[slot];
  return id ? getMacro(id) : (BUILTIN_MACROS[slot - 1] || null);
}

export function setSlotMacro(slot, macroId) {
  if (!state.session.macroSlots) state.session.macroSlots = {};
  state.session.macroSlots[slot] = macroId;
  persist();
}

// Save a user macro (new or update)
export function saveMacro(macro) {
  if (!state.session.macroLibrary) state.session.macroLibrary = [];
  const idx = state.session.macroLibrary.findIndex(m => m.id === macro.id);
  if (idx >= 0) state.session.macroLibrary[idx] = macro;
  else          state.session.macroLibrary.push(macro);
  persist();
}

// Remove a user macro (cannot remove builtins).
// Cleans up all references so deleted macros don't silently no-op downstream.
export function removeMacro(id) {
  if (!state.session.macroLibrary) return;
  history.push(); // snapshot before the deletion and its cascading reference cleanup
  state.session.macroLibrary = state.session.macroLibrary.filter(m => m.id !== id);

  // Clear any macro slot that pointed at the deleted id
  const slots = state.session.macroSlots ?? {};
  for (const slot of Object.keys(slots)) {
    if (slots[slot] === id) slots[slot] = null;
  }

  // Clear macro blocks that referenced the deleted id directly
  for (const block of (state.session.blocks ?? [])) {
    if (block.macroId === id) block.macroId = '';
  }

  // Clear rule actions that referenced the deleted macro id
  for (const rule of (state.session.rules ?? [])) {
    if (rule.action?.type === 'injectMacro' && rule.action.param === id) {
      rule.action.param = null;
    }
  }

  // Clear trigger actions that referenced the deleted macro id
  for (const trigger of (state.session.triggers ?? [])) {
    if (trigger.successAction?.type === 'injectMacro' && trigger.successAction.param === id) {
      trigger.successAction.param = null;
    }
    if (trigger.failureAction?.type === 'injectMacro' && trigger.failureAction.param === id) {
      trigger.failureAction.param = null;
    }
  }

  persist();
}

export function newMacro() {
  return { id: uid(), name: 'New macro', builtin: false, actions: [{ at: 0, pos: 0 }, { at: 500, pos: 100 }, { at: 1000, pos: 0 }] };
}

export function exportMacroFile(macro) {
  const obj = { version: 1, inverted: false, range: 100, actions: macro.actions };
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(macro.name || 'macro').replace(/\s+/g, '_')}.funscript`;
  a.click(); URL.revokeObjectURL(a.href);
}

export async function importMacroFile(file) {
  // Size-check by file.size BEFORE reading — macros are JSON, not binary media
  if (!file) throw new Error('No macro file provided.');
  if (file.size > 1_000_000) throw new Error(`Macro file is too large (${(file.size/1e6).toFixed(2)} MB). Max: 1 MB.`);
  const text = await file.text();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`"${file.name}" is not valid JSON: ${e.message}`);
  }
  validateMacro(raw);                      // structure + action-count check
  const actions = raw.actions
    .map(a => ({ at: Number(a.at), pos: Number(a.pos) }))
    .filter(a => Number.isFinite(a.at) && Number.isFinite(a.pos))
    .sort((a, b) => a.at - b.at);
  if (actions.length === 0) {
    throw new Error(`"${file.name}" actions contain no valid {at, pos} pairs.`);
  }
  const macro = { id: uid(), name: file.name.replace(/\.funscript$/i, ''), builtin: false, actions };
  history.push(); // make import undoable — same pattern as importFunScriptFile
  saveMacro(macro);
  return macro;
}

// Macro duration in ms
export function macroDuration(macro) {
  if (!macro?.actions?.length) return 0;
  return macro.actions[macro.actions.length - 1].at;
}

// ── Injection engine ────────────────────────────────────────────────────────
// Injection state lives in state.injection:
// {
//   actions:  [{at,pos}],  // full blended sequence (ease-in + macro + ease-out)
//   startMs:  number,      // performance.now() when injection began
//   totalMs:  number,      // total duration
//   onDone:   function,    // callback when finished
// }

const EASE_MS = 350; // ease-in / ease-out window

// Cubic ease-in-out
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Build a blended action sequence: ease from fromPos → macro → ease to toPos
function buildInjectionSequence(macro, fromPos, toPos) {
  const settings = state.session.funscriptSettings;
  const speed    = settings.speed || 1;
  const invert   = settings.invert;
  const range    = settings.range || 100;

  // Scale macro duration by speed (faster speed = shorter playback)
  const scaledActions = macro.actions.map(a => ({
    at:  Math.round(a.at / speed),
    pos: a.pos,
  }));

  const macroStart = EASE_MS;
  const macroEnd   = macroStart + (scaledActions.at(-1)?.at ?? 0);
  const totalMs    = macroEnd + EASE_MS;

  // Build sequence
  const seq = [];

  // Ease-in: fromPos → macro[0].pos
  const targetIn = scaledActions[0]?.pos ?? 0;
  const stepsIn  = 8;
  for (let i = 0; i <= stepsIn; i++) {
    const t   = i / stepsIn;
    const pos = fromPos + easeInOut(t) * (targetIn - fromPos);
    seq.push({ at: Math.round(t * EASE_MS), pos: Math.round(Math.max(0, Math.min(100, pos))) });
  }

  // Macro body (offset by EASE_MS, already scaled)
  for (const a of scaledActions) {
    seq.push({ at: a.at + macroStart, pos: Math.round(Math.max(0, Math.min(100, a.pos))) });
  }

  // Ease-out: macro[-1].pos → toPos
  const fromOut = scaledActions.at(-1)?.pos ?? 0;
  const stepsOut = 8;
  for (let i = 1; i <= stepsOut; i++) {
    const t   = i / stepsOut;
    const pos = fromOut + easeInOut(t) * (toPos - fromOut);
    seq.push({ at: macroEnd + Math.round(t * EASE_MS), pos: Math.round(Math.max(0, Math.min(100, pos))) });
  }

  return { actions: seq, totalMs };
}

export function injectMacro(macroId) {
  const macro = getMacro(macroId);
  if (!macro) return;

  const settings = state.session.funscriptSettings;

  // Get current position from main tracks (or 0 if none)
  let currentPos = 0;
  if (state.runtime) {
    const timeMs = state.runtime.sessionTime * 1000;
    for (const track of state.session.funscriptTracks) {
      if (track._disabled) continue;
      currentPos = Math.max(currentPos, interpolatePosition(track.actions, timeMs, settings.invert, settings.range));
    }
  }

  // Target return position = where main track will be after injection
  // Approximate: use currentPos (close enough for short macros)
  const { actions, totalMs } = buildInjectionSequence(macro, currentPos, currentPos);

  // Cancel any existing injection
  if (state.injection) cancelInjection();

  state.injection = {
    actions,
    startMs: performance.now(),
    totalMs,
    macroName: macro.name,
  };

  // Show injection HUD
  showInjectionHud(macro.name);

  // If playback is paused (tickPlayback returns early), run a lightweight
  // injection-only RAF so device output still moves during macro playback.
  if (state.runtime?.paused) {
    _startPausedInjectionLoop();
  }
}

// ── Paused-injection RAF ──────────────────────────────────────────────────────
// Drives device position from a macro even when tickPlayback is suspended.
// Cancels itself once the injection ends or playback resumes.
let _pausedInjRaf = 0;

function _startPausedInjectionLoop() {
  cancelAnimationFrame(_pausedInjRaf);
  function step() {
    if (!state.injection || !state.runtime?.paused) {
      _pausedInjRaf = 0;
      return; // injection finished or playback resumed — hand back to tickPlayback
    }
    const pos = getInjectionPosition();
    if (pos !== null) {
      sendDevicePosition(pos / 100);
    }
    _pausedInjRaf = requestAnimationFrame(step);
  }
  _pausedInjRaf = requestAnimationFrame(step);
}

export function cancelInjection() {
  cancelAnimationFrame(_pausedInjRaf);
  _pausedInjRaf = 0;
  state.injection = null;
  hideInjectionHud();
}

// Called each tick from playback — returns injected position or null
export function getInjectionPosition() {
  const inj = state.injection;
  if (!inj) return null;

  const elapsed = performance.now() - inj.startMs;
  if (elapsed >= inj.totalMs) {
    cancelInjection();
    return null;
  }

  return interpolatePosition(inj.actions, elapsed, false, 100);
}

function showInjectionHud(name) {
  const el = document.getElementById('injectionHud');
  if (el) { el.textContent = `⚡ ${name}`; el.style.opacity = '1'; }
}
function hideInjectionHud() {
  const el = document.getElementById('injectionHud');
  if (el) { el.style.opacity = '0'; }
}

// ── FS-only pause ───────────────────────────────────────────────────────────
// Shift key pauses/resumes FunScript output without pausing the session.
export function toggleFsPause() {
  state.fsPaused = !state.fsPaused;
  if (state.fsPaused) {
    sendDevicePosition(0); // ease to 0
    showFsPauseHud(true);
  } else {
    showFsPauseHud(false);
  }
  // Sync the live control panel button (lazy import avoids circular dep)
  import('./live-control.js').then(({ updateLiveControlFsPause }) => updateLiveControlFsPause());
}

function showFsPauseHud(paused) {
  const el = document.getElementById('fsPauseHud');
  if (el) { el.style.opacity = paused ? '1' : '0'; }
}

// ── Safe-skip easing ────────────────────────────────────────────────────────
// Before a seek, ease device to 0 over a few frames to avoid jarring jumps.
let _easeOutRaf = 0;
export function safeEaseTo0(onDone) {
  const startPos  = fsState.lastSentPos;
  const startTime = performance.now();
  const easeMs    = 300;
  cancelAnimationFrame(_easeOutRaf);
  function step() {
    const t   = Math.min(1, (performance.now() - startTime) / easeMs);
    const pos = startPos * (1 - easeInOut(t));
    sendDevicePosition(pos / 100);
    if (t < 1) _easeOutRaf = requestAnimationFrame(step);
    else onDone?.();
  }
  step();
}

export const fsState = { lastSentPos: 0 };
export function recordLastSentPos(pos) { fsState.lastSentPos = Number.isFinite(pos) ? pos : 0; }
