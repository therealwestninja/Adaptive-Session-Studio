// ── fullscreen-hud.js ──────────────────────────────────────────────────────
// Fullscreen HUD v2: session info, live metric bars, scene/state-block
// indicator, macro slot pills, active variable chips, and live-control toasts.

import { state, fmt, esc, $id } from './state.js';
import { getSlotMacro }         from './macros.js';
import { getAllVariables }       from './variables.js';
import { stateTypeLabel }        from './state-blocks.js';

let _mouseIdleTimer = null;
let _toastTimer     = null;

const TOAST_SHOW_MS = 1400;

// ── Init ──────────────────────────────────────────────────────────────────────
export function initFullscreenHud() {
  const stage = $id('mainStage');
  if (!stage) return;

  stage.addEventListener('mousemove', () => {
    _showHud();
    clearTimeout(_mouseIdleTimer);
    const delay = (state.session?.hudOptions?.hideAfterSec ?? 2.5) * 1000;
    _mouseIdleTimer = setTimeout(_hideHud, delay);
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === stage) {
      updateHud();
      _updateProgressBar();
      _showHud();
      const delay = (state.session?.hudOptions?.hideAfterSec ?? 2.5) * 1000;
      _mouseIdleTimer = setTimeout(_hideHud, delay);
      stage.style.cursor = '';
    } else {
      _showHud();
      clearTimeout(_mouseIdleTimer);
      // Hide progress bar and webcam preview when leaving fullscreen
      const wrap = $id('fsProgressWrap'), badge = $id('fsLoopBadge');
      if (wrap)  wrap.style.display  = 'none';
      if (badge) badge.style.display = 'none';
      // Stop webcam preview stream
      if (_wcStream) { _wcStream.getTracks().forEach(t => t.stop()); _wcStream = null; }
      const wcVid = $id('fsWebcamPreview');
      if (wcVid) wcVid.style.display = 'none';
      _wcEnabled = false;
    }
  });
}

function _showHud() {
  $id('fullscreenHud')?.classList.remove('fshud-hidden');
  const stage = $id('mainStage');
  if (stage && document.fullscreenElement === stage) stage.style.cursor = '';
}

function _hideHud() {
  $id('fullscreenHud')?.classList.add('fshud-hidden');
  const stage = $id('mainStage');
  if (stage && document.fullscreenElement === stage) stage.style.cursor = 'none';
}

