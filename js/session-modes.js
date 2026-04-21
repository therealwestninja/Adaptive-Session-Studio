// ── session-modes.js ────────────────────────────────────────────────────────
// Session Mode Presets — ROADMAP Phase 14 (Exposure Therapy) & Phase 15 (Mindfulness)
//
// Each mode applies a coherent combination of:
//   - rampSettings (intensity escalation curve)
//   - pacingSettings (speed modulation)
//   - rules (behavioral conditioning)
//
// Applying a mode adds its rules (named with a prefix so they're identifiable)
// and sets ramp/pacing settings. Existing rules are preserved.

import { state, persist } from './state.js';
import { notify }         from './notify.js';
import { history }        from './history.js';
import { normalizeRule }  from './rules-engine.js';
import { renderRampPanel }   from './intensity-ramp.js';
import { renderPacingPanel } from './dynamic-pacing.js';

// ── Mode definitions ─────────────────────────────────────────────────────────

export const SESSION_MODES = [
  {
    id:          'exposure',
    name:        'Exposure Therapy',
    description: 'Gradual escalation with automatic fallback on overload. Steady intensity increase with attention-aware pausing.',
    icon:        '📈',
    rampSettings: {
      enabled:   true,
      mode:      'time',
      startVal:  0.3,
      endVal:    1.4,
      curve:     'exponential',
      steps:     [],
      blendMode: 'max',
    },
    pacingSettings: {
      enabled:      false,
      minSpeed:     0.75,
      maxSpeed:     1.25,
      smoothingSec: 6,
      curve:        'linear',
      lockDuringSec: 0,
    },
    rules: [
      { name: '[Exposure] Pause on attention loss', enabled: true,
        condition: { metric: 'attention', op: '<', value: 0.25 }, durationSec: 5, cooldownSec: 45,
        action: { type: 'pause', param: null } },
      { name: '[Exposure] Fallback intensity on overload', enabled: true,
        condition: { metric: 'engagement', op: '<', value: 0.2 }, durationSec: 10, cooldownSec: 60,
        action: { type: 'setIntensity', param: 0.5 } },
    ],
  },
  {
    id:          'mindfulness',
    name:        'Mindfulness / Focus',
    description: 'Low-intensity, stable experience. Rewards sustained attention and reduces intensity on distraction. Best for beginners or cooldown sessions.',
    icon:        '🧘',
    rampSettings: {
      enabled:   true,
      mode:      'engagement',
      startVal:  0.2,
      endVal:    0.8,
      curve:     'sine',
      steps:     [],
      blendMode: 'replace',
    },
    pacingSettings: {
      enabled:      true,
      minSpeed:     0.5,
      maxSpeed:     0.9,
      smoothingSec: 8,
      curve:        'sine',
      lockDuringSec: 3,
    },
    rules: [
      { name: '[Mindfulness] Pause on distraction', enabled: true,
        condition: { metric: 'attention', op: '<', value: 0.3 }, durationSec: 4, cooldownSec: 30,
        action: { type: 'pause', param: null } },
      { name: '[Mindfulness] Reduce intensity on drift', enabled: true,
        condition: { metric: 'engagement', op: '<', value: 0.35 }, durationSec: 6, cooldownSec: 45,
        action: { type: 'setIntensity', param: 0.3 } },
    ],
  },
  {
    id:          'focus',
    name:        'Deep Focus',
    description: 'Balanced adaptive session. Rewards sustained engagement, corrects attention breaks, escalates for peak performance.',
    icon:        '🎯',
    rampSettings: {
      enabled:   true,
      mode:      'adaptive',
      startVal:  0.5,
      endVal:    1.6,
      curve:     'sine',
      steps:     [],
      blendMode: 'max',
    },
    pacingSettings: {
      enabled:      true,
      minSpeed:     0.75,
      maxSpeed:     1.5,
      smoothingSec: 5,
      curve:        'exponential',
      lockDuringSec: 2,
    },
    rules: [
      { name: '[Focus] Pause on attention break', enabled: true,
        condition: { metric: 'attention', op: '<', value: 0.3 }, durationSec: 3, cooldownSec: 30,
        action: { type: 'pause', param: null } },
      { name: '[Focus] Escalate on peak engagement', enabled: true,
        condition: { metric: 'engagement', op: '>=', value: 0.85 }, durationSec: 12, cooldownSec: 90,
        action: { type: 'setIntensity', param: 1.4 } },
      { name: '[Focus] Recover from disengagement', enabled: true,
        condition: { metric: 'engagement', op: '<', value: 0.25 }, durationSec: 8, cooldownSec: 60,
        action: { type: 'setIntensity', param: 0.7 } },
    ],
  },
  {
    id:          'freerun',
    name:        'Free Run',
    description: 'No adaptive behavior. Manual control only. Clears all ramp/pacing settings.',
    icon:        '▶',
    rampSettings:   null,
    pacingSettings: null,
    rules: [],
  },

  // ── Purpose-built modes ───────────────────────────────────────────────────
  {
    id:          'induction',
    name:        'Guided Induction',
    description: 'Hypnosis and trance work. Very slow engagement ramp, no abrupt interruptions. Pauses gently on attention breaks to deepen the trance rather than breaking it.',
    icon:        '🌀',
    rampSettings: {
      enabled:   true,
      mode:      'engagement',
      startVal:  0.1,
      endVal:    0.7,
      curve:     'sine',
      steps:     [],
      blendMode: 'replace',
    },
    pacingSettings: {
      enabled:       true,
      minSpeed:      0.3,
      maxSpeed:      0.65,
      smoothingSec:  12,
      curve:         'sine',
      lockDuringSec: 8,
    },
    rules: [
      { name: '[Induction] Slow down on attention break', enabled: true,
        condition: { metric: 'attention', op: '<', value: 0.2 }, durationSec: 8, cooldownSec: 60,
        action: { type: 'setSpeed', param: 0.3 } },
      { name: '[Induction] Deepen on sustained focus', enabled: true,
        condition: { metric: 'attention', op: '>=', value: 0.8 }, durationSec: 15, cooldownSec: 90,
        action: { type: 'setIntensity', param: 0.8 } },
    ],
  },

  {
    id:          'conditioning',
    name:        'Behavioral Conditioning',
    description: 'Reward-and-correction loop. Escalates intensity for sustained compliance, reduces for breaks. Builds consistent behavioral patterns over repeat sessions.',
    icon:        '⚙',
    rampSettings: {
      enabled:   true,
      mode:      'adaptive',
      startVal:  0.4,
      endVal:    1.2,
      curve:     'exponential',
      steps:     [],
      blendMode: 'max',
    },
    pacingSettings: {
      enabled:       true,
      minSpeed:      0.8,
      maxSpeed:      1.6,
      smoothingSec:  4,
      curve:         'exponential',
      lockDuringSec: 2,
    },
    rules: [
      { name: '[Conditioning] Reward sustained attention', enabled: true,
        condition: { metric: 'attention', op: '>=', value: 0.75 }, durationSec: 10, cooldownSec: 45,
        action: { type: 'setIntensity', param: 1.2 } },
      { name: '[Conditioning] Correct attention break', enabled: true,
        condition: { metric: 'attention', op: '<', value: 0.3 }, durationSec: 4, cooldownSec: 30,
        action: { type: 'setIntensity', param: 0.4 } },
      { name: '[Conditioning] Escalate on peak compliance', enabled: true,
        condition: { metric: 'engagement', op: '>=', value: 0.9 }, durationSec: 12, cooldownSec: 90,
        action: { type: 'setIntensity', param: 1.5 } },
    ],
  },

  {
    id:          'training',
    name:        'Operator-Led Training',
    description: 'Designed for partner sessions. Conservative automatic behavior — operator controls intensity and pacing manually via Live Controls. Auto-safety pauses only on complete attention loss.',
    icon:        '🎛',
    rampSettings: {
      enabled:   true,
      mode:      'time',
      startVal:  0.3,
      endVal:    0.9,
      curve:     'linear',
      steps:     [],
      blendMode: 'replace',
    },
    pacingSettings: {
      enabled:       false,
      minSpeed:      0.5,
      maxSpeed:      2.0,
      smoothingSec:  3,
      curve:         'linear',
      lockDuringSec: 0,
    },
    rules: [
      { name: '[Training] Safety pause on loss', enabled: true,
        condition: { metric: 'attention', op: '<', value: 0.15 }, durationSec: 6, cooldownSec: 60,
        action: { type: 'pause', param: null } },
    ],
  },

  {
    id:          'surrender',
    name:        'Deep Surrender',
    description: 'High-trust, full-escalation solo mode. Continuous climb with no automatic pauses. Surrender to the experience — use the emergency stop if you need to break.',
    icon:        '🌊',
    rampSettings: {
      enabled:   true,
      mode:      'time',
      startVal:  0.2,
      endVal:    2.0,
      curve:     'exponential',
      steps:     [],
      blendMode: 'max',
    },
    pacingSettings: {
      enabled:       true,
      minSpeed:      0.5,
      maxSpeed:      2.0,
      smoothingSec:  6,
      curve:         'exponential',
      lockDuringSec: 0,
    },
    rules: [],
  },

  // ── Pleasure Training ──────────────────────────────────────────────────────
  // Classical conditioning: haptic reward tied to attention peaks; progressive
  // intensity increase per loop; edge-and-hold dynamics.
  {
    id:          'pleasure_training',
    icon:        '🎯',
    name:        'Pleasure Training',
    description: 'Reward-based conditioning: haptic intensity rises with sustained attention, drops on drift. Each loop escalates. Builds powerful focus-arousal association.',
    rampSettings: {
      enabled:       true,
      startPct:      30,
      peakPct:       95,
      curve:         'logarithmic',
      durationSec:   0,     // full session
      holdPct:       0,
    },
    pacingSettings: {
      enabled:       true,
      minSpeed:      0.5,
      maxSpeed:      3.5,
      smoothingSec:  3,
      curve:         'linear',
      lockDuringSec: 0,
    },
    rules: [
      {
        name:        'Reward peak attention',
        condition:   { metric: 'attention', op: '>=', value: 0.88 },
        durationSec: 5, cooldownSec: 45,
        action:      { type: 'setIntensity', param: 1.6 },
        enabled:     true,
      },
      {
        name:        'Edge on drift — reduce intensity',
        condition:   { metric: 'attention', op: '<', value: 0.35 },
        durationSec: 3, cooldownSec: 20,
        action:      { type: 'setIntensity', param: 0.2 },
        enabled:     true,
      },
      {
        name:        'Inject reward macro on sustained focus',
        condition:   { metric: 'attention', op: '>=', value: 0.92 },
        durationSec: 12, cooldownSec: 90,
        action:      { type: 'injectMacro', param: 1 },
        enabled:     true,
      },
      {
        name:        'Escalate on each loop',
        condition:   { metric: 'loopCount', op: '>', value: 0 },
        durationSec: 1, cooldownSec: 999,
        action:      { type: 'setIntensity', param: 1.3 },
        enabled:     true,
      },
    ],
  },

  // ── ASMR / Deep Relaxation ─────────────────────────────────────────────────
  // Ultra-low intensity, slow motion, designed for sleep-adjacent states.
  // No escalation rules — the session breathes slowly and stays gentle.
  {
    id:          'asmr',
    icon:        '🕯',
    name:        'ASMR / Deep Relaxation',
    description: 'Minimal stimulation mode for sleep, deep relaxation, or ASMR content. Very low intensity, slow pacing, no escalation — gentle drift and recovery arcs only.',
    rampSettings: {
      enabled:       true,
      startPct:      8,
      peakPct:       28,
      curve:         'linear',
      durationSec:   0,
      holdPct:       100,  // hold at low peak — no build
    },
    pacingSettings: {
      enabled:       true,
      minSpeed:      0.25,
      maxSpeed:      0.7,
      smoothingSec:  12,
      curve:         'linear',
      lockDuringSec: 0,
    },
    rules: [
      {
        name:        'Pause on attention loss',
        condition:   { metric: 'attention', op: '<', value: 0.2 },
        durationSec: 5, cooldownSec: 60,
        action:      { type: 'setIntensity', param: 0.05 },
        enabled:     true,
      },
      {
        name:        'Soft message on entry',
        condition:   { metric: 'sessionTime', op: '>', value: 2 },
        durationSec: 1, cooldownSec: 9999,
        action:      { type: 'showMessage', param: 'Breathe slowly… let everything soften.' },
        enabled:     true,
      },
    ],
  },
];

