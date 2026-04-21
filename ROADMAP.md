# Adaptive Session Studio — ROADMAP

Ordered by ease of implementation. Items at the top are quick wins or
moderate improvements buildable on existing architecture. Items at the
bottom require significant new systems, research, or external APIs.

**Highest priority: Main editing window UI redesign** — marked ★ below.

---

## LEGEND

| Symbol | Meaning |
|--------|---------|
| `[ ]`  | Not started |
| `[~]`  | Partial / in progress |
| `[x]`  | Done |
| ★      | Highest priority |
| 🔌     | Requires external API / service |
| ⚗️     | Experimental / speculative |

---

## TIER 1 — QUICK WINS (days)
*Isolated changes, no new architecture needed*

- [x] **Session Notes visible in sidebar summary** — show first line of `session.notes` as a tooltip or subtitle under the session name in the toolbar, so authors can see their own design intent without opening Settings.

- [x] **Block colour coding by type** — give each block type a distinct colour strip on the block list sidebar (text = blue, TTS = green, audio = amber, viz = purple, macro = red, pause = grey). Currently all blocks look identical.

- [x] **FunScript heatmap preview in sidebar** — render a small inline position-vs-time heatmap thumbnail next to each FunScript track in the sidebar (reuse the heatmap logic already in `metrics-history.js`).

- [x] **Duplicate Scene / Rule buttons** — context menu or button on each scene/rule card to duplicate it. Currently only blocks can be duplicated.

- [x] **Expand FunScript built-in patterns** — add 6–8 new named patterns to `funscript-patterns.js`: *Plateau Hold*, *Ruined Edge*, *Staccato Burst*, *Long Slow Draw*, *Aftershock*, *Featherlight*. Each is a pure data addition.

- [x] **Expand visualization block types** — add to `viz-blocks.js`: *Lissajous figure*, *Colour field wash* (slow HSL rotation), *Geometric zoom* (nested shapes pulsing outward), *Eye spiral* (Fibonacci/polar). Five patterns currently; target twelve.

- [x] **Timeline zoom persistence** — save the user's timeline zoom level to `session.displayOptions.tlZoom` so it survives inspector tab switches and session loads.

- [x] **BPM-to-TTS sync helper** — add a small "set block duration to N beats at current BPM" button inside the TTS block inspector so authors can align spoken content to music tempo.

- [x] **Session word count / reading time estimate** — display cumulative character count and estimated TTS duration for all TTS blocks so authors can predict total spoken time.

- [x] **Block search / filter** — add a filter input above the block list in the sidebar to search by label or content keyword. Useful in long sessions.

- [x] **Export session as Markdown script** — generate a readable `.md` file listing every block in order (start time, type, content) — useful for reviewing scripts outside the app and sharing with voice actors.

- [x] **Keyboard shortcut reference card** — add a `?` button to the toolbar that opens a compact overlay listing all keyboard shortcuts. Currently undiscoverable.

- [x] **More achievement categories** — wellness, creativity, endurance, mastery tiers. The achievement framework in `achievements.js` is complete; just add entries.

- [x] **More daily quest types** — variety quests (try a new viz block, use binaural audio, complete a session before noon). Framework supports arbitrary conditions.

---

## TIER 2 — MODERATE EFFORT (weeks)
*New functionality within the existing module structure*

- [ ] **★ Main editing window UI redesign** *(highest priority)*
  The current layout has accumulated technical debt across many sessions. A comprehensive redesign should address:
  - **Block list sidebar**: drag-to-reorder, group-by-scene visual lanes, collapsible type groups, inline duration display
  - **Inspector panel**: context-sensitive header, tabbed sub-sections per block type, cleaner field hierarchy
  - **Stage area**: always-visible mini timeline scrubber below the stage for quick seeking without opening the full timeline editor
  - **Toolbar / menubar**: consolidate into a single-row command bar with overflow menu; remove duplicate controls between toolbar and Settings
  - **Timeline editor**: waveform display behind the FunScript canvas; colour-coded block regions across the full session duration; named scene bands above the lanes
  - **Overall**: implement a consistent 8px grid, standardise typography scale, improve contrast ratios for accessibility

- [x] **Breathing block type** (`type: 'breathing'`) — animated breathing guide block: configurable inhale/hold/exhale/hold cycle, visual ring animation driven by `requestAnimationFrame`, TTS cue integration ("breathe in… hold… out…"). Complements mindfulness mode.

- [x] **Binaural / isochronal audio block type** (`type: 'entrainment'`) — use Web Audio API `OscillatorNode` to generate binaural beats (two sine waves, slight frequency offset) or isochronic tones (amplitude-modulated single frequency). Parameters: carrier Hz, beat Hz, waveform. No external dependency.

