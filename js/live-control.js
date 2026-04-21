// ── live-control.js ────────────────────────────────────────────────────────
// Runtime performance modifiers: intensity scale, speed scale, randomness.
// These are applied every tick without restarting playback.
// They affect FunScript position output only (not session clock).
//
// State lives in state.liveControl, NOT in state.session (not persisted —
// live control is a performance tool, not a session property).

import { state, $id } from './state.js';
import { renderRampPanel }   from './intensity-ramp.js';
import { renderPacingPanel } from './dynamic-pacing.js';
import { clampIntensity, clampSpeed, renderSafetyPanel } from './safety.js';
// getActiveWindowStatuses is imported lazily in updateLiveEngineMeters to avoid
// the live-control ↔ trigger-windows circular dependency.

// ── Default live control values ────────────────────────────────────────────
export function defaultLiveControl() {
  return {
    intensityScale: 1.0,   // 0.0–2.0: scales FunScript position range
    speedScale:     1.0,   // 0.25–4.0: scales FunScript clock
    randomness:     0.0,   // 0.0–1.0: adds ±N% random variation to position
    fsPaused:       false, // mirrors state.fsPaused for the panel
  };
}

// Attach to state (non-persisted)
if (!state.liveControl) state.liveControl = defaultLiveControl();

// ── Apply modifiers to a raw position value (0–100) ────────────────────────
export function applyLiveControl(rawPos) {
  if (!Number.isFinite(rawPos)) return 0;  // guard NaN/Infinity from FunScript interpolation
  const lc = state.liveControl;
  let pos = rawPos * lc.intensityScale;
  if (lc.randomness > 0) {
    const jitter = (Math.random() * 2 - 1) * lc.randomness * 10;
    pos += jitter;
  }
  return Math.min(100, Math.max(0, pos));
}

// ── Speed scale: used by FunScript interpolation ────────────────────────────
// Returns the effective time in ms to query FunScript at, accounting for
// both the session's funscriptSettings.speed and the live speed multiplier.
export function getLiveSpeedMs(sessionTimeSec) {
  const baseSpeed  = state.session.funscriptSettings.speed ?? 1.0;
  const liveSpeed  = state.liveControl.speedScale ?? 1.0;
  // Guard against zero (should never happen after normalisation, but be defensive)
  const effective  = (baseSpeed * liveSpeed) || 1.0;
  return sessionTimeSec * 1000 * (1 / effective);
}

// ── Render the live control panel ──────────────────────────────────────────
export function renderLiveControl() {
  const panel = $id('liveControlPanel');
  if (!panel) return;
  const lc = state.liveControl;
  // Constrain slider range to the session's active safety limits
  const safety = state.session?.safetySettings;
  const maxInt  = safety?.maxIntensity != null ? Math.min(2,    safety.maxIntensity) : 2;
  const maxSpd  = safety?.maxSpeed     != null ? Math.min(4,    safety.maxSpeed)     : 4;

  panel.innerHTML = `
    <div class="lc-head">
      <span class="lc-title">Live Control</span>
      <span class="lc-hint">Active during playback</span>
    </div>

    <div class="lc-row">
      <div class="lc-label">Intensity</div>
      <div class="lc-slider-wrap">
        <input type="range" class="lc-slider" id="lc_intensity"
          min="0" max="${maxInt}" step="0.05" value="${Math.min(lc.intensityScale, maxInt)}"
          aria-label="Intensity scale" />
        <span class="lc-val" id="lc_intensityVal">${Math.round(lc.intensityScale * 100)}%</span>
      </div>
    </div>

    <div class="lc-row">
      <div class="lc-label">Speed</div>
      <div class="lc-slider-wrap">
        <input type="range" class="lc-slider" id="lc_speed"
          min="0.25" max="${maxSpd}" step="0.05" value="${Math.min(lc.speedScale, maxSpd)}"
          aria-label="Speed scale" />
        <span class="lc-val" id="lc_speedVal">${lc.speedScale.toFixed(2)}×</span>
      </div>
    </div>

    <div class="lc-row">
      <div class="lc-label">Variation</div>
      <div class="lc-slider-wrap">
        <input type="range" class="lc-slider" id="lc_random"
          min="0" max="1" step="0.05" value="${lc.randomness}"
          aria-label="Randomness amount" />
        <span class="lc-val" id="lc_randomVal">${Math.round(lc.randomness * 100)}%</span>
      </div>
    </div>

    <div class="lc-actions">
      <button class="lc-btn${state.fsPaused ? ' active' : ''}" id="lc_fsPause"
        title="Shift key also toggles this">
        ${state.fsPaused ? '▶ FS Resume' : '⏸ FS Pause'}
      </button>
      <button class="lc-btn lc-reset" id="lc_reset" title="Reset all to default">↺ Reset</button>
    </div>

    <div class="lc-meters">
      <div class="lc-meter-wrap" title="Current FunScript output position">
        <div class="lc-meter-label">FS Out</div>
        <div class="lc-meter-bar">
          <div class="lc-meter-fill" id="lc_meterFill"></div>
        </div>
        <span class="lc-meter-val" id="lc_meterVal">0%</span>
      </div>
      <div class="lc-meter-wrap" title="Attention level from webcam (0–100%)">
        <div class="lc-meter-label">Attention</div>
        <div class="lc-meter-bar">
          <div class="lc-meter-fill" id="lc_attentionFill"></div>
        </div>
        <span class="lc-meter-val" id="lc_attentionVal">—</span>
      </div>
      <div class="lc-meter-wrap" title="Derived engagement score (0–100%)">
        <div class="lc-meter-label">Engage</div>
        <div class="lc-meter-bar">
          <div class="lc-meter-fill" id="lc_engageFill"></div>
        </div>
        <span class="lc-meter-val" id="lc_engageVal">—</span>
      </div>
    </div>
    <div id="lc_triggerWindows" style="display:none;font-size:10px;color:var(--c-amber);
      padding:3px 14px 6px;letter-spacing:.02em;opacity:.85"></div>`;

  // Bind slider events — route through setLiveIntensity/setLiveSpeed so safety
  // limits (session.safetySettings.maxIntensity / maxSpeed) are always enforced.
  $id('lc_intensity')?.addEventListener('input', e => {
    setLiveIntensity(Number(e.target.value));
  });
  $id('lc_speed')?.addEventListener('input', e => {
    setLiveSpeed(Number(e.target.value));
  });
  $id('lc_random')?.addEventListener('input', e => {
    state.liveControl.randomness = Number(e.target.value);
    $id('lc_randomVal').textContent = `${Math.round(state.liveControl.randomness * 100)}%`;
  });
  $id('lc_fsPause')?.addEventListener('click', () => {
    import('./macros.js').then(({ toggleFsPause }) => {
      toggleFsPause();
      _updateFsPauseBtn(); // targeted update — don't rebuild sliders
    });
  });
  $id('lc_reset')?.addEventListener('click', () => {
    state.liveControl = defaultLiveControl();
    renderLiveControl();
  });
}

