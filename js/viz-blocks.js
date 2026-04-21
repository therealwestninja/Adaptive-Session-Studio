// ── viz-blocks.js ────────────────────────────────────────────────────────────
// Phase 3 — Visualization Block Type
//
// Renders hypnotic Canvas animations as the stage background during playback
// of 'viz' blocks. Five built-in patterns, each tunable by vizSpeed and vizColor.
//
// Inspired by DIY-Hypnotism/hypnotic-visualizations (MIT).
// All rendering is pure Canvas 2D — no WebGL, no external deps.
//
// Architecture:
//   - mountVizBlock(canvas, block) — starts a rAF animation loop
//   - unmountVizBlock(canvas)      — cancels the loop and clears the canvas
//   - One canvas is reused per stage; the loop is replaced on block change.

const _loops = new WeakMap(); // canvas → { rafId, stop }

// ── Public API ────────────────────────────────────────────────────────────────

export function mountVizBlock(canvas, block) {
  if (!canvas) return;
  unmountVizBlock(canvas); // cancel any existing loop

  const ctx   = canvas.getContext('2d');
  const color = block.vizColor || '#c49a3c';
  const speed = Math.max(0.25, Math.min(4, block.vizSpeed ?? 1.0));

  let rafId = null;
  let stopped = false;
  let t = 0;

  const RENDERERS = {
    spiral:      renderSpiral,
    pendulum:    renderPendulum,
    tunnel:      renderTunnel,
    pulse:       renderPulse,
    vortex:      renderVortex,
    lissajous:   renderLissajous,
    colorwash:   renderColorWash,
    geometricoom:renderGeometricZoom,
    starburst:   renderStarburst,
    fractalweb:  renderFractalWeb,
    ripple:      renderRipple,
    mandala:     renderMandala,
  };
  const render = RENDERERS[block.vizType] ?? renderSpiral;

  function frame(ts) {
    if (stopped) return;
    t = (ts / 1000) * speed;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    render(ctx, W, H, t, color);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  _loops.set(canvas, { rafId, stop: () => { stopped = true; cancelAnimationFrame(rafId); } });
}

export function unmountVizBlock(canvas) {
  const loop = _loops.get(canvas);
  if (loop) { loop.stop(); _loops.delete(canvas); }
  const ctx = canvas?.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  // Expand shorthand #RGB → #RRGGBB so parseInt slices always find 2 hex digits.
  // _safeColor accepts 3–8 char hex, so we must handle the short form here.
  let h = hex.slice(1); // strip leading '#'
  if (h.length === 3) h = h[0]+h[0] + h[1]+h[1] + h[2]+h[2];
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  // Guard NaN from malformed input — fall back to mid-grey so renders don't break
  return `${Number.isFinite(r)?r:128},${Number.isFinite(g)?g:128},${Number.isFinite(b)?b:128}`;
}

function polarToXY(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

// ── 1. Spiral ─────────────────────────────────────────────────────────────────
// Archimedes spiral that rotates and pulses, classic induction tool.
function renderSpiral(ctx, W, H, t, color) {
  const cx = W / 2, cy = H / 2;
  const maxR = Math.min(W, H) * 0.48;
  const rgb  = hexToRgb(color);
  const turns = 8;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  for (let arm = 0; arm < 2; arm++) {
    const armOff = arm * Math.PI;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= 600; i++) {
      const frac  = i / 600;
      const angle = frac * Math.PI * 2 * turns - t + armOff;
      const r     = frac * maxR;
      const [x, y] = polarToXY(cx, cy, r, angle);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    const opacity = 0.55 + 0.25 * Math.sin(t * 0.5);
    ctx.strokeStyle = `rgba(${rgb},${opacity})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Pulsing center dot
  const dotR = 6 + 4 * Math.sin(t * 2);
  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb},0.9)`;
  ctx.fill();
}

// ── 2. Pendulum ───────────────────────────────────────────────────────────────
// Harmonograph-style dual-pendulum trace with fading tail.
function renderPendulum(ctx, W, H, t, color) {
  const cx = W / 2, cy = H / 2;
  const rx = W * 0.38, ry = H * 0.38;
  const rgb = hexToRgb(color);
  const steps = 2400;
  const TAIL  = 800; // how many steps of history to fade

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, W, H);

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const age  = (steps - i) / TAIL;
    const s    = (t - frac * 4) ;
    const x    = cx + rx * Math.sin(s * 1.23 + 0.4) * Math.cos(s * 0.71);
    const y    = cy + ry * Math.sin(s * 0.97 + 1.1) * Math.cos(s * 1.03);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(${rgb},0.6)`;
  ctx.lineWidth   = 1.2;
  ctx.stroke();
}

// ── 3. Tunnel ─────────────────────────────────────────────────────────────────
// Concentric rings rushing toward the viewer — classic hypnosis tunnel.
function renderTunnel(ctx, W, H, t, color) {
  const cx  = W / 2, cy = H / 2;
  const rgb = hexToRgb(color);
  const maxR = Math.hypot(cx, cy) * 1.1;
  const RINGS = 18;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  for (let i = RINGS; i >= 0; i--) {
    const frac   = ((i / RINGS) + (t * 0.18)) % 1;
    const r      = frac * maxR;
    const alpha  = (1 - frac) * 0.65 + 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb},${alpha})`;
    ctx.lineWidth   = 1.5 + (1 - frac) * 3;
    ctx.stroke();
  }

  // Bright center
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.15);
  g.addColorStop(0, `rgba(${rgb},0.7)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
}

// ── 4. Pulse ──────────────────────────────────────────────────────────────────
// Radiating pulse rings that expand from center — good for rhythm/heartbeat.
function renderPulse(ctx, W, H, t, color) {
  const cx  = W / 2, cy = H / 2;
  const rgb = hexToRgb(color);
  const maxR = Math.min(W, H) * 0.46;
  const PULSES = 6;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < PULSES; i++) {
    const phase = (t * 0.45 + i / PULSES) % 1;
    const r     = phase * maxR;
    const alpha = (1 - phase) * 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb},${alpha})`;
    ctx.lineWidth = 2 + (1 - phase) * 5;
    ctx.stroke();
  }

  // Solid center
  ctx.beginPath();
  ctx.arc(cx, cy, 10 + 4 * Math.sin(t * 3), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb},0.85)`;
  ctx.fill();
}

// ── 5. Vortex ─────────────────────────────────────────────────────────────────
// Rotating star-like vortex with layered arms — peak/surrender scenes.
function renderVortex(ctx, W, H, t, color) {
  const cx  = W / 2, cy = H / 2;
  const rgb = hexToRgb(color);
  const maxR = Math.min(W, H) * 0.44;
  const ARMS = 6;

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, W, H);

  for (let arm = 0; arm < ARMS; arm++) {
    const baseAngle = (arm / ARMS) * Math.PI * 2 + t * 0.6;
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= 300; i++) {
      const frac  = i / 300;
      const angle = baseAngle + frac * Math.PI * 3;
      const r     = frac * maxR * (0.8 + 0.2 * Math.sin(t * 1.5 + arm));
      const [x, y] = polarToXY(cx, cy, r, angle);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    const opacity = 0.35 + 0.25 * Math.sin(t + arm);
    ctx.strokeStyle = `rgba(${rgb},${opacity})`;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }
}

// ── VIZ_PRESETS for the inspector UI ─────────────────────────────────────────
// ── New renderers ─────────────────────────────────────────────────────────────

function renderLissajous(ctx, W, H, t, color) {
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.85;
  ctx.shadowColor = color; ctx.shadowBlur = 10;
  const a = 3, b = 2, delta = t * 0.4;
  ctx.beginPath();
  for (let i = 0; i <= 600; i++) {
    const θ = (i / 600) * Math.PI * 2;
    const x = cx + R * Math.sin(a * θ + delta);
    const y = cy + R * Math.sin(b * θ);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  // fading trail overlay
  ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function renderColorWash(ctx, W, H, t, color) {
  // Slow HSL drift across the canvas with subtle radial gradient
  const hue  = (t * 12 + parseInt(color.slice(1), 16) % 360) % 360;
  const hue2 = (hue + 40) % 360;
  const grad = ctx.createRadialGradient(W * 0.4, H * 0.4, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  grad.addColorStop(0, `hsla(${hue},  70%, 35%, 1)`);
  grad.addColorStop(0.5,`hsla(${hue2},60%, 20%, 1)`);
  grad.addColorStop(1,  `hsla(${(hue+180)%360},50%, 8%, 1)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Soft vignette
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.75);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
}

