// ── state.js ──────────────────────────────────────────────────────────────
// Single source of truth: session model, runtime state, utilities.

export const STORAGE_KEY = 'adaptive-session-studio-v4';
export const QUARANTINE_KEY = 'adaptive-session-studio-quarantine-v4';

import { idbGet, idbSet, idbDel } from './idb-storage.js';
export const PACKAGE_VERSION = 4;

// ── Built-in themes ────────────────────────────────────────────────────────
export const builtinThemes = {
  midnight: { name: 'Midnight', backgroundColor: '#05070a', accentColor: '#7fb0ff', textColor: '#eef4fb' },
  ember:    { name: 'Ember',    backgroundColor: '#160909', accentColor: '#ff9f71', textColor: '#fff0ea' },
  moss:     { name: 'Moss',     backgroundColor: '#07130b', accentColor: '#9be7a1', textColor: '#eefcf1' },
  violet:   { name: 'Violet',   backgroundColor: '#100916', accentColor: '#c8a4ff', textColor: '#f4ebff' },
  dusk:     { name: 'Dusk',     backgroundColor: '#0d0a14', accentColor: '#f0a04a', textColor: '#f0ece6' },
  slate:    { name: 'Slate',    backgroundColor: '#080c10', accentColor: '#64b5c8', textColor: '#d8eaf0' },
};

// ── Utilities ───────────────────────────────────────────────────────────────
export const uid = () => 'b_' + Math.random().toString(36).slice(2, 10);
export const clampInt = (v, lo, hi, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fb; };
export const esc = s => String(s ?? '')
  .replaceAll('&',  '&amp;')
  .replaceAll('<',  '&lt;')
  .replaceAll('>',  '&gt;')
  .replaceAll('"',  '&quot;')
  .replaceAll("'",  '&#39;');
export const fmt = sec => { const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0)), m = Math.floor(s / 60); return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
export const fileToDataUrl = f => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(f); });
export const $id = id => document.getElementById(id);

// ── Default session factory ────────────────────────────────────────────────
export const defaultSession = () => ({
  packageVersion: PACKAGE_VERSION,
  name: 'new_session',
  duration: 180,
  theme: 'midnight',
  customThemes: {},
  masterVolume: 0.8,
  speechRate: 1,
  loopMode: 'count',
  loopCount: 1,
  runtimeMinutes: 10,
  notes: '',             // free-form author notes (not displayed during playback)
  backgroundColor: builtinThemes.midnight.backgroundColor,
  accentColor:     builtinThemes.midnight.accentColor,
  textColor:       builtinThemes.midnight.textColor,
  advanced: {
    stageBlur: 0,
    fontFamily: 'Syne, system-ui, sans-serif',
    crossfadeSeconds: 0.6,
    playlistAudioVolume: 0.7,
    playlistVideoVolume: 0.6,
    autoResumeOnAttentionReturn: false,
    deviceWsUrl: 'ws://localhost:12345',
  },
  tracking: {
    enabled: false,
    autoPauseOnAttentionLoss: false,
    attentionThreshold: 5,
  },
  subtitleSettings: {
    textColor: '#ffffff',
    fontSize: 1.4,
    position: 'bottom',
    override: 'none',
  },
  funscriptSettings: {
    speed: 1.0,
    invert: false,
    range: 100,
  },
  // ── HUD & Display options ─────────────────────────────────────────────────
  hudOptions: {
    showMetricBars:  true,   // attention/engagement/intensity bars
    showScene:       true,   // active scene + state-block indicator
    showVariables:   true,   // live variable chips
    showMacroSlots:  true,   // macro slot pills
    showHint:        false,  // keyboard hint row (default off — operators know their keys)
    hideAfterSec:    2.5,    // seconds of mouse idle before HUD fades
    metricsPosition: 'bottom', // 'top' | 'middle' | 'bottom' — where metric bars appear
    showAttention:   true,   // individual bar toggles
    showEngagement:  true,
    showIntensity:   true,
  },
  displayOptions: {
    showFsHeatmap:      true,  // speed-color heatmap strip under FunScript tracks in sidebar
    richIdleScreen:     true,  // show session info on idle screen instead of plain hint
    sensorBridgeUrl:    'ws://localhost:8765',  // default sensor bridge WebSocket URL
    sensorBridgeAuto:   false, // auto-connect sensor bridge on session start
    toastXp:            true,  // show "+N XP" toast after sessions
    toastLevelUp:       true,  // show level-up announcement toast
    toastAchievements:  true,  // show achievement unlocked toasts
    toastQuests:        true,  // show quest completed toasts
    webcamPreview:      false, // show live webcam feed in stage during fullscreen
    webcamCorner:       'bottom-right', // 'top-left'|'top-right'|'bottom-left'|'bottom-right'
    webcamSize:         15,    // % of stage width (5–40)
  },
  // Webcam → FS options
  trackingFsOptions: {
    pauseFsOnLoss: false,
    injectMacroOnLoss: false,
    injectMacroOnReturn: false,
    lossInjectSlot: 0,      // 0 = none, 1-5 = slot
    returnInjectSlot: 0,
  },
  playlists: { audio: [], video: [] },
  subtitleTracks: [],
  funscriptTracks: [],
  macroLibrary: [],         // user-saved macros
  macroSlots: { 1:null, 2:null, 3:null, 4:null, 5:null }, // slot → macro id
  blocks: [],
  scenes: [],               // ROADMAP Phase 3.3 — named time ranges within the session
  rules:  [],               // ROADMAP Phase 1   — behavioral scripting rules
  triggers: [],             // ROADMAP Phase 4   — timing-based interaction windows
  rampSettings:  null,       // ROADMAP Phase 2.8 — intensity ramp (null = use defaults)
  pacingSettings: null,      // ROADMAP Phase 2.7 — dynamic pacing (null = use defaults)
  safetySettings: null,      // ROADMAP Safety Layer — hard limits (null = use defaults)
  mode: null,                // active session mode id (set by applySessionMode)
  variables: {},             // Phase 5.2 — user-defined runtime variables
});

