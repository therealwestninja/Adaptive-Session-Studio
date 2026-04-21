// ── history.js ────────────────────────────────────────────────────────────
// Undo / redo stack for session edits.
//
// Design: snapshot-based with deep clone.
// Each mutating operation calls history.push() before the mutation.
// Undo restores the previous snapshot; redo re-applies.
//
// Usage:
//   import { history } from './history.js';
//   history.push();          // before any mutation
//   block.content = newVal;
//   persist();
//
//   history.undo();          // restores previous snapshot + re-renders
//   history.redo();
//   history.canUndo()        // boolean
//   history.canRedo()

import { state, persist, applyCssVars, normalizeSession } from './state.js';

const MAX_HISTORY = 60;

const _past   = [];   // array of session JSON strings (oldest first)
const _future = [];   // array of session JSON strings (most-recent-undone first)

let _onChangeCallback = null;

export const history = {
  // Register a callback that re-renders the UI after undo/redo.
  // Called with no arguments. Wire up in main.js after all modules are loaded.
  onchange(fn) { _onChangeCallback = fn; },

  // Snapshot current session BEFORE a mutation.
  push() {
    _past.push(JSON.stringify(state.session));
    if (_past.length > MAX_HISTORY) _past.shift();
    _future.length = 0;           // clear redo stack on new action
    _notifyChange();
  },

  canUndo() { return _past.length > 0; },
  canRedo()  { return _future.length > 0; },

  undo() {
    if (!_past.length) return;
    _future.push(JSON.stringify(state.session));
    if (_future.length > MAX_HISTORY) _future.shift(); // cap redo stack too
    const snapshot = _past.pop();
    _applySnapshot(snapshot);
  },

  redo() {
    if (!_future.length) return;
    _past.push(JSON.stringify(state.session));
    const snapshot = _future.pop();
    _applySnapshot(snapshot);
  },

  // Clear all history (on new session / import)
  clear() { _past.length = 0; _future.length = 0; _notifyChange(); },

  // Current stack depths (for status display)
  depth() { return { past: _past.length, future: _future.length }; },
};

function _applySnapshot(json) {
  state.session = normalizeSession(JSON.parse(json));

  // Revalidate sidebar/inspector selection against the restored session.
  // IDs that existed before the snapshot may no longer exist — clear stale refs.
  const blockIds   = new Set(state.session.blocks?.map(b => b.id) ?? []);
  const audioIds   = new Set(state.session.playlists?.audio?.map(t => t.id) ?? []);
  const videoIds   = new Set(state.session.playlists?.video?.map(t => t.id) ?? []);
  const subIds     = new Set(state.session.subtitleTracks?.map(t => t.id) ?? []);
  const fsIds      = new Set(state.session.funscriptTracks?.map(t => t.id) ?? []);
  const sceneIds   = new Set(state.session.scenes?.map(s => s.id) ?? []);
  const ruleIds    = new Set(state.session.rules?.map(r => r.id) ?? []);
  const trigIds    = new Set(state.session.triggers?.map(t => t.id) ?? []);

  // Clear block selection if that block no longer exists
  if (state.selectedBlockId && !blockIds.has(state.selectedBlockId)) {
    state.selectedBlockId = state.session.blocks?.[0]?.id || null;
  }

  // Clear sidebar selection if the selected item no longer exists
  if (state.selectedSidebarId) {
    const type = state.selectedSidebarType;
    const id   = state.selectedSidebarId;
    const valid =
      (type === 'audio'    && audioIds.has(id)) ||
      (type === 'video'    && videoIds.has(id)) ||
      (type === 'subtitle' && subIds.has(id))   ||
      (type === 'funscript'&& fsIds.has(id))    ||
      (type === 'scene'    && sceneIds.has(id)) ||
      (type === 'rule'     && ruleIds.has(id))  ||
      (type === 'trigger'  && trigIds.has(id));
    if (!valid) {
      state.selectedSidebarType = null;
      state.selectedSidebarIdx  = null;
      state.selectedSidebarId   = null;
    }
  }

  // FunScript point selection holds direct object references into the old session's
  // action arrays.  After a snapshot restore those objects are replaced by deep-cloned
  // equivalents, so the Set contains stale refs that are no longer in any track.
  // Clear both selection fields unconditionally — the user can re-select after undo.
  state.selectedFsPoint  = null;
  state.selectedFsPoints = new Set();

  persist();
  applyCssVars();
  _onChangeCallback?.();
  _notifyChange();
}

function _notifyChange() {
  // Update undo/redo button states in the UI
  const ub = document.getElementById('undoBtn');
  const rb = document.getElementById('redoBtn');
  if (ub) ub.disabled = !history.canUndo();
  if (rb) rb.disabled = !history.canRedo();
}
