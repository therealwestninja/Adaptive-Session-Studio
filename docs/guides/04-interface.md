# 04 — The Interface

A complete tour of every panel in Adaptive Session Studio.

---

## Layout overview

```
┌─────────────────────────────────────────────────────────────┐
│  TOOLBAR  [Session name] [▶ Play] [⏹ Stop] [Mode] [Device]  │
├──────────────┬──────────────────────────────┬───────────────┤
│              │                              │               │
│   SIDEBAR    │      MAIN STAGE              │   INSPECTOR   │
│   (left)     │      (center)                │   (right)     │
│              │                              │               │
│  Blocks      │  Idle screen or              │  Block/scene/ │
│  Scenes      │  playback view               │  track detail │
│  Audio       │                              │               │
│  Video       │                              │  Tabs:        │
│  Subtitles   │                              │  Overlay      │
│  FunScript   │                              │  Audio/Video  │
│  Macros      │                              │  Subtitles    │
│  Rules       │                              │  FunScript    │
│  Triggers    │                              │  Macros       │
│  Modes       │                              │  Scenes       │
│  Packs       │                              │  Rules        │
│              │                              │  Triggers     │
│              │                              │  Modes        │
│              │                              │  Status       │
│              │                              │  AI           │
├──────────────┴──────────────────────────────┴───────────────┤
│  TIMELINE  ████████████░░░░░░░░░░░░  0:00 / 5:00           │
└─────────────────────────────────────────────────────────────┘
```

---

## Toolbar

### Session name
Click the session name at the top to rename it. Names are saved automatically.

### Transport controls
| Button | Action |
|--------|--------|
| ▶ Play | Start session |
| ⏸ Pause | Pause/resume |
| ⏹ Stop | End and show post-session modal |

### Mode selector
Dropdown showing the current session mode (Exposure Therapy, Deep Focus, etc.). Changing this rewrites rules, ramp, and pacing settings to match the mode's preset.

### Device indicator
Shows Intiface Central connection status. Green = connected, grey = disconnected. Click to toggle the device WebSocket connection.

### Live controls
Sliders for **Intensity** and **Speed** that apply in real time during playback. The `[` `]` keys and `,` `.` keys adjust these from the keyboard.

### Profile/avatar button
Opens the profile panel showing XP, level, achievements, and daily quests.

---

## Sidebar

The sidebar is the content inventory. Click any item to select it and see its properties in the inspector.

### Blocks
Timed content items. Listed in time order. Click to jump to that block in the inspector.

### Scenes
Named time ranges. Click to select. Drag start/end handles in the inspector to resize.

### Audio / Video
Playlist tracks for background media. Click + to add files.

### Subtitles
Imported `.ass` / `.ssa` subtitle tracks. Click the eye icon to enable/disable.

### FunScript
Haptic timeline tracks. Shows the position waveform. Click the pencil icon to edit in the canvas editor.

### Macros
Saved motion patterns. Five slot buttons (1–5) for quick injection during playback.

### Rules
Behavioral automation rules. Toggle the checkbox to enable/disable. Click to edit conditions and actions.

### Triggers
Timed challenge windows with success/failure branches.

### Modes
Quick-load session mode presets.

### Packs
Quick-load content packs.

---

## Inspector

The right panel shows details for whatever is selected. It has multiple tabs:

**Overlay tab** — text, font, position settings for text/TTS blocks
**Audio/Video tab** — media tracks, volume, loop
**Subtitles tab** — subtitle track settings
**FunScript tab** — pattern library, canvas editor
**Macros tab** — macro library management
**Scenes tab** — scene list, timing, state type
**Rules tab** — rule conditions and actions
**Triggers tab** — trigger windows
**Modes tab** — session mode details
**Status tab** — real-time metrics and session health suggestions
**AI tab** — AI session generation

---

## Main Stage

The center area shows:
- **Idle view** — session title, stats, description when not playing
- **Playback view** — full session content during playback (overlay text, visualizations)
- **Fullscreen mode** — press F to enter; shows HUD with metrics

---

## Timeline

The bar at the bottom shows:
- **Playhead** — current position during playback
- **Scene markers** — colored bars showing scene boundaries
- **Block markers** — small marks at block start times
- **Duration** — total session length

Click anywhere on the timeline to seek (during playback) or preview (Shift+click when paused).

Scroll to zoom in/out. Ctrl+0 resets zoom.

---

## Settings

Press **Ctrl+,** or click the gear icon in the toolbar.

Settings are organized into tabs:

| Tab | Contents |
|-----|----------|
| Appearance | Theme, colors, fonts |
| Playback | Loop behavior, master volume |
| Display / HUD | Overlay position, toast notifications |
| FunScript | Device WebSocket address, speed |
| Macros | Macro slot assignments |
| Subtitles | Default style overrides |
| Webcam | Tracking thresholds |
| Safety | Intensity/speed hard limits |
| Advanced | JSON editor, sensor bridge |
| System | Recovery, reset, tutorial |

---

## Next steps

→ [05 — Building Sessions](05-building-sessions.md) to learn how to create from scratch
