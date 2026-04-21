// ── tests/harness.js ──────────────────────────────────────────────────────
// Minimal ES-module test runner. No dependencies. Works in any browser
// that supports ES module scripts. Supports sync and async test functions.
//
// Usage:
//   import { makeRunner } from './harness.js';
//   const { test, assertEqual, assert, summary } = makeRunner('Suite');
//   test('sync',  () => { assert(1 + 1 === 2); });
//   test('async', async () => { const v = await idbGet('k'); assert(v !== null); });
//   const r = await summary(); // { passed, failed, results[] }

export function makeRunner(suiteName = '') {
  const results = [];
  let passed = 0;
  let failed = 0;
  const _pending = []; // Promises for async tests

  function test(name, fn) {
    const p = (async () => {
      try {
        await fn();
        results.push({ ok: true,  name, suite: suiteName });
        passed++;
      } catch (e) {
        results.push({ ok: false, name, suite: suiteName, error: e.message ?? String(e) });
        failed++;
      }
    })();
    _pending.push(p);
  }

  function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(
        `${msg ?? 'assertEqual'}\n  expected: ${JSON.stringify(expected)}\n  got:      ${JSON.stringify(actual)}`
      );
    }
  }

  function assertDeep(actual, expected, msg) {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${msg ?? 'assertDeep'}\n  expected: ${b}\n  got:      ${a}`);
  }

  function assert(condition, msg) {
    if (!condition) throw new Error(msg ?? 'Assertion failed');
  }

  function assertThrows(fn, containsMsg) {
    let threw = false;
    try { fn(); } catch (e) {
      threw = true;
      if (containsMsg && !e.message.includes(containsMsg))
        throw new Error(`Expected error containing "${containsMsg}" but got: ${e.message}`);
    }
    if (!threw) throw new Error('Expected function to throw, but it did not');
  }

  // Await all async tests, then return the summary
  async function summary() {
    await Promise.allSettled(_pending);
    return { suite: suiteName, passed, failed, total: passed + failed, results };
  }

  return { test, assertEqual, assertDeep, assert, assertThrows, summary };
}

// ── Render helpers ───────────────────────────────────────────────────────────
export function renderResults(container, summaries) {
  let html = '', totalPassed = 0, totalFailed = 0;
  for (const s of summaries) {
    totalPassed += s.passed; totalFailed += s.failed;
    const icon = s.failed === 0 ? '✅' : '❌';
    html += `<details${s.failed > 0 ? ' open' : ''}>\n  <summary style="cursor:pointer;font-weight:600;padding:4px 0">${icon} ${s.suite} — ${s.passed}/${s.total} passed</summary>\n  <ul style="margin:4px 0 10px 18px;font-size:13px;list-style:none;padding:0">`;
    for (const r of s.results) {
      const bullet = r.ok ? '✅' : '❌';
      html += `<li style="margin-bottom:3px">${bullet} ${r.name}`;
      if (!r.ok) html += `<br><span style="color:#e05050;font-size:11px;white-space:pre-wrap;padding-left:12px">${escHtml(r.error)}</span>`;
      html += '</li>';
    }
    html += '</ul></details>';
  }
  const overall = totalFailed === 0
    ? `<p style="color:#7dc87a;font-weight:700">✅ All ${totalPassed} tests passed.</p>`
    : `<p style="color:#e05050;font-weight:700">❌ ${totalFailed} failed, ${totalPassed} passed.</p>`;
  container.innerHTML = `
    <style>body{font-family:Inter,system-ui,sans-serif;background:#0d0d12;color:#d8d6ce;padding:24px;max-width:700px}
    details{margin-bottom:8px}summary{user-select:none}</style>
    <h2 style="font-size:16px;margin-bottom:16px">Adaptive Session Studio — Test Results</h2>
    ${overall}${html}`;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
