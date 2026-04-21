// ── suggestions.js ────────────────────────────────────────────────────────
// Heuristic session analysis. Surfaces tips, warnings, and quality issues
// in the inspector Status tab and as dismissable notify toasts.
// All logic is deterministic — no AI/ML required.

import { state, fmt, persist, esc } from './state.js';
import { notify } from './notify.js';
import { history } from './history.js';

// ── Suggestion types ────────────────────────────────────────────────────────
// Each suggestion: { id, severity, title, detail, action? }
// severity: 'info' | 'warn' | 'error'
// action: optional { label, fn } — button in the suggestions panel

export function analyzeSession() {
  const { session } = state;
  const suggestions = [];
  const dur    = session.duration;
  const blocks = session.blocks;
  const scenes = Array.isArray(session.scenes) ? session.scenes : [];

  // ── No blocks at all ──────────────────────────────────────────────────────
  if (!blocks.length) {
    suggestions.push({
      id: 'no_blocks',
      severity: 'warn',
      title: 'Session has no content blocks',
      detail: 'Add text, TTS, audio, video, or pause blocks from the sidebar to give the session structure.',
    });
  }

  // ── Block issues ──────────────────────────────────────────────────────────
  const overflowing = blocks.filter(b => b.start + b.duration > dur);
  if (overflowing.length) {
    suggestions.push({
      id: 'blocks_overflow',
      severity: 'warn',
      title: `${overflowing.length} block${overflowing.length > 1 ? 's' : ''} extend past session duration`,
      detail: `"${overflowing[0].label}" ends at ${fmt(overflowing[0].start + overflowing[0].duration)} but session loops at ${fmt(dur)}. Blocks are cut off mid-display on each loop.`,
      action: { label: 'Sort & check', fn: () => {
        history.push(); // snapshot BEFORE sort so it's undoable
        session.blocks.sort((a,b) => a.start - b.start);
        persist();
        import('./ui.js').then(({ renderSidebar }) => renderSidebar());
      }},
    });
  }

  const overlapping = [];
  const sorted = [...blocks].sort((a,b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].type === 'text' && sorted[i+1].type === 'text') {
      if (sorted[i].start + sorted[i].duration > sorted[i+1].start) {
        overlapping.push([sorted[i], sorted[i+1]]);
      }
    }
  }
  if (overlapping.length) {
    suggestions.push({
      id: 'text_blocks_overlap',
      severity: 'info',
      title: `${overlapping.length} text block${overlapping.length > 1 ? 's overlap' : ' overlaps'} another`,
      detail: `"${overlapping[0][0].label}" and "${overlapping[0][1].label}" overlap. Only one text overlay is shown at a time — the later block takes priority.`,
    });
  }

  // ── Scene issues ─────────────────────────────────────────────────────────
  if (scenes.length) {
    // Scene extends past session duration
    const overflowScenes = scenes.filter(s => s.end > session.duration);
    if (overflowScenes.length) {
      suggestions.push({
        id: 'scene_overflow',
        severity: 'warn',
        title: `${overflowScenes.length} scene${overflowScenes.length > 1 ? 's extend' : ' extends'} past session duration`,
        detail: `"${overflowScenes[0].name}" ends at ${fmt(overflowScenes[0].end)} but session loops at ${fmt(dur)}. Adjust the scene end time or increase session duration.`,
      });
    }

    // Overlapping scenes
    const sortedScenes = [...scenes].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sortedScenes.length - 1; i++) {
      if (sortedScenes[i].end > sortedScenes[i + 1].start) {
        suggestions.push({
          id: `scene_overlap_${i}`,
          severity: 'info',
          title: `Scenes "${sortedScenes[i].name}" and "${sortedScenes[i+1].name}" overlap`,
          detail: `"${sortedScenes[i].name}" ends at ${fmt(sortedScenes[i].end)}, but "${sortedScenes[i+1].name}" starts at ${fmt(sortedScenes[i+1].start)}. Scenes can overlap, but the Next Scene button will skip the earlier one.`,
        });
        break;
      }
    }
  }

  // ── No background content ──────────────────────────────────────────────────
  if (!session.playlists?.audio?.length && !session.playlists?.video?.length && !(session.funscriptTracks?.length)) {
    suggestions.push({
      id: 'no_background',
      severity: 'info',
      title: 'No background media loaded',
      detail: 'Add looping audio, video, or a FunScript track from the sidebar to create a richer session.',
    });
  }

  // ── FunScript shorter than session ─────────────────────────────────────────
  for (const track of session.funscriptTracks) {
    if (track._disabled || !track.actions.length) continue;
    const trackDurMs = track.actions.at(-1)?.at ?? 0;
    if (trackDurMs < dur * 1000 * 0.9) {
      suggestions.push({
        id: `fs_short_${track.id}`,
        severity: 'warn',
        title: `FunScript "${track.name}" is shorter than session`,
        detail: `Track ends at ${fmt(trackDurMs/1000)} but session loops at ${fmt(dur)}. Output will be static (at last position) for the remaining ${fmt(dur - trackDurMs/1000)}.`,
      });
    }
  }

  // ── Long silence gaps ──────────────────────────────────────────────────────
  if (sorted.length >= 2) {
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i+1].start - (sorted[i].start + sorted[i].duration);
      if (gap > 30) {
        suggestions.push({
          id: `gap_${i}`,
          severity: 'info',
          title: `${Math.round(gap)}s silence between "${sorted[i].label}" and "${sorted[i+1].label}"`,
          detail: `Consider adding a Pause block or audio content to fill the gap, or move blocks closer together.`,
        });
        break; // Only report the first large gap to avoid noise
      }
    }
  }

  // ── Subtitle tracks shorter than session ───────────────────────────────────
  for (const track of session.subtitleTracks) {
    if (track._disabled || !track.events?.length) continue;
    const lastCueEnd = Math.max(...track.events.map(e => e.end));
    if (lastCueEnd < dur * 0.9) {
      suggestions.push({
        id: `sub_short_${track.id ?? track.name}`,
        severity: 'info',
        title: `Subtitle track "${track.name}" ends before session loops`,
        detail: `Last cue ends at ${fmt(lastCueEnd)} but session loops at ${fmt(dur)}. The stage will be subtitle-free for ${fmt(dur - lastCueEnd)}.`,
      });
    }
  }

  // ── Session very short for loop count ─────────────────────────────────────
  if (session.loopMode === 'count' && session.loopCount > 10 && dur < 60) {
    suggestions.push({
      id: 'many_short_loops',
      severity: 'info',
      title: `${session.loopCount} loops of a ${Math.round(dur)}s session`,
      detail: `Total runtime: ~${fmt(session.loopCount * dur)}. Consider "Loop forever" mode or a longer duration instead.`,
    });
  }

  // ── TTS blocks with no voice selected ─────────────────────────────────────
  const ttsBlocks = blocks.filter(b => b.type === 'tts' && b.content);
  if (ttsBlocks.length && !window.speechSynthesis?.getVoices().length) {
    suggestions.push({
      id: 'tts_no_voices',
      severity: 'warn',
      title: 'TTS voices not loaded yet',
      detail: 'Browser voice list is still loading. TTS blocks may use a default voice. Check Settings → Playback after the page fully loads.',
    });
  }

  // ── Rules need webcam ──────────────────────────────────────────────────────
  const attentionRules = (session.rules ?? []).filter(
    r => r.enabled && r.condition.metric === 'attention'
  );
  if (attentionRules.length && !session.tracking.enabled) {
    suggestions.push({
      id: 'rules_no_webcam',
      severity: 'warn',
      title: `${attentionRules.length} attention rule${attentionRules.length > 1 ? 's' : ''} defined but webcam tracking is off`,
      detail: 'Attention rules will never fire. Enable webcam tracking in Settings → Webcam, or change the rule metric.',
    });
  }

  // ── Pacing / ramp without engagement source ─────────────────────────────────
  const pacingOn = session.pacingSettings?.enabled;
  const rampEngagement = session.rampSettings?.enabled && session.rampSettings?.mode === 'engagement';
  if ((pacingOn || rampEngagement) && !session.tracking.enabled) {
    suggestions.push({
      id: 'pacing_no_webcam',
      severity: 'info',
      title: `${pacingOn && rampEngagement ? 'Pacing and ramp' : pacingOn ? 'Dynamic pacing' : 'Intensity ramp'} uses engagement score`,
      detail: 'Without webcam tracking active, engagement stays at 0 and pacing/ramp may not work as intended. Enable tracking in Settings → Webcam.',
    });
  }

  // ── Broken scene branch references ────────────────────────────────────────
  // nextSceneId pointing at a scene that no longer exists is silently ignored
  // at runtime, which is confusing. Surface it in the suggestions panel.
  if (scenes.length) {
    const sceneIds = new Set(scenes.map(s => s.id));
    const brokenBranches = scenes.filter(s => s.nextSceneId && !sceneIds.has(s.nextSceneId));
    if (brokenBranches.length) {
      suggestions.push({
        id: 'broken_branch',
        severity: 'warn',
        title: `${brokenBranches.length} scene${brokenBranches.length > 1 ? 's have' : ' has'} a broken branch target`,
        detail: `Scene "${brokenBranches[0].name}" branches to a scene that no longer exists. Open the scene editor and update or clear the "After scene" setting.`,
        action: { label: 'Open scenes', fn: () => {
          import('./ui.js').then(({ renderInspector }) => {
            state.selectedSidebarType = 'scenes';
            renderInspector();
          });
        }},
      });
    }

    // Warn about rules/triggers with gotoScene pointing at a removed scene
    const brokenGotoRules = (session.rules ?? []).filter(r =>
      r.action?.type === 'gotoScene' && r.action.param && !sceneIds.has(r.action.param)
    );
    const brokenGotoTriggers = (session.triggers ?? []).filter(t =>
      (t.successAction?.type === 'gotoScene' && t.successAction.param && !sceneIds.has(t.successAction.param)) ||
      (t.failureAction?.type === 'gotoScene' && t.failureAction.param && !sceneIds.has(t.failureAction.param))
    );
    const brokenGotoCount = brokenGotoRules.length + brokenGotoTriggers.length;
    if (brokenGotoCount > 0) {
      suggestions.push({
        id: 'broken_goto_scene',
        severity: 'warn',
        title: `${brokenGotoCount} rule${brokenGotoCount > 1 ? 's or triggers have' : ' or trigger has'} a missing gotoScene target`,
        detail: `A "Go to scene" action points to a scene that no longer exists. Open the Rules or Triggers inspector and update the target.`,
      });
    }
  }

  // ── Large embedded media warning ──────────────────────────────────────────
  // Estimate total embedded media bytes (base64 chars × 0.75 ≈ bytes)
  const estimateMediaBytes = () => {
    let total = 0;
    const addUrl = u => { if (typeof u === 'string' && u.startsWith('data:')) total += Math.round(u.length * 0.75); };
    session.playlists.audio.forEach(t => addUrl(t.dataUrl));
    session.playlists.video.forEach(t => addUrl(t.dataUrl));
    blocks.forEach(b => addUrl(b.dataUrl));
    return total;
  };
  const totalMediaMB = estimateMediaBytes() / 1_000_000;
  if (totalMediaMB > 50) {
    suggestions.push({
      id: 'large_media',
      severity: totalMediaMB > 150 ? 'warn' : 'info',
      title: `Session contains ~${totalMediaMB.toFixed(0)} MB of embedded media`,
      detail: totalMediaMB > 150
        ? 'Exporting this session as .assp will produce a very large file. Consider using shorter media clips or splitting into multiple sessions.'
        : 'The export file (.assp) will be large. Auto-save uses IndexedDB (no quota limit), but exports may be slow to download.',
    });
  }

  // ── Blocks missing meaningful labels ──────────────────────────────────────
  const defaultLabelPattern = /^Block \d+$/;
  const unlabeled = blocks.filter(b => !b.label || defaultLabelPattern.test(b.label));
  if (unlabeled.length >= 3) {
    suggestions.push({
      id: 'unlabeled_blocks',
      severity: 'info',
      title: `${unlabeled.length} block${unlabeled.length > 1 ? 's have' : ' has'} generic labels`,
      detail: 'Custom block labels make the timeline easier to read and are shown in post-session analytics. Click a block and edit its label in the inspector.',
    });
  }

  // ── Phase 5.2: template vars that reference undefined session variables ────
  const definedVars = new Set(Object.keys(session.variables ?? {}));
  const builtInVars = new Set(['intensity','speed','loop','time','scene']);
  const textBlocks  = blocks.filter(b => b.type === 'text' || b.type === 'tts');
  const undefinedVarRefs = new Set();
  for (const b of textBlocks) {
    if (!b.content?.includes('{{')) continue;
    for (const [, name] of (b.content.matchAll(/\{\{([a-z_][a-z0-9_]*)\}\}/gi) ?? [])) {
      if (!builtInVars.has(name) && !definedVars.has(name)) undefinedVarRefs.add(name);
    }
  }
  if (undefinedVarRefs.size > 0) {
    suggestions.push({
      id: 'undefined_template_vars',
      severity: 'warn',
      title: `${undefinedVarRefs.size} template variable${undefinedVarRefs.size > 1 ? 's are' : ' is'} referenced but not defined`,
      detail: `Undefined: ${[...undefinedVarRefs].map(n => `{{${n}}}`).join(', ')}. Add these in the Variables panel (Session tab) or correct the block content.`,
    });
  }

  // ── Phase 5.2: setVar actions targeting undefined variables ───────────────
  const setVarRules = (session.rules ?? [])
    .filter(r => r.action?.type === 'setVar' && typeof r.action.param === 'string')
    .map(r => r.action.param.split('=')[0]?.trim())
    .filter(n => n && !definedVars.has(n));
  const setVarTriggers = [
    ...(session.triggers ?? []).filter(t => t.successAction?.type === 'setVar'),
    ...(session.triggers ?? []).filter(t => t.failureAction?.type === 'setVar'),
  ].map(t => (t.successAction?.param ?? t.failureAction?.param ?? '').split('=')[0]?.trim())
   .filter(n => n && !definedVars.has(n));
  const missingSetVarTargets = new Set([...setVarRules, ...setVarTriggers]);
  if (missingSetVarTargets.size > 0) {
    suggestions.push({
      id: 'setvar_missing_target',
      severity: 'warn',
      title: `setVar action targets undefined variable${missingSetVarTargets.size > 1 ? 's' : ''}`,
      detail: `Variable${missingSetVarTargets.size > 1 ? 's' : ''} not yet defined: ${[...missingSetVarTargets].join(', ')}. Add them in the Session tab → Variables panel.`,
    });
  }

  // ── Phase 5.1: scenes present but none have a State Block type ────────────
  if (scenes.length >= 2 && scenes.every(s => !s.stateType)) {
    suggestions.push({
      id: 'no_state_types',
      severity: 'info',
      title: 'Scenes have no State Block types assigned',
      detail: 'State Block types (🌊 Calm · 📈 Build · ⚡ Peak · 🌱 Recovery) automatically adjust intensity and pacing when a scene is entered. Open the Scenes inspector to assign them.',
    });
  }

  // ── Viz blocks: empty content check ─────────────────────────────────────
  // A viz block with no vizType set (shouldn't happen after normalise, but
  // import round-trips could produce it) is a silent dead block.
  const vizBlocks = blocks.filter(b => b.type === 'viz');
  const inValidVizTypes = vizBlocks.filter(b =>
    !['spiral','pendulum','tunnel','pulse','vortex'].includes(b.vizType)
  );
  if (inValidVizTypes.length > 0) {
    suggestions.push({
      id: 'viz_invalid_type',
      severity: 'warn',
      title: `${inValidVizTypes.length} visualization block${inValidVizTypes.length > 1 ? 's have' : ' has'} an unrecognized pattern`,
      detail: 'Open each 🌀 Viz block in the inspector and select a valid pattern (Spiral, Pendulum, Tunnel, Pulse, or Vortex).',
    });
  }

  // Viz blocks without an induction mode hint
  if (vizBlocks.length > 0 && session.mode && !['induction'].includes(session.mode)) {
    suggestions.push({
      id: 'viz_mode_hint',
      severity: 'info',
      title: 'Visualization blocks work best with Guided Induction mode',
      detail: 'Switch to 🌀 Guided Induction mode (Session tab → Mode) for slow pacing, no abrupt pauses, and automatic depth rules suited to trance sessions.',
    });
  }

  // ── Speech rate note for sessions with no TTS blocks ────────────────────
  // If the operator has changed speechRate but there are no TTS blocks,
  // the setting has no effect — flag it as informational.
  const hasTts = blocks.some(b => b.type === 'tts');
  if (!hasTts && session.speechRate && session.speechRate !== 1) {
    suggestions.push({
      id: 'speech_rate_no_tts',
      severity: 'info',
      title: 'Speech rate set but no TTS blocks exist',
      detail: `The session speech rate is ${session.speechRate}× but there are no Text-to-Speech blocks. Either add TTS blocks or reset the speech rate to 1.0 in Playback settings.`,
    });
  }

  // ── Long session with no scenes ───────────────────────────────────────────
  // Sessions over 5 minutes without scenes are harder to navigate and can't
  // use state-block intensity profiles.
  if (session.duration > 300 && scenes.length === 0) {
    suggestions.push({
      id: 'long_session_no_scenes',
      severity: 'info',
      title: 'Long session has no scenes defined',
      detail: 'Sessions over 5 minutes benefit from scenes: they enable state-block intensity profiles, the N key can jump between them, and rules can trigger scene transitions. Add scenes in the Scenes inspector tab.',
    });
  }

  // ── Sensor bridge auto-connect but no rules use engagement ───────────────
  // If auto-connect is enabled, the user likely intends sensor data to drive
  // rules — flag if no rules reference engagement metric.
  if (session.displayOptions?.sensorBridgeAuto) {
    const usesEngagement = (session.rules ?? []).some(r =>
      r.condition?.metric === 'engagement'
    );
    if (!usesEngagement) {
      suggestions.push({
        id: 'sensor_auto_no_engagement_rule',
        severity: 'info',
        title: 'Sensor bridge auto-connect is on but no rules use engagement',
        detail: 'The sensor bridge is set to auto-connect, but no rules check the engagement metric. Add a rule with condition "engagement ≥ 0.8" or similar to make use of the biometric input.',
      });
    }
  }

  // ── No haptic track (gentle nudge for users who haven't tried it) ─────────
  const hasFunscript = session.funscriptTracks?.length > 0;
  const hasDevice    = session.blocks?.length > 0; // only suggest if session has content
  if (hasDevice && !hasFunscript && session.duration >= 120) {
    suggestions.push({
      id: 'no_haptic_track',
      severity: 'info',
      title: 'No haptic feedback track',
      detail: 'Add a FunScript track in the inspector to enable device feedback. You can generate a pattern from BPM, import a .funscript file, or use the pattern picker. Haptic sessions also earn extra XP.',
    });
  }

  // ── Intensity ramp not enabled ────────────────────────────────────────────
  const rampEnabled   = session.rampSettings?.enabled;
  const pacingEnabled = session.pacingSettings?.enabled;
  if (!rampEnabled && !pacingEnabled && session.duration >= 300 && blocks.length >= 3) {
    suggestions.push({
      id: 'no_ramp_or_pacing',
      severity: 'info',
      title: 'No intensity ramp or dynamic pacing',
      detail: 'Sessions longer than 5 minutes benefit from an automatic intensity ramp or adaptive pacing. Enable one in Settings → Ramp / Pacing. This also unlocks daily quest opportunities.',
    });
  }

  // ── Text blocks with no template variables ────────────────────────────────
  const textBlocks2 = blocks.filter(b => b.type === 'text' || b.type === 'tts');
  const hasVars    = Object.keys(session.variables ?? {}).length > 0;
  const usesVarTemplate = textBlocks2.some(b => /\{\{[^}]+\}\}/.test(b.content ?? ''));
  if (textBlocks2.length >= 3 && hasVars && !usesVarTemplate) {
    suggestions.push({
      id: 'vars_defined_not_used',
      severity: 'info',
      title: 'Variables defined but not used in text blocks',
      detail: `You have ${Object.keys(session.variables).length} variable${Object.keys(session.variables).length > 1 ? 's' : ''} defined but none of your text/TTS blocks use {{variable}} syntax. Try adding {{${Object.keys(session.variables)[0]}}} to a text block to make it dynamic.`,
    });
  }

  // ── Viz block without a FunScript pattern ─────────────────────────────────
  const hasViz     = blocks.some(b => b.type === 'viz');
  if (hasViz && hasFunscript) {
    // Check if viz block overlaps with funscript range — useful tip
    const vizBlock = blocks.find(b => b.type === 'viz');
    const fsStart  = session.funscriptTracks?.[0]?.actions?.[0]?.at ?? 0;
    const vizStart = (vizBlock?.start ?? 0) * 1000;
    if (Math.abs(vizStart - fsStart) > 5000) {
      suggestions.push({
        id: 'viz_haptic_timing',
        severity: 'info',
        title: 'Visualization and haptic track may be misaligned',
        detail: 'Your visualization block and FunScript track start at different times. Consider aligning them for a more immersive experience — the visualization looks best when it matches the haptic rhythm.',
      });
    }
  }

  // ── TTS blocks too short for their content ─────────────────────────────────
  const ttsTooShort = blocks.filter(b => {
    if (b.type !== 'tts' || !b.content) return false;
    const wordCount = b.content.trim().split(/\s+/).length;
    const rate      = session.speechRate ?? 1;
    const estSec    = (wordCount / 2.5) / rate; // ~150 wpm baseline
    return b.duration < estSec * 0.75; // flag if duration is <75% of estimated speech time
  });
  if (ttsTooShort.length) {
    const b = ttsTooShort[0];
    const words = b.content.trim().split(/\s+/).length;
    const est   = Math.ceil((words / 2.5) / (session.speechRate ?? 1));
    suggestions.push({
      id: 'tts_too_short',
      severity: 'warn',
      title: `${ttsTooShort.length} TTS block${ttsTooShort.length > 1 ? 's are' : ' is'} shorter than estimated speech time`,
      detail: `"${b.label}" has ${words} words (~${est}s to speak) but only ${b.duration}s of duration. Speech will be cut off at the end of the block.`,
    });
  }

  // ── Scenes with no blocks assigned ────────────────────────────────────────
  if (scenes.length) {
    const emptyScenes = scenes.filter(sc => {
      return !blocks.some(b => b.start >= sc.start && b.start < sc.end);
    });
    if (emptyScenes.length) {
      suggestions.push({
        id: 'empty_scenes',
        severity: 'info',
        title: `${emptyScenes.length} scene${emptyScenes.length > 1 ? 's have' : ' has'} no blocks`,
        detail: `"${emptyScenes[0].name}" spans ${fmt(emptyScenes[0].start)}–${fmt(emptyScenes[0].end)} but contains no blocks. The stage will be blank during this time.`,
      });
    }
  }

  // ── Conflicting rule actions (pause + resume on same metric) ───────────────
  const enabledRules = (session.rules ?? []).filter(r => r.enabled);
  const pauseRules   = enabledRules.filter(r => r.action?.type === 'pause');
  const resumeRules  = enabledRules.filter(r => r.action?.type === 'resume');
  if (pauseRules.length && resumeRules.length) {
    const pMetric = pauseRules[0].condition?.metric;
    const rMetric = resumeRules[0].condition?.metric;
    if (pMetric === rMetric) {
      suggestions.push({
        id: 'conflicting_pause_resume',
        severity: 'info',
        title: 'Pause and Resume rules share the same metric',
        detail: `Both pause and resume rules watch "${pMetric}". Verify the thresholds don't create rapid oscillation. Ensure there's a buffer between pause and resume values.`,
      });
    }
  }

  // ── Multiple intensity-override rules with short cooldowns ────────────────
  const intensityRules = enabledRules.filter(r => r.action?.type === 'setIntensity');
  const shortCooldown  = intensityRules.filter(r => (r.cooldownSec ?? 0) < 10);
  if (shortCooldown.length >= 2) {
    suggestions.push({
      id: 'intensity_rules_fast',
      severity: 'info',
      title: `${shortCooldown.length} intensity rules have cooldowns under 10s`,
      detail: 'Rules with very short cooldowns can fire rapidly and produce jarring intensity swings. Consider cooldowns of 20–60s for smoother transitions.',
    });
  }

  // ── Breathing blocks without enough duration for cycles ───────────────────
  const breathBroken = blocks.filter(b => {
    if (b.type !== 'breathing') return false;
    if (!b.breathCycles || b.breathCycles === 0) return false;
    const cycle = (b.breathInSec ?? 4) + (b.breathHold1Sec ?? 0) + (b.breathOutSec ?? 6) + (b.breathHold2Sec ?? 0);
    return b.duration < cycle * b.breathCycles * 0.9;
  });
  if (breathBroken.length) {
    const b = breathBroken[0];
    const cycle = (b.breathInSec ?? 4) + (b.breathHold1Sec ?? 0) + (b.breathOutSec ?? 6) + (b.breathHold2Sec ?? 0);
    suggestions.push({
      id: 'breathing_too_short',
      severity: 'warn',
      title: `Breathing block "${b.label}" is shorter than its configured cycles`,
      detail: `${b.breathCycles} cycles × ${cycle}s = ${b.breathCycles * cycle}s needed, but block is only ${b.duration}s. Increase the block duration or reduce the cycle count.`,
    });
  }

  // ── Entrainment blocks: warn if volume is very high ──────────────────────
  const loudEntrainment = blocks.filter(b => b.type === 'entrainment' && (b.entVolume ?? 0.3) > 0.8);
  if (loudEntrainment.length) {
    suggestions.push({
      id: 'entrainment_loud',
      severity: 'info',
      title: 'Entrainment block at high volume',
      detail: `"${loudEntrainment[0].label}" has volume at ${Math.round((loudEntrainment[0].entVolume ?? 0.3) * 100)}%. Binaural beats above 70% volume can be fatiguing over long sessions. Consider 30–60%.`,
    });
  }

  // ── Positive: session looks complete ──────────────────────────────────────
  if (!suggestions.length) {
    suggestions.push({
      id: 'all_good',
      severity: 'info',
      title: 'Session looks good',
      detail: 'No issues detected. Ready to play.',
    });
  }

  return suggestions;
}

