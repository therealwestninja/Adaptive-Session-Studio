// ── tests/fullscreen-hud.test.js ──────────────────────────────────────────
// Tests for js/fullscreen-hud.js — exported functions that can be exercised
// without a real DOM / fullscreen context.

import { makeRunner } from './harness.js';
import {
  initFullscreenHud, updateHud, tickHud,
  showLiveControlToast, renderIdleScreen,
} from '../js/fullscreen-hud.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runFullscreenHudTests() {
  const R  = makeRunner('fullscreen-hud.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function reset() {
    state.session = normalizeSession(defaultSession());
    state.runtime = null;
    state.engineState = null;
    state.liveControl = null;
  }

  // ── Export surface ─────────────────────────────────────────────────────────
  t('initFullscreenHud is a function', () => {
    ok(typeof initFullscreenHud === 'function');
  });

  t('updateHud is a function', () => {
    ok(typeof updateHud === 'function');
  });

  t('tickHud is a function', () => {
    ok(typeof tickHud === 'function');
  });

  t('showLiveControlToast is a function', () => {
    ok(typeof showLiveControlToast === 'function');
  });

  t('renderIdleScreen is a function', () => {
    ok(typeof renderIdleScreen === 'function');
  });

  // ── No-DOM safety ─────────────────────────────────────────────────────────
  t('initFullscreenHud does not throw without DOM', () => {
    let threw = false;
    try { initFullscreenHud(); } catch { threw = true; }
    ok(!threw, 'initFullscreenHud must not throw in test environment');
  });

  t('updateHud does not throw without DOM or fullscreen', () => {
    reset();
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw, 'updateHud must not throw — fullscreen guard should exit early');
  });

  t('tickHud does not throw without fullscreen', () => {
    reset();
    let threw = false;
    try { tickHud(); } catch { threw = true; }
    ok(!threw, 'tickHud must not throw — fullscreen guard should exit early');
  });

  t('showLiveControlToast does not throw when toast element absent', () => {
    let threw = false;
    try { showLiveControlToast('Intensity 80%'); } catch { threw = true; }
    ok(!threw, 'showLiveControlToast must not throw without DOM element');
  });

  t('showLiveControlToast does not throw with various message types', () => {
    for (const msg of ['Speed 1.2×', 'Controls reset ↺', '⚡ Peak phase', '']) {
      let threw = false;
      try { showLiveControlToast(msg); } catch { threw = true; }
      ok(!threw, `showLiveControlToast("${msg}") must not throw`);
    }
  });

  t('renderIdleScreen does not throw when idleHint element absent', () => {
    reset();
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw, 'renderIdleScreen must not throw without DOM element');
  });

  t('renderIdleScreen does not throw with empty session name', () => {
    reset();
    state.session.name = '';
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw, 'renderIdleScreen must handle empty session name');
  });

  t('renderIdleScreen does not throw with no blocks or scenes', () => {
    reset();
    state.session.blocks = [];
    state.session.scenes = [];
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });

  t('updateHud does not throw with null engineState', () => {
    reset();
    state.engineState = null;
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw, 'updateHud must handle null engineState gracefully');
  });

  t('updateHud does not throw with null liveControl', () => {
    reset();
    state.engineState = { attention: 0.5, engagement: 0.6, intensity: 0.8, speed: 1.0 };
    state.liveControl = null;
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw, 'updateHud must handle null liveControl gracefully');
  });

  t('updateHud does not throw with null runtime', () => {
    reset();
    state.runtime = null;
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw, 'updateHud must handle null runtime gracefully');
  });

  t('showLiveControlToast called multiple times in succession does not throw', () => {
    let threw = false;
    try {
      for (let i = 0; i < 10; i++) showLiveControlToast(`msg ${i}`);
    } catch { threw = true; }
    ok(!threw, 'rapid sequential toast calls must be safe');
  });

  // ── hudOptions interaction ────────────────────────────────────────────────
  t('updateHud with showMetricBars:false does not throw', () => {
    reset();
    state.session.hudOptions = { showMetricBars: false };
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw);
  });

  t('updateHud with all hudOptions false does not throw', () => {
    reset();
    state.session.hudOptions = {
      showMetricBars: false, showScene: false,
      showMacroSlots: false, showVariables: false, showHint: false,
    };
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw);
  });

  t('renderIdleScreen with richIdleScreen:false does not throw', () => {
    reset();
    state.session.displayOptions = { richIdleScreen: false };
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });

  t('renderIdleScreen with richIdleScreen:true does not throw', () => {
    reset();
    state.session.displayOptions = { richIdleScreen: true };
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });


  // ── renderIdleScreen content reflects session ─────────────────────────────
  t('renderIdleScreen does not throw with viz blocks in session', () => {
    reset();
    state.session.blocks = [
      { id: 'b1', type: 'viz', label: 'Spiral', start: 0, duration: 30,
        vizType: 'spiral', vizSpeed: 1, vizColor: '#c49a3c' }
    ];
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });

  t('renderIdleScreen does not throw with session.mode set', () => {
    reset();
    state.session.mode = 'induction';
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });

  t('renderIdleScreen handles session with funscript tracks', () => {
    reset();
    state.session.funscriptTracks = [
      { id: 'ft1', name: 'Track 1', actions: [{ at: 0, pos: 0 }],
        _disabled: false, _color: '#f0a04a', variant: '' }
    ];
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });

  t('showLiveControlToast with empty string does not throw', () => {
    let threw = false;
    try { showLiveControlToast(''); } catch { threw = true; }
    ok(!threw);
  });

  t('showLiveControlToast with very long string does not throw', () => {
    let threw = false;
    try { showLiveControlToast('x'.repeat(500)); } catch { threw = true; }
    ok(!threw);
  });

  t('tickHud with full engineState does not throw', () => {
    reset();
    state.engineState = { attention: 0.8, engagement: 0.6, intensity: 1.2, speed: 1.0 };
    state.liveControl  = { intensityScale: 1.0, speedScale: 1.0, variation: 0, randomness: 0 };
    let threw = false;
    try { tickHud(); } catch { threw = true; }
    ok(!threw);
  });


  // ── tickHud: various state combinations ───────────────────────────────────
  t('tickHud with null engineState does not throw', () => {
    reset();
    state.engineState = null;
    let threw = false;
    try { tickHud(); } catch { threw = true; }
    ok(!threw);
  });

  t('tickHud with null liveControl does not throw', () => {
    reset();
    state.liveControl = null;
    let threw = false;
    try { tickHud(); } catch { threw = true; }
    ok(!threw);
  });

  t('showLiveControlToast with intensity string does not throw', () => {
    let threw = false;
    try { showLiveControlToast('Intensity: 80%'); } catch { threw = true; }
    ok(!threw);
  });

  // ── renderIdleScreen: session with scenes ────────────────────────────────
  t('renderIdleScreen with multiple scenes does not throw', () => {
    reset();
    state.session.scenes = [
      { id: 's1', name: 'Intro', start: 0, end: 30, stateType: 'calm',
        loopBehavior: 'once', color: '#5fa8d3', nextSceneId: null },
      { id: 's2', name: 'Build', start: 30, end: 60, stateType: 'build',
        loopBehavior: 'once', color: '#f0c040', nextSceneId: null },
    ];
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });

  t('renderIdleScreen with displayOptions.richIdleScreen:false does not throw', () => {
    reset();
    state.session.displayOptions.richIdleScreen = false;
    let threw = false;
    try { renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });

  t('updateHud with showHint:true does not throw', () => {
    reset();
    state.session.hudOptions.showHint = true;
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw);
  });


  // ── tickHud: metric display stability ────────────────────────────────────
  t('tickHud called rapidly 20 times does not throw', () => {
    reset();
    let threw = false;
    try { for (let i = 0; i < 20; i++) tickHud(); } catch { threw = true; }
    ok(!threw, 'rapid tickHud calls should be stable');
  });

  t('tickHud with extreme intensityScale does not throw', () => {
    reset();
    state.liveControl.intensityScale = 999;
    let threw = false;
    try { tickHud(); } catch { threw = true; }
    ok(!threw);
  });

  t('updateHud with all hudOptions false does not throw', () => {
    reset();
    state.session.hudOptions = {
      showMetricBars: false, showScene: false, showMacroSlots: false,
      showVariables: false, showHint: false, hideAfterSec: 2.5,
    };
    let threw = false;
    try { updateHud(); } catch { threw = true; }
    ok(!threw);
  });

  t('showLiveControlToast with empty string does not throw', () => {
    let threw = false;
    try { showLiveControlToast(''); } catch { threw = true; }
    ok(!threw);
  });

  t('renderIdleScreen called 5 times in sequence is stable', () => {
    reset();
    let threw = false;
    try { for (let i = 0; i < 5; i++) renderIdleScreen(); } catch { threw = true; }
    ok(!threw);
  });


  return R.summary();
}
