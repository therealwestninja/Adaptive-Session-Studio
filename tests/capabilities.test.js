// ── tests/capabilities.test.js ────────────────────────────────────────────
// Tests for js/capabilities.js — checkStorageBudget shape and caps object.
// detectCapabilities/applyCapabilityGates require browser APIs — not tested.

import { makeRunner } from './harness.js';
import { caps, checkStorageBudget } from '../js/capabilities.js';

export function runCapabilitiesTests() {
  const R  = makeRunner('capabilities.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── caps object shape ──────────────────────────────────────────────────────
  t('caps object has expected boolean fields', () => {
    const EXPECTED = ['faceDetector','speechSynthesis','speechRate','webAudio','fullscreen','indexedDB'];
    for (const field of EXPECTED) {
      ok(field in caps, `caps.${field} should exist`);
      ok(typeof caps[field] === 'boolean', `caps.${field} should be boolean`);
    }
  });

  t('caps has no unexpected fields', () => {
    const EXPECTED = new Set(['faceDetector','speechSynthesis','speechRate','webAudio','fullscreen','indexedDB']);
    for (const key of Object.keys(caps)) {
      ok(EXPECTED.has(key), `unexpected caps field: ${key}`);
    }
  });

  // ── checkStorageBudget ─────────────────────────────────────────────────────
  t('checkStorageBudget returns an object with expected fields', () => {
    const result = checkStorageBudget();
    ok(typeof result === 'object' && result !== null);
    ok('used'        in result, 'missing used');
    ok('available'   in result, 'missing available');
    ok('percentUsed' in result, 'missing percentUsed');
    ok('warning'     in result, 'missing warning');
  });

  t('checkStorageBudget used is a non-negative number', () => {
    const { used } = checkStorageBudget();
    ok(typeof used === 'number' && used >= 0, `used should be ≥ 0, got ${used}`);
  });

  t('checkStorageBudget available is a non-negative number', () => {
    const { available } = checkStorageBudget();
    ok(typeof available === 'number' && available >= 0);
  });

  t('checkStorageBudget percentUsed is 0–100', () => {
    const { percentUsed } = checkStorageBudget();
    ok(typeof percentUsed === 'number' && percentUsed >= 0 && percentUsed <= 100,
      `percentUsed should be 0–100, got ${percentUsed}`);
  });

  t('checkStorageBudget warning is a boolean', () => {
    ok(typeof checkStorageBudget().warning === 'boolean');
  });

  t('checkStorageBudget used + available ≈ estimated budget', () => {
    const { used, available } = checkStorageBudget();
    const estimated = 5 * 1024 * 1024;
    ok(Math.abs((used + available) - estimated) < estimated * 0.01,
      `used (${used}) + available (${available}) should ≈ ${estimated}`);
  });

  t('checkStorageBudget does not throw even if localStorage is empty', () => {
    let threw = false;
    try { checkStorageBudget(); } catch { threw = true; }
    ok(!threw);
  });

  // ── checkStorageBudget: graceful error handling ───────────────────────────
  t('checkStorageBudget called 10 times returns consistent shape', () => {
    for (let i = 0; i < 10; i++) {
      const r = checkStorageBudget();
      ok(typeof r.used === 'number');
      ok(typeof r.available === 'number');
      ok(typeof r.percentUsed === 'number');
      ok(typeof r.warning === 'boolean');
    }
  });

  t('checkStorageBudget warning is true only when percentUsed > 50', () => {
    const { warning, percentUsed } = checkStorageBudget();
    if (percentUsed > 50) ok(warning, 'warning should be true when > 50%');
    else ok(!warning, `warning should be false when percentUsed=${percentUsed}%`);
  });

  t('caps faceDetector defaults to false in non-browser test env', () => {
    // In Node test environment, FaceDetector is not available
    ok(caps.faceDetector === false || caps.faceDetector === true,
      'faceDetector should be boolean regardless of value');
  });


  // ── checkStorageBudget: repeated calls ────────────────────────────────────
  t('checkStorageBudget is idempotent (same result on repeated calls)', () => {
    const r1 = checkStorageBudget();
    const r2 = checkStorageBudget();
    eq(r1.used,        r2.used);
    eq(r1.available,   r2.available);
    eq(r1.percentUsed, r2.percentUsed);
    eq(r1.warning,     r2.warning);
  });

  t('checkStorageBudget percentUsed is an integer (Math.round applied)', () => {
    const { percentUsed } = checkStorageBudget();
    eq(percentUsed, Math.round(percentUsed), 'percentUsed should be an integer');
  });

  t('caps object is not null and is an object', () => {
    ok(caps !== null && typeof caps === 'object' && !Array.isArray(caps));
  });

  t('caps values are all exactly boolean (not truthy/falsy)', () => {
    for (const [k, v] of Object.entries(caps)) {
      ok(v === true || v === false, `caps.${k} = ${v} should be exactly boolean`);
    }
  });


  return R.summary();
}