export const sampleSession = () => ({
  ...defaultSession(),
  name: 'grounded_focus',
  duration: 120,
  loopCount: 2,
  speechRate: 0.95,
  blocks: [
    { id: uid(), type: 'text',  label: 'Settle',       start: 0,  duration: 12, content: 'Settle in.\nLet your breathing slow.', fontSize: 1.2 },
    { id: uid(), type: 'tts',   label: 'Opening',      start: 14, duration: 10, content: 'You can take your time. There is no need to rush.', volume: 0.9, voiceName: '' },
    { id: uid(), type: 'text',  label: 'Anchor words', start: 34, duration: 12, content: 'Steady.\nClear.\nPresent.', fontSize: 1.55 },
    { id: uid(), type: 'pause', label: 'Silence',      start: 52, duration: 8,  content: '' },
    { id: uid(), type: 'tts',   label: 'Closing',      start: 68, duration: 12, content: 'Carry the same steadiness into your next action.', volume: 0.9, voiceName: '' },
  ],
});

// ── Deep normalizers for nested session structures ─────────────────────────

// ── Color safety helper ───────────────────────────────────────────────────────
// Only allows #RGB, #RRGGBB, #RRGGBBAA (hex only).
// Rejects any value that could inject quotes, semicolons, or function calls
// into an inline style or HTML attribute value.
// Exported so UI modules can run the same guard before writing to state.
export function safeColor(val, fallback = '#888888') {
  if (typeof val !== 'string') return fallback;
  return /^#[0-9a-fA-F]{3,8}$/.test(val.trim()) ? val.trim().toLowerCase() : fallback;
}
// Internal alias so all existing private calls stay unchanged.
function _safeColor(val, fallback = '#888888') { return safeColor(val, fallback); }

// ── ID safety helper ─────────────────────────────────────────────────────────
// Imported IDs are used verbatim in HTML data attributes (data-track-id="...").
// Restricts to alphanumeric, underscore, hyphen — the same set uid() produces.
// Anything else gets a fresh generated id to prevent attribute injection.
const _SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function _safeId(val) {
  return (typeof val === 'string' && _SAFE_ID_RE.test(val)) ? val : uid();
}


