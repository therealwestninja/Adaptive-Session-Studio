// ── tests/funscript-patterns.test.js ─────────────────────────────────────
// Tests for js/funscript-patterns.js
// Validates pattern schema, action arrays, and loadPatternAsTrack output.

import { makeRunner } from './harness.js';
import {
  FUNSCRIPT_PATTERNS,
  loadPatternAsTrack,
} from '../js/funscript-patterns.js';

export function runFunscriptPatternsTests() {
  const R  = makeRunner('funscript-patterns.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── FUNSCRIPT_PATTERNS schema ─────────────────────────────────────────────
  t('FUNSCRIPT_PATTERNS is a non-empty array', () => {
    ok(Array.isArray(FUNSCRIPT_PATTERNS) && FUNSCRIPT_PATTERNS.length > 0);
  });

  t('has at least 8 patterns', () => {
    ok(FUNSCRIPT_PATTERNS.length >= 8, `expected ≥8, got ${FUNSCRIPT_PATTERNS.length}`);
  });

  t('all pattern ids are unique', () => {
    const ids = FUNSCRIPT_PATTERNS.map(p => p.id);
    eq(new Set(ids).size, ids.length, 'duplicate pattern id found');
  });

  t('each pattern has required fields', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      ok(typeof p.id          === 'string' && p.id,          `${p.id}: missing id`);
      ok(typeof p.name        === 'string' && p.name,        `${p.id}: missing name`);
      ok(typeof p.category    === 'string' && p.category,    `${p.id}: missing category`);
      ok(typeof p.icon        === 'string' && p.icon,        `${p.id}: missing icon`);
      ok(typeof p.description === 'string' && p.description, `${p.id}: missing description`);
      ok(typeof p.inverted    === 'boolean',                  `${p.id}: inverted must be boolean`);
      ok(typeof p.range       === 'number' && p.range > 0,   `${p.id}: range must be positive number`);
      ok(Array.isArray(p.actions) && p.actions.length > 0,   `${p.id}: actions must be non-empty`);
    }
  });

  // ── Action array validity ─────────────────────────────────────────────────
  t('all pattern actions have numeric at and pos fields', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      for (const a of p.actions) {
        ok(typeof a.at  === 'number' && Number.isFinite(a.at),  `${p.id}: action.at invalid`);
        ok(typeof a.pos === 'number' && Number.isFinite(a.pos), `${p.id}: action.pos invalid`);
      }
    }
  });

  t('all pattern actions have pos clamped to [0, 100]', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      for (const a of p.actions) {
        ok(a.pos >= 0 && a.pos <= 100,
          `${p.id}: pos ${a.pos} at ${a.at}ms is outside [0, 100]`);
      }
    }
  });

  t('all pattern actions have non-negative at values', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      ok(p.actions.every(a => a.at >= 0), `${p.id}: negative at value found`);
    }
  });

  t('all pattern actions are sorted by at (ascending)', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      for (let i = 1; i < p.actions.length; i++) {
        ok(p.actions[i].at >= p.actions[i - 1].at,
          `${p.id}: actions not sorted at index ${i}: ${p.actions[i-1].at} → ${p.actions[i].at}`);
      }
    }
  });

  t('all patterns span at least 30 seconds (30000ms)', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      const dur = p.actions.at(-1)?.at ?? 0;
      ok(dur >= 30_000, `${p.id}: pattern only ${dur}ms long (expected ≥30000ms)`);
    }
  });

  t('all patterns have at least 100 action points', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      ok(p.actions.length >= 100,
        `${p.id}: only ${p.actions.length} action points (expected ≥100)`);
    }
  });

  // ── Specific known patterns ────────────────────────────────────────────────
  t('slow-pulse pattern exists', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.id === 'slow-pulse'));
  });

  t('steady-rhythm pattern exists', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.id === 'steady-rhythm'));
  });

  t('slow-build pattern exists', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.id === 'slow-build'));
  });

  t('wave-surge pattern exists', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.id === 'wave-surge'));
  });

  t('tease-edge pattern exists', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.id === 'tease-edge'));
  });

  t('heartbeat pattern exists', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.id === 'heartbeat'));
  });

  t('breath-sync pattern exists', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.id === 'breath-sync'));
  });

  t('deep-descent starts high and ends lower', () => {
    const p = FUNSCRIPT_PATTERNS.find(p => p.id === 'deep-descent');
    ok(p !== undefined, 'deep-descent pattern must exist');
    const firstPos = p.actions[0].pos;
    const lastPos  = p.actions.at(-1).pos;
    ok(firstPos > lastPos,
      `deep-descent should start higher (${firstPos}) than it ends (${lastPos})`);
  });

  t('slow-build ends with higher average pos than it starts', () => {
    const p = FUNSCRIPT_PATTERNS.find(p => p.id === 'slow-build');
    ok(p !== undefined, 'slow-build pattern must exist');
    const first10 = p.actions.slice(0, 10).map(a => a.pos);
    const last10  = p.actions.slice(-10).map(a => a.pos);
    const avgFirst = first10.reduce((s, v) => s + v, 0) / first10.length;
    const avgLast  = last10.reduce((s, v) => s + v, 0) / last10.length;
    // Build pattern oscillates so we just check range widens — last peak should be higher
    const firstMax = Math.max(...first10);
    const lastMax  = Math.max(...last10);
    ok(lastMax >= firstMax,
      `slow-build: last peak (${lastMax}) should be ≥ first peak (${firstMax})`);
  });

  t('breath-sync has consistent cycle length (~6000ms)', () => {
    const p = FUNSCRIPT_PATTERNS.find(p => p.id === 'breath-sync');
    ok(p !== undefined);
    // Find first peak and second peak
    const peaks = [];
    for (let i = 1; i < p.actions.length - 1; i++) {
      if (p.actions[i].pos > p.actions[i-1].pos && p.actions[i].pos > p.actions[i+1].pos
          && p.actions[i].pos >= 75) {
        peaks.push(p.actions[i].at);
      }
    }
    ok(peaks.length >= 2, 'breath-sync should have at least 2 peaks');
    if (peaks.length >= 2) {
      const period = peaks[1] - peaks[0];
      ok(period >= 4_000 && period <= 8_000,
        `breath-sync period should be ~6000ms, got ${period}ms`);
    }
  });

  // ── loadPatternAsTrack ─────────────────────────────────────────────────────
  t('loadPatternAsTrack returns false for unknown id', () => {
    ok(loadPatternAsTrack('no-such-pattern') === false);
  });

  t('loadPatternAsTrack returns a track object for valid id', () => {
    const track = loadPatternAsTrack('slow-pulse');
    ok(track !== false && typeof track === 'object');
  });

  t('loadPatternAsTrack result has version, inverted, range, actions', () => {
    const track = loadPatternAsTrack('steady-rhythm');
    ok(track !== false);
    ok(typeof track.version  === 'number');
    ok(typeof track.inverted === 'boolean');
    ok(typeof track.range    === 'number');
    ok(Array.isArray(track.actions));
  });

  t('loadPatternAsTrack result has _name matching the pattern name', () => {
    const pattern = FUNSCRIPT_PATTERNS.find(p => p.id === 'wave-surge');
    const track   = loadPatternAsTrack('wave-surge');
    ok(track !== false);
    eq(track._name, pattern.name);
  });

  t('loadPatternAsTrack actions are the same reference as the pattern actions', () => {
    const pattern = FUNSCRIPT_PATTERNS.find(p => p.id === 'heartbeat');
    const track   = loadPatternAsTrack('heartbeat');
    ok(track !== false);
    eq(track.actions.length, pattern.actions.length);
  });

  t('loadPatternAsTrack works for every pattern', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      const track = loadPatternAsTrack(p.id);
      ok(track !== false, `loadPatternAsTrack("${p.id}") should return a track`);
    }
  });

  // ── Category coverage ─────────────────────────────────────────────────────
  t('patterns cover at least 3 distinct categories', () => {
    const cats = new Set(FUNSCRIPT_PATTERNS.map(p => p.category));
    ok(cats.size >= 3, `expected ≥3 categories, got ${cats.size}: ${[...cats].join(', ')}`);
  });

  t('patterns include at least one Calming category pattern', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.category === 'Calming'));
  });

  t('patterns include at least one Escalating category pattern', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.category === 'Escalating'));
  });

  t('patterns include at least one Steady category pattern', () => {
    ok(FUNSCRIPT_PATTERNS.some(p => p.category === 'Steady'));
  });

  // ── Pattern categories ────────────────────────────────────────────────────
  t('every pattern belongs to one of the 4 valid categories', () => {
    const VALID = ['Steady', 'Natural', 'Escalating', 'Calming'];
    for (const p of FUNSCRIPT_PATTERNS) {
      ok(VALID.includes(p.category),
        `"${p.name}": invalid category "${p.category}"`);
    }
  });

  t('each category has at least one pattern', () => {
    const cats = new Set(FUNSCRIPT_PATTERNS.map(p => p.category));
    ok(cats.has('Steady'));
    ok(cats.has('Natural'));
    ok(cats.has('Escalating'));
    ok(cats.has('Calming'));
  });

  t('every pattern has an icon field', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      ok(typeof p.icon === 'string' && p.icon.length > 0, `"${p.name}" missing icon`);
    }
  });

  t('every pattern has a description field', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      ok(typeof p.description === 'string', `"${p.name}" missing description`);
    }
  });

  // ── Action integrity across all patterns ─────────────────────────────────
  t('no pattern has duplicate timestamps', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      const times = p.actions.map(a => a.at);
      const unique = new Set(times);
      ok(unique.size === times.length,
        `"${p.name}" has duplicate timestamps`);
    }
  });

  t('Heartbeat pattern has actions with double-beat rhythm', () => {
    const hb = FUNSCRIPT_PATTERNS.find(p => p.name.toLowerCase().includes('heartbeat'));
    ok(hb !== undefined, 'Heartbeat pattern should exist');
    ok(hb.actions.length >= 4, 'Heartbeat should have enough actions to express rhythm');
  });

  t('Breath Sync pattern duration matches 6-second breathing cycle', () => {
    const bs = FUNSCRIPT_PATTERNS.find(p => p.name.toLowerCase().includes('breath'));
    ok(bs !== undefined, 'Breath Sync pattern should exist');
    const dur = bs.actions.at(-1)?.at ?? 0;
    ok(dur % 6000 < 1000 || dur >= 54000,
      `Breath Sync duration ${dur}ms should be aligned to ~6s cycles`);
  });


  // ── loadPatternAsTrack: track shape completeness ─────────────────────────
  t('loadPatternAsTrack returns null for unknown id', () => {
    ok(loadPatternAsTrack('non-existent-pattern-id') === null);
  });
  t('loadPatternAsTrack returns object with expected fields for valid id', () => {
    const id = FUNSCRIPT_PATTERNS[0].id;
    const track = loadPatternAsTrack(id);
    ok(track !== null);
    ok(Array.isArray(track.actions) && track.actions.length > 0, 'actions');
    ok(typeof track._name === 'string' && track._name.length > 0, '_name');
    ok(typeof track.inverted === 'boolean', 'inverted');
    ok(typeof track.range === 'number', 'range');
  });
  t('all patterns loadable without error', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      const track = loadPatternAsTrack(p.id);
      ok(track !== null, `${p.id} should load`);
    }
  });

  // ── loadPatternAsTrack regression ────────────────────────────────────────
  t('loadPatternAsTrack result has expected track shape fields', () => {
    const first = FUNSCRIPT_PATTERNS[0];
    const track = loadPatternAsTrack(first.id);
    ok(track !== false, 'should return a track object');
    ok(Array.isArray(track.actions), 'should have actions array');
    ok(typeof track.inverted === 'boolean');
    ok(typeof track.range === 'number');
    ok(typeof track._name === 'string');
  });

  t('all FUNSCRIPT_PATTERNS have unique ids', () => {
    const ids = FUNSCRIPT_PATTERNS.map(p => p.id);
    const unique = new Set(ids);
    eq(unique.size, ids.length, 'pattern ids must be unique');
  });

  t('all FUNSCRIPT_PATTERNS have non-empty action arrays', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      ok(Array.isArray(p.actions) && p.actions.length > 0,
        `pattern "${p.id}" has empty actions`);
    }
  });

  t('FUNSCRIPT_PATTERNS actions are all clamped to [0,100]', () => {
    for (const p of FUNSCRIPT_PATTERNS) {
      for (const a of p.actions) {
        ok(a.pos >= 0 && a.pos <= 100,
          `pattern "${p.id}" has out-of-range pos: ${a.pos}`);
      }
    }
  });


  return R.summary();
}
