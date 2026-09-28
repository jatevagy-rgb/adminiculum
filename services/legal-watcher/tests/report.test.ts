/**
 * Report shape, determinism, sanitization and the ADMINICULUM_BACKEND_WRITES=0
 * proof (T24 output side).
 */
import { buildReport, renderHumanSummary } from '../src/report';
import { makeEvent } from './helpers';
import type { CelexRunResult, ManifestCounts } from '../src/types';

const COUNTS: ManifestCounts = {
  manifestSourceCount: 3,
  celexReferenceCount: 2,
  distinctCelexCount: 1,
  nonCelexSkipped: 1,
  invalidCelexCount: 0,
  droppedIdentityFields: [],
};

function result(sourceIdentifier: string, status: CelexRunResult['status'], events: ReturnType<typeof makeEvent>[]): CelexRunResult {
  return {
    sourceIdentifier,
    status,
    observedEvents: events,
    baselineEvents: status === 'FIRST_SEEN_BASELINE' ? events : [],
    newEvents: status === 'NEW_AMENDMENT' || status === 'NEW_CONSOLIDATED_VERSION' ? events : [],
    metadataChangedKeys: [],
    missingFromSourceKeys: [],
    error: null,
  };
}

describe('dry-run report', () => {
  test('report shape contains every required W1 field with correct counts', () => {
    const amendment = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
    const consolidation = makeEvent('32016R0679', 'CONSOLIDATED_VERSION_AVAILABLE', '02016R0679-20160504');
    const report = buildReport({
      manifestSchemaVersion: 1,
      manifestCounts: COUNTS,
      runId: 'r1',
      startedAt: '2026-09-27T12:00:00.000Z',
      completedAt: '2026-09-27T12:00:01.000Z',
      overallStatus: 'PARTIAL',
      celexResults: [
        result('32016R0679', 'NEW_AMENDMENT', [amendment]),
        result('32016R0679', 'FIRST_SEEN_BASELINE', [consolidation]),
        result('32022L2555', 'SOURCE_ERROR', []),
      ],
      observations: [amendment, consolidation],
      sanitizedErrors: [
        { sourceIdentifier: '32022L2555', phase: 'RESOLVE', code: 'TIMEOUT', message: 'timed out' },
      ],
    });
    expect(report.reportVersion).toBe(1);
    expect(report.dryRun).toBe(true);
    expect(report.adminiculumBackendWrites).toBe(0);
    expect(report.overallStatus).toBe('PARTIAL');
    expect(report.queriedCelexCount).toBe(3);
    expect(report.successfulCelexCount).toBe(2);
    expect(report.failedCelexCount).toBe(1);
    expect(report.sourceErrorCount).toBe(1);
    expect(report.newAmendmentCount).toBe(1);
    expect(report.newConsolidatedVersionCount).toBe(0);
    expect(report.firstSeenBaselineCount).toBe(1);
    expect(report.unchangedCount).toBe(0);
    expect(report.observations).toHaveLength(2);
    expect(report.sanitizedErrors).toHaveLength(1);
    expect(report.manifest).toEqual(COUNTS);
  });

  test('observations are deterministically ordered by eventKey', () => {
    const a = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
    const b = makeEvent('32016R0679', 'CONSOLIDATED_VERSION_AVAILABLE', '02016R0679-20160504');
    const make = () =>
      buildReport({
        manifestSchemaVersion: 1,
        manifestCounts: COUNTS,
        runId: 'r1',
        startedAt: 't',
        completedAt: 't',
        overallStatus: 'OK',
        celexResults: [result('32016R0679', 'FIRST_SEEN_BASELINE', [b, a])],
        observations: [b, a],
        sanitizedErrors: [],
      });
    const one = make();
    const two = make();
    expect(one.observations.map((o) => o.eventKey)).toEqual(two.observations.map((o) => o.eventKey));
    expect(one.observations.map((o) => o.eventKey)).toEqual([...one.observations.map((o) => o.eventKey)].sort());
  });

  test('report contains no credential/token material', () => {
    const report = buildReport({
      manifestSchemaVersion: 1,
      manifestCounts: COUNTS,
      runId: 'r1',
      startedAt: 't',
      completedAt: 't',
      overallStatus: 'OK',
      celexResults: [],
      observations: [],
      sanitizedErrors: [
        { sourceIdentifier: 'x', phase: 'HTTP', code: 'HTTP_STATUS', message: 'HTTP 401', statusCode: 401 },
      ],
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('Bearer');
  });

  test('human summary states ADMINICULUM_BACKEND_WRITES=0 explicitly', () => {
    const report = buildReport({
      manifestSchemaVersion: 1,
      manifestCounts: COUNTS,
      runId: 'r1',
      startedAt: 't',
      completedAt: 't',
      overallStatus: 'OK',
      celexResults: [result('32016R0679', 'FIRST_SEEN_BASELINE', [])],
      observations: [],
      sanitizedErrors: [],
    });
    const summary = renderHumanSummary(report);
    expect(summary).toContain('ADMINICULUM_BACKEND_WRITES=0');
    expect(summary).toContain('DRY RUN');
    expect(summary).toContain('32016R0679: FIRST_SEEN_BASELINE');
  });
});
