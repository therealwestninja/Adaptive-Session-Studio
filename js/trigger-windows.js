// ── trigger-windows.js ─────────────────────────────────────────────────────
// Timing-Based Interaction Layer — ROADMAP Phase 4
//
// A trigger window opens at a specific session time and waits for a
// condition to be met within a time budget. If met → success action.
// If the window closes without the condition → failure action.
//
// Session schema (session.triggers[]):
// {
//   id:           uid(),
//   enabled:      true,
//   name:         'Focus check',
//   atSec:        30,          // session time when window opens
//   windowDurSec: 10,          // how long the window stays open
//   condition: {
//     metric: 'attention',     // same metrics as rules-engine
//     op:     '>=',
//     value:  0.7,
//   },
//   successAction: { type: 'injectMacro', param: 1 },  // slot or null
//   failureAction: { type: 'pause', param: null },
//   cooldownSec:  60,          // min seconds before same trigger can fire again
// }

import { state, persist, uid, esc } from './state.js';
import { notify }              from './notify.js';
import { getMetric, evalCondition } from './state-engine.js';
import { injectMacro, getSlotMacro } from './macros.js';
import { setLiveIntensity, setLiveSpeed } from './live-control.js';
import { history }             from './history.js';

// Local debounce for inspector inputs — mirrors _snapOnce in ui.js.
// Pushes history at most once per focus session per element.
const _twSnapMap = new WeakMap();
function _snapOnce(el) {
  if (!_twSnapMap.has(el)) {
    history.push();
    _twSnapMap.set(el, true);
    el.addEventListener('blur', () => _twSnapMap.delete(el), { once: true });
  }
}

// ── Normalizer ────────────────────────────────────────────────────────────────
export function normalizeTrigger(t) {
  const ACTION_TYPES = ['pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene','setVar','none'];
  const normalizeAction = a => ({
    type:  ACTION_TYPES.includes(a?.type) ? a.type : 'none',
    param: a?.param ?? null,
  });
  return {
    id:           typeof t?.id === 'string' && t.id ? t.id : uid(),
    enabled:      t?.enabled !== false,
    name:         typeof t?.name === 'string' && t.name ? t.name : 'Trigger',
    atSec:        Number.isFinite(t?.atSec)        ? Math.max(0, t.atSec) : 0,
    windowDurSec: Number.isFinite(t?.windowDurSec) ? Math.max(1, t.windowDurSec) : 5,
    condition: {
      metric: ['attention','intensity','speed','engagement','sessionTime','loopCount']
               .includes(t?.condition?.metric) ? t.condition.metric : 'attention',
      op:     ['<','>','<=','>=','=='].includes(t?.condition?.op) ? t.condition.op : '>=',
      value:  Number.isFinite(t?.condition?.value) ? t.condition.value : 0.7,
    },
    successAction: normalizeAction(t?.successAction),
    failureAction: normalizeAction(t?.failureAction),
    cooldownSec:  Number.isFinite(t?.cooldownSec) ? Math.max(0, t.cooldownSec) : 60,
  };
}

// ── Runtime window state ──────────────────────────────────────────────────────
// _windowState[triggerId] = {
//   status: 'idle' | 'open' | 'success' | 'failed',
//   openedAt: sessionTime,
//   lastFiredAt: sessionTime,
// }
const _windowState = {};

function getWindowState(id) {
  if (!_windowState[id]) _windowState[id] = { status: 'idle', openedAt: 0, lastFiredAt: -Infinity };
  return _windowState[id];
}

export function clearWindowState() {
  Object.keys(_windowState).forEach(k => delete _windowState[k]);
}

// Test helper — exposes internal window state for regression tests only.
// Do not use in production code.
export function _windowStateForTest() { return _windowState; }

