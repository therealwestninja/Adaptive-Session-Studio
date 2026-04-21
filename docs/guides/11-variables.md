# 11 — Variables

Variables let session content change dynamically based on what's happening. Instead of fixed text, you can reference live values.

---

## Built-in variables

These are always available in any block content:

| Variable | Example output | Description |
|----------|---------------|-------------|
| `{{intensity}}` | `85%` | Current intensity as a percentage |
| `{{speed}}` | `1.2×` | Current speed multiplier |
| `{{loop}}` | `2` | Current loop number |
| `{{time}}` | `2:34` | Elapsed session time |
| `{{scene}}` | `Drop` | Current scene name |
| `{{engagement}}` | `72%` | Current engagement score |

---

## User-defined variables

You can create your own variables with fixed or dynamic values.

Open the **Variables** panel in the inspector. Click **+ Add variable**.

| Field | Description |
|-------|-------------|
| Name | The variable name (lowercase, letters/numbers/underscore only) |
| Type | `number`, `string`, or `boolean` |
| Value | Starting value |
| Description | Optional note |

Use the variable in block content as `{{variableName}}`.

---

## Setting variables with rules

The **Set variable** rule action can update a variable's value when a condition is met.

**Example:** Track how many times a correction has been applied.

1. Create a variable: `corrections` (number, starting at 0)
2. Create a rule:
   - Condition: `attention < 0.3`
   - Action: `Set variable corrections = 1` (or use increment logic)
3. In a text block: `"Corrections applied: {{corrections}}"`

---

## Variables in TTS

TTS blocks resolve variables at the moment they're spoken, so the voice says the current live value.

`"Your current intensity is {{intensity}}. Excellent focus."`

At playback time, if intensity is 85%, the voice says: *"Your current intensity is 85%. Excellent focus."*

---

→ [12 — Session Modes](12-session-modes.md)