// ── Apply a session mode ──────────────────────────────────────────────────────
export function applySessionMode(modeId) {
  const mode = SESSION_MODES.find(m => m.id === modeId);
  if (!mode) {
    notify.error(`Unknown session mode: ${modeId}`);
    return;
  }

  history.push();

  // Apply ramp settings
  state.session.rampSettings = mode.rampSettings ? { ...mode.rampSettings } : null;

  // Apply pacing settings
  state.session.pacingSettings = mode.pacingSettings ? { ...mode.pacingSettings } : null;

  // Track which mode is active so suggestions and other systems can read it
  state.session.mode = modeId;

  // Remove any previous mode rules (identified by stable _modeSource metadata,
  // not display-name prefix — so renamed rules are still cleaned up correctly).
  if (!state.session.rules) state.session.rules = [];
  state.session.rules = state.session.rules.filter(r => !r._modeSource);

  // Add new mode rules, tagged with the mode id so future mode switches can find them.
  for (const ruleDef of (mode.rules ?? [])) {
    state.session.rules.push(normalizeRule({ ...ruleDef, _modeSource: modeId }));
  }

  persist();
  notify.success(`Session mode applied: ${mode.icon} ${mode.name}`);

  // Refresh idle screen and settings mode display to show the new mode
  import('./fullscreen-hud.js').then(({ renderIdleScreen }) => renderIdleScreen()).catch(() => {});
  // Update mode display in Settings → Display/HUD tab if it's open
  const modeEl = document.getElementById?.('s_currentModeDisplay');
  if (modeEl) {
    const label = mode.name;
    modeEl.textContent = `Active: ${label}`;
    modeEl.style.color = 'var(--accent)';
  }
  return mode;
}

