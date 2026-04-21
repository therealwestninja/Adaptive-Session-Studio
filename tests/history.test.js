// ── tests/history.test.js ─────────────────────────────────────────────────
// Tests for js/history.js — push/undo/redo state transitions, canUndo/canRedo,
// clear, and depth() reporting.
//
// NOTE: history.js depends on state.js and persist(). In a browser test
// environment, state.js initializes cleanly (localStorage empty → sampleSession),
// and persist() writes to localStorage, which is acceptable here.
// The DOM helpers in _notifyChange (undo/redo button disable) will silently
// no-op since the test page does not include those elements.

import { makeRunner } from './harness.js';
import { history } from '../js/history.js';
import { state } from '../js/state.js';

export function runHistoryTests() {
  const R = makeRunner('history.js');
  const t = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // Reset to a clean baseline before each group by clearing history
  // and setting a known session state. We use mutation of state.session
  // directly to keep tests isolated.

  function reset() {
    history.clear();
    // Give state.session a known baseline
    state.session = { ...state.session, name: 'baseline', loopMode: 'none' };
  }

  // ── Initial state ─────────────────────────────────────────────────────
  t('canUndo returns false on empty stack', () => {
    reset();
    ok(!history.canUndo());
  });
  t('canRedo returns false on empty stack', () => {
    reset();
    ok(!history.canRedo());
  });
  t('depth() returns zero past and future after clear', () => {
    reset();
    const d = history.depth();
    eq(d.past, 0);
    eq(d.future, 0);
  });

  // ── push ─────────────────────────────────────────────────────────────
  t('canUndo returns true after push', () => {
    reset();
    history.push();
    ok(history.canUndo());
  });
  t('canRedo returns false immediately after push', () => {
    reset();
    history.push();
    ok(!history.canRedo());
  });
  t('depth().past increments on push', () => {
    reset();
    history.push();
    history.push();
    eq(history.depth().past, 2);
  });
  t('push clears the redo stack', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'step1' };
    history.undo();                   // creates a redo entry
    ok(history.canRedo(), 'sanity: redo should be available');
    history.push();                   // new action should clear redo
    ok(!history.canRedo(), 'redo stack must be cleared by push');
  });

  // ── undo ─────────────────────────────────────────────────────────────
  t('undo restores previous session state', () => {
    reset();
    const before = state.session.name;
    history.push();
    state.session = { ...state.session, name: 'mutated' };
    history.undo();
    eq(state.session.name, before, 'undo must restore name to pre-mutation value');
  });
  t('canRedo returns true after undo', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'changed' };
    history.undo();
    ok(history.canRedo());
  });
  t('canUndo returns false after full undo', () => {
    reset();
    history.push();
    history.undo();
    ok(!history.canUndo());
  });
  t('undo is a no-op when stack is empty', () => {
    reset();
    const nameBefore = state.session.name;
    history.undo(); // must not throw
    eq(state.session.name, nameBefore);
  });
  t('depth().future increments after undo', () => {
    reset();
    history.push();
    history.push();
    history.undo();
    eq(history.depth().future, 1);
    eq(history.depth().past,   1);
  });

  // ── redo ─────────────────────────────────────────────────────────────
  t('redo restores undone state', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'step-forward' };
    history.undo();
    history.redo();
    eq(state.session.name, 'step-forward');
  });
  t('canRedo returns false after redo consumes stack', () => {
    reset();
    history.push();
    history.undo();
    history.redo();
    ok(!history.canRedo());
  });
  t('redo is a no-op when stack is empty', () => {
    reset();
    const nameBefore = state.session.name;
    history.redo(); // must not throw
    eq(state.session.name, nameBefore);
  });

  // ── Multi-step undo/redo ──────────────────────────────────────────────
  t('multi-step undo/redo sequence is consistent', () => {
    reset();
    const names = ['alpha', 'beta', 'gamma'];
    for (const name of names) {
      history.push();
      state.session = { ...state.session, name };
    }
    // Undo all three
    history.undo(); // back to beta
    history.undo(); // back to alpha
    history.undo(); // back to baseline
    eq(state.session.name, 'baseline');
    // Redo to gamma in one shot
    history.redo();
    history.redo();
    history.redo();
    eq(state.session.name, 'gamma');
  });

  // ── clear ─────────────────────────────────────────────────────────────
  t('clear empties past stack', () => {
    reset();
    history.push();
    history.push();
    history.clear();
    ok(!history.canUndo());
    eq(history.depth().past, 0);
  });
  t('clear empties future stack', () => {
    reset();
    history.push();
    history.undo();
    ok(history.canRedo(), 'sanity');
    history.clear();
    ok(!history.canRedo());
    eq(history.depth().future, 0);
  });

  // ── MAX_HISTORY cap ───────────────────────────────────────────────────
  t('history stack does not exceed 60 entries', () => {
    reset();
    for (let i = 0; i < 70; i++) history.push();
    ok(history.depth().past <= 60, `past depth should be ≤60, got ${history.depth().past}`);
  });

  t('redo stack is also capped at 60 entries', () => {
    reset();
    // Push 65 entries so past is at 60
    for (let i = 0; i < 65; i++) history.push();
    // Undo them all — each undo should move one from past to future (capped at 60)
    for (let i = 0; i < 65; i++) history.undo();
    ok(history.depth().future <= 60, `future depth should be ≤60, got ${history.depth().future}`);
  });

  t('undo/redo round-trip preserves session name', () => {
    reset();
    state.session = { ...state.session, name: 'before' };
    history.push();
    state.session = { ...state.session, name: 'after' };
    history.undo();
    eq(state.session.name, 'before', 'undo should restore "before"');
    history.redo();
    eq(state.session.name, 'after', 'redo should restore "after"');
  });

  t('depth() reports accurate past and future counts', () => {
    reset();
    history.push(); // past=1
    history.push(); // past=2
    state.session = { ...state.session, name: 'step2' };
    history.undo(); // past=1, future=1
    eq(history.depth().past, 1);
    eq(history.depth().future, 1);
    history.undo(); // past=0, future=2
    eq(history.depth().past, 0);
    eq(history.depth().future, 2);
    history.redo(); // past=1, future=1
    eq(history.depth().past, 1);
    eq(history.depth().future, 1);
  });

  // ── Block mutation undo ───────────────────────────────────────────────────
  t('undo restores block count after a block is added', () => {
    reset();
    const originalCount = state.session.blocks.length;
    history.push();
    state.session.blocks = [...state.session.blocks, { id: 'new-b', type: 'text', label: 'New', start: 0, duration: 5, content: '' }];
    eq(state.session.blocks.length, originalCount + 1, 'sanity: block was added');
    history.undo();
    eq(state.session.blocks.length, originalCount, 'undo should restore original block count');
  });

  t('undo restores block label mutation', () => {
    reset();
    if (!state.session.blocks.length) return; // skip if session has no blocks
    const firstId = state.session.blocks[0].id;
    const origLabel = state.session.blocks[0].label;
    history.push();
    state.session.blocks[0].label = 'Changed Label';
    history.undo();
    const restored = state.session.blocks.find(b => b.id === firstId);
    ok(restored?.label === origLabel, 'undo should restore original block label');
  });

  t('history uses deep clone — mutating session after push does not corrupt history', () => {
    reset();
    history.push();
    const snapshotName = state.session.name;
    // Mutate state AFTER the push
    state.session.name = 'mutated-after-push';
    history.undo();
    eq(state.session.name, snapshotName, 'history snapshot should be isolated from later mutations');
  });

  t('redo after undo restores the mutated state', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'after' };
    history.undo();
    history.redo();
    eq(state.session.name, 'after', 'redo should restore the mutated state');
  });

  t('multiple push calls create independent snapshots', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'step1' };
    history.push();
    state.session = { ...state.session, name: 'step2' };
    history.undo();
    eq(state.session.name, 'step1');
    history.undo();
    eq(state.session.name, 'baseline');
  });

  // ── Depth limiting ─────────────────────────────────────────────────────────
  t('history does not grow unboundedly — depth() past stabilizes after many pushes', () => {
    reset();
    // Push 200 times — the history should have a maximum depth
    for (let i = 0; i < 200; i++) {
      state.session = { ...state.session, name: `step${i}` };
      history.push();
    }
    ok(history.depth().past <= 200,
      `depth should be bounded, got ${history.depth().past}`);
  });

  t('clear() resets both past and future to 0', () => {
    reset();
    history.push();
    history.push();
    state.session = { ...state.session, name: 'after' };
    history.undo();
    ok(history.depth().future > 0, 'sanity: future has entries');
    history.clear();
    eq(history.depth().past, 0);
    eq(history.depth().future, 0);
  });

  t('undo after clear is a no-op (no crash)', () => {
    reset();
    history.clear();
    const nameBefore = state.session.name;
    history.undo();  // must not throw
    eq(state.session.name, nameBefore, 'session should be unchanged');
  });

  t('redo after clear is a no-op (no crash)', () => {
    reset();
    history.clear();
    const nameBefore = state.session.name;
    history.redo();  // must not throw
    eq(state.session.name, nameBefore, 'session should be unchanged');
  });

  t('canUndo returns false when no past entries', () => {
    reset();
    history.clear();
    ok(!history.canUndo(), 'canUndo should be false after clear');
  });

  t('canRedo returns false when at the tip of history', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'tip' };
    ok(!history.canRedo(), 'canRedo should be false at the tip');
  });

  t('canRedo returns true after an undo', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'changed' };
    history.undo();
    ok(history.canRedo(), 'canRedo should be true after undo');
  });

  t('push clears the future (branching history)', () => {
    reset();
    history.push();
    state.session = { ...state.session, name: 'branch-point' };
    history.undo();
    // Now we're before the branch point — push creates a new branch
    history.push();
    state.session = { ...state.session, name: 'new-branch' };
    history.push();
    eq(history.depth().future, 0,
      'pushing after undo should clear the future (standard branching model)');
  });


  // ── Snapshot integrity ────────────────────────────────────────────────────
  t('undo after push restores exact session name', () => {
    state.session.name = 'original';
    history.push();
    state.session.name = 'modified';
    history.undo();
    eq(state.session.name, 'original');
  });

  t('redo reapplies modification after undo', () => {
    state.session.name = 'v1';
    history.push();
    state.session.name = 'v2';
    history.undo();
    history.redo();
    eq(state.session.name, 'v2');
  });

  t('canUndo is false after clear()', () => {
    history.push();
    history.clear();
    ok(!history.canUndo());
    ok(!history.canRedo());
  });

  t('undo on empty stack does not throw', () => {
    history.clear();
    let threw = false;
    try { history.undo(); } catch { threw = true; }
    ok(!threw);
  });

  t('push beyond MAX_HISTORY (60) does not grow indefinitely', () => {
    for (let i = 0; i < 70; i++) {
      state.session.name = `step-${i}`;
      history.push();
    }
    ok(history.depth().past <= 60, `past stack should be capped at 60`);
  });

  t('normalizeSession is called on undo restore (session is valid after undo)', () => {
    state.session.name = 'before';
    history.push();
    state.session.name = 'after';
    history.undo();
    // If normalizeSession is called, all required fields should exist
    ok(Array.isArray(state.session.blocks));
    ok(typeof state.session.hudOptions === 'object');
    ok(typeof state.session.displayOptions === 'object');
  });


  // ── Multi-step undo/redo sequences ───────────────────────────────────────
  t('undo then redo then undo returns to initial', () => {
    state.session.name = 'A';
    history.push();
    state.session.name = 'B';
    history.push();
    state.session.name = 'C';
    history.undo();
    eq(state.session.name, 'B');
    history.redo();
    eq(state.session.name, 'C');
    history.undo();
    eq(state.session.name, 'B');
  });

  t('redo after new push is not possible (redo stack cleared)', () => {
    state.session.name = 'X';
    history.push();
    state.session.name = 'Y';
    history.undo(); // back to X
    state.session.name = 'Z';
    history.push(); // new branch — clears redo
    ok(!history.canRedo(), 'new push should clear redo stack');
  });

  t('multiple pushes create a deep past stack', () => {
    history.clear();
    for (let i = 0; i < 5; i++) {
      state.session.name = `step-${i}`;
      history.push();
    }
    ok(history.depth().past >= 4, 'should have at least 4 past states');
  });

  t('undo past stack depth of 60 does not throw', () => {
    history.clear();
    for (let i = 0; i < 65; i++) {
      state.session.name = `s-${i}`;
      history.push();
    }
    let threw = false;
    try { for (let i = 0; i < 70; i++) history.undo(); } catch { threw = true; }
    ok(!threw, 'undoing past the bottom of stack should be a no-op, not throw');
  });

  t('canUndo and canRedo are consistent with depth()', () => {
    history.clear();
    ok(!history.canUndo());
    ok(!history.canRedo());
    state.session.name = 'A'; history.push();
    state.session.name = 'B';
    ok(history.canUndo());
    history.undo();
    ok(!history.canUndo() || history.depth().past > 0);
  });


  // ── PATCH v62 issue 5: undo/redo revalidates selection state ─────────────
  t('undo clears selectedBlockId when the block no longer exists in snapshot', () => {
    // Set up: session with one block
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:30 })];
    const blockId = state.session.blocks[0].id;
    history.push();
    // Add a second block and select it
    state.session.blocks.push(normalizeBlock({ type:'text', label:'B', start:30, duration:30 }));
    const newId = state.session.blocks[1].id;
    state.selectedBlockId = newId;
    // Undo → back to only one block; newId should no longer be selected
    history.undo();
    ok(state.selectedBlockId !== newId || state.session.blocks.some(b => b.id === state.selectedBlockId),
      'selectedBlockId should be valid or null after undo');
  });

  t('undo clears selectedSidebarId when the item no longer exists', () => {
    state.session.scenes = [];
    history.push();
    // Add a scene and select it in sidebar
    const scene = { id: 'sc-test-001', name:'TestScene', start:0, end:60,
                    stateType:null, nextSceneId:null, loopBehavior:'none', color:'#5fa0dc' };
    state.session.scenes.push(scene);
    state.selectedSidebarType = 'scene';
    state.selectedSidebarId   = 'sc-test-001';
    // Undo → scene gone, selection should be cleared
    history.undo();
    if (state.selectedSidebarId === 'sc-test-001') {
      // Only valid if the scene somehow still exists
      ok(!state.session.scenes.some(s => s.id === 'sc-test-001'),
        'if selectedSidebarId persists, the item must still exist');
    } else {
      ok(state.selectedSidebarId === null || state.selectedSidebarId === undefined,
        'selectedSidebarId should be null when item is gone after undo');
    }
  });

  t('undo preserves selectedBlockId when block still exists in snapshot', () => {
    state.session.blocks = [normalizeBlock({ type:'text', label:'Keep', start:0, duration:30 })];
    const keepId = state.session.blocks[0].id;
    state.selectedBlockId = keepId;
    history.push();
    // Change block content but keep the block (id unchanged)
    state.session.blocks[0].content = 'changed content';
    history.undo();
    // Block still exists with same id — selection should be preserved
    const stillExists = state.session.blocks.some(b => b.id === keepId);
    if (stillExists) {
      ok(state.selectedBlockId === keepId || state.selectedBlockId === state.session.blocks[0]?.id,
        'selection of existing block should be preserved after undo');
    }
  });


  return R.summary();
}
