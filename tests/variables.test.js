// ── tests/variables.test.js ────────────────────────────────────────────────
// Tests for js/variables.js — Phase 5.2 user-defined runtime variables.
// Also tests the extended resolveTemplateVars in playback.js.

import { makeRunner } from './harness.js';
import {
  validateVarName, normalizeVariables,
  getVariable, setVariable, addVariable, deleteVariable,
  updateVariable, getAllVariables, getVariableTemplateMap, VAR_NAME_RE,
} from '../js/variables.js';
import { state } from '../js/state.js';
import { resolveTemplateVars } from '../js/playback.js';

export function runVariablesTests() {
  const R  = makeRunner('variables.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function resetVars(vars = {}) {
    state.session.variables = vars;
  }

  // ── VAR_NAME_RE / validateVarName ─────────────────────────────────────
  t('VAR_NAME_RE accepts simple lowercase name', () => {
    ok(VAR_NAME_RE.test('arousal'));
  });
  t('VAR_NAME_RE accepts underscore prefix', () => {
    ok(VAR_NAME_RE.test('_internal'));
  });
  t('VAR_NAME_RE accepts alphanumeric with underscores', () => {
    ok(VAR_NAME_RE.test('phase_1_level'));
  });
  t('VAR_NAME_RE rejects uppercase', () => {
    ok(!VAR_NAME_RE.test('MyVar'));
  });
  t('VAR_NAME_RE rejects names starting with digit', () => {
    ok(!VAR_NAME_RE.test('1bad'));
  });
  t('VAR_NAME_RE rejects empty string', () => {
    ok(!VAR_NAME_RE.test(''));
  });
  t('VAR_NAME_RE rejects names with spaces', () => {
    ok(!VAR_NAME_RE.test('my var'));
  });
  t('validateVarName returns null for valid names', () => {
    eq(validateVarName('arousal_level'), null);
    eq(validateVarName('_counter'), null);
  });
  t('validateVarName returns error for invalid names', () => {
    ok(validateVarName('MyVar') !== null);
    ok(validateVarName('') !== null);
    ok(validateVarName(42) !== null);
  });

  // ── normalizeVariables ────────────────────────────────────────────────
  t('normalizeVariables returns {} for null input', () => {
    const result = normalizeVariables(null);
    eq(JSON.stringify(result), '{}');
  });
  t('normalizeVariables strips invalid names', () => {
    const result = normalizeVariables({ 'BadName': { type: 'number', value: 1 } });
    eq(Object.keys(result).length, 0);
  });
  t('normalizeVariables preserves valid number variable', () => {
    const result = normalizeVariables({ score: { type: 'number', value: 42 } });
    eq(result.score.type, 'number');
    eq(result.score.value, 42);
  });
  t('normalizeVariables coerces string value to number type', () => {
    const result = normalizeVariables({ count: { type: 'number', value: '7' } });
    eq(result.count.value, 7);
  });
  t('normalizeVariables defaults type to number', () => {
    const result = normalizeVariables({ x: { value: 5 } });
    eq(result.x.type, 'number');
  });
  t('normalizeVariables caps description at 120 chars', () => {
    const result = normalizeVariables({ x: { type: 'string', value: 'hi', description: 'a'.repeat(200) } });
    ok(result.x.description.length <= 120);
  });

  // ── addVariable / getVariable / setVariable ───────────────────────────
  t('addVariable creates a new variable', () => {
    resetVars();
    const ok2 = addVariable('intensity_mod', 'number', 'Test variable');
    ok(ok2 === true);
    ok('intensity_mod' in state.session.variables);
  });
  t('addVariable returns false for invalid name', () => {
    resetVars();
    ok(addVariable('BadName', 'number') === false);
  });
  t('addVariable returns false for duplicate name', () => {
    resetVars({ score: { type: 'number', value: 0, description: '' } });
    ok(addVariable('score', 'number') === false);
  });
  t('getVariable returns the current value', () => {
    resetVars({ score: { type: 'number', value: 99, description: '' } });
    eq(getVariable('score'), 99);
  });
  t('getVariable returns null for unknown variable', () => {
    resetVars();
    eq(getVariable('does_not_exist'), null);
  });
  t('setVariable updates value', () => {
    resetVars({ level: { type: 'number', value: 1, description: '' } });
    setVariable('level', 5);
    eq(getVariable('level'), 5);
  });
  t('setVariable coerces value to declared type', () => {
    resetVars({ active: { type: 'boolean', value: false, description: '' } });
    setVariable('active', 1); // truthy number → boolean
    eq(getVariable('active'), true);
  });
  t('setVariable returns false for unknown variable', () => {
    resetVars();
    ok(setVariable('ghost', 42) === false);
  });

  // ── deleteVariable ────────────────────────────────────────────────────
  t('deleteVariable removes the variable', () => {
    resetVars({ tmp: { type: 'number', value: 0, description: '' } });
    deleteVariable('tmp');
    eq(getVariable('tmp'), null);
  });
  t('deleteVariable returns false for unknown variable', () => {
    resetVars();
    ok(deleteVariable('nope') === false);
  });

  // ── updateVariable ────────────────────────────────────────────────────
  t('updateVariable changes description', () => {
    resetVars({ x: { type: 'number', value: 0, description: 'old' } });
    updateVariable('x', { description: 'new' });
    eq(state.session.variables.x.description, 'new');
  });
  t('updateVariable changes value', () => {
    resetVars({ x: { type: 'number', value: 0, description: '' } });
    updateVariable('x', { value: 42 });
    eq(getVariable('x'), 42);
  });

  // ── getAllVariables ────────────────────────────────────────────────────
  t('getAllVariables returns array of all variables with name field', () => {
    resetVars({
      a: { type: 'number',  value: 1, description: '' },
      b: { type: 'string',  value: 'hi', description: '' },
    });
    const all = getAllVariables();
    eq(all.length, 2);
    ok(all.some(v => v.name === 'a'));
    ok(all.some(v => v.name === 'b'));
  });
  t('getAllVariables returns empty array when no variables', () => {
    resetVars();
    eq(getAllVariables().length, 0);
  });

  // ── getVariableTemplateMap ────────────────────────────────────────────
  t('getVariableTemplateMap returns string values for all variables', () => {
    resetVars({
      score:  { type: 'number',  value: 42,    description: '' },
      label:  { type: 'string',  value: 'hi',  description: '' },
      active: { type: 'boolean', value: true,  description: '' },
    });
    const map = getVariableTemplateMap();
    eq(map.score,  '42');
    eq(map.label,  'hi');
    eq(map.active, 'true');
  });

  // ── resolveTemplateVars with user variables ───────────────────────────
  t('resolveTemplateVars substitutes user-defined number variable', () => {
    resetVars({ score: { type: 'number', value: 7, description: '' } });
    state.engineState = { intensity: 1, speed: 1 };
    state.runtime = { loopIndex: 0, sessionTime: 0, activeScene: null };
    const result = resolveTemplateVars('Your score is {{score}}.');
    eq(result, 'Your score is 7.');
  });
  t('resolveTemplateVars substitutes user-defined string variable', () => {
    resetVars({ phase: { type: 'string', value: 'warmup', description: '' } });
    state.engineState = { intensity: 1, speed: 1 };
    state.runtime = { loopIndex: 0, sessionTime: 0, activeScene: null };
    const result = resolveTemplateVars('Current phase: {{phase}}');
    eq(result, 'Current phase: warmup');
  });
  t('resolveTemplateVars leaves unresolved placeholders intact', () => {
    resetVars();
    state.engineState = { intensity: 1, speed: 1 };
    state.runtime = { loopIndex: 0, sessionTime: 0, activeScene: null };
    const result = resolveTemplateVars('Hello {{undefined_var}}');
    eq(result, 'Hello {{undefined_var}}');
  });
  t('resolveTemplateVars built-in vars still work alongside user vars', () => {
    resetVars({ level: { type: 'number', value: 3, description: '' } });
    state.engineState = { intensity: 1.5, speed: 1 };
    state.runtime = { loopIndex: 1, sessionTime: 60, activeScene: null };
    const result = resolveTemplateVars('Level {{level}} at {{intensity}}');
    ok(result.includes('Level 3'));
    ok(result.includes('150%'));
  });
  t('normalizeVariables in session round-trips correctly', () => {
    const vars = { progress: { type: 'number', value: 50, description: 'Progress %' } };
    const result = normalizeVariables(vars);
    eq(result.progress.value, 50);
    eq(result.progress.type, 'number');
    eq(result.progress.description, 'Progress %');
  });

  // ── Boolean variable handling ──────────────────────────────────────────
  t('addVariable creates boolean variable with false default', () => {
    resetVars();
    addVariable('active', 'boolean');
    eq(state.session.variables.active.type, 'boolean');
    eq(state.session.variables.active.value, false);
  });

  t('setVariable coerces string to number for number-typed var', () => {
    resetVars({ count: { type: 'number', value: 0, description: '' } });
    setVariable('count', '42');
    eq(getVariable('count'), 42);
  });

  t('getVariableTemplateMap returns false/true strings for boolean vars', () => {
    resetVars({
      done: { type: 'boolean', value: false, description: '' },
      win:  { type: 'boolean', value: true,  description: '' },
    });
    const map = getVariableTemplateMap();
    eq(map.done, 'false');
    eq(map.win,  'true');
  });

  // ── String variable ───────────────────────────────────────────────────
  t('addVariable creates string variable with empty string default', () => {
    resetVars();
    addVariable('phase', 'string', 'Current phase name');
    eq(state.session.variables.phase.type, 'string');
    eq(state.session.variables.phase.value, '');
    eq(state.session.variables.phase.description, 'Current phase name');
  });

  t('setVariable on string type stores value as string', () => {
    resetVars({ label: { type: 'string', value: '', description: '' } });
    setVariable('label', 'warmup');
    eq(getVariable('label'), 'warmup');
  });

  t('resolveTemplateVars handles boolean variable (false → "false")', () => {
    resetVars({ done: { type: 'boolean', value: false, description: '' } });
    state.engineState = { intensity: 1, speed: 1 };
    state.runtime = { loopIndex: 0, sessionTime: 0, activeScene: null };
    eq(resolveTemplateVars('Done: {{done}}'), 'Done: false');
  });

  t('multiple undefined vars are all flagged in a single pass', () => {
    resetVars();
    state.engineState = { intensity: 1, speed: 1 };
    state.runtime = { loopIndex: 0, sessionTime: 0, activeScene: null };
    // Both {{alpha}} and {{beta}} are undefined — both left as-is
    const result = resolveTemplateVars('{{alpha}} and {{beta}}');
    ok(result.includes('{{alpha}}') && result.includes('{{beta}}'));
  });

  // ── updateVariable: type coercion ────────────────────────────────────────
  t('updateVariable coerces string to number for number type', () => {
    reset();
    addVariable('score', 'number');
    updateVariable('score', { value: '42' });
    eq(getVariable('score'), 42, 'string "42" should coerce to number 42');
  });

  t('updateVariable coerces truthy string to boolean true', () => {
    reset();
    addVariable('active', 'boolean');
    updateVariable('active', { value: 'yes' });
    ok(getVariable('active') === true);
  });

  t('updateVariable with NaN keeps value as 0 for number type', () => {
    reset();
    addVariable('count', 'number');
    updateVariable('count', { value: NaN });
    // NaN coerces to 0 for number type
    eq(getVariable('count'), 0);
  });

  t('updateVariable description change does not affect value', () => {
    reset();
    addVariable('x', 'number');
    setVariable('x', 10);
    updateVariable('x', { description: 'new description' });
    eq(getVariable('x'), 10, 'value should be unchanged after description update');
  });

  // ── validateVarName: edge cases ───────────────────────────────────────────
  t('validateVarName rejects name starting with number', () => {
    ok(validateVarName('1abc') !== null, 'names starting with digit should fail');
  });

  t('validateVarName rejects empty string', () => {
    ok(validateVarName('') !== null, 'empty name should fail');
  });

  t('validateVarName accepts underscore-leading name', () => {
    ok(validateVarName('_private') === null, '_private should be valid');
  });

  t('validateVarName rejects name longer than 32 chars', () => {
    ok(validateVarName('a'.repeat(33)) !== null, '33-char name should fail');
  });

  t('validateVarName accepts exactly 32 chars', () => {
    ok(validateVarName('a'.repeat(32)) === null, '32-char name should be valid');
  });


  // ── setVariable / getVariable lifecycle ──────────────────────────────────
  t('setVariable to zero preserves the value (not coerced to default)', () => {
    reset();
    addVariable('score', 'number');
    setVariable('score', 0);
    eq(getVariable('score'), 0, 'zero should be stored, not treated as falsy');
  });

  t('setVariable with string type stores empty string correctly', () => {
    reset();
    addVariable('msg', 'string');
    setVariable('msg', '');
    eq(getVariable('msg'), '', 'empty string should be preserved');
  });

  t('setVariable on non-existent variable returns false', () => {
    reset();
    const result = setVariable('nonexistent_var_xyz', 42);
    ok(result === false || result === undefined,
      'should return false for unknown variable');
  });

  t('deleteVariable removes variable from session', () => {
    reset();
    addVariable('temp', 'number');
    ok('temp' in (state.session.variables ?? {}));
    deleteVariable('temp');
    ok(!('temp' in (state.session.variables ?? {})));
  });

  t('deleteVariable returns false for non-existent variable', () => {
    reset();
    const result = deleteVariable('not_here_xyz');
    ok(result === false || result === undefined);
  });

  t('normalizeVariables removes variables with invalid names', () => {
    const input = {
      validName:  { type: 'number',  value: 1,    description: '' },
      '1invalid': { type: 'string',  value: 'hi', description: '' }, // starts with digit
      'also-bad': { type: 'boolean', value: true, description: '' }, // has hyphen
      _underscore: { type: 'number', value: 0,    description: '' },
    };
    const result = normalizeVariables(input);
    ok('validName'   in result, 'validName should pass');
    ok('_underscore' in result, '_underscore should pass');
    ok(!('1invalid'  in result), '1invalid should be stripped');
    ok(!('also-bad'  in result), 'also-bad should be stripped');
  });


  return R.summary();
}
