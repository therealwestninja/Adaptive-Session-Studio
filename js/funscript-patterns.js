// ── funscript-patterns.js ──────────────────────────────────────────────────
// Pre-generated FunScript movement patterns for demo and starting-point use.
// Each pattern is a complete FunScript object (version, inverted, range, actions).
//
// All patterns are 60 seconds (60000ms) by default so they loop cleanly with
// the engine. Authors can import one as a new track then adjust as needed.
//
// Pattern generation is pure math — no randomness — so patterns are
// reproducible and predictable for session design purposes.

// ── Generator helpers ────────────────────────────────────────────────────────

// Track colors for new tracks added from the pattern library
// Mirrors the constant in funscript.js (not exported from there)
const TRACK_COLORS = ['#f0a04a', '#5fa0dc', '#7dc87a', '#b084cc', '#e07a5f', '#64b5c8'];

/** Clamp a value to [0, 100] and round to nearest integer */
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

/**
 * Build an action array by sampling a position function at a given interval.
 * @param {function} fn      (t: 0–1) → position 0–100
 * @param {number}   durMs   total duration in milliseconds
 * @param {number}   stepMs  sampling interval (default 100ms)
 */
function sample(fn, durMs = 60_000, stepMs = 100) {
  const actions = [];
  for (let t = 0; t <= durMs; t += stepMs) {
    actions.push({ at: t, pos: clamp(fn(t / durMs)) });
  }
  return actions;
}

/** Sine oscillation between lo and hi with given period in ms */
function sine(lo, hi, periodMs) {
  const amp = (hi - lo) / 2;
  const mid = lo + amp;
  return t => mid + amp * Math.sin((t * 2 * Math.PI * 60_000) / periodMs);
}

/** Linear ramp from start to end over [0, 1] */
function ramp(start, end) {
  return t => start + (end - start) * t;
}

/** Combine two functions with a cross-fade weight */
function blend(fnA, fnB, weight = 0.5) {
  return t => fnA(t) * (1 - weight) + fnB(t) * weight;
}

// ── Pattern definitions ───────────────────────────────────────────────────────