// ── Execute an action ─────────────────────────────────────────────────────────
function executeAction(action, triggerName, outcome) {
  if (!action || action.type === 'none') return;
  const { type, param } = action;
  const label = `Trigger "${triggerName}" ${outcome}`;

  switch (type) {
    case 'pause':        import('./playback.js').then(({ pausePlayback }) => pausePlayback()); notify.info(`${label}: paused`); break;
    case 'resume':       import('./playback.js').then(({ resumePlayback }) => resumePlayback()); break;
    case 'stop':         import('./playback.js').then(({ stopPlayback }) => stopPlayback()); notify.info(`${label}: stopped`); break;
    case 'nextScene':    import('./scenes.js').then(({ skipToNextScene }) => skipToNextScene()); break;
    case 'gotoScene':
      if (param) {
        import('./playback.js').then(({ skipToScene }) => {
          skipToScene(param);
          const scene = state.session?.scenes?.find(s => s.id === param);
          if (scene) import('./state-blocks.js').then(({ applyStateProfile }) => applyStateProfile(scene));
        });
      } else notify.warn(`${label}: gotoScene has no target scene configured`);
      break;
    case 'setVar': {
      // param is "name=value" string
      if (typeof param === 'string' && param.includes('=')) {
        const eq = param.indexOf('=');
        const varName  = param.slice(0, eq).trim();
        const varValue = param.slice(eq + 1).trim();
        import('./variables.js').then(({ setVariable }) => {
          const ok = setVariable(varName, varValue);
          if (ok) notify.info(`${label}: ${varName} = ${varValue}`);
        });
      } else notify.warn(`${label}: setVar param must be "name=value"`);
      break;
    }
    case 'injectMacro': {
      let macroId = param;
      if (typeof param === 'number' && param >= 1 && param <= 5) macroId = getSlotMacro(param)?.id;
      if (macroId) {
        injectMacro(macroId);
        notify.info(`${label}: macro injected`);
      } else {
        notify.warn(`${label}: macro not found (slot or id may be deleted)`);
      }
      break;
    }
    case 'setIntensity': {
      const val = Math.max(0, Math.min(2, Number.isFinite(Number(param)) ? Number(param) : 1));
      setLiveIntensity(val);
      break;
    }
    case 'setSpeed': {
      const val = Math.max(0.25, Math.min(4, Number.isFinite(Number(param)) ? Number(param) : 1));
      setLiveSpeed(val);
      break;
    }
  }
}

// ── Tick — called every RAF frame ────────────────────────────────────────────
export function tickTriggerWindows() {
  const triggers = state.session?.triggers;
  if (!triggers?.length || !state.runtime) return;

  // Use totalSec (absolute clock) so cooldowns survive loop resets.
  const totalSec = state.engineState?.totalSec ?? 0;

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    const ws = getWindowState(trigger.id);

    if (ws.status === 'idle') {
      // atSec is loop-relative; compare against sessionTime for window open.
      const sessionTime   = state.engineState?.sessionTime ?? 0;
      const cooldownOk    = totalSec - ws.lastFiredAt >= trigger.cooldownSec;
      if (sessionTime >= trigger.atSec && cooldownOk) {
        ws.status   = 'open';
        // Store open time as absolute totalSec so elapsed survives loop resets.
        // Using sessionTime here caused a negative elapsed when the session looped
        // mid-window, which permanently blocked the failure branch from firing.
        ws.openedAt = totalSec;
      }
    }

    if (ws.status === 'open') {
      // elapsed uses absolute clock so it stays monotonically increasing across loops.
      const elapsed = totalSec - ws.openedAt;
      const condMet = evalCondition(trigger.condition);

      if (condMet) {
        ws.status       = 'success';
        ws.lastFiredAt  = totalSec;
        executeAction(trigger.successAction, trigger.name, '✓ success');
        setTimeout(() => { if (_windowState[trigger.id]) _windowState[trigger.id].status = 'idle'; }, 500);
      } else if (elapsed >= trigger.windowDurSec) {
        ws.status      = 'failed';
        ws.lastFiredAt = totalSec;
        executeAction(trigger.failureAction, trigger.name, '✗ failed');
        setTimeout(() => { if (_windowState[trigger.id]) _windowState[trigger.id].status = 'idle'; }, 500);
      }
    }
  }
}



