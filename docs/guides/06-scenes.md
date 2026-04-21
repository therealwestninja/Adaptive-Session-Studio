# 06 — Scenes

Scenes are named time ranges within a session. They give structure, enable automatic intensity profiles, and let rules respond to "which phase are we in."

---

## What scenes do

Without scenes, a session is a flat timeline of blocks. With scenes, you define phases — and the session engine knows which phase it's in at any moment.

Each scene has:
- A **name** (Settle, Drop, Peak, etc.)
- A **start** and **end** time
- An optional **state type** that applies automatic intensity/pacing behavior
- A **color** for the timeline marker
- A **loop behavior** and optional **next scene** for complex flows

---

## State types

The four state types define behavioral profiles that automatically adjust intensity and pacing when a scene is entered:

| State type | Effect |
|-----------|--------|
| **Calm** | Lower intensity, slower pacing, relaxed atmosphere |
| **Build** | Gradually increasing intensity, moderate pace |
| **Peak** | Maximum intensity, fastest pace |
| **Recovery** | Intensity drops, slow pace, restorative feel |

Assigning a state type to a scene is optional but strongly recommended for content packs and anything longer than 2 minutes. The **Status** tab will suggest adding state types if you have scenes without them.

---

## Creating a scene

1. Click **Scenes** in the sidebar
2. Click the **+** button
3. Set Start and End times in the inspector
4. Give it a name
5. Choose a state type (optional but recommended)
6. Pick a color for the timeline marker

---

## The classic four-scene arc

The Classic Induction content pack uses this arc — it's a solid starting template:

```
0:00 ──── 1:00 ──── 3:00 ──── 4:30 ──── 5:00
  [Settle]  [Drop  ]   [Depth  ]  [Rise ]
   calm      build       peak     recovery
```

**Settle (calm):** The user arrives and gets comfortable. Slow, gentle content.
**Drop (build):** Engagement increases. Narration and haptics become more present.
**Depth (peak):** The main experience. Full engagement, maximum intensity.
**Rise (recovery):** Gentle return. Soft narration, intensity fades.

---

## Navigating scenes during playback

- Press **N** to skip to the next scene immediately
- Rules can trigger scene changes automatically (see [07 — Rules](07-rules.md))
- The HUD shows the current scene name during fullscreen playback

---

## Scene loop behavior

| Setting | What happens at scene end |
|---------|--------------------------|
| **Once** | Scene ends, continues to next scene or end |
| **Loop** | Scene restarts from its own beginning |
| **Next scene** | Jumps to a specified scene ID |

Loop behavior is useful for meditation sessions where a scene should repeat until some external trigger (like an attention event) moves it forward.

---

## Tips

- Scenes don't affect block timing — blocks still play at their absolute timestamps
- Scenes can overlap, but it's usually cleaner not to
- The **Status** tab shows warnings for scenes that overflow the session duration or overlap unexpectedly

---

→ [07 — Rules Engine](07-rules.md)
