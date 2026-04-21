// ── tests/notify.test.js ─────────────────────────────────────────────────
// Tests for js/notify.js — notify object shape and method signatures.
// DOM-creating tests (actual toast display) run in the browser smoke suite.

import { makeRunner } from './harness.js';
import { notify }     from '../js/notify.js';

export function runNotifyTests() {
  const R  = makeRunner('notify.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // ── notify object shape ───────────────────────────────────────────────────
  t('notify is an object (not null or array)', () => {
    ok(notify !== null && typeof notify === 'object' && !Array.isArray(notify));
  });

  t('notify has info, success, warn, error, confirm methods', () => {
    for (const m of ['info', 'success', 'warn', 'error', 'confirm']) {
      ok(typeof notify[m] === 'function', `notify.${m} should be a function`);
    }
  });

  // ── method call signatures — must not throw with valid inputs ─────────────
  t('notify.info() with string does not throw', () => {
    let threw = false;
    try { notify.info('Test info message'); } catch { threw = true; }
    ok(!threw, 'notify.info should not throw');
  });

  t('notify.success() with string does not throw', () => {
    let threw = false;
    try { notify.success('Test success'); } catch { threw = true; }
    ok(!threw);
  });

  t('notify.warn() with string does not throw', () => {
    let threw = false;
    try { notify.warn('Test warning'); } catch { threw = true; }
    ok(!threw);
  });

  t('notify.error() with string does not throw', () => {
    let threw = false;
    try { notify.error('Test error'); } catch { threw = true; }
    ok(!threw);
  });

  t('notify.info() with duration parameter does not throw', () => {
    let threw = false;
    try { notify.info('Timed message', 1000); } catch { threw = true; }
    ok(!threw);
  });

  t('notify.success() with duration 0 (sticky) does not throw', () => {
    let threw = false;
    try { notify.success('Sticky message', 0); } catch { threw = true; }
    ok(!threw);
  });

  // ── notify.confirm: returns a Promise ────────────────────────────────────
  t('notify.confirm() returns a Promise', () => {
    const result = notify.confirm('Test confirm');
    ok(result instanceof Promise, 'confirm should return a Promise');
    // Resolve it silently so we do not leave a dangling dialog
    result.catch(() => {});
  });

  t('notify.confirm() with custom labels does not throw', () => {
    let threw = false;
    let p;
    try {
      p = notify.confirm('Delete?', { confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true });
    } catch { threw = true; }
    ok(!threw);
    p?.catch(() => {});
  });

  // ── edge cases ────────────────────────────────────────────────────────────
  t('notify.info() with empty string does not throw', () => {
    let threw = false;
    try { notify.info(''); } catch { threw = true; }
    ok(!threw);
  });

  t('notify.warn() with very long message does not throw', () => {
    let threw = false;
    try { notify.warn('x'.repeat(500)); } catch { threw = true; }
    ok(!threw);
  });

  t('notify methods can be called in rapid succession', () => {
    let threw = false;
    try {
      for (let i = 0; i < 10; i++) notify.info(`Message ${i}`);
    } catch { threw = true; }
    ok(!threw, 'rapid notify calls should be stable');
  });

  return R.summary();
}
