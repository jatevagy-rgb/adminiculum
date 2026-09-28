/**
 * T01-T04, T25 inputs, privacy guard + C3A CELEX normalization.
 */
import {
  CELEX_TOKEN,
  extractCelexDemand,
  loadManifestFile,
  ManifestError,
  validateManifest,
} from '../src/manifest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function manifest(raw: unknown): ReturnType<typeof validateManifest> {
  return validateManifest(raw);
}

describe('manifest snapshot contract', () => {
  test('T01 empty manifest yields zero demand', () => {
    const m = manifest({ schemaVersion: 1, sources: [] });
    const demand = extractCelexDemand(m);
    expect(demand.distinctCelex).toEqual([]);
    expect(demand.counts).toEqual({
      manifestSourceCount: 0,
      celexReferenceCount: 0,
      distinctCelexCount: 0,
      nonCelexSkipped: 0,
      invalidCelexCount: 0,
      droppedIdentityFields: [],
    });
  });

  test('T02 manifest without CELEX (TV only) skips everything', () => {
    const m = manifest({
      schemaVersion: 1,
      sources: [
        { identifierFamily: 'TV', sourceIdentifier: 'TV/2001/108', locators: [], referenceCount: 3 },
        { identifierFamily: 'TV', sourceIdentifier: 'TV/2013/5', locators: [], referenceCount: 1 },
      ],
    });
    const demand = extractCelexDemand(m);
    expect(demand.distinctCelex).toEqual([]);
    expect(demand.counts.nonCelexSkipped).toBe(2);
    expect(demand.counts.celexReferenceCount).toBe(0);
  });

  test('T03 duplicate CELEX references collapse to one source', () => {
    const m = manifest({
      schemaVersion: 1,
      sources: [
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 2 },
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
      ],
    });
    const demand = extractCelexDemand(m);
    expect(demand.distinctCelex).toEqual(['32016R0679']);
    expect(demand.counts.distinctCelexCount).toBe(1);
    expect(demand.counts.celexReferenceCount).toBe(3);
  });

  test('T04 malformed CELEX identifiers are rejected/skipped safely', () => {
    const m = manifest({
      schemaVersion: 1,
      sources: [
        { identifierFamily: 'CELEX', sourceIdentifier: 'ABCDEFG', locators: [], referenceCount: 1 },
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R067', locators: [], referenceCount: 1 },
        { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
      ],
    });
    const demand = extractCelexDemand(m);
    expect(demand.distinctCelex).toEqual(['32016R0679']);
    expect(demand.counts.invalidCelexCount).toBe(2);
  });

  test('CELEX identifiers are normalized to canonical uppercase', () => {
    const m = manifest({
      schemaVersion: 1,
      sources: [
        { identifierFamily: 'CELEX', sourceIdentifier: ' 32016r0679 ', locators: [], referenceCount: 1 },
      ],
    });
    expect(extractCelexDemand(m).distinctCelex).toEqual(['32016R0679']);
  });

  test('unsupported schemaVersion fails closed', () => {
    expect(() => manifest({ schemaVersion: 2, sources: [] })).toThrow(ManifestError);
    expect(() => manifest({ schemaVersion: 1 })).toThrow(ManifestError);
    expect(() => manifest(null)).toThrow(ManifestError);
  });

  test('privacy guard drops unexpected identity-like fields and reports their names', () => {
    const m = manifest({
      schemaVersion: 1,
      generatedAt: '2026-09-27T00:00:00Z',
      clientId: 'customer-1',
      sources: [
        {
          identifierFamily: 'CELEX',
          sourceIdentifier: '32016R0679',
          locators: [],
          referenceCount: 1,
          documentId: 'doc-1',
          caseId: 'case-1',
        },
      ],
    });
    const dropped: string[] = [];
    const demand = extractCelexDemand(m, (p) => dropped.push(p));
    expect(demand.counts.droppedIdentityFields.sort()).toEqual(['caseId', 'clientId', 'documentId']);
    expect(dropped).toEqual(
      expect.arrayContaining(['manifest.clientId', 'manifest.sources[0].documentId']),
    );
    expect(demand.distinctCelex).toEqual(['32016R0679']);
  });

  test('C3A CELEX token shape matches the backend contract', () => {
    expect(CELEX_TOKEN.test('32016R0679')).toBe(true);
    expect(CELEX_TOKEN.test('32022L2555')).toBe(true);
    expect(CELEX_TOKEN.test('31995L0046')).toBe(true);
    expect(CELEX_TOKEN.test('02016R0679-20160504')).toBe(false);
    expect(CELEX_TOKEN.test('TV/2001/108')).toBe(false);
  });

  test('loadManifestFile reads and validates a snapshot file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-manifest-'));
    try {
      const file = path.join(dir, 'manifest.json');
      fs.writeFileSync(
        file,
        JSON.stringify({
          schemaVersion: 1,
          sources: [
            { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: [], referenceCount: 1 },
          ],
        }),
        'utf8',
      );
      const m = loadManifestFile(file);
      expect(m.sources).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
