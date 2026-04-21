# Smoke Test Checklist — Adaptive Session Studio

Run this checklist manually after any significant change. Check every item before shipping.

**How to run:** Open `index.html` in a browser (requires a local HTTP server — e.g. `npx serve .` or VS Code Live Server). Open DevTools console and watch for errors throughout.

---

## 0. Pre-flight

- [ ] Open `tests/index.html` on the same server — all automated unit tests pass (green banner)
- [ ] Open `tests/boot-smoke.html` on the same server — all boot smoke checks pass (green summary)
  - This catches startup-breaking module errors (duplicate imports, missing exports) that the unit runner does not exercise
- [ ] Open `index.html` — no red console errors on load

---

## 1. Session lifecycle

- [ ] **New session** — click New Session → confirm dialog appears → session resets to empty  
  - Loop toggle shows `↺ Off` (or `↺ Loop` depending on default)
  - Master volume slider reflects `defaultSession().masterVolume`
  - `tTotal` shows correct duration
  - Sidebar block list shows "No blocks"
  - Inspector shows "Select a block"

- [ ] **Load sample** — click Load Sample → confirm dialog → sample loads  
  - Loop toggle text matches `loopMode` of sample session
  - Sidebar shows sample blocks sorted by start time

- [ ] **Export** — click Export → `.assp` file downloads, filename matches session name

- [ ] **Import** — import the exported file  
  - Session restores exactly (name, blocks, playlists)
  - Loop toggle, master volume slider, and tTotal all update immediately (no stale state)
  - Console shows no errors

---

## 2. Audio playlist tracks

- [ ] Add an audio file via the audio playlist section
  - Track appears in sidebar with name and `●` mute button
  - **Click track** → audio track inspector opens
    - **Preview section** shows an `<audio controls>` player — press ▶ to verify the correct file plays
    - **Size badge** shows estimated MB embedded
    - Edit name → sidebar label updates
    - Change volume → persists
  - **Mute** button toggles (● ↔ ✕) and persists after reload

- [ ] **Ctrl+Z after delete** — deleted audio track is restored

- [ ] **Ctrl+Z after mute toggle** — mute state is restored

- [ ] Start playback with an audio track present  
  - Toggle mute during playback → audio silences/resumes immediately (no restart required)
  - **Delete** a track during playback → audio stops immediately; UI shows track gone

---

## 3. Video/image playlist tracks

- [ ] Add a video or image file
  - Track appears in sidebar with kind badge (`vid` / `image`)
  - **Click track** → video track inspector opens
    - **Image**: thumbnail shown in inspector — correct image visible
    - **Video**: `<video controls>` preview visible — pressing ▶ shows the correct video
    - **Size badge** shows estimated MB embedded
    - Mute audio toggle persists
    - Volume change persists
  - **Delete** a video track during playback → background video disappears immediately

---

## 4. Subtitle tracks

- [ ] Import a `.ass` file
  - Track appears in sidebar with cue count badge
  - **Enable/disable** toggle (`●` / `✕`) works — Ctrl+Z restores
  - **Delete** works — Ctrl+Z restores
  - **Click track** → subtitle inspector opens (cues, styles, Export .ass, Remove)
  - **Export .ass** downloads file

- [ ] Import two subtitle tracks → delete the first → second track's delete still targets the correct track (ID-based, not index-based)

---

## 5. FunScript tracks

- [ ] Import a `.funscript` file
  - Track appears in sidebar with point count badge
  - **Enable/disable** toggle works
  - **Delete** works
  - **Click track** → FunScript inspector opens (Track info, Global settings, Device, Export, Remove)
  - **Export .funscript** downloads file
  - Removing first track when two tracks loaded → second track's controls target the correct track

---

## 6. Loop mode consistency

Change loop mode via each of the three paths and confirm the other two stay in sync:

