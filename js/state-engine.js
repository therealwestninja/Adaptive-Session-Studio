// ── state-engine.js ────────────────────────────────────────────────────────
// Central runtime state manager. Normalizes inputs from tracking, playback,
// and live-control into a single coherent state object that the rules engine
// and UI can read without caring about the source.
//
// ROADMAP Phase 1  — State Engine (Core Runtime)
// ROADMAP Phase 17 — Multi-Signal Fusion (configurable engagement weights)
//
// Published state (state.engineState):
//   attention   0–1   from tracking module (0 = lost/idle, 1 = detected)
//   intensity   0–2   from liveControl.intensityScale
//   speed       0–4   from liveControl.speedScale
//   engagement  0–1   derived engagement score (weighted fusion of signals)
//   deviceLoad  0–1   last device output position normalised 0–1
//   sessionTime  sec  mirrors runtime.sessionTime
//   loopCount        mirrors runtime.loopIndex
//   fsPaused    bool  mirrors state.fsPaused
//   playing     bool  runtime is active and not paused

import { state } from './state.js';

// ── Default fusion weights (ROADMAP Phase 17 — Multi-Signal Fusion) ──────────
// Weights sum is normalised at runtime so individual values are relative.
export const DEFAULT_FUSION_WEIGHTS = {
  attention:  0.70,  // webcam attention (0–1)
  deviceLoad: 0.20,  // device output position (0–1, from last sent FS pos)
  intensity:  0.10,  // current live-control intensity bonus (scaled 0–0.5)
};

// ── EMA state ─────────────────────────────────────────────────────────────────
let _smoothedEngagement = 0;
const ENGAGEMENT_ALPHA  = 0.05; // ~3s time constant at 60fps

// ── Biofeedback / external signal feeds ──────────────────────────────────────
// External adapters (e.g. biofeedback WebSocket) call setExternalSignal to
// inject normalised (0–1) signal values into the fusion engine.
const _externalSignals = {};    // signalName → { value: 0–1, weight: 0–1 }

export function setExternalSignal(name, value, weight = 0.3) {
  _externalSignals[name] = {
    value:  Math.max(0, Math.min(1, value)),
    weight: Math.max(0, Math.min(1, weight)),
  };
}

export function clearExternalSignals() {
  Object.keys(_externalSignals).forEach(k => delete _externalSignals[k]);
}

// ── Engagement score computation (ROADMAP Phase 17) ──────────────────────────
function deriveEngagement(attention, deviceLoad, intensity, playing) {
  if (!playing) return _smoothedEngagement;

  // Start with base weights
  const weights  = { ...DEFAULT_FUSION_WEIGHTS };
  const signals  = { attention, deviceLoad, intensity: Math.min(1, (intensity - 1) * 0.5 + 0.5) };

  // Fold in any external signals
  for (const [name, { value, weight }] of Object.entries(_externalSignals)) {
    signals[name]  = value;
    weights[name]  = weight;
  }

  // Weighted average, normalised so weights always sum to 1
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  let raw = 0;
  for (const [name, w] of Object.entries(weights)) {
    raw += (signals[name] ?? 0) * (w / totalWeight);
  }

  raw = Math.max(0, Math.min(1, raw));
  _smoothedEngagement = _smoothedEngagement + ENGAGEMENT_ALPHA * (raw - _smoothedEngagement);
  return +_smoothedEngagement.toFixed(3);
}

// ── Published engineState on state object ────────────────────────────────────
if (!state.engineState) {
  state.engineState = {
    attention:  0, intensity: 1, speed: 1, engagement: 0,
    deviceLoad: 0, sessionTime: 0, totalSec: 0, loopCount: 0,
    fsPaused: false, playing: false,
  };
}

// ── Attention feed ────────────────────────────────────────────────────────────
let _currentAttention = 0;
export function setAttention(value) {
  _currentAttention = Math.max(0, Math.min(1, value));
}
// getAttention removed — _currentAttention is only read internally via tickStateEngine

// ── Main tick ─────────────────────────────────────────────────────────────────
export function tickStateEngine() {
  const { runtime, liveControl } = state;
  const lc      = liveControl ?? { intensityScale: 1, speedScale: 1 };
  const playing = !!(runtime && !runtime.paused);

  // Derive device load from the last sent FunScript position
  // fsState.lastSentPos is 0–100; normalise to 0–1
  let deviceLoad = 0;
  try {
    const { fsState } = state._fsStateRef ?? {};
    if (fsState) deviceLoad = Math.max(0, Math.min(1, fsState.lastSentPos / 100));
  } catch {}

  // totalSec is the absolute playback clock — it never resets across loops.
  // sessionTime resets to 0 each loop, so cooldowns that span loop boundaries
  // must use totalSec instead.
  const loopIndex   = runtime?.loopIndex   ?? 0;
  const sessionTime = runtime?.sessionTime ?? 0;
  const totalSec    = loopIndex * (state.session?.duration ?? 0) + sessionTime;

  state.engineState = {
    attention:   _currentAttention,
    intensity:   lc.intensityScale,
    speed:       lc.speedScale,
    deviceLoad,
    engagement:  deriveEngagement(_currentAttention, deviceLoad, lc.intensityScale, playing),
    sessionTime,
    totalSec,
    loopCount:   loopIndex,
    fsPaused:    state.fsPaused,
    playing,
  };
}

// ── Metric accessor ───────────────────────────────────────────────────────────
export function getMetric(metric) {
  const es = state.engineState;
  switch (metric) {
    case 'attention':      return es.attention;
    case 'intensity':      return es.intensity;
    case 'speed':          return es.speed;
    case 'engagement':     return es.engagement;
    case 'deviceLoad':     return es.deviceLoad;
    case 'sessionTime':    return es.sessionTime;
    case 'loopCount':      return es.loopCount;
    case 'timeInScene': {
      // Seconds elapsed since the current scene started
      const rt    = state.runtime;
      const scene = rt?.activeScene;
      if (!scene || !Number.isFinite(scene.enteredAt)) return 0;
      return Math.max(0, (es.sessionTime ?? 0) - scene.enteredAt);
    }
    default:               return 0;
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────────
export function resetStateEngine() {
  _currentAttention   = 0;
  _smoothedEngagement = 0;
  clearExternalSignals();
  state.engineState   = {
    attention: 0, intensity: 1, speed: 1, engagement: 0,
    deviceLoad: 0, sessionTime: 0, totalSec: 0, loopCount: 0,
    fsPaused: false, playing: false,
  };
}

// ── Shared condition evaluator ────────────────────────────────────────────────
// Used by both rules-engine.js and trigger-windows.js.
// Evaluates a { metric, op, value } condition against the current engine metrics.
export function evalCondition(condition) {
  // variableEquals: check a named session variable against a string/number value
  if (condition.metric === 'variableEquals') {
    // condition.value expected as "varName=expectedValue" string
    const str = String(condition.value);
    const eq  = str.indexOf('=');
    if (eq < 0) return false;
    const varName = str.slice(0, eq).trim();
    const expected= str.slice(eq + 1).trim();
    const vars    = state.session?.variables ?? {};
    const actual  = String(vars[varName] ?? '');
    return actual === expected;
  }
  const actual = getMetric(condition.metric);
  switch (condition.op) {
    case '<':  return actual <  condition.value;
    case '>':  return actual >  condition.value;
    case '<=': return actual <= condition.value;
    case '>=': return actual >= condition.value;
    case '==': return Math.abs(actual - condition.value) < 0.001;
    default:   return false;
  }
}

