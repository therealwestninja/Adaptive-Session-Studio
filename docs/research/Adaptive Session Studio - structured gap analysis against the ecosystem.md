# Adaptive Session Studio: structured gap analysis against the ecosystem

**No existing application combines a visual session timeline, multi-modal output (audio + visual + haptic), real-time biometric adaptation, and AI generation into a single web-based tool.** Across six categories and 40+ surveyed applications, ASS occupies a genuinely uncontested intersection. The closest spiritual ancestor — Virtual Hypnotist (2009, Visual Basic 6, abandoned) — proved the concept of scriptable multi-modal hypnosis sessions but has no modern successor. The largest gap in every category is the same: no tool links a block-based session timeline to adaptive behavior driven by real-time user metrics.

---

## 1. Web-based video and audio timeline editors

The browser-based editing landscape has matured significantly, with several open-source projects now rivaling desktop NLEs for basic workflows. These tools provide the strongest existing prior art for ASS's block-based session timeline and TTS/audio/subtitle track features.

### Top 5 finished apps

| App | URL | Stars | Key features | Better than ASS | ASS advantage |
|-----|-----|-------|-------------|-----------------|---------------|
| **Remotion** | github.com/remotion-dev/remotion | ~23,000 | React-based programmatic video creation; composable scenes; frame-accurate rendering; FFmpeg export | Massive ecosystem, mature API, declarative React model for timeline composition | Remotion is a *framework*, not a finished editor — ASS provides a complete GUI; ASS adds adaptive behavior, device control, and session logic |
| **Motion Canvas** | github.com/motion-canvas/motion-canvas | ~18,300 | Code-driven animation with visual timeline editor; **voice-over sync** with waveform display; yield-based animation flow; MIT license | Superior voice-over/TTS synchronization model; mature tweening/easing system; excellent documentation | ASS adds device feedback, webcam tracking, adaptive rules, gamification; Motion Canvas has no session concept |
| **waveform-playlist** | github.com/naomiaro/waveform-playlist | ~1,600 | Multi-track audio with time-synced annotations; **v5 React rewrite** with `<daw-editor>` Web Components; 20+ effects via Tone.js; WAV export | Most directly relevant architecture — multi-track timeline with annotations maps to TTS/subtitle tracks; clean Web Component API (`<daw-track>`, `<daw-clip>`) | ASS adds visual blocks, device control, adaptive behavior, gamification; waveform-playlist is audio-only |
| **Omniclip** | github.com/omni-media/omniclip | ~1,400 | Fully browser-based NLE; multi-track video/audio/image; **WebCodecs API** for 4K rendering; privacy-first (no uploads); upcoming programmatic "Omni Tools" API | Clean unidirectional architecture; true multi-track NLE with clip management; programmatic API for automated timeline creation | ASS has specialized session logic, device integration, and adaptive behavior that a general-purpose NLE cannot provide |
| **FreeCut** | github.com/walterlow/freecut | Growing | **WebGPU** rendering pipeline; 25+ blend modes; keyframe animation with Bezier curves; multi-track (video, audio, text, image, shape); GPU scopes; multi-format export | Most feature-complete open-source browser editor; WebGPU pipeline relevant for visualization blocks; text/shape tracks useful for subtitle overlay | ASS is domain-specific; FreeCut's generality is both strength and weakness — no session logic, no devices, no adaptation |

**GridSound DAW** (1,800 stars, vanilla JS) and **AudioMass** (65KB single-track editor) are notable additional references for audio-specific workflows.

### Key takeaway for ASS

**waveform-playlist v5** is the most architecturally relevant project. Its multi-track timeline with time-synced annotations, React component model, and Web Component API (`<daw-editor>`, `<daw-track>`, `<daw-clip>`) maps almost directly to ASS's block-based session timeline with TTS/audio/subtitle tracks. Motion Canvas's voice-over synchronization model is the best reference for TTS timing. ASS's differentiation here is not the timeline itself — it's what the timeline *drives*: adaptive rules, visualization blocks, device commands, and gamification state.

---

## 2. FunScript editors and players

