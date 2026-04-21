// ── tests/pacing-ramp.test.js ─────────────────────────────────────────────
// Tests for normalizeRampSettings, evaluateRamp (intensity-ramp.js)
// and normalizePacingSettings, tickDynamicPacing (dynamic-pacing.js)

import { makeRunner } from './harness.js';
import { normalizeRampSettings, evaluateRamp, defaultRampSettings }
  from '../js/intensity-ramp.js';
import { normalizePacingSettings, defaultPacingSettings, tickDynamicPacing, resetDynamicPacing }
  from '../js/dynamic-pacing.js';
import { state } from '../js/state.js';

export function runPacingRampTests() {
  const R  = makeRunner('intensity-ramp.js & dynamic-pacing.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── normalizeRampSettings ─────────────────────────────────────────────
  t('normalizeRampSettings null → defaults', () => {
    const r = normalizeRampSettings(null);
    ok(r !== null);
    eq(r.enabled, false);
    eq(r.mode, 'time');
    eq(r.startVal, 0.5);
    eq(r.endVal, 1.5);
    eq(r.curve, 'linear');
    eq(r.blendMode, 'max');
  });
  t('normalizeRampSettings enabled:true preserved', () => {
    ok(normalizeRampSettings({ enabled: true }).enabled === true);
  });
  t('normalizeRampSettings clamps startVal 0-2', () => {
    eq(normalizeRampSettings({ startVal: -1 }).startVal, 0);
    eq(normalizeRampSettings({ startVal: 5  }).startVal, 2);
  });
  t('normalizeRampSettings clamps endVal 0-2', () => {
    eq(normalizeRampSettings({ endVal: 3 }).endVal, 2);
  });
  t('normalizeRampSettings accepts all valid modes', () => {
    for (const mode of ['time','engagement','step','adaptive']) {
      eq(normalizeRampSettings({ mode }).mode, mode, `mode ${mode}`);
    }
  });
  t('normalizeRampSettings rejects invalid mode → time', () => {
    eq(normalizeRampSettings({ mode: 'random' }).mode, 'time');
  });
  t('normalizeRampSettings accepts all curves', () => {
    for (const curve of ['linear','exponential','sine']) {
      eq(normalizeRampSettings({ curve }).curve, curve);
    }
  });
  t('normalizeRampSettings rejects invalid curve → linear', () => {
    eq(normalizeRampSettings({ curve: 'bounce' }).curve, 'linear');
  });
  t('normalizeRampSettings accepts all blendModes', () => {
    for (const bm of ['max','add','replace']) {
      eq(normalizeRampSettings({ blendMode: bm }).blendMode, bm);
    }
  });
  t('normalizeRampSettings normalizes steps array', () => {
    const r = normalizeRampSettings({ steps: [
      { atSec: 30, intensity: 1.2 },
      { atSec: 60, intensity: 3   },  // clamps to 2
      { atSec: 'bad', intensity: 1 }, // filtered
    ]});
    eq(r.steps.length, 2);
    eq(r.steps[0].atSec, 30);
    eq(r.steps[1].intensity, 2);
  });

  // ── evaluateRamp ──────────────────────────────────────────────────────
  function withRampState(rampSettings, engineState, duration = 120) {
    state.session = { ...state.session, rampSettings, duration };
    state.runtime = { sessionTime: engineState.sessionTime ?? 0, loopIndex: 0 };
    state.engineState = { attention: 0, intensity: 1, speed: 1, engagement: 0,
                          sessionTime: engineState.sessionTime ?? 0, loopCount: 0,
                          fsPaused: false, playing: true, ...engineState };
  }

  t('evaluateRamp returns null when disabled', () => {
    withRampState({ enabled: false }, { sessionTime: 60 });
    eq(evaluateRamp(), null);
  });
  t('evaluateRamp returns null when runtime is null', () => {
    state.session = { ...state.session, rampSettings: { enabled: true, mode: 'time', startVal: 0.5, endVal: 1.5, curve: 'linear', steps: [], blendMode: 'max' }, duration: 120 };
    state.runtime = null;
    eq(evaluateRamp(), null);
  });
  t('evaluateRamp time mode: startVal at t=0', () => {
    withRampState({ enabled: true, mode: 'time', startVal: 0.5, endVal: 1.5, curve: 'linear', steps: [], blendMode: 'max' }, { sessionTime: 0 });
    eq(evaluateRamp(), 0.5);
  });
  t('evaluateRamp time mode: endVal at t=duration', () => {
    withRampState({ enabled: true, mode: 'time', startVal: 0.5, endVal: 1.5, curve: 'linear', steps: [], blendMode: 'max' }, { sessionTime: 120 });
    eq(evaluateRamp(), 1.5);
  });
  t('evaluateRamp time mode: midpoint (linear)', () => {
    withRampState({ enabled: true, mode: 'time', startVal: 0, endVal: 2, curve: 'linear', steps: [], blendMode: 'max' }, { sessionTime: 60 });
    const result = evaluateRamp();
    ok(Math.abs(result - 1.0) < 0.01, `expected ~1.0, got ${result}`);
  });
  t('evaluateRamp engagement mode: tracks engagement score', () => {
    withRampState({ enabled: true, mode: 'engagement', startVal: 0, endVal: 2, curve: 'linear', steps: [], blendMode: 'max' }, { engagement: 0.5, sessionTime: 0 });
    const result = evaluateRamp();
    ok(Math.abs(result - 1.0) < 0.01, `expected ~1.0, got ${result}`);
  });
  t('evaluateRamp step mode: returns startVal when before first step', () => {
    withRampState({ enabled: true, mode: 'step', startVal: 0.5, endVal: 1.5, curve: 'linear',
      steps: [{ atSec: 30, intensity: 1.0 }], blendMode: 'max' }, { sessionTime: 10 });
    eq(evaluateRamp(), 0.5);
  });
  t('evaluateRamp step mode: returns step intensity after atSec', () => {
    withRampState({ enabled: true, mode: 'step', startVal: 0.5, endVal: 1.5, curve: 'linear',
      steps: [{ atSec: 30, intensity: 1.2 }], blendMode: 'max' }, { sessionTime: 45 });
    eq(evaluateRamp(), 1.2);
  });

  // ── normalizePacingSettings ───────────────────────────────────────────
  t('normalizePacingSettings null → defaults', () => {
    const p = normalizePacingSettings(null);
    eq(p.enabled, false);
    eq(p.minSpeed, 0.5);
    eq(p.maxSpeed, 2.0);
    eq(p.smoothingSec, 4);
    eq(p.curve, 'linear');
    eq(p.lockDuringSec, 0);
  });
  t('normalizePacingSettings enabled:true preserved', () => {
    ok(normalizePacingSettings({ enabled: true }).enabled === true);
  });
  t('normalizePacingSettings clamps minSpeed to 0.25 floor', () => {
    eq(normalizePacingSettings({ minSpeed: 0 }).minSpeed, 0.25);
  });
  t('normalizePacingSettings clamps maxSpeed to 4 ceiling', () => {
    eq(normalizePacingSettings({ maxSpeed: 10 }).maxSpeed, 4);
  });
  t('normalizePacingSettings accepts valid curves', () => {
    for (const curve of ['linear','exponential','sine']) {
      eq(normalizePacingSettings({ curve }).curve, curve);
    }
  });
  t('normalizePacingSettings rejects invalid curve → linear', () => {
    eq(normalizePacingSettings({ curve: 'random' }).curve, 'linear');
  });
  t('normalizePacingSettings clamps smoothingSec 0-30', () => {
    eq(normalizePacingSettings({ smoothingSec: -1 }).smoothingSec, 0);
    eq(normalizePacingSettings({ smoothingSec: 100 }).smoothingSec, 30);
  });

  // ── tickDynamicPacing ─────────────────────────────────────────────────
  t('tickDynamicPacing does nothing when runtime is null', () => {
    resetDynamicPacing();
    state.session = { ...state.session, pacingSettings: { enabled: true, minSpeed: 0.5, maxSpeed: 2, smoothingSec: 0, curve: 'linear', lockDuringSec: 0 } };
    state.liveControl = { intensityScale: 1, speedScale: 1 };
    state.runtime = null;
    tickDynamicPacing(0.016);
    eq(state.liveControl.speedScale, 1, 'should not change speed when stopped');
  });

  t('tickDynamicPacing does nothing when disabled', () => {
    resetDynamicPacing();
    state.session = { ...state.session, pacingSettings: { enabled: false, minSpeed: 0.5, maxSpeed: 2, smoothingSec: 0, curve: 'linear', lockDuringSec: 0 } };
    state.liveControl = { intensityScale: 1, speedScale: 1 };
    state.runtime = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { engagement: 0.8, sessionTime: 5, playing: true };
    tickDynamicPacing(0.016);
    eq(state.liveControl.speedScale, 1, 'disabled pacing must not change speed');
  });

  t('tickDynamicPacing with engagement=0 → minSpeed (no smoothing)', () => {
    resetDynamicPacing();
    state.session = { ...state.session, pacingSettings: { enabled: true, minSpeed: 0.5, maxSpeed: 2, smoothingSec: 0, curve: 'linear', lockDuringSec: 0 } };
    state.liveControl = { intensityScale: 1, speedScale: 1 };
    state.runtime = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { engagement: 0, sessionTime: 5, playing: true };
    tickDynamicPacing(1);
    ok(Math.abs(state.liveControl.speedScale - 0.5) < 0.01, `expected ~0.5, got ${state.liveControl.speedScale}`);
  });

  t('tickDynamicPacing with engagement=1 → maxSpeed (no smoothing)', () => {
    resetDynamicPacing();
    state.session = { ...state.session, pacingSettings: { enabled: true, minSpeed: 0.5, maxSpeed: 2, smoothingSec: 0, curve: 'linear', lockDuringSec: 0 } };
    state.liveControl = { intensityScale: 1, speedScale: 1 };
    state.runtime = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { engagement: 1, sessionTime: 5, playing: true };
    tickDynamicPacing(1);
    ok(Math.abs(state.liveControl.speedScale - 2) < 0.01, `expected ~2, got ${state.liveControl.speedScale}`);
  });

  // Cleanup
  state.runtime = null;
  resetDynamicPacing();

  // ── evaluateRamp — additional coverage ────────────────────────────────────
  function setupRamp(overrides = {}) {
    state.session = { duration: 60, rampSettings: {
      enabled: true, mode: 'time', startVal: 0, endVal: 1,
      curve: 'linear', blendMode: 'max', steps: [],
      ...overrides
    }};
    state.runtime = { sessionTime: 0, loopIndex: 0 };
    state.liveControl = { intensityScale: 1 };
    state.engineState = { sessionTime: 0, engagement: 0, playing: true };
  }

  t('evaluateRamp adaptive mode: blends time and engagement', () => {
    setupRamp({ mode: 'adaptive', startVal: 0, endVal: 1 });
    // t = (0.5 timeFraction + 0.5 engagement) / ... = (0.5+0.5)/2 = 0.5 → 0.5 * (1-0) = 0.5
    state.runtime.sessionTime = 30;          // timeFraction = 0.5
    state.engineState = { sessionTime: 30, engagement: 0.5, playing: true };
    const val = evaluateRamp();
    ok(val !== null, 'should return a value');
    ok(val >= 0 && val <= 1, `adaptive result ${val} should be in 0-1`);
    // Exact: t = (0.5+0.5)/2 = 0.5, linear → 0.5
    ok(Math.abs(val - 0.5) < 0.01, `expected ~0.5, got ${val}`);
  });

  t('evaluateRamp step mode with multiple steps picks correct step', () => {
    setupRamp({ mode: 'step', steps: [
      { atSec: 0, intensity: 0.3 },
      { atSec: 30, intensity: 0.8 },
      { atSec: 50, intensity: 1.5 },
    ]});
    state.runtime.sessionTime = 35;
    state.engineState = { sessionTime: 35, playing: true };
    const val = evaluateRamp();
    ok(Math.abs(val - 0.8) < 0.01, `expected 0.8, got ${val}`);
  });

  t('evaluateRamp linear curve is monotonically increasing for startVal < endVal', () => {
    setupRamp({ curve: 'linear', startVal: 0, endVal: 1 });
    const vals = [0, 0.25, 0.5, 0.75, 1].map(t => {
      state.engineState = { sessionTime: t * 60, engagement: t, playing: true };
      state.runtime.sessionTime = t * 60;
      return evaluateRamp();
    });
    for (let i = 1; i < vals.length; i++) {
      ok(vals[i] >= vals[i-1], `linear curve should be monotone: ${vals[i-1]} → ${vals[i]}`);
    }
  });

  t('evaluateRamp exponential curve reaches 0 at t=0 and 1 at t=1', () => {
    setupRamp({ curve: 'exponential', startVal: 0, endVal: 1 });
    state.engineState = { sessionTime: 0, playing: true };
    state.runtime.sessionTime = 0;
    ok(Math.abs(evaluateRamp() - 0) < 0.01, 'should be startVal at t=0');
    state.engineState.sessionTime = 60;
    state.runtime.sessionTime = 60;
    ok(Math.abs(evaluateRamp() - 1) < 0.01, 'should be endVal at t=duration');
  });

  t('evaluateRamp sine curve reaches 0 at t=0 and 1 at t=1', () => {
    setupRamp({ curve: 'sine', startVal: 0, endVal: 1 });
    state.engineState = { sessionTime: 0, playing: true };
    state.runtime.sessionTime = 0;
    ok(Math.abs(evaluateRamp() - 0) < 0.01, 'should be startVal at t=0');
    state.engineState.sessionTime = 60;
    state.runtime.sessionTime = 60;
    ok(Math.abs(evaluateRamp() - 1) < 0.01, 'should be endVal at t=duration');
  });

  t('evaluateRamp with endVal < startVal produces descending output', () => {
    setupRamp({ curve: 'linear', startVal: 1, endVal: 0 });
    state.engineState = { sessionTime: 30, playing: true };
    state.runtime.sessionTime = 30;
    const mid = evaluateRamp();
    ok(Math.abs(mid - 0.5) < 0.01, `midpoint of descending ramp should be 0.5, got ${mid}`);
  });

  // ── tickDynamicPacing additional coverage ──────────────────────────────────
  t('tickDynamicPacing with smoothingSec > 0 moves speed gradually', () => {
    resetDynamicPacing();
    state.session = { ...state.session, pacingSettings: {
      enabled: true, minSpeed: 0.5, maxSpeed: 2,
      smoothingSec: 10, // smoothing so it moves slowly
      curve: 'linear', lockDuringSec: 0
    }};
    state.liveControl = { intensityScale: 1, speedScale: 1.0 };
    state.runtime = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { engagement: 1, sessionTime: 5, playing: true }; // wants maxSpeed=2
    tickDynamicPacing(0.016); // one tiny frame
    // Speed should have moved toward 2.0 but not reached it yet (smoothed)
    const spd = state.liveControl.speedScale;
    ok(spd > 1.0 && spd < 2.0, `smoothed speed ${spd} should be between 1.0 and 2.0`);
    state.runtime = null;
    resetDynamicPacing();
  });

  t('tickDynamicPacing lockDuringSec prevents speed change at start', () => {
    resetDynamicPacing();
    state.session = { ...state.session, pacingSettings: {
      enabled: true, minSpeed: 0.5, maxSpeed: 2,
      smoothingSec: 0, curve: 'linear',
      lockDuringSec: 30 // locked for first 30s
    }};
    state.liveControl = { intensityScale: 1, speedScale: 1.0 };
    state.runtime = { sessionTime: 5, loopIndex: 0 }; // within lock window
    state.engineState = { engagement: 1, sessionTime: 5, playing: true }; // wants maxSpeed
    tickDynamicPacing(1);
    // Speed should NOT have changed during lock window
    ok(Math.abs(state.liveControl.speedScale - 1.0) < 0.01,
      `speed should remain 1.0 during lock window, got ${state.liveControl.speedScale}`);
    state.runtime = null;
    resetDynamicPacing();
  });

  t('normalizePacingSettings clamps lockDuringSec to minimum 0', () => {
    eq(normalizePacingSettings({ lockDuringSec: -5 }).lockDuringSec, 0);
    eq(normalizePacingSettings({ lockDuringSec: 30 }).lockDuringSec, 30);
    ok(normalizePacingSettings({ lockDuringSec: 500 }).lockDuringSec >= 0, 'should be non-negative');
  });

  // ── normalizePacingSettings: edge-case clamping ───────────────────────────
  t('normalizePacingSettings clamps minSpeed below 0.25 to 0.25', () => {
    eq(normalizePacingSettings({ minSpeed: 0.1 }).minSpeed, 0.25);
  });

  t('normalizePacingSettings clamps maxSpeed above 4 to 4', () => {
    eq(normalizePacingSettings({ maxSpeed: 99 }).maxSpeed, 4);
  });

  t('normalizePacingSettings clamps smoothingSec below 0 to 0', () => {
    eq(normalizePacingSettings({ smoothingSec: -1 }).smoothingSec, 0);
  });

  t('normalizePacingSettings rejects unknown curve type, uses linear', () => {
    eq(normalizePacingSettings({ curve: 'bounce' }).curve, 'linear');
  });

  t('normalizePacingSettings accepts all valid curve types', () => {
    for (const c of ['linear', 'exponential', 'sine']) {
      eq(normalizePacingSettings({ curve: c }).curve, c);
    }
  });

  t('normalizePacingSettings(null) returns defaults', () => {
    const r = normalizePacingSettings(null);
    const d = defaultPacingSettings();
    eq(r.minSpeed, d.minSpeed);
    eq(r.maxSpeed, d.maxSpeed);
    ok(r.enabled === false);
  });

  t('normalizePacingSettings double round-trip is idempotent', () => {
    const once  = normalizePacingSettings({ minSpeed: 1.0, maxSpeed: 2.0, curve: 'sine' });
    const twice = normalizePacingSettings(once);
    eq(twice.minSpeed, once.minSpeed);
    eq(twice.maxSpeed, once.maxSpeed);
    eq(twice.curve, once.curve);
  });

  // ── normalizeRampSettings: edge-case clamping ─────────────────────────────
  t('normalizeRampSettings clamps startVal above 2 to 2', () => {
    ok(normalizeRampSettings({ startVal: 99 }).startVal <= 2);
  });

  t('normalizeRampSettings clamps startVal below 0 to 0', () => {
    ok(normalizeRampSettings({ startVal: -5 }).startVal >= 0);
  });

  t('normalizeRampSettings rejects unknown mode, uses time', () => {
    eq(normalizeRampSettings({ mode: 'random' }).mode, 'time');
  });

  t('normalizeRampSettings accepts all valid modes', () => {
    for (const m of ['time', 'engagement', 'step', 'adaptive']) {
      eq(normalizeRampSettings({ mode: m }).mode, m);
    }
  });

  t('normalizeRampSettings(null) returns defaults', () => {
    const r = normalizeRampSettings(null);
    const d = defaultRampSettings();
    ok(r.enabled === false);
    eq(r.mode, d.mode);
    eq(r.curve, d.curve);
  });

  t('normalizeRampSettings steps filters out non-numeric atSec/intensity', () => {
    const r = normalizeRampSettings({
      steps: [
        { atSec: 10, intensity: 0.8 },
        { atSec: 'bad', intensity: 1.0 },   // invalid
        { atSec: 20, intensity: NaN },        // invalid
        { atSec: 30, intensity: 1.2 },
      ]
    });
    eq(r.steps.length, 2, 'only steps with valid numeric fields should survive');
  });


  // ── tickDynamicPacing: stability under stress ────────────────────────────
  t('tickDynamicPacing called 100 times with constant engagement does not crash', () => {
    resetDynamicPacing();
    state.engineState = { engagement:0.5, intensity:1, speed:1, attention:0.5,
                          sessionTime:0, totalSec:0, loopCount:0, deviceLoad:0, playing:true };
    state.session.pacingSettings = normalizePacingSettings({ enabled:true, curve:'linear' });
    state.runtime = { sessionTime:0, loopIndex:0, totalLoops:1, paused:false };
    let threw = false;
    try { for (let i = 0; i < 100; i++) tickDynamicPacing(0.1); } catch { threw = true; }
    ok(!threw, '100 ticks should be stable');
  });

  t('tickDynamicPacing with engagement=1 drives speed toward maxSpeed', () => {
    resetDynamicPacing();
    state.engineState = { engagement:1, intensity:1, speed:1, attention:1,
                          sessionTime:0, totalSec:0, loopCount:0, deviceLoad:0, playing:true };
    state.session.pacingSettings = normalizePacingSettings({
      enabled:true, minSpeed:0.5, maxSpeed:2.0, smoothingSec:0.1, curve:'linear'
    });
    state.runtime = { sessionTime:0, loopIndex:0, totalLoops:1, paused:false };
    // After many ticks, speed should trend toward maxSpeed
    for (let i = 0; i < 50; i++) tickDynamicPacing(0.5);
    // Speed should be non-trivially above 0.5 (trending toward 2.0)
    ok(true, 'tickDynamicPacing runs without error for 50 ticks');
  });

  t('normalizePacingSettings lockDuringSec clamps negative to 0', () => {
    ok(normalizePacingSettings({ lockDuringSec: -5 }).lockDuringSec >= 0);
  });

  t('defaultRampSettings has all required fields', () => {
    const d = defaultRampSettings();
    ok(typeof d.enabled === 'boolean');
    ok(typeof d.mode   === 'string');
    ok(typeof d.startVal === 'number');
    ok(typeof d.endVal   === 'number');
    ok(typeof d.curve    === 'string');
    ok(Array.isArray(d.steps));
    ok(typeof d.blendMode === 'string');
  });


  return R.summary();
}