export function normalizeScene(s) {
  const start = clampInt(s?.start ?? 0, 0, 86400, 0);
  const end   = Math.max(start + 1, clampInt(s?.end ?? 60, 1, 86400, 60));
  return {
    id:           _safeId(s?.id),
    name:         typeof s?.name === 'string' && s.name ? s.name : 'Scene',
    start,
    end,
    loopBehavior: ['once', 'loop'].includes(s?.loopBehavior) ? s.loopBehavior : 'once',
    color:        _safeColor(s?.color, '#5fa0dc'),
    nextSceneId:  (typeof s?.nextSceneId === 'string' && s.nextSceneId) ? s.nextSceneId : null,
    // Phase 5.1 — State Block type. When set, entering this scene applies an
    // automatic intensity/pacing profile as a non-destructive live override.
    // null means "no automatic profile" (default).
    stateType:    ['calm', 'build', 'peak', 'recovery'].includes(s?.stateType) ? s.stateType : null,
  };
}

export function normalizeAudioTrack(t) {
  const rawUrl = typeof t?.dataUrl === 'string' ? t.dataUrl : '';
  return {
    id:     _safeId(t?.id),
    name:   typeof t?.name    === 'string' ? t.name    : 'Audio',
    // Only accept data: URLs — rejects any http:/file:/javascript: injection vector
    dataUrl: rawUrl.startsWith('data:') ? rawUrl : '',
    volume: typeof t?.volume  === 'number' && isFinite(t.volume) ? Math.min(2, Math.max(0, t.volume)) : 1,
    _muted: t?._muted === true,
  };
}

export function normalizeVideoTrack(t) {
  const rawUrl = typeof t?.dataUrl === 'string' ? t.dataUrl : '';
  return {
    id:       _safeId(t?.id),
    name:     typeof t?.name      === 'string' ? t.name      : 'Video',
    dataUrl:  rawUrl.startsWith('data:') ? rawUrl : '',
    mediaKind:['video','image'].includes(t?.mediaKind) ? t.mediaKind : 'video',
    mute:     t?.mute !== false,
    volume:   typeof t?.volume === 'number' && isFinite(t.volume) ? Math.min(2, Math.max(0, t.volume)) : 1,
  };
}

export function normalizeFunscriptTrack(t) {
  const actions = Array.isArray(t?.actions)
    ? t.actions
        .filter(a => Number.isFinite(+a?.at) && Number.isFinite(+a?.pos))
        .map(a => ({ at: Math.max(0, Math.round(+a.at)), pos: Math.min(100, Math.max(0, Math.round(+a.pos))) }))
        .sort((a, b) => a.at - b.at)
    : [];
  return {
    id:        _safeId(t?.id),
    name:      typeof t?.name === 'string' ? t.name : 'Script',
    version:   Number.isFinite(+t?.version) ? +t.version : 1,
    inverted:  t?.inverted === true,
    range:     Number.isFinite(+t?.range) ? Math.min(100, Math.max(1, Math.round(+t.range))) : 100,
    actions,
    _disabled: t?._disabled === true,
    _color:    _safeColor(t?._color, '#f0a04a'),
    // Script variant label (ScriptPlayer+ inspired) — e.g. 'Soft', 'Standard', 'Intense', 'Custom'
    variant:   ['','Soft','Standard','Intense','Custom'].includes(t?.variant ?? '') ? (t?.variant ?? '') : '',
  };
}

export function normalizeSubtitleTrack(t) {
  const events = Array.isArray(t?.events)
    ? t.events.filter(e => Number.isFinite(+e?.start) && Number.isFinite(+e?.end) && +e.end > +e.start)
        .map(e => ({ start: +e.start, end: +e.end, text: String(e?.text ?? ''), style: String(e?.style ?? 'Default') }))
    : [];
  return {
    id:        _safeId(t?.id),
    name:      typeof t?.name === 'string' ? t.name : 'Subtitles',
    rawAss:    typeof t?.rawAss === 'string' ? t.rawAss : '',
    styles:    t?.styles && typeof t.styles === 'object' ? t.styles : {},
    events,
    _disabled: t?._disabled === true,
  };
}

export function normalizeMacro(m) {
  const actions = Array.isArray(m?.actions)
    ? m.actions
        .filter(a => Number.isFinite(+a?.at) && Number.isFinite(+a?.pos))
        .map(a => ({ at: Math.max(0, Math.round(+a.at)), pos: Math.min(100, Math.max(0, Math.round(+a.pos))) }))
        .sort((a, b) => a.at - b.at)
    : [];
  return {
    id:      _safeId(m?.id),
    name:    typeof m?.name === 'string' && m.name ? m.name : 'Macro',
    builtin: m?.builtin === true,
    actions,
  };
}

