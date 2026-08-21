'use strict';

/**
 * Tests for scripts/compliance/structure-source.js (candidate marker scanner).
 *
 * Run: node --test scripts/compliance/structure-source.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { scanStructure } = require('./structure-source.js');

test('detects Hungarian section (…) markers', () => {
  const text = '1. § E törvény célja.\n2. § A meghatározás.\n';
  const r = scanStructure(text);
  const sections = r.markers.filter((m) => m.kind === 'HU_SECTION');
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].line, 0);
});

test('detects Hungarian subsection markers near a section', () => {
  const text = '1. § Cél\n(1) Első bekezdés\n(2) Második bekezdés\n';
  const r = scanStructure(text);
  const subs = r.markers.filter((m) => m.kind === 'HU_SUBSECTION');
  assert.ok(subs.length >= 2);
});

test('detects EU Article markers in Hungarian translations', () => {
  const text = '1. cikk Tárgy\n(1) bekezdés\n2. cikk Fogalommeghatározások\n';
  const r = scanStructure(text);
  const arts = r.markers.filter((m) => m.kind === 'EU_ARTICLE');
  assert.strictEqual(arts.length, 2);
});

test('detects annex / chapter markers (HU and EU)', () => {
  const text = 'MELLÉKLET\nIII. FEJEZET\nmelléklet I\n';
  const r = scanStructure(text);
  const kinds = r.markers.map((m) => m.kind);
  assert.ok(kinds.includes('EU_ANNEX') || kinds.includes('HU_ANNEX'));
  assert.ok(kinds.includes('EU_CHAPTER') || kinds.includes('HU_CHAPTER'));
});

test('reports no markers when none are explicitly present', () => {
  const r = scanStructure('plain text with no structural markers\nsecond line\n');
  assert.strictEqual(r.markers.length, 0);
});

test('does not produce legal propositions, only locators', () => {
  const r = scanStructure('1. § E törvény célja.\n');
  for (const m of r.markers) {
    assert.ok(m.kind && Number.isInteger(m.line));
    assert.ok(!('obligation' in m));
    assert.ok(!('applicability' in m));
  }
});
