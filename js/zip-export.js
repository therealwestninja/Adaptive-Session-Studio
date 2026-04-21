// ── zip-export.js ─────────────────────────────────────────────────────────────
// Exports a session as a .zip archive containing:
//   session.json      — the full session data (audio stripped to metadata only)
//   funscripts/       — each FunScript track as a .funscript file
//   media/            — each embedded audio/video/image as its original file
//
// Uses the native CompressionStream API (no external deps).
// Falls back to a plain .json export if the browser lacks the API.

import { state, persist } from './state.js';
import { notify }         from './notify.js';
import { exportFunScript } from './funscript.js';

// ── Minimal ZIP builder (STORE method — no compression needed for already-compressed media) ──
// Spec: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
function _u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function _u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }

function _crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = crc >>> 1 ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _entry(name, bytes) {
  const nameBytes = new TextEncoder().encode(name);
  const crc  = _crc32(bytes);
  const size = bytes.length;

  // Local file header
  const lfh = new Uint8Array([
    0x50,0x4B,0x03,0x04, // signature
    20,0,                // version needed
    0,0,                 // flags
    0,0,                 // compression (STORE)
    0,0,0,0,             // mod time/date (zero)
    ..._u32(crc),
    ..._u32(size),
    ..._u32(size),
    ..._u16(nameBytes.length),
    0,0,                 // extra field length
  ]);

  // Central directory header
  const cdh = new Uint8Array([
    0x50,0x4B,0x01,0x02,
    20,0, 20,0, 0,0, 0,0,
    0,0,0,0,
    ..._u32(crc),
    ..._u32(size),
    ..._u32(size),
    ..._u16(nameBytes.length),
    0,0, 0,0, 0,0, 0,0,0,0, 0,0,0,0,
    0,0,0,0, // local header offset — filled in later
  ]);

  return { nameBytes, lfh, cdh, bytes };
}

function _buildZip(files) {
  // files: Array of { name: string, bytes: Uint8Array }
  const entries = files.map(f => _entry(f.name, f.bytes));
  const parts   = [];
  let   offset  = 0;
  const cdParts = [];

  for (const e of entries) {
    // Patch offset into CDH
    new DataView(e.cdh.buffer).setUint32(42, offset, true);
    parts.push(e.lfh, e.nameBytes, e.bytes);
    offset += e.lfh.length + e.nameBytes.length + e.bytes.length;
    cdParts.push(e.cdh, e.nameBytes);
  }

  const cdStart = offset;
  const cdSize  = cdParts.reduce((n, p) => n + p.length, 0);

  // End of central directory
  const eocd = new Uint8Array([
    0x50,0x4B,0x05,0x06,
    0,0, 0,0,
    ..._u16(entries.length),
    ..._u16(entries.length),
    ..._u32(cdSize),
    ..._u32(cdStart),
    0,0,
  ]);

  const all = [...parts, ...cdParts, eocd];
  const total = all.reduce((n, p) => n + p.length, 0);
  const out   = new Uint8Array(total);
  let pos = 0;
  for (const p of all) { out.set(p, pos); pos += p.length; }
  return out;
}

function _b64ToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] ?? dataUrl;
  const raw    = atob(base64);
  const bytes  = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function _mimeToExt(mime = '') {
  const map = {
    'audio/mpeg':'mp3','audio/mp3':'mp3','audio/ogg':'ogg','audio/wav':'wav',
    'audio/flac':'flac','audio/aac':'aac','audio/webm':'weba',
    'video/mp4':'mp4','video/webm':'webm','image/jpeg':'jpg',
    'image/png':'png','image/gif':'gif','image/webp':'webp',
  };
  return map[mime.split(';')[0].trim()] || 'bin';
}

export async function exportSessionZip() {
  const s       = state.session;
  const files   = [];
  const enc     = new TextEncoder();
  const safeName = (s.name || 'session').replace(/[/\\:*?"<>|]/g,'_').replace(/\s+/g,'_').slice(0,60);

  // 1. Strip embedded media from session JSON, replace with relative paths
  const sess = JSON.parse(JSON.stringify(s));
  let mediaIdx = 0;

  // Audio playlist clips
  for (const track of sess.playlists?.audio ?? []) {
    for (const clip of track.clips ?? []) {
      if (clip.dataUrl?.startsWith('data:')) {
        const mime = clip.dataUrl.split(':')[1]?.split(';')[0];
        const ext  = _mimeToExt(mime);
        const fname = `media/audio_${++mediaIdx}.${ext}`;
        files.push({ name: fname, bytes: _b64ToBytes(clip.dataUrl) });
        clip.dataUrl     = fname;
        clip.dataUrlName = clip.dataUrlName || fname;
      }
    }
  }

  // Video/image playlist
  for (const track of sess.playlists?.video ?? []) {
    if (track.dataUrl?.startsWith('data:')) {
      const mime = track.dataUrl.split(':')[1]?.split(';')[0];
      const ext  = _mimeToExt(mime);
      const fname = `media/video_${++mediaIdx}.${ext}`;
      files.push({ name: fname, bytes: _b64ToBytes(track.dataUrl) });
      track.dataUrl     = fname;
      track.dataUrlName = track.dataUrlName || fname;
    }
  }

  // Inline blocks with dataUrl (audio/video blocks)
  for (const block of sess.blocks ?? []) {
    if (block.dataUrl?.startsWith('data:')) {
      const mime = block.dataUrl.split(':')[1]?.split(';')[0];
      const ext  = _mimeToExt(mime);
      const fname = `media/${block.type}_${++mediaIdx}.${ext}`;
      files.push({ name: fname, bytes: _b64ToBytes(block.dataUrl) });
      block.dataUrl     = fname;
      block.dataUrlName = block.dataUrlName || fname;
    }
  }

  // 2. FunScript tracks as individual files
  for (const track of sess.funscriptTracks ?? []) {
    const axis     = track.axis || 'stroke';
    const tName    = (track.name || 'funscript').replace(/[/\\:*?"<>|]/g,'_').replace(/\s+/g,'_');
    const fname    = axis === 'stroke'
      ? `funscripts/${tName}.funscript`
      : `funscripts/${tName}.${axis}.funscript`;
    const origTrack = s.funscriptTracks.find(t => t.id === track.id);
    if (origTrack) {
      files.push({ name: fname, bytes: enc.encode(exportFunScript(origTrack)) });
    }
    // Remove actions from embedded JSON (they're in the .funscript file)
    track.actions    = [];
    track._fsFile    = fname;
  }

  // 3. Session JSON (media-stripped)
  files.unshift({ name: 'session.json', bytes: enc.encode(JSON.stringify(sess, null, 2)) });

  // 4. README
  const readme = `# ${s.name || 'Session'}\n\nExported from Adaptive Session Studio.\n\nFiles:\n  session.json   — session data\n  funscripts/    — FunScript motion tracks\n  media/         — embedded audio/video/image assets\n\nTo reimport: load session.json into ASS. Media files must be re-embedded manually.\n`;
  files.push({ name: 'README.md', bytes: enc.encode(readme) });

  // 5. Build and download zip
  try {
    const zipBytes = _buildZip(files);
    const blob     = new Blob([zipBytes], { type: 'application/zip' });
    const a        = document.createElement('a');
    a.href         = URL.createObjectURL(blob);
    a.download     = `${safeName}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    const sizeMB = (zipBytes.length / 1_000_000).toFixed(1);
    notify.success(`Exported ${safeName}.zip (${sizeMB} MB, ${files.length} files)`);
  } catch (err) {
    console.error('ZIP export failed:', err);
    notify.error('ZIP export failed — see console for details.');
  }
}
