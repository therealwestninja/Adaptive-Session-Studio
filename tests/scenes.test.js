// ── tests/scenes.test.js ─────────────────────────────────────────────────
// Tests for normalizeScene (state.js), scene CRUD helpers (scenes.js),
// and scene branching (nextSceneId) plus template variable resolution.

import { makeRunner }            from './harness.js';
import { normalizeScene, state, uid, defaultSession, normalizeSession } from '../js/state.js';
import { addScene, deleteScene, updateScene, skipToNextScene } from '../js/scenes.js';
import { resolveTemplateVars }   from '../js/playback.js';

export function runSceneTests() {
  const R  = makeRunner('scenes — normalizer & CRUD');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── normalizeScene ────────────────────────────────────────────────────
  t('normalizeScene generates stable id', () => {
    ok(normalizeScene({}).id?.startsWith('b_'));
  });
  t('normalizeScene preserves existing id', () => {
    eq(normalizeScene({ id: 'sc-1' }).id, 'sc-1');
  });
  t('normalizeScene defaults name to Scene', () => {
    eq(normalizeScene({}).name, 'Scene');
  });
  t('normalizeScene preserves name', () => {
    eq(normalizeScene({ name: 'Warmup' }).name, 'Warmup');
  });
  t('normalizeScene defaults start to 0', () => {
    eq(normalizeScene({}).start, 0);
  });
  t('normalizeScene defaults end to 60', () => {
    eq(normalizeScene({}).end, 60);
  });
  t('normalizeScene clamps start min to 0', () => {
    eq(normalizeScene({ start: -5 }).start, 0);
  });
  t('normalizeScene clamps end min to 1', () => {
    eq(normalizeScene({ end: 0 }).end, 1);
  });
  t('normalizeScene defaults loopBehavior to once', () => {
    eq(normalizeScene({}).loopBehavior, 'once');
  });
  t('normalizeScene accepts loop loopBehavior', () => {
    eq(normalizeScene({ loopBehavior: 'loop' }).loopBehavior, 'loop');
  });
  t('normalizeScene rejects invalid loopBehavior', () => {
    eq(normalizeScene({ loopBehavior: 'bounce' }).loopBehavior, 'once');
  });
  t('normalizeScene has a color field', () => {
    ok(typeof normalizeScene({}).color === 'string' && normalizeScene({}).color.startsWith('#'));
  });
  t('normalizeScene preserves valid custom color', () => {
    eq(normalizeScene({ color: '#aabbcc' }).color, '#aabbcc');
  });

  // ── addScene / deleteScene / updateScene ─────────────────────────────
  function resetScenes(duration = 300, ...scenes) {
    state.session = {
      ...state.session,
      duration,
      scenes: scenes.map(s => normalizeScene(s)),
    };
  }

  t('addScene appends a normalized scene', () => {
    resetScenes(300);
    addScene();
    eq(state.session.scenes.length, 1);
    ok(state.session.scenes[0].id?.startsWith('b_'));
  });
  t('addScene places new scene after existing ones', () => {
    resetScenes(300, { start: 0, end: 60 });
    addScene();
    const last = state.session.scenes.at(-1);
    ok(last.start >= 60, `expected start >= 60, got ${last.start}`);
  });
  t('addScene does not add scene beyond session duration', () => {
    resetScenes(60, { start: 0, end: 60 });
    const before = state.session.scenes.length;
    addScene();
    eq(state.session.scenes.length, before, 'should not add beyond duration');
  });
  t('deleteScene removes by id', () => {
    resetScenes(300, { start: 0, end: 60, name: 'A' }, { start: 60, end: 120, name: 'B' });
    const idToDelete = state.session.scenes[0].id;
    deleteScene(idToDelete);
    eq(state.session.scenes.length, 1);
    ok(state.session.scenes[0].name === 'B');
  });
  t('deleteScene no-op on unknown id', () => {
    resetScenes(300, { start: 0, end: 60, name: 'A' });
    deleteScene('nonexistent');
    eq(state.session.scenes.length, 1);
  });
  t('updateScene patches a field by id', () => {
    resetScenes(300, { start: 0, end: 60, name: 'Original' });
    const id = state.session.scenes[0].id;
    updateScene(id, { name: 'Updated' });
    eq(state.session.scenes[0].name, 'Updated');
  });
  t('updateScene patches loopBehavior', () => {
    resetScenes(300, { start: 0, end: 60, loopBehavior: 'once' });
    const id = state.session.scenes[0].id;
    updateScene(id, { loopBehavior: 'loop' });
    eq(state.session.scenes[0].loopBehavior, 'loop');
  });
  t('updateScene no-op on unknown id', () => {
    resetScenes(300, { start: 0, end: 60, name: 'Stable' });
    updateScene('bad-id', { name: 'Should not change' });
    eq(state.session.scenes[0].name, 'Stable');
  });

  t('updateScene patches color', () => {
    resetScenes(300, { start: 0, end: 60, color: '#5fa0dc' });
    const id = state.session.scenes[0].id;
    updateScene(id, { color: '#e05050' });
    eq(state.session.scenes[0].color, '#e05050');
  });

  t('updateScene enforces end > start when patching start', () => {
    resetScenes(300, { start: 10, end: 60 });
    const id = state.session.scenes[0].id;
    // Patching start to 70 — end (60) must be pushed past start
    updateScene(id, { start: 70 });
    ok(state.session.scenes[0].end > state.session.scenes[0].start,
      `end ${state.session.scenes[0].end} must be > start ${state.session.scenes[0].start}`);
  });

  t('updateScene enforces end > start when patching end', () => {
    resetScenes(300, { start: 50, end: 60 });
    const id = state.session.scenes[0].id;
    // Trying to set end before start — should be clamped to start + 1
    updateScene(id, { end: 10 });
    ok(state.session.scenes[0].end >= state.session.scenes[0].start + 1,
      'end must be at least start + 1');
  });

  t('addScene positions new scene after the last existing one', () => {
    resetScenes(300, { start: 0, end: 60, name: 'First' });
    addScene();
    eq(state.session.scenes.length, 2);
    const second = state.session.scenes[1];
    ok(second.start >= 60, 'second scene should start at or after first scene ends');
  });

  t('addScene warns and does not add when session is full', () => {
    state.session.duration = 60;
    state.session.scenes = [{ id: 'x', name: 'Full', start: 0, end: 60,
      loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null }];
    addScene(); // start would equal duration — should warn without adding
    eq(state.session.scenes.length, 1, 'should not add when session is full');
  });

  // ── Scene branching (nextSceneId) ────────────────────────────────────────
  t('normalizeScene defaults nextSceneId to null', () => {
    eq(normalizeScene({ start: 0, end: 30 }).nextSceneId, null);
  });
  t('normalizeScene preserves valid nextSceneId string', () => {
    const s = normalizeScene({ start: 0, end: 30, nextSceneId: 'b_abc123' });
    eq(s.nextSceneId, 'b_abc123');
  });
  t('normalizeScene rejects empty string nextSceneId → null', () => {
    eq(normalizeScene({ nextSceneId: '' }).nextSceneId, null);
  });
  t('normalizeScene rejects non-string nextSceneId → null', () => {
    eq(normalizeScene({ nextSceneId: 42 }).nextSceneId, null);
  });
  t('updateScene can set nextSceneId to a scene id', () => {
    state.session.duration = 300;
    state.session.scenes = [normalizeScene({ start: 0, end: 60, name: 'A' })];
    const id = state.session.scenes[0].id;
    updateScene(id, { nextSceneId: 'b_target' });
    eq(state.session.scenes[0].nextSceneId, 'b_target');
  });
  t('updateScene can clear nextSceneId by setting null', () => {
    state.session.duration = 300;
    state.session.scenes = [normalizeScene({ start: 0, end: 60, nextSceneId: 'b_xyz' })];
    const id = state.session.scenes[0].id;
    updateScene(id, { nextSceneId: null });
    eq(state.session.scenes[0].nextSceneId, null);
  });

  // ── Template variable resolution ─────────────────────────────────────────
  // resolveTemplateVars uses state.engineState and state.runtime.
  // Set up mock values before each test.
  function setupEngineState(intensity = 1.0, speed = 1.0, loop = 0, sessionTime = 30) {
    state.engineState = { intensity, speed, engagement: 0.5, attention: 1,
                          sessionTime, totalSec: sessionTime, loopCount: loop, playing: true };
    state.runtime = { loopIndex: loop, sessionTime,
                      activeScene: null, activeBlock: null };
  }

  t('resolveTemplateVars returns content unchanged when no templates present', () => {
    setupEngineState();
    eq(resolveTemplateVars('Hello world'), 'Hello world');
  });
  t('resolveTemplateVars returns empty string unchanged', () => {
    eq(resolveTemplateVars(''), '');
  });
  t('resolveTemplateVars returns null/undefined as empty', () => {
    eq(resolveTemplateVars(null), null);   // passes through — no-op on falsy
    eq(resolveTemplateVars(undefined), undefined);
  });
  t('resolveTemplateVars substitutes {{intensity}}', () => {
    setupEngineState(1.5);
    const result = resolveTemplateVars('Intensity: {{intensity}}');
    eq(result, 'Intensity: 150%');
  });
  t('resolveTemplateVars substitutes {{speed}}', () => {
    setupEngineState(1.0, 2.0);
    const result = resolveTemplateVars('Speed: {{speed}}');
    eq(result, 'Speed: 2.00×');
  });
  t('resolveTemplateVars substitutes {{loop}}', () => {
    setupEngineState(1.0, 1.0, 2); // loopIndex=2 → displays as loop 3
    const result = resolveTemplateVars('Loop {{loop}}');
    eq(result, 'Loop 3');
  });
  t('resolveTemplateVars substitutes {{time}}', () => {
    setupEngineState(1.0, 1.0, 0, 90); // 90 seconds = 1:30
    const result = resolveTemplateVars('Time: {{time}}');
    eq(result, 'Time: 01:30');
  });
  t('resolveTemplateVars substitutes {{scene}} when no scene active', () => {
    setupEngineState();
    state.runtime.activeScene = null;
    const result = resolveTemplateVars('Scene: {{scene}}');
    eq(result, 'Scene: —');
  });
  t('resolveTemplateVars substitutes {{scene}} with active scene name', () => {
    setupEngineState();
    state.runtime.activeScene = { scene: { id: 's1', name: 'Warmup' } };
    const result = resolveTemplateVars('Now: {{scene}}');
    eq(result, 'Now: Warmup');
  });
  t('resolveTemplateVars handles multiple templates in one string', () => {
    setupEngineState(0.8, 1.5, 1, 45);
    const result = resolveTemplateVars('{{intensity}} / {{speed}} / Loop {{loop}}');
    eq(result, '80% / 1.50× / Loop 2');
  });
  t('resolveTemplateVars is case-insensitive', () => {
    setupEngineState(1.0);
    const result = resolveTemplateVars('{{INTENSITY}} {{Intensity}}');
    eq(result, '100% 100%');
  });

  // ── Phase 5.1: stateType in updateScene ───────────────────────────────────
  t('updateScene can set stateType to a valid value', () => {
    resetScenes();
    addScene();
    const id = state.session.scenes[0].id;
    updateScene(id, { stateType: 'peak' });
    eq(state.session.scenes[0].stateType, 'peak');
  });

  t('updateScene can clear stateType back to null', () => {
    resetScenes();
    addScene();
    const id = state.session.scenes[0].id;
    updateScene(id, { stateType: 'calm' });
    updateScene(id, { stateType: null });
    eq(state.session.scenes[0].stateType, null);
  });

  t('normalizeScene round-trip preserves stateType after updateScene', () => {
    resetScenes();
    addScene();
    const id = state.session.scenes[0].id;
    updateScene(id, { stateType: 'recovery' });
    const sc = state.session.scenes.find(s => s.id === id);
    ok(sc !== undefined);
    eq(sc.stateType, 'recovery');
  });

  // ── updateScene: id immutability and stateType validation ─────────────────
  t('updateScene cannot overwrite scene id', () => {
    addScene();
    const original = state.session.scenes[0];
    const originalId = original.id;
    updateScene(originalId, { id: 'hacked-id', name: 'patched' });
    const after = state.session.scenes.find(s => s.id === originalId);
    ok(after !== undefined, 'scene should still be findable by original id');
    ok(after.name === 'patched', 'name should be updated');
  });

  t('updateScene rejects unknown stateType', () => {
    addScene();
    const id = state.session.scenes[0].id;
    updateScene(id, { stateType: 'rave' });
    const scene = state.session.scenes.find(s => s.id === id);
    ok(scene.stateType === null, `invalid stateType should be null, got "${scene.stateType}"`);
  });

  t('updateScene accepts all valid stateTypes', () => {
    addScene();
    const id = state.session.scenes[0].id;
    for (const st of ['calm', 'build', 'peak', 'recovery']) {
      updateScene(id, { stateType: st });
      const scene = state.session.scenes.find(s => s.id === id);
      eq(scene.stateType, st);
    }
  });

  t('updateScene accepts stateType:null to clear it', () => {
    addScene();
    const id = state.session.scenes[0].id;
    updateScene(id, { stateType: 'peak' });
    updateScene(id, { stateType: null });
    const scene = state.session.scenes.find(s => s.id === id);
    ok(scene.stateType === null);
  });


  // ── addScene / deleteScene sequence ──────────────────────────────────────
  t('addScene then deleteScene leaves session scenes empty', () => {
    state.session.scenes = [];
    addScene();
    ok(state.session.scenes.length === 1);
    const id = state.session.scenes[0].id;
    deleteScene(id);
    eq(state.session.scenes.length, 0);
  });

  t('deleteScene with unknown id is a no-op', () => {
    state.session.scenes = [];
    addScene();
    const before = state.session.scenes.length;
    deleteScene('not-a-real-scene-id');
    eq(state.session.scenes.length, before);
  });

  t('addScene initialises scene with valid time range (start < end)', () => {
    state.session.scenes = [];
    addScene();
    const s = state.session.scenes[0];
    ok(s.start < s.end, `start(${s.start}) should be < end(${s.end})`);
  });

  t('updateScene name cannot exceed 120 chars', () => {
    state.session.scenes = [];
    addScene();
    const id = state.session.scenes[0].id;
    updateScene(id, { name: 'x'.repeat(200) });
    ok(state.session.scenes[0].name.length <= 120);
  });

  t('updateScene stateType only accepts allowlisted values', () => {
    state.session.scenes = [];
    addScene();
    const id = state.session.scenes[0].id;
    updateScene(id, { stateType: 'hacked_type' });
    // Should be null (invalid) or the original value
    const st = state.session.scenes[0].stateType;
    ok(st === null || ['calm','build','peak','recovery'].includes(st),
      `stateType "${st}" should be null or a valid type`);
  });

  t('skipToNextScene with no scenes does not throw', () => {
    state.session.scenes = [];
    state.runtime = null;
    let threw = false;
    try { skipToNextScene(); } catch { threw = true; }
    ok(!threw);
  });


  return R.summary();
}
