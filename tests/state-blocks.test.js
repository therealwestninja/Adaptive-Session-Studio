// ── tests/state-blocks.test.js ────────────────────────────────────────────
// Tests for js/state-blocks.js — STATE_PROFILES, applyStateProfile,
// stateTypeLabel, suggestedColorForStateType, and normalizeScene stateType.

import { makeRunner } from './harness.js';
import {
  STATE_PROFILES, STATE_TYPES,
  applyStateProfile, stateTypeLabel, suggestedColorForStateType,
} from '../js/state-blocks.js';
import { normalizeScene } from '../js/state.js';
import { state } from '../js/state.js';

export function runStateBlocksTests() {
  const R  = makeRunner('state-blocks.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── STATE_PROFILES ────────────────────────────────────────────────────
  t('STATE_PROFILES exports all four state types', () => {
    ok(STATE_TYPES.length === 4);
    for (const type of ['calm', 'build', 'peak', 'recovery']) {
      ok(STATE_TYPES.includes(type), `missing type: ${type}`);
    }
  });

  t('each profile has label, icon, color, intensityScale, speedScale', () => {
    for (const [key, p] of Object.entries(STATE_PROFILES)) {
      ok(typeof p.label === 'string' && p.label.length > 0, `${key}: missing label`);
      ok(typeof p.icon  === 'string' && p.icon.length  > 0, `${key}: missing icon`);
      ok(typeof p.color === 'string' && p.color.startsWith('#'), `${key}: missing color`);
      ok(typeof p.intensityScale === 'number', `${key}: missing intensityScale`);
      ok(typeof p.speedScale     === 'number', `${key}: missing speedScale`);
    }
  });

  t('calm profile has lower intensity than build', () => {
    ok(STATE_PROFILES.calm.intensityScale < STATE_PROFILES.build.intensityScale);
  });

  t('build profile has lower intensity than peak', () => {
    ok(STATE_PROFILES.build.intensityScale < STATE_PROFILES.peak.intensityScale);
  });

  t('recovery profile has the lowest intensity', () => {
    const scales = STATE_TYPES.map(t => STATE_PROFILES[t].intensityScale);
    ok(STATE_PROFILES.recovery.intensityScale === Math.min(...scales));
  });

  t('peak profile has the highest intensity', () => {
    const scales = STATE_TYPES.map(t => STATE_PROFILES[t].intensityScale);
    ok(STATE_PROFILES.peak.intensityScale === Math.max(...scales));
  });

  t('all intensityScale values are in 0–2 range', () => {
    for (const [key, p] of Object.entries(STATE_PROFILES)) {
      ok(p.intensityScale >= 0 && p.intensityScale <= 2, `${key}: intensityScale out of range`);
    }
  });

  t('all speedScale values are positive', () => {
    for (const [key, p] of Object.entries(STATE_PROFILES)) {
      ok(p.speedScale > 0, `${key}: speedScale must be positive`);
    }
  });

  // ── stateTypeLabel ────────────────────────────────────────────────────
  t('stateTypeLabel returns icon + label for valid type', () => {
    eq(stateTypeLabel('calm'),     `${STATE_PROFILES.calm.icon} ${STATE_PROFILES.calm.label}`);
    eq(stateTypeLabel('peak'),     `${STATE_PROFILES.peak.icon} ${STATE_PROFILES.peak.label}`);
    eq(stateTypeLabel('recovery'), `${STATE_PROFILES.recovery.icon} ${STATE_PROFILES.recovery.label}`);
  });

  t('stateTypeLabel returns "None" for null', () => {
    eq(stateTypeLabel(null),        'None');
    eq(stateTypeLabel(undefined),   'None');
    eq(stateTypeLabel(''),          'None');
  });

  t('stateTypeLabel falls back to raw string for unknown type', () => {
    eq(stateTypeLabel('unknown-xyz'), 'unknown-xyz');
  });

  // ── suggestedColorForStateType ────────────────────────────────────────
  t('suggestedColorForStateType returns a hex color for each type', () => {
    for (const type of STATE_TYPES) {
      const color = suggestedColorForStateType(type);
      ok(typeof color === 'string' && color.startsWith('#'), `${type}: expected hex color`);
    }
  });

  t('suggestedColorForStateType returns default blue for unknown/null', () => {
    const def = suggestedColorForStateType(null);
    ok(typeof def === 'string' && def.startsWith('#'));
  });

  t('each state type has a distinct suggested color', () => {
    const colors = STATE_TYPES.map(t => suggestedColorForStateType(t));
    const unique = new Set(colors);
    ok(unique.size === STATE_TYPES.length, 'all state type colors should be distinct');
  });

  // ── normalizeScene stateType round-trip ───────────────────────────────
  t('normalizeScene preserves valid stateType', () => {
    for (const type of STATE_TYPES) {
      const sc = normalizeScene({ stateType: type });
      eq(sc.stateType, type, `stateType '${type}' should survive normalizeScene`);
    }
  });

  t('normalizeScene defaults stateType to null when absent', () => {
    eq(normalizeScene({}).stateType, null);
  });

  t('normalizeScene rejects invalid stateType and falls back to null', () => {
    eq(normalizeScene({ stateType: 'sprint' }).stateType, null);
    eq(normalizeScene({ stateType: 123      }).stateType, null);
    eq(normalizeScene({ stateType: ''       }).stateType, null);
  });

  t('normalizeScene preserves all other fields alongside stateType', () => {
    const sc = normalizeScene({ name: 'Build Phase', stateType: 'build', start: 60, end: 120 });
    eq(sc.name,      'Build Phase');
    eq(sc.stateType, 'build');
    eq(sc.start,     60);
    eq(sc.end,       120);
  });

  // ── applyStateProfile ─────────────────────────────────────────────────
  t('applyStateProfile is a no-op when scene has no stateType', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
    state.runtime     = {};
    applyStateProfile({ stateType: null, name: 'TestScene' });
    eq(state.liveControl.intensityScale, 1.0);
    eq(state.liveControl.speedScale,     1.0);
    state.runtime = null;
  });

  t('applyStateProfile is a no-op when runtime is null', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
    state.runtime     = null;
    applyStateProfile({ stateType: 'peak', name: 'TestScene' });
    eq(state.liveControl.intensityScale, 1.0, 'no change without active runtime');
    eq(state.liveControl.speedScale,     1.0);
  });

  t('applyStateProfile sets intensityScale and speedScale from profile', () => {
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
    state.runtime     = {};
    applyStateProfile({ stateType: 'calm', name: 'Calm Phase' });
    eq(state.liveControl.intensityScale, STATE_PROFILES.calm.intensityScale);
    eq(state.liveControl.speedScale,     STATE_PROFILES.calm.speedScale);
    state.runtime = null;
  });

  t('applyStateProfile clamps intensityScale to 0–2', () => {
    // If a profile ever had an out-of-range value, it should still be clamped
    state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
    state.runtime     = {};
    // Temporarily inject an over-range profile value
    const origScale = STATE_PROFILES.peak.intensityScale;
    STATE_PROFILES.peak.intensityScale = 3.0;
    applyStateProfile({ stateType: 'peak', name: 'Peak' });
    ok(state.liveControl.intensityScale <= 2, 'intensityScale must be clamped to 2');
    STATE_PROFILES.peak.intensityScale = origScale; // restore
    state.runtime = null;
  });

  t('applyStateProfile for each state type changes liveControl', () => {
    for (const type of STATE_TYPES) {
      state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
      state.runtime     = {};
      applyStateProfile({ stateType: type, name: `${type} scene` });
      const prof = STATE_PROFILES[type];
      eq(state.liveControl.intensityScale, Math.max(0, Math.min(2, prof.intensityScale)));
      eq(state.liveControl.speedScale,     Math.max(0.1, Math.min(4, prof.speedScale)));
      state.runtime = null;
    }
  });

  // ── Color + label round-trip used by scene editor ─────────────────────
  t('calm profile color is a blue shade', () => {
    const c = STATE_PROFILES.calm.color;
    // Should be a blue-ish hex — just verify it's distinct from default #5fa0dc
    ok(typeof c === 'string' && c !== '#5fa0dc', 'calm needs its own color');
  });

  t('suggestedColorForStateType output matches the profile color', () => {
    for (const type of STATE_TYPES) {
      eq(suggestedColorForStateType(type), STATE_PROFILES[type].color);
    }
  });

  t('stateTypeLabel format is "icon label" with a space', () => {
    for (const type of STATE_TYPES) {
      const label = stateTypeLabel(type);
      const parts = label.split(' ');
      ok(parts.length >= 2, `${type}: expected "icon label", got "${label}"`);
    }
  });

  // ── Profile ordering / relative values ────────────────────────────────────
  t('calm speed is slower than build speed', () => {
    ok(STATE_PROFILES.calm.speedScale < STATE_PROFILES.build.speedScale);
  });

  t('build speed is slower than peak speed', () => {
    ok(STATE_PROFILES.build.speedScale < STATE_PROFILES.peak.speedScale);
  });

  t('recovery speed is slower than build speed', () => {
    ok(STATE_PROFILES.recovery.speedScale < STATE_PROFILES.build.speedScale);
  });

  t('peak intensity is greater than 1.0 (amplifying)', () => {
    ok(STATE_PROFILES.peak.intensityScale > 1.0,
      `peak intensity ${STATE_PROFILES.peak.intensityScale} should exceed 1.0`);
  });

  t('recovery intensity is less than calm intensity', () => {
    ok(STATE_PROFILES.recovery.intensityScale <= STATE_PROFILES.calm.intensityScale,
      'recovery should be gentler than calm');
  });

  // ── applyStateProfile: each type produces distinct live-control state ──────
  t('each state type produces a different intensityScale', () => {
    const scales = STATE_TYPES.map(type => {
      state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
      state.runtime     = {};
      applyStateProfile({ stateType: type, name: type });
      return state.liveControl.intensityScale;
    });
    const unique = new Set(scales);
    ok(unique.size === STATE_TYPES.length,
      `expected ${STATE_TYPES.length} unique intensity scales, got ${unique.size}: ${scales}`);
    state.runtime = null;
  });

  t('applyStateProfile clamps intensityScale to valid range [0, 2]', () => {
    for (const type of STATE_TYPES) {
      state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
      state.runtime     = {};
      applyStateProfile({ stateType: type, name: type });
      ok(state.liveControl.intensityScale >= 0 && state.liveControl.intensityScale <= 2,
        `${type}: intensityScale ${state.liveControl.intensityScale} out of range`);
    }
    state.runtime = null;
  });

  t('applyStateProfile clamps speedScale to valid range [0.1, 4]', () => {
    for (const type of STATE_TYPES) {
      state.liveControl = { intensityScale: 1.0, speedScale: 1.0 };
      state.runtime     = {};
      applyStateProfile({ stateType: type, name: type });
      ok(state.liveControl.speedScale >= 0.1 && state.liveControl.speedScale <= 4,
        `${type}: speedScale ${state.liveControl.speedScale} out of range`);
    }
    state.runtime = null;
  });

  // ── stateTypeLabel returns correct format ──────────────────────────────────
  t('stateTypeLabel for calm includes the calm icon', () => {
    ok(stateTypeLabel('calm').includes('🌊'), 'calm label should include 🌊');
  });

  t('stateTypeLabel for peak includes the peak icon', () => {
    ok(stateTypeLabel('peak').includes('⚡'), 'peak label should include ⚡');
  });

  t('stateTypeLabel for build includes the build icon', () => {
    ok(stateTypeLabel('build').includes('📈'), 'build label should include 📈');
  });

  t('stateTypeLabel for recovery includes the recovery icon', () => {
    ok(stateTypeLabel('recovery').includes('🌱'), 'recovery label should include 🌱');
  });

  // ── suggestedColorForStateType matches profile colors ─────────────────────
  t('each state type has a distinct suggested color (no two the same)', () => {
    const colors = STATE_TYPES.map(t => suggestedColorForStateType(t));
    const unique = new Set(colors);
    ok(unique.size === STATE_TYPES.length,
      `expected ${STATE_TYPES.length} distinct colors, got ${unique.size}: ${colors}`);
  });

  t('suggestedColorForStateType for peak is a red/warm hex', () => {
    const color = suggestedColorForStateType('peak');
    // Peak should be a warm/red color — check it starts with # and is 7 chars
    ok(color.startsWith('#') && color.length === 7, `expected 7-char hex, got ${color}`);
    const r = parseInt(color.slice(1, 3), 16);
    const b = parseInt(color.slice(5, 7), 16);
    ok(r > b, `peak color ${color} should be red-dominant (r=${r} > b=${b})`);
  });


  // ── stateTypeLabel ────────────────────────────────────────────────────────
  t('stateTypeLabel returns "None" for null/undefined input', () => {
    eq(stateTypeLabel(null), 'None');
    eq(stateTypeLabel(undefined), 'None');
    eq(stateTypeLabel(''), 'None');
  });

  t('stateTypeLabel returns emoji+label for each valid state type', () => {
    for (const st of STATE_TYPES) {
      const label = stateTypeLabel(st);
      ok(label.length > 0 && label !== 'None', `${st}: got "${label}"`);
    }
  });

  t('stateTypeLabel returns the raw string for unknown types', () => {
    eq(stateTypeLabel('unknown_type'), 'unknown_type');
  });

  // ── suggestedColorForStateType ────────────────────────────────────────────
  t('suggestedColorForStateType returns a hex color for each valid type', () => {
    for (const st of STATE_TYPES) {
      const color = suggestedColorForStateType(st);
      ok(color.startsWith('#'), `${st}: expected hex color, got "${color}"`);
      eq(color.length, 7, `${st}: hex color should be 7 chars`);
    }
  });

  t('suggestedColorForStateType returns default blue for unknown type', () => {
    const color = suggestedColorForStateType('unknown');
    ok(color.startsWith('#'), 'should return a valid hex color');
  });

  // ── STATE_PROFILES shape ──────────────────────────────────────────────────
  t('STATE_PROFILES has exactly 4 entries (calm/build/peak/recovery)', () => {
    eq(STATE_TYPES.length, 4);
    ok(STATE_TYPES.includes('calm'));
    ok(STATE_TYPES.includes('build'));
    ok(STATE_TYPES.includes('peak'));
    ok(STATE_TYPES.includes('recovery'));
  });

  t('every STATE_PROFILE has icon, label, intensityScale, speedScale, color', () => {
    for (const [name, profile] of Object.entries(STATE_PROFILES)) {
      ok(typeof profile.icon  === 'string', `${name}: missing icon`);
      ok(typeof profile.label === 'string', `${name}: missing label`);
      ok(typeof profile.intensityScale === 'number', `${name}: missing intensityScale`);
      ok(typeof profile.speedScale === 'number', `${name}: missing speedScale`);
      ok(typeof profile.color === 'string', `${name}: missing color`);
    }
  });

  t('STATE_PROFILES intensityScale values are in [0, 2]', () => {
    for (const [name, p] of Object.entries(STATE_PROFILES)) {
      ok(p.intensityScale >= 0 && p.intensityScale <= 2,
        `${name}: intensityScale ${p.intensityScale} out of [0,2]`);
    }
  });

  t('STATE_PROFILES speedScale values are in [0.1, 4]', () => {
    for (const [name, p] of Object.entries(STATE_PROFILES)) {
      ok(p.speedScale >= 0.1 && p.speedScale <= 4,
        `${name}: speedScale ${p.speedScale} out of [0.1,4]`);
    }
  });


  return R.summary();
}
