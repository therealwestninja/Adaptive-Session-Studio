// ── user-profile.js ────────────────────────────────────────────────────────
// User Profiling System — ROADMAP Phase 3.12 (Local Only)
//
// Builds and maintains a persistent local profile derived from session analytics.
// Stores: session history, preferred intensity, attention stability, engagement
// trend, total runtime, and streak tracking.
//
// Storage: IndexedDB key 'ass-profile-v1' (migrated from localStorage on first load)
// All data is local-only. No network calls. Export/import optional.

import { state, fmt, esc, SETTINGS_KEYS, defaultSession, normalizeSession, persist } from './state.js';
import { startProfileTour, resetProfileTour } from './profile-tour.js';
import { getStoredAnalytics, clearStoredAnalytics } from './session-analytics.js';
import { history } from './history.js';
import { renderMetricsChart, importExternalMetrics, clearMetricsHistory, getDailyHistory } from './metrics-history.js';
import { levelProgressPct, levelFromXp } from './achievements.js';
import { notify } from './notify.js';
import { idbGet, idbSet, idbDel } from './idb-storage.js';

const PROFILE_KEY = 'ass-profile-v1';

// ── Profile shape ─────────────────────────────────────────────────────────────
export function defaultProfile() {
  return {
    version:          1,
    // Identity (Phase 4 — user can set these in the profile panel)
    displayName:      '',           // user's chosen name (optional)
    avatarEmoji:      '🧘',         // single emoji avatar
    goals:            '',           // free-text session goals / preferences
    primaryUse:       'self',       // 'self' | 'self-for-partner' | 'partner-trains-me' | 'i-train-partner' | 'other'
    role:             'primary',    // 'primary' | 'operator'
    retainDays:       180,          // metrics history retention window (days)
    focusAvgWindow:   14,           // rolling average window for focus: 5|14|30|90 sessions
    unitSystem:       'metric',     // 'metric' | 'imperial'
    // Demographics (optional, user-supplied, local-only)
    dobDay:           '',           // '1'–'31' (day of birth for zodiac)
    dobMonth:         '',           // '1'–'12' (month of birth for zodiac)
    ageRange:         '',           // '18-24'|'25-30'|'31-40'|'41-50'|'50+'
    gender:           '',           // 'male'|'female'|'nonbinary'|'prefer_not'
    // Body metrics (optional, local-only, used for health insights — not medical advice)
    heightCm:         null,         // numeric cm (converted from ft/in if needed)
    weightKg:         null,         // numeric kg
    bodyFatPct:       null,         // 0–60 %, user-entered
    fitnessLevel:     '',           // 'sedentary'|'light'|'moderate'|'active'|'athlete'
    sessionCount:     0,
    totalRuntimeSec:  0,
    lastSessionAt:    null,
    streak:           0,         // consecutive days with at least one session
    lastStreakDate:   null,       // date string YYYY-MM-DD
    // Derived from analytics history (rolling average over last 10 sessions)
    avgAttentionStability: null, // 0–1: 1 = never lost attention
    avgEngagementPct:      null, // 0–100: average engagement score
    preferredIntensityAvg: null, // average FS output percentage
    preferredIntensityMax: null, // average peak FS output
    // Responsiveness: how quickly user re-engages after attention loss
    avgReengagementSec: null,
    // Trend flags
    intensityTrend: 'stable',    // 'rising' | 'falling' | 'stable'
    attentionTrend: 'stable',
    // ── Phase 6: Achievements, XP, Quests ─────────────────────────────────
    xp:                    0,     // total lifetime XP
    achievements:          [],    // array of earned achievement ids
    modesUsed:             [],    // array of session mode ids ever used
    highAttentionSessions: 0,     // sessions with ≥80% attention (legacy compat)
    // App engagement tracking
    appOpens:              0,     // total number of times the app has been opened
    hapticSessions:        0,     // sessions completed with an active haptic track
    vizSessions:           0,     // sessions completed with a visualization block
    rulesSessions:         0,     // sessions completed with at least one active rule
    multiSessionDays:      0,     // days where 2+ sessions were completed
    maxSessionsInDay:      0,     // personal best sessions in a single day
    // Daily quests (reset each day)
    quests:    [],    // [{ id, done }] for today
    questDate: null,          // YYYY-MM-DD of quest generation
    packsLoaded: [],          // content pack ids ever loaded (Pack Explorer)
    // Perfect quest streak tracking
    perfectQuestStreak:    0,     // consecutive days with all 3 quests completed
    lastPerfectQuestDate:  null,  // YYYY-MM-DD of last perfect quest day
    perfectQuestDaysList:  [],    // list of YYYY-MM-DD strings for perfect quest days
    // ── Per-session counters for achievements ─────────────────────────────
    totalQuestsCompleted: 0,  // lifetime quest completions
    questTypesCompleted:  [], // quest ids ever completed (for quest_types_all)
    perfectQuestDays:     0,  // days all 3 quests were completed
    perfectSessions:      0,  // sessions with zero attention losses
    focusStreakCount:      0,  // consecutive high-focus sessions (resets on break)
    lowDriftSessions:     0,  // sessions with <2 drifts or 80%+ focus
    // ── Calendar / return tracking ────────────────────────────────────────
    todayDate:     null,      // YYYY-MM-DD of last session (for double-session tracking)
    sessionsToday: 0,         // sessions completed on todayDate
    monthCounts:   {},        // { 'YYYY-MM': count } for monthly tracking
    // ── Personal records ──────────────────────────────────────────────────
    longestStreak:     0,     // all-time best consecutive day streak
    longestSessionSec: 0,     // personal best single session length in seconds
    bestFocusPct:      null,  // personal best focus percentage (0–100)
    firstSessionAt:    null,  // ISO date string of very first session
    // ── Profile identity & cosmetics ─────────────────────────────────────
    activeTitle:       null,  // which earned title to display (null = auto-pick best)
    activeFlair:    'default',// which ring flair to use
    pinnedAchievements: [],   // up to 3 achievement IDs pinned to the card header
    titlesEarned:       [],   // array of earned title IDs

    // ── Tier system & new feature counters (added v79) ────────────────────
    // Session history for tier detection — rolling 90-day [{durationSec,date}]
    sessionHistory:    [],
    totalSessions:     0,     // total sessions ever completed (all lengths)
    // Feature-use counters for new block types
    breathingSessions:           0,
    entrainmentSessions:         0,
    audioDrivenSessions:         0,
    silentSessions:              0,  // sessions with no TTS blocks
    // Brainwave band usage flags (for Frequency Pilgrim achievement)
    deltaUsed:         false,
    thetaUsed:         false,
    alphaUsed:         false,
    betaUsed:          false,
    gammaUsed:         false,
    // Brainwave session counters
    deltaSessions:               0,
    thetaSessions:               0,
    // Combined technique counters
    breathEntrainmentSyncSessions: 0,
    earlySessionCount:           0,  // sessions completed before 12:00 local
    // One-time event flags (for specific achievements)
    hasZipExported:    false,
    hasDragReordered:  false,
    // Content pack category completion tracking
    packCategoriesCompleted: [],
  };
}

// ── Load / save ───────────────────────────────────────────────────────────────
// In-memory cache so synchronous callers get consistent data
let _profileCache = null;

// Eagerly hydrate cache from IDB (with localStorage migration on first run)
(async () => {
  let p = await idbGet(PROFILE_KEY);
  if (!p) {
    // Migrate from localStorage if present
    try {
      const lsRaw = localStorage.getItem(PROFILE_KEY);
      if (lsRaw) {
        p = { ...defaultProfile(), ...JSON.parse(lsRaw) };
        await idbSet(PROFILE_KEY, p);
        localStorage.removeItem(PROFILE_KEY);
      }
    } catch {}
  }
  _profileCache = p ? { ...defaultProfile(), ...p } : defaultProfile();
})();

export function loadProfile() {
  return _profileCache ?? defaultProfile();
}

export function saveProfile(profile) {
  _profileCache = profile;
  idbSet(PROFILE_KEY, profile).catch(() => {}); // fire-and-forget
}

export function clearProfile() {
  _profileCache = defaultProfile();
  idbDel(PROFILE_KEY).catch(() => {});
}

// ── Rebuild profile from analytics history ────────────────────────────────────
export function rebuildProfile(history = getStoredAnalytics()) {
  if (!history.length) return defaultProfile();

  // Start from defaults but preserve any user-set identity fields
  const existing = loadProfile();
  const profile = defaultProfile();
  // Carry over identity fields the user has personalised
  profile.displayName  = existing?.displayName  || '';
  profile.avatarEmoji  = existing?.avatarEmoji  || '🧘';
  profile.goals        = existing?.goals        || '';
  profile.primaryUse   = existing?.primaryUse   || 'self';
  profile.role         = existing?.role         || 'primary';
  profile.retainDays   = Number.isFinite(existing?.retainDays) ? Math.max(7, Math.min(365, existing.retainDays)) : 180;

  // ── Carry over all progression/achievement fields (never recompute from analytics) ──
  // These are authoritative in the saved profile — analytics cannot reconstruct them.
  const CARRY_OVER = [
    'xp', 'achievements', 'modesUsed', 'packsLoaded',
    'totalQuestsCompleted', 'questTypesCompleted', 'perfectQuestDays',
    'perfectSessions', 'focusStreakCount', 'lowDriftSessions',
    'highAttentionSessions', 'earlySessionCount',
    'appOpens', 'hapticSessions', 'vizSessions', 'rulesSessions',
    'multiSessionDays', 'maxSessionsInDay',
    'todayDate', 'sessionsToday', 'monthCounts',
    'quests', 'questDate',
    'perfectQuestStreak', 'lastPerfectQuestDate', 'perfectQuestDaysList',
    'longestStreak', 'longestSessionSec', 'bestFocusPct', 'firstSessionAt',
    'activeTitle', 'activeFlair', 'pinnedAchievements', 'titlesEarned',
    // Tier system & new feature counters (v79)
    'sessionHistory', 'totalSessions',
    'breathingSessions', 'entrainmentSessions', 'audioDrivenSessions', 'silentSessions',
    'deltaUsed', 'thetaUsed', 'alphaUsed', 'betaUsed', 'gammaUsed',
    'deltaSessions', 'thetaSessions', 'breathEntrainmentSyncSessions',
    'hasZipExported', 'hasDragReordered', 'packCategoriesCompleted',
    // User identity & demographics — always preserved (user-entered, not derived)
    'displayName', 'avatarEmoji', 'goals', 'primaryUse', 'role',
    'dobDay', 'dobMonth', 'ageRange', 'gender',
    // Body metrics — user-entered, never recalculated from history
    'heightCm', 'weightKg', 'bodyFatPct', 'fitnessLevel',
    // Preferences — user-chosen settings
    'retainDays', 'focusAvgWindow', 'unitSystem',
  ];
  for (const key of CARRY_OVER) {
    if (existing?.[key] !== undefined) profile[key] = existing[key];
  }

  profile.sessionCount    = history.length;
  profile.totalRuntimeSec = history.reduce((s, h) => s + (h.totalSec ?? 0), 0);
  profile.lastSessionAt   = history[0]?.timestamp ?? null;

  // Rolling average window — user-configurable (5/14/30/90), default 14
  const focusWindow = [5, 14, 30, 90].includes(existing?.focusAvgWindow) ? existing.focusAvgWindow : 14;
  profile.focusAvgWindow = focusWindow;
  const recent = history.filter(h => h.totalSec >= 30).slice(0, focusWindow);

  // Attention stability: fraction of session time NOT spent in attention loss
  // Computed as (sessionSec - lossTimeSec) / sessionSec — never >1 or <0
  const stabilityScores = recent
    .filter(h => h.totalSec > 0)
    .map(h => {
      const lossSec = Number.isFinite(h.attentionLossTotalSec) ? h.attentionLossTotalSec : 0;
      return Math.max(0, Math.min(1, (h.totalSec - lossSec) / h.totalSec));
    });
  if (stabilityScores.length) {
    profile.avgAttentionStability = +(stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length).toFixed(2);
  }

  // Engagement average — sourced from avgEngagement on each history entry (0–1 scale → 0–100%)
  const engagementSamples = recent
    .filter(h => h.avgEngagement !== null && h.avgEngagement !== undefined && Number.isFinite(h.avgEngagement));
  if (engagementSamples.length) {
    profile.avgEngagementPct = Math.round(
      engagementSamples.reduce((a, h) => a + h.avgEngagement, 0) / engagementSamples.length * 100
    );
  }

  // FS intensity preference
  const fsAvgSamples = recent.filter(h => h.fsAvg !== null).map(h => h.fsAvg);
  const fsMaxSamples = recent.filter(h => h.fsMax !== null).map(h => h.fsMax);
  if (fsAvgSamples.length) {
    profile.preferredIntensityAvg = Math.round(fsAvgSamples.reduce((a, b) => a + b, 0) / fsAvgSamples.length);
  }
  if (fsMaxSamples.length) {
    profile.preferredIntensityMax = Math.round(fsMaxSamples.reduce((a, b) => a + b, 0) / fsMaxSamples.length);
  }

  // Re-engagement speed: total loss time / loss events
  const reengageSamples = recent
    .filter(h => (h.attentionLossEvents ?? 0) > 0)
    .map(h => (h.attentionLossTotalSec ?? 0) / h.attentionLossEvents);
  if (reengageSamples.length) {
    profile.avgReengagementSec = +(reengageSamples.reduce((a, b) => a + b, 0) / reengageSamples.length).toFixed(1);
  }

  // Streak: count consecutive calendar days with sessions
  profile.streak       = _computeStreak(history);
  profile.lastStreakDate = _todayStr();
  // Personal record: all-time best streak
  profile.longestStreak = Math.max(profile.longestStreak ?? 0, profile.streak);

  // Derive monthCounts from full history (YYYY-MM → session count)
  // Merge with any carried-over value so the two sources stay in sync.
  const derivedMonths = {};
  for (const h of history) {
    const key = _timestampToLocalDateStr(h.timestamp).slice(0, 7); // YYYY-MM
    derivedMonths[key] = (derivedMonths[key] ?? 0) + 1;
  }
  // Merge: take the max of derived vs carried-over to avoid overcounting
  const carriedMonths = profile.monthCounts ?? {};
  const mergedMonths  = { ...derivedMonths };
  for (const [k, v] of Object.entries(carriedMonths)) {
    if ((mergedMonths[k] ?? 0) < v) mergedMonths[k] = v;
  }
  profile.monthCounts = mergedMonths;

  // Trends: compare first vs second half of recent sessions
  if (recent.length >= 4) {
    const half = Math.floor(recent.length / 2);
    const older = recent.slice(half);
    const newer = recent.slice(0, half);

    const avgFs = arr => arr.filter(h => h.fsAvg !== null).reduce((s, h) => s + h.fsAvg, 0) / (arr.filter(h => h.fsAvg !== null).length || 1);
    const avgStab = arr => {
      const valid = arr.filter(h => h.totalSec > 0);
      if (!valid.length) return 0;
      return valid.reduce((s, h) => s + Math.max(0, 1 - (h.attentionLossEvents ?? 0) / (h.totalSec / 60)), 0) / valid.length;
    };

    const fsDelta   = avgFs(newer)   - avgFs(older);
    const stabDelta = avgStab(newer) - avgStab(older);

    profile.intensityTrend = fsDelta >  5 ? 'rising' : fsDelta < -5 ? 'falling' : 'stable';
    profile.attentionTrend = stabDelta > 0.05 ? 'rising' : stabDelta < -0.05 ? 'falling' : 'stable';
  }

  saveProfile(profile);
  return profile;
}

