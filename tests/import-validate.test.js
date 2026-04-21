// ── tests/import-validate.test.js ────────────────────────────────────────
// Tests for the import-validate.js security layer.
// Covers all validators: session, FunScript, macro, subtitle, media file.

import { makeRunner } from './harness.js';
import {
  LIMITS,
  validateImportedSession,
  validateFunScript,
  validateMacro,
  validateSubtitleText,
  validateMediaFile,
} from '../js/import-validate.js';

export function runImportValidateTests() {
  const R  = makeRunner('import-validate.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function throws(fn, label) {
    try { fn(); ok(false, `${label}: expected throw but did not`); }
    catch { ok(true); }
  }
  function noThrow(fn, label) {
    try { fn(); ok(true); }
    catch (e) { ok(false, `${label}: unexpected throw: ${e.message}`); }
  }

  // ── LIMITS shape ───────────────────────────────────────────────────────
  t('LIMITS exports expected budget keys', () => {
    ok(typeof LIMITS.SESSION_JSON_BYTES === 'number');
    ok(typeof LIMITS.SINGLE_MEDIA_BYTES === 'number');
    ok(typeof LIMITS.FUNSCRIPT_ACTIONS  === 'number');
    ok(typeof LIMITS.MACRO_ACTIONS      === 'number');
    ok(typeof LIMITS.SUBTITLE_EVENTS    === 'number');
    ok(typeof LIMITS.BLOCKS             === 'number');
  });

  // ── validateImportedSession ────────────────────────────────────────────
  t('validateImportedSession accepts a minimal valid session object', () => {
    noThrow(() => validateImportedSession({ name: 'test' }), 'minimal session');
  });

  t('validateImportedSession rejects null', () => {
    throws(() => validateImportedSession(null), 'null');
  });

  t('validateImportedSession rejects an array', () => {
    throws(() => validateImportedSession([]), 'array root');
  });

  t('validateImportedSession rejects oversized JSON text', () => {
    throws(
      () => validateImportedSession({}, LIMITS.SESSION_JSON_BYTES + 1),
      'oversized text'
    );
  });

  t('validateImportedSession rejects too many blocks', () => {
    const raw = { blocks: Array.from({ length: LIMITS.BLOCKS + 1 }, () => ({})) };
    throws(() => validateImportedSession(raw), 'block count exceeded');
  });

  t('validateImportedSession accepts exactly max blocks', () => {
    const raw = { blocks: Array.from({ length: LIMITS.BLOCKS }, () => ({})) };
    noThrow(() => validateImportedSession(raw), 'exact block limit');
  });

  t('validateImportedSession rejects too many rules', () => {
    const raw = { rules: Array.from({ length: LIMITS.RULES + 1 }, () => ({})) };
    throws(() => validateImportedSession(raw), 'rule count exceeded');
  });

  t('validateImportedSession rejects too many scenes', () => {
    const raw = { scenes: Array.from({ length: LIMITS.SCENES + 1 }, () => ({})) };
    throws(() => validateImportedSession(raw), 'scene count exceeded');
  });

  t('validateImportedSession rejects too many triggers', () => {
    const raw = { triggers: Array.from({ length: LIMITS.TRIGGERS + 1 }, () => ({})) };
    throws(() => validateImportedSession(raw), 'trigger count exceeded');
  });

  t('validateImportedSession rejects oversized FunScript track action count', () => {
    const raw = {
      funscriptTracks: [{
        actions: Array.from({ length: LIMITS.FUNSCRIPT_ACTIONS + 1 }, (_, i) => ({ at: i, pos: 50 }))
      }]
    };
    throws(() => validateImportedSession(raw), 'funscript actions exceeded');
  });

  t('validateImportedSession rejects oversized subtitle event count', () => {
    const raw = {
      subtitleTracks: [{
        events: Array.from({ length: LIMITS.SUBTITLE_EVENTS + 1 }, () => ({}))
      }]
    };
    throws(() => validateImportedSession(raw), 'subtitle events exceeded');
  });

  t('validateImportedSession rejects oversized rawAss text', () => {
    const raw = {
      subtitleTracks: [{ rawAss: 'x'.repeat(LIMITS.SUBTITLE_BYTES + 1), events: [] }]
    };
    throws(() => validateImportedSession(raw), 'rawAss size exceeded');
  });

  t('validateImportedSession rejects oversized embedded audio data URL', () => {
    const raw = {
      playlists: {
        audio: [{ dataUrl: 'data:audio/mp3;base64,' + 'A'.repeat(LIMITS.TOTAL_MEDIA_BYTES + 1) }],
        video: []
      }
    };
    throws(() => validateImportedSession(raw), 'embedded audio media exceeded');
  });

  t('validateImportedSession rejects oversized block label string', () => {
    const raw = { blocks: [{ label: 'x'.repeat(LIMITS.STRING_LEN + 1), content: '' }] };
    throws(() => validateImportedSession(raw), 'block label too long');
  });

  t('validateImportedSession accepts session with no playlists key', () => {
    noThrow(() => validateImportedSession({ name: 'ok', blocks: [] }), 'no playlists key');
  });

  // ── validateFunScript ─────────────────────────────────────────────────
  t('validateFunScript accepts valid FunScript', () => {
    noThrow(() => validateFunScript({ version: 1, actions: [{ at: 0, pos: 0 }] }), 'valid FS');
  });

  t('validateFunScript rejects null', () => {
    throws(() => validateFunScript(null), 'null');
  });

  t('validateFunScript rejects missing actions array', () => {
    throws(() => validateFunScript({ version: 1 }), 'no actions');
  });

  t('validateFunScript rejects actions count exceeding limit', () => {
    const raw = { actions: Array.from({ length: LIMITS.FUNSCRIPT_ACTIONS + 1 }, () => ({})) };
    throws(() => validateFunScript(raw), 'action count exceeded');
  });

  t('validateFunScript accepts exactly max actions', () => {
    const raw = { actions: Array.from({ length: LIMITS.FUNSCRIPT_ACTIONS }, () => ({ at: 0, pos: 0 })) };
    noThrow(() => validateFunScript(raw), 'exact action limit');
  });

  // ── validateMacro ─────────────────────────────────────────────────────
  t('validateMacro accepts valid macro', () => {
    noThrow(() => validateMacro({ actions: [{ at: 0, pos: 0 }, { at: 500, pos: 100 }] }), 'valid macro');
  });

  t('validateMacro rejects empty actions array', () => {
    throws(() => validateMacro({ actions: [] }), 'empty actions');
  });

  t('validateMacro rejects missing actions', () => {
    throws(() => validateMacro({}), 'missing actions');
  });

  t('validateMacro rejects actions count exceeding limit', () => {
    const raw = { actions: Array.from({ length: LIMITS.MACRO_ACTIONS + 1 }, () => ({})) };
    throws(() => validateMacro(raw), 'macro action count exceeded');
  });

  t('validateMacro accepts exactly max actions', () => {
    const raw = { actions: Array.from({ length: LIMITS.MACRO_ACTIONS }, () => ({ at: 0, pos: 0 })) };
    noThrow(() => validateMacro(raw), 'exact macro action limit');
  });

  // ── validateSubtitleText ──────────────────────────────────────────────
  t('validateSubtitleText accepts normal subtitle text', () => {
    noThrow(() => validateSubtitleText('[Script Info]\nTitle: Test\n'), 'normal subtitle');
  });

  t('validateSubtitleText rejects non-string input', () => {
    throws(() => validateSubtitleText(123), 'non-string');
  });

  t('validateSubtitleText rejects oversized text', () => {
    throws(() => validateSubtitleText('x'.repeat(LIMITS.SUBTITLE_BYTES + 1)), 'oversized');
  });

  t('validateSubtitleText accepts exactly max bytes', () => {
    noThrow(() => validateSubtitleText('x'.repeat(LIMITS.SUBTITLE_BYTES)), 'exact limit');
  });

  // ── validateMediaFile ─────────────────────────────────────────────────
  t('validateMediaFile accepts a file within size limit', () => {
    const mockFile = { name: 'audio.mp3', size: 1_000_000 }; // 1 MB
    noThrow(() => validateMediaFile(mockFile, 'Audio'), 'small file');
  });

  t('validateMediaFile rejects a file over the size limit', () => {
    const mockFile = { name: 'huge.mp4', size: LIMITS.SINGLE_MEDIA_BYTES + 1 };
    throws(() => validateMediaFile(mockFile, 'Video'), 'oversized file');
  });

  t('validateMediaFile accepts exactly max size', () => {
    const mockFile = { name: 'max.mp3', size: LIMITS.SINGLE_MEDIA_BYTES };
    noThrow(() => validateMediaFile(mockFile, 'Audio'), 'exact limit');
  });

  t('validateMediaFile rejects null file', () => {
    throws(() => validateMediaFile(null), 'null file');
  });

  // ── String length boundary checks ──────────────────────────────────────────
  t('validateImportedSession rejects oversized session name', () => {
    throws(() => validateImportedSession({ name: 'x'.repeat(300) }), 'oversized name');
  });

  t('validateImportedSession rejects oversized scene name', () => {
    throws(() => validateImportedSession({ scenes: [{ name: 'n'.repeat(300) }] }), 'oversized scene name');
  });

  t('validateImportedSession rejects oversized rule name', () => {
    throws(() => validateImportedSession({ rules: [{ name: 'r'.repeat(300) }] }), 'oversized rule name');
  });

  t('validateImportedSession rejects oversized trigger name', () => {
    throws(() => validateImportedSession({ triggers: [{ name: 't'.repeat(300) }] }), 'oversized trigger name');
  });

  t('validateImportedSession accepts sessions with variables field', () => {
    noThrow(() => validateImportedSession({ variables: { score: { type: 'number', value: 0 } } }), 'variables field');
  });

  t('validateImportedSession accepts sessions with empty variables', () => {
    noThrow(() => validateImportedSession({ variables: {} }), 'empty variables');
  });

  t('validateFunScript rejects an array input', () => {
    throws(() => validateFunScript([{ at: 0, pos: 0 }]), 'array input');
  });

  // ── Viz block validation ──────────────────────────────────────────────────
  t('validateImportedSession accepts viz block with valid vizType', () => {
    const s = { name: 'test', blocks: [{ type: 'viz', label: 'Spiral', start: 0, duration: 30, vizType: 'spiral', vizSpeed: 1, vizColor: '#fff' }] };
    ok(validateImportedSession(s) === undefined, 'valid viz block should not throw');
  });

  t('validateImportedSession rejects viz block with invalid vizType', () => {
    const s = { name: 'test', blocks: [{ type: 'viz', label: 'Bad', start: 0, duration: 30, vizType: 'rainbow', vizSpeed: 1, vizColor: '#fff' }] };
    throws(() => validateImportedSession(s), 'invalid vizType should throw');
  });

  t('validateImportedSession rejects viz block with out-of-range vizSpeed', () => {
    const s = { name: 'test', blocks: [{ type: 'viz', label: 'Fast', start: 0, duration: 30, vizType: 'spiral', vizSpeed: 99, vizColor: '#fff' }] };
    throws(() => validateImportedSession(s), 'out-of-range vizSpeed should throw');
  });

  t('validateImportedSession accepts all 5 valid viz types', () => {
    for (const vt of ['spiral','pendulum','tunnel','pulse','vortex']) {
      const s = { name: 'test', blocks: [{ type: 'viz', label: vt, start: 0, duration: 10, vizType: vt, vizSpeed: 1.0, vizColor: '#000' }] };
      ok(validateImportedSession(s) === undefined, `vizType "${vt}" should be valid`);
    }
  });

  t('validateImportedSession accepts unknown block type silently', () => {
    // Unknown types are allowed through (normalizeBlock handles them)
    const s = { name: 'test', blocks: [{ type: 'future_block_type', label: 'New', start: 0, duration: 10 }] };
    ok(validateImportedSession(s) === undefined, 'unknown block type should not throw');
  });


  // ── Pre-parse size guard ──────────────────────────────────────────────────
  t('validateImportedSession rejects raw text over 20MB', () => {
    // textByteCount is the pre-parse check
    throws(() => validateImportedSession({ name: 'test' }, 21_000_001),
      'oversized file should throw');
  });

  t('validateImportedSession accepts text right at 20MB limit', () => {
    noThrow(() => validateImportedSession({ name: 'test' }, 20_000_000),
      'exactly at limit should not throw');
  });


  // ── validateImportedSession: structure checks ─────────────────────────────
  t('validateImportedSession rejects null', () => {
    let threw = false;
    try { validateImportedSession(null, 100); } catch { threw = true; }
    ok(threw, 'null should be rejected');
  });

  t('validateImportedSession rejects array', () => {
    let threw = false;
    try { validateImportedSession([], 100); } catch { threw = true; }
    ok(threw, 'array should be rejected');
  });

  t('validateImportedSession accepts session with minimal required fields', () => {
    let threw = false;
    try {
      validateImportedSession({ duration: 60, blocks: [], name: 'Test' }, 100);
    } catch { threw = true; }
    ok(!threw, 'minimal valid session should not throw');
  });

  t('validateImportedSession rejects oversized payload', () => {
    let threw = false;
    try {
      validateImportedSession({ duration: 60, blocks: [], name: 'x' }, 25_000_001);
    } catch { threw = true; }
    ok(threw, 'payload over 20MB should be rejected');
  });

  t('validateImportedSession rejects session with too many blocks', () => {
    const blocks = Array.from({ length: 5001 }, (_, i) => ({ type:'text', label:`b${i}` }));
    let threw = false;
    try { validateImportedSession({ duration:60, blocks, name:'big' }, 1000); } catch { threw = true; }
    ok(threw, 'too many blocks should be rejected');
  });

  // ── validateFunScript: structure checks ──────────────────────────────────
  t('validateFunScript accepts minimal valid structure', () => {
    let threw = false;
    try { validateFunScript({ actions: [] }); } catch { threw = true; }
    ok(!threw, 'empty actions array should be valid');
  });

  t('validateFunScript rejects null', () => {
    let threw = false;
    try { validateFunScript(null); } catch { threw = true; }
    ok(threw, 'null should be rejected');
  });

  t('validateFunScript rejects too many actions', () => {
    const actions = Array.from({ length: 100_001 }, (_, i) => ({ at: i, pos: 50 }));
    let threw = false;
    try { validateFunScript({ actions }); } catch { threw = true; }
    ok(threw, 'too many actions should be rejected');
  });


  // ── PATCH.md issue 3: dedicated size limits ───────────────────────────────
  t('LIMITS.FUNSCRIPT_JSON_BYTES exists and is <= SESSION_JSON_BYTES', () => {
    ok('FUNSCRIPT_JSON_BYTES' in LIMITS,
      'FUNSCRIPT_JSON_BYTES must exist for pre-read FunScript guard');
    ok(LIMITS.FUNSCRIPT_JSON_BYTES <= LIMITS.SESSION_JSON_BYTES,
      'FunScript limit should be ≤ session limit');
    ok(LIMITS.FUNSCRIPT_JSON_BYTES > 0, 'must be positive');
  });

  t('LIMITS.MACRO_JSON_BYTES exists and is smaller than FUNSCRIPT_JSON_BYTES', () => {
    ok('MACRO_JSON_BYTES' in LIMITS,
      'MACRO_JSON_BYTES must exist for pre-read macro guard');
    ok(LIMITS.MACRO_JSON_BYTES <= LIMITS.FUNSCRIPT_JSON_BYTES,
      'Macro limit should be ≤ FunScript limit (macros are smaller)');
    ok(LIMITS.MACRO_JSON_BYTES > 0, 'must be positive');
  });

  t('LIMITS.PASTED_JSON_BYTES exists and is reasonable', () => {
    ok('PASTED_JSON_BYTES' in LIMITS,
      'PASTED_JSON_BYTES must exist for settings-editor paste guard');
    ok(LIMITS.PASTED_JSON_BYTES >= 100_000, 'should allow at least 100KB of pasted JSON');
    ok(LIMITS.PASTED_JSON_BYTES <= 10_000_000, 'should be well under 10MB');
  });

  t('LIMITS ordering: MACRO <= PASTED <= FUNSCRIPT <= SESSION <= MEDIA', () => {
    ok(LIMITS.MACRO_JSON_BYTES    <= LIMITS.PASTED_JSON_BYTES,   'macro ≤ pasted');
    ok(LIMITS.PASTED_JSON_BYTES   <= LIMITS.FUNSCRIPT_JSON_BYTES,'pasted ≤ funscript');
    ok(LIMITS.FUNSCRIPT_JSON_BYTES <= LIMITS.SESSION_JSON_BYTES, 'funscript ≤ session');
    ok(LIMITS.SESSION_JSON_BYTES  <= LIMITS.SINGLE_MEDIA_BYTES,  'session ≤ media');
  });

  t('validateImportedSession throws for payload over SESSION_JSON_BYTES', () => {
    let threw = false;
    try {
      validateImportedSession({ duration:60, blocks:[], name:'x' },
                              LIMITS.SESSION_JSON_BYTES + 1);
    } catch { threw = true; }
    ok(threw, 'oversized payload should be rejected by validateImportedSession');
  });


  // ── PATCH v61 issue 8: variables and customThemes caps ───────────────────
  t('validateImportedSession rejects session with > LIMITS.VARIABLES variables', () => {
    const variables = {};
    for (let i = 0; i <= LIMITS.VARIABLES; i++) variables[`var_${i}`] = { type:'number', value:0 };
    let threw = false;
    try { validateImportedSession({ duration:60, blocks:[], name:'x', variables }, 100); }
    catch { threw = true; }
    ok(threw, `should reject more than ${LIMITS.VARIABLES} variables`);
  });

  t('validateImportedSession accepts session at exactly LIMITS.VARIABLES', () => {
    const variables = {};
    for (let i = 0; i < LIMITS.VARIABLES; i++) variables[`v${i}`] = { type:'number', value:0 };
    let threw = false;
    try { validateImportedSession({ duration:60, blocks:[], name:'x', variables }, 100); }
    catch { threw = true; }
    ok(!threw, `should accept exactly ${LIMITS.VARIABLES} variables`);
  });

  t('validateImportedSession rejects session with > LIMITS.CUSTOM_THEMES custom themes', () => {
    const customThemes = {};
    for (let i = 0; i <= LIMITS.CUSTOM_THEMES; i++) {
      customThemes[`theme${i}`] = {
        name:'t', backgroundColor:'#000000', accentColor:'#ffffff', textColor:'#888888'
      };
    }
    let threw = false;
    try { validateImportedSession({ duration:60, blocks:[], name:'x', customThemes }, 100); }
    catch { threw = true; }
    ok(threw, `should reject more than ${LIMITS.CUSTOM_THEMES} custom themes`);
  });

  t('LIMITS.VARIABLES and LIMITS.CUSTOM_THEMES are positive integers', () => {
    ok(Number.isInteger(LIMITS.VARIABLES) && LIMITS.VARIABLES > 0);
    ok(Number.isInteger(LIMITS.CUSTOM_THEMES) && LIMITS.CUSTOM_THEMES > 0);
  });

  // ── PATCH v61 issue 5: subtitle pre-read guard ────────────────────────────
  t('LIMITS.SUBTITLE_BYTES is 5MB (not the 100MB media limit)', () => {
    eq(LIMITS.SUBTITLE_BYTES, 5_000_000,
      'subtitle limit must be 5MB to guard pre-read');
    ok(LIMITS.SUBTITLE_BYTES < LIMITS.SINGLE_MEDIA_BYTES,
      'subtitle limit must be less than generic media limit');
  });


  return R.summary();
}
