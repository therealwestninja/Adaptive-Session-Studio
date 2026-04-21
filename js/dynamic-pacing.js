// ── dynamic-pacing.js ──────────────────────────────────────────────────────
// Dynamic Pacing Control — ROADMAP Phase 2.7
//
// Automatically modulates the Live Control speed slider based on the
// state engine's engagement score. High engagement → faster; low engagement
// → slower. Runs per-tick alongside the intensity ramp.
//
// Settings stored in session.pacingSettings (not persisted as part of
// live-control — they are session configuration, not performance tweaks).

import { state, persist, $id , applyCurve } from './state.js';
import { history } from './history.js';
// setLiveSpeed imported lazily in tickDynamicPacing() to break the static cycle with live-control.js
// (live-control imports renderPacingPanel from dynamic-pacing; dynamic-pacing imports setLiveSpeed from live-control)

// ── Default pacing settings ───────────────────────────────────────────────────
export function defaultPacingSettings() {
  return {
    enabled:      false,
    minSpeed:     0.5,          // speed when engagement = 0
    maxSpeed:     2.0,          // speed when engagement = 1
    smoothingSec: 4,            // EMA time constant in seconds (how quickly speed ramps)
    curve:        'linear',     // 'linear' | 'exponential' | 'sine'
    lockDuringSec: 0,           // hold speed for N seconds after a change (debounce)
  };
}

// ── Pacing normalizer ─────────────────────────────────────────────────────────
// ── Exported normalizer ───────────────────────────────────────────────────────
// Used by tests/pacing-ramp.test.js and by normalizeSession() in state.js
// (via inline spread — not by direct import). Kept as a public export so the
// test suite can validate it independently without importing state.js.
export function normalizePacingSettings(p) {
  if (!p) return defaultPacingSettings();
  const base = defaultPacingSettings();
  return {
    enabled:       p.enabled === true,
    minSpeed:      Number.isFinite(p.minSpeed) ? Math.max(0.25, Math.min(4, p.minSpeed)) : base.minSpeed,
    maxSpeed:      Number.isFinite(p.maxSpeed) ? Math.max(0.25, Math.min(4, p.maxSpeed)) : base.maxSpeed,
    smoothingSec:  Number.isFinite(p.smoothingSec) ? Math.max(0, Math.min(30, p.smoothingSec)) : base.smoothingSec,
    curve:         ['linear','exponential','sine'].includes(p.curve) ? p.curve : base.curve,
    lockDuringSec: Number.isFinite(p.lockDuringSec) ? Math.max(0, p.lockDuringSec) : base.lockDuringSec,
  };
}

// ── Per-tick pacing evaluation ────────────────────────────────────────────────
let _currentSpeed   = 1.0;  // EMA-smoothed target speed
let _lastChangeAt   = 0;    // session time when speed last changed

export function resetDynamicPacing() {
  _currentSpeed = 1.0;
  _lastChangeAt = 0;
}



export function tickDynamicPacing(frameSec) {
  const ps = state.session?.pacingSettings;
  if (!ps?.enabled || !state.runtime) return;
  if (!state.engineState) return;

  const engagement = state.engineState.engagement ?? 0;
  const { minSpeed, maxSpeed, smoothingSec, curve, lockDuringSec } = ps;

  // Check lock period
  const sessionTime = state.engineState.sessionTime;
  if (lockDuringSec > 0 && (sessionTime - _lastChangeAt) < lockDuringSec) return;

  // Target speed from engagement curve
  const t = applyCurve(Math.max(0, Math.min(1, engagement)), curve);
  const targetSpeed = minSpeed + t * (maxSpeed - minSpeed);

  // EMA smoothing — alpha per frame
  const alpha = smoothingSec > 0 ? Math.min(1, frameSec / smoothingSec) : 1;
  const prevSpeed = _currentSpeed;
  _currentSpeed = _currentSpeed + alpha * (targetSpeed - _currentSpeed);
  _currentSpeed = Math.max(0.25, Math.min(4, _currentSpeed));

  // Apply if changed meaningfully
  if (Math.abs(_currentSpeed - prevSpeed) > 0.005) {
    const speed = +_currentSpeed.toFixed(3);
    // Lazy import breaks static cycle: dynamic-pacing ↔ live-control
    import('./live-control.js').then(({ setLiveSpeed }) => setLiveSpeed(speed)).catch(() => {});
    if (lockDuringSec > 0) _lastChangeAt = sessionTime;
  }
}

// ── Pacing settings panel ─────────────────────────────────────────────────────
export function renderPacingPanel(containerId = 'pacingPanel') {
  const el = $id(containerId);
  if (!el) return;
  const ps = state.session?.pacingSettings ?? defaultPacingSettings();

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:11px;font-weight:600;color:var(--text2)">Dynamic Pacing</span>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer">
        <input type="checkbox" id="pacing_enabled" ${ps.enabled ? 'checked' : ''} />
        Enabled
      </label>
    </div>
    <div class="insp-row">
      <span>Min speed (low engage)</span>
      <input type="number" id="pacing_min" value="${ps.minSpeed}" min="0.25" max="4" step="0.25"
        style="font-size:11px;width:70px" />
      <span style="font-size:10px;color:var(--text3)">×</span>
    </div>
    <div class="insp-row">
      <span>Max speed (high engage)</span>
      <input type="number" id="pacing_max" value="${ps.maxSpeed}" min="0.25" max="4" step="0.25"
        style="font-size:11px;width:70px" />
      <span style="font-size:10px;color:var(--text3)">×</span>
    </div>
    <div class="insp-row">
      <span>Smoothing (s)</span>
      <input type="number" id="pacing_smooth" value="${ps.smoothingSec}" min="0" max="30" step="0.5"
        style="font-size:11px;width:70px" />
    </div>
    <div class="insp-row">
      <span>Curve</span>
      <select id="pacing_curve" style="font-size:11px;width:100px">
        <option value="linear"      ${ps.curve==='linear'      ? 'selected' : ''}>Linear</option>
        <option value="exponential" ${ps.curve==='exponential' ? 'selected' : ''}>Exponential</option>
        <option value="sine"        ${ps.curve==='sine'        ? 'selected' : ''}>Sine (ease)</option>
      </select>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px;line-height:1.5">
      Adjusts speed slider based on engagement score. Requires webcam tracking active.
    </div>`;

  const save = (field, parse, lo, hi) => (id) => {
    $id(id)?.addEventListener('change', e => {
      if (!state.session.pacingSettings) state.session.pacingSettings = defaultPacingSettings();
      const raw = parse ? parse(e.target.value) : e.target.value;
      if (typeof raw === 'number' && !Number.isFinite(raw)) return;
      history.push();
      state.session.pacingSettings[field] = (lo !== undefined && hi !== undefined)
        ? Math.max(lo, Math.min(hi, raw))
        : raw;
      persist();
    });
  };

  $id('pacing_enabled')?.addEventListener('change', e => {
    if (!state.session.pacingSettings) state.session.pacingSettings = defaultPacingSettings();
    history.push();
    state.session.pacingSettings.enabled = e.target.checked;
    persist();
  });
  save('minSpeed', Number, 0.25, 4)('pacing_min');
  save('maxSpeed', Number, 0.25, 4)('pacing_max');
  save('smoothingSec', Number, 0, 30)('pacing_smooth');
  save('curve', null)('pacing_curve');
}
