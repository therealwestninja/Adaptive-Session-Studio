// ── capabilities.js ───────────────────────────────────────────────────────
// Detects browser capabilities at startup and surfaces limitations in the UI.

import { notify } from './notify.js';

export const caps = {
  faceDetector:   false,
  speechSynthesis: false,
  speechRate:     false,
  webAudio:       false,
  fullscreen:     false,
  indexedDB:      false,
};

// ── Run all capability checks ──────────────────────────────────────────────
export function detectCapabilities() {
  caps.faceDetector    = 'FaceDetector' in window;
  caps.speechSynthesis = 'speechSynthesis' in window;
  caps.webAudio        = 'AudioContext' in window || 'webkitAudioContext' in window;
  caps.fullscreen      = 'requestFullscreen' in document.documentElement
                      || 'webkitRequestFullscreen' in document.documentElement;
  caps.indexedDB       = 'indexedDB' in window;

  // Test speech rate (some browsers support synthesis but not rate)
  if (caps.speechSynthesis) {
    try {
      const u = new SpeechSynthesisUtterance('');
      u.rate = 1.5;
      caps.speechRate = true;
    } catch { caps.speechRate = false; }
  }

  return caps;
}

// ── Warn about critical missing features ───────────────────────────────────
export function warnMissingCapabilities() {
  const missing = [];

  if (!caps.faceDetector) {
    missing.push('Webcam attention tracking requires Chrome or Edge (FaceDetector API not available).');
  }
  if (!caps.speechSynthesis) {
    missing.push('Text-to-speech (TTS) is not supported in this browser.');
  }
  if (!caps.fullscreen) {
    missing.push('Fullscreen mode is not supported in this browser.');
  }

  if (missing.length === 1) {
    notify.warn(missing[0], 7000);
  } else if (missing.length > 1) {
    notify.warn(`Some features are unavailable in this browser:\n• ${missing.join('\n• ')}`, 0);
  }
}

// ── Gate UI elements based on capabilities ─────────────────────────────────
export function applyCapabilityGates() {
  // Dim and disable webcam controls if FaceDetector unavailable
  if (!caps.faceDetector) {
    document.querySelectorAll('.requires-face-detector').forEach(el => {
      el.style.opacity = '0.4';
      el.title = 'Requires Chrome or Edge with FaceDetector API';
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'BUTTON') {
        el.disabled = true;
      }
    });
  }

  // Dim TTS controls if speech synthesis unavailable
  if (!caps.speechSynthesis) {
    document.querySelectorAll('.requires-tts').forEach(el => {
      el.style.opacity = '0.4';
      el.title = 'Text-to-speech not available in this browser';
    });
  }
}

// ── Estimate localStorage budget remaining ────────────────────────────────
// localStorage now only holds the onboarding flag (~5 bytes) — most data is in IndexedDB.
// Returns { used, available, percentUsed, warning }
export function checkStorageBudget() {
  try {
    let used = 0;
    for (const key of Object.keys(localStorage)) {
      used += (localStorage.getItem(key) ?? '').length * 2; // UTF-16 bytes approx
    }
    const estimated = 5 * 1024 * 1024; // 5MB typical limit
    const available = Math.max(0, estimated - used);
    const percentUsed = Math.round((used / estimated) * 100);
    const warning = percentUsed > 50; // threshold lowered since session data is in IDB
    return { used, available, percentUsed, warning };
  } catch {
    return { used: 0, available: 0, percentUsed: 0, warning: false };
  }
}
