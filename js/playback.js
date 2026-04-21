// ── playback.js ────────────────────────────────────────────────────────────
// Playback engine: RAF loop, block triggering, transport UI, media layers.

import { state, fmt, $id } from './state.js';
import { updateSubtitleCue } from './subtitle.js';
import {
  getCurrentPosition, updatePositionIndicator, sendDevicePosition, drawTimeline
} from './funscript.js';
import {
  getInjectionPosition, recordLastSentPos, cancelInjection, safeEaseTo0, fsState,
  injectMacro, getSlotMacro
} from './macros.js';

// Expose fsState to state-engine.js via a non-circular reference on the shared state object.
// (state-engine can't import macros.js due to the chain: macros → funscript → state-engine)
state._fsStateRef = { fsState };
import { tickHud, renderIdleScreen } from './fullscreen-hud.js';
import {
  startAudioEngine, pauseAudioEngine, resumeAudioEngine, stopAudioEngine,
  refreshVolumes, audioEngineAvailable
} from './audio-engine.js';
import { applyLiveControl, getLiveSpeedMs, updateLiveMeter, updateLiveEngineMeters,
         updateRampPanelVisibility } from './live-control.js';
import { initAnalytics, tickAnalytics, finaliseAnalytics, showPostSessionModal } from './session-analytics.js';
import { recordSessionInHistory } from './metrics-history.js';
import { loadProfile, renderProfilePanel, rebuildProfile } from './user-profile.js';
import { tickStateEngine, resetStateEngine } from './state-engine.js';
import { tickSensorBridge, connectSensorBridge, isBridgeConnected } from './sensor-bridge.js';
import { mountVizBlock, unmountVizBlock }     from './viz-blocks.js';
import { tickRulesEngine, clearRuleState }        from './rules-engine.js';
import { applyRamp }                               from './intensity-ramp.js';
import { tickDynamicPacing, resetDynamicPacing }  from './dynamic-pacing.js';
import { tickTriggerWindows, clearWindowState }   from './trigger-windows.js';
import { tickSafety, recordEmergencyStop,
         isEmergencyCooldownActive,
         getEmergencyCooldownRemaining }              from './safety.js';

