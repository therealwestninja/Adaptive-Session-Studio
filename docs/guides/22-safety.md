# 22 — Safety Guide

Safety is a first-class concern in Adaptive Session Studio. This guide covers emergency procedures, hard limits, and responsible use.

---

## Emergency stop

**Double-press ESC** at any time during playback.

What happens:
1. FunScript output ramps smoothly to zero position
2. Playback stops immediately
3. The device receives a final position-0 command
4. A 30-second emergency cooldown activates — the session cannot be restarted during this time

The cooldown prevents accidental immediate restart. It can be configured but not disabled entirely.

---

## Hard limits

Two hard limits apply at all times, regardless of any other setting:

**Max intensity** — FunScript position is capped to this value before being sent to the device. Default: 2.0 (200%). Can be set lower in Settings → Safety.

**Max speed** — FunScript playback speed is capped. Default: 4.0×. Can be set lower.

These limits **cannot be overridden by rules, macros, or any automated action**. They are enforced in the safety layer before any signal reaches the device.

**Warning threshold** — a visual indicator appears when intensity exceeds this level. Default: 1.5 (150%). Useful for operators who want a heads-up before reaching maximum.

---

## Safe intensity ranges

| Level | Description |
|-------|-------------|
| 0.0–0.5 | Very gentle, appropriate for warm-up or unfamiliar users |
| 0.5–1.0 | Moderate, standard operational range |
| 1.0–1.5 | High, for experienced users |
| 1.5–2.0 | Very high — warning indicator active |

---

## Consensual use

This software is designed for consensual adult use between informed participants. All features — including rules that auto-escalate, triggers that challenge, and haptic patterns — should only be used with:

- Clear prior agreement on what the session will do
- Established safe signals (words, gestures) for stopping
- The ability to use the emergency stop at any time
- No power imbalance that would compromise free consent

**Never run a session on someone who doesn't know what it does, hasn't agreed to participate, or cannot stop it.**

---

## Device safety

Haptic devices have manufacturer-specified operating limits. Exceeding these can:
- Cause device failure
- Generate heat
- Cause physical discomfort or injury

Set the **Range cap** in FunScript settings to limit maximum device position. For most devices, positions above 80–90% are rarely needed and staying below them extends device life.

---

## Supervision

Sessions involving high intensity, escalating rules, or long durations should have an informed operator able to intervene. The FunScript pause (`Shift`) and live controls allow immediate adjustment without stopping the session.

Unsupervised sessions are the user's own choice and responsibility.

---

## Crash recovery

If the app stops responding during a session:

1. Close the browser tab
2. Intiface Central will detect the connection drop and stop the device
3. Open the app again — the session auto-saves, so your content is intact

The emergency stop is the **browser's responsibility when the tab closes**. Intiface Central handles device disconnection gracefully.

---

→ [23 — Troubleshooting](23-troubleshooting.md)
