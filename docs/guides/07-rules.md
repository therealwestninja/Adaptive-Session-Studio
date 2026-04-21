# 07 — Rules Engine

Rules make sessions respond to what's happening. When a metric crosses a threshold, something happens — automatically, without the operator needing to do anything.

---

## How rules work

A rule has two parts:

**Condition** — a metric that is checked continuously during playback
**Action** — what happens when the condition becomes true

Rules are checked every tick (roughly 60 times per second). When the condition is met, the action fires.

Each rule also has a **cooldown** — a minimum number of seconds before the same rule can fire again.

---

## Metrics you can use as conditions

| Metric | Range | What it measures |
|--------|-------|-----------------|
| `attention` | 0–1 | Face detected / attention quality from webcam |
| `engagement` | 0–1 | Combined attention + intensity signal |
| `intensity` | 0–2 | Current live intensity setting |
| `speed` | 0.25–4 | Current live speed multiplier |
| `deviceLoad` | 0–1 | Estimated device usage |
| `sessionTime` | 0–∞ | Seconds elapsed |
| `loopCount` | 0–∞ | Number of session loops completed |

---

## Condition operators

| Operator | Meaning |
|----------|---------|
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |
| `==` | Equal (within 0.001 tolerance) |

**Example condition:** `attention < 0.3` → fires when the user's attention drops below 30%

---

## Actions

| Action | What it does |
|--------|-------------|
| **Pause** | Pause playback |
| **Resume** | Resume if paused |
| **Stop** | End the session |
| **Next scene** | Skip to the next scene |
| **Go to scene** | Jump to a specific named scene |
| **Set intensity** | Change the live intensity value |
| **Set speed** | Change the live speed multiplier |
| **Set variable** | Update a session variable |
| **Inject macro** | Fire a haptic macro pattern |
| **Nothing** | Do nothing (useful for trigger success/fail branches) |

---

## Creating a rule

1. Open the **Rules** tab in the inspector
2. Click **+ Add Rule**
3. Choose a metric and operator and value for the condition
4. Choose an action
5. Set the cooldown (default 60 seconds — prevents the rule from spamming)
6. Toggle the rule on (checkbox)

---

## Example rules

### Pause on attention loss
```
Condition: attention < 0.2
Action:    Pause
Cooldown:  30s
```
If the webcam stops seeing the user's face (attention drops below 20%), the session pauses until they return.

### Escalate intensity at peak engagement
```
Condition: engagement >= 0.9
Action:    Set intensity → 1.8
Cooldown:  120s
```
When engagement reaches 90%, boost intensity to 180%. Waits 2 minutes before repeating.

### Redirect drift during conditioning
```
Condition: attention < 0.4
Action:    Go to scene → "Redirect"
Cooldown:  45s
```
If attention drops, jump to a recovery/redirect scene for a reset.

### End-of-session trigger
```
Condition: sessionTime >= 300
Action:    Stop
Cooldown:  999s
```
Force-end the session after 5 minutes regardless of loop count.

---

## Conditioning presets

When you load a Session Mode (see [12 — Session Modes](12-session-modes.md)), a set of pre-built rules is automatically loaded. These are designed for specific use cases and can be used as starting points to build from.

---

## Rule interaction

Rules fire independently of each other. If multiple rules have their conditions met simultaneously, all of them fire in the order they appear in the list.

Use the cooldown to prevent rules from conflicting — a 60-second cooldown on a pause rule means it can only fire once per minute even if attention is consistently low.

---

→ [08 — Trigger Windows](08-triggers.md)
