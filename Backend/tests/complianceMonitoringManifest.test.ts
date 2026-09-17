/**
 * C4B — compliance monitoring manifest projection (no database).
 *
 * The manifest answers exactly one question: WHICH legal source must an external
 * watcher monitor, and which locator(s) matter. These tests pin the projection,
 * precedence, deduplication, determinism, unresolved accounting and the hard
 * privacy boundary (no customer/document identity anywhere in the DTO).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MONITORING_MANIFEST_SCHEMA_VERSION,
  extractMonitoringIdentifier,
  projectMonitoringManifest,
  type MonitoringAnchorRow,
} from '../src/modules/compliance-doc-intelligence/monitoringManifest';

function row(overrides: Partial<MonitoringAnchorRow> = {}): MonitoringAnchorRow {
  return {
    anchorType: 'LEGAL',
    anchorKey: null,
    eli: null,
    celex: null,
    locator: null,
    ...overrides,
  };
}

const GENERATED_AT = '2026-09-17T00:00:00.000Z';

function project(rows: MonitoringAnchorRow[]) {
  return projectMonitoringManifest(rows, GENERATED_AT);
}

describe('C4B monitoring manifest projection', () => {
  it('A. collapses two references of one TV source into one source with two locators', () => {
    const manifest = project([
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/8/3' }),
    ]);

    expect(manifest.sources).toEqual([
      { identifierFamily: 'TV', sourceIdentifier: 'TV/2001/108', locators: ['5/2/b', '8/3'], referenceCount: 2 },
    ]);
    expect(manifest.unresolvedSummary).toEqual({ count: 0, reasons: {} });
  });

  it('B. counts repeated identical references while collapsing the locator', () => {
    const manifest = project([
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
    ]);

    expect(manifest.sources).toHaveLength(1);
    expect(manifest.sources[0].locators).toEqual(['5/2/b']);
    expect(manifest.sources[0].referenceCount).toBe(2);
  });

  it('C. keeps a source-only reference without inventing a locator', () => {
    const manifest = project([row({ anchorKey: 'LEGAL|REF=TV/2001/108' })]);

    expect(manifest.sources).toEqual([
      { identifierFamily: 'TV', sourceIdentifier: 'TV/2001/108', locators: [], referenceCount: 1 },
    ]);
  });

  it('D. accepts the exact legacy NJT ELI and preserves its locator verbatim', () => {
    const manifest = project([
      row({ eli: 'https://njt.jog.gov.hu/eli/TV/2015/57', locator: 'sec=15/B;par=4' }),
    ]);

    expect(manifest.sources).toEqual([
      { identifierFamily: 'TV', sourceIdentifier: 'TV/2015/57', locators: ['sec=15/B;par=4'], referenceCount: 1 },
    ]);
    // The legacy locator syntax is never translated.
    expect('15-B/4').not.toBe(manifest.sources[0].locators[0]);
  });

  it('E. emits CELEX through the existing strict C3A normalizer', () => {
    const manifest = project([row({ celex: '32016R0679', locator: 'art=28;par=3' })]);

    expect(manifest.sources).toEqual([
      { identifierFamily: 'CELEX', sourceIdentifier: '32016R0679', locators: ['art=28;par=3'], referenceCount: 1 },
    ]);
  });

  it('F. accounts for an invalid CELEX instead of inventing a source', () => {
    const manifest = project([row({ celex: 'not-a-celex' })]);

    expect(manifest.sources).toEqual([]);
    expect(manifest.unresolvedSummary).toEqual({ count: 1, reasons: { INVALID_CELEX: 1 } });
  });

  it('G. accounts for an unsupported ELI form', () => {
    const manifest = project([row({ eli: 'https://example.com/eli/TV/2015/57' })]);

    expect(manifest.sources).toEqual([]);
    expect(manifest.unresolvedSummary).toEqual({ count: 1, reasons: { UNSUPPORTED_ELI: 1 } });
  });

  it('deduplicates one TV source referenced through C4A and exact NJT ELI', () => {
    const manifest = project([
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      row({ eli: 'https://njt.jog.gov.hu/eli/TV/2001/108', locator: 'sec=5;par=2;point=b' }),
    ]);

    expect(manifest.sources).toHaveLength(1);
    expect(manifest.sources[0].sourceIdentifier).toBe('TV/2001/108');
    // Differing locator syntaxes stay distinct — no fabricated equivalence.
    expect(manifest.sources[0].locators).toEqual(['5/2/b', 'sec=5;par=2;point=b']);
    expect(manifest.sources[0].referenceCount).toBe(2);
  });

  it('applies the deterministic precedence C4A → ELI → CELEX', () => {
    const extraction = extractMonitoringIdentifier(
      row({
        anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b',
        eli: 'https://njt.jog.gov.hu/eli/TV/2015/57',
        celex: '32016R0679',
        locator: 'sec=1',
      }),
    );
    expect(extraction).toEqual({
      resolved: true,
      family: 'TV',
      sourceIdentifier: 'TV/2001/108',
      locator: '5/2/b',
    });
  });

  it('classifies malformed canonical references and non-LEGAL families', () => {
    expect(extractMonitoringIdentifier(row({ anchorKey: 'LEGAL|REF=TV/foo/bar' }))).toEqual({
      resolved: false,
      reason: 'MALFORMED_CANONICAL_REFERENCE',
    });
    expect(extractMonitoringIdentifier(row({ anchorType: 'CASE', anchorKey: 'CASE|ECLI=EU:C:2023:949' }))).toEqual({
      resolved: false,
      reason: 'UNSUPPORTED_IDENTIFIER_FAMILY',
    });
    expect(extractMonitoringIdentifier(row({ anchorKey: 'LEGAL|SID=la_x' }))).toEqual({
      resolved: false,
      reason: 'NO_MACHINE_IDENTIFIER',
    });
  });

  it('sorts sources deterministically and aggregates unresolved reasons', () => {
    const manifest = project([
      row({ celex: '32022L2555' }),
      row({ anchorKey: 'LEGAL|REF=TV/2015/57' }),
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      row({ celex: 'bad' }),
      row({ eli: 'https://njt.jog.gov.hu/eli/TV/2015/57', locator: 'sec=1' }),
      row({ anchorKey: '' }),
    ]);

    expect(manifest.schemaVersion).toBe(MONITORING_MANIFEST_SCHEMA_VERSION);
    expect(manifest.generatedAt).toBe(GENERATED_AT);
    expect(manifest.sources.map((source) => `${source.identifierFamily}:${source.sourceIdentifier}`)).toEqual([
      'CELEX:32022L2555',
      'TV:TV/2001/108',
      'TV:TV/2015/57',
    ]);
    expect(manifest.unresolvedSummary).toEqual({
      count: 2,
      reasons: { INVALID_CELEX: 1, NO_MACHINE_IDENTIFIER: 1 },
    });
  });

  it('is order-independent for identical input', () => {
    const rows = [
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      row({ celex: '32016R0679', locator: 'art=28;par=3' }),
      row({ eli: 'https://njt.jog.gov.hu/eli/TV/2015/57', locator: 'sec=1' }),
    ];
    expect(project(rows)).toEqual(project([...rows].reverse()));
  });

  it('J. exposes no customer, document or clause identity', () => {
    const manifest = project([
      row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      row({ celex: 'bad' }),
    ]);
    const serialized = JSON.stringify(manifest);

    for (const token of [
      'client',
      'Client',
      'matter',
      'case',
      'documentId',
      'documentVersionId',
      'clauseRef',
      'clauseTitle',
      'rationale',
      'finding',
      'requirement',
      'internalNote',
      'anchorKey',
      'anchorDisplay',
      'rowDigest',
      'ingestWarnings',
    ]) {
      expect(serialized).not.toContain(token);
    }
    // The projection is exactly the documented allow-list.
    expect(Object.keys(manifest.sources[0]).sort()).toEqual(
      ['identifierFamily', 'locators', 'referenceCount', 'sourceIdentifier'].sort(),
    );
    expect(Object.keys(manifest.unresolvedSummary).sort()).toEqual(['count', 'reasons']);
  });
});

describe('C4B route boundary', () => {
  it('exposes the manifest through the internal-only route with requireInternal', () => {
    const routesSource = readFileSync(
      join(__dirname, '..', 'src', 'modules', 'compliance-doc-intelligence', 'routes.ts'),
      'utf8',
    );
    const routeIndex = routesSource.indexOf("'/monitoring-manifest'");
    expect(routeIndex).toBeGreaterThan(-1);
    const handler = routesSource.slice(routeIndex, routeIndex + 320);
    expect(handler).toContain('requireInternal');
    expect(handler).toContain('buildComplianceMonitoringManifest');
    // No client scoping is faked for the cross-client aggregate.
    expect(handler).not.toContain('assertClientReadAccess');
  });
});
