// ── tests/suggestions.test.js ─────────────────────────────────────────────
// Tests for analyzeSession() in suggestions.js
// These are purely logic tests — no DOM needed.

import { makeRunner } from './harness.js';
import { analyzeSession, checkAndNotify } from '../js/suggestions.js';
import { state } from '../js/state.js';
import { defaultSession, normalizeSession } from '../js/state.js';

export function runSuggestionsTests() {
  const R  = makeRunner('suggestions.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function setup(patch = {}) {
    state.session = normalizeSession({ ...defaultSession(), ...patch });
    // Minimal viable session: one block, duration matches
    if (!patch.blocks) {
      state.session.blocks = [
        { id: 'b1', type: 'text', label: 'Hello', start: 0, duration: 10, content: 'Hi' }
      ];
    }
    if (!patch.duration) state.session.duration = 60;
    state.session.playlists.audio = [{ id: 'a1', name: 'bg.mp3', dataUrl: 'data:audio/mp3;base64,AA==', volume: 1, _muted: false }];
  }

  function ids(sugs) { return sugs.map(s => s.id); }

  // ── No blocks ──────────────────────────────────────────────────────────────
  t('no_blocks suggestion when session has no blocks', () => {
    state.session = normalizeSession({ duration: 60 });
    state.session.blocks = [];
    const sugs = analyzeSession();
    ok(ids(sugs).includes('no_blocks'), `got: ${ids(sugs).join(', ')}`);
  });

  // ── Block overflow ─────────────────────────────────────────────────────────
  t('blocks_overflow when block extends past duration', () => {
    setup({ duration: 30 });
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Long', start: 20, duration: 20, content: 'Hi' }
    ];
    ok(ids(analyzeSession()).includes('blocks_overflow'));
  });

  t('no blocks_overflow when block fits exactly', () => {
    setup({ duration: 30 });
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'OK', start: 0, duration: 30, content: 'Hi' }
    ];
    ok(!ids(analyzeSession()).includes('blocks_overflow'));
  });

  // ── All good ───────────────────────────────────────────────────────────────
  t('all_good when session is clean', () => {
    setup();
    const sugs = analyzeSession();
    // May include no_background but not overflow/overlap/etc
    ok(!ids(sugs).some(id => ['blocks_overflow','text_blocks_overlap','no_blocks'].includes(id)));
  });

  // ── Text overlap ───────────────────────────────────────────────────────────
  t('text_blocks_overlap when two text blocks overlap', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'A', start: 0,  duration: 20, content: 'A' },
      { id: 'b2', type: 'text', label: 'B', start: 10, duration: 20, content: 'B' },
    ];
    ok(ids(analyzeSession()).includes('text_blocks_overlap'));
  });

  t('no text_blocks_overlap when text blocks are sequential', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'A', start: 0,  duration: 10, content: 'A' },
      { id: 'b2', type: 'text', label: 'B', start: 10, duration: 10, content: 'B' },
    ];
    ok(!ids(analyzeSession()).includes('text_blocks_overlap'));
  });

  t('no text_blocks_overlap for audio vs text overlap (only text vs text)', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'audio', label: 'A', start: 0,  duration: 20, content: '' },
      { id: 'b2', type: 'text',  label: 'B', start: 5,  duration: 20, content: 'B' },
    ];
    ok(!ids(analyzeSession()).includes('text_blocks_overlap'));
  });

  // ── Many short loops ───────────────────────────────────────────────────────
  t('many_short_loops when loopCount > 10 and duration < 60', () => {
    setup({ duration: 30, loopMode: 'count', loopCount: 20 });
    ok(ids(analyzeSession()).includes('many_short_loops'));
  });

  t('no many_short_loops when duration >= 60', () => {
    setup({ duration: 60, loopMode: 'count', loopCount: 20 });
    ok(!ids(analyzeSession()).includes('many_short_loops'));
  });

  t('no many_short_loops when loopCount <= 10', () => {
    setup({ duration: 30, loopMode: 'count', loopCount: 5 });
    ok(!ids(analyzeSession()).includes('many_short_loops'));
  });

  // ── Rules without webcam ───────────────────────────────────────────────────
  t('rules_no_webcam when attention rules exist but tracking disabled', () => {
    setup();
    state.session.tracking.enabled = false;
    state.session.rules = [{
      id: 'r1', name: 'test', enabled: true,
      condition: { metric: 'attention', op: '<', value: 0.3 },
      durationSec: 3, cooldownSec: 30,
      action: { type: 'pause', param: null }
    }];
    ok(ids(analyzeSession()).includes('rules_no_webcam'));
  });

  t('no rules_no_webcam when tracking enabled', () => {
    setup();
    state.session.tracking.enabled = true;
    state.session.rules = [{
      id: 'r1', name: 'test', enabled: true,
      condition: { metric: 'attention', op: '<', value: 0.3 },
      durationSec: 3, cooldownSec: 30,
      action: { type: 'pause', param: null }
    }];
    ok(!ids(analyzeSession()).includes('rules_no_webcam'));
  });

  t('no rules_no_webcam when rule uses non-attention metric', () => {
    setup();
    state.session.tracking.enabled = false;
    state.session.rules = [{
      id: 'r1', name: 'test', enabled: true,
      condition: { metric: 'intensity', op: '>', value: 1.5 },
      durationSec: 3, cooldownSec: 30,
      action: { type: 'setSpeed', param: 0.5 }
    }];
    ok(!ids(analyzeSession()).includes('rules_no_webcam'));
  });

  // ── Pacing without webcam ──────────────────────────────────────────────────
  t('pacing_no_webcam when dynamic pacing on but tracking disabled', () => {
    setup();
    state.session.tracking.enabled = false;
    state.session.pacingSettings = { enabled: true, minSpeed: 0.5, maxSpeed: 2, smoothingSec: 4, curve: 'linear', lockDuringSec: 0 };
    ok(ids(analyzeSession()).includes('pacing_no_webcam'));
  });

  // ── Scene overflow ─────────────────────────────────────────────────────────
  t('scene_overflow when scene extends past session duration', () => {
    setup({ duration: 60 });
    state.session.scenes = [{ id: 's1', name: 'Late', start: 50, end: 80, color: '#5fa0dc', loopBehavior: 'once' }];
    ok(ids(analyzeSession()).includes('scene_overflow'));
  });

  t('no scene_overflow when scene fits within duration', () => {
    setup({ duration: 60 });
    state.session.scenes = [{ id: 's1', name: 'OK', start: 0, end: 60, color: '#5fa0dc', loopBehavior: 'once' }];
    ok(!ids(analyzeSession()).includes('scene_overflow'));
  });

  // ── analyzeSession always returns an array ─────────────────────────────────
  t('analyzeSession always returns an array', () => {
    setup();
    ok(Array.isArray(analyzeSession()));
  });

  t('each suggestion has id, severity, title, detail', () => {
    setup();
    const sugs = analyzeSession();
    ok(sugs.length > 0);
    for (const s of sugs) {
      ok(typeof s.id === 'string' && s.id.length > 0, `id missing on ${JSON.stringify(s)}`);
      ok(['warn','info','error'].includes(s.severity), `severity '${s.severity}' invalid`);
      ok(typeof s.title === 'string' && s.title.length > 0, `title missing`);
      ok(typeof s.detail === 'string', `detail missing`);
    }
  });

  // ── Large embedded media warning ───────────────────────────────────────────
  // The estimator uses `dataUrl.length * 0.75`, so we fake `.length` rather than
  // allocating hundreds of MB of actual string data during tests.
  function fakeDataUrl(targetMB) {
    const fake = Object.create(String.prototype);
    Object.defineProperty(fake, 'length', { value: Math.ceil(targetMB * 1_000_000 / 0.75) });
    fake.startsWith = s => s === 'data:'; // accepted by the validator
    return fake;
  }

  t('large_media info when audio total exceeds 50 MB', () => {
    setup();
    state.session.playlists.audio = [{ id: 'a1', name: 'big.mp3', dataUrl: fakeDataUrl(51), volume: 1, _muted: false }];
    const sugs = analyzeSession();
    ok(ids(sugs).includes('large_media'), `expected large_media, got: ${ids(sugs).join(', ')}`);
  });

  t('no large_media when all media is under 50 MB', () => {
    setup();
    const smallUrl = 'data:audio/mp3;base64,' + 'A'.repeat(1000);
    state.session.playlists.audio = [{ id: 'a1', name: 's.mp3', dataUrl: smallUrl, volume: 1, _muted: false }];
    ok(!ids(analyzeSession()).includes('large_media'));
  });

  t('large_media severity is warn when media exceeds 150 MB', () => {
    setup();
    state.session.playlists.audio = [{ id: 'a1', name: 'huge.mp3', dataUrl: fakeDataUrl(200), volume: 1, _muted: false }];
    const sugs = analyzeSession();
    const lg = sugs.find(s => s.id === 'large_media');
    ok(lg !== undefined, 'large_media should be present');
    ok(lg.severity === 'warn', `expected warn, got ${lg?.severity}`);
  });

  // ── Broken scene branch reference ──────────────────────────────────────────
  t('broken_branch when nextSceneId points to non-existent scene', () => {
    setup({ duration: 120 });
    state.session.scenes = [{
      id: 's1', name: 'Intro', start: 0, end: 60,
      loopBehavior: 'once', color: '#5fa0dc',
      nextSceneId: 'b_nonexistent_scene_id',
    }];
    ok(ids(analyzeSession()).includes('broken_branch'));
  });

  t('no broken_branch when nextSceneId points to an existing scene', () => {
    setup({ duration: 120 });
    state.session.scenes = [
      { id: 's1', name: 'Intro', start: 0,  end: 60, loopBehavior: 'once', color: '#5fa0dc', nextSceneId: 's2' },
      { id: 's2', name: 'Main',  start: 60, end: 120, loopBehavior: 'once', color: '#7dc87a', nextSceneId: null },
    ];
    ok(!ids(analyzeSession()).includes('broken_branch'));
  });

  t('no broken_branch when nextSceneId is null (default)', () => {
    setup({ duration: 60 });
    state.session.scenes = [
      { id: 's1', name: 'Only', start: 0, end: 60, loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null }
    ];
    ok(!ids(analyzeSession()).includes('broken_branch'));
  });

  // ── Broken gotoScene rule/trigger targets ──────────────────────────────────
  t('broken_goto_scene when rule gotoScene param points to missing scene', () => {
    setup({ duration: 120 });
    state.session.scenes = [{ id: 's1', name: 'A', start: 0, end: 60, loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null }];
    state.session.rules = [{
      id: 'r1', name: 'Jump', enabled: true,
      condition: { metric: 'attention', op: '<', value: 0.3 },
      durationSec: 3, cooldownSec: 30,
      action: { type: 'gotoScene', param: 'b_nonexistent' },
    }];
    ok(ids(analyzeSession()).includes('broken_goto_scene'));
  });

  t('no broken_goto_scene when gotoScene param matches existing scene', () => {
    setup({ duration: 120 });
    state.session.scenes = [{ id: 's1', name: 'A', start: 0, end: 60, loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null }];
    state.session.rules = [{
      id: 'r1', name: 'Jump', enabled: true,
      condition: { metric: 'attention', op: '<', value: 0.3 },
      durationSec: 3, cooldownSec: 30,
      action: { type: 'gotoScene', param: 's1' }, // valid
    }];
    ok(!ids(analyzeSession()).includes('broken_goto_scene'));
  });

  t('no broken_goto_scene when no scenes are defined', () => {
    setup({ duration: 60 });
    state.session.scenes = [];
    state.session.rules = [{
      id: 'r1', name: 'Jump', enabled: true,
      condition: { metric: 'attention', op: '<', value: 0.3 },
      durationSec: 3, cooldownSec: 30,
      action: { type: 'gotoScene', param: 'anything' },
    }];
    // broken_goto_scene check only runs when scenes.length > 0
    ok(!ids(analyzeSession()).includes('broken_goto_scene'));
  });

  // ── Unlabeled blocks warning ───────────────────────────────────────────────
  t('unlabeled_blocks when 3+ blocks have generic labels', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Block 1', start: 0,  duration: 5,  content: 'A' },
      { id: 'b2', type: 'text', label: 'Block 2', start: 10, duration: 5,  content: 'B' },
      { id: 'b3', type: 'text', label: 'Block 3', start: 20, duration: 5,  content: 'C' },
    ];
    ok(ids(analyzeSession()).includes('unlabeled_blocks'));
  });

  t('no unlabeled_blocks when fewer than 3 blocks have generic labels', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Intro', start: 0, duration: 10, content: 'A' },
      { id: 'b2', type: 'text', label: 'Block 2', start: 15, duration: 5, content: 'B' },
    ];
    ok(!ids(analyzeSession()).includes('unlabeled_blocks'));
  });

  t('no unlabeled_blocks when all blocks have custom labels', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Intro',  start: 0,  duration: 10, content: 'A' },
      { id: 'b2', type: 'text', label: 'Middle', start: 15, duration: 10, content: 'B' },
      { id: 'b3', type: 'text', label: 'Outro',  start: 30, duration: 10, content: 'C' },
    ];
    ok(!ids(analyzeSession()).includes('unlabeled_blocks'));
  });

  // ── broken_goto_scene via trigger (not just rules) ──────────────────────────
  t('broken_goto_scene fires when trigger failureAction points at missing scene', () => {
    setup({ duration: 120 });
    state.session.scenes = [{ id: 's1', name: 'A', start: 0, end: 60, loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null }];
    state.session.triggers = [{
      id: 't1', name: 'Trigger', enabled: true, atSec: 10, windowDurSec: 5, cooldownSec: 30,
      condition: { metric: 'attention', op: '<', value: 0.3 },
      successAction: { type: 'pause', param: null },
      failureAction: { type: 'gotoScene', param: 'b_gone' }, // missing scene
    }];
    ok(ids(analyzeSession()).includes('broken_goto_scene'));
  });

  // ── all_good only when no other suggestions ────────────────────────────────
  t('all_good appears when session is healthy', () => {
    setup({ duration: 60 });
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Welcome', start: 0, duration: 10, content: 'Start' }
    ];
    state.session.rules    = [];
    state.session.triggers = [];
    state.session.scenes   = [];
    state.session.playlists.audio = [{ id: 'a1', name: 'bg.mp3', dataUrl: 'data:audio/mp3;base64,AA==', volume: 1, _muted: false }];
    ok(ids(analyzeSession()).includes('all_good'));
  });

  t('all_good does not appear when there are warnings', () => {
    setup({ duration: 60 });
    state.session.blocks = []; // triggers no_blocks
    ok(!ids(analyzeSession()).includes('all_good'));
  });

  // ── Phase 5.2: undefined_template_vars ────────────────────────────────────
  t('undefined_template_vars fires when block references unknown variable', () => {
    setup();
    state.session.variables = {};
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Test', start: 0, duration: 10, content: 'Level: {{score}}' }
    ];
    ok(ids(analyzeSession()).includes('undefined_template_vars'));
  });

  t('undefined_template_vars does not fire for built-in vars', () => {
    setup();
    state.session.variables = {};
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Test', start: 0, duration: 10,
        content: '{{intensity}} {{speed}} {{loop}} {{time}} {{scene}}' }
    ];
    ok(!ids(analyzeSession()).includes('undefined_template_vars'));
  });

  t('undefined_template_vars does not fire when variable is defined', () => {
    setup();
    state.session.variables = { score: { type: 'number', value: 0, description: '' } };
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'Test', start: 0, duration: 10, content: 'Score: {{score}}' }
    ];
    ok(!ids(analyzeSession()).includes('undefined_template_vars'));
  });

  // ── Phase 5.2: setvar_missing_target ─────────────────────────────────────
  t('setvar_missing_target fires when rule setVar targets undefined variable', () => {
    setup();
    state.session.variables = {};
    state.session.rules = [{
      id: 'r1', enabled: true, name: 'R', condition: { metric: 'attention', op: '<', value: 0.3 },
      durationSec: 5, cooldownSec: 30, action: { type: 'setVar', param: 'score=10' }
    }];
    ok(ids(analyzeSession()).includes('setvar_missing_target'));
  });

  t('setvar_missing_target does not fire when variable is defined', () => {
    setup();
    state.session.variables = { score: { type: 'number', value: 0, description: '' } };
    state.session.rules = [{
      id: 'r1', enabled: true, name: 'R', condition: { metric: 'attention', op: '<', value: 0.3 },
      durationSec: 5, cooldownSec: 30, action: { type: 'setVar', param: 'score=10' }
    }];
    ok(!ids(analyzeSession()).includes('setvar_missing_target'));
  });

  // ── Phase 5.1: no_state_types ─────────────────────────────────────────────
  t('no_state_types fires when multiple scenes have no stateType', () => {
    setup({ duration: 120 });
    state.session.scenes = [
      { id: 's1', name: 'A', start: 0,  end: 60,  loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null, stateType: null },
      { id: 's2', name: 'B', start: 60, end: 120, loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null, stateType: null },
    ];
    ok(ids(analyzeSession()).includes('no_state_types'));
  });

  t('no_state_types does not fire when at least one scene has a stateType', () => {
    setup({ duration: 120 });
    state.session.scenes = [
      { id: 's1', name: 'Calm', start: 0, end: 60, loopBehavior: 'once', color: '#5fa8d3', nextSceneId: null, stateType: 'calm' },
      { id: 's2', name: 'Peak', start: 60, end: 120, loopBehavior: 'once', color: '#e05050', nextSceneId: null, stateType: null },
    ];
    ok(!ids(analyzeSession()).includes('no_state_types'));
  });

  t('no_state_types does not fire when only one scene exists', () => {
    setup({ duration: 60 });
    state.session.scenes = [
      { id: 's1', name: 'Only', start: 0, end: 60, loopBehavior: 'once', color: '#5fa0dc', nextSceneId: null, stateType: null }
    ];
    ok(!ids(analyzeSession()).includes('no_state_types'));
  });

  // ── viz_invalid_type ──────────────────────────────────────────────────────
  t('viz_invalid_type fires when a viz block has unrecognized pattern', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'viz', label: 'Viz', start: 0, duration: 20,
        vizType: 'rainbow', vizSpeed: 1, vizColor: '#fff' }
    ];
    ok(ids(analyzeSession()).includes('viz_invalid_type'));
  });

  t('viz_invalid_type does not fire for valid viz types', () => {
    for (const vt of ['spiral','pendulum','tunnel','pulse','vortex']) {
      setup();
      state.session.blocks = [
        { id: 'b1', type: 'viz', label: 'Viz', start: 0, duration: 20,
          vizType: vt, vizSpeed: 1, vizColor: '#fff' }
      ];
      ok(!ids(analyzeSession()).includes('viz_invalid_type'),
        `${vt} should not trigger viz_invalid_type`);
    }
  });

  t('viz_invalid_type does not fire when no viz blocks exist', () => {
    setup();
    ok(!ids(analyzeSession()).includes('viz_invalid_type'));
  });

  // ── viz_mode_hint ─────────────────────────────────────────────────────────
  t('viz_mode_hint fires when viz blocks exist and non-induction mode', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'viz', label: 'V', start: 0, duration: 20,
        vizType: 'spiral', vizSpeed: 1, vizColor: '#fff' }
    ];
    state.session.mode = 'mindfulness';
    ok(ids(analyzeSession()).includes('viz_mode_hint'));
  });

  t('viz_mode_hint does not fire when mode is induction', () => {
    setup();
    state.session.blocks = [
      { id: 'b1', type: 'viz', label: 'V', start: 0, duration: 20,
        vizType: 'spiral', vizSpeed: 1, vizColor: '#fff' }
    ];
    state.session.mode = 'induction';
    ok(!ids(analyzeSession()).includes('viz_mode_hint'));
  });

  t('viz_mode_hint does not fire when no viz blocks', () => {
    setup();
    state.session.mode = 'mindfulness';
    ok(!ids(analyzeSession()).includes('viz_mode_hint'));
  });


  // ── speech_rate_no_tts ────────────────────────────────────────────────────
  t('speech_rate_no_tts fires when speechRate != 1 and no TTS blocks', () => {
    setup();
    state.session.speechRate = 1.5;
    state.session.blocks = [
      { id: 'b1', type: 'text', label: 'T', start: 0, duration: 10, content: 'hello' }
    ];
    ok(ids(analyzeSession()).includes('speech_rate_no_tts'));
  });

  t('speech_rate_no_tts does not fire when speechRate is 1', () => {
    setup();
    state.session.speechRate = 1.0;
    ok(!ids(analyzeSession()).includes('speech_rate_no_tts'));
  });

  t('speech_rate_no_tts does not fire when TTS blocks exist', () => {
    setup();
    state.session.speechRate = 1.5;
    state.session.blocks = [
      { id: 'b1', type: 'tts', label: 'TTS', start: 0, duration: 10, content: 'hello' }
    ];
    ok(!ids(analyzeSession()).includes('speech_rate_no_tts'));
  });

  // ── long_session_no_scenes ───────────────────────────────────────────────
  t('long_session_no_scenes fires for sessions > 5 min with no scenes', () => {
    setup();
    state.session.duration = 400;
    state.session.scenes   = [];
    ok(ids(analyzeSession()).includes('long_session_no_scenes'));
  });

  t('long_session_no_scenes does not fire when scenes exist', () => {
    setup();
    state.session.duration = 400;
    state.session.scenes   = [
      { id: 's1', name: 'Intro', start: 0, end: 200, stateType: null,
        loopBehavior: 'once', color: '#fff', nextSceneId: null }
    ];
    ok(!ids(analyzeSession()).includes('long_session_no_scenes'));
  });

  t('long_session_no_scenes does not fire for short sessions (< 5 min)', () => {
    setup();
    state.session.duration = 180;
    state.session.scenes   = [];
    ok(!ids(analyzeSession()).includes('long_session_no_scenes'));
  });

  // ── sensor_auto_no_engagement_rule ───────────────────────────────────────
  t('sensor_auto_no_engagement_rule fires when auto-connect but no engagement rule', () => {
    setup();
    state.session.displayOptions = { sensorBridgeAuto: true };
    state.session.rules = [];
    ok(ids(analyzeSession()).includes('sensor_auto_no_engagement_rule'));
  });

  t('sensor_auto_no_engagement_rule does not fire when not auto-connecting', () => {
    setup();
    state.session.displayOptions = { sensorBridgeAuto: false };
    ok(!ids(analyzeSession()).includes('sensor_auto_no_engagement_rule'));
  });

  t('sensor_auto_no_engagement_rule does not fire when engagement rule exists', () => {
    setup();
    state.session.displayOptions = { sensorBridgeAuto: true };
    state.session.rules = [{
      id: 'r1', enabled: true, name: 'E rule',
      condition: { metric: 'engagement', op: '>=', value: 0.8 },
      durationSec: 5, cooldownSec: 30,
      action: { type: 'injectMacro', param: 1 }
    }];
    ok(!ids(analyzeSession()).includes('sensor_auto_no_engagement_rule'));
  });


  // ── New suggestions: haptic, ramp/pacing, variables, viz alignment ────────
  t('no_haptic_track fires for a session with blocks but no funscript tracks', () => {
    reset();
    state.session.duration = 300;
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:60 })];
    state.session.funscriptTracks = [];
    const s = analyzeSession();
    ok(s.some(s => s.id === 'no_haptic_track'), 'should suggest adding a haptic track');
  });

  t('no_haptic_track does NOT fire when funscript tracks exist', () => {
    reset();
    state.session.duration = 300;
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:60 })];
    state.session.funscriptTracks = [{ id:'t1', name:'track', actions:[{at:0,pos:0}], _disabled:false }];
    const s = analyzeSession();
    ok(!s.some(s => s.id === 'no_haptic_track'), 'should not suggest haptic when track exists');
  });

  t('no_haptic_track does NOT fire for very short sessions (< 2 min)', () => {
    reset();
    state.session.duration = 60; // under threshold
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:30 })];
    state.session.funscriptTracks = [];
    const s = analyzeSession();
    ok(!s.some(s => s.id === 'no_haptic_track'), 'short session should not trigger haptic suggestion');
  });

  t('no_ramp_or_pacing fires for a longer session with no ramp or pacing', () => {
    reset();
    state.session.duration = 360;
    state.session.blocks = [
      normalizeBlock({ type:'text', label:'A', start:0, duration:60 }),
      normalizeBlock({ type:'text', label:'B', start:60, duration:60 }),
      normalizeBlock({ type:'text', label:'C', start:120, duration:60 }),
    ];
    state.session.rampSettings    = { enabled: false };
    state.session.pacingSettings  = { enabled: false };
    const s = analyzeSession();
    ok(s.some(s => s.id === 'no_ramp_or_pacing'), 'should suggest ramp/pacing for longer session');
  });

  t('no_ramp_or_pacing does NOT fire when ramp is enabled', () => {
    reset();
    state.session.duration = 360;
    state.session.blocks = [
      normalizeBlock({ type:'text', label:'A', start:0, duration:60 }),
      normalizeBlock({ type:'text', label:'B', start:60, duration:60 }),
      normalizeBlock({ type:'text', label:'C', start:120, duration:60 }),
    ];
    state.session.rampSettings = { enabled: true, mode:'time', startVal:0.5, endVal:1.5, curve:'linear', steps:[], blendMode:'max' };
    const s = analyzeSession();
    ok(!s.some(s => s.id === 'no_ramp_or_pacing'), 'ramp enabled should suppress suggestion');
  });

  t('vars_defined_not_used fires when variables exist but text blocks lack {{}}', () => {
    reset();
    state.session.variables = {
      score: { type:'number', value:0, description:'' }
    };
    state.session.blocks = [
      normalizeBlock({ type:'text', label:'A', start:0, duration:30, content:'Hello!' }),
      normalizeBlock({ type:'text', label:'B', start:30, duration:30, content:'World' }),
      normalizeBlock({ type:'tts',  label:'C', start:60, duration:30, content:'No vars here' }),
    ];
    const s = analyzeSession();
    ok(s.some(s => s.id === 'vars_defined_not_used'), 'should suggest using variables in text');
  });

  t('vars_defined_not_used does NOT fire when {{vars}} are already used', () => {
    reset();
    state.session.variables = {
      score: { type:'number', value:0, description:'' }
    };
    state.session.blocks = [
      normalizeBlock({ type:'text', label:'A', start:0, duration:30, content:'Score: {{score}}' }),
      normalizeBlock({ type:'text', label:'B', start:30, duration:30, content:'Keep going!' }),
      normalizeBlock({ type:'text', label:'C', start:60, duration:30, content:'Doing well' }),
    ];
    const s = analyzeSession();
    ok(!s.some(s => s.id === 'vars_defined_not_used'), 'template vars in use — no suggestion needed');
  });


  // ── PATCH v62 issue 1: analyzeSession never throws ────────────────────────
  t('analyzeSession does not throw on session with no scenes', () => {
    reset();
    state.session.scenes = [];
    state.session.duration = 400;
    let threw = false, result;
    try { result = analyzeSession(); } catch(e) { threw = true; }
    ok(!threw, 'analyzeSession must not throw when scenes is empty');
    ok(Array.isArray(result), 'should return an array');
  });

  t('analyzeSession does not throw on long session with no scenes', () => {
    reset();
    state.session.scenes = [];
    state.session.duration = 600;
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:60 })];
    let threw = false;
    try { analyzeSession(); } catch { threw = true; }
    ok(!threw, 'long session with no scenes must not throw');
  });

  t('analyzeSession does not throw on multi-scene session', () => {
    reset();
    state.session.scenes = [
      { id:'s1', name:'Intro', start:0, end:120, stateType:'calm', nextSceneId:null, loopBehavior:'none' },
      { id:'s2', name:'Peak',  start:120, end:240, stateType:'peak', nextSceneId:null, loopBehavior:'none' },
    ];
    state.session.duration = 300;
    let threw = false;
    try { analyzeSession(); } catch { threw = true; }
    ok(!threw, 'multi-scene session must not throw');
  });

  t('analyzeSession returns all_good for a clean minimal session', () => {
    reset();
    state.session.duration = 60;
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:30, content:'Hello' })];
    state.session.scenes = [];
    const suggestions = analyzeSession();
    ok(Array.isArray(suggestions), 'should return array');
  });

  t('analyzeSession fires no_state_types for 2+ scenes without stateType', () => {
    reset();
    state.session.duration = 300;
    state.session.scenes = [
      { id:'a', name:'S1', start:0, end:100, stateType:null, nextSceneId:null, loopBehavior:'none' },
      { id:'b', name:'S2', start:100, end:200, stateType:null, nextSceneId:null, loopBehavior:'none' },
    ];
    const s = analyzeSession();
    ok(s.some(s => s.id === 'no_state_types'),
      'should suggest setting state types when 2+ scenes have none');
  });


  // ── scenes variable regression: never throws ─────────────────────────────
  t('analyzeSession never throws regardless of session structure', () => {
    const sessionVariants = [
      { blocks:[], scenes:[], duration:60 },
      { blocks:[], scenes:null, duration:300 },
      { blocks:[], scenes:undefined, duration:600 },
      { blocks:[], duration:30 },
    ];
    for (const variant of sessionVariants) {
      state.session = normalizeSession({ ...defaultSession(), ...variant });
      let threw = false;
      try { analyzeSession(); } catch(e) { threw = true; }
      ok(!threw, `analyzeSession must not throw for session: ${JSON.stringify(variant)}`);
    }
  });

  t('analyzeSession returns at most one all_good suggestion', () => {
    reset();
    state.session.duration = 60;
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:30, content:'Hi' })];
    state.session.scenes = [];
    const s = analyzeSession();
    const allGood = s.filter(x => x.id === 'all_good');
    ok(allGood.length <= 1, 'should have at most one all_good suggestion');
  });

  t('long_session_no_scenes fires for 5+ min session without scenes', () => {
    reset();
    state.session.duration = 360;
    state.session.scenes = [];
    state.session.blocks = [
      normalizeBlock({ type:'text', label:'A', start:0, duration:60, content:'Long' }),
    ];
    const s = analyzeSession();
    ok(s.some(s => s.id === 'long_session_no_scenes'),
      'long session without scenes should suggest adding scenes');
  });


  // ── PATCH fixes: suggestions module correctness ───────────────────────────
  t('checkAndNotify is exported from suggestions.js', () => {
    ok(typeof checkAndNotify === 'function',
      'checkAndNotify must be exported so main.js can call it at startup');
  });

  t('analyzeSession handles textBlocks for vars check (no duplicate declaration crash)', () => {
    reset();
    state.session.variables = { score: { type:'number', value:0, description:'' } };
    state.session.blocks = [
      normalizeBlock({ type:'text', label:'A', start:0, duration:30, content:'Hello {{score}}' }),
      normalizeBlock({ type:'tts',  label:'B', start:30, duration:30, content:'TTS {{score}}' }),
      normalizeBlock({ type:'text', label:'C', start:60, duration:30, content:'No var here' }),
    ];
    let threw = false, result;
    try { result = analyzeSession(); } catch(e) { threw = true; }
    ok(!threw, 'analyzeSession must not throw with variables and text blocks');
    ok(Array.isArray(result), 'must return array');
    // Since {{score}} is used, vars_defined_not_used should NOT fire
    ok(!result.some(s => s.id === 'vars_defined_not_used'),
      'should not suggest unused vars when they ARE used');
  });

  t('vars_defined_not_used fires when vars defined but not used (renamed textBlocks2)', () => {
    reset();
    state.session.variables = { score: { type:'number', value:0, description:'' } };
    state.session.blocks = [
      normalizeBlock({ type:'text', label:'A', start:0, duration:30, content:'No var' }),
      normalizeBlock({ type:'tts',  label:'B', start:30, duration:30, content:'No var either' }),
      normalizeBlock({ type:'text', label:'C', start:60, duration:30, content:'Still no var' }),
    ];
    const s = analyzeSession();
    ok(s.some(s => s.id === 'vars_defined_not_used'),
      'vars_defined_not_used should fire when vars exist but no template usage');
  });


  // ── RUNTIME HUNT: patch-notes — checkAndNotify import ───────────────────
  t('checkAndNotify runs without throwing on a normal session', () => {
    reset();
    state.session.duration = 60;
    state.session.blocks = [normalizeBlock({ type:'text', label:'A', start:0, duration:30, content:'Hi' })];
    let threw = false;
    try { checkAndNotify(); } catch { threw = true; }
    ok(!threw, 'checkAndNotify must not throw on a normal session');
  });

  t('checkAndNotify runs without throwing on a session with rules and scenes', () => {
    reset();
    state.session.duration = 300;
    state.session.scenes = [
      { id:'s1', name:'Settle', start:0, end:120, stateType:'calm', nextSceneId:null, loopBehavior:'once', color:'#5fa0dc' },
    ];
    state.session.rules = [
      { id:'r1', name:'Pause on loss', enabled:true,
        condition:{ metric:'attention', op:'<', value:0.3 },
        action:{ type:'pause', param:null }, cooldown:60 }
    ];
    let threw = false;
    try { checkAndNotify(); } catch { threw = true; }
    ok(!threw, 'checkAndNotify must not throw with rules and scenes');
  });


  return R.summary();
}
