// ── variables.js ───────────────────────────────────────────────────────────
// Phase 5.2 — Advanced Variables
//
// User-defined runtime variables that live in the session and can be:
//   • read in template strings:  {{myVar}}
//   • set by rule/trigger actions: setVar { name, value }
//   • read by rule conditions:  via getMetric('var:name') extension
//   • managed in the inspector Variables panel
//
// Variable shape stored in state.session.variables:
//   { [name]: { value: any, type: 'number'|'string'|'boolean', description?: string } }
//
// Names: lowercase alphanumeric + underscore, 1–32 chars (e.g. "arousal_level")
// Values: numbers, strings, or booleans (no objects)

import { state, persist, esc } from './state.js';
import { notify } from './notify.js';
import { history } from './history.js';

// ── Validation ─────────────────────────────────────────────────────────────────
export const VAR_NAME_RE = /^[a-z_][a-z0-9_]{0,31}$/;

export function validateVarName(name) {
  if (typeof name !== 'string') return 'Variable name must be a string.';
  if (!VAR_NAME_RE.test(name))  return 'Name must be 1–32 lowercase alphanumeric/underscore chars, starting with a letter or underscore.';
  return null; // valid
}

function coerce(value, type) {
  if (type === 'number')  return typeof value === 'number' ? value : Number(value) || 0;
  if (type === 'boolean') return typeof value === 'boolean' ? value : Boolean(value);
  return String(value ?? '');
}

// ── Normalizer (called by normalizeSession) ────────────────────────────────────
export function normalizeVariables(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [name, def] of Object.entries(raw)) {
    if (validateVarName(name)) continue; // skip invalid names
    const type = ['number', 'string', 'boolean'].includes(def?.type) ? def.type : 'number';
    out[name] = {
      type,
      value:       coerce(def?.value ?? 0, type),
      description: typeof def?.description === 'string' ? def.description.slice(0, 120) : '',
    };
  }
  return out;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
export function getVariable(name) {
  return state.session.variables?.[name]?.value ?? null;
}

export function setVariable(name, value) {
  const vars = state.session.variables;
  if (!vars || !(name in vars)) {
    notify.warn(`Variable "${name}" does not exist. Create it in the Variables panel first.`);
    return false;
  }
  vars[name].value = coerce(value, vars[name].type);
  persist();
  return true;
}

export function addVariable(name, type = 'number', description = '') {
  const err = validateVarName(name);
  if (err) { notify.warn(err); return false; }
  if (!state.session.variables) state.session.variables = {};
  if (name in state.session.variables) { notify.warn(`Variable "${name}" already exists.`); return false; }
  history.push();
  state.session.variables[name] = { type, value: type === 'number' ? 0 : type === 'boolean' ? false : '', description };
  persist();
  return true;
}

export function deleteVariable(name) {
  if (!state.session.variables?.[name]) return false;
  history.push();
  delete state.session.variables[name];
  persist();
  return true;
}

export function updateVariable(name, patch) {
  const v = state.session.variables?.[name];
  if (!v) return false;
  if (patch.description !== undefined) v.description = String(patch.description).slice(0, 120);
  if (patch.value !== undefined)       v.value = coerce(patch.value, v.type);
  persist();
  return true;
}

export function getAllVariables() {
  return Object.entries(state.session.variables ?? {}).map(([name, def]) => ({ name, ...def }));
}

// ── Template variable resolver integration ─────────────────────────────────────
// Returns an object mapping all variable names to their current values,
// ready to be spread into the resolveTemplateVars substitution map.
export function getVariableTemplateMap() {
  const vars = state.session.variables ?? {};
  const map = {};
  for (const [name, def] of Object.entries(vars)) {
    map[name] = def.type === 'number'  ? String(def.value)
              : def.type === 'boolean' ? (def.value ? 'true' : 'false')
              : String(def.value);
  }
  return map;
}

// ── Inspector panel renderer ───────────────────────────────────────────────────
// Shared: wire .var-value change and .var-del click for any container
function _attachValueHandlers(el, containerId) {
  el.querySelectorAll('.var-value').forEach(inp => {
    const event = inp.type === 'checkbox' ? 'change' : 'input';
    inp.addEventListener(event, e => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      updateVariable(e.target.dataset.varName, { value: val });
      // Refresh sibling sidebar if this was the inspector
      if (containerId !== 'sidebarVariables') renderVariablesPanel('sidebarVariables');
    });
  });
  el.querySelectorAll('.var-del').forEach(btn => {
    btn.addEventListener('click', e => {
      deleteVariable(e.target.dataset.varName);
      renderVariablesPanel(containerId);
      if (containerId !== 'sidebarVariables') renderVariablesPanel('sidebarVariables');
    });
  });
}