// ── Render suggestions into a container element ─────────────────────────────
export function renderSuggestions(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const suggestions = analyzeSession();

  const ICONS = { info: 'ℹ', warn: '⚠', error: '✕' };
  const COLORS = {
    info:  { icon: '#5fa0dc', bg: 'rgba(95,160,220,0.08)',  border: 'rgba(95,160,220,0.2)'  },
    warn:  { icon: '#f0a04a', bg: 'rgba(240,160,74,0.08)',  border: 'rgba(240,160,74,0.25)' },
    error: { icon: '#e05050', bg: 'rgba(224,80,80,0.08)',   border: 'rgba(224,80,80,0.25)'  },
  };

  container.innerHTML = suggestions.map(s => {
    const c = COLORS[s.severity] || COLORS.info;
    // Escape all user-derived strings — titles/details contain block labels, scene
    // names, track names, etc. which can contain quotes or markup characters.
    const safeTitle  = esc(s.title);
    const safeDetail = esc(s.detail);
    const actionHtml = s.action
      ? `<button class="suggest-action" data-suggest-id="${esc(s.id)}" style="
          margin-top:5px;padding:3px 8px;font-size:10px;
          border:0.5px solid ${c.border};border-radius:4px;
          background:transparent;color:${c.icon};cursor:pointer;"
        >${esc(s.action.label)}</button>`
      : '';
    return `<div class="suggest-card" style="
      border:0.5px solid ${c.border};background:${c.bg};
      border-radius:6px;padding:8px 10px;margin-bottom:6px;">
      <div style="display:flex;align-items:flex-start;gap:7px;">
        <span style="color:${c.icon};font-size:12px;flex-shrink:0;margin-top:1px;">${ICONS[s.severity]}</span>
        <div>
          <div style="font-size:11px;font-weight:500;color:var(--text);margin-bottom:3px;">${safeTitle}</div>
          <div style="font-size:10.5px;color:var(--text2);line-height:1.5;">${safeDetail}</div>
          ${actionHtml}
        </div>
      </div>
    </div>`;
  }).join('');

  // Bind action buttons
  container.querySelectorAll('.suggest-action').forEach(btn => {
    const id = btn.dataset.suggestId;
    const s  = suggestions.find(x => x.id === id);
    if (s?.action?.fn) btn.addEventListener('click', () => { s.action.fn(); renderSuggestions(containerId); });
  });
}

// ── Show critical suggestions as toasts on session load ────────────────────
export function checkAndNotify() {
  const suggestions = analyzeSession();
  const critical = suggestions.filter(s => s.severity === 'warn' || s.severity === 'error');
  // Show at most 2 toasts to avoid overwhelming the user
  critical.slice(0, 2).forEach(s => {
    notify.warn(`${s.title}\n${s.detail}`, 6000);
  });
}
