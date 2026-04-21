# 24 — Developer Reference

Technical documentation for contributors and developers who want to understand or extend the codebase.

---

## Architecture overview

Adaptive Session Studio is a **zero-build, plain ES module** web application. No bundler, no framework, no transpilation. Every file is loaded as-is by the browser.

```
index.html          Entry point — all HTML, dialog templates
css/
  style.css         All styling — single file
js/
  main.js           App bootstrap, event wiring, keyboard handler
  state.js          Session state, normalizers, IDB persistence
  playback.js       RAF loop, block execution, template resolution
  ...               39 modules total
tests/
  index.html        In-browser test runner
  *.test.js         33 test suites, 1,745+ tests
docs/               (this documentation)
```

---

## Module list

| Module | Responsibility |
|--------|---------------|
| `main.js` | Bootstrap, DOM wiring, keyboard, settings handlers |
| `state.js` | Session state, all normalizers, IDB/localStorage persistence |
| `playback.js` | RequestAnimationFrame loop, block execution, `seekTo` |
| `ui.js` | Sidebar, inspector tabs, settings form rendering |
| `funscript.js` | Timeline canvas editor, FunScript interpolation, import |
| `audio-engine.js` | Web Audio API, playlist management, crossfade |
| `state-engine.js` | Real-time metric fusion (attention × engagement × intensity) |
| `rules-engine.js` | Rule condition evaluation, action dispatch |
| `trigger-windows.js` | Timed challenge windows, success/failure branching |
| `safety.js` | Hard intensity/speed limits, emergency cooldown |
| `intensity-ramp.js` | Configurable ramp curves (time / engagement / step / adaptive) |
| `dynamic-pacing.js` | Engagement-driven speed modulation with EMA smoothing |
| `session-modes.js` | 8 one-click session presets |
| `ai-authoring.js` | Anthropic API integration, session generation |
| `live-control.js` | Real-time slider control with safety clamps |
| `macros.js` | FunScript macro library, slot management, injection |
| `macro-ui.js` | Macro library panel rendering |
| `scenes.js` | Scene CRUD, timeline markers, skip-to-scene |
| `tracking.js` | Webcam FaceDetector state machine, attention scoring |
| `session-analytics.js` | Post-session analytics, debrief modal |
| `user-profile.js` | XP, achievements, profile panel rendering |
| `achievements.js` | 71 achievements, daily quests, XP/level system |
| `suggestions.js` | Real-time session health suggestions (15 heuristic checks) |
| `subtitle.js` | ASS/SSA parsing and overlay rendering |
| `notify.js` | Toast notifications, confirm dialogs |
| `history.js` | Undo/redo — snapshot-based, 60-step cap |
| `capabilities.js` | Browser feature detection |
| `block-ops.js` | Block duplicate/delete/reorder operations |
| `fullscreen-hud.js` | Fullscreen HUD overlay rendering |
| `idb-storage.js` | Async IndexedDB wrapper with localStorage migration |
| `plugin-host.js` | Plugin manifest validation and sandbox lifecycle |
| `content-packs.js` | 6 built-in session templates |
| `import-validate.js` | Session JSON validation, size and structure limits |
| `metrics-history.js` | Daily metrics IDB storage, CSV/JSON import, SVG chart |
| `state-blocks.js` | State Block profiles — calm / build / peak / recovery |
| `variables.js` | User-defined session variables, template resolution |
| `sensor-bridge.js` | WebSocket bridge for biometric/external sensor data |
| `funscript-patterns.js` | 11 pre-generated haptic patterns, BPM generator |
| `viz-blocks.js` | 5 canvas hypnotic visualization renderers |

---

## State management

The session state lives in `state.js`. The key object is `state.session`, which is a plain JavaScript object matching the schema defined in `defaultSession()`.

**Mutation pattern:**
```js
import { state, persist } from './state.js';
import { history }        from './history.js';

history.push();         // snapshot BEFORE mutation (for undo)
state.session.name = 'New name';
persist();              // write to IDB (async, fire-and-forget)
```