- [x] **Ambient sound library** — curate and bundle 20–30 short loopable audio clips (rain, forest, white noise, tibetan bowls, ocean) licensed under CC0/CC-BY. Surface them in a dedicated "Ambience" section of the audio track inspector with loop enabled by default. Moodist's 84+ sound library is MIT-licensed and attributable.

- [x] **Multi-axis FunScript editing** — extend the FunScript timeline editor to support additional axes (twist/roll/surge/suck/vibrate) via the `{axis}.funscript` file naming convention. Each axis gets its own lane in the multi-lane canvas. `funscript-utils` (defucilis, MIT) provides the parsing layer.

- [x] **Session timeline: block lane grouping by scene** — render shaded scene bands horizontally across the block list so authors can see which blocks belong to which scene at a glance. Currently scenes and blocks are in separate sidebar sections with no visual connection.

- [x] **Variables: user-visible runtime display** — during playback, show a compact HUD element listing all non-zero variables with their current values. Authors use variables for conditioning logic; currently the only feedback is the inspector.

- [x] **Rule / trigger: more action types** — add: `setScene` (jump to named scene), `showMessage` (overlay a text popup), `flashColor` (flash stage background), `playAudio` (trigger a one-shot audio file). Currently: pause, resume, nextScene, setIntensity, injectMacro.

- [x] **Rule / trigger: more condition types** — add: `timeInScene` (seconds elapsed in current scene), `loopCount` (how many times the session has looped), `variableEquals` (arbitrary variable comparison), `deviceConnected` (is a haptic device active). Enables far richer session logic.

- [x] **Session mode: Pleasure Training** — add a fourth session mode alongside Exposure, Mindfulness, and Conditioning. Based on classical conditioning framework: reward signal (haptic injection) tied to attention peaks; progressive intensity increases with each loop. Rules and ramp preset defined in `session-modes.js`.

- [x] **Session mode: ASMR / Deep Relaxation** — low-intensity mode: slow viz, binaural blocks, long pauses, very gentle FunScript (5–15% amplitude). No escalation rules. Optimised for sleep-adjacent states.

- [x] **Content pack editor** — a simple form in the inspector that lets users author and export their own content packs (`.json` bundles of session + metadata + icon). Currently packs are only hard-coded. Enables a future community library.

- [x] **Session timer / elapsed display in toolbar** — real-time elapsed clock visible during playback showing `MM:SS elapsed / MM:SS total` in the menubar. Currently this only shows in the fullscreen HUD.

- [x] **TTS voice preview** — a "preview" button next to the voice selector in Settings that speaks the first line of the current TTS block using the selected voice. Currently users must run the whole session to hear the voice.

- [x] **Suggestions engine improvements** — `suggestions.js` currently produces basic hints. Add checks for: overlapping block starts, TTS blocks longer than their duration allows, scenes with no blocks assigned, rules with conflicting actions.

- [x] **Import / export: `.zip` session package** — bundle the session JSON with any embedded audio, subtitle tracks, and the session cover image into a single downloadable `.zip`. Currently audio is embedded as base64 (bloated) or not portable.

---

## TIER 3 — SIGNIFICANT EFFORT (months)
*New architectural components or deep integrations*

- [ ] **★ FunScript AI generation from video/audio analysis** *(validated gap in ecosystem)*
  Use the Web Audio API to analyse an imported audio track's amplitude envelope, then automatically generate a FunScript that mirrors the audio's rhythm and intensity. No CV required — pure audio analysis. Validate against the 10 existing named patterns as shape templates.

- [ ] **WebGL/shader visualization blocks** — add a `shader` viz block type that runs a GLSL fragment shader in a `WebGL2RenderingContext`. Provide 5–8 curated shaders (ported from Shadertoy, CC0-licensed): *plasma field*, *noise warp*, *fractal zoom*, *aurora curtain*, *tunnel rush*. Parameters exposed as uniforms (speed, colour, intensity). **Requires WebGL pipeline isolated in a `viz-shader.js` module.**

- [ ] **PWA / offline mode** — add a `manifest.json` and `service-worker.js` so ASS is installable as a Progressive Web App. Cache all static assets offline. Particularly valuable for users running ASS on a local server. No functionality change required — purely infrastructure.

- [ ] **Improved TTS: external voice providers** 🔌 — add optional integration for higher-quality TTS via browser `fetch` against:
  - **OpenAI TTS API** (`tts-1`, `tts-1-hd` — 6 voices, ~$0.015/1K chars)
  - **ElevenLabs** (emotional, ASMR-quality voices — free tier 10K chars/mo)
  - Fall back to Web Speech API when no key is configured. Add voice preview in Settings.

