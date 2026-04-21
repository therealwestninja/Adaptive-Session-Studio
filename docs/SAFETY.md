# Safety Guidelines

Adaptive Session Studio can control physical haptic devices and run automated sessions over extended periods. Please read this document before using any device integration or automated features.

---

## Emergency Procedures

### Emergency Stop (ESC × 2)

Press **Escape twice in rapid succession** (within ~1.2 seconds) to trigger an emergency stop. This will:

- Immediately halt all FunScript device output
- Send a `StopAllDevices` command to any connected Intiface device
- Cancel all active audio and TTS playback
- Stop the session clock
- Exit fullscreen mode

This is the fastest way to stop everything. Practice it before you start a session.

### Single ESC / Enter / F12

A single press of Escape, Enter, or F12 performs a **graceful stop**: the session ends cleanly, audio fades, and FunScript output eases to zero before stopping. Use this for normal session endings.

### Physical Device Disconnect

If software controls fail, disconnect the device physically or via Intiface Central's built-in stop button. Keep Intiface Central's interface accessible during sessions.

---

## Device Safety

### Before Connecting

- Read your device's manual fully before use.
- Understand the device's physical limitations: maximum stroke length, continuous-use temperature rating, mechanical tolerances.
- Test the device manually at low intensities before running automated scripts.
- Ensure the device firmware is up to date.

### During a Session

- **Never leave a connected device or a partner unattended during a session.**
- Keep the emergency stop accessible at all times. In fullscreen mode, the ESC key is always active.
- Set conservative speed and range limits in **Settings → FunScript** (`speed`, `range`, `invert`) before your first automated session.
- Monitor for signs of discomfort, overheating, or unexpected behaviour.

### Skip Safety (Arrow Keys)

When skipping forward or backward during FunScript playback, the application eases device output to zero at half-speed before jumping to the new position. This prevents abrupt mechanical movements. Do not disable or work around this behaviour.

### Macro Injection Safety

Macro injection blends short bursts of movement into a running FunScript with mathematical ease-in and ease-out transitions. Even so, start with low-intensity built-in macros (Poke, Stroke) before using high-intensity ones (Piston, Thrust In) in automated contexts.

---

## Session Safety

### Attention Tracking

The webcam attention tracking feature can auto-pause or modify behaviour when attention is not detected. This is a convenience feature, not a safety system. Do not rely on it as a primary safety mechanism.

### Duration and Loops

Long sessions and "loop forever" mode can produce fatigue. Set realistic duration limits. Take breaks.

### Content Safety

Sessions can include text, audio, and video content designed for conditioning or modification. Consider carefully what content you include, especially for sessions used with a partner:

- Obtain clear, ongoing consent before creating or sharing conditioning sessions.
- Be explicit about what a session contains before a partner experiences it.
- Build in natural stopping points using **Pause** blocks.

---

## Partner Safety

If you are using Adaptive Session Studio with a partner:

- Establish clear signals for discomfort or stopping before the session begins (verbal safeword, hand signal, etc.) — do not rely solely on the software's stop mechanisms.
- The partner should always have independent access to an emergency stop. Consider a physical button connected to Intiface, or keeping the keyboard accessible.
- Check in regularly, especially during long or high-intensity sessions.
- Never bind or restrain a partner in a way that prevents them from reaching an emergency stop independently.

---

## Psychological Safety

Conditioning and modification content can have lasting effects. Treat it responsibly:

- Do not use this tool to create content intended to harm, coerce, or manipulate others.
- If you experience unexpected psychological effects from a session, stop and speak with a trusted person or professional.
- Content designed for BDSM or erotic hypnosis contexts should only be used between consenting adults who have negotiated the content in advance.

---

## Known Limitations

- **FaceDetector API** — The webcam attention tracking relies on the browser's experimental FaceDetector API, available only in Chrome/Edge on supported platforms. In other browsers, tracking gives a live camera preview but no actual attention detection. Do not depend on attention-triggered auto-pause as a safety net.
- **Device output timing** — WebSocket-based device control (via Intiface Central) introduces a small latency (~50–150ms typical). This is acceptable for most use cases but means device movement does not perfectly synchronise with the session clock.
- **Browser tab switching** — Switching away from the browser tab may throttle the RAF loop, causing the session clock to drift. Keep the tab active during playback.

---

## If Something Goes Wrong

1. Press **ESC** twice rapidly — emergency stop.
2. If that fails, disconnect the device physically.
3. Close the browser window.
4. Power off the device if it has a physical power switch.
5. Seek help if needed.

---

*Safety is not optional. Play responsibly.*
