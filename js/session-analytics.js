// ── session-analytics.js ───────────────────────────────────────────────────
// Post-session analytics: collects time-in-block, loop count, total runtime,
// and FS output stats. Stores the last 10 summaries in IndexedDB.
// Displays a post-session modal after natural stop (not emergency stop).
//
// ROADMAP Phase 5.3 — Session Analytics

import { state, fmt, esc } from './state.js';
import { fsState } from './macros.js';
import { idbGet, idbSet, idbDel } from './idb-storage.js';

const STORAGE_KEY = 'ass-analytics-v1';
const MAX_STORED  = 10;

// In-memory cache — loaded from IDB on module init, updated after each session
let _analyticsCache = null;
(async () => {
  let data = await idbGet(STORAGE_KEY);
  if (!data) {
    // Migrate from localStorage if present
    try {
      const lsRaw = localStorage.getItem(STORAGE_KEY);
      if (lsRaw) {
        data = JSON.parse(lsRaw);
        await idbSet(STORAGE_KEY, data);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }
  _analyticsCache = Array.isArray(data) ? data : [];
})();

// ── Collection ──────────────────────────────────────────────────────────────
// Called by tickPlayback each frame to accumulate block-time counters.
// runtime.analytics is initialised by startPlayback.

export function initAnalytics(runtime) {
  runtime.analytics = {
    blockTime:   {},   // blockId → accumulated seconds
    sceneTime:   {},   // sceneId → accumulated seconds
    fsPosSamples:[],   // array of 0–100 position samples (downsampled)
    fsSampleTick: 0,   // counter for downsampling
    engagementSamples: [], // array of 0–1 engagement samples (downsampled)
    attentionLossEvents: 0,
    attentionLossTotalSec: 0,
    _attentionLostAt: null,
    completionState: 'completed', // updated to 'interrupted' or 'emergency' before finalise
  };
}

// Call every tick. frameSec = seconds since last frame (approx 1/60).
export function tickAnalytics(runtime, frameSec) {
  const a = runtime.analytics;
  if (!a) return;

  // Accumulate time for the active block
  const bid = runtime.activeBlock?.id;
  if (bid) {
    a.blockTime[bid] = (a.blockTime[bid] ?? 0) + frameSec;
  }

  // Accumulate time for the active scene
  const sid = runtime.activeScene?.scene?.id;
  if (sid) {
    a.sceneTime[sid] = (a.sceneTime[sid] ?? 0) + frameSec;
  }

  // Downsample FS position and engagement: record one sample every ~30 frames (~0.5s)
  a.fsSampleTick++;
  if (a.fsSampleTick % 30 === 0) {
    a.fsPosSamples.push(Math.round(fsState.lastSentPos));
    // Sample engagement from the state engine
    const eng = state.engineState?.engagement;
    if (Number.isFinite(eng)) a.engagementSamples.push(eng);
  }
}

// Attention-loss hooks (called by tracking.js automation)
export function notifyAttentionLost(runtime) {
  const a = runtime?.analytics;
  if (!a) return;
  a._attentionLostAt = performance.now();
  a.attentionLossEvents++;
}

export function notifyAttentionReturned(runtime) {
  const a = runtime?.analytics;
  if (!a || a._attentionLostAt === null) return;
  a.attentionLossTotalSec += (performance.now() - a._attentionLostAt) / 1000;
  a._attentionLostAt = null;
}

// ── Finalise & store ─────────────────────────────────────────────────────────
export async function finaliseAnalytics(runtime) {
  if (!runtime?.analytics) return null;
  const { session } = state;
  const a = runtime.analytics;

  const totalSec = (performance.now() - runtime.startedAt - runtime.totalPausedMs) / 1000;
  // loopIndex is the current (0-based) loop, not the count of *completed* loops.
  // Use floor(totalSec / duration) so an in-progress loop is not counted as done.
  const loopsCompleted = Math.floor(totalSec / Math.max(1, session.duration));

  // If attention was still lost when the session ended, fold in the open interval now.
  if (a._attentionLostAt !== null) {
    a.attentionLossTotalSec += (performance.now() - a._attentionLostAt) / 1000;
    a._attentionLostAt = null;
  }

  // Block breakdown (only blocks with any time)
  const blockBreakdown = session.blocks
    .filter(b => a.blockTime[b.id] > 0)
    .map(b => ({ id: b.id, label: b.label, type: b.type, seconds: Math.round(a.blockTime[b.id] ?? 0) }))
    .sort((x, y) => y.seconds - x.seconds);

  // Scene breakdown (only scenes with any time)
  const sceneBreakdown = (session.scenes ?? [])
    .filter(s => a.sceneTime[s.id] > 0)
    .map(s => ({ id: s.id, name: s.name, color: s.color, seconds: Math.round(a.sceneTime[s.id] ?? 0) }))
    .sort((x, y) => y.seconds - x.seconds);

  // FS stats
  const samples = a.fsPosSamples;
  const fsAvg   = samples.length ? Math.round(samples.reduce((s, v) => s + v, 0) / samples.length) : null;
  const fsMax   = samples.length ? Math.max(...samples) : null;

  const summary = {
    timestamp:    Date.now(),
    sessionName:  session.name,
    totalSec:     Math.round(totalSec),
    loopsCompleted,
    completionState: a.completionState ?? 'completed',
    blockBreakdown,
    sceneBreakdown,
    fsAvg,
    fsMax,
    attentionLossEvents:   a.attentionLossEvents,
    attentionLossTotalSec: Math.round(a.attentionLossTotalSec),
    avgEngagement: a.engagementSamples.length
      ? +( a.engagementSamples.reduce((s, v) => s + v, 0) / a.engagementSamples.length).toFixed(3)
      : null,
  };

  await _store(summary);
  return summary;
}

async function _store(summary) {
  if (!Array.isArray(_analyticsCache)) _analyticsCache = [];
  _analyticsCache.unshift(summary);
  if (_analyticsCache.length > MAX_STORED) _analyticsCache = _analyticsCache.slice(0, MAX_STORED);
  await idbSet(STORAGE_KEY, _analyticsCache).catch(() => {});
}

export function getStoredAnalytics() {
  return Array.isArray(_analyticsCache) ? _analyticsCache : [];
}

export async function clearStoredAnalytics() {
  _analyticsCache = [];
  await idbDel(STORAGE_KEY).catch(() => {});
}

// ── Test helper — do not call in production code ──────────────────────────
// Directly sets the in-memory analytics cache, bypassing IDB, so tests
// can seed data without waiting for async IDB writes to settle.
export function _setAnalyticsCacheForTest(entries) {
  _analyticsCache = Array.isArray(entries) ? entries : [];
}

// ── Post-session modal v2 — "closing ceremony" ───────────────────────────────
// Module-level references so ALL close paths (backdrop, ✕ btn, close btn,
// ESC, and the guard that fires when a new modal replaces an existing one)
// all remove the same capture-phase Escape handler.
let _psEscHandler        = null;
let _removePostSession   = null;

export async function showPostSessionModal(summary, progressResult = null) {
  if (!summary) return;

  // Tear down any existing modal properly (removes its ESC handler too)
  if (_removePostSession) { _removePostSession(); _removePostSession = null; }
  else document.getElementById('postSessionModal')?.remove();

  const cs = summary.completionState ?? 'completed';

  // Completion state language — clinical meets intimate
  const STATE = {
    completed:   { badge: 'Session complete', badgeColor: 'rgba(45,106,79,0.8)', bdBorder: 'rgba(45,106,79,0.35)',
                   headline: 'Well done.',  sub: 'You stayed present for the full session.' },
    interrupted: { badge: 'Left early',     badgeColor: 'rgba(138,112,48,0.7)', bdBorder: 'rgba(196,154,60,0.25)',
                   headline: 'Until next time.', sub: 'Every session counts, however long.' },
    emergency:   { badge: 'Safe stop',      badgeColor: 'rgba(122,26,46,0.8)', bdBorder: 'rgba(122,26,46,0.40)',
                   headline: 'Safety first.', sub: 'You made the right call.' },
  };
  const st = STATE[cs] ?? STATE.completed;

  // Milestone
  let milestoneMsg = null;
  try {
    const { getStreakMilestone, getSessionCountMilestone, getRuntimeMilestone, rebuildProfile } = await import('./user-profile.js');
    const p = rebuildProfile();
    const ms = getStreakMilestone(p.streak) ?? getSessionCountMilestone(p.sessionCount) ?? getRuntimeMilestone(p.totalRuntimeSec);
    if (ms) milestoneMsg = ms.message;
  } catch {}

  const intPct  = summary.fsAvg  !== null ? Math.min(100, Math.round(summary.fsAvg))  : null;
  const peakPct = summary.fsMax  !== null ? Math.min(100, Math.round(summary.fsMax))  : null;

  const sceneRows = (summary.sceneBreakdown ?? []).slice(0, 4).map(s =>
    `<div class="ps2-row">
       <span class="ps2-row-l"><span style="width:7px;height:7px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0"></span>${esc(s.name)}</span>
       <span class="ps2-row-r">${fmt(s.seconds)}</span>
     </div>`
  ).join('');

  const blockRows = (summary.blockBreakdown ?? []).slice(0, 5).map(b =>
    `<div class="ps2-row">
       <span class="ps2-row-l">${esc(b.label)}</span>
       <span class="ps2-row-r">${fmt(b.seconds)}</span>
     </div>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'postSessionModal';
  // Wire module-level close function and expose for guard re-use
  _removePostSession = () => {
    overlay.remove();
    if (_psEscHandler) {
      document.removeEventListener('keydown', _psEscHandler, true);
      _psEscHandler = null;
    }
    _removePostSession = null;
  };
  overlay.className = 'ps2-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Session debrief');
  overlay.addEventListener('click', e => { if (e.target === overlay) _removePostSession?.(); });
  // Escape to dismiss — document-level capture handler, stored at module scope
  // so the guard and all close paths can remove the same listener reference.
  _psEscHandler = e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    _removePostSession?.();
  };
  document.addEventListener('keydown', _psEscHandler, true);

  overlay.innerHTML = `
  <div class="ps2-card">
    <!-- Gold hairline top -->
    <div></div>

    <div class="ps2-inner">
      <!-- Dismiss -->
      <button id="_psDismissBtn"
        style="position:absolute;top:16px;right:18px;
          background:rgba(180,40,40,0.18);border:1px solid rgba(200,60,60,0.35);
          border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;
          color:rgba(220,100,100,0.85);font-size:14px;cursor:pointer;line-height:1;
          transition:all 0.15s" onmouseover="this.style.background='rgba(200,50,50,0.32)';this.style.color='#ff8080'"
        onmouseout="this.style.background='rgba(180,40,40,0.18)';this.style.color='rgba(220,100,100,0.85)'">✕</button>

      <!-- Status badge -->
      <div>
        <div class="ps2-status-badge" style="background:${st.badgeColor};border:0.5px solid ${st.bdBorder}">
          <span style="font-size:6px">◆</span> ${esc(st.badge)}
        </div>
      </div>

      <!-- Headline -->
      <div class="ps2-headline">${esc(st.headline)}</div>
      <div class="ps2-sub">${esc(summary.sessionName)} — ${esc(st.sub)}</div>

      <!-- Big stats -->
      <div class="ps2-big-stats" id="ps2_stats">
        <div class="ps2-big-stat" style="animation-delay:0.15s">
          <div class="ps2-bval">${fmt(summary.totalSec)}</div>
          <div class="ps2-blbl">Duration</div>
        </div>
        <div class="ps2-big-stat" style="animation-delay:0.27s">
          <div class="ps2-bval">${summary.loopsCompleted}</div>
          <div class="ps2-blbl">Loop${summary.loopsCompleted !== 1 ? 's' : ''}</div>
        </div>
        <div class="ps2-big-stat" style="animation-delay:0.39s">
          <div class="ps2-bval">${(summary.blockBreakdown ?? []).length}</div>
          <div class="ps2-blbl">Block${(summary.blockBreakdown ?? []).length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <!-- Intensity bar -->
      ${intPct !== null ? `
      <div class="ps2-sec">Intensity profile</div>
      <div class="ps2-int-track">
        <div class="ps2-int-fill" id="ps2_intFill"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9.5px;color:rgba(240,236,228,0.25);font-family:var(--dmono);margin-top:3px">
        <span>avg ${intPct}%</span><span>peak ${peakPct ?? '—'}%</span>
      </div>` : ''}

      <!-- Attention -->
      ${summary.attentionLossEvents > 0 ? `
      <div style="margin:14px 0 0;padding:8px 12px;background:rgba(122,26,46,0.08);
        border:0.5px solid rgba(122,26,46,0.22);border-radius:8px;
        font-size:11px;color:rgba(240,236,228,0.38);display:flex;align-items:center;gap:8px">
        <span style="color:rgba(196,154,60,0.60)">◈</span>
        <span>${summary.attentionLossEvents} drift moment${summary.attentionLossEvents > 1 ? 's' : ''} · ${fmt(summary.attentionLossTotalSec)} total</span>
      </div>` : ''}

      <!-- Milestone wax seal -->
      ${milestoneMsg ? `
      <div class="ps2-seal">
        <div class="ps2-seal-ring">◆</div>
        <div class="ps2-seal-msg">${esc(milestoneMsg)}</div>
      </div>` : ''}

      <!-- Progress strip (XP / achievements / quests) -->
      ${progressResult && (progressResult.sessionXp > 0 || progressResult.newlyEarned?.length || progressResult.completedQuests?.length) ? `
      <div style="margin:14px 0 0;padding:10px 12px;border-radius:10px;
        background:rgba(196,154,60,0.06);border:0.5px solid rgba(196,154,60,0.2)">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;
          color:rgba(196,154,60,0.55);margin-bottom:8px">Session progress</div>
        ${progressResult.sessionXp > 0 || progressResult.questXp > 0 ? `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:13px">✨</span>
          <span style="font-size:12px;color:var(--gold);font-weight:600">
            +${(progressResult.sessionXp ?? 0) + (progressResult.questXp ?? 0) + (progressResult.achievementXp ?? 0)} XP
          </span>
          ${progressResult.newLevel > (progressResult.prevLevel ?? 0) ? `
          <span style="font-size:10px;padding:2px 7px;border-radius:12px;
            background:rgba(196,154,60,0.15);color:var(--gold);margin-left:4px">
            ⬆ Level ${progressResult.newLevel}
          </span>` : ''}
        </div>` : ''}
        ${(progressResult.newlyEarned ?? []).map(id => {
          const a = progressResult._achMap?.[id];
          return a ? `<div style="font-size:11px;color:rgba(240,236,228,0.6);margin-bottom:3px">
            🏅 ${a.icon} ${esc(a.name)}</div>` : '';
        }).join('')}
        ${(progressResult.completedQuests ?? []).map(id => {
          const q = progressResult._questMap?.[id];
          return q ? `<div style="font-size:11px;color:rgba(240,236,228,0.6);margin-bottom:3px">
            ${q.icon} ${esc(q.name)} <span style="color:var(--gold)">+${q.xp} XP</span></div>` : '';
        }).join('')}
      </div>` : ''}

      <!-- Scene breakdown -->
      ${sceneRows ? `<div class="ps2-sec">Time per scene</div>${sceneRows}` : ''}

      <!-- Block breakdown -->
      ${blockRows ? `<div class="ps2-sec">Time per block</div>${blockRows}` : ''}

      <!-- Close -->
      <button class="ps2-close" id="_psCloseBtn">
        Until next time
      </button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  // Wire close button to the shared remover (also cleans up ESC handler)
  overlay.querySelector('#_psCloseBtn')?.addEventListener('click', () => _removePostSession?.());
  overlay.querySelector('#_psDismissBtn')?.addEventListener('click', () => _removePostSession?.());

  // Animate stats in
  setTimeout(() => {
    overlay.querySelectorAll('.ps2-big-stat').forEach(el => el.classList.add('visible'));
    const f = document.getElementById('ps2_intFill');
    if (f && intPct !== null) f.style.width = intPct + '%';
  }, 200);

  setTimeout(() => overlay.querySelector('.ps2-close')?.focus(), 100);
}

