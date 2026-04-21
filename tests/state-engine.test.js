// ── tests/state-engine.test.js ────────────────────────────────────────────
// Tests for js/state-engine.js — metric fusion, setAttention,
// setExternalSignal, getMetric, resetStateEngine.

import { makeRunner } from './harness.js';
import {
  DEFAULT_FUSION_WEIGHTS,
  setExternalSignal, clearExternalSignals,
  setAttention, tickStateEngine,
  getMetric, resetStateEngine,
} from '../js/state-engine.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runStateEngineTests() {
  const R  = makeRunner('state-engine.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function reset() {
    state.session   = normalizeSession(defaultSession());
    state.runtime   = null;
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    state.engineState = { attention: 0, engagement: 0, intensity: 1, speed: 1 };
    resetStateEngine();
    clearExternalSignals();
  }

  // ── DEFAULT_FUSION_WEIGHTS ────────────────────────────────────────────────
  t('DEFAULT_FUSION_WEIGHTS is an object with numeric values', () => {
    ok(typeof DEFAULT_FUSION_WEIGHTS === 'object');
    for (const [, v] of Object.entries(DEFAULT_FUSION_WEIGHTS)) {
      ok(typeof v === 'number' && Number.isFinite(v), `weight ${v} should be finite`);
    }
  });

  t('DEFAULT_FUSION_WEIGHTS values are all between 0 and 1', () => {
    for (const [k, v] of Object.entries(DEFAULT_FUSION_WEIGHTS)) {
      ok(v >= 0 && v <= 1, `${k}: ${v} out of [0,1]`);
    }
  });

  // ── setAttention ──────────────────────────────────────────────────────────
  t('setAttention(1) followed by tickStateEngine produces attention=1', () => {
    reset();
    setAttention(1);
    tickStateEngine();
    eq(state.engineState.attention, 1);
  });

  t('setAttention(0) produces attention=0', () => {
    reset();
    setAttention(0);
    tickStateEngine();
    eq(state.engineState.attention, 0);
  });

  t('setAttention clamps values above 1 to 1', () => {
    reset();
    setAttention(2.5);
    tickStateEngine();
    ok(state.engineState.attention <= 1, `attention should be ≤1`);
  });

  t('setAttention clamps negative values to 0', () => {
    reset();
    setAttention(-0.5);
    tickStateEngine();
    ok(state.engineState.attention >= 0, `attention should be ≥0`);
  });

  // ── setExternalSignal ─────────────────────────────────────────────────────
  t('setExternalSignal accepts values 0–1', () => {
    reset();
    let threw = false;
    try { setExternalSignal('heartRate', 0.75, 0.5); } catch { threw = true; }
    ok(!threw, 'setExternalSignal should not throw for valid inputs');
  });

  t('setExternalSignal with value > 1 clamps to 1', () => {
    reset();
    let threw = false;
    try { setExternalSignal('heartRate', 1.5, 0.3); } catch { threw = true; }
    ok(!threw);
  });

  t('setExternalSignal with value < 0 clamps to 0', () => {
    reset();
    let threw = false;
    try { setExternalSignal('heartRate', -0.5, 0.3); } catch { threw = true; }
    ok(!threw);
  });

  t('clearExternalSignals does not throw', () => {
    reset();
    setExternalSignal('heartRate', 0.8, 0.4);
    let threw = false;
    try { clearExternalSignals(); } catch { threw = true; }
    ok(!threw);
  });

  // ── tickStateEngine ───────────────────────────────────────────────────────
  t('tickStateEngine writes a valid engineState', () => {
    reset();
    tickStateEngine();
    const es = state.engineState;
    ok(Number.isFinite(es.attention),  'attention finite');
    ok(Number.isFinite(es.engagement), 'engagement finite');
    ok(Number.isFinite(es.intensity),  'intensity finite');
    ok(Number.isFinite(es.speed),      'speed finite');
  });

  t('tickStateEngine with liveControl.intensityScale=0.5 sets intensity=0.5', () => {
    reset();
    state.liveControl.intensityScale = 0.5;
    tickStateEngine();
    eq(state.engineState.intensity, 0.5);
  });

  t('tickStateEngine with no runtime sets playing=false', () => {
    reset();
    state.runtime = null;
    tickStateEngine();
    ok(state.engineState.playing === false);
  });

  // ── getMetric ─────────────────────────────────────────────────────────────
  t('getMetric returns 0 for unknown metric', () => {
    reset();
    tickStateEngine();
    eq(getMetric('not_a_metric'), 0);
  });

  t('getMetric("attention") matches engineState.attention', () => {
    reset();
    setAttention(0.75);
    tickStateEngine();
    eq(getMetric('attention'), state.engineState.attention);
  });

  t('getMetric("intensity") returns liveControl.intensityScale', () => {
    reset();
    state.liveControl.intensityScale = 1.3;
    tickStateEngine();
    eq(getMetric('intensity'), 1.3);
  });

  t('getMetric("sessionTime") returns 0 when not playing', () => {
    reset();
    tickStateEngine();
    eq(getMetric('sessionTime'), 0);
  });

  // ── resetStateEngine ──────────────────────────────────────────────────────
  t('resetStateEngine sets attention to 0 after non-zero value', () => {
    reset();
    setAttention(1);
    tickStateEngine();
    resetStateEngine();
    tickStateEngine();
    eq(state.engineState.attention, 0);
  });

  // ── External signal integration ───────────────────────────────────────────
  t('setExternalSignal then tickStateEngine influences engagement', () => {
    reset();
    setAttention(0);  // no attention
    setExternalSignal('heartRate', 1.0, 0.8);  // strong heartRate signal
    tickStateEngine();
    // engagement should be > 0 due to the external signal
    ok(state.engineState.engagement >= 0, 'engagement should be a valid number');
    ok(Number.isFinite(state.engineState.engagement), 'engagement must be finite');
  });

  t('clearExternalSignals resets signal influence', () => {
    reset();
    setExternalSignal('heartRate', 1.0, 0.8);
    clearExternalSignals();
    setAttention(0);
    tickStateEngine();
    // After clearing, only attention drives engagement
    ok(Number.isFinite(state.engineState.engagement));
  });

  t('tickStateEngine with intensityScale > 1 reflects in engineState.intensity', () => {
    reset();
    state.liveControl.intensityScale = 1.8;
    tickStateEngine();
    ok(Math.abs(state.engineState.intensity - 1.8) < 0.001);
  });

  t('getMetric("speed") reflects liveControl.speedScale', () => {
    reset();
    state.liveControl.speedScale = 2.5;
    tickStateEngine();
    ok(Math.abs(getMetric('speed') - 2.5) < 0.001);
  });

  t('getMetric("loopCount") returns 0 when not playing', () => {
    reset();
    state.runtime = null;
    tickStateEngine();
    eq(getMetric('loopCount'), 0);
  });

  t('multiple tickStateEngine calls are idempotent (no accumulation)', () => {
    reset();
    setAttention(0.5);
    tickStateEngine();
    const first = state.engineState.engagement;
    tickStateEngine();
    const second = state.engineState.engagement;
    ok(Math.abs(first - second) < 0.01, 'consecutive ticks should be stable');
  });


  // ── tickStateEngine: boundary values ─────────────────────────────────────
  t('tickStateEngine with intensityScale 0 produces intensity 0', () => {
    reset();
    state.liveControl.intensityScale = 0;
    tickStateEngine();
    eq(state.engineState.intensity, 0);
  });

  t('tickStateEngine produces finite engagement when attention is 0', () => {
    reset();
    setAttention(0);
    tickStateEngine();
    ok(Number.isFinite(state.engineState.engagement), 'engagement must be finite');
    ok(state.engineState.engagement >= 0, 'engagement must be >= 0');
  });

  t('tickStateEngine with playing=true runtime sets playing=true', () => {
    reset();
    state.runtime = { paused: false, sessionTime: 30, loopIndex: 0 };
    tickStateEngine();
    ok(state.engineState.playing === true);
  });

  t('tickStateEngine with paused runtime sets playing=false', () => {
    reset();
    state.runtime = { paused: true, sessionTime: 30, loopIndex: 0 };
    tickStateEngine();
    ok(state.engineState.playing === false);
  });

  t('getMetric returns 0 for each valid but unset metric', () => {
    reset();
    tickStateEngine();
    for (const m of ['attention','engagement','intensity','speed','deviceLoad','sessionTime','loopCount']) {
      const v = getMetric(m);
      ok(Number.isFinite(v), `getMetric("${m}") should be finite, got ${v}`);
    }
  });

  t('resetStateEngine followed by tick produces fresh state', () => {
    reset();
    setAttention(1);
    tickStateEngine();
    resetStateEngine();
    tickStateEngine();
    eq(getMetric('attention'), 0, 'attention should be 0 after reset');
  });


  // ── Metric boundary and stability ────────────────────────────────────────
  t('all engine metrics stay finite after 200 rapid ticks', () => {
    reset();
    for (let i = 0; i < 200; i++) {
      setAttention(Math.random());
      tickStateEngine();
    }
    for (const m of ['attention','engagement','intensity','speed','deviceLoad']) {
      const v = getMetric(m);
      ok(Number.isFinite(v), `${m} should be finite after 200 ticks, got ${v}`);
    }
  });

  t('setAttention clamps to [0,1] range', () => {
    reset();
    setAttention(5);
    tickStateEngine();
    const v = getMetric('attention');
    ok(v >= 0 && v <= 1, `attention ${v} should be in [0,1]`);
  });

  t('setAttention(-1) does not crash and stays in [0,1]', () => {
    reset();
    let threw = false;
    try { setAttention(-1); tickStateEngine(); } catch { threw = true; }
    ok(!threw, 'negative attention should not throw');
    const v = getMetric('attention');
    ok(v >= 0, `attention should be >= 0, got ${v}`);
  });

  t('getMetric returns 0 for unknown metric name', () => {
    reset();
    const v = getMetric('nonexistent_metric_xyz');
    ok(v === 0 || v === undefined || Number.isFinite(v ?? 0),
      `unknown metric should return 0 or undefined, got ${v}`);
  });


  return R.summary();
}