export const FUNSCRIPT_PATTERNS = [

  // ── 1. Slow Pulse ──────────────────────────────────────────────────────────
  // Gentle, deliberate sine oscillation. Good as a baseline or for induction.
  {
    id:          'slow-pulse',
    name:        'Slow Pulse',
    category:    'Steady',
    icon:        '〰',
    description: 'Smooth, unhurried oscillation between 10% and 90%. Good base layer for long sessions.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const s = sine(10, 90, 4_000);
      return s(t);
    }),
  },

  // ── 2. Steady Rhythm ───────────────────────────────────────────────────────
  // Consistent medium-pace rhythm, predictable and reliable.
  {
    id:          'steady-rhythm',
    name:        'Steady Rhythm',
    category:    'Steady',
    icon:        '♩',
    description: 'Medium-pace consistent rhythm. Reliable and predictable — good for conditioning sessions.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const s = sine(15, 85, 1_800);
      return s(t);
    }),
  },

  // ── 3. Slow Build ─────────────────────────────────────────────────────────
  // Oscillation that gradually widens its range and speeds up over 60 seconds.
  {
    id:          'slow-build',
    name:        'Slow Build',
    category:    'Escalating',
    icon:        '📈',
    description: 'Starts subtle, widens range and quickens pace over 60 seconds. Pairs well with Build/Peak scenes.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const progress = t; // 0→1
      const lo  = 50 - (40 * progress);      // starts narrow (45–55), ends wide (10–90)
      const hi  = 50 + (40 * progress);
      const period = 5_000 - (3_200 * progress); // slows from 5s to 1.8s period
      const amp  = (hi - lo) / 2;
      const mid  = lo + amp;
      const phase = (t * 2 * Math.PI * 60_000) / Math.max(period, 100);
      return mid + amp * Math.sin(phase);
    }),
  },

  // ── 4. Wave Surge ─────────────────────────────────────────────────────────
  // Layered slow + fast sine. Creates natural, less mechanical feel.
  {
    id:          'wave-surge',
    name:        'Wave Surge',
    category:    'Natural',
    icon:        '🌊',
    description: 'Two overlapping sine waves creating an organic, surging rhythm. Less mechanical than a single oscillation.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const slow = sine(20, 80, 6_000)(t);
      const fast = sine(0,  40, 1_600)(t);
      return (slow * 0.65 + fast * 0.35);
    }),
  },

  // ── 5. Heartbeat ──────────────────────────────────────────────────────────
  // Double-beat pulse followed by a longer rest, like a cardiac rhythm.
  {
    id:          'heartbeat',
    name:        'Heartbeat',
    category:    'Natural',
    icon:        '💗',
    description: 'Double-beat pulse with a long rest — evokes a heartbeat pattern. Intimate and tension-building.',
    inverted:    false,
    range:       100,
    actions: (() => {
      // One beat cycle = 900ms. Two beats then rest.
      const cycleDurMs = 900;
      const actions = [];
      for (let t = 0; t <= 60_000; t += 25) {
        const phase = (t % (cycleDurMs * 2.5)) / cycleDurMs;
        let pos;
        if (phase < 0.15)      pos = phase / 0.15 * 90;          // beat 1 up
        else if (phase < 0.30) pos = 90 - (phase - 0.15) / 0.15 * 70; // beat 1 down
        else if (phase < 0.45) pos = 20 + (phase - 0.30) / 0.15 * 80; // beat 2 up
        else if (phase < 0.65) pos = 100 - (phase - 0.45) / 0.20 * 90; // beat 2 down
        else                   pos = 10; // rest
        actions.push({ at: t, pos: clamp(pos) });
      }
      return actions;
    })(),
  },

  // ── 6. Tease & Edge ───────────────────────────────────────────────────────
  // Climbs to peak quickly, drops back before the top, repeats.
  // Designed to maintain high arousal without release.
  {
    id:          'tease-edge',
    name:        'Tease & Edge',
    category:    'Escalating',
    icon:        '🔺',
    description: 'Climbs quickly toward peak, retreats before the top, then climbs again. Maintains sustained tension.',
    inverted:    false,
    range:       100,
    actions: (() => {
      const actions = [];
      const cycleDurMs = 3_000;
      for (let t = 0; t <= 60_000; t += 50) {
        const phase = (t % cycleDurMs) / cycleDurMs;
        let pos;
        if (phase < 0.40)      pos = 10 + (phase / 0.40) * 80;       // fast climb to 90
        else if (phase < 0.50) pos = 90 - ((phase - 0.40) / 0.10) * 55; // quick drop to 35
        else if (phase < 0.80) pos = 35 + ((phase - 0.50) / 0.30) * 50; // slow climb back to 85
        else                   pos = 85 - ((phase - 0.80) / 0.20) * 75; // drop to 10
        actions.push({ at: t, pos: clamp(pos) });
      }
      return actions;
    })(),
  },

  // ── 7. Deep Descent ───────────────────────────────────────────────────────
  // Starts at the top and slowly descends over 60 seconds. Good for closing/recovery.
  {
    id:          'deep-descent',
    name:        'Deep Descent',
    category:    'Calming',
    icon:        '🌱',
    description: 'Begins at full intensity and slowly winds down over 60 seconds. Good for recovery scenes or endings.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const base  = ramp(85, 15)(t);         // overall descent
      const osc   = sine(-20, 20, 3_000)(t);  // still oscillating throughout
      return base + osc;
    }),
  },

  // ── 8. Cascade ────────────────────────────────────────────────────────────
  // Fast cascading peaks that become more frequent over time.
  {
    id:          'cascade',
    name:        'Cascade',
    category:    'Escalating',
    icon:        '⚡',
    description: 'Rapid cascading peaks that accelerate over time. High-energy — save for Peak scenes.',
    inverted:    false,
    range:       100,
    actions: (() => {
      const actions = [];
      for (let t = 0; t <= 60_000; t += 50) {
        const progress = t / 60_000;
        const period   = Math.max(600, 2_200 - progress * 1_600); // speeds up from 2.2s to 0.6s
        const phase    = (t % period) / period;
        let pos;
        if (phase < 0.35)      pos = phase / 0.35 * 95;
        else if (phase < 0.55) pos = 95 - (phase - 0.35) / 0.20 * 85;
        else                   pos = 10 + (phase - 0.55) / 0.45 * 10;
        actions.push({ at: t, pos: clamp(pos) });
      }
      return actions;
    })(),
  },

  // ── 9. Breath Sync ────────────────────────────────────────────────────────
  // Slow 6-second cycle matching a calm breathing rhythm. Grounding + mindful.
  {
    id:          'breath-sync',
    name:        'Breath Sync',
    category:    'Calming',
    icon:        '🧘',
    description: 'Matches a 6-second breathing cycle (4s in, 2s hold, breathe out). Grounding and meditative.',
    inverted:    false,
    range:       100,
    actions: (() => {
      const actions = [];
      const cycleDurMs = 6_000;
      for (let t = 0; t <= 60_000; t += 100) {
        const phase = (t % cycleDurMs) / cycleDurMs;
        let pos;
        if (phase < 0.45)      pos = 15 + (phase / 0.45) * 65;          // inhale up
        else if (phase < 0.55) pos = 80;                                   // hold
        else                   pos = 80 - ((phase - 0.55) / 0.45) * 65;  // exhale down
        actions.push({ at: t, pos: clamp(pos) });
      }
      return actions;
    })(),
  },

  // ── 10. Storm ─────────────────────────────────────────────────────────────
  // Chaotic-feeling rapid oscillations at peak intensity. Maximum energy.
  {
    id:          'storm',
    name:        'Storm',
    category:    'Escalating',
    icon:        '🌪',
    description: 'Rapid, overlapping waves at peak intensity. Maximum energy — use sparingly in Peak scenes.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const a = sine(30, 100, 900)(t);
      const b = sine(0,   70, 600)(t);
      const c = sine(20,  80, 1400)(t);
      return (a * 0.5 + b * 0.3 + c * 0.2);
    }, 60_000, 50),
  },

  // ── New patterns ──────────────────────────────────────────────────────────
  {
    id:          'plateau_hold',
    name:        'Plateau Hold',
    icon:        '〒',
    description: 'Rises quickly then holds at a steady plateau — perfect for edge-hold or anticipation scenes.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const ramp = Math.min(1, t / 8000);          // 8s rise
      const waver = sine(60, 75, 1800)(t) * 0.15; // slight tremble at top
      return ramp * 80 + waver;
    }, 40_000, 40),
  },
  {
    id:          'ruined_edge',
    name:        'Ruined Edge',
    icon:        '⚡',
    description: 'Builds to near-peak then drops suddenly, repeating in waves. Edging / denial pattern.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const cycle = (t % 12000) / 12000; // 12-second cycle
      if (cycle < 0.7) return sine(10, 90, 12000 * 0.7)(t % (12000 * 0.7));
      return sine(10, 30, 3600)(t); // sudden drop, low plateau
    }, 60_000, 50),
  },
  {
    id:          'staccato_burst',
    name:        'Staccato Burst',
    icon:        '🥁',
    description: 'Sharp short strokes with pauses between — rhythmic, percussive, high arousal.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const phase = (t % 1200) / 1200; // 1.2s micro-cycle
      return phase < 0.4 ? 90 - phase * 30 : 10;
    }, 30_000, 25),
  },
  {
    id:          'long_slow_draw',
    name:        'Long Slow Draw',
    icon:        '🌊',
    description: 'One very long, deep, slow stroke cycle — meditative, deeply grounding.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      // 10-second full stroke cycle
      const p = (t % 10_000) / 10_000;
      return p < 0.5
        ? p * 2 * 100          // slow descend
        : (1 - (p - 0.5) * 2) * 100; // slow ascend
    }, 60_000, 60),
  },
  {
    id:          'aftershock',
    name:        'Aftershock',
    icon:        '〰️',
    description: 'Starts intense then fades in diminishing tremors — simulates afterglow / resolution.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const decay  = Math.exp(-t / 20_000);       // exponential fade
      const tremor = sine(0, 100, 800)(t) * decay;
      return Math.max(5, tremor);
    }, 60_000, 60),
  },
  {
    id:          'featherlight',
    name:        'Featherlight',
    icon:        '🪶',
    description: 'Barely-there strokes that tease the senses. Extremely gentle — ideal for warm-up or cool-down.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const drift = sine(5, 25, 4000)(t);
      const micro = sine(0, 8,  700)(t);
      return drift + micro;
    }, 60_000, 50),
  },
  {
    id:          'syncopated',
    name:        'Syncopated',
    icon:        '🎵',
    description: 'Off-beat rhythm pattern — two quick, one slow, two quick. Musical and surprising.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      const beat = (t % 4000) / 4000; // 4-second bar
      if (beat < 0.2)  return 85;     // quick
      if (beat < 0.35) return 15;
      if (beat < 0.55) return 90;     // quick
      if (beat < 0.65) return 10;
      if (beat < 0.9)  return 80;     // slow
      return 15;
    }, 60_000, 40),
  },
  {
    id:          'pendulum_deep',
    name:        'Deep Pendulum',
    icon:        '⏳',
    description: 'Full-range pendulum stroke with hypnotic even tempo. Good for deep induction scenes.',
    inverted:    false,
    range:       100,
    actions:     sample(t => {
      // Smooth cosine pendulum, 3s cycle
      return 50 + 48 * Math.cos((t / 3000) * Math.PI * 2);
    }, 60_000, 60),
  },
];