// ── Mode selector HTML ────────────────────────────────────────────────────────
export function renderModeSelector(containerId = 'sessionModeSelector') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const isSidebar = containerId === 'sidebarModeSelector';
  const currentMode = state.session.mode ?? null;

  if (isSidebar) {
    // Compact sidebar: pill buttons for each mode, active highlighted
    el.innerHTML = `
      <div style="padding:4px 10px 6px">
        <div style="font-size:9px;color:var(--text3);margin-bottom:5px;letter-spacing:.06em">
          Active: <span style="color:var(--accent)">${currentMode
            ? (SESSION_MODES.find(m => m.id === currentMode)?.name ?? currentMode)
            : 'None'}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${SESSION_MODES.map(m => {
            const active = m.id === currentMode;
            return `<button class="mode-apply-btn sb-item" data-mode-id="${m.id}"
              style="justify-content:space-between;font-size:10.5px;padding:4px 8px;border-radius:5px;
                background:${active?'rgba(232,150,58,0.10)':'transparent'};
                border-left:2px solid ${active?'var(--accent)':'transparent'};
                color:${active?'var(--accent)':'var(--text2)'};cursor:pointer;text-align:left;width:100%">
              <span>${m.icon} ${m.name}</span>
            </button>`;
          }).join('')}
        </div>
      </div>`;
  } else {
    // Full inspector card list
    el.innerHTML = `
      <div class="insp-group-label" style="margin-bottom:6px">Session Mode</div>
      <p style="font-size:10.5px;color:var(--text2);line-height:1.5;margin-bottom:8px">
        Applies a preset combination of intensity ramp, pacing, and behavioral rules.
      </p>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${SESSION_MODES.map(m => `
          <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);
            border-radius:8px;padding:7px 10px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:11px;font-weight:600;color:var(--text)">${m.icon} ${m.name}</span>
              <button class="mode-apply-btn" data-mode-id="${m.id}"
                style="font-size:10.5px;padding:2px 9px">Apply</button>
            </div>
            <p style="font-size:10px;color:var(--text3);line-height:1.5;margin-top:3px">${m.description}</p>
          </div>`).join('')}
      </div>`;
  }

  el.querySelectorAll('.mode-apply-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      applySessionMode(btn.dataset.modeId);
      import('./ui.js').then(({ renderInspector, renderSidebar, syncTransportControls }) => {
        renderSidebar();
        renderInspector();
        syncTransportControls();
      });
      renderRampPanel('rampPanel');
      renderPacingPanel('pacingPanel');
    });
  });
}
