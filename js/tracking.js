// ── tracking.js ────────────────────────────────────────────────────────────
// Webcam attention tracking with a formal state machine.
//
// States:
//   idle        → not started
//   requesting  → getUserMedia in flight
//   warming_up  → camera live, stabilising (1.5s grace)
//   detecting   → face present
//   lost        → face absent, below threshold
//   unavailable → no FaceDetector API (preview-only)
//   error       → permission denied or device fault

import { state, $id } from './state.js';
import { pausePlayback, resumePlayback } from './playback.js';
import { toggleFsPause, injectMacro, getSlotMacro } from './macros.js';
import { setAttention } from './state-engine.js';
import { notify } from './notify.js';
import { notifyAttentionLost, notifyAttentionReturned } from './session-analytics.js';

let _activeModule = null;

export function makeTrackingModule() {
  // Stop previous instance before creating a new one
  if (_activeModule) { _activeModule.stop(); _activeModule = null; }

  let stream       = null;
  let raf          = 0;
  let _running     = false;  // explicit flag to guard async loop re-entry after stop()
  let warmupTimer  = null;
  let lastSeen     = 0;
  let lossInjected    = false;
  let returnInjected  = false;
  let wasSessionPaused = false;
  let wasFsPaused      = false;

  const hasFD = 'FaceDetector' in window;
  let detector = null;
  if (hasFD) {
    try { detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); } catch {}
  }

  const pv  = $id('trackingPreview');
  const oc  = $id('trackingOverlay');
  const ctx = oc?.getContext('2d');

  // ── State ──────────────────────────────────────────────────────────────────
  let _st = 'idle';

  const STATE_META = {
    idle:        { camera: 'Off',       face: 'Unknown',       faceColor: null       },
    requesting:  { camera: 'Starting…', face: 'Requesting…',   faceColor: '#f0a04a'  },
    warming_up:  { camera: 'Live',      face: 'Warming up…',   faceColor: '#f0a04a'  },
    detecting:   { camera: 'Live',      face: 'Detected',      faceColor: '#7dc87a'  },
    lost:        { camera: 'Live',      face: 'Not detected',  faceColor: '#e07a5f'  },
    unavailable: { camera: 'Live',      face: 'Preview only',  faceColor: null       },
    error:       { camera: 'Error',     face: 'Error',         faceColor: '#e05050'  },
  };

  function transition(s) {
    _st = s;
    const m = STATE_META[s] || STATE_META.idle;
    const cs = $id('cameraStatus');      if (cs) cs.textContent = m.camera;
    const fs = $id('faceStatus');
    if (fs) { fs.textContent = m.face + (hasFD ? '' : ' (no API)'); fs.style.color = m.faceColor ?? ''; }
    const wu = $id('trackingWarmup');    if (wu) wu.style.display = s === 'warming_up' ? 'flex' : 'none';
    if (s === 'idle' || s === 'detecting') {
      const al = $id('attentionLossDisplay'); if (al) al.textContent = '0.0s';
    }
  }

  // ── Canvas ─────────────────────────────────────────────────────────────────
  function resizeCanvas() {
    if (!oc || !pv) return;
    const r = pv.getBoundingClientRect();
    oc.width = r.width; oc.height = r.height;
  }

  function drawFaceBox(box) {
    if (!ctx || !pv) return;
    const sx = oc.width / (pv.videoWidth || 1), sy = oc.height / (pv.videoHeight || 1);
    ctx.strokeStyle = state.session.accentColor || '#f0a04a';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x*sx, box.y*sy, box.width*sx, box.height*sy);
  }

  // ── Start / Stop ───────────────────────────────────────────────────────────
  async function start() {
    if (_st !== 'idle' && _st !== 'error') return;
    transition('requesting');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      pv.srcObject = stream;
      transition('warming_up');
      resizeCanvas();
      warmupTimer = setTimeout(() => {
        lastSeen = performance.now();
        transition(hasFD ? 'detecting' : 'unavailable');
      }, 1500);
      raf = requestAnimationFrame(loop);
      _running = true;
    } catch (err) {
      transition('error');
      notify.error(`Webcam access denied: ${err.message}\n\nGrant camera permission in your browser settings.`);
    }
  }

  function stop() {
    _running = false;
    clearTimeout(warmupTimer);
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (pv) pv.srcObject = null;
    ctx?.clearRect(0, 0, oc?.width ?? 0, oc?.height ?? 0);
    transition('idle');
    if (_activeModule === mod) _activeModule = null;
  }

  // ── Detection loop ─────────────────────────────────────────────────────────
  async function loop() {
    resizeCanvas();
    ctx?.clearRect(0, 0, oc.width, oc.height);

    const inWarmup = _st === 'warming_up' || _st === 'unavailable';
    let face = null;
    if (detector && pv?.readyState >= 2 && !inWarmup) {
      try { face = (await detector.detect(pv))[0] || null; } catch {}
    }

    const threshold = state.session.tracking.attentionThreshold ?? 5;

    if (face) {
      drawFaceBox(face.boundingBox);
      const prevLoss = lastSeen ? (performance.now() - lastSeen) / 1000 : 0;
      lastSeen = performance.now();
      lossInjected = false;
      // Publish attention=1 (face detected) to state engine
      setAttention(1);

      if (_st !== 'detecting' && !inWarmup) {
        transition('detecting');
        if (!returnInjected && prevLoss >= threshold) {
          returnInjected = true;
          _onReturn();
        }
      }
    } else if (!inWarmup) {
      const lossSec = lastSeen ? (performance.now() - lastSeen) / 1000 : 0;
      returnInjected = false;
      // Publish attention as a decay from 1→0 over the threshold period
      setAttention(lastSeen ? Math.max(0, 1 - lossSec / Math.max(1, threshold)) : 0);

      if (_st === 'detecting') transition('lost');

      if (_st === 'lost' && lossSec >= threshold && !lossInjected) {
        lossInjected = true;
        if (state.session.tracking.enabled) _onLost();
      }

      // Update loss counter
      const al = $id('attentionLossDisplay');
      if (al && lastSeen) al.textContent = `${Math.max(0, lossSec).toFixed(1)}s`;
    }

    if (_running) raf = requestAnimationFrame(loop);
  }
  function _onLost() {
    const { tracking } = state.session;
    const opts = state.session.trackingFsOptions ?? {};
    // Record analytics event
    notifyAttentionLost(state.runtime);
    if (tracking.autoPauseOnAttentionLoss && state.runtime && !state.runtime.paused) {
      pausePlayback(true); wasSessionPaused = true;
    }
    if (opts.pauseFsOnLoss && !state.fsPaused) { toggleFsPause(); wasFsPaused = true; }
    if (opts.injectMacroOnLoss && opts.lossInjectSlot) {
      const m = getSlotMacro(Number(opts.lossInjectSlot));
      if (m) injectMacro(m.id);
    }
  }

  function _onReturn() {
    const opts = state.session.trackingFsOptions ?? {};
    // Record analytics event
    notifyAttentionReturned(state.runtime);
    if (wasSessionPaused && state.session.advanced.autoResumeOnAttentionReturn && state.runtime?.pausedByAttention) {
      resumePlayback(true); wasSessionPaused = false;
    }
    if (wasFsPaused && state.fsPaused) { toggleFsPause(); wasFsPaused = false; }
    if (opts.injectMacroOnReturn && opts.returnInjectSlot) {
      const m = getSlotMacro(Number(opts.returnInjectSlot));
      if (m) injectMacro(m.id);
    }
  }

  const mod = { start, stop, getState: () => _st };
  _activeModule = mod;
  return mod;
}
