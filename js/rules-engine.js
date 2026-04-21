// ── rules-engine.js ────────────────────────────────────────────────────────
// Behavioral scripting runtime. Evaluates a list of rules every tick and
// fires actions when conditions are met for their required duration.
//
// ROADMAP Phase 1 — Behavioral Scripting System
//
// Rule schema (stored in session.rules[]):
// {
//   id:          uid(),
//   enabled:     true,
//   name:        'Pause on attention loss',
//   condition: {
//     metric:  'attention' | 'intensity' | 'speed' | 'engagement' |
//              'sessionTime' | 'loopCount',
//     op:      '<' | '>' | '<=' | '>=' | '==',
//     value:   number,
//   },
//   durationSec: 3,      // condition must hold for this long before firing
//   cooldownSec: 30,     // min seconds between re-fires (0 = no cooldown)
//   action: {
//     type:  'pause' | 'resume' | 'stop' | 'injectMacro' |
//            'setIntensity' | 'setSpeed' | 'nextScene',
//     param: any,        // macroId | intensity value | speed value
//   },
// }

import { state, persist, uid } from './state.js';
import { notify }              from './notify.js';
import { getMetric, evalCondition } from './state-engine.js';
import { injectMacro, getSlotMacro } from './macros.js';
import { setLiveIntensity, setLiveSpeed } from './live-control.js';
import { history }             from './history.js';

// ── Rule normalizer ──────────────────────────────────────────────────────────
export function normalizeRule(r) {
  return {
    id:          typeof r?.id === 'string' && r.id ? r.id : uid(),
    enabled:     r?.enabled !== false,
    name:        typeof r?.name === 'string' && r.name ? r.name : 'Rule',
    condition: {
      metric: ['attention','intensity','speed','engagement','sessionTime','loopCount']
               .includes(r?.condition?.metric) ? r.condition.metric : 'attention',
      op:     ['<','>','<=','>=','=='].includes(r?.condition?.op) ? r.condition.op : '<',
      value:  Number.isFinite(r?.condition?.value) ? r.condition.value : 0.4,
    },
    durationSec: Number.isFinite(r?.durationSec) ? Math.max(0, r.durationSec) : 0,
    cooldownSec: Number.isFinite(r?.cooldownSec) ? Math.max(0, r.cooldownSec) : 0,
    action: {
      type:  ['pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene','setVar']
              .includes(r?.action?.type) ? r.action.type : 'pause',
      param: r?.action?.param ?? null,
    },
    // Optional metadata — preserved if set (e.g. _modeSource from session-modes.js)
    ...(r?._modeSource ? { _modeSource: r._modeSource } : {}),
  };
}

// ── Runtime tracking per rule ────────────────────────────────────────────────
// _ruleState[id] = { conditionHeldSec, lastFiredAt }
const _ruleState = {};

function getRuleState(id) {
  if (!_ruleState[id]) _ruleState[id] = { conditionHeldSec: 0, lastFiredAt: -Infinity };
  return _ruleState[id];
}

export function clearRuleState() {
  Object.keys(_ruleState).forEach(k => delete _ruleState[k]);
}

// ── Condition evaluation ─────────────────────────────────────────────────────