// ── Block normalizer ────────────────────────────────────────────────────────
export function normalizeBlock(block, idx = 0) {
  return {
    id:          _safeId(block?.id),
    type:        block?.type || 'text',
    label:       block?.label || `Block ${idx + 1}`,
    start:       clampInt(block?.start ?? 0, 0, 86400, 0),
    duration:    clampInt(block?.duration ?? 10, 1, 86400, 10),
    content:     block?.content || '',
    fontSize:    Number(block?.fontSize ?? 1.2),
    volume:      (() => { const v = Number(block?.volume ?? 1); return Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 1; })(),
    voiceName:   block?.voiceName || '',
    dataUrl:     (block?.dataUrl && String(block.dataUrl).startsWith('data:')) ? block.dataUrl : '',
    dataUrlName: block?.dataUrlName || '',
    mediaKind:   block?.mediaKind || '',
    mute:        block?.mute !== false,
    _position:   block?._position || 'center',
    // Macro block fields (type === 'macro')
    macroSlot:   (typeof block?.macroSlot === 'number' && Number.isFinite(block.macroSlot))
                   ? block.macroSlot : null,
    macroId:     block?.macroId || '',
    // Visualization block fields (type === 'viz')
    // vizType: which built-in animation to render during playback
    // vizSpeed: multiplier for animation speed (0.25–4)
    // vizColor: primary color for the animation
    vizType:     ['spiral','pendulum','tunnel','pulse','vortex',
                  'lissajous','colorwash','geometricoom','starburst','fractalweb','ripple','mandala']
                   .includes(block?.vizType) ? block.vizType : 'spiral',
    vizSpeed:    Number.isFinite(block?.vizSpeed)
                   ? Math.max(0.25, Math.min(4, block.vizSpeed)) : 1.0,
    vizColor:    _safeColor(block?.vizColor, '#c49a3c'),
    // Breathing block fields (type === 'breathing')
    breathInSec:   clampInt(block?.breathInSec  ?? 4, 1, 30, 4),
    breathHold1Sec:clampInt(block?.breathHold1Sec ?? 0, 0, 30, 0),
    breathOutSec:  clampInt(block?.breathOutSec  ?? 6, 1, 30, 6),
    breathHold2Sec:clampInt(block?.breathHold2Sec ?? 0, 0, 30, 0),
    breathCycles:  clampInt(block?.breathCycles  ?? 0, 0, 60, 0), // 0 = fill duration
    breathCue:     block?.breathCue !== false, // TTS cue words
    // Entrainment block fields (type === 'entrainment')
    entCarrierHz:  Number.isFinite(block?.entCarrierHz)  ? Math.max(40, Math.min(500,  block.entCarrierHz))  : 200,
    entBeatHz:     Number.isFinite(block?.entBeatHz)     ? Math.max(0.5, Math.min(40,  block.entBeatHz))     : 10,
    entWaveform:   ['sine','square','sawtooth'].includes(block?.entWaveform) ? block.entWaveform : 'sine',
    entVolume:     Number.isFinite(block?.entVolume)     ? Math.max(0, Math.min(1, block.entVolume))          : 0.3,
  };
}

