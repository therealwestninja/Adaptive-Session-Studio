---
name: ass-session-studio-dev
description: >
  Use this skill whenever you are working on the Adaptive Session Studio (ASS)
  codebase — whether adding features, fixing bugs, writing or expanding tests,
  updating docs, auditing for security, or doing architecture review.

  Trigger on ANY of these signals:
  - Mentions of project files by name (state.js, playback.js, ui.js, index.html, .assp, style.css)
  - Requests to add or change block types, session modes, content packs, suggestions, FunScript
    patterns, viz animations, or sensor bridge behaviour
  - Questions about how settings sync works, how normalizers work, or why a UI element is not updating
  - Security review, race condition, or bug-hunt requests on this codebase
  - Test suite expansion or coverage gap work
  - CHANGELOG, ROADMAP, or developer doc updates

  Load this skill before reading any code — it will orient you faster than reading modules cold.
---

# Adaptive Session Studio — Developer Skill

> **Working directory:** `/home/claude/Adaptive-Session-Studio/`
> **Deliver to:** `/mnt/user-data/outputs/`
> **Syntax check:** `node --check js/*.js && node --check tests/*.test.js`
> **Package:** `cd /home/claude && zip -r Adaptive-Session-Studio-fixed.zip Adaptive-Session-Studio/ -x "*.DS_Store" -q && cp Adaptive-Session-Studio-fixed.zip /mnt/user-data/outputs/`

---

## 1 · What kind of project this is

A **browser-native, bundler-free, single-page application** served via local Apache or Python HTTP server. All JavaScript is plain ESM (`type="module"`). No React, no TypeScript, no Webpack.

The app is a **timeline-driven adult session design platform** — authors build sessions as sequences of timed blocks (text, TTS, audio, video, pause, macro, viz), run them fullscreen, and control them live via keyboard. Haptic devices connect via Buttplug/Intiface WebSocket.

**Key constraints that shape every decision:**
- No bundler → paths are always `./relative.js`, no aliases, no tree-shaking
- No Node at runtime → only Web APIs: `localStorage`, `IndexedDB`, Web Audio, WebSocket
- Tests run **in the browser** via `tests/index.html`, not Node/Jest. Syntax is verified with `node --check`.
- Sessions are `.assp` files (JSON). The normaliser (`normalizeSession`) must handle any schema version safely.

---

## 2 · First-contact checklist

Run these before writing any code:

```bash
# Verify clean baseline
node --check js/*.js && node --check tests/*.test.js

# Test count (regression baseline)
grep -c "^  t(" tests/*.test.js | awk -F: '{sum+=$2} END{print sum " tests, " NR " suites"}'

# Thinnest suites (where coverage is most needed)
grep -c "^  t(" tests/*.test.js | sort -t: -k2 -n | head -8

# What's complete vs planned
grep "✅\|🔄\|🔲" ROADMAP.md

# CSS tokens (read before any visual work)
head -80 css/style.css
```

---

## 3 · Architecture — mental model

```
                    ┌──────────────┐
                    │  index.html  │  Shell + Settings dialog HTML
                    └──────┬───────┘
                           │ loads
                    ┌──────▼───────┐
                    │   main.js    │  Bootstrap, keyboard, ALL DOM events
                    └──────┬───────┘
            ┌──────────────┼──────────────┐
      ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼────┐
      │  state.js │  │   ui.js   │  │playback │
      │  (truth)  │  │ (render)  │  │  .js    │
      └───────────┘  └───────────┘  └─────────┘
            │               │             │
        normalizers      inspector     RAF loop
        persist()        sidebar       block exec
        IDB/LS           settings      device sync
```

**Data flows in one direction:** `User action → main.js event → mutate state → persist() → render*()`

Never read from the DOM to make decisions. State is the single source of truth.

---

## 4 · Module reference

### Core pipeline
| Module | Role | Key exports |
|--------|------|-------------|
| `state.js` | Session state, normalizers, persistence | `state`, `normalizeSession`, `normalizeBlock`, `normalizeFunscriptTrack`, `persist`, `uid`, `fmt`, `esc`, `$id` |
| `playback.js` | RAF loop, block execution, emergency stop | `startPlayback`, `stopPlayback`, `pausePlayback`, `emergencyStop`, `resolveTemplateVars` |
| `state-engine.js` | Metric fusion (attention × engagement × intensity) | `tickStateEngine`, `setExternalSignal`, `getMetric` |
| `rules-engine.js` | Condition→action evaluation | `tickRulesEngine`, `normalizeRule`, `CONDITIONING_PRESETS`, `applyPreset` |
| `trigger-windows.js` | Timed interaction windows | `tickTriggerWindows` |
| `safety.js` | Hard limits, emergency cooldown | `clampIntensity`, `clampSpeed`, `tickSafety`, `recordEmergencyStop` |

