// ── ai-authoring.js ────────────────────────────────────────────────────────
// AI-Assisted Session Authoring — ROADMAP Phase 18
//
// Calls the Anthropic API (claude-sonnet-4-20250514) to generate session
// content (blocks, scenes, rules, ramp settings) from a natural-language
// description. All generated content is normalized before applying.

import { state, persist, normalizeBlock, normalizeScene } from './state.js';
import { notify }    from './notify.js';
import { history }   from './history.js';
import { normalizeRule }         from './rules-engine.js';
import { drawTimeline }          from './funscript.js';
import { renderRampPanel, normalizeRampSettings }   from './intensity-ramp.js';
import { renderPacingPanel, normalizePacingSettings } from './dynamic-pacing.js';

// ── System prompt for session generation ─────────────────────────────────────
const SYSTEM_PROMPT = `You are a session design assistant for Adaptive Session Studio, a browser app for creating adaptive multimedia sessions with attention tracking and behavioral scripting.

You generate session configurations as JSON. The user describes a session experience and you produce structured content.

Respond ONLY with valid JSON — no markdown, no preamble, no explanation. Use this exact schema:

{
  "name": "session name",
  "duration": 180,
  "loopMode": "none",
  "notes": "optional author notes about session intent",
  "variables": {
    "score": { "type": "number", "value": 0, "description": "Optional user-defined runtime variable" }
  },
  "blocks": [
    { "type": "text|tts|audio|pause|macro", "label": "label", "start": 0, "duration": 10, "content": "text or empty", "fontSize": 1.2, "volume": 1, "_position": "center", "macroSlot": null }
  ],
  "scenes": [
    { "name": "Scene name", "start": 0, "end": 60, "loopBehavior": "once", "color": "#5fa0dc", "nextSceneId": null, "stateType": null }
  ],
  "rules": [
    { "name": "rule name", "enabled": true, "condition": { "metric": "attention", "op": "<", "value": 0.4 }, "durationSec": 3, "cooldownSec": 30, "action": { "type": "pause", "param": null } }
  ],
  "rampSettings": {
    "enabled": true, "mode": "time", "startVal": 0.5, "endVal": 1.2, "curve": "sine", "steps": [], "blendMode": "max"
  },
  "pacingSettings": null
}

Rules:
- block types: "text" (overlay text), "tts" (spoken), "audio" (sound file), "pause" (silence), "macro" (trigger slot), "viz" (hypnotic visualization — only for induction/trance sessions)
- viz block fields: vizType ("spiral"|"pendulum"|"tunnel"|"pulse"|"vortex"), vizSpeed (0.25–4, default 1.0), vizColor (hex, default "#c49a3c")
- all block start/duration values are in seconds; no overlapping required
- scenes represent named phases of the session
- scene stateType: null | "calm" | "build" | "peak" | "recovery" — sets an automatic intensity/pacing profile when entered
  - calm: low intensity (50%), slow pace (0.75×) — good for grounding, opening
  - build: moderate intensity (80%), normal pace — transition toward peak
  - peak: high intensity (120%), fast pace (1.25×) — climactic phase
  - recovery: gentle intensity (30%), slow pace (0.6×) — cool-down
- scene nextSceneId: set to another scene's id to branch; null means sequential
- scene colors: calm=#5fa8d3, build=#f0c040, peak=#e05050, recovery=#7dc87a
- text and tts block content supports template variables that update in real time: {{intensity}}, {{speed}}, {{loop}}, {{time}}, {{scene}}, plus any user-defined {{variableName}}
- variables: optional map of named runtime variables (number, string, or boolean). Use them in block content as {{varName}}
- rule metrics: attention, intensity, speed, engagement, sessionTime, loopCount
- rule action types: pause, resume, stop, injectMacro, setIntensity, setSpeed, nextScene, gotoScene, setVar
  - gotoScene param: scene id string
  - setVar param: "variableName=value" string (e.g. "score=10")
- ramp modes: time, engagement, adaptive, step
- ramp curves: linear, exponential, sine
- loopMode: none, count, forever
- keep sessions practical: 60–600 seconds, 3–12 blocks, 0–4 scenes, 0–4 rules
- For mindfulness/grounding: calm→recovery scenes, low ramp (0.2–0.8), engagement mode, gentle TTS
- For induction/trance: slow pacing (0.3–0.65×), sine curve, no pause rules — redirect via speed instead; use viz blocks (spiral or tunnel) interleaved with TTS for visual depth cues
- For behavioral conditioning: adaptive ramp, 3 rules (reward ↑, correct ↓, escalate on peak), setIntensity actions
- For partner/operator-led: linear ramp, pacing disabled, 1 safety pause rule only, operator controls manually
- For solo surrender/escalation: exponential ramp to 1.8–2.0, no automatic rules, peak scene stateType
- content field for "text" and "tts" blocks must be non-empty
- Do not invent file paths for audio blocks — leave content empty
- Omit rampSettings or pacingSettings if not relevant (set to null)
- Only include variables if they are actually used in block content or rule setVar actions
- Use notes field to record session design intent (not shown during playback)`;

