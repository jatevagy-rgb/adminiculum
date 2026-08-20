#!/usr/bin/env node
/**
 * inventory-source.js — deterministic legal source corpus inventory tool.
 *
 * Reads a READ-ONLY directory of legal source TXT files and produces a
 * machine-readable manifest (metadata + SHA-256 checksum only). It never
 * writes to the source corpus and never copies legal text into the manifest.
 *
 * Detection is deterministic: filename patterns, header blocks (CÍM/FORRÁS/
 * LETÖLTÉS), CELEX numbers, and targeted heading scans. No AI, no runtime API,
 * no LLM dependency. Where a field cannot be established with confidence it is
 * set to null / UNKNOWN rather than invented.
 *
 * Usage:
 *   node scripts/compliance/inventory-source.js \
 *     --corpus <absolute-or-relative-source-dir> \
 *     --out <output-json-path> \
 *     [--generated-at <ISO-timestamp>]   # deterministic output for tests
 *
 * Exit codes:
 *   0 success
 *   1 usage error
 *   2 corpus directory not found
 *   3 no .txt files found
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRIPT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { corpus: null, out: null, generatedAt: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--corpus' && argv[i + 1]) args.corpus = argv[i + 1];
    else if (a === '--out' && argv[i + 1]) args.out = argv[i + 1];
    else if (a === '--generated-at' && argv[i + 1]) args.generatedAt = argv[i + 1];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function normalizeRelative(p) {
  return p.split(path.sep).join('/');
}

function isUtf8(buf) {
  const s = buf.toString('utf8');
  return !s.includes('\uFFFD');
}

function decodeUtf8(buf) {
  // Strip BOM if present.
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  return b.toString('utf8');
}

function splitLines(text) {
  return text.split(/\r?\n/);
}

function normalizeSpaces(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Header block parsing (CÍM / FORRÁS / LETÖLTÉS)
// ---------------------------------------------------------------------------

function parseHeader(lines) {
  const header = {};
  for (let i = 0; i < Math.min(12, lines.length); i += 1) {
    const m = lines[i].match(/^([A-ZÁÉÍÓÖŐÚÜŰ]{2,}):\s*(.*)$/);
    if (m) {
      header[m[1]] = m[2].trim();
    }
  }
  return header;
}

// ---------------------------------------------------------------------------
// CELEX / EU classification
// ---------------------------------------------------------------------------

function extractCelexFromUrl(sourceUrl, fileName) {
  let celexRaw = null;
  if (sourceUrl) {
    const m = sourceUrl.match(/CELEX:(\d{5}[A-Z]{1,2}\d{4}(?:-\d{8})?)/i);
    if (m) {
      celexRaw = m[1];
    } else {
      // EUR-Lex OJ-uri form: ?uri=OJ:L_202401689 -> CELEX 32024R1689 only when
      // the document number is exactly 4 digits after stripping leading zeros.
      const m2 = sourceUrl.match(/[?&]uri=OJ:L_(\d{4})(\d{4,5})/i);
      if (m2) {
        const year = m2[1];
        const doc = m2[2].replace(/^0+/, '');
        if (doc.length === 4) celexRaw = `3${year}R${doc}`;
      }
    }
  }
  if (!celexRaw && fileName) {
    const m = fileName.match(/\b(\d{5}[A-Z]{1,2}\d{4})\b/);
    if (m) celexRaw = m[1];
  }
  return celexRaw ? celexRaw.toUpperCase() : null;
}

function celexInfo(celex) {
  if (!celex) return null;
  const m = celex.match(/^([0-9])(\d{4})([A-Z]{1,2})(\d{4})$/i);
  if (!m) return null;
  let [, sector, year, kind, number] = m;
  kind = kind.toUpperCase();
  // The sector digit is the broader family; the kind LETTER distinguishes the
  // act type (R=regulation, L=directive, D=decision, ...).
  let family = 'EU_UNCLASSIFIED';
  if (sector === '3' || sector === '0') family = 'EU';
  else if (sector === '1') family = 'EU_TREATY';
  else if (sector === '2') family = 'EU_INTERNATIONAL_AGREEMENT';
  else if (sector === '4') family = 'EU_SUPPLEMENTARY';
  else if (sector === '5') family = 'EURATOM';
  else if (sector === '7') family = 'EEA';
  else if (sector === '9') family = 'EFTA';

  let documentType = `${family}_UNCLASSIFIED`;
  if (kind === 'R') documentType = 'EU_REGULATION';
  else if (kind === 'L') documentType = 'EU_DIRECTIVE';
  else if (kind === 'D') documentType = 'EU_DECISION';
  else if (kind === 'P') documentType = 'EU_PROTOCOL';
  else if (kind === 'C') documentType = 'EU_CONVENTION';
  else if (kind === 'B') documentType = 'EU_DECISION';

  if (sector === '0') {
    // Consolidated CELEX (leading 0): the underlying act type is encoded in the
    // kind letter; the base identifier normalises to sector 3 so consolidated
    // and OJ-derived identifiers group under the same legal source.
    sector = '3';
  }
  const base = `${sector}${year}${kind}${number}`;
  return { sector, year, kind, number, base, documentType };
}

function euVersionDateFromCelex(celexRaw) {
  // CELEX in URL may carry a version suffix, e.g. 02006R1907-20260511.
  const m = String(celexRaw).match(/(20\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// ---------------------------------------------------------------------------
// Hungarian classification / citation parsing
// ---------------------------------------------------------------------------

const HU_ROMAN_RE = /^(\d{4})\.\s*évi\s+([IVXLC]+)\.\s*törvény/i;

// Decree citation forms: filename "151_2003. (IX. 22.) Korm. rendelet.txt" or
// CÍM "151/2003. (IX. 22.) Korm. rendelet".
const HU_DECREE_RE = /^(\d+)[/_](\d{4})\.\s*\(([^)]+)\)\s+([A-Za-zÁÉÍÓÖŐÚÜŰ]+\.?)\s+rendelet/i;

function classifyName(source, what) {
  // what: 'filename' | 'headerTitle'
  if (/\.zip$/i.test(source)) return { kind: 'ARTIFACT', sourceType: 'ARCHIVE' };
  if (/^jogszabaly\.txt$/i.test(source)) return { kind: 'NOTE', sourceType: 'NOTE' };

  const huAct = source.match(HU_ROMAN_RE);
  if (huAct) {
    return {
      kind: 'SOURCE',
      sourceType: 'HU_ACT',
      citation: `${huAct[1]}. évi ${huAct[2]}. törvény`,
      citationParts: { year: huAct[1], numberRoman: huAct[2], number: romanToInt(huAct[2]) },
    };
  }

  const huDecree = source.match(HU_DECREE_RE);
  if (huDecree) {
    const issuer = huDecree[4].toUpperCase().replace(/\.$/, '');
    return {
      kind: 'SOURCE',
      sourceType: issuer === 'KORM' ? 'HU_GOVERNMENT_DECREE' : 'HU_MINISTRY_DECREE',
      citation: `${huDecree[1]}/${huDecree[2]}. (${huDecree[3]}) ${huDecree[4]} rendelet`,
      citationParts: {
        number: huDecree[1],
        year: huDecree[2],
        date: huDecree[3],
        issuer,
      },
    };
  }

  if (/^Egységes szerkezetbe foglalt SZÖVEG/i.test(source)) {
    return { kind: 'SOURCE', sourceType: 'EU_CONSOLIDATED' };
  }

  if (/^L_\d{7,9}HU\./i.test(source)) {
    return { kind: 'SOURCE', sourceType: 'EU_OJ_TEXT' };
  }

  return { kind: 'SOURCE', sourceType: 'UNKNOWN', _source: what };
}

function classifyFileName(fileName, header, sourceUrl) {
  // Prefer the filename (canonical for the corpus), fall back to the CÍM header
  // so generic fixture names still classify correctly.
  const byName = classifyName(fileName, 'filename');
  if (byName.sourceType !== 'UNKNOWN') return byName;
  const headerTitle = header && header['CÍM'] ? header['CÍM'] : null;
  if (headerTitle) {
    const byHeader = classifyName(headerTitle, 'headerTitle');
    if (byHeader.sourceType !== 'UNKNOWN') {
      delete byHeader._source;
      return byHeader;
    }
  }
  delete byName._source;
  return byName;
}

function romanToInt(roman) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < roman.length; i += 1) {
    const cur = map[roman[i]];
    const next = map[roman[i + 1]];
    total += next && next > cur ? -cur : cur;
  }
  return total;
}

function huEffectivePeriod(text) {
  const lines = splitLines(text);
  const hat = lines.find((l) => l.startsWith('Hatályos:'));
  if (!hat) return null;
  const m = hat.match(/Hatályos:\s*(\d{4})\.\s*(\d{2})\.\s*(\d{2})\.\s*[–-]+\s*(?:(\d{4})\.\s*(\d{2})\.\s*(\d{2})\.)?/);
  if (!m) return { raw: normalizeSpaces(hat.replace(/^Hatályos:\s*/, '')), effectiveFrom: null, validTo: null };
  return {
    raw: normalizeSpaces(hat.replace(/^Hatályos:\s*/, '')),
    effectiveFrom: `${m[1]}-${m[2]}-${m[3]}`,
    validTo: m[4] ? `${m[4]}-${m[5]}-${m[6]}` : null,
  };
}