### UI layer
| Module | Role |
|--------|------|
| `ui.js` | All inspector/sidebar rendering — `renderSidebar`, `renderInspector`, `syncSettingsForms`, `syncSessionFromSettings` |
| `main.js` | Bootstrap + all DOM events (no exports — top-level script) |
| `fullscreen-hud.js` | Fullscreen HUD, idle screen, toast — `updateHud`, `tickHud`, `showLiveControlToast`, `renderIdleScreen` |
| `funscript.js` | Canvas FunScript timeline — `drawTimeline`, `parseFunScript`, `interpolatePosition` |

### Feature modules
| Module | Key behaviour |
|--------|---------------|
| `content-packs.js` | `loadContentPack` applies `suggestedMode` automatically via dynamic import |
| `session-modes.js` | `applySessionMode` writes `state.session.mode`, refreshes settings display, calls `renderIdleScreen` |
| `state-blocks.js` | `applyStateProfile` modifies `liveControl` non-destructively |
| `variables.js` | `setVariable` validates name before write; `{{varName}}` resolved at runtime |
| `viz-blocks.js` | `mountVizBlock`/`unmountVizBlock` manage RAF loops; `generateFromBPM` for music-sync |
| `sensor-bridge.js` | Signal names allowlisted; variable names validated against `VAR_NAME_RE` |
| `suggestions.js` | `analyzeSession()` returns `[{ id, severity, title, detail }]` |
| `funscript-patterns.js` | 10 patterns + `loadPatternAsTrack` + BPM generator |
| `macros.js` | Macro library, slots 1–5, injection engine |
| `import-validate.js` | Guards `.assp` imports: validates viz types, sizes, counts |
| `block-ops.js` | `duplicateBlock`, `deleteBlock`, `moveBlockUp`, `moveBlockDown`, `reorderBlock` |
| `history.js` | `history.push()` before mutations, `undo()`/`redo()` |
| `notify.js` | `notify.info/warn/error/success` — always use, never `alert()` |
| `audio-engine.js` | Web Audio API, playlist, crossfade |
| `idb-storage.js` | `idbGet`, `idbSet`, `idbDel`, `idbHas` — async IndexedDB |

---

## 5 · Complete state shape

```js
state.session = {
  name, duration, loopMode,    // 'none' | 'count' | 'minutes' | 'forever'
  loopCount, runtimeMinutes,
  speechRate, masterVolume,
  mode,                         // null | session mode id — only set by applySessionMode
  notes,                        // author notes, not shown during playback

  blocks: [{
    id, type,                   // text|tts|audio|video|pause|macro|viz
    label, start, duration,
    content, fontSize, volume, voiceName,
    dataUrl, dataUrlName, mediaKind, mute, _position,
    macroSlot, macroId,         // macro blocks
    vizType, vizSpeed, vizColor // viz blocks
  }],

  scenes: [{ id, name, start, end, loopBehavior, color, nextSceneId, stateType }],
  // stateType: null | 'calm' | 'build' | 'peak' | 'recovery'

  rules:    [{ id, enabled, name, condition, durationSec, cooldownSec, action, _modeSource }],
  triggers: [{ id, enabled, name, atSec, windowDurSec, cooldownSec, condition, successAction, failureAction }],
  variables: { varName: { type, value, description } },  // type: number|string|boolean

  funscriptTracks: [{ id, name, version, inverted, range, actions, _disabled, _color, variant }],
  // variant: '' | 'Soft' | 'Standard' | 'Intense' | 'Custom'
  funscriptSettings: { speed, invert, range },

  playlists: { audio: [...], video: [...] },
  subtitleTracks: [...],
  macroLibrary: [...],
  macroSlots: { 1:null, 2:null, 3:null, 4:null, 5:null },

  advanced: { stageBlur, fontFamily, crossfadeSeconds, playlistAudioVolume,
              playlistVideoVolume, autoResumeOnAttentionReturn, deviceWsUrl },
  tracking: { enabled, autoPauseOnAttentionLoss, attentionThreshold },
  trackingFsOptions: { pauseFsOnLoss, injectMacroOnLoss, lossInjectSlot,
                       injectMacroOnReturn, returnInjectSlot },
  subtitleSettings: { textColor, fontSize, position, override },
  safetySettings:   null | { maxIntensity, maxSpeed, warnAbove,
                              emergencyCooldownSec, autoReduceOnLoss, autoReduceTarget },
  rampSettings:     null | { ... },
  pacingSettings:   null | { ... },

  hudOptions: {
    showMetricBars,   // attention/engagement/intensity bars
    showScene,        // scene + state-block indicator
    showMacroSlots,   // macro slot pills
    showVariables,    // live variable chips
    showHint,         // keyboard hint row (default: false)
    hideAfterSec,     // cursor idle timeout [0.5, 30] (default: 2.5)
  },
  displayOptions: {
    showFsHeatmap,    // speed-color strip under FunScript tracks in sidebar
    richIdleScreen,   // session-info idle screen vs plain "Space to play"
    sensorBridgeUrl,  // WS URL (default: 'ws://localhost:8765')
    sensorBridgeAuto, // auto-connect on session start
  },
};

state.runtime    = { sessionTime, loopIndex, totalLoops, paused, activeBlock, activeScene,
                     triggered, playingOneShots, backgroundAudio, backgroundVideo,
                     analytics, speechUtterance, injection };
state.engineState = { attention, engagement, intensity, speed };
state.liveControl = { intensityScale, speedScale, variation, randomness };
```

