// ── content-packs.js ────────────────────────────────────────────────────────
// Phase 3 — Content Packs
//
// Pre-built session templates authors can load as starting points.
// Each pack is a complete normalizable session object with blocks, scenes,
// rules, state types, and suggested modes.
//
// To add a pack: push an object to CONTENT_PACKS following the schema below.
// Packs are applied via loadContentPack(id) which merges into the current
// session after a history snapshot, then calls persist() and re-renders.

import { state, persist, normalizeSession, uid, esc } from './state.js';
import { history } from './history.js';
import { notify } from './notify.js';

// ── Pack schema ───────────────────────────────────────────────────────────────
// { id, name, category, icon, description, suggestedMode, session: <partial> }
// session may include: blocks, scenes, rules, duration, variables, rampSettings

export const CONTENT_PACKS = [

  // ── Induction / Trance ────────────────────────────────────────────────────
  {
    id:            'induction-classic',
    name:          'Classic Induction',
    category:      'Induction & Trance',
    icon:          '🌀',
    suggestedMode: 'induction',
    description:   'A calm progressive relaxation and focus induction. Suitable for beginners. Text overlays + TTS guidance.',
    session: {
      name: 'Classic Induction',
      duration: 300,
      loopMode: 'none',
      speechRate: 0.85,
      scenes: [
        { name: 'Settle', start: 0,   end: 60,  stateType: 'calm',     color: '#5fa8d3', loopBehavior: 'once', nextSceneId: null },
        { name: 'Drop',   start: 60,  end: 180, stateType: 'build',    color: '#f0c040', loopBehavior: 'once', nextSceneId: null },
        { name: 'Depth',  start: 180, end: 270, stateType: 'peak',     color: '#7a1a2e', loopBehavior: 'once', nextSceneId: null },
        { name: 'Rise',   start: 270, end: 300, stateType: 'recovery', color: '#7dc87a', loopBehavior: 'once', nextSceneId: null },
      ],
      blocks: [
        { type: 'text',  label: 'Welcome',         start: 0,   duration: 15, content: 'Close your eyes.\nYou are safe.', fontSize: 1.3, _position: 'center' },
        { type: 'tts',   label: 'Breathing guide', start: 16,  duration: 20, content: 'Breathe in slowly for four counts. Hold. Now breathe out for six counts. Let each breath carry tension away.', volume: 0.85, voiceName: '' },
        { type: 'text',  label: 'Anchor',          start: 38,  duration: 20, content: 'Heavier.\nDrifting.\nSafe.', fontSize: 1.55, _position: 'center' },
        { type: 'pause', label: 'Silence',         start: 60,  duration: 15, content: '' },
        { type: 'tts',   label: 'Drop',            start: 77,  duration: 25, content: 'With each breath, you sink a little deeper. There is nothing you need to do right now. Simply allow.', volume: 0.80, voiceName: '' },
        { type: 'text',  label: 'Numbers',         start: 104, duration: 30, content: '10\n\n9\n\n8\n\n7\n\n6\n\n5', fontSize: 1.8, _position: 'center' },
        { type: 'tts',   label: 'Depth anchor',    start: 136, duration: 20, content: 'You are relaxed and focused. This is exactly where you are meant to be.', volume: 0.80, voiceName: '' },
        { type: 'pause', label: 'Deep silence',    start: 158, duration: 22, content: '' },
        { type: 'text',  label: 'Depth text',      start: 182, duration: 25, content: 'Deep.\nStill.\nPresent.', fontSize: 1.6, _position: 'center' },
        { type: 'tts',   label: 'Return',          start: 270, duration: 20, content: 'Slowly, awareness begins to return. At your own pace, begin to feel the room around you.', volume: 0.85, voiceName: '' },
        { type: 'text',  label: 'Rise',            start: 292, duration: 8,  content: 'Coming back.', fontSize: 1.2, _position: 'center' },
      ],
    },
  },

  // ── Conditioning ─────────────────────────────────────────────────────────
  {
    id:            'conditioning-foundation',
    name:          'Conditioning Foundation',
    category:      'Behavioral Conditioning',
    icon:          '⚙',
    suggestedMode: 'conditioning',
    description:   'Attention-reward loop. Builds focus and compliance through consistent positive reinforcement. Ideal first conditioning session.',
    session: {
      name: 'Conditioning Foundation',
      duration: 240,
      loopMode: 'count',
      loopCount: 2,
      speechRate: 0.90,
      variables: {
        loop_count: { type: 'number', value: 0, description: 'Tracks current repetition' },
      },
      scenes: [
        { name: 'Calibration', start: 0,   end: 45,  stateType: 'calm',  color: '#5fa8d3', loopBehavior: 'once', nextSceneId: null },
        { name: 'Training',    start: 45,  end: 195, stateType: 'build', color: '#f0c040', loopBehavior: 'loop', nextSceneId: null },
        { name: 'Integration', start: 195, end: 240, stateType: 'recovery', color: '#7dc87a', loopBehavior: 'once', nextSceneId: null },
      ],
      blocks: [
        { type: 'text', label: 'Opening',        start: 0,   duration: 15, content: 'Focus.\nBreathe.', fontSize: 1.4, _position: 'center' },
        { type: 'tts',  label: 'Instructions',   start: 17,  duration: 25, content: 'This session will respond to your attention. When you maintain focus, you will be rewarded. When your mind wanders, you will be redirected.', volume: 0.85 },
        { type: 'text', label: 'Attention cue',  start: 45,  duration: 20, content: '● Focus here', fontSize: 1.2, _position: 'center' },
        { type: 'tts',  label: 'Good',           start: 67,  duration: 8,  content: 'Good. Stay present.', volume: 0.80 },
        { type: 'text', label: 'Task',           start: 78,  duration: 40, content: 'Hold your attention steady.\nNotice any urge to drift — and return.', fontSize: 1.1, _position: 'center' },
        { type: 'pause', label: 'Silent hold',   start: 120, duration: 30, content: '' },
        { type: 'tts',  label: 'Halfway',        start: 152, duration: 10, content: 'Well done. Halfway through.', volume: 0.80 },
        { type: 'text', label: 'Push',           start: 164, duration: 30, content: 'Deeper.\nStay with it.', fontSize: 1.35, _position: 'center' },
        { type: 'tts',  label: 'Closing',        start: 200, duration: 15, content: 'The pattern is becoming part of you. Each session strengthens this.', volume: 0.85 },
        { type: 'text', label: 'End',            start: 230, duration: 8,  content: 'Complete.', fontSize: 1.4, _position: 'center' },
      ],
      rules: [
        { name: 'Reward sustained focus', enabled: true,
          condition: { metric: 'attention', op: '>=', value: 0.80 }, durationSec: 12, cooldownSec: 45,
          action: { type: 'setIntensity', param: 1.3 } },
        { name: 'Redirect on drift', enabled: true,
          condition: { metric: 'attention', op: '<', value: 0.25 }, durationSec: 5, cooldownSec: 30,
          action: { type: 'setIntensity', param: 0.3 } },
      ],
    },
  },

  // ── Partner / Training ────────────────────────────────────────────────────
  {
    id:            'partner-intro',
    name:          'Partner Introduction',
    category:      'Partner Sessions',
    icon:          '🤝',
    suggestedMode: 'training',
    description:   'First shared session for operator + primary user. Establishes the dynamic with clear guidance for both roles. Operator keeps manual control.',
    session: {
      name: 'Partner Introduction',
      duration: 180,
      loopMode: 'none',
      speechRate: 0.90,
      variables: {
        partner_name: { type: 'string', value: '', description: "Primary user's name (operator fills in)" },
      },
      scenes: [
        { name: 'Meeting',    start: 0,   end: 60,  stateType: 'calm',  color: '#5fa8d3', loopBehavior: 'once', nextSceneId: null },
        { name: 'Exploring',  start: 60,  end: 140, stateType: 'build', color: '#f0c040', loopBehavior: 'once', nextSceneId: null },
        { name: 'Completion', start: 140, end: 180, stateType: 'recovery', color: '#7dc87a', loopBehavior: 'once', nextSceneId: null },
      ],
      blocks: [
        { type: 'text', label: 'Welcome',     start: 0,   duration: 20, content: 'Welcome.\nSettle in together.', fontSize: 1.3, _position: 'center' },
        { type: 'tts',  label: 'Operator cue', start: 22,  duration: 30, content: 'Operator: take a moment to observe your partner. Adjust Live Controls to a comfortable starting point. There is no rush.', volume: 0.85 },
        { type: 'pause', label: 'Space',      start: 55,  duration: 10, content: '' },
        { type: 'text', label: 'Focus',       start: 67,  duration: 25, content: 'Present.\nOpen.', fontSize: 1.5, _position: 'center' },
        { type: 'tts',  label: 'Check in',   start: 94,  duration: 20, content: 'A gentle check-in. This is a partnership. Both of you set the pace together.', volume: 0.80 },
        { type: 'text', label: 'Midpoint',   start: 116, duration: 22, content: 'Stay with this.', fontSize: 1.2, _position: 'center' },
        { type: 'tts',  label: 'Close',      start: 142, duration: 20, content: 'Well done — both of you. Take a moment to acknowledge what you just shared.', volume: 0.85 },
        { type: 'text', label: 'End',        start: 165, duration: 12, content: 'Session complete.', fontSize: 1.3, _position: 'center' },
      ],
    },
  },

  // ── Solo / Surrender ──────────────────────────────────────────────────────
  {
    id:            'surrender-solo',
    name:          'Solo Surrender',
    category:      'Solo Sessions',
    icon:          '🌊',
    suggestedMode: 'surrender',
    description:   'High-trust solo experience. No pauses, full escalation. Set your safety parameters first, then let go.',
    session: {
      name: 'Solo Surrender',
      duration: 360,
      loopMode: 'none',
      speechRate: 0.80,
      scenes: [
        { name: 'Opening',  start: 0,   end: 60,  stateType: 'calm',     color: '#5fa8d3', loopBehavior: 'once', nextSceneId: null },
        { name: 'Building', start: 60,  end: 180, stateType: 'build',    color: '#f0c040', loopBehavior: 'once', nextSceneId: null },
        { name: 'Peak',     start: 180, end: 300, stateType: 'peak',     color: '#7a1a2e', loopBehavior: 'once', nextSceneId: null },
        { name: 'Return',   start: 300, end: 360, stateType: 'recovery', color: '#7dc87a', loopBehavior: 'once', nextSceneId: null },
      ],
      blocks: [
        { type: 'text',  label: 'Start',       start: 0,   duration: 20, content: 'This time is yours.\nLet go.', fontSize: 1.4, _position: 'center' },
        { type: 'tts',   label: 'Permission',  start: 22,  duration: 25, content: 'You have already done the hard part by showing up. Now you only have to be here — and experience.', volume: 0.80 },
        { type: 'pause', label: 'Silence',     start: 50,  duration: 15, content: '' },
        { type: 'text',  label: 'Surrender',   start: 67,  duration: 30, content: 'Sink.\nLet it take you.', fontSize: 1.6, _position: 'center' },
        { type: 'tts',   label: 'Building',    start: 100, duration: 20, content: 'Notice the build. You are allowed to want this.', volume: 0.75 },
        { type: 'pause', label: 'Open hold',   start: 122, duration: 55, content: '' },
        { type: 'text',  label: 'Peak anchor', start: 180, duration: 30, content: 'All the way.\nStay.', fontSize: 1.8, _position: 'center' },
        { type: 'pause', label: 'Peak hold',   start: 212, duration: 85, content: '' },
        { type: 'tts',   label: 'Return',      start: 302, duration: 22, content: 'Gently, begin to come back. Whatever you experienced — it was yours, completely.', volume: 0.80 },
        { type: 'text',  label: 'End',         start: 326, duration: 15, content: 'Well done.', fontSize: 1.4, _position: 'center' },
      ],
    },
  },

  // ── Mindfulness ───────────────────────────────────────────────────────────
  {
    id:            'grounding-reset',
    name:          'Grounding Reset',
    category:      'Mindfulness',
    icon:          '🧘',
    suggestedMode: 'mindfulness',
    description:   'Gentle come-down or reset. Calming anchors, low intensity, good after an intense session or a long day.',
    session: {
      name: 'Grounding Reset',
      duration: 180,
      loopMode: 'none',
      speechRate: 0.80,
      scenes: [
        { name: 'Grounding', start: 0,   end: 180, stateType: 'calm', color: '#5fa8d3', loopBehavior: 'once', nextSceneId: null },
      ],
      blocks: [
        { type: 'text',  label: 'Welcome back', start: 0,   duration: 18, content: 'You are safe.\nYou are here.', fontSize: 1.3, _position: 'center' },
        { type: 'tts',   label: 'Body scan',    start: 20,  duration: 30, content: 'Bring gentle attention to your body. Notice where you are holding tension. Without forcing anything, allow each breath to soften those places.', volume: 0.80 },
        { type: 'pause', label: 'Quiet',        start: 53,  duration: 20, content: '' },
        { type: 'text',  label: 'Anchors',      start: 75,  duration: 20, content: 'Grounded.\nPresent.\nOkay.', fontSize: 1.4, _position: 'center' },
        { type: 'tts',   label: 'Affirmation',  start: 97,  duration: 25, content: 'Whatever happened before this moment — it has passed. You are here now, and that is enough.', volume: 0.80 },
        { type: 'pause', label: 'Rest',         start: 124, duration: 35, content: '' },
        { type: 'text',  label: 'Closing',      start: 161, duration: 17, content: 'Rest.\nYou are done.', fontSize: 1.2, _position: 'center' },
      ],
    },
  },

  // ── Spiral Descent — Viz-Enhanced Induction ───────────────────────────────
  {
    id:            'spiral-descent',
    name:          'Spiral Descent',
    category:      'Induction & Trance',
    icon:          '🌀',
    suggestedMode: 'induction',
    description:   'A visual hypnotic induction using the Spiral animation block. The spiral deepens as the narration guides descent. Best experienced fullscreen.',
    session: {
      name: 'Spiral Descent',
      duration: 360,
      loopMode: 'none',
      speechRate: 0.80,
      notes: 'Uses the viz block type for a live hypnotic spiral during the drop phase. Run fullscreen for maximum effect.',
      scenes: [
        { name: 'Arrive',  start: 0,   end: 60,  stateType: 'calm',     color: '#5fa8d3', loopBehavior: 'once', nextSceneId: null },
        { name: 'Watch',   start: 60,  end: 180, stateType: 'build',    color: '#f0c040', loopBehavior: 'once', nextSceneId: null },
        { name: 'Drop',    start: 180, end: 300, stateType: 'peak',     color: '#7a1a2e', loopBehavior: 'once', nextSceneId: null },
        { name: 'Restore', start: 300, end: 360, stateType: 'recovery', color: '#7dc87a', loopBehavior: 'once', nextSceneId: null },
      ],
      blocks: [
        // Arrive — settle and prepare
        { type: 'text',  label: 'Welcome',       start: 0,   duration: 18, content: 'Find a comfortable position.\nClose your eyes.', fontSize: 1.3, _position: 'center' },
        { type: 'tts',   label: 'Settle',        start: 20,  duration: 30, content: 'Take three slow breaths. With each one, feel the tension leaving your shoulders, your jaw, your hands.', volume: 0.82, voiceName: '' },
        { type: 'pause', label: 'Silence',       start: 52,  duration: 10, content: '' },

        // Watch — spiral appears
        { type: 'viz',   label: 'Spiral begins', start: 62,  duration: 118,
          vizType: 'spiral', vizSpeed: 0.6, vizColor: '#c49a3c' },
        { type: 'tts',   label: 'Watch it',      start: 65,  duration: 25, content: 'When you are ready, open your eyes. Watch the spiral turn. There is nothing else you need to do right now.', volume: 0.78, voiceName: '' },
        { type: 'pause', label: 'Watching',      start: 93,  duration: 40, content: '' },
        { type: 'tts',   label: 'Soften',        start: 135, duration: 20, content: 'Let your eyes soften. Let the spiral carry your attention gently downward.', volume: 0.75, voiceName: '' },

        // Drop — deep trance
        { type: 'viz',   label: 'Deep spiral',   start: 182, duration: 118,
          vizType: 'spiral', vizSpeed: 0.35, vizColor: '#7a1a2e' },
        { type: 'tts',   label: 'Dropping',      start: 185, duration: 25, content: 'Deeper now. Each rotation takes you further in. You are safe. You are held.', volume: 0.72, voiceName: '' },
        { type: 'pause', label: 'Deep hold',     start: 212, duration: 60, content: '' },
        { type: 'text',  label: 'Deep text',     start: 274, duration: 24, content: 'Deep.', fontSize: 2.2, _position: 'center' },

        // Restore — come back
        { type: 'tts',   label: 'Return',        start: 302, duration: 22, content: 'Slowly, gently, awareness returns. At your own pace, become aware of the room. There is no rush.', volume: 0.80, voiceName: '' },
        { type: 'text',  label: 'End',           start: 338, duration: 18, content: 'Welcome back.', fontSize: 1.3, _position: 'center' },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // VISUALIZATION PACKS — 20 unique viz-only sessions
  // ════════════════════════════════════════════════════════════════════════════

  {
    id:'viz-spiral-descent', name:'Spiral Descent',
    category:'Visualization', icon:'🌀', suggestedMode:'mindfulness',
    description:'Classic Archimedes spiral, deep gold, accelerating over 6 minutes. Pure hypnotic induction no text, no TTS — just the pattern.',
    session:{ name:'Spiral Descent', duration:360, loopMode:'infinite', blocks:[
      { type:'viz', label:'Gold spiral', start:0, duration:360, vizType:'spiral', vizSpeed:0.6, vizColor:'#c49a3c' },
    ]},
  },

  {
    id:'viz-pendulum-steel', name:'Steel Pendulum',
    category:'Visualization', icon:'〰',  suggestedMode:'mindfulness',
    description:'Cold steel-blue harmonograph trace, slow and meditative. Pairs well with binaural alpha beats.',
    session:{ name:'Steel Pendulum', duration:480, loopMode:'infinite', blocks:[
      { type:'viz', label:'Pendulum', start:0, duration:480, vizType:'pendulum', vizSpeed:0.4, vizColor:'#4a8abb' },
    ]},
  },

  {
    id:'viz-tunnel-void', name:'Void Tunnel',
    category:'Visualization', icon:'⭕', suggestedMode:'mindfulness',
    description:'Deep crimson rings rushing inward out of total darkness. Depth induction for advanced subjects.',
    session:{ name:'Void Tunnel', duration:300, loopMode:'infinite', blocks:[
      { type:'viz', label:'Void tunnel', start:0, duration:300, vizType:'tunnel', vizSpeed:1.2, vizColor:'#8b1a1a' },
    ]},
  },

  {
    id:'viz-pulse-heart', name:'Heartbeat Sync',
    category:'Visualization', icon:'💗', suggestedMode:'mindfulness',
    description:'Rose-pink pulse rings timed to a resting heartrate. Use with 60 BPM audio for entrainment.',
    session:{ name:'Heartbeat Sync', duration:600, loopMode:'infinite', blocks:[
      { type:'viz', label:'Pulse', start:0, duration:600, vizType:'pulse', vizSpeed:0.5, vizColor:'#e06080' },
    ]},
  },

  {
    id:'viz-vortex-night', name:'Night Vortex',
    category:'Visualization', icon:'🌪', suggestedMode:'mindfulness',
    description:'Multi-arm vortex in near-black with faint violet arms. Surrender and submission induction.',
    session:{ name:'Night Vortex', duration:420, loopMode:'infinite', blocks:[
      { type:'viz', label:'Vortex', start:0, duration:420, vizType:'vortex', vizSpeed:0.8, vizColor:'#6a3080' },
    ]},
  },

  {
    id:'viz-lissajous-electric', name:'Electric Figure',
    category:'Visualization', icon:'∞', suggestedMode:'mindfulness',
    description:'Cyan Lissajous figure-8 that slowly rotates phase, creating an ever-shifting hypnotic knot.',
    session:{ name:'Electric Figure', duration:540, loopMode:'infinite', blocks:[
      { type:'viz', label:'Lissajous', start:0, duration:540, vizType:'lissajous', vizSpeed:0.7, vizColor:'#00d4cc' },
    ]},
  },

  {
    id:'viz-colorwash-aurora', name:'Aurora Wash',
    category:'Visualization', icon:'🎨', suggestedMode:'asmr',
    description:'Slow HSL drift across the full colour spectrum with a warm bias. Ambient and deeply calming.',
    session:{ name:'Aurora Wash', duration:720, loopMode:'infinite', blocks:[
      { type:'viz', label:'Aurora', start:0, duration:720, vizType:'colorwash', vizSpeed:0.25, vizColor:'#ff6b35' },
    ]},
  },

  {
    id:'viz-geozoom-crystal', name:'Crystal Lattice',
    category:'Visualization', icon:'🔷', suggestedMode:'mindfulness',
    description:'Nested hexagons zooming outward, simulating a crystal magnification from within.',
    session:{ name:'Crystal Lattice', duration:480, loopMode:'infinite', blocks:[
      { type:'viz', label:'Lattice', start:0, duration:480, vizType:'geometricoom', vizSpeed:0.9, vizColor:'#a0c8e8' },
    ]},
  },

  {
    id:'viz-starburst-golden', name:'Golden Starburst',
    category:'Visualization', icon:'✨', suggestedMode:'mindfulness',
    description:'Deep gold radiating spokes that shimmer and pulse. Energy and activation pattern.',
    session:{ name:'Golden Starburst', duration:300, loopMode:'infinite', blocks:[
      { type:'viz', label:'Starburst', start:0, duration:300, vizType:'starburst', vizSpeed:1.1, vizColor:'#f0c030' },
    ]},
  },

  {
    id:'viz-fractal-forest', name:'Fractal Forest',
    category:'Visualization', icon:'🕸', suggestedMode:'mindfulness',
    description:'Five-armed fractal branches in deep forest green, slowly rotating. Organic and grounding.',
    session:{ name:'Fractal Forest', duration:600, loopMode:'infinite', blocks:[
      { type:'viz', label:'Forest fractal', start:0, duration:600, vizType:'fractalweb', vizSpeed:0.35, vizColor:'#2e7d32' },
    ]},
  },

  {
    id:'viz-ripple-three-moons', name:'Three Moons',
    category:'Visualization', icon:'💧', suggestedMode:'asmr',
    description:'Three interference wave sources in silver-blue creating a shimmering interference pattern.',
    session:{ name:'Three Moons', duration:600, loopMode:'infinite', blocks:[
      { type:'viz', label:'Ripple', start:0, duration:600, vizType:'ripple', vizSpeed:0.6, vizColor:'#aabbcc' },
    ]},
  },

  {
    id:'viz-mandala-rose', name:'Rose Mandala',
    category:'Visualization', icon:'🔯', suggestedMode:'mindfulness',
    description:'Eight-petal rose mandala in warm magenta, four rotating layers. Meditative and balanced.',
    session:{ name:'Rose Mandala', duration:540, loopMode:'infinite', blocks:[
      { type:'viz', label:'Mandala', start:0, duration:540, vizType:'mandala', vizSpeed:0.5, vizColor:'#c0406a' },
    ]},
  },

  {
    id:'viz-spiral-speed', name:'Acceleration Spiral',
    category:'Visualization', icon:'🌀', suggestedMode:'conditioning',
    description:'Spiral that starts slow then ramps to 4× speed over 3 minutes — then resets. Mirrors arousal escalation.',
    session:{ name:'Acceleration Spiral', duration:360, loopMode:'count', loopCount:3, blocks:[
      { type:'viz', label:'Slow spiral',  start:0,   duration:60,  vizType:'spiral', vizSpeed:0.4, vizColor:'#c49a3c' },
      { type:'viz', label:'Med spiral',   start:60,  duration:60,  vizType:'spiral', vizSpeed:1.2, vizColor:'#d4a030' },
      { type:'viz', label:'Fast spiral',  start:120, duration:60,  vizType:'spiral', vizSpeed:2.8, vizColor:'#e07020' },
      { type:'viz', label:'Peak spiral',  start:180, duration:30,  vizType:'spiral', vizSpeed:4.0, vizColor:'#e84010' },
      { type:'viz', label:'Reset',        start:210, duration:30,  vizType:'spiral', vizSpeed:0.3, vizColor:'#8844aa' },
    ]},
  },

  {
    id:'viz-tunnel-colour-shift', name:'Colour Tunnel',
    category:'Visualization', icon:'⭕', suggestedMode:'mindfulness',
    description:'Tunnel that cycles through the whole spectrum, one colour every 30 seconds. Chakra progression.',
    session:{ name:'Colour Tunnel', duration:420, loopMode:'none', blocks:[
      { type:'viz', label:'Red',    start:0,   duration:60, vizType:'tunnel', vizSpeed:1.0, vizColor:'#cc2200' },
      { type:'viz', label:'Orange', start:60,  duration:60, vizType:'tunnel', vizSpeed:1.0, vizColor:'#e05010' },
      { type:'viz', label:'Yellow', start:120, duration:60, vizType:'tunnel', vizSpeed:1.0, vizColor:'#d4b000' },
      { type:'viz', label:'Green',  start:180, duration:60, vizType:'tunnel', vizSpeed:1.0, vizColor:'#228833' },
      { type:'viz', label:'Blue',   start:240, duration:60, vizType:'tunnel', vizSpeed:1.0, vizColor:'#2255bb' },
      { type:'viz', label:'Violet', start:300, duration:60, vizType:'tunnel', vizSpeed:1.0, vizColor:'#7722cc' },
      { type:'viz', label:'White',  start:360, duration:60, vizType:'tunnel', vizSpeed:1.0, vizColor:'#e8e0d0' },
    ]},
  },

  {
    id:'viz-mandala-chakra', name:'Chakra Mandala Sequence',
    category:'Visualization', icon:'🔯', suggestedMode:'mindfulness',
    description:'Seven mandalas, one per chakra colour, 90 seconds each with a TTS transition. Full 10-minute meditation arc.',
    session:{ name:'Chakra Mandala Sequence', duration:630, loopMode:'none', speechRate:0.85, blocks:[
      { type:'viz', label:'Root mandala',    start:0,   duration:90, vizType:'mandala', vizSpeed:0.4, vizColor:'#cc2200' },
      { type:'tts', label:'Sacral',         start:87,  duration:6,  content:'Sacral. Orange. Creativity.', volume:0.7 },
      { type:'viz', label:'Sacral mandala',  start:90,  duration:90, vizType:'mandala', vizSpeed:0.45,vizColor:'#e06010' },
      { type:'tts', label:'Solar',          start:177, duration:6,  content:'Solar plexus. Yellow. Power.', volume:0.7 },
      { type:'viz', label:'Solar mandala',   start:180, duration:90, vizType:'mandala', vizSpeed:0.5, vizColor:'#d4aa00' },
      { type:'tts', label:'Heart',          start:267, duration:6,  content:'Heart. Green. Love.', volume:0.7 },
      { type:'viz', label:'Heart mandala',   start:270, duration:90, vizType:'mandala', vizSpeed:0.55,vizColor:'#228833' },
      { type:'tts', label:'Throat',         start:357, duration:6,  content:'Throat. Blue. Expression.', volume:0.7 },
      { type:'viz', label:'Throat mandala',  start:360, duration:90, vizType:'mandala', vizSpeed:0.6, vizColor:'#2255bb' },
      { type:'tts', label:'Third eye',      start:447, duration:6,  content:'Third eye. Indigo. Insight.', volume:0.7 },
      { type:'viz', label:'Third-eye mand.', start:450, duration:90, vizType:'mandala', vizSpeed:0.65,vizColor:'#334499' },
      { type:'tts', label:'Crown',          start:537, duration:6,  content:'Crown. Violet. Transcendence.', volume:0.7 },
      { type:'viz', label:'Crown mandala',   start:540, duration:90, vizType:'mandala', vizSpeed:0.7, vizColor:'#7722cc' },
    ]},
  },

  {
    id:'viz-lissajous-trance-build', name:'Lissajous Trance Build',
    category:'Visualization', icon:'∞', suggestedMode:'mindfulness',
    description:'Figure-8 that slowly speeds up across four phases, with brief text anchors between each. Progressive induction.',
    session:{ name:'Lissajous Trance Build', duration:480, loopMode:'none', blocks:[
      { type:'text', label:'Opening',    start:0,   duration:8,  content:'Watch.', fontSize:1.4, _position:'center' },
      { type:'viz',  label:'Slow ∞',    start:8,   duration:100,vizType:'lissajous',vizSpeed:0.3,vizColor:'#4488cc' },
      { type:'text', label:'Anchor 1',  start:106, duration:6,  content:'Deeper.', fontSize:1.3, _position:'center' },
      { type:'viz',  label:'Med ∞',     start:112, duration:120,vizType:'lissajous',vizSpeed:0.7,vizColor:'#5577bb' },
      { type:'text', label:'Anchor 2',  start:230, duration:6,  content:'Sinking.', fontSize:1.3, _position:'center' },
      { type:'viz',  label:'Fast ∞',    start:236, duration:120,vizType:'lissajous',vizSpeed:1.4,vizColor:'#6655cc' },
      { type:'text', label:'Anchor 3',  start:354, duration:6,  content:'There.', fontSize:1.5, _position:'center' },
      { type:'viz',  label:'Peak ∞',    start:360, duration:120,vizType:'lissajous',vizSpeed:2.2,vizColor:'#7744dd' },
    ]},
  },

  {
    id:'viz-fractal-bleed', name:'Fractal Bleed',
    category:'Visualization', icon:'🕸', suggestedMode:'conditioning',
    description:'High-speed fractal web in blood red — intense, disorienting, maximum arousal pattern. Use at peak only.',
    session:{ name:'Fractal Bleed', duration:180, loopMode:'count', loopCount:3, blocks:[
      { type:'viz', label:'Fractal', start:0, duration:180, vizType:'fractalweb', vizSpeed:2.5, vizColor:'#cc1100' },
    ]},
  },

  {
    id:'viz-starburst-pulse-sync', name:'Starburst Pulse',
    category:'Visualization', icon:'✨', suggestedMode:'conditioning',
    description:'Gold starburst alternating with pulse rings — spokes expand then rings contract in two-phase rhythm.',
    session:{ name:'Starburst Pulse', duration:360, loopMode:'infinite', blocks:[
      { type:'viz', label:'Burst A', start:0,  duration:30, vizType:'starburst', vizSpeed:1.4, vizColor:'#f0c030' },
      { type:'viz', label:'Pulse A', start:30, duration:30, vizType:'pulse',     vizSpeed:1.0, vizColor:'#f0c030' },
    ]},
  },

  {
    id:'viz-colorwash-sunset', name:'Slow Sunset',
    category:'Visualization', icon:'🎨', suggestedMode:'asmr',
    description:'Ultra-slow warm colour wash drifting red → amber → deep violet over 20 minutes. ASMR and sleep induction.',
    session:{ name:'Slow Sunset', duration:1200, loopMode:'none', blocks:[
      { type:'viz', label:'Sunset wash', start:0, duration:1200, vizType:'colorwash', vizSpeed:0.1, vizColor:'#cc4400' },
    ]},
  },

  {
    id:'viz-ripple-cascade', name:'Ripple Cascade',
    category:'Visualization', icon:'💧', suggestedMode:'mindfulness',
    description:'Fast interference ripple that slows over time, simulating the mind settling into stillness.',
    session:{ name:'Ripple Cascade', duration:300, loopMode:'none', blocks:[
      { type:'viz', label:'Fast ripple', start:0,   duration:60,  vizType:'ripple', vizSpeed:2.0, vizColor:'#6699bb' },
      { type:'viz', label:'Med ripple',  start:60,  duration:90,  vizType:'ripple', vizSpeed:1.0, vizColor:'#5588bb' },
      { type:'viz', label:'Slow ripple', start:150, duration:150, vizType:'ripple', vizSpeed:0.4, vizColor:'#4477bb' },
    ]},
  },

  // ════════════════════════════════════════════════════════════════════════════
  // FUNSCRIPT PACKS — 20 unique motion pattern sessions
  // ════════════════════════════════════════════════════════════════════════════

  {
    id:'fs-edging-cycle', name:'Edging Cycle',
    category:'FunScript Patterns', icon:'⚡', suggestedMode:'conditioning',
    description:'Three build-and-deny cycles. Rises to 85% intensity, holds 8 seconds, drops. Spacing increases each round.',
    session:{ name:'Edging Cycle', duration:360, loopMode:'count', loopCount:3,
      funscriptTracks:[{
        name:'Edge pattern', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts = [];
          const addCycle = (startMs, holdMs, pause) => {
            // Rise
            for (let i=0;i<=20;i++) pts.push({at:startMs+i*200, pos:Math.round(5+80*(i/20))});
            // Hold
            pts.push({at:startMs+4000, pos:85}, {at:startMs+4000+holdMs, pos:85});
            // Drop
            pts.push({at:startMs+4000+holdMs+300, pos:8});
            // Pause plateau
            pts.push({at:startMs+4000+holdMs+pause, pos:8});
          };
          addCycle(0,    8000, 12000);
          addCycle(24000,12000,18000);
          addCycle(54000,16000,22000);
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-slow-burn', name:'Slow Burn',
    category:'FunScript Patterns', icon:'🔥', suggestedMode:'conditioning',
    description:'20-minute ultra-slow build from 5% to 90% with no drops. Patience and endurance training.',
    session:{ name:'Slow Burn', duration:1200, loopMode:'none',
      funscriptTracks:[{
        name:'Slow burn', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts = [];
          // Gradual sine wave that grows in amplitude over time
          for (let t=0;t<=1200000;t+=1500) {
            const progress = t/1200000;
            const amp = 5 + 85*progress;
            const freq = 2000 + 3000*(1-progress); // slows as it grows
            pts.push({at:t, pos:Math.round(50 + amp*Math.sin(t/freq*Math.PI))});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-heartbeat-rhythm', name:'Heartbeat Rhythm',
    category:'FunScript Patterns', icon:'💗', suggestedMode:'mindfulness',
    description:'60 BPM double-pulse (lub-dub) pattern. Meditative and body-synchronizing.',
    session:{ name:'Heartbeat Rhythm', duration:300, loopMode:'infinite',
      funscriptTracks:[{
        name:'Heartbeat', range:100, axis:'stroke', variant:'Soft', _disabled:false,
        actions: (() => {
          const pts = []; const beat = 1000;
          for (let t=0;t<300000;t+=beat) {
            pts.push({at:t,pos:5},{at:t+120,pos:80},{at:t+250,pos:20},
                     {at:t+380,pos:65},{at:t+500,pos:5});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-breath-sync', name:'Breath Synchrony',
    category:'FunScript Patterns', icon:'💨', suggestedMode:'mindfulness',
    description:'4-second inhale up, 6-second exhale down. Trains breath awareness through body feedback.',
    session:{ name:'Breath Synchrony', duration:600, loopMode:'infinite',
      funscriptTracks:[{
        name:'Breath sync', range:100, axis:'stroke', variant:'Soft', _disabled:false,
        actions: (() => {
          const pts = []; const cycle = 10000;
          for (let t=0;t<600000;t+=cycle) {
            pts.push({at:t,pos:5},{at:t+4000,pos:90},{at:t+4200,pos:85},{at:t+10000,pos:5});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-staccato-rain', name:'Staccato Rain',
    category:'FunScript Patterns', icon:'🥁', suggestedMode:'conditioning',
    description:'Rapid short strokes 250ms each at 80% intensity — like driving rain. 5-minute continuous high stimulation.',
    session:{ name:'Staccato Rain', duration:300, loopMode:'none',
      funscriptTracks:[{
        name:'Staccato', range:100, axis:'stroke', variant:'Intense', _disabled:false,
        actions: (() => {
          const pts = [];
          for (let t=0;t<300000;t+=500) {
            pts.push({at:t,pos:15},{at:t+250,pos:80});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-wave-surge', name:'Wave Surge',
    category:'FunScript Patterns', icon:'🌊', suggestedMode:'conditioning',
    description:'Ocean-inspired long wave strokes with randomised micro-tremors layered on top.',
    session:{ name:'Wave Surge', duration:480, loopMode:'infinite',
      funscriptTracks:[{
        name:'Wave surge', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts = [];
          for (let t=0;t<480000;t+=100) {
            const wave = 50+42*Math.sin(t/5000*Math.PI);
            const tremor = (Math.random()-0.5)*8;
            pts.push({at:t,pos:Math.max(2,Math.min(98,Math.round(wave+tremor)))});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-ruin-hold', name:'Ruin & Hold',
    category:'FunScript Patterns', icon:'⚡', suggestedMode:'pleasure_training',
    description:'Builds to 90%, cuts to 5% for 15 seconds, returns slowly. Classic ruin pattern — 4 cycles.',
    session:{ name:'Ruin & Hold', duration:480, loopMode:'none',
      funscriptTracks:[{
        name:'Ruin hold', range:100, axis:'stroke', variant:'Intense', _disabled:false,
        actions: (() => {
          const pts = []; let t=0;
          for (let c=0;c<4;c++) {
            // Build 45s
            for (let i=0;i<=30;i++) pts.push({at:t+i*1500, pos:Math.round(5+85*(i/30))});
            t+=45000;
            // Drop and hold 15s
            pts.push({at:t,pos:5},{at:t+15000,pos:5});
            t+=15000;
            // Slow return 15s
            pts.push({at:t,pos:5},{at:t+15000,pos:35});
            t+=15000;
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-syncopated-jazz', name:'Syncopated Jazz',
    category:'FunScript Patterns', icon:'🎵', suggestedMode:'conditioning',
    description:'Off-beat triplet rhythm: two short, one long, pause, repeat. Musical and unpredictable.',
    session:{ name:'Syncopated Jazz', duration:360, loopMode:'infinite',
      funscriptTracks:[{
        name:'Jazz sync', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts = [];
          // bar = 2400ms (2.5 beats at 62.5 bpm)
          for (let t=0;t<360000;t+=2400) {
            pts.push({at:t,pos:10},{at:t+300,pos:80},
                     {at:t+600,pos:10},{at:t+900,pos:75},
                     {at:t+1200,pos:10},{at:t+1800,pos:90},
                     {at:t+2400,pos:10});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-plateau-long', name:'Plateau Hold',
    category:'FunScript Patterns', icon:'〒', suggestedMode:'conditioning',
    description:'Rises to 75%, holds for 3 minutes, drops and re-engages. Tests sustained arousal maintenance.',
    session:{ name:'Plateau Hold', duration:480, loopMode:'none',
      funscriptTracks:[{
        name:'Plateau', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions:[
          {at:0,pos:5},{at:30000,pos:75},
          {at:30000,pos:75},{at:210000,pos:75},
          {at:210000,pos:75},
          // slight tremor at plateau
          {at:60000,pos:78},{at:90000,pos:72},{at:120000,pos:76},
          {at:150000,pos:73},{at:180000,pos:77},
          {at:210500,pos:5},{at:240000,pos:5},
          {at:240000,pos:5},{at:300000,pos:85},
          {at:300000,pos:85},{at:420000,pos:85},
          {at:420500,pos:5},{at:480000,pos:5},
        ].sort((a,b)=>a.at-b.at),
      }],
    },
  },

  {
    id:'fs-feather-tease', name:'Feather Tease',
    category:'FunScript Patterns', icon:'🪶', suggestedMode:'mindfulness',
    description:'Barely-there 10–22% intensity with micro-fluctuations. Extended foreplay or cool-down pattern.',
    session:{ name:'Feather Tease', duration:600, loopMode:'infinite',
      funscriptTracks:[{
        name:'Feather', range:100, axis:'stroke', variant:'Soft', _disabled:false,
        actions: (() => {
          const pts = [];
          for (let t=0;t<600000;t+=200) {
            const drift = 16+8*Math.sin(t/4000);
            const micro = (Math.random()-0.5)*5;
            pts.push({at:t,pos:Math.max(5,Math.min(30,Math.round(drift+micro)))});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-aftershock', name:'Aftershock Decay',
    category:'FunScript Patterns', icon:'〰️', suggestedMode:'pleasure_training',
    description:'Starts at 95% and exponentially decays over 4 minutes with irregular tremors. Simulates post-peak resolution.',
    session:{ name:'Aftershock Decay', duration:240, loopMode:'none',
      funscriptTracks:[{
        name:'Aftershock', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts = [];
          for (let t=0;t<240000;t+=300) {
            const decay = Math.exp(-t/60000);
            const tremor = Math.abs(Math.sin(t/800))*decay;
            pts.push({at:t,pos:Math.max(3,Math.round(95*decay+tremor*40))});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-pendulum-deep', name:'Deep Pendulum',
    category:'FunScript Patterns', icon:'⏳', suggestedMode:'mindfulness',
    description:'Full-range pendulum (0→100→0) on a 10-second cycle. Deeply grounding and meditative.',
    session:{ name:'Deep Pendulum', duration:600, loopMode:'infinite',
      funscriptTracks:[{
        name:'Pendulum', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts = [];
          for (let t=0;t<600000;t+=500) {
            pts.push({at:t,pos:Math.round(50+49*Math.cos(t/10000*Math.PI*2))});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-storm-peak', name:'Storm Peak',
    category:'FunScript Patterns', icon:'🌪', suggestedMode:'pleasure_training',
    description:'Three overlapping sine waves at peak intensity — maximum energy, use only at climax scenes.',
    session:{ name:'Storm Peak', duration:120, loopMode:'count', loopCount:3,
      funscriptTracks:[{
        name:'Storm', range:100, axis:'stroke', variant:'Intense', _disabled:false,
        actions: (() => {
          const pts = [];
          for (let t=0;t<120000;t+=100) {
            const a=Math.sin(t/900*Math.PI);
            const b=Math.sin(t/600*Math.PI);
            const c=Math.sin(t/1400*Math.PI);
            pts.push({at:t,pos:Math.max(5,Math.min(98,Math.round(50+(a*0.5+b*0.3+c*0.2)*45)))});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-cascade-build', name:'Cascade Build',
    category:'FunScript Patterns', icon:'🌊', suggestedMode:'conditioning',
    description:'Four escalating intensity tiers — 30%, 55%, 75%, 92% — each tier 90 seconds.',
    session:{ name:'Cascade Build', duration:360, loopMode:'none',
      funscriptTracks:[{
        name:'Cascade', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts = []; const tiers = [30,55,75,92];
          tiers.forEach((amp, ti) => {
            const base = ti*90000;
            for (let t=0;t<90000;t+=400) {
              pts.push({at:base+t, pos:Math.round(amp/2+amp/2*Math.sin(t/1200*Math.PI))});
            }
          });
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-long-draw', name:'Long Slow Draw',
    category:'FunScript Patterns', icon:'🌊', suggestedMode:'mindfulness',
    description:'8-second full-stroke cycle, extremely smooth. One continuous motion for body awareness training.',
    session:{ name:'Long Slow Draw', duration:480, loopMode:'infinite',
      funscriptTracks:[{
        name:'Long draw', range:100, axis:'stroke', variant:'Soft', _disabled:false,
        actions: (() => {
          const pts = [];
          for (let t=0;t<480000;t+=500) {
            const p=(t%8000)/8000;
            pts.push({at:t,pos:p<0.5?Math.round(p*2*100):Math.round((1-(p-0.5)*2)*100)});
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-twist-axis', name:'Twist Axis Pattern',
    category:'FunScript Patterns', icon:'🔄', suggestedMode:'conditioning',
    description:'Demonstrates multi-axis: primary stroke track plus a complementary twist axis that counter-rotates.',
    session:{ name:'Twist Axis Pattern', duration:300, loopMode:'infinite',
      funscriptTracks:[
        {
          name:'Primary stroke', range:100, axis:'stroke', variant:'Standard', _disabled:false,
          actions: (() => {
            const pts=[];
            for (let t=0;t<300000;t+=500) pts.push({at:t,pos:Math.round(50+48*Math.sin(t/2000*Math.PI))});
            return pts;
          })(),
        },
        {
          name:'Twist', range:100, axis:'twist', variant:'', _disabled:false,
          actions: (() => {
            const pts=[];
            for (let t=0;t<300000;t+=500) pts.push({at:t,pos:Math.round(50+48*Math.cos(t/2000*Math.PI))});
            return pts;
          })(),
        },
      ],
    },
  },

  {
    id:'fs-surge-vibrate', name:'Surge + Vibrate Dual Axis',
    category:'FunScript Patterns', icon:'⚡', suggestedMode:'pleasure_training',
    description:'Surge axis long slow strokes while vibrate axis pulses at 2 Hz. Full multi-axis stimulation pack.',
    session:{ name:'Surge + Vibrate Dual Axis', duration:360, loopMode:'infinite',
      funscriptTracks:[
        {
          name:'Surge', range:100, axis:'surge', variant:'Standard', _disabled:false,
          actions: (() => {
            const pts=[];
            for (let t=0;t<360000;t+=600) pts.push({at:t,pos:Math.round(50+48*Math.sin(t/6000*Math.PI))});
            return pts;
          })(),
        },
        {
          name:'Vibrate', range:100, axis:'vibrate', variant:'', _disabled:false,
          actions: (() => {
            const pts=[];
            for (let t=0;t<360000;t+=250) pts.push({at:t,pos:t%500<250?85:15});
            return pts;
          })(),
        },
      ],
    },
  },

  {
    id:'fs-variable-speed', name:'Variable Speed Training',
    category:'FunScript Patterns', icon:'🎯', suggestedMode:'conditioning',
    description:'Alternates slow (3s cycles) and fast (0.7s cycles) in 45-second blocks. Speed-change training.',
    session:{ name:'Variable Speed Training', duration:450, loopMode:'none',
      funscriptTracks:[{
        name:'Variable speed', range:100, axis:'stroke', variant:'Standard', _disabled:false,
        actions: (() => {
          const pts=[]; let t=0;
          for (let pass=0;pass<5;pass++) {
            const fast=(pass%2===0);
            const cycleMs=fast?700:3000;
            const end=t+90000;
            while (t<end) {
              pts.push({at:t,pos:5},{at:t+cycleMs/2,pos:90});
              t+=cycleMs;
            }
          }
          return pts;
        })(),
      }],
    },
  },

  {
    id:'fs-mirror-ascent', name:'Mirror Ascent',
    category:'FunScript Patterns', icon:'🔯', suggestedMode:'pleasure_training',
    description:'Each loop the baseline rises by 5% and the peak rises by 3% — perpetual escalation until loopCount resets.',
    session:{ name:'Mirror Ascent', duration:240, loopMode:'count', loopCount:6,
      funscriptTracks:[{
        name:'Mirror ascent', range:100, axis:'stroke', variant:'Intense', _disabled:false,
        actions: (() => {
          const pts=[];
          for (let t=0;t<240000;t+=300) {
            // base pattern 30–80% — escalation driven by session loop rules
            pts.push({at:t,pos:Math.round(30+50*Math.abs(Math.sin(t/2500*Math.PI)))});
          }
          return pts;
        })(),
      }],
      rules:[
        {name:'Escalate each loop',enabled:true,
          condition:{metric:'loopCount',op:'>',value:0},durationSec:1,cooldownSec:999,
          action:{type:'setIntensity',param:1.25}},
      ],
    },
  },

  {
    id:'fs-breath-haptic', name:'Haptic Breath Guide',
    category:'FunScript Patterns', icon:'💨', suggestedMode:'mindfulness',
    description:'Combines a breathing block TTS with a matching haptic pattern — inhale pushes up, exhale draws back.',
    session:{ name:'Haptic Breath Guide', duration:600, loopMode:'infinite', speechRate:0.85,
      blocks:[
        {type:'breathing',label:'Breath guide',start:0,duration:600,
          breathInSec:4,breathHold1Sec:0,breathOutSec:6,breathHold2Sec:2,breathCycles:0,breathCue:true},
      ],
      funscriptTracks:[{
        name:'Breath haptic', range:100, axis:'stroke', variant:'Soft', _disabled:false,
        actions: (() => {
          const pts=[]; const cycle=12000;
          for (let t=0;t<600000;t+=cycle) {
            pts.push({at:t,pos:5},{at:t+4000,pos:80},{at:t+4000,pos:80},
                     {at:t+10000,pos:5},{at:t+12000,pos:5});
          }
          return pts;
        })(),
      }],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // AUDIO GENERATOR PACKS — 20 unique entrainment/binaural sessions
  // ════════════════════════════════════════════════════════════════════════════

  {
    id:'audio-delta-sleep', name:'Delta Sleep Induction',
    category:'Audio Generators', icon:'🌙', suggestedMode:'asmr',
    description:'2.5 Hz delta binaural beat at 180 Hz carrier. Deep sleep and unconscious processing. 40-minute session.',
    session:{ name:'Delta Sleep Induction', duration:2400, loopMode:'none', blocks:[
      {type:'tts',label:'Sleep prompt',start:0,duration:15,content:'Lie down. Let your eyes close. Allow sleep to come naturally.',volume:0.7},
      {type:'entrainment',label:'Delta beat',start:15,duration:2385,entCarrierHz:180,entBeatHz:2.5,entWaveform:'sine',entVolume:0.35},
    ]},
  },

  {
    id:'audio-theta-trance', name:'Theta Trance Gate',
    category:'Audio Generators', icon:'🌀', suggestedMode:'mindfulness',
    description:'6 Hz theta binaural beat — the classic hypnotic/REM-adjacent frequency. 20-minute sustained induction.',
    session:{ name:'Theta Trance Gate', duration:1200, loopMode:'none', blocks:[
      {type:'tts',label:'Entry',start:0,duration:12,content:'Let your mind become receptive. Follow the sound inward.',volume:0.75},
      {type:'entrainment',label:'Theta',start:12,duration:1188,entCarrierHz:200,entBeatHz:6,entWaveform:'sine',entVolume:0.4},
    ]},
  },

  {
    id:'audio-alpha-calm', name:'Alpha Calm State',
    category:'Audio Generators', icon:'😌', suggestedMode:'mindfulness',
    description:'10 Hz alpha binaural — relaxed wakefulness, focused calm. Ideal background for text or TTS sessions.',
    session:{ name:'Alpha Calm State', duration:1800, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Alpha',start:0,duration:1800,entCarrierHz:220,entBeatHz:10,entWaveform:'sine',entVolume:0.3},
    ]},
  },

  {
    id:'audio-beta-focus', name:'Beta Focus Lock',
    category:'Audio Generators', icon:'🎯', suggestedMode:'mindfulness',
    description:'18 Hz beta binaural for sharp concentration and alertness. Use during exposure therapy or task-based sessions.',
    session:{ name:'Beta Focus Lock', duration:1200, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Beta',start:0,duration:1200,entCarrierHz:240,entBeatHz:18,entWaveform:'sine',entVolume:0.25},
    ]},
  },

  {
    id:'audio-gamma-peak', name:'Gamma Peak State',
    category:'Audio Generators', icon:'⚡', suggestedMode:'conditioning',
    description:'40 Hz gamma isochronal tone — associated with peak alertness, binding, and information integration.',
    session:{ name:'Gamma Peak State', duration:600, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Gamma',start:0,duration:600,entCarrierHz:200,entBeatHz:40,entWaveform:'sine',entVolume:0.2},
    ]},
  },

  {
    id:'audio-schumann', name:'Schumann Resonance',
    category:'Audio Generators', icon:'🌍', suggestedMode:'mindfulness',
    description:'7.83 Hz — Earth\'s electromagnetic resonance frequency. Grounding and stress reduction protocol.',
    session:{ name:'Schumann Resonance', duration:1800, loopMode:'infinite', blocks:[
      {type:'tts',label:'Ground',start:0,duration:10,content:'Feel yourself connected to the earth beneath you.',volume:0.7},
      {type:'entrainment',label:'Schumann',start:10,duration:1790,entCarrierHz:210,entBeatHz:7.83,entWaveform:'sine',entVolume:0.35},
    ]},
  },

  {
    id:'audio-sleep-ramp', name:'Sleep Ramp',
    category:'Audio Generators', icon:'💤', suggestedMode:'asmr',
    description:'Descends from 12 Hz (drowsy) to 2 Hz (deep sleep) over 30 minutes via three stages.',
    session:{ name:'Sleep Ramp', duration:1800, loopMode:'none', blocks:[
      {type:'tts',label:'Settle',start:0,duration:12,content:'Allow your body to become heavy. Your eyes grow tired.',volume:0.65},
      {type:'entrainment',label:'Drowsy alpha',start:12,duration:600,entCarrierHz:200,entBeatHz:12,entWaveform:'sine',entVolume:0.35},
      {type:'entrainment',label:'Theta bridge',start:612,duration:600,entCarrierHz:190,entBeatHz:6,entWaveform:'sine',entVolume:0.3},
      {type:'entrainment',label:'Delta sleep',start:1212,duration:588,entCarrierHz:180,entBeatHz:2,entWaveform:'sine',entVolume:0.28},
    ]},
  },

  {
    id:'audio-focus-ramp', name:'Focus Ramp',
    category:'Audio Generators', icon:'📈', suggestedMode:'mindfulness',
    description:'Ascends from 8 Hz (calm) to 20 Hz (sharp focus) over 15 minutes. Morning activation protocol.',
    session:{ name:'Focus Ramp', duration:900, loopMode:'none', blocks:[
      {type:'entrainment',label:'Wake alpha',start:0,duration:300,entCarrierHz:220,entBeatHz:8,entWaveform:'sine',entVolume:0.3},
      {type:'entrainment',label:'Low beta',start:300,duration:300,entCarrierHz:230,entBeatHz:14,entWaveform:'sine',entVolume:0.28},
      {type:'entrainment',label:'High beta',start:600,duration:300,entCarrierHz:240,entBeatHz:20,entWaveform:'sine',entVolume:0.25},
    ]},
  },

  {
    id:'audio-square-iso', name:'Square Isochronal',
    category:'Audio Generators', icon:'⬛', suggestedMode:'conditioning',
    description:'Square-wave isochronal tone at 10 Hz — sharper onset than sine, more neurologically stimulating.',
    session:{ name:'Square Isochronal', duration:900, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Square iso',start:0,duration:900,entCarrierHz:200,entBeatHz:10,entWaveform:'square',entVolume:0.2},
    ]},
  },

  {
    id:'audio-sawtooth-edge', name:'Sawtooth Edge',
    category:'Audio Generators', icon:'📐', suggestedMode:'conditioning',
    description:'Sawtooth waveform at 8 Hz — asymmetric and slightly harsh, creates an intense focused edge-state.',
    session:{ name:'Sawtooth Edge', duration:600, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Sawtooth',start:0,duration:600,entCarrierHz:200,entBeatHz:8,entWaveform:'sawtooth',entVolume:0.18},
    ]},
  },

  {
    id:'audio-deep-drone', name:'Deep Drone 40Hz',
    category:'Audio Generators', icon:'🔔', suggestedMode:'conditioning',
    description:'Gamma entrainment with a deep 80 Hz carrier — felt as much as heard. Paired with conditioning protocol.',
    session:{ name:'Deep Drone 40Hz', duration:600, loopMode:'infinite',
      blocks:[
        {type:'entrainment',label:'Drone',start:0,duration:600,entCarrierHz:80,entBeatHz:40,entWaveform:'sine',entVolume:0.4},
      ],
      rules:[
        {name:'Reward peak attention',enabled:true,
          condition:{metric:'attention',op:'>=',value:0.85},durationSec:8,cooldownSec:40,
          action:{type:'setIntensity',param:1.4}},
      ],
    },
  },

  {
    id:'audio-hypno-stack', name:'Hypnotic Stack',
    category:'Audio Generators', icon:'🧠', suggestedMode:'mindfulness',
    description:'Alpha (10 Hz) and theta (6 Hz) running simultaneously — two carriers, two beat frequencies. Layered trance state.',
    session:{ name:'Hypnotic Stack', duration:1200, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Alpha layer',start:0,duration:1200,entCarrierHz:220,entBeatHz:10,entWaveform:'sine',entVolume:0.25},
      {type:'entrainment',label:'Theta layer',start:0,duration:1200,entCarrierHz:160,entBeatHz:6, entWaveform:'sine',entVolume:0.2},
    ]},
  },

  {
    id:'audio-meditation-bell', name:'Meditation Bell Intervals',
    category:'Audio Generators', icon:'🎵', suggestedMode:'mindfulness',
    description:'Theta entrainment with TTS mindfulness bells every 5 minutes. 30-minute sitting meditation scaffold.',
    session:{ name:'Meditation Bell Intervals', duration:1800, loopMode:'none', speechRate:0.8,
      blocks:[
        {type:'tts',label:'Opening bell',start:0,duration:8,content:'Begin.',volume:0.6},
        {type:'entrainment',label:'Theta base',start:8,duration:1792,entCarrierHz:200,entBeatHz:6,entWaveform:'sine',entVolume:0.3},
        {type:'tts',label:'Bell 5m',start:300,duration:5,content:'Five minutes.',volume:0.55},
        {type:'tts',label:'Bell 10m',start:600,duration:5,content:'Ten minutes.',volume:0.55},
        {type:'tts',label:'Bell 15m',start:900,duration:5,content:'Fifteen minutes. Halfway.',volume:0.55},
        {type:'tts',label:'Bell 20m',start:1200,duration:5,content:'Twenty minutes.',volume:0.55},
        {type:'tts',label:'Bell 25m',start:1500,duration:5,content:'Twenty-five minutes.',volume:0.55},
        {type:'tts',label:'Close',start:1790,duration:10,content:'Complete. Take a moment before opening your eyes.',volume:0.6},
      ],
    },
  },

  {
    id:'audio-pleasure-freq', name:'Pleasure Frequency Protocol',
    category:'Audio Generators', icon:'🎯', suggestedMode:'pleasure_training',
    description:'Cycles theta→alpha→beta in sync with an escalating FunScript pattern. Frequency mirrors arousal state.',
    session:{ name:'Pleasure Frequency Protocol', duration:900, loopMode:'none',
      blocks:[
        {type:'tts',label:'Intro',start:0,duration:12,content:'The frequency will guide your state. Follow it.',volume:0.75},
        {type:'entrainment',label:'Theta build',start:12,duration:300,entCarrierHz:200,entBeatHz:6,entWaveform:'sine',entVolume:0.35},
        {type:'entrainment',label:'Alpha edge',start:312,duration:300,entCarrierHz:215,entBeatHz:10,entWaveform:'sine',entVolume:0.32},
        {type:'entrainment',label:'Beta peak',start:612,duration:288,entCarrierHz:230,entBeatHz:18,entWaveform:'sine',entVolume:0.28},
      ],
      rules:[
        {name:'Reward focus theta',enabled:true,condition:{metric:'attention',op:'>=',value:0.75},
          durationSec:10,cooldownSec:50,action:{type:'setIntensity',param:1.3}},
        {name:'Edge on loss',enabled:true,condition:{metric:'attention',op:'<',value:0.25},
          durationSec:4,cooldownSec:20,action:{type:'setIntensity',param:0.2}},
      ],
    },
  },

  {
    id:'audio-asmr-drone', name:'ASMR Drone Bed',
    category:'Audio Generators', icon:'🕯', suggestedMode:'asmr',
    description:'Ultra-low 2 Hz delta at 160 Hz carrier — subwoofer territory. Maximum sedation. Pair with ASMR mode.',
    session:{ name:'ASMR Drone Bed', duration:3600, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Delta drone',start:0,duration:3600,entCarrierHz:160,entBeatHz:2,entWaveform:'sine',entVolume:0.45},
    ]},
  },

  {
    id:'audio-rapid-theta', name:'Rapid Theta Induction',
    category:'Audio Generators', icon:'⚡', suggestedMode:'mindfulness',
    description:'Starts at 12 Hz and drops 1 Hz every 60 seconds, reaching 5 Hz in under 8 minutes. Fast trance entry.',
    session:{ name:'Rapid Theta Induction', duration:480, loopMode:'none', blocks:[
      {type:'tts',label:'Begin',start:0,duration:10,content:'Focus on the sound. Let it guide you down.',volume:0.75},
      ...Array.from({length:7},(_,i)=>({
        type:'entrainment',label:`Step ${12-i} Hz`,start:10+i*60,duration:60,
        entCarrierHz:200,entBeatHz:12-i,entWaveform:'sine',entVolume:0.35
      })),
      {type:'entrainment',label:'Theta hold',start:430,duration:50,entCarrierHz:200,entBeatHz:5,entWaveform:'sine',entVolume:0.35},
    ]},
  },

  {
    id:'audio-solfeggio-528', name:'Solfeggio 528 Hz',
    category:'Audio Generators', icon:'🌿', suggestedMode:'mindfulness',
    description:'528 Hz carrier (the "DNA repair" solfeggio frequency) with a gentle 8 Hz alpha beat overlay.',
    session:{ name:'Solfeggio 528 Hz', duration:1800, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'528 Hz alpha',start:0,duration:1800,entCarrierHz:528,entBeatHz:8,entWaveform:'sine',entVolume:0.3},
    ]},
  },

  {
    id:'audio-conditioning-pulse', name:'Conditioning Pulse Train',
    category:'Audio Generators', icon:'⚙', suggestedMode:'conditioning',
    description:'15 Hz beta carrier with 5-second silence gaps every 30 seconds. Classical conditioning stimulus-pause pattern.',
    session:{ name:'Conditioning Pulse Train', duration:600, loopMode:'count', loopCount:4,
      blocks: (() => {
        const blocks = [];
        for (let t=0;t<600;t+=35) {
          blocks.push({type:'entrainment',label:`Beat ${Math.floor(t/35)+1}`,start:t,duration:30,
            entCarrierHz:200,entBeatHz:15,entWaveform:'sine',entVolume:0.3});
          blocks.push({type:'pause',label:'Gap',start:t+30,duration:5,content:''});
        }
        return blocks;
      })(),
    },
  },

  {
    id:'audio-harmonic-stack', name:'Harmonic Triad Stack',
    category:'Audio Generators', icon:'🎼', suggestedMode:'mindfulness',
    description:'Three carriers at 200/300/400 Hz (harmonic series) each with theta beats — creates a rich resonant chord.',
    session:{ name:'Harmonic Triad Stack', duration:1200, loopMode:'infinite', blocks:[
      {type:'entrainment',label:'Root 200Hz',start:0,duration:1200,entCarrierHz:200,entBeatHz:6,entWaveform:'sine',entVolume:0.22},
      {type:'entrainment',label:'Fifth 300Hz',start:0,duration:1200,entCarrierHz:300,entBeatHz:6,entWaveform:'sine',entVolume:0.18},
      {type:'entrainment',label:'Octave 400Hz',start:0,duration:1200,entCarrierHz:400,entBeatHz:6,entWaveform:'sine',entVolume:0.14},
    ]},
  },

  {
    id:'audio-breathwork-sync', name:'Breathwork Frequency Sync',
    category:'Audio Generators', icon:'💨', suggestedMode:'mindfulness',
    description:'Breathing block (4-7-8 pattern) combined with a 4.5 Hz theta entrainment track that matches the breath rhythm.',
    session:{ name:'Breathwork Frequency Sync', duration:660, loopMode:'count', loopCount:4, blocks:[
      {type:'breathing',label:'4-7-8 breath',start:0,duration:660,
        breathInSec:4,breathHold1Sec:7,breathOutSec:8,breathHold2Sec:0,breathCycles:0,breathCue:true},
      {type:'entrainment',label:'Theta sync',start:0,duration:660,entCarrierHz:200,entBeatHz:4.5,entWaveform:'sine',entVolume:0.32},
    ]},
  },
];


// ── Apply a content pack to the current session ────────────────────────────────
// Replaces the session entirely (after a history snapshot) so the author has
// a complete starting point they can then customize.
export async function loadContentPack(packId) {
  const pack = CONTENT_PACKS.find(p => p.id === packId);
  if (!pack) { notify.warn(`Content pack "${packId}" not found.`); return false; }

  history.push();

  const fresh = normalizeSession({
    ...pack.session,
    // Assign fresh IDs to all blocks and scenes so the pack can be loaded multiple times
    blocks: (pack.session.blocks ?? []).map(b => ({ ...b, id: uid() })),
    scenes: (pack.session.scenes ?? []).map(s => ({ ...s, id: uid() })),
  });

  // Full session replacement — await all cleanup before mutating state so that
  // any re-renders triggered by the caller see the updated session, not the old one.
  await Promise.all([
    import('./playback.js').then(({ stopPlayback })        => stopPlayback({ silent: true })),
    import('./funscript.js').then(({ resetZoom })           => resetZoom?.()),
    import('./state-engine.js').then(({ resetStateEngine }) => resetStateEngine()),
    import('./rules-engine.js').then(({ clearRuleState })   => clearRuleState()),
  ]).catch(() => {});

  state.session              = fresh;
  state.selectedBlockId      = fresh.blocks[0]?.id ?? null;
  state.selectedSidebarType  = null;
  state.selectedSidebarIdx   = null;
  state.selectedSidebarId    = null;
  persist();

  // Apply the pack's suggested session mode (rules, ramp, pacing) if set
  if (pack.suggestedMode) {
    await import('./session-modes.js').then(({ applySessionMode }) => {
      applySessionMode(pack.suggestedMode);
    }).catch(() => {});
  }

  notify.success(`"${pack.name}" loaded. Customize it in the inspector.`);
  // Refresh sidebar (tracks), inspector, timeline, and idle screen with new session
  import('./ui.js').then(({ renderSidebar, renderInspector, syncSettingsForms }) => {
    renderSidebar();
    renderInspector();
    syncSettingsForms();
  }).catch(() => {});
  import('./funscript.js').then(({ drawTimeline }) => drawTimeline()).catch(() => {});
  import('./fullscreen-hud.js').then(({ renderIdleScreen }) => renderIdleScreen()).catch(() => {});

  // Track which packs have ever been loaded (for the Pack Explorer achievement)
  import('./user-profile.js').then(({ loadProfile, saveProfile }) => {
    const prof = loadProfile();
    const loaded = new Set(prof.packsLoaded ?? []);
    if (!loaded.has(packId)) {
      loaded.add(packId);
      prof.packsLoaded = [...loaded];
      saveProfile(prof);
      // Award packs_3 and all_packs based on count
      import('./achievements.js').then(({ ACHIEVEMENT_MAP }) => {
        import('./user-profile.js').then(({ loadProfile: lp, saveProfile: sp }) => {
          const p2   = lp();
          const earn = new Set(p2.achievements ?? []);
          const disp = state.session?.displayOptions ?? {};
          const grant = (id, msg) => {
            if (!earn.has(id)) {
              earn.add(id);
              p2.achievements = [...earn];
              p2.xp = (p2.xp ?? 0) + (ACHIEVEMENT_MAP[id]?.xp ?? 0);
              sp(p2);
              if (disp.toastAchievements !== false) {
                notify.success(msg, 5000);
              }
            }
          };
          if (loaded.size >= 3)                 grant('packs_3',   '📚 Achievement: Pack Curious');
          if (loaded.size >= CONTENT_PACKS.length) grant('all_packs', '📦 Achievement: Pack Explorer');
        }).catch(() => {});
      }).catch(() => {});
    }
  }).catch(() => {});
  return pack;
}

// ── Get packs grouped by category ────────────────────────────────────────────
export function getPacksByCategory() {
  const cats = {};
  for (const pack of CONTENT_PACKS) {
    if (!cats[pack.category]) cats[pack.category] = [];
    cats[pack.category].push(pack);
  }
  return cats;
}

// ── Render the content packs picker ──────────────────────────────────────────
export function renderContentPacksPicker(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const byCategory = getPacksByCategory();
  const isSidebar = containerId === 'sidebarTemplates';

  if (isSidebar) {
    // Compact sidebar list
    const allPacks = Object.values(byCategory).flat();
    el.innerHTML = `<div style="padding:4px 10px 6px">
      ${allPacks.map(pack => `
        <button class="pack-card sb-item" data-pack-id="${esc(pack.id)}"
          style="width:100%;text-align:left;font-size:10.5px;padding:4px 8px;border-radius:5px;
            background:transparent;border-left:2px solid transparent;cursor:pointer;color:var(--text2)">
          ${esc(pack.icon)} ${esc(pack.name)}
        </button>`).join('')}
    </div>`;
    el.querySelectorAll('.pack-card').forEach(card => {
      card.addEventListener('click', async () => {
        if (card.dataset.loading) return;
        card.dataset.loading = '1'; card.style.opacity = '0.6';
        try { await loadContentPack(card.dataset.packId); }
        catch(e) { const { notify } = await import('./notify.js'); notify.error(e.message); }
        finally { delete card.dataset.loading; card.style.opacity = ''; }
      });
    });
    return;
  }

  el.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;
      font-family:'Playfair Display',Georgia,serif;font-style:italic">
      Session Templates
    </div>
    <p style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:12px">
      Load a pre-built session as your starting point. Your current session will be
      saved to the undo history — press Ctrl+Z to get it back.
    </p>
    ${Object.entries(byCategory).map(([cat, packs]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:9px;color:rgba(196,154,60,0.5);text-transform:uppercase;
          letter-spacing:.12em;margin-bottom:7px;display:flex;align-items:center;gap:6px">
          ${cat}<span style="flex:1;height:0.5px;background:rgba(196,154,60,0.12);display:block"></span>
        </div>
        ${packs.map(pack => `
          <div style="padding:9px 11px;margin-bottom:5px;border-radius:8px;cursor:pointer;
            background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);
            transition:background 0.15s,border-color 0.15s"
            class="pack-card" data-pack-id="${pack.id}"
            onmouseover="this.style.background='rgba(196,154,60,0.06)';this.style.borderColor='rgba(196,154,60,0.18)'"
            onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.06)'">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:15px">${esc(pack.icon)}</span>
              <span style="font-size:12px;font-weight:600;color:var(--text)">${esc(pack.name)}</span>
              <span style="margin-left:auto;font-size:9px;color:rgba(196,154,60,0.5);
                letter-spacing:.05em;text-transform:uppercase">${esc(pack.suggestedMode)}</span>
            </div>
            <div style="font-size:10.5px;color:var(--text2);line-height:1.5;padding-left:23px">
              ${esc(pack.description)}
            </div>
          </div>`).join('')}
      </div>`).join('')}`;

  el.querySelectorAll('.pack-card').forEach(card => {
    card.addEventListener('click', async () => {
      if (card.dataset.loading) return;          // guard double-click
      card.dataset.loading = '1';
      card.style.opacity   = '0.6';
      try {
        // loadContentPack is now async — await it so state.session is updated
        // before the re-renders below fire.
        const pack = await loadContentPack(card.dataset.packId);
        if (pack) {
          const { renderSidebar, renderInspector, syncSettingsForms,
                  syncTransportControls, applyCssVars } = await import('./ui.js').catch(() => ({}));
          renderSidebar?.(); renderInspector?.(); syncSettingsForms?.();
          syncTransportControls?.(); applyCssVars?.();
          if (pack.suggestedMode) {
            notify.info(`Mode set to "${pack.suggestedMode}" — customize in Session tab.`);
          }
        }
      } finally {
        delete card.dataset.loading;
        card.style.opacity = '';
      }
    });
  });
}

// ── Content Pack Editor ───────────────────────────────────────────────────────
// Lets users author a custom .asspack from their current session and metadata.
// Rendered inside the Inspector when the user clicks "Create Content Pack".

export function renderContentPackEditor(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div style="padding:12px 14px">
      <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:10px;
        font-family:var(--font);letter-spacing:.04em">✦ Create Content Pack</div>
      <p style="font-size:10.5px;color:var(--text2);line-height:1.6;margin-bottom:12px">
        Bundle your current session as a shareable <code>.asspack</code> file. Fill in the
        metadata below, then click Export.
      </p>
      <div style="display:flex;flex-direction:column;gap:7px">
        <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Pack name</label>
          <input id="cpe_name" type="text" maxlength="60" placeholder="My Relaxation Pack"
            style="width:100%;font-size:11px" /></div>
        <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Icon (emoji)</label>
          <input id="cpe_icon" type="text" maxlength="4" placeholder="🌿" value="🌿"
            style="width:60px;font-size:16px;text-align:center" /></div>
        <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Description</label>
          <textarea id="cpe_desc" rows="2" maxlength="200" placeholder="A calming session for…"
            style="width:100%;font-size:11px;resize:none"></textarea></div>
        <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Author</label>
          <input id="cpe_author" type="text" maxlength="60" placeholder="Your name"
            style="width:100%;font-size:11px" /></div>
        <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Category</label>
          <select id="cpe_category" style="width:100%;font-size:11px">
            <option value="relaxation">Relaxation</option>
            <option value="focus">Focus</option>
            <option value="hypnosis">Hypnosis</option>
            <option value="conditioning">Conditioning</option>
            <option value="breathwork">Breathwork</option>
            <option value="custom">Custom</option>
          </select></div>
        <div><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">Tags (comma-separated)</label>
          <input id="cpe_tags" type="text" maxlength="120" placeholder="calm, guided, beginner"
            style="width:100%;font-size:11px" /></div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <input type="checkbox" id="cpe_include_fs" checked />
          <label for="cpe_include_fs" style="font-size:10.5px;color:var(--text2)">Include FunScript tracks</label>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="cpe_include_audio" />
          <label for="cpe_include_audio" style="font-size:10.5px;color:var(--text2)">Include embedded audio <span style="color:var(--text3)">(may be large)</span></label>
        </div>
      </div>
      <button id="cpe_export_btn" style="
        width:100%;margin-top:12px;padding:9px;font-size:12px;font-weight:600;
        background:linear-gradient(135deg,rgba(196,154,60,0.18),rgba(196,154,60,0.1));
        border:1px solid rgba(196,154,60,0.4);border-radius:7px;
        color:var(--accent);cursor:pointer;letter-spacing:.03em">
        📦 Export .asspack
      </button>
      <div id="cpe_status" style="font-size:10px;color:var(--text3);margin-top:6px;text-align:center"></div>
    </div>`;

  document.getElementById('cpe_export_btn')?.addEventListener('click', () => {
    _exportContentPack();
  });
}

function _exportContentPack() {
  // Import state dynamically to avoid circular deps
  import('./state.js').then(({ state }) => _doExport(state));
}

function _doExport(_state) {

  const name     = document.getElementById('cpe_name')?.value?.trim();
  const icon     = document.getElementById('cpe_icon')?.value?.trim() || '📦';
  const desc     = document.getElementById('cpe_desc')?.value?.trim();
  const author   = document.getElementById('cpe_author')?.value?.trim() || 'Unknown';
  const category = document.getElementById('cpe_category')?.value || 'custom';
  const tagsRaw  = document.getElementById('cpe_tags')?.value || '';
  const includeFs    = document.getElementById('cpe_include_fs')?.checked ?? true;
  const includeAudio = document.getElementById('cpe_include_audio')?.checked ?? false;

  if (!name) {
    const s = document.getElementById('cpe_status');
    if (s) s.textContent = '⚠ Pack name is required.';
    return;
  }

  // Deep-clone session, optionally strip audio/funscript data
  const sess = JSON.parse(JSON.stringify(_state?.session ?? {}));
  if (!includeFs)    delete sess.funscriptTracks;
  if (!includeAudio) {
    (sess.blocks ?? []).forEach(b => { if (b.dataUrl) { b.dataUrl = ''; b.dataUrlName = ''; } });
    (sess.playlists?.audio ?? []).forEach(t => { t.clips = []; });
  }

  const pack = {
    id:           `user_${Date.now()}`,
    name,
    icon,
    description:  desc || `A custom session pack by ${author}.`,
    author,
    version:      '1.0.0',
    category,
    tags:         tagsRaw.split(',').map(t => t.trim()).filter(Boolean),
    created:      new Date().toISOString(),
    suggestedMode: sess.mode || null,
    session:      sess,
  };

  const json     = JSON.stringify(pack, null, 2);
  const safeName = name.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 60) || 'pack';
  const blob     = new Blob([json], { type: 'application/json' });
  const a        = document.createElement('a');
  a.href         = URL.createObjectURL(blob);
  a.download     = `${safeName}.asspack`;
  a.click();
  URL.revokeObjectURL(a.href);

  const s = document.getElementById('cpe_status');
  if (s) s.textContent = `✓ Exported as ${safeName}.asspack`;
}