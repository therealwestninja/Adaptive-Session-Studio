// ── intensity-ramp.js ──────────────────────────────────────────────────────
// Controlled Intensity + Ramp System (ROADMAP Phase 2.8 & 2.9)
//
// Provides smooth, configurable intensity escalation curves that work
// alongside the Live Control intensity slider. The ramp can run:
//   - time-based: linearly over session duration
//   - engagement-based: proportional to the smoothed engagement score
//   - step-based: discrete jumps at defined session times
//   - adaptive: combines engagement + time
//
// The ramp produces an intensity multiplier (0–2) that is blended with the
// user's manual intensity slider value. Ramp state is not persisted (it is
// a performance tool like Live Control), but ramp settings can be saved in
// session.rampSettings.

import { state, $id, persist , applyCurve } from './state.js';
import { history } from './history.js';
// setLiveIntensity imported lazily in applyRamp() to break the static cycle with live-control.js
// (live-control imports renderRampPanel from intensity-ramp; intensity-ramp imports setLiveIntensity from live-control)
import { getAdaptiveRampSuggestion } from './user-profile.js';

// ── Default ramp settings (stored in session.rampSettings) ──────────────────
export function defaultRampSettings() {
  return {
    enabled:     false,
    mode:        'time',       // 'time' | 'engagement' | 'step' | 'adaptive'
    startVal:    0.5,          // intensity at ramp start (0–2)
    endVal:      1.5,          // intensity at ramp end (0–2)
    curve:       'linear',     // 'linear' | 'exponential' | 'sine'
    steps:       [],           // [{ atSec, intensity }] for step mode
    blendMode:   'max',        // 'max' | 'add' | 'replace' — how to blend with manual slider
  };
}

// ── Curve functions ──────────────────────────────────────────────────────────


// ── Per-tick ramp evaluation ─────────────────────────────────────────────────
// Called from tickRampSystem() in playback.js. Returns the target intensity.
export function evaluateRamp() {
  const rs = state.session?.rampSettings;
  if (!rs?.enabled || !state.runtime) return null;

  const es  = state.engineState;
  const dur = state.session.duration;
  const { startVal, endVal, curve, mode, steps } = rs;

  let t = 0; // 0–1 progress

  switch (mode) {
    case 'time':
      t = Math.min(1, (es?.sessionTime ?? 0) / Math.max(1, dur));
      break;
    case 'engagement':
      t = Math.min(1, es?.engagement ?? 0);
      break;
    case 'adaptive': {
      const timeFraction   = Math.min(1, (es?.sessionTime ?? 0) / Math.max(1, dur));
      const engageFraction = Math.min(1, es?.engagement ?? 0);
      t = Math.min(1, (timeFraction + engageFraction) / 2);
      break;
    }
    case 'step': {
      if (!steps?.length) return startVal;
      const sessionTime = es?.sessionTime ?? 0;
      // Find the last step at or before current time
      const activeStep = [...steps]
        .sort((a, b) => a.atSec - b.atSec)
        .filter(s => s.atSec <= sessionTime)
        .at(-1);
      return activeStep ? activeStep.intensity : startVal;
    }
  }

  const curved = applyCurve(t, curve);
  return startVal + curved * (endVal - startVal);
}

// ── Apply ramp to live control intensity ────────────────────────────────────
export function applyRamp() {
  const target = evaluateRamp();
  if (target === null || !state.liveControl) return;
  const lc = state.liveControl;
  const rs = state.session.rampSettings;

  let newIntensity;
  switch (rs.blendMode) {
    case 'add':     newIntensity = lc.intensityScale + target; break;
    case 'replace': newIntensity = target;                     break;
    default:        newIntensity = Math.max(lc.intensityScale, target); // 'max'
  }
  const clamped = Math.max(0, Math.min(2, newIntensity));
  // Lazy import breaks static cycle: intensity-ramp ↔ live-control
  import('./live-control.js').then(({ setLiveIntensity }) => setLiveIntensity(clamped)).catch(() => {});
}

// ── Ramp settings normalizer ─────────────────────────────────────────────────
// Used by tests/pacing-ramp.test.js. normalizeSession() in state.js has an
// inline equivalent to avoid a circular import. Both normalizers must stay in sync.
export function normalizeRampSettings(r) {
  const base = defaultRampSettings();
  if (!r) return base;
  return {
    enabled:   r.enabled === true,
    mode:      ['time','engagement','step','adaptive'].includes(r.mode) ? r.mode : base.mode,
    startVal:  Number.isFinite(r.startVal) ? Math.max(0, Math.min(2, r.startVal)) : base.startVal,
    endVal:    Number.isFinite(r.endVal)   ? Math.max(0, Math.min(2, r.endVal))   : base.endVal,
    curve:     ['linear','exponential','sine'].includes(r.curve) ? r.curve : base.curve,
    steps:     Array.isArray(r.steps)
      ? r.steps.filter(s => Number.isFinite(s?.atSec) && Number.isFinite(s?.intensity))
               .map(s => ({ atSec: s.atSec, intensity: Math.max(0, Math.min(2, s.intensity)) }))
      : [],
    blendMode: ['max','add','replace'].includes(r.blendMode) ? r.blendMode : base.blendMode,
  };
}