**Never mutate state without calling `history.push()` first** if the change should be undoable. (Settings changes are an exception — they don't create undo entries.)

---

## Normalizers

Every piece of imported or programmatically-created data goes through a normalizer before entering state. Normalizers:
- Fill in missing fields with safe defaults
- Validate and coerce types
- Sanitize strings that could be injected into HTML
- Generate fresh IDs when imported ones are absent or unsafe

Key normalizers in `state.js`:
- `normalizeSession(input)` — full session object
- `normalizeBlock(block, idx)` — individual content block
- `normalizeScene(s)` — scene definition
- `normalizeRule(r)` — behavioral rule
- `normalizeTrigger(t)` — trigger window

**Security note:** All imported IDs pass through `_safeId()` which restricts to `[A-Za-z0-9_-]` (64 char max). All color fields pass through `_safeColor()` which allows only `#RGB` / `#RRGGBB` hex. The `sensorBridgeUrl` is validated to `ws://` or `wss://` only.

---

## The playback loop

```js
// simplified
export function tickPlayback() {
  const { runtime, session } = state;
  if (!runtime || runtime.paused) return;

  tickStateEngine();        // update metrics
  tickSensorBridge();       // process external signals
  tickAnalytics(runtime);   // record frame data
  tickRulesEngine();        // evaluate rules, fire actions
  tickTriggerWindows();     // check challenge windows
  applyRamp();              // apply intensity ramp curve
  tickDynamicPacing();      // adjust speed from engagement
  tickSafety();             // enforce hard limits
  tickHud();                // update fullscreen HUD

  // Execute blocks scheduled for this frame
  // ... block execution logic ...

  runtime.raf = requestAnimationFrame(tickPlayback);
}
```

The RAF loop runs at 60fps. Each tick is ~16ms. Heavy operations (audio decode, IDB writes) are async and never block the loop.

---

## Import validation

`import-validate.js` defines limits and validates imported JSON before `normalizeSession` runs:

```js
LIMITS = {
  SESSION_JSON_BYTES:   20_000_000,  // 20 MB
  FUNSCRIPT_JSON_BYTES:  5_000_000,  //  5 MB
  MACRO_JSON_BYTES:      1_000_000,  //  1 MB
  PASTED_JSON_BYTES:     2_000_000,  //  2 MB
  SUBTITLE_BYTES:        5_000_000,  //  5 MB
  BLOCKS:                    1_000,
  SCENES:                      200,
  RULES:                       100,
  VARIABLES:                   100,
  CUSTOM_THEMES:                20,
  FUNSCRIPT_ACTIONS:       100_000,
  // ... more
}
```

**Always check `file.size` before `file.text()`** on file imports. Reading a multi-gigabyte file into memory before rejecting it is a DoS vector.

---

## Security model

The app is a local-origin web app with no external JS dependencies (no CDN, no third-party scripts). Security posture:

- **HTML injection:** All user-derived strings are passed through `esc()` before `innerHTML` insertion
- **ID injection:** Imported IDs are sanitized via `_safeId()` before use in HTML attributes
- **Color injection:** All color fields go through `_safeColor()` (hex only)
- **URL injection:** `sensorBridgeUrl` validated to `ws://` / `wss://` only; rendered with `esc()`
- **Size limits:** All import paths check `file.size` before reading
- **AI key:** Stored in IndexedDB — same-origin only, never sent anywhere except Anthropic's API

The remaining risk vector is the AI API key in IndexedDB being readable by any same-origin XSS. As long as the app is served from a trusted local server (not a public host), this is low risk.

---

## Testing

Tests run in the browser at `tests/index.html`. There is no Node.js test runner.

**Running tests:**
1. Start your local server
2. Open `http://localhost:PORT/tests/index.html`
3. All 33 suites run automatically

**Test structure:**
```js
// tests/suggestions.test.js
import { makeRunner } from './harness.js';
import { analyzeSession } from '../js/suggestions.js';

export function runSuggestionsTests() {
  const R = makeRunner('suggestions.js');
  const t = R.test.bind(R);
  const ok = R.assert.bind(R);

  t('analyzeSession does not throw on empty session', () => {
    // ...
    ok(!threw, 'must not throw');
  });

  return R.summary();
}
```

**Syntax checking** (no browser needed):
```bash
node --check js/*.js && node --check tests/*.test.js
```

---

## Adding a new suggestion

1. Open `js/suggestions.js`
2. Find the `analyzeSession()` function
3. Add a block before the `all_good` return:

```js
// ── My new suggestion ────────────────────────────────────────────
if (someCondition) {
  suggestions.push({
    id: 'my_suggestion_id',
    severity: 'info',     // 'info' | 'warn' | 'error'
    title: 'Short title',
    detail: 'Longer explanation of what to do and why.',
    action: { label: 'Fix it', fn: () => { /* optional action */ } }
  });
}
```

4. Add a test in `tests/suggestions.test.js`

---

## Adding a new achievement

1. Open `js/achievements.js`
2. Add to the `ACHIEVEMENTS` array:

```js
{ id: 'my_achievement',
  icon: '🎯',
  name: 'Achievement Name',
  desc: 'Description of how to earn this.',
  xp: 30,
  category: 'craft',   // starter|consistency|depth|endurance|focus|craft|quests|levels
  secret: false        // true = hidden until earned
},
```

3. Add the check in `checkAndAwardAchievements()`:

```js
check('my_achievement', someCondition);
```

4. Add a test in `tests/achievements.test.js`

---

## Session file format

`.assp` files are plain JSON. The top-level object is a `normalizeSession()` output:

```jsonc
{
  "name": "My Session",
  "duration": 300,
  "loopMode": "none",
  "loopCount": 1,
  "blocks": [
    {
      "id": "b_abc123",
      "type": "text",
      "label": "Opening",
      "content": "Welcome. Take a breath.",
      "start": 0,
      "duration": 15,
      "fontSize": 22
    }
  ],
  "scenes": [...],
  "rules": [...],
  "triggers": [...],
  "funscriptTracks": [...],
  "playlists": { "audio": [...], "video": [...] },
  "variables": {},
  "macroLibrary": [],
  "macroSlots": { "1": null, "2": null, "3": null, "4": null, "5": null },
  "rampSettings": { "enabled": false, ... },
  "pacingSettings": { "enabled": false, ... },
  "safetySettings": { "maxIntensity": 2, "maxSpeed": 4, "warnAbove": 1.5 },
  "displayOptions": { "toastXp": true, "sensorBridgeUrl": "ws://localhost:8765", ... },
  "hudOptions": { "showMetricBars": true, ... }
}
```

---

## Contributing

1. Fork the repository on GitHub
2. Make changes in a feature branch
3. Run `node --check js/*.js` to verify syntax
4. Open `tests/index.html` and confirm all tests pass
5. Submit a pull request with a clear description of what changed and why

Join the Discord for discussion before starting large changes: [discord.gg/G6qD35nag7](https://discord.gg/G6qD35nag7)

---

## License

Personal use only. Not for commercial redistribution. See LICENSE for full terms.
