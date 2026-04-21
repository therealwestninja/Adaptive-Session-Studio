# 16 — Sensor Bridge

The Sensor Bridge connects external biometric or sensor devices to the session engine via WebSocket. Signals can influence engagement, attention, or trigger rules.

---

## What it does

A Sensor Bridge is a local server (you run it) that sends real-time data to the app over WebSocket. The app reads that data and feeds it into the engagement engine.

This enables:
- Heart rate monitoring affecting session intensity
- GSR/EDA (galvanic skin response) influencing engagement
- Any custom sensor input from a Raspberry Pi, Arduino, or similar device

---

## Protocol

The bridge sends JSON messages:

**Single signal:**
```json
{ "signal": "heartRate", "value": 0.75, "weight": 0.4 }
```

**Batch:**
```json
{ "signals": [
  { "signal": "heartRate", "value": 0.75, "weight": 0.4 },
  { "signal": "gsr", "value": 0.3, "weight": 0.3 }
]}
```

**Variable update:**
```json
{ "variable": "score", "value": 10 }
```

---

## Supported signals

| Signal name | Typical meaning |
|-------------|----------------|
| `heartRate` | Heart rate normalized 0–1 |
| `gsr` | Galvanic skin response 0–1 |
| `eeg` | EEG attention estimate 0–1 |
| `temperature` | Skin temperature normalized 0–1 |
| `respiration` | Breathing rate 0–1 |
| `motion` | Motion/acceleration 0–1 |
| `pressure` | Pressure sensor 0–1 |
| `proximity` | Proximity sensor 0–1 |
| `custom` | Custom signal 0–1 |

Signals not in this list are ignored for security.

---

## Setup

1. Open **Settings → Advanced → Sensor Bridge**
2. Enter your bridge server's WebSocket address (default: `ws://localhost:8765`)
3. Click **⚡ Connect**

The panel shows "Connected" when the bridge is live.

**Auto-connect:** Enable "Auto-connect on session start" in Settings → Display / HUD to connect automatically whenever you press play.

---

## Stale signal protection

Signals are cleared automatically if they haven't been updated within 5 seconds. This prevents stale readings from incorrectly influencing the session if the bridge disconnects or the sensor stops sending.

---

→ [17 — Profile & Progress](17-profile-progress.md)
