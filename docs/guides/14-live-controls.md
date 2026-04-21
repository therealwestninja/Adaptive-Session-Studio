# 14 — Live Controls

Live controls let you adjust the session in real time during playback, without stopping.

---

## The live control sliders

Two sliders are always visible in the toolbar during playback:

**Intensity** — scales the overall haptic output from 0 to 200%. At 100% (1.0), the session plays as designed. At 200% (2.0), all haptic output is doubled.

**Speed** — scales the playback speed of FunScript patterns from 25% to 400%.

The safety layer enforces hard limits set in Settings → Safety. Even if you push the slider to maximum, it won't exceed the configured safe maximum.

---

## Keyboard control

| Key | Action |
|-----|--------|
| `[` | Intensity −10% |
| `]` | Intensity +10% |
| `,` | Speed −0.1× |
| `.` | Speed +0.1× |
| `R` | Reset both to defaults |

---

## Macro injection

Press **1–5** during playback to immediately inject the macro assigned to that slot.

A macro is a short FunScript pattern that plays over whatever the timeline is doing. It fades out automatically when it finishes.

Assign macros in **Settings → Macros** or in the **Macros** tab.

---

## FunScript pause

Press **Shift** to toggle FunScript pause — the device stops responding but the session timeline continues. This is useful for:
- Pausing device output without pausing the session
- Manual edge control
- Recovering from unexpected device response

---

## Operator mode

When running sessions for someone else, use a second display or split-screen setup:
- Main screen: fullscreen playback (what the subject sees)
- Your screen: the app interface with live controls visible

The subject's screen shows only the session content. Your screen shows metrics, live controls, and the ability to inject macros or adjust on the fly.

---

→ [15 — Attention Tracking](15-attention-tracking.md)
