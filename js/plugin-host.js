// ── plugin-host.js ─────────────────────────────────────────────────────────
// Phase 3 Plugin System — foundation layer.
// Implements the manifest format and host API per the design in TODO-5.txt.
//
// Plugins interact exclusively through this module's registerPlugin() call.
// The host API surface is intentionally narrow: plugins cannot reach raw
// state, playback internals, or DOM outside their registered panels.
//
// Current support: capability declaration, safe context, event dispatch.
// Not yet implemented: IO/device API (Phase 3 Step 5), importer API (Step 4).

import { notify } from './notify.js';
import { idbGet, idbSet, idbDel } from './idb-storage.js';
import { importExternalMetrics } from './metrics-history.js';

// ── Capability groups (match TODO-5 recommended list) ──────────────────────
export const CAPABILITY_GROUPS = [
  'timeline.actions',    // register custom block/action types
  'timeline.conditions', // register custom rule condition metrics
  'import.read',         // register new file format importers
  'editor.panels',       // register custom inspector panels
  'editor.inspectors',   // register block-type-specific inspector renderers
  'io.inputs',           // register sensor/device input sources  (future)
  'io.outputs',          // register haptic/device output sinks    (future)
  'assets.resolve',      // register asset resolution strategies   (future)
  'storage.plugin',      // access to plugin-scoped localStorage
  'settings',            // register a settings panel entry
  'metrics.write',       // push daily metric records into the metrics history
];

// ── Manifest schema ───────────────────────────────────────────────────────────
// { id, name, version, entrypoint, type, capabilities[], minAppVersion? }
// type: 'timeline-action' | 'io' | 'importer' | 'editor'

const REQUIRED_MANIFEST_FIELDS = ['id', 'name', 'version', 'type'];
const VALID_PLUGIN_TYPES = ['timeline-action', 'io', 'importer', 'editor'];

export function validatePluginManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Plugin manifest must be a plain object.');
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field]) throw new Error(`Plugin manifest missing required field: "${field}".`);
  }
  if (typeof manifest.id !== 'string' || !/^[a-z0-9_-]{2,64}$/.test(manifest.id)) {
    throw new Error(`Plugin id must be 2–64 lowercase alphanumeric/dash/underscore characters.`);
  }
  if (!VALID_PLUGIN_TYPES.includes(manifest.type)) {
    throw new Error(`Plugin type "${manifest.type}" is not valid. Must be one of: ${VALID_PLUGIN_TYPES.join(', ')}.`);
  }
  if (manifest.capabilities !== undefined && !Array.isArray(manifest.capabilities)) {
    throw new Error('Plugin manifest "capabilities" must be an array if present.');
  }
  const unknownCaps = (manifest.capabilities ?? []).filter(c => !CAPABILITY_GROUPS.includes(c));
  if (unknownCaps.length) {
    throw new Error(`Plugin declares unknown capabilities: ${unknownCaps.join(', ')}.`);
  }
  return true; // valid
}

// ── Plugin registry ───────────────────────────────────────────────────────────
const _plugins = new Map(); // id → { manifest, handlers, context }

export function getRegisteredPlugins() {
  return [..._plugins.values()].map(p => ({
    id:           p.manifest.id,
    name:         p.manifest.name,
    version:      p.manifest.version,
    type:         p.manifest.type,
    capabilities: p.manifest.capabilities ?? [],
  }));
}

export function getPlugin(id) {
  return _plugins.get(id) ?? null;
}

// ── Safe host context factory ─────────────────────────────────────────────────
// Each plugin receives its own scoped context object. The context is the ONLY
// bridge between plugin code and the host app. Plugins must not be given direct
// references to state, playback, or DOM outside their declared panels.