- [ ] **Transport bar toggle** (↺ Off / ↺ Loop / ↺ Min / ↺ ∞) → all four modes reachable, Settings and inspector stay in sync
- [ ] **Session inspector** loop mode select → transport bar loop toggle updates immediately
- [ ] **Settings dialog** loop mode select → close Settings → transport bar loop toggle updates

---

## 7. Settings dialog

- [ ] Open Settings → slider values and text fields match current session state (no stale readouts)
- [ ] **Master volume** — slider present in Playback tab. Change it → master volume transport slider in the bottom bar reflects the new value immediately. Change the transport slider → Settings dialog slider updates if open.
- [ ] Change theme in Settings → stage background and accent colors update live
- [ ] Open Settings, start webcam tracking → close Settings (any method: Done, ✕, ESC) → camera light goes off
- [ ] **Device WebSocket URL** — change the URL in FunScript tab → close → reopen Settings → saved URL is restored (persisted in `session.advanced.deviceWsUrl`, survives export/import)

---

## 8. Undo / Redo

- [ ] Edit a block label → Ctrl+Z → label reverts
- [ ] Delete a block → Ctrl+Z → block is restored
- [ ] Mute an audio track → Ctrl+Z → mute state reverts
- [ ] Delete a subtitle track → Ctrl+Z → track is restored
- [ ] Undo button is disabled when stack is empty; Redo button same

---

## 9. Playback

- [ ] Space / Play button starts playback
- [ ] Space / Pause button pauses
- [ ] Stop button stops and resets progress bar to 0
- [ ] Progress bar click seeks during playback
- [ ] Shift+click on progress bar scrubs preview without starting playback
- [ ] `←` `→` skip ±10s; `↑` `↓` skip ±30s
- [ ] ESC triggers emergency stop immediately (🛑 EMERGENCY STOP appears in HUD for 4s)
- [ ] Playback stops cleanly — no orphaned audio after stop

---

## 10. FunScript editor (edit mode)

- [ ] Press `E` or click Edit button → edit mode activates, transform bar appears
- [ ] Click on canvas → point added
- [ ] Drag point → point follows cursor, no wrong-point jumps across neighbors
- [ ] Shift+click points → multi-select (outlined dots)
- [ ] Drag any selected point → all selected move by same delta
- [ ] `A` key → all points selected
- [ ] Transform bar → apply time/position scale or offset → points update

---

## 11. Storage

- [ ] Reload page → session restores from localStorage exactly (blocks, playlists, tracks)
- [ ] Empty session (New Session, no blocks added) → reload → stays empty (does NOT rehydrate to sample)

---

## Known deferred items (do not flag as failures)

- Crossfade between playlist tracks: implemented in audio engine and configurable via Settings → Playback → Crossfade (sec). No playlist-swap UI gesture yet.
- Automated test coverage for `main.js`, `playback.js`, `ui.js`, `tracking.js`, `audio-engine.js`, `macros.js`, `session-analytics.js`, `session-modes.js`, `suggestions.js`, `notify.js`, `fullscreen-hud.js`, `capabilities.js`, `live-control.js`, `ai-authoring.js`: pending (DOM/integration-heavy; not exercised by the unit test runner in `tests/index.html`)

---

## 12. Rules engine

- [ ] Open Sidebar → Rules section → click to open inspector
- [ ] "No rules yet" shown when empty
- [ ] **Add rule** → row appears with name, metric, op, value, duration, action, cooldown
- [ ] Edit name → persists
- [ ] Change metric (attention / intensity / engagement / sessionTime / loopCount) → saves
- [ ] Set action to `setIntensity` → param field appears; set to 0 → intensity becomes 0 (not 1)
- [ ] Enable/disable checkbox → badge count in sidebar updates immediately
- [ ] Start playback → if attention < threshold for duration → action fires
- [ ] Ctrl+Z undoes rule add/delete

## 13. State engine live meters