function _todayStr() {
  const d = new Date();
  // Use local year/month/day, zero-padded, to avoid UTC-day vs local-day mismatch
  // around midnight (e.g. 11 PM local = next UTC day).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  // ── Achievement grid sorted by tool then difficulty (XP) ───────────────────
  const TOOL_GROUPS_DEF = [
    { tool:'Getting Started', icon:'🌱', ids:['first_session','first_comeback','first_perfect','first_feature','body_metrics_set','drag_reorder','markdown_export','first_zip_export','safe_stop','ai_authored','open_10','open_50','open_100'] },
    { tool:'Sessions & Streaks', icon:'📅', ids:['sessions_3','sessions_5','sessions_10','sessions_20','sessions_30','sessions_50','sessions_75','sessions_100','century','streak_2','streak_3','streak_7','two_in_one_day','triple_session','week_3_sessions','week_5_sessions','multi_day_5','monthly_visitor','three_months','six_months','comeback_kid','comeback_kid'] },
    { tool:'Runtime & Endurance', icon:'⏱', ids:['runtime_30m','runtime_1h','runtime_2h','runtime_5h','runtime_10h','runtime_20h','runtime_50h','long_session_10m','long_session_20m','long_session_30m','long_session_45m','long_session_60m','30min_single','60min_single','total_5h','total_20h','mindful_5h','mindful_20h','loop_5','month_dedication'] },
    { tool:'Focus & Attention', icon:'🎯', ids:['attention_first','attention_80','attention_90','perfect_attention','perfect_3x','perfect_5x','perfect_focus_3','focus_streak_3','no_drift_week','focus_master','early_riser_5'] },
    { tool:'XP & Levels', icon:'⬆️', ids:['first_level_up','first_quest','level_3','level_5','level_7','level_10','level_15','level_20','quests_5','quests_10','quests_25','quests_50','quests_100','quests_150','quests_200','perfect_quest_day','perfect_quest_3days','perfect_quest_7days','perfect_quest_30days','perfect_quest_streak_3','perfect_quest_streak_7','quest_types_all'] },
    { tool:'Session Design', icon:'🎬', ids:['use_tts','use_viz','use_audio','use_scenes','use_rules','use_ramp','use_pacing','modes_2','modes_4','all_modes','scene_arc','builder','block_variety','all_features','custom_rules_5','full_sensory_5x','all_viz_types','peak_intensity','full_surrender','full_stack_pro'] },
    { tool:'Haptic & FunScript', icon:'🕹', ids:['use_funscript','haptic_5x','haptic_20x','multiaxis_first','first_audiodriven','audiodriven_5','audio_architect','omnisensory'] },
    { tool:'Visualization', icon:'🌀', ids:['use_viz','viz_5x','viz_20x','all_viz_types'] },
    { tool:'Audio & Entrainment', icon:'〰', ids:['first_entrainment','entrainment_first','entrainment_10','first_breathing','breathwork_first','breathwork_10','breath_10','theta_master','delta_explorer','gamma_explorer','sleep_architect','frequency_pilgrim','breath_entrainment_sync','asmr_5'] },
    { tool:'Content Packs', icon:'📦', ids:['packs_3','all_packs','content_pack_use','content_pack_5','content_pack_20','pack_master'] },
    { tool:'Modes & Roles', icon:'🎭', ids:['modes_2','modes_4','all_modes','pleasure_10','morning_5','silent_master'] },
    { tool:'Tier & Mastery', icon:'👑', ids:['pro_tier','perfect_quest_30days','perfect_focus_3','full_stack_pro','month_dedication','century'] },
  ];

  // Build tool sections: deduplicate achievements, show each once under first matching tool
  const _seenIds = new Set();
  const achievementGridByTool = TOOL_GROUPS_DEF.map(group => {
    const groupAchs = group.ids
      .map(id => ACHIEVEMENTS.find(a => a.id === id))
      .filter(a => a && !_seenIds.has(a.id))
      .filter(a => !a.hidden && !a.secret || earnedSet.has(a.id));
    groupAchs.forEach(a => _seenIds.add(a.id));

    // Add remaining uncategorized achievements to last group
    if (group === TOOL_GROUPS_DEF.at(-1)) {
      ACHIEVEMENTS.filter(a => !_seenIds.has(a.id) && (!a.hidden && !a.secret || earnedSet.has(a.id)))
        .forEach(a => { groupAchs.push(a); _seenIds.add(a.id); });
    }

    if (!groupAchs.length) return '';

    // Sort within group: earned first, then by XP ascending (easy → hard)
    groupAchs.sort((a, b) => {
      const ae = earnedSet.has(a.id), be = earnedSet.has(b.id);
      if (ae !== be) return be ? 1 : -1;  // earned items at end
      return a.xp - b.xp;  // easy first within each section
    });

    const earnedCount = groupAchs.filter(a => earnedSet.has(a.id)).length;
    const allDone     = earnedCount === groupAchs.length;

    return `<details style="margin-bottom:8px" ${earnedCount>0?'open':''}>
      <summary style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;
        border-bottom:0.5px solid rgba(255,255,255,0.06);list-style:none;margin-bottom:8px">
        <span style="font-size:14px">${group.icon}</span>
        <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;
          color:${allDone?'var(--gold)':'var(--text2)'}">${group.tool}</span>
        <span style="flex:1"></span>
        <span style="font-size:9.5px;color:${allDone?'var(--gold)':'rgba(255,255,255,0.3)'}">
          ${earnedCount}/${groupAchs.length}${allDone?' ✓':''}
        </span>
      </summary>
      <div style="display:flex;flex-wrap:wrap;gap:5px;padding-bottom:4px">
        ${groupAchs.map(a => {
          const e = earnedSet.has(a.id);
          const isHidden = a.hidden || a.secret;
          return `<div title="${esc(e ? a.name+' — '+a.desc+' (+'+a.xp+' XP)' : (isHidden?'Hidden — keep exploring':a.name+': '+a.desc))}"
            style="display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:7px;cursor:default;
              background:${e?'rgba(196,154,60,0.12)':'rgba(255,255,255,0.02)'};
              border:0.5px solid ${e?'rgba(196,154,60,0.35)':'rgba(255,255,255,0.05)'};
              opacity:${e?1:0.45};transition:opacity .15s;min-width:0;max-width:160px">
            <span style="font-size:12px;flex-shrink:0">${e?a.icon:'🔒'}</span>
            <div style="min-width:0">
              <div style="font-size:9.5px;font-weight:500;color:${e?'var(--gold)':'var(--text2)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e?a.name:(isHidden?'???':a.name))}</div>
              ${e?`<div style="font-size:8.5px;color:rgba(255,255,255,0.25)">+${a.xp} XP</div>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </details>`;
  }).join('');

  return `${y}-${m}-${day}`;
}

function _timestampToLocalDateStr(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _computeStreak(history) {
  if (!history.length) return 0;
  const days = [...new Set(history.map(h => _timestampToLocalDateStr(h.timestamp)))].sort().reverse();
  let streak  = 0;
  let expected = _todayStr();
  for (const day of days) {
    if (day === expected) {
      streak++;
      const d = new Date(expected);
      d.setDate(d.getDate() - 1);
      expected = _timestampToLocalDateStr(d.getTime());
    } else {
      break;
    }
  }
  return streak;
}

// ── Habit Training (ROADMAP Phase 3.13) ──────────────────────────────────────
// Returns a difficulty level (1–5) derived from session history, and streak.
// Used to suggest gradual escalation in session settings.

export function computeDifficultyLevel(profile) {
  if (!profile || profile.sessionCount < 2) return 1;

  let level = 1;

  // Streak bonus: consistent practice → higher baseline
  if (profile.streak >= 7)  level += 1;
  if (profile.streak >= 30) level += 1;

  // Attention stability → readiness for longer/harder sessions
  if ((profile.avgAttentionStability ?? 0) >= 0.8) level += 0.5;
  if ((profile.avgAttentionStability ?? 0) >= 0.95) level += 0.5;

  // Rising intensity trend → user is ready for more
  if (profile.intensityTrend === 'rising') level += 0.5;

  return Math.min(5, Math.round(level));
}

// ── Adaptive Difficulty Curves (ROADMAP Phase 3.11) ──────────────────────────
// Returns suggested ramp settings based on profile data. Callers can apply
// these directly or present them to the user as a recommendation.

export function getAdaptiveRampSuggestion() {
  // Use saved profile if available (faster); rebuild from analytics otherwise.
  // rebuildProfile() is authoritative — call it and save so loadProfile() stays current.
  const profile = rebuildProfile();
  saveProfile(profile);
  const level   = computeDifficultyLevel(profile);

  // Scale intensity from profile's preferred range with level bonus
  const baseAvg = (profile.preferredIntensityAvg ?? 50) / 100;
  const basePeak= (profile.preferredIntensityMax ?? 80) / 100;

  // Progressive overload: each level adds ~10% headroom
  const levelBonus = (level - 1) * 0.1;

  return {
    enabled:   true,
    mode:      profile.avgAttentionStability !== null ? 'adaptive' : 'time',
    startVal:  Math.max(0.2, Math.min(1.0, baseAvg - 0.1)),
    endVal:    Math.min(2.0, basePeak + levelBonus),
    curve:     level >= 4 ? 'exponential' : 'sine',
    steps:     [],
    blendMode: 'max',
    _note:     `Based on ${profile.sessionCount} session${profile.sessionCount !== 1 ? 's' : ''}, level ${level}/5`,
  };
}

// ── Zodiac sign from DOB ──────────────────────────────────────────────────────
function _zodiacSign(day, month) {
  const d = Number(day), m = Number(month);
  if (!d || !m || d < 1 || d > 31 || m < 1 || m > 12) return null;
  // [month, cutoffDay, signIfBefore, signIfOnOrAfter]
  const CUTS = [
    [1,  20, 'Capricorn',  'Aquarius'],
    [2,  19, 'Aquarius',   'Pisces'],
    [3,  21, 'Pisces',     'Aries'],
    [4,  20, 'Aries',      'Taurus'],
    [5,  21, 'Taurus',     'Gemini'],
    [6,  21, 'Gemini',     'Cancer'],
    [7,  23, 'Cancer',     'Leo'],
    [8,  23, 'Leo',        'Virgo'],
    [9,  23, 'Virgo',      'Libra'],
    [10, 23, 'Libra',      'Scorpio'],
    [11, 22, 'Scorpio',    'Sagittarius'],
    [12, 22, 'Sagittarius','Capricorn'],
  ];
  const row = CUTS[m - 1];
  return d < row[1] ? row[2] : row[3];
}

// ── BMI and health insight helpers ──────────────────────────────────────────
function _calcBmi(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  const h = heightCm / 100;
  return +(weightKg / (h * h)).toFixed(1);
}
function _bmiCategory(bmi) {
  if (!bmi) return null;
  if (bmi < 18.5) return { label: 'Underweight', color: '#5fa0dc' };
  if (bmi < 25)   return { label: 'Healthy weight', color: '#7dc87a' };
  if (bmi < 30)   return { label: 'Overweight', color: '#f0a04a' };
  return               { label: 'Obese range', color: '#e05050' };
}
// Estimated TDEE using Mifflin-St Jeor (very rough — for fun only)
function _estimateTdee(profile) {
  const h = profile.heightCm, w = profile.weightKg;
  const gender = profile.gender;
  if (!h || !w) return null;
  // Approximate age from ageRange midpoints
  const ageMid = { '18-24':21,'25-30':27,'31-40':35,'41-50':45,'50+':55 }[profile.ageRange] ?? 30;
  const bmr = gender === 'female'
    ? 10*w + 6.25*h - 5*ageMid - 161
    : 10*w + 6.25*h - 5*ageMid + 5;
  const actFactor = { sedentary:1.2, light:1.375, moderate:1.55, active:1.725, athlete:1.9 }[profile.fitnessLevel] ?? 1.375;
  return Math.round(bmr * actFactor);
}

// ── Imperial conversion helpers ───────────────────────────────────────────────
function _cmToFtIn(cm) {
  if (!cm) return '';
  const totalIn = Math.round(cm / 2.54);
  return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
}
function _kgToLbs(kg) { return kg ? +(kg * 2.20462).toFixed(1) : null; }
function _ftInToCm(ft, inches) { return Math.round((Number(ft) * 12 + Number(inches)) * 2.54); }
function _lbsToKg(lbs) { return lbs ? +(Number(lbs) / 2.20462).toFixed(1) : null; }

// ── Habit Streak Milestones ─────────────────────────────────────────────────
export function getStreakMilestone(streak) {
  if (streak <= 0) return null;
  const milestones = [
    { days: 3,   message: '3-day streak 🔥 Building momentum' },
    { days: 7,   message: '1-week streak 🏆 A full week!' },
    { days: 14,  message: '2-week streak ⚡ Strong habit forming' },
    { days: 30,  message: '30-day streak 🌟 Incredible consistency' },
    { days: 100, message: '100-day streak 🎯 Elite practitioner' },
  ];
  return milestones.filter(m => streak === m.days).at(-1) ?? null;
}

// Returns a milestone message for a session count, or null.
export function getSessionCountMilestone(count) {
  const milestones = [
    { count: 1,   message: 'First session complete 🎉 Welcome!' },
    { count: 5,   message: '5 sessions 🌱 Getting into the groove' },
    { count: 10,  message: '10 sessions 💪 A real habit!' },
    { count: 25,  message: '25 sessions 🔑 You\'re experienced now' },
    { count: 50,  message: '50 sessions 🏅 Dedicated practitioner' },
    { count: 100, message: '100 sessions 🌟 Century achieved!' },
  ];
  return milestones.filter(m => count === m.count).at(-1) ?? null;
}

// Returns a milestone message for total runtime in seconds, or null.
export function getRuntimeMilestone(totalSec) {
  const milestones = [
    { sec: 3600,    message: 'First hour of sessions ⏱ Getting started' },
    { sec: 36_000,  message: '10 hours of sessions 🕐 Committed!' },
    { sec: 180_000, message: '50 hours of sessions 🏆 Deep practice' },
    { sec: 360_000, message: '100 hours of sessions 🌟 Century of time' },
  ];
  return milestones.filter(m => totalSec >= m.sec && totalSec < m.sec + 3600).at(-1) ?? null;
}
// ── Update the persistent menubar avatar button ──────────────────────────────
// Called after every session end, profile save, and on boot.
// Keeps the emoji, name, and XP fill bar in sync without opening the panel.
export function updateMenubarAvatar(profile) {
  if (!profile) return;
  const p = profile;

  const emojiEl = document.getElementById('profileAvatarEmoji');
  const nameEl  = document.getElementById('profileAvatarName');
  const fillEl  = document.getElementById('profileAvatarXpFill');
  const ringEl  = document.getElementById('profileAvatarRing');

  if (emojiEl) emojiEl.textContent = p.avatarEmoji || '🧘';

  if (nameEl) {
    const displayName = p.displayName?.trim();
    nameEl.textContent = displayName || 'Profile';
  }

  if (fillEl) {
    // levelProgressPct is imported at the top of this file
    const xp  = p.xp ?? 0;
    const pct = levelProgressPct(xp);
    fillEl.style.width = `${Math.max(2, Math.round(pct * 100))}%`;
  }

  if (ringEl) {
    const streak = p.streak ?? 0;
    ringEl.classList.remove('mb-profile-ring--warm', 'mb-profile-ring--hot');
    if (streak >= 7) ringEl.classList.add('mb-profile-ring--hot');
    else if (streak >= 3) ringEl.classList.add('mb-profile-ring--warm');
  }
}

// Per-container render lock — prevents concurrent double-renders on the same element
const _profileRenderLocks = new Set();

// ── Peer sync: no-op since profile only renders in profileDialogBody now ──────
function _otherContainer(_containerId) { return null; }
function _syncPeerPanel(_containerId) {
  // Only one render target now — nothing to sync
}

export async function renderProfilePanel(containerId = 'profilePanel') {
  const el = document.getElementById(containerId);
  if (!el) return;
  // Skip if already rendering this container — the in-flight call will finish
  if (_profileRenderLocks.has(containerId)) return;
  _profileRenderLocks.add(containerId);
  try {
    await _doRenderProfile(el, containerId);
  } finally {
    _profileRenderLocks.delete(containerId);
  }
}

async function _doRenderProfile(el, containerId) {

  const history = getStoredAnalytics();
  const p = rebuildProfile(history);  // pass history to avoid a second cache read
  saveProfile(p);
  const streakMilestone   = getStreakMilestone(p.streak);
  const countMilestone    = getSessionCountMilestone(p.sessionCount);

  // ── Load achievements/XP data ──────────────────────────────────────────
  const {
    ACHIEVEMENTS, ACHIEVEMENT_MAP, LEVEL_NAMES, MAX_LEVEL,
    xpToNextLevel, getDailyQuests, getTodayQuestDefs, QUEST_POOL,
    getUserTier, USER_TIERS,
  } = await import('./achievements.js');
  const currentXp    = p.xp ?? 0;
  const currentLevel = levelFromXp(currentXp);
  const levelName    = LEVEL_NAMES[currentLevel] ?? `Level ${currentLevel}`;
  const progressPct  = levelProgressPct(currentXp);
  const xpNeeded     = xpToNextLevel(currentXp);
  const earnedSet    = new Set(p.achievements ?? []);
  const userTier     = getUserTier(p);
  const todayQuests  = getDailyQuests(_todayStr(), p);
  const questDate    = p.questDate ?? '';
  const today        = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const questStates  = (questDate === today) ? (p.quests ?? []) : todayQuests.map(q => ({ id: q.id, done: false }));
  const runtimeMilestone  = getRuntimeMilestone(p.totalRuntimeSec);
  const milestone = streakMilestone ?? countMilestone ?? runtimeMilestone;

  const chartDays = Math.min(p.retainDays ?? 180, 60); // show up to 60 bars
  const metricsChartHtml = await renderMetricsChart(chartDays, p.retainDays ?? 180);

  const trendIcon  = t => t === 'rising' ? '↑' : t === 'falling' ? '↓' : '→';
  const trendColor = t => t === 'rising' ? '#7dc87a' : t === 'falling' ? '#e05050' : 'var(--text3)';

  const recPill = (label, value, unit = '') => value === null ? '' : `
    <div style="background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);
      border-radius:8px;padding:8px;text-align:center;min-width:72px">
      <div style="font-size:14px;font-weight:700;color:#f0f0e8">${value}${unit}</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.06em">${label}</div>
    </div>`;

  // ── Primary use tagline ──────────────────────────────────────────────────
  const USE_TAGLINE = {
    'self':              'Here for myself',
    'self-for-partner':  'Training for someone special',
    'partner-trains-me': 'Being guided by my partner',
    'i-train-partner':   'Guiding my partner',
    'other':             'Private mode',
  };
  const ROLE_BADGE = {
    'primary':  { label: 'Primary User', icon: '🫀' },
    'operator': { label: 'Operator',     icon: '🎛' },
  };
  const tagline   = USE_TAGLINE[p.primaryUse] ?? 'Here for myself';
  const roleBadge = ROLE_BADGE[p.role] ?? ROLE_BADGE.primary;

  // ── Streak ring gradient ──────────────────────────────────────────────────
  // Streak 0 = cold grey, 3 = warm amber, 7+ = hot rose-pink
  const streakGlow = p.streak >= 7 ? '#e8708a' : p.streak >= 3 ? '#e8963a' : 'rgba(255,255,255,0.12)';
  const streakGlowShadow = p.streak >= 7 ? '0 0 18px rgba(232,112,138,0.5)' : p.streak >= 3 ? '0 0 14px rgba(232,150,58,0.35)' : 'none';

  // ── Compatibility score (attention stability as %) ─────────────────────────
  const compatPct = p.avgAttentionStability !== null
    ? Math.round(p.avgAttentionStability * 100)
    : null;

  // ── Relationship status for completion states ──────────────────────────────
  const STATUS_EMOJI = { completed: '💚', interrupted: '🟡', emergency: '🔴' };
  const STATUS_LABEL = { completed: 'Completed', interrupted: 'Left early', emergency: 'Safe stop' };

  // ── FLAIR SYSTEM ─────────────────────────────────────────────────────────
  const FLAIRS = {
    default:  { name:'Default',     ring:'rgba(255,255,255,0.15)',       shadow:'none',                              anim:false },
    ember:    { name:'Ember Glow',   ring:'rgba(232,150,58,0.7)',        shadow:'0 0 12px rgba(232,150,58,0.4)',     anim:false,  req:'streak_2'          },
    flame:    { name:'Flame',        ring:'rgba(232,112,138,0.85)',      shadow:'0 0 14px rgba(232,112,138,0.5)',    anim:false,  req:'streak_7'          },
    emerald:  { name:'Emerald',      ring:'rgba(109,191,106,0.8)',       shadow:'0 0 14px rgba(109,191,106,0.4)',    anim:false,  req:'perfect_attention' },
    sapphire: { name:'Sapphire',     ring:'rgba(100,181,200,0.85)',      shadow:'0 0 14px rgba(100,181,200,0.45)',   anim:false,  req:'runtime_10h'       },
    gold:     { name:'Solid Gold',   ring:'rgba(196,154,60,0.95)',       shadow:'0 0 16px rgba(196,154,60,0.55)',    anim:false,  req:'sessions_50'       },
    nebula:   { name:'Nebula',       ring:'conic-gradient(from 0deg, #e8963a, #e8708a, #9b6bcc, #6dbfc8, #7dc87a, #e8963a)', shadow:'0 0 20px rgba(196,154,60,0.5)', anim:true, req:'level_20' },
  };
  const earnedFlairIds = Object.keys(FLAIRS).filter(id =>
    id === 'default' || (FLAIRS[id].req && earnedSet.has(FLAIRS[id].req))
  );
  const activeFlair = FLAIRS[p.activeFlair] && earnedFlairIds.includes(p.activeFlair)
    ? FLAIRS[p.activeFlair] : FLAIRS.default;

  // ── PERSONA COMPUTATION ────────────────────────────────────────────────────
  const persona = (() => {
    const s = p.sessionCount ?? 0;
    const streak = p.streak ?? 0;
    const haptic = p.hapticSessions ?? 0;
    const viz = p.vizSessions ?? 0;
    const rules = p.rulesSessions ?? 0;
    const focus = p.avgAttentionStability ?? 0;
    const totalQ = p.totalQuestsCompleted ?? 0;
    if (!s) return { label: 'Just Starting', icon: '🌱', desc: 'Begin your first session.' };
    if (streak >= 30)   return { label: 'The Devoted', icon: '🔥', desc: 'A remarkable streak of consistency.' };
    if (focus >= 0.92 && s >= 10) return { label: 'The Mindful', icon: '🎯', desc: 'Exceptional focus across sessions.' };
    if (haptic >= 20 && haptic > viz * 1.5) return { label: 'Haptic Devotee', icon: '🕹', desc: 'The haptic track is always on.' };
    if (viz >= 10 && viz > haptic * 1.5) return { label: 'Visual Explorer', icon: '🌀', desc: 'Visualization is your anchor.' };
    if (rules >= 10) return { label: 'Systems Thinker', icon: '⚙', desc: 'Rules and automation define your sessions.' };
    if (totalQ >= 50) return { label: 'The Quester', icon: '📜', desc: 'Daily challenges are the goal.' };
    if (p.preferredIntensityAvg >= 80) return { label: 'Intensity Seeker', icon: '⚡', desc: 'You push to the edge.' };
    if (streak >= 7) return { label: 'The Consistent', icon: '📅', desc: 'Seven days and counting.' };
    if (s >= 30) return { label: 'Seasoned Practitioner', icon: '💪', desc: 'Thirty sessions deep.' };
    if (s >= 10) return { label: 'Finding the Rhythm', icon: '🎵', desc: 'The pattern is taking shape.' };
    return { label: 'The Curious', icon: '🔍', desc: 'Still exploring the possibilities.' };
  })();

  // ── TITLE LOOKUP ───────────────────────────────────────────────────────────
  const { TITLES, checkAndAwardTitles } = await import('./achievements.js');
  // Re-evaluate titles on every render — ensures cold-loaded profiles get titles awarded
  checkAndAwardTitles(p);
  saveProfile(p);
  const titlesEarned  = (p.titlesEarned ?? []);
  const activeTitle   = TITLES.find(t => t.id === p.activeTitle)
    ?? TITLES.filter(t => titlesEarned.includes(t.id)).at(-1)
    ?? null;

  // ── NEXT UNLOCKS (closest 3 unearned achievements with measurable progress) ─
  const nextUnlocks = (() => {
    const progressMap = {
      sessions_3: { current: p.sessionCount, goal: 3, label:'sessions' },
      sessions_5: { current: p.sessionCount, goal: 5, label:'sessions' },
      sessions_10: { current: p.sessionCount, goal: 10, label:'sessions' },
      sessions_20: { current: p.sessionCount, goal: 20, label:'sessions' },
      sessions_30: { current: p.sessionCount, goal: 30, label:'sessions' },
      sessions_50: { current: p.sessionCount, goal: 50, label:'sessions' },
      sessions_75: { current: p.sessionCount, goal: 75, label:'sessions' },
      sessions_100: { current: p.sessionCount, goal: 100, label:'sessions' },
      runtime_30m: { current: Math.round((p.totalRuntimeSec??0)/60), goal: 30, label:'min' },
      runtime_1h:  { current: Math.round((p.totalRuntimeSec??0)/3600), goal: 1, label:'hr' },
      runtime_2h:  { current: Math.round((p.totalRuntimeSec??0)/3600*10)/10, goal: 2, label:'hr' },
      runtime_5h:  { current: Math.round((p.totalRuntimeSec??0)/3600*10)/10, goal: 5, label:'hr' },
      runtime_10h: { current: Math.round((p.totalRuntimeSec??0)/3600*10)/10, goal: 10, label:'hr' },
      runtime_20h: { current: Math.round((p.totalRuntimeSec??0)/3600*10)/10, goal: 20, label:'hr' },
      streak_2: { current: p.streak??0, goal: 2, label:'day streak' },
      streak_3: { current: p.streak??0, goal: 3, label:'day streak' },
      streak_7: { current: p.streak??0, goal: 7, label:'day streak' },
      quests_5:  { current: p.totalQuestsCompleted??0, goal: 5,  label:'quests' },
      quests_10: { current: p.totalQuestsCompleted??0, goal: 10, label:'quests' },
      quests_25: { current: p.totalQuestsCompleted??0, goal: 25, label:'quests' },
      quests_50: { current: p.totalQuestsCompleted??0, goal: 50, label:'quests' },
      quests_100:{ current: p.totalQuestsCompleted??0, goal:100, label:'quests' },
      haptic_5x: { current: p.hapticSessions??0, goal: 5, label:'haptic sessions' },
      haptic_20x:{ current: p.hapticSessions??0, goal: 20, label:'haptic sessions' },
      viz_5x:    { current: p.vizSessions??0, goal: 5, label:'viz sessions' },
      rules_10x: { current: p.rulesSessions??0, goal: 10, label:'rule sessions' },
      perfect_quest_3days:  { current: (p.perfectQuestDaysList??[]).length, goal:3, label:'perfect days' },
      perfect_quest_7days:  { current: (p.perfectQuestDaysList??[]).length, goal:7, label:'perfect days' },
      open_10:   { current: p.appOpens??0, goal: 10, label:'app opens' },
      open_50:   { current: p.appOpens??0, goal: 50, label:'app opens' },
      perfect_3x: { current: p.perfectSessions??0, goal:3, label:'perfect sessions' },
      perfect_5x: { current: p.perfectSessions??0, goal:5, label:'perfect sessions' },
    };
    return Object.entries(progressMap)
      .filter(([id]) => !earnedSet.has(id))
      .map(([id, prog]) => ({
        id, ...prog,
        pct: Math.min(99, Math.round((prog.current / prog.goal) * 100)),
        remaining: Math.max(0, prog.goal - prog.current),
        name: ACHIEVEMENT_MAP[id]?.name ?? id,
        icon: ACHIEVEMENTS.find(a => a.id === id)?.icon ?? '🏅',
      }))
      .filter(u => u.pct > 0 && u.pct < 100)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  })();

  // ── ACTIVITY HEATMAP ───────────────────────────────────────────────────────
  const dailyHistory = await getDailyHistory(p.retainDays ?? 180); // getDailyHistory statically imported

  const heatmapSvg = (() => {
    const today = new Date();
    const toLocalDateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayMap = {};
    for (const d of dailyHistory) dayMap[d.date] = d.sessionCount;

    const WEEKS = 26;
    const cellSize = 9;
    const gap = 2;
    const step = cellSize + gap;
    const labelW = 18;
    const svgW = labelW + WEEKS * step;
    const svgH = 7 * step + 14;

    // Start from 26 weeks ago, aligned to Sunday
    const origin = new Date(today);
    origin.setDate(origin.getDate() - today.getDay() - (WEEKS - 1) * 7);

    let cells = '', monthLabels = '', lastMonth = -1;

    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = new Date(origin);
        dt.setDate(origin.getDate() + w * 7 + d);
        if (dt > today) continue;
        const dateStr = toLocalDateStr(dt);
        const count = dayMap[dateStr] ?? 0;
        const x = labelW + w * step;
        const y = d * step + 12;

        const fill = count === 0 ? 'rgba(255,255,255,0.05)'
          : count === 1 ? 'rgba(196,154,60,0.35)'
          : count === 2 ? 'rgba(196,154,60,0.60)'
          : 'rgba(196,154,60,0.90)';

        cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fill}"><title>${dateStr}${count ? ': '+count+' session'+(count>1?'s':'') : ': no sessions'}</title></rect>`;

        if (d === 0 && dt.getDate() <= 7 && dt.getMonth() !== lastMonth) {
          const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          monthLabels += `<text x="${x}" y="8" font-size="7" fill="rgba(255,255,255,0.28)" font-family="monospace">${M[dt.getMonth()]}</text>`;
          lastMonth = dt.getMonth();
        }
      }
    }

    const dayLabels = ['','M','','W','','F',''].map((l, i) =>
      l ? `<text x="${labelW-3}" y="${i*step+12+7}" font-size="7" fill="rgba(255,255,255,0.22)" text-anchor="end" font-family="monospace">${l}</text>` : ''
    ).join('');

    return `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block">${monthLabels}${dayLabels}${cells}</svg>`;
  })();

  // ── ACHIEVEMENT CATEGORIES ─────────────────────────────────────────────────
  const CAT_LABELS = {
    starter:'First Steps', consistency:'Consistency', depth:'Sessions',
    endurance:'Endurance', focus:'Focus', craft:'Craft & Exploration',
    quests:'Quests', levels:'Levels'
  };
  const byCategory = {};
  for (const a of ACHIEVEMENTS) {
    // Show: earned (always), non-hidden (always), hidden only if earned
    // 'secret' is legacy field; 'hidden' is the new field
    const isHidden = a.hidden || a.secret;
    if (!isHidden || earnedSet.has(a.id)) {
      (byCategory[a.category] = byCategory[a.category]??[]).push(a);
    }
  }

  // Count hidden achievements per category for the "? hidden" counter
  const hiddenCounts = {};
  for (const a of ACHIEVEMENTS) {
    const isHidden = a.hidden || a.secret;
    if (isHidden && !earnedSet.has(a.id)) {
      hiddenCounts[a.category] = (hiddenCounts[a.category] ?? 0) + 1;
    }
  }

  const achievementGrid = Object.entries(CAT_LABELS).map(([cat, label]) => {
    const categoryAchievements = byCategory[cat]; if (!categoryAchievements?.length) return '';
    const earnedCount  = categoryAchievements.filter(a => earnedSet.has(a.id)).length;
    const visibleCount = categoryAchievements.filter(a => !a.hidden && !a.secret).length;
    const hiddenLeft   = hiddenCounts[cat] ?? 0;
    const allDone      = earnedCount >= visibleCount && visibleCount > 0;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text2)">${esc(label)}</span>
        <span style="display:flex;align-items:center;gap:6px">
          ${hiddenLeft > 0 ? `<span style="font-size:9px;color:rgba(196,154,60,0.5);font-style:italic">${hiddenLeft} hidden</span>` : ''}
          <span style="font-size:10px;color:${allDone?'var(--gold)':'var(--text2)'};font-weight:${allDone?700:400}">${earnedCount}/${visibleCount}${allDone?' ✓':''}</span>
        </span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${categoryAchievements.map(a => {
          const e = earnedSet.has(a.id);
          const isHidden = a.hidden || a.secret;
          return `<div title="${esc(e ? a.name+' — '+a.desc+' (+'+a.xp+' XP)' : (isHidden?'Hidden achievement — keep exploring':a.name+': '+a.desc))}"
            style="display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:8px;cursor:default;
              background:${e?'rgba(196,154,60,0.12)':'rgba(255,255,255,0.02)'};
              border:0.5px solid ${e?'rgba(196,154,60,0.35)':'rgba(255,255,255,0.05)'};
              opacity:${e?1:0.45};transition:opacity .15s">
            <span style="font-size:13px">${e ? a.icon : '🔒'}</span>
            <div>
              <div style="font-size:10px;font-weight:500;color:${e?'var(--gold)':'var(--text2)'};line-height:1.2">${esc(e ? a.name : (isHidden ? '???' : a.name))}</div>
              ${e ? `<div style="font-size:9px;color:rgba(255,255,255,0.25)">+${a.xp ?? 0} XP</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  // ── PINNED ACHIEVEMENT SLOTS ────────────────────────────────────────────────
  const pinned = (p.pinnedAchievements ?? []).slice(0, 3);
  const pinnedHtml = pinned.length ? pinned.map(id => {
    const a = ACHIEVEMENTS.find(a => a.id === id);
    if (!a) return '';
    return `<div title="${esc(a.name)}: ${esc(a.desc)}" style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 12px;border-radius:10px;background:rgba(196,154,60,0.1);border:0.5px solid rgba(196,154,60,0.3);min-width:60px">
      <span style="font-size:22px">${a.icon}</span>
      <span style="font-size:9px;color:var(--gold);text-align:center;line-height:1.3">${esc(a.name)}</span>
    </div>`;
  }).join('') : '';

  // ── RING STYLE for this flair ──────────────────────────────────────────────
  const ringIsGradient = activeFlair.ring.includes('gradient');
  const ringBorderStyle = ringIsGradient
    ? `background:${activeFlair.ring};padding:2px;`
    : `border:2px solid ${activeFlair.ring};`;
  const ringBoxShadow = activeFlair.shadow !== 'none' ? `box-shadow:${activeFlair.shadow};` : '';

  el.innerHTML = `
<style>
.pdlg-tab-bar { display:flex;border-bottom:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);flex-shrink:0; }
.pdlg-tab { padding:0 14px;height:34px;background:transparent;border:none;border-bottom:2px solid transparent;
  font-size:12px;font-weight:500;color:rgba(255,255,255,0.4);cursor:pointer;transition:all .15s;white-space:nowrap;margin-bottom:-1px; }
.pdlg-tab:hover { color:rgba(255,255,255,0.7); }
.pdlg-tab.active { color:#d6d4ce;border-bottom-color:rgba(196,154,60,0.8); }
.pdlg-panel { display:none;padding:14px 16px 20px; }
.pdlg-panel.active { display:block; }
.pdlg-hero { padding:16px 14px 0;position:relative;overflow:hidden; }
.pdlg-hero::before { content:'';position:absolute;inset:0;background:radial-gradient(ellipse 60% 100% at 0% 50%,rgba(196,154,60,0.07),transparent 70%);pointer-events:none; }
.pdlg-avatar-wrap { width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;${ringBorderStyle}${ringBoxShadow}${activeFlair.anim?'animation:pdlg-spin 4s linear infinite;':''} }
.pdlg-avatar-inner { width:100%;height:100%;border-radius:50%;background:rgba(20,20,26,1);display:flex;align-items:center;justify-content:center;font-size:30px;line-height:1; }
@keyframes pdlg-spin { to { filter:hue-rotate(360deg); } }
.pdlg-rec-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:10px; }
@media(min-width:560px){ .pdlg-rec-grid{grid-template-columns:repeat(4,1fr);} }
.pdlg-rec { background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;text-align:center; }
.pdlg-rec-val { font-size:18px;font-weight:700;color:#f0ece8;line-height:1.2; }
.pdlg-rec-lbl { font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.3);margin-top:3px; }
.pdlg-next { background:rgba(196,154,60,0.06);border:0.5px solid rgba(196,154,60,0.18);border-radius:10px;padding:12px 14px;margin-bottom:8px; }
.pdlg-flair-grid { display:flex;flex-wrap:wrap;gap:8px; }
.pdlg-flair-btn { padding:7px 13px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);cursor:pointer;font-size:11px;color:rgba(255,255,255,0.6);transition:all .15s; }
.pdlg-flair-btn.active,.pdlg-flair-btn:hover { background:rgba(196,154,60,0.12);border-color:rgba(196,154,60,0.4);color:var(--gold); }
.pdlg-flair-btn[disabled] { opacity:0.3;cursor:not-allowed; }
.pdlg-title-btn { display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);cursor:pointer;width:100%;text-align:left;margin-bottom:5px;transition:all .15s; }
.pdlg-title-btn:hover,.pdlg-title-btn.active { background:rgba(196,154,60,0.1);border-color:rgba(196,154,60,0.3); }
.pdlg-title-btn[disabled] { opacity:0.3;cursor:not-allowed; }
.pdlg-pin-slot { width:72px;height:72px;border-radius:10px;border:1px dashed rgba(255,255,255,0.12);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:22px;transition:all .15s;background:transparent; }
.pdlg-pin-slot:hover { border-color:rgba(196,154,60,0.4);background:rgba(196,154,60,0.05); }
.pdlg-pin-slot.filled { border-style:solid;border-color:rgba(196,154,60,0.35);background:rgba(196,154,60,0.08); }
/* Two-column layout: removed — now single full-width */
</style>

<!-- ── PROFILE DIALOG CONTENT ──────────────────────────────────────────────── -->

<!-- Tab bar (sticky at top) -->
<div class="pdlg-tab-bar" role="tablist">
  <button class="pdlg-tab active" data-ptab="hero"     role="tab">Profile</button>
  <button class="pdlg-tab"        data-ptab="progress" role="tab">Achievements</button>
</div>
<div class="pdlg-body">

<!-- ══════════════════════════════════════════════════════════════════════════
     PROFILE TAB
══════════════════════════════════════════════════════════════════════════ -->
<div class="pdlg-panel active" data-ppanel="hero">

  <!-- ── Hero card ─────────────────────────────────────────────────────────── -->
  <div style="background:linear-gradient(135deg,rgba(196,154,60,0.07) 0%,rgba(127,176,255,0.04) 100%);
    border:0.5px solid rgba(196,154,60,0.20);border-radius:14px;padding:16px 18px;margin-bottom:14px">

    <div style="display:flex;align-items:flex-start;gap:14px">

      <!-- Avatar (clickable) -->
      <button id="pp_emojiBtn" style="background:none;border:none;padding:0;cursor:pointer;flex-shrink:0" title="Tap to change avatar">
        <div class="pdlg-avatar-wrap" style="width:56px;height:56px;border-radius:14px">
          <div class="pdlg-avatar-inner" style="font-size:28px">${p.avatarEmoji||'🧘'}</div>
        </div>
      </button>

      <!-- Identity -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:3px">
          <input id="pp_displayName" type="text" maxlength="40" placeholder="Your name…"
            value="${esc(p.displayName||'')}" autocomplete="off"
            style="background:transparent;border:none;border-bottom:1px solid rgba(196,154,60,0);
              outline:none;font-size:18px;font-weight:700;color:#f0ece8;font-family:var(--font);
              padding:0;min-width:80px;max-width:160px;caret-color:var(--gold);transition:border-color .15s"
            onfocus="this.style.borderBottomColor='rgba(196,154,60,0.5)'"
            onblur="this.style.borderBottomColor='rgba(196,154,60,0)'" />
          <span style="font-size:13px;font-weight:600;color:var(--gold)">Lv.${currentLevel}</span>
          <span style="font-size:10px;color:rgba(255,255,255,0.3)">${esc(levelName)}</span>
          <span style="${
            userTier==='pro'      ? 'font-size:11px;font-weight:700;color:#b06fd4;text-shadow:0 0 4px rgba(200,150,255,0.6);text-transform:uppercase;letter-spacing:.07em' :
            userTier==='advanced' ? 'font-size:11px;font-weight:700;color:#c49a3c;text-shadow:0 0 4px rgba(255,230,100,0.6);text-transform:uppercase;letter-spacing:.07em' :
            userTier==='moderate' ? 'font-size:11px;font-weight:700;color:#7fb0ff;text-transform:uppercase;letter-spacing:.07em' :
                                    'font-size:10px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.07em'
          }">${{beginner:'Beginner',moderate:'Moderate',advanced:'Advanced',pro:'Pro ★'}[userTier]}</span>
        </div>
        <div style="font-size:10.5px;color:rgba(255,255,255,0.35);margin-bottom:10px">
          ${activeTitle ? `<span style="color:var(--gold)">${activeTitle.icon} ${esc(activeTitle.name)}</span>` : `${esc(persona.icon)} ${esc(persona.desc)}`}
          ${(() => { const z = _zodiacSign(p.dobDay, p.dobMonth); return z ? ` <span style="opacity:0.5">· ${z.symbol} ${esc(z.name)}</span>` : ''; })()}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,0.3);margin-bottom:4px">
          <span>${currentXp.toLocaleString()} XP</span>
          <span>${currentLevel < MAX_LEVEL ? (currentXp+xpNeeded).toLocaleString()+' to Lv.'+(currentLevel+1) : '✦ Max Level'}</span>
        </div>
        <div style="height:5px;border-radius:3px;background:rgba(255,255,255,0.07);overflow:hidden">
          <div style="height:100%;width:${progressPct}%;border-radius:3px;background:linear-gradient(90deg,rgba(232,100,58,0.9),rgba(196,154,60,1));transition:width 1.2s ease"></div>
        </div>
      </div>

      <!-- Rating bar (right) -->
      <div style="text-align:right;flex-shrink:0;min-width:76px">
        ${(() => {
          const tv  = ACHIEVEMENTS.filter(a => !a.hidden && !a.secret).length;
          const pct = tv > 0 ? (earnedSet.size / tv) * 100 : 0;
          if (pct >= 80) {
            const hc   = pct >= 98 ? 20 : Math.max(1, Math.ceil((pct - 80) / 0.9));
            const row1 = Math.min(hc, 10), row2 = Math.max(0, hc - 10);
            const hRow = n => Array.from({length:10},(_,i) =>
              `<span style="font-size:10px;opacity:${i<n?1:0.12};line-height:1;${i<n?'filter:drop-shadow(0 0 2px rgba(255,120,180,0.8))':''}">❤</span>`
            ).join('');
            return `<div style="font-size:8px;color:rgba(255,120,180,0.6);margin-bottom:3px">${hc}/20 ❤</div>
              <div style="display:flex;gap:1px;justify-content:flex-end">${hRow(row1)}</div>
              ${row2>0?`<div style="display:flex;gap:1px;justify-content:flex-end;margin-top:2px">${hRow(row2)}</div>`:''}`;
          } else {
            const sc = Math.min(5, Math.floor(pct / 13));
            return `<div style="font-size:8px;color:rgba(255,255,255,0.25);margin-bottom:3px">${sc}/5 ★</div>
              <div style="display:flex;gap:2px;justify-content:flex-end">${
                Array.from({length:5},(_,i)=>`<span style="font-size:13px;color:${i<sc?'#f0c040':'rgba(255,255,255,0.1)'};${i<sc?'filter:drop-shadow(0 0 2px rgba(240,192,60,0.5))':''}">★</span>`).join('')
              }</div>`;
          }
        })()}
        <div style="font-size:9px;color:rgba(255,255,255,0.28);margin-top:5px">${earnedSet.size} <span style="opacity:.6">earned</span></div>
        <div style="font-size:8.5px;color:rgba(255,255,255,0.2);margin-top:1px">${ACHIEVEMENTS.filter(a=>!a.secret&&!a.hidden).length} visible</div>
        <div style="font-size:8.5px;color:rgba(196,154,60,0.45);margin-top:1px">${ACHIEVEMENTS.filter(a=>a.secret||a.hidden).length} hidden</div>
      </div>
    </div><!-- /top row -->

    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:14px;
      padding-top:12px;border-top:0.5px solid rgba(255,255,255,0.06)">
      ${[
        { val: p.sessionCount ?? 0,                              lbl:'Sessions' },
        { val: fmt(p.totalRuntimeSec ?? 0),                      lbl:'Runtime'  },
        { val: (p.streak??0) + ((p.streak??0)>=7?' 🔥':''),      lbl:'Streak',  gold: (p.streak??0)>=3 },
        { val: compatPct !== null ? compatPct+'%' : '—',         lbl:'Focus'    },
      ].map(s=>`<div style="text-align:center;padding:6px 4px;background:rgba(255,255,255,0.025);border-radius:7px">
        <div style="font-size:13px;font-weight:700;color:${s.gold?'var(--gold)':'#e8e5df'};line-height:1.1">${s.val}</div>
        <div style="font-size:7.5px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.25);margin-top:2px">${s.lbl}</div>
      </div>`).join('')}
    </div>
  </div><!-- /hero card -->

  <!-- ── Customize: title · flair · pinned achievements ────────────────────── -->
  <details style="margin-bottom:12px">
    <summary style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.3);
      cursor:pointer;display:flex;align-items:center;gap:6px;padding:4px 0;list-style:none">
      ✦ Customize Profile
      <span style="flex:1;height:0.5px;background:rgba(255,255,255,0.06)"></span>
      <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.6">▾</span>
    </summary>
    <div style="margin-top:10px">

      <!-- Title picker -->
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.3);margin-bottom:8px">
        Display Title <span style="text-transform:none;letter-spacing:0;opacity:0.6;font-size:8.5px">· choose how you appear on your card</span>
      </div>
      <div style="margin-bottom:16px">
        ${TITLES.map(title => {
          const isEarned = titlesEarned.includes(title.id);
          const isActive = p.activeTitle === title.id;
          return `<button class="pdlg-title-btn ${isActive?'active':''}" data-title-id="${esc(title.id)}" ${!isEarned?'disabled':''}>
            <span style="font-size:16px;flex-shrink:0">${title.icon}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:11.5px;font-weight:500;color:${isEarned?'var(--text)':'rgba(255,255,255,0.3)'}">${esc(title.name)}</div>
              <div style="font-size:10px;color:rgba(255,255,255,0.3)">${esc(title.desc)}</div>
            </div>
            ${isActive?'<span style="font-size:10px;color:var(--gold)">✓ Active</span>':''}
            ${!isEarned?'<span style="font-size:9px;color:rgba(255,255,255,0.2)">🔒 Locked</span>':''}
          </button>`;
        }).join('')}
      </div>

      <!-- Flair picker -->
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.3);margin-bottom:8px">
        Avatar Ring Flair <span style="text-transform:none;letter-spacing:0;opacity:0.6;font-size:8.5px">· cosmetic, earned through play</span>
      </div>
      <div class="pdlg-flair-grid" style="margin-bottom:16px">
        ${Object.entries(FLAIRS).map(([id, flair]) => {
          const isEarned = earnedFlairIds.includes(id);
          const isActive = (p.activeFlair ?? 'default') === id;
          const ringPreview = flair.ring.includes('gradient')
            ? `background:${flair.ring};width:14px;height:14px;border-radius:50%;display:inline-block`
            : `width:14px;height:14px;border-radius:50%;border:2px solid ${flair.ring};display:inline-block`;
          return `<button class="pdlg-flair-btn ${isActive?'active':''}" data-flair-id="${esc(id)}" ${!isEarned?'disabled':''}>
            <span style="${ringPreview}"></span>
            ${esc(flair.name)} ${!isEarned?'🔒':''}
          </button>`;
        }).join('')}
      </div>

      <!-- Pinned achievements (up to 3) -->
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.3);margin-bottom:8px">
        Pinned Achievements <span style="text-transform:none;letter-spacing:0;opacity:0.6;font-size:8.5px">· up to 3 shown in header</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${[0,1,2].map(slot => {
          const id = pinned[slot];
          const a  = id ? ACHIEVEMENTS.find(a => a.id === id) : null;
          return `<button class="pdlg-pin-slot ${a?'filled':''}" data-pin-slot="${slot}">
            ${a ? `<span style="font-size:24px">${a.icon}</span><span style="font-size:8px;color:var(--gold);padding:0 4px;text-align:center">${esc(a.name)}</span>` : '<span style="font-size:16px;opacity:0.3">+</span>'}
          </button>`;
        }).join('')}
      </div>
      <div id="pp_pin_picker" style="display:none;max-height:160px;overflow-y:auto;border:0.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px">
        ${ACHIEVEMENTS.filter(a => earnedSet.has(a.id)).map(a =>
          `<button data-pin-achievement="${esc(a.id)}" style="display:flex;align-items:center;gap:7px;width:100%;padding:5px 8px;border-radius:6px;border:none;background:transparent;cursor:pointer;text-align:left;color:var(--text)">
            <span style="font-size:14px">${a.icon}</span>
            <span style="font-size:11px">${esc(a.name)}</span>
          </button>`
        ).join('')}
      </div>

      <!-- Danger zone -->
      <div style="margin-top:16px;padding-top:12px;border-top:0.5px solid rgba(255,255,255,0.06)">
        <button id="pp_replayProfileTour" style="width:100%;padding:8px;border-radius:8px;font-size:11px;background:transparent;border:0.5px solid rgba(196,154,60,0.18);color:rgba(196,154,60,0.55);cursor:pointer;margin-bottom:5px">👤 Replay profile tour</button>
        <button id="pp_replayOnboarding" style="width:100%;padding:8px;border-radius:8px;font-size:11px;background:transparent;border:0.5px solid rgba(255,255,255,0.07);color:rgba(255,255,255,0.25);cursor:pointer;margin-bottom:5px">↺ Replay app onboarding</button>
        <button id="pp_resetSettings" style="width:100%;padding:8px;border-radius:8px;font-size:11px;background:transparent;border:0.5px solid rgba(255,255,255,0.07);color:rgba(255,255,255,0.25);cursor:pointer;margin-bottom:5px">⟳ Reset settings to defaults</button>
        <button id="clearProfileBtn" style="width:100%;padding:8px;border-radius:8px;font-size:11px;background:transparent;border:0.5px solid rgba(122,26,46,0.25);color:rgba(196,80,80,0.4);cursor:pointer">✕ Clear profile &amp; all history</button>
      </div>
    </div>
  </details>

  <!-- ── About You ──────────────────────────────────────────────────────────── -->
  <details style="margin-bottom:12px" open>
    <summary style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.3);
      cursor:pointer;display:flex;align-items:center;gap:6px;padding:4px 0;list-style:none">
      👤 About You
      <span style="flex:1;height:0.5px;background:rgba(255,255,255,0.06)"></span>
      <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.6">▾</span>
    </summary>
    <div style="margin-top:10px">

      <!-- Goals textarea -->
      <div style="margin-bottom:12px">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25);margin-bottom:5px">Goals</div>
        <textarea id="pp_goals" rows="2" maxlength="500" placeholder="What are you here for? What are you working toward?"
          style="width:100%;font-size:11px;line-height:1.6;resize:none;font-style:italic;
            color:rgba(240,236,228,0.52);background:rgba(255,255,255,0.02);
            border:0.5px solid rgba(196,154,60,0.10);border-radius:8px;padding:7px 10px;
            box-sizing:border-box;caret-color:var(--gold);outline:none;font-family:var(--serif)"
        >${esc(p.goals||'')}</textarea>
      </div>

      <!-- DOB → Zodiac -->
      <div style="margin-bottom:12px">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25);margin-bottom:6px">
          Birthday <span style="text-transform:none;letter-spacing:0;opacity:0.6">· generates your zodiac sign</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <select id="pp_dobDay" style="font-size:11px;padding:7px 8px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(196,154,60,0.12);border-radius:8px;color:rgba(240,236,228,0.65)">
            <option value="">Day</option>
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}"${p.dobDay==i+1?' selected':''}>${i+1}</option>`).join('')}
          </select>
          <select id="pp_dobMonth" style="font-size:11px;padding:7px 8px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(196,154,60,0.12);border-radius:8px;color:rgba(240,236,228,0.65)">
            <option value="">Month</option>
            ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>`<option value="${i+1}"${p.dobMonth==i+1?' selected':''}>${m}</option>`).join('')}
          </select>
          ${(() => {
            const z = _zodiacSign(p.dobDay, p.dobMonth);
            return z ? `<span style="font-size:18px">${z.symbol}</span><span style="font-size:11px;color:rgba(255,255,255,0.5)">${esc(z.name)}</span>` : '';
          })()}
        </div>
      </div>

      <!-- Age range · Gender -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25);margin-bottom:5px">Age Range</div>
          <select id="pp_ageRange" style="width:100%;font-size:11px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(196,154,60,0.12);border-radius:8px;color:rgba(240,236,228,0.65)">
            <option value="">Prefer not to say</option>
            <option value="18-24"  ${p.ageRange==='18-24'  ?' selected':''}>18–24</option>
            <option value="25-34"  ${p.ageRange==='25-34'  ?' selected':''}>25–34</option>
            <option value="35-44"  ${p.ageRange==='35-44'  ?' selected':''}>35–44</option>
            <option value="45-54"  ${p.ageRange==='45-54'  ?' selected':''}>45–54</option>
            <option value="55-64"  ${p.ageRange==='55-64'  ?' selected':''}>55–64</option>
            <option value="65+"    ${p.ageRange==='65+'    ?' selected':''}>65+</option>
          </select>
        </div>
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25);margin-bottom:5px">Gender</div>
          <select id="pp_gender" style="width:100%;font-size:11px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(196,154,60,0.12);border-radius:8px;color:rgba(240,236,228,0.65)">
            <option value="">Prefer not to say</option>
            <option value="male"       ${p.gender==='male'      ?' selected':''}>Male</option>
            <option value="female"     ${p.gender==='female'    ?' selected':''}>Female</option>
            <option value="nonbinary"  ${p.gender==='nonbinary' ?' selected':''}>Non-binary</option>
          </select>
        </div>
      </div>

      <!-- Session use · Role -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25);margin-bottom:5px">Primary Use</div>
          <select id="pp_primaryUse" style="width:100%;font-size:11px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(196,154,60,0.12);border-radius:8px;color:rgba(240,236,228,0.65)">
            <option value="self"          ${(p.primaryUse||'self')==='self'            ?' selected':''}>Myself, for myself</option>
            <option value="self-for-partner" ${p.primaryUse==='self-for-partner'       ?' selected':''}>Myself, for my partner</option>
            <option value="partner-trains-me" ${p.primaryUse==='partner-trains-me'    ?' selected':''}>Guided by my partner</option>
            <option value="i-train-partner" ${p.primaryUse==='i-train-partner'         ?' selected':''}>Guiding my partner</option>
            <option value="other"         ${p.primaryUse==='other'                     ?' selected':''}>Private / demo mode</option>
          </select>
        </div>
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25);margin-bottom:5px">My Role</div>
          <select id="pp_role" style="width:100%;font-size:11px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(196,154,60,0.12);border-radius:8px;color:rgba(240,236,228,0.65)">
            <option value="primary"  ${(p.role||'primary')==='primary'  ?' selected':''}>I'm the subject</option>
            <option value="operator" ${p.role==='operator'               ?' selected':''}>I'm the operator</option>
          </select>
        </div>
      </div>
    </div>
  </details>

  <!-- ── Body Metrics ───────────────────────────────────────────────────────── -->
  <details style="margin-bottom:12px">
    <summary style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(100,180,200,0.6);
      cursor:pointer;display:flex;align-items:center;gap:6px;padding:4px 0;list-style:none">
      ⚕ Body Metrics <span style="text-transform:none;letter-spacing:0;font-size:8.5px;color:rgba(255,255,255,0.2)">· optional · local only · not medical advice</span>
      <span style="flex:1;height:0.5px;background:rgba(255,255,255,0.06)"></span>
      <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.6;color:rgba(255,255,255,0.3)">▾</span>
    </summary>
    <div style="margin-top:10px">

      <!-- Unit system toggle -->
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button id="pp_unitMetric"   style="flex:1;padding:6px;border-radius:7px;font-size:11px;cursor:pointer;border:0.5px solid rgba(127,176,255,0.3);${(p.unitSystem||'metric')==='metric'  ? 'background:rgba(127,176,255,0.15);color:#7fb0ff' : 'background:transparent;color:rgba(255,255,255,0.3)'}">Metric (kg/cm)</button>
        <button id="pp_unitImperial" style="flex:1;padding:6px;border-radius:7px;font-size:11px;cursor:pointer;border:0.5px solid rgba(127,176,255,0.3);${p.unitSystem==='imperial' ? 'background:rgba(127,176,255,0.15);color:#7fb0ff' : 'background:transparent;color:rgba(255,255,255,0.3)'}">Imperial (lbs/ft)</button>
      </div>

      <!-- Height + Weight fields -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        ${p.unitSystem === 'imperial' ? `
        <label style="font-size:11px;color:rgba(240,236,228,0.5)">Height (ft)
          <input id="pp_heightFt" type="number" min="3" max="8" step="1"
            value="${p.heightCm ? Math.floor(p.heightCm/2.54/12) : ''}" placeholder="e.g. 5"
            style="margin-top:4px;font-size:12px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(100,180,200,0.12);border-radius:8px;color:rgba(240,236,228,0.85);width:100%"/>
        </label>
        <label style="font-size:11px;color:rgba(240,236,228,0.5)">Height (in)
          <input id="pp_heightIn" type="number" min="0" max="11" step="1"
            value="${p.heightCm ? Math.round(p.heightCm/2.54)%12 : ''}" placeholder="e.g. 10"
            style="margin-top:4px;font-size:12px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(100,180,200,0.12);border-radius:8px;color:rgba(240,236,228,0.85);width:100%"/>
        </label>
        <label style="font-size:11px;color:rgba(240,236,228,0.5)">Weight (lbs)
          <input id="pp_weightLbs" type="number" min="66" max="660" step="1"
            value="${p.weightKg ? +_kgToLbs(p.weightKg) : ''}" placeholder="e.g. 158"
            style="margin-top:4px;font-size:12px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(100,180,200,0.12);border-radius:8px;color:rgba(240,236,228,0.85);width:100%"/>
        </label>
        ` : `
        <label style="font-size:11px;color:rgba(240,236,228,0.5)">Height (cm)
          <input id="pp_heightCm" type="number" min="100" max="250" step="1"
            value="${p.heightCm||''}" placeholder="e.g. 175"
            style="margin-top:4px;font-size:12px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(100,180,200,0.12);border-radius:8px;color:rgba(240,236,228,0.85);width:100%"/>
        </label>
        <label style="font-size:11px;color:rgba(240,236,228,0.5)">Weight (kg)
          <input id="pp_weightKg" type="number" min="30" max="300" step="0.5"
            value="${p.weightKg||''}" placeholder="e.g. 70"
            style="margin-top:4px;font-size:12px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(100,180,200,0.12);border-radius:8px;color:rgba(240,236,228,0.85);width:100%"/>
        </label>
        `}
        <label style="font-size:11px;color:rgba(240,236,228,0.5)">Body Fat % <span style="opacity:0.5">(optional)</span>
          <input id="pp_bodyFatPct" type="number" min="5" max="60" step="0.5"
            value="${p.bodyFatPct||''}" placeholder="e.g. 18"
            style="margin-top:4px;font-size:12px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(100,180,200,0.12);border-radius:8px;color:rgba(240,236,228,0.85);width:100%"/>
        </label>
        <label style="font-size:11px;color:rgba(240,236,228,0.5)">Activity Level
          <select id="pp_fitnessLevel" style="margin-top:4px;width:100%;font-size:11px;padding:7px 10px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(100,180,200,0.12);border-radius:8px;color:rgba(240,236,228,0.65)">
            <option value=""          ${!p.fitnessLevel               ?' selected':''}>Not specified</option>
            <option value="sedentary" ${p.fitnessLevel==='sedentary'  ?' selected':''}>Sedentary</option>
            <option value="light"     ${p.fitnessLevel==='light'      ?' selected':''}>Lightly active</option>
            <option value="moderate"  ${p.fitnessLevel==='moderate'   ?' selected':''}>Moderately active</option>
            <option value="active"    ${p.fitnessLevel==='active'     ?' selected':''}>Very active</option>
            <option value="athlete"   ${p.fitnessLevel==='athlete'    ?' selected':''}>Athlete</option>
          </select>
        </label>
      </div>

      <!-- BMI + TDEE display -->
      ${(() => {
        const bmi  = _calcBmi(p.heightCm, p.weightKg);
        const tdee = _estimateTdee(p);
        if (!bmi && !tdee) return '<p style="font-size:10.5px;color:rgba(255,255,255,0.25);font-style:italic">Enter height and weight to see personalised insights.</p>';
        const cat  = _bmiCategory(bmi);
        return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          ${bmi ? `<div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:${cat.color}">${bmi}</div>
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:${cat.color};margin-top:2px">${esc(cat.label)}</div>
            <div style="font-size:8.5px;color:rgba(255,255,255,0.25);margin-top:1px">BMI</div>
          </div>` : ''}
          ${tdee ? `<div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:#7fb0ff">${Math.round(tdee)}</div>
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#7fb0ff;margin-top:2px">kcal/day</div>
            <div style="font-size:8.5px;color:rgba(255,255,255,0.25);margin-top:1px">Est. TDEE</div>
          </div>` : ''}
        </div>`;
      })()}
    </div>
  </details>

  <!-- ── Activity heatmap ───────────────────────────────────────────────────── -->
  <div style="background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);
    border-radius:10px;padding:10px 12px;margin-bottom:12px">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;
      color:rgba(255,255,255,0.25);margin-bottom:8px">Activity — 26 weeks</div>
    <div style="overflow-x:auto;overflow-y:hidden">${heatmapSvg}</div>
  </div>

  <!-- ── Personal records ───────────────────────────────────────────────────── -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
    ${[
      { label:'Best Focus',   val: p.bestFocusPct  !== null && p.bestFocusPct !== undefined ? p.bestFocusPct+'%' : '—',    color:'#7dc87a' },
      { label:'Longest',      val: p.longestSessionSec ? fmt(p.longestSessionSec) : '—',                                    color:'#7fb0ff' },
      { label:'Best Streak',  val: (p.longestStreak ?? 0) > 0 ? (p.longestStreak)+' days' : '—',                           color:'#f0a04a' },
    ].map(r => `<div style="background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:${r.color}">${r.val}</div>
      <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25);margin-top:2px">${r.label}</div>
    </div>`).join('')}
  </div>

  <!-- ── Metrics chart ──────────────────────────────────────────────────────── -->
  <div style="background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);
    border-radius:10px;padding:10px 12px;margin-bottom:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,0.25)">Session Metrics</div>
      <div style="display:flex;align-items:center;gap:8px">
        <button id="pp_importMetrics" style="font-size:9px;padding:2px 6px;border-radius:4px;border:0.5px solid rgba(196,154,60,0.18);background:rgba(196,154,60,0.05);color:var(--gold);cursor:pointer">⬆ Import CSV</button>
        <input id="pp_importMetricsFile" type="file" accept=".json,.csv" style="display:none">
        <input id="pp_retainDays" type="number" min="7" max="365" value="${p.retainDays??180}"
          style="width:38px;font-size:9.5px;text-align:center;background:rgba(196,154,60,0.06);border:0.5px solid rgba(196,154,60,0.15);border-radius:3px;color:rgba(196,154,60,0.7);padding:1px 3px"> days
      </div>
    </div>
    <div id="pp_metricsChart">${metricsChartHtml}</div>
  </div>

</div><!-- /profile panel -->

<!-- ══════════════════════════════════════════════════════════════════════════
     ACHIEVEMENTS TAB
══════════════════════════════════════════════════════════════════════════ -->
<div class="pdlg-panel" data-ppanel="progress">

  <!-- Tier info banner -->
  ${(() => {
    const tierData = {
      beginner: { color:'rgba(255,255,255,0.4)', bg:'rgba(255,255,255,0.05)', border:'rgba(255,255,255,0.10)',
        label:'Beginner 🌱', desc:'Quests focus on exploration and first steps.',
        next:'Complete 4 sessions of 6+ minutes this month to reach Moderate.',
        sessNeeded: Math.max(0, 4 - ((p.sessionHistory??[]).filter(h=>(Date.now()-new Date(h.date).getTime())<=30*86400000&&(h.durationSec??0)>=360).length)) },
      moderate: { color:'#7dc87a', bg:'rgba(125,200,122,0.07)', border:'rgba(125,200,122,0.25)',
        label:'Moderate 🌿', desc:'Quests include multi-feature and technique challenges.',
        next:'Complete 10 sessions of 6+ minutes this month to reach Advanced.',
        sessNeeded: Math.max(0, 10 - ((p.sessionHistory??[]).filter(h=>(Date.now()-new Date(h.date).getTime())<=30*86400000&&(h.durationSec??0)>=360).length)) },
      advanced: { color:'#7fb0ff', bg:'rgba(127,176,255,0.07)', border:'rgba(127,176,255,0.25)',
        label:'Advanced 🌀', desc:'Quests target precision, automation, and endurance.',
        next:'Complete 12 sessions of 10+ minutes this month to reach Pro.',
        sessNeeded: Math.max(0, 12 - ((p.sessionHistory??[]).filter(h=>(Date.now()-new Date(h.date).getTime())<=30*86400000&&(h.durationSec??0)>=600).length)) },
      pro: { color:'#b06fd4', bg:'rgba(176,111,212,0.08)', border:'rgba(176,111,212,0.3)',
        label:'Pro ★ 👑', desc:'Access to the hardest quests and most hidden achievements.',
        next:'Maintain 12 sessions of 10+ minutes per month to keep Pro status.',
        sessNeeded: 0 },
    };
    const td = tierData[userTier];
    return `<div style="margin-bottom:14px;padding:10px 14px;border-radius:10px;
      background:${td.bg};border:0.5px solid ${td.border};display:flex;align-items:center;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:700;color:${td.color};letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">${td.label} Tier</div>
        <div style="font-size:10.5px;color:rgba(255,255,255,0.5);line-height:1.5">${td.desc}</div>
        <div style="font-size:9.5px;color:rgba(255,255,255,0.3);margin-top:3px">${td.next}${td.sessNeeded>0?` (${td.sessNeeded} more session${td.sessNeeded!==1?'s':''} needed)`:''}</div>
      </div>
    </div>`;
  })()}

  <!-- Daily Quests | Almost There (two-column) -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">

    <!-- Daily Quests -->
    <div style="background:rgba(255,255,255,0.025);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px">
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:13px;font-weight:600;color:var(--text)">Daily Quests</div>
        <div style="font-size:9.5px;color:rgba(255,255,255,0.28);margin-top:2px">Refreshes in ${(() => { const now=new Date(),mdn=new Date(now); mdn.setDate(mdn.getDate()+1); mdn.setHours(0,0,0,0); const h=Math.floor((mdn-now)/3600000),m=Math.floor(((mdn-now)%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; })()}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${todayQuests.length>=4?4:3},1fr);gap:7px">
        ${todayQuests.map(q => {
          const qs   = questStates.find(s => s.id === q.id);
          const done = qs?.done ?? false;
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;border-radius:8px;
              background:${done?'rgba(45,106,79,0.15)':'rgba(255,255,255,0.03)'};
              border:0.5px solid ${done?'rgba(45,106,79,0.4)':'rgba(255,255,255,0.07)'};text-align:center">
            <span style="font-size:20px">${done?'✅':q.icon}</span>
            <div style="font-size:9.5px;font-weight:500;color:${done?'rgba(144,200,144,0.85)':'var(--text)'};line-height:1.3;${done?'text-decoration:line-through;':''}">${esc(q.name)}</div>
            <div style="font-size:9px;color:var(--gold);margin-top:1px">+${q.xp} XP</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Almost There -->
    <div style="background:rgba(255,255,255,0.025);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">Almost There</div>
      ${(() => {
        const almost = ACHIEVEMENTS.filter(a => !earnedSet.has(a.id) && !a.hidden && !a.secret).slice(0, 4);
        if (!almost.length) return '<p style="font-size:11px;color:rgba(255,255,255,0.3);font-style:italic">All visible achievements earned! 🏆</p>';
        return almost.map(a => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;
            padding:6px 8px;border-radius:7px;background:rgba(255,255,255,0.02)">
          <span style="font-size:18px;opacity:0.5">${a.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:10.5px;font-weight:500;color:rgba(255,255,255,0.5)">${esc(a.name)}</div>
            <div style="font-size:9.5px;color:rgba(255,255,255,0.25);line-height:1.4">${esc(a.desc)}</div>
          </div>
          <span style="font-size:9px;color:var(--gold);flex-shrink:0">+${a.xp}</span>
        </div>`).join('');
      })()}
    </div>
  </div><!-- /two-column -->

  <!-- Achievements Grid — sorted by Tool then Difficulty -->
  <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.25);margin-bottom:12px;display:flex;align-items:center;gap:8px">
    Achievements <span style="flex:1;height:0.5px;background:rgba(255,255,255,0.06)"></span>
    ${earnedSet.size} / ${ACHIEVEMENTS.filter(a=>!a.hidden&&!a.secret).length} visible · ${ACHIEVEMENTS.filter(a=>a.hidden||a.secret).length} hidden
  </div>
  ${achievementGridByTool}

