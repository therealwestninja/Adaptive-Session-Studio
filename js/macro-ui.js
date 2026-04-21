// ── macro-ui.js ───────────────────────────────────────────────────────────
// Macro Library panel rendering and interactions.

import { state, persist, uid, esc, $id } from './state.js';
import { history } from './history.js';
import {
  allMacros, BUILTIN_MACROS, getMacro, getSlotMacro, setSlotMacro,
  saveMacro, removeMacro, newMacro, exportMacroFile, importMacroFile,
  macroDuration, injectMacro
} from './macros.js';
import { notify } from './notify.js';

// ── Main library render ─────────────────────────────────────────────────────
export function renderMacroLibrary() {
  const el = $id('macroLibraryBody');
  if (!el) return;

  const macros = allMacros();
  const sortBy = state._macroSortBy || 'name';

  const sorted = [...macros].sort((a, b) => {
    if (sortBy === 'duration') return macroDuration(a) - macroDuration(b);
    if (sortBy === 'type')     return (a.builtin ? 0 : 1) - (b.builtin ? 0 : 1);
    return (a.name || '').localeCompare(b.name || '');
  });

  el.innerHTML = sorted.map(m => {
    const dur    = macroDuration(m);
    const durStr = dur ? `${(dur/1000).toFixed(2)}s` : '—';
    const slotHint = slotForMacro(m.id);
    return `
    <div class="ml-row${state._editingMacroId === m.id ? ' editing' : ''}" data-macro-id="${m.id}">
      <div class="ml-row-left">
        <div class="ml-name">${esc(m.name)}</div>
        <div class="ml-meta">
          ${m.builtin ? '<span class="ml-badge preset">preset</span>' : '<span class="ml-badge user">custom</span>'}
          <span class="ml-dur">${durStr}</span>
          ${slotHint ? `<span class="ml-badge slot">slot ${slotHint}</span>` : ''}
        </div>
      </div>
      <div class="ml-row-actions">
        <button class="ml-inject" data-ml-action="inject" data-macro-id="${m.id}" title="Inject now">▶</button>
        <button class="ml-btn" data-ml-action="edit" data-macro-id="${m.id}" title="Edit">✎</button>
        <button class="ml-btn" data-ml-action="export" data-macro-id="${m.id}" title="Export .funscript">↓</button>
        ${!m.builtin ? `<button class="ml-btn ml-del" data-ml-action="delete" data-macro-id="${m.id}" title="Remove">×</button>` : ''}
      </div>
    </div>`;
  }).join('') || '<div style="padding:12px;font-size:11px;color:var(--text3);font-style:italic">No macros</div>';

  renderMacroEditor();
  renderSlotAssignments();
}

function slotForMacro(id) {
  const slots = state.session.macroSlots || {};
  for (const [k, v] of Object.entries(slots)) {
    if (v === id) return k;
  }
  return null;
}

