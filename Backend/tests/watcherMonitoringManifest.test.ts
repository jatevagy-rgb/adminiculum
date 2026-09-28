/**
 * W4A — machine watcher monitoring-manifest endpoint (static + builder proof).
 *
 * Proves the ADDITIVE machine exposure of the existing C4B manifest:
 *  - GET /watcher-monitoring-manifest exists on the W2 machine router, guarded
 *    by watcherMachineAuth ONLY (no human auth middleware anywhere near it);
 *  - it REUSES buildComplianceMonitoringManifest — no duplicated Prisma query;
 *  - the response is the raw manifest DTO, never wrapped;
 *  - the existing POST ingestion route and the human monitoring-manifest
 *    endpoint are untouched;
 *  - no identity field, no write and no Prisma/schema change is introduced.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  projectMonitoringManifest,
  type MonitoringAnchorRow,
} from '../src/modules/compliance-doc-intelligence/monitoringManifest';

const ROUTE_PATH = join(__dirname, '..', 'src', 'modules', 'compliance', 'legalSourceObservationRoutes.ts');
const MANIFEST_PATH = join(__dirname, '..', 'src', 'modules', 'compliance-doc-intelligence', 'monitoringManifest.ts');
const HUMAN_ROUTES_PATH = join(__dirname, '..', 'src', 'modules', 'compliance-doc-intelligence', 'routes.ts');

const routeSource = readFileSync(ROUTE_PATH, 'utf8');
const manifestSource = readFileSync(MANIFEST_PATH, 'utf8');
const humanRoutesSource = readFileSync(HUMAN_ROUTES_PATH, 'utf8');

const PRIVACY_BLACKLIST = [
  'clientId',
  'clientName',
  'caseId',
  'documentId',
  'documentVersionId',
  'requirementId',
  'clauseRef',
  'clauseTitle',
  'userId',
  'rationale',
  'finding',
  'task',
];

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

describe('W4A machine manifest route — static boundary', () => {
  it('1. defines GET /watcher-monitoring-manifest on the W2 machine router', () => {
    expect(routeSource).toContain("router.get('/watcher-monitoring-manifest'");
    expect(routeSource.split('router.get(').length - 1).toBe(1);
  });

  it('2. guards the machine manifest route with watcherMachineAuth', () => {
    expect(routeSource).toContain("router.get('/watcher-monitoring-manifest', watcherMachineAuth");
  });

  it('3. calls the existing buildComplianceMonitoringManifest and returns it as 200', () => {
    expect(routeSource).toContain("import { buildComplianceMonitoringManifest } from '../compliance-doc-intelligence/monitoringManifest';");
    expect(routeSource).toContain('await buildComplianceMonitoringManifest()');
    expect(routeSource).toContain('res.status(200).json(manifest)');
    // No duplicated Prisma query: the builder stays the only manifest reader.
    expect(routeSource).not.toContain('findMany');
    expect(routeSource).not.toContain('prisma');
  });

  it('4. returns the manifest unwrapped (no envelope object)', () => {
    expect(routeSource).toContain('.json(manifest)');
    expect(routeSource).not.toContain('json({ manifest');
    expect(routeSource).not.toContain('data: manifest');
  });

  it('5. adds no human auth middleware to the machine route file', () => {
    expect(routeSource).not.toContain("middleware/auth'");
    expect(routeSource).not.toContain('requireInternal(');
    expect(routeSource).not.toContain('authenticate(');
    expect(routeSource).not.toContain('clientPortal');
  });

  it('6. leaves the existing W2 POST ingestion route unchanged', () => {
    expect(routeSource).toContain("router.post('/legal-source-observations', watcherMachineAuth");
    expect(routeSource).toContain('ingestLegalSourceObservations(req.body)');
    expect(routeSource.split('router.post(').length - 1).toBe(1);
  });

  it('7. leaves the human monitoring-manifest endpoint untouched', () => {
    // The machine router must not swallow the human path name.
    expect(routeSource).not.toContain("'/monitoring-manifest'");
    // The human CDI route keeps its exact internal-only shape.
    const routeIndex = humanRoutesSource.indexOf("'/monitoring-manifest'");
    expect(routeIndex).toBeGreaterThan(-1);
    const handler = humanRoutesSource.slice(routeIndex, routeIndex + 320);
    expect(handler).toContain('requireInternal');
    expect(handler).toContain('buildComplianceMonitoringManifest');
  });

  it('9. introduces zero writes on the machine route or the reused builder', () => {
    for (const file of [routeSource, manifestSource]) {
      for (const token of ['.create(', '.update(', '.delete(', '.upsert(', '$transaction']) {
        expect(file).not.toContain(token);
      }
    }
  });

  it('10. introduces no Prisma/schema change on the machine route', () => {
    expect(routeSource).not.toContain('prisma.service');
    expect(routeSource).not.toContain('schema.prisma');
    expect(routeSource).not.toContain('migrations');
  });
});

describe('W4A machine manifest payload — privacy boundary', () => {
  it('8. serializes without any identity/privacy field from the blacklist', () => {
    const manifest = projectMonitoringManifest(
      [
        row({ anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
        row({ celex: '32016R0679', locator: 'art=28;par=3' }),
        row({ celex: 'bad' }),
      ],
      '2026-09-28T00:00:00.000Z',
    );
    const serialized = JSON.stringify(manifest);
    for (const token of PRIVACY_BLACKLIST) {
      expect(serialized).not.toContain(token);
    }
    expect(Object.keys(manifest).sort()).toEqual(['generatedAt', 'schemaVersion', 'sources', 'unresolvedSummary'].sort());
    expect(Object.keys(manifest.sources[0]).sort()).toEqual(
      ['identifierFamily', 'locators', 'referenceCount', 'sourceIdentifier'].sort(),
    );
  });

  it('projects the builder select to the five non-identity anchor fields only', () => {
    const selectStart = manifestSource.indexOf('select: {');
    expect(selectStart).toBeGreaterThan(-1);
    const selectEnd = manifestSource.indexOf('\n    },', selectStart);
    const selectBlock = manifestSource.slice(selectStart, selectEnd);
    for (const field of ['anchorType', 'anchorKey', 'eli', 'celex', 'locator']) {
      expect(selectBlock).toContain(field);
    }
    for (const forbidden of ['documentId', 'documentVersionId', 'clientId', 'caseId', 'clauseRef', 'clauseTitle']) {
      expect(selectBlock).not.toContain(forbidden);
    }
  });
});
