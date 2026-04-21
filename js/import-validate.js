// ── import-validate.js ─────────────────────────────────────────────────────
// Shared import-security layer.
// Every user-supplied file or JSON payload passes through here before it
// touches app state, playback, or persistence.
//
// All validators throw a descriptive Error on violation so callers can
// surface a precise message without swallowing or normalising the failure.

// ── Hard budgets ──────────────────────────────────────────────────────────────
export const LIMITS = {
  // Raw JSON / text file sizes (characters / bytes — close enough for ASCII-heavy JSON)
  SESSION_JSON_BYTES:      20_000_000,   // 20 MB raw session JSON text
  FUNSCRIPT_JSON_BYTES:    5_000_000,    //  5 MB FunScript JSON (actions array)
  MACRO_JSON_BYTES:        1_000_000,    //  1 MB macro JSON
  PASTED_JSON_BYTES:       2_000_000,    //  2 MB pasted JSON in settings editor
  VARIABLES:                     100,    // max user-defined variables per session
  CUSTOM_THEMES:                  20,    // max custom theme entries per session
  SUBTITLE_BYTES:           5_000_000,   //  5 MB raw .ass/.ssa text

  // Single imported binary file (before base64 inflation)
  SINGLE_MEDIA_BYTES:     100_000_000,   // 100 MB per audio/video/image file

  // Embedded media within a session JSON (base64 characters ≈ 1.37× file bytes)
  TOTAL_MEDIA_BYTES:      200_000_000,   // 200 MB total embedded media per session

  // Structural item counts
  BLOCKS:                  1_000,
  SCENES:                    200,
  RULES:                     200,
  TRIGGERS:                  200,
  AUDIO_TRACKS:               50,
  VIDEO_TRACKS:               50,
  SUBTITLE_TRACKS:            20,
  FUNSCRIPT_TRACKS:           20,
  MACROS:                    200,

  // Action / event counts
  FUNSCRIPT_ACTIONS:     200_000,        // per FunScript track
  MACRO_ACTIONS:           1_000,        // per macro
  SUBTITLE_EVENTS:        20_000,        // per subtitle track

  // Per-string max (labels, names, content)
  STRING_LEN:             100_000,
};

// ── Session package validator ─────────────────────────────────────────────────
// Call BEFORE normalizeSession(). Pass the raw JSON text and the parsed object.
// textByteCount lets us catch bombs before JSON.parse when the caller knows size.
export function validateImportedSession(raw, textByteCount = 0) {
  if (textByteCount > LIMITS.SESSION_JSON_BYTES) {
    throw new Error(
      `Session file is too large (${_mb(textByteCount)} MB). Max allowed: ${_mb(LIMITS.SESSION_JSON_BYTES)} MB.`
    );
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Session file must be a JSON object (not an array or primitive).');
  }

  // Structural counts
  _checkCount('blocks',           raw.blocks,             LIMITS.BLOCKS);
  _checkCount('scenes',           raw.scenes,             LIMITS.SCENES);
  _checkCount('rules',            raw.rules,              LIMITS.RULES);
  _checkCount('triggers',         raw.triggers,           LIMITS.TRIGGERS);
  _checkCount('audio tracks',     raw.playlists?.audio,   LIMITS.AUDIO_TRACKS);
  _checkCount('video tracks',     raw.playlists?.video,   LIMITS.VIDEO_TRACKS);
  _checkCount('subtitle tracks',  raw.subtitleTracks,     LIMITS.SUBTITLE_TRACKS);
  _checkCount('funscript tracks', raw.funscriptTracks,    LIMITS.FUNSCRIPT_TRACKS);
  _checkCount('macros',           raw.macroLibrary,       LIMITS.MACROS);

  // Per-track action / event counts
  if (Array.isArray(raw.funscriptTracks)) {
    for (const [i, t] of raw.funscriptTracks.entries()) {
      if (Array.isArray(t?.actions) && t.actions.length > LIMITS.FUNSCRIPT_ACTIONS) {
        throw new Error(
          `FunScript track ${i + 1} has ${t.actions.length.toLocaleString()} actions — ` +
          `max allowed is ${LIMITS.FUNSCRIPT_ACTIONS.toLocaleString()}.`
        );
      }
    }
  }

  if (Array.isArray(raw.subtitleTracks)) {
    for (const [i, t] of raw.subtitleTracks.entries()) {
      if (Array.isArray(t?.events) && t.events.length > LIMITS.SUBTITLE_EVENTS) {
        throw new Error(
          `Subtitle track ${i + 1} has ${t.events.length.toLocaleString()} events — ` +
          `max allowed is ${LIMITS.SUBTITLE_EVENTS.toLocaleString()}.`
        );
      }
      if (typeof t?.rawAss === 'string' && t.rawAss.length > LIMITS.SUBTITLE_BYTES) {
        throw new Error(
          `Subtitle track ${i + 1} raw text is too large ` +
          `(${_mb(t.rawAss.length)} MB — max ${_mb(LIMITS.SUBTITLE_BYTES)} MB).`
        );
      }
    }
  }

  // Embedded media size (base64 characters in data: URLs)
  const mediaBytesTotal = _countEmbeddedMediaBytes(raw);
  if (mediaBytesTotal > LIMITS.TOTAL_MEDIA_BYTES) {
    throw new Error(
      `Session contains ${_mb(mediaBytesTotal)} MB of embedded media — ` +
      `max allowed is ${_mb(LIMITS.TOTAL_MEDIA_BYTES)} MB.`
    );
  }

  // Key string-length checks
  _checkStrLen('session name', raw.name);
  const VALID_BLOCK_TYPES = new Set(['text','tts','audio','video','pause','funscript','macro','viz']);
  const VALID_VIZ_TYPES   = new Set(['spiral','pendulum','tunnel','pulse','vortex']);
  if (Array.isArray(raw.blocks)) {
    for (const b of raw.blocks) {
      _checkStrLen('block label',   b?.label);
      _checkStrLen('block content', b?.content);
      // Warn but don't reject unknown block types — normalizer will handle them
      if (b?.type && !VALID_BLOCK_TYPES.has(b.type)) {
        // Silently accept; normalizeBlock will coerce unknown types
      }
      // Validate viz block fields
      if (b?.type === 'viz') {
        if (b.vizType && !VALID_VIZ_TYPES.has(b.vizType)) {
          throw new Error(
            `Block "${b?.label ?? '?'}" has unknown vizType "${b.vizType}". ` +
            `Valid types: ${[...VALID_VIZ_TYPES].join(', ')}.`
          );
        }
        if (Number.isFinite(b.vizSpeed) && (b.vizSpeed < 0.25 || b.vizSpeed > 4)) {
          throw new Error(
            `Block "${b?.label ?? '?'}" vizSpeed ${b.vizSpeed} is out of range (0.25–4).`
          );
        }
      }
    }
  }
  if (Array.isArray(raw.scenes))   raw.scenes.forEach(s  => _checkStrLen('scene name',   s?.name));
  if (Array.isArray(raw.rules))    raw.rules.forEach(r   => _checkStrLen('rule name',    r?.name));
  if (Array.isArray(raw.triggers)) raw.triggers.forEach(t => _checkStrLen('trigger name', t?.name));

  // Object map caps — prevent resource exhaustion via large dynamic maps
  if (raw.variables && typeof raw.variables === 'object' && !Array.isArray(raw.variables)) {
    const varCount = Object.keys(raw.variables).length;
    if (varCount > LIMITS.VARIABLES) {
      throw new Error(
        `Session contains ${varCount} variables — max allowed is ${LIMITS.VARIABLES}.`
      );
    }
  }
  if (raw.customThemes && typeof raw.customThemes === 'object' && !Array.isArray(raw.customThemes)) {
    const themeCount = Object.keys(raw.customThemes).length;
    if (themeCount > LIMITS.CUSTOM_THEMES) {
      throw new Error(
        `Session contains ${themeCount} custom themes — max allowed is ${LIMITS.CUSTOM_THEMES}.`
      );
    }
  }
}