// ── API key management ────────────────────────────────────────────────────────
// Stored in IndexedDB under key 'ass-anthropic-api-key'.
// IDB persists across browser sessions (unlike sessionStorage which cleared on tab close).
//
// ⚠ SECURITY NOTICE — browser-side key storage:
// The API key is retrievable by any JavaScript running on the same origin.
// If an XSS or script-injection vulnerability lands in this app, a malicious
// script could read the key from IDB and exfiltrate it.
//
// This is an accepted trade-off for a local, single-user, offline-first app.
// Mitigations already in place:
//   - All user-supplied HTML strings are run through esc() before innerHTML
//   - File imports are size-capped and structure-validated before any parsing
//   - Content-Security-Policy (if set by the server) limits script sources
//
// For maximum security: run a local proxy server that holds the key server-side
// and never exposes it to page JS. The key never leaves the device in any case —
// it is only used in fetch() calls from this origin to api.anthropic.com.
const AI_KEY_STORAGE = 'ass-anthropic-api-key';
import { idbGet, idbSet, idbDel } from './idb-storage.js';

// In-memory cache so synchronous hasApiKey() / getApiKey() work
let _cachedKey = '';
// Eagerly load from IDB on module init
idbGet(AI_KEY_STORAGE).then(v => { if (v) _cachedKey = v; })
  // Migrate from old sessionStorage if present
  .then(() => {
    if (!_cachedKey) {
      const legacy = sessionStorage.getItem(AI_KEY_STORAGE);
      if (legacy) { _cachedKey = legacy; idbSet(AI_KEY_STORAGE, legacy); sessionStorage.removeItem(AI_KEY_STORAGE); }
    }
  }).catch(() => {});

export function getApiKey()  { return _cachedKey; }
export async function setApiKey(key) {
  if (!key) {
    _cachedKey = '';
    await idbDel(AI_KEY_STORAGE);
    return;
  }
  if (typeof key !== 'string' || !key.startsWith('sk-ant-')) {
    throw new Error('Invalid Anthropic API key format — must start with "sk-ant-"');
  }
  _cachedKey = key;
  await idbSet(AI_KEY_STORAGE, key);
}
export function hasApiKey()  { return !!_cachedKey; }

// ── Generate session from prompt ──────────────────────────────────────────────
export async function generateSession(prompt, opts = {}) {
  const { onProgress } = opts;
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('No API key. Enter your Anthropic API key in the AI Generator panel.');
  }

  onProgress?.('Connecting to Claude…');

  let responseText = '';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'x-api-key':               apiKey,
        'anthropic-version':       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `HTTP ${response.status}`);
    }

    const data = await response.json();
    responseText = data.content?.filter(c => c.type === 'text').map(c => c.text).join('') ?? '';

    if (!responseText.trim()) throw new Error('Claude returned an empty response. Try rephrasing your prompt.');

    onProgress?.('Parsing response…');

    const parsed = _extractJson(responseText);
    return parsed;

  } catch (err) {
    // Re-throw with context if we have partial response text
    if (err instanceof SyntaxError || err.message.startsWith('Could not extract')) {
      throw new Error(`AI returned unparseable content. Raw: ${responseText.slice(0, 300)}`);
    }
    throw err;
  }
}

// ── JSON extraction with multiple fallback strategies ─────────────────────────
// Claude should return pure JSON per the system prompt, but may occasionally
// wrap it in markdown fences or add a brief preamble sentence.
function _extractJson(text) {
  // Strategy 1: try parsing the full string as-is (ideal case)
  try { return JSON.parse(text.trim()); } catch {}

  // Strategy 2: strip a single code-fence block (```json ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch {}
  }

  // Strategy 3: bracket-balanced object extraction
  // Walk from the first '{' counting depth to find the matching '}'
  const objStart = text.indexOf('{');
  if (objStart !== -1) {
    let depth = 0, inStr = false, escape = false;
    for (let i = objStart; i < text.length; i++) {
      const ch = text[i];
      if (escape)      { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"')  { inStr = !inStr; continue; }
      if (inStr)       continue;
      if (ch === '{')  depth++;
      if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(objStart, i + 1)); } catch {} break; } }
    }
  }

  // Strategy 4: bracket-balanced array extraction
  const arrStart = text.indexOf('[');
  if (arrStart !== -1) {
    let depth = 0, inStr = false, escape = false;
    for (let i = arrStart; i < text.length; i++) {
      const ch = text[i];
      if (escape)      { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"')  { inStr = !inStr; continue; }
      if (inStr)       continue;
      if (ch === '[')  depth++;
      if (ch === ']') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(arrStart, i + 1)); } catch {} break; } }
    }
  }

  throw new Error('Could not extract valid JSON from response.');
}

