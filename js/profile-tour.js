// ── profile-tour.js ─────────────────────────────────────────────────────────
// Spotlight-style walkthrough of the Profile dialog.
// Runs once on first open; replayable from the Customize tab.
//
// Design: each step highlights a real DOM element inside the profile dialog
// with an overlay + tooltip. Steps that don't need a highlight show a
// centered card instead.

const PROFILE_TOUR_KEY = 'ass-profile-tour-v1';

// Module-level reference to the active tour's cleanup function.
// Allows startProfileTour() to remove the previous listener on replay.
let _profileTourCleanup = null;

export function hasSeenProfileTour() {
  try { return !!localStorage.getItem(PROFILE_TOUR_KEY); } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(PROFILE_TOUR_KEY, '1'); } catch {}
}

export function resetProfileTour() {
  try { localStorage.removeItem(PROFILE_TOUR_KEY); } catch {}
}

// ── Steps ────────────────────────────────────────────────────────────────────
// Each step: { title, body, target? }
// target = CSS selector relative to #profileDialogBody
// If target is omitted or not found, the card centres in the dialog.
const STEPS = [
  {
    title: 'Your Profile — a quick tour',
    body:  'This is your permanent progress card. XP, levels, achievements, personal records, and daily quests all live here. It takes about 60 seconds to walk through.',
    emoji: '👤',
  },
  {
    title: 'Hero header',
    body:  'Your avatar, name, title, persona, and XP bar are always visible at the top. Click the emoji to cycle through avatars. Click your name to rename yourself. The XP bar fills as you complete sessions and quests.',
    target: '.pdlg-hero',
    emoji: '🧘',
  },
  {
    title: 'Four tabs',
    body:  '<b>Overview</b> shows today\'s quests and your next achievement unlocks. <b>Achievements</b> has the full grid. <b>Records</b> has your activity heatmap and personal bests. <b>Customize</b> lets you pick your title, ring flair, and pinned achievements.',
    target: '.pdlg-tab-bar',
    emoji: '📑',
  },
  {
    title: 'Daily Quests',
    body:  'Three quests are generated each day from a pool of 29 types — each is based on what you actually do in sessions. Complete all three for a bonus XP reward on top of the individual quest payouts. Quests reset at midnight.',
    target: '.pdlg-panel.active',
    emoji: '📋',
  },
  {
    title: 'Almost There',
    body:  'Below the quests you\'ll see up to three achievements you\'re closest to earning — shown with a progress bar and exact count. These update after every session. Use them as short-term targets.',
    target: '.pdlg-next',
    emoji: '🎯',
  },
  {
    title: 'Achievement grid',
    body:  'Open the <b>Achievements</b> tab to see all 95 achievements across 8 categories. Locked achievements show what you need. Hidden achievements are revealed only when earned. Each has an XP reward.',
    emoji: '🏅',
  },
  {
    title: 'Activity heatmap',
    body:  'The <b>Records</b> tab shows a 26-week GitHub-style calendar of your session activity. Gold intensity scales with how many sessions you ran that day. Below it are your personal records — longest streak, best focus score, and more.',
    emoji: '📅',
  },
  {
    title: 'Titles & Flair',
    body:  'In the <b>Customize</b> tab you can choose a <b>Title</b> earned through play — from "The Initiate" to "The Sovereign". You can also unlock <b>Avatar Ring Flairs</b>: Ember Glow, Flame, Emerald, Sapphire, Solid Gold, and Nebula. All earned, never bought.',
    emoji: '✨',
  },
  {
    title: 'Pin your favourites',
    body:  'Also in Customize: pin up to 3 achievements to display in your hero header. They appear every time you open your profile — show off what you\'re most proud of.',
    emoji: '📌',
  },
  {
    title: 'You\'re all set',
    body:  'Complete sessions, finish quests, and earn titles. Your profile grows with you. You can replay this tour any time from the Customize tab at the bottom.',
    emoji: '🚀',
  },
];