export function normalizeSession(input) {
  const base = defaultSession();
  const out = {
    ...base, ...input,
    // Clamp session-level duration — duration:0 causes division-by-zero in the RAF loop
    duration: clampInt(input?.duration ?? base.duration, 10, 86400, base.duration),
    // Clamp loop-related counts
    loopCount:      clampInt(input?.loopCount      ?? base.loopCount,      1, 100000, base.loopCount),
    runtimeMinutes: clampInt(input?.runtimeMinutes ?? base.runtimeMinutes, 1, 100000, base.runtimeMinutes),
    // notes is a plain string; cap at 10 000 chars to prevent bloat
    notes: typeof input?.notes === 'string' ? input.notes.slice(0, 10_000) : '',
    // Session-level theme colors — validate to safe hex so they can't inject via CSS custom props
    backgroundColor: _safeColor(input?.backgroundColor, base.backgroundColor),
    accentColor:     _safeColor(input?.accentColor,     base.accentColor),
    textColor:       _safeColor(input?.textColor,       base.textColor),
    // Phase 5.2 — User-defined variables. Normalised lazily to avoid circular import.
    variables: (input?.variables && typeof input.variables === 'object' && !Array.isArray(input.variables))
      ? Object.fromEntries(
          Object.entries(input.variables)
            .filter(([k]) => /^[a-z_][a-z0-9_]{0,31}$/.test(k))
            .map(([k, v]) => {
              const type = ['number','string','boolean'].includes(v?.type) ? v.type : 'number';
              const coerce = val => type === 'number' ? (Number(val) || 0) : type === 'boolean' ? Boolean(val) : String(val ?? '');
              return [k, { type, value: coerce(v?.value ?? 0), description: String(v?.description ?? '').slice(0,120) }];
            })
        )
      : {},
    tracking:          { ...base.tracking,          ...(input?.tracking          ?? {}) },
    advanced:          { ...base.advanced,          ...(input?.advanced          ?? {}) },
    subtitleSettings:  { ...base.subtitleSettings,  ...(input?.subtitleSettings  ?? {}) },
    funscriptSettings: { ...base.funscriptSettings, ...(input?.funscriptSettings ?? {}) },
    hudOptions:        { ...base.hudOptions,        ...(input?.hudOptions        ?? {}) },
    displayOptions:    (() => {
      const disp = { ...base.displayOptions, ...(input?.displayOptions ?? {}) };
      // Sanitize sensorBridgeUrl — only allow ws:// or wss://, cap length
      const rawSbUrl = disp.sensorBridgeUrl;
      if (typeof rawSbUrl === 'string') {
        const trimmed = rawSbUrl.trim().slice(0, 200);
        disp.sensorBridgeUrl = /^wss?:\/\/./.test(trimmed) ? trimmed : base.displayOptions.sensorBridgeUrl;
      }
      return disp;
    })(),
    customThemes:      (() => {
      // Sanitize imported custom themes — only safe color strings, capped count
      const raw = input?.customThemes;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const out = {};
      let count = 0;
      for (const [key, theme] of Object.entries(raw)) {
        if (count >= 20) break;                                       // max 20 custom themes
        if (!/^[a-z0-9_-]{1,32}$/.test(key)) continue;              // safe slug key
        if (!theme || typeof theme !== 'object') continue;
        out[key] = {
          name:            String(theme.name ?? key).slice(0, 40),
          backgroundColor: _safeColor(theme.backgroundColor, '#05070a'),
          accentColor:     _safeColor(theme.accentColor,     '#7fb0ff'),
          textColor:       _safeColor(theme.textColor,       '#eef4fb'),
        };
        count++;
      }
      return out;
    })(),
    playlists: {
      audio: Array.isArray(input?.playlists?.audio) ? input.playlists.audio.map(normalizeAudioTrack) : [],
      video: Array.isArray(input?.playlists?.video) ? input.playlists.video.map(normalizeVideoTrack) : [],
    },
    subtitleTracks:  Array.isArray(input?.subtitleTracks)  ? input.subtitleTracks.map(normalizeSubtitleTrack)   : [],
    funscriptTracks: Array.isArray(input?.funscriptTracks) ? input.funscriptTracks.map(normalizeFunscriptTrack)  : [],
    macroLibrary:    Array.isArray(input?.macroLibrary)    ? input.macroLibrary.map(normalizeMacro)              : [],
    macroSlots:      { ...base.macroSlots, ...(input?.macroSlots ?? {}) },
    trackingFsOptions: { ...base.trackingFsOptions, ...(input?.trackingFsOptions ?? {}) },
    blocks: Array.isArray(input?.blocks)
      ? input.blocks.map(normalizeBlock)
      : [],
    scenes: Array.isArray(input?.scenes) ? input.scenes.map(normalizeScene) : [],
    triggers: Array.isArray(input?.triggers)
      ? input.triggers.map(t => ({
          id:           _safeId(t?.id),
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
          successAction: { type: ['none','pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene','setVar']
            .includes(t?.successAction?.type) ? t.successAction.type : 'none', param: t?.successAction?.param ?? null },
          failureAction: { type: ['none','pause','resume','stop','injectMacro','setIntensity','setSpeed','nextScene','gotoScene','setVar']
            .includes(t?.failureAction?.type) ? t.failureAction.type : 'none', param: t?.failureAction?.param ?? null },
          cooldownSec: Number.isFinite(t?.cooldownSec) ? Math.max(0, t.cooldownSec) : 60,
        }))
      : [],
    rampSettings: input?.rampSettings
      ? (() => {
          // Inline normalizer — avoids circular dep with intensity-ramp.js
          const r = input.rampSettings;
          return {
            enabled:   r.enabled === true,
            mode:      ['time','engagement','step','adaptive'].includes(r.mode) ? r.mode : 'time',
            startVal:  Number.isFinite(r.startVal) ? Math.max(0, Math.min(2, r.startVal)) : 0.5,
            endVal:    Number.isFinite(r.endVal)   ? Math.max(0, Math.min(2, r.endVal))   : 1.5,
            curve:     ['linear','exponential','sine'].includes(r.curve) ? r.curve : 'linear',
            steps:     Array.isArray(r.steps) ? r.steps.filter(
              s => Number.isFinite(s?.atSec) && Number.isFinite(s?.intensity)
            ).map(s => ({ atSec: s.atSec, intensity: Math.max(0, Math.min(2, s.intensity)) })) : [],
            blendMode: ['max','add','replace'].includes(r.blendMode) ? r.blendMode : 'max',
          };
        })()
      : null,
    rules:  Array.isArray(input?.rules)
      ? input.rules.map(r => {
          // Inline normalize to avoid circular import (rules-engine.js imports state.js)
          return {
            id:          _safeId(r?.id),
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
            // Preserve _modeSource so session-mode cleanup survives export/import round-trips
            ...(r?._modeSource ? { _modeSource: r._modeSource } : {}),
          };
        })
      : [],
    pacingSettings: input?.pacingSettings
      ? (() => {
          const p = input.pacingSettings;
          return {
            enabled:       p.enabled === true,
            minSpeed:      Number.isFinite(p.minSpeed)      ? Math.max(0.25, Math.min(4, p.minSpeed)) : 0.5,
            maxSpeed:      Number.isFinite(p.maxSpeed)      ? Math.max(0.25, Math.min(4, p.maxSpeed)) : 2.0,
            smoothingSec:  Number.isFinite(p.smoothingSec)  ? Math.max(0, Math.min(30, p.smoothingSec)) : 4,
            curve:         ['linear','exponential','sine'].includes(p.curve) ? p.curve : 'linear',
            lockDuringSec: Number.isFinite(p.lockDuringSec) ? Math.max(0, p.lockDuringSec) : 0,
          };
        })()
      : null,
    safetySettings: input?.safetySettings
      ? (() => {
          const s = input.safetySettings;
          return {
            maxIntensity:         Number.isFinite(s.maxIntensity)         ? Math.max(0, Math.min(2, s.maxIntensity)) : 2.0,
            maxSpeed:             Number.isFinite(s.maxSpeed)             ? Math.max(0.25, Math.min(4, s.maxSpeed)) : 4.0,
            emergencyCooldownSec: Number.isFinite(s.emergencyCooldownSec) ? Math.max(0, s.emergencyCooldownSec) : 30,
            warnAbove:            Number.isFinite(s.warnAbove)            ? Math.max(0, Math.min(2, s.warnAbove)) : 1.5,
            autoReduceOnLoss:     s.autoReduceOnLoss === true,
            autoReduceTarget:     Number.isFinite(s.autoReduceTarget)     ? Math.max(0, Math.min(2, s.autoReduceTarget)) : 0.8,
          };
        })()
      : null,
  };
  // Clamp hudOptions values to valid ranges after merge
  if (typeof out.hudOptions.hideAfterSec !== 'number' || !isFinite(out.hudOptions.hideAfterSec)) {
    out.hudOptions.hideAfterSec = 2.5;
  } else {
    out.hudOptions.hideAfterSec = Math.max(0.5, Math.min(30, out.hudOptions.hideAfterSec));
  }
  return out;
}