// ── CRUD ─────────────────────────────────────────────────────────────────────
export function addTrigger(partial = {}) {
  const trig = normalizeTrigger(partial);
  if (!state.session.triggers) state.session.triggers = [];
  history.push();
  state.session.triggers.push(trig);
  persist();
  return trig;
}

export function updateTrigger(id, patch) {
  const trig = state.session.triggers?.find(t => t.id === id);
  if (!trig) return;
  if (patch.condition)      Object.assign(trig.condition,      patch.condition);
  if (patch.successAction)  Object.assign(trig.successAction,  patch.successAction);
  if (patch.failureAction)  Object.assign(trig.failureAction,  patch.failureAction);
  // Strip immutable id field before shallow-merging the rest
  const { condition: _c, successAction: _sa, failureAction: _fa, id: _id, ...rest } = patch;
  Object.assign(trig, rest);
  persist();
}

export function deleteTrigger(id) {
  if (!state.session.triggers) return;
  history.push();
  state.session.triggers = state.session.triggers.filter(t => t.id !== id);
  delete _windowState[id];
  persist();
}

export function toggleTrigger(id) {
  const trig = state.session.triggers?.find(t => t.id === id);
  if (trig) { history.push(); trig.enabled = !trig.enabled; persist(); }
}

// ── Render active window status (for HUD / live meters) ─────────────────────
export function getActiveWindowStatuses() {
  const triggers = state.session?.triggers ?? [];
  return triggers
    .filter(t => t.enabled && (_windowState[t.id]?.status === 'open'))
    .map(t => ({
      name:      t.name,
      remaining: Math.max(0, t.windowDurSec - ((state.engineState?.sessionTime ?? 0) - (_windowState[t.id]?.openedAt ?? 0))),
    }));
}

