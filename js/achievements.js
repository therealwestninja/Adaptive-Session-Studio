// ── achievements.js ────────────────────────────────────────────────────────
// Achievements (66 total), daily quests, and XP/level progression.
//
// Usage pattern: ~2-3 sessions/month, typically <10 minutes each.
// Achievement tiers:
//   Starter  (1-3 sessions,  weeks 1-2)   — instant gratification
//   Early    (3-10 sessions, months 1-3)  — builds habit
//   Mid      (10-25 sessions, 6-12mo)     — long-term engagement
//   Late     (25-50 sessions, 1-2yr)      — dedicated practitioner
//   Endgame  (50+ sessions / secret)      — legend tier

import { state }          from './state.js';
import { notify }         from './notify.js';
import { idbGet, idbSet } from './idb-storage.js';

// ── XP / Level table ────────────────────────────────────────────────────────
export const LEVEL_NAMES = [
  '',             // 0 (unused)
  'Initiate',     // 1
  'Curious',      // 2
  'Attuned',      // 3
  'Focused',      // 4
  'Steady',       // 5
  'Devoted',      // 6
  'Controlled',   // 7
  'Refined',      // 8
  'Trained',      // 9
  'Practiced',    // 10
  'Disciplined',  // 11
  'Immersed',     // 12
  'Surrendered',  // 13
  'Shaped',       // 14
  'Conditioned',  // 15
  'Dedicated',    // 16
  'Elite',        // 17
  'Master',       // 18
  'Transcendent', // 19
  'Apex',         // 20
];
export const MAX_LEVEL = 20;

// XP required to reach level N (cumulative from 0)
export const LEVEL_THRESHOLDS = [
  0,     // → L1
  50,    // → L2
  130,   // → L3
  250,   // → L4
  420,   // → L5
  650,   // → L6
  950,   // → L7
  1320,  // → L8
  1770,  // → L9
  2310,  // → L10
  2960,  // → L11
  3730,  // → L12
  4640,  // → L13
  5710,  // → L14
  6960,  // → L15
  8410,  // → L16
  10080, // → L17
  12000, // → L18
  14200, // → L19
  16700, // → L20
  999999,
];

export function xpForLevel(level)    { return LEVEL_THRESHOLDS[Math.min(level, MAX_LEVEL)] ?? 999999; }
export function levelFromXp(xp)      { let l = 1; for (let i = 1; i <= MAX_LEVEL; i++) { if (xp >= LEVEL_THRESHOLDS[i]) l = i+1; else break; } return Math.min(l, MAX_LEVEL); }
export function xpToNextLevel(xp)    { const l = levelFromXp(xp); return l >= MAX_LEVEL ? 0 : LEVEL_THRESHOLDS[l] - xp; }
export function levelProgressPct(xp) { const l = levelFromXp(xp); if (l >= MAX_LEVEL) return 100; const b = LEVEL_THRESHOLDS[l-1], n = LEVEL_THRESHOLDS[l]; return Math.round(((xp-b)/(n-b))*100); }