// ── Load a pattern as a new FunScript track ──────────────────────────────────
export function loadPatternAsTrack(patternId) {
  const pattern = FUNSCRIPT_PATTERNS.find(p => p.id === patternId);
  if (!pattern) return false;

  // Imported inline to avoid circular dependency
  return {
    version:  1,
    inverted: pattern.inverted,
    range:    pattern.range,
    actions:  pattern.actions,
    _name:    pattern.name,
  };
}

// ── Render pattern picker panel ───────────────────────────────────────────────
export function renderPatternPicker(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const byCategory = {};
  for (const p of FUNSCRIPT_PATTERNS) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }

  el.innerHTML = `
    <div style="font-size:10px;color:rgba(196,154,60,0.5);text-transform:uppercase;
      letter-spacing:.10em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
      Demo patterns
      <span style="flex:1;height:0.5px;background:rgba(196,154,60,0.12);display:block"></span>
    </div>
    <p style="font-size:10.5px;color:var(--text2);line-height:1.5;margin-bottom:10px">
      Load a pre-built movement pattern as a starting point. Each is 60 seconds and loops cleanly.
    </p>
    ${Object.entries(byCategory).map(([cat, patterns]) => `
      <div style="margin-bottom:10px">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">${cat}</div>
        ${patterns.map(p => `
          <div class="fs-pattern-card" data-pattern-id="${p.id}"
            style="display:flex;align-items:center;gap:8px;padding:7px 9px;margin-bottom:4px;
              border-radius:7px;cursor:pointer;border:0.5px solid rgba(255,255,255,0.06);
              background:rgba(255,255,255,0.02);transition:background 0.13s,border-color 0.13s"
            onmouseover="this.style.background='rgba(196,154,60,0.06)';this.style.borderColor='rgba(196,154,60,0.18)'"
            onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.06)'">
            <span style="font-size:14px;flex-shrink:0">${p.icon}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:11.5px;font-weight:600;color:var(--text)">${p.name}</div>
              <div style="font-size:10px;color:var(--text2);line-height:1.4;margin-top:1px">${p.description}</div>
            </div>
            <span style="font-size:9px;color:var(--text3);flex-shrink:0">${p.actions.length} pts</span>
          </div>`).join('')}
      </div>`).join('')}`;

  el.querySelectorAll('.fs-pattern-card').forEach(card => {
    card.addEventListener('click', async () => {
      if (card.dataset.loading) return;   // guard double-click
      card.dataset.loading = '1';
      card.style.opacity   = '0.6';
      try {
        const patId = card.dataset.patternId;
        const { loadPatternAsTrack } = await import('./funscript-patterns.js');
        const trackData = loadPatternAsTrack(patId);
        if (!trackData) return;

        const { state, persist, uid, normalizeFunscriptTrack } = await import('./state.js');
        const { history } = await import('./history.js');

        history.push();
        // Use the local TRACK_COLORS constant (defined above) — funscript.js does not export it
        const colorIdx = state.session.funscriptTracks.length % TRACK_COLORS.length;
        // Route through normalizeFunscriptTrack so pos values are clamped [0,100]
        // and invalid action entries are dropped — same path as file imports.
        const track = normalizeFunscriptTrack({
          id:       uid(),
          name:     trackData._name,
          version:  trackData.version,
          inverted: trackData.inverted,
          range:    trackData.range,
          actions:  trackData.actions,
          _disabled: false,
          _color:   TRACK_COLORS[colorIdx],
          variant:  '',
        });
        state.session.funscriptTracks.push(track);
        persist();

        const { renderSidebar, renderInspector } = await import('./ui.js');
        renderSidebar();
        renderInspector();

        notify.success(`"${trackData._name}" loaded as a new FunScript track.`);
      } finally {
        delete card.dataset.loading;
        card.style.opacity = '';
      }
    });
  });
}