// ── Helpers ────────────────────────────────────────────────────────────────
const posToStyle = p => ({
  'top-left':    { top:'10%', left:'10%',  right:'auto',  bottom:'auto', transform:'none',                textAlign:'left'   },
  top:           { top:'10%', left:'50%',  right:'auto',  bottom:'auto', transform:'translateX(-50%)',     textAlign:'center' },
  'top-right':   { top:'10%', left:'auto', right:'10%',   bottom:'auto', transform:'none',                textAlign:'right'  },
  left:          { top:'50%', left:'10%',  right:'auto',  bottom:'auto', transform:'translateY(-50%)',     textAlign:'left'   },
  center:        { top:'50%', left:'50%',  right:'auto',  bottom:'auto', transform:'translate(-50%,-50%)', textAlign:'center' },
  right:         { top:'50%', left:'auto', right:'10%',   bottom:'auto', transform:'translateY(-50%)',     textAlign:'right'  },
  'bottom-left': { top:'auto',left:'10%',  right:'auto',  bottom:'22%',  transform:'none',                textAlign:'left'   },
  bottom:        { top:'auto',left:'50%',  right:'auto',  bottom:'22%',  transform:'translateX(-50%)',     textAlign:'center' },
  'bottom-right':{ top:'auto',left:'auto', right:'10%',   bottom:'22%',  transform:'none',                textAlign:'right'  },
}[p] || { top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center' });

function updatePlayBtn(playing) {
  const btn  = $id('playBtn');
  if (!btn) return;
  btn.title    = playing ? 'Pause (Space)' : 'Play (Space)';
  btn.classList.toggle('playing', playing);
  const play  = document.getElementById('playIcon');
  const pause = document.getElementById('pauseIcon');
  if (play)  play.style.display  = playing ? 'none' : '';
  if (pause) pause.style.display = playing ? '' : 'none';
}

function showIdleHint(show) {
  const h = $id('idleHint');
  if (h) h.style.display = show ? 'flex' : 'none';
}

// ── Loop calc ──────────────────────────────────────────────────────────────
function computeTotalLoops() {
  const { session } = state;
  if (session.loopMode === 'count')   return Math.max(1, session.loopCount);
  if (session.loopMode === 'minutes') return Math.max(1, Math.ceil((session.runtimeMinutes * 60) / session.duration));
  if (session.loopMode === 'none')    return 1;
  return null; // forever
}

// ── Start ──────────────────────────────────────────────────────────────────
export function startPlayback() {
  // Cancel any pending post-session modal so it doesn't appear over a new session
  if (_postSessionTimer) { clearTimeout(_postSessionTimer); _postSessionTimer = null; }
  if (isEmergencyCooldownActive()) {
    _showEmergencyBanner();
    return;
  }
  stopPlayback();
  showIdleHint(false);
  state.runtime = {
    startedAt: performance.now(),
    pauseStartedAt: 0,
    totalPausedMs: 0,
    paused: false,
    pausedByAttention: false,
    sessionTime: 0,
    activeBlock: null,
    activeScene: null,        // { scene, loopCount } — current scene being played
    triggered: new Set(),
    loopIndex: 0,
    totalLoops: computeTotalLoops(),
    raf: 0,
    speechUtterance: null,
    playingOneShots: [],
    backgroundAudio: [],
    backgroundVideo: [],
    usingAudioEngine: false,
    fsSpeedMultiplier: state.session.funscriptSettings.speed || 1.0,
    _lastTick: null,
  };
  // startPlaylistLayers is async (audio engine decode); capture runtime so the
  // .then() can detect if stop/import happened before decode finished.
  const capturedRuntime = state.runtime;
  startPlaylistLayers().then(() => {
    // Bail out if the user stopped, imported, or started a new session
    // while audio was decoding — state.runtime will have changed.
    if (state.runtime !== capturedRuntime || !capturedRuntime) return;

    // Auto-connect Sensor Bridge if the setting is enabled and not already connected
    if (state.session.displayOptions?.sensorBridgeAuto && !isBridgeConnected()) {
      const sbUrl = state.session.displayOptions?.sensorBridgeUrl ?? 'ws://localhost:8765';
      connectSensorBridge(sbUrl, { autoReconnect: true });
    }

    initAnalytics(state.runtime);
    updateRampPanelVisibility();
    updatePlayBtn(true);
    tickPlayback();
  });
}

async function startPlaylistLayers() {
  const { session, runtime } = state;
  const bh = $id('bgHost');
  if (!bh) return;
  bh.innerHTML = '';

  // Video / image playlist tracks — HTMLVideoElement / HTMLImageElement
  session.playlists.video.forEach(track => {
    const el = track.mediaKind === 'image'
      ? document.createElement('img')
      : document.createElement('video');
    el.src = track.dataUrl;
    if (el.tagName === 'VIDEO') {
      el.loop = true; el.autoplay = true; el.muted = !!track.mute; el.playsInline = true;
      el.volume = session.masterVolume * session.advanced.playlistVideoVolume * (track.volume ?? 1);
      el.play().catch(() => {});
    }
    bh.appendChild(el);
    runtime.backgroundVideo.push(el);
  });

  // Audio playlist tracks — route through Web Audio API engine when available
  if (audioEngineAvailable() && session.playlists.audio.some(t => !t._muted && t.dataUrl)) {
    runtime.usingAudioEngine = true;
    await startAudioEngine();
  } else {
    // Fallback: plain HTMLAudioElement (for browsers without Web Audio)
    runtime.usingAudioEngine = false;
    session.playlists.audio.forEach(track => {
      if (track._muted || !track.dataUrl) return;
      const audio = new Audio(track.dataUrl);
      audio.loop = true;
      audio.volume = session.masterVolume * session.advanced.playlistAudioVolume * (track.volume ?? 1);
      audio.play().catch(() => {});
      runtime.backgroundAudio.push(audio);
    });
  }
}

// ── Tick ───────────────────────────────────────────────────────────────────
export function tickPlayback() {
  const { runtime, session } = state;
  if (!runtime || runtime.paused) return;

  const now         = performance.now();
  const elapsed     = now - runtime.startedAt - runtime.totalPausedMs;
  const totalSec    = elapsed / 1000;
  const dur         = session.duration;
  const totalLoops  = runtime.totalLoops;

  // Compute real frame delta for analytics (cap at 200ms to guard tab-switch spikes)
  const frameSec = Math.min(0.2, (now - (runtime._lastTick ?? now)) / 1000);
  runtime._lastTick = now;

  if (totalLoops && totalSec >= totalLoops * dur) {
    if (runtime.analytics) runtime.analytics.completionState = 'completed';
    stopPlayback(); return;
  }

  runtime.loopIndex   = Math.max(0, Math.floor(totalSec / dur));
  runtime.sessionTime = Math.max(0, totalSec % dur);

  // Scene tracking — find which scene contains the current sessionTime
  if (session.scenes?.length) {
    const sc = session.scenes.find(s =>
      runtime.sessionTime >= s.start && runtime.sessionTime < s.end
    ) || null;

    if (sc) {
      if (sc.id !== runtime.activeScene?.scene?.id) {
        // Entered a new scene — record time and reset loop counter
        runtime.activeScene = { scene: sc, loopCount: 0, enteredAt: runtime.sessionTime };
      }
    } else if (runtime.activeScene) {
      // Just exited a scene — check whether it wants to loop
      const prev = runtime.activeScene.scene;
      const justPastEnd = runtime.sessionTime >= prev.end;
      if (justPastEnd && prev.loopBehavior === 'loop') {
        // Seek back to the scene's start time, keeping absolute pause offset intact
        runtime.startedAt = performance.now() - runtime.totalPausedMs - prev.start * 1000;
        runtime.activeScene = { scene: prev, loopCount: (runtime.activeScene.loopCount ?? 0) + 1 };
        // Must schedule next frame BEFORE returning — returning early would otherwise
        // bypass the requestAnimationFrame call at the bottom and stop playback.
        runtime.raf = requestAnimationFrame(tickPlayback);
        return;
      } else {
        runtime.activeScene = null;
      }
    }
  } else {
    runtime.activeScene = null;
  }

  // Block handling
  const ab = session.blocks.find(b =>
    runtime.sessionTime >= b.start && runtime.sessionTime < b.start + b.duration
  ) || null;
  runtime.activeBlock = ab;
  handleActiveBlock(ab);

  // Analytics — accumulate block time and sample FS position
  tickAnalytics(runtime, frameSec);

  // State engine — publish normalized runtime state (attention, intensity, engagement)
  tickSensorBridge();  // prune stale external signals before engine tick
  tickStateEngine();

  // Rules engine — evaluate behavioral scripting rules against current state
  tickRulesEngine(frameSec);
  // Intensity ramp — apply escalation curve if enabled
  applyRamp();
  // Dynamic pacing — modulate speed from engagement score
  tickDynamicPacing(frameSec);
  // Trigger windows — time-bounded interaction checks
  tickTriggerWindows();
  // Safety layer — auto-reduce, limit enforcement
  tickSafety();
  // Live engine meters (attention, engagement bars)
  updateLiveEngineMeters();

  // Subtitle cues
  updateSubtitleCue(runtime.sessionTime);

  // FunScript position — injection takes priority over main track
  if (session.funscriptTracks.length || state.injection) {
    let pos;
    if (!state.fsPaused) {
      const injected = getInjectionPosition();
      if (injected !== null) {
        pos = applyLiveControl(injected);
      } else {
        // Use live-speed-scaled time for main track lookup
        const liveTimeMs = getLiveSpeedMs(runtime.sessionTime);
        pos = applyLiveControl(getCurrentPosition(runtime.sessionTime, liveTimeMs));
      }
    } else {
      pos = 0;
    }
    recordLastSentPos(pos);
    updatePositionIndicator(pos);
    updateLiveMeter(pos);
    sendDevicePosition(pos / 100);
  }
  if (document.getElementById('fsDialog')?.open) drawTimeline(runtime.sessionTime);

  // Transport UI
  updateTransportUI();
  // Live status tab refresh (cheap DOM text updates, no re-render)
  refreshLiveStatus();
  // Fullscreen HUD
  tickHud();

  runtime.raf = requestAnimationFrame(tickPlayback);
}

// ── Block handler ──────────────────────────────────────────────────────────
function applyOverlayPosition(block) {
  const ot = $id('overlayText');
  if (!ot) return;
  const style = posToStyle(block?._position || 'center');
  Object.assign(ot.style, { top:'', bottom:'', left:'', right:'', transform:'', textAlign:'' });
  Object.assign(ot.style, style);
}

// ── Template variable resolution ───────────────────────────────────────────
// Substitutes {{variable}} placeholders in block content at render time.
// Built-in: {{intensity}}, {{speed}}, {{loop}}, {{time}}, {{scene}}
// Phase 5.2: user-defined session variables e.g. {{arousal_level}}
export function resolveTemplateVars(content) {
  if (!content || !content.includes('{{')) return content;
  const es = state.engineState;
  const rt = state.runtime;

  // Resolve built-in vars first
  let out = content
    .replace(/\{\{intensity\}\}/gi, `${Math.round((es?.intensity ?? 1) * 100)}%`)
    .replace(/\{\{speed\}\}/gi, `${(es?.speed ?? 1).toFixed(2)}×`)
    .replace(/\{\{loop\}\}/gi, String((rt?.loopIndex ?? 0) + 1))
    .replace(/\{\{time\}\}/gi, fmt(rt?.sessionTime ?? 0))
    .replace(/\{\{scene\}\}/gi, rt?.activeScene?.scene.name ?? '—');

  // Resolve user-defined variables (any remaining {{name}} placeholders)
  const userVars = state.session?.variables ?? {};
  out = out.replace(/\{\{([a-z_][a-z0-9_]*)\}\}/gi, (_, name) => {
    if (name in userVars) {
      const v = userVars[name];
      return v.type === 'boolean' ? (v.value ? 'true' : 'false') : String(v.value ?? '');
    }
    return `{{${name}}}`; // leave unresolved placeholders intact
  });

  return out;
}

function showText(block) {
  const ot = $id('overlayText');
  if (!ot) return;
  ot.textContent  = resolveTemplateVars(block.content) || '';
  ot.style.fontSize = `${(block.fontSize || 1.2) * 2.2}rem`;
  applyOverlayPosition(block);
  ot.style.opacity = '1';
}

function hideText() {
  const ot = $id('overlayText');
  if (!ot) return;
  ot.style.opacity = '0';
  setTimeout(() => { if (!state.runtime?.activeBlock) ot.textContent = ''; }, 300);
}

function handleActiveBlock(block) {
  const hud = $id('stageHud');
  if (!block) {
    hideText();
    if (hud) hud.textContent = `Loop ${(state.runtime?.loopIndex ?? 0) + 1} · ${fmt(state.runtime?.sessionTime ?? 0)}`;
    return;
  }

  if (block.type === 'text') showText(block);
  else hideText();
  if (hud) hud.textContent = `${block.label} · ${fmt(state.runtime.sessionTime)}`;

  // Mount / unmount viz block canvas on the stage
  const vizStage = $id('vizStageCanvas');
  if (vizStage) {
    if (block.type === 'viz') {
      vizStage.style.display = 'block';
      if (vizStage.dataset.blockId !== block.id) {
        vizStage.dataset.blockId = block.id;
        vizStage.width  = vizStage.offsetWidth  * devicePixelRatio || 800;
        vizStage.height = vizStage.offsetHeight * devicePixelRatio || 600;
        mountVizBlock(vizStage, block);
      }
    } else {
      if (vizStage.dataset.blockId) {
        vizStage.dataset.blockId = '';
        vizStage.style.display = 'none';
        unmountVizBlock(vizStage);
      }
    }
  }

  // Stop any running entrainment from the previous block
  if (state.runtime._entrainmentCtx) {
    try {
      state.runtime._entrainmentOscL?.stop();
      state.runtime._entrainmentOscR?.stop();
      state.runtime._entrainmentCtx.close();
    } catch {}
    state.runtime._entrainmentCtx = null;
    state.runtime._entrainmentOscL = null;
    state.runtime._entrainmentOscR = null;
  }

  // One-shot triggers (per loop)
  const key = `${state.runtime.loopIndex}:${block.id}`;
  if (state.runtime.triggered.has(key)) return;
  state.runtime.triggered.add(key);

  if (block.type === 'tts' && block.content) {
    const u = new SpeechSynthesisUtterance(resolveTemplateVars(block.content));
    u.rate   = state.session.speechRate;
    u.volume = Math.min(1, state.session.masterVolume * (block.volume ?? 1));
    const voice = speechSynthesis.getVoices().find(v => v.name === block.voiceName);
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    state.runtime.speechUtterance = u;
  }

  if (block.type === 'audio' && block.dataUrl) {
    const audio = new Audio(block.dataUrl);
    audio.volume = Math.min(1, state.session.masterVolume * (block.volume ?? 1));
    state.runtime.playingOneShots.push(audio);
    audio.play().catch(() => {});
  }

  if (block.type === 'video' && block.dataUrl) {
    const bh = $id('bgHost');
    if (!bh) return;
    // Snapshot playlist video refs before clearing so stopPlayback / pauseMedia
    // can still reach them after the block element takes over the bgHost slot.
    const playlistVideos = state.runtime.backgroundVideo.slice();
    playlistVideos.forEach(v => {
      try { v.pause?.(); v.src = ''; } catch {}
    });
    bh.innerHTML = '';
    const el = block.mediaKind === 'image' ? document.createElement('img') : document.createElement('video');
    el.src = block.dataUrl;
    if (el.tagName === 'VIDEO') {
      el.autoplay = true; el.loop = true; el.muted = !!block.mute; el.playsInline = true;
      el.volume = state.session.masterVolume * state.session.advanced.playlistVideoVolume;
      el.play().catch(() => {});
    }
    bh.appendChild(el);
    // Replace the tracked array so teardown (stopPlayback/pauseMedia) cleans up
    // the block element correctly. Playlist videos were already stopped above and
    // cannot be restored mid-session, consistent with prior behaviour.
    state.runtime.backgroundVideo = [el];
  }

  // Macro block — inject a macro at the start of this block (one-shot per loop)
  if (block.type === 'macro') {
    let macroId = block.macroId || null;
    if (!macroId && typeof block.macroSlot === 'number') {
      macroId = getSlotMacro(block.macroSlot)?.id ?? null;
    }
    if (macroId) injectMacro(macroId);
  }

  // Pause block — pauses playback; user resumes with Space / play button
  if (block.type === 'pause') {
    pausePlayback();
  }

  // Breathing block — announce first cycle via TTS if cue is enabled
  if (block.type === 'breathing' && block.breathCue) {
    const inhale = block.breathInSec  ?? 4;
    const hold1  = block.breathHold1Sec ?? 0;
    const exhale = block.breathOutSec  ?? 6;
    const hold2  = block.breathHold2Sec ?? 0;
    const parts  = [`Breathe in for ${inhale}`];
    if (hold1 > 0) parts.push(`hold for ${hold1}`);
    parts.push(`breathe out for ${exhale}`);
    if (hold2 > 0) parts.push(`hold for ${hold2}`);
    const u = new SpeechSynthesisUtterance(parts.join('… ') + '…');
    u.rate   = 0.85;
    u.volume = Math.min(1, state.session.masterVolume * 0.9);
    speechSynthesis.speak(u);
    state.runtime.speechUtterance = u;
  }

  // Entrainment block — start Web Audio binaural/isochronal generator
  if (block.type === 'entrainment') {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, (block.entVolume ?? 0.3) * (state.session.masterVolume ?? 1));
    gain.connect(ctx.destination);

    const carrier = block.entCarrierHz ?? 200;
    const beat    = block.entBeatHz    ?? 10;
    const wave    = block.entWaveform  ?? 'sine';

    // Left channel oscillator
    const merger = ctx.createChannelMerger(2);
    merger.connect(gain);

    const oL = ctx.createOscillator(); oL.type = wave;
    oL.frequency.value = carrier;
    const splL = ctx.createChannelSplitter(1);
    oL.connect(splL); splL.connect(merger, 0, 0);
    oL.start();

    const oR = ctx.createOscillator(); oR.type = wave;
    oR.frequency.value = carrier + beat; // offset = beat frequency
    const splR = ctx.createChannelSplitter(1);
    oR.connect(splR); splR.connect(merger, 0, 1);
    oR.start();

    // Store so we can stop on block exit
    state.runtime._entrainmentCtx = ctx;
    state.runtime._entrainmentOscL = oL;
    state.runtime._entrainmentOscR = oR;
  }
}

// ── Transport UI ────────────────────────────────────────────────────────────
export function updateTransportUI() {
  const { runtime, session } = state;
  if (!runtime) return;
  const pct = Math.min(100, (runtime.sessionTime / session.duration) * 100);
  const fill  = $id('progressFill');
  const thumb = $id('progressThumb');
  if (fill)  fill.style.width = `${pct}%`;
  if (thumb) thumb.style.left = `${pct}%`;
  const cur = $id('tCurrent'); if (cur) cur.textContent = fmt(runtime.sessionTime);
  const tot = $id('tTotal');   if (tot) tot.textContent = fmt(session.duration);
  const ld  = $id('loopDisplay');
  if (ld) {
    ld.style.display = '';
    ld.textContent = runtime.totalLoops
      ? `Loop ${runtime.loopIndex + 1} / ${runtime.totalLoops}`
      : `Loop ${runtime.loopIndex + 1}`;
  }
}

// ── Pause / Resume ──────────────────────────────────────────────────────────
function pauseMedia() {
  speechSynthesis.pause();
  if (state.runtime?.usingAudioEngine) pauseAudioEngine();
  else state.runtime?.backgroundAudio.forEach(a => a.pause());
  state.runtime?.backgroundVideo.forEach(v => v.pause?.());
  state.runtime?.playingOneShots.forEach(a => a.pause?.());
  // Unmount any active viz block animation
  const vizStage = $id('vizStageCanvas');
  if (vizStage && vizStage.dataset.blockId) {
    vizStage.dataset.blockId = '';
    vizStage.style.display = 'none';
    unmountVizBlock(vizStage);
  }
}

function resumeMedia() {
  speechSynthesis.resume();
  if (state.runtime?.usingAudioEngine) resumeAudioEngine();
  else state.runtime?.backgroundAudio.forEach(a => a.play().catch(() => {}));
  state.runtime?.backgroundVideo.forEach(v => v.play?.().catch(() => {}));
  state.runtime?.playingOneShots.forEach(a => a.play?.().catch(() => {}));
}

export function pausePlayback(fromAttention = false) {
  const { runtime } = state;
  if (!runtime || runtime.paused) return;
  runtime.paused = true;
  runtime.pausedByAttention = fromAttention;
  runtime.pauseStartedAt = performance.now();
  cancelAnimationFrame(runtime.raf);
  pauseMedia();
  updatePlayBtn(false);
  const hud = $id('stageHud');
  if (hud) hud.textContent = fromAttention ? 'Paused — attention lost' : 'Paused';
}

export function resumePlayback(fromAttention = false) {
  const { runtime } = state;
  if (!runtime || !runtime.paused) return;
  runtime.totalPausedMs += performance.now() - runtime.pauseStartedAt;
  runtime.paused = false;
  runtime.pausedByAttention = false;
  resumeMedia();
  updatePlayBtn(true);
  tickPlayback();
}

export async function stopPlayback(opts = {}) {
  const { runtime } = state;
  cancelInjection();
  state.fsPaused = false;
  if (!runtime) return;

  // Track completion state
  if (runtime.analytics && !opts.emergency && !opts.silent) {
    runtime.analytics.completionState ??= 'interrupted';
  }

  // ── Immediate synchronous teardown (no async delay) ───────────────────
  // Kill the RAF loop and clear state.runtime FIRST so no tick can run
  // while we await the IDB write below.
  cancelAnimationFrame(runtime.raf);
  speechSynthesis.cancel();
  if (runtime.usingAudioEngine) stopAudioEngine();
  else runtime.backgroundAudio.forEach(a => { try { a.pause(); a.src = ''; } catch {} });
  runtime.backgroundVideo.forEach(v => { try { v.pause?.(); v.src = ''; } catch {} });
  runtime.playingOneShots.forEach(a => { try { a.pause?.(); a.src = ''; } catch {} });
  const bh = $id('bgHost'); if (bh) bh.innerHTML = '';
  const ot = $id('overlayText'); if (ot) { ot.textContent = ''; ot.style.opacity = '0'; }
  const st = $id('subtitleText'); if (st) st.classList.remove('visible');
  const hud = $id('stageHud'); if (hud) hud.textContent = 'Idle';
  const fill  = $id('progressFill');  if (fill)  fill.style.width = '0%';
  const thumb = $id('progressThumb'); if (thumb) thumb.style.left  = '0%';
  const cur   = $id('tCurrent');      if (cur)   cur.textContent  = '00:00';
  const tot   = $id('tTotal');        if (tot)   tot.textContent  = fmt(state.session.duration);
  const ld    = $id('loopDisplay');   if (ld)    { ld.textContent = ''; ld.style.display = 'none'; }
  updatePositionIndicator(0);
  sendDevicePosition(0);
  showIdleHint(true);
  renderIdleScreen();
  state.runtime = null;   // cleared before any await
  updatePlayBtn(false);
  updateRampPanelVisibility();
  if (document.getElementById('fsDialog')?.open) drawTimeline();
  resetStateEngine();
  clearRuleState();
  resetDynamicPacing();
  clearWindowState();

  // ── Async analytics write (background — non-blocking to UI) ───────────
  // Skip for emergency stop and silent resets.
  if (!opts.emergency && !opts.silent && runtime.analytics) {
    const summary = await finaliseAnalytics(runtime);
    if (summary) {
      // Load retainDays from profile before recording
      // loadProfile statically imported from user-profile.js
      const retainDays        = loadProfile().retainDays ?? 180;
      await recordSessionInHistory(summary, retainDays);

      // Award XP / achievements / quests BEFORE showing the modal so results appear in it
      let progressResult = null;
      try {
        const { processSessionEnd } = await import('./achievements.js');
        progressResult = await processSessionEnd(summary, state.session);
      } catch {}

      // Show post-session debrief modal with progress results injected
      _postSessionTimer = setTimeout(() => showPostSessionModal(summary, progressResult), 500);

      // Refresh profile panel if open
      // renderProfilePanel and rebuildProfile statically imported from user-profile.js
      rebuildProfile();
      const _pdlg = document.getElementById('profileDialog');
      if (_pdlg?.open) renderProfilePanel('profileDialogBody').catch(() => {});
    }
  }
}

// Emergency stop — immediately halt everything including device
// Stored timeout id so a new session can cancel a pending post-session modal
let _postSessionTimer = null;

export function emergencyStop() {
  cancelInjection();
  state.fsPaused = false;
  state.injection = null;
  // Kill device output immediately, before anything else
  sendDevicePosition(0);
  if (state.deviceSocket?.readyState === WebSocket.OPEN) {
    try { state.deviceSocket.send(JSON.stringify([{ StopAllDevices: { Id: 99 } }])); } catch {}
  }
  // Hard-cancel all audio
  speechSynthesis.cancel();
  state.runtime?.backgroundAudio.forEach(a => { try { a.pause(); a.currentTime = 0; } catch {} });
  state.runtime?.playingOneShots.forEach(a => { try { a.pause(); a.currentTime = 0; } catch {} });
  // Cancel RAF loop before full stop
  if (state.runtime) cancelAnimationFrame(state.runtime.raf);
  // stopPlayback resets HUD to 'Idle' — we set the emergency message AFTER
  stopPlayback({ emergency: true });
  recordEmergencyStop();
  import('./achievements.js').then(({ awardEmergencyBadge }) => awardEmergencyBadge()).catch(() => {});
  const hud = $id('stageHud');
  if (hud) {
    hud.textContent = '🛑 EMERGENCY STOP';
    hud.style.color = '#e05050';
    setTimeout(() => { hud.textContent = 'Idle'; hud.style.color = ''; }, 4000);
  }
  // Show safety banner with countdown
  _showEmergencyBanner();
  document.exitFullscreen?.().catch(() => {});
}

// ── Safety banner — shown after emergency stop with countdown ─────────────────
// Uses display:none to hide (never removes the node), so re-showing always works.
let _bannerTickTimer = null;

function _showEmergencyBanner() {
  const banner  = $id('safetyBanner');
  const msgEl   = $id('safetyBannerMsg');
  if (!banner) return;

  // Cancel any previous countdown before starting a fresh one
  if (_bannerTickTimer !== null) {
    clearTimeout(_bannerTickTimer);
    _bannerTickTimer = null;
  }

  banner.style.display = 'flex';

  function tick() {
    const remaining = getEmergencyCooldownRemaining();
    if (remaining <= 0) {
      banner.style.display = 'none';
      _bannerTickTimer = null;
      return;
    }
    if (msgEl) msgEl.textContent = `🛑 Emergency cooldown — restart blocked for ${Math.ceil(remaining)}s`;
    _bannerTickTimer = setTimeout(tick, 1000);
  }
  tick();
}

// ── Live status tab refresh ──────────────────────────────────────────────────
function refreshLiveStatus() {
  const rt = state.runtime;
  if (!rt) return;
  const sv = $id('s_timeVal');  if (sv) sv.textContent = `${fmt(rt.sessionTime)} / ${fmt(state.session.duration)}`;
  const lv = $id('s_loopVal');  if (lv) lv.textContent = rt.totalLoops ? `${rt.loopIndex+1} / ${rt.totalLoops}` : `${rt.loopIndex+1} / ∞`;
  const bv = $id('s_blockVal'); if (bv) bv.textContent = rt.activeBlock?.label || '—';
  const fv = $id('s_fsPos');    if (fv) fv.textContent = `${Math.round(fsState.lastSentPos)}%`;
  const sc = $id('s_sceneVal'); if (sc) sc.textContent = rt.activeScene?.scene.name || '—';
  // Engine state metrics
  const es = state.engineState;
  if (es) {
    const av = $id('s_attentionVal');  if (av) av.textContent = `${Math.round(es.attention * 100)}%`;
    const ev = $id('s_engageVal');     if (ev) ev.textContent = `${Math.round(es.engagement * 100)}%`;
  }
}

// ── Seek ────────────────────────────────────────────────────────────────────
export function seekTo(pct) {
  const { runtime, session } = state;
  if (!runtime) return;
  if (!Number.isFinite(pct)) return;  // guard NaN from click events on zero-width bar
  const clampedPct = Math.max(0, Math.min(1, pct));
  cancelInjection();
  safeEaseTo0(() => {
    const targetSec = clampedPct * session.duration;
    runtime.startedAt = performance.now() - runtime.totalPausedMs - targetSec * 1000;
  });
}

// ── Skip — eases FS to 0 at half-speed before jumping ─────────────────────
export function skipBy(deltaSec) {
  const { runtime, session } = state;
  if (!runtime) return;
  cancelInjection();
  safeEaseTo0(() => {
    // Clamp so backward skip can't push totalSec negative
    const currentTotalSec = (performance.now() - runtime.startedAt - runtime.totalPausedMs) / 1000;
    const targetTotalSec  = Math.max(0, currentTotalSec + deltaSec);
    runtime.startedAt = performance.now() - runtime.totalPausedMs - targetTotalSec * 1000;
  });
}

// ── Skip to a named scene by id ────────────────────────────────────────────
export function skipToScene(sceneId) {
  const { runtime, session } = state;
  if (!runtime || !session.scenes?.length) return;
  const scene = session.scenes.find(s => s.id === sceneId);
  if (!scene) return;
  cancelInjection();
  safeEaseTo0(() => {
    const targetSec = scene.start;
    runtime.startedAt = performance.now() - runtime.totalPausedMs - targetSec * 1000;
  });
}