---

## 6 · The normalizer pattern

**Every field must pass through a normalizer.** They sanitize, clamp, and fill defaults so imported sessions from any schema version are safe.

```js
// Good normalizer pattern
vizSpeed: typeof block?.vizSpeed === 'number' && Number.isFinite(block.vizSpeed)
            ? Math.max(0.25, Math.min(4, block.vizSpeed)) : 1.0,

// Trap: typeof NaN === 'number' is true — always add Number.isFinite()
macroSlot: typeof block?.macroSlot === 'number' && Number.isFinite(block.macroSlot)
             ? block.macroSlot : null,

// Allowlist pattern for typed fields
vizType: ['spiral','pendulum','tunnel','pulse','vortex']
           .includes(block?.vizType) ? block.vizType : 'spiral',
```

**Rule:** Any new field you add must be in `normalizeBlock()` / `normalizeSession()` with a safe default before it can be persisted or exported.

**After adding to `normalizeSession`:** also add to `defaultSession()` so the `...base` spread in `normalizeSession` picks it up. Without this, round-trips through double-normalisation lose the field.

---

## 7 · Settings sync — most common bug source

Three things must all agree:

```
HTML inputs  ←→  syncSettingsForms()  ←→  syncSessionFromSettings()  ←→  state.session.*
```

**Opening dialog:** `syncSettingsForms()` writes `state.session.*` values → DOM. For sliders, set BOTH the `input.value` AND the companion `<span>` textContent — the span is NOT updated by setting the input value.

**On any input change:** the broad `settingsDialog` `input` listener fires `syncSessionFromSettings()`. Exceptions: `s_masterVolume` (own listener), `s_jsonPreview` (skipped).

**On close:** `closeSettings()` calls `syncSessionFromSettings()` + `applyCssVars()` + `syncTransportControls()` + `renderIdleScreen()`.

**Adding a new setting checklist:**
1. HTML element with `id="s_myField"` in the correct `data-section` panel
2. `syncSettingsForms()`: set input value + label span (if range slider)
3. `syncSessionFromSettings()`: read + clamp + write to `state.session`
4. `defaultSession()`: add the field with its default
5. `normalizeSession()`: merge it with object spread
6. If it's a slider: add to `sliderLabels` array in `main.js`

---

## 8 · Adding a block type — complete recipe

Five files, in dependency order:

**`state.js`** — add fields to `normalizeBlock()`:
```js
myParam: typeof block?.myParam === 'number' && Number.isFinite(block.myParam)
           ? Math.max(0, block.myParam) : defaultValue,
```

**`ui.js`** — three additions:
```js
const BLOCK_ICONS = { ..., mytype: '⬛' };
const colorTag = { ..., mytype: 'tag-blue' }[block.type] || '';
// In renderOverlayTab():
} else if (block.type === 'mytype') {
  html += `<div class="insp-group"><div class="insp-group-label">My Type</div>...</div>`;
}
```

**`index.html`** — track panel button:
```html
<button class="tp-chip" data-add-block="mytype" title="My block type">⬛</button>
```

**`playback.js`** — one-shot execution (inside the `triggered` Set guard):
```js
if (block.type === 'mytype') { /* execute once per loop */ }
```

