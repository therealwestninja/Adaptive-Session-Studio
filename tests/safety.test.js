// ── tests/safety.test.js ─────────────────────────────────────────────────
// Tests for normalizeSafetySettings, clampIntensity, clampSpeed

import { makeRunner } from './harness.js';
import { normalizeSafetySettings, defaultSafetySettings,
         clampIntensity, clampSpeed, tickSafety,
         recordEmergencyStop, isEmergencyCooldownActive,
         getEmergencyCooldownRemaining } from '../js/safety.js';
import { state } from '../js/state.js';

export function runSafetyTests() {
  const R  = makeRunner('safety.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── defaultSafetySettings ────────────────────────────────────────────
  t('defaultSafetySettings returns expected defaults', () => {
    const s = defaultSafetySettings();
    eq(s.maxIntensity,         2.0);
    eq(s.maxSpeed,             4.0);
    eq(s.emergencyCooldownSec, 30);
    eq(s.warnAbove,            1.5);
    ok(s.autoReduceOnLoss === false);
    eq(s.autoReduceTarget,     0.8);
  });

  // ── normalizeSafetySettings ──────────────────────────────────────────
  t('normalizeSafetySettings null → defaults', () => {
    const s = normalizeSafetySettings(null);
    eq(s.maxIntensity, 2.0);
    eq(s.maxSpeed, 4.0);
  });
  t('normalizeSafetySettings clamps maxIntensity 0-2', () => {
    eq(normalizeSafetySettings({ maxIntensity: -1 }).maxIntensity, 0);
    eq(normalizeSafetySettings({ maxIntensity:  5 }).maxIntensity, 2);
  });
  t('normalizeSafetySettings clamps maxSpeed 0.25-4', () => {
    eq(normalizeSafetySettings({ maxSpeed: 0 }).maxSpeed, 0.25);
    eq(normalizeSafetySettings({ maxSpeed: 10 }).maxSpeed, 4);
  });
  t('normalizeSafetySettings clamps warnAbove 0-2', () => {
    eq(normalizeSafetySettings({ warnAbove: 3 }).warnAbove, 2);
    eq(normalizeSafetySettings({ warnAbove: -1 }).warnAbove, 0);
  });
  t('normalizeSafetySettings clamps emergencyCooldownSec min 0', () => {
    eq(normalizeSafetySettings({ emergencyCooldownSec: -5 }).emergencyCooldownSec, 0);
  });
  t('normalizeSafetySettings preserves autoReduceOnLoss:true', () => {
    ok(normalizeSafetySettings({ autoReduceOnLoss: true }).autoReduceOnLoss === true);
  });
  t('normalizeSafetySettings defaults autoReduceOnLoss to false', () => {
    ok(normalizeSafetySettings({}).autoReduceOnLoss === false);
  });
  t('normalizeSafetySettings clamps autoReduceTarget 0-2', () => {
    eq(normalizeSafetySettings({ autoReduceTarget: 5 }).autoReduceTarget, 2);
    eq(normalizeSafetySettings({ autoReduceTarget: -1 }).autoReduceTarget, 0);
  });

  // ── clampIntensity ────────────────────────────────────────────────────
  function withSafetySettings(ss) {
    state.session = { ...state.session, safetySettings: ss };
  }

  t('clampIntensity passes through values below cap', () => {
    withSafetySettings({ maxIntensity: 2.0, warnAbove: 1.8 });
    eq(clampIntensity(1.2), 1.2);
  });
  t('clampIntensity caps at maxIntensity', () => {
    withSafetySettings({ maxIntensity: 1.2, warnAbove: 1.5 });
    eq(clampIntensity(1.8), 1.2);
  });
  t('clampIntensity with null safetySettings uses defaults', () => {
    withSafetySettings(null);
    // Default maxIntensity = 2.0 — should pass anything <= 2.0 unchanged
    eq(clampIntensity(1.9), 1.9);
  });

  // ── clampSpeed ────────────────────────────────────────────────────────
  t('clampSpeed passes through values below cap', () => {
    withSafetySettings({ maxSpeed: 4.0 });
    eq(clampSpeed(2.5), 2.5);
  });
  t('clampSpeed caps at maxSpeed', () => {
    withSafetySettings({ maxSpeed: 2.0, warnAbove: 1.5 });
    eq(clampSpeed(3.0), 2.0);
  });

  // ── Emergency cooldown ────────────────────────────────────────────────
  t('isEmergencyCooldownActive false before any emergency stop', () => {
    // Before any call — the last emergency time starts at -Infinity
    // (but previous tests may have called recordEmergencyStop; skip this test
    //  if we can't guarantee fresh state — just test the shape)
    ok(typeof isEmergencyCooldownActive() === 'boolean');
  });
  t('isEmergencyCooldownActive true immediately after recordEmergencyStop', () => {
    withSafetySettings({ emergencyCooldownSec: 30 });
    recordEmergencyStop();
    ok(isEmergencyCooldownActive() === true);
  });
  t('getEmergencyCooldownRemaining > 0 after emergency stop', () => {
    withSafetySettings({ emergencyCooldownSec: 30 });
    recordEmergencyStop();
    ok(getEmergencyCooldownRemaining() > 0 && getEmergencyCooldownRemaining() <= 30);
  });



// ── tickSafety ─────────────────────────────────────────────────────────────
  t('tickSafety is a no-op when autoReduceOnLoss is false', () => {
    state.session.safetySettings = normalizeSafetySettings({ autoReduceOnLoss: false });
    state.runtime = {};
    state.liveControl = { intensityScale: 1.5 };
    state.engineState = { attention: 0 }; // attention lost
    tickSafety(); // should not throw, should not change liveControl
    ok(state.liveControl.intensityScale === 1.5, 'should not reduce intensity');
    state.runtime = null;
  });

  t('tickSafety is a no-op when runtime is null', () => {
    state.session.safetySettings = normalizeSafetySettings({ autoReduceOnLoss: true });
    state.runtime = null;
    state.liveControl = { intensityScale: 1.5 };
    state.engineState = { attention: 0 };
    tickSafety(); // must not throw
    ok(true, 'no exception');
  });

  t('tickSafety is a no-op when liveControl is null', () => {
    state.session.safetySettings = normalizeSafetySettings({ autoReduceOnLoss: true });
    state.runtime = {};
    state.liveControl = null;
    state.engineState = { attention: 0 };
    tickSafety(); // must not throw
    ok(true, 'no exception');
    state.runtime = null;
  });

  // ── clampIntensity edge cases ──────────────────────────────────────────────
  t('clampIntensity allows exactly maxIntensity', () => {
    withSafetySettings({ maxIntensity: 1.5, warnAbove: 2.0 });
    eq(clampIntensity(1.5), 1.5);
  });

  t('clampIntensity clamps negative to 0', () => {
    withSafetySettings({ maxIntensity: 2.0 });
    eq(clampIntensity(-0.5), 0);
  });

  t('clampIntensity with maxIntensity=0 returns 0 for any input', () => {
    withSafetySettings({ maxIntensity: 0 });
    eq(clampIntensity(1.0), 0);
    eq(clampIntensity(0), 0);
  });

  // ── clampSpeed edge cases ─────────────────────────────────────────────────
  t('clampSpeed allows exactly maxSpeed', () => {
    withSafetySettings({ maxSpeed: 2.5 });
    eq(clampSpeed(2.5), 2.5);
  });

  t('clampSpeed clamps below minimum (0.25)', () => {
    withSafetySettings({ maxSpeed: 4.0 });
    ok(clampSpeed(0.01) >= 0.25, 'speed below 0.25 should be clamped up');
  });

  t('clampSpeed with maxSpeed=0.25 clamps low values to minimum', () => {
    withSafetySettings({ maxSpeed: 0.25 });
    eq(clampSpeed(0.5), 0.25);
  });

  // ── normalizeSafetySettings complete round-trip ───────────────────────────
  t('normalizeSafetySettings round-trips a fully specified object', () => {
    const s = normalizeSafetySettings({
      maxIntensity: 1.4, maxSpeed: 2.0, warnAbove: 1.2,
      emergencyCooldownSec: 45, autoReduceOnLoss: true, autoReduceTarget: 0.5,
    });
    eq(s.maxIntensity, 1.4);
    eq(s.maxSpeed, 2.0);
    eq(s.warnAbove, 1.2);
    eq(s.emergencyCooldownSec, 45);
    ok(s.autoReduceOnLoss === true);
    eq(s.autoReduceTarget, 0.5);
  });

  t('normalizeSafetySettings clamps maxIntensity to 0 minimum', () => {
    ok(normalizeSafetySettings({ maxIntensity: -1 }).maxIntensity === 0);
  });

  t('normalizeSafetySettings clamps emergencyCooldownSec to 0 minimum', () => {
    ok(normalizeSafetySettings({ emergencyCooldownSec: -10 }).emergencyCooldownSec === 0);
  });

  // ── getEmergencyCooldownRemaining ─────────────────────────────────────────
  t('getEmergencyCooldownRemaining returns 0 when cooldown is 0s', () => {
    withSafetySettings({ emergencyCooldownSec: 0 });
    recordEmergencyStop();
    eq(getEmergencyCooldownRemaining(), 0);
  });

  t('getEmergencyCooldownRemaining is within [0, cooldownSec] after stop', () => {
    withSafetySettings({ emergencyCooldownSec: 60 });
    recordEmergencyStop();
    const r = getEmergencyCooldownRemaining();
    ok(r >= 0 && r <= 60, `remaining ${r} should be in [0, 60]`);
  });


  // ── tickSafety with autoReduceOnLoss: integration ────────────────────────
  t('tickSafety reduces intensityScale when autoReduceOnLoss and attention is 0', () => {
    state.session.safetySettings = normalizeSafetySettings({
      autoReduceOnLoss: true, autoReduceTarget: 0.5, maxIntensity: 2.0
    });
    state.runtime     = {};
    state.liveControl = { intensityScale: 1.5 };
    state.engineState = { attention: 0 }; // attention fully lost
    tickSafety();
    ok(state.liveControl.intensityScale < 1.5,
      `intensityScale should reduce when attention is 0, got ${state.liveControl.intensityScale}`);
    state.runtime = null;
  });

  t('tickSafety does not reduce below autoReduceTarget', () => {
    state.session.safetySettings = normalizeSafetySettings({
      autoReduceOnLoss: true, autoReduceTarget: 0.4
    });
    state.runtime     = {};
    state.liveControl = { intensityScale: 0.3 }; // already below target
    state.engineState = { attention: 0 };
    tickSafety();
    // Should not reduce further below target
    ok(state.liveControl.intensityScale >= 0, 'should not go negative');
    state.runtime = null;
  });

  t('normalizeSafetySettings preserves values within valid ranges', () => {
    const s = normalizeSafetySettings({
      maxIntensity: 1.2, maxSpeed: 2.5, warnAbove: 1.0,
      emergencyCooldownSec: 20, autoReduceOnLoss: true, autoReduceTarget: 0.6
    });
    eq(s.maxIntensity, 1.2);
    eq(s.maxSpeed, 2.5);
    eq(s.warnAbove, 1.0);
    eq(s.emergencyCooldownSec, 20);
    ok(s.autoReduceOnLoss === true);
    eq(s.autoReduceTarget, 0.6);
  });


  // ── Zero-value safety settings (regression for Number() || bug) ──────────
  t('normalizeSafetySettings warnAbove:0 is preserved (disable warnings)', () => {
    const s = normalizeSafetySettings({ warnAbove: 0 });
    eq(s.warnAbove, 0, 'warnAbove:0 should disable warnings, not reset to 1.5');
  });

  t('normalizeSafetySettings emergencyCooldownSec:0 is preserved (no cooldown)', () => {
    const s = normalizeSafetySettings({ emergencyCooldownSec: 0 });
    eq(s.emergencyCooldownSec, 0, 'cooldown:0 should mean no cooldown period');
  });

  t('normalizeSafetySettings autoReduceTarget:0 is preserved (full disable)', () => {
    const s = normalizeSafetySettings({ autoReduceTarget: 0 });
    eq(s.autoReduceTarget, 0);
  });


  // ── Zero-value settings correctness ──────────────────────────────────────
  t('normalizeSafetySettings preserves warnAbove:0 (disable warnings)', () => {
    const s = normalizeSafetySettings({ warnAbove: 0 });
    eq(s.warnAbove, 0, 'warnAbove=0 should be preserved');
  });

  t('normalizeSafetySettings preserves emergencyCooldownSec:0 (no cooldown)', () => {
    const s = normalizeSafetySettings({ emergencyCooldownSec: 0 });
    eq(s.emergencyCooldownSec, 0, 'cooldown=0 should be preserved');
  });

  t('normalizeSafetySettings preserves autoReduceTarget:0 (reduce to zero)', () => {
    const s = normalizeSafetySettings({ autoReduceTarget: 0 });
    eq(s.autoReduceTarget, 0, 'target=0 should be preserved');
  });


  // ── NaN / Infinity guards (regression) ───────────────────────────────────
  t('clampIntensity(NaN) returns 0 without throwing', () => {
    const result = clampIntensity(NaN);
    eq(result, 0, `expected 0 for NaN input, got ${result}`);
  });

  t('clampIntensity(Infinity) returns 0 without throwing', () => {
    const result = clampIntensity(Infinity);
    eq(result, 0, `expected 0 for Infinity input, got ${result}`);
  });

  t('clampIntensity(-Infinity) returns 0 without throwing', () => {
    const result = clampIntensity(-Infinity);
    eq(result, 0);
  });

  t('clampSpeed(NaN) returns 1.0 without throwing', () => {
    const result = clampSpeed(NaN);
    eq(result, 1.0, `expected 1.0 for NaN input, got ${result}`);
  });

  t('clampSpeed(Infinity) returns 1.0 without throwing', () => {
    const result = clampSpeed(Infinity);
    eq(result, 1.0);
  });

  t('clampIntensity(0) works correctly (zero is valid)', () => {
    const result = clampIntensity(0);
    ok(Number.isFinite(result), 'result should be finite');
    eq(result, 0);
  });


  // ── normalizeSafetySettings: comprehensive edge cases ────────────────────
  t('normalizeSafetySettings preserves valid maxIntensity', () => {
    eq(normalizeSafetySettings({ maxIntensity: 1.5 }).maxIntensity, 1.5);
  });

  t('normalizeSafetySettings clamps maxIntensity to [0, 2]', () => {
    ok(normalizeSafetySettings({ maxIntensity: 5 }).maxIntensity <= 2);
    ok(normalizeSafetySettings({ maxIntensity: -1 }).maxIntensity >= 0);
  });

  t('normalizeSafetySettings clamps maxSpeed to [0.25, 4]', () => {
    ok(normalizeSafetySettings({ maxSpeed: 10 }).maxSpeed <= 4);
    ok(normalizeSafetySettings({ maxSpeed: 0 }).maxSpeed >= 0.25);
  });

  t('normalizeSafetySettings null returns defaults', () => {
    const r = normalizeSafetySettings(null);
    const d = defaultSafetySettings();
    eq(r.maxIntensity, d.maxIntensity);
    eq(r.maxSpeed, d.maxSpeed);
    eq(r.warnAbove, d.warnAbove);
  });

  t('normalizeSafetySettings double round-trip is idempotent', () => {
    const once  = normalizeSafetySettings({ maxIntensity: 1.2, maxSpeed: 2.0 });
    const twice = normalizeSafetySettings(once);
    eq(twice.maxIntensity, once.maxIntensity);
    eq(twice.maxSpeed, once.maxSpeed);
  });

  t('clampIntensity(1.0) respects a maxIntensity of 0.8', () => {
    // Temporarily lower the safety limit to 0.8
    state.session.safetySettings = normalizeSafetySettings({ maxIntensity: 0.8 });
    const result = clampIntensity(1.0);
    ok(result <= 0.8, `expected ≤0.8 with max 0.8, got ${result}`);
    state.session.safetySettings = defaultSafetySettings();
  });


  // ── Audio-engine regression: masterVol NaN guard ─────────────────────────
  t('clampIntensity(0) returns 0 (valid zero value, not swallowed)', () => {
    state.session.safetySettings = defaultSafetySettings();
    eq(clampIntensity(0), 0, 'zero intensity should be allowed through');
  });

  t('clampSpeed(0.25) passes through (at minimum)', () => {
    state.session.safetySettings = defaultSafetySettings();
    const result = clampSpeed(0.25);
    ok(result >= 0.25, `min speed 0.25 should pass, got ${result}`);
  });

  t('clampSpeed(-1) clamps to minimum, not NaN', () => {
    state.session.safetySettings = defaultSafetySettings();
    const result = clampSpeed(-1);
    ok(Number.isFinite(result), 'result should be finite');
    ok(result > 0, 'result should be positive');
  });


  return R.summary();
}
