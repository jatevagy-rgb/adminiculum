'use strict';

/**
 * Tests for scripts/compliance/normalize-source.js
 *
 * Run: node --test scripts/compliance/normalize-source.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeNewlines,
  stripBom,
  trimTrailingWhitespacePerLine,
  normalizeSource,
  isNormalized,
} = require('./normalize-source.js');

test('normalizes CRLF and lone CR to LF', () => {
  assert.strictEqual(normalizeNewlines('a\r\nb\rc'), 'a\nb\nc');
});

test('strips UTF-8 BOM', () => {
  assert.strictEqual(stripBom('\uFEFFtext'), 'text');
});

test('trims trailing whitespace per line but keeps leading indent and blank lines', () => {
  const input = '  indented  \n\n    § 1. (1)   \n';
  assert.strictEqual(trimTrailingWhitespacePerLine(input), '  indented\n\n    § 1. (1)\n');
});

test('preserves paragraph boundaries and Hungarian Unicode (no destructive collapse)', () => {
  const input = 'Első rész\r\n\nÁLTALÁNOS RENDELKEZÉSEK\r\n1. § (1) E törvény célja a környezet védelme.\r\n\n(2) A második bekezdés.';
  const out = normalizeSource(input);
  // LF endings, blank-line paragraph separators preserved.
  assert.ok(!out.includes('\r'));
  assert.strictEqual(out, 'Első rész\n\nÁLTALÁNOS RENDELKEZÉSEK\n1. § (1) E törvény célja a környezet védelme.\n\n(2) A második bekezdés.');
});

test('preserves section/article identifiers and EU Unicode verbatim', () => {
  const input = '31. cikk\n(1) bekezdés\náéíóöőúüű\n';
  assert.strictEqual(normalizeSource(input), input);
});

test('does not rewrite legal wording and does not translate', () => {
  const input = 'Hatályos: 2026. 08. 12. – 2026. 09. 26.\n';
  assert.strictEqual(normalizeSource(input), input);
});

test('isNormalized reports true only for already-normalized text', () => {
  assert.strictEqual(isNormalized('plain\n'), true);
  assert.strictEqual(isNormalized('plain\r\n'), false);
  assert.strictEqual(isNormalized('a \n'), false);
});