// ── Inspector panel renderer ─────────────────────────────────────────────────
export function renderTriggersInspector() {
  const triggers = state.session?.triggers ?? [];
  const METRICS  = ['attention','intensity','speed','engagement','sessionTime','loopCount'];
  const OPS      = ['<','>','<=','>=','=='];
  const ACTIONS  = ['none','pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene','setVar'];
  const ACTION_LABELS = { none:'Nothing', pause:'Pause', resume:'Resume', stop:'Stop',
    injectMacro:'Inject macro (slot 1–5)', setIntensity:'Set intensity (0–2)', setSpeed:'Set speed (0.25–4)',
    nextScene:'Next scene (sequential)', gotoScene:'Go to scene…', setVar:'Set variable' };

  // Render a param input that shows/hides based on action type
  function paramInput(prefix, action) {
    const t = action.type;
    if (t === 'injectMacro') {
      return `<input type="number" class="trig-param" data-trig-param="${prefix}"
        value="${action.param ?? 1}" min="1" max="5" step="1"
        placeholder="Slot 1–5" title="Macro slot number (1–5)"
        style="font-size:11px;width:70px;margin-top:3px" />`;
    }
    if (t === 'setIntensity') {
      return `<input type="number" class="trig-param" data-trig-param="${prefix}"
        value="${action.param ?? 1}" min="0" max="2" step="0.05"
        placeholder="0–2" title="Intensity value (0 = off, 1 = normal, 2 = max)"
        style="font-size:11px;width:70px;margin-top:3px" />`;
    }
    if (t === 'setSpeed') {
      return `<input type="number" class="trig-param" data-trig-param="${prefix}"
        value="${action.param ?? 1}" min="0.25" max="4" step="0.05"
        placeholder="0.25–4" title="Speed multiplier"
        style="font-size:11px;width:70px;margin-top:3px" />`;
    }
    if (t === 'gotoScene') {
      const scenes = state.session.scenes ?? [];
      const opts = scenes.map(s =>
        `<option value="${s.id}"${action.param === s.id ? ' selected' : ''}>${esc(s.name)}</option>`
      ).join('');
      return `<select class="trig-param" data-trig-param="${prefix}"
        style="font-size:11px;margin-top:3px;width:100%"
        title="Target scene to jump to">
        <option value="">— pick a scene —</option>${opts}
      </select>`;
    }
    if (t === 'setVar') {
      const varNames = Object.keys(state.session.variables ?? {});
      const hint = varNames.length ? varNames.map(n => `${n}=…`).join(', ') : 'define variables in Session tab';
      return `<input type="text" class="trig-param trig-str-param" data-trig-param="${prefix}"
        value="${esc(typeof action.param === 'string' ? action.param : '')}"
        placeholder="name=value" title="Variable name and value, e.g. score=10"
        style="font-size:11px;width:130px;margin-top:3px" />
        <span style="font-size:9.5px;color:var(--text3);margin-top:2px;display:block">e.g. ${esc(hint)}</span>`;
    }
    return ''; // no param needed for other action types
  }

  const rows = triggers.map(tr => `
    <div class="trig-row" data-trig-id="${tr.id}" style="
      background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);
      border-radius:6px;padding:8px 10px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <input type="checkbox" class="trig-enabled" data-trig-id="${tr.id}" ${tr.enabled?'checked':''} style="margin:0" />
        <input type="text" class="trig-name" data-trig-id="${tr.id}" value="${esc(tr.name)}"
          style="flex:1;font-size:11px;background:transparent;border:none;color:var(--text)" />
        <button class="trig-del" data-trig-id="${tr.id}"
          style="background:transparent;border:none;color:var(--danger,#e05050);cursor:pointer;font-size:14px;padding:0">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:11px;margin-bottom:4px">
        <div class="insp-row"><span>Opens at (s)</span>
          <input type="number" class="trig-at" data-trig-id="${tr.id}" value="${tr.atSec}" min="0" step="1" style="font-size:11px;width:60px" /></div>
        <div class="insp-row"><span>Window (s)</span>
          <input type="number" class="trig-win" data-trig-id="${tr.id}" value="${tr.windowDurSec}" min="1" step="1" style="font-size:11px;width:60px" /></div>
        <div class="insp-row"><span>Cooldown (s)</span>
          <input type="number" class="trig-cooldown" data-trig-id="${tr.id}" value="${tr.cooldownSec}" min="0" step="1" style="font-size:11px;width:60px" /></div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Condition to count as success:</div>
      <div style="display:grid;grid-template-columns:1fr 44px 1fr;gap:4px;margin-bottom:6px">
        <select class="trig-metric" data-trig-id="${tr.id}" style="font-size:11px">
          ${METRICS.map(m => `<option value="${m}"${tr.condition.metric===m?' selected':''}>${m}</option>`).join('')}
        </select>
        <select class="trig-op" data-trig-id="${tr.id}" style="font-size:11px">
          ${OPS.map(o => `<option value="${o}"${tr.condition.op===o?' selected':''}>${o}</option>`).join('')}
        </select>
        <input type="number" class="trig-val" data-trig-id="${tr.id}" value="${tr.condition.value}" step="0.05" style="font-size:11px" />
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:10.5px;color:var(--text3)">
        <span style="align-self:center;color:#7dc87a">✓ Success:</span>
        <div>
          <select class="trig-success" data-trig-id="${tr.id}" style="font-size:11px;width:100%">
            ${ACTIONS.map(a => `<option value="${a}"${tr.successAction.type===a?' selected':''}>${ACTION_LABELS[a]}</option>`).join('')}
          </select>
          ${paramInput('success_' + tr.id, tr.successAction)}
        </div>
        <span style="align-self:center;color:#e05050">✗ Failure:</span>
        <div>
          <select class="trig-fail" data-trig-id="${tr.id}" style="font-size:11px;width:100%">
            ${ACTIONS.map(a => `<option value="${a}"${tr.failureAction.type===a?' selected':''}>${ACTION_LABELS[a]}</option>`).join('')}
          </select>
          ${paramInput('fail_' + tr.id, tr.failureAction)}
        </div>
      </div>
    </div>`).join('');

  return `
    <div class="insp-block-name">⏱ Trigger Windows</div>
    <p style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:10px">
      Time-bounded interaction checks. A window opens at a session time and fires a success
      or failure action based on whether the condition is met within the window.
    </p>
    <div id="trigListBody">${rows || '<div class="sb-empty">No triggers yet.</div>'}</div>
    <button id="addTrigBtn" style="width:100%;font-size:11px;margin-top:6px">+ Add trigger window</button>`;
}