**`tests/state.test.js`** — normalizer round-trips:
```js
t('normalizeBlock mytype defaults myParam to 0', () => eq(normalizeBlock({ type: 'mytype' }).myParam, 0));
t('normalizeBlock mytype clamps myParam negative', () => eq(normalizeBlock({ type: 'mytype', myParam: -1 }).myParam, 0));
t('normalizeBlock mytype round-trips through double normalisation', () => {
  const a = normalizeBlock({ type: 'mytype', myParam: 5 });
  eq(normalizeBlock(a).myParam, 5);
});
```

---

## 9 · Adding a session mode

```js
// session-modes.js → SESSION_MODES array
{
  id: 'mymode',           // lowercase, used as state.session.mode value
  name: 'My Mode',
  icon: '⬛',
  description: 'What this mode does.',
  rampSettings:   { enabled: false },   // null for no ramp
  pacingSettings: { enabled: false },   // null for no pacing
  rules: [{
    name: '[MyMode] Rule name',
    enabled: true,
    condition: { metric: 'attention', op: '<', value: 0.3 },
    // metric: attention|intensity|speed|engagement|sessionTime|loopCount
    // op:     '<' | '<=' | '>' | '>=' | '=='
    durationSec: 5,    cooldownSec: 30,
    action: { type: 'pause', param: null },
    // type: pause|resume|stop|injectMacro|setIntensity|setSpeed|nextScene|gotoScene|setVar
    // _modeSource injected by applySessionMode — do NOT set it here
  }],
}
```

`applySessionMode` automatically: tags rules with `_modeSource`, writes `state.session.mode`, refreshes `#s_currentModeDisplay`, calls `renderIdleScreen`. No extra wiring needed.

`loadContentPack` calls `applySessionMode(pack.suggestedMode)` automatically.

---

## 10 · Adding a suggestion

```js
// suggestions.js → analyzeSession() — insert BEFORE the all_good check
const hasSomeProblem = blocks.some(b => /* condition */);
if (hasSomeProblem) {
  suggestions.push({
    id: 'my_check_id',   // snake_case, unique, stable — never reuse
    severity: 'warn',    // 'warn' | 'info'
    title: 'Short title under 60 chars',
    detail: 'Full explanation with where to find the fix.',
  });
}
```

**Test both branches — every suggestion:**
```js
t('my_check_id fires when condition is true', () => {
  setup(); /* arrange */; ok(ids(analyzeSession()).includes('my_check_id'));
});
t('my_check_id does not fire when condition is false', () => {
  setup(); /* arrange */; ok(!ids(analyzeSession()).includes('my_check_id'));
});
```

---

## 11 · Test infrastructure

```js
// tests/my-module.test.js
import { makeRunner } from './harness.js';
import { myExport } from '../js/my-module.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runMyModuleTests() {
  const R  = makeRunner('my-module.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);  // strict ===
  const ok = R.assert.bind(R);       // truthy

  function reset() {
    state.session = normalizeSession(defaultSession());
    state.runtime = null;
  }

  t('description', () => { reset(); eq(myExport(x), expected); });

  return R.summary(); // Promise<{ passed, failed, name }>
}
```

Register in `tests/index.html`:
```js
import { runMyModuleTests } from './my-module.test.js';
// In Promise.all([...]):
runMyModuleTests(),
```

**What to test:** normalizer defaults + clamping + invalid inputs + double round-trip; pure function output; `history.push()` creates snapshot; DOM-dependent functions don't throw without DOM.

**What not to test:** DOM visual output; WebSocket connection; complex async IDB beyond basic roundtrip.

---

## 12 · Security invariants

| Boundary | Rule |
|----------|------|
| Sensor bridge variable names | Validate against `/^[a-z_][a-z0-9_]{0,31}$/` before `setVariable()` |
| Sensor bridge signal names | Allowlist: `attention`, `engagement`, `intensity`, `heartRate`, `gsr`, `breath`, `custom1–3` |
| WebSocket `onmessage` | Always `try { JSON.parse(e.data) } catch {}` |
| `dataUrl` fields | Only stored if `String(value).startsWith('data:')` — enforced in normalizers |
| Template vars | Only resolve `{{name}}` if `name` exists in `session.variables` |
| User strings in `innerHTML` | Always `esc()` — no exceptions |
| Async UI triggers | `btn.disabled = true` before await, restore in `finally` |
| `macroSlot` from imports | `typeof === 'number' && Number.isFinite()` — plain `typeof` passes NaN |

---

## 13 · Historical bugs — consult before debugging

