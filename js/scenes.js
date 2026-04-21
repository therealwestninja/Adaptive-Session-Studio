// ── scenes.js ───────────────────────────────────────────────────────────────
// Scene system — ROADMAP Phase 3.3.
// Scenes are named time ranges within the session with optional per-scene
// loop behavior. They appear as colored bands on the FunScript timeline and
// can be jumped to during playback via the "Next Scene" transport button.

import { state, persist, $id, uid, esc, clampInt, fmt,
         normalizeScene } from './state.js';
import { notify } from './notify.js';
import { history } from './history.js';
import { skipToScene } from './playback.js';
import { applyStateProfile, stateTypeLabel, suggestedColorForStateType,
         STATE_PROFILES, STATE_TYPES } from './state-blocks.js';

// Lazy: ui.js imports scenes.js, so we can't import it statically here.

// ── Per-field undo debounce ────────────────────────────────────────────────
// Tracks which scene-name input last triggered a history snapshot,
// so we snapshot once-per-field-activation rather than once-per-keystroke.
let _sceneNameLastField = null;
// Call syncTransportControls after scene mutations so the Next Scene button
// appears/disappears immediately without requiring a full sidebar re-render.
function _syncTransport() {
  import('./ui.js').then(({ syncTransportControls }) => syncTransportControls());
}

// ── Scene CRUD ───────────────────────────────────────────────────────────────

export function addScene() {
  const lastEnd = state.session.scenes.length
    ? Math.max(...state.session.scenes.map(s => s.end))
    : 0;
  const start = lastEnd;
  const end   = Math.min(start + 60, state.session.duration);
  if (start >= state.session.duration) {
    notify.warn('Session is full — extend the duration before adding more scenes.');
    return;
  }
  history.push();
  const scene = normalizeScene({ start, end, name: `Scene ${state.session.scenes.length + 1}` });
  state.session.scenes.push(scene);
  persist();
  _syncTransport();
  renderSceneList();
}

export function deleteScene(sceneId) {
  history.push();
  state.session.scenes = state.session.scenes.filter(s => s.id !== sceneId);
  persist();
  _syncTransport();
  renderSceneList();
}

export function updateScene(sceneId, patch) {
  const scene = state.session.scenes.find(s => s.id === sceneId);
  if (!scene) return;
  // Strip immutable field and sanitize stateType before applying
  const { id: _id, ...safePatch } = patch;
  if ('stateType' in safePatch) {
    safePatch.stateType = ['calm','build','peak','recovery'].includes(safePatch.stateType)
      ? safePatch.stateType : null;
  }
  if ('name' in safePatch) {
    safePatch.name = typeof safePatch.name === 'string' ? safePatch.name.slice(0, 120) : scene.name;
  }
  Object.assign(scene, safePatch);
  // Enforce valid timing after patch — re-run normalizeScene on the timing fields
  if ('start' in patch || 'end' in patch) {
    const start = Math.max(0, Math.min(86400, scene.start ?? 0));
    scene.start = start;
    scene.end   = Math.max(start + 1, Math.min(86400, scene.end ?? start + 60));
  }
  persist();
}

// ── Next-scene button ────────────────────────────────────────────────────────
// Jumps to the scene after the currently-playing one.

export function skipToNextScene() {
  const { runtime, session } = state;
  if (!session.scenes?.length) return;

  const sorted = [...session.scenes].sort((a, b) => a.start - b.start);
  const t = runtime ? runtime.sessionTime : 0;

  // Find which scene we are currently in
  const current = runtime?.activeScene?.scene ?? session.scenes.find(s => t >= s.start && t < s.end) ?? null;

  // Phase 2 branching: if the current scene declares a nextSceneId, jump there instead
  if (current?.nextSceneId) {
    const branch = session.scenes.find(s => s.id === current.nextSceneId);
    if (branch) {
      skipToScene(branch.id);
      applyStateProfile(branch);
      notify.info(`⤵ ${branch.name}`);
      return;
    }
  }

  // Default: find the next scene that starts after current time
  const next = sorted.find(s => s.start > t + 0.5);
  if (next) {
    skipToScene(next.id);
    applyStateProfile(next);
    notify.info(`→ ${next.name}`);
  } else {
    // Wrap around to the first scene
    const first = sorted[0];
    if (first) { skipToScene(first.id); applyStateProfile(first); notify.info(`↩ ${first.name}`); }
  }
}

// ── Scene list renderer (for inspector / settings panel) ─────────────────────

