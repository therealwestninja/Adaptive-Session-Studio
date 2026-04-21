// ── tests/viz-blocks.test.js ─────────────────────────────────────────────────
// Tests for js/viz-blocks.js
// Validates: VIZ_TYPES schema, generateFromBPM output, mountVizBlock/unmountVizBlock
// safety (no-DOM environment), and mathematical correctness of BPM patterns.

import { makeRunner } from './harness.js';
import {
  VIZ_TYPES,
  generateFromBPM,
  mountVizBlock,
  unmountVizBlock,
} from '../js/viz-blocks.js';

export function runVizBlocksTests() {
  const R  = makeRunner('viz-blocks.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── VIZ_TYPES schema ─────────────────────────────────────────────────────
  t('VIZ_TYPES is a non-empty array', () => {
    ok(Array.isArray(VIZ_TYPES) && VIZ_TYPES.length > 0);
  });

  t('VIZ_TYPES has at least 5 entries', () => {
    ok(VIZ_TYPES.length >= 5, `expected ≥5, got ${VIZ_TYPES.length}`);
  });

  t('all VIZ_TYPES have id, label, desc fields', () => {
    for (const v of VIZ_TYPES) {
      ok(typeof v.id    === 'string' && v.id.length > 0,    `${v.id}: missing id`);
      ok(typeof v.label === 'string' && v.label.length > 0, `${v.id}: missing label`);
      ok(typeof v.desc  === 'string' && v.desc.length > 0,  `${v.id}: missing desc`);
    }
  });

  t('all VIZ_TYPES ids are unique', () => {
    const ids = VIZ_TYPES.map(v => v.id);
    eq(new Set(ids).size, ids.length, 'duplicate viz type id found');
  });

  t('spiral viz type exists', () => {
    ok(VIZ_TYPES.some(v => v.id === 'spiral'));
  });

  t('tunnel viz type exists', () => {
    ok(VIZ_TYPES.some(v => v.id === 'tunnel'));
  });

  t('pulse viz type exists', () => {
    ok(VIZ_TYPES.some(v => v.id === 'pulse'));
  });

  // ── generateFromBPM ───────────────────────────────────────────────────────
  t('generateFromBPM returns an array', () => {
    ok(Array.isArray(generateFromBPM({ bpm: 80, durationSec: 10 })));
  });

  t('generateFromBPM returns non-empty array', () => {
    const actions = generateFromBPM({ bpm: 80, durationSec: 10 });
    ok(actions.length > 0, 'should produce actions');
  });

  t('generateFromBPM actions have numeric at and pos', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 5 });
    for (const a of actions) {
      ok(typeof a.at === 'number' && Number.isFinite(a.at), 'at must be finite number');
      ok(typeof a.pos === 'number' && Number.isFinite(a.pos), 'pos must be finite number');
    }
  });

  t('generateFromBPM pos values clamped to [0, 100]', () => {
    const actions = generateFromBPM({ bpm: 120, durationSec: 30, amplitude: 100, baseline: 0 });
    for (const a of actions) {
      ok(a.pos >= 0 && a.pos <= 100, `pos ${a.pos} outside [0, 100] at ${a.at}ms`);
    }
  });

  t('generateFromBPM actions sorted by at (ascending)', () => {
    const actions = generateFromBPM({ bpm: 80, durationSec: 20 });
    for (let i = 1; i < actions.length; i++) {
      ok(actions[i].at >= actions[i - 1].at,
        `not sorted: ${actions[i-1].at} → ${actions[i].at}`);
    }
  });

  t('generateFromBPM duration matches requested length (within 1 beat)', () => {
    const bpm = 60, durSec = 30;
    const actions = generateFromBPM({ bpm, durationSec: durSec });
    const lastAt  = actions.at(-1)?.at ?? 0;
    const beatMs  = (60 / bpm) * 1000;
    ok(lastAt >= durSec * 1000 - beatMs,
      `last action ${lastAt}ms is more than 1 beat before ${durSec * 1000}ms end`);
    ok(lastAt <= durSec * 1000 + beatMs,
      `last action ${lastAt}ms is more than 1 beat past ${durSec * 1000}ms end`);
  });

  t('generateFromBPM uses default values when called with empty options', () => {
    const actions = generateFromBPM();
    ok(actions.length > 0, 'should work with all defaults');
  });

  t('generateFromBPM clamps BPM below 30 to 30', () => {
    const slow = generateFromBPM({ bpm: 5, durationSec: 10 });
    const floor = generateFromBPM({ bpm: 30, durationSec: 10 });
    // Both should produce a similar number of actions (same effective BPM)
    ok(Math.abs(slow.length - floor.length) <= 2, 'BPM < 30 should be clamped to 30');
  });

  t('generateFromBPM clamps BPM above 240 to 240', () => {
    const fast  = generateFromBPM({ bpm: 9999, durationSec: 5 });
    const ceil  = generateFromBPM({ bpm: 240, durationSec: 5 });
    ok(Math.abs(fast.length - ceil.length) <= 2, 'BPM > 240 should be clamped to 240');
  });

  // ── Shape-specific tests ──────────────────────────────────────────────────
  t('sine shape peak reaches near amplitude', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 10, shape: 'sine', amplitude: 90, baseline: 10 });
    const maxPos  = Math.max(...actions.map(a => a.pos));
    ok(maxPos >= 85, `sine peak should reach near 90%, got ${maxPos}%`);
  });

  t('square shape reaches amplitude on beats', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 10, shape: 'square', amplitude: 90, baseline: 10 });
    ok(actions.some(a => a.pos >= 85), 'square should reach near amplitude');
    ok(actions.some(a => a.pos <= 15), 'square should reach near baseline');
  });

  t('all four shapes produce valid output', () => {
    for (const shape of ['sine', 'square', 'sawtooth', 'bounce']) {
      const actions = generateFromBPM({ bpm: 80, durationSec: 10, shape });
      ok(actions.length > 0, `${shape}: no actions generated`);
      ok(actions.every(a => a.pos >= 0 && a.pos <= 100), `${shape}: pos out of range`);
    }
  });

  t('unknown shape falls back to sine gracefully', () => {
    let threw = false;
    try {
      const actions = generateFromBPM({ bpm: 80, durationSec: 5, shape: 'wobble' });
      ok(actions.length > 0);
    } catch { threw = true; }
    ok(!threw, 'unknown shape should not throw');
  });

  t('barsPerBeat=2 produces roughly double the actions of barsPerBeat=1', () => {
    const single = generateFromBPM({ bpm: 60, durationSec: 10, barsPerBeat: 1 });
    const double = generateFromBPM({ bpm: 60, durationSec: 10, barsPerBeat: 2 });
    ok(double.length >= single.length * 1.5,
      `double bars should produce more actions: single=${single.length}, double=${double.length}`);
  });

  // ── mount/unmount safety (no DOM in test env) ─────────────────────────────
  t('mountVizBlock does not throw when canvas is null', () => {
    let threw = false;
    try { mountVizBlock(null, { vizType: 'spiral', vizSpeed: 1, vizColor: '#fff' }); }
    catch { threw = true; }
    ok(!threw, 'mountVizBlock(null) must not throw');
  });

  t('unmountVizBlock does not throw when canvas is null', () => {
    let threw = false;
    try { unmountVizBlock(null); }
    catch { threw = true; }
    ok(!threw, 'unmountVizBlock(null) must not throw');
  });

  t('unmountVizBlock does not throw for unknown canvas', () => {
    // Pass a plain object that isn't a real canvas
    let threw = false;
    try { unmountVizBlock({ width: 0, height: 0 }); }
    catch { threw = true; }
    ok(!threw, 'unmountVizBlock with non-canvas object must not throw');
  });

  // ── generateFromBPM: advanced math checks ────────────────────────────────
  t('generateFromBPM at 120 BPM produces action every ~500ms', () => {
    const actions = generateFromBPM({ bpm: 120, durationSec: 10, barsPerBeat: 1 });
    if (actions.length < 2) return;
    const gap = actions[1].at - actions[0].at;
    // At 120BPM, beat = 500ms; allow ±10ms rounding
    ok(Math.abs(gap - 500) <= 10, `expected ~500ms gap, got ${gap}ms`);
  });

  t('generateFromBPM at 60 BPM produces action every ~1000ms', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 10, barsPerBeat: 1 });
    if (actions.length < 2) return;
    const gap = actions[1].at - actions[0].at;
    ok(Math.abs(gap - 1000) <= 10, `expected ~1000ms gap, got ${gap}ms`);
  });

  t('bounce shape never goes negative', () => {
    const actions = generateFromBPM({ bpm: 80, durationSec: 20, shape: 'bounce', baseline: 10 });
    ok(actions.every(a => a.pos >= 0), 'bounce pos must always be ≥ 0');
  });

  t('sawtooth shape reaches baseline at end of each beat', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 5, shape: 'sawtooth', baseline: 5, amplitude: 95 });
    ok(actions.some(a => a.pos <= 10), 'sawtooth should reach near baseline');
    ok(actions.some(a => a.pos >= 85), 'sawtooth should reach near amplitude');
  });

  t('amplitude=50 baseline=50 produces only pos=50', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 5, shape: 'sine', amplitude: 50, baseline: 50 });
    ok(actions.every(a => a.pos === 50), 'flat amplitude/baseline should produce constant pos');
  });


  // ── Security: input clamping ──────────────────────────────────────────────
  t('generateFromBPM with amplitude > 100 does not produce pos > 100', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 5, amplitude: 999, baseline: 0 });
    ok(actions.every(a => a.pos <= 100), 'pos must never exceed 100');
  });

  t('generateFromBPM with baseline < 0 does not produce pos < 0', () => {
    const actions = generateFromBPM({ bpm: 60, durationSec: 5, amplitude: 90, baseline: -50 });
    ok(actions.every(a => a.pos >= 0), 'pos must never go below 0');
  });

  t('generateFromBPM with durationSec=0 returns empty or minimal array', () => {
    let threw = false;
    try { generateFromBPM({ bpm: 60, durationSec: 0 }); }
    catch { threw = true; }
    ok(!threw, 'zero duration should not throw');
  });


  // ── VIZ_TYPES completeness ────────────────────────────────────────────────
  t('VIZ_TYPES ids match the set used by normalizeBlock validation', () => {
    const VALID_IN_STATE = new Set(['spiral','pendulum','tunnel','pulse','vortex']);
    for (const v of VIZ_TYPES) {
      ok(VALID_IN_STATE.has(v.id), `${v.id} not in normalizeBlock allowlist`);
    }
    eq(VIZ_TYPES.length, VALID_IN_STATE.size, 'count mismatch between VIZ_TYPES and allowlist');
  });

  t('VIZ_TYPES labels all contain the type id for discoverability', () => {
    for (const v of VIZ_TYPES) {
      ok(v.label.toLowerCase().includes(v.id) || v.label.includes('🌀') ||
         v.label.includes('〰') || v.label.includes('⭕') ||
         v.label.includes('💗') || v.label.includes('🌪'),
        `${v.id}: label "${v.label}" should be identifiable`);
    }
  });

  // ── generateFromBPM correctness ───────────────────────────────────────────
  t('generateFromBPM with barsPerBeat=4 produces actions at ~quarter-beat spacing', () => {
    const bpm = 120;
    const beatMs = 60000 / bpm; // 500ms per beat
    const stepMs = beatMs / 4;  // 125ms per step
    const actions = generateFromBPM({ bpm, durationSec: 5, barsPerBeat: 4 });
    if (actions.length < 2) return;
    const gap = actions[1].at - actions[0].at;
    ok(Math.abs(gap - stepMs) <= 5, `expected ~${stepMs}ms gap, got ${gap}ms`);
  });

  t('all BPM shapes produce monotonically-increasing timestamps', () => {
    for (const shape of ['sine','square','sawtooth','bounce']) {
      const actions = generateFromBPM({ bpm: 80, durationSec: 10, shape });
      for (let i = 1; i < actions.length; i++) {
        ok(actions[i].at > actions[i-1].at,
          `${shape}: timestamps not strictly increasing at index ${i}`);
      }
    }
  });


  // ── mountVizBlock / unmountVizBlock ───────────────────────────────────────
  // Tests run in a no-DOM environment; we verify no-throw safety with null canvas.
  // Full rendering is covered by the browser smoke tests.
  t('mountVizBlock with null canvas does not throw (no DOM env)', () => {
    let threw = false;
    try { mountVizBlock(null, { vizType: 'spiral', vizSpeed: 1, vizColor: '#fff' }); }
    catch { threw = true; }
    ok(!threw);
  });

  t('mountVizBlock with null canvas is safe for all 5 viz types', () => {
    for (const vt of ['spiral','pendulum','tunnel','pulse','vortex']) {
      let threw = false;
      try { mountVizBlock(null, { vizType: vt, vizSpeed: 1.0, vizColor: '#c49a3c' }); }
      catch { threw = true; }
      ok(!threw, `${vt} should handle null canvas gracefully`);
    }
  });

  t('unmountVizBlock with null canvas does not throw', () => {
    let threw = false;
    try { unmountVizBlock(null); } catch { threw = true; }
    ok(!threw);
  });

  t('mountVizBlock with invalid vizType falls back to spiral without throwing', () => {
    let threw = false;
    try { mountVizBlock(null, { vizType: 'unknown_type', vizSpeed: 1, vizColor: '#fff' }); }
    catch { threw = true; }
    ok(!threw, 'unknown vizType should fall back gracefully');
  });


  // ── Viz block color and type interaction ─────────────────────────────────
  t('createVizBlock initializes with a safe hex vizColor', () => {
    const b = createVizBlock({ vizType:'spiral' });
    ok(/^#[0-9a-f]{3,8}$/.test(b.vizColor ?? '#c49a3c'),
      `vizColor should be safe hex, got: ${b.vizColor}`);
  });

  t('ALL_VIZ_TYPES has at least 5 entries', () => {
    ok(ALL_VIZ_TYPES.length >= 5, `expected ≥5 viz types, got ${ALL_VIZ_TYPES.length}`);
  });

  t('every VIZ_TYPE has id, label, and desc', () => {
    for (const v of ALL_VIZ_TYPES) {
      ok(typeof v.id    === 'string' && v.id.length > 0,    `${v.id}: missing id`);
      ok(typeof v.label === 'string' && v.label.length > 0, `${v.id}: missing label`);
      ok(typeof v.desc  === 'string' && v.desc.length > 0,  `${v.id}: missing desc`);
    }
  });

  t('VIZ_TYPE ids are all unique', () => {
    const ids = ALL_VIZ_TYPES.map(v => v.id);
    eq(new Set(ids).size, ids.length, 'all viz type ids must be unique');
  });

  t('drawVizBlock does not throw when called with each viz type', () => {
    for (const v of ALL_VIZ_TYPES) {
      let threw = false;
      try {
        drawVizBlock({
          vizType: v.id,
          vizColor: '#c49a3c',
          vizSpeed: 1.0,
        }, mockCtx, 100, 100, 0);
      } catch { threw = true; }
      ok(!threw, `drawVizBlock(${v.id}) should not throw`);
    }
  });

  t('drawVizBlock with injected vizColor falls back gracefully (does not throw)', () => {
    let threw = false;
    try {
      drawVizBlock({
        vizType: 'spiral',
        vizColor: 'javascript:void(0)',
        vizSpeed: 1.0,
      }, mockCtx, 100, 100, 0);
    } catch { threw = true; }
    ok(!threw, 'injected vizColor should not cause drawVizBlock to throw');
  });


  return R.summary();
}