// ── 66 achievements across 8 categories ─────────────────────────────────────
// secret:true → name/desc hidden as "???" until earned
// category: 'starter' | 'consistency' | 'depth' | 'endurance' | 'focus' | 'craft' | 'quests' | 'levels'
export const ACHIEVEMENTS = [

  // ╔══════════════════════════════════════╗
  // ║  STARTER — within first 1-2 sessions ║
  // ╚══════════════════════════════════════╝
  { id:'first_session',    icon:'🌱', name:'First Step',
    desc:'Complete your very first session.',
    xp:25, category:'starter' },

  // ── Body & Wellness achievements ──────────────────────────────────────────
  { id:'body_metrics_set', icon:'📏', name:'Know Thyself',
    desc:'Enter your height and weight in your profile.',
    xp:15, category:'wellness' },
  { id:'mindful_5h',       icon:'🧘', name:'Five Hours of Practice',
    desc:'Accumulate 5 hours of total session time.',
    xp:40, category:'wellness' },
  { id:'mindful_20h',      icon:'🕯', name:'Dedicated Practitioner',
    desc:'Accumulate 20 hours of total session time.',
    xp:80, category:'wellness' },
  { id:'focus_master',     icon:'🎯', name:'Focus Master',
    desc:'Complete 10 sessions with 90%+ sustained attention.',
    xp:60, category:'wellness' },
  { id:'early_riser_5',    icon:'🌅', name:'Morning Ritual',
    desc:'Complete 5 early-morning sessions (before noon).',
    xp:35, category:'wellness' },

  { id:'first_comeback',   icon:'↩️', name:'You Came Back',
    desc:'Complete a second session.',
    xp:20, category:'starter' },

  { id:'first_quest',      icon:'📋', name:'Quest Accepted',
    desc:'Complete your first daily quest.',
    xp:15, category:'starter' },

  { id:'first_level_up',   icon:'⬆️', name:'Levelling Up',
    desc:'Reach Level 2.',
    xp:20, category:'starter' },

  { id:'first_perfect',    icon:'✨', name:'Clean Run',
    desc:'Complete a session with zero attention losses.',
    xp:25, category:'starter' },

  { id:'first_feature',    icon:'🎛', name:'Beyond Defaults',
    desc:'Complete a session using any advanced feature (scenes, rules, haptic, or visualization).',
    xp:20, category:'starter' },

  // ╔══════════════════════════════════════════════╗
  // ║  CONSISTENCY — return visits & streaks       ║
  // ╚══════════════════════════════════════════════╝
  { id:'streak_2',         icon:'🔥', name:'Back Again',
    desc:'Play on 2 consecutive days.',
    xp:15, category:'consistency' },

  { id:'streak_3',         icon:'🔥', name:'Three in a Row',
    desc:'Play on 3 consecutive days.',
    xp:30, category:'consistency' },

  { id:'streak_7',         icon:'📅', name:'Week of Practice',
    desc:'Play on 7 consecutive days.',
    xp:80, category:'consistency', secret:true },

  { id:'two_in_one_day',   icon:'⚡', name:'Double Session',
    desc:'Complete 2 sessions in a single day.',
    xp:30, category:'consistency' },

  { id:'monthly_visitor',  icon:'🗓', name:'Monthly Visitor',
    desc:'Complete at least 3 sessions in a single calendar month.',
    xp:35, category:'consistency' },

  { id:'three_months',     icon:'🌙', name:'Three Months In',
    desc:'Play sessions across 3 or more different calendar months.',
    xp:60, category:'consistency' },

  { id:'six_months',       icon:'⭐', name:'Six Months',
    desc:'Play sessions across 6 or more different calendar months.',
    xp:120, category:'consistency', secret:true },

  { id:'comeback_kid',     icon:'🌅', name:'Comeback Kid',
    desc:'Return to play after a break of 30 or more days.',
    xp:25, category:'consistency' },

  // ╔═══════════════════════════════════════╗
  // ║  DEPTH — total session count          ║
  // ╚═══════════════════════════════════════╝
  { id:'sessions_3',       icon:'🌿', name:'Getting Started',
    desc:'Complete 3 sessions.',
    xp:20, category:'depth' },

  { id:'sessions_5',       icon:'💪', name:'Committed',
    desc:'Complete 5 sessions.',
    xp:30, category:'depth' },

  { id:'sessions_10',      icon:'🔑', name:'Double Digits',
    desc:'Complete 10 sessions.',
    xp:50, category:'depth' },

  { id:'sessions_20',      icon:'📈', name:'Regular Practitioner',
    desc:'Complete 20 sessions.',
    xp:90, category:'depth' },

  { id:'sessions_30',      icon:'🎯', name:'Thirty Sessions',
    desc:'Complete 30 sessions.',
    xp:130, category:'depth' },

  { id:'sessions_50',      icon:'🏅', name:'Fifty Sessions',
    desc:'Complete 50 sessions.',
    xp:200, category:'depth', secret:true },

  { id:'sessions_75',      icon:'💫', name:'Seventy-Five',
    desc:'Complete 75 sessions.',
    xp:300, category:'depth', secret:true },

  { id:'sessions_100',     icon:'💎', name:'The Century',
    desc:'Complete 100 sessions.',
    xp:500, category:'depth', secret:true },

  // ╔══════════════════════════════════════════╗
  // ║  ENDURANCE — cumulative and single-session ║
  // ╚══════════════════════════════════════════╝
  { id:'runtime_30m',      icon:'⏱', name:'Warmed Up',
    desc:'Accumulate 30 minutes of total session time.',
    xp:20, category:'endurance' },

  { id:'runtime_1h',       icon:'🕐', name:'First Hour',
    desc:'Accumulate 1 hour of total session time.',
    xp:40, category:'endurance' },

  { id:'runtime_2h',       icon:'⌛', name:'Two Hours',
    desc:'Accumulate 2 hours of total session time.',
    xp:70, category:'endurance' },

  { id:'runtime_5h',       icon:'🏃', name:'Five Hours',
    desc:'Accumulate 5 hours of total session time.',
    xp:130, category:'endurance' },

  { id:'runtime_10h',      icon:'👑', name:'Ten Hours',
    desc:'Accumulate 10 hours of total session time.',
    xp:250, category:'endurance', secret:true },

  { id:'long_session_10m', icon:'🕙', name:'Ten Minutes',
    desc:'Complete a single session lasting at least 10 minutes.',
    xp:20, category:'endurance' },

  { id:'long_session_20m', icon:'🌊', name:'Twenty Minutes',
    desc:'Complete a single session lasting at least 20 minutes.',
    xp:40, category:'endurance' },

  { id:'long_session_30m', icon:'🌊', name:'Half Hour Session',
    desc:'Complete a single session lasting at least 30 minutes.',
    xp:60, category:'endurance', secret:true },

  // ╔═══════════════════════════════════════════╗
  // ║  FOCUS — attention quality                 ║
  // ╚═══════════════════════════════════════════╝
  { id:'attention_first',  icon:'👁', name:'Present',
    desc:'Complete a session with fewer than 3 attention drifts.',
    xp:20, category:'focus' },

  { id:'attention_80',     icon:'🎯', name:'Sharp Focus',
    desc:'Complete a session with 80%+ focused time.',
    xp:30, category:'focus' },

  { id:'attention_90',     icon:'🧘', name:'Deep Presence',
    desc:'Complete a session with 90%+ focused time.',
    xp:55, category:'focus' },

  { id:'perfect_attention', icon:'✨', name:'Full Presence',
    desc:'Complete a session of 5+ minutes with zero attention losses.',
    xp:60, category:'focus' },

  { id:'perfect_3x',       icon:'🌙', name:'Consistent Mind',
    desc:'Earn 3 zero-attention-loss sessions.',
    xp:90, category:'focus' },

  { id:'perfect_5x',       icon:'🔮', name:'Unshakeable',
    desc:'Earn 5 zero-attention-loss sessions.',
    xp:150, category:'focus', secret:true },

  { id:'focus_streak_3',   icon:'⚡', name:'Focus Streak',
    desc:'Maintain 80%+ attention across 3 sessions in a row.',
    xp:80, category:'focus' },

  { id:'no_drift_week',    icon:'🌟', name:'Driftless',
    desc:'Complete 5 sessions with fewer than 2 drifts each.',
    xp:100, category:'focus', secret:true },

  // ╔══════════════════════════════════════════════╗
  // ║  CRAFT — feature exploration                 ║
  // ╚══════════════════════════════════════════════╝
  { id:'use_tts',          icon:'🎙', name:'Spoken Word',
    desc:'Complete a session using TTS voice blocks.',
    xp:15, category:'craft' },

  { id:'use_viz',          icon:'🌀', name:'Visual Depth',
    desc:'Complete a session with a visualization block.',
    xp:15, category:'craft' },

  { id:'use_funscript',    icon:'🕹', name:'Haptic Aware',
    desc:'Complete a session with an active haptic feedback track.',
    xp:20, category:'craft' },

  { id:'use_audio',        icon:'🎵', name:'Soundscape',
    desc:'Complete a session with a background audio track.',
    xp:15, category:'craft' },

  { id:'use_scenes',       icon:'🎬', name:'Scene Setter',
    desc:'Complete a session that has at least one scene.',
    xp:20, category:'craft' },

  { id:'use_rules',        icon:'⚙', name:'Rule One',
    desc:'Complete a session with at least one active behavioral rule.',
    xp:20, category:'craft' },

  { id:'use_variables',    icon:'📊', name:'Dynamic Voice',
    desc:'Complete a session using {{variables}} in block content.',
    xp:30, category:'craft' },

  { id:'use_ramp',         icon:'📈', name:'Ramped Up',
    desc:'Complete a session with the intensity ramp enabled.',
    xp:20, category:'craft' },

  { id:'use_pacing',       icon:'🎛', name:'Paced',
    desc:'Complete a session with dynamic speed pacing enabled.',
    xp:20, category:'craft' },

  { id:'modes_2',          icon:'🗺', name:'Mode Curious',
    desc:'Try 2 different session modes.',
    xp:20, category:'craft' },

  { id:'modes_4',          icon:'🧭', name:'Mode Sampler',
    desc:'Try 4 different session modes.',
    xp:45, category:'craft' },

  { id:'all_modes',        icon:'🎛', name:'Mode Explorer',
    desc:'Try all 8 session modes.',
    xp:110, category:'craft' },

  { id:'packs_3',          icon:'📚', name:'Pack Curious',
    desc:'Load 3 different content packs.',
    xp:35, category:'craft' },

  { id:'all_packs',        icon:'📦', name:'Pack Explorer',
    desc:'Load all 6 content packs at least once.',
    xp:80, category:'craft' },

  { id:'all_features',     icon:'🌐', name:'Full Sensory',
    desc:'Complete a session with haptic, visualization, and rules all active.',
    xp:70, category:'craft' },

  { id:'scene_arc',        icon:'🎭', name:'Arc Director',
    desc:'Complete a session using all 4 scene types (Calm, Build, Peak, Recovery).',
    xp:80, category:'craft', secret:true },

  { id:'builder',          icon:'🏗', name:'Master Builder',
    desc:'Complete a session with 8 or more content blocks.',
    xp:40, category:'craft', secret:true },

  // ╔══════════════════════════════════════════════╗
  // ║  QUESTS — earned by completing daily quests  ║
  // ╚══════════════════════════════════════════════╝
  // Note: first_quest is in Starter. These are cumulative milestones.
  { id:'quests_5',         icon:'📋', name:'Quest Regular',
    desc:'Complete 5 daily quests in total.',
    xp:25, category:'quests' },

  { id:'quests_10',        icon:'📋', name:'Quest Veteran',
    desc:'Complete 10 daily quests in total.',
    xp:45, category:'quests' },

  { id:'quests_25',        icon:'🗒', name:'Quest Dedicated',
    desc:'Complete 25 daily quests in total.',
    xp:90, category:'quests' },

  { id:'quests_50',        icon:'📜', name:'Quest Champion',
    desc:'Complete 50 daily quests in total.',
    xp:180, category:'quests', secret:true },

  { id:'quests_100',       icon:'🏆', name:'Quest Legend',
    desc:'Complete 100 daily quests in total.',
    xp:350, category:'quests', secret:true },

  { id:'perfect_quest_day', icon:'⭐', name:'Perfect Day',
    desc:'Complete all 3 daily quests in a single session day.',
    xp:50, category:'quests' },

  { id:'quest_types_all',  icon:'🌈', name:'Quest Connoisseur',
    desc:'Complete at least one quest of every type.',
    xp:70, category:'quests', secret:true },

  // ╔══════════════════════════════════════════════╗
  // ║  LEVELS — earned by reaching XP milestones   ║
  // ╚══════════════════════════════════════════════╝
  { id:'level_3',          icon:'✦', name:'Level 3',
    desc:'Reach Level 3: Attuned.',
    xp:15, category:'levels' },

  { id:'level_5',          icon:'✦✦', name:'Level 5',
    desc:'Reach Level 5: Steady.',
    xp:25, category:'levels' },

  { id:'level_7',          icon:'✦✦✦', name:'Level 7',
    desc:'Reach Level 7: Controlled.',
    xp:40, category:'levels' },

  { id:'level_10',         icon:'🌟', name:'Level 10',
    desc:'Reach Level 10: Practiced.',
    xp:60, category:'levels', secret:true },

  { id:'level_15',         icon:'💫', name:'Level 15',
    desc:'Reach Level 15: Dedicated.',
    xp:100, category:'levels', secret:true },

  { id:'level_20',         icon:'💎', name:'Apex',
    desc:'Reach Level 20: Apex. The highest level.',
    xp:250, category:'levels', secret:true },

  // ╔══════════════════════════════════════════════╗
  // ║  HIDDEN — special / surprise                 ║
  // ╚══════════════════════════════════════════════╝
  // ── App Opens ─────────────────────────────────────────────────────────────
  { id:'open_10',          icon:'📱', name:'Regular Visitor',
    desc:'Open the app 10 times.',
    xp:15, category:'consistency' },
  { id:'open_50',          icon:'🏠', name:'This Is Home Now',
    desc:'Open the app 50 times.',
    xp:35, category:'consistency' },
  { id:'open_100',         icon:'🔑', name:'Permanent Resident',
    desc:'Open the app 100 times.',
    xp:70, category:'consistency', secret:true },

  // ── Daily Quest Milestones ─────────────────────────────────────────────────
  { id:'perfect_quest_3days',     icon:'📆', name:'Three Perfect Days',
    desc:'Complete all 3 daily quests on 3 different days.',
    xp:40, category:'quests' },
  { id:'perfect_quest_7days',     icon:'🗓', name:'Week of Excellence',
    desc:'Complete all 3 daily quests on 7 different days.',
    xp:90, category:'quests' },
  { id:'perfect_quest_30days',    icon:'🌕', name:'Dedicated Practitioner',
    desc:'Complete all 3 daily quests on 30 different days.',
    xp:250, category:'quests', secret:true },
  { id:'perfect_quest_streak_3',  icon:'🔥', name:'Quest Streak',
    desc:'Complete all 3 daily quests 3 days in a row.',
    xp:60, category:'quests' },
  { id:'perfect_quest_streak_7',  icon:'⚡', name:'Seven Day Legend',
    desc:'Complete all 3 daily quests 7 days in a row.',
    xp:160, category:'quests', secret:true },
  { id:'quests_150',       icon:'📜', name:'Quest Master',
    desc:'Complete 150 daily quests in total.',
    xp:300, category:'quests', secret:true },
  { id:'quests_200',       icon:'🏆', name:'Quest Grandmaster',
    desc:'Complete 200 daily quests in total.',
    xp:500, category:'quests', secret:true },

  // ── Weekly Engagement ──────────────────────────────────────────────────────
  { id:'week_3_sessions',  icon:'📅', name:'Active Week',
    desc:'Complete sessions on 3 or more different days in a single week.',
    xp:30, category:'consistency' },
  { id:'week_5_sessions',  icon:'🗓', name:'Full Week',
    desc:'Complete sessions on 5 or more different days in a single week.',
    xp:65, category:'consistency' },
  { id:'triple_session',   icon:'⚡⚡⚡', name:'Triple Down',
    desc:'Complete 3 sessions in a single day.',
    xp:55, category:'consistency', secret:true },
  { id:'multi_day_5',      icon:'📈', name:'Repeat Customer',
    desc:'Complete 2 or more sessions on 5 different days.',
    xp:50, category:'consistency', secret:true },

  // ── In-Session Feature Repetition ─────────────────────────────────────────
  { id:'haptic_5x',        icon:'🕹', name:'Device Regular',
    desc:'Complete 5 sessions with an active haptic track.',
    xp:25, category:'craft' },
  { id:'haptic_20x',       icon:'🎛', name:'Device Devotee',
    desc:'Complete 20 sessions with an active haptic track.',
    xp:65, category:'craft', secret:true },
  { id:'viz_5x',           icon:'🌀', name:'Visual Habitué',
    desc:'Complete 5 sessions with a visualization block.',
    xp:20, category:'craft' },
  { id:'viz_20x',          icon:'🔮', name:'Visual Adept',
    desc:'Complete 20 sessions with a visualization block.',
    xp:55, category:'craft', secret:true },
  { id:'rules_10x',        icon:'⚙', name:'Rules Practitioner',
    desc:'Complete 10 sessions with at least one active rule.',
    xp:35, category:'craft' },
  { id:'full_sensory_5x',  icon:'💥', name:'Total Immersion',
    desc:'Complete 5 sessions using both haptic and visualization.',
    xp:50, category:'craft', secret:true },

  // ── Endurance Extras ───────────────────────────────────────────────────────
  { id:'runtime_20h',      icon:'⏳', name:'Twenty Hours',
    desc:'Accumulate 20 hours of total session time.',
    xp:100, category:'endurance' },
  { id:'runtime_50h',      icon:'🏔', name:'Fifty Hours',
    desc:'Accumulate 50 hours of total session time.',
    xp:250, category:'endurance', secret:true },
  { id:'long_session_45m', icon:'🌊', name:'Forty-Five Minutes',
    desc:'Complete a single session lasting at least 45 minutes.',
    xp:25, category:'endurance' },
  { id:'long_session_60m', icon:'💫', name:'The Full Hour',
    desc:'Complete a single session lasting at least 60 minutes.',
    xp:50, category:'endurance', secret:true },

  { id:'safe_stop',        icon:'🛑', name:'Safety First',
    desc:'Use the emergency stop. The right call, always.',
    xp:10, category:'craft' },

  { id:'full_surrender',   icon:'🎗', name:'Full Surrender',
    desc:'Complete a session in Surrender mode.',
    xp:60, category:'craft', secret:true },

  { id:'peak_intensity',   icon:'🔥', name:'Peak State',
    desc:'Complete a session that includes a Peak scene.',
    xp:40, category:'craft', secret:true },

  // ── Wellness ────────────────────────────────────────────────────────────────
  { id:'breathwork_first', icon:'💨', name:'First Breath',
    desc:'Complete a session containing a breathing block.',
    xp:20, category:'wellness' },
  { id:'breathwork_10',    icon:'🫁', name:'Breath Keeper',
    desc:'Complete 10 sessions with breathing exercises.',
    xp:50, category:'wellness' },
  { id:'entrainment_first',icon:'〰', name:'Frequency Explorer',
    desc:'Use a binaural entrainment block for the first time.',
    xp:25, category:'wellness' },
  { id:'asmr_5',           icon:'🕯', name:'Deep Calm',
    desc:'Complete 5 sessions in ASMR / Deep Relaxation mode.',
    xp:40, category:'wellness' },
  { id:'morning_5',        icon:'🌅', name:'Early Riser',
    desc:'Complete 5 sessions before 9 AM.',
    xp:35, category:'wellness' },

  // ── Creativity ──────────────────────────────────────────────────────────────
  { id:'all_viz_types',    icon:'🎨', name:'Visual Artist',
    desc:'Use all 12 visualization block types at least once.',
    xp:80, category:'creativity' },
  { id:'block_variety',    icon:'🧩', name:'Block Explorer',
    desc:'Create a session using at least 6 different block types.',
    xp:50, category:'creativity' },
  { id:'custom_rules_5',   icon:'⚙', name:'Rule Architect',
    desc:'Create a session with 5 or more active rules.',
    xp:40, category:'creativity' },
  { id:'markdown_export',  icon:'📝', name:'Session Author',
    desc:'Export a session as a Markdown script.',
    xp:20, category:'creativity' },
  { id:'content_pack_use', icon:'📦', name:'Pack Curator',
    desc:'Load a content pack into your session.',
    xp:25, category:'creativity' },

  // ── Endurance ───────────────────────────────────────────────────────────────
  { id:'30min_single',     icon:'⏱', name:'Half Hour Hold',
    desc:'Complete a single session of 30+ minutes.',
    xp:40, category:'endurance' },
  { id:'60min_single',     icon:'⌛', name:'The Full Hour',
    desc:'Complete a single session of 60+ minutes.',
    xp:80, category:'endurance' },
  { id:'total_5h',         icon:'📊', name:'Five Hours',
    desc:'Accumulate 5 hours total practice time.',
    xp:60, category:'endurance' },
  { id:'total_20h',        icon:'🏅', name:'Twenty Hours',
    desc:'Accumulate 20 hours total practice time.',
    xp:100, category:'endurance' },
  { id:'loop_5',           icon:'🔄', name:'Loop Enthusiast',
    desc:'Complete a session that loops 5 or more times.',
    xp:45, category:'endurance' },

  // ── Mastery ─────────────────────────────────────────────────────────────────
  { id:'pleasure_10',      icon:'🎯', name:'Conditioning Master',
    desc:'Complete 10 sessions in Pleasure Training mode.',
    xp:70, category:'mastery' },
  { id:'perfect_focus_3',  icon:'💎', name:'Diamond Focus',
    desc:'Complete 3 sessions with perfect attention (zero losses).',
    xp:75, category:'mastery' },
  { id:'all_modes',        icon:'🌈', name:'Mode Traveller',
    desc:'Complete at least one session in every session mode.',
    xp:100, category:'mastery' },
  { id:'ai_authored',      icon:'🤖', name:'AI Collaborator',
    desc:'Complete a session generated by AI authoring.',
    xp:30, category:'mastery' },

  // ── New Features ─────────────────────────────────────────────────────────
  { id:'first_breathing',  icon:'💨', name:'First Breath',
    desc:'Complete a session with a breathing exercise block.',
    xp:25, category:'wellness',
    check: (p,s,sess) => sess?.blocks?.some(b => b.type==='breathing') },

  { id:'first_entrainment',icon:'〰', name:'First Frequency',
    desc:'Complete a session with a binaural or isochronal entrainment block.',
    xp:25, category:'wellness',
    check: (p,s,sess) => sess?.blocks?.some(b => b.type==='entrainment') },

  { id:'breath_10',        icon:'🫁', name:'Breath Devotee',
    desc:'Complete 10 sessions that include a breathing block.',
    xp:60, category:'wellness',
    check: (p) => (p.breathingSessions ?? 0) >= 10 },

  { id:'entrainment_10',   icon:'🧠', name:'Frequency Devotee',
    desc:'Complete 10 sessions using entrainment blocks.',
    xp:60, category:'wellness',
    check: (p) => (p.entrainmentSessions ?? 0) >= 10 },

  { id:'theta_master',     icon:'🌀', name:'Theta State',
    desc:'Complete 5 sessions using theta-range (4–8 Hz) entrainment.',
    xp:50, category:'wellness',
    check: (p) => (p.thetaSessions ?? 0) >= 5 },

  { id:'delta_explorer',   icon:'💤', name:'Delta Diver',
    desc:'Complete a session using delta-range (0.5–4 Hz) entrainment.',
    xp:35, category:'wellness',
    check: (p,s,sess) => sess?.blocks?.some(b => b.type==='entrainment' && (b.entBeatHz??0) <= 4) },

  { id:'gamma_explorer',   icon:'⚡', name:'Gamma Burst',
    desc:'Complete a session using gamma-range (30–40 Hz) entrainment.',
    xp:35, category:'wellness',
    check: (p,s,sess) => sess?.blocks?.some(b => b.type==='entrainment' && (b.entBeatHz??0) >= 30) },

  { id:'first_audiodriven',icon:'🎵', name:'Waveform Rider',
    desc:'Complete a session using an audio-generated FunScript track.',
    xp:40, category:'creativity',
    check: (p,s,sess) => sess?.funscriptTracks?.some(t => t._generated) },

  { id:'audiodriven_5',    icon:'🎶', name:'Audio Choreographer',
    desc:'Complete 5 sessions with audio-generated FunScript tracks.',
    xp:70, category:'creativity',
    check: (p) => (p.audioDrivenSessions ?? 0) >= 5 },

  { id:'first_zip_export', icon:'📦', name:'Archivist',
    desc:'Export a session as a .zip archive.',
    xp:20, category:'mastery',
    check: (p) => !!(p.hasZipExported) },

  { id:'content_pack_5',   icon:'🗂', name:'Pack Collector',
    desc:'Load 5 different content packs.',
    xp:40, category:'mastery',
    check: (p) => (p.packsLoaded?.length ?? 0) >= 5 },

  { id:'content_pack_20',  icon:'📚', name:'Pack Completionist',
    desc:'Load 20 different content packs.',
    xp:80, category:'mastery',
    check: (p) => (p.packsLoaded?.length ?? 0) >= 20 },

  { id:'multiaxis_first',  icon:'🔄', name:'Multi-Axis Explorer',
    desc:'Complete a session with two or more FunScript axes active.',
    xp:45, category:'creativity',
    check: (p,s,sess) => new Set((sess?.funscriptTracks??[]).filter(t=>!t._disabled).map(t=>t.axis??'stroke')).size >= 2 },

  { id:'drag_reorder',     icon:'↕', name:'Choreographer',
    desc:'Reorder blocks in the sidebar by dragging.',
    xp:10, category:'mastery',
    check: (p) => !!(p.hasDragReordered) },

  // ── Pro Tier (hidden until unlocked) ─────────────────────────────────────
  { id:'pro_tier',         icon:'👑', name:'Pro Practitioner',
    desc:'Achieve Pro tier status (12+ sessions of 10+ min in 30 days).',
    xp:150, category:'mastery', hidden:true,
    check: (p) => getUserTier(p) === 'pro' },

  { id:'omnisensory',      icon:'✨', name:'Omnisensory',
    desc:'Complete a session using haptic, visualization, breathing, and entrainment simultaneously.',
    xp:100, category:'mastery', hidden:true,
    check: (p,s,sess) => s?.completionState==='completed' &&
      (sess?.funscriptTracks?.some(t=>!t._disabled)??false) &&
      (sess?.blocks?.some(b=>b.type==='viz')??false) &&
      (sess?.blocks?.some(b=>b.type==='breathing')??false) &&
      (sess?.blocks?.some(b=>b.type==='entrainment')??false) },

  { id:'sleep_architect',  icon:'🌙', name:'Sleep Architect',
    desc:'Complete 3 sessions using delta (≤2 Hz) entrainment.',
    xp:80, category:'wellness', hidden:true,
    check: (p) => (p.deltaSessions ?? 0) >= 3 },

  { id:'frequency_pilgrim',icon:'🔮', name:'Frequency Pilgrim',
    desc:'Use every brainwave band (delta, theta, alpha, beta, gamma) at least once.',
    xp:120, category:'wellness', hidden:true,
    check: (p) => (p.deltaUsed && p.thetaUsed && p.alphaUsed && p.betaUsed && p.gammaUsed) },

  { id:'audio_architect',  icon:'🎼', name:'Audio Architect',
    desc:'Generate FunScripts from 3 different audio files.',
    xp:90, category:'creativity', hidden:true,
    check: (p) => (p.audioDrivenSessions ?? 0) >= 3 },

  { id:'pack_master',      icon:'🏆', name:'Pack Master',
    desc:'Complete a session from every content pack category.',
    xp:150, category:'mastery', hidden:true,
    check: (p) => {
      const cats = new Set(['Induction & Trance','Behavioral Conditioning','Partner Sessions',
        'Solo Sessions','Mindfulness','Visualization','FunScript Patterns','Audio Generators']);
      const loaded = new Set(p.packCategoriesCompleted ?? []);
      return [...cats].every(c => loaded.has(c));
    }},

  { id:'century',          icon:'💯', name:'Centurion',
    desc:'Complete 100 sessions total.',
    xp:200, category:'endgame', hidden:true,
    check: (p) => (p.totalSessions ?? 0) >= 100 },

  { id:'silent_master',    icon:'🤫', name:'Silent Master',
    desc:'Complete 20 sessions with zero TTS blocks (silence-only practice).',
    xp:100, category:'endgame', hidden:true,
    check: (p) => (p.silentSessions ?? 0) >= 20 },

  { id:'month_dedication', icon:'📆', name:'Month of Dedication',
    desc:'Complete at least one session every day for 30 consecutive days.',
    xp:300, category:'endgame', hidden:true,
    check: (p) => (p.streak ?? 0) >= 30 },

  { id:'breath_entrainment_sync', icon:'🌊', name:'Resonance',
    desc:'Complete 5 sessions pairing breathing blocks with matching-frequency entrainment.',
    xp:120, category:'wellness', hidden:true,
    check: (p) => (p.breathEntrainmentSyncSessions ?? 0) >= 5 },

  { id:'full_stack_pro',   icon:'🔬', name:'Full Stack Pro',
    desc:'Complete a session using every available block type.',
    xp:200, category:'endgame', hidden:true,
    check: (p,s,sess) => {
      const ALL = new Set(['text','tts','audio','video','pause','viz','macro','breathing','entrainment']);
      const used = new Set((sess?.blocks??[]).map(b=>b.type));
      return [...ALL].every(t => used.has(t));
    }},
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

// ════════════════════════════════════════════════════════════════════════════
// USER TIER — derived from session history (rolling 30-day window)
// ════════════════════════════════════════════════════════════════════════════
//
//  Beginner  < 4 sessions ≥6 min in last 30 days
//  Moderate  ≥ 4 and < 10 sessions ≥6 min in last 30 days
//  Advanced  ≥ 10 and < 12 sessions ≥10 min in last 30 days
//  Pro       ≥ 12 sessions ≥10 min in last 30 days
//            (fewest visible achievements, most hidden ones)
//
// Tier only affects QUEST SELECTION and ACHIEVEMENT VISIBILITY — it never
// removes already-earned achievements from the profile.
// ════════════════════════════════════════════════════════════════════════════

export const USER_TIERS = /** @type {const} */(['beginner','moderate','advanced','pro']);

/**
 * Derive the user's current tier from their stored session history.
 * @param {Object} profile - the user profile object
 * @returns {'beginner'|'moderate'|'advanced'|'pro'}
 */
export function getUserTier(profile) {
  const history = profile?.sessionHistory ?? [];   // [{durationSec, date}]
  const now     = Date.now();
  const days30  = 30 * 24 * 60 * 60 * 1000;

  // Count sessions in the last 30 days that meet the duration threshold
  const recent = history.filter(h => (now - new Date(h.date).getTime()) <= days30);
  const sess6  = recent.filter(h => (h.durationSec ?? 0) >= 360).length;  // ≥6 min
  const sess10 = recent.filter(h => (h.durationSec ?? 0) >= 600).length;  // ≥10 min

  if (sess10 >= 12) return 'pro';
  if (sess10 >= 10 || sess6 >= 10) return 'advanced';   // 10 sessions ≥10 min OR 10+ ≥6 min
  if (sess6  >=  4) return 'moderate';
  return 'beginner';
}

// ── Daily quest pool ─────────────────────────────────────────────────────────
// Each quest has an optional `minTier` (defaults to 'beginner') indicating
// the minimum user tier at which it appears in the daily rotation.
// Tier order: beginner < moderate < advanced < pro
// ─────────────────────────────────────────────────────────────────────────────
const _TIER_RANK = { beginner:0, moderate:1, advanced:2, pro:3 };
function _tierOk(quest, tier) {
  return _TIER_RANK[tier] >= _TIER_RANK[quest.minTier ?? 'beginner'];
}

export const QUEST_POOL = [

  // ── Universal (all tiers) ────────────────────────────────────────────────
  { id:'q_complete_any', icon:'✅', name:'Session Complete',
    desc:'Complete any session today.',
    xp:20, minTier:'beginner',
    condition:(s) => s.completionState === 'completed' },

  { id:'q_5min', icon:'⏱', name:'Five Minutes',
    desc:'Complete a session of at least 5 minutes.',
    xp:15, minTier:'beginner',
    condition:(s) => s.completionState === 'completed' && s.totalSec >= 300 },

  { id:'q_use_tts', icon:'🎙', name:'Spoken Word',
    desc:'Complete a session with TTS voice blocks.',
    xp:20, minTier:'beginner',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'tts') ?? false) },

  { id:'q_use_viz', icon:'🌀', name:'Visual Journey',
    desc:'Complete a session with a visualization block.',
    xp:25, minTier:'beginner',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'viz') ?? false) },

  { id:'q_use_breathing', icon:'💨', name:'Breathwork',
    desc:'Complete a session containing a breathing exercise block.',
    xp:25, minTier:'beginner',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'breathing') ?? false) },

  { id:'q_use_entrainment', icon:'〰', name:'Frequency Tuning',
    desc:'Complete a session with a binaural or isochronal entrainment block.',
    xp:30, minTier:'beginner',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'entrainment') ?? false) },

  { id:'q_content_pack', icon:'📦', name:'Pack Opener',
    desc:'Load and complete a content pack session.',
    xp:25, minTier:'beginner',
    condition:(s, sess) => s.completionState === 'completed' &&
      !!(sess?.name && sess.name !== 'New Session') },

  { id:'q_morning', icon:'🌅', name:'Morning Practice',
    desc:'Complete a session before 9 AM local time.',
    xp:25, minTier:'beginner',
    condition:(s) => s.completionState === 'completed' && new Date().getHours() < 9 },

  { id:'q_night_owl', icon:'🦉', name:'Night Owl',
    desc:'Complete a session after 10 PM.',
    xp:20, minTier:'beginner',
    condition:(s) => s.completionState === 'completed' && new Date().getHours() >= 22 },

  { id:'q_5_blocks', icon:'🧩', name:'Block Builder',
    desc:'Complete a session that contains 5 or more blocks.',
    xp:25, minTier:'beginner',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.length ?? 0) >= 5 },

  { id:'q_use_scenes', icon:'🎬', name:'Scene Session',
    desc:'Complete a session with at least 2 scenes.',
    xp:28, minTier:'beginner',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.scenes?.length ?? 0) >= 2 },

  { id:'q_comeback', icon:'🌈', name:'Long Time No See',
    desc:'Complete a session after a break of 14+ days.',
    xp:35, minTier:'beginner',
    condition:(s, _sess, profile) => {
      if (s.completionState !== 'completed') return false;
      const last = profile?.lastSessionAt;
      if (!last) return false;
      return (Date.now() - new Date(last).getTime()) / 86_400_000 >= 14;
    }},

  // ── Moderate+ ────────────────────────────────────────────────────────────
  { id:'q_10min', icon:'⏰', name:'Ten Minutes',
    desc:'Complete a session of at least 10 minutes.',
    xp:30, minTier:'moderate',
    condition:(s) => s.completionState === 'completed' && s.totalSec >= 600 },

  { id:'q_use_haptic', icon:'🕹', name:'Haptic Session',
    desc:'Complete a session with an active FunScript haptic track.',
    xp:30, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.funscriptTracks?.some(t => !t._disabled) ?? false) },

  { id:'q_use_rules', icon:'⚙', name:'Rule-Driven',
    desc:'Complete a session with at least one active rule.',
    xp:28, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.rules?.filter(r => r.enabled).length ?? 0) >= 1 },

  { id:'q_use_ramp', icon:'📈', name:'Ramped Up',
    desc:'Complete a session with the intensity ramp enabled.',
    xp:28, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      sess?.rampSettings?.enabled === true },

  { id:'q_loop_twice', icon:'🔄', name:'Second Wind',
    desc:'Complete a session that loops at least twice.',
    xp:30, minTier:'moderate',
    condition:(s) => s.completionState === 'completed' && (s.loopsCompleted ?? s.loopIndex ?? 0) >= 2 },

  { id:'q_high_focus', icon:'🎯', name:'Sharp Focus',
    desc:'Complete a session with fewer than 2 attention drifts.',
    xp:30, minTier:'moderate',
    condition:(s) => s.completionState === 'completed' && (s.attentionLossEvents ?? 99) < 2 },

  { id:'q_asmr_mode', icon:'🕯', name:'Deep Calm',
    desc:'Complete a session using the ASMR / Deep Relaxation mode.',
    xp:30, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' && sess?.mode === 'asmr' },

  { id:'q_pleasure_mode', icon:'🎯', name:'Pleasure Training',
    desc:'Complete a session using Pleasure Training mode.',
    xp:35, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' && sess?.mode === 'pleasure_training' },

  { id:'q_two_sessions', icon:'⚡', name:'Two Today',
    desc:'Complete 2 sessions today.',
    xp:40, minTier:'moderate',
    condition:(s, _sess, profile) => s.completionState === 'completed' &&
      profile?.todayDate === _today() && (profile?.sessionsToday ?? 0) >= 2 },

  { id:'q_scenes_3', icon:'🎭', name:'Three-Act',
    desc:'Complete a session with at least 3 distinct scenes.',
    xp:32, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.scenes?.length ?? 0) >= 3 },

  { id:'q_haptic_and_viz', icon:'💥', name:'Full Sensory',
    desc:'Use both haptic and visualization blocks in one session.',
    xp:40, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.funscriptTracks?.some(t => !t._disabled) ?? false) &&
      (sess?.blocks?.some(b => b.type === 'viz') ?? false) },

  { id:'q_breath_and_tone', icon:'🎵', name:'Mind & Body',
    desc:'Use both a breathing block and an entrainment block in one session.',
    xp:40, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'breathing') ?? false) &&
      (sess?.blocks?.some(b => b.type === 'entrainment') ?? false) },

  { id:'q_use_variables', icon:'📊', name:'Dynamic Content',
    desc:'Complete a session that uses template variables in block content.',
    xp:25, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => /\{\{[^}]+\}\}/.test(b.content ?? '')) ?? false) },

  { id:'q_multi_axis', icon:'🔄', name:'Multi-Axis',
    desc:'Complete a session with two or more FunScript axes active.',
    xp:40, minTier:'moderate',
    condition:(s, sess) => s.completionState === 'completed' &&
      new Set((sess?.funscriptTracks ?? []).filter(t => !t._disabled).map(t => t.axis ?? 'stroke')).size >= 2 },

  // ── Advanced+ ─────────────────────────────────────────────────────────────
  { id:'q_15min', icon:'⏰', name:'Fifteen Minutes',
    desc:'Complete a session of at least 15 minutes.',
    xp:35, minTier:'advanced',
    condition:(s) => s.completionState === 'completed' && s.totalSec >= 900 },

  { id:'q_no_loss', icon:'👁', name:'Unbroken Focus',
    desc:'Complete a session with zero attention losses.',
    xp:40, minTier:'advanced',
    condition:(s) => s.completionState === 'completed' && (s.attentionLossEvents ?? 99) === 0 },

  { id:'q_two_rules', icon:'⚙⚙', name:'Rule Pair',
    desc:'Complete a session with 2 or more active rules.',
    xp:32, minTier:'advanced',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.rules?.filter(r => r.enabled).length ?? 0) >= 2 },

  { id:'q_pacing', icon:'🎛', name:'Paced Session',
    desc:'Complete a session with dynamic speed pacing enabled.',
    xp:30, minTier:'advanced',
    condition:(s, sess) => s.completionState === 'completed' && sess?.pacingSettings?.enabled === true },

  { id:'q_full_arc', icon:'🌈', name:'Full Arc',
    desc:'Run a session with calm, build, peak, and recovery scenes.',
    xp:55, minTier:'advanced',
    condition:(s, sess) => {
      if (s.completionState !== 'completed') return false;
      const types = new Set((sess?.scenes ?? []).map(sc => sc.stateType).filter(Boolean));
      return types.has('calm') && types.has('build') && types.has('peak') && types.has('recovery');
    }},

  { id:'q_all_three_features', icon:'🌐', name:'Trifecta',
    desc:'Use haptic, visualization, and at least one active rule in one session.',
    xp:55, minTier:'advanced',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.funscriptTracks?.some(t => !t._disabled) ?? false) &&
      (sess?.blocks?.some(b => b.type === 'viz') ?? false) &&
      (sess?.rules?.filter(r => r.enabled).length ?? 0) >= 1 },

  { id:'q_pacing_and_ramp', icon:'📉📈', name:'Full Automation',
    desc:'Enable both dynamic pacing and intensity ramp in one session.',
    xp:45, minTier:'advanced',
    condition:(s, sess) => s.completionState === 'completed' &&
      sess?.pacingSettings?.enabled === true && sess?.rampSettings?.enabled === true },

  { id:'q_loop_3', icon:'🔄', name:'Threepeat',
    desc:'Complete a session that loops at least 3 times.',
    xp:45, minTier:'advanced',
    condition:(s) => s.completionState === 'completed' && (s.loopsCompleted ?? s.loopIndex ?? 0) >= 3 },

  { id:'q_consistency', icon:'📅', name:'Consistent Practice',
    desc:'Maintain a streak of 2+ consecutive days.',
    xp:35, minTier:'advanced',
    condition:(s, _sess, profile) => s.completionState === 'completed' && (profile?.streak ?? 0) >= 2 },

  { id:'q_audio_generated', icon:'🎵', name:'Sound Driven',
    desc:'Use an audio-generated FunScript track in a session.',
    xp:45, minTier:'advanced',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.funscriptTracks?.some(t => t._generated) ?? false) },

  // ── Pro only ─────────────────────────────────────────────────────────────
  { id:'q_30min', icon:'🕐', name:'Half Hour',
    desc:'Complete a session of at least 30 minutes.',
    xp:60, minTier:'pro',
    condition:(s) => s.completionState === 'completed' && s.totalSec >= 1800 },

  { id:'q_deep_focus', icon:'🧘', name:'Deep Focus',
    desc:'Complete a session with 90%+ sustained attention.',
    xp:55, minTier:'pro',
    condition:(s) => s.completionState === 'completed' && s.totalSec > 0 &&
      (1 - (s.attentionLossTotalSec ?? 0) / s.totalSec) >= 0.9 },

  { id:'q_three_sessions', icon:'⚡⚡', name:'Triple Down',
    desc:'Complete 3 sessions in one day.',
    xp:80, minTier:'pro',
    condition:(s, _sess, profile) => s.completionState === 'completed' &&
      profile?.todayDate === _today() && (profile?.sessionsToday ?? 0) >= 3 },

  { id:'q_scene_peak', icon:'🔥', name:'Peak Scene',
    desc:'Complete a session containing a peak-state scene.',
    xp:35, minTier:'pro',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.scenes?.some(sc => sc.stateType === 'peak') ?? false) },

  { id:'q_use_subtitles', icon:'💬', name:'Subtitled',
    desc:'Complete a session with an active subtitle track.',
    xp:25, minTier:'pro',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.subtitleTracks?.some(t => !t._disabled) ?? false) },

  { id:'q_use_macros', icon:'🤖', name:'Macro Master',
    desc:'Use a macro block in a session.',
    xp:30, minTier:'pro',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'macro') ?? false) },

  { id:'q_schumann', icon:'🌍', name:'Earth Frequency',
    desc:'Complete a session using the Schumann Resonance (7.83 Hz) content pack.',
    xp:40, minTier:'pro',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'entrainment' && Math.abs((b.entBeatHz ?? 0) - 7.83) < 0.1) ?? false) },

  { id:'q_gamma_peak', icon:'⚡', name:'Gamma State',
    desc:'Complete a session with 40 Hz gamma entrainment active.',
    xp:45, minTier:'pro',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.blocks?.some(b => b.type === 'entrainment' && (b.entBeatHz ?? 0) >= 38) ?? false) },

  { id:'q_full_sensory_plus', icon:'✨', name:'Omnisensory',
    desc:'Use haptic, visualization, breathing, and entrainment all in one session.',
    xp:80, minTier:'pro',
    condition:(s, sess) => s.completionState === 'completed' &&
      (sess?.funscriptTracks?.some(t => !t._disabled) ?? false) &&
      (sess?.blocks?.some(b => b.type === 'viz') ?? false) &&
      (sess?.blocks?.some(b => b.type === 'breathing') ?? false) &&
      (sess?.blocks?.some(b => b.type === 'entrainment') ?? false) },

  { id:'q_week_streak', icon:'🔥', name:'Seven Days',
    desc:'Maintain a 7-day practice streak.',
    xp:100, minTier:'pro',
    condition:(s, _sess, profile) => s.completionState === 'completed' && (profile?.streak ?? 0) >= 7 },
];