// ── Action execution ─────────────────────────────────────────────────────────
async function executeAction(rule) {
  const { type, param } = rule.action;
  const name = rule.name;

  switch (type) {
    case 'pause':
      import('./playback.js').then(({ pausePlayback }) => pausePlayback());
      notify.info(`Rule "${name}": paused`);
      break;
    case 'resume':
      import('./playback.js').then(({ resumePlayback }) => resumePlayback());
      notify.info(`Rule "${name}": resumed`);
      break;
    case 'stop':
      import('./playback.js').then(({ stopPlayback }) => stopPlayback());
      notify.info(`Rule "${name}": stopped`);
      break;
    case 'nextScene':
      // scenes.js imports playback.js which imports rules-engine.js — must stay lazy
      import('./scenes.js').then(({ skipToNextScene }) => skipToNextScene());
      notify.info(`Rule "${name}": next scene`);
      break;
    case 'gotoScene':
      if (param) {
        import('./playback.js').then(({ skipToScene }) => {
          skipToScene(param);
          const scene = state.session.scenes?.find(s => s.id === param);
          if (scene) import('./state-blocks.js').then(({ applyStateProfile }) => applyStateProfile(scene));
        });
        notify.info(`Rule "${name}": jumped to scene`);
      } else {
        notify.warn(`Rule "${name}": gotoScene has no target scene configured`);
      }
      break;
    case 'setVar': {
      // param: { name: string, value: any } or serialised as "name=value"
      let varName, varValue;
      if (param && typeof param === 'object') {
        varName  = param.name;
        varValue = param.value;
      } else if (typeof param === 'string' && param.includes('=')) {
        const eq = param.indexOf('=');
        varName  = param.slice(0, eq).trim();
        varValue = param.slice(eq + 1).trim();
      }
      if (varName) {
        import('./variables.js').then(({ setVariable }) => {
          const ok = setVariable(varName, varValue);
          if (ok) notify.info(`Rule "${name}": ${varName} = ${varValue}`);
        });
      } else {
        notify.warn(`Rule "${name}": setVar has no variable configured`);
      }
      break;
    }
    case 'injectMacro': {
      if (!param && param !== 0) break;
      let macroId = typeof param === 'number' && param >= 1 && param <= 5
        ? getSlotMacro(param)?.id
        : param;
      if (macroId) {
        injectMacro(macroId);
        notify.info(`Rule "${name}": injected macro`);
      } else {
        notify.warn(`Rule "${name}": macro not found (slot or id may be deleted)`);
      }
      break;
    }
    case 'setIntensity': {
      const val = Math.max(0, Math.min(2, Number.isFinite(Number(param)) ? Number(param) : 1));
      setLiveIntensity(val);
      notify.info(`Rule "${name}": intensity → ${Math.round(val * 100)}%`);
      break;
    }
    case 'setSpeed': {
      const val = Math.max(0.25, Math.min(4, Number.isFinite(Number(param)) ? Number(param) : 1));
      setLiveSpeed(val);
      notify.info(`Rule "${name}": speed → ${val.toFixed(2)}×`);
      break;
    }
    case 'showMessage': {
      if (!param) break;
      // Create a brief on-screen overlay message
      const msg = String(param).slice(0, 200);
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        z-index:8000;background:rgba(4,4,7,0.88);border:0.5px solid rgba(196,154,60,0.4);
        border-radius:12px;padding:18px 28px;font-size:18px;color:#f0ece8;
        font-family:var(--serif,'Georgia',serif);font-style:italic;text-align:center;
        max-width:60vw;backdrop-filter:blur(8px);pointer-events:none;
        animation:fadeInOut 3s ease forwards`;
      el.textContent = msg;
      // Inject keyframes if not already present
      if (!document.querySelector('#rule-msg-style')) {
        const s = document.createElement('style');
        s.id = 'rule-msg-style';
        s.textContent = '@keyframes fadeInOut{0%{opacity:0}10%{opacity:1}70%{opacity:1}100%{opacity:0}}';
        document.head.appendChild(s);
      }
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3200);
      notify.info(`Rule "${name}": message shown`);
      break;
    }
    case 'flashColor': {
      const color = (typeof param === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(param)) ? param : '#ff0000';
      const stage = document.getElementById('mainStage');
      if (stage) {
        const flash = document.createElement('div');
        flash.style.cssText = `position:absolute;inset:0;background:${color};opacity:0.6;
          pointer-events:none;z-index:50;border-radius:inherit;
          animation:flashFade 0.5s ease forwards`;
        if (!document.querySelector('#rule-flash-style')) {
          const s = document.createElement('style');
          s.id = 'rule-flash-style';
          s.textContent = '@keyframes flashFade{0%{opacity:0.6}100%{opacity:0}}';
          document.head.appendChild(s);
        }
        stage.appendChild(flash);
        setTimeout(() => flash.remove(), 520);
      }
      break;
    }
  }
}

// ── Main tick — called every RAF frame ───────────────────────────────────────
export function tickRulesEngine(frameSec) {
  const rules = state.session?.rules;
  if (!rules?.length || !state.runtime) return;
  // Use totalSec (absolute clock) so cooldowns survive loop resets.
  const now = state.engineState.totalSec;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const rs = getRuleState(rule.id);
    const condMet = evalCondition(rule.condition);

    if (condMet) {
      rs.conditionHeldSec += frameSec;
      if (rs.conditionHeldSec >= rule.durationSec) {
        const cooldownElapsed = now - rs.lastFiredAt;
        if (cooldownElapsed >= rule.cooldownSec || rs.lastFiredAt === -Infinity) {
          rs.lastFiredAt     = now;
          rs.conditionHeldSec = 0;
          executeAction(rule);
        }
      }
    } else {
      rs.conditionHeldSec = 0;
    }
  }
}

// ── Behavioral Conditioning Presets (ROADMAP Phase 3.10) ────────────────────
// Named rule templates for common reward/correction patterns.
// These are fully normalized and ready to push into session.rules.

export const CONDITIONING_PRESETS = [
  {
    id:    '_preset_reward_focus',
    name:  'Reward sustained focus',
    description: 'Injects reward macro after 10s of sustained attention',
    rule: { name: 'Reward: sustained attention', enabled: true,
      condition: { metric: 'attention', op: '>=', value: 0.9 }, durationSec: 10, cooldownSec: 60,
      action: { type: 'injectMacro', param: 1 } }, // slot 1 = reward macro
  },
  {
    id:    '_preset_correct_loss',
    name:  'Correct attention loss',
    description: 'Pauses and injects recenter macro after 3s of lost attention',
    rule: { name: 'Correct: attention lost', enabled: true,
      condition: { metric: 'attention', op: '<', value: 0.3 }, durationSec: 3, cooldownSec: 30,
      action: { type: 'pause', param: null } },
  },
  {
    id:    '_preset_escalate_engagement',
    name:  'Escalate on high engagement',
    description: 'Increases intensity when engagement is consistently high',
    rule: { name: 'Escalate: high engagement', enabled: true,
      condition: { metric: 'engagement', op: '>=', value: 0.8 }, durationSec: 15, cooldownSec: 90,
      action: { type: 'setIntensity', param: 1.5 } },
  },
  {
    id:    '_preset_recover_low',
    name:  'Recover on low engagement',
    description: 'Reduces intensity when engagement drops to help re-engage',
    rule: { name: 'Recover: low engagement', enabled: true,
      condition: { metric: 'engagement', op: '<', value: 0.3 }, durationSec: 8, cooldownSec: 60,
      action: { type: 'setIntensity', param: 0.6 } },
  },
  {
    id:    '_preset_scene_advance',
    name:  'Auto-advance on engagement peak',
    description: 'Advances to next scene when engagement peaks',
    rule: { name: 'Auto-advance: engagement peak', enabled: true,
      condition: { metric: 'engagement', op: '>=', value: 0.95 }, durationSec: 5, cooldownSec: 120,
      action: { type: 'nextScene', param: null } },
  },
];

export function applyPreset(presetId) {
  const preset = CONDITIONING_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;
  return addRule(preset.rule);
}
export function addRule(partial = {}) {
  const rule = normalizeRule(partial);
  if (!state.session.rules) state.session.rules = [];
  history.push();
  state.session.rules.push(rule);
  persist();
  return rule;
}

export function updateRule(id, patch) {
  const rule = state.session.rules?.find(r => r.id === id);
  if (!rule) return;
  // Deep-merge condition and action
  if (patch.condition) Object.assign(rule.condition, patch.condition);
  if (patch.action)    Object.assign(rule.action,    patch.action);
  // Strip immutable fields before shallow-merging the rest
  const { condition: _c, action: _a, id: _id, _modeSource: _ms, ...rest } = patch;
  Object.assign(rule, rest);
  persist();
}

export function deleteRule(id) {
  if (!state.session.rules) return;
  history.push();
  state.session.rules = state.session.rules.filter(r => r.id !== id);
  delete _ruleState[id];
  persist();
}

export function toggleRule(id) {
  const rule = state.session.rules?.find(r => r.id === id);
  if (rule) { history.push(); rule.enabled = !rule.enabled; persist(); }
}