// ── Targeted FS-pause button update (no full re-render) ──────────────────────
function _updateFsPauseBtn() {
  const btn = $id('lc_fsPause');
  if (!btn) return;
  btn.classList.toggle('active', state.fsPaused);
  btn.textContent = state.fsPaused ? '▶ FS Resume' : '⏸ FS Pause';
}

// ── Update the FS output meter in the live control panel ────────────────────
export function updateLiveMeter(pos) {
  const fill = $id('lc_meterFill');
  const val  = $id('lc_meterVal');
  if (!fill || !val) return;
  fill.style.width = `${pos}%`;
  fill.style.background = pos > 70 ? '#e05050' : pos > 40 ? '#f0a04a' : '#5fa0dc';
  val.textContent = `${Math.round(pos)}%`;
}

// ── Update attention and engagement meters from state engine ────────────────
export function updateLiveEngineMeters() {
  const es = state.engineState;
  if (!es) return;

  const af = $id('lc_attentionFill'), av = $id('lc_attentionVal');
  if (af && av) {
    const pct = Math.round(es.attention * 100);
    af.style.width = `${pct}%`;
    af.style.background = pct < 30 ? '#e05050' : pct < 60 ? '#f0a04a' : '#7dc87a';
    av.textContent = `${pct}%`;
  }

  const ef = $id('lc_engageFill'), ev = $id('lc_engageVal');
  if (ef && ev) {
    const pct = Math.round(es.engagement * 100);
    ef.style.width = `${pct}%`;
    ef.style.background = pct < 30 ? '#e05050' : pct < 60 ? '#f0a04a' : '#7dc87a';
    ev.textContent = `${pct}%`;
  }

  // Show active trigger windows as a subtle indicator (lazy import avoids circular dep)
  const twEl = $id('lc_triggerWindows');
  if (twEl) {
    import('./trigger-windows.js').then(({ getActiveWindowStatuses }) => {
      const active = getActiveWindowStatuses();
      if (active.length) {
        const label = active.map(w => `⏱ ${w.name} (${Math.ceil(w.remaining)}s)`).join('  ·  ');
        twEl.textContent = label;
        twEl.style.display = 'block';
      } else {
        twEl.style.display = 'none';
      }
    });
  }
}

// ── Targeted slider updates (called by rules engine without full re-render) ──
export function setLiveIntensity(val) {
  if (!state.liveControl) return;
  if (!Number.isFinite(val)) return;  // guard NaN/Infinity
  state.liveControl.intensityScale = clampIntensity(Math.max(0, Math.min(2, val)));
  const slider = $id('lc_intensity'), label = $id('lc_intensityVal');
  if (slider) slider.value = state.liveControl.intensityScale;
  if (label)  label.textContent = `${Math.round(state.liveControl.intensityScale * 100)}%`;
}

export function setLiveSpeed(val) {
  if (!state.liveControl) return;
  if (!Number.isFinite(val)) return;  // guard NaN/Infinity
  state.liveControl.speedScale = clampSpeed(Math.max(0.25, Math.min(4, val)));
  const slider = $id('lc_speed'), label = $id('lc_speedVal');
  if (slider) slider.value = state.liveControl.speedScale;
  if (label)  label.textContent = `${state.liveControl.speedScale.toFixed(2)}×`;
}

// ── Init (called once from main.js) ────────────────────────────────────────
export function initLiveControl() {
  renderLiveControl();
  renderRampPanel('rampPanel');
  renderPacingPanel('pacingPanel');
  renderSafetyPanel('safetyPanel');
}

// ── Show/hide ramp panel with playback state ─────────────────────────────────
export function updateRampPanelVisibility() {
  const rp = $id('rampPanel'),   pp = $id('pacingPanel');
  const show = !!state.runtime;
  if (rp) rp.style.display = show ? '' : 'none';
  if (pp) pp.style.display = show ? '' : 'none';
}

// ── Sync FS-pause button state (called when Shift-key toggles fsPaused) ─────
export function updateLiveControlFsPause() {
  _updateFsPauseBtn();
}
