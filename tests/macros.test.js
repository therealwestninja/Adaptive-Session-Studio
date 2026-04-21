// ── tests/macros.test.js ─────────────────────────────────────────────────
// Tests for macros.js: library CRUD, slot assignments, and removeMacro
// cleanup across blocks, rules, and triggers.

import { makeRunner } from './harness.js';
import {
  allMacros, getMacro, getSlotMacro, setSlotMacro,
  saveMacro, removeMacro, newMacro, macroDuration,
  BUILTIN_MACROS, recordLastSentPos, fsState,
} from '../js/macros.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runMacrosTests() {
  const R   = makeRunner('macros.js');
  const t   = R.test.bind(R);
  const eq  = R.assertEqual.bind(R);
  const ok  = R.assert.bind(R);
  const deep = R.assertDeep.bind(R);

  function reset() {
    state.session = normalizeSession(defaultSession());
    state.session.macroLibrary = [];
    state.session.macroSlots   = { 1:null, 2:null, 3:null, 4:null, 5:null };
    state.session.blocks       = [];
    state.session.rules        = [];
    state.session.triggers     = [];
  }

  // ── Built-in macro constants ───────────────────────────────────────────
  t('BUILTIN_MACROS is a non-empty array', () => {
    ok(Array.isArray(BUILTIN_MACROS) && BUILTIN_MACROS.length >= 5);
  });

  t('each built-in macro has id, name, builtin:true, and actions', () => {
    for (const m of BUILTIN_MACROS) {
      ok(typeof m.id === 'string' && m.id.length > 0, `builtin id missing`);
      ok(typeof m.name === 'string', `builtin name missing`);
      ok(m.builtin === true, `builtin flag missing on ${m.id}`);
      ok(Array.isArray(m.actions) && m.actions.length > 0, `actions missing on ${m.id}`);
    }
  });

  // ── allMacros / getMacro ──────────────────────────────────────────────
  t('allMacros includes built-ins when macroLibrary is empty', () => {
    reset();
    const all = allMacros();
    ok(all.length >= BUILTIN_MACROS.length);
    ok(all.some(m => m.builtin), 'should contain builtins');
  });

  t('getMacro returns a builtin by id', () => {
    reset();
    const m = getMacro(BUILTIN_MACROS[0].id);
    ok(m !== null);
    eq(m.id, BUILTIN_MACROS[0].id);
  });

  t('getMacro returns null for unknown id', () => {
    reset();
    eq(getMacro('nonexistent'), null);
  });

  // ── saveMacro ─────────────────────────────────────────────────────────
  t('saveMacro adds a new custom macro', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    eq(state.session.macroLibrary.length, 1);
    eq(state.session.macroLibrary[0].id, m.id);
  });

  t('saveMacro updates an existing macro by id', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    const updated = { ...m, name: 'Updated Name' };
    saveMacro(updated);
    eq(state.session.macroLibrary.length, 1, 'should not duplicate');
    eq(state.session.macroLibrary[0].name, 'Updated Name');
  });

  // ── macroDuration ─────────────────────────────────────────────────────
  t('macroDuration returns 0 for macro with no actions', () => {
    eq(macroDuration({ actions: [] }), 0);
  });

  t('macroDuration returns last at value', () => {
    eq(macroDuration({ actions: [{ at: 0, pos: 0 }, { at: 1500, pos: 100 }] }), 1500);
  });

  // ── getSlotMacro ─────────────────────────────────────────────────────
  t('getSlotMacro returns builtin default when slot is unassigned', () => {
    reset();
    const slot1 = getSlotMacro(1);
    ok(slot1 !== null, 'slot 1 should default to first builtin');
    eq(slot1.id, BUILTIN_MACROS[0].id);
  });

  t('getSlotMacro returns assigned macro when slot is set', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    setSlotMacro(1, m.id);
    eq(getSlotMacro(1)?.id, m.id);
  });

  t('getSlotMacro returns null when assigned macro has been deleted', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    setSlotMacro(1, m.id);
    removeMacro(m.id); // deletes the macro — slot entry cleared by removeMacro
    // Slot should now fall back to builtin (null slot → builtin default)
    const result = getSlotMacro(1);
    // removeMacro clears the slot, so slot[1] becomes null → returns builtin
    eq(result?.id, BUILTIN_MACROS[0].id);
  });

  // ── removeMacro — cleanup correctness ────────────────────────────────
  t('removeMacro removes macro from macroLibrary', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    eq(state.session.macroLibrary.length, 1);
    removeMacro(m.id);
    eq(state.session.macroLibrary.length, 0);
  });

  t('removeMacro clears slot assignment pointing at deleted macro', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    setSlotMacro(3, m.id);
    eq(state.session.macroSlots[3], m.id, 'sanity: slot 3 should be assigned');
    removeMacro(m.id);
    ok(
      state.session.macroSlots[3] === null || state.session.macroSlots[3] === undefined,
      `slot 3 should be cleared after deletions, got: ${state.session.macroSlots[3]}`
    );
  });

  t('removeMacro does not clear slots pointing at OTHER macros', () => {
    reset();
    const mA = { ...newMacro(), name: 'MacroA' };
    const mB = { ...newMacro(), name: 'MacroB' };
    saveMacro(mA); saveMacro(mB);
    setSlotMacro(1, mA.id);
    setSlotMacro(2, mB.id);
    removeMacro(mA.id);
    eq(state.session.macroSlots[2], mB.id, 'slot 2 should still point at MacroB');
  });

  t('removeMacro clears macroId on blocks that referenced the deleted macro', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    state.session.blocks = [
      { id: 'blk1', type: 'macro', macroId: m.id, macroSlot: null },
      { id: 'blk2', type: 'macro', macroId: 'other_id', macroSlot: null },
    ];
    removeMacro(m.id);
    eq(state.session.blocks[0].macroId, '', 'macroId should be cleared on blk1');
    eq(state.session.blocks[1].macroId, 'other_id', 'blk2 should be untouched');
  });

  t('removeMacro nulls action.param on rules that inject the deleted macro', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    state.session.rules = [
      { id: 'r1', action: { type: 'injectMacro', param: m.id } },
      { id: 'r2', action: { type: 'injectMacro', param: 'different_id' } },
      { id: 'r3', action: { type: 'pause', param: null } },
    ];
    removeMacro(m.id);
    eq(state.session.rules[0].action.param, null, 'r1 param should be nulled');
    eq(state.session.rules[1].action.param, 'different_id', 'r2 should be untouched');
    eq(state.session.rules[2].action.param, null, 'r3 was already null');
  });

  t('removeMacro nulls successAction and failureAction params on triggers', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    state.session.triggers = [
      { id: 't1', successAction: { type: 'injectMacro', param: m.id },
                  failureAction: { type: 'injectMacro', param: m.id } },
      { id: 't2', successAction: { type: 'pause', param: null },
                  failureAction: { type: 'injectMacro', param: 'other' } },
    ];
    removeMacro(m.id);
    eq(state.session.triggers[0].successAction.param, null, 't1 success should be nulled');
    eq(state.session.triggers[0].failureAction.param, null, 't1 failure should be nulled');
    eq(state.session.triggers[1].failureAction.param, 'other', 't2 failure should be untouched');
  });

  t('removeMacro is a no-op when id does not exist', () => {
    reset();
    const m = newMacro(); saveMacro(m);
    removeMacro('nonexistent');
    eq(state.session.macroLibrary.length, 1, 'library should be unchanged');
  });

  t('removeMacro cannot remove a builtin macro (builtins not in macroLibrary)', () => {
    reset();
    const builtinId = BUILTIN_MACROS[0].id;
    removeMacro(builtinId); // should be a no-op — builtins live outside macroLibrary
    const stillThere = getMacro(builtinId);
    ok(stillThere !== null, 'builtin should still be accessible after removeMacro call');
  });

  // ── setSlotMacro ──────────────────────────────────────────────────────
  t('setSlotMacro assigns a macro to a slot', () => {
    reset();
    const m = newMacro(); saveMacro(m);
    setSlotMacro(2, m.id);
    eq(state.session.macroSlots[2], m.id);
  });

  t('setSlotMacro accepts null to unassign a slot', () => {
    reset();
    const m = newMacro(); saveMacro(m);
    setSlotMacro(2, m.id);
    setSlotMacro(2, null);
    ok(
      state.session.macroSlots[2] === null || state.session.macroSlots[2] === undefined,
      'slot should be unassigned'
    );
  });

  // ── newMacro ───────────────────────────────────────────────────────────────
  t('newMacro returns a macro with id, name, builtin=false, actions', () => {
    const m = newMacro();
    ok(typeof m.id === 'string' && m.id.length > 0);
    ok(typeof m.name === 'string' && m.name.length > 0);
    ok(m.builtin === false);
    ok(Array.isArray(m.actions) && m.actions.length > 0);
  });

  t('newMacro creates unique ids on each call', () => {
    const a = newMacro(), b = newMacro();
    ok(a.id !== b.id, 'each newMacro call must produce a unique id');
  });

  t('newMacro default actions form a valid funscript sequence', () => {
    const m = newMacro();
    ok(m.actions.every(a => typeof a.at === 'number' && typeof a.pos === 'number'));
    // Actions must be sorted by 'at'
    for (let i = 1; i < m.actions.length; i++) {
      ok(m.actions[i].at >= m.actions[i-1].at, 'actions must be sorted by at');
    }
  });

  // ── macroDuration ─────────────────────────────────────────────────────────
  t('macroDuration returns 0 for macro with no actions', () => {
    eq(macroDuration({ actions: [] }), 0);
  });

  t('macroDuration returns 0 for null/undefined macro', () => {
    eq(macroDuration(null), 0);
    eq(macroDuration(undefined), 0);
  });

  t('macroDuration returns last action at value', () => {
    const m = { actions: [{ at: 0, pos: 0 }, { at: 750, pos: 100 }, { at: 1500, pos: 0 }] };
    eq(macroDuration(m), 1500);
  });

  t('macroDuration of newMacro default is 1000ms', () => {
    eq(macroDuration(newMacro()), 1000);
  });

  // ── allMacros includes both built-ins and custom ───────────────────────────
  t('allMacros returns at least all built-in macros', () => {
    reset();
    const all = allMacros();
    ok(all.length >= BUILTIN_MACROS.length);
    for (const b of BUILTIN_MACROS) {
      ok(all.some(m => m.id === b.id), `builtin ${b.id} should be in allMacros`);
    }
  });

  t('allMacros includes custom macros added via saveMacro', () => {
    reset();
    const m = newMacro();
    saveMacro(m);
    ok(allMacros().some(x => x.id === m.id));
  });

  t('allMacros does not include duplicates', () => {
    reset();
    const all = allMacros();
    const ids = all.map(m => m.id);
    const unique = new Set(ids);
    ok(unique.size === ids.length, 'allMacros should not contain duplicates');
  });

  // ── setSlotMacro / getSlotMacro ───────────────────────────────────────────
  t('setSlotMacro sets a macro to a slot and getSlotMacro retrieves it', () => {
    const macro = newMacro('TestSlot', [{ at: 0, pos: 50 }]);
    saveMacro(macro);
    setSlotMacro(1, macro.id);
    const retrieved = getSlotMacro(1);
    ok(retrieved !== null, 'should retrieve macro from slot 1');
    eq(retrieved.name, 'TestSlot');
    removeMacro(macro.id);
  });

  t('getSlotMacro returns null for empty slot', () => {
    setSlotMacro(3, null);
    ok(getSlotMacro(3) === null);
  });

  t('setSlotMacro to invalid id returns null on get', () => {
    setSlotMacro(2, 'non-existent-id');
    ok(getSlotMacro(2) === null);
  });

  t('setSlotMacro with out-of-range slot does not crash', () => {
    let threw = false;
    try { setSlotMacro(99, null); } catch { threw = true; }
    ok(!threw);
  });

  t('BUILTIN_MACROS are all non-empty arrays of actions', () => {
    ok(Array.isArray(BUILTIN_MACROS));
    for (const m of BUILTIN_MACROS) {
      ok(Array.isArray(m.actions) && m.actions.length > 0,
        `builtin macro "${m.name}" should have actions`);
    }
  });


  // ── BUILTIN_MACROS shape validation ──────────────────────────────────────
  t('all BUILTIN_MACROS have monotonically increasing at timestamps', () => {
    for (const m of BUILTIN_MACROS) {
      for (let i = 1; i < m.actions.length; i++) {
        ok(m.actions[i].at > m.actions[i-1].at,
          `${m.name}: actions not sorted at index ${i}`);
      }
    }
  });

  t('all BUILTIN_MACROS actions have pos in [0, 100]', () => {
    for (const m of BUILTIN_MACROS) {
      for (const a of m.actions) {
        ok(a.pos >= 0 && a.pos <= 100,
          `${m.name}: pos ${a.pos} out of [0,100]`);
      }
    }
  });

  t('all BUILTIN_MACROS have non-empty name', () => {
    for (const m of BUILTIN_MACROS) {
      ok(typeof m.name === 'string' && m.name.length > 0);
    }
  });

  // ── getMacro / saveMacro / removeMacro lifecycle ──────────────────────────
  t('getMacro returns null for unknown id', () => {
    ok(getMacro('fake-id-xyz') === null);
  });

  t('saveMacro then getMacro round-trips macro', () => {
    const m = newMacro('RoundTrip', [{ at: 0, pos: 0 }, { at: 500, pos: 100 }]);
    saveMacro(m);
    const retrieved = getMacro(m.id);
    ok(retrieved !== null);
    eq(retrieved.name, 'RoundTrip');
    removeMacro(m.id);
  });

  t('removeMacro makes getMacro return null', () => {
    const m = newMacro('ToDelete', [{ at: 0, pos: 50 }]);
    saveMacro(m);
    removeMacro(m.id);
    ok(getMacro(m.id) === null);
  });

  t('macroDuration returns correct duration', () => {
    const m = newMacro('DurTest', [{ at: 0, pos: 0 }, { at: 2500, pos: 100 }]);
    eq(macroDuration(m), 2500);
  });


  // ── setSlotMacro / getSlotMacro ──────────────────────────────────────────
  t('setSlotMacro then getSlotMacro returns the same id', () => {
    reset();
    const m = newMacro('SlotTest', [{ at: 0, pos: 50 }]);
    saveMacro(m);
    setSlotMacro(1, m.id);
    eq(getSlotMacro(1), m.id);
    removeMacro(m.id);
  });

  t('setSlotMacro can be overwritten', () => {
    reset();
    const m1 = newMacro('M1', [{ at: 0, pos: 0 }]);
    const m2 = newMacro('M2', [{ at: 0, pos: 100 }]);
    saveMacro(m1); saveMacro(m2);
    setSlotMacro(2, m1.id);
    setSlotMacro(2, m2.id);
    eq(getSlotMacro(2), m2.id, 'slot should be updated to m2');
    removeMacro(m1.id); removeMacro(m2.id);
  });

  t('getSlotMacro returns null for unset slot', () => {
    reset();
    ok(getSlotMacro(5) === null || getSlotMacro(5) === undefined);
  });

  // ── allMacros: library + builtins ────────────────────────────────────────
  t('allMacros includes BUILTIN_MACROS', () => {
    reset();
    const all = allMacros();
    ok(Array.isArray(all), 'allMacros should return an array');
    ok(all.length >= BUILTIN_MACROS.length, 'should include at least all builtins');
  });

  t('allMacros after saveMacro includes the new macro', () => {
    reset();
    const m = newMacro('TestNew', [{ at: 0, pos: 10 }]);
    saveMacro(m);
    const all = allMacros();
    ok(all.some(x => x.id === m.id), 'new macro should appear in allMacros');
    removeMacro(m.id);
  });

  // ── macroDuration: edge cases ─────────────────────────────────────────────
  t('macroDuration of single-action macro returns that action time', () => {
    const m = newMacro('Single', [{ at: 750, pos: 50 }]);
    eq(macroDuration(m), 750);
  });

  t('macroDuration of empty macro is 0', () => {
    const m = newMacro('Empty', []);
    eq(macroDuration(m), 0);
  });

  // ── newMacro: id uniqueness ───────────────────────────────────────────────
  t('newMacro generates unique ids on each call', () => {
    const ids = Array.from({ length: 20 }, () => newMacro('x', []).id);
    eq(new Set(ids).size, 20, 'all 20 ids should be unique');
  });

  // ── removeMacro: cleanup in rules ────────────────────────────────────────
  t('removeMacro clears references from macro slots', () => {
    reset();
    const m = newMacro('ToRemove', [{ at: 0, pos: 0 }]);
    saveMacro(m);
    setSlotMacro(3, m.id);
    removeMacro(m.id);
    // Slot should no longer reference the removed macro
    const slotVal = getSlotMacro(3);
    ok(slotVal !== m.id, `slot 3 should not still reference removed macro, got ${slotVal}`);
  });


  // ── recordLastSentPos NaN regression ─────────────────────────────────────
  t('recordLastSentPos(NaN) stores 0 not NaN', () => {
    recordLastSentPos(NaN);
    ok(fsState.lastSentPos === 0, `expected 0 for NaN input, got ${fsState.lastSentPos}`);
    ok(Number.isFinite(fsState.lastSentPos), 'lastSentPos must be finite');
  });

  t('recordLastSentPos(Infinity) stores 0', () => {
    recordLastSentPos(Infinity);
    eq(fsState.lastSentPos, 0);
  });

  t('recordLastSentPos(50) stores 50 correctly', () => {
    recordLastSentPos(50);
    eq(fsState.lastSentPos, 50);
  });

  t('recordLastSentPos(0) stores 0 (valid zero position)', () => {
    recordLastSentPos(0);
    eq(fsState.lastSentPos, 0);
  });


  return R.summary();
}