// ── Apply generated session content ──────────────────────────────────────────
export function applyGeneratedContent(generated, mode = 'merge') {
  history.push();
  const s = state.session;

  if (generated.name)     s.name     = String(generated.name).slice(0, 120);
  if (generated.duration) s.duration = Math.max(10, Math.round(generated.duration));
  // Allowlist loopMode — an unrecognised value would silently fall through to 'forever'
  // in computeTotalLoops(), causing an unintended infinite session.
  if (['none','count','minutes','forever'].includes(generated.loopMode)) {
    s.loopMode = generated.loopMode;
  }
  if (typeof generated.notes === 'string') s.notes = generated.notes.slice(0, 10_000);

  // In replace mode, clear all content-bearing fields first so omitted keys mean "empty",
  // not "keep whatever was there". This makes "Replace" actually mean replace.
  if (mode === 'replace') {
    s.blocks    = [];
    s.scenes    = [];
    s.rules     = [];
    s.triggers  = [];
    s.variables = {};
  }

  // Variables: merge on top of existing (merge mode) or onto cleared map (replace mode)
  if (generated.variables && typeof generated.variables === 'object' && !Array.isArray(generated.variables)) {
    if (!s.variables) s.variables = {};
    const varNameRe = /^[a-z_][a-z0-9_]{0,31}$/;
    for (const [name, def] of Object.entries(generated.variables)) {
      if (!varNameRe.test(name)) continue;
      const type = ['number', 'string', 'boolean'].includes(def?.type) ? def.type : 'number';
      const coerce = v => type === 'number' ? (Number(v) || 0) : type === 'boolean' ? Boolean(v) : String(v ?? '');
      s.variables[name] = { type, value: coerce(def?.value ?? 0), description: String(def?.description ?? '').slice(0, 120) };
    }
  }

  if (Array.isArray(generated.blocks)) {
    const newBlocks = generated.blocks.map((b, i) => normalizeBlock(b, i));
    s.blocks = mode === 'replace' ? newBlocks : [...s.blocks, ...newBlocks];
  }

  if (Array.isArray(generated.scenes)) {
    const newScenes = generated.scenes.map(sc => normalizeScene(sc));
    s.scenes = mode === 'replace' ? newScenes : [...s.scenes, ...newScenes];
  }

  if (Array.isArray(generated.rules)) {
    const newRules = generated.rules.map(r => normalizeRule(r));
    s.rules = mode === 'replace' ? newRules : [...(s.rules ?? []), ...newRules];
  }

  // Use 'in' check so null intentionally clears settings (#3)
  // Normalize before assigning so malformed AI output can't corrupt state (#8)
  if ('rampSettings' in generated) {
    s.rampSettings = generated.rampSettings
      ? normalizeRampSettings(generated.rampSettings)
      : null;
  }
  if ('pacingSettings' in generated) {
    s.pacingSettings = generated.pacingSettings
      ? normalizePacingSettings(generated.pacingSettings)
      : null;
  }

  persist();
}