/**
 * Return today's 3 daily quests, filtered to the user's current tier.
 * @param {string} [dateStr] - YYYY-MM-DD date key (defaults to today)
 * @param {Object|null} [profile] - user profile (for tier detection)
 */
export function getDailyQuests(dateStr = _today(), profile = null) {
  const tier = profile ? getUserTier(profile) : 'beginner';

  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) seed = (seed * 31 + dateStr.charCodeAt(i)) >>> 0;

  const base   = QUEST_POOL.find(q => q.id === 'q_complete_any');
  // Filter to quests at or below the user's tier
  const others = QUEST_POOL.filter(q => q.id !== 'q_complete_any' && _tierOk(q, tier));

  const picked = [];
  let pool = [...others];
  // Pro users get 4 quests; Advanced 3; everyone else 3
  const wantExtra = tier === 'pro' ? 3 : 2;
  for (let i = 0; i < wantExtra && pool.length; i++) {
    const idx = (seed >>> 0) % pool.length;
    picked.push(pool[idx]);
    pool = pool.filter((_, j) => j !== idx);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    seed = (seed ^ (seed >>> 13)) >>> 0;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  }

  return [base, ...picked].filter(Boolean);
}

function _today() {
  // Use local calendar date (matching _todayStr() in user-profile.js) so that
  // quest resets and streak resets both occur at local midnight, not UTC midnight.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Check all achievements ────────────────────────────────────────────────────
export function checkAndAwardAchievements(profile, summary, session) {
  const earned      = new Set(profile.achievements ?? []);
  const newlyEarned = [];

  function check(id, condition) {
    if (!earned.has(id) && condition) { earned.add(id); newlyEarned.push(id); }
  }

  const completed  = summary.completionState === 'completed';
  const totalSec   = profile.totalRuntimeSec ?? 0;
  const count      = profile.sessionCount    ?? 0;
  const streak     = profile.streak          ?? 0;
  const sessSec    = summary.totalSec        ?? 0;
  const zeroLoss   = (summary.attentionLossEvents ?? 999) === 0;
  const fewLoss    = (summary.attentionLossEvents ?? 999) < 3;

  const focusPct = sessSec > 0 ? (1 - ((summary.attentionLossTotalSec ?? 0) / sessSec)) : 0;

  const hasFunscript = (session?.funscriptTracks ?? []).some(t => !t._disabled);
  const hasViz       = (session?.blocks ?? []).some(b => b.type === 'viz');
  const hasTts       = (session?.blocks ?? []).some(b => b.type === 'tts');
  const hasAudio     = (session?.blocks ?? []).some(b => b.type === 'audio');
  const sceneCount   = (session?.scenes ?? []).length;
  const ruleCount    = (session?.rules  ?? []).filter(r => r.enabled).length;
  const hasVars      = Object.keys(session?.variables ?? {}).length > 0;
  const hasRamp      = session?.rampSettings?.enabled === true;
  const hasPacing    = session?.pacingSettings?.enabled === true;
  const blockCount   = (session?.blocks ?? []).length;
  const modesUsed    = new Set(profile.modesUsed ?? []);

  // ── Starter ───────────────────────────────────────────────────────────────
  check('first_session', count >= 1);
  check('first_comeback', count >= 2);
  check('first_perfect', completed && zeroLoss && sessSec >= 300);
  check('first_feature', completed && (hasFunscript || hasViz || hasRamp || hasPacing || ruleCount >= 1 || sceneCount >= 1));
  // first_quest: checked in quest-completion block below
  // first_level_up: checked in level block below

  // ── Wellness / body metrics ───────────────────────────────────────────────
  check('body_metrics_set', !!(profile.heightCm && profile.weightKg));
  check('mindful_5h',   (profile.totalRuntimeSec ?? 0) >= 18_000);
  check('mindful_20h',  (profile.totalRuntimeSec ?? 0) >= 72_000);
  const highFocusPct = sessSec > 0 ? (1 - ((summary.attentionLossTotalSec ?? 0) / sessSec)) : 0;
  check('focus_master', completed && highFocusPct >= 0.9 && (profile.highAttentionSessions ?? 0) >= 10);
  check('early_riser_5', completed && new Date().getHours() < 12 &&
    ((profile.earlySessionCount ?? 0) >= 5));

  // ── Consistency ───────────────────────────────────────────────────────────
  check('streak_2', streak >= 2);
  check('streak_3', streak >= 3);
  check('streak_7', streak >= 7);

  // two_in_one_day — checked via profile.sessionsToday
  const today = _today();
  check('two_in_one_day', profile.todayDate === today && (profile.sessionsToday ?? 0) >= 2);

  // monthly_visitor — 3+ sessions in any month; tracked via profile.monthCounts
  const monthValues = Object.values(profile.monthCounts ?? {});
  check('monthly_visitor', monthValues.length > 0 && Math.max(...monthValues) >= 3);

  // three_months / six_months — distinct months with at least 1 session
  const distinctMonths = Object.keys(profile.monthCounts ?? {}).length;
  check('three_months', distinctMonths >= 3);
  check('six_months',   distinctMonths >= 6);

  // comeback_kid — played after 30+ day gap; lastSessionAt stored before update
  check('comeback_kid', (() => {
    const prev = profile.lastSessionAt;
    if (!prev) return false;
    return (Date.now() - new Date(prev).getTime()) / 86_400_000 >= 30;
  })());

  // ── Depth ─────────────────────────────────────────────────────────────────
  check('sessions_3',   count >= 3);
  check('sessions_5',   count >= 5);
  check('sessions_10',  count >= 10);
  check('sessions_20',  count >= 20);
  check('sessions_30',  count >= 30);
  check('sessions_50',  count >= 50);
  check('sessions_75',  count >= 75);
  check('sessions_100', count >= 100);

  // ── Endurance ─────────────────────────────────────────────────────────────
  check('runtime_30m',      totalSec >= 1_800);
  check('runtime_1h',       totalSec >= 3_600);
  check('runtime_2h',       totalSec >= 7_200);
  check('runtime_5h',       totalSec >= 18_000);
  check('runtime_10h',      totalSec >= 36_000);
  check('long_session_10m', completed && sessSec >= 600);
  check('long_session_20m', completed && sessSec >= 1_200);
  check('long_session_30m', completed && sessSec >= 1_800);

  // ── Focus ─────────────────────────────────────────────────────────────────
  check('attention_first',   completed && fewLoss && sessSec >= 60);
  check('attention_80',      completed && sessSec > 0 && focusPct >= 0.80);
  check('attention_90',      completed && sessSec > 0 && focusPct >= 0.90);
  check('perfect_attention', completed && zeroLoss && sessSec >= 300);
  check('perfect_3x',        (profile.perfectSessions ?? 0) >= 3);
  check('perfect_5x',        (profile.perfectSessions ?? 0) >= 5);
  check('focus_streak_3',    (profile.focusStreakCount ?? 0) >= 3);
  check('no_drift_week',     (profile.lowDriftSessions ?? 0) >= 5);

  // ── Craft ─────────────────────────────────────────────────────────────────
  check('use_tts',       completed && hasTts);
  check('use_viz',       completed && hasViz);
  check('use_funscript', completed && hasFunscript);
  check('use_audio',     completed && hasAudio);
  check('use_scenes',    completed && sceneCount >= 1);
  check('use_rules',     completed && ruleCount >= 1);
  check('use_variables', completed && hasVars);
  check('use_ramp',      completed && hasRamp);
  check('use_pacing',    completed && hasPacing);
  check('modes_2',   modesUsed.size >= 2);
  check('modes_4',   modesUsed.size >= 4);
  check('all_modes', modesUsed.size >= 8);
  // packs_3, all_packs: awarded from content-packs.js
  check('all_features',  completed && hasFunscript && hasViz && ruleCount >= 1);
  check('builder',       completed && blockCount >= 8);
  check('scene_arc',     completed && (() => {
    const types = new Set((session?.scenes ?? []).map(s => s.stateType).filter(Boolean));
    return types.has('calm') && types.has('build') && types.has('peak') && types.has('recovery');
  })());

  // ── Quests ────────────────────────────────────────────────────────────────
  const totalQ = profile.totalQuestsCompleted ?? 0;
  check('quests_5',          totalQ >= 5);
  check('quests_10',         totalQ >= 10);
  check('quests_25',         totalQ >= 25);
  check('quests_50',         totalQ >= 50);
  check('quests_100',        totalQ >= 100);
  check('quests_150',        totalQ >= 150);
  check('quests_200',        totalQ >= 200);
  check('perfect_quest_day', (profile.perfectQuestDays ?? 0) >= 1);
  // Perfect quest day count milestones
  const pqdList = (profile.perfectQuestDaysList ?? []).length;
  check('perfect_quest_3days',    pqdList >= 3);
  check('perfect_quest_7days',    pqdList >= 7);
  check('perfect_quest_30days',   pqdList >= 30);
  // Perfect quest consecutive streak
  const pqStreak = profile.perfectQuestStreak ?? 0;
  check('perfect_quest_streak_3', pqStreak >= 3);
  check('perfect_quest_streak_7', pqStreak >= 7);
  check('quest_types_all',   new Set(profile.questTypesCompleted ?? []).size >= QUEST_POOL.length);
  check('first_quest',       totalQ >= 1);

  // ── App Opens ─────────────────────────────────────────────────────────────
  const opens = profile.appOpens ?? 0;
  check('open_10',  opens >= 10);
  check('open_50',  opens >= 50);
  check('open_100', opens >= 100);

  // ── Engagement: In-session repetition ─────────────────────────────────────
  check('haptic_5x',       (profile.hapticSessions ?? 0) >= 5);
  check('haptic_20x',      (profile.hapticSessions ?? 0) >= 20);
  check('viz_5x',          (profile.vizSessions    ?? 0) >= 5);
  check('viz_20x',         (profile.vizSessions    ?? 0) >= 20);
  check('rules_10x',       (profile.rulesSessions  ?? 0) >= 10);
  check('full_sensory_5x', completed && hasFunscript && hasViz &&
    (profile.hapticSessions ?? 0) >= 5 && (profile.vizSessions ?? 0) >= 5);

  // ── Weekly Engagement ─────────────────────────────────────────────────────
  check('triple_session',  (profile.maxSessionsInDay ?? 0) >= 3);
  check('multi_day_5',     (profile.multiSessionDays ?? 0) >= 5);
  // week_3/5_sessions: streak already measures consecutive daily sessions
  // streak >= 3 = practiced at least 3 days running (active week)
  // streak >= 5 = practiced 5 days in a row (full working week)
  check('week_3_sessions', streak >= 3);
  check('week_5_sessions', streak >= 5);

  // ── Endurance Extras ──────────────────────────────────────────────────────
  check('runtime_20h',      totalSec >= 72_000);
  check('runtime_50h',      totalSec >= 180_000);
  check('long_session_45m', completed && sessSec >= 2_700);
  check('long_session_60m', completed && sessSec >= 3_600);

  // ── Levels ────────────────────────────────────────────────────────────────
  const currentLevel = levelFromXp(profile.xp ?? 0);
  check('first_level_up', currentLevel >= 2);
  check('level_3',  currentLevel >= 3);
  check('level_5',  currentLevel >= 5);
  check('level_7',  currentLevel >= 7);
  check('level_10', currentLevel >= 10);
  check('level_15', currentLevel >= 15);
  check('level_20', currentLevel >= 20);

  // ── Hidden ────────────────────────────────────────────────────────────────
  check('full_surrender', completed && session?.mode === 'surrender');
  check('peak_intensity', completed && (session?.scenes ?? []).some(s => s.stateType === 'peak'));

  // ── Generic check() function pattern — new achievements added post-v78 ────
  // Any achievement with a `check(profile, summary, session)` function is
  // evaluated here. This avoids having to modify the big if-chain above
  // every time a new achievement is added.
  for (const ach of ACHIEVEMENTS) {
    if (!ach.check) continue;
    if (earned.has(ach.id)) continue;
    try {
      if (ach.check(profile, summary, session)) {
        earned.add(ach.id);
        newlyEarned.push(ach.id);
      }
    } catch { /* ignore individual check errors */ }
  }

  return { newlyEarned, updatedEarned: [...earned] };
}

// ── XP per session ────────────────────────────────────────────────────────────

// ── Title System ─────────────────────────────────────────────────────────────
// Titles are earned through behavior and displayed on the profile card.
// The user can choose which earned title to display (or leave on 'auto' for best).
// No time-gates, no currency — earned by doing.
export const TITLES = [
  { id:'initiate',       name:'The Initiate',         desc:'Default title — begin your journey.',
    icon:'🌱', condition:(p) => (p.sessionCount ?? 0) >= 1 },
  { id:'regular',        name:'The Regular',           desc:'Complete 10 sessions.',
    icon:'🔑', condition:(p) => (p.sessionCount ?? 0) >= 10 },
  { id:'devoted',        name:'The Devoted',            desc:'Complete 30 sessions.',
    icon:'💪', condition:(p) => (p.sessionCount ?? 0) >= 30 },
  { id:'centurion',      name:'The Centurion',          desc:'Complete 100 sessions.',
    icon:'💎', condition:(p) => (p.sessionCount ?? 0) >= 100 },
  { id:'consistent',     name:'The Consistent',         desc:'Maintain a 7-day streak.',
    icon:'🔥', condition:(p) => (p.longestStreak ?? 0) >= 7 },
  { id:'relentless',     name:'The Relentless',          desc:'Maintain a 30-day streak.',
    icon:'⚡', condition:(p) => (p.longestStreak ?? 0) >= 30 },
  { id:'focused',        name:'The Focused',             desc:'Earn the Focus Streak achievement.',
    icon:'🎯', condition:(p) => (p.achievements ?? []).includes('focus_streak_3') },
  { id:'vigilant',       name:'The Vigilant',            desc:'Complete 5 sessions with perfect attention.',
    icon:'👁', condition:(p) => (p.perfectSessions ?? 0) >= 5 },
  { id:'immersed',       name:'The Immersed',            desc:'Complete 5 sessions with haptic and visualization together.',
    icon:'💥', condition:(p) => (p.achievements ?? []).includes('full_sensory_5x') },
  { id:'haptic_devotee', name:'Haptic Devotee',          desc:'Complete 20 sessions with an active haptic track.',
    icon:'🕹', condition:(p) => (p.hapticSessions ?? 0) >= 20 },
  { id:'architect',      name:'The Architect',           desc:'Complete a full 4-scene arc session.',
    icon:'🎭', condition:(p) => (p.achievements ?? []).includes('scene_arc') },
  { id:'quest_champion', name:'Quest Champion',          desc:'Complete 50 daily quests.',
    icon:'📜', condition:(p) => (p.totalQuestsCompleted ?? 0) >= 50 },
  { id:'quest_legend',   name:'Quest Legend',            desc:'Complete 200 daily quests.',
    icon:'🏆', condition:(p) => (p.totalQuestsCompleted ?? 0) >= 200 },
  { id:'perfect_week',   name:'The Unbending',           desc:'Complete all 3 daily quests 7 days in a row.',
    icon:'⭐', condition:(p) => (p.perfectQuestStreak ?? 0) >= 7 },
  { id:'endurance',      name:'The Enduring',            desc:'Accumulate 10 hours of session time.',
    icon:'⌛', condition:(p) => (p.achievements ?? []).includes('runtime_10h') },
  { id:'hour_keeper',    name:'The Hour Keeper',          desc:'Accumulate 20 hours of session time.',
    icon:'⏳', condition:(p) => (p.achievements ?? []).includes('runtime_20h') },
  { id:'night_owl',      name:'Night Owl',               desc:'Complete the Night Owl quest 5 times.',
    icon:'🦉', condition:(p) => (p.questTypesCompleted ?? []).filter(q => q === 'q_night_owl').length >= 1
                              && (p.achievements ?? []).includes('open_50') },
  { id:'apex',           name:'The Apex',                desc:'Reach Level 20.',
    icon:'💎', condition:(p) => (p.achievements ?? []).includes('level_20') },
  { id:'sovereign',      name:'The Sovereign',           desc:'Complete all non-secret Focus achievements.',
    icon:'👑', condition:(p) => {
      const e = new Set(p.achievements ?? []);
      return ['attention_first','attention_80','attention_90','perfect_attention','perfect_3x','perfect_5x','focus_streak_3','no_drift_week'].every(id => e.has(id));
    }},
];

// Award all currently-earned titles (called from processSessionEnd)
export function checkAndAwardTitles(profile) {
  const earned = new Set(profile.titlesEarned ?? []);
  let changed = false;
  for (const title of TITLES) {
    if (!earned.has(title.id) && title.condition(profile)) {
      earned.add(title.id);
      changed = true;
    }
  }
  if (changed) profile.titlesEarned = [...earned];
  // Auto-pick best title if none selected or selected no longer valid
  if (!profile.activeTitle || !earned.has(profile.activeTitle)) {
    // Pick highest-index earned title (later = more prestigious)
    const best = TITLES.filter(t => earned.has(t.id)).at(-1);
    profile.activeTitle = best?.id ?? null;
  }
}

export function calculateSessionXp(summary, session, profile) {
  if (!summary || summary.completionState === 'emergency') return 0;
  let xp = summary.completionState === 'completed' ? 20 : 8;

  // Time (1 XP/min, cap at 20 for a 20-min session)
  xp += Math.min(20, Math.floor((summary.totalSec ?? 0) / 60));

  // Streak bonus
  const streak = profile.streak ?? 0;
  if (streak >= 7) xp += 10; else if (streak >= 3) xp += 5; else if (streak >= 1) xp += 2;

  // Focus bonus
  const lossEvents = summary.attentionLossEvents ?? 0;
  if (lossEvents === 0 && (summary.totalSec ?? 0) >= 300) xp += 12;
  else if (lossEvents <= 1) xp += 5;

  // Feature bonuses
  if ((session?.funscriptTracks ?? []).some(t => !t._disabled)) xp += 4;
  if ((session?.blocks ?? []).some(b => b.type === 'viz'))       xp += 3;
  if ((session?.scenes ?? []).length >= 1)                       xp += 2;
  if ((session?.rules  ?? []).filter(r => r.enabled).length >= 1) xp += 2;
  if (session?.rampSettings?.enabled)                            xp += 2;

  return xp;
}

// ── Daily-completion bonus XP (awarded alongside individual quest XP) ─────────
// Returns bonus XP if all 3 daily quests are now completed this session.
export function calculateDailyCompletionBonus(completedQuestIds, allQuestsNowDone, wasAlreadyDone) {
  // Only award when this session is what pushed all 3 over the line
  if (!allQuestsNowDone || wasAlreadyDone) return 0;
  // Bonus scales with how many quests were completed in this single session
  if (completedQuestIds.length >= 3) return 30; // all 3 done in one session
  if (completedQuestIds.length >= 2) return 20; // completed the set over 2 sessions
  return 15; // completed the final quest
}

// ── Quest progress ────────────────────────────────────────────────────────────
export function checkQuestProgress(summary, session, profile) {
  const today     = _today();
  const questDate = profile.questDate ?? '';
  const quests    = questDate === today
    ? (profile.quests ?? [])
    : getDailyQuests(today, profile).map(q => ({ id: q.id, done: false }));

  const completed = [];
  const updatedQuests = quests.map(qState => {
    if (qState.done) return qState;
    const def = QUEST_POOL.find(q => q.id === qState.id);
    if (!def) return qState;
    const met = def.condition(summary, session, profile);
    if (met) completed.push(qState.id);
    return { ...qState, done: met ? true : qState.done };
  });

  return { completed, updatedQuests, questDate: today };
}

// ── Main: call from playback.js after session ends ────────────────────────────
export async function processSessionEnd(summary, session) {
  if (!summary) return null;

  // ── Minimum runtime guard ─────────────────────────────────────────────────
  // Sessions shorter than 30 seconds don't count toward achievements, quests,
  // or profile statistics — this prevents accidental or test runs from polluting
  // the profile. The session IS still recorded in metrics history.
  const MIN_SESSION_SEC = 30;
  if ((summary.totalSec ?? 0) < MIN_SESSION_SEC) return null;

  const { loadProfile, saveProfile, rebuildProfile } = await import('./user-profile.js');
  let profile = rebuildProfile();

  // Dedup guard
  try {
    const last = await idbGet('achievements:lastProcessed');
    if (last === summary.timestamp) return null;
    await idbSet('achievements:lastProcessed', summary.timestamp);
  } catch {}

  // ── Update per-session counters BEFORE checking achievements ───────────────
  // Mode tracking
  if (session?.mode) {
    const m = new Set(profile.modesUsed ?? []);
    m.add(session.mode);
    profile.modesUsed = [...m];
  }

  // Today / double-session tracking
  const today = _today();
  if (profile.todayDate === today) {
    profile.sessionsToday = (profile.sessionsToday ?? 0) + 1;
  } else {
    profile.todayDate     = today;
    profile.sessionsToday = 1;
  }

  // Calendar month tracking (YYYY-MM key)
  const monthKey = today.slice(0, 7);
  profile.monthCounts = profile.monthCounts ?? {};
  profile.monthCounts[monthKey] = (profile.monthCounts[monthKey] ?? 0) + 1;

  // Focus quality counters
  const sessSec  = summary.totalSec ?? 0;
  const zeroLoss = (summary.attentionLossEvents ?? 999) === 0;
  const focusPct = sessSec > 0 ? (1 - ((summary.attentionLossTotalSec ?? 0) / sessSec)) : 0;

  if (summary.completionState === 'completed') {
    profile.perfectSessions  = (profile.perfectSessions  ?? 0) + (zeroLoss ? 1 : 0);
    profile.focusStreakCount  = focusPct >= 0.80 ? (profile.focusStreakCount ?? 0) + 1 : 0;
    profile.lowDriftSessions = focusPct >= 0.80 || (summary.attentionLossEvents ?? 0) < 2
      ? (profile.lowDriftSessions ?? 0) + 1
      : profile.lowDriftSessions ?? 0;
    // Feature-use repetition counters (for haptic_5x, viz_5x, etc.)
    const _hasFunscript   = (session.funscriptTracks ?? []).some(t => !t._disabled);
    const _hasViz         = (session.blocks ?? []).some(b => b.type === 'viz');
    const _hasRules       = (session.rules  ?? []).filter(r => r.enabled).length >= 1;
    const _hasBreathing   = (session.blocks ?? []).some(b => b.type === 'breathing');
    const _hasEntrainment = (session.blocks ?? []).some(b => b.type === 'entrainment');
    const _hasTTS         = (session.blocks ?? []).some(b => b.type === 'tts');
    const _hasAudioDriven = (session.funscriptTracks ?? []).some(t => t._generated);
    const _isSilent       = !_hasTTS && (session.blocks?.length ?? 0) > 0;

    profile.hapticSessions      = (profile.hapticSessions      ?? 0) + (_hasFunscript   ? 1 : 0);
    profile.vizSessions         = (profile.vizSessions         ?? 0) + (_hasViz         ? 1 : 0);
    profile.rulesSessions       = (profile.rulesSessions       ?? 0) + (_hasRules       ? 1 : 0);
    profile.breathingSessions   = (profile.breathingSessions   ?? 0) + (_hasBreathing   ? 1 : 0);
    profile.entrainmentSessions = (profile.entrainmentSessions ?? 0) + (_hasEntrainment ? 1 : 0);
    profile.audioDrivenSessions = (profile.audioDrivenSessions ?? 0) + (_hasAudioDriven ? 1 : 0);
    profile.silentSessions      = (profile.silentSessions      ?? 0) + (_isSilent       ? 1 : 0);

    // Session history for tier detection — store {durationSec, date} rolling list
    profile.sessionHistory = profile.sessionHistory ?? [];
    profile.sessionHistory.push({ durationSec: summary.totalSec ?? 0, date: new Date().toISOString() });
    // Keep only last 90 days to bound memory usage
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    profile.sessionHistory = profile.sessionHistory.filter(
      h => new Date(h.date).getTime() >= ninetyDaysAgo
    );

    // Total sessions counter
    profile.totalSessions = (profile.totalSessions ?? 0) + 1;

    // Brainwave band tracking (for Frequency Pilgrim hidden achievement)
    if (_hasEntrainment) {
      for (const b of (session.blocks ?? []).filter(b => b.type === 'entrainment')) {
        const hz = b.entBeatHz ?? 0;
        if (hz <= 4)               profile.deltaUsed  = true;
        if (hz >  4 && hz <=  8)   profile.thetaUsed  = true;
        if (hz >  8 && hz <= 14)   profile.alphaUsed  = true;
        if (hz > 14 && hz <= 30)   profile.betaUsed   = true;
        if (hz > 30)               profile.gammaUsed  = true;
      }
      // Delta / theta / gamma session counters for band-specific achievements
      const entBlocks = (session.blocks ?? []).filter(b => b.type === 'entrainment');
      if (entBlocks.some(b => (b.entBeatHz ?? 0) <= 4))  profile.deltaSessions  = (profile.deltaSessions  ?? 0) + 1;
      if (entBlocks.some(b => { const h = b.entBeatHz ?? 0; return h > 4 && h <= 8; }))
        profile.thetaSessions = (profile.thetaSessions ?? 0) + 1;
    }

    // Breath + entrainment sync counter — sessions that use both and the entrainment
    // is in theta/alpha range (4–14 Hz), matching natural breath-cycle entrainment
    if (_hasBreathing && _hasEntrainment) {
      const syncHz = (session.blocks ?? []).some(b =>
        b.type === 'entrainment' && (b.entBeatHz ?? 0) >= 4 && (b.entBeatHz ?? 0) <= 14);
      if (syncHz) profile.breathEntrainmentSyncSessions = (profile.breathEntrainmentSyncSessions ?? 0) + 1;
    }

    // Content pack category tracker
    if (session.name && session.name !== 'New Session') {
      // Look up which category this pack belongs to
      import('./content-packs.js').then(({ CONTENT_PACKS }) => {
        const pack = CONTENT_PACKS.find(p => p.name === session.name || p.session?.name === session.name);
        if (pack?.category) {
          const cats = new Set(profile.packCategoriesCompleted ?? []);
          cats.add(pack.category);
          profile.packCategoriesCompleted = [...cats];
        }
      }).catch(() => {});
    }

    // Early morning & high-focus session counters
    if (new Date().getHours() < 12) {
      profile.earlySessionCount = (profile.earlySessionCount ?? 0) + 1;
    }
    const sessSec2b = summary.totalSec ?? 0;
    const focusFrac = sessSec2b > 0 ? (1 - ((summary.attentionLossTotalSec ?? 0) / sessSec2b)) : 0;
    if (focusFrac >= 0.9) {
      profile.highAttentionSessions = (profile.highAttentionSessions ?? 0) + 1;
    }
    // Personal records
    const sessSec2 = summary.totalSec ?? 0;
    if (sessSec2 > (profile.longestSessionSec ?? 0)) profile.longestSessionSec = sessSec2;
    const focusPct2 = sessSec2 > 0 ? Math.round((1 - ((summary.attentionLossTotalSec ?? 0) / sessSec2)) * 100) : null;
    if (focusPct2 !== null && focusPct2 > (profile.bestFocusPct ?? 0)) profile.bestFocusPct = focusPct2;
  } else {
    // Interrupted or emergency sessions break the focus streak (prevent gaming by quitting)
    profile.focusStreakCount = 0;
  }

  // Multi-session day tracking
  if (profile.todayDate === today && (profile.sessionsToday ?? 0) >= 2) {
    profile.maxSessionsInDay = Math.max(profile.maxSessionsInDay ?? 0, profile.sessionsToday ?? 0);
    if ((profile.sessionsToday ?? 0) === 2) {
      // First time hitting 2 sessions today — count this as a multi-session day
      profile.multiSessionDays = (profile.multiSessionDays ?? 0) + 1;
    }
  }

  // ── Quest progress ─────────────────────────────────────────────────────────
  const { completed: completedQuestIds, updatedQuests, questDate } =
    checkQuestProgress(summary, session, profile);

  // Capture previous completion state BEFORE overwriting profile.quests —
  // after the assignment, profile.quests === updatedQuests so prevAllDone
  // would always equal allDone, meaning the guard never fires.
  const prevAllDone = (profile.quests ?? []).every(q => q.done);

  profile.quests    = updatedQuests;
  profile.questDate = questDate;

  // Update quest tracking fields
  const prevTotalQ = profile.totalQuestsCompleted ?? 0;
  profile.totalQuestsCompleted = prevTotalQ + completedQuestIds.length;

  const qtSet = new Set(profile.questTypesCompleted ?? []);
  for (const qid of completedQuestIds) qtSet.add(qid);
  profile.questTypesCompleted = [...qtSet];

  // Perfect quest day — all 3 done (award at most once per questDate)
  const allDone = updatedQuests.every(q => q.done);
  if (allDone && !prevAllDone) {
    profile.perfectQuestDays = (profile.perfectQuestDays ?? 0) + 1;
    // Track the list of dates for total unique perfect days
    const pqdList = profile.perfectQuestDaysList ?? [];
    if (!pqdList.includes(today)) pqdList.push(today);
    profile.perfectQuestDaysList = pqdList;
    // Compute consecutive streak of perfect quest days
    const prevPerfectDate = profile.lastPerfectQuestDate ?? null;
    if (prevPerfectDate) {
      const prevDate = new Date(prevPerfectDate);
      const todayDate = new Date(today);
      const diffDays = Math.round((todayDate - prevDate) / 86_400_000);
      profile.perfectQuestStreak = diffDays === 1
        ? (profile.perfectQuestStreak ?? 0) + 1
        : 1; // reset streak if gap > 1 day
    } else {
      profile.perfectQuestStreak = 1;
    }
    profile.lastPerfectQuestDate = today;
  }

  // ── XP ────────────────────────────────────────────────────────────────────
  const sessionXp = calculateSessionXp(summary, session, profile);
  const prevXp    = profile.xp ?? 0;
  const prevLevel = levelFromXp(prevXp);
  profile.xp      = prevXp + sessionXp;

  // Record first-ever session date (only set once, never overwritten)
  if (!profile.firstSessionAt) profile.firstSessionAt = _today(); // local calendar date, not UTC

  // ── Achievements ──────────────────────────────────────────────────────────
  const { newlyEarned, updatedEarned } = checkAndAwardAchievements(profile, summary, session);
  profile.achievements = updatedEarned;

  // Quest + achievement XP
  let questXp = 0;
  for (const qid of completedQuestIds) {
    questXp += QUEST_POOL.find(q => q.id === qid)?.xp ?? 0;
  }
  // Daily completion bonus — extra XP for finishing all 3 quests
  questXp += calculateDailyCompletionBonus(completedQuestIds, allDone, prevAllDone);
  let achievementXp = 0;
  for (const aid of newlyEarned) {
    achievementXp += ACHIEVEMENT_MAP[aid]?.xp ?? 0;
  }

  profile.xp += questXp + achievementXp;
  // Award any newly earned titles
  checkAndAwardTitles(profile);

  saveProfile(profile);

  const finalLevel = levelFromXp(profile.xp);

  // ── Notifications ─────────────────────────────────────────────────────────
  setTimeout(() => {
    const disp  = state.session?.displayOptions ?? {};
    const total = sessionXp + questXp + achievementXp;

    if (disp.toastXp !== false && total > 0)
      notify.info(`+${total} XP`, 3000);

    if (disp.toastLevelUp !== false && finalLevel > prevLevel)
      notify.success(`⬆ Level ${finalLevel}: ${LEVEL_NAMES[finalLevel] ?? ''}`, 5000);

    if (disp.toastAchievements !== false) {
      for (const aid of newlyEarned) {
        const a = ACHIEVEMENT_MAP[aid];
        if (a) notify.success(`🏅 ${a.icon} ${a.name}`, 5000);
      }
    }
    if (disp.toastQuests !== false) {
      for (const qid of completedQuestIds) {
        const q = QUEST_POOL.find(q => q.id === qid);
        if (q) notify.success(`${q.icon} Quest: ${q.name} (+${q.xp} XP)`, 4000);
      }
    }
  }, 1200);

  return {
    sessionXp, questXp, achievementXp,
    newlyEarned, completedQuests: completedQuestIds,
    newLevel: finalLevel, prevLevel,
    _achMap:   ACHIEVEMENT_MAP,
    _questMap: Object.fromEntries(QUEST_POOL.map(q => [q.id, q])),
  };
}

// ── Emergency stop ────────────────────────────────────────────────────────────
export async function awardEmergencyBadge() {
  const { loadProfile, saveProfile } = await import('./user-profile.js');
  const profile = loadProfile();
  const earned  = new Set(profile.achievements ?? []);
  if (!earned.has('safe_stop')) {
    earned.add('safe_stop');
    profile.achievements = [...earned];
    profile.xp = (profile.xp ?? 0) + (ACHIEVEMENT_MAP['safe_stop']?.xp ?? 10);
    saveProfile(profile);
    if (state.session?.displayOptions?.toastAchievements !== false)
      setTimeout(() => notify.info('🛑 Achievement: Safety First', 4000), 500);
  }
}

export function getTodayQuestDefs() { return getDailyQuests(_today()); }
