# 18 — AI Authoring

The AI tab lets you describe a session in plain text and have Claude generate the structure for you — blocks, scenes, rules, and variables — which you can then customize.

---

## Setup

You need an Anthropic API key:

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an account
2. Create an API key under "API Keys"
3. In Adaptive Session Studio, open the **AI** tab in the inspector
4. Paste your key in the API key field and click **Save**

The key is stored in your browser's local storage. It never leaves your device except in API calls to Anthropic.

> **Security note:** The key is stored in IndexedDB, which is accessible to any JavaScript running on the same page. Keep the app on a trusted local server.

---

## Writing a good prompt

Be specific about:
- **Duration** — "a 4-minute session" or "about 3 minutes"
- **Structure** — "three scenes: calm, build, peak"
- **Tone** — "firm and directive" / "soft and guiding" / "clinical"
- **Features** — "include TTS narration" / "use a spiral visualization in the opening"
- **Purpose** — "induction for someone new" / "conditioning for focus"

**Example prompt:**
```
A 5-minute conditioning session for someone who has done a few sessions before.
Start with a gentle 1-minute settling scene with TTS narration.
A 3-minute training scene with rules: pause if attention drops below 0.3,
increase intensity if engagement exceeds 0.8.
End with a 1-minute grounding scene. Use calm → build → recovery scene types.
Keep the tone firm but supportive.
```

---

## Merge vs Replace

**Add to session (merge):** Generated content is added to what you already have. Existing blocks, scenes, and rules are kept.

**Replace generated content:** All blocks, scenes, rules, variables, and triggers are cleared before applying the generated content. Start fresh from Claude's output.

---

## After generation

The generated session is a starting point. Review and adjust:

- Check block timing — Claude estimates reasonable values but exact milliseconds may need tweaking
- Read all TTS content — verify the voice and tone match your intent
- Check rules — conditions and cooldowns may need tuning for your use case
- Add FunScript tracks manually — Claude can't generate haptic patterns

---

## Costs

AI generation uses the Claude API, which charges per token. A typical session generation costs approximately $0.01–0.05 USD depending on complexity. Anthropic's pricing is on their website.

---

→ [19 — Import & Export](19-import-export.md)