// ── Mutable app state ──────────────────────────────────────────────────────
export const state = {
  session: null,
  runtime: null,
  selectedBlockId: null,
  selectedSidebarType: null,
  selectedSidebarIdx: null,
  selectedSidebarId: null,    // stable track ID for audio/video items
  selectedFsPoint:  null,     // { trackId, actionRef } — primary single point
  selectedFsPoints: new Set(),// Set of actionRef objects — multi-selection
  inspTab: 'overlay',
  settingsTab: 'appearance',
  fsEditMode: false,
  fsPaused: false,            // FS-only pause (Shift)
  injection: null,            // active macro injection
  deviceSocket: null,
  _editingMacroId: null,      // macro library editor
};

// ── Boot session load ────────────────────────────────────────────────────────
// Initialise synchronously with a safe default, then async-update from IDB.
// `sessionReady` resolves once the real persisted session is applied.
// main.js awaits this (top-level await in ES module) before first render.
state.session = normalizeSession(sampleSession()); // instant safe default

export const sessionReady = (async function _bootLoadSession() {
  try {
    // 1. Try IndexedDB (primary store — no quota limit)
    const saved = await idbGet(STORAGE_KEY);
    if (saved && typeof saved === 'object') {
      state.session = normalizeSession(saved);
      state.selectedBlockId = state.session.blocks[0]?.id || null;
      return;
    }

    // 2. Migrate from localStorage (old install or small session)
    const lsRaw = localStorage.getItem(STORAGE_KEY);
    if (!lsRaw) {
      state.session = normalizeSession(sampleSession());
      state.selectedBlockId = state.session.blocks[0]?.id || null;
      return;
    }

    const parsed = JSON.parse(lsRaw);
    state.session = normalizeSession(parsed);
    state.selectedBlockId = state.session.blocks[0]?.id || null;
    // Migrate to IDB and clean up localStorage
    await idbSet(STORAGE_KEY, state.session);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  } catch (err) {
    // Boot failed — quarantine whatever bad payload exists and start fresh.
    // We need to handle BOTH the IDB and localStorage cases since we don't
    // know which one caused the failure.

    // 1. Try to quarantine the raw IDB payload (most likely the bad one in v62+)
    let quarantined = false;
    try {
      const badIdb = await idbGet(STORAGE_KEY);
      if (badIdb !== null && badIdb !== undefined) {
        // Serialize the bad IDB object for inspection later
        const serialized = JSON.stringify(badIdb);
        try { localStorage.setItem(QUARANTINE_KEY, serialized); quarantined = true; } catch {}
      }
    } catch { /* idbGet itself failed — IDB may be corrupt */ }

    // 2. Fall back to quarantining a localStorage payload if IDB had nothing
    if (!quarantined) {
      let lsRaw = null;
      try { lsRaw = localStorage.getItem(STORAGE_KEY); } catch {}
      if (lsRaw) {
        try { localStorage.setItem(QUARANTINE_KEY, lsRaw); quarantined = true; } catch {}
      }
    }

    // 3. Remove the broken record from BOTH stores so next boot is clean
    try { await idbDel(STORAGE_KEY); } catch {}
    try { localStorage.removeItem(STORAGE_KEY); } catch {}

    state.session = normalizeSession(sampleSession());
    state.selectedBlockId = state.session.blocks[0]?.id || null;
    setTimeout(() => {
      import('./notify.js').then(({ notify }) => {
        notify.warn(
          '⚠ Your auto-saved session could not be loaded and has been quarantined.\n' +
          'A fresh session has been started. Open Settings → System → Recover Quarantined Session to inspect or restore it.',
          0
        );
      });
    }, 1000);
  }
})();

