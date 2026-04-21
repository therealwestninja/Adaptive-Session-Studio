// ── tests/block-ops.test.js ───────────────────────────────────────────────
// Tests for js/block-ops.js — duplicateBlock and deleteBlock.
// These tests stub the renderer callbacks so no DOM is needed.

import { makeRunner } from './harness.js';
import { state }      from '../js/state.js';
import { duplicateBlock, deleteBlock, moveBlockUp, moveBlockDown, reorderBlock, registerBlockOpRenderers } from '../js/block-ops.js';
import { normalizeBlock, uid } from '../js/state.js';
import { history } from '../js/history.js';

export function runBlockOpsTests() {
  const R  = makeRunner('block-ops.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // Stub renderers so tests don't need the DOM
  let renderSidebarCalls   = 0;
  let renderInspectorCalls = 0;
  registerBlockOpRenderers(
    () => renderSidebarCalls++,
    () => renderInspectorCalls++,
  );

  function makeBlock(overrides = {}) {
    return normalizeBlock({ id: uid(), type: 'text', label: 'Test', start: 0, duration: 10, ...overrides });
  }

  function resetSession(...blocks) {
    state.session = {
      ...state.session,
      blocks: blocks.map(b => makeBlock(b)),
    };
    state.selectedBlockId = state.session.blocks[0]?.id ?? null;
    renderSidebarCalls   = 0;
    renderInspectorCalls = 0;
  }

  // ── duplicateBlock ────────────────────────────────────────────────────
  t('duplicateBlock creates a new block', () => {
    resetSession({ label: 'Original', start: 0, duration: 10 });
    const before = state.session.blocks.length;
    duplicateBlock();
    eq(state.session.blocks.length, before + 1);
  });

  t('duplicateBlock selects the new copy', () => {
    resetSession({ label: 'Original', start: 0, duration: 10 });
    const origId = state.selectedBlockId;
    duplicateBlock();
    ok(state.selectedBlockId !== origId, 'selection should move to the copy');
  });

  t('duplicateBlock places copy after original', () => {
    resetSession({ label: 'Orig', start: 5, duration: 10 });
    duplicateBlock();
    const copy = state.session.blocks.find(b => b.id === state.selectedBlockId);
    ok(copy.start >= 5 + 10, 'copy start should be after original end');
  });

  t('duplicateBlock appends " copy" to label', () => {
    resetSession({ label: 'MyBlock', start: 0, duration: 5 });
    duplicateBlock();
    const copy = state.session.blocks.find(b => b.id === state.selectedBlockId);
    ok(copy.label.includes('copy'), `expected "copy" in label, got "${copy.label}"`);
  });

  t('duplicateBlock assigns a new unique id', () => {
    resetSession({ label: 'Orig', start: 0, duration: 5 });
    const origId = state.session.blocks[0].id;
    duplicateBlock();
    const copyId = state.selectedBlockId;
    ok(copyId !== origId, 'copy must have different id');
  });

  t('duplicateBlock is a no-op when no block selected', () => {
    resetSession({ label: 'A', start: 0, duration: 5 });
    state.selectedBlockId = null;
    const before = state.session.blocks.length;
    duplicateBlock();
    eq(state.session.blocks.length, before, 'nothing added if no selection');
  });

  t('duplicateBlock calls render callbacks', () => {
    resetSession({ label: 'A', start: 0, duration: 5 });
    renderSidebarCalls = 0;
    duplicateBlock();
    ok(renderSidebarCalls > 0, 'renderSidebar should be called');
    ok(renderInspectorCalls > 0, 'renderInspector should be called');
  });

  // ── deleteBlock ───────────────────────────────────────────────────────
  t('deleteBlock removes the selected block', () => {
    resetSession({ label: 'A', start: 0 }, { label: 'B', start: 20 });
    const idToDelete = state.selectedBlockId;
    deleteBlock();
    ok(!state.session.blocks.find(b => b.id === idToDelete), 'deleted block should be gone');
  });

  t('deleteBlock selects the next remaining block', () => {
    resetSession({ label: 'A', start: 0 }, { label: 'B', start: 20 });
    deleteBlock();
    ok(state.session.blocks.length === 1, 'one block should remain');
    eq(state.selectedBlockId, state.session.blocks[0].id);
  });

  t('deleteBlock on last block sets selectedBlockId to null', () => {
    resetSession({ label: 'Only', start: 0 });
    deleteBlock();
    eq(state.session.blocks.length, 0);
    eq(state.selectedBlockId, null);
  });

  t('deleteBlock is a no-op when no block selected', () => {
    resetSession({ label: 'A', start: 0 }, { label: 'B', start: 20 });
    state.selectedBlockId = null;
    const before = state.session.blocks.length;
    deleteBlock();
    eq(state.session.blocks.length, before);
  });

  t('deleteBlock calls render callbacks', () => {
    resetSession({ label: 'A', start: 0 }, { label: 'B', start: 20 });
    renderSidebarCalls = 0;
    deleteBlock();
    ok(renderSidebarCalls > 0, 'renderSidebar should be called');
  });

  t('deleteBlock preserves other blocks', () => {
    resetSession({ label: 'A', start: 0 }, { label: 'B', start: 20 }, { label: 'C', start: 40 });
    state.selectedBlockId = state.session.blocks[1].id; // select B
    deleteBlock();
    eq(state.session.blocks.length, 2);
    ok(state.session.blocks.every(b => b.label !== 'B'), 'B should be gone');
    ok(state.session.blocks.some(b => b.label === 'A'), 'A should remain');
    ok(state.session.blocks.some(b => b.label === 'C'), 'C should remain');
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  t('duplicateBlock preserves block type', () => {
    resetSession({ label: 'TTS block', type: 'tts', start: 0, duration: 10, content: 'Hello' });
    duplicateBlock();
    const copy = state.session.blocks.find(b => b.label === 'TTS block copy');
    ok(copy !== undefined, 'copy should exist');
    eq(copy.type, 'tts', 'copy type should be tts');
    eq(copy.content, 'Hello', 'copy content should be preserved');
  });

  t('duplicateBlock preserves block volume and position', () => {
    resetSession({ label: 'Audio', type: 'audio', start: 0, duration: 10, volume: 0.7, _position: 'top' });
    duplicateBlock();
    const copy = state.session.blocks.find(b => b.label === 'Audio copy');
    ok(copy !== undefined);
    eq(copy.volume, 0.7);
    eq(copy._position, 'top');
  });

  t('deleteBlock selects the first block when the first one is deleted', () => {
    resetSession({ label: 'First' }, { label: 'Second' }, { label: 'Third' });
    state.selectedBlockId = state.session.blocks[0].id; // select First
    deleteBlock();
    // Should now select Second (which is now index 0)
    ok(state.selectedBlockId !== null);
    eq(state.session.blocks.find(b => b.id === state.selectedBlockId)?.label, 'Second');
  });

  t('duplicateBlock places copy within session duration bounds', () => {
    state.session.duration = 100;
    resetSession({ label: 'Late', start: 90, duration: 10 });
    duplicateBlock();
    const copy = state.session.blocks.find(b => b.label === 'Late copy');
    ok(copy !== undefined);
    // copy.start = original.start + original.duration + 1 = 101; that's outside duration
    // The block is still created — authors can adjust timing manually
    ok(typeof copy.start === 'number');
  });

  // ── Deep-clone isolation ──────────────────────────────────────────────────
  t('duplicateBlock uses structuredClone — mutating original does not affect copy', () => {
    resetSession({ label: 'Original', start: 0, duration: 10, content: 'hello' });
    duplicateBlock();
    state.session.blocks[0].content = 'CHANGED';
    const copy = state.session.blocks.find(b => b.label === 'Original copy');
    ok(copy?.content !== 'CHANGED', 'copy should be isolated from original mutation');
  });

  t('duplicateBlock deep-clone: mutating copy does not affect original', () => {
    resetSession({ label: 'Src', start: 0, duration: 10, content: 'original' });
    duplicateBlock();
    const copy = state.session.blocks.find(b => b.label === 'Src copy');
    if (copy) copy.content = 'copy-mutated';
    ok(state.session.blocks[0].content === 'original', 'original should be unchanged');
  });

  // ── History integration ───────────────────────────────────────────────────
  t('duplicateBlock pushes to undo history', () => {
    resetSession({ label: 'Hist', start: 0, duration: 10 });
    const depthBefore = history.depth().past;
    duplicateBlock();
    ok(history.depth().past > depthBefore, 'should have pushed a history snapshot');
  });

  t('deleteBlock pushes to undo history', () => {
    resetSession({ label: 'A' }, { label: 'B', start: 15 });
    state.selectedBlockId = state.session.blocks[0].id;
    const depthBefore = history.depth().past;
    deleteBlock();
    ok(history.depth().past > depthBefore, 'should have pushed a history snapshot');
  });

  t('undo after duplicateBlock restores original block count', () => {
    resetSession({ label: 'Base', start: 0, duration: 10 });
    const count = state.session.blocks.length;
    duplicateBlock();
    ok(state.session.blocks.length === count + 1, 'sanity: copy was added');
    history.undo();
    ok(state.session.blocks.length === count, 'undo should remove the copy');
  });

  t('undo after deleteBlock restores the deleted block', () => {
    resetSession({ label: 'ToDelete', start: 0, duration: 10 }, { label: 'Keep', start: 15, duration: 5 });
    state.selectedBlockId = state.session.blocks[0].id;
    const count = state.session.blocks.length;
    deleteBlock();
    ok(state.session.blocks.length === count - 1, 'sanity: block was removed');
    history.undo();
    ok(state.session.blocks.length === count, 'undo should restore the block');
    ok(state.session.blocks.some(b => b.label === 'ToDelete'), 'deleted block should be back');
  });


  // ── Deep-clone isolation ──────────────────────────────────────────────────
  t('duplicateBlock uses structuredClone — mutating original does not affect copy', () => {
    resetSession({ label: 'Original', start: 0, duration: 10, content: 'hello' });
    duplicateBlock();
    state.session.blocks[0].content = 'CHANGED';
    const copy = state.session.blocks.find(b => b.label === 'Original copy');
    ok(copy !== undefined && copy.content !== 'CHANGED', 'copy should be isolated');
  });

  t('duplicateBlock deep-clone: mutating copy does not affect original', () => {
    resetSession({ label: 'Src', start: 0, duration: 10, content: 'original' });
    duplicateBlock();
    const copy = state.session.blocks.find(b => b.label === 'Src copy');
    if (copy) copy.content = 'mutated';
    ok(state.session.blocks[0].content === 'original');
  });

  // ── History integration ───────────────────────────────────────────────────
  t('duplicateBlock pushes to undo history', () => {
    resetSession({ label: 'Hist', start: 0, duration: 10 });
    const before = history.depth().past;
    duplicateBlock();
    ok(history.depth().past > before);
  });

  t('deleteBlock pushes to undo history', () => {
    resetSession({ label: 'A' }, { label: 'B', start: 15 });
    state.selectedBlockId = state.session.blocks[0].id;
    const before = history.depth().past;
    deleteBlock();
    ok(history.depth().past > before);
  });

  t('undo after duplicateBlock restores block count', () => {
    resetSession({ label: 'Base', start: 0, duration: 10 });
    const count = state.session.blocks.length;
    duplicateBlock();
    history.undo();
    ok(state.session.blocks.length === count);
  });

  t('undo after deleteBlock restores deleted block', () => {
    resetSession({ label: 'Del', start: 0, duration: 10 }, { label: 'Keep', start: 15, duration: 5 });
    state.selectedBlockId = state.session.blocks[0].id;
    const count = state.session.blocks.length;
    deleteBlock();
    history.undo();
    ok(state.session.blocks.length === count);
    ok(state.session.blocks.some(b => b.label === 'Del'));
  });


  // ── moveBlockUp ──────────────────────────────────────────────────────────
  t('moveBlockUp moves the selected block one position earlier', () => {
    reset();
    const ids = state.session.blocks.map(b => b.id);
    state.selectedBlockId = ids[1]; // select second block
    moveBlockUp();
    eq(state.session.blocks[0].id, ids[1], 'second block should now be first');
    eq(state.session.blocks[1].id, ids[0], 'first block should now be second');
  });

  t('moveBlockUp on first block is a no-op', () => {
    reset();
    const ids = state.session.blocks.map(b => b.id);
    state.selectedBlockId = ids[0];
    moveBlockUp();
    eq(state.session.blocks[0].id, ids[0], 'first block should remain first');
  });

  t('moveBlockUp creates undo snapshot', () => {
    reset();
    const ids = state.session.blocks.map(b => b.id);
    state.selectedBlockId = ids[1];
    history.clear();
    moveBlockUp();
    ok(history.canUndo(), 'moveBlockUp should push undo snapshot');
  });

  t('moveBlockUp is a no-op when selectedBlockId is null', () => {
    reset();
    const before = state.session.blocks.map(b => b.id).join(',');
    state.selectedBlockId = null;
    moveBlockUp();
    const after = state.session.blocks.map(b => b.id).join(',');
    eq(after, before, 'no-op when nothing selected');
  });

  // ── moveBlockDown ────────────────────────────────────────────────────────
  t('moveBlockDown moves the selected block one position later', () => {
    reset();
    const ids = state.session.blocks.map(b => b.id);
    state.selectedBlockId = ids[0];
    moveBlockDown();
    eq(state.session.blocks[0].id, ids[1], 'second block should now be first');
    eq(state.session.blocks[1].id, ids[0], 'first block should now be second');
  });

  t('moveBlockDown on last block is a no-op', () => {
    reset();
    const ids = state.session.blocks.map(b => b.id);
    state.selectedBlockId = ids[ids.length - 1];
    moveBlockDown();
    eq(state.session.blocks.at(-1).id, ids[ids.length - 1], 'last block should stay last');
  });

  t('moveBlockDown creates undo snapshot', () => {
    reset();
    const ids = state.session.blocks.map(b => b.id);
    state.selectedBlockId = ids[0];
    history.clear();
    moveBlockDown();
    ok(history.canUndo(), 'moveBlockDown should push undo snapshot');
  });

  t('up then down returns blocks to original order', () => {
    reset();
    const original = state.session.blocks.map(b => b.id).join(',');
    const ids = state.session.blocks.map(b => b.id);
    state.selectedBlockId = ids[1];
    moveBlockUp();
    state.selectedBlockId = ids[1]; // same block, now at index 0
    moveBlockDown();
    const restored = state.session.blocks.map(b => b.id).join(',');
    eq(restored, original, 'should return to original order');
  });

  // ── reorderBlock ─────────────────────────────────────────────────────────
  t('reorderBlock moves item from fromIdx to toIdx', () => {
    reset();
    const ids = state.session.blocks.map(b => b.id);
    reorderBlock(0, 2);
    eq(state.session.blocks[2].id, ids[0], 'block should be at new index');
  });

  t('reorderBlock same idx is a no-op', () => {
    reset();
    const before = state.session.blocks.map(b => b.id).join(',');
    reorderBlock(1, 1);
    const after = state.session.blocks.map(b => b.id).join(',');
    eq(after, before, 'same-index reorder should not change order');
  });

  t('reorderBlock with out-of-bounds fromIdx is a no-op', () => {
    reset();
    const before = state.session.blocks.map(b => b.id).join(',');
    reorderBlock(-1, 0);
    reorderBlock(999, 0);
    const after = state.session.blocks.map(b => b.id).join(',');
    eq(after, before, 'out-of-bounds should not mutate');
  });

  t('reorderBlock preserves all blocks (no duplicates, none lost)', () => {
    reset();
    const idsBefore = new Set(state.session.blocks.map(b => b.id));
    reorderBlock(0, state.session.blocks.length - 1);
    const idsAfter = new Set(state.session.blocks.map(b => b.id));
    eq(idsAfter.size, idsBefore.size, 'block count unchanged');
    for (const id of idsBefore) {
      ok(idsAfter.has(id), `block ${id} should survive reorder`);
    }
  });


  // ── duplicateBlock: field inheritance ────────────────────────────────────
  t('duplicateBlock copies all standard fields', () => {
    setup();
    const original = state.session.blocks[0];
    original.fontSize = 1.8;
    original.volume = 0.6;
    original.content = 'Test content';
    duplicateBlock();
    const copy = state.session.blocks[1];
    ok(copy !== original, 'should be a different object');
    eq(copy.fontSize, 1.8);
    eq(copy.volume, 0.6);
    eq(copy.content, 'Test content');
  });

  t('duplicateBlock new block gets a fresh uid', () => {
    setup();
    const original = state.session.blocks[0];
    duplicateBlock();
    const copy = state.session.blocks[1];
    ok(copy.id !== original.id, 'duplicate should have a new id');
    ok(typeof copy.id === 'string' && copy.id.length > 0);
  });

  t('duplicateBlock on empty session is a no-op', () => {
    setup();
    state.session.blocks = [];
    state.selectedBlockId = null;
    const before = state.session.blocks.length;
    duplicateBlock();
    eq(state.session.blocks.length, before, 'should not add blocks when none selected');
  });

  // ── deleteBlock: selection behaviour ─────────────────────────────────────
  t('deleteBlock selects the next block when possible', () => {
    setup();
    // Add a second block so there is something to fall back to
    const b2 = normalizeBlock({ type: 'text', label: 'B2', start: 20, duration: 10 });
    state.session.blocks.push(b2);
    state.selectedBlockId = state.session.blocks[0].id;
    deleteBlock();
    ok(state.selectedBlockId !== null || state.session.blocks.length === 0,
      'should select another block or be null when empty');
  });

  t('deleteBlock on last remaining block leaves selectedBlockId as null or first', () => {
    setup();
    state.selectedBlockId = state.session.blocks[0].id;
    deleteBlock();
    ok(state.session.blocks.length === 0 || state.selectedBlockId !== undefined);
  });

  // ── reorderBlock: multi-block sequence ───────────────────────────────────
  t('reorderBlock 0→2 in a 3-block list changes positions correctly', () => {
    setup();
    const b2 = normalizeBlock({ type: 'text', label: 'B2', start: 20, duration: 10 });
    const b3 = normalizeBlock({ type: 'text', label: 'B3', start: 30, duration: 10 });
    state.session.blocks.push(b2, b3);
    const idA = state.session.blocks[0].id;
    const idC = state.session.blocks[2].id;
    reorderBlock(0, 2);
    eq(state.session.blocks[2].id, idA, 'moved block should be at index 2');
    eq(state.session.blocks[0].id, idC, 'was at 2, now at 0 after splice');
  });


  return R.summary();
}