// ── FunScript track file validator ────────────────────────────────────────────
export function validateFunScript(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('FunScript file must be a JSON object.');
  }
  if (!Array.isArray(raw.actions)) {
    throw new Error('FunScript file must contain an "actions" array.');
  }
  if (raw.actions.length > LIMITS.FUNSCRIPT_ACTIONS) {
    throw new Error(
      `FunScript has ${raw.actions.length.toLocaleString()} actions — ` +
      `max allowed is ${LIMITS.FUNSCRIPT_ACTIONS.toLocaleString()}.`
    );
  }
}

// ── Macro file validator ──────────────────────────────────────────────────────
export function validateMacro(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Macro file must be a JSON object.');
  }
  if (!Array.isArray(raw.actions) || raw.actions.length === 0) {
    throw new Error('Macro file must have a non-empty "actions" array.');
  }
  if (raw.actions.length > LIMITS.MACRO_ACTIONS) {
    throw new Error(
      `Macro has ${raw.actions.length.toLocaleString()} actions — ` +
      `max allowed is ${LIMITS.MACRO_ACTIONS.toLocaleString()}.`
    );
  }
}

// ── Subtitle text validator ───────────────────────────────────────────────────
export function validateSubtitleText(text) {
  if (typeof text !== 'string') throw new Error('Subtitle import must be a text file.');
  if (text.length > LIMITS.SUBTITLE_BYTES) {
    throw new Error(
      `Subtitle file is too large (${_mb(text.length)} MB). Max: ${_mb(LIMITS.SUBTITLE_BYTES)} MB.`
    );
  }
}

// ── Media file validator (call BEFORE FileReader.readAsDataURL) ───────────────
export function validateMediaFile(file, kind = 'Media') {
  if (!file) throw new Error('No file provided.');
  if (file.size > LIMITS.SINGLE_MEDIA_BYTES) {
    throw new Error(
      `${kind} file "${file.name}" is too large ` +
      `(${_mb(file.size)} MB). Max allowed: ${_mb(LIMITS.SINGLE_MEDIA_BYTES)} MB.`
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _checkCount(label, arr, max) {
  if (!Array.isArray(arr)) return;
  if (arr.length > max) {
    throw new Error(
      `Too many ${label}: ${arr.length.toLocaleString()} ` +
      `(max ${max.toLocaleString()}).`
    );
  }
}

function _checkStrLen(label, str) {
  if (typeof str === 'string' && str.length > LIMITS.STRING_LEN) {
    throw new Error(
      `${label} is too long (${str.length.toLocaleString()} chars, ` +
      `max ${LIMITS.STRING_LEN.toLocaleString()}).`
    );
  }
}

function _countEmbeddedMediaBytes(raw) {
  let total = 0;
  const add = val => { if (typeof val === 'string' && val.startsWith('data:')) total += val.length; };
  raw.playlists?.audio?.forEach(t => add(t?.dataUrl));
  raw.playlists?.video?.forEach(t => add(t?.dataUrl));
  raw.blocks?.forEach(b => add(b?.dataUrl));
  // macros don't embed media but future-proof the check
  raw.macroLibrary?.forEach(m => add(m?.dataUrl));
  return total;
}

function _mb(bytes) {
  return (bytes / 1_000_000).toFixed(1);
}
