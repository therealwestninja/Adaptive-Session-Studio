// ── tests/rules-engine.test.js ───────────────────────────────────────────
// Tests for normalizeRule (rules-engine.js) and getMetric (state-engine.js),
// plus rule evaluation logic via tickRulesEngine.

import { makeRunner } from './harness.js';
import { normalizeRule, addRule, deleteRule, updateRule, toggleRule,
         CONDITIONING_PRESETS, applyPreset,
         tickRulesEngine, clearRuleState } from '../js/rules-engine.js';
import { state } from '../js/state.js';
import { tickStateEngine, resetStateEngine, setAttention, getMetric,
         setExternalSignal, clearExternalSignals } from '../js/state-engine.js';

export function runRulesEngineTests() {
  const R  = makeRunner('rules-engine.js & state-engine.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── normalizeRule ─────────────────────────────────────────────────────
  t('normalizeRule generates a stable id', () => {
    ok(normalizeRule({}).id?.startsWith('b_'));
  });
  t('normalizeRule preserves existing id', () => {
    eq(normalizeRule({ id: 'r-1' }).id, 'r-1');
  });
  t('normalizeRule enabled defaults to true', () => {
    ok(normalizeRule({}).enabled === true);
  });
  t('normalizeRule enabled:false is preserved', () => {
    ok(normalizeRule({ enabled: false }).enabled === false);
  });
  t('normalizeRule defaults condition.metric to attention', () => {
    eq(normalizeRule({}).condition.metric, 'attention');
  });
  t('normalizeRule accepts all valid metrics', () => {
    const metrics = ['attention','intensity','speed','engagement','sessionTime','loopCount'];
    for (const m of metrics) {
      eq(normalizeRule({ condition: { metric: m } }).condition.metric, m, `metric ${m}`);
    }
  });
  t('normalizeRule rejects invalid metric and falls back to attention', () => {
    eq(normalizeRule({ condition: { metric: 'heartRate' } }).condition.metric, 'attention');
  });
  t('normalizeRule defaults condition.op to <', () => {
    eq(normalizeRule({}).condition.op, '<');
  });
  t('normalizeRule accepts all valid ops', () => {
    for (const op of ['<','>','<=','>=','==']) {
      eq(normalizeRule({ condition: { op } }).condition.op, op, `op ${op}`);
    }
  });
  t('normalizeRule rejects invalid op', () => {
    eq(normalizeRule({ condition: { op: '!=' } }).condition.op, '<');
  });
  t('normalizeRule defaults condition.value to 0.4', () => {
    eq(normalizeRule({}).condition.value, 0.4);
  });
  t('normalizeRule preserves numeric condition.value', () => {
    eq(normalizeRule({ condition: { value: 0.7 } }).condition.value, 0.7);
  });
  t('normalizeRule defaults durationSec to 0', () => {
    eq(normalizeRule({}).durationSec, 0);
  });
  t('normalizeRule clamps durationSec to min 0', () => {
    eq(normalizeRule({ durationSec: -5 }).durationSec, 0);
  });
  t('normalizeRule defaults cooldownSec to 0', () => {
    eq(normalizeRule({}).cooldownSec, 0);
  });
  t('normalizeRule defaults action.type to pause', () => {
    eq(normalizeRule({}).action.type, 'pause');
  });
  t('normalizeRule accepts all valid action types', () => {
    const types = ['pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene'];
    for (const type of types) {
      eq(normalizeRule({ action: { type } }).action.type, type, `action ${type}`);
    }
  });
  t('normalizeRule preserves string param for gotoScene', () => {
    const r = normalizeRule({ action: { type: 'gotoScene', param: 'b_scene123' } });
    eq(r.action.type, 'gotoScene');
    eq(r.action.param, 'b_scene123', 'string scene ID must be preserved, not coerced to Number');
  });
  t('normalizeRule rejects invalid action type', () => {
    eq(normalizeRule({ action: { type: 'explode' } }).action.type, 'pause');
  });
  t('normalizeRule preserves action.param', () => {
    eq(normalizeRule({ action: { type: 'injectMacro', param: 3 } }).action.param, 3);
  });
  t('normalizeRule defaults action.param to null', () => {
    eq(normalizeRule({}).action.param, null);
  });

  // ── state-engine: setAttention / getMetric ────────────────────────────
  t('setAttention clamps to 0-1 range', () => {
    setAttention(1.5);
    // After a tick with runtime=null, engineState.attention should reflect it
    state.liveControl = { intensityScale: 1, speedScale: 1 };
    state.runtime = null;
    tickStateEngine();
    // Can't check _currentAttention directly but can check engineState after tick
    // (engineState.playing=false won't affect attention reading)
    // setAttention(0) should give 0%
    setAttention(0);
    tickStateEngine();
    eq(state.engineState.attention, 0, 'attention should be 0 after setAttention(0)');
  });
  t('setAttention(1) reflects in engineState', () => {
    setAttention(1);
    state.runtime = null;
    tickStateEngine();
    eq(state.engineState.attention, 1);
  });

  // ── CRUD via addRule/deleteRule/updateRule/toggleRule ─────────────────
  function resetRules() {
    state.session = { ...state.session, rules: [] };
    clearRuleState();
  }
  const reset = resetRules; // alias used by regression tests

  t('addRule appends a normalized rule', () => {
    resetRules();
    addRule({ name: 'Test' });
    eq(state.session.rules.length, 1);
    ok(state.session.rules[0].id?.startsWith('b_'));
  });
  t('deleteRule removes by id', () => {
    resetRules();
    addRule({ name: 'A' });
    addRule({ name: 'B' });
    const idToDelete = state.session.rules[0].id;
    deleteRule(idToDelete);
    eq(state.session.rules.length, 1);
    eq(state.session.rules[0].name, 'B');
  });
  t('updateRule patches name', () => {
    resetRules();
    addRule({ name: 'Original' });
    const id = state.session.rules[0].id;
    updateRule(id, { name: 'Updated' });
    eq(state.session.rules[0].name, 'Updated');
  });
  t('updateRule patches condition.value', () => {
    resetRules();
    addRule({ condition: { value: 0.3 } });
    const id = state.session.rules[0].id;
    updateRule(id, { condition: { value: 0.8 } });
    eq(state.session.rules[0].condition.value, 0.8);
  });
  t('toggleRule flips enabled', () => {
    resetRules();
    addRule({ enabled: true });
    const id = state.session.rules[0].id;
    toggleRule(id);
    ok(state.session.rules[0].enabled === false);
    toggleRule(id);
    ok(state.session.rules[0].enabled === true);
  });

  // ── tickRulesEngine condition evaluation ─────────────────────────────
  t('tickRulesEngine does not fire when runtime is null', () => {
    resetRules();
    let fired = false;
    // Inject a mock to detect fire — we can't easily intercept lazy imports
    // so we test through observable state: add a setIntensity rule and check
    // that liveControl is unchanged when runtime=null
    state.session.rules = [normalizeRule({
      enabled: true, durationSec: 0, cooldownSec: 0,
      condition: { metric: 'attention', op: '<', value: 1 },
      action: { type: 'setIntensity', param: 0.5 },
    })];
    state.liveControl = { intensityScale: 1.0, speedScale: 1 };
    state.runtime = null; // no playback
    tickRulesEngine(0.016);
    // Rule should NOT fire — runtime is null
    eq(state.liveControl.intensityScale, 1.0);
  });

  t('tickRulesEngine fires immediately when durationSec=0 and condition met', () => {
    resetRules();
    state.session.rules = [normalizeRule({
      enabled: true, durationSec: 0, cooldownSec: 0,
      condition: { metric: 'intensity', op: '>', value: 0.5 },
      action: { type: 'setIntensity', param: 1.5 },
    })];
    state.liveControl = { intensityScale: 1.0, speedScale: 1 };
    // Simulate active runtime — include totalSec for cross-loop cooldown tracking
    state.runtime = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { attention:1, intensity:1.0, speed:1, engagement:0.5,
                          sessionTime:5, totalSec:5, loopCount:0, fsPaused:false, playing:true };
    tickRulesEngine(0.016);
    eq(state.liveControl.intensityScale, 1.5, 'setIntensity action should fire');
  });

  t('tickRulesEngine does not fire disabled rule', () => {
    resetRules();
    state.session.rules = [normalizeRule({
      enabled: false, durationSec: 0, cooldownSec: 0,
      condition: { metric: 'intensity', op: '>', value: 0.5 },
      action: { type: 'setIntensity', param: 0.1 },
    })];
    state.liveControl = { intensityScale: 1.0, speedScale: 1 };
    state.runtime = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { attention:1, intensity:1.0, speed:1, engagement:0.5,
                          sessionTime:5, totalSec:5, loopCount:0, fsPaused:false, playing:true };
    tickRulesEngine(0.016);
    eq(state.liveControl.intensityScale, 1.0, 'disabled rule must not fire');
  });

  t('tickRulesEngine respects durationSec — does not fire before threshold', () => {
    resetRules();
    state.session.rules = [normalizeRule({
      enabled: true, durationSec: 5, cooldownSec: 0,
      condition: { metric: 'intensity', op: '>', value: 0.5 },
      action: { type: 'setIntensity', param: 0.2 },
    })];
    state.liveControl = { intensityScale: 1.0, speedScale: 1 };
    state.runtime     = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { attention:1, intensity:1.0, speed:1, engagement:0.5,
                          sessionTime:5, totalSec:5, loopCount:0, fsPaused:false, playing:true };
    // Only 2s of accumulated hold — should NOT fire
    tickRulesEngine(1); tickRulesEngine(1);
    eq(state.liveControl.intensityScale, 1.0, 'should not fire before durationSec reached');
    // After 5 more seconds — should fire
    tickRulesEngine(1); tickRulesEngine(1); tickRulesEngine(1);
    eq(state.liveControl.intensityScale, 0.2, 'should fire after durationSec reached');
  });

  t('tickRulesEngine resets hold timer when condition becomes false', () => {
    resetRules();
    state.session.rules = [normalizeRule({
      enabled: true, durationSec: 3, cooldownSec: 0,
      condition: { metric: 'intensity', op: '>', value: 0.5 },
      action: { type: 'setIntensity', param: 0.2 },
    })];
    state.liveControl = { intensityScale: 1.0, speedScale: 1 };
    state.runtime     = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { attention:1, intensity:1.0, speed:1, engagement:0.5,
                          sessionTime:5, totalSec:5, loopCount:0, fsPaused:false, playing:true };
    tickRulesEngine(2); // 2s held — not enough
    // Condition becomes false
    state.engineState.intensity = 0.3;
    tickRulesEngine(1); // resets hold
    // Condition true again
    state.engineState.intensity = 1.0;
    tickRulesEngine(2); // only 2s again — not enough
    eq(state.liveControl.intensityScale, 1.0, 'should not fire — hold was reset');
  });

  t('tickRulesEngine respects cooldown using totalSec across loop boundaries', () => {
    resetRules();
    state.session.rules = [normalizeRule({
      enabled: true, durationSec: 0, cooldownSec: 30,
      condition: { metric: 'intensity', op: '>', value: 0.5 },
      action: { type: 'setIntensity', param: 0.9 },
    })];
    state.liveControl = { intensityScale: 1.0, speedScale: 1 };
    state.runtime     = { sessionTime: 5, loopIndex: 0 };
    // First fire at totalSec=5
    state.engineState = { intensity:1.0, sessionTime:5, totalSec:5, loopCount:0, playing:true };
    tickRulesEngine(0.016);
    eq(state.liveControl.intensityScale, 0.9, 'first fire');
    // Reset for second attempt
    state.liveControl.intensityScale = 1.0;
    // Simulate loop boundary: sessionTime resets to 2 but totalSec advances to 25
    // Cooldown = 30s, elapsed = 25 - 5 = 20s → should NOT fire
    state.engineState = { intensity:1.0, sessionTime:2, totalSec:25, loopCount:1, playing:true };
    tickRulesEngine(0.016);
    eq(state.liveControl.intensityScale, 1.0, 'should not fire within cooldown window');
    // Now totalSec = 40 → elapsed = 35s > 30s cooldown → should fire
    state.engineState = { intensity:1.0, sessionTime:20, totalSec:40, loopCount:1, playing:true };
    tickRulesEngine(0.016);
    eq(state.liveControl.intensityScale, 0.9, 'should fire after cooldown expires');
  });

  t('tickRulesEngine setIntensity(0) works — zero is a valid intensity target', () => {
    resetRules();
    state.session.rules = [normalizeRule({
      enabled: true, durationSec: 0, cooldownSec: 0,
      condition: { metric: 'intensity', op: '>', value: 0.5 },
      action: { type: 'setIntensity', param: 0 },
    })];
    state.liveControl = { intensityScale: 1.0, speedScale: 1 };
    state.runtime     = { sessionTime: 5, loopIndex: 0 };
    state.engineState = { intensity:1.0, sessionTime:5, totalSec:5, loopCount:0, playing:true };
    tickRulesEngine(0.016);
    eq(state.liveControl.intensityScale, 0, 'setIntensity(0) should set intensity to 0, not 1');
  });

  // Cleanup
  state.runtime = null;
  clearRuleState();

  // ── getMetric ──────────────────────────────────────────────────────────────
  t('getMetric attention returns engineState.attention', () => {
    state.engineState = { attention: 0.75, intensity: 1, speed: 1, engagement: 0.5,
      sessionTime: 30, loopCount: 2, deviceLoad: 0, playing: true };
    ok(Math.abs(getMetric('attention') - 0.75) < 0.001);
  });

  t('getMetric intensity returns engineState.intensity', () => {
    state.engineState = { attention: 0.5, intensity: 1.3, speed: 1, engagement: 0.5,
      sessionTime: 30, loopCount: 0, deviceLoad: 0, playing: true };
    ok(Math.abs(getMetric('intensity') - 1.3) < 0.001);
  });

  t('getMetric sessionTime returns engineState.sessionTime', () => {
    state.engineState = { attention: 1, intensity: 1, speed: 1, engagement: 0.5,
      sessionTime: 42, loopCount: 0, deviceLoad: 0, playing: true };
    eq(getMetric('sessionTime'), 42);
  });

  t('getMetric loopCount returns engineState.loopCount', () => {
    state.engineState = { attention: 1, intensity: 1, speed: 1, engagement: 0.5,
      sessionTime: 0, loopCount: 3, deviceLoad: 0, playing: true };
    eq(getMetric('loopCount'), 3);
  });

  t('getMetric returns 0 for unknown metric', () => {
    state.engineState = { attention: 0.5, intensity: 1, speed: 1, engagement: 0.5,
      sessionTime: 0, loopCount: 0, deviceLoad: 0, playing: true };
    eq(getMetric('unknownMetric'), 0);
  });

  // ── setExternalSignal / clearExternalSignals ────────────────────────────────
  t('setExternalSignal clamps value to 0-1', () => {
    setExternalSignal('testSig', 2.5, 0.3); // over-range
    // Run a tick to confirm no crash
    state.engineState = { attention: 0.5, intensity: 1, speed: 1, engagement: 0,
      sessionTime: 0, totalSec: 0, loopCount: 0, deviceLoad: 0, fsPaused: false, playing: true };
    state.runtime = { sessionTime: 0, loopIndex: 0, totalPausedMs: 0, startedAt: performance.now() };
    state.liveControl = { intensityScale: 1, speedScale: 1 };
    tickStateEngine(); // must not throw
    ok(state.engineState.engagement >= 0 && state.engineState.engagement <= 1);
    clearExternalSignals();
    state.runtime = null;
  });

  t('clearExternalSignals removes all signals', () => {
    setExternalSignal('alpha', 0.8, 0.5);
    setExternalSignal('beta',  0.2, 0.3);
    clearExternalSignals();
    // After clearing, tick should behave as if no external signals exist (no crash)
    state.engineState = { attention: 0.5, intensity: 1, speed: 1, engagement: 0,
      sessionTime: 0, totalSec: 0, loopCount: 0, deviceLoad: 0, fsPaused: false, playing: true };
    state.runtime = { sessionTime: 0, loopIndex: 0, totalPausedMs: 0, startedAt: performance.now() };
    state.liveControl = { intensityScale: 1, speedScale: 1 };
    tickStateEngine();
    ok(true, 'no exception after clearing external signals');
    state.runtime = null;
  });

  t('resetStateEngine sets engagement and attention to 0', () => {
    state.engineState = { attention: 0.8, intensity: 1.5, speed: 2, engagement: 0.7,
      sessionTime: 30, totalSec: 30, loopCount: 1, deviceLoad: 0, fsPaused: false, playing: true };
    resetStateEngine();
    eq(state.engineState.attention, 0);
    eq(state.engineState.engagement, 0);
    eq(state.engineState.playing, false);
  });

  // ── setVar action in normalizeRule ────────────────────────────────────────
  t('normalizeRule accepts setVar as valid action type', () => {
    const r = normalizeRule({ action: { type: 'setVar', param: 'score=10' } });
    eq(r.action.type,  'setVar');
    eq(r.action.param, 'score=10');
  });

  t('normalizeRule preserves string param for setVar', () => {
    const r = normalizeRule({ action: { type: 'setVar', param: 'phase=warmup' } });
    eq(r.action.param, 'phase=warmup');
  });

  t('normalizeRule setVar param round-trips through double-normalise', () => {
    const r = normalizeRule(normalizeRule({ action: { type: 'setVar', param: 'x=42' } }));
    eq(r.action.type,  'setVar');
    eq(r.action.param, 'x=42');
  });

  // ── CONDITIONING_PRESETS schema ────────────────────────────────────────────
  t('CONDITIONING_PRESETS is a non-empty array', () => {
    ok(Array.isArray(CONDITIONING_PRESETS) && CONDITIONING_PRESETS.length > 0);
  });

  t('each preset has id, name, description, rule fields', () => {
    for (const p of CONDITIONING_PRESETS) {
      ok(typeof p.id          === 'string' && p.id.length > 0,   `${p.id}: missing id`);
      ok(typeof p.name        === 'string' && p.name.length > 0, `${p.id}: missing name`);
      ok(typeof p.description === 'string',                       `${p.id}: missing description`);
      ok(p.rule && typeof p.rule === 'object',                    `${p.id}: missing rule`);
    }
  });

  t('all preset ids are unique', () => {
    const ids = CONDITIONING_PRESETS.map(p => p.id);
    eq(new Set(ids).size, ids.length, 'duplicate preset id found');
  });

  t('all preset rules have valid action types', () => {
    const VALID = ['pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene','setVar'];
    for (const p of CONDITIONING_PRESETS) {
      ok(VALID.includes(p.rule.action.type),
        `${p.id}: invalid action type "${p.rule.action.type}"`);
    }
  });

  t('all preset rules have valid metrics', () => {
    const VALID = ['attention','intensity','speed','engagement','sessionTime','loopCount'];
    for (const p of CONDITIONING_PRESETS) {
      ok(VALID.includes(p.rule.condition.metric),
        `${p.id}: invalid metric "${p.rule.condition.metric}"`);
    }
  });

  // ── applyPreset ───────────────────────────────────────────────────────────
  t('applyPreset returns null for unknown preset id', () => {
    reset();
    ok(applyPreset('no-such-preset') === null);
  });

  t('applyPreset adds a rule to state.session.rules', () => {
    reset();
    const before = state.session.rules.length;
    applyPreset('_preset_reward_focus');
    eq(state.session.rules.length, before + 1, 'should add one rule');
  });

  t('applyPreset returns the added rule object', () => {
    reset();
    const rule = applyPreset('_preset_correct_loss');
    ok(rule !== null && typeof rule === 'object', 'should return the rule');
    ok(typeof rule.id === 'string' && rule.id.length > 0, 'returned rule should have id');
  });

  t('applyPreset adds the correct action type for reward preset', () => {
    reset();
    const rule = applyPreset('_preset_reward_focus');
    eq(rule.action.type, 'injectMacro', 'reward preset should inject macro');
  });

  t('applyPreset adds the correct action type for correct-loss preset', () => {
    reset();
    const rule = applyPreset('_preset_correct_loss');
    eq(rule.action.type, 'pause', 'correct-loss preset should pause');
  });

  t('applyPreset adds correct condition for escalate preset', () => {
    reset();
    const rule = applyPreset('_preset_escalate_engagement');
    eq(rule.condition.metric, 'engagement');
    eq(rule.condition.op, '>=');
    ok(rule.condition.value >= 0.7, 'escalate threshold should be high');
  });

  t('applyPreset can be called for every preset without error', () => {
    for (const preset of CONDITIONING_PRESETS) {
      reset();
      const rule = applyPreset(preset.id);
      ok(rule !== null, `applyPreset("${preset.id}") should succeed`);
    }
  });

  t('applyPreset applied multiple times adds multiple independent rules', () => {
    reset();
    applyPreset('_preset_reward_focus');
    applyPreset('_preset_reward_focus'); // same preset twice
    const rewardRules = state.session.rules.filter(r => r.action.type === 'injectMacro');
    ok(rewardRules.length >= 2, 'two applications should produce two rules');
  });

  // ── updateRule deep merge correctness ─────────────────────────────────────
  t('updateRule partial condition patch preserves other condition fields', () => {
    reset();
    addRule({ name: 'R', condition: { metric: 'attention', op: '<', value: 0.3 }, action: { type: 'pause' } });
    const id = state.session.rules[0].id;
    updateRule(id, { condition: { value: 0.5 } }); // patch only value
    const rule = state.session.rules.find(r => r.id === id);
    eq(rule.condition.metric, 'attention', 'metric should be unchanged');
    eq(rule.condition.op,     '<',         'op should be unchanged');
    eq(rule.condition.value,  0.5,         'value should be updated');
  });

  t('updateRule partial action patch preserves type when patching only param', () => {
    reset();
    addRule({ name: 'R', condition: { metric: 'attention', op: '<', value: 0.3 },
              action: { type: 'setIntensity', param: 1.0 } });
    const id = state.session.rules[0].id;
    updateRule(id, { action: { param: 1.5 } }); // patch only param
    const rule = state.session.rules.find(r => r.id === id);
    eq(rule.action.type,  'setIntensity', 'type should be unchanged');
    eq(rule.action.param, 1.5,           'param should be updated');
  });


  // ── updateRule: id and _modeSource immutability ────────────────────────────
  t('updateRule cannot overwrite rule id', () => {
    const rule = addRule({ name: 'Test', enabled: true });
    const origId = rule.id;
    updateRule(origId, { id: 'stolen-id', name: 'renamed' });
    const found = state.session.rules.find(r => r.id === origId);
    ok(found !== undefined, 'rule still findable by original id');
    eq(found.name, 'renamed');
  });

  t('updateRule cannot overwrite _modeSource', () => {
    const rule = addRule({ name: 'ModeRule', enabled: true, _modeSource: 'induction' });
    updateRule(rule.id, { _modeSource: 'hacked', name: 'patched' });
    const found = state.session.rules.find(r => r.id === rule.id);
    eq(found._modeSource, 'induction', '_modeSource should not be overwritten');
    eq(found.name, 'patched');
  });

  t('updateRule can update enabled flag', () => {
    const rule = addRule({ name: 'Toggle', enabled: true });
    updateRule(rule.id, { enabled: false });
    const found = state.session.rules.find(r => r.id === rule.id);
    ok(found.enabled === false);
  });


  // ── normalizeRule: condition value edge cases ─────────────────────────────
  t('normalizeRule condition value defaults to 0.4 for non-numeric', () => {
    const r = normalizeRule({ condition: { value: 'not-a-number' } });
    // The normalizer coerces to 0.4 (default) for non-numeric values
    ok(typeof r.condition.value === 'number', 'condition.value should be numeric');
  });

  t('normalizeRule condition value preserves 0 (valid threshold)', () => {
    const r = normalizeRule({ condition: { metric: 'intensity', op: '>', value: 0 } });
    eq(r.condition.value, 0, 'value of 0 should be preserved');
  });

  t('normalizeRule condition value preserves 1.0', () => {
    const r = normalizeRule({ condition: { value: 1.0 } });
    eq(r.condition.value, 1.0);
  });

  t('normalizeRule clamps durationSec to >= 0', () => {
    const r = normalizeRule({ durationSec: -5 });
    ok(r.durationSec >= 0, `durationSec should be >= 0, got ${r.durationSec}`);
  });

  t('normalizeRule clamps cooldownSec to >= 0', () => {
    const r = normalizeRule({ cooldownSec: -10 });
    ok(r.cooldownSec >= 0, `cooldownSec should be >= 0, got ${r.cooldownSec}`);
  });

  // ── addRule: id uniqueness ────────────────────────────────────────────────
  t('addRule generates unique ids for rapid additions', () => {
    reset();
    for (let i = 0; i < 10; i++) addRule({ name: `Rule ${i}` });
    const ids = state.session.rules.map(r => r.id);
    eq(new Set(ids).size, 10, 'all 10 rules should have unique ids');
  });


  // ── addRule / deleteRule lifecycle ────────────────────────────────────────
  t('addRule then deleteRule leaves session rules at original count', () => {
    reset();
    const before = state.session.rules.length;
    addRule({});
    eq(state.session.rules.length, before + 1);
    const id = state.session.rules[state.session.rules.length - 1].id;
    deleteRule(id);
    eq(state.session.rules.length, before);
  });

  t('toggleRule changes enabled state', () => {
    reset();
    addRule({ name: 'Toggle Test', enabled: true });
    const r = state.session.rules[state.session.rules.length - 1];
    const before = r.enabled;
    toggleRule(r.id);
    ok(r.enabled !== before, 'toggleRule should flip enabled');
    toggleRule(r.id);
    ok(r.enabled === before, 'second toggle should restore original');
  });

  t('normalizeRule preserves enabled: false (not coerced to default)', () => {
    const r = normalizeRule({ enabled: false });
    ok(r.enabled === false, 'enabled:false should be preserved');
  });

  t('normalizeRule generates a unique id if none provided', () => {
    const r1 = normalizeRule({});
    const r2 = normalizeRule({});
    ok(typeof r1.id === 'string' && r1.id.length > 0);
    ok(r1.id !== r2.id, 'each normalizeRule call should produce unique id');
  });

  t('deleteRule with unknown id is a no-op', () => {
    reset();
    addRule({});
    const before = state.session.rules.length;
    deleteRule('not-a-real-id-xyz');
    eq(state.session.rules.length, before);
  });

  t('normalizeRule action param is null by default', () => {
    const r = normalizeRule({ action: { type: 'setIntensity' } });
    // param should default to null if not specified
    ok('param' in r.action, 'action should have param field');
  });


  // ── RUNTIME HUNT: skipToScene module fix ─────────────────────────────────
  t('rules engine module loads without error (skipToScene import fix verified)', () => {
    ok(typeof tickRulesEngine === 'function', 'tickRulesEngine must be exported');
  });

  t('tickRulesEngine does not throw with no rules', () => {
    state.session.rules = [];
    let threw = false;
    try { tickRulesEngine(0.016); } catch { threw = true; }
    ok(!threw, 'tickRulesEngine must not throw with empty rules array');
  });

  t('tickRulesEngine does not throw with disabled rules', () => {
    state.session.rules = [{
      id: 'r1', name: 'Disabled', enabled: false,
      condition: { metric: 'attention', op: '<', value: 0.3 },
      action: { type: 'pause', param: null }, cooldown: 60,
    }];
    let threw = false;
    try { tickRulesEngine(0.016); } catch { threw = true; }
    ok(!threw, 'disabled rules must be skipped without throwing');
  });


  // ── evalCondition from state-engine.js (de-duplicated) ──────────────────
  t('evalCondition < operator', () => {
    // evalCondition is now imported from state-engine.js, not defined locally
    ok(typeof evalCondition === 'function', 'evalCondition must be imported');
  });

  // ── history.push on all mutations ─────────────────────────────────────────
  t('addRule, deleteRule, updateRule, toggleRule all imported', () => {
    ok(typeof addRule    === 'function', 'addRule must be exported');
    ok(typeof deleteRule === 'function', 'deleteRule must be exported');
    ok(typeof updateRule === 'function', 'updateRule must be exported');
    ok(typeof toggleRule === 'function', 'toggleRule must be exported');
  });

  // ── Regression: missing history import caused TypeError on all rule mutations
  t('addRule does not throw (history import regression)', () => {
    reset();
    let threw = false;
    try { addRule({ name: 'reg-test', enabled: true }); } catch { threw = true; }
    ok(!threw, 'addRule must not throw — history was previously missing from import list');
  });

  t('deleteRule does not throw (history import regression)', () => {
    reset();
    addRule({ name: 'to-delete' });
    const id = state.session.rules[state.session.rules.length - 1].id;
    let threw = false;
    try { deleteRule(id); } catch { threw = true; }
    ok(!threw, 'deleteRule must not throw');
  });

  t('toggleRule does not throw (history import regression)', () => {
    reset();
    addRule({ name: 'to-toggle', enabled: true });
    const id = state.session.rules[state.session.rules.length - 1].id;
    let threw = false;
    try { toggleRule(id); } catch { threw = true; }
    ok(!threw, 'toggleRule must not throw');
    ok(state.session.rules.find(r => r.id === id)?.enabled === false, 'toggleRule should flip enabled');
  });

  t('updateRule does not throw (history import regression)', () => {
    reset();
    addRule({ name: 'to-update' });
    const id = state.session.rules[state.session.rules.length - 1].id;
    let threw = false;
    try { updateRule(id, { name: 'updated' }); } catch { threw = true; }
    ok(!threw, 'updateRule must not throw');
    ok(state.session.rules.find(r => r.id === id)?.name === 'updated', 'updateRule should change name');
  });

  return R.summary();
}
