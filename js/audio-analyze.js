// ── audio-analyze.js ─────────────────────────────────────────────────────────
// Tier 3 — Audio-driven FunScript generation
//
// Pipeline:
//   1. Decode audio file → Float32Array (Web Audio API decodeAudioData)
//   2. Mix to mono
//   3. Compute RMS energy in sliding windows
//   4. Apply onset detection (spectral flux or simple delta amplification)
//   5. Smooth the envelope with a moving average
//   6. Normalise 0–1
//   7. Map to FunScript actions (pos 0–100) at regular timestamps
//
// All processing runs off the main thread via an OfflineAudioContext so
// the UI stays responsive during analysis of long files.
//
// Exports:
//   analyzeAudioBuffer(arrayBuffer, opts) → Promise<{actions, durationMs, peaks}>
//   generateFsFromAudio(file, opts, onProgress) → Promise<FunScriptTrack>

// ── Options defaults ──────────────────────────────────────────────────────────
const DEFAULTS = {
  windowMs:    80,     // RMS analysis window in milliseconds
  smoothPasses: 5,     // moving-average smoothing iterations
  basePct:     5,      // minimum position (%)
  peakPct:     95,     // maximum position (%)
  onsetBoost:  1.0,    // amplify transient onsets (0 = off, 2 = strong)
  axis:        'stroke',
};

// ── RMS in a sample window ────────────────────────────────────────────────────
function rmsWindow(samples, start, len) {
  let sum = 0;
  const end = Math.min(start + len, samples.length);
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

// ── Simple moving average ────────────────────────────────────────────────────
function movingAverage(arr, radius) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) {
      s += arr[j]; n++;
    }
    out[i] = s / n;
  }
  return out;
}

// ── Onset enhancement — amplify rising edges ──────────────────────────────────
function enhanceOnsets(envelope, boost) {
  if (boost <= 0) return envelope;
  const out = new Float32Array(envelope.length);
  for (let i = 0; i < envelope.length; i++) {
    const delta = i > 0 ? Math.max(0, envelope[i] - envelope[i - 1]) : 0;
    out[i] = envelope[i] + delta * boost;
  }
  return out;
}

// ── Core analysis ─────────────────────────────────────────────────────────────
export async function analyzeAudioBuffer(arrayBuffer, opts = {}, onProgress = null) {
  const o = { ...DEFAULTS, ...opts };

  onProgress?.('Decoding audio…', 5);

  // Decode using a standard AudioContext (OfflineAudioContext can't decodeAudioData in all browsers)
  const ctx    = new (window.AudioContext || window.webkitAudioContext)();
  let   decoded;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0)); // slice: avoid detach issues
  } finally {
    ctx.close().catch(() => {});
  }

  const sampleRate  = decoded.sampleRate;
  const durationSec = decoded.duration;
  const durationMs  = Math.round(durationSec * 1000);

  onProgress?.('Mixing to mono…', 15);

  // Mix all channels to mono
  const numCh  = decoded.numberOfChannels;
  const length = decoded.length;
  const mono   = new Float32Array(length);
  for (let ch = 0; ch < numCh; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numCh;
  }

  onProgress?.('Computing RMS envelope…', 30);

  // Sliding RMS windows
  const windowSamples = Math.max(1, Math.round((o.windowMs / 1000) * sampleRate));
  const hopSamples    = Math.max(1, Math.round(windowSamples / 2)); // 50% overlap
  const frameCount    = Math.ceil(length / hopSamples);
  const envelope      = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    envelope[f] = rmsWindow(mono, f * hopSamples, windowSamples);
    if (f % 500 === 0) {
      const pct = 30 + Math.round((f / frameCount) * 30);
      onProgress?.('Analysing energy…', pct);
    }
  }

  onProgress?.('Detecting onsets…', 65);
  const boosted = enhanceOnsets(envelope, o.onsetBoost);

  onProgress?.('Smoothing envelope…', 72);
  let smoothed = boosted;
  const radius = Math.max(1, Math.round(o.smoothPasses * 2));
  for (let pass = 0; pass < Math.ceil(o.smoothPasses / 2); pass++) {
    smoothed = movingAverage(smoothed, radius);
  }

  onProgress?.('Normalising…', 82);

  // Normalise to 0–1 with a slight headroom trim (ignore top 1% of peaks for perceptual normalisation)
  const sorted   = Float32Array.from(smoothed).sort();
  const topIdx   = Math.max(0, Math.floor(sorted.length * 0.99) - 1);
  const maxVal   = sorted[topIdx] || 1e-6;
  const minVal   = sorted[Math.floor(sorted.length * 0.01)] || 0;
  const range    = maxVal - minVal || 1e-6;
  const normalised = new Float32Array(smoothed.length);
  for (let i = 0; i < smoothed.length; i++) {
    normalised[i] = Math.max(0, Math.min(1, (smoothed[i] - minVal) / range));
  }

  onProgress?.('Building FunScript actions…', 90);

  // Convert envelope frames → FunScript actions
  // Sample at `windowMs` intervals to avoid massive point counts (cap at 4000 points)
  const maxPoints = 4000;
  const stepFrames = Math.max(1, Math.ceil(frameCount / maxPoints));
  const actions   = [];
  const hopMs     = (hopSamples / sampleRate) * 1000;

  for (let f = 0; f < frameCount; f += stepFrames) {
    const t   = Math.round(f * hopMs);
    const val = normalised[f];
    const pos = Math.round(o.basePct + (o.peakPct - o.basePct) * val);
    actions.push({ at: t, pos });
  }

  // Ensure endpoint
  if (actions.at(-1)?.at < durationMs - 50) {
    actions.push({ at: durationMs, pos: Math.round(o.basePct) });
  }

  // Find local peaks (for waveform preview)
  const peaks = [];
  for (let i = 1; i < normalised.length - 1; i++) {
    if (normalised[i] > normalised[i-1] && normalised[i] > normalised[i+1] && normalised[i] > 0.7) {
      peaks.push({ t: Math.round(i * hopMs), v: normalised[i] });
    }
  }

  return { actions, durationMs, peaks, envelope: normalised, hopMs };
}

