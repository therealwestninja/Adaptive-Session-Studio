# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [v4.6.0] — 2026-04-14

### Achievement System — Full Implementation

#### New Module: `js/achievements.js`
- 71 achievements across 8 categories (19 hidden)
- Category breakdown: Starter (6), Consistency (8), Sessions (8), Endurance (8),
  Focus (8), Craft & Exploration (20), Quests (7), Levels (6)
- All achievements scaled for 2-3 sessions/month, <10 min each
- XP system: 20 levels (Initiate → Apex) with named tiers
- Daily quest system: 3 deterministic quests per day (resets at midnight)
  - 15 quest types in pool; always includes `q_complete_any` baseline
- `processSessionEnd()`: full pipeline — XP → mode tracking → focus counters →
  quests → quest XP/achievements → achievement XP → save → notify
- `awardEmergencyBadge()`: awards Safety First on emergency stop
- All 4 toast types gated by `displayOptions.toast*` settings

#### Profile Panel
- XP/level bar with progress percentage and "N XP to next level"
- Daily quest section: 3 quests with ✅/icon state, XP shown in gold
- Achievement grid: 8 categorised sections with per-category completion counts
  - Gold header when category is fully complete
  - Secret achievements shown as 🔒 ??? until earned
  - Hover tooltip shows name + description / "Secret achievement"
- Replay onboarding button (fires immediately via CustomEvent, no page reload)
- Reset settings to defaults button (preserves session content)
- Clear profile: double-confirmation ("Are you sure?" → "Really, really sure? 🥺")

#### Post-Session Modal
- "Session progress" strip shows XP, level-up badge, new achievements, completed quests
- `processSessionEnd` awaited before modal shows so data is always fresh

#### Bug Fixes
- `rebuildProfile()` wiping all achievement/XP data on every call — fixed with CARRY_OVER list
- `monthly_visitor` crashing on empty monthCounts (`Math.max(...[])` = `-Infinity`)
- `q_two_sessions` quest awarded on ANY completed session (spurious `|| completed` fallback)
- `perfectQuestDays` incrementing multiple times per day when user plays 3+ sessions
- `QUEST_POOL` not exported from achievements.js (profile panel import silently failed)
- Duplicate `clearProfileBtn` in zero-session render path
- `getDailyQuests` throwing `TypeError` from BigInt seed arithmetic
- `all_packs` achievement never earnable (pack loads not tracked) — fixed in `content-packs.js`
- Post-session modal showing stale data (reordered: process achievements first, then show modal)

#### Settings
- 4 new toast toggle fields in Display/HUD settings (XP, level-up, achievements, quests)
- All 4 wired bidirectionally through `syncSettingsForms` / `syncSessionFromSettings`

#### Tests
- New suite: `tests/achievements.test.js` (63 tests)
- New suite: `tests/notify.test.js` (13 tests)
- Total: 1,583 tests across 33 suites

---

## [v4.5.14] — 2026-04-14

### Bug Fixes — Bug Hunt Rounds 3–7

#### Critical Safety / Data Corruption
- **`interpolatePosition(NaN)`** → now returns `0` (was propagating NaN to device socket)
- **`fmt(undefined)`** → now returns `"00:00"` (was displaying `"NaN:NaN"` in all time fields)
- **`clampIntensity(NaN)` / `clampSpeed(NaN)`** → now return `0` / `1.0` (was passing NaN through safety layer)
- **`applyLiveControl(NaN)`** → now returns `0` (was sending NaN position to device)
- **`setLiveIntensity(NaN)` / `setLiveSpeed(NaN)`** → no-op when non-finite (was corrupting slider state)

