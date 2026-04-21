# 09 — FunScript & Haptics

FunScript is an open format for time-coded haptic device control. Adaptive Session Studio can play FunScript files to any device connected through Intiface Central.

---

## What is a FunScript file?

A `.funscript` file is JSON containing an array of `{at, pos}` actions:
- `at` — timestamp in milliseconds
- `pos` — position from 0 to 100

The device moves from the previous position to the new position at each timestamp, creating a motion pattern synchronized to the session.

---

## Loading a FunScript track

1. Open the **FunScript** tab in the inspector
2. Click **+ Add track** or drag a `.funscript` file onto the panel
3. The track appears in the waveform view
4. Enable/disable individual tracks with the eye icon

You can have multiple tracks. The device uses the highest position value across all active tracks at any moment.

---

## Built-in patterns

The **Pattern Library** tab contains 11 pre-generated patterns:

| Pattern | Character |
|---------|-----------|
| Slow Pulse | Gentle rhythmic movement |
| Steady Rhythm | Consistent moderate pace |
| Slow Build | Gradually increasing intensity |
| Wave Surge | Rolling wave motion |
| Heartbeat | Double-beat biological rhythm |
| Tease & Edge | Build and pause cycle |
| Deep Descent | Gradual depth strokes |
| Cascade | Accelerating sequence |
| Breath Sync | Follows breath timing |
| Storm | Intense varied motion |
| *(BPM generator)* | Synced to custom BPM |

Click any pattern to preview, then **Add to session** to create a FunScript track from it.

---

## BPM generator

The BPM generator creates a FunScript pattern synchronized to a beats-per-minute value. Set:
- **BPM** — target beats per minute (40–200)
- **Duration** — length of the generated track
- **Amplitude** — motion range (higher = more extreme)
- **Baseline** — minimum position
- **Pattern bars** — rhythmic structure

This is useful for creating patterns that sync with music or other rhythmic content.

---

## The canvas editor

Click the **pencil icon** on any FunScript track to open the timeline canvas editor.

In the editor you can:
- **Click** to add points
- **Drag** existing points to new positions
- **Right-click** points to delete them
- **Select and transform** a range of points (scale time, scale position, shift)
- **Smooth** selected points with Ctrl+click

The editor shows the position curve from 0–100 over time. The device follows this curve during playback.

---

## FunScript settings

Open **Settings → FunScript** for:

| Setting | Description |
|---------|-------------|
| Device WebSocket | Address of Intiface Central (default: `ws://localhost:12345`) |
| Playback speed | Global speed multiplier for all FunScript output |
| Invert | Flip all positions (0 becomes 100, 100 becomes 0) |
| Range cap | Maximum position sent to device (safety limit) |

---

## Macros

A **macro** is a short saved FunScript pattern you can inject live during playback.

Five macro slots (1–5) are accessible from the keyboard. Press **1–5** during playback to immediately inject that pattern, regardless of what the timeline FunScript is doing.

Useful for:
- Reward patterns triggered manually by the operator
- Emphasis on specific moments
- Emergency speed/position changes

---

→ [10 — Visualizations](10-visualizations.md)
