// ── metrics-history.js ─────────────────────────────────────────────────────
// Daily metrics history system (ROADMAP Phase 4 — Profiles & Progression).
//
// Maintains a rolling history of per-day session aggregates, independent of
// the per-session analytics log. The session log stores the last N sessions;
// this module stores the last retainDays calendar days.
//
// Storage: IndexedDB key 'ass-metrics-v1' (array of DayMetric objects)
// Default retention: 180 days (user-configurable per profile setting)
//
// DayMetric shape:
//   { date, sessionCount, totalRuntimeSec,
//     avgIntensityPct, avgEngagement, avgAttentionStability,
//     completedCount, interruptedCount, emergencyCount,
//     source }                  // 'app' | 'import:<name>' | 'plugin:<id>'

import { idbGet, idbSet, idbDel } from './idb-storage.js';
import { esc, fmt } from './state.js';

const IDB_KEY     = 'ass-metrics-v1';
const DEFAULT_RETAIN = 180; // calendar days

// ── In-memory cache ───────────────────────────────────────────────────────────
let _days = null; // DayMetric[] sorted newest-first once loaded

export const metricsReady = (async () => {
  const stored = await idbGet(IDB_KEY);
  _days = Array.isArray(stored) ? stored : [];
})();

// ── Local date helpers ────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateStrFrom(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Empty day record ──────────────────────────────────────────────────────────
function emptyDay(date, source = 'app') {
  return {
    date, source,
    sessionCount:          0,
    totalRuntimeSec:       0,
    avgIntensityPct:       null,
    avgEngagement:         null,
    avgAttentionStability: null,
    completedCount:        0,
    interruptedCount:      0,
    emergencyCount:        0,
    _intensitySamples:     [],  // transient accumulators (stripped on save)
    _engagementSamples:    [],
    _stabilitySamples:     [],
  };
}

// ── Persist cache to IDB ──────────────────────────────────────────────────────
async function _save(retainDays = DEFAULT_RETAIN) {
  if (!_days) return;
  // Build a pruned, stripped copy for IDB — do NOT reassign _days.
  // Reassigning would drop the transient accumulator arrays (_intensitySamples etc.)
  // from the in-memory cache, causing subsequent same-day sessions to restart their
  // running averages from scratch instead of accumulating correctly.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retainDays);
  const cutStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;

  // Prune stale entries from the live cache too (safe — old entries have no accumulators worth keeping)
  _days = _days.filter(d => d.date >= cutStr);

  // Strip transient fields for the IDB payload only
  const forStorage = _days.map(({ _intensitySamples, _engagementSamples, _stabilitySamples, ...d }) => d);
  await idbSet(IDB_KEY, forStorage).catch(() => {});
}

// ── Update today's aggregate from a session summary ───────────────────────────
// Called after each non-silent session stop with the finalised summary.
export async function recordSessionInHistory(summary, retainDays = DEFAULT_RETAIN) {
  await metricsReady;
  if (!summary || !_days) return;

  const date = dateStrFrom(summary.timestamp ?? Date.now());
  let day = _days.find(d => d.date === date);
  if (!day) {
    day = emptyDay(date, 'app');
    _days.unshift(day);
  }

  day.sessionCount++;
  day.totalRuntimeSec += summary.totalSec ?? 0;

  if (summary.fsAvg !== null && summary.fsAvg !== undefined) {
    if (!day._intensitySamples) day._intensitySamples = [];
    day._intensitySamples.push(summary.fsAvg);
    day.avgIntensityPct = Math.round(day._intensitySamples.reduce((a,b) => a+b, 0) / day._intensitySamples.length);
  }

  // Attention stability: 1 - (lossEvents / sessionDurationMinutes)
  if (summary.totalSec > 0) {
    const stab = Math.max(0, 1 - (summary.attentionLossEvents ?? 0) / Math.max(1, summary.totalSec / 60));
    if (!day._stabilitySamples) day._stabilitySamples = [];
    day._stabilitySamples.push(stab);
    day.avgAttentionStability = +( day._stabilitySamples.reduce((a,b) => a+b, 0) / day._stabilitySamples.length).toFixed(2);
  }

  // Engagement average — now populated by tickAnalytics via engagementSamples
  if (summary.avgEngagement !== null && summary.avgEngagement !== undefined && Number.isFinite(summary.avgEngagement)) {
    if (!day._engagementSamples) day._engagementSamples = [];
    day._engagementSamples.push(summary.avgEngagement);
    day.avgEngagement = +( day._engagementSamples.reduce((a,b) => a+b, 0) / day._engagementSamples.length).toFixed(3);
  }

  // Completion state counts
  const cs = summary.completionState ?? 'completed';
  if (cs === 'completed')   day.completedCount++;
  else if (cs === 'emergency') day.emergencyCount++;
  else                      day.interruptedCount++;

  await _save(retainDays);
}

// ── Get the stored daily history ──────────────────────────────────────────────
// Returns DayMetric[] sorted newest-first, clipped to the last maxDays days.
export async function getDailyHistory(maxDays = DEFAULT_RETAIN) {
  await metricsReady;
  return (_days ?? []).slice(0, maxDays);
}