// ── Ramp control panel renderer ─────────────────────────────────────────────
export function renderRampPanel(containerId = 'rampPanel') {
  const el = $id(containerId);
  if (!el) return;
  const rs = state.session?.rampSettings ?? defaultRampSettings();

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:11px;font-weight:600;color:var(--text2)">Intensity Ramp</span>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer">
        <input type="checkbox" id="ramp_enabled" ${rs.enabled ? 'checked' : ''} />
        Enabled
      </label>
    </div>
    <div class="insp-row">
      <span>Mode</span>
      <select id="ramp_mode" style="font-size:11px;width:100px">
        <option value="time"       ${rs.mode==='time'       ? 'selected' : ''}>Time-based</option>
        <option value="engagement" ${rs.mode==='engagement' ? 'selected' : ''}>Engagement</option>
        <option value="adaptive"   ${rs.mode==='adaptive'   ? 'selected' : ''}>Adaptive</option>
        <option value="step"       ${rs.mode==='step'       ? 'selected' : ''}>Step</option>
      </select>
    </div>
    <div class="insp-row">
      <span>Curve</span>
      <select id="ramp_curve" style="font-size:11px;width:100px">
        <option value="linear"      ${rs.curve==='linear'      ? 'selected' : ''}>Linear</option>
        <option value="exponential" ${rs.curve==='exponential' ? 'selected' : ''}>Exponential</option>
        <option value="sine"        ${rs.curve==='sine'        ? 'selected' : ''}>Sine (ease)</option>
      </select>
    </div>
    <div class="insp-row">
      <span>Start intensity</span>
      <input type="number" id="ramp_start" value="${rs.startVal}" min="0" max="2" step="0.05"
        style="font-size:11px;width:70px" />
    </div>
    <div class="insp-row">
      <span>End intensity</span>
      <input type="number" id="ramp_end" value="${rs.endVal}" min="0" max="2" step="0.05"
        style="font-size:11px;width:70px" />
    </div>
    <div class="insp-row">
      <span>Blend</span>
      <select id="ramp_blend" style="font-size:11px;width:100px">
        <option value="max"     ${rs.blendMode==='max'     ? 'selected' : ''}>Max (default)</option>
        <option value="replace" ${rs.blendMode==='replace' ? 'selected' : ''}>Replace</option>
        <option value="add"     ${rs.blendMode==='add'     ? 'selected' : ''}>Add</option>
      </select>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px;line-height:1.5">
      Ramp runs during playback only. Blend=Max keeps whichever is higher (manual or ramp).
    </div>
    <button id="ramp_adaptBtn" style="margin-top:8px;width:100%;font-size:11px;
      background:rgba(200,164,255,0.1);border:0.5px solid rgba(200,164,255,0.3);
      border-radius:6px;padding:5px 8px;cursor:pointer;color:#c8a4ff">
      ✦ Adapt to my profile
    </button>
    <div id="ramp_adaptNote" style="font-size:10px;color:var(--text3);margin-top:4px;display:none"></div>`;

  // Wire events
  const patch = (id, field, parse, lo, hi) => {
    $id(id)?.addEventListener('change', e => {
      if (!state.session.rampSettings) state.session.rampSettings = defaultRampSettings();
      const raw = parse ? parse(e.target.value) : e.target.value;
      if (typeof raw === 'number' && !Number.isFinite(raw)) return;
      history.push();
      state.session.rampSettings[field] = (lo !== undefined && hi !== undefined)
        ? Math.max(lo, Math.min(hi, raw))
        : raw;
      persist();
    });
  };
  $id('ramp_enabled')?.addEventListener('change', e => {
    if (!state.session.rampSettings) state.session.rampSettings = defaultRampSettings();
    history.push();
    state.session.rampSettings.enabled = e.target.checked;
    persist();
  });
  patch('ramp_mode',  'mode',      null);
  patch('ramp_curve', 'curve',     null);
  patch('ramp_blend', 'blendMode', null);
  patch('ramp_start', 'startVal',  Number, 0, 2);
  patch('ramp_end',   'endVal',    Number, 0, 2);

  $id('ramp_adaptBtn')?.addEventListener('click', () => {
    const suggestion = getAdaptiveRampSuggestion();
    const { _note, ...settings } = suggestion;
    history.push();
    state.session.rampSettings = { ...defaultRampSettings(), ...settings };
    persist();
    renderRampPanel(containerId); // re-render with new values
    const note = $id('ramp_adaptNote');
    if (note) { note.textContent = _note; note.style.display = ''; }
  });
}