export function renderSceneList(containerId = 'sceneListBody') {
  const el = $id(containerId);
  if (!el) return;

  const scenes = [...state.session.scenes].sort((a, b) => a.start - b.start);
  if (!scenes.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px 0">No scenes defined. Add one to divide the session into named segments.</div>';
    return;
  }

  el.innerHTML = scenes.map(sc => {
    // Build options for the "Jump to" branch select (all scenes except this one)
    const branchOptions = `<option value="">↪ Sequential (default)</option>` +
      scenes.filter(s => s.id !== sc.id).map(s =>
        `<option value="${s.id}"${sc.nextSceneId === s.id ? ' selected' : ''}>⤵ ${esc(s.name)}</option>`
      ).join('');

    // State type options
    const stateOptions = `<option value="">— None —</option>` +
      STATE_TYPES.map(t => {
        const p = STATE_PROFILES[t];
        return `<option value="${t}"${sc.stateType === t ? ' selected' : ''}>${p.icon} ${p.label}</option>`;
      }).join('');

    return `
    <div class="scene-row" data-scene-id="${sc.id}" style="
      display:flex;flex-direction:column;gap:4px;margin-bottom:6px;
      padding:7px 8px;border-radius:6px;
      background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07)">
      <div style="display:flex;align-items:center;gap:6px">
        <input type="color" class="scene-color" data-scene-id="${sc.id}" value="${sc.color}"
          style="width:18px;height:18px;border:none;border-radius:50%;padding:0;cursor:pointer;
                 background:transparent;flex-shrink:0" title="Scene color" />
        <input type="text" class="scene-name" data-scene-id="${sc.id}" value="${esc(sc.name)}"
          style="flex:1;font-size:11px;background:transparent;border:none;color:var(--text);min-width:0" />
        <select class="scene-loop" data-scene-id="${sc.id}" style="font-size:10px;width:50px">
          <option value="once"${sc.loopBehavior==='once'?' selected':''}>once</option>
          <option value="loop"${sc.loopBehavior==='loop'?' selected':''}>loop</option>
        </select>
        <button class="scene-dup" data-scene-id="${sc.id}"
          style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:11px;padding:0 2px;line-height:1"
          title="Duplicate scene">⧉</button>
        <button class="scene-del" data-scene-id="${sc.id}"
          style="background:transparent;border:none;color:var(--danger,#e05050);cursor:pointer;font-size:14px;padding:0;line-height:1"
          title="Delete scene">×</button>
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--text3)">
        <span>Start</span>
        <input type="number" class="scene-start" data-scene-id="${sc.id}" value="${sc.start}"
          min="0" max="${state.session.duration - 1}" step="1"
          style="width:55px;font-size:10.5px" title="Start time in seconds" />
        <span>—</span>
        <span>End</span>
        <input type="number" class="scene-end" data-scene-id="${sc.id}" value="${sc.end}"
          min="1" max="${state.session.duration}" step="1"
          style="width:55px;font-size:10.5px" title="End time in seconds" />
        <span style="margin-left:4px;color:var(--text3)">s · ${fmt(sc.end - sc.start)} long</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--text3)">
        <span style="flex-shrink:0">State:</span>
        <select class="scene-state" data-scene-id="${sc.id}"
          style="width:120px;font-size:10.5px" title="State Block type — applies an automatic intensity/pacing profile when this scene is entered">
          ${stateOptions}
        </select>
        ${sc.stateType ? `<span style="font-size:9.5px;color:rgba(255,255,255,0.3)">${STATE_PROFILES[sc.stateType]?.description ?? ''}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--text3)">
        <span style="flex-shrink:0">After scene:</span>
        <select class="scene-branch" data-scene-id="${sc.id}"
          style="flex:1;font-size:10.5px" title="Where to jump when operator presses N or a rule fires nextScene">
          ${branchOptions}
        </select>
      </div>
    </div>`}).join('');

  // Wire events
  el.querySelectorAll('.scene-color').forEach(inp => {
    inp.addEventListener('input', e => {
      history.push(); // color changes must be undoable
      updateScene(e.target.dataset.sceneId, { color: e.target.value });
      import('./funscript.js').then(({ drawTimeline }) => drawTimeline());
    });
  });
  el.querySelectorAll('.scene-name').forEach(inp => {
    inp.addEventListener('input', e => {
      // Snapshot once per field activation (same debounce pattern as block fields)
      if (_sceneNameLastField !== e.target) {
        history.push();
        _sceneNameLastField = e.target;
      }
      updateScene(e.target.dataset.sceneId, { name: e.target.value });
    });
    // Clear the debounce guard when the field loses focus
    inp.addEventListener('blur', () => { _sceneNameLastField = null; });
  });
  el.querySelectorAll('.scene-start').forEach(inp => {
    inp.addEventListener('change', e => {
      const newStart = Number(e.target.value);
      if (!Number.isFinite(newStart)) return; // reject NaN from empty/invalid input
      history.push();
      updateScene(e.target.dataset.sceneId, { start: Math.max(0, Math.round(newStart)) });
      renderSceneList(containerId); // re-render to refresh duration display
      import('./funscript.js').then(({ drawTimeline }) => drawTimeline());
    });
  });
  el.querySelectorAll('.scene-end').forEach(inp => {
    inp.addEventListener('change', e => {
      const newEnd = Number(e.target.value);
      if (!Number.isFinite(newEnd)) return; // reject NaN from empty/invalid input
      history.push();
      updateScene(e.target.dataset.sceneId, { end: Math.min(state.session.duration, Math.max(1, Math.round(newEnd))) });
      renderSceneList(containerId);
      import('./funscript.js').then(({ drawTimeline }) => drawTimeline());
    });
  });
  el.querySelectorAll('.scene-branch').forEach(sel => {
    sel.addEventListener('change', e => {
      history.push();
      updateScene(e.target.dataset.sceneId, { nextSceneId: e.target.value || null });
      import('./funscript.js').then(({ drawTimeline }) => drawTimeline());
    });
  });
  el.querySelectorAll('.scene-state').forEach(sel => {
    sel.addEventListener('change', e => {
      history.push();
      const newType = e.target.value || null;
      const patch = { stateType: newType };
      // Auto-suggest color when a state type is first assigned and color is still the default
      const scene = state.session.scenes?.find(s => s.id === e.target.dataset.sceneId);
      if (newType && scene?.color === '#5fa0dc') {
        patch.color = suggestedColorForStateType(newType);
      }
      updateScene(e.target.dataset.sceneId, patch);
      renderSceneList(containerId);
      import('./funscript.js').then(({ drawTimeline }) => drawTimeline());
    });
  });
  el.querySelectorAll('.scene-loop').forEach(sel => {
    sel.addEventListener('change', e => {
      history.push();
      updateScene(e.target.dataset.sceneId, { loopBehavior: e.target.value });
    });
  });
  el.querySelectorAll('.scene-dup').forEach(btn => {
    btn.addEventListener('click', e => {
      const sceneId = e.target.dataset.sceneId;
      const orig = state.session.scenes?.find(s => s.id === sceneId);
      if (!orig) return;
      history.push();
      const copy = { ...orig, id: uid(), name: orig.name + ' (copy)' };
      state.session.scenes.push(copy);
      persist();
      renderSceneList(el);
    });
  });
  el.querySelectorAll('.scene-del').forEach(btn => {
    btn.addEventListener('click', e => {
      deleteScene(e.target.dataset.sceneId);
    });
  });
}

// ── Scene inspector panel (rendered inside the overlay inspector tab) ──────────
export function renderSceneInspector() {
  return `
    <div class="insp-block-name">🎬 Scenes</div>
    <p style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:10px">
      Divide the session into named segments. Each scene can have its own loop behavior,
      branch target, and <strong>State Block type</strong> (🌊 Calm · 📈 Build · ⚡ Peak · 🌱 Recovery)
      which automatically adjusts intensity and pace when entered.
    </p>
    <div id="sceneListBody"></div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button id="addSceneBtn" style="flex:1;font-size:11px">+ Add scene</button>
    </div>
    <div style="margin-top:10px">
      <div class="insp-group-label">About scenes</div>
      <p style="font-size:10.5px;color:var(--text3);line-height:1.5">
        Scenes appear as colored bands on the FunScript timeline. Edit start/end times
        directly in the fields above, or drag scene markers on the timeline canvas.
        Click the color swatch to change a scene's color.
      </p>
    </div>`;
}

export function attachSceneInspectorEvents() {
  renderSceneList('sceneListBody');
  $id('addSceneBtn')?.addEventListener('click', addScene);
}

// ── skipToNextScene ──────────────────────────────────────────────────────────
// Exported for keyboard shortcut (N key) and next-scene button.
// The authoritative scene-band rendering lives in funscript.js drawOverviewLane.
