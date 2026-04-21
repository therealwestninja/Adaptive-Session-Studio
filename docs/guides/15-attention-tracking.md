# 15 — Attention Tracking

The webcam attention tracker detects whether the user's face is present and focused. Rules can respond to attention drops, enabling automatic pause, redirect, or intensity changes.

---

## How it works

The FaceDetector API (built into Chrome/Edge) runs in the background during playback. It checks for a face in the webcam frame. The result feeds into the **attention** metric (0–1).

- **1.0** — face clearly detected, sustained attention
- **0.5** — face sometimes present, or brief absence
- **0.0** — no face detected

The signal is smoothed to avoid false positives from momentary glances away.

---

## Setup

1. Open **Settings → Webcam**
2. Enable "Attention tracking"
3. Grant camera permission when prompted
4. The webcam preview appears — verify your face is in frame

**Privacy note:** The webcam feed is processed entirely in your browser. No video is recorded, stored, or transmitted anywhere.

---

## Webcam settings

| Setting | Description |
|---------|-------------|
| Enabled | Turn tracking on/off |
| Warmup period | Seconds to wait before tracking begins (default: 1.5s) |
| Loss threshold | Minimum attention for "present" (default: 0.4) |
| Decay rate | How quickly attention drops when face is absent |
| Tracking FunScript | Apply FunScript behavior linked to attention events |

---

## Connecting attention to rules

The most common pattern:

```
Condition: attention < 0.3
Action:    Pause
Cooldown:  30s
```

When the face disappears or attention drops below 30%, the session pauses. When the user returns attention and resumes, it continues.

More advanced:
```
Condition: attention >= 0.9
Action:    Set intensity → 1.5
Cooldown:  90s
```
Reward sustained focus with a brief intensity increase.

---

## Browser compatibility

The FaceDetector API requires Chrome or Edge. Firefox and Safari do not support it. In unsupported browsers, the tracking panel shows "Unavailable" and the attention metric stays at 0 (treated as full attention by default).

---

→ [16 — Sensor Bridge](16-sensor-bridge.md)