- [ ] Start playback with webcam tracking active
- [ ] Live Control panel shows three meters: FS Out, Attention, Engage
- [ ] Status tab (▶ icon tab) shows Attention and Engagement stat cards
- [ ] Attention meter rises when face detected, decays smoothly when face leaves frame
- [ ] Engagement follows attention with ~3s smoothing

## 14. Live Override keyboard shortcuts

- [ ] During playback, press `]` — intensity increases by 10%; Live Control slider updates; toast shown
- [ ] During playback, press `[` — intensity decreases by 10%; clamps at 0
- [ ] During playback, press `.` — speed increases by 0.1×; Live Control slider updates
- [ ] During playback, press `,` — speed decreases by 0.1×; clamps at 0.25
- [ ] Press `R` — intensity, speed, and variation all reset to 100% / 1.00× / 0%; toast shown
- [ ] Press `?` — shortcut overlay appears with three columns including "Live Overrides"
- [ ] Pressing `[`, `]`, `,`, `.`, `R` while a text field is focused → no override fires

## 15. Scene editor

- [ ] Open inspector → Scenes tab → Add a scene
  - Color swatch visible; clicking it opens a color picker
  - Changing color updates the swatch and the timeline band color immediately
  - Start / End inputs show seconds; editing them updates the "Xm Xs long" duration hint
  - Editing end to be before start → end is auto-clamped to start + 1
  - Loop behavior select → "once" or "loop"
  - Delete button removes the scene

## 16. IndexedDB storage

- [ ] Create a session with blocks, save it, then reload the page
  - Session reloads from IndexedDB — no "session too large" error even with embedded media
  - Old localStorage session migrated automatically on first load, removed from localStorage
- [ ] Open Settings → AI Generator → enter an API key → Done → close tab → reopen
  - API key persists (stored in IDB, not sessionStorage)
- [ ] Complete a session → check Status tab → Last session summary updates
- [ ] Open DevTools → Application → IndexedDB → ass-db → kv: verify session and analytics keys present

## 17. System settings tab

- [ ] Open Settings → System tab is visible
- [ ] Click "Restart Tutorial" → settings dialog closes → onboarding modal appears
- [ ] Click "Clear Profile & History" → first confirmation dialog appears
  - Click "Yes, clear it" → second confirmation appears with "Are you really, really sure? 😢"
  - Click "No, keep it" → nothing cleared
  - Re-open and complete both confirmations → profile cleared → toast shown
- [ ] Click "Reset All Settings to Defaults" → confirm → appearance/playback/safety settings restored → toast shown
  - Session content (blocks, scenes, rules) unchanged

## 18. User profile customization

- [ ] Status tab → My Profile panel visible
- [ ] Click emoji button → emoji cycles through curated set
- [ ] Type display name → persists across page reload
- [ ] Change "Primary use" dropdown → persists
- [ ] Change "Which makes me" dropdown → persists
- [ ] Type in goals textarea → persists (max 500 chars)
- [ ] Session history shows ✓ / ⏹ / 🛑 completion state icons

## 19. Metrics history

- [ ] Complete a session → open Status tab → My Profile panel shows a bar chart
  - Bars colored green (completed), amber (interrupted), red (emergency)
  - Blue engagement line overlaid when engagement data is present
  - Tooltip on each bar shows date, session count, runtime
- [ ] "Retain N days" input is editable → changing it re-renders the chart window
- [ ] Click ⬆ Import → file picker opens
  - Select a valid JSON array (e.g. `[{"date":"2026-01-01","totalRuntimeSec":1800,"avgIntensityPct":55}]`)
  - Toast: "Imported 1 day of metrics from filename.json"
  - Chart updates to include the imported bar
  - Select a CSV with header row `date,totalRuntimeSec,avgIntensityPct`
  - Import merges correctly
- [ ] Settings → System → Clear Profile & History → confirm both dialogs
  - Metrics chart shows "No metrics data yet" after clearing