function renderGeometricZoom(ctx, W, H, t, color) {
  const cx = W / 2, cy = H / 2;
  const sides = 6;
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
  for (let ring = 0; ring < 10; ring++) {
    const r = ((ring * 0.12 + (t * 0.08) % 1) % 1) * Math.min(W, H) * 0.55;
    const alpha = ring < 2 ? ring * 0.5 : Math.max(0, 1 - ring * 0.09);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2 + t * 0.2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function renderStarburst(ctx, W, H, t, color) {
  const cx = W / 2, cy = H / 2, spokes = 16;
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
  for (let s = 0; s < spokes; s++) {
    const angle = (s / spokes) * Math.PI * 2 + t * 0.3;
    const len   = Math.min(W, H) * 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + s * 0.9));
    const alpha = 0.4 + 0.5 * Math.abs(Math.sin(t * 0.8 + s * 0.5));
    ctx.globalAlpha = alpha;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function renderFractalWeb(ctx, W, H, t, color) {
  const cx = W / 2, cy = H / 2;
  function branch(x, y, angle, len, depth) {
    if (depth === 0 || len < 2) return;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    ctx.globalAlpha = depth / 7;
    ctx.lineWidth = depth * 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    const spread = 0.6 + 0.3 * Math.sin(t * 0.5);
    branch(x2, y2, angle - spread, len * 0.68, depth - 1);
    branch(x2, y2, angle + spread, len * 0.68, depth - 1);
  }
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
  const arms = 5;
  for (let i = 0; i < arms; i++) {
    const baseAngle = (i / arms) * Math.PI * 2 + t * 0.12;
    branch(cx, cy, baseAngle, Math.min(W, H) * 0.22, 6);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function renderRipple(ctx, W, H, t, color) {
  const sources = [
    { x: W * 0.35, y: H * 0.4,  phase: 0 },
    { x: W * 0.65, y: H * 0.55, phase: 1.4 },
    { x: W * 0.5,  y: H * 0.25, phase: 2.8 },
  ];
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;
  const [r, g, b] = color.match(/\w\w/g)?.map(x => parseInt(x, 16)) ?? [196, 154, 60];
  for (let px = 0; px < W; px += 2) {
    for (let py = 0; py < H; py += 2) {
      let amp = 0;
      for (const s of sources) {
        const d = Math.hypot(px - s.x, py - s.y);
        amp += Math.sin(d * 0.04 - t * 3 + s.phase);
      }
      const v = Math.round((amp / 3 + 1) * 0.5 * 255);
      const idx = (py * W + px) * 4;
      data[idx] = (r * v) >> 8; data[idx+1] = (g * v) >> 8; data[idx+2] = (b * v) >> 8; data[idx+3] = 255;
      // Fill 2x2 block
      const idx2 = ((py+1) * W + px) * 4; if (idx2+3 < data.length) { data[idx2]=data[idx]; data[idx2+1]=data[idx+1]; data[idx2+2]=data[idx+2]; data[idx2+3]=255; }
      const idx3 = (py * W + px+1) * 4;   if (idx3+3 < data.length) { data[idx3]=data[idx]; data[idx3+1]=data[idx+1]; data[idx3+2]=data[idx+2]; data[idx3+3]=255; }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function renderMandala(ctx, W, H, t, color) {
  const cx = W / 2, cy = H / 2, petals = 8;
  ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  for (let layer = 0; layer < 4; layer++) {
    const R = (layer + 1) * Math.min(W, H) * 0.1;
    const spin = t * (layer % 2 === 0 ? 0.2 : -0.15) + layer * 0.4;
    ctx.globalAlpha = 0.6 - layer * 0.1;
    ctx.lineWidth = 1.8 - layer * 0.3;
    for (let p = 0; p < petals; p++) {
      const base = (p / petals) * Math.PI * 2 + spin;
      const tip  = base + Math.PI / petals;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const cpX = cx + R * 1.5 * Math.cos(base + 0.3);
      const cpY = cy + R * 1.5 * Math.sin(base + 0.3);
      const ex = cx + R * Math.cos(tip);
      const ey = cy + R * Math.sin(tip);
      ctx.quadraticCurveTo(cpX, cpY, ex, ey);
      ctx.stroke();
    }
    // Inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

export const VIZ_TYPES = [
  { id: 'spiral',      label: '🌀 Spiral',        desc: 'Rotating Archimedes spiral — classic induction' },
  { id: 'pendulum',    label: '〰 Pendulum',       desc: 'Harmonograph trace — entrancing and organic' },
  { id: 'tunnel',      label: '⭕ Tunnel',         desc: 'Concentric rings rushing inward — depth induction' },
  { id: 'pulse',       label: '💗 Pulse',          desc: 'Expanding rings — good for heartbeat / rhythm sync' },
  { id: 'vortex',      label: '🌪 Vortex',        desc: 'Multi-arm rotating star — peak/surrender scenes' },
  { id: 'lissajous',   label: '∞ Lissajous',      desc: 'Parametric figure-8 traces — hypnotic and mathematical' },
  { id: 'colorwash',   label: '🎨 Colour Wash',   desc: 'Slowly shifting full-screen HSL colour field — ambient and calming' },
  { id: 'geometricoom',label: '🔷 Geometric Zoom', desc: 'Nested polygons zooming outward — depth and focus' },
  { id: 'starburst',   label: '✨ Starburst',      desc: 'Radiating spokes that rotate and shimmer' },
  { id: 'fractalweb',  label: '🕸 Fractal Web',   desc: 'Iterative branching web — complex and mesmerising' },
  { id: 'ripple',      label: '💧 Ripple',         desc: 'Interference patterns from multiple wave sources' },
  { id: 'mandala',     label: '🔯 Mandala',        desc: 'Rotating symmetric petals — meditative and balanced' },
];

// ── BPM → FunScript generator (biogroove-inspired) ────────────────────────────
// Generates a FunScript action array synchronized to a musical tempo.
// Useful for music-synced training or rhythm-based sessions.
//
// @param {number} bpm           - beats per minute (30–240)
// @param {number} durationSec   - total pattern length in seconds
// @param {string} shape         - 'sine' | 'square' | 'sawtooth' | 'bounce'
// @param {number} amplitude     - peak position (default 90, range 0–100)
// @param {number} baseline      - lowest position (default 10, range 0–100)
// @param {number} barsPerBeat   - actions per beat (1=on-beat, 2=eighth-note)
export function generateFromBPM({
  bpm          = 80,
  durationSec  = 60,
  shape        = 'sine',
  amplitude    = 90,
  baseline     = 10,
  barsPerBeat  = 1,
} = {}) {
  // Guard NaN/Infinity from parseInt('', 10) or other bad callers before any math
  const safeBPM      = Number.isFinite(bpm)         ? bpm         : 80;
  const safeDur      = Number.isFinite(durationSec)  ? durationSec : 60;
  const safeAmp      = Number.isFinite(amplitude)    ? amplitude   : 90;
  const safeBase     = Number.isFinite(baseline)     ? baseline    : 10;
  const safeBars     = Number.isFinite(barsPerBeat)  ? barsPerBeat : 1;
  const clampBPM = Math.max(30, Math.min(240, safeBPM));
  const beatMs   = (60 / clampBPM) * 1000;
  const stepMs   = beatMs / Math.max(1, safeBars);
  const totalMs  = safeDur * 1000;
  // Ensure amplitude >= baseline so waveforms don't invert when baseline > amplitude
  const lo  = Math.min(safeBase, safeAmp);
  const hi  = Math.max(safeBase, safeAmp);
  const amp = hi - lo;
  const actions  = [];

  const SHAPES = {
    sine:     frac => lo + amp * (0.5 - 0.5 * Math.cos(frac * Math.PI * 2)),
    square:   frac => frac < 0.5 ? hi : lo,
    sawtooth: frac => frac < 0.7 ? lo + amp * (frac / 0.7) : hi - amp * ((frac - 0.7) / 0.3),
    bounce:   frac => {
      const x = frac * 2;
      if (x < 1) return lo + amp * (1 - (x - 1) * (x - 1));
      return lo + amp * 0.3 * Math.sin((x - 1) * Math.PI);
    },
  };
  const fn = SHAPES[shape] ?? SHAPES.sine;

  for (let t = 0; t <= totalMs; t += stepMs) {
    const beatFrac = ((t % beatMs) / beatMs);
    const pos = Math.max(0, Math.min(100, Math.round(fn(beatFrac))));
    actions.push({ at: Math.round(t), pos });
  }
  return actions;
}