// ── Tour controller ───────────────────────────────────────────────────────────
export function startProfileTour({ onDone } = {}) {
  // Remove any existing tour overlay AND its keyboard handler before re-opening.
  // Without this, replaying the tour stacks multiple document keydown listeners.
  if (_profileTourCleanup) { _profileTourCleanup(); _profileTourCleanup = null; }
  document.getElementById('profileTourOverlay')?.remove();

  const dialog = document.getElementById('profileDialog');
  const body   = document.getElementById('profileDialogBody');
  if (!dialog || !body) return;

  let step = 0;

  // ── Overlay: dims the dialog content behind the tooltip ──────────────────
  const overlay = document.createElement('div');
  overlay.id = 'profileTourOverlay';
  overlay.style.cssText = `
    position:absolute; inset:0; z-index:1000;
    pointer-events:none;
  `;

  // ── Spotlight cutout via SVG + clip-path ─────────────────────────────────
  const spotlight = document.createElement('div');
  spotlight.style.cssText = `
    position:absolute; inset:0; z-index:1001;
    background:rgba(5,5,8,0.82);
    backdrop-filter:blur(1px);
    transition:background .25s;
    pointer-events:all;
  `;

  // ── Tooltip card ──────────────────────────────────────────────────────────
  const card = document.createElement('div');
  card.style.cssText = `
    position:absolute; z-index:1002;
    width:min(340px,88vw);
    background:#13131a;
    border:1px solid rgba(196,154,60,0.35);
    border-radius:14px;
    padding:20px 22px 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05);
    transition: top .2s cubic-bezier(.22,1,.36,1), left .2s cubic-bezier(.22,1,.36,1), opacity .18s;
    pointer-events:all;
    font-family: Syne, system-ui, sans-serif;
  `;

  overlay.appendChild(spotlight);
  overlay.appendChild(card);

  // Position card relative to the dialog shell, not the body scroll container
  const shell = dialog.querySelector('.pdlg-shell');
  if (shell) {
    shell.style.position = 'relative';
    shell.appendChild(overlay);
  } else {
    body.appendChild(overlay);
  }

  function getTargetRect(selector) {
    if (!selector) return null;
    const el = body.querySelector(selector);
    if (!el) return null;
    // Use SHELL as the coordinate reference — the overlay is inside shell,
    // so all pixel values for clip-path and card positioning must be relative to it.
    const ref     = shell ?? body;
    const refRect = ref.getBoundingClientRect();
    const elRect  = el.getBoundingClientRect();
    // Scroll element into view before sampling its rect
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return {
      top:    elRect.top  - refRect.top,
      left:   elRect.left - refRect.left,
      width:  elRect.width,
      height: elRect.height,
    };
  }

  function render() {
    const s = STEPS[step];
    const targetRect = getTargetRect(s.target);
    const isLast = step === STEPS.length - 1;
    const isFirst = step === 0;

    // ── Card content ────────────────────────────────────────────────────────
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="font-size:24px;flex-shrink:0;line-height:1">${s.emoji}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#e8e4dc;line-height:1.3">${s.title}</div>
        </div>
        <span style="font-size:10px;color:rgba(255,255,255,0.28);flex-shrink:0;white-space:nowrap">${step+1} / ${STEPS.length}</span>
      </div>

      <div style="font-size:12px;color:rgba(255,255,255,0.62);line-height:1.75;margin-bottom:18px">
        ${s.body}
      </div>

      <!-- Progress dots -->
      <div style="display:flex;justify-content:center;gap:5px;margin-bottom:14px">
        ${STEPS.map((_, i) => `<div style="width:${i===step?18:5}px;height:5px;border-radius:3px;background:${i===step?'rgba(196,154,60,0.85)':'rgba(255,255,255,0.12)'};transition:width .2s,background .2s"></div>`).join('')}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <button id="ptour_skip" style="background:transparent;border:none;color:rgba(255,255,255,0.25);font-size:11px;cursor:pointer;padding:0;font-family:inherit;transition:color .12s">
          ${isLast ? '' : 'Skip tour'}
        </button>
        <div style="display:flex;gap:7px">
          ${!isFirst ? `<button id="ptour_back" style="padding:7px 15px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.5);font-size:12px;cursor:pointer;font-family:inherit;transition:all .12s">← Back</button>` : ''}
          <button id="ptour_next" style="padding:7px 20px;border-radius:8px;border:0.5px solid rgba(196,154,60,0.45);background:rgba(196,154,60,0.12);color:rgba(196,154,60,0.95);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s">
            ${isLast ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>`;

    card.querySelector('#ptour_skip')?.addEventListener('click', dismiss);
    card.querySelector('#ptour_back')?.addEventListener('click', () => { step--; render(); });
    card.querySelector('#ptour_next')?.addEventListener('click', () => {
      if (!isLast) { step++; render(); }
      else dismiss();
    });

    // ── Position the card and spotlight ────────────────────────────────────
    const shellRect = shell ? shell.getBoundingClientRect() : body.getBoundingClientRect();
    const cardW = 340;
    const cardH = 220; // rough estimate

    if (targetRect) {
      // Poke a transparent rectangle in the spotlight
      spotlight.style.clipPath = `polygon(
        0% 0%, 100% 0%, 100% 100%, 0% 100%,
        0% ${targetRect.top - 6}px,
        ${targetRect.left - 6}px ${targetRect.top - 6}px,
        ${targetRect.left - 6}px ${targetRect.top + targetRect.height + 6}px,
        ${targetRect.left + targetRect.width + 6}px ${targetRect.top + targetRect.height + 6}px,
        ${targetRect.left + targetRect.width + 6}px ${targetRect.top - 6}px,
        0% ${targetRect.top - 6}px
      )`;

      // Position tooltip below the target, or above if too close to bottom
      const shellH = shellRect.height;
      const targetBottom = targetRect.top + targetRect.height;
      const spaceBelow = shellH - targetBottom;

      let cardTop, cardLeft;
      if (spaceBelow > cardH + 20) {
        cardTop  = targetBottom + 14;
      } else {
        cardTop  = Math.max(8, targetRect.top - cardH - 14);
      }
      // Centre horizontally over target
      cardLeft = Math.max(8, Math.min(
        shellRect.width - cardW - 8,
        targetRect.left + targetRect.width / 2 - cardW / 2
      ));
      card.style.top  = `${cardTop}px`;
      card.style.left = `${cardLeft}px`;
    } else {
      // No target — clear spotlight and centre card
      spotlight.style.clipPath = '';
      const centreTop  = Math.max(80, (shellRect.height - cardH) / 2);
      const centreLeft = Math.max(16, (shellRect.width  - cardW) / 2);
      card.style.top  = `${centreTop}px`;
      card.style.left = `${centreLeft}px`;
    }
  }

  function dismiss() {
    markSeen();
    cleanup(); // always remove keyboard handler regardless of exit path
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .2s';
    setTimeout(() => overlay.remove(), 220);
    onDone?.();
  }

  // Keyboard nav — registered in CAPTURE phase so stopPropagation() fires
  // before the bubble-phase global handler in main.js (which calls emergencyStop).
  const _kh = e => {
    if (e.key === 'Escape')     { e.stopPropagation(); e.stopImmediatePropagation(); dismiss(); }
    if (e.key === 'ArrowRight') { if (step < STEPS.length - 1) { step++; render(); } }
    if (e.key === 'ArrowLeft')  { if (step > 0) { step--; render(); } }
  };
  function cleanup() { document.removeEventListener('keydown', _kh, true); }
  document.addEventListener('keydown', _kh, true);
  _profileTourCleanup = cleanup; // expose so replay can remove this handler

  render();
}

// ── Close the profile tour from outside (e.g. when the dialog closes) ─────────
export function closeProfileTour() {
  if (_profileTourCleanup) {
    _profileTourCleanup();
    _profileTourCleanup = null;
  }
  document.getElementById('profileTourOverlay')?.remove();
}