- [ ] Import from plugin: any registered plugin with `metrics.write` capability can
  inject data via `importExternalMetrics` — see plugin-host.js

## 20. State Blocks (Phase 5.1)

- [ ] Inspector → Scenes tab → add two or more scenes
- [ ] For each scene, "State:" dropdown shows: — None —, 🌊 Calm, 📈 Build, ⚡ Peak, 🌱 Recovery
- [ ] Selecting a state type on a scene with default color: color auto-updates to the state palette color
  - calm=blue (#5fa8d3), build=amber (#f0c040), peak=red (#e05050), recovery=green (#7dc87a)
- [ ] Timeline canvas: scene bands show the emoji prefix (🌊/📈/⚡/🌱) before the scene name
- [ ] During playback: press N to jump to the next scene
  - Toast appears: "⚡ Peak phase — intensity 120%, speed 1.25×"
  - Live Control intensity/speed sliders update to match the profile
  - Pressing R resets overrides; pressing [ or ] overrides further — all non-destructive
- [ ] Suggestions panel: two scenes with no stateType → "Scenes have no State Block types assigned" (info)

## 21. User-Defined Variables (Phase 5.2)

- [ ] Inspector → Session tab → Variables panel visible at the bottom
- [ ] Type a name in the add field (e.g. `score`), select type "number", click Add
  - Variable appears with a type badge and value input
  - `{{score}}` now resolves in text/TTS blocks during playback
- [ ] Add a string variable (`phase`): value input is a text field
- [ ] Add a boolean variable (`active`): value input is a checkbox
- [ ] Edit the value live — change propagates immediately (no save button needed)
- [ ] Delete button (×) removes the variable
- [ ] In a text block content: type `Your score is {{score}}.` — resolves during playback
- [ ] Suggestions: a text block using `{{undefined_var}}` → "template variable referenced but not defined" warning
- [ ] Suggestions: a setVar rule targeting a name not in variables → "setVar action targets undefined variable" warning
- [ ] Rules inspector: action dropdown includes "Set variable"; selecting it shows text input for `name=value`
- [ ] Trigger inspector: success/failure action includes "Set variable" option
- [ ] AI generator: describe a session that tracks progress → Claude may generate variables in the output

## 22. Sensor Bridge (Phase 5.3)

- [ ] Settings → Advanced tab → Sensor Bridge panel visible below JSON editor
- [ ] Panel shows "Not connected" status with grey indicator
- [ ] Enter a WebSocket URL (default ws://localhost:9000) and click ⚡ Connect
  - If no server is running: panel shows reconnecting with attempt count
  - If server is running: green indicator, "Connected — ws://..."
- [ ] Send a signal message from the server: `{"signal":"heartRate","value":0.75,"weight":0.4}`
  - Engagement score changes within 1–2 seconds (visible in Status tab during playback)
- [ ] Send a variable message: `{"variable":"score","value":10}`
  - The session variable `score` updates to 10
- [ ] Send a batch: `{"signals":[{"signal":"gsr","value":0.3,"weight":0.3}]}`
- [ ] Click Disconnect — indicator goes grey, no reconnect attempts
- [ ] Signals not refreshed within 5s are automatically cleared (stale signal protection)

## 23. Achievements, XP & Daily Quests

- [ ] Complete a session → post-session modal shows "Session progress" strip with XP earned
- [ ] Post-session modal shows any newly earned achievements with icon and name
- [ ] Post-session modal shows completed daily quests with name and XP value
- [ ] Profile panel → XP bar visible with level name and progress percentage
- [ ] Profile panel → Daily Quests section shows 3 quests for today (resets at midnight)
- [ ] Completed quests shown with ✅ and strikethrough; XP shown in gold
- [ ] Profile panel → Achievements section shows categorised grid (8 categories)
- [ ] Unearned visible achievements shown dimmed with original name; secret = 🔒 ???
- [ ] Earned achievements shown in gold with pop-in animation
- [ ] Category header turns gold when all achievements in that category are earned
- [ ] Hidden achievements (secret:true) only appear after earned, not before
- [ ] Settings → Display/HUD → Progress notifications: toggle each of the 4 options
  - Disable "XP earned toast" → no XP toast appears after next session
  - Disable "Achievement unlocked" → no achievement toast appears
  - Disable "Quest completed" → no quest toast appears
  - Disable "Level-up announcement" → no level banner appears
- [ ] Replay onboarding tutorial button (in profile) → tutorial appears immediately
- [ ] Reset settings to defaults button → confirm dialog → all Display/HUD settings reset
- [ ] Clear profile button → first confirm → second "really sure?" confirm → profile wiped
  - After clear: XP = 0, achievements empty, quests reset, session count 0
- [ ] Content packs: load 3 different packs → "Pack Curious" achievement fires
- [ ] Load all 6 packs → "Pack Explorer" achievement fires
- [ ] Emergency stop during session → "Safety First" badge awarded (if first time)

## 24. Profile Panel — Categorised Achievements

- [ ] "First Steps" category shows immediately with 6 achievements
- [ ] Completing a session: first_session earns on very first completed session
- [ ] Streak achievements: streak badge appears day after consecutive play
- [ ] Quest achievements: quest count ticks up correctly after each quest completion
- [ ] Level achievements: after reaching Level 3, "Level 3" achievement appears in Levels category
- [ ] Session count footer shows correct "N/M visible · K hidden found"
- [ ] Hovering an earned badge shows tooltip with name + description
- [ ] Hovering an unearned secret badge shows "Secret achievement" tooltip


## 23. Achievements, XP & Daily Quests

- [ ] Complete a session → post-session modal shows "Session progress" strip with XP earned
- [ ] Post-session modal shows any newly earned achievements with icon and name
- [ ] Post-session modal shows completed daily quests with name and XP value
- [ ] Profile panel → XP bar visible with level name and progress percentage
- [ ] Profile panel → Daily Quests section shows 3 quests for today (resets at midnight)
- [ ] Completed quests shown with ✅ and strikethrough; XP shown in gold
- [ ] Profile panel → Achievements section shows categorised grid (8 categories)
- [ ] Unearned visible achievements shown dimmed with original name; secret = 🔒 ???
- [ ] Earned achievements shown in gold with pop-in animation
- [ ] Category header turns gold when all achievements in that category are earned
- [ ] Hidden achievements (secret:true) only appear after earned
- [ ] Settings → Display/HUD → Progress notifications: toggle each of the 4 options
  - Disable "XP earned toast" → no XP toast appears after next session
  - Disable "Achievement unlocked" → no achievement toast appears
  - Disable "Quest completed" → no quest toast appears
  - Disable "Level-up announcement" → no level banner appears
- [ ] Replay onboarding tutorial button → tutorial appears immediately (no page reload)
- [ ] Reset settings to defaults → confirm → all Display/HUD settings reset, content preserved
- [ ] Clear profile → first confirm → second "really, really sure?" → profile wiped
  - After clear: XP = 0, achievements empty, quests reset, session count 0
- [ ] Content packs: load 3 different packs → "Pack Curious" achievement fires
- [ ] Load all 6 packs → "Pack Explorer" achievement fires
- [ ] Emergency stop during session → "Safety First" badge awarded on first use

## 24. Profile Panel — Category Display

- [ ] "First Steps" category shows 6 achievements; most dimmed until earned
- [ ] first_session earns on completing very first session
- [ ] Quest count achievements tick up correctly in "Quests" category
- [ ] Level achievements appear in "Levels" category after reaching that XP threshold
- [ ] Achievement count footer: "N/M visible · K hidden found" updates correctly
- [ ] Hovering earned badge shows tooltip with name + description
- [ ] Hovering unearned secret badge shows "Secret achievement" tooltip
