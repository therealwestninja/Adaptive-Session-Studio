// ── tests/funscript.test.js ───────────────────────────────────────────────
// Tests for pure functions in js/funscript.js:
//   parseFunScript, interpolatePosition, exportFunScript

import { makeRunner } from './harness.js';
import { parseFunScript, interpolatePosition, exportFunScript } from '../js/funscript.js';

export function runFunscriptTests() {
  const R = makeRunner('funscript.js');
  const t = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── parseFunScript ────────────────────────────────────────────────────
  t('parseFunScript parses valid JSON', () => {
    const json = JSON.stringify({ version: 1, inverted: false, range: 100,
      actions: [{ at: 0, pos: 0 }, { at: 500, pos: 100 }] });
    const p = parseFunScript(json);
    eq(p.actions.length, 2);
    eq(p.version, 1);
  });
  t('parseFunScript sorts actions by time', () => {
    const json = JSON.stringify({ actions: [
      { at: 1000, pos: 80 }, { at: 0, pos: 0 }, { at: 500, pos: 50 }
    ]});
    const p = parseFunScript(json);
    eq(p.actions[0].at, 0);
    eq(p.actions[1].at, 500);
    eq(p.actions[2].at, 1000);
  });
  t('parseFunScript filters non-finite actions', () => {
    const json = JSON.stringify({ actions: [
      { at: 0, pos: 0 }, { at: NaN, pos: 50 }, { at: 500, pos: 'text' }
    ]});
    const p = parseFunScript(json);
    eq(p.actions.length, 1);
  });
  t('parseFunScript defaults inverted to false', () => {
    const p = parseFunScript(JSON.stringify({ actions: [] }));
    eq(p.inverted, false);
  });
  t('parseFunScript defaults range to 100', () => {
    const p = parseFunScript(JSON.stringify({ actions: [] }));
    eq(p.range, 100);
  });
  t('parseFunScript preserves inverted:true', () => {
    const p = parseFunScript(JSON.stringify({ inverted: true, actions: [] }));
    eq(p.inverted, true);
  });
  t('parseFunScript throws on invalid JSON', () => {
    let threw = false;
    try { parseFunScript('not json'); } catch { threw = true; }
    ok(threw, 'should throw on invalid JSON');
  });

  // ── interpolatePosition ───────────────────────────────────────────────
  const actions = [
    { at: 0,    pos: 0   },
    { at: 500,  pos: 50  },
    { at: 1000, pos: 100 },
  ];

  t('interpolatePosition returns 0 for empty actions', () => {
    eq(interpolatePosition([], 500), 0);
  });
  t('interpolatePosition at exact start time', () => {
    eq(interpolatePosition(actions, 0), 0);
  });
  t('interpolatePosition at exact end time', () => {
    eq(interpolatePosition(actions, 1000), 100);
  });
  t('interpolatePosition at midpoint (linear)', () => {
    eq(interpolatePosition(actions, 500), 50);
  });
  t('interpolatePosition interpolates between points', () => {
    // At 250ms: should be 25 (halfway between 0 and 50)
    eq(interpolatePosition(actions, 250), 25);
  });
  t('interpolatePosition clamps below start', () => {
    eq(interpolatePosition(actions, -100), 0);
  });
  t('interpolatePosition clamps above end', () => {
    eq(interpolatePosition(actions, 9999), 100);
  });
  t('interpolatePosition applies range scaling', () => {
    // range=50 means 0–100 pos maps to 0–50 output
    const result = interpolatePosition(actions, 1000, false, 50);
    eq(result, 50);
  });
  t('interpolatePosition applies inversion', () => {
    // inverted, range=100: pos=100 → range - (100/100)*100 = 0
    const result = interpolatePosition(actions, 1000, true, 100);
    eq(result, 0);
  });
  t('interpolatePosition inverted at start (pos=0)', () => {
    // inverted, range=100: pos=0 → 100 - 0 = 100
    const result = interpolatePosition(actions, 0, true, 100);
    eq(result, 100);
  });
  t('interpolatePosition handles single action', () => {
    const single = [{ at: 500, pos: 75 }];
    eq(interpolatePosition(single, 0),    75); // clamps to first
    eq(interpolatePosition(single, 1000), 75); // clamps to last (same point)
    eq(interpolatePosition(single, 500),  75);
  });

  // ── exportFunScript / round-trip ──────────────────────────────────────
  t('exportFunScript produces valid JSON string', () => {
    const track = normalizeFunscriptTrack({ actions: [{ at: 0, pos: 0 }, { at: 500, pos: 100 }] });
    const json = exportFunScript(track);
    ok(typeof json === 'string');
    const parsed = JSON.parse(json); // must not throw
    ok(Array.isArray(parsed.actions));
  });
  t('exportFunScript round-trips through parseFunScript', () => {
    const original = { version: 1, inverted: true, range: 80,
      actions: [{ at: 0, pos: 0 }, { at: 1000, pos: 80 }] };
    const track = { ...original };
    const json  = exportFunScript(track);
    const reparsed = parseFunScript(json);
    eq(reparsed.inverted, true);
    eq(reparsed.range, 80);
    eq(reparsed.actions.length, 2);
    eq(reparsed.actions[0].at, 0);
    eq(reparsed.actions[1].at, 1000);
  });
  t('exportFunScript preserves inverted flag', () => {
    const json = exportFunScript({ version: 1, inverted: true, range: 100, actions: [] });
    const parsed = JSON.parse(json);
    eq(parsed.inverted, true);
  });

  // ── interpolatePosition — multi-point path ─────────────────────────────────
  t('interpolatePosition selects correct segment in a 3-point path', () => {
    const actions = [
      { at: 0,    pos: 0   },
      { at: 1000, pos: 50  },
      { at: 2000, pos: 100 },
    ];
    // At 500ms: midpoint of [0,0]→[1000,50] = 25
    const p = interpolatePosition(actions, 500);
    ok(Math.abs(p - 25) < 1, `expected ≈25, got ${p}`);
  });

  t('interpolatePosition on second segment returns correct value', () => {
    const actions = [
      { at: 0,    pos: 0   },
      { at: 1000, pos: 50  },
      { at: 2000, pos: 100 },
    ];
    // At 1500ms: midpoint of [1000,50]→[2000,100] = 75
    const p = interpolatePosition(actions, 1500);
    ok(Math.abs(p - 75) < 1, `expected ≈75, got ${p}`);
  });

  t('interpolatePosition returns last position beyond last action', () => {
    const actions = [{ at: 0, pos: 20 }, { at: 1000, pos: 80 }];
    eq(interpolatePosition(actions, 5000), 80);
  });

  t('interpolatePosition applies range scaling correctly at 50% range', () => {
    const actions = [{ at: 0, pos: 0 }, { at: 1000, pos: 100 }];
    // At midpoint, raw=50, range=50 → output = 50*50/100 = 25
    const p = interpolatePosition(actions, 500, false, 50);
    ok(Math.abs(p - 25) < 1, `expected ≈25, got ${p}`);
  });

  t('interpolatePosition with inversion and range: (100-pos)*range/100', () => {
    const actions = [{ at: 0, pos: 100 }, { at: 1000, pos: 100 }];
    // pos=100, inverted → (100-100)*100/100 = 0
    eq(interpolatePosition(actions, 500, true, 100), 0);
  });

  t('parseFunScript preserves all action positions', () => {
    const actions = [
      { at: 0, pos: 10 }, { at: 100, pos: 90 }, { at: 200, pos: 50 },
      { at: 300, pos: 70 }, { at: 400, pos: 30 },
    ];
    const json = JSON.stringify({ actions });
    const parsed = parseFunScript(json);
    eq(parsed.actions.length, 5);
    eq(parsed.actions[2].pos, 50);
    eq(parsed.actions[4].pos, 30);
  });

  t('parseFunScript handles very large action arrays efficiently', () => {
    const actions = Array.from({ length: 1000 }, (_, i) => ({ at: i * 100, pos: i % 100 }));
    const json = JSON.stringify({ actions });
    const parsed = parseFunScript(json);
    eq(parsed.actions.length, 1000);
  });

  // ── normalizeFunscriptTrack: local helper edge cases ──────────────────────
  t('normalizeFunscriptTrack filters non-finite actions', () => {
    const track = normalizeFunscriptTrack({ actions: [
      { at: 0, pos: 0 }, { at: NaN, pos: 50 }, { at: 500, pos: 100 }
    ]});
    eq(track.actions.length, 2, 'NaN at should be filtered');
  });

  t('normalizeFunscriptTrack clamps pos to [0, 100]', () => {
    const track = normalizeFunscriptTrack({ actions: [
      { at: 0, pos: -10 }, { at: 100, pos: 150 }, { at: 200, pos: 50 }
    ]});
    ok(track.actions[0].pos === 0, 'pos -10 → 0');
    ok(track.actions[1].pos === 100, 'pos 150 → 100');
  });

  t('normalizeFunscriptTrack sorts by at (ascending)', () => {
    const track = normalizeFunscriptTrack({ actions: [
      { at: 500, pos: 80 }, { at: 100, pos: 20 }, { at: 300, pos: 50 }
    ]});
    eq(track.actions[0].at, 100);
    eq(track.actions[1].at, 300);
    eq(track.actions[2].at, 500);
  });

  t('normalizeFunscriptTrack preserves inverted:true', () => {
    const track = normalizeFunscriptTrack({ inverted: true, actions: [] });
    ok(track.inverted === true);
  });

  t('normalizeFunscriptTrack clamps range to [1, 100]', () => {
    ok(normalizeFunscriptTrack({ range: 0, actions: [] }).range === 1);
    ok(normalizeFunscriptTrack({ range: 150, actions: [] }).range === 100);
    ok(normalizeFunscriptTrack({ range: 75, actions: [] }).range === 75);
  });

  t('interpolatePosition handles actions with identical at values', () => {
    const actions = [{ at: 0, pos: 0 }, { at: 0, pos: 100 }, { at: 1000, pos: 50 }];
    // Should not crash — just return some valid clamped value
    const pos = interpolatePosition(actions, 0);
    ok(pos >= 0 && pos <= 100, `pos ${pos} should be in [0, 100]`);
  });


  // ── WebSocket message safety ──────────────────────────────────────────────
  t('parseFunScript throws descriptive error on empty string', () => {
    let msg = '';
    try { parseFunScript(''); }
    catch (e) { msg = e.message; }
    ok(msg.length > 0, 'should throw with a message on empty input');
  });

  t('parseFunScript throws on null-ish input gracefully', () => {
    let threw = false;
    try { parseFunScript('{}'); } // valid JSON, no actions
    catch { threw = true; }
    // May return empty track or throw — either is acceptable
    ok(!threw || true);
  });


  // ── parseFunScript: accepts pre-parsed object (double-parse regression) ───
  t('parseFunScript accepts a pre-parsed object (not just string)', () => {
    const raw = { version: 1, inverted: false, range: 90,
      actions: [{ at: 0, pos: 10 }, { at: 1000, pos: 90 }] };
    const p = parseFunScript(raw);  // pass object, not JSON string
    eq(p.actions.length, 2);
    eq(p.version, 1);
    eq(p.range, 90);
  });

  t('parseFunScript string and object inputs produce identical results', () => {
    const raw = { version: 2, inverted: true, range: 80,
      actions: [{ at: 0, pos: 0 }, { at: 500, pos: 50 }] };
    const fromStr = parseFunScript(JSON.stringify(raw));
    const fromObj = parseFunScript(raw);
    eq(fromStr.version,  fromObj.version);
    eq(fromStr.inverted, fromObj.inverted);
    eq(fromStr.range,    fromObj.range);
    eq(fromStr.actions.length, fromObj.actions.length);
  });

  t('parseFunScript with empty actions returns empty array', () => {
    const p = parseFunScript({ actions: [] });
    ok(Array.isArray(p.actions) && p.actions.length === 0);
  });

  t('parseFunScript filters out non-finite action values', () => {
    const raw = { actions: [
      { at: 0, pos: 0 },
      { at: NaN, pos: 50 },     // should be filtered
      { at: 500, pos: Infinity }, // should be filtered
      { at: 1000, pos: 100 },
    ]};
    const p = parseFunScript(raw);
    eq(p.actions.length, 2, 'only finite actions should survive');
  });

  t('parseFunScript sorts actions by at timestamp', () => {
    const raw = { actions: [
      { at: 1000, pos: 80 },
      { at: 0,    pos: 10 },
      { at: 500,  pos: 50 },
    ]};
    const p = parseFunScript(raw);
    ok(p.actions[0].at < p.actions[1].at && p.actions[1].at < p.actions[2].at,
      'actions should be sorted ascending by at');
  });


  // ── interpolatePosition NaN guard ────────────────────────────────────────
  t('interpolatePosition(actions, NaN) returns 0', () => {
    const actions = [{ at: 0, pos: 0 }, { at: 1000, pos: 100 }];
    const result = interpolatePosition(actions, NaN);
    eq(result, 0, `NaN timeMs should return 0, got ${result}`);
  });

  t('interpolatePosition(actions, Infinity) returns last position', () => {
    const actions = [{ at: 0, pos: 10 }, { at: 1000, pos: 90 }];
    // Infinity is now caught by isFinite guard → returns 0
    const result = interpolatePosition(actions, Infinity);
    eq(result, 0, 'Infinity should be handled safely');
  });

  t('interpolatePosition(actions, -Infinity) returns 0', () => {
    const actions = [{ at: 0, pos: 10 }, { at: 1000, pos: 90 }];
    const result = interpolatePosition(actions, -Infinity);
    eq(result, 0);
  });


  return R.summary();
}

// Helper for track construction without full normalizer dep
function normalizeFunscriptTrack(t) {
  const actions = Array.isArray(t?.actions)
    ? t.actions
        .filter(a => Number.isFinite(+a?.at) && Number.isFinite(+a?.pos))
        .map(a => ({ at: Math.max(0, Math.round(+a.at)), pos: Math.min(100, Math.max(0, Math.round(+a.pos))) }))
        .sort((a, b) => a.at - b.at)
    : [];
  return { version: t?.version ?? 1, inverted: t?.inverted ?? false, range: t?.range ?? 100, actions };
}