export function attachTriggersInspectorEvents() {
  const body = document.getElementById('inspBody');
  if (!body) return;

  body.querySelector('#addTrigBtn')?.addEventListener('click', () => {
    addTrigger({ name: `Trigger ${(state.session.triggers?.length ?? 0) + 1}` });
    import('./ui.js').then(({ renderInspector }) => renderInspector());
  });

  body.querySelectorAll('.trig-enabled').forEach(el => el.addEventListener('change', () => {
    toggleTrigger(el.dataset.trigId);
    // Re-render sidebar so the enabled/total badge updates immediately
    import('./ui.js').then(({ renderSidebar }) => renderSidebar());
  }));
  body.querySelectorAll('.trig-del').forEach(el => el.addEventListener('click', () => {
    deleteTrigger(el.dataset.trigId);
    import('./ui.js').then(({ renderInspector, renderSidebar }) => { renderInspector(); renderSidebar(); });
  }));
  body.querySelectorAll('.trig-name').forEach(el => {
    el.addEventListener('input', () => {
      _snapOnce(el); // debounce: one snapshot per focus session, not per keystroke
      updateTrigger(el.dataset.trigId, { name: el.value });
    });
  });
  const safeNum = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
  body.querySelectorAll('.trig-at').forEach(el       => el.addEventListener('input', () => { _snapOnce(el); updateTrigger(el.dataset.trigId, { atSec:        Math.max(0, safeNum(el.value)) }); }));
  body.querySelectorAll('.trig-win').forEach(el      => el.addEventListener('input', () => { _snapOnce(el); updateTrigger(el.dataset.trigId, { windowDurSec: Math.max(1, safeNum(el.value, 5)) }); }));
  body.querySelectorAll('.trig-cooldown').forEach(el => el.addEventListener('input', () => { _snapOnce(el); updateTrigger(el.dataset.trigId, { cooldownSec:  Math.max(0, safeNum(el.value)) }); }));
  body.querySelectorAll('.trig-metric').forEach(el   => el.addEventListener('change', () => { history.push(); updateTrigger(el.dataset.trigId, { condition: { metric: el.value } }); }));
  body.querySelectorAll('.trig-op').forEach(el       => el.addEventListener('change', () => { history.push(); updateTrigger(el.dataset.trigId, { condition: { op: el.value } }); }));
  body.querySelectorAll('.trig-val').forEach(el      => el.addEventListener('input', () => { _snapOnce(el); updateTrigger(el.dataset.trigId, { condition: { value: safeNum(el.value) } }); }));
  // Re-render inspector when action type changes so param inputs appear/disappear
  body.querySelectorAll('.trig-success').forEach(el => el.addEventListener('change', () => {
    history.push(); // one-shot: action type change is always a discrete undo point
    updateTrigger(el.dataset.trigId, { successAction: { type: el.value, param: null } });
    import('./ui.js').then(({ renderInspector }) => renderInspector());
  }));
  body.querySelectorAll('.trig-fail').forEach(el => el.addEventListener('change', () => {
    history.push();
    updateTrigger(el.dataset.trigId, { failureAction: { type: el.value, param: null } });
    import('./ui.js').then(({ renderInspector }) => renderInspector());
  }));
  // Param inputs — key encodes "success_<trigId>" or "fail_<trigId>"
  body.querySelectorAll('.trig-param').forEach(el => {
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
    const key = el.dataset.trigParam; // e.g. "success_b_abc123"
    const sep = key.indexOf('_');
    const side = key.slice(0, sep);   // "success" or "fail"
    const trigId = key.slice(sep + 1);
    const isSceneSelect = el.tagName === 'SELECT';
    const isStrParam    = el.classList.contains('trig-str-param');
    const val = el.value === '' ? null
              : isSceneSelect ? el.value
              : isStrParam    ? el.value
              : Number(el.value);
    if (side === 'success') updateTrigger(trigId, { successAction: { param: val } });
    else                    updateTrigger(trigId, { failureAction: { param: val } });
    });
  });
}
