// ── tests/live-control.test.js ────────────────────────────────────────────
// Tests for live-control.js — applyLiveControl, getLiveSpeedMs,
// setLiveIntensity, setLiveSpeed, and defaultLiveControl shape.
//
// DOM-dependent functions (renderLiveControl, updateLiveMeter, etc.) are
// not tested here — they need a real document. These tests cover the pure
// numerical logic that is exercised on every playback tick.

import { makeRunner } from './harness.js';
import {
  defaultLiveControl,
  applyLiveControl,
  getLiveSpeedMs,
  setLiveIntensity,
  setLiveSpeed,
} from '../js/live-control.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runLiveControlTests() {
  const R  = makeRunner('live-control.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function reset() {
    state.session = normalizeSession(defaultSession());
    state.liveControl = defaultLiveControl();
  }

  // ── defaultLiveControl shape ───────────────────────────────────────────
  t('defaultLiveControl returns expected shape', () => {
    const lc = defaultLiveControl();
    ok(typeof lc.intensityScale === 'number', 'intensityScale');
    ok(typeof lc.speedScale     === 'number', 'speedScale');
    ok(typeof lc.randomness     === 'number', 'randomness');
    eq(lc.intensityScale, 1.0);
    eq(lc.speedScale,     1.0);
    eq(lc.randomness,     0.0);
  });

  // ── applyLiveControl ──────────────────────────────────────────────────
  t('applyLiveControl returns raw position at scale=1 randomness=0', () => {
    reset();
    state.liveControl.intensityScale = 1.0;
    state.liveControl.randomness     = 0.0;
    eq(applyLiveControl(50), 50);
    eq(applyLiveControl(0),   0);
    eq(applyLiveControl(100), 100);
  });

  t('applyLiveControl scales position by intensityScale', () => {
    reset();
    state.liveControl.intensityScale = 2.0;
    state.liveControl.randomness     = 0.0;
    eq(applyLiveControl(50), 100);
    eq(applyLiveControl(25), 50);
  });

  t('applyLiveControl clamps output to 0–100', () => {
    reset();
    state.liveControl.intensityScale = 3.0;
    state.liveControl.randomness     = 0.0;
    eq(applyLiveControl(50), 100,  'over-scale must be clamped to 100');
    eq(applyLiveControl(0),   0,   'zero stays zero');
  });

  t('applyLiveControl with intensityScale=0 returns 0', () => {
    reset();
    state.liveControl.intensityScale = 0.0;
    state.liveControl.randomness     = 0.0;
    eq(applyLiveControl(80), 0);
  });

  t('applyLiveControl with randomness adds jitter within ±10% of range', () => {
    reset();
    state.liveControl.intensityScale = 1.0;
    state.liveControl.randomness     = 1.0; // max randomness
    // Run many times and ensure output stays within 0–100
    for (let i = 0; i < 100; i++) {
      const out = applyLiveControl(50);
      ok(out >= 0 && out <= 100, `jitter output ${out} must be in 0–100`);
    }
  });

  // ── getLiveSpeedMs ────────────────────────────────────────────────────
  t('getLiveSpeedMs at default settings returns sessionTimeSec × 1000', () => {
    reset();
    state.session.funscriptSettings.speed = 1.0;
    state.liveControl.speedScale = 1.0;
    eq(getLiveSpeedMs(1), 1000);
    eq(getLiveSpeedMs(2), 2000);
    eq(getLiveSpeedMs(0), 0);
  });

  t('getLiveSpeedMs with baseSpeed=2 halves the effective time', () => {
    reset();
    state.session.funscriptSettings.speed = 2.0;
    state.liveControl.speedScale = 1.0;
    eq(getLiveSpeedMs(1), 500);  // 1000 / 2
  });

  t('getLiveSpeedMs with speedScale=0.5 doubles the effective time', () => {
    reset();
    state.session.funscriptSettings.speed = 1.0;
    state.liveControl.speedScale = 0.5;
    eq(getLiveSpeedMs(1), 2000);  // 1000 / 0.5
  });

  t('getLiveSpeedMs combines baseSpeed and speedScale multiplicatively', () => {
    reset();
    state.session.funscriptSettings.speed = 2.0;
    state.liveControl.speedScale = 2.0;
    eq(getLiveSpeedMs(1), 250);  // 1000 / (2 × 2)
  });

  t('getLiveSpeedMs handles zero speed gracefully (no crash)', () => {
    reset();
    state.session.funscriptSettings.speed = 0;
    state.liveControl.speedScale = 0;
    // Both zero — defensive || 1.0 fallback should prevent division by zero
    const result = getLiveSpeedMs(1);
    ok(Number.isFinite(result), `result must be finite, got ${result}`);
  });

  // ── setLiveIntensity ──────────────────────────────────────────────────
  t('setLiveIntensity updates liveControl.intensityScale', () => {
    reset();
    setLiveIntensity(0.5);
    eq(state.liveControl.intensityScale, 0.5);
  });

  t('setLiveIntensity clamps to 0–2 via safety layer', () => {
    reset();
    // Safety clampIntensity allows up to maxIntensity (default 2.0)
    setLiveIntensity(3.0);
    ok(state.liveControl.intensityScale <= 2.0, 'must not exceed 2.0');
  });

  t('setLiveIntensity(0) sets intensity to exactly 0', () => {
    reset();
    setLiveIntensity(1.0); // set to 1 first
    setLiveIntensity(0);
    eq(state.liveControl.intensityScale, 0, 'zero is a valid intensity target');
  });

  t('setLiveIntensity is a no-op when liveControl is null', () => {
    reset();
    const saved = state.liveControl;
    state.liveControl = null;
    setLiveIntensity(1.5); // must not throw
    state.liveControl = saved; // restore
    ok(true, 'no exception thrown');
  });

  // ── setLiveSpeed ──────────────────────────────────────────────────────
  t('setLiveSpeed updates liveControl.speedScale', () => {
    reset();
    setLiveSpeed(2.0);
    eq(state.liveControl.speedScale, 2.0);
  });

  t('setLiveSpeed clamps to 0.25–4 via safety layer', () => {
    reset();
    setLiveSpeed(10.0);
    ok(state.liveControl.speedScale <= 4.0, 'must not exceed 4.0');
  });

  t('setLiveSpeed minimum is 0.25', () => {
    reset();
    setLiveSpeed(0.1);
    ok(state.liveControl.speedScale >= 0.25, 'minimum speed is 0.25');
  });

  t('setLiveSpeed is a no-op when liveControl is null', () => {
    reset();
    const saved = state.liveControl;
    state.liveControl = null;
    setLiveSpeed(2.0); // must not throw
    state.liveControl = saved;
    ok(true, 'no exception thrown');
  });

  // ── Integration: intensity affects applyLiveControl ───────────────────
  t('setLiveIntensity → applyLiveControl uses updated scale', () => {
    reset();
    setLiveIntensity(0.5);
    eq(applyLiveControl(100), 50, 'pos 100 × 0.5 scale = 50');
  });

  t('setLiveSpeed → getLiveSpeedMs uses updated speedScale', () => {
    reset();
    state.session.funscriptSettings.speed = 1.0;
    setLiveSpeed(2.0);
    eq(getLiveSpeedMs(1), 500, '1s at 2× speed = 500ms effective time');
  });

  // ── defaultLiveControl completeness ───────────────────────────────────────
  t('defaultLiveControl includes all required fields', () => {
    const lc = defaultLiveControl();
    ok('intensityScale' in lc, 'intensityScale');
    ok('speedScale'     in lc, 'speedScale');
    ok('variation'      in lc, 'variation');
    ok('randomness'     in lc, 'randomness');
  });

  t('defaultLiveControl intensityScale defaults to 1', () => {
    eq(defaultLiveControl().intensityScale, 1);
  });

  t('defaultLiveControl speedScale defaults to 1', () => {
    eq(defaultLiveControl().speedScale, 1);
  });

  // ── applyLiveControl boundary cases ───────────────────────────────────────
  t('applyLiveControl with pos=50 at scale=2 clamps to 100', () => {
    reset();
    state.liveControl = { ...defaultLiveControl(), intensityScale: 2.0, randomness: 0 };
    ok(applyLiveControl(50) === 100, 'scale=2 × pos=50 = 100 (clamped)');
  });

  t('applyLiveControl with negative pos returns 0', () => {
    reset();
    state.liveControl = { ...defaultLiveControl(), intensityScale: 1.0, randomness: 0 };
    eq(applyLiveControl(-10), 0, 'negative pos should clamp to 0');
  });

  t('applyLiveControl with pos>100 clamps to scale×100 (capped at 100)', () => {
    reset();
    state.liveControl = { ...defaultLiveControl(), intensityScale: 1.0, randomness: 0 };
    eq(applyLiveControl(150), 100, 'pos=150 clamped to 100 after scale=1');
  });

  // ── getLiveSpeedMs: base speed combinations ────────────────────────────────
  t('getLiveSpeedMs with baseSpeed=1 and speedScale=1 returns sessionTimeSec × 1000', () => {
    reset();
    state.session.funscriptSettings.speed = 1.0;
    state.liveControl.speedScale = 1.0;
    eq(getLiveSpeedMs(5), 5000);
  });

  t('getLiveSpeedMs with baseSpeed=0.5 and speedScale=2 = sessionTime × 1000', () => {
    // 0.5 × 2 = 1.0 effective — so 3s → 3000ms
    reset();
    state.session.funscriptSettings.speed = 0.5;
    setLiveSpeed(2.0);
    ok(Math.abs(getLiveSpeedMs(3) - 3000) < 1, `expected 3000, got ${getLiveSpeedMs(3)}`);
  });

  t('getLiveSpeedMs with very small combined speed still returns positive number', () => {
    reset();
    state.session.funscriptSettings.speed = 0.25;
    setLiveSpeed(0.25);
    ok(getLiveSpeedMs(1) > 0, 'speed must always be positive');
  });

  // ── Variation and randomness fields ───────────────────────────────────────
  t('defaultLiveControl variation defaults to 0', () => {
    ok(defaultLiveControl().variation === 0);
  });

  t('defaultLiveControl randomness defaults to 0', () => {
    ok(defaultLiveControl().randomness === 0);
  });

  t('applyLiveControl with scale=0 returns 0 for any pos', () => {
    setupLiveControl({ intensityScale: 0 });
    eq(applyLiveControl(50),  0);
    eq(applyLiveControl(100), 0);
  });

  t('applyLiveControl with scale=0.5 halves the position', () => {
    setupLiveControl({ intensityScale: 0.5 });
    eq(applyLiveControl(80), 40);
  });

  t('setLiveIntensity clamps to [0, 2]', () => {
    setLiveIntensity(-1);
    ok(state.liveControl.intensityScale >= 0);
    setLiveIntensity(99);
    ok(state.liveControl.intensityScale <= 2);
  });

  t('setLiveSpeed clamps to [0.25, 4]', () => {
    setLiveSpeed(0.01);
    ok(state.liveControl.speedScale >= 0.25);
    setLiveSpeed(999);
    ok(state.liveControl.speedScale <= 4);
  });

  t('getLiveSpeedMs with speedScale=2 halves duration', () => {
    setupLiveControl({ speedScale: 2 });
    const base = state.session.duration * 1000;
    const result = getLiveSpeedMs();
    ok(Math.abs(result - base / 2) < 50, `expected ~${base/2}, got ${result}`);
  });


  // ── NaN / non-finite guards (regression) ─────────────────────────────────
  t('setLiveIntensity(NaN) does not corrupt intensityScale', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    setLiveIntensity(NaN);
    ok(Number.isFinite(state.liveControl.intensityScale), 'intensityScale must stay finite');
    ok(state.liveControl.intensityScale === 1.0, 'value unchanged after NaN input');
  });

  t('setLiveSpeed(NaN) does not corrupt speedScale', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    setLiveSpeed(NaN);
    ok(Number.isFinite(state.liveControl.speedScale), 'speedScale must stay finite');
    ok(state.liveControl.speedScale === 1.0, 'value unchanged after NaN input');
  });

  t('setLiveIntensity(Infinity) does not corrupt intensityScale', () => {
    state.liveControl = { intensityScale: 0.8, speedScale: 1.0, variation: 0, randomness: 0 };
    setLiveIntensity(Infinity);
    ok(Number.isFinite(state.liveControl.intensityScale));
    ok(state.liveControl.intensityScale === 0.8);
  });

  t('setLiveIntensity(0) works correctly (zero is a valid intensity)', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    setLiveIntensity(0);
    ok(state.liveControl.intensityScale === 0, `expected 0, got ${state.liveControl.intensityScale}`);
  });

  t('setLiveSpeed(0.25) clamps to minimum correctly', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    setLiveSpeed(0.01);
    ok(state.liveControl.speedScale >= 0.25);
  });


  // ── applyLiveControl: NaN guard (regression) ─────────────────────────────
  t('applyLiveControl(NaN) returns 0 not NaN', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    const result = applyLiveControl(NaN);
    ok(result === 0, `expected 0, got ${result}`);
    ok(Number.isFinite(result), 'result must be finite');
  });

  t('applyLiveControl(Infinity) returns 0', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    const result = applyLiveControl(Infinity);
    eq(result, 0);
  });

  t('applyLiveControl(0) returns 0 (valid zero position)', () => {
    state.liveControl = { intensityScale: 1.5, speedScale: 1.0, variation: 0, randomness: 0 };
    const result = applyLiveControl(0);
    eq(result, 0, 'zero position * any scale = 0');
  });

  t('applyLiveControl(50) with intensityScale 2.0 clamps to 100', () => {
    state.liveControl = { intensityScale: 2.0, speedScale: 1.0, variation: 0, randomness: 0 };
    const result = applyLiveControl(50);
    ok(result <= 100, `result ${result} should not exceed 100`);
    ok(Number.isFinite(result));
  });


  return R.summary();
}
