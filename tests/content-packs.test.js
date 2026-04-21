// ── tests/content-packs.test.js ───────────────────────────────────────────
// Tests for js/content-packs.js — CONTENT_PACKS schema, loadContentPack,
// getPacksByCategory, and pack normalization.

import { makeRunner } from './harness.js';
import {
  CONTENT_PACKS, loadContentPack, getPacksByCategory,
} from '../js/content-packs.js';
import { state, defaultSession, normalizeSession } from '../js/state.js';

export function runContentPacksTests() {
  const R  = makeRunner('content-packs.js');
  const t  = R.test.bind(R);
  const eq = R.assertEqual.bind(R);
  const ok = R.assert.bind(R);

  function reset() {
    state.session = normalizeSession(defaultSession());
    state.selectedBlockId = null;
  }

  // ── CONTENT_PACKS schema ──────────────────────────────────────────────────
  t('CONTENT_PACKS is a non-empty array', () => {
    ok(Array.isArray(CONTENT_PACKS) && CONTENT_PACKS.length > 0);
  });

  t('each pack has required fields: id, name, category, icon, description, suggestedMode, session', () => {
    for (const pack of CONTENT_PACKS) {
      ok(typeof pack.id          === 'string' && pack.id.length > 0,          `${pack.id}: missing id`);
      ok(typeof pack.name        === 'string' && pack.name.length > 0,        `${pack.id}: missing name`);
      ok(typeof pack.category    === 'string' && pack.category.length > 0,    `${pack.id}: missing category`);
      ok(typeof pack.icon        === 'string' && pack.icon.length > 0,        `${pack.id}: missing icon`);
      ok(typeof pack.description === 'string' && pack.description.length > 0, `${pack.id}: missing description`);
      ok(typeof pack.suggestedMode === 'string',                               `${pack.id}: missing suggestedMode`);
      ok(pack.session && typeof pack.session === 'object',                     `${pack.id}: missing session`);
    }
  });

  t('all pack ids are unique', () => {
    const ids = CONTENT_PACKS.map(p => p.id);
    eq(new Set(ids).size, ids.length, 'duplicate pack id detected');
  });

  t('each pack session has a name and duration', () => {
    for (const pack of CONTENT_PACKS) {
      ok(typeof pack.session.name     === 'string' && pack.session.name.length > 0, `${pack.id}: session.name`);
      ok(typeof pack.session.duration === 'number' && pack.session.duration > 0,    `${pack.id}: session.duration`);
    }
  });

  t('each pack session has at least one block', () => {
    for (const pack of CONTENT_PACKS) {
      ok(Array.isArray(pack.session.blocks) && pack.session.blocks.length > 0, `${pack.id}: no blocks`);
    }
  });

  t('pack blocks have valid types', () => {
    const VALID = ['text','tts','audio','pause','macro'];
    for (const pack of CONTENT_PACKS) {
      for (const block of pack.session.blocks ?? []) {
        ok(VALID.includes(block.type), `${pack.id}: invalid block type "${block.type}"`);
      }
    }
  });

  t('pack blocks do not have duplicate start times', () => {
    for (const pack of CONTENT_PACKS) {
      const starts = (pack.session.blocks ?? []).map(b => b.start);
      const unique = new Set(starts);
      ok(unique.size === starts.length, `${pack.id}: duplicate block start times found`);
    }
  });

  t('pack scenes (if any) have valid stateType', () => {
    const VALID = [null, 'calm', 'build', 'peak', 'recovery'];
    for (const pack of CONTENT_PACKS) {
      for (const scene of pack.session.scenes ?? []) {
        ok(VALID.includes(scene.stateType ?? null), `${pack.id}: invalid stateType "${scene.stateType}"`);
      }
    }
  });

  // ── Known packs present ────────────────────────────────────────────────────
  t('induction-classic pack exists', () => {
    ok(CONTENT_PACKS.some(p => p.id === 'induction-classic'));
  });

  t('conditioning-foundation pack exists', () => {
    ok(CONTENT_PACKS.some(p => p.id === 'conditioning-foundation'));
  });

  t('partner-intro pack exists', () => {
    ok(CONTENT_PACKS.some(p => p.id === 'partner-intro'));
  });

  t('surrender-solo pack exists', () => {
    ok(CONTENT_PACKS.some(p => p.id === 'surrender-solo'));
  });

  t('grounding-reset pack exists', () => {
    ok(CONTENT_PACKS.some(p => p.id === 'grounding-reset'));
  });

  // ── loadContentPack ────────────────────────────────────────────────────────
  t('loadContentPack returns false for unknown id', () => {
    reset();
    ok(loadContentPack('no-such-pack') === false);
  });

  t('loadContentPack replaces session with the pack session', () => {
    reset();
    const origName = state.session.name;
    loadContentPack('induction-classic');
    ok(state.session.name !== origName, 'session name should change');
    eq(state.session.name, 'Classic Induction');
  });

  t('loadContentPack assigns fresh block ids (not same as template)', () => {
    reset();
    loadContentPack('conditioning-foundation');
    const ids = state.session.blocks.map(b => b.id);
    const unique = new Set(ids);
    eq(unique.size, ids.length, 'all block ids must be unique');
  });

  t('loadContentPack produces a valid normalized session', () => {
    reset();
    loadContentPack('partner-intro');
    ok(typeof state.session.duration === 'number' && state.session.duration > 0);
    ok(Array.isArray(state.session.blocks));
    ok(Array.isArray(state.session.scenes));
    ok(Array.isArray(state.session.rules));
  });

  t('loadContentPack can be called for every pack without error', () => {
    for (const pack of CONTENT_PACKS) {
      reset();
      const result = loadContentPack(pack.id);
      ok(result !== false, `loadContentPack("${pack.id}") should succeed`);
    }
  });

  t('loadContentPack preserves variables from the pack session', () => {
    reset();
    loadContentPack('conditioning-foundation');
    ok('loop_count' in (state.session.variables ?? {}), 'loop_count variable should be present');
  });

  t('loading a pack twice results in fresh ids both times', () => {
    reset();
    loadContentPack('grounding-reset');
    const firstIds  = state.session.blocks.map(b => b.id);
    reset();
    loadContentPack('grounding-reset');
    const secondIds = state.session.blocks.map(b => b.id);
    ok(!firstIds.some((id, i) => id === secondIds[i]), 'ids should differ across loads');
  });

  // ── getPacksByCategory ─────────────────────────────────────────────────────
  t('getPacksByCategory returns an object', () => {
    ok(typeof getPacksByCategory() === 'object');
  });

  t('getPacksByCategory groups all packs', () => {
    const byCategory = getPacksByCategory();
    const total = Object.values(byCategory).reduce((s, arr) => s + arr.length, 0);
    eq(total, CONTENT_PACKS.length, 'all packs should appear in some category');
  });

  t('getPacksByCategory produces no empty categories', () => {
    const byCategory = getPacksByCategory();
    for (const [cat, packs] of Object.entries(byCategory)) {
      ok(packs.length > 0, `category "${cat}" should have at least one pack`);
    }
  });

  t('getPacksByCategory preserves pack objects (same references)', () => {
    const byCategory = getPacksByCategory();
    const flat = Object.values(byCategory).flat();
    ok(flat.every(p => CONTENT_PACKS.includes(p)), 'grouped packs should be same references');
  });

  // ── spiral-descent pack (viz blocks) ──────────────────────────────────────
  t('spiral-descent pack exists', () => {
    ok(CONTENT_PACKS.some(p => p.id === 'spiral-descent'));
  });

  t('spiral-descent contains viz blocks', () => {
    const pack = CONTENT_PACKS.find(p => p.id === 'spiral-descent');
    ok(pack !== undefined);
    const vizBlocks = pack.session.blocks.filter(b => b.type === 'viz');
    ok(vizBlocks.length >= 1, `expected ≥1 viz block, got ${vizBlocks.length}`);
  });

  t('spiral-descent viz blocks have valid vizType', () => {
    const pack = CONTENT_PACKS.find(p => p.id === 'spiral-descent');
    const VALID = ['spiral','pendulum','tunnel','pulse','vortex'];
    const vizBlocks = pack.session.blocks.filter(b => b.type === 'viz');
    for (const b of vizBlocks) {
      ok(VALID.includes(b.vizType), `vizType "${b.vizType}" is not valid`);
    }
  });

  t('spiral-descent has 4 state-typed scenes covering the full arc', () => {
    const pack = CONTENT_PACKS.find(p => p.id === 'spiral-descent');
    const types = (pack.session.scenes ?? []).map(s => s.stateType);
    ok(types.includes('calm'),     'should have calm scene');
    ok(types.includes('build'),    'should have build scene');
    ok(types.includes('peak'),     'should have peak scene');
    ok(types.includes('recovery'), 'should have recovery scene');
  });

  t('spiral-descent suggestedMode is induction', () => {
    const pack = CONTENT_PACKS.find(p => p.id === 'spiral-descent');
    eq(pack.suggestedMode, 'induction');
  });

  t('loadContentPack spiral-descent produces valid session with viz blocks', () => {
    reset();
    const pack = loadContentPack('spiral-descent');
    ok(pack !== false, 'loadContentPack should succeed');
    const vizBlocks = state.session.blocks.filter(b => b.type === 'viz');
    ok(vizBlocks.length >= 1, 'loaded session should contain viz blocks');
  });

  t('all 6 packs load without error', () => {
    for (const pack of CONTENT_PACKS) {
      reset();
      const result = loadContentPack(pack.id);
      ok(result !== false, `loadContentPack("${pack.id}") should succeed`);
    }
    eq(CONTENT_PACKS.length, 6, 'should have exactly 6 packs now');
  });

  t('getPacksByCategory includes Induction category with 2 packs', () => {
    const byCategory = getPacksByCategory();
    const inductionPacks = byCategory['Induction & Trance'] ?? [];
    ok(inductionPacks.length >= 2,
      `expected ≥2 induction packs, got ${inductionPacks.length}`);
  });


  // ── suggestedMode field ───────────────────────────────────────────────────
  t('every content pack has a suggestedMode field', () => {
    for (const pack of CONTENT_PACKS) {
      ok(typeof pack.suggestedMode === 'string' && pack.suggestedMode.length > 0,
        `"${pack.name}" missing suggestedMode`);
    }
  });

  t('suggestedMode values are known session mode ids', () => {
    const VALID = ['exposure','mindfulness','focus','freerun','induction',
                   'conditioning','training','surrender'];
    for (const pack of CONTENT_PACKS) {
      ok(VALID.includes(pack.suggestedMode),
        `"${pack.name}" suggestedMode "${pack.suggestedMode}" not in known modes`);
    }
  });


  // ── Pack data integrity ───────────────────────────────────────────────────
  t('every pack has unique id', () => {
    const ids = CONTENT_PACKS.map(p => p.id);
    const unique = new Set(ids);
    eq(unique.size, ids.length, 'duplicate pack id found');
  });

  t('every pack session has blocks array', () => {
    for (const p of CONTENT_PACKS) {
      ok(Array.isArray(p.session.blocks), `${p.id}: missing blocks array`);
    }
  });

  t('every pack session blocks have valid type', () => {
    const VALID = new Set(['text','tts','audio','video','pause','macro','viz']);
    for (const p of CONTENT_PACKS) {
      for (const b of p.session.blocks) {
        ok(VALID.has(b.type), `${p.id}: block "${b.label}" has unknown type "${b.type}"`);
      }
    }
  });

  t('every pack session blocks have valid start and duration', () => {
    for (const p of CONTENT_PACKS) {
      for (const b of p.session.blocks) {
        ok(typeof b.start === 'number' && b.start >= 0, `${p.id}: "${b.label}" invalid start`);
        ok(typeof b.duration === 'number' && b.duration > 0, `${p.id}: "${b.label}" invalid duration`);
      }
    }
  });

  t('every pack session duration is a positive number', () => {
    for (const p of CONTENT_PACKS) {
      ok(typeof p.session.duration === 'number' && p.session.duration > 0,
        `${p.id}: session.duration should be positive`);
    }
  });

  t('loadContentPack with unknown id returns null', () => {
    ok(loadContentPack('definitely-not-a-real-pack-id') === null);
  });

  t('loadContentPack loads each known pack without error', () => {
    for (const p of CONTENT_PACKS) {
      const result = loadContentPack(p.id);
      ok(result !== null, `${p.id} should load`);
      ok(typeof result.name === 'string', `${p.id}: loaded pack has no name`);
    }
  });


  // ── Pack data integrity: deep checks ─────────────────────────────────────
  t('every pack has a unique name', () => {
    const names = CONTENT_PACKS.map(p => p.name);
    eq(new Set(names).size, names.length, 'pack names should be unique');
  });

  t('every pack has a description', () => {
    for (const p of CONTENT_PACKS) {
      ok(typeof p.description === 'string' && p.description.length > 0,
        `${p.id}: missing description`);
    }
  });

  t('every pack block has a positive duration', () => {
    for (const p of CONTENT_PACKS) {
      for (const b of p.session.blocks) {
        ok(b.duration > 0, `${p.id} block "${b.label}": duration must be > 0`);
      }
    }
  });

  t('every pack scene has start < end', () => {
    for (const p of CONTENT_PACKS) {
      for (const s of (p.session.scenes ?? [])) {
        ok(s.start < s.end, `${p.id} scene "${s.name}": start must be < end`);
      }
    }
  });

  t('loadContentPack returns the pack object with name property', () => {
    const first = CONTENT_PACKS[0];
    const result = loadContentPack(first.id);
    ok(result !== null);
    eq(result.name, first.name);
  });

  t('CONTENT_PACKS has at least 6 entries', () => {
    ok(CONTENT_PACKS.length >= 6, `expected ≥6 packs, got ${CONTENT_PACKS.length}`);
  });


  // ── PATCH v61 issue 3: content-pack load clears sidebar selection ─────────
  t('loadContentPack sets selectedSidebarType to null', async () => {
    state.selectedSidebarType = 'audio';
    state.selectedSidebarIdx  = 2;
    state.selectedSidebarId   = 'fake-id';
    loadContentPack(CONTENT_PACKS[0].id);
    // The cleanup happens in a finally() so we need to let it settle
    await new Promise(r => setTimeout(r, 50));
    ok(state.selectedSidebarType === null, 'selectedSidebarType should be null after pack load');
    ok(state.selectedSidebarIdx  === null, 'selectedSidebarIdx should be null');
    ok(state.selectedSidebarId   === null, 'selectedSidebarId should be null');
  });

  t('loadContentPack: all 6 packs load without throwing', async () => {
    for (const pack of CONTENT_PACKS) {
      let threw = false;
      try { loadContentPack(pack.id); await new Promise(r => setTimeout(r, 10)); }
      catch { threw = true; }
      ok(!threw, `pack "${pack.id}" should load without throwing`);
    }
  });


  return R.summary();
}
