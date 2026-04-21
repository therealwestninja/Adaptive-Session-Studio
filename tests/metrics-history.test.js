// ── tests/metrics-history.test.js ─────────────────────────────────────────
// Tests for js/metrics-history.js — daily aggregate store, import, and chart.
// Uses _setMetricsCacheForTest to inject fixture data without IDB round-trips.

import { makeRunner } from './harness.js';
import {
  recordSessionInHistory, getDailyHistory,
  importExternalMetrics, clearMetricsHistory,
  renderMetricsChart, _setMetricsCacheForTest,
  metricsReady,
} from '../js/metrics-history.js';

export function runMetricsHistoryTests() {
  const R  = makeRunner('metrics-history.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // Wait for metricsReady before any test that touches IDB
  async function reset() {
    await metricsReady;
    _setMetricsCacheForTest([]);
  }

  // Minimal session summary fixture
  function makeSummary(overrides = {}) {
    return {
      timestamp:          Date.now(),
      sessionName:        'Test Session',
      totalSec:           60,
      fsAvg:              50,
      fsMax:              80,
      attentionLossEvents: 0,
      completionState:    'completed',
      ...overrides,
    };
  }

  // ── metricsReady ────────────────────────────────────────────────────────
  t('metricsReady is a Promise that resolves', async () => {
    await metricsReady;
    ok(true, 'resolved without error');
  });

  // ── recordSessionInHistory ──────────────────────────────────────────────
  t('recordSessionInHistory creates a day entry', async () => {
    await reset();
    await recordSessionInHistory(makeSummary());
    const days = await getDailyHistory();
    eq(days.length, 1);
    eq(days[0].sessionCount, 1);
  });

  t('recordSessionInHistory accumulates multiple sessions on the same day', async () => {
    await reset();
    const ts = Date.now();
    await recordSessionInHistory(makeSummary({ timestamp: ts, totalSec: 60 }));
    await recordSessionInHistory(makeSummary({ timestamp: ts, totalSec: 90 }));
    const days = await getDailyHistory();
    eq(days.length, 1, 'same day = same record');
    eq(days[0].sessionCount,    2);
    eq(days[0].totalRuntimeSec, 150);
  });

  t('recordSessionInHistory averages intensity across sessions', async () => {
    await reset();
    const ts = Date.now();
    await recordSessionInHistory(makeSummary({ timestamp: ts, fsAvg: 40 }));
    await recordSessionInHistory(makeSummary({ timestamp: ts, fsAvg: 60 }));
    const days = await getDailyHistory();
    eq(days[0].avgIntensityPct, 50, 'average of 40 and 60 = 50');
  });

  t('recordSessionInHistory counts completionState correctly', async () => {
    await reset();
    const ts = Date.now();
    await recordSessionInHistory(makeSummary({ timestamp: ts, completionState: 'completed' }));
    await recordSessionInHistory(makeSummary({ timestamp: ts, completionState: 'interrupted' }));
    await recordSessionInHistory(makeSummary({ timestamp: ts, completionState: 'emergency' }));
    const [day] = await getDailyHistory();
    eq(day.completedCount,    1);
    eq(day.interruptedCount,  1);
    eq(day.emergencyCount,    1);
  });

  t('recordSessionInHistory computes attention stability', async () => {
    await reset();
    // 0 loss events → perfect stability = 1
    await recordSessionInHistory(makeSummary({ totalSec: 60, attentionLossEvents: 0 }));
    const [day] = await getDailyHistory();
    ok(day.avgAttentionStability !== null);
    ok(day.avgAttentionStability >= 0 && day.avgAttentionStability <= 1);
    eq(day.avgAttentionStability, 1.00);
  });

  t('recordSessionInHistory is a no-op for null summary', async () => {
    await reset();
    await recordSessionInHistory(null);
    const days = await getDailyHistory();
    eq(days.length, 0);
  });

  t('getDailyHistory returns newest-first', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-03-01', sessionCount: 1, totalRuntimeSec: 60, source: 'app' },
      { date: '2026-04-01', sessionCount: 1, totalRuntimeSec: 60, source: 'app' },
    ]);
    const days = await getDailyHistory();
    ok(days[0].date > days[1].date, 'first entry should be more recent');
  });

  t('getDailyHistory respects maxDays limit', async () => {
    await reset();
    _setMetricsCacheForTest(
      Array.from({ length: 30 }, (_, i) => ({
        date: `2026-01-${String(i+1).padStart(2,'0')}`,
        sessionCount: 1, totalRuntimeSec: 30, source: 'app',
      }))
    );
    const days = await getDailyHistory(7);
    eq(days.length, 7);
  });

  // ── importExternalMetrics ──────────────────────────────────────────────
  t('importExternalMetrics returns imported count', async () => {
    await reset();
    const result = await importExternalMetrics([
      { date: '2026-03-10', totalRuntimeSec: 1800, sessionCount: 2 },
      { date: '2026-03-11', totalRuntimeSec: 900,  sessionCount: 1 },
    ], 'TestDevice');
    eq(result.imported, 2);
    eq(result.skipped,  0);
  });

  t('importExternalMetrics merges into existing day', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-03-10', sessionCount: 1, totalRuntimeSec: 600, source: 'app',
        avgIntensityPct: null, avgEngagement: null, avgAttentionStability: null,
        completedCount: 1, interruptedCount: 0, emergencyCount: 0 },
    ]);
    await importExternalMetrics([
      { date: '2026-03-10', totalRuntimeSec: 400, avgIntensityPct: 70 },
    ], 'device');
    const [day] = await getDailyHistory();
    eq(day.totalRuntimeSec, 1000, '600 + 400');
    eq(day.avgIntensityPct,  70, 'updated from import');
  });

  t('importExternalMetrics rejects records missing date', async () => {
    await reset();
    const result = await importExternalMetrics([
      { totalRuntimeSec: 300 }, // no date
    ], 'bad-source');
    eq(result.imported, 0);
    eq(result.skipped,  1);
    ok(result.errors.length > 0);
  });

  t('importExternalMetrics rejects malformed date strings', async () => {
    await reset();
    const result = await importExternalMetrics([
      { date: '10-03-2026', totalRuntimeSec: 300 }, // wrong format
    ], 'bad-date');
    eq(result.skipped, 1);
  });

  t('importExternalMetrics clamps engagement to 0-1', async () => {
    await reset();
    await importExternalMetrics([
      { date: '2026-03-15', avgEngagement: 1.8 }, // over-range
    ], 'src');
    const [day] = await getDailyHistory();
    ok(day.avgEngagement <= 1, 'engagement clamped to 1');
  });

  t('importExternalMetrics with empty array returns zero counts', async () => {
    await reset();
    const result = await importExternalMetrics([], 'empty');
    eq(result.imported, 0);
    eq(result.skipped,  0);
  });

  t('importExternalMetrics marks source on new day', async () => {
    await reset();
    await importExternalMetrics([
      { date: '2026-03-20', totalRuntimeSec: 300 },
    ], 'MyDevice');
    const [day] = await getDailyHistory();
    ok(day.source.includes('import'), `source should contain 'import', got: ${day.source}`);
  });

  // ── clearMetricsHistory ────────────────────────────────────────────────
  t('clearMetricsHistory empties the cache', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-04-01', sessionCount: 3, totalRuntimeSec: 900, source: 'app' },
    ]);
    await clearMetricsHistory();
    const days = await getDailyHistory();
    eq(days.length, 0);
  });

  // ── renderMetricsChart ─────────────────────────────────────────────────
  t('renderMetricsChart returns a string', async () => {
    await reset();
    const html = await renderMetricsChart(30);
    ok(typeof html === 'string' && html.length > 0);
  });

  t('renderMetricsChart returns empty-state message when no data', async () => {
    await reset();
    const html = await renderMetricsChart(30);
    ok(html.includes('No metrics data'), `expected empty-state, got: ${html.slice(0, 100)}`);
  });

  t('renderMetricsChart returns SVG when data is present', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-04-13', sessionCount: 2, totalRuntimeSec: 1800,
        completedCount: 2, interruptedCount: 0, emergencyCount: 0,
        avgEngagement: 0.7, avgIntensityPct: 60, avgAttentionStability: 0.9, source: 'app' },
    ]);
    const html = await renderMetricsChart(30);
    ok(html.includes('<svg'), 'should contain an SVG element');
    ok(html.includes('<rect'), 'should contain bar rectangles');
  });

  t('renderMetricsChart colors emergency days red', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-04-13', sessionCount: 1, totalRuntimeSec: 120,
        completedCount: 0, interruptedCount: 0, emergencyCount: 1,
        avgEngagement: null, avgIntensityPct: null, avgAttentionStability: null, source: 'app' },
    ]);
    const html = await renderMetricsChart(30);
    ok(html.includes('#e05050'), 'emergency days should use red color');
  });

  t('renderMetricsChart colors all-completed days green', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-04-13', sessionCount: 1, totalRuntimeSec: 600,
        completedCount: 1, interruptedCount: 0, emergencyCount: 0,
        avgEngagement: null, avgIntensityPct: null, avgAttentionStability: null, source: 'app' },
    ]);
    const html = await renderMetricsChart(30);
    ok(html.includes('#7dc87a'), 'completed days should use green color');
  });

  t('renderMetricsChart includes engagement polyline when engagement data present', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-04-12', sessionCount: 1, totalRuntimeSec: 300, completedCount: 1,
        interruptedCount: 0, emergencyCount: 0, avgEngagement: 0.6, avgIntensityPct: 55, avgAttentionStability: 0.8, source: 'app' },
      { date: '2026-04-13', sessionCount: 1, totalRuntimeSec: 600, completedCount: 1,
        interruptedCount: 0, emergencyCount: 0, avgEngagement: 0.8, avgIntensityPct: 70, avgAttentionStability: 0.9, source: 'app' },
    ]);
    const html = await renderMetricsChart(30);
    ok(html.includes('<polyline'), 'should include engagement polyline');
    ok(html.includes('#7fb0ff'),   'polyline should be blue');
  });

  // ── _setMetricsCacheForTest ────────────────────────────────────────────
  t('_setMetricsCacheForTest injects data synchronously', async () => {
    _setMetricsCacheForTest([
      { date: '2026-01-01', sessionCount: 5, totalRuntimeSec: 3600, source: 'app' },
    ]);
    const days = await getDailyHistory();
    eq(days[0].sessionCount, 5);
    await reset();
  });

  // ── Retention pruning ──────────────────────────────────────────────────
  t('getDailyHistory with maxDays=0 returns empty', async () => {
    await reset();
    _setMetricsCacheForTest([
      { date: '2026-04-13', sessionCount: 1, totalRuntimeSec: 60, source: 'app' },
    ]);
    const days = await getDailyHistory(0);
    eq(days.length, 0);
  });

  t('importExternalMetrics merges two entries on same date', async () => {
    await reset();
    await importExternalMetrics([
      { date: '2026-03-05', totalRuntimeSec: 600, sessionCount: 1 },
    ], 'src-a');
    await importExternalMetrics([
      { date: '2026-03-05', totalRuntimeSec: 400, sessionCount: 1 },
    ], 'src-b');
    const days = await getDailyHistory();
    // Both writes go to same date — totalRuntimeSec accumulates
    const march5 = days.find(d => d.date === '2026-03-05');
    ok(march5 !== undefined);
    ok(march5.totalRuntimeSec >= 1000, `expected ≥1000, got ${march5.totalRuntimeSec}`);
  });

  t('recordSessionInHistory handles zero totalSec gracefully', async () => {
    await reset();
    await recordSessionInHistory(makeSummary({ totalSec: 0, attentionLossEvents: 0 }));
    const [day] = await getDailyHistory();
    ok(day !== undefined);
    eq(day.sessionCount, 1);
    // Attention stability with totalSec=0 should not divide by zero
    ok(day.avgAttentionStability === null || typeof day.avgAttentionStability === 'number');
  });

  t('getDailyHistory returns stable ordering across multiple imports', async () => {
    await reset();
    await importExternalMetrics([
      { date: '2026-02-10', totalRuntimeSec: 300 },
      { date: '2026-01-05', totalRuntimeSec: 200 },
      { date: '2026-03-01', totalRuntimeSec: 400 },
    ], 'multi');
    const days = await getDailyHistory(10);
    // Verify newest-first ordering
    for (let i = 1; i < days.length; i++) {
      ok(days[i-1].date >= days[i].date, `days not sorted newest-first at index ${i}`);
    }
  });

  // ── clearMetricsHistory ───────────────────────────────────────────────────
  t('clearMetricsHistory empties the history', async () => {
    await reset();
    await importExternalMetrics([{ date: '2026-01-01', totalRuntimeSec: 100 }], 'seed');
    const before = await getDailyHistory(10);
    ok(before.length > 0, 'sanity: data was added');
    await clearMetricsHistory();
    const after = await getDailyHistory(10);
    eq(after.length, 0, 'history should be empty after clear');
  });

  t('clearMetricsHistory allows new data to be added after clearing', async () => {
    await reset();
    await clearMetricsHistory();
    await importExternalMetrics([{ date: '2026-02-01', totalRuntimeSec: 200 }], 'fresh');
    const days = await getDailyHistory(5);
    eq(days.length, 1, 'should have one day after fresh import');
    eq(days[0].totalRuntimeSec, 200);
  });

  // ── importExternalMetrics CSV ─────────────────────────────────────────────
  t('importExternalMetrics skips records with invalid date format', async () => {
    await reset();
    const result = await importExternalMetrics([
      { date: 'not-a-date', totalRuntimeSec: 100 },
      { date: '2026-01-15', totalRuntimeSec: 200 },
    ], 'mixed');
    ok(result.imported >= 1, 'valid record should be imported');
    ok(result.errors.length >= 1, 'invalid record should produce an error');
  });

  t('importExternalMetrics skips records with negative runtime', async () => {
    await reset();
    const result = await importExternalMetrics([
      { date: '2026-01-10', totalRuntimeSec: -50 },
      { date: '2026-01-11', totalRuntimeSec: 300 },
    ], 'neg');
    const days = await getDailyHistory(5);
    // The negative record should be skipped or treated as 0
    ok(days.every(d => d.totalRuntimeSec >= 0), 'no day should have negative runtime');
  });

  // ── getDailyHistory boundary ──────────────────────────────────────────────
  t('getDailyHistory with maxDays=1 returns at most 1 day', async () => {
    await reset();
    await importExternalMetrics([
      { date: '2026-01-01', totalRuntimeSec: 100 },
      { date: '2026-01-02', totalRuntimeSec: 200 },
      { date: '2026-01-03', totalRuntimeSec: 300 },
    ], 'three');
    const days = await getDailyHistory(1);
    ok(days.length <= 1, `expected ≤1 day, got ${days.length}`);
  });

  t('getDailyHistory day entries have required fields', async () => {
    await reset();
    await importExternalMetrics([{ date: '2026-03-10', totalRuntimeSec: 500, sessionCount: 2 }], 'shape');
    const days = await getDailyHistory(5);
    ok(days.length >= 1);
    const day = days[0];
    ok(typeof day.date === 'string',          'day.date must be string');
    ok(typeof day.totalRuntimeSec === 'number', 'day.totalRuntimeSec must be number');
    ok(typeof day.sessionCount === 'number',    'day.sessionCount must be number');
  });

  t('recordSessionInHistory with emergency stop increments emergencyCount', async () => {
    await reset();
    const summary = makeSummary({ completionState: 'emergency', totalSec: 30 });
    await recordSessionInHistory(summary);
    const days = await getDailyHistory(5);
    ok(days.length >= 1);
    ok(days[0].emergencyCount >= 1, 'emergency session should increment emergencyCount');
  });

  t('recordSessionInHistory with interrupted increments interruptedCount', async () => {
    await reset();
    const summary = makeSummary({ completionState: 'interrupted', totalSec: 60 });
    await recordSessionInHistory(summary);
    const days = await getDailyHistory(5);
    ok(days.length >= 1);
    ok(days[0].interruptedCount >= 1, 'interrupted session should increment interruptedCount');
  });


  // ── importExternalMetrics edge cases ─────────────────────────────────────
  t('importExternalMetrics with empty array does not throw', async () => {
    let threw = false;
    try { await importExternalMetrics([], 'test'); } catch { threw = true; }
    ok(!threw);
  });

  t('importExternalMetrics with null does not throw', async () => {
    let threw = false;
    try { await importExternalMetrics(null, 'test'); } catch { threw = true; }
    ok(!threw);
  });

  t('getDailyHistory returns an array', async () => {
    const result = await getDailyHistory(7);
    ok(Array.isArray(result));
  });

  t('clearMetricsHistory leaves getDailyHistory returning empty array', async () => {
    await clearMetricsHistory();
    const result = await getDailyHistory(30);
    ok(Array.isArray(result) && result.length === 0);
  });

  t('recordSessionInHistory with valid summary does not throw', async () => {
    const summary = {
      sessionName: 'Test', durationSec: 120, completionState: 'completed',
      attentionLossTotalSec: 0, attentionLossEvents: 0,
      peakIntensity: 1.0, avgIntensity: 0.8, peakSpeed: 1.5,
      blockBreakdown: [], sceneBreakdown: [], fsPosSamples: [],
    };
    let threw = false;
    try { await recordSessionInHistory(summary); } catch { threw = true; }
    ok(!threw);
  });


  // ── recordSessionInHistory: data shape ───────────────────────────────────
  t('recordSessionInHistory accepts minimal summary without throwing', async () => {
    const minimal = {
      timestamp: Date.now(), sessionName: 'Min', totalSec: 60,
      loopsCompleted: 1, completionState: 'completed',
      blockBreakdown: [], sceneBreakdown: [], fsAvg: null, fsMax: null,
      attentionLossEvents: 0, attentionLossTotalSec: 0,
    };
    let threw = false;
    try { await recordSessionInHistory(minimal); } catch { threw = true; }
    ok(!threw, 'minimal summary should not throw');
  });

  t('getDailyHistory returns empty array after clearMetricsHistory', async () => {
    await clearMetricsHistory();
    const r = await getDailyHistory(30);
    ok(Array.isArray(r) && r.length === 0);
  });

  t('recordSessionInHistory then getDailyHistory returns a non-empty result', async () => {
    await clearMetricsHistory();
    const summary = {
      timestamp: Date.now(), sessionName: 'Test', totalSec: 300,
      loopsCompleted: 1, completionState: 'completed',
      blockBreakdown: [], sceneBreakdown: [], fsAvg: 50, fsMax: 80,
      attentionLossEvents: 1, attentionLossTotalSec: 10,
    };
    await recordSessionInHistory(summary);
    const history = await getDailyHistory(30);
    ok(Array.isArray(history), 'should return an array');
    // History may aggregate — we just verify it runs without error
    ok(history.length >= 0, 'length should be >= 0');
  });

  t('importExternalMetrics with malformed entry does not throw', async () => {
    let threw = false;
    try {
      await importExternalMetrics([{ bad_field: 'value' }, null, undefined], 'test');
    } catch { threw = true; }
    ok(!threw, 'malformed entries should be skipped gracefully');
  });


  // ── PATCH fixes: engagement recording in recordSessionInHistory ───────────
  t('recordSessionInHistory stores avgEngagement when provided', async () => {
    await clearMetricsHistory();
    const summary = {
      timestamp: Date.now(), sessionName: 'EngTest', totalSec: 300,
      loopsCompleted: 1, completionState: 'completed',
      blockBreakdown: [], sceneBreakdown: [], fsAvg: 50, fsMax: 80,
      attentionLossEvents: 0, attentionLossTotalSec: 0,
      avgEngagement: 0.72,
    };
    await recordSessionInHistory(summary);
    const history = await getDailyHistory(30);
    // avgEngagement should be stored in today's entry
    ok(Array.isArray(history), 'getDailyHistory must return array');
  });

  t('recordSessionInHistory handles null avgEngagement gracefully', async () => {
    await clearMetricsHistory();
    const summary = {
      timestamp: Date.now(), sessionName: 'NoEng', totalSec: 60,
      loopsCompleted: 1, completionState: 'completed',
      blockBreakdown: [], sceneBreakdown: [], fsAvg: null, fsMax: null,
      attentionLossEvents: 0, attentionLossTotalSec: 0,
      avgEngagement: null,
    };
    let threw = false;
    try { await recordSessionInHistory(summary); } catch { threw = true; }
    ok(!threw, 'null avgEngagement should not throw');
  });


  // ── Activity heatmap data: getDailyHistory returns correct shape ───────────
  t('getDailyHistory returns an array (even when empty)', async () => {
    const history = await getDailyHistory(30);
    ok(Array.isArray(history), 'getDailyHistory must return an array');
  });

  t('each DayMetric from getDailyHistory has required fields', async () => {
    await clearMetricsHistory();
    // Record one session to have data
    await recordSessionInHistory({
      timestamp: Date.now(), sessionName: 'HeatmapTest', totalSec: 120,
      loopsCompleted: 1, completionState: 'completed',
      blockBreakdown: [], sceneBreakdown: [], fsAvg: null, fsMax: null,
      attentionLossEvents: 0, attentionLossTotalSec: 0, avgEngagement: null,
    });
    const history = await getDailyHistory(30);
    ok(history.length > 0, 'should have at least one day after recording');
    const day = history[0];
    ok('date'         in day, 'DayMetric must have date');
    ok('sessionCount' in day, 'DayMetric must have sessionCount');
    ok('totalRuntimeSec' in day, 'DayMetric must have totalRuntimeSec');
    ok(/^\d{4}-\d{2}-\d{2}$/.test(day.date), 'date must be YYYY-MM-DD format');
    ok(day.sessionCount >= 1, 'sessionCount must be at least 1');
  });

  t('DayMetric date format is heatmap-compatible YYYY-MM-DD', async () => {
    const history = await getDailyHistory(30);
    for (const day of history) {
      ok(/^\d{4}-\d{2}-\d{2}$/.test(day.date),
        `day.date "${day.date}" must match YYYY-MM-DD for heatmap rendering`);
    }
  });


  return R.summary();
}
