// ── state-blocks.js ────────────────────────────────────────────────────────
// Phase 5.1 — State Blocks
//
// State Blocks extend the Scenes system with optional high-level phase labels:
//   calm | build | peak | recovery
//
// When a scene with a stateType is entered during playback, the corresponding
// profile is applied as a NON-DESTRUCTIVE live-control override (same as the
// keyboard shortcuts [ / ] / , / . / R). The override does NOT rewrite the
// timeline; pressing R or manually adjusting the Live Control panel will
// override the automatic profile just like any other operator action.
//
// Profiles are intentionally conservative — they nudge, not force.
// Authors retain full control by leaving stateType null on any scene.

import { state } from './state.js';
import { notify } from './notify.js';

// ── State profiles ────────────────────────────────────────────────────────────
// All values are multipliers on the live-control scale (1.0 = neutral).
// intensityScale: applied to state.liveControl.intensityScale
// speedScale:     applied to state.liveControl.speedScale
//
// These are DEFAULTS. Future: authors can override per-scene in the inspector.

export const STATE_PROFILES = {
  calm: {
    label:          'Calm',
    icon:           '🌊',
    color:          '#5fa8d3',
    intensityScale: 0.50,
    speedScale:     0.75,
    description:    'Low intensity, gentle pace. Good for grounding or opening.',
  },
  build: {
    label:          'Build',
    icon:           '📈',
    color:          '#f0c040',
    intensityScale: 0.80,
    speedScale:     1.00,
    description:    'Moderate intensity, building pace. Transition toward peak.',
  },
  peak: {
    label:          'Peak',
    icon:           '⚡',
    color:          '#e05050',
    intensityScale: 1.20,
    speedScale:     1.25,
    description:    'High intensity, fast pace. The climactic phase.',
  },
  recovery: {
    label:          'Recovery',
    icon:           '🌱',
    color:          '#7dc87a',
    intensityScale: 0.30,
    speedScale:     0.60,
    description:    'Very gentle. Wind-down or cool-off phase.',
  },
};

export const STATE_TYPES = Object.keys(STATE_PROFILES);

// ── Apply a state profile when entering a scene ───────────────────────────────
// Called by scenes.js whenever gotoScene or skipToNextScene activates a scene.
// Only fires if the scene has a non-null stateType AND a live session is running.
export function applyStateProfile(scene) {
  if (!scene?.stateType) return;
  const profile = STATE_PROFILES[scene.stateType];
  if (!profile) return;
  if (!state.runtime || !state.liveControl) return; // no active session

  // Apply as non-destructive live-control override
  const prev = {
    intensity: state.liveControl.intensityScale,
    speed:     state.liveControl.speedScale,
  };

  state.liveControl.intensityScale = Math.max(0, Math.min(2, profile.intensityScale));
  state.liveControl.speedScale     = Math.max(0.1, Math.min(4, profile.speedScale));

  // Update the Live Control panel sliders if visible
  _syncLiveControlUI();

  // Toast — brief, non-intrusive
  notify.info(
    `${profile.icon} ${profile.label} phase — intensity ${Math.round(profile.intensityScale * 100)}%, speed ${profile.speedScale.toFixed(2)}×`,
    3000
  );

  console.info(
    `[state-blocks] Scene "${scene.name}" (${scene.stateType}): ` +
    `intensity ${prev.intensity.toFixed(2)}→${state.liveControl.intensityScale.toFixed(2)}, ` +
    `speed ${prev.speed.toFixed(2)}→${state.liveControl.speedScale.toFixed(2)}`
  );
}

// ── Sync the Live Control UI sliders after a programmatic change ──────────────
function _syncLiveControlUI() {
  // These IDs match what renderLiveControl() generates in live-control.js.
  // setLiveIntensity / setLiveSpeed also update them, but applyStateProfile
  // writes directly to state.liveControl and must refresh the UI manually.
  const intensitySlider = document.getElementById('lc_intensity');
  const speedSlider     = document.getElementById('lc_speed');
  if (intensitySlider) intensitySlider.value = state.liveControl.intensityScale;
  if (speedSlider)     speedSlider.value     = state.liveControl.speedScale;

  const intDisplay = document.getElementById('lc_intensityVal');
  const spdDisplay = document.getElementById('lc_speedVal');
  if (intDisplay) intDisplay.textContent = `${Math.round(state.liveControl.intensityScale * 100)}%`;
  if (spdDisplay) spdDisplay.textContent = `${state.liveControl.speedScale.toFixed(2)}×`;
}

// ── Helper: get a human-readable label for a stateType value ─────────────────
export function stateTypeLabel(stateType) {
  if (!stateType) return 'None';
  const p = STATE_PROFILES[stateType];
  return p ? `${p.icon} ${p.label}` : stateType;
}

// ── Suggested scene colours by state type ────────────────────────────────────
// Authors can override; these are just good defaults.
export function suggestedColorForStateType(stateType) {
  return STATE_PROFILES[stateType]?.color ?? '#5fa0dc';
}