| Symptom | Root cause | Fix location |
|---------|-----------|--------------|
| Rule action resets to `pause` on import | `setVar` missing from allowlist | Add to `state.js` normalizer AND `rules-engine.js` AND `trigger-windows.js` |
| Slider label shows wrong value when settings opens | Only input value set, not span | In `syncSettingsForms`, set `span.textContent` alongside `input.value` |
| Idle screen shows old name after settings close | `closeSettings` didn't call `renderIdleScreen` | Add `renderIdleScreen()` to `closeSettings` |
| `macroSlot: NaN` stored and serialised as null | `typeof NaN === 'number'` is true | Use `Number.isFinite()` check |
| Malformed WS message crashes device handler | No try/catch around `JSON.parse` | Wrap every `JSON.parse(e.data)` in try/catch |
| Double-click creates duplicate tracks | No guard on async button | Disable before await, restore in `finally` |
| `session.mode` lost on re-normalise | Field not in `defaultSession()` | Add `mode: null` to `defaultSession()` |
| `hudOptions.hideAfterSec` ignores clamping | Field merged but not post-processed | Clamp after merge in `normalizeSession` |
| Idle screen stale after session stops | `stopPlayback` didn't call `renderIdleScreen` | Call it from `stopPlayback` |

---

## 14 · Design system

```css
/* Surfaces */
--bg, --surface, --surface2 through --surface5

/* Accents */
--accent     #e8963a  /* amber — interactive */
--danger     #d94f4f  /* red — destructive */

/* Profile palette */
--ox         #7a1a2e  /* oxblood — peak/profile */
--gold       #c49a3c  /* aged gold — highlight/viz */
--ox-dim, --ox-br, --ox-glow
--gold-dim, --gold-br, --gold-glow

/* Typography */
--font    Space Grotesk
--mono    JetBrains Mono
--serif   Playfair Display
--dmono   DM Mono

/* Signal colours */
--c-blue   #5fa8d3   /* attention / text blocks */
--c-green  #7dc87a   /* engagement / TTS blocks */
--c-amber  #f0a04a   /* intensity / audio */
--c-purple #b084cc   /* video */
--c-pink   #e07a5f   /* macro */
--c-teal   #5ab8b0   /* viz */

/* State block colours */
calm #5fa8d3  build #f0c040  peak #7a1a2e  recovery #7dc87a

/* Block type tag classes */
.tag-blue .tag-green .tag-amber .tag-purple .tag-pink .tag-teal
```

---

## 15 · Critical invariants

1. **`setVar` in ALL three action allowlists** — `state.js`, `rules-engine.js`, `trigger-windows.js`
2. **New fields must be in normalizers** — otherwise stripped on import/export
3. **`history.push()` before every mutation** that should be undoable
4. **FunScript actions clamped to [0, 100]** — `Math.max(0, Math.min(100, Math.round(pos)))`
5. **`esc()` on all user strings in `innerHTML`** — no exceptions
6. **Async UI triggers: disable → try → finally** — prevents race conditions
7. **`session.mode` only set by `applySessionMode`** — never write directly
8. **`renderIdleScreen` after session-changing events** — name, duration, mode, block count
9. **Settings: set BOTH input value AND label span** — spans are not auto-updated
10. **`defaultSession()` must include every field** — `normalizeSession` uses it as the base

---

## 16 · Quick commands

```bash
# Check everything
node --check js/*.js && node --check tests/*.test.js

# Count tests
grep -c "^  t(" tests/*.test.js | awk -F: '{sum+=$2} END{print sum " tests, " NR " suites"}'

# Find thinnest suites
grep -c "^  t(" tests/*.test.js | sort -t: -k2 -n | head -8

# Security audit: innerHTML without esc()
grep -n "innerHTML.*\${" js/*.js | grep -v "esc("

# Security audit: unguarded JSON.parse in WebSocket handlers
grep -n "JSON.parse(e.data)" js/*.js

# Security audit: async await without guard
grep -n "async.*click\|await " js/*.js | grep -v "try\|catch\|//" | head -10

# Find dead exports (not imported anywhere)
python3 -c "
import os, re
mods=[f for f in os.listdir('js') if f.endswith('.js')]
exp={n for m in mods for n in re.findall(r'export\s+(?:async\s+)?(?:function|const)\s+(\w+)',open(f'js/{m}').read())}
imp={n for m in mods for chunk in re.findall(r'import\s*\{([^}]+)\}',open(f'js/{m}').read()) for n in re.split(r'[\s,]+',chunk) if n}
print('\n'.join(sorted(exp-imp)[:20]))
"

# Package for delivery
cd /home/claude && zip -r Adaptive-Session-Studio-fixed.zip Adaptive-Session-Studio/ -x "*.DS_Store" -q
cp Adaptive-Session-Studio-fixed.zip /mnt/user-data/outputs/
```