// ---------------------------------------------------------------------------
// Title detection
// ---------------------------------------------------------------------------

function huTitleBlock(lines, sourceType) {
  // After the header block (CÍM/FORRÁS/LETÖLTÉS) and a blank line, njt exports
  // put the citation line then the subject. Some exports have a TOC first.
  let i = 0;
  while (i < lines.length && lines[i].trim() !== '') i += 1;
  i += 1; // skip the blank line after the header
  const block = [];
  let sawCitation = false;
  for (let j = i; j < Math.min(i + 12, lines.length); j += 1) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.startsWith('Hatályos:')) break;
    if (t === 'Tartalomjegyzék' || t === 'Szerkezet') continue;
    if (/^[IVX]+\.\s*Fejezet/i.test(t)) break;
    if (/^1\.\s*§/i.test(t)) break;
    if (!sawCitation && (HU_ROMAN_RE.test(t) || /^\d+\/\d{4}\.\s*\(.*\)\s+[^\s]+ rendelet/i.test(t))) {
      sawCitation = true;
      block.push(t);
      continue;
    }
    if (sawCitation) {
      // Strip trailing footnote markers (e.g. "a helyi adókról1" -> "a helyi adókról").
      block.push(t.replace(/\d+$/, ''));
      if (block.length >= 2) break;
    }
  }
  return block.length ? block : null;
}