// ── Import external metrics data ──────────────────────────────────────────────
// Accepts an array of records from external sources (devices, scripts, plugins).
// Each record must have at least { date: 'YYYY-MM-DD' }.
// Optional fields: { totalRuntimeSec, avgIntensityPct, avgEngagement,
//                   avgAttentionStability, sessionCount, source }
export async function importExternalMetrics(records, sourceName = 'import', retainDays = DEFAULT_RETAIN) {
  await metricsReady;
  if (!Array.isArray(records) || !records.length) return { imported: 0, skipped: 0, errors: [] };

  let imported = 0, skipped = 0;
  const errors = [];

  for (const rec of records) {
    // Validate date
    const date = rec.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Record missing valid date: ${JSON.stringify(rec).slice(0, 80)}`);
      skipped++;
      continue;
    }

    let day = _days.find(d => d.date === date);
    if (!day) {
      day = emptyDay(date, `import:${sourceName}`);
      _days.unshift(day);
    }

    // Merge numeric fields — only update if the record provides valid finite numbers.
    // typeof NaN === 'number' is true, so Number.isFinite is required to guard NaN.
    if (Number.isFinite(rec.totalRuntimeSec))       day.totalRuntimeSec   += rec.totalRuntimeSec;
    if (Number.isFinite(rec.sessionCount))           day.sessionCount       += Math.round(rec.sessionCount);
    if (Number.isFinite(rec.avgIntensityPct))        day.avgIntensityPct    = Math.max(0, Math.min(100, rec.avgIntensityPct));
    if (Number.isFinite(rec.avgEngagement))          day.avgEngagement      = Math.max(0, Math.min(1, rec.avgEngagement));
    if (Number.isFinite(rec.avgAttentionStability))  day.avgAttentionStability = Math.max(0, Math.min(1, rec.avgAttentionStability));

    // Mark as merged from external source if day already had app data
    if (day.source === 'app') day.source = `app+import:${sourceName}`;

    imported++;
  }

  // Re-sort newest-first after possible insertions
  _days.sort((a, b) => b.date.localeCompare(a.date));
  await _save(retainDays);

  return { imported, skipped, errors };
}

// ── Clear all metrics history ─────────────────────────────────────────────────
export async function clearMetricsHistory() {
  _days = [];
  await idbDel(IDB_KEY).catch(() => {});
}

// ── Render a compact metrics chart ───────────────────────────────────────────
// Returns an HTML string (SVG + legend) for embedding in the profile panel.
export async function renderMetricsChart(days = 30, retainDays = DEFAULT_RETAIN) {
  await metricsReady;

  const history = (_days ?? []).slice(0, Math.min(days, _days?.length ?? 0)).reverse(); // oldest-first for chart

  if (!history.length) {
    return `<div style="font-size:11px;color:var(--text3);padding:8px 0">
      No metrics data yet. Complete a session to start tracking.
    </div>`;
  }

  const W = 280, H = 60, BAR_W = Math.max(2, Math.floor((W - 4) / Math.max(history.length, 1)));
  const maxRuntime = Math.max(...history.map(d => d.totalRuntimeSec), 1);

  const bars = history.map((d, i) => {
    const x    = 2 + i * BAR_W;
    const barH = Math.max(2, Math.round((d.totalRuntimeSec / maxRuntime) * (H - 12)));
    const y    = H - barH;
    // Color by completion: all-completed=green, mixed=amber, any-emergency=red
    const hasEmergency = d.emergencyCount > 0;
    const allComplete  = d.completedCount === d.sessionCount && d.sessionCount > 0;
    const color = hasEmergency ? '#e05050' : allComplete ? '#7dc87a' : '#f0a04a';
    return `<rect x="${x}" y="${y}" width="${Math.max(1, BAR_W - 1)}" height="${barH}"
      fill="${color}" rx="1" opacity="0.85">
      <title>${d.date}: ${d.sessionCount} session${d.sessionCount !== 1 ? 's' : ''}, ${fmt(d.totalRuntimeSec)} runtime</title>
    </rect>`;
  }).join('');

  // Engagement overlay line (if available)
  const engPoints = history.map((d, i) => {
    if (d.avgEngagement === null) return null;
    const x = 2 + i * BAR_W + Math.floor(BAR_W / 2);
    const y = Math.round(H - 4 - d.avgEngagement * (H - 16));
    return `${x},${y}`;
  }).filter(Boolean);
  const engLine = engPoints.length >= 2
    ? `<polyline points="${engPoints.join(' ')}" fill="none" stroke="#7fb0ff" stroke-width="1.5" opacity="0.7" />`
    : '';

  return `
    <div style="margin-bottom:6px">
      <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"
        style="display:block;border-radius:4px;overflow:hidden">
        <rect width="${W}" height="${H}" fill="rgba(255,255,255,0.03)" />
        ${bars}
        ${engLine}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--text3);margin-top:2px">
        <span>${history[0]?.date ?? ''}</span>
        <span style="font-size:9px;color:rgba(255,255,255,0.2)">
          ■ runtime &nbsp; <span style="color:#7fb0ff">─</span> engagement
        </span>
        <span>${history[history.length-1]?.date ?? ''}</span>
      </div>
    </div>`;
}

// ── Test helper ────────────────────────────────────────────────────────────────
export function _setMetricsCacheForTest(entries) {
  _days = Array.isArray(entries) ? entries : [];
}
