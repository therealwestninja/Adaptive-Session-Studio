// ── subtitle.js ────────────────────────────────────────────────────────────
// .ass / .ssa subtitle file parsing and timed cue display.

import { state, $id } from './state.js';

// ── Parser ─────────────────────────────────────────────────────────────────
export function parseAss(text) {
  if (typeof text !== 'string') return { styles: {}, events: [] };
  const lines = text.split(/\r?\n/);
  const styles = {};
  const events = [];
  let section = '';
  let dialogueFmt = [];

  function assTimeSec(t) {
    const m = t.match(/(\d+):(\d{2}):(\d{2})[.,](\d{2})/);
    if (!m) return 0;
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
  }

  function stripTags(txt) {
    return txt
      .replace(/\{[^}]*\}/g, '')     // {override tags}
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\h/g, ' ')
      .trim();
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('[')) { section = line.slice(1, -1).toLowerCase(); continue; }

    if (section === 'v4+ styles' || section === 'v4 styles') {
      if (line.startsWith('Style:')) {
        const parts = line.slice(6).split(',').map(s => s.trim());
        if (parts[0]) {
          styles[parts[0]] = {
            fontname:  parts[1] || '',
            fontsize:  +parts[2] || 24,
            color:     assColorToHex(parts[3] || '&H00FFFFFF&'),
            bold:      parts[7] === '-1',
            italic:    parts[8] === '-1',
            alignment: +parts[18] || 2,
          };
        }
      }
    }

    if (section === 'events') {
      if (line.startsWith('Format:')) {
        dialogueFmt = line.slice(7).split(',').map(s => s.trim());
      } else if (line.startsWith('Dialogue:')) {
        const rest = line.slice(9);
        const textIdx = dialogueFmt.indexOf('Text');
        if (textIdx < 0) continue;
        const parts = rest.split(',');
        if (parts.length <= textIdx) continue;
        const textPart  = parts.slice(textIdx).join(',');
        const startStr  = (parts[dialogueFmt.indexOf('Start')] || '').trim();
        const endStr    = (parts[dialogueFmt.indexOf('End')]   || '').trim();
        const styleName = (parts[dialogueFmt.indexOf('Style')] || 'Default').trim();
        const start = assTimeSec(startStr);
        const end   = assTimeSec(endStr);
        if (end <= start) continue;
        events.push({ start, end, text: stripTags(textPart), style: styleName });
      }
    }
  }

  return { styles, events };
}

// ASS colour format: &HAABBGGRR& (alpha, blue, green, red in hex)
function assColorToHex(assColor) {
  const m = assColor.replace(/&H/g,'').replace(/&/g,'').match(/(.{2})(.{2})(.{2})(.{2})/);
  if (!m) return '#ffffff';
  // m[1]=alpha, m[2]=bb, m[3]=gg, m[4]=rr
  return `#${m[4]}${m[3]}${m[2]}`;
}

// ── Export modified .ass ───────────────────────────────────────────────────
export function exportAss(track) {
  const { styles, events } = track;
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  ];

  for (const [name, s] of Object.entries(styles)) {
    const r = parseInt(s.color.slice(1,3)||'ff',16).toString(16).padStart(2,'0');
    const g = parseInt(s.color.slice(3,5)||'ff',16).toString(16).padStart(2,'0');
    const b = parseInt(s.color.slice(5,7)||'ff',16).toString(16).padStart(2,'0');
    lines.push(`Style: ${name},${s.fontname},${s.fontsize},&H00${b}${g}${r}&,&H000000FF&,&H00000000&,&H80000000&,${s.bold?'-1':'0'},${s.italic?'-1':'0'},0,0,100,100,0,0,1,2,2,${s.alignment||2},10,10,10,1`);
  }

  if (!Object.keys(styles).length) {
    lines.push('Style: Default,Arial,24,&H00FFFFFF&,&H000000FF&,&H00000000&,&H80000000&,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1');
  }

  lines.push('', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  for (const ev of events) {
    lines.push(`Dialogue: 0,${secToAssTime(ev.start)},${secToAssTime(ev.end)},${ev.style || 'Default'},,0,0,0,,${ev.text.replace(/\n/g,'\\N')}`);
  }

  return lines.join('\n');
}

function secToAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

export function downloadAss(trackIdx) {
  const track = state.session.subtitleTracks[trackIdx];
  if (!track) return;
  // Re-export (may include overrides from settings)
  const text = track.rawAss ?? exportAss(track);
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = track.name.endsWith('.ass') ? track.name : `${track.name}.ass`;
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Subtitle display during playback ───────────────────────────────────────
export function updateSubtitleCue(sessionTimeSec) {
  const st = $id('subtitleText');
  if (!st) return;
  const { session } = state;
  const settings = session.subtitleSettings;

  let cueText = '';
  let cueStyle = null;
  let cueTrack = null;

  for (const track of session.subtitleTracks) {
    if (track._disabled) continue;
    const cue = track.events?.find(e => sessionTimeSec >= e.start && sessionTimeSec < e.end);
    if (cue) { cueText = cue.text; cueStyle = track.styles?.[cue.style]; cueTrack = track; break; }
  }

  if (cueText) {
    st.textContent = cueText;

    // Font / color overrides
    if (settings.override === 'all' || settings.override === 'color') {
      st.style.color = settings.textColor;
    } else if (cueStyle?.color) {
      st.style.color = cueStyle.color;
    } else {
      st.style.color = '#ffffff';
    }

    if (settings.override === 'all') {
      st.style.fontSize = `${settings.fontSize}rem`;
    } else if (cueStyle?.fontsize) {
      st.style.fontSize = `${Math.max(0.8, cueStyle.fontsize / 20)}rem`;
    } else {
      st.style.fontSize = `${settings.fontSize}rem`;
    }

    // Position
    const pos = settings.position;
    st.style.bottom    = pos === 'bottom' ? '10%' : 'auto';
    st.style.top       = pos === 'top' ? '8%' : pos === 'center' ? '50%' : 'auto';
    st.style.transform = pos === 'center'
      ? 'translateX(-50%) translateY(-50%)'
      : 'translateX(-50%)';

    st.classList.add('visible');
  } else {
    st.classList.remove('visible');
  }
}
