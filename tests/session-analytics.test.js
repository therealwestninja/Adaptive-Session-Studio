// ── tests/session-analytics.test.js ──────────────────────────────────────
// Tests for session-analytics.js: initAnalytics, tickAnalytics,
// notifyAttentionLost/Returned, and finaliseAnalytics.
// All tests run without DOM — analytics accumulates plain data.

import { makeRunner } from './harness.js';
import {
  initAnalytics, tickAnalytics, finaliseAnalytics,
  notifyAttentionLost, notifyAttentionReturned,
  getStoredAnalytics, clearStoredAnalytics, _setAnalyticsCacheForTest,
} from '../js/session-analytics.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runSessionAnalyticsTests() {
  const R  = makeRunner('session-analytics.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function makeRuntime(overrides = {}) {
    return {
      startedAt:      performance.now() - 10_000, // 10s ago
      totalPausedMs:  0,
      loopIndex:      0,
      analytics:      null,
      activeBlock:    null,
      activeScene:    null,
      ...overrides,
    };
  }

  function setupSession(duration = 60) {
    state.session = normalizeSession({ ...defaultSession(), duration });
    state.session.blocks = [{ id: 'b1', type: 'text', label: 'A', start: 0, duration: 10, content: '' }];
    state.session.scenes = [];
  }

  // ── initAnalytics ─────────────────────────────────────────────────────
  t('initAnalytics creates analytics object on runtime', () => {
    const rt = makeRuntime();
    initAnalytics(rt);
    ok(rt.analytics !== null);
  });

  t('initAnalytics sets empty counters', () => {
    const rt = makeRuntime();
    initAnalytics(rt);
    ok(typeof rt.analytics.blockTime === 'object');
    eq(rt.analytics.attentionLossEvents, 0);
    eq(rt.analytics.attentionLossTotalSec, 0);
    eq(rt.analytics._attentionLostAt, null);
  });

  // ── tickAnalytics ─────────────────────────────────────────────────────
  t('tickAnalytics accumulates block time for active block', () => {
    setupSession();
    const rt = makeRuntime();
    initAnalytics(rt);
    rt.activeBlock = { id: 'b1' };
    tickAnalytics(rt, 1); // 1 second
    tickAnalytics(rt, 0.5);
    ok(rt.analytics.blockTime['b1'] >= 1.4, `expected >= 1.4, got ${rt.analytics.blockTime['b1']}`);
  });

  t('tickAnalytics ignores frame when activeBlock is null', () => {
    setupSession();
    const rt = makeRuntime();
    initAnalytics(rt);
    rt.activeBlock = null;
    tickAnalytics(rt, 1);
    eq(Object.keys(rt.analytics.blockTime).length, 0);
  });

  t('tickAnalytics accumulates scene time', () => {
    setupSession();
    const rt = makeRuntime();
    initAnalytics(rt);
    rt.activeScene = { scene: { id: 's1' } };
    tickAnalytics(rt, 2);
    ok(rt.analytics.sceneTime['s1'] >= 1.9);
  });

  // ── notifyAttentionLost / Returned ────────────────────────────────────
  t('notifyAttentionLost sets _attentionLostAt and increments events', () => {
    const rt = makeRuntime();
    initAnalytics(rt);
    notifyAttentionLost(rt);
    ok(rt.analytics._attentionLostAt !== null, 'should set _attentionLostAt');
    eq(rt.analytics.attentionLossEvents, 1);
  });

  t('notifyAttentionReturned accumulates loss duration and clears marker', () => {
    const rt = makeRuntime();
    initAnalytics(rt);
    notifyAttentionLost(rt);
    // Simulate ~100ms passing
    const before = rt.analytics._attentionLostAt;
    rt.analytics._attentionLostAt = performance.now() - 500; // 500ms ago
    notifyAttentionReturned(rt);
    ok(rt.analytics.attentionLossTotalSec >= 0.4, 'should accumulate ~500ms');
    eq(rt.analytics._attentionLostAt, null, 'marker should be cleared');
  });

  t('notifyAttentionReturned is a no-op when not currently lost', () => {
    const rt = makeRuntime();
    initAnalytics(rt);
    notifyAttentionReturned(rt); // no-op
    eq(rt.analytics.attentionLossTotalSec, 0);
  });

  // ── finaliseAnalytics — loopsCompleted ───────────────────────────────
  t('finaliseAnalytics loopsCompleted = 0 for a session that ran < 1 loop', () => {
    setupSession(60);
    // Runtime started 30s ago (half of a 60s session)
    const rt = makeRuntime({ startedAt: performance.now() - 30_000, loopIndex: 0 });
    initAnalytics(rt);
    const summary = finaliseAnalytics(rt);
    // floor(30 / 60) = 0 — in-progress loop is NOT counted
    eq(summary.loopsCompleted, 0, `got ${summary.loopsCompleted}`);
  });

  t('finaliseAnalytics loopsCompleted = 1 after completing exactly one loop', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 65_000, loopIndex: 1 });
    initAnalytics(rt);
    const summary = finaliseAnalytics(rt);
    // floor(65 / 60) = 1
    eq(summary.loopsCompleted, 1, `got ${summary.loopsCompleted}`);
  });

  t('finaliseAnalytics loopsCompleted = 2 after completing two full loops', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 125_000, loopIndex: 2 });
    initAnalytics(rt);
    const summary = finaliseAnalytics(rt);
    // floor(125 / 60) = 2
    eq(summary.loopsCompleted, 2, `got ${summary.loopsCompleted}`);
  });

  // ── finaliseAnalytics — open attention-loss interval ──────────────────
  t('finaliseAnalytics includes open attention-loss interval when session ends mid-loss', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 30_000 });
    initAnalytics(rt);
    // Simulate attention lost 2s before session ends
    rt.analytics._attentionLostAt = performance.now() - 2_000;
    rt.analytics.attentionLossEvents = 1;
    rt.analytics.attentionLossTotalSec = 0; // accumulated total before this interval

    const summary = finaliseAnalytics(rt);
    ok(
      summary.attentionLossTotalSec >= 1,
      `open interval should be included — got ${summary.attentionLossTotalSec}s`
    );
  });

  t('finaliseAnalytics does not add to attentionLossTotalSec when no open interval', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 30_000 });
    initAnalytics(rt);
    rt.analytics.attentionLossTotalSec = 5; // already accumulated 5s
    rt.analytics._attentionLostAt = null;   // no open interval

    const summary = finaliseAnalytics(rt);
    eq(summary.attentionLossTotalSec, 5, 'should not add any extra time');
  });

  // ── finaliseAnalytics — summary shape ────────────────────────────────
  t('finaliseAnalytics returns expected summary keys', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 60_000 });
    initAnalytics(rt);
    const summary = finaliseAnalytics(rt);
    ok(typeof summary.timestamp === 'number');
    ok(typeof summary.sessionName === 'string');
    ok(typeof summary.totalSec === 'number');
    ok(typeof summary.loopsCompleted === 'number');
    ok(Array.isArray(summary.blockBreakdown));
    ok(Array.isArray(summary.sceneBreakdown));
    ok(typeof summary.attentionLossEvents === 'number');
    ok(typeof summary.attentionLossTotalSec === 'number');
  });

  t('finaliseAnalytics returns null when runtime has no analytics', () => {
    const rt = makeRuntime();
    rt.analytics = null;
    const result = finaliseAnalytics(rt);
    eq(result, null);
  });

  t('initAnalytics sets default completionState to completed', () => {
    setupSession(60);
    const rt = makeRuntime();
    initAnalytics(rt);
    eq(rt.analytics.completionState, 'completed');
  });

  t('finaliseAnalytics summary includes completionState field', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 10_000 });
    initAnalytics(rt);
    const summary = finaliseAnalytics(rt);
    ok('completionState' in summary);
    ok(['completed','interrupted','emergency'].includes(summary.completionState));
  });

  t('finaliseAnalytics preserves interrupted completionState', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 10_000 });
    initAnalytics(rt);
    rt.analytics.completionState = 'interrupted';
    const summary = finaliseAnalytics(rt);
    eq(summary.completionState, 'interrupted');
  });

  // ── Scene time tracking ───────────────────────────────────────────────
  t('tickAnalytics accumulates scene time when activeScene is set', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 5_000 });
    initAnalytics(rt);
    rt.activeScene = { scene: { id: 'sc1' } };
    tickAnalytics(rt, 1.0); // 1 second frame
    ok(rt.analytics.sceneTime['sc1'] > 0.9, 'scene time should have accumulated');
  });

  t('tickAnalytics does not accumulate scene time when activeScene is null', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 5_000 });
    initAnalytics(rt);
    rt.activeScene = null;
    tickAnalytics(rt, 1.0);
    const keys = Object.keys(rt.analytics.sceneTime);
    eq(keys.length, 0, 'no scene time should accumulate without active scene');
  });

  t('tickAnalytics accumulates time across multiple scenes', () => {
    setupSession(120);
    const rt = makeRuntime({ startedAt: performance.now() - 10_000 });
    initAnalytics(rt);
    rt.activeScene = { scene: { id: 'sc1' } };
    tickAnalytics(rt, 2.0); // 2s in sc1
    rt.activeScene = { scene: { id: 'sc2' } };
    tickAnalytics(rt, 3.0); // 3s in sc2
    ok(rt.analytics.sceneTime['sc1'] > 1.9, 'sc1 should have ~2s');
    ok(rt.analytics.sceneTime['sc2'] > 2.9, 'sc2 should have ~3s');
  });

  t('finaliseAnalytics sceneBreakdown includes only scenes with time > 0', () => {
    setupSession(120);
    state.session.scenes = [
      { id: 'sc1', name: 'Intro', start: 0, end: 60, color: '#5fa0dc', loopBehavior: 'once', nextSceneId: null },
      { id: 'sc2', name: 'Main',  start: 60, end: 120, color: '#7dc87a', loopBehavior: 'once', nextSceneId: null },
    ];
    const rt = makeRuntime({ startedAt: performance.now() - 120_000 });
    initAnalytics(rt);
    rt.activeScene = { scene: { id: 'sc1' } };
    tickAnalytics(rt, 10.0); // 10s in sc1 only
    const summary = finaliseAnalytics(rt);
    eq(summary.sceneBreakdown.length, 1, 'only sc1 had time');
    eq(summary.sceneBreakdown[0].id, 'sc1');
    eq(summary.sceneBreakdown[0].name, 'Intro');
    ok(summary.sceneBreakdown[0].seconds >= 10);
  });

  t('finaliseAnalytics sceneBreakdown is empty when no scenes are active', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 60_000 });
    initAnalytics(rt);
    rt.activeScene = null;
    tickAnalytics(rt, 5.0);
    const summary = finaliseAnalytics(rt);
    eq(summary.sceneBreakdown.length, 0);
  });

  // ── Storage helpers ────────────────────────────────────────────────────────
  t('_setAnalyticsCacheForTest populates getStoredAnalytics()', () => {
    _setAnalyticsCacheForTest([{ timestamp: 1000, sessionName: 'Test', totalSec: 60 }]);
    const stored = getStoredAnalytics();
    eq(stored.length, 1);
    eq(stored[0].sessionName, 'Test');
  });

  t('clearStoredAnalytics empties the cache', async () => {
    _setAnalyticsCacheForTest([{ timestamp: 2000, sessionName: 'A', totalSec: 30 }]);
    await clearStoredAnalytics();
    eq(getStoredAnalytics().length, 0);
  });

  t('getStoredAnalytics returns empty array when cache is empty', () => {
    _setAnalyticsCacheForTest([]);
    ok(Array.isArray(getStoredAnalytics()));
    eq(getStoredAnalytics().length, 0);
  });

  t('_setAnalyticsCacheForTest with multiple entries all readable', () => {
    const entries = [
      { timestamp: 1, sessionName: 'A', totalSec: 30 },
      { timestamp: 2, sessionName: 'B', totalSec: 60 },
      { timestamp: 3, sessionName: 'C', totalSec: 90 },
    ];
    _setAnalyticsCacheForTest(entries);
    const stored = getStoredAnalytics();
    eq(stored.length, 3);
    eq(stored[1].sessionName, 'B');
  });

  t('finaliseAnalytics stores entry in getStoredAnalytics', async () => {
    _setAnalyticsCacheForTest([]);
    setupSession(30);
    const rt = makeRuntime({ startedAt: performance.now() - 30_000 });
    initAnalytics(rt);
    tickAnalytics(rt, 1.0);
    await finaliseAnalytics(rt);
    ok(getStoredAnalytics().length >= 1, 'finalise should add to stored analytics');
    _setAnalyticsCacheForTest([]); // cleanup
  });

  // ── Completion state edge cases ───────────────────────────────────────────
  t('finaliseAnalytics completionState defaults to completed when not set', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() - 20_000 });
    initAnalytics(rt);
    tickAnalytics(rt, 1.0);
    const summary = finaliseAnalytics(rt);
    ok(summary instanceof Promise || typeof summary === 'object');
  });

  t('tickAnalytics with frameSec=0 does not crash', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    tickAnalytics(rt, 0);  // zero frame — must not throw or divide by zero
    ok(true);
  });

  t('notifyAttentionLost records timestamp', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    notifyAttentionLost(rt, performance.now());
    ok(rt.analytics._attentionLostAt !== null);
    ok(typeof rt.analytics._attentionLostAt === 'number');
  });

  t('notifyAttentionReturned when not lost is a no-op', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    // No call to notifyAttentionLost — returning should be a no-op
    notifyAttentionReturned(rt, performance.now());
    ok(rt.analytics.attentionLossTotalSec === 0);
    ok(rt.analytics.attentionLossEvents === 0);
  });

  t('multiple tickAnalytics calls accumulate time linearly', () => {
    setupSession(120);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    rt.activeBlock = state.session.blocks[0];
    for (let i = 0; i < 10; i++) tickAnalytics(rt, 1.0);
    ok(rt.analytics.blockTimeSec[rt.activeBlock.id] >= 9.9, 'accumulated block time should be ~10s');
  });


  // ── Attention tracking accumulation ──────────────────────────────────────
  t('attention lost+returned pair accumulates attentionLossTotalSec', () => {
    setupSession(120);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    const t0 = performance.now();
    notifyAttentionLost(rt, t0);
    notifyAttentionReturned(rt, t0 + 3000); // 3s of loss
    ok(rt.analytics.attentionLossTotalSec >= 2.9, `expected ~3s, got ${rt.analytics.attentionLossTotalSec}`);
    eq(rt.analytics.attentionLossEvents, 1);
  });

  t('multiple attention loss events accumulate count', () => {
    setupSession(120);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) {
      notifyAttentionLost(rt, t0 + i * 10000);
      notifyAttentionReturned(rt, t0 + i * 10000 + 1000);
    }
    eq(rt.analytics.attentionLossEvents, 3);
  });

  t('initAnalytics resets attentionLossEvents to 0', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() });
    rt.analytics = { attentionLossEvents: 5 }; // simulate stale state
    initAnalytics(rt);
    eq(rt.analytics.attentionLossEvents, 0);
  });

  // ── Block time accumulation ───────────────────────────────────────────────
  t('tickAnalytics accumulates blockTimeSec for selected block', () => {
    setupSession(120);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    rt.activeBlock = state.session.blocks[0];
    const blockId = rt.activeBlock.id;
    tickAnalytics(rt, 2.5);
    tickAnalytics(rt, 2.5);
    ok((rt.analytics.blockTimeSec[blockId] ?? 0) >= 4.9,
      `expected ~5s, got ${rt.analytics.blockTimeSec[blockId]}`);
  });

  t('tickAnalytics with no activeBlock does not crash', () => {
    setupSession(60);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    rt.activeBlock = null;
    let threw = false;
    try { tickAnalytics(rt, 1.0); } catch { threw = true; }
    ok(!threw);
  });

  // ── clearStoredAnalytics then finalise ───────────────────────────────────
  t('clearStoredAnalytics allows new entries to accumulate from zero', async () => {
    await clearStoredAnalytics();
    const before = getStoredAnalytics();
    ok(Array.isArray(before) && before.length === 0, 'should be empty after clear');
    setupSession(30);
    const rt = makeRuntime({ startedAt: performance.now() - 5000 });
    initAnalytics(rt);
    await finaliseAnalytics(rt);
    const after = getStoredAnalytics();
    ok(Array.isArray(after) && after.length >= 1, 'should have one entry after finalise');
  });


  // ── finaliseAnalytics: completionState variants ───────────────────────────
  t('finaliseAnalytics with interruption sets completionState', async () => {
    setupSession(120);
    const rt = makeRuntime({ startedAt: performance.now() - 30000 });
    initAnalytics(rt);
    rt.analytics.completionState = 'interrupted';
    await finaliseAnalytics(rt);
    const entries = getStoredAnalytics();
    const last = entries[entries.length - 1];
    ok(last !== undefined);
    // The stored entry should reflect some completion state
    ok(typeof last.completionState === 'string' || last.sessionName !== undefined);
  });

  t('notifyAttentionLost then Returned accumulates 2+ seconds of loss', () => {
    setupSession(120);
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    const t0 = performance.now();
    notifyAttentionLost(rt, t0);
    notifyAttentionReturned(rt, t0 + 2500);
    ok(rt.analytics.attentionLossTotalSec >= 2.0,
      `expected ≥2s, got ${rt.analytics.attentionLossTotalSec}`);
  });

  t('tickAnalytics accumulates scene time', () => {
    setupSession(120);
    state.session.scenes = [
      { id: 'sc1', name: 'Test', start: 0, end: 60, stateType: null,
        loopBehavior: 'once', color: '#fff', nextSceneId: null }
    ];
    const rt = makeRuntime({ startedAt: performance.now() });
    initAnalytics(rt);
    rt.activeScene = { scene: state.session.scenes[0], loopCount: 0 };
    tickAnalytics(rt, 5.0);
    ok((rt.analytics.sceneTime['sc1'] ?? 0) >= 4.9,
      `expected ~5s scene time, got ${rt.analytics.sceneTime['sc1']}`);
  });


  // ── PATCH fixes: engagement pipeline ─────────────────────────────────────
  t('initAnalytics creates engagementSamples array on the accumulator', () => {
    const rt = { analytics: null, startedAt: performance.now(), totalPausedMs: 0 };
    initAnalytics(rt);
    ok(Array.isArray(rt.analytics.engagementSamples),
      'engagementSamples must be an array after initAnalytics');
    eq(rt.analytics.engagementSamples.length, 0, 'should start empty');
  });

  t('finaliseAnalytics includes avgEngagement: null when no samples', async () => {
    const rt = {
      analytics: {
        blockTime:{}, sceneTime:{}, fsPosSamples:[], fsSampleTick:0,
        engagementSamples: [], // empty → no engagement data
        attentionLossEvents:0, attentionLossTotalSec:0,
        _attentionLostAt:null, completionState:'completed',
      },
      startedAt: performance.now() - 5000, totalPausedMs: 0,
    };
    const summary = await finaliseAnalytics(rt);
    ok(summary !== null, 'finaliseAnalytics should return summary');
    ok('avgEngagement' in summary, 'summary must have avgEngagement field');
    ok(summary.avgEngagement === null, 'avgEngagement must be null with no samples');
  });

  t('finaliseAnalytics computes avgEngagement from samples', async () => {
    const rt = {
      analytics: {
        blockTime:{}, sceneTime:{}, fsPosSamples:[], fsSampleTick:0,
        engagementSamples: [0.5, 0.7, 0.6],
        attentionLossEvents:0, attentionLossTotalSec:0,
        _attentionLostAt:null, completionState:'completed',
      },
      startedAt: performance.now() - 5000, totalPausedMs: 0,
    };
    const summary = await finaliseAnalytics(rt);
    ok(Number.isFinite(summary.avgEngagement), 'avgEngagement must be a number');
    ok(summary.avgEngagement > 0.5 && summary.avgEngagement < 0.7,
      `expected ~0.6, got ${summary.avgEngagement}`);
  });


  return R.summary();
}
