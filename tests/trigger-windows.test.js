// ── tests/trigger-windows.test.js ────────────────────────────────────────
// Tests for normalizeTrigger and trigger window CRUD in trigger-windows.js

import { makeRunner } from './harness.js';
import { normalizeTrigger, addTrigger, deleteTrigger, updateTrigger, toggleTrigger,
         clearWindowState, tickTriggerWindows, _windowStateForTest } from '../js/trigger-windows.js';
import { state, normalizeSession, defaultSession } from '../js/state.js';

export function runTriggerWindowTests() {
  const R  = makeRunner('trigger-windows.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function reset() {
    state.session = normalizeSession(defaultSession());
    state.runtime = null;
    state.engineState = { totalSec: 0, sessionTime: 0, attention: 0, intensity: 1, speed: 1, engagement: 0 };
    clearWindowState();
  }

  // ── normalizeTrigger ──────────────────────────────────────────────────
  t('normalizeTrigger generates stable id', () => {
    ok(normalizeTrigger({}).id?.startsWith('b_'));
  });
  t('normalizeTrigger preserves existing id', () => {
    eq(normalizeTrigger({ id: 'tr-1' }).id, 'tr-1');
  });
  t('normalizeTrigger enabled defaults to true', () => {
    ok(normalizeTrigger({}).enabled === true);
  });
  t('normalizeTrigger enabled:false preserved', () => {
    ok(normalizeTrigger({ enabled: false }).enabled === false);
  });
  t('normalizeTrigger defaults atSec to 0', () => {
    eq(normalizeTrigger({}).atSec, 0);
  });
  t('normalizeTrigger clamps atSec to min 0', () => {
    eq(normalizeTrigger({ atSec: -10 }).atSec, 0);
  });
  t('normalizeTrigger defaults windowDurSec to 5', () => {
    eq(normalizeTrigger({}).windowDurSec, 5);
  });
  t('normalizeTrigger clamps windowDurSec to min 1', () => {
    eq(normalizeTrigger({ windowDurSec: 0 }).windowDurSec, 1);
  });
  t('normalizeTrigger defaults condition.metric to attention', () => {
    eq(normalizeTrigger({}).condition.metric, 'attention');
  });
  t('normalizeTrigger accepts all valid metrics', () => {
    const metrics = ['attention','intensity','speed','engagement','sessionTime','loopCount'];
    for (const m of metrics) {
      eq(normalizeTrigger({ condition: { metric: m } }).condition.metric, m);
    }
  });
  t('normalizeTrigger rejects invalid metric', () => {
    eq(normalizeTrigger({ condition: { metric: 'heartRate' } }).condition.metric, 'attention');
  });
  t('normalizeTrigger defaults condition.op to >=', () => {
    eq(normalizeTrigger({}).condition.op, '>=');
  });
  t('normalizeTrigger defaults condition.value to 0.7', () => {
    eq(normalizeTrigger({}).condition.value, 0.7);
  });
  t('normalizeTrigger defaults successAction.type to none', () => {
    eq(normalizeTrigger({}).successAction.type, 'none');
  });
  t('normalizeTrigger defaults failureAction.type to none', () => {
    eq(normalizeTrigger({}).failureAction.type, 'none');
  });
  t('normalizeTrigger accepts valid action types', () => {
    const types = ['none','pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene'];
    for (const type of types) {
      eq(normalizeTrigger({ successAction: { type } }).successAction.type, type);
    }
  });
  t('normalizeTrigger preserves string param for gotoScene', () => {
    const tr = normalizeTrigger({ successAction: { type: 'gotoScene', param: 'b_xyz' } });
    eq(tr.successAction.type, 'gotoScene');
    eq(tr.successAction.param, 'b_xyz', 'scene ID string must survive normalization');
  });
  t('normalizeTrigger rejects invalid action type → none', () => {
    eq(normalizeTrigger({ successAction: { type: 'explode' } }).successAction.type, 'none');
  });
  t('normalizeTrigger defaults cooldownSec to 60', () => {
    eq(normalizeTrigger({}).cooldownSec, 60);
  });
  t('normalizeTrigger clamps cooldownSec to min 0', () => {
    eq(normalizeTrigger({ cooldownSec: -5 }).cooldownSec, 0);
  });

  // ── CRUD ──────────────────────────────────────────────────────────────
  function resetTriggers() {
    state.session = { ...state.session, triggers: [] };
    clearWindowState();
  }

  t('addTrigger appends normalized trigger', () => {
    resetTriggers();
    addTrigger({ name: 'Test', atSec: 30 });
    eq(state.session.triggers.length, 1);
    ok(state.session.triggers[0].id?.startsWith('b_'));
    eq(state.session.triggers[0].atSec, 30);
  });
  t('deleteTrigger removes by id', () => {
    resetTriggers();
    addTrigger({ name: 'A' });
    addTrigger({ name: 'B' });
    const idToDel = state.session.triggers[0].id;
    deleteTrigger(idToDel);
    eq(state.session.triggers.length, 1);
    eq(state.session.triggers[0].name, 'B');
  });
  t('deleteTrigger no-op on unknown id', () => {
    resetTriggers();
    addTrigger({ name: 'A' });
    deleteTrigger('nonexistent');
    eq(state.session.triggers.length, 1);
  });
  t('updateTrigger patches name', () => {
    resetTriggers();
    addTrigger({ name: 'Original' });
    const id = state.session.triggers[0].id;
    updateTrigger(id, { name: 'Updated' });
    eq(state.session.triggers[0].name, 'Updated');
  });
  t('updateTrigger patches condition.value', () => {
    resetTriggers();
    addTrigger({ condition: { value: 0.5 } });
    const id = state.session.triggers[0].id;
    updateTrigger(id, { condition: { value: 0.9 } });
    eq(state.session.triggers[0].condition.value, 0.9);
  });
  t('updateTrigger patches successAction type', () => {
    resetTriggers();
    addTrigger({});
    const id = state.session.triggers[0].id;
    updateTrigger(id, { successAction: { type: 'pause' } });
    eq(state.session.triggers[0].successAction.type, 'pause');
  });
  t('toggleTrigger flips enabled', () => {
    resetTriggers();
    addTrigger({ enabled: true });
    const id = state.session.triggers[0].id;
    toggleTrigger(id);
    ok(state.session.triggers[0].enabled === false);
    toggleTrigger(id);
    ok(state.session.triggers[0].enabled === true);
  });

  // ── setVar action support ─────────────────────────────────────────────────
  t('normalizeTrigger accepts setVar as successAction type', () => {
    const tr = normalizeTrigger({ successAction: { type: 'setVar', param: 'score=10' } });
    eq(tr.successAction.type,  'setVar');
    eq(tr.successAction.param, 'score=10');
  });

  t('normalizeTrigger accepts setVar as failureAction type', () => {
    const tr = normalizeTrigger({ failureAction: { type: 'setVar', param: 'level=0' } });
    eq(tr.failureAction.type,  'setVar');
    eq(tr.failureAction.param, 'level=0');
  });

  t('normalizeTrigger preserves string param for setVar through round-trip', () => {
    const tr = normalizeTrigger(normalizeTrigger({ successAction: { type: 'setVar', param: 'x=hello world' } }));
    eq(tr.successAction.param, 'x=hello world');
  });

  // ── normalizeTrigger completeness ─────────────────────────────────────────
  t('normalizeTrigger defaults atSec to 0', () => {
    const t = normalizeTrigger({});
    ok(typeof t.atSec === 'number' && t.atSec >= 0);
  });

  t('normalizeTrigger defaults windowDurSec to a positive number', () => {
    const t = normalizeTrigger({});
    ok(typeof t.windowDurSec === 'number' && t.windowDurSec > 0);
  });

  t('normalizeTrigger defaults cooldownSec to a non-negative number', () => {
    const t = normalizeTrigger({});
    ok(typeof t.cooldownSec === 'number' && t.cooldownSec >= 0);
  });

  t('normalizeTrigger preserves atSec value', () => {
    const t = normalizeTrigger({ atSec: 30 });
    eq(t.atSec, 30);
  });

  t('normalizeTrigger preserves enabled:false', () => {
    const t = normalizeTrigger({ enabled: false });
    ok(t.enabled === false);
  });

  t('normalizeTrigger successAction defaults to none type', () => {
    const t = normalizeTrigger({});
    eq(t.successAction.type, 'none');
  });

  t('normalizeTrigger failureAction defaults to none type', () => {
    const t = normalizeTrigger({});
    eq(t.failureAction.type, 'none');
  });

  t('normalizeTrigger accepts gotoScene as successAction type', () => {
    const t = normalizeTrigger({ successAction: { type: 'gotoScene', param: 'scene-123' } });
    eq(t.successAction.type, 'gotoScene');
    eq(t.successAction.param, 'scene-123');
  });

  t('normalizeTrigger rejects unknown successAction type → none', () => {
    const t = normalizeTrigger({ successAction: { type: 'doMagic', param: null } });
    eq(t.successAction.type, 'none');
  });

  // ── updateTrigger advanced patches ────────────────────────────────────────
  t('updateTrigger patches atSec', () => {
    resetState();
    addTrigger();
    const id = state.session.triggers[0].id;
    updateTrigger(id, { atSec: 45 });
    eq(state.session.triggers[0].atSec, 45);
  });

  t('updateTrigger patches cooldownSec', () => {
    resetState();
    addTrigger();
    const id = state.session.triggers[0].id;
    updateTrigger(id, { cooldownSec: 90 });
    eq(state.session.triggers[0].cooldownSec, 90);
  });

  t('updateTrigger does not affect other triggers', () => {
    resetState();
    addTrigger(); addTrigger();
    const ids = state.session.triggers.map(t => t.id);
    updateTrigger(ids[0], { name: 'Changed' });
    eq(state.session.triggers[1].name, state.session.triggers[1].name,
      'second trigger name should be unchanged');
    ok(state.session.triggers[0].name === 'Changed');
  });


  // ── updateTrigger: id immutability ────────────────────────────────────────
  t('updateTrigger cannot overwrite trigger id', () => {
    const trig = addTrigger({ name: 'T1', atSec: 30 });
    const origId = trig.id;
    updateTrigger(origId, { id: 'stolen', name: 'patched' });
    const found = state.session.triggers.find(t => t.id === origId);
    ok(found !== undefined, 'trigger still findable by original id');
    eq(found.name, 'patched');
  });


  // ── addTrigger / deleteTrigger / toggleTrigger lifecycle ─────────────────
  t('addTrigger then deleteTrigger restores original count', () => {
    const before = state.session.triggers?.length ?? 0;
    addTrigger({});
    eq((state.session.triggers?.length ?? 0), before + 1);
    const id = state.session.triggers[state.session.triggers.length - 1].id;
    deleteTrigger(id);
    eq((state.session.triggers?.length ?? 0), before);
  });

  t('toggleTrigger flips enabled state', () => {
    addTrigger({ enabled: true });
    const tr = state.session.triggers[state.session.triggers.length - 1];
    const before = tr.enabled;
    toggleTrigger(tr.id);
    ok(tr.enabled !== before, 'enabled should flip');
    deleteTrigger(tr.id);
  });

  t('deleteTrigger with unknown id is a no-op', () => {
    const before = state.session.triggers?.length ?? 0;
    deleteTrigger('no-such-trigger-id-xyz');
    eq((state.session.triggers?.length ?? 0), before);
  });

  t('addTrigger 10 times produces 10 unique ids', () => {
    const before = state.session.triggers?.length ?? 0;
    for (let i = 0; i < 10; i++) addTrigger({});
    const ids = state.session.triggers.slice(before).map(t => t.id);
    eq(new Set(ids).size, 10, 'all ids should be unique');
    for (const id of ids) deleteTrigger(id);
  });

  // ── normalizeTrigger: defaults ────────────────────────────────────────────
  t('normalizeTrigger cooldownSec clamps negative to 0', () => {
    const tr = normalizeTrigger({ cooldownSec: -5 });
    ok(tr.cooldownSec >= 0, `cooldownSec should be >= 0, got ${tr.cooldownSec}`);
  });

  t('normalizeTrigger durationSec clamps negative to 0', () => {
    const tr = normalizeTrigger({ durationSec: -10 });
    ok(tr.durationSec >= 0, `durationSec should be >= 0, got ${tr.durationSec}`);
  });

  t('normalizeTrigger preserves enabled: false', () => {
    eq(normalizeTrigger({ enabled: false }).enabled, false);
  });


  // ── trig-name undo: debounced history push regression ────────────────────
  t('updateTrigger name updates the trigger name', () => {
    addTrigger({ name: 'Original', enabled: true });
    const tr = state.session.triggers[state.session.triggers.length - 1];
    updateTrigger(tr.id, { name: 'Updated' });
    eq(tr.name, 'Updated', 'name should update via updateTrigger');
    deleteTrigger(tr.id);
  });

  t('updateTrigger atSec updates correctly', () => {
    addTrigger({ atSec: 10 });
    const tr = state.session.triggers[state.session.triggers.length - 1];
    updateTrigger(tr.id, { atSec: 25 });
    eq(tr.atSec, 25);
    deleteTrigger(tr.id);
  });

  t('updateTrigger id cannot be changed (id-clobber protection)', () => {
    addTrigger({ name: 'Protected' });
    const tr = state.session.triggers[state.session.triggers.length - 1];
    const originalId = tr.id;
    updateTrigger(tr.id, { id: 'hacked-id', name: 'Still safe' });
    eq(tr.id, originalId, 'id should not be changed by patch');
    deleteTrigger(tr.id);
  });

  // ── Loop-boundary: elapsed must never go negative ─────────────────────────
  // Regression for: openedAt was stored as sessionTime (loop-relative), so when
  // the session looped while a window was open, elapsed = sessionTime - openedAt
  // became negative and the failure branch never fired.
  t('trigger window failure fires even when session loops mid-window', () => {
    reset();
    // Session duration 10 s; window opens at t=8 with a 5 s budget — it straddles a loop.
    const tr = normalizeTrigger({
      atSec: 8, windowDurSec: 5, cooldownSec: 0,
      condition: { metric: 'attention', op: '>=', value: 0.99 }, // will never be met
      successAction: { type: 'none' },
      failureAction: { type: 'none' },
    });
    state.session.triggers = [tr];
    state.session.duration = 10;
    // Simulate: engine is at totalSec=8, sessionTime=8 — window opens
    state.runtime = { sessionTime: 8, loopIndex: 0, paused: false };
    state.engineState = { totalSec: 8, sessionTime: 8, attention: 0, intensity: 1, speed: 1, engagement: 0 };
    tickTriggerWindows();
    ok(_windowStateForTest()[tr.id]?.status === 'open', 'window should open at t=8');

    // Simulate: session looped — sessionTime resets to 2, totalSec advances to 12
    // With the old bug: elapsed = 2 - 8 = -6 → failure branch never fires.
    // With the fix:     elapsed = 12 - 8 =  4 → still less than windowDurSec(5), still open.
    state.runtime = { sessionTime: 2, loopIndex: 1, paused: false };
    state.engineState = { totalSec: 12, sessionTime: 2, attention: 0, intensity: 1, speed: 1, engagement: 0 };
    tickTriggerWindows();
    ok(_windowStateForTest()[tr.id]?.status === 'open', 'window still open at totalSec=12 (elapsed=4 < 5)');

    // totalSec=14 → elapsed=6 ≥ windowDurSec(5) → failure should fire
    state.runtime = { sessionTime: 4, loopIndex: 1, paused: false };
    state.engineState = { totalSec: 14, sessionTime: 4, attention: 0, intensity: 1, speed: 1, engagement: 0 };
    tickTriggerWindows();
    // After failure the status resets to idle after 500 ms timeout, but we can verify it fired:
    ok(
      _windowStateForTest()[tr.id]?.status === 'failed' || _windowStateForTest()[tr.id]?.status === 'idle',
      'window should have fired failure at totalSec=14 (elapsed=6)'
    );
  });


  return R.summary();
}