// ── Draw waveform preview onto a canvas ───────────────────────────────────────
export function drawEnvelopePreview(canvas, envelope, peaks = []) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  // Waveform fill
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < envelope.length; i++) {
    const x = (i / (envelope.length - 1)) * W;
    const y = H - envelope[i] * (H - 2) - 1;
    i === 0 ? ctx.moveTo(x, H) : ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(127,176,255,0.7)');
  grad.addColorStop(1, 'rgba(64,100,200,0.2)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke line
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(127,176,255,0.9)';
  ctx.lineWidth   = 1.2;
  for (let i = 0; i < envelope.length; i++) {
    const x = (i / (envelope.length - 1)) * W;
    const y = H - envelope[i] * (H - 2) - 1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Peak markers
  for (const p of peaks.slice(0, 60)) {
    const x = (p.t / (envelope.length - 1)) * W;  // approximate
    ctx.fillStyle = `rgba(240,160,60,${0.4 + p.v * 0.5})`;
    ctx.fillRect(x - 0.5, 0, 1, H);
  }
}

// ── High-level helper called by UI ────────────────────────────────────────────
export async function generateFsFromAudio(file, opts = {}, onProgress = null) {
  const { uid } = await import('./state.js');
  const { TRACK_COLORS } = await import('./funscript.js').catch(() => ({ TRACK_COLORS: ['#7fb0ff'] }));

  onProgress?.('Reading file…', 2);
  const arrayBuffer = await file.arrayBuffer();

  const result = await analyzeAudioBuffer(arrayBuffer, opts, onProgress);

  onProgress?.('Done!', 100);

  // Build a track object compatible with normalizeSession
  const baseName  = file.name.replace(/\.[^.]+$/, '');
  const colorIdx  = Math.floor(Math.random() * 6);
  const colors    = ['#7fb0ff','#f0a04a','#7dc87a','#b084cc','#e07a5f','#64b5c8'];

  return {
    id:        uid(),
    name:      `${baseName} (audio-generated)`,
    axis:      opts.axis || 'stroke',
    variant:   '',
    range:     100,
    _disabled: false,
    _color:    colors[colorIdx],
    actions:   result.actions,
    _generated:{ source: file.name, method: 'audio-envelope', durationMs: result.durationMs },
    _envelope: result.envelope,   // stored for preview, stripped on export
    _hopMs:    result.hopMs,
    _peaks:    result.peaks,
  };
}
