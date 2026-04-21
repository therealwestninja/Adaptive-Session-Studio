# 05 — Building Sessions

This guide walks through building a session from scratch. By the end you'll have a working 3-minute session with text, TTS, and a pause.

---

## Concepts

A session is a timeline. Everything happens at a specific time for a specific duration.

**Blocks** are the content items on the timeline. Each block has:
- A **start time** (seconds from the beginning)
- A **duration** (how long it shows/plays)
- A **type** (what it does)

Blocks can overlap. Text blocks and TTS blocks commonly run simultaneously — the text shows while it's being spoken.

---

## Block types

| Type | What it does |
|------|-------------|
| **Text** | Shows text on screen at a fixed position |
| **TTS** | Reads text aloud using browser speech synthesis |
| **Audio** | Plays a one-shot audio clip (not the background playlist) |
| **Video** | Shows a fullscreen video clip |
| **Pause** | Pauses playback and waits for the user to continue |
| **Macro** | Injects a FunScript macro pattern at this time |
| **Viz** | Shows an animated hypnotic visualization |

---

## Creating a block

1. Click the **+** button in the Sidebar → Blocks section (or right-click the timeline)
2. Choose a block type
3. Set the **start** time and **duration** in the inspector
4. Fill in the content

**Or:** Use the **AI tab** to generate a full set of blocks from a description.

---

## Worked example: 3-minute session

### Step 1: Set session duration

In the inspector with nothing selected, set **Duration** to `180` (3 minutes = 180 seconds).

### Step 2: Opening text block

- Create a **Text** block
- Start: `0`, Duration: `15`
- Content: `Take a moment to settle in. Close your eyes when you're ready.`
- Font size: 24, Position: center

### Step 3: Opening TTS

- Create a **TTS** block
- Start: `2`, Duration: `12`
- Content: Same text as above (or shorter spoken version)
- The TTS starts 2 seconds in, giving the text time to appear first

### Step 4: Silence/settling period

- Leave blocks empty from 15–30 seconds (natural silence)

### Step 5: Main content block

- Create another **Text** block
- Start: `30`, Duration: `60`
- Content: Your main session content

### Step 6: Mid-session pause (optional)

- Create a **Pause** block
- Start: `90`, Duration: `10`
- This shows a "Continue when ready" prompt and waits for a keypress

### Step 7: Closing TTS

- Create a **TTS** block
- Start: `120`, Duration: `20`
- Content: `Slowly becoming aware of your surroundings. Take your time.`

### Step 8: End block

- Create a **Text** block
- Start: `160`, Duration: `20`
- Content: `Session complete.`

---

## Block inspector fields

### Text blocks
| Field | What it does |
|-------|-------------|
| Content | The text to display. Supports `{{variables}}` |
| Font size | Text size in pixels |
| Position | Top / Center / Bottom of screen |
| Color | Text color |
| Fade in/out | Transition duration in seconds |
| Align | Left / Center / Right |

### TTS blocks
| Field | What it does |
|-------|-------------|
| Content | Text to speak. Supports `{{variables}}` |
| Voice | Browser voice to use |
| Rate | Speech speed (0.5 = slow, 2.0 = fast) |
| Pitch | Voice pitch |
| Volume | TTS volume independent of master |

### Viz blocks
| Field | What it does |
|-------|-------------|
| Pattern | Spiral / Pendulum / Tunnel / Pulse / Vortex |
| Speed | Animation speed (0.25–4×) |
| Color | Primary animation color |
| Opacity | Overlay transparency |

---

## Using template variables in content

Any block content field supports `{{variable}}` substitution. Built-in variables:

| Variable | Value |
|----------|-------|
| `{{intensity}}` | Current intensity as percentage |
| `{{speed}}` | Current speed multiplier |
| `{{loop}}` | Current loop number |
| `{{time}}` | Elapsed session time (formatted) |
| `{{scene}}` | Current scene name |

You can also define your own variables in the Variables panel.

**Example:** `"Intensity is currently {{intensity}}% — keep going."`

---

## Saving your session

Press **Ctrl+S** to export as a `.assp` file. This is a JSON file containing your entire session.

Sessions also **auto-save** continuously to your browser's local storage — you won't lose work if the tab closes.

---

## Undo and redo

**Ctrl+Z** — undo the last change
**Ctrl+Y** or **Ctrl+Shift+Z** — redo

The undo history goes back 60 steps.

---

## Next steps

→ [06 — Scenes](06-scenes.md) — organize your session into named phases
→ [09 — FunScript & Haptics](09-funscript.md) — add device control