#### Security
- **`applyCssVars` fontFamily CSS injection** — `esc(fontFamily)` before direct `style.fontFamily =` assignment
- **Plugin storage key injection** — keys sanitized (strip `:`, `/`, `\`) before IDB write
- **`updateScene` id/stateType clobber** — `id` stripped from patch; `stateType` allowlisted
- **`updateRule` id/`_modeSource` clobber** — both stripped from patch before `Object.assign`
- **`updateTrigger` id clobber** — same fix
- **`sensor-bridge` variable name injection** — names validated against `VAR_NAME_RE` before `setVariable`
- **`sensor-bridge` signal name injection** — only allowlisted signal names accepted

#### Async / Race Conditions
- **`tracking.js` zombie RAF loop** — `_running` flag prevents async `loop()` re-scheduling after `stop()`
- **`notify.confirm()` Escape hangup** — added `keydown` listener; promise always resolves
- **BPM generator double-click** — button disabled during `await`, restored in `finally`

#### Logic / Data Integrity
- **`parseFunScript` double JSON.parse** — now accepts pre-parsed object; import path passes `raw`
- **`funscript.js` / `funscript-patterns.js`** — `variant: ''` added to all track creation paths
- **`content-packs.js` self-import** — removed redundant `import('./content-packs.js')` inside module
- **`funscript-patterns.js` TRACK_COLORS** — imports removed; uses local constant
- **`session.duration:0` division-by-zero** — clamped to ≥10 in `normalizeSession`
- **`parseAss(null)` crash** — `typeof text !== 'string'` guard added
- **`audio-engine` malformed dataUrl** — `indexOf(',')` guard before `atob()`
- **`macroSlot: NaN` normalizer bypass** — `Number.isFinite()` check added
- **Safety settings zero-value** — `warnAbove:0`, `cooldownSec:0`, `autoReduceTarget:0` now preserved
- **Import size check** — `text.length` checked BEFORE `JSON.parse` to prevent OOM on oversized files
- **Export filename sanitization** — path-separator and shell-special chars stripped
- **`MutationObserver` on `document.body`** — replaced with `_unmountOnNextRender` flag

#### Fire-and-Forget Cleanup
- All unhandled `.then()` chains in `dynamic-pacing.js`, `intensity-ramp.js`, `funscript.js`, `ai-authoring.js` given `.catch(() => {})`

### New Test Suites
- `tests/state-engine.test.js` — 18 tests (metric fusion, attention/signal/tick/reset)
- `tests/playback.test.js` — 12 tests (resolveTemplateVars: built-ins, user vars, edge cases)

### Tests
- **+157 new tests** across 29 suites  
- **Total: 1,330 tests across 29 suites**

---

## [v4.5.13] — 2026-04-14

### Added

#### Features
- **3 new suggestions** in `analyzeSession()`:
  - `speech_rate_no_tts` — speech rate changed but no TTS blocks exist
  - `long_session_no_scenes` — sessions over 5 min with no scenes defined
  - `sensor_auto_no_engagement_rule` — sensor bridge auto-connect on but no engagement rules
- **Settings dialog remembers last tab** — reopens on whichever tab was last visited
- **Viz block validation in import** — `validateImportedSession` now rejects unknown `vizType` values and out-of-range `vizSpeed`

#### Bug Fixes
- **`syncSettingsForms` slider labels stale** — speech rate (`s_speechRateVal`) and FunScript speed (`s_fsSpeedVal`) labels now updated when settings dialog opens
- **`closeSettings` didn't call `renderIdleScreen`** — session name/mode changes in settings now reflect on the idle screen immediately after closing
- **`normalizeSession` clamps `hideAfterSec`** — out-of-range (0.5–30) or non-finite values are corrected rather than stored
- **`funscript.js` unguarded `JSON.parse`** — WebSocket `onmessage` now wrapped in try/catch; malformed Buttplug messages no longer crash the handler
- **`sensor-bridge.js` security** — variable names from WebSocket validated against `VAR_NAME_RE`; signal names allowlisted to prevent arbitrary state injection
- **BPM generator double-click race** — button disabled during async generation, restored in `finally` block; redundant dynamic `notify` import removed

### Tests
- 13 new tests: suggestions (9), state `hideAfterSec` clamping (4)
- **Total: 1,134 tests across 27 suites**

---

## [v4.5.12] — 2026-04-14

### Added

#### Content & Visualization
- **Spiral Descent content pack** (6th pack) — Induction session using the `viz` block type. Two live spiral blocks (gold 0.6× speed during "Watch", oxblood 0.35× during "Drop"), TTS narration, 4 state-typed scenes (calm→build→peak→recovery), 360s. Demonstrates the complete viz pipeline end-to-end.
- **`session.mode` tracking** — `applySessionMode()` now writes `state.session.mode = modeId`, making the active mode readable by suggestions and other systems.
- **FunScript heatmap** — Speed-color SVG strip under each FunScript track in the sidebar and a larger version in the inspector. Brightness encodes stroke velocity (dim=slow, bright=fast). Implemented in `renderFunScriptList()` via `_buildFsHeatmap()`.
- **Script variant labels** — `normalizeFunscriptTrack` gains a `variant` field (Soft / Standard / Intense / Custom / empty). Variant selector in FunScript inspector; variant badge displayed in sidebar.
- **BPM Generator panel** — In the FunScript inspector, below the pattern picker: configurable BPM, duration, shape (sine/square/sawtooth/bounce), subdivision (quarter/eighth/sixteenth note), peak/base positions. Generates a new FunScript track and selects it.
- **Viz block suggestions** — `viz_invalid_type` (warns when a viz block has unknown `vizType`) and `viz_mode_hint` (info when viz blocks exist but mode is not induction).
- **Spiral Descent pack tests** — 8 new tests verifying viz block presence, valid types, 4-state scene arc, and successful load.

### Fixed
- **Stale `sampleSession` import** removed from `main.js` (was imported but not used since the Sample button now routes to content packs).
- **Heatmap height in inspector** — correct `viewBox` replaced so the larger inspector strip renders at the right proportions.

### Tests
- **`tests/rules-engine.test.js`** — 15 new tests: `CONDITIONING_PRESETS` schema validation, `applyPreset` for all 5 presets, null on unknown id, correct action types, deep-merge correctness in `updateRule`.
- **`tests/sensor-bridge.test.js`** — 8 new tests: `connectSensorBridge` export exists, state invariants, `renderSensorBridgePanel` silent no-op for missing container, stress test.
- **`tests/session-analytics.test.js`** — 5 new tests: completionState, zero-frame tick, attention tracking edge cases.
- **`tests/subtitle.test.js`** — 4 new tests: multi-event parse, hour-format timestamps, 3-event round-trip.
- **`tests/funscript.test.js`** — 6 new tests: `normalizeFunscriptTrack` edge cases, duplicate at values.
- **`tests/history.test.js`** — 8 new tests: depth stabilization, clear resets both directions, branching model.
- **`tests/idb-storage.test.js`** — 6 new tests: complex value round-trips, type-change overwrite, cycle test.
- **`tests/metrics-history.test.js`** — 8 new tests: clear, invalid/negative records, boundary tests, completion state counts.
- **Total: 1,009+ tests across 26 suites.**

---

## [v4.5.11] — 2026-04-14

### Added

#### Content & Discovery
- **`js/content-packs.js`** (new — Phase 3) — Five pre-built session templates: Classic Induction (trance/progressive relaxation, 300s, 4 state-typed scenes), Conditioning Foundation (reward-correction loop, 2-loop, variables), Partner Introduction (operator-cued, `partner_name` variable), Solo Surrender (4-scene arc, full escalation), Grounding Reset (calm cool-down). `loadContentPack`, `getPacksByCategory`, `renderContentPacksPicker` (gold-accented card list by category).
- **Session tab** — Content Packs picker panel added between AI Generator and Variables.
- **"Sample" menubar button** — now routes to the Content Packs picker instead of loading a single hardcoded session.

#### Session Modes (4 new)
- **🌀 Guided Induction** — trance/hypnosis. Engagement ramp 0.1→0.7 sine, pacing 0.3–0.65×, 12s smoothing. Redirect rules (not pause) to stay in trance.
- **⚙ Behavioral Conditioning** — adaptive ramp 0.4→1.2, 3 rules: reward sustained focus (↑1.2), correct drift (↓0.4), escalate peak compliance (↑1.5).
- **🎛 Operator-Led Training** — linear ramp, pacing disabled, 1 safety-pause rule only. Operator drives manually.
- **🌊 Deep Surrender** — exponential ramp to 2.0, zero rules. Full trust mode.

#### FunScript Patterns (10 new)
- **`js/funscript-patterns.js`** (new) — 10 pre-generated 60-second movement patterns across 4 categories:
  - *Steady*: Slow Pulse (4s sine, 10–90%), Steady Rhythm (1.8s sine, 15–85%)
  - *Natural*: Wave Surge (layered slow+fast sine), Heartbeat (double-beat cardiac rhythm)
  - *Escalating*: Slow Build (widening range + accelerating pace), Tease & Edge (climb-retreat-climb), Cascade (accelerating peaks), Storm (3-wave overlay at peak)
  - *Calming*: Deep Descent (oscillating 60s wind-down), Breath Sync (6s breathing cycle)
- Pattern picker panel rendered inside the FunScript track inspector (below export/delete buttons).
- `loadPatternAsTrack(id)` returns a ready-to-use track object; clicking a card pushes to undo history, adds the track, and refreshes the sidebar.

#### UI & UX
- **Onboarding tutorial** — all 5 steps rewritten to reflect real platform use cases: templates → blocks + template vars → scene State Block types → adaptive rules → live operator controls.
- **AI prompt placeholder** — updated to a concrete induction example with state-typed scenes.
- **AI system prompt** — per-mode design guidance added for induction, conditioning, operator-led, and surrender session types.

### Tests
- **`tests/content-packs.test.js`** (new — 24 tests)
- **`tests/funscript-patterns.test.js`** (new — 30 tests)
- **`tests/session-modes.test.js`** — 12 new tests for the 4 new modes
- **`tests/block-ops.test.js`** — 6 new tests: structuredClone isolation, history integration, undo round-trips
- **Total: 871 tests across 25 suites.**

---

## [v4.5.10] — 2026-04-14

### Added

#### Phase 5.1 — State Blocks
- **`js/state-blocks.js`** (new) — Four named state profiles applied as non-destructive live-control overrides when a scene is entered: 🌊 Calm (50% intensity, 0.75× speed), 📈 Build (80%, 1.0×), ⚡ Peak (120%, 1.25×), 🌱 Recovery (30%, 0.6×). `applyStateProfile`, `stateTypeLabel`, `suggestedColorForStateType`.
- **`normalizeScene`** gains `stateType: null | 'calm' | 'build' | 'peak' | 'recovery'` validated field.
- **Scene editor** — "State:" dropdown in each scene row. Auto-suggests matching palette color on first assignment.
- **Timeline canvas** — Scene band labels prefixed with state type emoji in both overview and main lanes.
- **Rule/trigger `gotoScene` action** — applies target scene's state profile after jumping.
- **Suggestions** — "no_state_types" info hint when ≥2 scenes exist but none have a stateType.

#### Phase 5.2 — User-Defined Variables
- **`js/variables.js`** (new) — `state.session.variables` map. `addVariable`, `getVariable`, `setVariable`, `deleteVariable`, `updateVariable`, `getAllVariables`, `getVariableTemplateMap`, `normalizeVariables`. `renderVariablesPanel` renders inline CRUD with type badge, live value editing, delete.
- **`normalizeSession`** inlines variable normalization (validated, type-coerced).
- **`resolveTemplateVars`** extended — user-defined `{{varName}}` resolved after built-ins. Unknown vars left intact.
- **`setVar` rule action** — `"name=value"` param string. Handler in `rules-engine.js` and `trigger-windows.js`.
- **Rules inspector** — "Set variable" in action dropdown with text param input and live variable name hints.
- **Trigger inspector** — "Set variable" in success/failure action dropdowns.
- **Session tab** — Variables panel rendered below AI Generator.
- **Suggestions** — "undefined_template_vars" warns when `{{varName}}` references undefined variable. "setvar_missing_target" warns when setVar targets undefined variable.
- **AI system prompt** updated with `variables`, `stateType`, `gotoScene`, `setVar` schema and usage rules.
- **`applyGeneratedContent`** merges AI-generated variables into `s.variables`.

#### Phase 5.3 — Sensor Bridge
- **`js/sensor-bridge.js`** (new) — WebSocket client bridging external biometric/sensor data into the engagement engine. Message formats: `{signal,value,weight}`, `{signals:[...]}`, `{variable,value}`. Auto-reconnect with exponential backoff. Stale signals auto-cleared after 5s. `renderSensorBridgePanel` in Settings → Advanced.
- **`tickSensorBridge()`** added to the RAF pipeline (before `tickStateEngine`).
- **Settings → Advanced** — Sensor Bridge panel with live status indicator, URL input, connect/disconnect.
- **Plugin `metrics.write` capability** — `ctx.metrics.push(records, retainDays)` for plugin-driven metric injection.

### Fixed
- Missing `await` on `renderProfilePanel` (async) in `main.js` clearProfile handler, `ui.js` `_mountProfilePanel`, and `user-profile.js` clearProfileBtn handler.
- `trig-param` event handler: `.trig-str-param` class preserves string values for `setVar` instead of coercing to `Number`.
- `trigger-windows.js` `ACTIONS` display list now includes `setVar` (it was in `ACTION_TYPES` but omitted from the rendered dropdown).

### Tests
- **`tests/state-blocks.test.js`** (new — 26 tests)
- **`tests/variables.test.js`** (new — 42 tests)
- **`tests/sensor-bridge.test.js`** (new — 16 tests)
- Additional tests in: `state.test.js`, `scenes.test.js`, `rules-engine.test.js`, `trigger-windows.test.js`, `suggestions.test.js`, `session-analytics.test.js`, `idb-storage.test.js`, `history.test.js`, `live-control.test.js`, `import-validate.test.js`, `macros.test.js`, `subtitle.test.js`, `funscript.test.js`, `session-modes.test.js`.
- **Total: 776 tests across 23 suites.**

---

## [v4.5.9] — 2026-04-14

### Added

#### IndexedDB Storage Migration
- **`js/idb-storage.js`** (new) — Lightweight async key/value wrapper over IndexedDB. `idbGet`, `idbSet`, `idbDel`, `idbHas`. Degrades gracefully to null on failure (private browsing compatible).
- **Session auto-save** moved from localStorage (5–10 MB quota) to IndexedDB (no meaningful quota). `persist()` uses a 150ms debounce so rapid edits are batched into one write. Sessions of any size (embedded media, FunScript tracks) auto-save reliably.
- **`sessionReady` promise** exported from `state.js`. `main.js` top-level-awaits it so the saved session fully loads from IDB before the first render, eliminating the flash-of-wrong-content.
- **Automatic localStorage migration** — on first run after update, any session in `localStorage` is transparently moved to IDB and removed. No user action required.
- **User profile** moved to IDB with in-memory cache (`loadProfile` stays synchronous).
- **Session analytics** moved to IDB with in-memory cache. `getStoredAnalytics()` reads the cache synchronously.
- **API key** moved from `sessionStorage` (cleared on tab close) to IDB (persists across browser sessions). UI copy updated. Migrates from old `sessionStorage` key automatically.
- **Plugin scoped storage** migrated from `localStorage` to IDB.

#### User Profile Enhancements (Phase 4)
- **"Primary Use" dropdown** — five options: I am training myself / for my partner / My partner trains me / I train my partner / Private/Other.
- **"Which makes me" dropdown** — Primary User or Operator.
- **Display name** — inline editable input in the profile panel header.
- **Emoji avatar** — click the emoji button to cycle through 12 curated options.
- **Goals textarea** — free-text session goals / preferences (max 500 chars).
- **Session history completion icons** — ✓ completed / ⏹ interrupted / 🛑 emergency stop.
- **`getSessionCountMilestone(count)`** — milestone messages for 1st, 5th, 10th, 25th, 50th, 100th sessions.
- **`getRuntimeMilestone(totalSec)`** — milestone messages for 1h, 10h, 50h, 100h total runtime.
- All three milestone types checked after each session; banner shown in post-session modal.

#### Completion State Tracking
- `initAnalytics` initialises `completionState: 'completed'`.
- `tickPlayback` marks `'completed'` when duration runs out naturally.
- `stopPlayback` marks `'interrupted'` on user-initiated stop; `'emergency'` via opts.
- `finaliseAnalytics` includes `completionState` in the summary and stores it in history.
- Post-session modal header is colour-coded: green / amber / red.

#### Settings → System Tab (new)
- **Restart Tutorial** — clears the onboarding flag and reshows the 5-step first-run modal.
- **Clear Profile & History** — double confirmation dialog ("Are you sure?" then "Are you really, really sure? 😢") before wiping profile and analytics from IDB.
- **Reset All Settings to Defaults** — restores appearance, playback, FunScript, safety, and advanced settings to factory defaults; session content and profile are untouched.

### Fixed
- **`stopPlayback` race condition** — UI teardown (`cancelAnimationFrame`, `state.runtime = null`) now happens synchronously *before* the `await finaliseAnalytics` IDB write, so pressing Play immediately after Stop never sees a stale runtime.
- **`setApiKey` callers** — the save/clear button handlers are now `async` to properly await the IDB write.
- **`clearStoredAnalytics`** — replaces raw `idbDel` calls in the clear-profile flows; correctly zeroes the in-memory cache so `getStoredAnalytics()` reflects the change immediately.
- **`suggestions.js` large_media** — detail text updated to remove the outdated localStorage quota warning (session is now in IDB).
- **Test memory** — `large_media` suggestions tests no longer allocate 68–267 MB of string data. A length-spoofing fake URL object tricks the estimator.
- **`rebuildProfile` tests** — previously wrote to localStorage but `getStoredAnalytics()` now reads the in-memory cache. Tests updated to use `_setAnalyticsCacheForTest`.

### Tests
- **`tests/idb-storage.test.js`** (new — 12 tests) — full IDB lifecycle: string/object/number/array round-trips, missing key returns null, delete, overwrite, independent keys, 500 KB round-trip.
- **`tests/user-profile.test.js`** — 13 new tests: `primaryUse`, `role`, `displayName`, `avatarEmoji` defaults; `getSessionCountMilestone` (6 cases); `getRuntimeMilestone` (4 cases).
- **`tests/session-analytics.test.js`** — 4 new tests: `completionState` default, summary includes field, field validates, preserved through `finaliseAnalytics`.
- **`tests/state.test.js`** — 7 new tests: `sessionReady` is a Promise and resolves, `persistState` shape, `defaultSession` uniqueness and required fields.
- **Total: 556 tests across 19 suites.**

---

## [v4.5.8] — 2026-04-13

### Added

#### Phase 2 — Branching System
- **Scene branching (`nextSceneId`)** — each scene now has an optional `nextSceneId` field. When set, pressing N (Next Scene) or a rule/trigger firing `nextScene` jumps to the named target scene instead of the sequential next one. Configurable in the scene editor via a new "After scene" select populated with all other scenes.
- **`gotoScene` rule and trigger action** — new action type that jumps to a specific named scene (by id) when a rule or trigger fires. The rules inspector shows a scene selector dropdown; the trigger inspector shows the same. Both `rules-engine.js` and `trigger-windows.js` handle the action; all normalizers in `state.js` accept it.
- **Phase 2 Override System keyboard shortcuts** — `[` / `]` adjust intensity ±10%; `,` / `.` adjust speed ±0.1×; `R` resets all live controls to default. Shortcuts blocked when a text field is focused. All produce brief toast notifications.

#### Phase 2 — Global Variables (Template Variables)
- **Template variables in text and TTS blocks** — block content can now reference live runtime values using `{{variable}}` syntax, substituted at display/speak time. Supported variables: `{{intensity}}`, `{{speed}}`, `{{loop}}`, `{{time}}`, `{{scene}}`. Case-insensitive matching. `resolveTemplateVars()` is exported from `playback.js` for testability. Hint shown in both text and TTS block inspectors.

#### UX Improvements
- **Session name quick-edit** — an editable input in the menubar center lets users rename the session without opening Settings. Stays in sync with the Settings panel; selects-all on focus; Enter commits; blur normalises empty value.
- **Session notes field** — a resizable "Author notes" textarea in the Session inspector tab (stored in session JSON, never displayed during playback). Capped at 10,000 characters with live counter. AI authoring system prompt updated to use and return `notes`.
- **Block position timeline strip** — the top of every block inspector now shows a compact SVG bar with all blocks colour-coded by type, the selected block drawn taller. Timestamps at left, right, and selected block centre.
- **Media quick-preview** — audio track inspector shows an `<audio controls>` player; image tracks show a thumbnail; video tracks show a `<video controls>` preview. All include an estimated file-size badge.
- **Scene editor with timing inputs and colour picker** — scene rows now include numeric start/end inputs (with live duration hint), a colour `<input type="color">` swatch, and the new "After scene" branch select. Replaced the stale "right-click to set timing" tooltip.
- **Export file size** — the Export `.assp` button now shows the actual file size in the success/warning toast, warning when the file exceeds 50 MB.
- **TTS character/word/duration hint** — the TTS block inspector displays a one-line annotation: character count, approximate word count, and estimated speech duration at default rate.
- **`gotoScene` in keyboard shortcuts overlay** — the `?` overlay is now three columns, with a "Live Overrides" column listing the `[`, `]`, `,`, `.`, `R` shortcuts.

#### Suggestions
- **`large_media` suggestion** — warns when total embedded media exceeds 50 MB; escalates to `warn` severity above 150 MB.
- **`unlabeled_blocks` suggestion** — suggests adding meaningful labels when 3+ blocks still have default `Block N` names.
- **`broken_branch` suggestion** — warns when a scene's `nextSceneId` points at a scene that no longer exists, with an "Open scenes" action button.

### Fixed
- **`addScene` spurious undo entry** — `history.push()` now runs after the full-session guard check, so no undo entry is created when `addScene` is a no-op.
- **`gotoScene` string param preserved** — rules and trigger param event handlers now detect select vs number inputs and store scene IDs as strings rather than converting to `Number`.
- **`state.js` normalizers** — `gotoScene` added to all three inline action type allowlists (rule actions, trigger successAction, trigger failureAction).

### Tests
- **`tests/scenes.test.js`** — 6 `nextSceneId` normalizer tests; 12 `resolveTemplateVars` tests (all 5 variables, case-insensitivity, null/empty, multiple substitutions in one string).
- **`tests/state.test.js`** — 5 `nextSceneId` round-trip tests via `normalizeSession`; 5 `notes` field tests.
- **`tests/pacing-ramp.test.js`** — 6 new `evaluateRamp` tests: adaptive mode, step mode with multiple steps, monotonicity (linear), boundary values (exponential, sine), descending ramp midpoint.
- **`tests/suggestions.test.js`** — 3 `broken_branch` suggestion tests.
- **Total tests: 473** across 17 suites.

---

## [v4.5.7] — 2026-04-13

### Fixed

#### Runtime / Playback
- **Audio unmute during playback** — tracks that were muted at playback start now become audible when unmuted. `startSingleTrack` in `audio-engine.js` was already present; the mute toggle in `main.js` was already calling it correctly. `removeSingleTrack(id)` added to `audio-engine.js` for the complementary delete-during-playback path.
- **Async playback startup race** — `startPlayback` now captures `const capturedRuntime = state.runtime` before the async `startPlaylistLayers()` call; the `.then()` callback bails out if `state.runtime` has changed (stop/import before decode finished), preventing a null-dereference crash in `initAnalytics`.
- **Deleting a playlist track during playback** — audio tracks are now stopped and disconnected via `removeSingleTrack` (Web Audio engine) or by resetting `backgroundAudio` elements (fallback path). Video tracks trigger a full `bgHost` rebuild from the surviving tracks so the deleted track disappears immediately instead of continuing to play.
- **Stale sidebar selection after session load/import** — all three session-replacement paths (New session, Load sample, Import package) now explicitly clear `selectedSidebarType`, `selectedSidebarIdx`, and `selectedSidebarId`, preventing the inspector from showing "Track not found" after a session change.

#### Rules & Triggers
- **Cross-loop cooldowns** — `state-engine.js` now publishes `totalSec` (absolute playback clock, never resets) alongside the per-loop `sessionTime`. Both `rules-engine.js` and `trigger-windows.js` now track `lastFiredAt` against `totalSec` so cooldowns work correctly across loop boundaries.
- **`setIntensity(0)` and `setSpeed` via rules/triggers** — replaced `Number(param) || 1` with `Number.isFinite(Number(param)) ? Number(param) : 1` throughout. Zero is now a valid intensity target.
- **Macro injection toast** — both engines now only show the "macro injected" toast when a valid macro was actually resolved and passed to `injectMacro`. If the slot is empty or the macro was deleted, a warning is shown instead.
- **Trigger inspector: action params not editable** — the trigger inspector now renders conditional param inputs (slot 1–5 for `injectMacro`, 0–2 for `setIntensity`, 0.25–4 for `setSpeed`). Changing action type re-renders the inspector so the right input appears. `cooldownSec` is now also exposed as an editable field.
- **Stale trigger enabled/total badge** — toggling a trigger's enabled state in the inspector now re-renders the sidebar so the badge updates immediately.

#### Session Modes
- **Mode rules survive mode switches after renaming** — mode-generated rules are now tagged with `_modeSource: modeId` metadata at creation; `applySessionMode` removes old mode rules by metadata rather than display-name prefix. Renaming a mode rule no longer lets it accumulate across mode changes. `normalizeRule` preserves `_modeSource` if present.

#### Analytics & Profiles
- **`loopsCompleted` overcounting** — `finaliseAnalytics` now uses `Math.floor(totalSec / duration)` instead of `runtime.loopIndex + 1`; an in-progress loop is no longer counted as completed.
- **Open attention-loss interval at session end** — if attention was still lost when the session ended, the open `_attentionLostAt` interval is now folded into `attentionLossTotalSec` before the summary is stored.
- **Streak UTC/local mismatch** — `_todayStr()` and `_computeStreak()` in `user-profile.js` now derive dates from local calendar day (`getFullYear/getMonth/getDate`) instead of `toISOString().slice(0,10)`, preventing streak miscounts for users near midnight local time.

#### Macro Library
- **`removeMacro` cleanup** — deleting a custom macro now also clears any `macroSlots` entries pointing at the removed id, clears `macroId` on blocks that referenced it directly, and nulls `action.param` on any rule or trigger action that was configured to inject it. Silent no-ops after deletion are replaced with warning toasts.
- **Builtin macro editor silent copy creation** — adding or deleting points in a builtin macro editor no longer silently persists a custom copy to the macro library. Edits are now held in a module-level pending state (`_pendingBuiltin`) and only saved when the user explicitly clicks "Save as copy". Navigating to a different macro discards the pending draft.

#### HTML / Injection Safety
- **Suggestions panel XSS path** — `renderSuggestions` now escapes `s.title`, `s.detail`, and `s.action.label` with `esc()` before `innerHTML` interpolation. User-controlled block labels, scene names, and track names can no longer inject markup.
- **Trigger name attribute injection** — trigger names are now escaped with `esc()` in the inspector `<input value="…">` attribute.
- **Block volume `|| 1` → `?? 1`** — TTS and audio block volume inputs in the inspector now use nullish coalescing so a stored volume of `0` renders as `0` rather than being silently promoted to `1`.
- **AI mode label** — "Replace session" renamed to "Replace generated content" to accurately reflect that only blocks, scenes, and rules are replaced, not the full session state.

### Added

#### Security — Import Validation Layer (`import-validate.js`, new module)
A shared import-security module gates every user-supplied file or JSON payload before it touches app state, playback, or persistence. All validators throw a descriptive error on violation; the import is rejected before any state mutation.

Hard budgets enforced:

| Budget | Limit |
|---|---|
| Session JSON text | 20 MB |
| Subtitle text | 5 MB |
| Single media file | 100 MB |
| Total embedded media per session | 200 MB |
| Blocks / Scenes / Rules / Triggers | 1,000 / 200 / 200 / 200 |
| Audio / Video / Subtitle / FunScript tracks | 50 / 50 / 20 / 20 |
| Macros | 200 |
| FunScript actions per track | 200,000 |
| Macro actions | 1,000 |
| Subtitle events | 20,000 |
| Any single string field | 100,000 chars |

Import paths now hardened:
- **Session package import** (`.assp`/`.json`) — `validateImportedSession` before `normalizeSession`
- **Audio file import** — `validateMediaFile` per file; errors per-file, successes still batch
- **Video/image file import** — same per-file validation
- **Subtitle import** (`.ass`/`.ssa`) — `validateMediaFile` then `validateSubtitleText` before parse
- **FunScript track import** — `validateMediaFile` then `validateFunScript` in `importFunScriptFile`
- **Macro file import** — `validateMediaFile` then `validateMacro` in `importMacroFile`
- **Block-level inline media replacement** — `validateMediaFile` before `readAsDataURL`
- **JSON-apply panel** — routed through `validateImportedSession`; no separate trust boundary

#### Security — Safe Boot Recovery (`state.js`)
The localStorage boot path is now wrapped in a named IIFE with a quarantine path. If the stored session is corrupt or unparseable:
- the bad payload is written to `adaptive-session-studio-quarantine-v4` (inspectable but not auto-loaded)
- a clean default session starts
- a persistent toast notifies the user and directs them to Settings → JSON for recovery

This prevents a broken saved state from bricking the app on every reload.

#### Security — API Key Storage (`ai-authoring.js`)
The Anthropic API key is now stored in `sessionStorage` instead of `localStorage`:
- scoped to the current tab only; cleared automatically when the tab closes
- not written to persistent browser storage
- not accessible across tabs or after browser restart
- removes it from the persistent same-origin data store that XSS can read
- UI updated to explain the trade-off (key must be re-entered after tab close)

---


### Added

- **Multi-Signal Fusion (ROADMAP Phase 17)** — `state-engine.js` upgraded with configurable weighted signal fusion. `deriveEngagement()` now combines attention (70%), device load/`lastSentPos` (20%), and intensity (10%) by default. Weights are normalised at runtime so they always sum to 1. `setExternalSignal(name, value, weight)` / `clearExternalSignals()` allow external biofeedback adapters to inject normalised signals (e.g. heart rate) into the fusion engine without changing the core module. `deviceLoad` (0–1 from FS output position) added to `state.engineState`. `state._fsStateRef` bridge set in `playback.js` to avoid circular dep chain. `DEFAULT_FUSION_WEIGHTS` exported for documentation and testing.

- **`safety.js`** *(new — ROADMAP Cross-Cutting C)*: Always-on safety layer:
  - `clampIntensity(v)` / `clampSpeed(v)` — hard-cap enforcement, now called inside `setLiveIntensity` / `setLiveSpeed` in `live-control.js`.
  - Warns when intensity exceeds `warnAbove` (throttled to once per 10s).
  - `recordEmergencyStop()` / `isEmergencyCooldownActive()` — blocks `startPlayback` for `emergencyCooldownSec` seconds after an emergency stop.
  - `tickSafety()` — auto-reduces intensity when attention drops below 0.2 (if `autoReduceOnLoss` is enabled).
  - `renderSafetyPanel()` — always-visible settings panel below the Live Control area.
  - `normalizeSafetySettings()` with full field validation.

- **`session.safetySettings`** added to `defaultSession` and `normalizeSession`.

- **Trigger window markers on overview canvas** — amber diamond markers at `atSec` with a duration-band fill, drawn in `drawOverviewLane` before the playhead.

- **`tests/safety.test.js`** *(new)* — 18 tests: `defaultSafetySettings` (1), `normalizeSafetySettings` (8: null, clamps for all fields), `clampIntensity`/`clampSpeed` (4: pass-through and cap), emergency cooldown (3).

- **5 new `normalizeBlock` tests** in `state.test.js` (macroSlot, macroId, macro type).

- **3 new `safetySettings` normalizeSession tests** in `state.test.js`.

### Changed

- `live-control.js` — imports `clampIntensity`, `clampSpeed`, `renderSafetyPanel` from `safety.js`. Both setter functions now apply safety clamps before writing to `state.liveControl`.
- `playback.js` — imports `tickSafety`, `recordEmergencyStop`, `isEmergencyCooldownActive` from `safety.js`. `startPlayback` checks cooldown. `emergencyStop` calls `recordEmergencyStop`. `tickSafety()` added to RAF loop.

---



### Added — Timing Interaction Layer & AI-Assisted Authoring (ROADMAP Phase 4 + 18)

- **`trigger-windows.js`** *(new — ROADMAP Phase 4)*: Timing-based interaction windows. A window opens at a session time (`atSec`) and monitors whether a condition (same metric/op/value system as rules) is met within `windowDurSec` seconds. Success → fire success action; timeout → fire failure action. Full action set: none, pause, resume, stop, injectMacro, setIntensity, setSpeed, nextScene. `tickTriggerWindows()` called every RAF frame. CRUD: `addTrigger`, `updateTrigger`, `deleteTrigger`, `toggleTrigger`. `clearWindowState()` on stop. Inspector panel with per-trigger success/failure action selects. Sidebar section "Triggers ⏱" with enabled/total badge.

- **`ai-authoring.js`** *(new — ROADMAP Phase 18)*: AI-assisted session content generation. Calls Anthropic `claude-sonnet-4-20250514` via `/v1/messages` with a structured system prompt. User writes a natural-language description; Claude returns a JSON session config (blocks, scenes, rules, rampSettings). `applyGeneratedContent(generated, mode)` normalizes and merges or replaces session content with full undo snapshot. UI: textarea prompt + merge/replace radio + generate button with progress feedback. Mounted in the Session inspector tab below the mode selector.

- **`session.triggers[]`** added to `defaultSession` and `normalizeSession` (inline normalizer).

- **`tests/trigger-windows.test.js`** *(new)* — 27 tests: `normalizeTrigger` (19: all fields, defaults, clamping, valid/invalid metrics/ops/actions), CRUD (7: add, delete, no-op delete, update name/condition/successAction, toggle).

- **3 new `normalizeSession` tests** for triggers (init, normalize entries, cooldown clamping).

### Fixed

- **`renderAiAuthoringPanel` not called** — `aiAuthoringPanel` div added to `renderSessionTab` HTML; `renderAiAuthoringPanel` called in `renderInspector` case `'session'` after DOM insertion.

- **Dead `normalizeTrigger` import** removed from `ai-authoring.js`; replaced with static `drawTimeline` (funscript.js) and `renderRampPanel`/`renderPacingPanel` (live-control.js) — eliminating 2 lazy post-generation imports.

- **`updateSidebarSelection`** now handles `type === 'triggers'`.

- **`renderTriggersSummary`** added to `renderSidebar()` call chain.

---



### Added — Macro Block Type, Session Modes, Safety Layer

- **`macro` block type** (ROADMAP Phase 3 — Macro Trigger System Upgrade): New block type that injects a macro at a specific timeline position (once per loop). Fields: `macroSlot` (1–5, resolves via `getSlotMacro`) and `macroId` (direct override). Displayed as pink (`#ff8fc8`) in all timeline canvases and the sidebar dot. Inspector panel shows slot dropdown and macro-by-id select from library. "⚙ Macro" button added to block add bar in sidebar.

- **`session-modes.js`** *(new — ROADMAP Phase 14 + 15)*: Session mode presets that apply a coherent combination of ramp + pacing + rules in one click:
  - **Exposure Therapy** — time-based exponential ramp 0.3→1.4, pause/intensity-fallback rules
  - **Mindfulness/Focus** — engagement-based sine ramp 0.2→0.8 (replace mode), slow dynamic pacing 0.5–0.9×, attention-stabilizing rules
  - **Deep Focus** — adaptive ramp, dynamic pacing, 3 conditioning rules
  - **Free Run** — clears all adaptive settings
  - Mode rules are prefixed (`[Exposure]`, `[Mindfulness]`, `[Focus]`) and replaced when a new mode is applied; custom rules are preserved.
  - **Mode selector panel** rendered in the Session inspector tab below block actions.

- **Session tab layout**: Mode selector appended to `renderSessionTab`. `attachSessionTabEvents` calls `renderModeSelector('sessionModeSelector')` after DOM insertion.

### Fixed

- **`tag-pink` CSS class** added for macro block type visual consistency.
- **`BLOCK_COLORS`** in `ui.js` and **`blockColors`** in both `funscript.js` canvas draw functions updated with `macro: '#ff8fc8'`.
- **`macroSlot` field coercion** in `handleBlockFieldChange`: empty string → `null`, number → `Number(val)`.
- **`session-modes.js` lazy `live-control` import** replaced with static import (no circular dep: `live-control → state, intensity-ramp, dynamic-pacing`).

---



### Added — Habit Training, Adaptive Difficulty & Conditioning Presets (ROADMAP 3.10, 3.11, 3.13)

- **Habit Training (ROADMAP Phase 3.13)** in `user-profile.js`:
  - `computeDifficultyLevel(profile)` → 1–5 difficulty score derived from streak (7+ days, 30+ days bonuses), attention stability (0.8+, 0.95+ thresholds), and intensity trend. Caps at 5.
  - `getStreakMilestone(streak)` → returns milestone message at 3/7/14/30/100-day marks. Displayed as a banner in the profile panel.

- **Adaptive Difficulty Curves (ROADMAP Phase 3.11)** in `user-profile.js`:
  - `getAdaptiveRampSuggestion()` → returns a full `rampSettings` object tuned to profile history: scales `startVal`/`endVal` from preferred intensity percentages, picks `adaptive` mode when tracking data exists, escalates curve shape by level (linear → sine → exponential). Returns `_note` describing the basis ("Based on 12 sessions, level 3/5").
  - **"Adapt to my profile" button** in the Intensity Ramp panel applies the suggestion and shows the note.

- **Behavioral Conditioning Presets (ROADMAP Phase 3.10)** in `rules-engine.js`:
  - `CONDITIONING_PRESETS` — 5 named rule templates: "Reward sustained focus" (attention ≥ 0.9 for 10s → inject slot 1), "Correct attention loss" (attention < 0.3 for 3s → pause), "Escalate on high engagement" (engagement ≥ 0.8 for 15s → setIntensity 1.5), "Recover on low engagement" (engagement < 0.3 for 8s → setIntensity 0.6), "Auto-advance on engagement peak" (engagement ≥ 0.95 for 5s → nextScene).
  - `applyPreset(presetId)` — normalizes and appends the preset rule to the session.
  - **Presets dropdown** in the Rules inspector panel. Selecting a preset adds it immediately.

- **`tests/user-profile.test.js`** *(new)* — 24 tests: `computeDifficultyLevel` (9 cases: null, new user, baseline, streak bonuses, stability thresholds, capped at 5), `getAdaptiveRampSuggestion` (5 cases: shape, ranges, endVal≥startVal, note string), `getStreakMilestone` (6 cases: zero, non-milestone, 3/7/30/100 days), `defaultProfile` (1 case: shape).

- **10 new `normalizeSession` tests** in `state.test.js` covering `rampSettings` (3 cases) and `pacingSettings` (4 cases) inline normalizers.

### Fixed — Lazy import cleanup (–4 imports)

- `tracking.js` → `notify.js`: now a static top-level import.
- `tracking.js` → `session-analytics.js` (`notifyAttentionLost`, `notifyAttentionReturned`): both now static.
- `suggestions.js` → `state.js` (`persist`): added to existing static import; lazy call removed.

---



### Added

- **`user-profile.js`** *(new — ROADMAP Phase 3.12)* — Local-only persistent user profile (`localStorage` key `ass-profile-v1`). Built automatically from session analytics history. Tracks: session count, total runtime, streak (consecutive days), attention stability (0–1 rolling average), preferred intensity avg/peak, re-engagement speed, and rising/falling/stable trends for intensity and attention. `renderProfilePanel(containerId)` renders into the Status inspector tab with history list, progress bars, and a "Clear profile" button. No cloud, no tracking beyond what the user generates locally.

- **`dynamic-pacing.js`** *(new — ROADMAP Phase 2.7)* — Auto-modulates the Live Control speed slider from the state engine's engagement score. Configurable min/max speed, EMA smoothing time constant, curve shape (linear/exponential/sine), and optional lock period between changes. `tickDynamicPacing(frameSec)` runs each RAF frame; `resetDynamicPacing()` clears state on stop. Panel shown during playback.

- **Two new suggestion checks**:
  - `rules_no_webcam` (warn): attention-metric rules defined but webcam tracking is off.
  - `pacing_no_webcam` (info): dynamic pacing or engagement-mode ramp enabled with no tracking.

- **`tests/pacing-ramp.test.js`** *(new)* — 31 tests covering `normalizeRampSettings` (11 cases), `evaluateRamp` (8 cases: disabled, null runtime, time/engagement/step modes, midpoint, boundary), `normalizePacingSettings` (7 cases), and `tickDynamicPacing` (4 cases: disabled, stopped, engagement=0→minSpeed, engagement=1→maxSpeed).

### Fixed

- **`pacingSettings` missing from `normalizeSession`** — imported sessions with pacing config were silently dropping all settings. Inline normalizer added matching `rampSettings` pattern.

- **`user-profile.js` double lazy `notify` import** — two `import('./notify.js')` calls replaced with a static top-level import.

- **`intensity-ramp.js` dead imports and lazy `persist`** — removed unused `clampInt` and `fmt` imports; replaced two `import('./state.js').then(persist)` calls with static `persist` from the existing state.js import.

---



### Added — Intensity Ramp System (ROADMAP Phase 2.8–2.9)

- **`intensity-ramp.js`** *(new)* — Smooth intensity escalation curves (ROADMAP Phase 2.8 & 2.9). Four modes: `time` (linear over session duration), `engagement` (proportional to engagement score), `adaptive` (average of time + engagement), `step` (discrete jumps at defined session times). Three curve shapes: `linear`, `exponential`, `sine`. Three blend modes: `max` (keeps whichever is higher — manual or ramp), `replace` (overrides manual), `add` (adds to manual). Ramp panel visible only during playback; settings persisted in `session.rampSettings`.

- **`session.rampSettings`** field added to `defaultSession()`.

- **Ramp panel** rendered below the Live Control panel, hidden when not playing.

- **`normalizeRampSettings()`** exported for use in import/restore.

### Fixed — Lazy imports in `rules-engine.js` reduced

- `macros.js` and `live-control.js` are now **static imports** in `rules-engine.js` (no circular dependency: `macros.js → funscript.js, state.js`; `live-control.js → state.js`). Reduces dynamic `import()` calls per action execution.

- `setLiveIntensity(val)` and `setLiveSpeed(val)` exported from `live-control.js` — targeted slider + label updates without rebuilding the full panel. Used by rules-engine and intensity-ramp.

- Rule actions `setIntensity` and `setSpeed` now call `setLiveIntensity`/`setLiveSpeed` directly — no `renderLiveControl()` panel rebuild.

---

 — State Engine + Behavioral Scripting (ROADMAP Phase 1)

### Added

- **`state-engine.js`** *(new)* — Central runtime state hub (ROADMAP Phase 1.2). Publishes `state.engineState` every RAF tick: `attention` (0–1, from tracking), `intensity`/`speed` (from liveControl), `engagement` (0–1 EMA-smoothed composite, ~3s time constant), `sessionTime`, `loopCount`, `fsPaused`, `playing`. Exports `setAttention(v)`, `getMetric(name)`, `resetStateEngine()`.

- **`rules-engine.js`** *(new)* — Per-tick behavioral rule evaluator (ROADMAP Phase 1.1). Rule schema: `{ condition: { metric, op, value }, durationSec, cooldownSec, action: { type, param } }`. Condition must hold for `durationSec` before firing; re-fire blocked by `cooldownSec`. Action types: `pause`, `resume`, `stop`, `injectMacro` (slot 1–5), `setIntensity`, `setSpeed`, `nextScene`. `normalizeRule()` with full field validation. CRUD: `addRule`, `updateRule`, `deleteRule`, `toggleRule`. Rule runtime state (`conditionHeldSec`, `lastFiredAt`) per-rule, cleared on session reset.

- **Webcam attention now feeds state engine** — `tracking.js` calls `setAttention(1)` on face detected, `setAttention(decay)` during absence (smooth 1→0 over attentionThreshold seconds). The state engine is now the single source of attention truth.

- **Rules inspector panel** in `ui.js` — per-rule enable toggle, name field, metric/op/value row, duration, action type dropdown, param field (shown for injectMacro/setIntensity/setSpeed), cooldown. `renderRulesSummary()` shows `active/total` badge in sidebar. Auto-selects overlay tab on click.

- **Attention + Engagement meter bars** — two new bars added to Live Control panel alongside FS Out. Colour-coded green/amber/red by level. `updateLiveEngineMeters()` exported from `live-control.js`, called every RAF frame.

- **Attention + Engagement stat cards** in Status inspector tab — displayed during playback alongside Time, Loop, Block, FS pos, Scene. Live-updated via `refreshLiveStatus()`.

- **`rules: []`** added to `defaultSession()` and `normalizeSession()` (inline normalizer avoids circular dep with rules-engine.js).

- **`docs/5 ROADMAP.md`** — New expanded roadmap saved to project docs.

- **`tests/rules-engine.test.js`** *(new)* — 27 tests: `normalizeRule` (22 cases covering all fields, defaults, clamping, invalid values), state engine `setAttention`/`getMetric`, and `tickRulesEngine` behavior (disabled rules, durationSec threshold, condition reset when false, cooldown).

### Changed

- `playback.js` — ticks `tickStateEngine()`, `tickRulesEngine(frameSec)`, and `updateLiveEngineMeters()` each frame; both engines reset in `stopPlayback`.
- `main.js` — `resetStateEngine()` and `clearRuleState()` called on new session / import / apply JSON.
- `index.html` — Rules sidebar section added below Scenes.

---



### Added — Timeline zoom (ROADMAP Phase 2.3)

- **Mouse-wheel zoom on the FunScript canvas** — scroll up to zoom in, scroll down to zoom out. The time position under the cursor remains fixed during zoom. Minimum zoom window is 2 seconds; maximum is the full session duration. Works on both the FunScript canvas and the overview canvas.

- **Zoom viewport state** — `_viewStart` / `_viewEnd` (milliseconds) define a shared view window. `canvasToTime` and `timeToX` in `funscript.js` now map through this window rather than the full session duration, so all existing drawing code (block bands, scene markers, subtitle ticks, FunScript curves, points, playhead, grid) zooms automatically with zero per-path changes.

- **Overview canvas viewport indicator** — when zoomed, `drawOverviewLane` draws a dimmed overlay on regions outside the current view and a light border around the visible section. Click the overview to re-centre the zoom window on that time.

- **Zoom label and reset button** — when zoomed, a zoom percentage label (e.g. "400%") and a ⊞ reset button appear in the timeline panel header. `Ctrl+0` resets zoom from the keyboard. Zoom resets automatically on new session, load sample, import, and apply JSON.

- `resetZoom()` exported from `funscript.js`, imported in `main.js`.

### Fixed

- **`initOverviewCanvas` missing click-to-seek and wheel handlers** — both are now wired in. Click the overview to re-centre when zoomed; wheel on the overview zooms the same view window.

- **Overview drag: lazy `history` and `persist` imports removed** — `history.js` is now a static import in `funscript.js` (no circular dep). `persist` was already in the static import from `state.js`. Only the `ui.js → renderInspector` call after drag-complete remains lazy (correct — `ui.js` imports `funscript.js`).

- **Keyboard shortcut `Ctrl+0`** added for zoom reset; `Scroll ↕` and `Ctrl+0` entries added to the keyboard overlay.

---



### Added — Multi-lane timeline (ROADMAP Phase 2.1 partial)

- **Overview lane canvas** (`overviewCanvas`) — A 32px canvas above the FunScript curve lane showing the full session at a glance: block bands (colour-coded by type), scene bands with edge handles, subtitle cue ticks at the bottom, a time grid that adapts step to session duration (10s / 30s / 60s), and the shared playhead. Drawn every time `drawTimeline` is called.

- **Scene start/end drag editing on timeline** — Hovering near a scene edge on the overview canvas shows an `ew-resize` cursor. Clicking and dragging moves the `start` or `end` of that scene in real time (6px hit tolerance). The FunScript lane redraws live during drag. `history.push()` fires on mousedown (before the first mutation). `persist()` fires on mouseup. If the scene inspector is open it re-renders after the drag completes.

- **"Timeline" label** — The timeline panel heading updated from "FunScript Timeline" to "Timeline" to reflect the multi-lane nature.

### Technical

- `initOverviewCanvas(el)` — sets up the canvas, wires mousedown/move/up/leave events
- `drawOverviewLane(playheadSec)` — pure draw function; called from `drawTimeline` and the scene drag handler
- `overviewX(sec)` / `overviewSecFromX(x)` — coordinate helpers mirroring `timeToX`/`canvasToTime` but for the overview coordinate space
- `_overviewHitTest(x)` — returns `{ sceneId, edge }` when within 6px of a scene edge, else null
- `ResizeObserver` in `main.js` now also resizes `overviewCanvas.width` on container resize

---



### Fixed

- **`scenes.js` duplicate `state.js` import** — two separate `import … from './state.js'` lines merged into one.

- **Sidebar click auto-switching to overlay tab** — clicking any non-block sidebar item (audio/video track, subtitle, funscript, scenes) now explicitly sets `state.inspTab = 'overlay'` and updates `aria-selected` on inspector tabs. Previously only block items switched the tab; track and scenes items could open the inspector while the wrong tab was visually active.

- **HUD macro injection `isActive` indicator** — `isActive = state.injection && false` (always false, dead code) replaced with `state.injection?.macroName === macro.name`. The macro slot pill now correctly lights up during injection.

- **`scenes.js` circular dependency avoided** — `syncTransportControls` is called after scene mutations via a lazy `import('./ui.js')` (not a static import), avoiding the `ui.js → scenes.js → ui.js` cycle.

### Added

- **Active scene in fullscreen HUD** — `updateHud()` appends `· Scene Name` to the time line when `runtime.activeScene` is set.

- **Active scene in Status inspector tab** — `refreshLiveStatus()` updates a new `s_sceneVal` stat card each tick. `renderStatusTab()` renders the Scene card only when the session has scenes defined.

- **Scene time in analytics** — `tickAnalytics` accumulates time per active scene (by `sceneId`) alongside block time. `finaliseAnalytics` builds a `sceneBreakdown` array. Post-session modal shows a "Time per scene" section with colored scene dots above the block breakdown.

- **Two new suggestion checks for scenes**:
  - `scene_overflow` (warn): fires when any scene's `end` exceeds session duration.
  - `scene_overlap_N` (info): fires when consecutive scenes overlap (first overlap only to avoid noise).

---



### Added — Scene System (ROADMAP Phase 3.3)

- **`scenes.js`** *(new)* — Full scene system: `addScene()`, `deleteScene(sceneId)`, `updateScene(sceneId, patch)` with undo; `skipToNextScene()` finds the next scene boundary from current playback time, wrapping to the first; `renderSceneInspector()` / `attachSceneInspectorEvents()` wires the inspector panel; `renderSceneList(containerId)` renders editable name, loop select, and delete per scene.

- **`state.js`** — `normalizeScene(s)` normalizer: stable `id`, `name`, `start`, `end`, `loopBehavior` (`once`|`loop`), `color`. `defaultSession()` gains `scenes: []`. `normalizeSession()` maps the array through `normalizeScene`.

- **`playback.js`** — `state.runtime.activeScene` updated each tick to the scene containing `sessionTime`. `skipToScene(sceneId)` exported: eases FS to 0 then jumps to `scene.start`. Removed dead `persist` and `setMasterVolume` imports.

- **`funscript.js`** — Scene bands drawn in `drawTimeline`: dashed left-edge line, tinted fill, name label at top of each range. Uses `ctx.setLineDash` for visual distinction from block bands.

- **`index.html`** — `nextSceneBtn` added to transport center (hidden when no scenes defined). `scenesSummary` div added to sidebar below FunScript section.

- **`ui.js`** — `syncTransportControls()` shows/hides `nextSceneBtn` based on `session.scenes.length`. `renderSidebar()` calls `renderScenesSummary()`. `renderOverlayTab()` routes `selectedSidebarType === 'scenes'`. `attachOverlayTabEvents()` calls `attachSceneInspectorEvents()` when the scenes panel is open. `updateSidebarSelection()` handles `scenes` type. All `import` statements consolidated at top (removed mid-file `refreshVolumes` import — ES module syntax violation).

- **`main.js`** — Imports `scenes.js` and `skipToScene`. `N` keyboard shortcut → `skipToNextScene()`. Keyboard shortcuts overlay updated. `nextSceneBtn` wired.

- **`tests/scenes.test.js`** *(new)* — 22 tests: `normalizeScene` (13: id generation, field defaults, clamping, color, loopBehavior validation), and scene CRUD (9: addScene appends, positions after last scene, rejects beyond duration; deleteScene removes by id, no-op on bad id; updateScene patches name and loopBehavior, no-op on bad id).

### Fixed

- **Dead imports cleaned** — `persist` and `setMasterVolume` removed from `playback.js` (were imported but never called in the file body). `fileToDataUrl` and `notify` added to top-level `ui.js` imports (replacing runtime lazy `import()` calls in `saveCustomTheme`, `deleteCustomTheme`, and `handleBlockFileChange`). `macro-ui.js` gains static `notify` import.

- **Hot-path lazy import eliminated** — `session-analytics.js` no longer calls `import('./macros.js')` every 30 RAF frames; `fsState` is now imported statically.

- **Scrub-preview imports** — `updateSubtitleCue` and `getCurrentPosition`/`updatePositionIndicator` added to existing static imports in `main.js`; the Shift+click scrub-preview handler now calls them directly.

- **Undo coverage** — `_snapOnce` debounce helper prevents history spam on rapid `input` events while still capturing one snapshot per field per edit session. Applied to: session name, duration, loop count; audio/video track name and volume; FS speed and range. All `change` events (loop mode select, FS invert, video mute) get direct `history.push()`. Sort-blocks action now undoable.

- **`drawTimeline` lazy import** — `fs_delete` handler in `ui.js` now calls statically-imported `drawTimeline` directly.

---

## [v4.3.5] — 2026-04-12

### Fixed

- **Lazy import elimination pass** — 13 unnecessary `import()` calls replaced with static imports:
  - `ui.js` → `notify.js` (4× in `saveCustomTheme` / `deleteCustomTheme`)
  - `ui.js` → `state.js` `fileToDataUrl` (in `handleBlockFileChange`)
  - `macro-ui.js` → `notify.js` (import error handler)
  - `session-analytics.js` → `macros.js` `fsState` — **critical**: this ran every 30 RAF frames
  - `main.js` → `subtitle.js` `updateSubtitleCue` and `funscript.js` `getCurrentPosition` / `updatePositionIndicator` (both already statically imported)

- **Undo coverage for all inspector events** — `_snapOnce(el)` WeakMap-based debounce helper added to `ui.js`. All inspector `input` handlers now create at most one history snapshot per field per edit session (cleared on `blur`). All `change` event handlers use direct `history.push()`. Sort-blocks now creates a history entry.

- **`drawTimeline` static import** — `import('./funscript.js')` call removed from `fs_delete` handler in `ui.js`; uses statically-imported `drawTimeline`.

- **`docs/2 NEXT-STEPS.md`** — Rewritten to accurately reflect v4.3.4 completed state. Remaining work re-prioritised.

---



### Added

- **Session Analytics** (`session-analytics.js`) — ROADMAP Phase 5.3. Collects per-block time, FunScript position samples (avg + peak), and webcam attention loss events during every playback session. Stores the last 10 summaries in `localStorage` (key `ass-analytics-v1`). Shows a post-session modal 500ms after natural stop with runtime, loop count, block time breakdown, FS output bars, and attention loss stats. Emergency stop and programmatic resets (new session / import / apply JSON) suppress the modal via `{ emergency: true }` and `{ silent: true }` flags on `stopPlayback`.

- **Last session panel in Status tab** — `renderStatusTab` now renders a collapsible "Last session" `<details>` block below the suggestions list, showing the most recent analytics summary directly in the inspector without opening a separate modal.

- **Attention analytics wired** — `tracking.js` `_onLost` and `_onReturn` now call `notifyAttentionLost` / `notifyAttentionReturned` via lazy import, incrementing `attentionLossEvents` and accumulating total loss duration in the analytics object.

### Fixed

- **Frame time accuracy** — `tickPlayback` now computes actual elapsed frame time (`performance.now()` delta, capped at 200ms to suppress tab-switch spikes) instead of the hardcoded `1/60` approximation. Block time accumulation in analytics is now exact.

- **`refreshLiveStatus` lazy import removed** — `fsState` is now imported statically at module load in `playback.js`, eliminating a `import('./macros.js')` dynamic call on every animation frame.

- **`s_fsPos` stat card shows live value** — Status tab now initialises the FS position card with `fsState.lastSentPos` instead of hardcoded `0%`, so opening the tab mid-session shows the real current value.

- **Crossfade setting wired** — toggling a playlist audio track mute during playback now calls `crossfade(id, null, sec)` / `crossfade(null, id, sec)` using `session.advanced.crossfadeSeconds`. The crossfade setting is now actually connected to playback behavior (previously stored but ignored). `crossfade()` in `audio-engine.js` updated to accept `null` for either side (one-sided fade).

- **Unused `clampInt` import** removed from `main.js` and `playback.js`.

- **Two new suggestion checks**:
  - `no_blocks` (warn): fires when the session has no content blocks at all.
  - `sub_short_*` (info): fires when a subtitle track's last cue ends more than 10% before the session loops.

---



### Fixed — Critical

- **`main.js` was missing all cross-module imports** — the app threw `ReferenceError` on first interaction for every call to `notify`, `history`, `renderSidebar`, `renderInspector`, `syncSettingsForms`, `makeTrackingModule`, `injectMacro`, `getSlotMacro`, `toggleFsPause`, and 13 other symbols. All 22 missing imports are now present. The app was completely non-functional as shipped in v4.3.2.

### Architecture — module graph de-bridged

All `window._*` runtime bridges replaced with proper ES module imports:

- **`window._stateModule`** (used by `history.js` to get `normalizeSession`) — removed. `history.js` now imports `normalizeSession` directly from `state.js`. Corresponding `window._stateModule = { normalizeSession }` assignment removed from `state.js`.

- **`window._funscriptModule`** (used by `ui.js` to call `connectDevice`/`disconnectDevice`) — removed. `ui.js` now imports both directly from `funscript.js`.

- **`window._appDuplicateBlock` / `window._appDeleteBlock`** — removed. Block operations extracted to new **`block-ops.js`** module with a `registerBlockOpRenderers(rs, ri)` hook to avoid the circular dependency (`main.js` → `ui.js` → `block-ops.js` ← `history.js`, `notify.js`, `state.js`). Both `ui.js` and `main.js` now import `duplicateBlock`/`deleteBlock` directly.

- **`window._appSyncTransport`** (used by `ui.js` session inspector to sync transport bar) — removed. `syncTransportControls()` moved to `ui.js` as a proper export. `main.js` imports it from `ui.js`. Session inspector calls it directly.

### Changed

- `loopToggle` click handler simplified: state mutation + `syncTransportControls()` replaces three inline DOM mutation lines.
- `refreshLiveStatus()` in `playback.js` now updates the `s_fsPos` stat card (FS output %) in the Status inspector tab during playback. Previously rendered but never updated.
- FS-pause panel button no longer triggers full `renderLiveControl()` re-render (which reset slider drag state). Now calls `_updateFsPauseBtn()` for a targeted text/class update. `toggleFsPause()` in `macros.js` calls this via lazy import so both Shift-key and panel-button paths stay in sync.
- Sidebar item clicks now call `updateSidebarSelection()` (targeted `.selected` class flip) instead of full `renderSidebar()` (rebuilds all 5 lists' innerHTML).

### Added

- `tests/block-ops.test.js` — 13 tests for `duplicateBlock` and `deleteBlock`: new block creation, id uniqueness, label suffix, start placement, selection transfer, single-block deletion, no-op on null selection, renderer callback invocation, and sibling block preservation.

---



### Added

- **Browser-native test suite** (`tests/`) — no bundler, no build step. Open `tests/index.html` via a local HTTP server to run all tests in any modern browser.

  - **`tests/harness.js`** — minimal ES module test runner (`makeRunner`, `test`, `assertEqual`, `assertDeep`, `assert`, `assertThrows`, `summary`, `renderResults`).
  - **`tests/state.test.js`** — 35 tests covering `clampInt`, `fmt`, `uid`, all six normalizers (`normalizeBlock`, `normalizeAudioTrack`, `normalizeVideoTrack`, `normalizeFunscriptTrack`, `normalizeSubtitleTrack`, `normalizeMacro`), and `normalizeSession` — including the critical regression: empty `blocks: []` must **not** be replaced by the sample session.
  - **`tests/funscript.test.js`** — 20 tests for `parseFunScript` (valid JSON, sorting, filtering, error on invalid input), `interpolatePosition` (midpoints, clamping, inversion, range scaling, single-point tracks), and `exportFunScript` round-trip.
  - **`tests/subtitle.test.js`** — 15 tests for `parseAss`: event count, text content, start/end as numeric seconds, style extraction, override tag stripping, `\N` newline escape, missing `[Events]` section, empty input, backwards timestamps, and both `.` and `,` centisecond separators.
  - **`tests/history.test.js`** — 18 tests for the history state machine: initial state, `push` / `canUndo` / `canRedo`, `undo` restores state, `redo` re-applies, multi-step undo/redo sequence, `clear`, and 60-entry MAX_HISTORY cap.
  - **`tests/SMOKE.md`** — 11-section manual smoke checklist covering session lifecycle, all track types, loop mode consistency across three surfaces, settings, undo/redo, playback, FunScript editor, and storage persistence.

---



### Fixed

- **Playlist track normalization on add** — `addAudioInput` and `addVideoInput` now push through `normalizeAudioTrack()` / `normalizeVideoTrack()`. Tracks added during the current session immediately have stable `id` fields, so sidebar mute, delete, and selection work without requiring a reload or re-import.

- **Subtitle track normalization on add** — `addAssInput` now pushes through `normalizeSubtitleTrack()`. Newly imported subtitle tracks get stable IDs matching the pattern used by audio, video, and FunScript tracks.

- **`refreshVolumes()` muted-track bug** — previously the function only set gain for non-muted tracks; muted tracks were left at their last played gain (i.e. still audible). Now explicitly zeroes muted track gains. Live mute toggling during playback now silences the track immediately.

- **Mute toggle now updates the live audio engine** — the sidebar mute handler calls `setTrackMuted(id, muted)` when the Web Audio API engine is active, using an 80ms ramp for a click-free transition. Falls back to `refreshVolumes()` when using HTMLAudioElement playback.

- **`history.push()` added to playlist mute and delete** — toggling mute or deleting any playlist/track item is now undoable via Ctrl+Z.

- **Transport controls drift after session changes** — added `syncTransportControls()` which syncs the loop toggle button text/active state, master volume slider value, and tTotal display from `state.session`. Called after: new session, load sample, import, apply JSON, settings close, undo/redo, and on init. Eliminates the stale loop button and volume slider bugs.

- **Session inspector loop mode / duration changes now sync transport bar** — changing loop mode or duration in the inspector calls `syncTransportControls()` via `window._appSyncTransport`, so the top-bar loop toggle and tTotal are immediately consistent.

- **Dead-end inspector for audio/video playlist tracks** — clicking an audio or video playlist item in the sidebar previously showed "Select a block or track from the sidebar." Now routes to dedicated inspector panels:
  - **Audio track inspector**: name field, volume input, mute toggle (uses delegation so live audio engine is updated), remove button.
  - **Video/image track inspector**: name field, kind display, mute-audio select, volume input, remove button (live-updates running video elements).

- **Subtitle and FunScript sidebar fully ID-based** — `renderSubtitleList` and `renderFunScriptList` now emit `data-track-id` on mute and delete buttons (not `data-mute-idx`/`data-del-idx`). Both list items carry `data-sb-track-id` for selection. Mute/delete handlers are ID-first with index fallback for legacy data. Subtitle selection highlight uses `selectedSidebarId` (was index). FunScript selection highlight same.

- **Subtitle and FunScript inspectors use ID-based track lookup** — `renderFunScriptInspector` and `renderSubtitleInspector` look up by `state.selectedSidebarId` with index fallback, preventing stale references after array mutation.

- **Dead `deviceConnected` field removed** — `funscriptSettings.deviceConnected` was persisted but never read or written. Removed from `defaultSession()`. Existing sessions with the field normalize safely (field is dropped on load).

### Changed

- `setMasterVolume()` in `audio-engine.js` documented as a staged helper (future per-call fade use). `setTrackMuted()` documented as the live mute path and now called from the sidebar/inspector mute flow.
- Init block in `main.js` consolidated: loop toggle init now goes through `syncTransportControls()` instead of inline one-off code.

---

## [v4.3.0] — 2026-04-11

### Added

- **Live Control Panel** (`live-control.js`) — Runtime performance sliders visible below the FunScript timeline during playback. **Intensity** (0–200%) scales all FunScript position output. **Speed** (0.25–4×) scales the FunScript clock independently of the session clock. **Variation** (0–100%) adds ±N% random jitter per tick for organic feel. Live FS Pause button mirrors the Shift key. Reset button restores all to default. Live output meter shows current position value with intensity-coded colour. Modifiers are non-persisted — they reset on page load.

- **FunScript multi-select** — Shift+click on the canvas timeline toggles individual points into a multi-selection set (rendered as larger outlined dots). Dragging any selected point moves **all** selected points by the same delta, preserving their relative positions. Shift+click on empty space extends selection. Plain click on empty space clears selection and adds a new point. `A` key selects all points on the active track in edit mode.

- **FunScript transform bar** — Appears in edit mode above the Live Control Panel. Inputs for **time scale** (multiply timestamps), **position scale** (multiply position values), **time offset** (shift in ms), **position offset** (add to position). Apply button transforms the current selection or the entire active track if nothing is selected. Select All and Clear Selection buttons. Point count displayed.

- **Smart Suggestions** (`suggestions.js`) — Heuristic session analysis shown in the inspector Status tab. Checks: blocks extending past session duration (with action button); overlapping text blocks; no background media; FunScript tracks shorter than session duration; silence gaps >30s; excessive short loops; TTS voices not yet loaded. Sessions with no issues show "Session looks good". Refresh button re-runs analysis. Startup check (`checkAndNotify`) fires critical warnings as toasts 3s after load.

- **Sidebar scroll preservation** — `renderSidebar()` saves and restores `scrollTop` of the sidebar inner panel so block list edits do not jump the user back to the top.

- **Crossfade** re-enabled — The Crossfade (sec) setting in Settings → Playback is now active (no longer "coming soon"). The Web Audio API engine supports `linearRampToValueAtTime` transitions; the setting controls the duration.

- **`A` keyboard shortcut** — Select all FunScript points on the active track (edit mode only).

### Changed

- `getCurrentPosition()` in `funscript.js` accepts an optional `timeMsOverride` parameter. When provided (by `getLiveSpeedMs()` from `live-control.js`), the live speed multiplier is applied on top of the session's base FunScript speed setting.
- Status tab in inspector now renders both playback stat cards and a session health suggestions section.
- Duplicate `funscript.js` import in `main.js` merged into a single clean import line.

---

## [v4.2.0] — 2026-04-11

Web Audio API engine, tracking state machine, sidebar stable IDs, keyboard shortcuts overlay, Shift+click scrub preview, accessibility improvements. See previous entries.

---


### Added

- **Web Audio API engine** (`audio-engine.js`) — All playlist audio tracks now route through an `AudioContext` graph with per-track `GainNode`s and a master gain stage. Replaces ad-hoc `new Audio()` elements for playlist layers. Real `linearRampToValueAtTime` crossfade between tracks. `refreshVolumes()` updates the graph live from the master volume slider. Graceful fallback to `HTMLAudioElement` on browsers without Web Audio. AudioContext is resumed on first user gesture to satisfy browser autoplay policy.

- **Tracking state machine** (`tracking.js` rewritten) — Seven explicit states: `idle → requesting → warming_up → detecting → lost → unavailable → error`. Single-instance guard: creating a new module stops any previous one. 1.5-second warmup grace period before automation fires. `_onLost()` and `_onReturn()` handlers fire exactly once per attention event (not repeatedly). A "Warming up…" spinner is shown in the webcam panel during warmup. State labels update the camera/face status fields in settings.

- **Sidebar stable IDs** — `normalizeAudioTrack` and `normalizeVideoTrack` now assign stable `uid()` `id` fields. Sidebar rendering uses `data-track-id` attributes. Delete and mute event delegation filters by `track.id` rather than array index — safe when arrays are reordered between render and click.

- **Keyboard shortcuts overlay** (`?` or `/` key) — Inline modal showing all keyboard shortcuts in two columns (Playback / Editor). Dismisses on ESC, click-outside, or pressing `?` again. Built with no external dependencies, styled to match the app design system.

- **Shift+click timeline scrub preview** — Clicking the progress bar while stopped with Shift held previews the session at that position without starting playback: subtitle cue, block text overlay (dimmed), FunScript position meter, and timeline playhead all update. Useful for checking timing without committing to full playback.

- **`trackingWarmup` spinner** — The webcam settings panel shows a spinning "Warming up…" indicator during the 1.5s FaceDetector stabilisation window.

- **ARIA accessibility** — Added `role="main"` to workspace, `role="region"` with label to the stage, `role="group"` with label to transport controls, `role="tablist"` / `role="tab"` with `aria-selected` to inspector tabs, `aria-label` to sidebar and inspector panels. `aria-selected` updated dynamically on tab switch.

- **Visible focus rings** — `:focus-visible` styles added for all interactive elements. Keyboard navigation through the UI now has clear amber/blue focus indicators. Input focus rings unchanged (border-color change). Sidebar items, position buttons, and inspector tabs have contained focus rings.

- **Larger hit targets** — Sidebar mute and delete micro-buttons increased from 14×14px to 20×20px.

- **Crossfade labelled "coming soon"** — The Crossfade setting in Settings → Playback is now visibly disabled with an italic label, so users understand it is not yet implemented rather than assuming it is broken.

- **`?` shortcut in README and docs** — Keyboard shortcut reference updated in README, NEXT-STEPS, and ARCHITECTURE.

### Changed

- `startPlayback` now uses `startPlaylistLayers().then()` since audio engine decode is async. The play button activates and the RAF loop starts after audio layers are ready.
- `pauseMedia` / `resumeMedia` / `stopPlayback` branch on `runtime.usingAudioEngine` to call the audio engine or fallback `HTMLAudioElement` methods accordingly.
- Tracking module no longer calls `alert()` on permission denial — uses lazy `import('./notify.js')` to avoid circular dependency.
- `selectedSidebarId` added to `state` to hold the stable track ID of the selected audio/video sidebar item alongside the existing index.

### Fixed

- Duplicate `safetyDismiss` event handler at the bottom of `main.js` removed.
- Webcam start now guards against double-start via single-instance pattern (`_activeModule`).

---

## [v4.1.0] — 2026-04-11

All 12 PATCH.md bugs fixed. Undo/redo, toast notifications, capability detection, safe persistence, deep import validation. See previous entry for full details.

---

---

## [v4.2.0] — 2026-04-12

### Added

- **Web Audio API engine** (`audio-engine.js`) — Playlist audio tracks now route through an `AudioContext` graph: each track has an `AudioBufferSourceNode` looping through its own `GainNode`, wired to a master `GainNode`. `linearRampToValueAtTime` enables smooth volume changes and crossfade calls. Graceful fallback to `HTMLAudioElement` on browsers without Web Audio. Master volume slider calls `refreshVolumes()` for live gain updates without restarting streams. `crossfade(outId, inId, sec)` exported for future track-swap UI.

- **Tracking state machine** (`tracking.js` rewritten) — 7 explicit states: `idle → requesting → warming_up → detecting → lost → unavailable → error`. Single-instance guard: creating a new module stops any existing one. 1.5s warmup grace period before attention automation fires (prevents false losses on camera open). Status labels auto-update from state metadata table. `trackingWarmup` spinner shown during warmup. `_onLost()` / `_onReturn()` each fire exactly once per loss event via boolean flags reset on state transition.

- **Keyboard shortcuts overlay** — Press `?` or `/` during editing to show a full overlay listing all shortcuts, grouped by Playback and Editor. Click background or press ESC (captured in a focused handler) to dismiss. Rendered entirely in JS without any HTML template.

- **Timeline scrub-preview** — `Shift+Click` on the progress bar previews a position without starting playback: updates progress indicator, time display, HUD text, subtitle cue, overlay text (at 45% opacity), and FunScript position meter. Full playback `seekTo()` still fires on plain click during playback.

- **Sidebar stable IDs for audio/video tracks** — `normalizeAudioTrack` and `normalizeVideoTrack` now assign a `uid()` if no `id` is present. Sidebar delete/mute buttons carry `data-track-id` attributes. Event delegation in `main.js` filters by `track.id` instead of splicing by index — safe even if the array is mutated between render and click. `selectedSidebarId` added to mutable state.

- **ARIA and accessibility** — `role="main"` on workspace, `role="region"` + `aria-live="polite"` on the stage, `role="tablist"` + `role="tab"` + `aria-selected` on inspector tabs, `aria-label` on sidebar, inspector, and all transport buttons. Inspector tab clicks now update `aria-selected`. Focus rings via `:focus-visible` with amber outline (not suppressed like `:focus` was before). Sidebar mute/delete hit targets enlarged from 14×14px to 20×20px.

- **Crossfade "coming soon" label** — The crossfade seconds input in Settings → Playback is now visually disabled with an italic label to prevent confusion (the setting was exposed but had no effect).

- **`@keyframes spin`** for the webcam warmup indicator.

### Fixed

- Duplicate `safetyDismiss` event listener removed from the bottom of `main.js` (was registered twice).
- `startPlaylistLayers` is now `async` and `await`ed before RAF loop begins — prevents the play button responding before audio buffers are decoded.
- `stopPlayback` branches on `runtime.usingAudioEngine` to call `stopAudioEngine()` instead of iterating `backgroundAudio` elements (which would be empty when the engine is active).

---

## [v4.1.0] — 2026-04-11

All 12 PATCH.md bugs fixed. Undo/redo, toast notifications, capability detection, safe persistence, deep import validation.

---

## [v4.0.0] — 2026-04-11

Complete redesign over v3. See full entry below.

---

---

## [v4.1.0] — 2026-04-11

### Fixed (PATCH.md — all 12 issues)

- **#1** `normalizeSession()` no longer replaces an intentionally empty `blocks: []` with the sample session. Only a missing or non-array `blocks` field falls back to the sample.
- **#2** Webcam tracking module is now stopped before a new one is created on settings re-open. The `<dialog>` `close` event releases the camera regardless of how the dialog was dismissed. `start()` guards against double-start.
- **#3** FunScript timeline drag now holds an object reference to the dragged action instead of an array index. The array is sorted only on `mouseup`, so dragging across neighbouring timestamps no longer edits the wrong point.
- **#4** Point selection is now `{ trackId, actionRef }` rather than a bare index. Multi-track sessions can no longer show false shared selection across tracks.
- **#5** Device connection now sends `RequestDeviceList` and `StartScanning` after the `ServerInfo` handshake. Handles `DeviceList`, `DeviceAdded`, `DeviceRemoved`, `ScanningFinished`, and `Error` messages. Status display updated: `Connecting…` → `Scanning…` → `Device: <name>` or `No device found`.
- **#6** Duplicate `id="deviceStatus"` replaced with class `.device-status-display`. `updateDeviceStatus()` uses `querySelectorAll` to update all instances. Settings panel and FunScript inspector both update correctly.
- **#7** One-shot video blocks now explicitly pause and clear `src` on all previous background video elements before replacing `runtime.backgroundVideo`. Detached media can no longer keep decoding/playing audio.
- **#8** Emergency stop HUD message (`🛑 EMERGENCY STOP`) is now set *after* `stopPlayback()` rather than before, so it is not immediately overwritten by the `Idle` reset. Persists for 4 seconds.
- **#9** Transport loop toggle now cycles all four modes: Off → Loop → Min → ∞. `minutes` mode was previously unreachable from the transport bar.
- **#10** All import handlers (`addAssInput`, `addFunscriptInput`, macro library import) are wrapped in `try/catch`. `importMacroFile()` validates JSON structure and action arrays before saving. `importFunScriptFile()` re-throws on invalid files. All errors shown via `notify.error()`.
- **#11** Skip button tooltips and FunScript settings hint corrected from ±5s to ±10s.
- **#12** Session name can now be cleared to an empty string (`||` → `??` in `syncSessionFromSettings`).

### Added

- **Undo / Redo** — `history.js` module: snapshot-based history with 60-step stack. `Ctrl+Z` to undo, `Ctrl+Y` / `Ctrl+Shift+Z` to redo. Undo/Redo buttons in topbar (disabled when stack is empty). Block field edits, duplicates, deletes, and JSON apply are all undoable. History cleared on new session / import.
- **Toast notification system** — `notify.js`: non-blocking toasts replace all `alert()` calls. Types: `info` (3.5s), `success` (3s), `warn` (5s), `error` (sticky, click to dismiss). `notify.confirm()` provides a styled async confirmation dialog replacing destructive `alert()`/confirm patterns.
- **Browser capability detection** — `capabilities.js`: detects FaceDetector, Web Speech API, fullscreen, Web Audio, IndexedDB at startup. Dims and disables controls that require unavailable features (`requires-face-detector` class). Warns on startup if critical features are missing (once, with 1.2s delay).
- **Safe persistence** — `persist()` now wraps `localStorage.setItem` in `try/catch`. `QuotaExceededError` shows a sticky `notify.error()` and sets a visible "⚠ Unsaved" badge in the topbar. Tracks `persistState.dirty`, `persistState.error`, `persistState.lastSaved`.
- **Storage budget check** — On startup (2s delay), checks localStorage usage. Warns via toast if >80% of estimated 5MB quota is used.
- **Deep import validation** — `normalizeSession()` now calls dedicated normalizers for every nested structure: `normalizeAudioTrack`, `normalizeVideoTrack`, `normalizeFunscriptTrack`, `normalizeSubtitleTrack`, `normalizeMacro`. All numeric fields are clamped; invalid entries are filtered rather than silently accepted.
- **`notify.confirm()` dialogs** — New Session and Load Sample now ask for confirmation before destroying unsaved work.
- **Import success feedback** — All import operations (session, audio, video, .ass, .funscript, macro) show a `notify.success()` with filename and item count.
- **Export success feedback** — Exporting a session shows a `notify.success()` with the downloaded filename.

### Changed

- `window._stateModule` now exposes `normalizeSession` so `history.js` can restore snapshots without a circular import.
- All `alert()` calls removed from the codebase and replaced with `notify.*` equivalents.
- `emergencyStop` calls `stopPlayback()` first, then sets the HUD, fixing the overwrite bug.
- Settings dialog `close` event (not just the close button) stops webcam tracking.

---

## [v4.0.0] — 2026-04-11

Complete redesign and major feature addition over v3. See previous entries below.

---

---

## [v4.0.0] — 2026-04-11

Complete redesign and major feature addition over v3.

### Added

- **New UI architecture** — Multi-file ES module codebase replacing the single-file IIFE. Files: `state.js`, `playback.js`, `funscript.js`, `macros.js`, `macro-ui.js`, `subtitle.js`, `tracking.js`, `fullscreen-hud.js`, `ui.js`, `main.js`.
- **Macro Library** — 8 built-in FunScript presets (thrust in, pull out, pump, piston, prod, poke, stroke, rub). User-created macros with inline action-point editor and mini canvas preview. Sort by name, duration, or type. Import/export individual macros as `.funscript` files.
- **Macro injection engine** — Keys 1–5 inject a macro into any running FunScript with cubic ease-in/out blending. Injection HUD indicator on stage. Configurable slot assignments. Works standalone (no background FunScript required).
- **FunScript-only pause** — Shift key pauses/resumes device output independently of the session clock, audio, and text overlays. Indicator on stage.
- **Safe-skip easing** — Arrow key skips ease device output to zero over 300ms before jumping to the new position, preventing abrupt device movements.
- **Emergency stop** — ESC immediately sends `StopAllDevices` to Intiface, cancels all audio, and stops the session.
- **Webcam → FunScript integration** — Options to pause FunScript on attention loss, inject macros on attention loss and return, independently of session pause.
- **Fullscreen HUD** — Auto-hiding overlay in fullscreen mode showing session name, time/loop counter, macro slot assignments, keyboard hint, and ESC reminder. Hides after 2.5s of cursor inactivity.
- **FunScript timeline canvas** — Interactive canvas rendering FunScript curves, session block bands, subtitle cue markers, and live playhead. Supports add/drag/delete point editing in edit mode (E key).
- **FunScript position meter** — Vertical bar on stage showing current output position (0–100%) colour-coded by intensity.
- **Multi-track FunScript** — Multiple `.funscript` files can be loaded simultaneously; output is the maximum position across all active tracks.
- **Dedicated Settings dialog** — Six-tab modal (Appearance, Playback, FunScript, Macros, Subtitles, Webcam, Advanced) replacing scattered inline form fields.
- **Inspector panel** — Context-sensitive right panel with Overlay, Session, and Status tabs. Status tab shows live time, loop, and active block during playback.
- **Position grid** — Text overlay blocks can be placed at 9 positions (3×3 grid) in the inspector.
- **Dusk and Slate themes** — Two new built-in themes added (total: 6).
- **Live slider labels** — Range sliders in settings show their current value next to the control.
- **Safety banner** — Dismissible safety reminder bar at the top of the UI.
- **README.md and full documentation suite** — INSTALL, SAFETY, 8 how-to guides, FAQ, CHANGELOG, CONTRIBUTING, ARCHITECTURE, DEVELOPER, LEGAL.

### Changed

- **Keyboard shortcuts revised** — Arrow keys now skip ±10s (left/right) and ±30s (up/down) per README spec. Enter and F12 added as graceful stop keys. Shift changed from keydown toggle to standalone keyup detection to prevent conflict with Shift+number macros.
- **Loop toggle** — Cycles between Off / Loop / ∞ with updated button label.
- **`.ass` import** — Fixed double `file.text()` read bug (text was read twice, second read always returned empty string).
- **Position indicator** — `updatePositionIndicator` now shows/hides the meter container based on whether active FunScript tracks exist.
- **Session model** — Added `macroLibrary`, `macroSlots`, `trackingFsOptions`, `funscriptSettings.speed/invert/range` fields. Package version bumped to 4.

### Fixed

- `_lastSentPos` mutable export replaced with `fsState` object to avoid stale binding in ES module imports.
- `.ass` file timestamp parsing now handles both `.` and `,` as centisecond separators.
- Inspector session tab duration changes now update the transport bar `tTotal` display.
- Webcam tracking module now correctly handles the return-from-loss event with a single-fire flag (`returnInjected`) to prevent repeated macro injection.

---

## [v3.0.0] — (prior version, ChatGPT-generated)

### Features present in v3

- Single-file architecture (`index.html`, `styles.css`, `app.js`)
- Theme selector (midnight, ember, moss, violet) with custom theme builder
- Advanced Settings dialog
- Script timeline table with inline start/end/duration editing
- Subtitle-style timing tools (nudge ±0.5s, stretch, clone near cursor)
- Timeline overview minimap
- Webcam attention tracking with FaceDetector API
- Auto-pause/resume on attention loss
- Playlist audio and video tracks
- TTS block type with voice name field
- One-shot audio/video blocks
- Pause blocks
- Import/export `.assp` packages
- JSON preview/apply panel
- localStorage persistence
- Loop modes: none, count, minutes, forever

### Not present in v3

- FunScript support (added in v4)
- Macro Library (added in v4)
- Dedicated Settings modal with tabs (was inline form)
- Inspector panel (was inline block editor)
- FunScript timeline canvas (added in v4)
- Subtitle (.ass) support (added in v4)
- Emergency stop (added in v4)
- Fullscreen HUD (added in v4)
- Position meter (added in v4)

---

## Version Numbering

Versions follow `MAJOR.MINOR.PATCH`:
- **MAJOR** — breaking changes to the `.assp` package format or fundamental UI paradigm
- **MINOR** — significant new features, backward-compatible
- **PATCH** — bug fixes and small improvements

---

## [v4.5.0] — 2026-04-12 — UI Redesign

### Complete UI Overhaul

**Zero JavaScript changes.** All 28 backend modules are identical to v4.4.6. Only `index.html` and `css/style.css` were replaced.

#### New design language
- **Font**: Space Grotesk (UI chrome) + JetBrains Mono (times, values, code)
- **Palette**: `#0b0b0e` base, `#e8963a` amber accent — single-accent system, no scattered colors
- **Aesthetic**: DaVinci Resolve / Logic Pro — professional dark, tool-first, low visual noise
- **Grid**: CSS Grid 3-column workspace (`var(--tp-w)` | 1fr | `var(--insp-w)`) with inline stage+timeline

#### Track Panel (left)
- Accordion-style groups with colored dot indicators per track type
- Inline block-add chips (T ◎ ♪ ▶ ⏸ ⚙) on the Blocks section header
- All `#blockList`, `#audioList`, `#videoList`, `#subtitleList`, `#funscriptList`, `#scenesSummary`, `#rulesSummary`, `#triggersSummary` IDs preserved
- Compact "↕ Sort by time" utility button below block list

#### Timeline Editor (center-bottom)
- Multi-lane panel: **Navigator lane** (32px overview canvas) + **FunScript lane** (120px curve canvas)
- Lane headers (80px) with track name and action buttons
- Timeline toolbar with `✎ Edit` / `⊞ Fit` / collapse — all using plain text (JS overwrites `textContent`)
- Transform bar with all 4 transform fields + Apply + selection count

#### Transport bar
- Two-row layout: seek bar on top, controls below
- Play button (amber, rounded) is the visual focal point — JS sets `textContent` to `▶`/`⏸`
- **Emergency stop button** (`🛑`) added to transport — wired via inline module script to `emergencyStop()`
- Loop toggle, next-scene button, volume slider, skip buttons with SVG icons

#### Inspector
- Tabs renamed Block / Session / Status (data-tab attributes unchanged: overlay / session / status)
- Empty state with grid-of-squares icon
- All inspector rendering classes preserved: `insp-group`, `insp-row`, `insp-group-label`, `stat-card`, `stat-label`, `stat-val`

#### All JS-rendered panel classes preserved
- Live Control: `lc-head`, `lc-title`, `lc-hint`, `lc-row`, `lc-label`, `lc-slider-wrap`, `lc-slider`, `lc-val`, `lc-actions`, `lc-btn`, `lc-meters`, `lc-meter-wrap`, `lc-meter-label`, `lc-meter-bar`, `lc-meter-fill`, `lc-meter-val`
- Macro Library: `ml-row`, `ml-name`, `ml-meta`, `ml-badge`, `ml-dur`, `ml-row-actions`, `ml-inject`, `ml-btn`, `ml-del`, `slot-row`, `slot-key`, `slot-select`, `slot-inject`
- Macro Editor: `me-head`, `me-table-wrap`, `me-table`, `me-at`, `me-pos`, `me-del`
- Suggestions: `sug-item`, `sug-title`, `sug-detail`, `sug-actions`, `sug-action-btn`
- Tags: `tag-blue`, `tag-amber`, `tag-green`, `tag-purple`, `tag-pink`
- Position picker: `pos-grid`, `pos-btn`
- Notifications: `#notifyContainer`, `notify-toast`, `notify-icon`

#### Settings dialog
- Cleaned up: removed inline styles from section content, all IDs preserved
- FunScript tab: `s_fsSpeed`, `s_fsRange`, `s_fsInvert`, `s_deviceWsUrl`, `s_connectDevice`, `s_disconnectDevice` — all present with correct IDs matching `syncSettingsForms()` and `syncSessionFromSettings()`
- Label spans `s_speechRateVal`, `s_pavVal`, `s_pvvVal`, `s_fsSpeedVal` all present
- Webcam tab: all `.requires-face-detector` elements preserved

#### Documentation update
- Removed: `1 PATCH.md`, `2 NEXT-STEPS.md`, `3 ROADMAP.md`, `4 Patch Plan.md`, `5 ROADMAP.md`
- New: `README.md` (comprehensive), `docs/ARCHITECTURE.md` (module reference)
- Updated: `docs/CHANGELOG.md`


---

## [v4.5.1] — 2026-04-13 — Patch (patch-notes-3.md)

### Fixed — App-breaking

- **`js/state-engine.js` startup-blocker** (patch note #1, #10): The file contained two full copies of the module concatenated, producing `SyntaxError: Identifier 'state' has already been declared` on import. Lines 145–247 (the old, incomplete v1 copy without Multi-Signal Fusion) were removed. The kept version (lines 1–144) is the correct Multi-Signal Fusion implementation with `deviceLoad`, `setExternalSignal`, `clearExternalSignals`, and `DEFAULT_FUSION_WEIGHTS`.

### Fixed — Settings / state mismatches

- **Device WebSocket URL not persisted** (patch note #3): `s_deviceWsUrl` was a transient input; its value reset on every reload or session import. Fixed by:
  - Adding `deviceWsUrl: 'ws://localhost:12345'` to `defaultSession().advanced`
  - Adding to `normalizeSession()` spread-merge (automatic via `...base.advanced`)
  - Adding `v('s_deviceWsUrl', s.advanced.deviceWsUrl)` to `syncSettingsForms()`
  - Adding the write-back `s.advanced.deviceWsUrl = wsUrl` to `syncSessionFromSettings()`
  - Updating the Connect button in `main.js` to prefer `state.session.advanced.deviceWsUrl` as its fallback

- **Master volume missing from Settings dialog** (patch note #2, #9): The smoke checklist expected a master volume control in Settings but the Playback section had no such field. Added `s_masterVolume` range slider + `s_masterVolumeVal` label to the Playback section. Fully bidirectional:
  - Transport bar slider → updates `s_masterVolume` + label in settings dialog if open
  - Settings dialog slider → fires `state.session.masterVolume`, refreshes transport bar, calls `refreshVolumes()`, persists
  - `syncSettingsForms()` populates value + label on dialog open
  - `syncSessionFromSettings()` reads value on any settings `input` event

### Fixed — Code quality

- **Inline `onclick` handlers replaced** (patch note #4): Three instances of `onclick="this.closest(...).remove()"` replaced with explicit `addEventListener` calls:
  - `js/session-analytics.js` — both close buttons in the post-session modal now use named IDs (`postSessionClose1`, `postSessionClose2`) and a shared `closeModal` closure
  - `js/main.js` — shortcuts overlay `✕` button now created via `document.createElement` with `addEventListener('click', ...)`

- **Unused imports removed from `main.js`** (patch note #5): Four imports confirmed unused and removed:
  - `skipToScene` from `./playback.js`
  - `setTrackMuted` from `./audio-engine.js`
  - `refreshTimelineVisibility` from `./funscript.js`
  - `renderSceneList`, `addScene` from `./scenes.js`
  - (`crossfade` confirmed used at line 259; retained)

### Fixed — Documentation

- **ARCHITECTURE.md overstated test coverage** (patch note #6): Replaced "covering state normalizers, all module systems, and CRUD operations" with an accurate per-file coverage table and an explicit list of the 15 modules not exercised by the automated runner. Added a callout warning that startup-breaking import errors are not caught by unit tests.

- **SMOKE.md stale items** (patch note #9): Updated section 7 to reflect that master volume and device WebSocket URL are now both present in Settings and testable. Updated "Known deferred items" to accurately state crossfade is implemented (configurable in Settings), remove stale ROADMAP-phase references, and enumerate the 14 modules that require manual smoke testing.


---

## [v4.5.2] — 2026-04-13 — Patch (patch-notes-4.md)

### Fixed — AI Authoring (#1, #9)

- **API headers corrected**: `generateSession()` now sends the three required Anthropic headers: `x-api-key`, `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true`. The previous request used only `Content-Type` and always returned a 401/400 error.

- **API key management added**: `getApiKey()`, `setApiKey()`, `hasApiKey()` backed by `localStorage` key `ass-anthropic-api-key`. The key is **never** written into the session object and never exported in `.assp` files.

- **AI panel fully rebuilt**: `renderAiAuthoringPanel` now renders two states:
  - *No key*: a password input + Save button with a "key stored in browser only" note
  - *Key present*: masked display (••••last4) + Remove button, then the prompt/generate UI beneath
  - Generates button and prompt textarea hidden until a key is configured, with an explanatory message
  - `Enter` key in the API key field saves immediately
  - Key validated to start with `sk-ant-` before saving

### Fixed — WebSocket URL Duplication (#2)

- **Inspector `fs_wsUrl` now initialises from `state.session.advanced.deviceWsUrl`** instead of a hardcoded `ws://localhost:12345`. The two controls (Settings dialog `s_deviceWsUrl` and FunScript inspector `fs_wsUrl`) are now always consistent:
  - `fs_wsUrl` renders the persisted URL on open
  - `change` event on `fs_wsUrl` writes back to `state.session.advanced.deviceWsUrl` and syncs `s_deviceWsUrl`
  - `fs_connect` button uses `state.session.advanced.deviceWsUrl` as its fallback

### Fixed — Safety Banner (#3)

- **`#safetyBanner` is now shown and populated.** `emergencyStop()` calls `_showEmergencyBanner()` which displays the banner with a live second-countdown: *"🛑 Emergency cooldown — restart blocked for Xs"*. The banner self-hides when the cooldown expires. `startPlayback()` also shows the banner (instead of a toast) when blocked by an active cooldown.

### Fixed — Persist Badge (#4)

- **`#persistDot` and `#persistMsg` are now updated** by `_updatePersistBadge`:
  - **Success state**: amber dot, "Saved" text, auto-hides after 2 seconds
  - **Error state**: red dot, truncated error message, stays visible until dismissed or overwritten
  - A `_hideTimer` prevents flickering on rapid saves

### Fixed — Safety Settings in Settings Dialog (#5)

- **New "Safety" tab** added to the Settings dialog (between Webcam and Advanced). Fields: Max intensity, Max speed, Warn above intensity, Emergency cooldown (sec), Auto-reduce on attention loss (checkbox), Auto-reduce target (shown/hidden reactively). All fields backed by `s.safetySettings`, synced through `syncSettingsForms()` and `syncSessionFromSettings()`. Range slider labels update live. Auto-reduce target row shows/hides via `change` event on `s_safetyAutoReduce`.

### Fixed — Scene Rendering Duplication (#6)

- **`drawSceneMarkers` removed from `scenes.js`** — it was never called anywhere; the timeline scene-band drawing in `funscript.js` is the canonical implementation. Corresponding JSDoc comment updated. `getActiveSceneName` also removed (unused).

### Fixed — Unused Exports (#7)

- **`setTrackMuted` removed from `audio-engine.js`** — mute logic lives entirely in `main.js` (which uses `crossfade()` for smooth transitions). The function was never called.
- **`getAttention` removed from `state-engine.js`** — `_currentAttention` is only read internally via `tickStateEngine()`.
- **`getActiveWindowStatuses` integrated** (not removed): now imported by `live-control.js` and called in `updateLiveEngineMeters()`. Active trigger windows appear as a live amber indicator below the meters during playback (`#lc_triggerWindows` element).

### Added — Boot Smoke Test (#8)

- **`tests/boot-smoke.html`**: A new automated test page that imports all 16 critical JS modules directly and checks their exported symbols. Tests include:
  - Module import (syntax error detection)
  - Export shape validation for each module
  - `defaultSession()` structural checks (blocks, scenes, rules, triggers, `advanced.deviceWsUrl`, `masterVolume`)
  - `normalizeSession()` output validation (safetySettings, rampSettings, triggers keys)
  - `tickStateEngine()` run-without-error guard (catches duplicate-import regressions)
  - 30+ assertions total, rendered as a pass/fail list with error details
- **`SMOKE.md` pre-flight updated** to include `tests/boot-smoke.html` as a required step before shipping.


---

## [v4.5.3] — 2026-04-13 — Bug Hunt + Patch 5

### Fixed from patch-notes-5.md

- **Safety banner dismiss bug** (patch note #1): The dismiss handler in `main.js` previously called `banner.remove()`, permanently deleting the `#safetyBanner` node from the DOM. All subsequent calls to `_showEmergencyBanner()` in `playback.js` silently returned early (`if (!banner) return`), making every future emergency cooldown invisible. Fixed to `banner.style.display = 'none'` — the node stays in place, and future cooldowns always show correctly.

- **Banner countdown timer hardening**: `_showEmergencyBanner` now tracks its countdown via `_bannerTickTimer`. If emergency stop fires again before the previous countdown expires (e.g. rapid double-press), the existing timer is cancelled before starting a fresh countdown. Prevents orphaned timer callbacks from updating a banner that has already self-closed.

- **AI authoring JSON extraction** (patch note #4): Replaced the single `JSON.parse(responseText)` call with a `_extractJson()` helper that tries four strategies in order: direct parse → code-fence extraction → first `{…}` object extraction → first `[…]` array extraction. Empty response now throws a readable message. Error context shows the first 300 chars of raw response. Feature remains higher-risk but is substantially more robust.

- **Unused helper exports clarified** (patch note #3): `normalizePacingSettings`, `normalizeRampSettings`, and `normalizeSafetySettings` each received a JSDoc comment confirming they are test utilities (used by `pacing-ramp.test.js` and `safety.test.js`), not dead code. `loadProfile` integrated into the data flow: `getAdaptiveRampSuggestion()` and `renderProfilePanel()` now call `saveProfile(rebuilt)` after each `rebuildProfile()`, making the persisted profile current and giving `loadProfile` a meaningful fast-path role.

- **Boot smoke iframe test added** (patch note #2): `tests/boot-smoke.html` now loads `index.html` in an off-screen iframe and checks that `#app` and `#inspBody` exist after a 2.5s settle window. Catches DOM-wiring and module-init failures that module-import tests cannot reach.

### Found and fixed in self-directed bug hunt

- **Circular static import** (`live-control.js` ↔ `trigger-windows.js`): Adding `import { getActiveWindowStatuses } from './trigger-windows.js'` in live-control created a bidirectional cycle with trigger-windows's existing `import { setLiveIntensity, setLiveSpeed } from './live-control.js'`. Fixed by converting `getActiveWindowStatuses` to a lazy `import('./trigger-windows.js')` call inside `updateLiveEngineMeters`. Lazy import count remains appropriate.

- **Safety settings sliders at wrong position when `safetySettings` is null**: `syncSettingsForms` only ran the safety-field population block `if (ss)` — when `session.safetySettings` was null (the default), all range inputs sat at browser-default midpoints (≈50%) while labels showed "200%", "4.0×", "150%". Any slider interaction would then silently write those wrong midpoint values as persisted safety settings. Fixed: `const ss = s.safetySettings ?? { maxIntensity: 2.0, maxSpeed: 4.0, … }` always populates from defaults when null.

- **Double `settingsDialog` input listener causing double-persist on master volume**: The general settings `input` listener (`syncSessionFromSettings()` on every input) and the dedicated master volume listener both fired on `s_masterVolume`, running two state writes and two `persist()` calls per slider tick. Fixed by adding `|| e.target.id === 's_masterVolume'` to the early-return guard in the general handler, so the dedicated handler owns that field exclusively.

- **Unnecessary lazy `import('./state.js')` in `ui.js`**: The `fs_wsUrl` change handler called `import('./state.js').then(({ persist }) => persist())` despite `persist` being statically imported at the top of `ui.js`. Replaced with a direct `persist()` call.

- **Duplicate `state` import in `playback.js`**: `import { state as _state } from './state.js'` was introduced as a one-liner bridge alongside the existing `import { state }`. The alias `_state` was used once (`_state._fsStateRef = { fsState }`). Removed the duplicate import; the already-imported `state` is used directly.


---

## [v4.5.3] — 2026-04-13 — Patch (patch-notes-5.md) + internal bug-hunt pass

### Fixed — patch-notes-5.md

#### #1 — Safety banner dismiss permanently breaks future cooldown warnings

The dismiss handler in `main.js` previously used `banner.remove()` (with an opacity fade), which deleted the DOM node. `_showEmergencyBanner()` in `playback.js` looks up `$id('safetyBanner')` on every call and returns early if it's null, silently swallowing all future emergency-stop warnings for the remainder of the page session.

**Fix**: Changed dismiss to `banner.style.display = 'none'` — the node stays in the DOM, `_showEmergencyBanner` continues to work for all subsequent emergency stops.

Also hardened `_showEmergencyBanner` itself:
- Added `_bannerTickTimer` (module-level) to cancel any previous countdown before starting a fresh one (prevents overlapping ticks if emergency stop fires twice in rapid succession)
- `startPlayback()` now calls `_showEmergencyBanner()` instead of a toast when blocked by cooldown, so the countdown is always visible

#### Partial — #2 Boot smoke (iframe-based page load)

Added an off-screen iframe test to `tests/boot-smoke.html` that loads `index.html`, waits 2.5s for modules to settle, then checks that `#app` and `#inspBody` exist. Catches DOM-wiring failures and missing element regressions that module-import tests cannot see. Not a full end-to-end integration test, but meaningfully closer to a real boot check.

#### #3 — Normalizer exports clarified (not dead code)

Added JSDoc comments to `normalizePacingSettings` (dynamic-pacing.js), `normalizeRampSettings` (intensity-ramp.js), `normalizeSafetySettings` (safety.js) explaining they are intentional public test utilities — used by `tests/pacing-ramp.test.js` and `tests/safety.test.js`. The inline equivalents in `normalizeSession()` exist to avoid circular imports; both must stay in sync.

`loadProfile()` (user-profile.js) wired up: `getAdaptiveRampSuggestion()` and `renderProfilePanel()` now call `saveProfile(p)` after each `rebuildProfile()`, keeping the persisted profile current. `loadProfile` is now a meaningful fast-path rather than a dead export.

#### #4 — AI authoring JSON parsing hardened

Replaced the single `JSON.parse(responseText)` call with `_extractJson(text)`, a four-strategy fallback:
1. Direct parse of full response text (ideal case)
2. Extract content from a markdown code fence (`` ```json ... ``` ``)
3. Find first complete `{...}` object in the string
4. Find first `[...]` array in the string

Added an empty-response guard: throws `'Claude returned an empty response'` before trying to parse. Error context now shows the first 300 chars of the raw response instead of 200.

---

### Fixed — internal bug-hunt pass (not in patch notes)

#### Bug: Static circular dependency introduced in v4.5.2

`live-control.js` added `import { getActiveWindowStatuses } from './trigger-windows.js'`, but `trigger-windows.js` already statically imports `import { setLiveIntensity, setLiveSpeed } from './live-control.js'`. This creates a bidirectional static circular dependency that is fragile in ES modules and breaks in some environments.

**Fix**: Converted the `getActiveWindowStatuses` call in `updateLiveEngineMeters()` to a lazy `import('./trigger-windows.js').then(...)`. The trigger-window indicator still updates each RAF cycle; the lazy import resolves immediately after the first call.

#### Bug: Safety settings sliders at wrong positions when safetySettings is null

`syncSettingsForms()` only populated the Safety tab fields `if (s.safetySettings)`. For new sessions (where `safetySettings` is null), all five range sliders had no `value` attribute and displayed at browser-default midpoints (typically 50% of range). The labels still showed the HTML-hardcoded "200%", "4.0×", "150%" — mismatched. Any interaction with those sliders then wrote the wrong midpoint values into session state.

**Fix**: Changed to `const ss = s.safetySettings ?? { maxIntensity: 2.0, maxSpeed: 4.0, ... }` — sliders always populate at the correct default positions.

#### Bug: Double-persist on master volume slider

Two `settingsDialog` `input` listeners both fired for `s_masterVolume`: the general one (calling `syncSessionFromSettings()` + `persist()`) and the specific transport-sync one (calling `persist()` directly). Every slider move triggered two state writes and two localStorage serialisations.

**Fix**: The general listener now skips `e.target.id === 's_masterVolume'` (and retains the existing `s_jsonPreview` skip). The dedicated listener owns master volume exclusively.

#### Bug: Unnecessary lazy import in ui.js fs_wsUrl handler

The `fs_wsUrl` change handler used `import('./state.js').then(({ persist }) => persist())` even though `persist` is already a static import at the top of `ui.js`.

**Fix**: Replaced with the directly available `persist()` call.

#### Bug: Redundant duplicate `state` import in playback.js

`import { state as _state } from './state.js'` was used only once (`_state._fsStateRef = { fsState }`) and sat alongside the already-imported `state` object. The duplicate import was unnecessary and added noise.

**Fix**: Removed the alias import; uses `state._fsStateRef = { fsState }` with the existing import.


---

## [v4.5.4] — 2026-04-13 — Self-directed bug hunt + test expansion

### Bugs fixed

#### Circular dependency: `live-control ↔ trigger-windows` (regression from v4.5.2)

`live-control.js` statically imported `getActiveWindowStatuses` from `trigger-windows.js`, which already statically imports `setLiveIntensity`/`setLiveSpeed` from `live-control.js`. This bidirectional static cycle is undefined-order in the ES module spec and breaks in some environments.

**Fix**: Converted to a lazy `import('./trigger-windows.js').then(...)` inside `updateLiveEngineMeters()`. The active-window indicator still updates each RAF frame; the lazy import resolves after the first RAF tick.

#### Safety settings form shows sliders at wrong position when `safetySettings` is null (regression from v4.5.2)

`syncSettingsForms()` only populated the Safety tab if `s.safetySettings` was truthy. New sessions have `safetySettings: null`, leaving all five range sliders at browser-default midpoints (50% of range) while labels showed "200%", "4.0×", "150%". Any interaction wrote the wrong midpoint value into session state as a permanent setting.

**Fix**: Changed to `const ss = s.safetySettings ?? { maxIntensity: 2.0, maxSpeed: 4.0, warnAbove: 1.5, emergencyCooldownSec: 30, autoReduceOnLoss: false, autoReduceTarget: 0.8 }` — sliders always render at correct default positions.

#### Double-persist on master volume slider (regression from v4.5.2)

Two `settingsDialog` `input` event listeners both matched `s_masterVolume`: the general handler (running `syncSessionFromSettings()` + `persist()`) and the dedicated transport-sync handler (also calling `persist()`). Every slider tick triggered two state writes and two localStorage serialisations.

**Fix**: The general listener now explicitly skips `e.target.id === 's_masterVolume'`.

#### Unnecessary lazy `import('./state.js')` in `ui.js`

The `fs_wsUrl` `change` handler used `import('./state.js').then(({ persist }) => persist())` even though `persist` is a static top-level import in `ui.js`.

**Fix**: Replaced with `persist()` directly.

#### Redundant duplicate `state` import in `playback.js`

`import { state as _state } from './state.js'` appeared alongside the already-imported `state`. The alias was used only once.

**Fix**: Removed the alias; uses `state._fsStateRef = { fsState }` with the existing import.

#### Redo (`_future`) stack grew without bound

`history.push()` already capped `_past` at `MAX_HISTORY = 60`. But `history.undo()` appended to `_future` with no limit. Rapid undo operations could grow `_future` unboundedly.

**Fix**: Added `if (_future.length > MAX_HISTORY) _future.shift()` in `undo()`, matching the push-side cap.

### Other improvements

#### Safety banner dismiss fixed (patch-notes-5 item, completed this session)

The dismiss handler in `main.js` was changed from `banner.remove()` (deletes node permanently) to `banner.style.display = 'none'` (hides but preserves node for future emergency stop calls). `_showEmergencyBanner` now uses a module-level `_bannerTickTimer` to cancel any previous countdown before starting a new one.

#### AI authoring JSON extraction hardened (patch-notes-5 item, completed this session)

Added `_extractJson(text)` with four fallback strategies. Empty response guard added. Error context shows first 300 chars.

#### `loadProfile` wired into data flow

`getAdaptiveRampSuggestion()` and `renderProfilePanel()` now call `saveProfile(p)` after each `rebuildProfile()`, keeping the persisted profile current.

### New tests

**`tests/suggestions.test.js`** — 17 new tests for `analyzeSession()`:
- `no_blocks` detection
- `blocks_overflow` (fires / does not fire)
- `text_blocks_overlap` (text vs text vs audio)
- `many_short_loops` (loop count + duration combinations)
- `rules_no_webcam` (attention metric, non-attention metric, tracking enabled)
- `pacing_no_webcam`
- `scene_overflow` (over / within duration)
- Return shape: always array, each item has id/severity/title/detail

**`tests/session-modes.test.js`** — 14 new tests for `SESSION_MODES` and `applySessionMode()`:
- Module shape: all four modes exist with required fields
- Exposure mode sets time ramp, adds `[Exposure]`-prefixed rules
- Custom rules are preserved across mode applications
- Applying the same mode twice does not double-up rules
- Mindfulness mode sets engagement ramp, enables pacing
- Freerun sets `rampSettings: null`, `pacingSettings: null`, removes all mode-prefixed rules
- Unknown mode id returns undefined (bare `return`)
- All mode rule definitions have correct schema

**Test suite total: 13 test files** (up from 11 in v4.5.2)


### Addendum — static circular dependency sweep

The automated cycle detector found two pre-existing static circular dependencies that were runtime-safe (all cyclic bindings accessed inside function bodies, never at module eval time) but were flagged as potential initialization-order risks:

**`live-control.js ↔ intensity-ramp.js`**
- `live-control` statically imported `renderRampPanel` from `intensity-ramp`
- `intensity-ramp` statically imported `setLiveIntensity` from `live-control`
- Fix: removed `setLiveIntensity` static import from `intensity-ramp.js`; replaced the single call site in `applyRamp()` with `import('./live-control.js').then(({ setLiveIntensity }) => setLiveIntensity(clamped))`

**`live-control.js ↔ dynamic-pacing.js`**
- `live-control` statically imported `renderPacingPanel` from `dynamic-pacing`
- `dynamic-pacing` statically imported `setLiveSpeed` from `live-control`
- Fix: removed `setLiveSpeed` static import from `dynamic-pacing.js`; replaced the single call site in `tickDynamicPacing()` with `import('./live-control.js').then(({ setLiveSpeed }) => setLiveSpeed(speed))`

**Result: zero static circular imports across all 28 modules.** Verified by a Node.js DFS cycle checker over the full module graph.


---

## [v4.5.5] — 2026-04-13 — Fatal boot-blocker patch (PATCH.md)

Four app-boot-blocking bugs identified by static analysis of the uploaded zip.

### Bug 1 — Stray closing brace in `js/live-control.js` (fatal syntax error)

`setLiveSpeed()` had a duplicate `}` after its closing brace (line 221 in shipped file). Any module importing `live-control.js` would fail to parse, blocking `main.js`, `playback.js`, `ai-authoring.js`, `session-modes.js`, and `safety.js` from loading.

**Fix:** Removed the extra `}`.

### Bug 2 — Stray closing brace in `js/ui.js` (fatal syntax error)

`_mountProfilePanel()` had a duplicate `}` after its closing brace (line 227 in shipped file). `ui.js` is imported by `main.js` at the top of the module graph; a parse failure here blocks the entire app from initialising.

**Fix:** Removed the extra `}`.

### Bug 3 — Wrong import source in `js/ai-authoring.js` (fatal link error)

```js
// Before (broken — renderRampPanel / renderPacingPanel are not exported from live-control.js)
import { renderRampPanel, renderPacingPanel } from './live-control.js';

// After (correct)
import { renderRampPanel }   from './intensity-ramp.js';
import { renderPacingPanel } from './dynamic-pacing.js';
```

`renderRampPanel` is exported from `intensity-ramp.js` and `renderPacingPanel` from `dynamic-pacing.js`. The wrong source caused a module link failure even after the syntax errors above were fixed.

### Bug 4 — Wrong import source in `js/session-modes.js` (fatal link error)

Same incorrect import as bug 3:

```js
// Before (broken)
import { renderRampPanel, renderPacingPanel } from './live-control.js';

// After (correct)
import { renderRampPanel }   from './intensity-ramp.js';
import { renderPacingPanel } from './dynamic-pacing.js';
```

`session-modes.js` is imported by `ui.js` for `renderModeSelector`; a link failure here would cascade into the inspector's Session tab failing to render.

### Root cause

These bugs were introduced when the `live-control ↔ intensity-ramp` and `live-control ↔ dynamic-pacing` circular dependencies were broken in v4.5.4. The refactor correctly moved the lazy imports in `intensity-ramp.js` and `dynamic-pacing.js`, but `ai-authoring.js` and `session-modes.js` still referenced `renderRampPanel`/`renderPacingPanel` via `live-control.js` — which no longer re-exports them.

### Verification

Post-fix validation of all 28 modules: zero missing exports, zero missing module references, zero circular static imports.


---

## [v4.5.6] — 2026-04-13 — Patch (PATCH.md round 2)

### Fixed — High severity

#### #1 — Unmuting audio track during playback fails silently

`startAudioEngine()` only creates Web Audio nodes for tracks that are **not muted** at playback start. If a track starts muted and the user later unmutes it, `crossfade(null, trackId, ...)` looked up the track in `_tracks` and found nothing — the track stayed silent.

**Fix**: Exported `startSingleTrack(track)` from `audio-engine.js`. It creates the node (with a 0→vol fade-in) only if the track is not already in `_tracks`. The mute toggle in `main.js` now calls `startSingleTrack(t).then(() => crossfade(null, t.id, fadeSec))` on unmute, ensuring the node exists before fading in.

#### #2 — Async playback startup race

`startPlayback()` created `state.runtime` then called `startPlaylistLayers().then(...)`. If the user stopped, imported, or started a new session before audio decoding finished, `stopPlayback()` nulled `state.runtime`. The pending `.then()` callback then called `initAnalytics(null)` and threw. Already fixed in a prior session — confirmed present.

#### #5 — HTML escaping incomplete (attribute injection risk)

`esc()` escaped only `&`, `<`, `>`. Names and labels containing `"` or `'` could break attribute values in `innerHTML`-built forms. Fixed in a prior session — confirmed present.

### Fixed — Medium severity

#### #3 — AI "Replace session" ignores intentional `null` rampSettings/pacingSettings

`if (generated.rampSettings)` treated null the same as absent, so an AI response deliberately setting rampSettings to null to clear it had no effect. Changed to `if ('rampSettings' in generated)` — null now correctly clears the setting.

#### #4 — `normalizeSession()` injects sample blocks on missing blocks array

When `input.blocks` was absent (malformed import, partial object), normalizeSession fell back to `sampleSession().blocks`, injecting the demo content unexpectedly. Changed fallback to `[]`.

#### #7 — `normalizeScene()` did not enforce `end > start`

`start` and `end` were clamped independently. An import with `{ start: 100, end: 20 }` produced an invalid scene. Fixed: `end = Math.max(start + 1, clampInt(...))`.

#### #8 — AI-generated ramp/pacing assigned without normalization

`generated.rampSettings` was assigned raw. Malformed AI output (wrong enum strings, missing fields, out-of-range numbers) could corrupt state. Now passed through `normalizeRampSettings()` / `normalizePacingSettings()` before assignment.

#### #9 — `_extractJson` bracket extraction could grab wrong span

Strategies 3/4 used `indexOf('{')` + `lastIndexOf('}')`, which breaks when the response has extra braces before or after the JSON payload. Replaced with a bracket-balancing walker that correctly tracks depth (including strings and escape sequences).

### Fixed — Low severity

#### #10 — "Replace session" label was misleading

The radio option labelled "Replace session" only replaced blocks, scenes, and rules — not themes, tracks, macros, or settings. Relabelled to **"Replace blocks / scenes / rules"** to match actual behaviour.

#### #A — Dead `modeNames` variable in `session-modes.js`

`const modeNames = SESSION_MODES.map(...)` was computed and never read. Removed.

#### #B — `setApiKey()` accepted any truthy string

The UI validated `sk-ant-` prefix but the storage function didn't. Programmatic callers could store junk. `setApiKey()` now throws for strings that don't start with `sk-ant-`.

#### #C — `updateScene()` persisted invalid timing

`Object.assign(scene, patch)` applied raw values from inspector inputs. A buggy or future UI could write `end <= start`. Added a post-patch guard: if `start` or `end` was patched, re-clamp and enforce `end = Math.max(start + 1, ...)`.

### Verified clean

- Zero missing exports across all 28 modules  
- Zero static circular imports  
- `node --input-type=module` import/export validator: all green