// ── Slot assignments ────────────────────────────────────────────────────────
function renderSlotAssignments() {
  const el = $id('macroSlots');
  if (!el) return;
  const macros = allMacros();
  el.innerHTML = [1,2,3,4,5].map(slot => {
    const assigned = getSlotMacro(slot);
    return `
    <div class="slot-row">
      <kbd class="slot-key">${slot}</kbd>
      <select class="slot-select" data-slot="${slot}">
        <option value="">— default (${BUILTIN_MACROS[slot-1]?.name || 'none'}) —</option>
        ${macros.map(m => `<option value="${m.id}"${(state.session.macroSlots?.[slot]===m.id)?' selected':''}>${esc(m.name)}</option>`).join('')}
      </select>
      <button class="ml-inject slot-inject" data-slot="${slot}" title="Inject slot ${slot}">▶</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.slot-select').forEach(sel => {
    sel.addEventListener('change', e => {
      history.push();
      setSlotMacro(Number(e.target.dataset.slot), e.target.value || null);
      renderMacroLibrary();
    });
  });
  el.querySelectorAll('.slot-inject').forEach(btn => {
    btn.addEventListener('click', e => {
      const slot = Number(e.currentTarget.dataset.slot);
      const macro = getSlotMacro(slot);
      if (macro) injectMacro(macro.id);
    });
  });
}

// ── Module-level pending edit state ─────────────────────────────────────────
// When a builtin macro is being edited, we keep the working copy here so edits
// survive re-renders without being silently saved to macroLibrary.
// Cleared on explicit "Save as copy" or when the user navigates to a different macro.
let _pendingBuiltin = null; // { sourceId: string, working: macro }

// ── Macro editor ────────────────────────────────────────────────────────────
function renderMacroEditor() {
  const el = $id('macroEditor');
  if (!el) return;

  const id = state._editingMacroId;
  const original = id ? getMacro(id) : null;

  if (!original) {
    _pendingBuiltin = null; // clear pending if nothing selected
    el.innerHTML = `<div style="padding:10px;font-size:11px;color:var(--text3);font-style:italic">Select a macro to edit, or create new.</div>`;
    return;
  }

  // If switching to a different macro, discard any previous pending edit
  if (_pendingBuiltin && _pendingBuiltin.sourceId !== id) _pendingBuiltin = null;

  const isBuiltin = original.builtin;
  // For a builtin, use the in-progress working copy if one exists; otherwise start fresh.
  // For a custom macro, always work from the saved copy.
  const display = (isBuiltin && _pendingBuiltin) ? _pendingBuiltin.working : original;

  el.innerHTML = `
    <div class="me-head">
      <div class="insp-group-label">Editing: <span style="color:var(--text)">${esc(display.name)}</span>${isBuiltin?' <span style="color:var(--text3);font-style:italic">(built-in — save as copy to keep changes)</span>':''}</div>
    </div>
    <label style="margin-bottom:8px">Name<input type="text" id="me_name" value="${esc(display.name)}" /></label>
    <div class="me-table-wrap">
      <table class="me-table">
        <thead><tr><th>#</th><th>At (ms)</th><th>Pos (0-100)</th><th></th></tr></thead>
        <tbody id="me_tbody">
          ${display.actions.map((a, i) => `
          <tr data-point-idx="${i}">
            <td style="color:var(--text3)">${i+1}</td>
            <td><input type="number" class="me-at"  value="${a.at}"  min="0"   step="10" data-idx="${i}" /></td>
            <td><input type="number" class="me-pos" value="${a.pos}" min="0" max="100" step="1" data-idx="${i}" /></td>
            <td><button class="ml-btn ml-del me-del" data-idx="${i}" title="Delete point">×</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button id="me_addPoint" style="flex:1;font-size:11px">+ Point</button>
      <button id="me_save" class="btn-primary" style="flex:1;font-size:11px">${isBuiltin?'Save as copy':'Save'}</button>
      <button id="me_export" style="flex:1;font-size:11px">Export</button>
      ${!isBuiltin?`<button id="me_delete" class="btn-danger" style="flex:1;font-size:11px">Delete</button>`:''}
    </div>
    <div id="me_preview" style="margin-top:10px;height:60px;position:relative;background:var(--surface2);border-radius:var(--r);overflow:hidden"></div>`;

  attachEditorEvents(original, display);
  drawMiniPreview(display.actions, $id('me_preview'));
}

function attachEditorEvents(macro, display) {
  // working is a mutable clone we edit locally.
  // For builtins: it has a fresh id and builtin=false, but is NOT saved until explicit click.
  // For custom macros: it matches the saved record; adds/deletes persist immediately.
  let working = structuredClone(display);
  if (macro.builtin && working.builtin) {
    // First time opening a builtin — give the draft a new id
    working.id = uid(); working.builtin = false;
  }

  const isBuiltin = macro.builtin;

  const refresh = () => {
    working.actions.sort((a, b) => a.at - b.at);
    drawMiniPreview(working.actions, $id('me_preview'));
  };

  $id('me_name')?.addEventListener('input', e => {
    working.name = e.target.value;
    if (isBuiltin) _pendingBuiltin = { sourceId: macro.id, working };
  });

  $id('me_tbody')?.addEventListener('input', e => {
    const idx = Number(e.target.dataset.idx);
    if (isNaN(idx)) return;
    if (e.target.classList.contains('me-at')) {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) working.actions[idx].at  = Math.max(0, Math.round(v));
    }
    if (e.target.classList.contains('me-pos')) {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) working.actions[idx].pos = Math.min(100, Math.max(0, Math.round(v)));
    }
    if (isBuiltin) _pendingBuiltin = { sourceId: macro.id, working };
    refresh();
  });

  $id('me_tbody')?.addEventListener('click', e => {
    const del = e.target.closest('.me-del');
    if (!del) return;
    const idx = Number(del.dataset.idx);
    working.actions.splice(idx, 1);
    if (isBuiltin) {
      // Builtin: store pending edit without saving, re-render editor only
      _pendingBuiltin = { sourceId: macro.id, working };
      renderMacroEditor();
    } else {
      // Custom: snapshot before each structural edit so every point-delete is undoable
      history.push();
      saveMacro(working); state._editingMacroId = working.id;
      renderMacroLibrary();
    }
  });

  $id('me_addPoint')?.addEventListener('click', () => {
    const lastAt = working.actions.at(-1)?.at ?? 0;
    working.actions.push({ at: lastAt + 200, pos: 50 });
    if (isBuiltin) {
      _pendingBuiltin = { sourceId: macro.id, working };
      renderMacroEditor();
    } else {
      history.push();
      saveMacro(working); state._editingMacroId = working.id;
      renderMacroLibrary();
    }
  });

  $id('me_save')?.addEventListener('click', () => {
    working.name = $id('me_name')?.value?.trim() || working.name;
    history.push();
    saveMacro(working);
    state._editingMacroId = working.id;
    _pendingBuiltin = null; // committed — clear pending state
    renderMacroLibrary();
  });

  $id('me_export')?.addEventListener('click', () => {
    working.name = $id('me_name')?.value || working.name;
    exportMacroFile(working);
  });

  $id('me_delete')?.addEventListener('click', () => {
    history.push();
    removeMacro(working.id);
    state._editingMacroId = null;
    renderMacroLibrary();
  });
}

// Mini canvas preview of macro shape
function drawMiniPreview(actions, container) {
  if (!container || !actions.length) return;
  container.innerHTML = '';
  const W = container.offsetWidth || 200;
  const H = 60;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const maxAt = actions.at(-1)?.at || 1;
  ctx.beginPath();
  ctx.strokeStyle = '#f0a04a';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  for (let i = 0; i < actions.length; i++) {
    const x = (actions[i].at / maxAt) * (W - 4) + 2;
    const y = H - 4 - (actions[i].pos / 100) * (H - 8);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Points
  for (const a of actions) {
    const x = (a.at / maxAt) * (W - 4) + 2;
    const y = H - 4 - (a.pos / 100) * (H - 8);
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI*2);
    ctx.fillStyle = '#f0a04aaa'; ctx.fill();
  }
}

// ── Event delegation for macro library panel ────────────────────────────────
export function initMacroLibraryEvents() {
  // Macro list actions
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-ml-action]');
    if (!btn) return;
    const action  = btn.dataset.mlAction;
    const macroId = btn.dataset.macroId;

    if (action === 'inject') { injectMacro(macroId); return; }
    if (action === 'edit')   {
      // Navigating to a different macro — discard any unsaved builtin edit
      if (state._editingMacroId !== macroId) _pendingBuiltin = null;
      state._editingMacroId = macroId; renderMacroLibrary(); return;
    }
    if (action === 'export') { const m = getMacro(macroId); if (m) exportMacroFile(m); return; }
    if (action === 'delete') { history.push(); removeMacro(macroId); if (state._editingMacroId===macroId) state._editingMacroId=null; renderMacroLibrary(); return; }
  });

  // Sort controls
  $id('mlSortName')?.addEventListener('click',     () => { state._macroSortBy='name';     renderMacroLibrary(); });
  $id('mlSortDuration')?.addEventListener('click', () => { state._macroSortBy='duration'; renderMacroLibrary(); });
  $id('mlSortType')?.addEventListener('click',     () => { state._macroSortBy='type';     renderMacroLibrary(); });

  // New macro
  $id('mlNewBtn')?.addEventListener('click', () => {
    const m = newMacro();
    history.push();
    saveMacro(m);
    state._editingMacroId = m.id;
    renderMacroLibrary();
  });

  // Import macro file
  $id('mlImportInput')?.addEventListener('change', async e => {
    for (const f of e.target.files) {
      try {
        const m = await importMacroFile(f);
        state._editingMacroId = m.id;
      } catch (err) {
        notify.error(`Macro import failed for "${f.name}":\n${err.message}`);
      }
    }
    renderMacroLibrary();
    e.target.value = '';
  });
}
