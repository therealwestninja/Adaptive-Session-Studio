// ── audio-engine.js ────────────────────────────────────────────────────────
// Web Audio API engine for playlist audio tracks.
// Provides proper gain staging, per-track volume, master volume control,
// and linear crossfade between tracks.
//
// One-shot audio blocks (type:'audio') still use HTMLAudioElement directly
// since they are triggered imperatively and need no mixing. Only the
// looping playlist tracks route through this graph.

import { state } from './state.js';

// ── Graph topology ─────────────────────────────────────────────────────────
//
//  BufferSource × N ──► TrackGain × N ──► MasterGain ──► Destination
//
// Each playlist audio track has:
//   - An AudioBuffer (decoded from base64 data URL)
//   - A looping AudioBufferSourceNode
//   - A GainNode (track volume × mute × master)
//
// The MasterGain reflects session.masterVolume × session.advanced.playlistAudioVolume

let _ctx = null;
let _masterGain = null;
const _tracks = [];   // [{ id, sourceNode, gainNode, buffer }]

// ── Init / teardown ─────────────────────────────────────────────────────────
function ensureContext() {
  if (_ctx && _ctx.state !== 'closed') return _ctx;
  _ctx = new (window.AudioContext || window.webkitAudioContext)();
  _masterGain = _ctx.createGain();
  _masterGain.connect(_ctx.destination);
  return _ctx;
}

export async function startAudioEngine() {
  const ctx = ensureContext();
  if (ctx.state === 'suspended') await ctx.resume();

  // Decode and start all non-muted playlist audio tracks
  const { session } = state;
  const masterVol = Math.max(0, Math.min(2,
    (Number.isFinite(session.masterVolume) ? session.masterVolume : 0.8) *
    (Number.isFinite(session.advanced?.playlistAudioVolume) ? session.advanced.playlistAudioVolume : 0.7)
  ));
  _masterGain.gain.setValueAtTime(masterVol, ctx.currentTime);

  for (const track of session.playlists.audio) {
    if (track._muted) continue;
    await _startTrack(track, ctx);
  }
}

async function _startTrack(track, ctx) {
  try {
    const buffer = await _decodeTrack(track, ctx);
    const gainNode  = ctx.createGain();
    gainNode.gain.setValueAtTime(track.volume ?? 1, ctx.currentTime);
    gainNode.connect(_masterGain);

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.loop = true;
    sourceNode.connect(gainNode);
    sourceNode.start(0);

    _tracks.push({ id: track.id, sourceNode, gainNode, buffer });
  } catch (err) {
    console.warn(`[AudioEngine] Failed to start track "${track.name}":`, err);
  }
}

async function _decodeTrack(track, ctx) {
  // Convert base64 data URL to ArrayBuffer
  const dataUrl = track.dataUrl;
  if (!dataUrl) throw new Error('No data URL');
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) throw new Error(`Track "${track.name}": malformed data URL (no comma separator)`);
  const base64  = dataUrl.slice(commaIdx + 1);
  if (!base64)   throw new Error(`Track "${track.name}": data URL has empty base64 payload`);
  const binary  = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return ctx.decodeAudioData(bytes.buffer);
}

// ── Pause / Resume ──────────────────────────────────────────────────────────
export function pauseAudioEngine() {
  _ctx?.suspend();
}

export function resumeAudioEngine() {
  _ctx?.resume();
}

// ── Stop all ────────────────────────────────────────────────────────────────
export function stopAudioEngine() {
  for (const t of _tracks) {
    try { t.sourceNode.stop(); t.sourceNode.disconnect(); t.gainNode.disconnect(); } catch {}
  }
  _tracks.length = 0;
  // Don't close the context — closing prevents reuse and throws if already closed
  // Just suspend it so the browser releases resources
  if (_ctx && _ctx.state !== 'closed') {
    _ctx.suspend();
  }
}

