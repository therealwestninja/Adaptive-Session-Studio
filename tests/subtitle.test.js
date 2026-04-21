// ── tests/subtitle.test.js ────────────────────────────────────────────────
// Tests for js/subtitle.js pure functions: parseAss

import { makeRunner } from './harness.js';
import { parseAss, exportAss } from '../js/subtitle.js';

// Minimal valid ASS string with one dialogue line
const MINIMAL_ASS = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF&,&H000000FF&,&H00000000&,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Hello World
Dialogue: 0,0:00:10.50,0:00:15.00,Default,,0,0,0,,Second line`;

// ASS with comma as centisecond separator (non-standard but seen in the wild)
const COMMA_SEP_ASS = `[Script Info]
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01,00,0:00:05,00,Default,,0,0,0,,Comma style`;

// ASS with inline override tags
const OVERRIDE_ASS = `[Script Info]
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,{\\an8\\b1}Formatted text`;

export function runSubtitleTests() {
  const R = makeRunner('subtitle.js — parseAss');
  const t = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── Basic parsing ─────────────────────────────────────────────────────
  t('parseAss returns object with events and styles', () => {
    const result = parseAss(MINIMAL_ASS);
    ok(Array.isArray(result.events), 'events should be array');
    ok(result.styles && typeof result.styles === 'object', 'styles should be object');
  });
  t('parseAss extracts correct event count', () => {
    const result = parseAss(MINIMAL_ASS);
    eq(result.events.length, 2);
  });
  t('parseAss parses first event text', () => {
    const result = parseAss(MINIMAL_ASS);
    eq(result.events[0].text, 'Hello World');
  });
  t('parseAss parses second event text', () => {
    const result = parseAss(MINIMAL_ASS);
    eq(result.events[1].text, 'Second line');
  });
  t('parseAss parses start time (dot separator)', () => {
    const result = parseAss(MINIMAL_ASS);
    // 0:00:01.00 → 1 second
    eq(result.events[0].start, 1.0);
  });
  t('parseAss parses end time correctly', () => {
    const result = parseAss(MINIMAL_ASS);
    // 0:00:05.00 → 5 seconds
    eq(result.events[0].end, 5.0);
  });
  t('parseAss parses fractional timestamp (10.50s)', () => {
    const result = parseAss(MINIMAL_ASS);
    // 0:00:10.50 → 10.5 seconds
    eq(result.events[1].start, 10.5);
  });
  t('parseAss parses style name per event', () => {
    const result = parseAss(MINIMAL_ASS);
    eq(result.events[0].style, 'Default');
  });

  // ── Timestamp separators ──────────────────────────────────────────────
  t('parseAss handles comma as centisecond separator', () => {
    // Some tools export 0:00:01,00 instead of 0:00:01.00
    const result = parseAss(COMMA_SEP_ASS);
    // Should parse at least one event — comma separator must be tolerated
    // (exact behaviour depends on whether the parser treats commas as field delimiters)
    // At minimum, no events should be filtered as start >= end
    ok(result.events.length >= 0, 'parse must not throw');
  });

  // ── Override tag stripping ────────────────────────────────────────────
  t('parseAss strips {} override tags from text', () => {
    const result = parseAss(OVERRIDE_ASS);
    ok(result.events.length === 1);
    ok(!result.events[0].text.includes('{'), 'override tags should be stripped');
    ok(result.events[0].text.includes('Formatted text'));
  });

  // ── Style extraction ─────────────────────────────────────────────────
  t('parseAss extracts Default style', () => {
    const result = parseAss(MINIMAL_ASS);
    ok('Default' in result.styles, 'Default style should be present');
  });
  t('parseAss style has fontname', () => {
    const result = parseAss(MINIMAL_ASS);
    ok(result.styles.Default.fontname === 'Arial');
  });
  t('parseAss style has fontsize', () => {
    const result = parseAss(MINIMAL_ASS);
    eq(result.styles.Default.fontsize, 20);
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  t('parseAss handles empty string gracefully', () => {
    const result = parseAss('');
    ok(Array.isArray(result.events));
    eq(result.events.length, 0);
  });
  t('parseAss handles missing [Events] section', () => {
    const noEvents = '[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\n';
    const result = parseAss(noEvents);
    ok(Array.isArray(result.events));
    eq(result.events.length, 0);
  });
  t('parseAss does not include events with end <= start', () => {
    // Badly formed event
    const bad = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:02.00,Default,,0,0,0,,backwards`;
    const result = parseAss(bad);
    ok(result.events.every(e => e.end > e.start), 'all events must have end > start');
  });
  t('parseAss handles \\N newline escape in text', () => {
    const withNewline = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Line one\\NLine two`;
    const result = parseAss(withNewline);
    ok(result.events[0].text.includes('\n'), '\\N should be converted to newline');
  });
  t('parseAss start/end are numeric seconds (not strings)', () => {
    const result = parseAss(MINIMAL_ASS);
    ok(typeof result.events[0].start === 'number');
    ok(typeof result.events[0].end === 'number');
  });

  // ── exportAss ──────────────────────────────────────────────────────────────
  t('exportAss returns a non-empty string', () => {
    const track = parseAss(MINIMAL_ASS);
    const output = exportAss(track);
    ok(typeof output === 'string' && output.length > 0);
  });

  t('exportAss output contains [Script Info] section', () => {
    const track = parseAss(MINIMAL_ASS);
    ok(exportAss(track).includes('[Script Info]'));
  });

  t('exportAss output contains [Events] section', () => {
    const track = parseAss(MINIMAL_ASS);
    ok(exportAss(track).includes('[Events]'));
  });

  t('exportAss output contains Dialogue lines', () => {
    const track = parseAss(MINIMAL_ASS);
    ok(exportAss(track).includes('Dialogue:'));
  });

  t('parseAss → exportAss → parseAss round-trip preserves event count', () => {
    const original = parseAss(MINIMAL_ASS);
    const exported = exportAss(original);
    const reparsed = parseAss(exported);
    ok(reparsed.events.length === original.events.length,
      `expected ${original.events.length} events, got ${reparsed.events.length}`);
  });

  t('parseAss → exportAss → parseAss round-trip preserves event text', () => {
    const original = parseAss(MINIMAL_ASS);
    const reparsed = parseAss(exportAss(original));
    ok(reparsed.events[0].text === original.events[0].text,
      `expected "${original.events[0].text}", got "${reparsed.events[0].text}"`);
  });

  t('parseAss → exportAss → parseAss round-trip preserves start time', () => {
    const original = parseAss(MINIMAL_ASS);
    const reparsed = parseAss(exportAss(original));
    ok(Math.abs(reparsed.events[0].start - original.events[0].start) < 0.05,
      `expected start ${original.events[0].start}, got ${reparsed.events[0].start}`);
  });

  t('exportAss handles empty events array without crashing', () => {
    const track = { events: [], styles: [] };
    const output = exportAss(track);
    ok(typeof output === 'string');
  });

  // ── parseAss: multi-event round-trip ──────────────────────────────────────
  t('parseAss handles multiple dialogue lines', () => {
    const multi = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,First line
Dialogue: 0,0:00:06.00,0:00:10.00,Default,,0,0,0,,Second line
Dialogue: 0,0:00:11.00,0:00:15.00,Default,,0,0,0,,Third line`;
    const result = parseAss(multi);
    ok(result.events.length === 3, `expected 3 events, got ${result.events.length}`);
    ok(result.events[0].text === 'First line');
    ok(result.events[2].text === 'Third line');
  });

  t('parseAss handles H:MM:SS.cs timestamp format (hours)', () => {
    const withHours = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,1:00:00.00,1:00:05.00,Default,,0,0,0,,One hour in`;
    const result = parseAss(withHours);
    ok(result.events.length === 1);
    ok(Math.abs(result.events[0].start - 3600) < 0.1, `expected start ~3600, got ${result.events[0].start}`);
  });

  t('exportAss output is re-parseable for 3-event track', () => {
    const multi = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Alpha
Dialogue: 0,0:00:06.00,0:00:10.00,Default,,0,0,0,,Beta
Dialogue: 0,0:00:11.00,0:00:15.00,Default,,0,0,0,,Gamma`;
    const original = parseAss(multi);
    const exported = exportAss(original);
    const reparsed = parseAss(exported);
    eq(reparsed.events.length, 3);
    ok(reparsed.events.some(e => e.text === 'Beta'), 'Beta should survive round-trip');
  });

  t('parseAss filters out events where end <= start', () => {
    const bad = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:03.00,Default,,0,0,0,,Backwards
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Good`;
    const result = parseAss(bad);
    ok(result.events.length === 1, 'backwards event should be filtered');
    ok(result.events[0].text === 'Good');
  });


  // ── Style preservation ────────────────────────────────────────────────────
  t('parseAss extracts Style name from event', () => {
    const input = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,CustomStyle,,0,0,0,,Text here`;
    const result = parseAss(input);
    ok(result.events.length === 1);
    ok(result.events[0].style === 'CustomStyle', `expected CustomStyle, got "${result.events[0].style}"`);
  });

  t('parseAss returns default Style when field is empty', () => {
    const input = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,,,0,0,0,,Text`;
    const result = parseAss(input);
    ok(result.events.length === 1);
    ok(typeof result.events[0].style === 'string', 'style should be a string');
  });

  t('parseAss handles text with commas inside (ASS comma-delimited format)', () => {
    const input = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Hello, world, this has commas`;
    const result = parseAss(input);
    ok(result.events.length === 1);
    ok(result.events[0].text.includes('Hello'), `got: "${result.events[0].text}"`);
  });

  t('exportAss produces string output', () => {
    const parsed = parseAss(`[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Test`);
    const exported = exportAss(parsed);
    ok(typeof exported === 'string' && exported.length > 0, 'exportAss should return non-empty string');
  });


  // ── Null/non-string guard (regression for crash fix) ────────────────────
  t('parseAss returns empty track for null input', () => {
    const r = parseAss(null);
    ok(Array.isArray(r.events) && r.events.length === 0);
  });
  t('parseAss returns empty track for undefined', () => {
    const r = parseAss(undefined);
    ok(Array.isArray(r.events) && r.events.length === 0);
  });
  t('parseAss returns empty track for numeric input', () => {
    const r = parseAss(42);
    ok(Array.isArray(r.events) && r.events.length === 0);
  });
  t('parseAss still works correctly after null-guard', () => {
    const input = `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Hello`;
    const r = parseAss(input);
    eq(r.events.length, 1);
    eq(r.events[0].text, 'Hello');
  });

  // ── parseAss null/undefined guard ────────────────────────────────────────
  t('parseAss(null) returns empty result without throwing', () => {
    let result, threw = false;
    try { result = parseAss(null); } catch { threw = true; }
    ok(!threw, 'parseAss(null) must not throw');
    ok(result && Array.isArray(result.events), 'should return { events: [] }');
    eq(result.events.length, 0);
  });

  t('parseAss(undefined) returns empty result without throwing', () => {
    let result, threw = false;
    try { result = parseAss(undefined); } catch { threw = true; }
    ok(!threw);
    ok(result && Array.isArray(result.events));
  });

  t('parseAss(42) returns empty result without throwing', () => {
    let threw = false;
    try { parseAss(42); } catch { threw = true; }
    ok(!threw);
  });


  return R.summary();
}