function euBodyStart(lines) {
  // The TOC (preambulum / rendelkező rész / Záró formulák / melléklet ...)
  // sits right after the download header. The real enacting heading appears
  // after the OJ masthead or the CELEX version line. Find that boundary.
  const limit = Math.min(60, lines.length);
  for (let i = 0; i < limit; i += 1) {
    const t = lines[i].trim();
    if (/^\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?$/.test(t)) return i + 1;
    if (/^0?\d{4}[A-Z]{1,2}\d{4}\s*—\s*HU/.test(t)) return i + 1;
    if (t === 'Hivatalos Lapja') return i + 1;
    if (/^L sorozat$/.test(t)) return i + 1;
  }
  return 0;
}

function euPublicationDate(lines) {
  // OJ masthead carries the publication date, e.g. "2024.7.12." or "2024.12.5.".
  const limit = Math.min(45, lines.length);
  for (let i = 0; i < limit; i += 1) {
    const m = lines[i].trim().match(/^(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})\.?$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}

function euTitleBlock(lines) {
  const start = euBodyStart(lines);
  const re =
    /((?:AZ EURÓPAI PARLAMENT ÉS A TANÁCS|AZ EURÓPAI PARLAMENT ÉS AZ EURÓPAI UNIÓ TANÁCSA|A BIZOTTSÁG|A TANÁCS|AZ EURÓPAI KÖZÖSSÉGEK BIZOTTSÁGA)[^\n]{0,140}(?:RENDELETE|IRÁNYELVE|HATÁROZATA|RENDELET|IRÁNYELV|AJÁNLÁSA))/;
  const limit = Math.min(700, lines.length);
  for (let i = start; i < limit; i += 1) {
    const m = lines[i].match(re);
    if (m) {
      const subject = lines
        .slice(i + 1, i + 8)
        .map((s) => s.trim())
        .filter((s) => {
          if (!s) return false;
          // Skip enacting-form date lines like "(2006. december 18.)".
          if (/^\(\d{4}\.\s*[a-záéíóöőúüű]+\s*\d{1,2}\.?\s*\)/.test(s)) return false;
          if (/^\((?:EGT-vonatkozású szöveg|az értesítés|a továbbiakban)/.test(s)) return false;
          return true;
        })
        .slice(0, 2)
        .join(' ');
      return { actHeading: normalizeSpaces(m[1]), subject: subject || null };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Completeness heuristic (explicitly conservative; never authoritative)
// ---------------------------------------------------------------------------

function completenessHeuristic(text, sourceType, kind) {
  if (kind === 'ARTIFACT' || kind === 'NOTE') return 'NOT_APPLICABLE';
  const n = text.length;
  if (n < 500) return 'PARTIAL';
  if (n < 10000) return 'PARTIAL';
  // Structural heuristic only: a large body is treated as complete unless a
  // specific fragment marker is seen. This is NOT legal verification.
  const tail = splitLines(text)
    .filter((l) => l.trim())
    .slice(-5)
    .map((l) => l.trim())
    .join(' ');
  const looksPartial = /(töredék|fragment|HIÁNYOS|kivonat csak)/i.test(tail);
  return looksPartial ? 'PARTIAL' : 'COMPLETE';
}

// ---------------------------------------------------------------------------
// Parse confidence
// ---------------------------------------------------------------------------

function computeConfidence(entry) {
  if (entry.kind === 'ARTIFACT' || entry.kind === 'NOTE') return 'HIGH';
  if (entry.sourceType === 'UNKNOWN') return 'LOW';
  let score = 0;
  if (entry.citation) score += 1;
  if (entry.title) score += 1;
  if (entry.celex) score += 1;
  if (entry.effectivePeriod) score += 1;
  if (entry.jurisdiction !== 'UNKNOWN') score += 1;
  if (score >= 3) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Per-file inventory
// ---------------------------------------------------------------------------

function inventoryFile(filePath, relPath, fileName) {
  const buf = fs.readFileSync(filePath);
  const sizeBytes = buf.length;
  const checksum = sha256(filePath);
  const encoding = isUtf8(buf) ? 'utf-8' : 'UNKNOWN';

  const text = encoding === 'utf-8' ? decodeUtf8(buf) : '';
  const lines = splitLines(text);
  const header = parseHeader(lines);

  const sourceUrl = header['FORRÁS'] || null;
  const downloadedAt = header['LETÖLTÉS'] || null;
  const headerTitle = header['CÍM'] || null;

  const cls = classifyFileName(fileName, header, sourceUrl);
  const kind = cls.kind;
  const sourceType = cls.sourceType;
  const citation = cls.citation || null;
  const citationParts = cls.citationParts || null;

  let jurisdiction = 'UNKNOWN';
  if (kind === 'SOURCE') {
    if (sourceType.startsWith('HU_')) jurisdiction = 'HU';
    else if (sourceType === 'EU_CONSOLIDATED' || sourceType === 'EU_OJ_TEXT') jurisdiction = 'EU';
  }

  // CELEX extraction for EU sources.
  let celex = null;
  let celexBase = null;
  let documentType = null;
  let versionDate = null;
  if (kind === 'SOURCE' && (sourceType === 'EU_CONSOLIDATED' || sourceType === 'EU_OJ_TEXT')) {
    const raw = sourceUrl ? sourceUrl.match(/CELEX:([0-9A-Z\-]+)/i) : null;
    const celexRaw = raw ? raw[1] : extractCelexFromUrl(sourceUrl, fileName);
    if (celexRaw) {
      // CELEX may carry a version suffix: 02006R1907-20260511
      const [basePart, suffix] = String(celexRaw).split('-');
      celex = basePart.toUpperCase();
      if (suffix) versionDate = euVersionDateFromCelex(`${basePart}-${suffix}`);
      const info = celexInfo(celex);
      if (info) {
        celexBase = info.base;
        documentType = info.documentType;
      }
    }
    if (!versionDate && sourceType === 'EU_CONSOLIDATED') {
      const dm = fileName.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (dm) versionDate = `${dm[3]}-${dm[2]}-${dm[1]}`;
    }
    if (!versionDate && sourceType === 'EU_OJ_TEXT') {
      versionDate = euPublicationDate(lines);
    }
  }

  // Title detection.
  let title = null;
  let actHeading = null;
  let titleSource = null;
  if (kind === 'SOURCE') {
    if (sourceType === 'HU_ACT' || sourceType.startsWith('HU_') || sourceType === 'UNKNOWN') {
      const block = huTitleBlock(lines, sourceType);
      if (block && block.length >= 2) {
        title = normalizeSpaces(`${block[0]} ${block.slice(1).join(' ')}`);
        titleSource = 'njt-title-block';
      } else if (block && block.length === 1) {
        title = normalizeSpaces(block[0]);
        titleSource = 'njt-title-block-single';
      }
    }
    if (!title && (sourceType === 'EU_CONSOLIDATED' || sourceType === 'EU_OJ_TEXT' || sourceType === 'UNKNOWN')) {
      const eu = euTitleBlock(lines);
      if (eu) {
        actHeading = eu.actHeading;
        title = eu.subject ? normalizeSpaces(`${eu.actHeading} ${eu.subject}`) : normalizeSpaces(eu.actHeading);
        titleSource = 'eu-enacting-heading';
      }
    }
  }

  const effectivePeriod =
    kind === 'SOURCE' && jurisdiction === 'HU' ? huEffectivePeriod(text) : null;

  const completeness = completenessHeuristic(text, sourceType, kind);

  const entry = {
    kind,
    fileName,
    relativePath: normalizeRelative(relPath),
    sizeBytes,
    sha256: checksum,
    encoding,
    sourceType,
    jurisdiction,
    headerTitle,
    sourceUrl,
    downloadedAt,
    citation,
    citationParts,
    celex,
    celexBase,
    documentType,
    versionDate,
    effectivePeriod,
    title,
    actHeading,
    titleSource,
    completeness,
    parseConfidence: null, // computed after assembly below
    notes: [],
  };

  if (sourceUrl && sourceUrl.includes('utm_source=chatgpt.com')) {
    entry.notes.push('source URL contains a utm_source=chatgpt.com tracking suffix (metadata only; citation unaffected)');
  }
  if (kind === 'NOTE') {
    entry.notes.push('non-substantive note/pointer file; no legal text');
  }
  if (kind === 'ARTIFACT') {
    entry.notes.push('archive artifact (zip) containing copies of corpus TXT files; not parsed as a source');
  }
  if (entry.completeness === 'PARTIAL' && entry.kind === 'SOURCE') {
    entry.notes.push('structural heuristic flags small body (or fragment marker); completeness NOT verified — verify manually before use');
  }
  if (sourceType === 'UNKNOWN' && kind === 'SOURCE') {
    entry.notes.push('file format not matched by known filename patterns; manual review required');
  }

  entry.parseConfidence = computeConfidence(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Canonical source identity
// ---------------------------------------------------------------------------

function canonicalKey(entry) {
  if (entry.kind === 'ARTIFACT' || entry.kind === 'NOTE') return null;
  if (entry.jurisdiction === 'HU' && entry.citation) {
    const p = entry.citationParts || {};
    if (p.year && p.numberRoman) return `HU:ACT:${p.year}:${p.numberRoman}`;
    if (p.year && p.number) return `HU:DECREE:${p.number}/${p.year}:${p.issuer}`;
    return `HU:${entry.sourceType}:${entry.citation}`;
  }
  if (entry.jurisdiction === 'EU' && entry.celexBase) {
    return `EU:${entry.documentType || 'EU'}:CELEX:${entry.celexBase}`;
  }
  return `UNKNOWN:${entry.fileName}`;
}

// ---------------------------------------------------------------------------
// Assembly / grouping
// ---------------------------------------------------------------------------

function buildManifest(corpusRoot, entries, generatedAt) {
  const sourceEntries = entries.filter((e) => e.kind === 'SOURCE');
  const artifactEntries = entries.filter((e) => e.kind !== 'SOURCE');

  // Assign legalSourceIds grouped by canonical key.
  const groupIds = new Map();
  const legalSources = [];
  for (const e of sourceEntries) {
    const key = canonicalKey(e);
    if (!groupIds.has(key)) {
      const id = `LS-${String(legalSources.length + 1).padStart(4, '0')}`;
      groupIds.set(key, id);
      legalSources.push({
        id,
        canonicalSourceKey: key,
        jurisdiction: e.jurisdiction,
        sourceType: e.sourceType,
        documentType: e.documentType,
        citation: e.citation,
        celexBase: e.celexBase,
        title: e.title,
        language: 'hu',
      });
    }
  }

  // Duplicate detection within the same canonical source (checksum differences).
  const dupGroups = new Map();
  for (const e of sourceEntries) {
    const key = canonicalKey(e);
    if (!key) continue;
    if (!dupGroups.has(key)) dupGroups.set(key, []);
    dupGroups.get(key).push(e);
  }
  for (const [key, list] of dupGroups) {
    if (list.length <= 1) continue;
    const sig = list.map((e) => e.sha256);
    if (new Set(sig).size > 1) {
      for (const e of list) {
        e.notes.push(`near-duplicate: same canonical source key "${key}" but different SHA-256 — review content delta before selecting canonical version`);
      }
    }
  }

  const versions = sourceEntries.map((e) => {
    const key = canonicalKey(e);
    const { id } = legalSources.find((ls) => ls.canonicalSourceKey === key) || {};
    return {
      legalSourceId: id,
      fileName: e.fileName,
      relativePath: e.relativePath,
      sizeBytes: e.sizeBytes,
      sha256: e.sha256,
      encoding: e.encoding,
      sourceType: e.sourceType,
      sourceUrl: e.sourceUrl,
      downloadedAt: e.downloadedAt,
      citation: e.citation,
      celex: e.celex,
      versionDate: e.versionDate,
      effectivePeriod: e.effectivePeriod,
      completeness: e.completeness,
      parseConfidence: e.parseConfidence,
      notes: e.notes,
    };
  });

  const artifacts = artifactEntries.map((e) => ({
    fileName: e.fileName,
    relativePath: e.relativePath,
    sizeBytes: e.sizeBytes,
    sha256: e.sha256,
    kind: e.kind,
    sourceType: e.sourceType,
    notes: e.notes,
  }));

  return {
    manifestVersion: '1.0.0',
    generator: {
      name: 'scripts/compliance/inventory-source.js',
      version: SCRIPT_VERSION,
    },
    generatedAt,
    corpus: {
      root: corpusRoot,
      readOnly: true,
      note: 'Legal TXT corpus is external, read-only source material. The inventory tool never writes to it.',
    },
    schema: {
      LegalSource: {
        fields: ['id', 'canonicalSourceKey', 'jurisdiction', 'sourceType', 'documentType', 'citation', 'celexBase', 'title', 'language'],
        identity: ['canonicalSourceKey'],
        note: 'Stable canonical legal-source identity. Survives file re-downloads because it is derived from citation/CELEX, not file name.',
      },
      LegalSourceVersion: {
        fields: ['legalSourceId', 'fileName', 'relativePath', 'sizeBytes', 'sha256', 'encoding', 'sourceType', 'sourceUrl', 'downloadedAt', 'citation', 'celex', 'versionDate', 'effectivePeriod', 'completeness', 'parseConfidence', 'notes'],
        identity: ['legalSourceId', 'sha256'],
        note: 'One manifest entry per physical file = one LegalSourceVersion. A new sha256 for the same legalSourceId is a candidate RegulatoryChange (metadata-level only).',
      },
    },
    changeDetection: {
      strategy: 'same canonicalSourceKey (legalSourceId) with a different sha256 => candidate RegulatoryChange entry; no automatic legal-meaning diff',
      keyFields: ['canonicalSourceKey'],
      fingerprintFields: ['sha256', 'sizeBytes', 'versionDate', 'effectivePeriod'],
      limitations: [
        'metadata-only; does not diff legal meaning',
        'does not compute requirement impact',
        'manual/legal review required before any RegulatoryChange is accepted',
      ],
    },
    counts: {
      filesScanned: entries.length,
      sourceVersions: sourceEntries.length,
      noteFiles: artifactEntries.filter((e) => e.kind === 'NOTE').length,
      archiveFiles: artifactEntries.filter((e) => e.kind === 'ARTIFACT').length,
      uniqueLegalSources: legalSources.length,
      nearDuplicateGroups: [...dupGroups.values()].filter((l) => new Set(l.map((e) => e.sha256)).size > 1 && l.length > 1).length,
    },
    legalSources,
    versions,
    artifacts,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Deterministic legal source corpus inventory tool.\n' +
        '\n' +
        '  node scripts/compliance/inventory-source.js --corpus <dir> --out <json> [--generated-at <iso>]\n'
    );
    process.exit(0);
  }
  if (!args.corpus || !args.out) {
    console.error('usage: node scripts/compliance/inventory-source.js --corpus <dir> --out <json> [--generated-at <iso>]');
    process.exit(1);
  }

  const corpusRoot = path.resolve(args.corpus);
  if (!fs.existsSync(corpusRoot) || !fs.statSync(corpusRoot).isDirectory()) {
    console.error(`corpus directory not found: ${corpusRoot}`);
    process.exit(2);
  }

  const outPath = path.resolve(args.out);
  const files = [];
  const walk = (dir, base) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      // Never scan the tool's own output file (it may legally live inside the
      // corpus directory for convenience), nor any JSON output.
      if (path.resolve(full) === outPath || /\.json$/i.test(entry.name)) continue;
      if (entry.isDirectory()) walk(full, path.join(base, entry.name));
      else files.push({ full, rel: path.join(base, entry.name), name: entry.name });
    }
  };
  walk(corpusRoot, '.');

  const txtFiles = files.filter((f) => /\.txt$/i.test(f.name));
  const allFiles = [...txtFiles, ...files.filter((f) => !/\.txt$/i.test(f.name))];
  if (allFiles.length === 0) {
    console.error('no files found in corpus');
    process.exit(3);
  }

  const entries = allFiles
    .sort((a, b) => a.rel.localeCompare(b.rel, 'hu'))
    .map((f) => inventoryFile(f.full, f.rel, f.name));

  const generatedAt = args.generatedAt || new Date().toISOString();
  const manifest = buildManifest(corpusRoot, entries, generatedAt);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`wrote ${path.resolve(args.out)}`);
  console.log(`files scanned: ${manifest.counts.filesScanned}`);
  console.log(`source versions: ${manifest.counts.sourceVersions}`);
  console.log(`unique legal sources: ${manifest.counts.uniqueLegalSources}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  classifyFileName,
  huTitleBlock,
  euTitleBlock,
  huEffectivePeriod,
  canonicalKey,
  inventoryFile,
  buildManifest,
  celexInfo,
  extractCelexFromUrl,
  romanToInt,
  normalizeSpaces,
  parseHeader,
  sha256,
  SCRIPT_VERSION,
};