// ── Full HUD update ───────────────────────────────────────────────────────────
export function updateHud() {
  if (!document.fullscreenElement) return;

  const rt  = state.runtime;
  const s   = state.session;
  const es  = state.engineState;
  const lc  = state.liveControl;
  const hud = s.hudOptions ?? {};  // graceful defaults if field missing

  // ── Title (always shown) ──────────────────────────────────────────────────
  const titleEl = $id('fsHudTitle');
  if (titleEl) titleEl.textContent = esc(s.name || 'Session');

  const timeEl = $id('fsHudTime');
  if (timeEl) {
    if (rt) {
      const totalLoops = rt.totalLoops;
      const loopStr = totalLoops
        ? ` · Loop ${rt.loopIndex + 1}/${totalLoops}`
        : rt.loopIndex > 0 ? ` · Loop ${rt.loopIndex + 1} ∞` : '';
      timeEl.textContent = `${fmt(rt.sessionTime)} / ${fmt(s.duration)}${loopStr}`;
    } else {
      timeEl.textContent = `— / ${fmt(s.duration)}`;
    }
  }

  // ── Scene + state block indicator (toggleable) ────────────────────────────
  const sceneEl = $id('fsHudScene');
  if (sceneEl) {
    const showScene = hud.showScene !== false;
    const scene = rt?.activeScene?.scene;
    if (showScene && scene) {
      const tag = scene.stateType ? ` ${stateTypeLabel(scene.stateType)}` : '';
      sceneEl.textContent = `${esc(scene.name)}${tag}`;
      sceneEl.style.display = '';
    } else {
      sceneEl.style.display = 'none';
    }
  }

  // ── Metric bars — position + individual bar toggles ───────────────────────
  const metricsEl = $id('fsHudMetrics');
  if (metricsEl) {
    const showBars = hud.showMetricBars !== false;
    const pos      = hud.metricsPosition ?? 'bottom';

    // Reposition the metrics block within the HUD flex column
    const hudEl  = $id('fullscreenHud');
    if (hudEl && metricsEl.parentElement === hudEl) {
      if (pos === 'top') {
        const first = hudEl.firstElementChild;
        if (first && first !== metricsEl) hudEl.insertBefore(metricsEl, first);
      } else if (pos === 'middle') {
        const mid = $id('fsHudMacroSection');
        if (mid && mid.previousElementSibling !== metricsEl) {
          hudEl.insertBefore(metricsEl, mid);
        }
      } else if (pos === 'bottom') {
        const hint = $id('fsHudHint');
        if (hint && hint.previousElementSibling !== metricsEl) {
          hudEl.insertBefore(metricsEl, hint);
        }
      }
    }

    metricsEl.style.display = showBars ? '' : 'none';
    if (showBars && es) {
      const showAttn = hud.showAttention  !== false;
      const showEng  = hud.showEngagement !== false;
      const showInt  = hud.showIntensity  !== false;

      const attnRow = $id('fsBar_attention')?.closest('.fshud-metric');
      const engRow  = $id('fsBar_engagement')?.closest('.fshud-metric');
      const intRow  = $id('fsBar_intensity')?.closest('.fshud-metric');
      if (attnRow) attnRow.style.display = showAttn ? '' : 'none';
      if (engRow)  engRow.style.display  = showEng  ? '' : 'none';
      if (intRow)  intRow.style.display  = showInt  ? '' : 'none';

      if (showAttn) _setBar('fsBar_attention',  Math.round((es.attention  ?? 0) * 100));
      if (showEng)  _setBar('fsBar_engagement', Math.round((es.engagement ?? 0) * 100));
      if (showInt) {
        const intPct = lc
          ? Math.round(((lc.intensityScale ?? 1) * (es.intensity ?? 1)) / 2 * 100)
          : Math.round((es.intensity ?? 0) * 50);
        _setBar('fsBar_intensity', Math.min(100, intPct));
      }
    }
  }

  // ── Macro slot pills (toggleable) ─────────────────────────────────────────
  const pillsSection = $id('fsHudMacroSection');
  const pillsEl = $id('fsHudSlotPills');
  const showMacros = hud.showMacroSlots !== false;
  if (pillsSection) pillsSection.style.display = showMacros ? '' : 'none';
  if (showMacros && pillsEl) {
    pillsEl.innerHTML = [1, 2, 3, 4, 5].map(slot => {
      const macro = getSlotMacro(slot);
      if (!macro) return '';
      const active = state.injection?.macroName === macro.name;
      return `<div class="fshud-slot-pill${active ? ' active' : ''}">
        <span class="fshud-slot-key">${slot}</span>
        <span class="fshud-slot-name">${esc(macro.name)}</span>
      </div>`;
    }).join('');
  }

  // ── Variable chips (toggleable) ───────────────────────────────────────────
  const varsEl = $id('fsHudVars');
  if (varsEl) {
    const showVars = hud.showVariables !== false;
    if (!showVars) { varsEl.style.display = 'none'; }
    else {
      const vars = getAllVariables(); // Array<{name, type, value, description}>
      const chips = vars.filter(v => {
        if (v.type === 'number')  return v.value !== 0;
        if (v.type === 'boolean') return v.value === true;
        if (v.type === 'string')  return v.value !== '';
        return false;
      });
      if (chips.length) {
        varsEl.style.display = '';
        varsEl.innerHTML = chips.map(v =>
          `<div class="fshud-var-chip">${esc(v.name)} <span>${esc(String(v.value))}</span></div>`
        ).join('');
      } else {
        varsEl.style.display = 'none';
      }
    }
  }

  // ── Keyboard hint (toggleable) ────────────────────────────────────────────
  const hintEl = $id('fsHudHint');
  if (hintEl) hintEl.style.display = hud.showHint ? '' : 'none';

  // ── Webcam preview (toggleable) ───────────────────────────────────────────
  _updateWebcamPreview();
}

// ── Webcam live preview in fullscreen ─────────────────────────────────────────
let _wcStream  = null;
let _wcEnabled = false;

