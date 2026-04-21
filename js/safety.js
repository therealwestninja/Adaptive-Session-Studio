// ── safety.js ──────────────────────────────────────────────────────────────
// Safety Layer — ROADMAP Cross-Cutting System C (Always-On)
//
// Hard limits on intensity, emergency overrides, and cooldown enforcement.
// This module intercepts setLiveIntensity and setLiveSpeed calls to prevent
// values exceeding configured safety caps. It also provides session-level
// safety settings stored in session.safetySettings.

import { state, persist, $id } from './state.js';
import { notify } from './notify.js';
import { history } from './history.js';

// ── Default safety settings ───────────────────────────────────────────────────
export function defaultSafetySettings() {
  return {
    maxIntensity:     2.0,   // Hard cap on intensity (0–2)
    maxSpeed:         4.0,   // Hard cap on speed (0.25–4)
    emergencyCooldownSec: 30, // After emergency stop, block restart for N seconds
    warnAbove:        1.5,   // Show warning when intensity exceeds this value
    autoReduceOnLoss: false, // Auto-reduce intensity when attention is lost
    autoReduceTarget: 0.8,   // Target intensity for auto-reduce
  };
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Used by tests/safety.test.js. normalizeSession() in state.js has an inline
// equivalent to avoid circular imports. Both must stay in sync.
export function normalizeSafetySettings(s) {
  if (!s) return defaultSafetySettings();
  const base = defaultSafetySettings();
  return {
    maxIntensity:     Number.isFinite(s.maxIntensity) ? Math.max(0, Math.min(2, s.maxIntensity)) : base.maxIntensity,
    maxSpeed:         Number.isFinite(s.maxSpeed)     ? Math.max(0.25, Math.min(4, s.maxSpeed))  : base.maxSpeed,
    emergencyCooldownSec: Number.isFinite(s.emergencyCooldownSec) ? Math.max(0, s.emergencyCooldownSec) : base.emergencyCooldownSec,
    warnAbove:        Number.isFinite(s.warnAbove)    ? Math.max(0, Math.min(2, s.warnAbove))    : base.warnAbove,
    autoReduceOnLoss: s.autoReduceOnLoss === true,
    autoReduceTarget: Number.isFinite(s.autoReduceTarget) ? Math.max(0, Math.min(2, s.autoReduceTarget)) : base.autoReduceTarget,
  };
}

// ── Hard limit enforcement ────────────────────────────────────────────────────
// Called by live-control's setLiveIntensity/setLiveSpeed before applying.
// Returns the clamped value, and fires a warning if near the cap.
export function clampIntensity(requested) {
  if (!Number.isFinite(requested)) return 0;  // guard NaN/Infinity
  const safety = getSafetySettings();
  const capped = Math.min(requested, safety.maxIntensity);
  if (requested > safety.maxIntensity) {
    notify.warn(`Intensity capped at ${Math.round(safety.maxIntensity * 100)}% (safety limit).`);
  } else if (capped >= safety.warnAbove && !_warnThrottled) {
    _warnThrottled = true;
    setTimeout(() => { _warnThrottled = false; }, 10000);
    notify.warn(`High intensity: ${Math.round(capped * 100)}%`);
  }
  return capped;
}
let _warnThrottled = false;

export function clampSpeed(requested) {
  if (!Number.isFinite(requested)) return 1.0;  // guard NaN/Infinity
  const safety = getSafetySettings();
  const capped = Math.min(requested, safety.maxSpeed);
  if (requested > safety.maxSpeed) {
    notify.warn(`Speed capped at ${safety.maxSpeed.toFixed(2)}× (safety limit).`);
  }
  return capped;
}

// ── Emergency cooldown tracking ───────────────────────────────────────────────
let _lastEmergencyAt = -Infinity;

export function recordEmergencyStop() {
  _lastEmergencyAt = performance.now();
}

export function isEmergencyCooldownActive() {
  const safety = getSafetySettings();
  const elapsed = (performance.now() - _lastEmergencyAt) / 1000;
  return elapsed < safety.emergencyCooldownSec;
}

export function getEmergencyCooldownRemaining() {
  const safety = getSafetySettings();
  const elapsed = (performance.now() - _lastEmergencyAt) / 1000;
  return Math.max(0, safety.emergencyCooldownSec - elapsed);
}

// ── Auto-reduce on attention loss ─────────────────────────────────────────────
let _autoReduceActive = false;

export function tickSafety() {
  const safety = getSafetySettings();
  if (!safety.autoReduceOnLoss || !state.runtime || !state.liveControl) return;

  const attentionLost = (state.engineState?.attention ?? 1) < 0.2;

  if (attentionLost && !_autoReduceActive) {
    _autoReduceActive = true;
    if (state.liveControl.intensityScale > safety.autoReduceTarget) {
      import('./live-control.js').then(({ setLiveIntensity }) => {
        setLiveIntensity(safety.autoReduceTarget);
        notify.info(`Safety: auto-reduced intensity to ${Math.round(safety.autoReduceTarget * 100)}%`);
      });
    }
  } else if (!attentionLost) {
    _autoReduceActive = false;
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function getSafetySettings() {
  return state.session?.safetySettings ?? defaultSafetySettings();
}

// ── Settings panel renderer ───────────────────────────────────────────────────
export function renderSafetyPanel(containerId = 'safetyPanel') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const ss = state.session?.safetySettings ?? defaultSafetySettings();

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:600;color:var(--text2)">🛡 Safety Limits</span>
    </div>
    <div class="insp-row">
      <span>Max intensity</span>
      <input type="number" id="safety_maxInt" value="${ss.maxIntensity}" min="0" max="2" step="0.1"
        style="font-size:11px;width:70px" />
      <span style="font-size:10px;color:var(--text3)">(0–2)</span>
    </div>
    <div class="insp-row">
      <span>Max speed</span>
      <input type="number" id="safety_maxSpd" value="${ss.maxSpeed}" min="0.25" max="4" step="0.25"
        style="font-size:11px;width:70px" />
      <span style="font-size:10px;color:var(--text3)">(×)</span>
    </div>
    <div class="insp-row">
      <span>Warn above intensity</span>
      <input type="number" id="safety_warn" value="${ss.warnAbove}" min="0" max="2" step="0.1"
        style="font-size:11px;width:70px" />
    </div>
    <div class="insp-row">
      <span>Emergency cooldown (s)</span>
      <input type="number" id="safety_cool" value="${ss.emergencyCooldownSec}" min="0" max="300" step="5"
        style="font-size:11px;width:70px" />
    </div>
    <div class="insp-row" style="align-items:flex-start;flex-direction:column;gap:4px">
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer">
        <input type="checkbox" id="safety_autoReduce" ${ss.autoReduceOnLoss?'checked':''} />
        Auto-reduce intensity on attention loss
      </label>
      ${ss.autoReduceOnLoss ? `<div class="insp-row">
        <span>Reduce to</span>
        <input type="number" id="safety_reduceTarget" value="${ss.autoReduceTarget}" min="0" max="2" step="0.1"
          style="font-size:11px;width:70px" />
      </div>` : ''}
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px;line-height:1.5">
      Hard limits are enforced even when rules or ramp request higher values.
    </div>`;

  const save = (id, field, parse, lo, hi) => {
    $id(id)?.addEventListener('change', e => {
      if (!state.session.safetySettings) state.session.safetySettings = defaultSafetySettings();
      const raw = parse ? parse(e.target.value) : e.target.value;
      // Guard NaN/Infinity — a non-finite maxIntensity would make Math.min() return NaN,
      // silently bypassing the safety cap in clampIntensity/clampSpeed.
      if (typeof raw === 'number' && !Number.isFinite(raw)) return;
      history.push();
      state.session.safetySettings[field] = (lo !== undefined && hi !== undefined)
        ? Math.max(lo, Math.min(hi, raw))
        : raw;
      persist();
    });
  };
  save('safety_maxInt', 'maxIntensity',     Number, 0, 2);
  save('safety_maxSpd', 'maxSpeed',         Number, 0.25, 4);
  save('safety_warn',   'warnAbove',        Number, 0, 2);
  save('safety_cool',   'emergencyCooldownSec', Number, 0, 300);
  $id('safety_autoReduce')?.addEventListener('change', e => {
    if (!state.session.safetySettings) state.session.safetySettings = defaultSafetySettings();
    history.push();
    state.session.safetySettings.autoReduceOnLoss = e.target.checked;
    persist();
    renderSafetyPanel(containerId); // re-render to show/hide target field
  });
  save('safety_reduceTarget', 'autoReduceTarget', Number);
}
