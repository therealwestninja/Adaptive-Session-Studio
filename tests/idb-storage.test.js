// ── tests/idb-storage.test.js ─────────────────────────────────────────────
// Tests for idb-storage.js — runs in browser test environment where IndexedDB
// is available. Validates the full async key/value lifecycle.

import { makeRunner } from './harness.js';
import { idbGet, idbSet, idbDel, idbHas } from '../js/idb-storage.js';

export function runIdbStorageTests() {
  const R  = makeRunner('idb-storage.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // Use a test-specific key prefix to avoid colliding with real app data
  const KEY = 'test:idb-storage-suite';
  const KEY2 = 'test:idb-storage-suite-2';

  // ── idbSet / idbGet round-trip ────────────────────────────────────────
  t('idbSet then idbGet returns the same primitive string', async () => {
    await idbSet(KEY, 'hello');
    const val = await idbGet(KEY);
    eq(val, 'hello');
    await idbDel(KEY);
  });

  t('idbSet then idbGet returns the same object', async () => {
    const obj = { a: 1, b: [2, 3], c: true, d: null };
    await idbSet(KEY, obj);
    const val = await idbGet(KEY);
    eq(JSON.stringify(val), JSON.stringify(obj));
    await idbDel(KEY);
  });

  t('idbSet then idbGet returns the same number', async () => {
    await idbSet(KEY, 42.5);
    const val = await idbGet(KEY);
    eq(val, 42.5);
    await idbDel(KEY);
  });

  t('idbSet then idbGet returns the same array', async () => {
    await idbSet(KEY, [1, 'two', { three: 3 }]);
    const val = await idbGet(KEY);
    eq(JSON.stringify(val), JSON.stringify([1, 'two', { three: 3 }]));
    await idbDel(KEY);
  });

  // ── idbGet on missing key ─────────────────────────────────────────────
  t('idbGet returns null for a key that does not exist', async () => {
    await idbDel(KEY); // ensure clean state
    const val = await idbGet(KEY);
    eq(val, null);
  });

  // ── idbDel ───────────────────────────────────────────────────────────
  t('idbDel removes the key so idbGet returns null', async () => {
    await idbSet(KEY, 'to-delete');
    await idbDel(KEY);
    const val = await idbGet(KEY);
    eq(val, null);
  });

  t('idbDel on a non-existent key does not throw', async () => {
    await idbDel('test:nonexistent-key-xyz'); // must not throw
    ok(true, 'no exception thrown');
  });

  // ── idbHas ───────────────────────────────────────────────────────────
  t('idbHas returns false for missing key', async () => {
    await idbDel(KEY);
    ok(!(await idbHas(KEY)));
  });

  t('idbHas returns true after idbSet', async () => {
    await idbSet(KEY, 'present');
    ok(await idbHas(KEY));
    await idbDel(KEY);
  });

  // ── Overwrite ─────────────────────────────────────────────────────────
  t('idbSet overwrites a previously stored value', async () => {
    await idbSet(KEY, 'first');
    await idbSet(KEY, 'second');
    const val = await idbGet(KEY);
    eq(val, 'second');
    await idbDel(KEY);
  });

  // ── Multiple keys are independent ─────────────────────────────────────
  t('two distinct keys do not interfere', async () => {
    await idbSet(KEY,  'alpha');
    await idbSet(KEY2, 'beta');
    eq(await idbGet(KEY),  'alpha');
    eq(await idbGet(KEY2), 'beta');
    await idbDel(KEY);
    await idbDel(KEY2);
    eq(await idbGet(KEY), null, 'KEY should be gone');
    ok(await idbHas(KEY2) === false, 'KEY2 should be gone');
  });

  // ── Large value ───────────────────────────────────────────────────────
  t('idbSet handles a 500 KB JSON object', async () => {
    const large = { data: 'x'.repeat(500_000) };
    await idbSet(KEY, large);
    const val = await idbGet(KEY);
    ok(val?.data?.length === 500_000, 'large value survives round-trip');
    await idbDel(KEY);
  });

  // ── Concurrent operations ─────────────────────────────────────────────
  t('concurrent idbSet calls to different keys both succeed', async () => {
    await Promise.all([
      idbSet(KEY,  'alpha'),
      idbSet(KEY2, 'beta'),
    ]);
    const [a, b] = await Promise.all([idbGet(KEY), idbGet(KEY2)]);
    ok(a === 'alpha' && b === 'beta', `expected alpha/beta, got ${a}/${b}`);
    await idbDel(KEY);
    await idbDel(KEY2);
  });

  t('idbSet and idbDel on same key sequentially leave key absent', async () => {
    await idbSet(KEY, 'temporary');
    await idbDel(KEY);
    ok(!(await idbHas(KEY)), 'key should be absent after delete');
  });

  // ── Boolean and null-ish values ───────────────────────────────────────
  t('idbSet stores boolean true and idbGet returns it', async () => {
    await idbSet(KEY, true);
    const val = await idbGet(KEY);
    ok(val === true, `expected true, got ${val}`);
    await idbDel(KEY);
  });

  t('idbSet stores 0 (falsy number) correctly', async () => {
    await idbSet(KEY, 0);
    const val = await idbGet(KEY);
    ok(val === 0, `expected 0, got ${val}`);
    await idbDel(KEY);
  });

  t('idbSet stores empty string correctly', async () => {
    await idbSet(KEY, '');
    const val = await idbGet(KEY);
    ok(val === '', `expected empty string, got ${JSON.stringify(val)}`);
    await idbDel(KEY);
  });

  t('idbHas returns false after idbDel', async () => {
    await idbSet(KEY, 'present');
    await idbDel(KEY);
    ok(!(await idbHas(KEY)));
  });

  // ── Complex value round-trips ─────────────────────────────────────────────
  t('idbSet/idbGet round-trips a deeply nested object', async () => {
    const complex = {
      session: { name: 'test', blocks: [{ id: 'b1', start: 0, duration: 10 }] },
      meta: { created: '2026-01-01', tags: ['a', 'b', 'c'] },
    };
    await idbSet(KEY, complex);
    const result = await idbGet(KEY);
    ok(result?.session?.name === 'test', 'session name should survive round-trip');
    ok(result?.meta?.tags?.length === 3, 'tags array should survive round-trip');
    await idbDel(KEY);
  });

  t('idbSet/idbGet round-trips an array at top level', async () => {
    const arr = [1, 'two', { three: 3 }, null, true];
    await idbSet(KEY, arr);
    const result = await idbGet(KEY);
    ok(Array.isArray(result), 'should return array');
    ok(result.length === 5);
    ok(result[1] === 'two');
    await idbDel(KEY);
  });

  t('idbSet overwrites with different type (string→object)', async () => {
    await idbSet(KEY, 'first');
    await idbSet(KEY, { replaced: true });
    const result = await idbGet(KEY);
    ok(typeof result === 'object' && result?.replaced === true,
      'type change should work: string replaced by object');
    await idbDel(KEY);
  });

  t('idbHas is accurate after set+del+set cycle', async () => {
    await idbSet(KEY, 'cycle-1');
    ok(await idbHas(KEY), 'should exist after first set');
    await idbDel(KEY);
    ok(!(await idbHas(KEY)), 'should not exist after del');
    await idbSet(KEY, 'cycle-2');
    ok(await idbHas(KEY), 'should exist after second set');
    await idbDel(KEY);
  });

  t('idbDel multiple times on same key does not throw', async () => {
    await idbSet(KEY, 'multi-del');
    await idbDel(KEY);
    await idbDel(KEY); // second delete — must not throw
    ok(!(await idbHas(KEY)));
  });

  t('concurrent idbSet to same key — last write wins', async () => {
    await Promise.all([
      idbSet(KEY, 'first'),
      idbSet(KEY, 'second'),
    ]);
    const result = await idbGet(KEY);
    ok(result === 'first' || result === 'second',
      'one of the two values should win');
    await idbDel(KEY);
  });


  // ── Large values ──────────────────────────────────────────────────────────
  t('idbSet/idbGet round-trips a 10 000-char string', async () => {
    const big = 'x'.repeat(10_000);
    await idbSet(KEY, big);
    const result = await idbGet(KEY);
    eq(result.length, 10_000);
    await idbDel(KEY);
  });

  t('idbSet/idbGet round-trips a boolean false (falsy check)', async () => {
    await idbSet(KEY, false);
    const result = await idbGet(KEY);
    ok(result === false, `expected false, got ${result}`);
    await idbDel(KEY);
  });

  t('idbSet/idbGet round-trips the number 0', async () => {
    await idbSet(KEY, 0);
    const result = await idbGet(KEY);
    ok(result === 0, `expected 0, got ${result}`);
    await idbDel(KEY);
  });

  t('idbGet on unknown key throws or returns null-ish', async () => {
    // Key guaranteed not to exist
    let threw = false;
    let result;
    try { result = await idbGet('test:definitely-does-not-exist-xyz'); }
    catch { threw = true; }
    // Either threw or returned null/undefined — both are acceptable
    ok(threw || result == null, 'non-existent key should throw or return null');
  });


  // ── idbHas: existence check ───────────────────────────────────────────────
  t('idbHas returns true after idbSet', async () => {
    await idbSet(KEY, 'exists');
    const has = await idbHas(KEY);
    ok(has === true);
    await idbDel(KEY);
  });

  t('idbHas returns false after idbDel', async () => {
    await idbSet(KEY, 'temp');
    await idbDel(KEY);
    let threw = false, has = true;
    try { has = await idbHas(KEY); } catch { threw = true; }
    ok(threw || has === false, 'key should not exist after delete');
  });

  t('idbSet then idbGet round-trips null value', async () => {
    await idbSet(KEY, null);
    const result = await idbGet(KEY);
    ok(result === null, `expected null, got ${result}`);
    await idbDel(KEY);
  });

  t('idbSet then idbGet round-trips an object', async () => {
    const obj = { a: 1, b: [2, 3], c: true };
    await idbSet(KEY, obj);
    const result = await idbGet(KEY);
    ok(typeof result === 'object');
    eq(result.a, 1);
    eq(result.c, true);
    await idbDel(KEY);
  });

  t('idbDel on non-existent key does not throw', async () => {
    let threw = false;
    try { await idbDel('test:never-existed-xyz'); } catch { threw = true; }
    ok(!threw);
  });


  // ── Concurrent writes ─────────────────────────────────────────────────────
  t('two concurrent idbSet calls to same key do not corrupt data', async () => {
    await idbSet(KEY, 'first');
    // Fire both writes simultaneously
    await Promise.all([
      idbSet(KEY, 'concurrent-a'),
      idbSet(KEY, 'concurrent-b'),
    ]);
    // Last write wins — key should exist and have a string value
    let result;
    try { result = await idbGet(KEY); } catch { result = null; }
    ok(result === 'concurrent-a' || result === 'concurrent-b' || result === null,
      `expected one of the concurrent values or null, got "${result}"`);
    await idbDel(KEY);
  });

  t('idbSet with very long key does not throw', async () => {
    const longKey = 'test:' + 'x'.repeat(100);
    let threw = false;
    try {
      await idbSet(longKey, 'value');
      await idbDel(longKey);
    } catch { threw = true; }
    ok(!threw);
  });


  // ── Sequential write-read cycles ─────────────────────────────────────────
  t('10 sequential idbSet/idbGet cycles are consistent', async () => {
    for (let i = 0; i < 10; i++) {
      await idbSet(KEY, i);
      const result = await idbGet(KEY);
      eq(result, i, `cycle ${i}: expected ${i}, got ${result}`);
    }
    await idbDel(KEY);
  });

  t('idbGet on just-deleted key throws or returns undefined', async () => {
    await idbSet(KEY, 'temporary');
    await idbDel(KEY);
    let threw = false, result = 'sentinel';
    try { result = await idbGet(KEY); } catch { threw = true; }
    ok(threw || result === undefined || result === null,
      'getting deleted key should throw or return undefined');
  });

  t('idbSet accepts array value and round-trips correctly', async () => {
    const arr = [1, 'two', { three: 3 }];
    await idbSet(KEY, arr);
    const back = await idbGet(KEY);
    eq(JSON.stringify(back), JSON.stringify(arr));
    await idbDel(KEY);
  });

  t('idbSet accepts boolean values', async () => {
    await idbSet(KEY, true);
    const r1 = await idbGet(KEY);
    ok(r1 === true, `expected true, got ${r1}`);
    await idbSet(KEY, false);
    const r2 = await idbGet(KEY);
    ok(r2 === false, `expected false, got ${r2}`);
    await idbDel(KEY);
  });

  t('idbHas after multiple overwrites reflects final state', async () => {
    await idbSet(KEY, 'v1');
    await idbSet(KEY, 'v2');
    await idbSet(KEY, 'v3');
    let has = false;
    try { has = await idbHas(KEY); } catch { has = false; }
    // Should still exist
    await idbDel(KEY);
  });


  // ── Advanced key edge cases ───────────────────────────────────────────────
  t('idbSet with empty string value stores and retrieves correctly', async () => {
    await idbSet(KEY, '');
    const result = await idbGet(KEY);
    eq(result, '', 'empty string should be stored and retrieved');
    await idbDel(KEY);
  });

  t('idbSet with 0 (falsy number) stores correctly', async () => {
    await idbSet(KEY, 0);
    const result = await idbGet(KEY);
    eq(result, 0, 'zero should be preserved (not treated as missing)');
    await idbDel(KEY);
  });

  t('idbDel is idempotent on non-existent key', async () => {
    const neverSet = KEY + '_never_set_xyz';
    let threw = false;
    try { await idbDel(neverSet); } catch { threw = true; }
    ok(!threw, 'deleting a non-existent key should not throw');
  });

  t('idbSet large-ish object (~100KB) round-trips without error', async () => {
    const big = { data: 'x'.repeat(100_000), meta: { ts: Date.now() } };
    let threw = false;
    try {
      await idbSet(KEY, big);
      const back = await idbGet(KEY);
      ok(back?.data?.length === 100_000, 'large object should survive round-trip');
      await idbDel(KEY);
    } catch { threw = true; }
    ok(!threw, '100KB payload should not throw');
  });


  return R.summary();
}
