# 08 — Trigger Windows

Trigger windows are timed challenges. At a specific moment in the session, a window opens and waits to see if a condition is met. If yes → one thing happens. If no → another thing happens.

---

## Anatomy of a trigger

| Field | Description |
|-------|-------------|
| **At (seconds)** | When the window opens |
| **Window duration** | How long to wait (seconds) |
| **Condition** | The metric + operator + value to check |
| **Success action** | What happens if condition is met within the window |
| **Failure action** | What happens if the window closes without the condition being met |
| **Cooldown** | Minimum seconds before this trigger can fire again |

---

## How it works

1. Session reaches the trigger's `atSec` time
2. The window opens and starts counting down
3. The condition is continuously checked
4. If the condition is met before the window closes → success action fires
5. If the window closes without the condition being met → failure action fires

---

## Example: Attention challenge

```
At:             90 seconds
Window:         15 seconds
Condition:      attention >= 0.8
Success action: Set intensity → 1.5  (reward sustained focus)
Failure action: Go to scene → "Reset" (redirect on failure)
```

At 1:30 into the session, a 15-second window opens. If the user maintains 80%+ attention for any moment during those 15 seconds, intensity boosts as a reward. If not, they're redirected to a reset scene.

---

## Using triggers for structure

Triggers are most powerful for creating conditional session paths:

- **Escalation gates:** Only move to the next phase if the user demonstrates readiness
- **Check-ins:** Periodically verify sustained engagement, reward or redirect
- **Loop exits:** Allow a looping scene to continue until a condition is satisfied

---

## Trigger vs Rule

| | Rule | Trigger |
|-|------|---------|
| **When** | Fires whenever condition is true | Opens once at a specific time |
| **Duration** | Continuous monitoring | Fixed window |
| **Branching** | Single action | Success + failure paths |
| **Use for** | Ongoing adaptation | Specific challenge moments |

---

→ [09 — FunScript & Haptics](09-funscript.md)
