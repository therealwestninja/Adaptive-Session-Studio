// ── tests/session-modes.test.js ──────────────────────────────────────────────
// Tests for SESSION_MODES definitions and applySessionMode() in session-modes.js

import { makeRunner } from './harness.js';
import { SESSION_MODES, applySessionMode } from '../js/session-modes.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runSessionModesTests() {
  const R  = makeRunner('session-modes.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function reset() {
    state.session = normalizeSession(defaultSession());
    state.session.blocks = [];
    state.session.rules  = [];
  }

  // ── MODULE SHAPE ───────────────────────────────────────────────────────────
  t('SESSION_MODES is a non-empty array', () => {
    ok(Array.isArray(SESSION_MODES) && SESSION_MODES.length > 0);
  });

  t('each mode has required fields', () => {
    for (const m of SESSION_MODES) {
      ok(typeof m.id          === 'string' && m.id.length > 0,   `id missing on mode`);
      ok(typeof m.name        === 'string' && m.name.length > 0, `name missing on ${m.id}`);
      ok(typeof m.description === 'string',                       `description missing on ${m.id}`);
      ok(typeof m.icon        === 'string',                       `icon missing on ${m.id}`);
      ok(Array.isArray(m.rules),                                  `rules must be array on ${m.id}`);
    }
  });

  t('all four expected modes exist', () => {
    const ids = SESSION_MODES.map(m => m.id);
    ok(ids.includes('exposure'),    'exposure mode missing');
    ok(ids.includes('mindfulness'), 'mindfulness mode missing');
    ok(ids.includes('focus'),       'focus mode missing');
    ok(ids.includes('freerun'),     'freerun mode missing');
  });

  // ── applySessionMode — exposure ────────────────────────────────────────────
  t('applySessionMode exposure sets rampSettings', () => {
    reset();
    applySessionMode('exposure');
    ok(state.session.rampSettings !== null, 'rampSettings should be set');
    ok(state.session.rampSettings?.enabled === true, 'ramp should be enabled');
    eq(state.session.rampSettings?.mode, 'time');
  });

  t('applySessionMode exposure adds rules tagged with _modeSource metadata', () => {
    reset();
    applySessionMode('exposure');
    const modeRules = state.session.rules.filter(r => r._modeSource === 'exposure');
    ok(modeRules.length > 0, 'should have at least one rule with _modeSource:exposure');
    // Names still carry the legacy prefix for display readability
    ok(modeRules.every(r => r.name.startsWith('[Exposure]')), 'rule names should still carry prefix');
  });

  t('applySessionMode preserves custom rules', () => {
    reset();
    state.session.rules = [{
      id: 'custom', name: 'My custom rule', enabled: true,
      condition: { metric: 'sessionTime', op: '>', value: 60 },
      durationSec: 1, cooldownSec: 0,
      action: { type: 'nextScene', param: null }
    }];
    applySessionMode('exposure');
    const custom = state.session.rules.find(r => r.id === 'custom');
    ok(custom !== undefined, 'custom rule should be preserved');
    ok(!custom._modeSource, 'custom rule should not have _modeSource set');
  });

  t('applying exposure again replaces existing mode rules, not duplicates them', () => {
    reset();
    applySessionMode('exposure');
    const count1 = state.session.rules.filter(r => r._modeSource === 'exposure').length;
    applySessionMode('exposure');
    const count2 = state.session.rules.filter(r => r._modeSource === 'exposure').length;
    eq(count1, count2, 'applying same mode twice should not double-up rules');
  });

  t('renamed mode rule is still cleaned up on next mode switch', () => {
    reset();
    applySessionMode('exposure');
    // Simulate user renaming a mode rule — removes the [Exposure] prefix from name
    state.session.rules[0].name = 'My renamed rule';
    // Apply a different mode — the renamed rule should still be removed because
    // we now track by _modeSource, not name prefix
    applySessionMode('mindfulness');
    const hasRenamedRule = state.session.rules.some(r => r.name === 'My renamed rule');
    ok(!hasRenamedRule, 'renamed mode rule should be cleaned up via _modeSource, not name prefix');
  });

  // ── applySessionMode — mindfulness ─────────────────────────────────────────
  t('applySessionMode mindfulness sets engagement ramp mode', () => {
    reset();
    applySessionMode('mindfulness');
    eq(state.session.rampSettings?.mode, 'engagement');
  });

  t('applySessionMode mindfulness enables pacing', () => {
    reset();
    applySessionMode('mindfulness');
    ok(state.session.pacingSettings?.enabled === true, 'pacing should be enabled');
  });

  // ── applySessionMode — freerun ─────────────────────────────────────────────
  t('applySessionMode freerun sets rampSettings to null', () => {
    reset();
    applySessionMode('exposure');
    ok(state.session.rampSettings?.enabled === true, 'sanity: exposure should enable ramp');
    applySessionMode('freerun');
    ok(state.session.rampSettings === null, 'freerun should null rampSettings');
    ok(state.session.pacingSettings === null, 'freerun should null pacingSettings');
  });

  t('applySessionMode freerun removes mode-specific rules', () => {
    reset();
    applySessionMode('mindfulness');
    const before = state.session.rules.filter(r => r._modeSource === 'mindfulness').length;
    ok(before > 0);
    applySessionMode('freerun');
    // All mode-sourced rules should be gone regardless of name
    const after = state.session.rules.filter(r => r._modeSource).length;
    eq(after, 0, 'freerun should remove all mode-sourced rules');
  });

  // ── applySessionMode — unknown mode ────────────────────────────────────────
  t('applySessionMode returns undefined for unknown mode id', () => {
    reset();
    const result = applySessionMode('nonexistent_mode');
    // bare `return` with no notify in test env — result is undefined
    ok(result === undefined || result === null, `got ${result}`);
  });

  // ── Rule normalization ─────────────────────────────────────────────────────
  t('all mode rules normalize correctly', () => {
    for (const mode of SESSION_MODES) {
      for (const rule of mode.rules) {
        ok(typeof rule.name === 'string',                          `${mode.id} rule name invalid`);
        ok(typeof rule.condition?.metric === 'string',             `${mode.id} rule condition.metric missing`);
        ok(typeof rule.condition?.op === 'string',                 `${mode.id} rule condition.op missing`);
        ok(typeof rule.condition?.value === 'number',              `${mode.id} rule condition.value missing`);
        ok(typeof rule.action?.type === 'string',                  `${mode.id} rule action.type missing`);
      }
    }
  });

  // ── Mode switching ─────────────────────────────────────────────────────────
  t('switching from exposure to mindfulness removes exposure rules', () => {
    reset();
    applySessionMode('exposure');
    const expRulesBefore = state.session.rules.filter(r => r._modeSource === 'exposure').length;
    ok(expRulesBefore > 0, 'sanity: exposure added rules');
    applySessionMode('mindfulness');
    const expRulesAfter = state.session.rules.filter(r => r._modeSource === 'exposure').length;
    ok(expRulesAfter === 0, 'switching modes should remove old mode rules');
  });

  t('switching modes does not duplicate rules', () => {
    reset();
    applySessionMode('exposure');
    applySessionMode('exposure'); // apply same mode twice
    const exposureRules = state.session.rules.filter(r => r._modeSource === 'exposure');
    const expected = SESSION_MODES.find(m => m.id === 'exposure')?.rules.length ?? 0;
    ok(exposureRules.length === expected, `expected ${expected} rules, got ${exposureRules.length}`);
  });

  t('all modes add at least 1 rule except freerun', () => {
    for (const mode of SESSION_MODES) {
      if (mode.id === 'freerun') continue;
      reset();
      applySessionMode(mode.id);
      const modeRules = state.session.rules.filter(r => r._modeSource === mode.id);
      ok(modeRules.length >= 1, `${mode.id} should add at least 1 rule`);
    }
  });

  t('each mode has a distinct id', () => {
    const ids = SESSION_MODES.map(m => m.id);
    const unique = new Set(ids);
    ok(unique.size === ids.length, 'mode ids must be unique');
  });

  t('each mode has a non-empty name and description', () => {
    for (const m of SESSION_MODES) {
      ok(typeof m.name === 'string' && m.name.length > 0,        `${m.id}: missing name`);
      ok(typeof m.description === 'string' && m.description.length > 0, `${m.id}: missing description`);
    }
  });

  t('applySessionMode preserves custom rule count across mode switch', () => {
    reset();
    // Add a custom rule (no _modeSource)
    state.session.rules = [
      { id: 'custom-1', name: 'My rule', enabled: true,
        condition: { metric: 'attention', op: '<', value: 0.3 },
        durationSec: 5, cooldownSec: 30, action: { type: 'pause', param: null } }
    ];
    applySessionMode('exposure');
    const customRules = state.session.rules.filter(r => !r._modeSource);
    ok(customRules.length === 1, 'custom rule must survive mode application');
  });

  // ── New purpose-built modes ────────────────────────────────────────────────
  t('induction mode exists in SESSION_MODES', () => {
    ok(SESSION_MODES.some(m => m.id === 'induction'));
  });

  t('conditioning mode exists in SESSION_MODES', () => {
    ok(SESSION_MODES.some(m => m.id === 'conditioning'));
  });

  t('training mode exists in SESSION_MODES', () => {
    ok(SESSION_MODES.some(m => m.id === 'training'));
  });

  t('surrender mode exists in SESSION_MODES', () => {
    ok(SESSION_MODES.some(m => m.id === 'surrender'));
  });

  t('induction mode sets very slow pacing (maxSpeed ≤ 0.7)', () => {
    const mode = SESSION_MODES.find(m => m.id === 'induction');
    ok(mode?.pacingSettings?.maxSpeed <= 0.7, `expected maxSpeed ≤ 0.7, got ${mode?.pacingSettings?.maxSpeed}`);
  });

  t('induction mode has no pause rules — redirects gently instead', () => {
    const mode = SESSION_MODES.find(m => m.id === 'induction');
    ok(!(mode?.rules ?? []).some(r => r.action?.type === 'pause'),
      'induction should not abruptly pause — it redirects via speed/intensity');
  });

  t('conditioning mode has 3 rules covering reward and correction', () => {
    const mode = SESSION_MODES.find(m => m.id === 'conditioning');
    ok((mode?.rules ?? []).length >= 3, 'conditioning should have at least 3 rules');
  });

  t('surrender mode has zero rules (full manual/device control)', () => {
    const mode = SESSION_MODES.find(m => m.id === 'surrender');
    eq((mode?.rules ?? []).length, 0, 'surrender mode should have no automatic rules');
  });

  t('training mode has exactly one safety rule', () => {
    const mode = SESSION_MODES.find(m => m.id === 'training');
    eq((mode?.rules ?? []).length, 1, 'training mode should have one safety rule');
    eq(mode.rules[0].action.type, 'pause', 'that rule should be a safety pause');
  });

  t('applySessionMode induction sets slow ramp (endVal ≤ 0.8)', () => {
    reset();
    applySessionMode('induction');
    ok(state.session.rampSettings?.endVal <= 0.8, `endVal should be ≤ 0.8, got ${state.session.rampSettings?.endVal}`);
  });

  t('applySessionMode conditioning adds at least one setIntensity reward rule', () => {
    reset();
    applySessionMode('conditioning');
    const hasReward = state.session.rules.some(r =>
      r.action?.type === 'setIntensity' && (r.action?.param ?? 0) > 1.0
    );
    ok(hasReward, 'conditioning should have an intensity reward rule above 1.0');
  });

  t('applySessionMode surrender enables ramp to 2.0', () => {
    reset();
    applySessionMode('surrender');
    ok(state.session.rampSettings?.enabled === true);
    ok(state.session.rampSettings?.endVal >= 1.8, `surrender endVal should be ≥ 1.8, got ${state.session.rampSettings?.endVal}`);
  });

  t('applySessionMode training disables pacing (manual operator control)', () => {
    reset();
    applySessionMode('training');
    ok(state.session.pacingSettings?.enabled === false, 'training mode should leave pacing disabled');
  });

  // ── session.mode tracking ─────────────────────────────────────────────────
  t('applySessionMode writes session.mode = mode id', () => {
    reset();
    applySessionMode('induction');
    eq(state.session.mode, 'induction', 'session.mode should track the active mode');
  });

  t('applySessionMode updates session.mode on mode switch', () => {
    reset();
    applySessionMode('mindfulness');
    eq(state.session.mode, 'mindfulness');
    applySessionMode('surrender');
    eq(state.session.mode, 'surrender');
  });

  t('session.mode is preserved across rule switches', () => {
    reset();
    applySessionMode('conditioning');
    eq(state.session.mode, 'conditioning');
    // Mode rules exist
    const modeRules = state.session.rules.filter(r => r._modeSource === 'conditioning');
    ok(modeRules.length > 0, 'conditioning rules should be present');
    // Mode id is still set
    eq(state.session.mode, 'conditioning');
  });

  // ── All 8 modes apply without error ─────────────────────────────────────
  t('all 8 modes can be applied in sequence without error', () => {
    for (const mode of SESSION_MODES) {
      reset();
      let threw = false;
      try { applySessionMode(mode.id); } catch { threw = true; }
      ok(!threw, `applySessionMode("${mode.id}") should not throw`);
      eq(state.session.mode, mode.id, `session.mode should be "${mode.id}"`);
    }
  });

  t('freerun mode sets rampSettings to null and pacingSettings to null', () => {
    reset();
    // First apply a mode that sets these
    applySessionMode('exposure');
    ok(state.session.rampSettings !== null, 'sanity: exposure sets rampSettings');
    // Then switch to freerun
    applySessionMode('freerun');
    ok(state.session.rampSettings === null, 'freerun should clear rampSettings');
    ok(state.session.pacingSettings === null, 'freerun should clear pacingSettings');
  });

  t('induction mode keeps zero pause rules (uses speed redirect instead)', () => {
    reset();
    applySessionMode('induction');
    const pauseRules = state.session.rules.filter(
      r => r._modeSource === 'induction' && r.action?.type === 'pause'
    );
    eq(pauseRules.length, 0, 'induction should have no pause rules');
  });

  t('surrender mode ends with zero mode rules', () => {
    reset();
    applySessionMode('surrender');
    const modeRules = state.session.rules.filter(r => r._modeSource === 'surrender');
    eq(modeRules.length, 0, 'surrender should have no rules');
  });


  // ── Mode data integrity ───────────────────────────────────────────────────
  t('all 8 modes have unique IDs', () => {
    const ids = SESSION_MODES.map(m => m.id);
    eq(new Set(ids).size, 8, 'all mode IDs should be unique');
  });

  t('every mode has required fields: id, name, icon, description', () => {
    for (const m of SESSION_MODES) {
      ok(typeof m.id          === 'string' && m.id.length > 0,          `${m.id}: bad id`);
      ok(typeof m.name        === 'string' && m.name.length > 0,        `${m.id}: bad name`);
      ok(typeof m.icon        === 'string' && m.icon.length > 0,        `${m.id}: bad icon`);
      ok(typeof m.description === 'string' && m.description.length > 0, `${m.id}: bad description`);
    }
  });

  t('every mode has rampSettings and pacingSettings (can be null)', () => {
    for (const m of SESSION_MODES) {
      ok('rampSettings'   in m, `${m.id}: missing rampSettings`);
      ok('pacingSettings' in m, `${m.id}: missing pacingSettings`);
    }
  });

  t('every mode rule has required action fields', () => {
    const VALID_ACTIONS = new Set(['pause','resume','stop','injectMacro',
      'setIntensity','setSpeed','nextScene','gotoScene','setVar']);
    for (const m of SESSION_MODES) {
      for (const r of (m.rules ?? [])) {
        ok(typeof r.name === 'string', `${m.id} rule: missing name`);
        ok(typeof r.condition === 'object', `${m.id} rule "${r.name}": missing condition`);
        ok(VALID_ACTIONS.has(r.action?.type), `${m.id} rule "${r.name}": unknown action "${r.action?.type}"`);
        ok(typeof r.durationSec === 'number' && r.durationSec >= 0, `${m.id} rule "${r.name}": bad durationSec`);
        ok(typeof r.cooldownSec === 'number' && r.cooldownSec >= 0, `${m.id} rule "${r.name}": bad cooldownSec`);
      }
    }
  });

  t('applySessionMode returns the mode object', () => {
    reset();
    const mode = applySessionMode('exposure');
    ok(mode !== null && mode !== undefined);
    ok(typeof mode === 'object');
    eq(mode.id, 'exposure');
  });

  t('applySessionMode with unknown id returns null without crashing', () => {
    reset();
    let threw = false, result = 'sentinel';
    try { result = applySessionMode('not-a-real-mode'); } catch { threw = true; }
    ok(!threw, 'unknown mode id should not throw');
    ok(result === null || result === undefined, 'should return null for unknown mode');
  });


  return R.summary();
}