function _makeContext(manifest) {
  const pluginId = manifest.id;
  const caps = new Set(manifest.capabilities ?? []);

  const ctx = {
    // ── Logging ──────────────────────────────────────────────────────────
    log: {
      info:  (...args) => console.info(`[plugin:${pluginId}]`, ...args),
      warn:  (...args) => console.warn(`[plugin:${pluginId}]`, ...args),
      error: (...args) => console.error(`[plugin:${pluginId}]`, ...args),
    },

    // ── Notifications (toast only — no modal access) ─────────────────────
    notify: {
      info:    msg => notify.info(`[${manifest.name}] ${msg}`),
      success: msg => notify.success(`[${manifest.name}] ${msg}`),
      warn:    msg => notify.warn(`[${manifest.name}] ${msg}`),
      error:   msg => notify.error(`[${manifest.name}] ${msg}`),
    },

    // ── Plugin-scoped storage ─────────────────────────────────────────────
    // Each plugin gets its own IDB keyspace: `plugin:<id>:<key>`
    storage: caps.has('storage.plugin') ? (() => {
      // Sanitize user-supplied key: strip colons and path-like characters so a
      // plugin cannot escape its own keyspace (plugin:<id>:<key>).
      const sanitizeKey = k => String(k).replace(/[:/\\]/g, '_').slice(0, 128);
      return {
        async get(key) {
          return idbGet(`plugin:${pluginId}:${sanitizeKey(key)}`);
        },
        async set(key, value) {
          await idbSet(`plugin:${pluginId}:${sanitizeKey(key)}`, value);
          return true;
        },
        async remove(key) {
          await idbDel(`plugin:${pluginId}:${sanitizeKey(key)}`);
        },
      };
    })() : null,

    // ── Timeline action registration ──────────────────────────────────────
    // Returns a handle to register a custom action type that appears in
    // the rules engine and trigger inspector action dropdowns.
    registerTimelineAction: caps.has('timeline.actions') ? (spec) => {
      // spec: { type, label, executeHandler(param, runtime) }
      if (!spec?.type || !spec?.label || typeof spec.executeHandler !== 'function') {
        throw new Error('registerTimelineAction: spec must have type, label, executeHandler.');
      }
      _customActions.set(spec.type, { ...spec, pluginId });
      ctx.log.info(`Registered timeline action: ${spec.type}`);
    } : null,

    // ── Editor panel registration ─────────────────────────────────────────
    // Returns a handle to mount an HTML string into a named inspector slot.
    registerEditorPanel: caps.has('editor.panels') ? (spec) => {
      // spec: { id, label, render() → htmlString }
      if (!spec?.id || !spec?.label || typeof spec.render !== 'function') {
        throw new Error('registerEditorPanel: spec must have id, label, render().');
      }
      _customPanels.set(spec.id, { ...spec, pluginId });
      ctx.log.info(`Registered editor panel: ${spec.id}`);
    } : null,

    // ── Metrics write API ─────────────────────────────────────────────────
    // Allows plugins to push device or external metrics into the history.
    // records: [{ date:'YYYY-MM-DD', totalRuntimeSec?, avgIntensityPct?,
    //             avgEngagement?, avgAttentionStability?, sessionCount? }]
    metrics: caps.has('metrics.write') ? {
      async push(records, retainDays = 180) {
        const result = await importExternalMetrics(records, `plugin:${pluginId}`, retainDays);
        if (result.imported > 0) {
          ctx.log.info(`Pushed ${result.imported} metric record(s) to history.`);
        }
        if (result.errors.length) {
          ctx.log.warn(`${result.errors.length} record(s) skipped: ${result.errors[0]}`);
        }
        return result;
      },
    } : null,
  };

  return ctx;
}

// ── Custom action and panel registries ────────────────────────────────────────
const _customActions = new Map(); // type → { type, label, executeHandler, pluginId }
const _customPanels  = new Map(); // id → { id, label, render, pluginId }

export function getCustomActions() { return [..._customActions.values()]; }
export function getCustomPanels()  { return [..._customPanels.values()]; }

// Execute a custom action registered by a plugin.
// Called by rules-engine or trigger-windows when action.type matches a custom type.
export function executeCustomAction(actionType, param, runtime) {
  const action = _customActions.get(actionType);
  if (!action) return false;
  try {
    action.executeHandler(param, runtime);
    return true;
  } catch (err) {
    notify.error(`Plugin action "${actionType}" threw: ${err.message}`);
    return false;
  }
}

// ── Main registration entry point ─────────────────────────────────────────────
// Called by plugin code: registerPlugin(manifest, setup)
// setup(context) should return an optional handlers object.
export function registerPlugin(manifest, setup) {
  try {
    validatePluginManifest(manifest);
  } catch (err) {
    notify.error(`Plugin registration failed: ${err.message}`);
    return false;
  }

  if (_plugins.has(manifest.id)) {
    notify.warn(`Plugin "${manifest.id}" is already registered. Skipping.`);
    return false;
  }

  const context  = _makeContext(manifest);
  let handlers   = {};
  try {
    handlers = setup(context) ?? {};
  } catch (err) {
    notify.error(`Plugin "${manifest.name}" setup() threw: ${err.message}`);
    return false;
  }

  _plugins.set(manifest.id, { manifest, handlers, context });

  // Call onInit if provided
  try { handlers.onInit?.(); } catch (err) {
    notify.warn(`Plugin "${manifest.name}" onInit() threw: ${err.message}`);
  }

  notify.success(`Plugin "${manifest.name}" v${manifest.version} loaded.`);
  return true;
}

// ── Lifecycle: dispose a plugin ───────────────────────────────────────────────
export function unregisterPlugin(id) {
  const entry = _plugins.get(id);
  if (!entry) return false;
  try { entry.handlers.onDispose?.(); } catch {}
  // Remove its custom actions and panels
  for (const [key, val] of _customActions) { if (val.pluginId === id) _customActions.delete(key); }
  for (const [key, val] of _customPanels)  { if (val.pluginId === id) _customPanels.delete(key); }
  _plugins.delete(id);
  notify.info(`Plugin "${entry.manifest.name}" unloaded.`);
  return true;
}

// ── Runtime event dispatch ───────────────────────────────────────────────────
// Call this from playback.js at key lifecycle points so plugins can react.
// Events: 'session:start', 'session:stop', 'block:start', 'block:end', 'scene:enter'
export function dispatchPluginEvent(eventName, data = {}) {
  for (const { manifest, handlers } of _plugins.values()) {
    try {
      handlers.onRuntimeEvent?.(eventName, data);
    } catch (err) {
      console.error(`[plugin:${manifest.id}] onRuntimeEvent(${eventName}) threw:`, err);
    }
  }
}
