#!/usr/bin/env node
/**
 * structure-source.js — CANDIDATE structural marker scanner (no legal reading).
 *
 * Mechanically identifies explicit structural markers in legal text and returns
 * structure LOCATORS (kind + line) — never legal propositions, never an
 * interpretation of what a provision means.
 *
 * Hungarian markers: §, subsection, point (pont), annex (melléklet)
 * EU markers:       Article (cikk), paragraph (bekezdés), Annex (melléklet),
 *                   Chapter (fejezet), Section (szakasz)
 *
 * A marker is only reported if the text explicitly contains it. Line numbers are
 * advisory capture-time locations, not stable legal identity.
 *
 * Usage:
 *   node scripts/compliance/structure-source.js --file <path>
 */

'use strict';

const fs = require('fs');

/** Find the first line index (0-based) at or after `from` whose trimmed text
 *  matches `re`. Returns -1 if not found. */
function findLine(lines, re, from = 0) {
  for (let i = from; i < lines.length; i += 1) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Scan normalized text (LF line endings) for explicit structural markers.
 * Returns { markers: [...], paragraphCount, nonEmptyLineCount }.
 */
function scanStructure(text) {
  const lines = text.split('\n');
  const markers = [];

  // Hungarian section marker: "1. §" or "1.§"
  const huSection = /^\s*\d+\.\s*§|^\s*§\s*\d+/;
  // Hungarian subsection "(1) ..." appearing on its own line near a section
  const huSubsection = /^\s*\(\s*\d+\s*\)\s*\S/;
  // Hungarian point / annex / chapter / part
  const huPoint = /^\s*\d+\.\s*pont\b/i;
  const huAnnex = /^\s*(?:[0-9A-Z]+\.\s*)?melléklet\b/i;
  const huChapter = /^\s*(?:[IVX]+\.\s*)?fejezet\b/i;

  // EU markers (Hungarian translations use "cikk", "bekezdés", "melléklet").
  const euArticle = /^\s*\d+\.\s*cikk\b|^\s*cikk\s*\d+/i;
  const euParagraph = /\b\d+\.\s*bekezdés\b/i;
  const euAnnex = /^\s*(?:[0-9A-Z]+\.\s*)?MELLÉKLET\b|^\s*(?:[0-9A-Z]+\.\s*)?melléklet\b/;
  const euChapter = /^\s*(?:[IVX]+\.\s*)?FEJEZET\b|^\s*(?:[IVX]+\.\s*)?fejezet\b/;
  const euSection = /^\s*([0-9]+\.\s*)?szakasz\b/i;

  let prevSectionLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i];
    const trimmed = t.trim();
    if (!trimmed) continue;

    if (huSection.test(t)) {
      prevSectionLine = i;
      markers.push({ kind: 'HU_SECTION', line: i, text: trimmed.slice(0, 120) });
      continue;
    }
    if (huSubsection.test(t) && prevSectionLine >= 0 && i - prevSectionLine < 6) {
      markers.push({ kind: 'HU_SUBSECTION', line: i, text: trimmed.slice(0, 120) });
      continue;
    }
    if (huPoint.test(t)) markers.push({ kind: 'HU_POINT', line: i, text: trimmed.slice(0, 120) });
    if (huAnnex.test(t)) markers.push({ kind: 'HU_ANNEX', line: i, text: trimmed.slice(0, 120) });
    if (huChapter.test(t)) markers.push({ kind: 'HU_CHAPTER', line: i, text: trimmed.slice(0, 120) });

    if (euArticle.test(t)) markers.push({ kind: 'EU_ARTICLE', line: i, text: trimmed.slice(0, 120) });
    if (euParagraph.test(t)) markers.push({ kind: 'EU_PARAGRAPH', line: i, text: trimmed.slice(0, 120) });
    if (euAnnex.test(t)) markers.push({ kind: 'EU_ANNEX', line: i, text: trimmed.slice(0, 120) });
    if (euChapter.test(t)) markers.push({ kind: 'EU_CHAPTER', line: i, text: trimmed.slice(0, 120) });
    if (euSection.test(t)) markers.push({ kind: 'EU_SECTION', line: i, text: trimmed.slice(0, 120) });
  }

  return {
    markers,
    paragraphCount: lines.filter((l) => l.trim() === '').length,
    nonEmptyLineCount: lines.filter((l) => l.trim() !== '').length,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const fileIdx = argv.indexOf('--file');
  if (fileIdx < 0 || !argv[fileIdx + 1]) {
    console.error('usage: node scripts/compliance/structure-source.js --file <path>');
    process.exit(1);
  }
  const target = argv[fileIdx + 1];
  if (!fs.existsSync(target)) {
    console.error(`file not found: ${target}`);
    process.exit(2);
  }
  const result = scanStructure(fs.readFileSync(target, 'utf8'));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  scanStructure,
  findLine,
};