</div><!-- /achievements panel -->

  </details>

</div>
`;



  // ── Wire tab switching ─────────────────────────────────────────────────────
  el.querySelectorAll('.pdlg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      el.querySelectorAll('.pdlg-tab').forEach(t => t.classList.remove('active'));
      el.querySelectorAll('.pdlg-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      el.querySelector(`[data-ppanel="${tab.dataset.ptab}"]`)?.classList.add('active');
    });
  });

  // ── Wire title picker ───────────────────────────────────────────────────────
  el.querySelectorAll('.pdlg-title-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      p.activeTitle = btn.dataset.titleId;
      saveProfile(p);
      updateMenubarAvatar(p);
      renderProfilePanel(containerId); // re-render to show new active title
    });
  });

  // ── Wire flair picker ───────────────────────────────────────────────────────
  el.querySelectorAll('.pdlg-flair-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      p.activeFlair = btn.dataset.flairId;
      saveProfile(p);
      renderProfilePanel(containerId); // re-render to apply flair
    });
  });

  // ── Wire pin slots (open picker on click) ───────────────────────────────────
  let _activePinSlot = null;
  const pinPicker = el.querySelector('#pp_pin_picker');
  el.querySelectorAll('.pdlg-pin-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      _activePinSlot = Number(slot.dataset.pinSlot);
      if (pinPicker) {
        pinPicker.style.display = pinPicker.style.display === 'block' ? 'none' : 'block';
      }
    });
  });
  if (pinPicker) {
    pinPicker.querySelectorAll('[data-pin-achievement]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_activePinSlot === null) return;
        const id = btn.dataset.pinAchievement;
        const pins = [...(p.pinnedAchievements ?? [])];
        pins[_activePinSlot] = id;
        p.pinnedAchievements = pins.slice(0, 3);
        saveProfile(p);
        pinPicker.style.display = 'none';
        renderProfilePanel(containerId);
      });
    });
  }

  // ── Wire identity field events ──────────────────────────────────────────────
  el.querySelector('#pp_displayName')?.addEventListener('input', e => {
    p.displayName = e.target.value.slice(0, 40);
    saveProfile(p);
    updateMenubarAvatar(p);
    _syncPeerPanel(containerId);
  });
  el.querySelector('#pp_goals')?.addEventListener('input', e => {
    p.goals = e.target.value.slice(0, 500);
    saveProfile(p);
    _syncPeerPanel(containerId);
  });
  el.querySelector('#pp_primaryUse')?.addEventListener('change', e => {
    p.primaryUse = e.target.value;
    saveProfile(p);
    _syncPeerPanel(containerId);
  });
  el.querySelector('#pp_role')?.addEventListener('change', e => {
    p.role = e.target.value;
    saveProfile(p);
    _syncPeerPanel(containerId);
  });
  // DOB → zodiac live update
  const _updateZodiac = () => {
    const z = _zodiacSign(p.dobDay, p.dobMonth);
    const zEl = el.querySelector('#pp_zodiacDisplay');
    if (zEl) zEl.textContent = z ? `✦ ${z}` : 'Zodiac';
  };
  el.querySelector('#pp_dobDay')?.addEventListener('change', e => {
    p.dobDay = e.target.value; saveProfile(p); _updateZodiac();
  });
  el.querySelector('#pp_dobMonth')?.addEventListener('change', e => {
    p.dobMonth = e.target.value; saveProfile(p); _updateZodiac();
  });
  el.querySelector('#pp_ageRange')?.addEventListener('change', e => {
    p.ageRange = e.target.value; saveProfile(p);
  });
  el.querySelector('#pp_gender')?.addEventListener('change', e => {
    p.gender = e.target.value; saveProfile(p);
  });
  // Body metrics — save and recompute insights live
  const _refreshBodyInsights = () => {
    const bmi  = _calcBmi(p.heightCm, p.weightKg);
    const cat  = _bmiCategory(bmi);
    const tdee = _estimateTdee(p);
    const insightEl = el.querySelector('#pp_bodyInsights');
    if (!insightEl) return;
    if (!bmi && !tdee) {
      insightEl.innerHTML = `<div style="font-size:10px;color:rgba(255,255,255,0.2);font-style:italic">Enter height &amp; weight to see derived insights.</div>`;
      return;
    }
    const parts = [];
    if (bmi)          parts.push(`<span style="color:${cat.color};font-weight:600">BMI ${bmi}</span> <span style="color:rgba(255,255,255,0.35)">${cat.label}</span>`);
    if (p.bodyFatPct) parts.push(`<span style="color:rgba(200,220,240,0.7)">Body fat ${p.bodyFatPct}%</span>`);
    if (tdee)         parts.push(`<span style="color:rgba(200,220,240,0.55)">~${tdee} kcal/day TDEE</span>`);
    insightEl.innerHTML = `<div style="font-size:11px;display:flex;flex-wrap:wrap;gap:10px;padding:8px 0 2px">${parts.join('')}</div><div style="font-size:9.5px;color:rgba(255,255,255,0.18);margin-top:4px;font-style:italic">⚕ Estimates only — not medical advice.</div>`;
  };
  el.querySelector('#pp_heightCm')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    p.heightCm = (Number.isFinite(v) && v >= 100 && v <= 250) ? v : null;
    saveProfile(p); _refreshBodyInsights();
  });
  el.querySelector('#pp_weightKg')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    p.weightKg = (Number.isFinite(v) && v >= 30 && v <= 300) ? v : null;
    saveProfile(p); _refreshBodyInsights();
  });
  // Imperial inputs — convert to metric on change then recompute
  const _updateFromImperial = () => {
    const ft = parseFloat(el.querySelector('#pp_heightFt')?.value);
    const inches = parseFloat(el.querySelector('#pp_heightIn')?.value ?? '0');
    if (Number.isFinite(ft)) p.heightCm = _ftInToCm(ft, Number.isFinite(inches) ? inches : 0);
    const lbs = parseFloat(el.querySelector('#pp_weightLbs')?.value);
    if (Number.isFinite(lbs) && lbs > 0) p.weightKg = _lbsToKg(lbs);
    saveProfile(p); _refreshBodyInsights();
  };
  el.querySelector('#pp_heightFt')?.addEventListener('change', _updateFromImperial);
  el.querySelector('#pp_heightIn')?.addEventListener('change', _updateFromImperial);
  el.querySelector('#pp_weightLbs')?.addEventListener('change', _updateFromImperial);
  el.querySelector('#pp_bodyFatPct')?.addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    p.bodyFatPct = (Number.isFinite(v) && v >= 3 && v <= 60) ? v : null;
    saveProfile(p); _refreshBodyInsights();
  });
  el.querySelector('#pp_fitnessLevel')?.addEventListener('change', e => {
    p.fitnessLevel = e.target.value; saveProfile(p); _refreshBodyInsights();
  });
  el.querySelector('#pp_retainDays')?.addEventListener('change', async e => {
    const val = Math.max(7, Math.min(365, Number(e.target.value) || 180));
    e.target.value = val;
    p.retainDays = val;
    saveProfile(p);
    // Re-render chart with new window
    const chartEl = el.querySelector('#pp_metricsChart');
    if (chartEl) chartEl.innerHTML = await renderMetricsChart(Math.min(val, 60), val);
    _syncPeerPanel(containerId);
  });

  // Import button opens hidden file input
  el.querySelector('#pp_importMetrics')?.addEventListener('click', () => {
    el.querySelector('#pp_importMetricsFile')?.click();
  });
  el.querySelector('#pp_importMetricsFile')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Reject oversized files before reading — max 2 MB for metrics JSON/CSV
      if (file.size > 2_000_000) throw new Error(
        `Metrics file is too large (${(file.size/1e6).toFixed(1)} MB). Max: 2 MB.`
      );
      const text = await file.text();
      let records;
      if (file.name.endsWith('.csv')) {
        records = _parseMetricsCsv(text);
      } else {
        const parsed = JSON.parse(text);
        records = Array.isArray(parsed) ? parsed : parsed.records ?? parsed.data ?? [];
      }
      // Cap record count to prevent runaway imports
      if (!Array.isArray(records)) throw new Error('Metrics file must contain a JSON array or CSV rows.');
      if (records.length > 1_000) throw new Error(
        `Too many records (${records.length}). Max allowed: 1,000 per import.`
      );
      const result = await importExternalMetrics(records, file.name.replace(/\.[^.]+$/, ''), p.retainDays ?? 180);
      notify.success(`Imported ${result.imported} day${result.imported !== 1 ? 's' : ''} of metrics from ${esc(file.name)}.${result.errors.length ? ` ${result.errors.length} records skipped.` : ''}`);
      // Refresh chart
      const chartEl = el.querySelector('#pp_metricsChart');
      if (chartEl) chartEl.innerHTML = await renderMetricsChart(Math.min(p.retainDays ?? 180, 60), p.retainDays ?? 180);
    } catch (err) {
      notify.error(`Could not import metrics: ${err.message}`);
    }
    e.target.value = ''; // reset so same file can be reimported
  });
  // Emoji picker: cycle through a small curated set on each click
  const AVATAR_EMOJIS = ['🧘','🎯','🏋','⚡','🌊','🔥','🎸','🌙','🦋','🐉','✨','💎'];
  el.querySelector('#pp_emojiBtn')?.addEventListener('click', () => {
    const idx = (AVATAR_EMOJIS.indexOf(p.avatarEmoji) + 1) % AVATAR_EMOJIS.length;
    p.avatarEmoji = AVATAR_EMOJIS[idx];
    saveProfile(p);
    // Update the inner styled div, NOT btn.textContent — that would strip .pc2-avatar-btn
    const inner = el.querySelector('#pp_emojiBtn .pdlg-avatar-inner');
    if (inner) inner.textContent = p.avatarEmoji;
    updateMenubarAvatar(p);
    _syncPeerPanel(containerId);
  });

  el.querySelector('#clearProfileBtn')?.addEventListener('click', async () => {
    const first = await notify.confirm(
      'This will permanently erase your profile, all session history, XP, achievements, and streaks. Are you sure?',
      { confirmLabel: 'Yes, erase everything', danger: true }
    );
    if (!first) return;
    const second = await notify.confirm(
      "Are you really, really sure? 🥺 This cannot be undone — your streak, level, and all achievements will be gone forever.",
      { confirmLabel: 'Yes, I\'m sure', danger: true }
    );
    if (!second) return;
    clearProfile();
    await clearStoredAnalytics();
    await clearMetricsHistory();
    await renderProfilePanel('profileDialogBody');
    updateMenubarAvatar(loadProfile());
    notify.success('Profile cleared. Starting fresh.');
  });

  el.querySelector('#pp_replayProfileTour')?.addEventListener('click', () => {
    resetProfileTour();
    setTimeout(() => startProfileTour(), 120);
  });

  // ── Unit system toggle ────────────────────────────────────────────────────
  el.querySelector('#pp_unitMetric')?.addEventListener('click', () => {
    p.unitSystem = 'metric';
    saveProfile(p);
    renderProfilePanel(containerId);
  });
  el.querySelector('#pp_unitImperial')?.addEventListener('click', () => {
    p.unitSystem = 'imperial';
    saveProfile(p);
    renderProfilePanel(containerId);
  });

  // ── Replay onboarding ─────────────────────────────────────────────────────
  el.querySelector('#pp_replayOnboarding')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ass:restartOnboarding'));
    notify.info('Replaying onboarding tutorial…');
  });

  // ── Reset settings ────────────────────────────────────────────────────────
  el.querySelector('#pp_resetSettings')?.addEventListener('click', async () => {
    const confirmed = await notify.confirm(
      'Reset all settings to their defaults? Your session content and profile data will not be affected.',
      { confirmLabel: 'Reset settings', danger: false }
    );
    if (!confirmed) return;
    const { syncSettingsForms } = await import('./ui.js');
    const fresh = normalizeSession(defaultSession());
    history.push();
    for (const key of SETTINGS_KEYS) { state.session[key] = fresh[key]; }
    persist();
    syncSettingsForms();
    const { applyCssVars } = await import('./state.js');
    applyCssVars();
    notify.success('Settings reset to defaults.');
  });
}

// ── CSV import helper ─────────────────────────────────────────────────────────
// Accepts a simple CSV with a header row. Recognised columns:
//   date, totalRuntimeSec, avgIntensityPct, avgEngagement, avgAttentionStability, sessionCount
function _parseMetricsCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const rec = {};
    headers.forEach((h, i) => {
      const v = cols[i]?.trim() ?? '';
      if (h === 'date') rec.date = v;
      else {
        const n = Number(v);
        if (!isNaN(n) && v !== '') rec[h] = n;
      }
    });
    return rec;
  }).filter(r => r.date);
}
