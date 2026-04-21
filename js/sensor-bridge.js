// ── sensor-bridge.js ────────────────────────────────────────────────────────
// Phase 5.3 — Advanced Triggers: Sensor-Driven Events
//
// Connects to an external WebSocket server that pushes real-time biometric or
// device sensor data. Received values are injected into the state-engine via
// setExternalSignal() and influence engagement scoring and rule conditions.
//
// Message format (JSON):
//   { "signal": "heartRate", "value": 0.75, "weight": 0.4 }
//   { "signal": "gsr",       "value": 0.30, "weight": 0.3 }
//   { "signals": [ { "signal": "...", "value": 0, "weight": 0 }, ... ] }
//   { "variable": "score", "value": 10 }   ← sets a session variable directly
//
// Values must be normalised 0–1 by the external source.
// The bridge applies them into state.engineState via setExternalSignal,
// which folds them into the engagement score on the next tickStateEngine() call.
//
// Multiple signals are supported simultaneously — each named signal has its own
// IIR decay so stale sensor data fades out gracefully if the connection drops.

import { setExternalSignal, clearExternalSignals } from './state-engine.js';
import { setVariable } from './variables.js';
import { notify } from './notify.js';
import { state, esc, persist } from './state.js';
import { history } from './history.js';

// ── Configuration ─────────────────────────────────────────────────────────────
const RECONNECT_DELAY_MS = 3000;
const STALE_SIGNAL_TTL   = 5000; // ms — a signal not refreshed within this window is cleared
const DEFAULT_WS_URL     = 'ws://localhost:8765';

// ── State ─────────────────────────────────────────────────────────────────────
let _ws          = null;
let _wsUrl       = null;
let _reconnTimer = null;
let _reconnCount = 0;
let _autoReconn  = false;
let _onStatus    = null; // (status: string, connected: boolean) => void

// Per-signal last-seen timestamps for stale detection
const _signalTimestamps = {}; // name → ms

// ── Exported status ───────────────────────────────────────────────────────────
export function isBridgeConnected() { return _ws?.readyState === WebSocket.OPEN; }
export function getBridgeUrl()      { return _wsUrl; }

// ── Connect ───────────────────────────────────────────────────────────────────
export function connectSensorBridge(wsUrl = DEFAULT_WS_URL, { autoReconnect = true, onStatus } = {}) {
  if (_ws) disconnectSensorBridge();
  _wsUrl      = wsUrl;
  _autoReconn = autoReconnect;
  _onStatus   = onStatus ?? null;
  _doConnect();
}

function _doConnect() {
  _ws = new WebSocket(_wsUrl);

  _ws.addEventListener('open', () => {
    _reconnCount = 0;
    clearTimeout(_reconnTimer);
    _emit(`Sensor bridge connected to ${_wsUrl}`, true);
    notify.info(`🔗 Sensor bridge connected: ${_wsUrl}`, 3000);
  });

  _ws.addEventListener('message', e => {
    try {
      const msg = JSON.parse(e.data);
      _handleMessage(msg);
    } catch {
      // Ignore malformed messages
    }
  });

  _ws.addEventListener('close', () => {
    _emit('Sensor bridge disconnected.', false);
    _clearStaleSignals(true); // force-clear all signals on disconnect
    if (_autoReconn) {
      _reconnCount++;
      const delay = Math.min(RECONNECT_DELAY_MS * _reconnCount, 30_000);
      _emit(`Reconnecting in ${(delay / 1000).toFixed(0)}s… (attempt ${_reconnCount})`, false);
      _reconnTimer = setTimeout(_doConnect, delay);
    }
  });

  _ws.addEventListener('error', () => {
    // error fires before close — the close handler will attempt reconnect
  });
}

// ── Message handler ────────────────────────────────────────────────────────────
function _handleMessage(msg) {
  // Batch signals
  if (Array.isArray(msg.signals)) {
    for (const s of msg.signals) _applySignal(s);
    return;
  }

  // Single signal: { signal, value, weight? }
  if (typeof msg.signal === 'string' && typeof msg.value === 'number') {
    _applySignal(msg);
    return;
  }

  // Variable setter: { variable, value }
  // Validate the name against the allowed pattern before writing to session state
  if (typeof msg.variable === 'string' && msg.value !== undefined) {
    const VAR_NAME_RE = /^[a-z_][a-z0-9_]{0,31}$/;
    if (VAR_NAME_RE.test(msg.variable)) {
      setVariable(msg.variable, msg.value);
    }
    return;
  }
}

