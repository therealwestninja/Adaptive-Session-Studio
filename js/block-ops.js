// ── block-ops.js ───────────────────────────────────────────────────────────
// Block-level operations: duplicate, delete, reorder.
// Factored out of main.js so ui.js can import without circular dependency.

import { state, persist, uid } from './state.js';
import { history }             from './history.js';
import { notify }              from './notify.js';

let _renderSidebar   = null;
let _renderInspector = null;

export function registerBlockOpRenderers(rs, ri) {
  _renderSidebar   = rs;
  _renderInspector = ri;
}

export function duplicateBlock() {
  const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
  if (!block) return;
  history.push();
  const copy = { ...structuredClone(block), id: uid(),
                 start: block.start + block.duration + 1, label: `${block.label} copy` };
  state.session.blocks.push(copy);
  state.selectedBlockId = copy.id;
  persist();
  _renderSidebar?.();
  _renderInspector?.();
  notify.info(`Duplicated "${block.label}".`);
}

export function deleteBlock() {
  if (!state.selectedBlockId) return;
  const block = state.session.blocks.find(b => b.id === state.selectedBlockId);
  if (!block) return;
  history.push();
  state.session.blocks = state.session.blocks.filter(b => b.id !== state.selectedBlockId);
  state.selectedBlockId = state.session.blocks[0]?.id || null;
  persist();
  _renderSidebar?.();
  _renderInspector?.();
  notify.info(`Deleted "${block.label}".`);
}

/** Move the selected block one position earlier in the block list. */
export function moveBlockUp() {
  const blocks = state.session.blocks;
  const idx = blocks.findIndex(b => b.id === state.selectedBlockId);
  if (idx <= 0) return;
  history.push();
  [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]];
  persist();
  _renderSidebar?.();
}

/** Move the selected block one position later in the block list. */
export function moveBlockDown() {
  const blocks = state.session.blocks;
  const idx = blocks.findIndex(b => b.id === state.selectedBlockId);
  if (idx < 0 || idx >= blocks.length - 1) return;
  history.push();
  [blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]];
  persist();
  _renderSidebar?.();
}

/** Move a block to an explicit index (for drag-and-drop or programmatic use). */
export function reorderBlock(fromIdx, toIdx) {
  const blocks = state.session.blocks;
  if (fromIdx < 0 || fromIdx >= blocks.length) return;
  if (toIdx   < 0 || toIdx   >= blocks.length) return;
  if (fromIdx === toIdx) return;
  history.push();
  const [moved] = blocks.splice(fromIdx, 1);
  blocks.splice(toIdx, 0, moved);
  persist();
  _renderSidebar?.();
}