function _updateWebcamPreview() {
  const disp    = state.session?.displayOptions ?? {};
  const enabled = !!(disp.webcamPreview && document.fullscreenElement);
  const corner  = disp.webcamCorner ?? 'bottom-right';
  const sizePct = Math.max(5, Math.min(40, disp.webcamSize ?? 15));

  let vid = $id('fsWebcamPreview');

  if (!enabled) {
    if (_wcEnabled && vid) vid.style.display = 'none';
    if (_wcStream && !enabled) {
      _wcStream.getTracks().forEach(t => t.stop());
      _wcStream = null;
    }
    _wcEnabled = false;
    return;
  }

  // Create the video element on first use
  if (!vid) {
    vid = document.createElement('video');
    vid.id        = 'fsWebcamPreview';
    vid.autoplay  = true;
    vid.muted     = true;
    vid.playsInline = true;
    vid.style.cssText = `
      position:absolute; border-radius:8px; border:1.5px solid rgba(255,255,255,0.2);
      object-fit:cover; box-shadow:0 4px 20px rgba(0,0,0,.6); z-index:25;
      transition: width .2s, height .2s;
    `;
    const stage = $id('mainStage');
    if (stage) stage.appendChild(vid);
  }

  // Apply corner position and size
  const w = `${sizePct}%`;
  const aspect = 0.75; // 4:3 approximate
  vid.style.width  = w;
  vid.style.height = `calc(${sizePct}% * ${aspect})`;
  vid.style.top    = corner.startsWith('top')    ? '12px' : 'auto';
  vid.style.bottom = corner.startsWith('bottom') ? '20px' : 'auto';
  vid.style.left   = corner.endsWith('left')     ? '12px' : 'auto';
  vid.style.right  = corner.endsWith('right')    ? '12px' : 'auto';
  vid.style.display = '';

  // Start stream if needed
  if (!_wcStream) {
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        _wcStream = stream;
        vid.srcObject = stream;
      })
      .catch(() => { /* permission denied — hide preview */ if (vid) vid.style.display = 'none'; });
  }
  _wcEnabled = true;
}

// ── Tick ──────────────────────────────────────────────────────────────────────
export function tickHud() {
  if (!document.fullscreenElement) return;
  updateHud();
  _updateProgressBar();
}

// ── Persistent progress bar (always visible, unaffected by auto-hide) ─────────
function _updateProgressBar() {
  const rt = state.runtime;
  const s  = state.session;
  const wrap  = $id('fsProgressWrap');
  const fill  = $id('fsProgressFill');
  const badge = $id('fsLoopBadge');
  if (!wrap || !fill || !badge) return;

  if (!rt) {
    wrap.style.display  = 'none';
    badge.style.display = 'none';
    return;
  }

  wrap.style.display = '';
  const pct = Math.min(100, (rt.sessionTime / Math.max(1, s.duration)) * 100);
  fill.style.width = `${pct}%`;

  // Loop badge: show for any mode except 'none' with exactly 1 loop
  const totalLoops = rt.totalLoops; // null = forever
  if (totalLoops === null) {
    badge.style.display = '';
    badge.textContent   = `Loop ${rt.loopIndex + 1} ∞`;
  } else if (totalLoops > 1) {
    badge.style.display = '';
    badge.textContent   = `Loop ${rt.loopIndex + 1} / ${totalLoops}`;
  } else {
    badge.style.display = 'none';
  }
}

// ── Live control toast ────────────────────────────────────────────────────────
// Shown briefly when [ ] , . R are pressed during fullscreen.
export function showLiveControlToast(message) {
  const el = $id('liveControlToast');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  // Restart animation
  el.style.animation = 'none';
  void el.offsetWidth; // reflow
  el.style.animation  = '';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, TOAST_SHOW_MS);
}

// ── Idle screen ───────────────────────────────────────────────────────────────
// Replaces the plain "Space to play" with contextual session info.
export function renderIdleScreen() {
  const el = $id('idleHint');
  if (!el) return;
  const s = state.session;

  // If rich idle screen is disabled, show the minimal hint
  if (s.displayOptions?.richIdleScreen === false) {
    el.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="12" stroke="currentColor" stroke-width="1" opacity=".25"/>
      <path d="M11 8.5l7 4.5-7 4.5V8.5z" fill="currentColor" opacity=".3"/>
    </svg><span>Space to play</span>`;
    return;
  }

  const blockCount   = s.blocks?.length ?? 0;
  const sceneCount   = s.scenes?.length ?? 0;
  const hasFunscript = (s.funscriptTracks?.length ?? 0) > 0;
  const modeName     = s.mode ? s.mode.replace(/-/g, ' ') : null;

  el.innerHTML = `
    <div class="stage-idle-title">${esc(s.name || 'Untitled Session')}</div>
    <div class="stage-idle-meta">
      ${fmt(s.duration)}&nbsp;·&nbsp;${blockCount} block${blockCount !== 1 ? 's' : ''}${
      sceneCount   ? `&nbsp;·&nbsp;${sceneCount} scene${sceneCount !== 1 ? 's' : ''}` : ''}${
      hasFunscript ? '&nbsp;·&nbsp;haptic' : ''}${
      modeName     ? `&nbsp;·&nbsp;${esc(modeName)}` : ''}
    </div>
    <div class="stage-idle-hint">
      <span class="stage-idle-key">Space</span> to begin
    </div>`;
}

// ── Helper ────────────────────────────────────────────────────────────────────
function _setBar(id, pct) {
  const el = $id(id);
  if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}
