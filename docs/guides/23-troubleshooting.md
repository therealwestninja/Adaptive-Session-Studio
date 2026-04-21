# 23 — Troubleshooting

Solutions to the most common problems.

---

## The app won't open

**Symptom:** Blank page, or "This site can't be reached"

**Cause:** The app needs a local HTTP server. Opening `index.html` directly as a file (`file:///...`) doesn't work.

**Fix:** Start a local server first:
```bash
cd adaptive-session-studio
npx serve .
# Then open http://localhost:3000
```

---

## TTS (text-to-speech) doesn't play

**Symptom:** TTS blocks are silent during playback

**Causes and fixes:**

1. **Browser permission:** Some browsers require TTS to be triggered by a user gesture. Click the play button manually (don't autoplay via script) — this counts as the required gesture.

2. **No voices installed:** Open your operating system's speech settings and install a voice pack. On Windows: Settings → Time & Language → Speech. On macOS: System Settings → Accessibility → Spoken Content.

3. **Volume too low:** Check the TTS volume slider in the block inspector, and the master volume in the toolbar.

4. **Speech synthesis API unavailable:** Safari on iOS can have restrictions. Use Chrome or Edge for best results.

---

## Device not responding (haptics)

**Symptom:** FunScript track plays but device doesn't move

**Check these in order:**

1. **Intiface Central is running** — open it and confirm it shows "Server Running"
2. **Device is connected in Intiface** — the device should appear in Intiface's device list with a green indicator
3. **WebSocket address matches** — Settings → FunScript → Device WebSocket should match Intiface's address (default `ws://localhost:12345`)
4. **FunScript track is enabled** — the track in the sidebar shouldn't have the eye icon crossed out
5. **Intensity not zero** — check the live intensity slider in the toolbar
6. **Safety cap not at 0** — Settings → Safety → Max intensity should be greater than 0

**Device connects then immediately disconnects:** This is usually a battery issue. Charge the device and try again.

---

## Webcam tracking not working

**Symptom:** Attention metric stays at 0 or "Unavailable"

**Causes and fixes:**

1. **Wrong browser:** FaceDetector API only works in Chrome and Edge. Firefox and Safari are not supported.

2. **Camera permission denied:** Click the camera icon in the browser address bar and grant permission. The app cannot access the camera without explicit permission.

3. **Camera in use by another app:** Close other apps using the webcam (video calls, OBS, etc.).

4. **FaceDetector API disabled:** In Chrome, go to `chrome://flags` and search for "FaceDetector". Enable it if disabled.

5. **Poor lighting:** The face detector needs reasonable lighting. A dark room or backlit environment may cause detection failures.

---

## Session auto-save is gone / previous work missing

**Symptom:** The app opens to a blank or sample session instead of your previous work

**What happened:**
- The auto-save is in your browser's IndexedDB
- Clearing browser data, using incognito mode, or browser updates can erase IndexedDB
- The session file is NOT saved to your computer's file system unless you explicitly exported it

**Prevention:** Always export your sessions with Ctrl+S after significant changes.

**If the auto-save was corrupt:** The app may show a "Quarantined Session" card in Settings → System. Click "Load into JSON Editor" to inspect the raw JSON — you may be able to recover content from it.

---

## "Session file is too large" error

**Symptom:** Import fails with a size error

**Limits:**
- Session JSON: 20 MB
- FunScript JSON: 5 MB
- Macro JSON: 1 MB
- Subtitle text: 5 MB
- Metrics file: 2 MB

**Fix:** Remove large embedded media from the session. Audio and video files are stored as base64 in the session JSON, which is much larger than the original file. Consider keeping media files separate and reimporting them after loading the session.

---

## Rules aren't firing

**Symptom:** You created a rule with a condition but it never triggers

**Check:**

1. **Rule is enabled** — the checkbox in the Rules tab must be checked
2. **Cooldown is too long** — if the cooldown is 300 seconds and the condition was true once, it won't fire again for 5 minutes
3. **Attention tracking is off** — rules using `attention` as a metric require the webcam tracker to be running. Without it, attention = 0 constantly.
4. **Metric never reaches the threshold** — check the Status tab's real-time metrics to see current values
5. **Rule condition is backwards** — `attention < 0.3` fires when attention is LOW. If you want it to fire when attention is good, use `attention > 0.7`

---

## Undo isn't working as expected

**Symptom:** Ctrl+Z doesn't restore a change, or restores too many/few steps

**Notes:**
- The undo history holds 60 steps
- Some actions don't create undo entries (settings changes, profile updates)
- Loading a content pack creates one undo entry — Ctrl+Z will reload your previous session

---

## The session jumps or skips unexpectedly

**Symptom:** Blocks appear out of order or at the wrong times

**Check:**
- Block start times in the inspector — overlapping start times are fine, but very short durations can cause visual artifacts
- Scene boundaries — scenes that overflow the session duration cause a warning in the Status tab
- Loop count — if loop mode is on, the session restarts and plays from 0

---

## Settings changes don't save

**Symptom:** Settings revert to previous values after closing the dialog

**Note:** Settings are part of the session — they save with Ctrl+S and auto-save to IndexedDB. If you're using incognito mode, IndexedDB is cleared when the window closes.

---

## The app is slow or lagging during playback

**Causes and fixes:**

1. **Visualization blocks are CPU-intensive** — reduce the number of simultaneous viz blocks, or lower the speed setting
2. **Large FunScript files** — files with hundreds of thousands of actions are slow to parse. The import limit is 100,000 actions per track.
3. **Too many audio tracks** — each active background audio track uses Web Audio API resources
4. **Browser hardware acceleration disabled** — enable it in browser settings

---

## "Cannot access 'scenes' before initialization" (developer)

This was a bug in earlier versions. Update to the latest version.

---

## Getting more help

Join the community Discord: [discord.gg/G6qD35nag7](https://discord.gg/G6qD35nag7)

When reporting an issue, include:
- Browser name and version
- Operating system
- What you were doing when the problem occurred
- Any error messages from the browser console (F12 → Console tab)

---

→ [24 — Developer Reference](24-developer.md)