// ── Master volume (live) ────────────────────────────────────────────────────
// NOTE: setMasterVolume is a lower-level helper staged for future per-call
// use (e.g. a fade-to-silence before stop). The master-volume slider uses
// refreshVolumes() instead, which re-derives the full gain graph from state.
export function setMasterVolume(vol, fadeSec = 0) {
  if (!_masterGain) return;
  if (!Number.isFinite(vol)) return;  // guard NaN/Infinity — Web Audio throws on invalid gain
  const targetVol = Math.max(0, Math.min(2, vol * (state.session.advanced.playlistAudioVolume ?? 0.7)));
  if (fadeSec > 0) {
    _masterGain.gain.linearRampToValueAtTime(targetVol, _ctx.currentTime + fadeSec);
  } else {
    _masterGain.gain.setValueAtTime(targetVol, _ctx.currentTime);
  }
}

// ── Remove a single live track (called when a track is deleted during playback) ─
// Stops and disconnects the node so it goes silent immediately.
export function removeSingleTrack(trackId) {
  const idx = _tracks.findIndex(t => t.id === trackId);
  if (idx === -1) return; // track never started (was muted at playback start)
  const { sourceNode, gainNode } = _tracks[idx];
  try { sourceNode.stop(); sourceNode.disconnect(); gainNode.disconnect(); } catch {}
  _tracks.splice(idx, 1);
}

// ── Start a single track (used when unmuting a track that never started) ─────
// Called by the sidebar mute toggle when the audio engine is active but the
// track has no live node (it was muted at playback start, so _startTrack was skipped).
export async function startSingleTrack(track) {
  if (!_ctx) return;
  // If already in _tracks, nothing to do — crossfade() will handle the fade-in
  if (_tracks.find(t => t.id === track.id)) return;
  await _startTrack(track, _ctx);
  // Start at zero gain and fade in so it doesn't pop
  const node = _tracks.find(t => t.id === track.id);
  if (node) {
    const now = _ctx.currentTime;
    const targetVol = (track.volume ?? 1);
    node.gainNode.gain.setValueAtTime(0, now);
    node.gainNode.gain.linearRampToValueAtTime(targetVol, now + 0.6);
  }
}

// ── Crossfade between two tracks ────────────────────────────────────────────
// Fades out the outgoing track's gain and fades in the incoming track's gain
// over `durationSec` seconds. Pass null for either id to do a one-sided fade.
// Called by the sidebar mute toggle and future track-swap UI.
export function crossfade(outgoingId, incomingId, durationSec = 0.6) {
  if (!_ctx) return;
  const now = _ctx.currentTime;
  if (outgoingId) {
    const out = _tracks.find(t => t.id === outgoingId);
    if (out) {
      out.gainNode.gain.setValueAtTime(out.gainNode.gain.value, now);
      out.gainNode.gain.linearRampToValueAtTime(0, now + durationSec);
    }
  }
  if (incomingId) {
    const inc = _tracks.find(t => t.id === incomingId);
    if (inc) {
      const targetVol = state.session.playlists.audio.find(a => a.id === incomingId)?.volume ?? 1;
      inc.gainNode.gain.setValueAtTime(0, now);
      inc.gainNode.gain.linearRampToValueAtTime(targetVol, now + durationSec);
    }
  }
}

// ── Refresh volumes from session state ─────────────────────────────────────
// Called when master volume slider moves during playback, or when a track is
// muted/unmuted. Derives the full gain graph from current session state so
// muted tracks are silenced and unmuted tracks reflect their volume value.
export function refreshVolumes() {
  if (!_masterGain || !_ctx) return;
  const { session } = state;
  const masterVol = Math.max(0, Math.min(2,
    (Number.isFinite(session.masterVolume) ? session.masterVolume : 0.8) *
    (Number.isFinite(session.advanced?.playlistAudioVolume) ? session.advanced.playlistAudioVolume : 0.7)
  ));
  _masterGain.gain.setValueAtTime(masterVol, _ctx.currentTime);
  for (const t of _tracks) {
    const track = session.playlists.audio.find(a => a.id === t.id);
    if (track) {
      // Muted tracks are silenced at the track gain stage; master gain unchanged
      const targetVol = track._muted ? 0 : (track.volume ?? 1);
      t.gainNode.gain.setValueAtTime(targetVol, _ctx.currentTime);
    }
  }
}

// ── Engine available check ───────────────────────────────────────────────────
export function audioEngineAvailable() {
  return !!(window.AudioContext || window.webkitAudioContext);
}