- [ ] **Session collaboration: share via URL** — encode a compressed session JSON into a shareable URL (or generate a short code that stores the session in a public KV store). Allows sharing sessions without file transfer. Requires a small backend or a free KV service (Cloudflare KV, Upstash).

- [ ] **Video player integration** — add a `video` block type that plays an imported `.mp4` / `.webm` alongside the session timeline. FunScript auto-syncs to the video's playhead. The block inspector shows a video scrubber. This closes the gap with ScriptPlayer and is the most-requested missing feature in the FunScript community.

- [ ] **Direct WebBluetooth device connection** *(without Intiface Central)* — use the Buttplug.io WASM Server to connect to Bluetooth LE devices directly from the browser, eliminating the Intiface Central dependency for single-device workflows. Supported by `buttplug-js` v4's `ButtplugEmbeddedConnectorOptions`.

- [ ] **Multi-device management** — currently ASS sends commands to the first available device. Add a Device Manager panel that lists all connected devices, lets the user assign each to a named "channel" (e.g., *primary*, *secondary*, *ambient*), and allows rules/macros to target specific channels. Matches MultiFunPlayer's device orchestration model.

- [ ] **Speech recognition for session branching** ⚗️ — use the Web Speech API `SpeechRecognition` interface to listen for verbal responses during pause blocks ("say *yes* to continue, *more* to repeat"). Feed recognition results into the rules engine as a new condition type `speechHeard`. Inspired by Virtual Hypnotist's ISL scripting.

- [ ] **AI session memory and personalisation loop** 🔌 — after each session, send the session summary (attention, engagement, completion, user notes) to the AI generator as context for the next generation. Over time, Claude's generated sessions adapt to the user's response patterns. Requires storing session summaries with a user-managed API key.

- [ ] **Script import: Virtual Hypnotist ISL** ⚗️ — parse `.vhscript` / ISL format files from the Virtual Hypnotist community (3,400+ member community, large script library). Map ISL commands to ASS block types: `speech` → TTS block, `visual` → viz block, `wait` → pause block, `binaural` → entrainment block. Fills an immediate content gap.

---

## TIER 4 — LONG-TERM / RESEARCH
*Requires new domains of expertise, external dependencies, or community infrastructure*

- [ ] **Community session library** — a curated, community-contributed library of session templates (`.asspack` files) discoverable within the app. Requires moderation infrastructure, a CDN, metadata schema, and review process. Comparable to what ScriptAxis provides for FunScripts.

- [ ] **EEG / biofeedback sensor integration** ⚗️ — extend the Sensor Bridge (currently WebSocket) to receive data from consumer EEG headsets (Muse, OpenBCI) via Web Bluetooth or a local bridge. Use brainwave band power (alpha, theta) as rule conditions. Validates the adaptive architecture at a physiological level.

- [ ] **Clinical session validation** ⚗️ — partner with a researcher to design and run a small study (n=20–50) measuring outcomes for one of the evidence-based modes (mindfulness stress reduction, exposure therapy for anxiety). Produces publishable results and legitimises clinical claims. Long-term credibility gap vs. Reveri (Stanford) and HypnoBox (clinical endorsements).

- [ ] **3D device simulation** ⚗️ — a WebGL 3D model of a generic device that animates in sync with the FunScript playhead. Reference: OFS_Simulator3D (Godot). Useful for authoring — lets creators see the physical motion without a connected device.

- [ ] **P2P remote session sharing** ⚗️ 🔌 — operator-subject mode over WebRTC: one browser runs the session (operator), another displays it (subject). The operator can intervene with live controls while the subject sees only the stage. Inspired by XToys.app's remote play feature. Requires WebRTC signalling server.

---

## BUTTPLUG.IO FRAMEWORK EXPANSION
*Do not clean up or remove this section — it will be expanded in a future roadmap revision.*

The current Buttplug.io integration covers: connect to Intiface Central via WebSocket, send vibrate/linear/rotate commands, receive device status feedback. The `sensor-bridge.js` module handles the connection lifecycle.

**Future expansion surface (reserved):**

- Device capability introspection (linear vs. vibrate vs. rotate vs. oscillate features per device)
- Per-device channel assignment (see multi-device management above)
- Sensor feedback loop (read device position sensors where available — Handy, OSR2)
- Lovense Connect API direct integration (alternative to Intiface for Lovense devices)
- WebBluetooth WASM server (Intiface-free path)
- Pattern upload to device firmware (Lovense local patterns, Keon scripting)
- Emergency stop broadcast to all connected devices (currently single-device)
- Device latency calibration tool (measure round-trip ms for sync adjustment)

---

*Last updated: April 2026 · v78*
*Based on competitive gap analysis covering 40+ applications across six categories.*
