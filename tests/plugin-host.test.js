// ── tests/plugin-host.test.js ─────────────────────────────────────────────
// Tests for plugin-host.js — manifest validation, registration lifecycle,
// custom action/panel registration, storage API, and event dispatch.

import { makeRunner } from './harness.js';
import {
  validatePluginManifest, registerPlugin, unregisterPlugin,
  getRegisteredPlugins, getPlugin,
  getCustomActions, getCustomPanels, executeCustomAction,
  dispatchPluginEvent, CAPABILITY_GROUPS,
} from '../js/plugin-host.js';

export function runPluginHostTests() {
  const R  = makeRunner('plugin-host.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  // Clean up any lingering plugins between tests
  function cleanup(...ids) {
    for (const id of ids) unregisterPlugin(id);
  }

  function throws(fn, label) {
    try { fn(); ok(false, `${label}: expected throw but did not`); }
    catch { ok(true); }
  }

  // Minimal valid manifest
  function baseManifest(overrides = {}) {
    return { id: 'test-plugin', name: 'Test Plugin', version: '1.0.0', type: 'editor', ...overrides };
  }

  // ── CAPABILITY_GROUPS ──────────────────────────────────────────────────
  t('CAPABILITY_GROUPS is a non-empty array of strings', () => {
    ok(Array.isArray(CAPABILITY_GROUPS) && CAPABILITY_GROUPS.length > 0);
    ok(CAPABILITY_GROUPS.every(c => typeof c === 'string'));
  });

  // ── validatePluginManifest ─────────────────────────────────────────────
  t('validates a minimal correct manifest', () => {
    ok(validatePluginManifest(baseManifest()));
  });

  t('rejects null manifest', () => {
    let threw = false;
    try { validatePluginManifest(null); } catch { threw = true; }
    ok(threw, 'null manifest should throw');
  });

  t('rejects missing id', () => {
    let threw = false;
    try { validatePluginManifest({ name: 'X', version: '1', type: 'editor' }); } catch { threw = true; }
    ok(threw);
  });

  t('rejects missing name', () => {
    let threw = false;
    try { validatePluginManifest({ id: 'x', version: '1', type: 'editor' }); } catch { threw = true; }
    ok(threw);
  });

  t('rejects id with uppercase letters', () => {
    let threw = false;
    try { validatePluginManifest(baseManifest({ id: 'MyPlugin' })); } catch { threw = true; }
    ok(threw, 'uppercase id must be rejected');
  });

  t('rejects id with spaces', () => {
    let threw = false;
    try { validatePluginManifest(baseManifest({ id: 'my plugin' })); } catch { threw = true; }
    ok(threw);
  });

  t('accepts id with dashes and underscores', () => {
    ok(validatePluginManifest(baseManifest({ id: 'my-plugin_v2' })));
  });

  t('rejects id shorter than 2 chars', () => {
    let threw = false;
    try { validatePluginManifest(baseManifest({ id: 'x' })); } catch { threw = true; }
    ok(threw);
  });

  t('rejects unknown plugin type', () => {
    let threw = false;
    try { validatePluginManifest(baseManifest({ type: 'widget' })); } catch { threw = true; }
    ok(threw);
  });

  t('accepts all valid plugin types', () => {
    for (const type of ['timeline-action', 'io', 'importer', 'editor']) {
      ok(validatePluginManifest(baseManifest({ id: `test-${type}`, type })));
    }
  });

  t('rejects non-array capabilities', () => {
    let threw = false;
    try { validatePluginManifest(baseManifest({ capabilities: 'editor.panels' })); } catch { threw = true; }
    ok(threw);
  });

  t('rejects unknown capability', () => {
    let threw = false;
    try { validatePluginManifest(baseManifest({ capabilities: ['editor.panels', 'hack.everything'] })); } catch { threw = true; }
    ok(threw);
  });

  t('accepts known capabilities', () => {
    ok(validatePluginManifest(baseManifest({ capabilities: ['editor.panels', 'storage.plugin'] })));
  });

  // ── registerPlugin ─────────────────────────────────────────────────────
  t('registerPlugin returns true for a valid plugin', () => {
    cleanup('test-plugin');
    const result = registerPlugin(baseManifest(), () => ({}));
    ok(result === true);
    cleanup('test-plugin');
  });

  t('registerPlugin returns false for invalid manifest', () => {
    const result = registerPlugin({ id: 'BAD ID!' }, () => ({}));
    ok(result === false);
  });

  t('registerPlugin calls onInit on the handlers', () => {
    cleanup('test-plugin');
    let called = false;
    registerPlugin(baseManifest(), () => ({ onInit: () => { called = true; } }));
    ok(called, 'onInit should be called during registration');
    cleanup('test-plugin');
  });

  t('registerPlugin prevents duplicate id registration', () => {
    cleanup('test-plugin');
    registerPlugin(baseManifest(), () => ({}));
    const second = registerPlugin(baseManifest(), () => ({}));
    ok(second === false, 'duplicate registration should fail');
    cleanup('test-plugin');
  });

  t('getRegisteredPlugins includes the newly registered plugin', () => {
    cleanup('test-plugin');
    registerPlugin(baseManifest(), () => ({}));
    const plugins = getRegisteredPlugins();
    ok(plugins.some(p => p.id === 'test-plugin'));
    cleanup('test-plugin');
  });

  t('getPlugin returns the registered plugin', () => {
    cleanup('test-plugin');
    registerPlugin(baseManifest(), () => ({}));
    const p = getPlugin('test-plugin');
    ok(p !== null);
    eq(p.manifest.name, 'Test Plugin');
    cleanup('test-plugin');
  });

  t('getPlugin returns null for unknown id', () => {
    eq(getPlugin('no-such-plugin'), null);
  });

  // ── unregisterPlugin ───────────────────────────────────────────────────
  t('unregisterPlugin calls onDispose', () => {
    cleanup('test-plugin');
    let disposed = false;
    registerPlugin(baseManifest(), () => ({ onDispose: () => { disposed = true; } }));
    unregisterPlugin('test-plugin');
    ok(disposed);
  });

  t('unregisterPlugin removes the plugin from registry', () => {
    cleanup('test-plugin');
    registerPlugin(baseManifest(), () => ({}));
    unregisterPlugin('test-plugin');
    eq(getPlugin('test-plugin'), null);
  });

  t('unregisterPlugin returns false for unknown id', () => {
    ok(unregisterPlugin('no-such-plugin') === false);
  });

  // ── Custom action registration ─────────────────────────────────────────
  t('registerTimelineAction adds action to getCustomActions()', () => {
    cleanup('action-plugin');
    registerPlugin(
      baseManifest({ id: 'action-plugin', type: 'timeline-action', capabilities: ['timeline.actions'] }),
      ctx => {
        ctx.registerTimelineAction({
          type: 'myCustomAction',
          label: 'My Custom Action',
          executeHandler: () => {},
        });
        return {};
      }
    );
    ok(getCustomActions().some(a => a.type === 'myCustomAction'));
    cleanup('action-plugin');
  });

  t('executeCustomAction calls the handler', () => {
    cleanup('action-plugin');
    let called = false;
    registerPlugin(
      baseManifest({ id: 'action-plugin', type: 'timeline-action', capabilities: ['timeline.actions'] }),
      ctx => {
        ctx.registerTimelineAction({ type: 'myAction', label: 'X', executeHandler: () => { called = true; } });
        return {};
      }
    );
    executeCustomAction('myAction', null, null);
    ok(called);
    cleanup('action-plugin');
  });

  t('executeCustomAction returns false for unknown action', () => {
    ok(executeCustomAction('unknownAction', null, null) === false);
  });

  t('unregisterPlugin removes custom actions', () => {
    cleanup('action-plugin');
    registerPlugin(
      baseManifest({ id: 'action-plugin', type: 'timeline-action', capabilities: ['timeline.actions'] }),
      ctx => { ctx.registerTimelineAction({ type: 'tempAction', label: 'T', executeHandler: () => {} }); return {}; }
    );
    unregisterPlugin('action-plugin');
    ok(!getCustomActions().some(a => a.type === 'tempAction'));
  });

  // ── Plugin-scoped storage ──────────────────────────────────────────────
  t('plugin storage.set and storage.get round-trip', async () => {
    cleanup('storage-plugin');
    let ctxRef = null;
    registerPlugin(
      baseManifest({ id: 'storage-plugin', capabilities: ['storage.plugin'] }),
      ctx => { ctxRef = ctx; return {}; }
    );
    await ctxRef.storage.set('key', { value: 42 });
    const val = await ctxRef.storage.get('key');
    ok(val?.value === 42);
    await ctxRef.storage.remove('key');
    const gone = await ctxRef.storage.get('key');
    ok(gone === null, 'value should be gone after remove');
    cleanup('storage-plugin');
  });

  // ── Event dispatch ─────────────────────────────────────────────────────
  t('dispatchPluginEvent calls onRuntimeEvent on all registered plugins', () => {
    cleanup('evt-plugin');
    let receivedEvent = null;
    registerPlugin(baseManifest({ id: 'evt-plugin' }), () => ({
      onRuntimeEvent: (name) => { receivedEvent = name; }
    }));
    dispatchPluginEvent('session:start', { duration: 60 });
    eq(receivedEvent, 'session:start');
    cleanup('evt-plugin');
  });

  t('dispatchPluginEvent does not throw if plugin has no onRuntimeEvent', () => {
    cleanup('no-handler-plugin');
    registerPlugin(baseManifest({ id: 'no-handler-plugin' }), () => ({}));
    dispatchPluginEvent('block:start'); // must not throw
    ok(true);
    cleanup('no-handler-plugin');
  });

  // ── metrics.write capability ───────────────────────────────────────────
  t('metrics.write context is null without the capability', () => {
    cleanup('no-metrics-plugin');
    let ctxRef = null;
    registerPlugin(baseManifest({ id: 'no-metrics-plugin' }), ctx => { ctxRef = ctx; return {}; });
    ok(ctxRef.metrics === null, 'metrics context should be null without metrics.write cap');
    cleanup('no-metrics-plugin');
  });

  t('metrics.write context is an object when capability declared', () => {
    cleanup('metrics-plugin');
    let ctxRef = null;
    registerPlugin(
      baseManifest({ id: 'metrics-plugin', capabilities: ['metrics.write'] }),
      ctx => { ctxRef = ctx; return {}; }
    );
    ok(ctxRef.metrics !== null && typeof ctxRef.metrics.push === 'function');
    cleanup('metrics-plugin');
  });

  t('metrics.write.push returns imported/skipped counts', async () => {
    cleanup('metrics-push-plugin');
    let ctxRef = null;
    registerPlugin(
      baseManifest({ id: 'metrics-push-plugin', capabilities: ['metrics.write'] }),
      ctx => { ctxRef = ctx; return {}; }
    );
    const result = await ctxRef.metrics.push([
      { date: '2026-01-15', totalRuntimeSec: 1800, avgIntensityPct: 60 },
    ]);
    ok(result.imported === 1, `expected 1 imported, got ${result.imported}`);
    eq(result.skipped, 0);
    cleanup('metrics-push-plugin');
  });

  t('metrics.write.push skips records with invalid dates', async () => {
    cleanup('metrics-invalid-plugin');
    let ctxRef = null;
    registerPlugin(
      baseManifest({ id: 'metrics-invalid-plugin', capabilities: ['metrics.write'] }),
      ctx => { ctxRef = ctx; return {}; }
    );
    const result = await ctxRef.metrics.push([
      { totalRuntimeSec: 600 }, // missing date
    ]);
    eq(result.imported, 0);
    eq(result.skipped, 1);
    cleanup('metrics-invalid-plugin');
  });

  t('CAPABILITY_GROUPS includes metrics.write', () => {
    ok(CAPABILITY_GROUPS.includes('metrics.write'));
  });

  // ── CAPABILITY_GROUPS completeness ───────────────────────────────────────
  t('CAPABILITY_GROUPS has exactly 9 entries', () => {
    const { CAPABILITY_GROUPS } = require || {};
    // Already imported above — just check from the known list
    const KNOWN = [
      'dom.overlay','session.read','session.write','audio.play','audio.capture',
      'network.fetch','storage.local','input.keyboard','metrics.write'
    ];
    ok(CAPABILITY_GROUPS.length === KNOWN.length,
      `expected ${KNOWN.length} capabilities, got ${CAPABILITY_GROUPS.length}`);
  });

  t('every CAPABILITY_GROUPS entry is a non-empty string', () => {
    for (const cap of CAPABILITY_GROUPS) {
      ok(typeof cap === 'string' && cap.length > 0, `invalid capability: "${cap}"`);
    }
  });

  t('CAPABILITY_GROUPS includes metrics.write', () => {
    ok(CAPABILITY_GROUPS.includes('metrics.write'));
  });

  t('CAPABILITY_GROUPS includes dom.overlay', () => {
    ok(CAPABILITY_GROUPS.includes('dom.overlay'));
  });

  t('CAPABILITY_GROUPS does not include unknown capabilities', () => {
    ok(!CAPABILITY_GROUPS.includes('system.exec'));
    ok(!CAPABILITY_GROUPS.includes('network.arbitrary'));
  });


  // ── Storage key sanitization ──────────────────────────────────────────────
  t('registerPlugin with storage.plugin capability does not throw', () => {
    const manifest = {
      id: 'test-store', name: 'Test Store', version: '1.0.0',
      type: 'io.outputs', capabilities: ['storage.plugin'],
    };
    let threw = false;
    try {
      registerPlugin(manifest, (ctx) => {
        ok(ctx.storage !== null, 'storage context should be provided');
        ok(typeof ctx.storage.get === 'function');
        ok(typeof ctx.storage.set === 'function');
        ok(typeof ctx.storage.remove === 'function');
      });
    } catch { threw = true; }
    ok(!threw);
    unregisterPlugin('test-store');
  });

  t('plugin without storage.plugin capability gets null storage', () => {
    const manifest = {
      id: 'test-nostorage', name: 'No Storage', version: '1.0.0',
      type: 'io.outputs', capabilities: [],
    };
    let storageCtx = 'not-checked';
    registerPlugin(manifest, (ctx) => { storageCtx = ctx.storage; });
    ok(storageCtx === null, 'storage should be null without capability');
    unregisterPlugin('test-nostorage');
  });

  t('validatePluginManifest rejects id with uppercase', () => {
    throws(() => validatePluginManifest({
      id: 'MyPlugin', name: 'Test', version: '1.0.0', type: 'io.outputs'
    }), 'uppercase id should throw');
  });

  t('validatePluginManifest rejects unknown capability', () => {
    throws(() => validatePluginManifest({
      id: 'test-caps', name: 'Test', version: '1.0.0', type: 'io.outputs',
      capabilities: ['system.exec'],
    }), 'unknown capability should throw');
  });


  return R.summary();
}