export function renderVariablesPanel(containerId = 'variablesPanel') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const vars = getAllVariables();
  const isSidebar = containerId === 'sidebarVariables';

  if (isSidebar) {
    // Compact sidebar: show variable chips + quick-edit inline
    el.innerHTML = `<div style="padding:4px 10px 6px">
      ${vars.length === 0
        ? `<div style="font-size:10px;color:var(--text3);font-style:italic;padding:2px 0">No variables. Add in inspector.</div>`
        : vars.map(v => `
          <div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:0.5px solid rgba(255,255,255,0.04)">
            <span style="font-size:9.5px;font-family:var(--mono);color:#7fb0ff;min-width:70px;overflow:hidden;text-overflow:ellipsis" title="${esc(v.name)}">{{${esc(v.name)}}}</span>
            <input class="var-value" data-var-name="${esc(v.name)}"
              type="${v.type === 'number' ? 'number' : v.type === 'boolean' ? 'checkbox' : 'text'}"
              ${v.type === 'boolean' ? (v.value ? 'checked' : '') : `value="${esc(String(v.value))}"`}
              style="flex:1;font-size:10px;padding:2px 5px;${v.type === 'boolean' ? 'width:16px;flex:none' : ''}"
              title="${esc(v.description || v.name)}" />
          </div>`).join('')}
    </div>`;
    _attachValueHandlers(el, containerId);
    return;
  }

  el.innerHTML = `
    <div class="insp-block-name">⚙ Variables</div>
    <p style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:10px">
      User-defined runtime variables. Reference them in text/TTS blocks as
      <code style="font-size:10px;background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px">{{varName}}</code>
      or set them via rule actions.
    </p>
    <div id="varList">
      ${vars.length === 0
        ? `<p style="font-size:11px;color:var(--text3)">No variables defined. Add one below.</p>`
        : vars.map(v => `
          <div class="var-row" data-var-name="${esc(v.name)}" style="
            display:flex;align-items:center;gap:5px;margin-bottom:5px;
            padding:6px 8px;border-radius:6px;
            background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07)">
            <span style="font-size:10.5px;font-family:var(--mono);color:#7fb0ff;min-width:80px;flex-shrink:0">{{${esc(v.name)}}}</span>
            <span style="font-size:9.5px;color:var(--text3);margin-right:2px">${v.type}</span>
            <input class="var-value" data-var-name="${esc(v.name)}" type="${v.type === 'number' ? 'number' : v.type === 'boolean' ? 'checkbox' : 'text'}"
              ${v.type === 'boolean' ? (v.value ? 'checked' : '') : `value="${esc(String(v.value))}"`}
              style="flex:1;font-size:11px;${v.type === 'boolean' ? 'width:20px;flex:none' : ''}"
              title="${esc(v.description || v.name)}" />
            <button class="var-del" data-var-name="${esc(v.name)}"
              style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:13px;padding:0;line-height:1"
              title="Delete variable">×</button>
          </div>`).join('')}
    </div>
    <div style="display:flex;gap:5px;margin-top:8px">
      <input id="varNewName" type="text" placeholder="variable_name" maxlength="32"
        style="flex:1;font-size:11px;font-family:var(--mono)" />
      <select id="varNewType" style="font-size:11px;width:80px">
        <option value="number">number</option>
        <option value="string">string</option>
        <option value="boolean">boolean</option>
      </select>
      <button id="varAddBtn" class="btn-accent" style="font-size:11px;padding:4px 10px">Add</button>
    </div>`;

  // ── Events ────────────────────────────────────────────────────────────
  _attachValueHandlers(el, containerId);
  el.querySelector('#varAddBtn')?.addEventListener('click', () => {
    const nameEl = el.querySelector('#varNewName');
    const typeEl = el.querySelector('#varNewType');
    const name = nameEl?.value?.trim().toLowerCase();
    if (!name) { notify.warn('Enter a variable name.'); return; }
    if (addVariable(name, typeEl?.value ?? 'number')) {
      nameEl.value = '';
      renderVariablesPanel(containerId);
      if (containerId !== 'sidebarVariables') renderVariablesPanel('sidebarVariables');
    }
  });
  el.querySelector('#varNewName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') el.querySelector('#varAddBtn')?.click();
  });
}