The FunScript ecosystem centers on desktop tools with a **critical gap in web-based editing**. The format is straightforward JSON (`actions` array of `{pos, at}` objects, position 0–99, timestamp in ms), with multi-axis support via file naming convention (e.g., `video.stroke.funscript`, `video.roll.funscript`).

### Top 5 tools

| App | URL | Platform | Stars | Key features | Better than ASS | ASS advantage |
|-----|-----|----------|-------|-------------|-----------------|---------------|
| **OpenFunscripter (OFS)** | github.com/OpenFunscripter/OFS | Desktop (C++) | 136 | Gold standard editor; multi-axis; **Lua extension system**; waveform display; bookmarks; 3D simulator add-on | Superior precision editing (keyboard shortcuts, Lua scripting, frame-accurate scrubbing); established community trust; 3D simulation | ASS is web-based (OFS is desktop-only and **archived since Sep 2023**); ASS adds device feedback loop during editing, adaptive session context, visualization integration |
| **MultiFunPlayer** | github.com/Yoooi0/MultiFunPlayer | Desktop (C#) | 208 | **Best-in-class multi-device sync**; 10+ video player integrations; motion providers (random, pattern, curve); C# plugin system; 200+ Patreon supporters | Unmatched multi-axis, multi-device synchronization; smart speed limiting; gap-filling motion providers | ASS is web-based; MFP is player-only with **no editing capability**; ASS combines editing + playback + adaptation in one tool |
| **Funscript.org** | funscript.org | **Web** | N/A (commercial) | Web-based player + **"Funscript Creator" editor**; AI-assisted generation (planned); 600+ devices via Intiface Central; interactive games; £4.99/mo | Closest commercial competitor with web editor + device control; broader device support via Intiface | ASS is open-source; adds multi-lane canvas, adaptive rules, visualization integration, gamification; Funscript.org's editing appears basic |
| **Funscript.io** | github.com/defucilis/funscript-io | **Web** | 46 | Script player, modifier framework, manual/random/cycler modes for The Handy; heatmap visualization; React/JS | Proven web-based FunScript interaction; modifier pipeline for script tweaking | ASS has full timeline editor (Funscript.io is modify-only, not create); ASS adds multi-axis, device feedback, adaptive behavior |
| **FunGen** | github.com/ack00gar/FunGen-AI-Powered-Funscript-Generator | Desktop (Python) | Active | **AI/CV-based automatic script generation** using YOLO models; multi-axis output; batch processing; plugin system (Amplify, Smooth, Speed Limiter) | Most advanced AI generation for FunScripts; proven CV pipeline for automated scripting | ASS is web-based; ASS's AI generation serves a different purpose (session composition, not video analysis); FunGen validates that AI-assisted scripting has demand |

**ScriptPlayer** (201 stars, basic editing), **ScriptPlayer+** (Electron fork), **XToys.app** (web-based with FunScript playback), and **WebOFS** (experimental WASM port of OFS, limited functionality) are additional references.

### The critical ecosystem gap

**No open-source, web-based, multi-axis FunScript timeline editor exists.** This is the single largest gap in the FunScript ecosystem:

- Desktop editors (OFS) are archived or Windows-only
- Web tools (Funscript.io) offer modification, not creation
- Commercial web tools (Funscript.org) are closed-source with basic editing
- The TypeScript library `funscript-utils` (by defucilis) provides parsing, heatmap rendering, and intensity calculation — building blocks exist but nobody has assembled a full web editor
- MultiFunPlayer's multi-device sync is unmatched but desktop-only and player-only

ASS's multi-lane FunScript canvas editor with real-time device preview would fill a **clear, validated market gap**.

---

## 3. Hypnotic visualization and brainwave entrainment

This category splits into two well-served but completely siloed domains: audio entrainment tools (mature) and visual hypnotic generators (mostly demos). **No tool combines both in a session timeline.**

### Top 5 tools

| App | URL | Type | Key features | Better than ASS | ASS advantage |
|-----|-----|------|-------------|-----------------|---------------|
| **myNoise** | mynoise.net | Commercial web | **Hundreds** of calibrated sound generators; dedicated binaural/isochronal generators; slider animation for organic drift; Super Generator for combining sources; created by audio engineer Stéphane Pigeon | Unbeatable audio quality and breadth; decades of acoustic expertise; per-generator slider UX | ASS adds visual entrainment, session timeline, webcam tracking, adaptive behavior; myNoise has zero visual component and no session structure |
| **Gnaural Web Studio** | gnaural.net | Open-source web | Modern HTML5 reimagining of classic binaural generator (20+ year history); **segment-based session editor**; PWA (offline capable); .gnaural file import; pure client-side JS | Closest to "timeline" concept with segment scheduling; proven file format; offline PWA | ASS adds visual blocks, multi-modal output, webcam tracking, adaptive rules, gamification; Gnaural is audio-only with simple segments |
| **Hypnospiral** | hypnospiral.vercel.app | Open-source web | Customizable spiral generator; adjustable parameters (color, speed, arms, patterns); **shareable configs via URL**; audio integration; Patreon-supported; React + Canvas | Best dedicated spiral visualizer with sharing; active community; clean React architecture | ASS integrates spirals as one block type among many; adds timeline sequencing, audio sync, attention tracking, adaptive parameters |
| **BrainAural** | brainaural.com | Free web | **Four modulation types** (amplitude, binaural, stereophonic panning, frequency modulation); mix up to 5 frequencies simultaneously | Most flexible multi-modulation audio entrainment in a single tool | ASS adds visual component, timeline, tracking, adaptation; BrainAural is a single-screen generator |
| **SINE Isochronic Entrainer** | sine.fdossena.com | Open-source web+desktop | Isochronic tone generation; **session editor** (desktop); preset sharing community; cross-platform presets | Proven preset-sharing community model; session editor concept | ASS adds visual entrainment, webcam tracking, adaptive behavior; SINE is audio-only and archived (2020) |

**Moodist** (84+ ambient sounds, MIT license, React/TypeScript) is the best open-source ambient sound platform. **Shadertoy** hosts dozens of GPU-accelerated hypnotic shaders (GLSL) that could be extracted and integrated as visualization blocks. **Lumenate** (commercial mobile) is the most scientifically validated consumer entrainment app (Sussex/Imperial College research) but uses phone flashlight, not screen visuals.

### The visualization gap

The building blocks exist separately — Shadertoy shaders for GPU-accelerated visuals, Web Audio API generators for binaural/isochronal tones, p5.js/Three.js/Canvas for animated patterns. **Nobody has combined them into composable, parameterized "visualization blocks" that can be sequenced in a timeline.** This concept is genuinely novel. Gnaural Web's segment editor comes closest for audio but has zero visual capability.

---

## 4. Buttplug.io ecosystem web applications

<!-- FLAG: DO NOT clean up or remove this section — it will be expanded later. -->

The Buttplug.io framework is **mature and production-ready**. The Rust core is at v10 (Feb 2026), the JS/TS client (`buttplug` npm package) is at **v4.0.0** (Mar 2026), and the ecosystem supports **750+ devices** across Bluetooth LE, USB, HID, Serial, and Network transports. The standard web integration pattern connects via WebSocket to Intiface Central (`ws://localhost:12345`); an alternative WASM Server enables in-browser WebBluetooth without Intiface.

### Web apps using Buttplug.io

| App | URL | Key features | Status | ASS overlap |
|-----|-----|-------------|--------|-------------|
| **XToys.app** | xtoys.app | Most complete: pattern editor, visual scripting ("Teases"), FunScript player, remote play, multi-device, 365+ devices; implements own BLE protocol layer | Finished commercial product (closed source) | XToys is a **superset** of ASS's device features but closed-source, not session-oriented, and lacks biometric adaptation |
| **Buttplug Playground** | playground.buttplug.world | Official test utility: connect, scan, send vibrate/rotate/linear commands via sliders; Vue.js SPA | Finished minimal reference | Covers connect + basic run; no feedback, no session logic — ASS extends this significantly |
| **Beadi** | github.com/ThatBatLuna/Beadi (14 stars) | **Node-based visual editor** for programming device patterns; triggers, switches, randomizers, conditionals; Blender-inspired node UI | Working community project | Interesting prior art for pattern logic; ASS's session-driven approach differs from Beadi's freeform node graph |
| **Buttplug Editor** | github.com/MaidKun/buttplug-editor | Visual pattern programming; predecessor to Beadi | Older, less active | Pattern creation focus; ASS integrates device control into a broader session context |
| **Buzzy!** | github.com/BuzzyMe/buzzy | WebRTC P2P toy sharing/control; PWA installable | Working, open source | Remote sharing focus (multi-user); ASS is single-user session-oriented |

### Integration notes for ASS

The **recommended path** is WebSocket to Intiface Central via `ButtplugBrowserWebsocketClientConnector`. The buttplug-js API surface is small: scan for devices → connect → send vibrate/rotate/linear commands → handle device events. The Glitch demo (`how-to-buttplug.glitch.me`) shows minimal viable integration in ~50 lines. ASS's connect/run/feedback scope is well-served by the existing SDK — **no custom protocol work needed**. The feedback loop (device response informing session progression) is where ASS differentiates; no existing web app implements this.

Additional ecosystem tools: `buttplug-tampermonkey` (21 stars, userscript for arbitrary web pages), `react-buttplug` (9 stars, React Context wrapper, likely stale against v4), `ToyWebBridge` (REST API frontend for Buttplug).

---

## 5. Relaxation, meditation, and mindfulness apps

A striking finding: **there is no serious open-source web/JS meditation app with session scripting, block-based editing, or adaptive behavior.** The most mature projects are mobile-native (Flutter/React Native). The web ecosystem has only tutorial-level projects.

### Top 4 apps

| App | URL | Stars | Platform | Key features | Better than ASS | ASS advantage |
|-----|-----|-------|----------|-------------|-----------------|---------------|
| **Medito** | github.com/meditohq/medito-app | ~2,700 | Flutter (mobile only) | 100% free nonprofit; guided meditations; 30-day challenges; 9 themed series; offline content; no ads/login required | Polished curated content; established brand trust; fully free; F-Droid availability | ASS adds session customization, adaptive behavior, AI generation, multi-modal experience, gamification; Medito has zero scripting capability |
| **Hey Linda** | github.com/heylinda/heylinda-app | 719 | React Native | Community-contributed meditation recordings; open contributor model; Hacktoberfest participant | Low-barrier contribution model (anyone can record) | ASS is superior in every technical dimension; Hey Linda is essentially a basic audio player |
| **Breathly** | github.com/mmazzarolo/breathly-app | ~500 | React Native | Multiple breathing techniques (4-7-8, box breathing); visual animated guide; customizable durations; haptic feedback | Clean single-purpose UX for breathing exercises | ASS adds multi-block sessions (breathing → visualization → meditation), webcam tracking of compliance, adaptive pacing, achievements |
| **Moodist** | github.com/remvze/moodist | Active | React/TS web | **84+ ambient sounds**; Pomodoro timer; binaural beats; MIT license; self-hostable; modern UI | Best open-source ambient sound platform; Pomodoro integration; self-hostable | ASS adds session timeline, adaptive behavior, visualization, device control; Moodist is a sound mixer, not a session tool |

### The meditation-tech gap

The gap between commercial meditation apps (Headspace, Calm, Insight Timer — all closed, subscription-based, content-library models) and open-source alternatives is enormous. No open-source tool offers session scripting, and no tool of any kind offers webcam-based attention tracking for meditation. ASS's session modes (mindfulness, exposure therapy, breathing) would be the **first open-source, web-based tool with structured, scriptable meditation sessions**.

---

## 6. Hypnosis and ASMR content platforms

This category contains ASS's most direct conceptual competitors, including one remarkably prescient abandoned project and several emerging AI-powered platforms.

### Top 5 platforms

| App | URL | Open source | Key features | Better than ASS | ASS advantage |
|-----|-----|-------------|-------------|-----------------|---------------|
| **Virtual Hypnotist** | vhypno.sourceforge.net | Yes (VB6) | **ASS's spiritual ancestor**: ISL scripting language, Script Maker GUI, **TTS (SAPI4/5)**, speech recognition for verbal responses, binaural synchronizer, visual maker, subliminal systems, animated characters; 3,400+ community; **abandoned 2009** | Mature scripting language (ISL); speech recognition for interactive sessions; pre-made script library; 15+ years of community validation | ASS modernizes this entire concept: web-based, webcam tracking (VH has none), AI generation, modern TTS, adaptive rules, gamification, visualization blocks; VH is dead VB6 code |
| **HypnoBox** | hypnobox.com | No | **700+ modular audio elements**; modular session builder (Introduction → Deepening → Suggestions → Awakening → Background); male/female voice; audio import; award-winning | **Closest to ASS's block-based timeline**: modular session composition is proven and clinically valued; massive pre-built module library; professional audio quality | ASS adds visual timeline editor (HypnoBox is linear playlist), webcam tracking, adaptive rules, AI generation, visualization blocks, gamification, multi-modal (HypnoBox is audio-only) |
| **InTheMoment** | inthemoment.app | No | **True AI-generated sessions** (LLM + TTS pipeline, not library selection); pre-session AI conversation; technique customization; session memory; 11 AI voices; 9 languages; both hypnosis and meditation modes; 7,000+ users | Most mature AI generation pipeline for sessions; natural language check-in UX; multi-language; proven demand | ASS adds webcam tracking, visual block editor, adaptive rules engine (real-time, not pre-session), gamification, multi-modal output, user-editable templates (ITM sessions are one-shots) |
| **Reveri** | reveri.com | No | Stanford-backed (Dr. David Spiegel); interactive pre-session questions shape content; **clinical research validation**; pain management, stress, sleep; pattern learning over time | Clinical credibility; published research; expert-recorded content; proven efficacy claims | ASS adds true real-time adaptation (webcam vs questionnaire), user-created sessions, AI generation, visual/haptic modalities, gamification |
| **Hypnothera** | hypnothera.ai | No | AI-generated hypnosis sessions; multiple AI voices; variable lengths; natural language goals; multi-language | Validates AI hypnosis concept | ASS exceeds in virtually every dimension; Hypnothera has buggy UX, no adaptation, no editing |

### The Virtual Hypnotist connection

Virtual Hypnotist (2009) is the most important comparison in this analysis. It implemented **TTS narration, a scripting language for session flow, binaural entrainment, visual effects, speech recognition, and a script editor** — almost exactly the feature set ASS targets, minus webcam tracking, AI generation, and gamification. It had a 3,400-member community and proved the concept works. Its abandonment 15+ years ago with zero modern successors represents **ASS's strongest validation signal**: the demand existed, the concept was proven, but nobody rebuilt it for the modern web.

---

## Summary gap table

| Feature | Best-in-class app | ASS status | Priority |
|---------|-------------------|------------|----------|
| **Block-based session timeline** | HypnoBox (linear audio modules) | Core architecture — visual block editor with drag/drop | 🔴 Critical |
| **TTS/audio/subtitle tracks** | waveform-playlist v5 (multi-track audio + annotations) | Multi-track with TTS integration | 🔴 Critical |
| **FunScript timeline editor** | OFS (desktop, archived) / Funscript.org (web, basic, closed) | Multi-lane canvas with live preview — **fills ecosystem's largest gap** | 🔴 Critical |
| **Buttplug.io device connection** | XToys.app (full-featured, closed) / Playground (minimal) | Connect/run/feedback via buttplug-js v4 — well-supported SDK | 🟡 Medium |
| **Hypnotic visualization blocks** | Hypnospiral (spirals only) / Shadertoy (raw shaders) | Composable parameterized blocks in timeline — **novel concept** | 🟡 Medium |
| **Webcam attention tracking** | **None exist** | Real-time face/gaze tracking driving session adaptation | 🔴 Critical (strongest differentiator) |
| **Adaptive rules engine** | Reveri (questionnaire-based, not real-time) | Pause/jump/escalate on live metrics — **complete whitespace** | 🔴 Critical |
| **Achievement/quest profile system** | **None in this space** | RPG-style progression for session engagement — **complete whitespace** | 🟢 Low (differentiator but not core) |
| **AI session generation** | InTheMoment (most mature LLM+TTS pipeline) | AI generation + manual editing hybrid — **no tool combines both** | 🟡 Medium |
| **Session modes (mindfulness, exposure therapy)** | InTheMoment (hypnosis + meditation) | Multiple clinical modes with adaptive delivery | 🟡 Medium |
| **Multi-modal sync (visual + audio + haptic)** | Virtual Hypnotist (visual + audio + TTS, 2009, dead) | All modalities synchronized in timeline with live device output | 🔴 Critical |
| **Web-based accessibility** | Funscript.io, Gnaural Web (narrow scope each) | Full-featured app running in browser — no install | 🟢 Low (architectural choice) |

---

## Honest differentiation assessment

### Where ASS is genuinely differentiated (no competitor)

Three features exist in **complete whitespace** with zero competition:

1. **Webcam attention tracking integrated with session logic** — no meditation, hypnosis, entrainment, or FunScript tool uses computer vision for real-time feedback. Endel and Brain.fm adapt to metadata (time, weather, activity); Reveri adapts to questionnaire answers. Nobody reads the user's face.

2. **Adaptive rules engine driven by biometrics** — conditional session branching (pause/jump/escalate) based on measured engagement is genuinely novel across all surveyed categories.

3. **Gamification in therapeutic/wellness context** — no meditation or hypnosis app has achievement/quest progression systems. This is either a significant differentiator or a design risk depending on the target audience.

### Where ASS fills a validated but empty niche

The **web-based multi-axis FunScript editor** fills the FunScript ecosystem's most requested missing piece. OFS is archived, no web editor has multi-axis support, and the TypeScript building blocks (`funscript-utils`) exist but nobody has assembled them. The demand is proven by community discussion on EroScripts and the commercial launch of Funscript.org.

The **composable visualization blocks** concept (parameterized WebGL/Canvas effects sequenced in a timeline) has no precedent. Individual visualizations exist (Hypnospiral, Shadertoy shaders), audio entrainment tools exist (Gnaural, SINE, BrainAural), but nobody has combined them into a timeline-composable system.

### Where ASS lags behind existing best-in-class tools

ASS faces significant catch-up challenges in several areas:

- **Audio quality and breadth**: myNoise has hundreds of professionally calibrated generators built over a decade. ASS cannot match this library depth at launch. Strategy: integrate existing open-source audio (Moodist's 84+ sounds are MIT-licensed) and focus on TTS quality rather than ambient sound breadth.

- **FunScript editing precision**: OFS's desktop editing experience (frame-accurate scrubbing, Lua extensions, keyboard-driven workflow) is deeply refined. A web-based editor will inherently have higher latency and fewer shortcuts. Strategy: target different users — session composers rather than frame-by-frame scripters.

- **Multi-device sync sophistication**: MultiFunPlayer's 10+ player integrations, smart speed limiting, and gap-filling motion providers represent years of specialized development. Strategy: ASS's scope is connect/run/feedback, not full device orchestration. Defer to MFP for advanced sync use cases.

- **AI generation maturity**: InTheMoment has a working LLM+TTS pipeline with session memory, 11 voices, 9 languages, and 7,000+ users validating the model. Strategy: ASS's differentiator is **AI generation + manual editing** — InTheMoment generates but doesn't let users edit; ASS combines both.

- **Clinical credibility**: Reveri has Stanford research and published studies. HypnoBox has clinical endorsements. Strategy: this is a long-term gap that requires user studies, not engineering.

### The core thesis

ASS is not trying to be the best video editor, the best FunScript scripter, the best meditation timer, or the best device controller. It is the **only tool attempting to be all of these simultaneously, connected by an adaptive rules engine**. Every existing tool excels at one capability in isolation. ASS's value proposition is the integration layer — the session timeline that orchestrates TTS, visualizations, device commands, and adaptive logic into a coherent, personalized experience. Virtual Hypnotist proved this concept works. Nobody has rebuilt it for the modern web in 15 years.