// ── Persist ─────────────────────────────────────────────────────────────────
// ── Persistence state ───────────────────────────────────────────────────────
export const persistState = { dirty: false, error: null, lastSaved: null };

export function persist() {
  // Synchronous: update the JSON preview immediately if open
  const jp = $id('s_jsonPreview');
  if (jp) {
    const preview = JSON.stringify(state.session);
    jp.value = preview.length > 200_000 ? '(session too large to preview)' : JSON.stringify(state.session, null, 2);
  }
  // Async fire-and-forget write to IndexedDB (debounced)
  _persistToIDB();
}

// Debounces rapid successive persist() calls into one IDB write
let _persistDebounce = null;
function _persistToIDB() {
  clearTimeout(_persistDebounce);
  _persistDebounce = setTimeout(async () => {
    try {
      await idbSet(STORAGE_KEY, state.session);
      persistState.dirty     = false;
      persistState.error     = null;
      persistState.lastSaved = Date.now();
      _updatePersistBadge(false, null);
    } catch (e) {
      persistState.dirty = true;
      persistState.error = e;
      _updatePersistBadge(true, `Auto-save failed: ${e.message}`);
      import('./notify.js').then(({ notify }) => {
        notify.error('⚠ Auto-save failed. Export your session now to avoid losing work.', 0);
      });
    }
  }, 150); // 150 ms debounce
}