// ── AI Authoring panel renderer ───────────────────────────────────────────────
export function renderAiAuthoringPanel(containerId = 'aiAuthoringPanel') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const hasKey   = hasApiKey();
  const maskedKey = hasKey ? '••••••••' + getApiKey().slice(-4) : '';

  el.innerHTML = `
    <div class="insp-group-label" style="margin-bottom:6px">✦ AI Session Generator</div>

    <!-- API key section -->
    <div style="margin-bottom:10px;background:var(--surface2);border:1px solid var(--border);
      border-radius:var(--r);padding:8px 10px;">
      <div style="font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;
        color:var(--text3);margin-bottom:6px">Anthropic API Key</div>
      ${hasKey
        ? `<div style="display:flex;align-items:center;gap:6px">
             <span style="font:11px var(--mono);color:var(--c-green);flex:1">${maskedKey} ✓</span>
             <button id="ai_clearKey" style="font-size:10px;padding:2px 7px;color:var(--danger)">Remove</button>
           </div>`
        : `<div style="display:flex;gap:5px">
             <input type="password" id="ai_keyInput" placeholder="sk-ant-…"
               style="flex:1;font-size:11px;font-family:var(--mono)" autocomplete="off" spellcheck="false"/>
             <button id="ai_saveKey" class="btn-accent" style="font-size:11px;padding:4px 8px;white-space:nowrap">Save</button>
           </div>
           <div style="font-size:10px;color:var(--text3);margin-top:5px;line-height:1.5">
             Key stored in IndexedDB on this device — never sent anywhere except Anthropic's API.
             <strong style="color:rgba(240,160,74,0.8)">⚠ Browser-local:</strong>
             any script running on this page can read IDB. Keep this app on a trusted local server.
           </div>`
      }
    </div>

    ${hasKey ? `
    <p style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:8px">
      Describe the session and Claude will generate blocks, scenes, rules, and variables.
    </p>
    <textarea id="ai_prompt" rows="5" placeholder="e.g. A 6-minute guided induction: settling scene with slow breathing cues, drop scene with numbered countdown text, depth scene with a silence pause, and a gentle return. Use calm→build→peak→recovery state types."
      style="width:100%;font-size:11px;resize:vertical;margin-bottom:8px"></textarea>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;flex:1">
        <input type="radio" name="ai_mode" value="merge" checked /> Add to session
      </label>
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;flex:1">
        <input type="radio" name="ai_mode" value="replace" /> Replace generated content
      </label>
    </div>
    <button id="ai_generateBtn" style="width:100%;font-size:11px;
      background:rgba(200,164,255,0.12);border:1px solid rgba(200,164,255,0.35);
      border-radius:var(--r);padding:7px;color:#c8a4ff;cursor:pointer;font-family:var(--font)">
      ✦ Generate with Claude
    </button>
    <div id="ai_status" style="font-size:10.5px;color:var(--text3);margin-top:6px;min-height:16px"></div>
    ` : `
    <p style="font-size:11px;color:var(--text3);text-align:center;padding:8px 0">
      Enter your API key above to enable AI session generation.
    </p>`}`;

  // ── API key controls ──
  el.querySelector('#ai_saveKey')?.addEventListener('click', async () => {
    const keyVal = el.querySelector('#ai_keyInput')?.value?.trim();
    if (!keyVal.startsWith('sk-ant-')) {
      notify.warn('API key should start with "sk-ant-"'); return;
    }
    await setApiKey(keyVal);
    renderAiAuthoringPanel(containerId);
    notify.success('API key saved — persists across sessions.');
  });

  el.querySelector('#ai_clearKey')?.addEventListener('click', async () => {
    await setApiKey('');
    renderAiAuthoringPanel(containerId);
  });

  // Allow Enter to save key
  el.querySelector('#ai_keyInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') el.querySelector('#ai_saveKey')?.click();
  });

  if (!hasKey) return;

  // ── Generation controls ──
  const statusEl = el.querySelector('#ai_status');
  const btn      = el.querySelector('#ai_generateBtn');

  btn?.addEventListener('click', async () => {
    const prompt = el.querySelector('#ai_prompt')?.value?.trim();
    const mode   = el.querySelector('input[name="ai_mode"]:checked')?.value ?? 'merge';

    if (!prompt) { notify.warn('Enter a description first.'); return; }

    btn.disabled    = true;
    btn.textContent = '⏳ Generating…';
    statusEl.textContent = '';

    try {
      const generated = await generateSession(prompt, {
        onProgress: msg => { statusEl.textContent = msg; },
      });

      applyGeneratedContent(generated, mode);

      import('./ui.js').then(({ renderSidebar, renderInspector, syncTransportControls }) => {
        renderSidebar(); renderInspector(); syncTransportControls();
      }).catch(() => {});
      drawTimeline();
      renderRampPanel('rampPanel');
      renderPacingPanel('pacingPanel');

      const blockCount = generated.blocks?.length ?? 0;
      const ruleCount  = generated.rules?.length ?? 0;
      const sceneCount = generated.scenes?.length ?? 0;
      const varCount   = Object.keys(generated.variables ?? {}).length;
      const varNote    = varCount > 0 ? `, ${varCount} variable${varCount !== 1 ? 's' : ''}` : '';
      statusEl.textContent = `✓ Added ${blockCount} block${blockCount !== 1 ? 's' : ''}, ${sceneCount} scene${sceneCount !== 1 ? 's' : ''}, ${ruleCount} rule${ruleCount !== 1 ? 's' : ''}${varNote}.`;
      notify.success('Session generated successfully!');

    } catch (err) {
      statusEl.textContent = `✗ ${err.message}`;
      notify.error(`Generation failed: ${err.message}`);
    } finally {
      btn.disabled    = false;
      btn.textContent = '✦ Generate with Claude';
    }
  });
}