function _applySignal({ signal, value, weight = 0.3 }) {
  if (typeof signal !== 'string' || !Number.isFinite(value)) return;
  // Only accept known signal names to prevent arbitrary state injection from the WS peer
  const ALLOWED_SIGNALS = new Set(['attention','engagement','intensity','heartRate','gsr','breath','custom1','custom2','custom3']);
  if (!ALLOWED_SIGNALS.has(signal)) return;
  const clamped = Math.max(0, Math.min(1, value));
  const w       = Math.max(0, Math.min(1, Number.isFinite(weight) ? weight : 0.3));
  setExternalSignal(signal, clamped, w);
  _signalTimestamps[signal] = Date.now();
}

// ── Stale signal pruning ──────────────────────────────────────────────────────
// Called on each RAF tick via tickSensorBridge(); clears signals that haven't
// been refreshed within STALE_SIGNAL_TTL ms, preventing ghost inputs after
// sensor disconnects or network jitter.
export function tickSensorBridge() {
  if (!isBridgeConnected()) return;
  const now   = Date.now();
  let staled  = false;
  for (const [name, ts] of Object.entries(_signalTimestamps)) {
    if (now - ts > STALE_SIGNAL_TTL) {
      delete _signalTimestamps[name];
      staled = true;
    }
  }
  // If all signals are stale, clear the external signal state entirely
  if (staled && Object.keys(_signalTimestamps).length === 0) {
    clearExternalSignals();
  }
}

function _clearStaleSignals(force = false) {
  if (force || Object.keys(_signalTimestamps).length === 0) {
    clearExternalSignals();
    for (const k of Object.keys(_signalTimestamps)) delete _signalTimestamps[k];
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────
export function disconnectSensorBridge() {
  _autoReconn = false;
  clearTimeout(_reconnTimer);
  if (_ws) { _ws.close(); _ws = null; }
  _clearStaleSignals(true);
  _emit('Sensor bridge disconnected.', false);
}

// ── Status notification helper ────────────────────────────────────────────────
function _emit(message, connected) {
  _onStatus?.(message, connected);
}

// ── Settings panel renderer ───────────────────────────────────────────────────
export function renderSensorBridgePanel(containerId = 'sensorBridgePanel') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const connected = isBridgeConnected();
  // Use the saved displayOptions URL directly (state is now properly imported)
  const savedUrl  = state?.session?.displayOptions?.sensorBridgeUrl ?? DEFAULT_WS_URL;
  const url       = _wsUrl ?? savedUrl;
  // Escape URL for safe injection into HTML attribute
  const safeUrl   = url.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  el.innerHTML = `
    <div class="insp-block-name">🔗 Sensor Bridge</div>
    <p style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:10px">
      Connect to a WebSocket sensor server to inject real-time biometric or device data
      into the engagement engine. Signals influence rules and the attention score.
    </p>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
        background:${connected ? '#7dc87a' : 'rgba(255,255,255,0.15)'}"></div>
      <span style="font-size:11px;color:var(--text2)">
        ${connected ? `Connected — ${esc(url)}` : 'Not connected'}
      </span>
    </div>
    <div style="display:flex;gap:5px;margin-bottom:8px">
      <input id="sb_url" type="text" value="${safeUrl}"
        placeholder="${DEFAULT_WS_URL}"
        style="flex:1;font-size:11px;font-family:var(--mono)" />
      <button id="sb_connect" class="${connected ? '' : 'btn-accent'}"
        style="font-size:11px;white-space:nowrap">
        ${connected ? 'Disconnect' : '⚡ Connect'}
      </button>
    </div>
    <div style="font-size:10px;color:var(--text3);line-height:1.5">
      Expected message format:<br>
      <code style="font-size:9.5px;background:rgba(255,255,255,0.05);padding:2px 5px;border-radius:3px;display:block;margin-top:3px">
        {"signal":"heartRate","value":0.75,"weight":0.4}
      </code>
    </div>`;

  el.querySelector('#sb_connect')?.addEventListener('click', () => {
    if (isBridgeConnected()) {
      disconnectSensorBridge();
    } else {
      const inputUrl = el.querySelector('#sb_url')?.value?.trim() || DEFAULT_WS_URL;
      // Validate URL before persisting — mirrors the same check in normalizeSession.
      const safeUrl = /^wss?:\/\/./.test(inputUrl) ? inputUrl.slice(0, 200) : DEFAULT_WS_URL;
      // Write URL back to session settings so it persists across reconnects
      if (state?.session?.displayOptions) {
        history.push();
        state.session.displayOptions.sensorBridgeUrl = safeUrl;
        persist();
        // Sync the saved settings field if visible
        const savedField = document.getElementById('s_sensorBridgeUrl');
        if (savedField) savedField.value = safeUrl;
      }
      connectSensorBridge(safeUrl, {
        autoReconnect: true,
        onStatus: (msg, conn) => {
          renderSensorBridgePanel(containerId);
          if (!conn) notify.warn(`Sensor bridge: ${msg}`, 4000);
        },
      });
    }
    setTimeout(() => renderSensorBridgePanel(containerId), 200);
  });
}