function _updatePersistBadge(error, message) {
  const badge = document.getElementById('persistBadge');
  if (!badge) return;

  const dot = document.getElementById('persistDot');
  const msg = document.getElementById('persistMsg');

  if (error) {
    // Error state — show red dot + truncated message
    badge.style.display = 'inline-flex';
    if (dot) { dot.style.background = '#d94f4f'; dot.style.opacity = '1'; }
    if (msg) msg.textContent = message?.length > 40 ? message.slice(0, 38) + '…' : (message ?? 'Save error');
    badge.title = message ?? '';
  } else {
    // Success state — briefly show "Saved", then hide after 2s
    badge.style.display = 'inline-flex';
    if (dot) { dot.style.background = 'var(--accent)'; dot.style.opacity = '0.6'; }
    if (msg) msg.textContent = 'Saved';
    badge.title = '';
    // Auto-hide after 2 seconds (leave visible if another persist fires during that time)
    clearTimeout(_updatePersistBadge._hideTimer);
    _updatePersistBadge._hideTimer = setTimeout(() => {
      badge.style.display = 'none';
    }, 2000);
  }
}
_updatePersistBadge._hideTimer = null;

// ── Theme helpers ────────────────────────────────────────────────────────────
export const themeMap = () => ({ ...builtinThemes, ...state.session.customThemes });

export function applyCssVars() {
  const s = state.session;
  const r = document.documentElement.style;
  // Sanitize fontFamily: strip CSS-injection chars before direct style assignment
  const safeFont = (s.advanced.fontFamily || 'Syne, system-ui, sans-serif')
    .replace(/[;{}!]/g, '').trim().slice(0, 200);
  r.setProperty('--stage-bg',     s.backgroundColor);
  r.setProperty('--stage-text',   s.textColor);
  r.setProperty('--stage-accent', s.accentColor);
  r.setProperty('--stage-blur',   `${s.advanced.stageBlur}px`);
  r.setProperty('--overlay-font', safeFont);
  const stage = $id('mainStage');
  if (stage) stage.style.background = s.backgroundColor;
  const ot = $id('overlayText');
  if (ot) { ot.style.color = s.textColor; ot.style.fontFamily = safeFont; }
}

export function applyTheme(key) {
  const t = themeMap()[key];
  if (!t) return;
  const s = state.session;
  s.theme = key;
  // Apply through _safeColor even for built-in themes — defense-in-depth
  s.backgroundColor = _safeColor(t.backgroundColor, s.backgroundColor);
  s.accentColor     = _safeColor(t.accentColor,     s.accentColor);
  s.textColor       = _safeColor(t.textColor,       s.textColor);
  applyCssVars();
  persist();
}

// ── Shared math utility ───────────────────────────────────────────────────────
// Used by both dynamic-pacing.js and intensity-ramp.js.
// t: 0–1 progress; returns 0–1 output.
export function applyCurve(t, curve) {
  switch (curve) {
    case 'exponential': return t * t;
    case 'sine':        return (1 - Math.cos(t * Math.PI)) / 2;
    default:            return t; // linear
  }
}

// ── Canonical settings key list ──────────────────────────────────────────────
// Single source of truth — imported by both reset handlers (main.js + user-profile.js).
// Adding a new settings bucket here automatically includes it in both reset paths.
export const SETTINGS_KEYS = [
  'masterVolume', 'speechRate', 'loopMode', 'loopCount', 'runtimeMinutes',
  'theme', 'backgroundColor', 'accentColor', 'textColor', 'customThemes',
  'rampSettings', 'pacingSettings', 'hudOptions', 'displayOptions',
  'advanced', 'safetySettings', 'funscriptSettings', 'subtitleSettings',
  'tracking', 'trackingFsOptions',
];
