'use strict';

/**
 * Tests for scripts/compliance/inventory-source.js
 *
 * Run with:
 *   node --test scripts/compliance/inventory-source.test.js
 *
 * These tests use synthetic fixture directories under the OS temp dir. They
 * never touch the real legal source corpus.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  classifyFileName,
  canonicalKey,
  inventoryFile,
  buildManifest,
  huEffectivePeriod,
  huTitleBlock,
  euTitleBlock,
  extractCelexFromUrl,
  celexInfo,
} = require('./inventory-source.js');

function makeFixtureDir(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-test-'));
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const HU_ACT_FIXTURE = `CÍM: 1995. évi LIII. törvény
FORRÁS: https://njt.jog.gov.hu/jogszabaly/1995-53-00-00
LETÖLTÉS: 2026-08-19T10:33:52.749Z

1995. évi LIII. törvény
a környezet védelmének általános szabályairól1
Hatályos: 2026. 08. 12. – 2026. 09. 26.

Első rész
ÁLTALÁNOS RENDELKEZÉSEK
1. § (1) E törvény célja a környezet védelmének általános szabályainak meghatározása.
`;

const EU_REG_FIXTURE = `CÍM: Egységes szerkezetbe foglalt SZÖVEG: 32016R0679 — HU — 01.06.2026
FORRÁS: https://eur-lex.europa.eu/legal-content/HU/TXT/HTML/?uri=CELEX:02016R0679-20260601
LETÖLTÉS: 2026-08-19T10:19:02.211Z

AZ EURÓPAI PARLAMENT ÉS A TANÁCS (EU) 2016/679 RENDELETE
(2016. április 27.)
a természetes személyeknek a személyes adatok kezelése tekintetében történő védelméről és az ilyen adatok szabad áramlásáról
1. cikk
`;

const EU_DIR_FIXTURE = `CÍM: L_2022333HU.01008001.xml
FORRÁS: https://eur-lex.europa.eu/legal-content/HU/TXT/HTML/?uri=CELEX:32022L2555
LETÖLTÉS: 2026-08-19T10:30:22.881Z

AZ EURÓPAI PARLAMENT ÉS A TANÁCS (EU) 2022/2555 IRÁNYELVE
(2022. december 14.)
az Unió egész területén egységesen magas szintű kiberbiztonsági intézkedéseket biztosító intézkedésekről
`;

test('HU act citation recognition', () => {
  const cls = classifyFileName('1995. évi LIII. törvény.txt', {}, null);
  assert.strictEqual(cls.sourceType, 'HU_ACT');
  assert.strictEqual(cls.citation, '1995. évi LIII. törvény');
  assert.deepStrictEqual(cls.citationParts.numberRoman, 'LIII');
  assert.strictEqual(cls.citationParts.number, 53);
  assert.strictEqual(cls.citationParts.year, '1995');
});

test('HU government decree recognition (Korm. with trailing dot)', () => {
  const cls = classifyFileName('151_2003. (IX. 22.) Korm. rendelet.txt', {}, null);
  assert.strictEqual(cls.sourceType, 'HU_GOVERNMENT_DECREE');
  assert.strictEqual(cls.citationParts.issuer, 'KORM');
  assert.strictEqual(cls.citationParts.number, '151');
});

test('HU ministry decree recognition', () => {
  const cls = classifyFileName('19_2014. (IV. 29.) NGM rendelet.txt', {}, null);
  assert.strictEqual(cls.sourceType, 'HU_MINISTRY_DECREE');
  assert.strictEqual(cls.citationParts.issuer, 'NGM');
});

test('EU consolidated regulation recognition (CELEX from URL)', () => {
  const dir = makeFixtureDir(test, { 'a.txt': EU_REG_FIXTURE });
  const entry = inventoryFile(path.join(dir, 'a.txt'), 'a.txt', 'a.txt');
  assert.strictEqual(entry.sourceType, 'EU_CONSOLIDATED');
  assert.strictEqual(entry.jurisdiction, 'EU');
  assert.strictEqual(entry.celexBase, '32016R0679');
  assert.strictEqual(entry.documentType, 'EU_REGULATION');
  assert.strictEqual(entry.versionDate, '2026-06-01');
  assert.match(entry.title, /2016\/679/);
});

test('EU directive recognition (CELEX kind letter L)', () => {
  const dir = makeFixtureDir(test, { 'b.txt': EU_DIR_FIXTURE });
  const entry = inventoryFile(path.join(dir, 'b.txt'), 'b.txt', 'b.txt');
  assert.strictEqual(entry.sourceType, 'EU_OJ_TEXT');
  assert.strictEqual(entry.celexBase, '32022L2555');
  assert.strictEqual(entry.documentType, 'EU_DIRECTIVE');
  assert.match(entry.title, /IRÁNYELVE/);
});

test('checksum stability (same bytes => same sha256, deterministic tool)', () => {
  const dir = makeFixtureDir(test, { 'x.txt': HU_ACT_FIXTURE });
  const e1 = inventoryFile(path.join(dir, 'x.txt'), 'x.txt', 'x.txt');
  const e2 = inventoryFile(path.join(dir, 'x.txt'), 'x.txt', 'x.txt');
  assert.strictEqual(e1.sha256, e2.sha256);
  assert.match(e1.sha256, /^[0-9a-f]{64}$/);
});

test('unknown format is reported honestly (UNKNOWN, LOW confidence)', () => {
  const dir = makeFixtureDir(test, { 'mystery.dat': 'garbage bytes here 123' });
  const entry = inventoryFile(path.join(dir, 'mystery.dat'), 'mystery.dat', 'mystery.dat');
  assert.strictEqual(entry.sourceType, 'UNKNOWN');
  assert.strictEqual(entry.jurisdiction, 'UNKNOWN');
  assert.strictEqual(entry.parseConfidence, 'LOW');
});

test('missing metadata still yields a manifest entry with UNKNOWN fields', () => {
  const dir = makeFixtureDir(test, { 'bare.txt': 'only text, no CÍM/FORRÁS header at all' });
  const entry = inventoryFile(path.join(dir, 'bare.txt'), 'bare.txt', 'bare.txt');
  assert.strictEqual(entry.headerTitle, null);
  assert.strictEqual(entry.sourceUrl, null);
  assert.ok(entry.sha256);
  assert.strictEqual(entry.kind, 'SOURCE');
});

test('UTF-8 Hungarian text is decoded and title extracted (footnote marker stripped)', () => {
  const dir = makeFixtureDir(test, { 't.txt': HU_ACT_FIXTURE });
  const entry = inventoryFile(path.join(dir, 't.txt'), 't.txt', 't.txt');
  assert.strictEqual(entry.encoding, 'utf-8');
  assert.match(entry.title, /a környezet védelmének általános szabályairól/);
  assert.ok(!/1$/.test(entry.title), 'footnote digit should be stripped');
  assert.deepStrictEqual(entry.effectivePeriod, {
    raw: '2026. 08. 12. – 2026. 09. 26.',
    effectiveFrom: '2026-08-12',
    validTo: '2026-09-26',
  });
});

test('huEffectivePeriod handles open-ended validity', () => {
  const p = huEffectivePeriod('valami\nHatályos: 2026. 03. 01. –\nvege');
  assert.deepStrictEqual(p, { raw: '2026. 03. 01. –', effectiveFrom: '2026-03-01', validTo: null });
});

test('CELEX extraction from OJ uri (AI Act) and cellar URL fallback', () => {
  assert.strictEqual(
    extractCelexFromUrl('https://eur-lex.europa.eu/legal-content/HU/TXT/HTML/?uri=OJ:L_202401689', 'L_202401689HU.000101.fmx.xml.txt'),
    '32024R1689'
  );
  // Publications cellar URL has no CELEX: the filename carries it.
  assert.strictEqual(
    extractCelexFromUrl('https://publications.europa.eu/resource/cellar/e5781283-7bbe-11f1-bf5e-01aa75ed71a1.0015.03/DOC_1', 'Egységes szerkezetbe foglalt SZÖVEG_ 32008R1272 — HU — 01.07.2026.txt'),
    '32008R1272'
  );
});

test('celexInfo maps kind letters to regulation/directive', () => {
  assert.strictEqual(celexInfo('32016R0679').documentType, 'EU_REGULATION');
  assert.strictEqual(celexInfo('32022L2555').documentType, 'EU_DIRECTIVE');
  assert.strictEqual(celexInfo('02006R1907').base, '32006R1907'); // consolidated normalisation
});

test('canonical keys group duplicate re-downloads of the same source', () => {
  const dir = makeFixtureDir(test, {
    'reach.txt': EU_REG_FIXTURE,
    'reach (1).txt': EU_REG_FIXTURE.replace('01.06.2026', '01.06.2026'), // same CELEX+version
  });
  const e1 = inventoryFile(path.join(dir, 'reach.txt'), 'reach.txt', 'reach.txt');
  const e2 = inventoryFile(path.join(dir, 'reach (1).txt'), 'reach (1).txt', 'reach (1).txt');
  assert.strictEqual(canonicalKey(e1), canonicalKey(e2));
  assert.match(canonicalKey(e1), /^EU:EU_REGULATION:CELEX:32016R0679$/);
});

test('different checksum for same canonical key is flagged as near-duplicate version', () => {
  const base = `CÍM: Egységes szerkezetbe foglalt SZÖVEG: 32021R0821 — HU — 15.11.2025
FORRÁS: https://eur-lex.europa.eu/legal-content/HU/TXT/HTML/?uri=CELEX:02021R0821-20251115
LETÖLTÉS: 2026-08-19T10:47:45.136Z

AZ EURÓPAI PARLAMENT ÉS A TANÁCS (EU) 2021/821 RENDELETE
(2021. május 20.)
a kettős felhasználású termékek kiviteléről szóló (EU) 2021/821 rendelet
1. cikk`;
  const a = base;
  const b = base + '\nTODO: extra line makes this file a different version';
  const dir = makeFixtureDir(test, { 'v1.txt': a, 'v2.txt': b });
  const e1 = inventoryFile(path.join(dir, 'v1.txt'), 'v1.txt', 'v1.txt');
  const e2 = inventoryFile(path.join(dir, 'v2.txt'), 'v2.txt', 'v2.txt');
  const manifest = buildManifest(dir, [e1, e2], '2026-08-20T00:00:00.000Z');
  assert.strictEqual(manifest.counts.uniqueLegalSources, 1);
  assert.strictEqual(manifest.counts.nearDuplicateGroups, 1);
  assert.strictEqual(manifest.versions.length, 2);
  assert.notStrictEqual(manifest.versions[0].sha256, manifest.versions[1].sha256);
});

test('source corpus remains unchanged when the tool runs', () => {
  const dir = makeFixtureDir(test, { 'act.txt': HU_ACT_FIXTURE, 'eu.txt': EU_REG_FIXTURE });
  const before = fs.readdirSync(dir).sort().map((f) => ({
    name: f,
    content: fs.readFileSync(path.join(dir, f), 'utf8'),
    mtime: fs.statSync(path.join(dir, f)).mtimeMs,
  }));
  const out = path.join(dir, 'manifest.json');
  execFileSync(process.execPath, [
    path.join(__dirname, 'inventory-source.js'),
    '--corpus',
    dir,
    '--out',
    out,
    '--generated-at',
    '2026-08-20T00:00:00.000Z',
  ]);
  const after = fs.readdirSync(dir)
    .filter((f) => f !== 'manifest.json')
    .sort()
    .map((f) => ({
      name: f,
      content: fs.readFileSync(path.join(dir, f), 'utf8'),
      mtime: fs.statSync(path.join(dir, f)).mtimeMs,
    }));
  assert.deepStrictEqual(after, before);
  assert.ok(fs.existsSync(out));
});

test('stable manifest output (deterministic with fixed --generated-at)', () => {
  const dir = makeFixtureDir(test, { 'act.txt': HU_ACT_FIXTURE, 'eu.txt': EU_REG_FIXTURE });
  const o1 = path.join(dir, 'm1.json');
  const o2 = path.join(dir, 'm2.json');
  execFileSync(process.execPath, [
    path.join(__dirname, 'inventory-source.js'),
    '--corpus',
    dir,
    '--out',
    o1,
    '--generated-at',
    '2026-08-20T00:00:00.000Z',
  ]);
  execFileSync(process.execPath, [
    path.join(__dirname, 'inventory-source.js'),
    '--corpus',
    dir,
    '--out',
    o2,
    '--generated-at',
    '2026-08-20T00:00:00.000Z',
  ]);
  assert.strictEqual(fs.readFileSync(o1, 'utf8'), fs.readFileSync(o2, 'utf8'));
});

test('note/artifact files are separated from sources', () => {
  const dir = makeFixtureDir(test, {
    'jogszabaly.txt': 'CÍM: jogszabaly\nFORRÁS: https://x/\nLETÖLTÉS: t\n',
    'pack.zip': 'PK\x03\x04junk',
    'act.txt': HU_ACT_FIXTURE,
  });
  const e1 = inventoryFile(path.join(dir, 'jogszabaly.txt'), 'jogszabaly.txt', 'jogszabaly.txt');
  const e2 = inventoryFile(path.join(dir, 'pack.zip'), 'pack.zip', 'pack.zip');
  const e3 = inventoryFile(path.join(dir, 'act.txt'), 'act.txt', 'act.txt');
  assert.strictEqual(e1.kind, 'NOTE');
  assert.strictEqual(e2.kind, 'ARTIFACT');
  const m = buildManifest(dir, [e1, e2, e3], '2026-08-20T00:00:00.000Z');
  assert.strictEqual(m.counts.sourceVersions, 1);
  assert.strictEqual(m.counts.noteFiles, 1);
  assert.strictEqual(m.counts.archiveFiles, 1);
});

test('new unknown TXT files are handled gracefully (no crash, LOW confidence)', () => {
  const dir = makeFixtureDir(test, { 'future_format_v9.txt': 'some future export format\nwithout known patterns\n' });
  const entry = inventoryFile(path.join(dir, 'future_format_v9.txt'), 'future_format_v9.txt', 'future_format_v9.txt');
  assert.strictEqual(entry.kind, 'SOURCE');
  assert.strictEqual(entry.sourceType, 'UNKNOWN');
  assert.strictEqual(entry.parseConfidence, 'LOW');
});

test('huTitleBlock and euTitleBlock return null on empty/unstructured input', () => {
  assert.strictEqual(huTitleBlock([], 'HU_ACT'), null);
  assert.strictEqual(euTitleBlock([]), null);
});