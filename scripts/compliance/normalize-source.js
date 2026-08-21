#!/usr/bin/env node
/**
 * normalize-source.js — deterministic text normalization layer for legal-source
 * corpus files, suitable for later indexing and provision anchoring.
 *
 * This is PURELY MECHANICAL and conservative. It:
 *  - normalizes line endings to LF;
 *  - strips a UTF-8 BOM if present;
 *  - trims trailing whitespace on each line (never leading indentation);
 *  - PRESERVES paragraph boundaries (blank lines are kept as separators);
 *  - preserves section/article identifiers and Hungarian/EU Unicode verbatim;
 *  - does NOT collapse internal whitespace, does NOT translate, does NOT
 *    summarize, and does NOT "clean up" legal wording.
 *
 * It never writes to the source corpus.
 *
 * Usage:
 *   node scripts/compliance/normalize-source.js --file <path>    # print normalized text to stdout
 *   node scripts/compliance/normalize-source.js --check <path>   # exit 0 if already normalized
 *
 * Exit codes:
 *   0 ok
 *   1 usage error
 *   2 file not found
 *   3 --check found non-normalized input
 */

'use strict';

const fs = require('fs');

// ---------------------------------------------------------------------------
// Primitive transforms
// ---------------------------------------------------------------------------

/** Convert \r\n and lone \r to \n. */
function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

/** Strip a UTF-8 BOM if present. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Trim trailing whitespace per line while preserving leading indentation and
 * blank lines. This never collapses internal whitespace within a line.
 */
function trimTrailingWhitespacePerLine(text) {
  return text.replace(/[ \t]+$/gm, '');
}

/**
 * Normalize a legal text conservatively. Paragraph boundaries (blank lines) and
 * every § / Article / section identifier and all Unicode are preserved.
 */
function normalizeSource(text) {
  const withoutBom = stripBom(text);
  const lf = normalizeNewlines(withoutBom);
  return trimTrailingWhitespacePerLine(lf);
}

/** True if the text is already in normalized form. */
function isNormalized(text) {
  return normalizeSource(text) === text;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error('usage: node scripts/compliance/normalize-source.js --file <path> | --check <path>');
    process.exit(1);
  }
  const mode = argv[0];
  const target = argv[1];
  if (!fs.existsSync(target)) {
    console.error(`file not found: ${target}`);
    process.exit(2);
  }
  const buf = fs.readFileSync(target);
  const text = buf.toString('utf8');
  if (mode === '--file') {
    process.stdout.write(normalizeSource(text));
    process.exit(0);
  }
  if (mode === '--check') {
    if (isNormalized(text)) {
      process.exit(0);
    }
    process.exit(3);
  }
  console.error('usage: node scripts/compliance/normalize-source.js --file <path> | --check <path>');
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeNewlines,
  stripBom,
  trimTrailingWhitespacePerLine,
  normalizeSource,
  isNormalized,
};
