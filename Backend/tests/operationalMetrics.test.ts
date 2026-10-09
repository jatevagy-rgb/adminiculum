import { calculateOperationalMetric, calculateRecordedEffort, metricPeriod, periodBounds, type SubmissionMetricRow } from '../src/modules/company-workspace/operationalMetrics';

const now = new Date('2026-10-09T12:00:00Z');
const period = metricPeriod('2026-10-01', '2026-10-09', now);
const submission = (id: string, extra: Partial<SubmissionMetricRow> = {}): SubmissionMetricRow => ({ id, task: { caseId: 'case-a' }, status: 'SUBMITTED', submittedAt: new Date('2026-10-09T10:00:00Z'), returnedAt: null, approvedAt: null, ...extra });

describe('operational metric definitions', () => {
  it('missing approval/return timestamps are missing samples, never unsuccessful zeros', () => {
    const rows = [submission('approved', { status: 'APPROVED' }), submission('returned', { status: 'RETURNED' })];
    const result = calculateOperationalMetric('SUBMISSION_COMPLETION', 'client', period, [], rows, now);
    expect(result.value).toBeNull(); expect(result.sampleCount).toBe(0); expect(result.missingCount).toBe(2);
    expect(calculateOperationalMetric('REVIEW_QUEUE_AGE', 'client', period, [], [submission('decided', { approvedAt: now })], now).value).toBeNull();
  });
  it('recorded own effort distinguishes absent, zero and negative entries', () => {
    expect(calculateRecordedEffort('c', period, [], now).value).toBeNull();
    const row = { id: 'a', caseId: 'case-a', minutes: 0 };
    const result = calculateRecordedEffort('c', period, [row, row, { id: 'b', caseId: 'case-a', minutes: -1 }], now);
    expect(result.value).toBe(0); expect(result.sampleCount).toBe(1); expect(result.missingCount).toBe(1); expect(result.scope.visibility).toBe('OWN_AUTHORIZED_TIME_ENTRIES');
  });
  it('counts a real zero elapsed duration, excludes bad timestamps and deduplicates source identity', () => {
    const exact = { id: 'a', receivedAt: now, completedAt: now };
    const result = calculateOperationalMetric('CASE_CYCLE', 'client', period, [exact, exact, { id: 'b', receivedAt: now, completedAt: new Date('2026-10-08') }], [], now);
    expect(result.value).toBe(0); expect(result.sampleCount).toBe(1); expect(result.missingCount).toBe(1);
    expect(result.sourceRefs).toEqual([{ type: 'Case', id: 'a', caseId: 'a' }]);
  });
  it('empty denominator is null rather than fabricated zero', () => {
    const result = calculateOperationalMetric('CASE_CYCLE', 'client', period, [], [], now);
    expect(result.value).toBeNull(); expect(result.denominator).toBeNull(); expect(result.basis).toBe('NO_RECORDED_SAMPLE');
  });
  it('distinguishes return ratio from completion ratio and excludes undecided from return denominator', () => {
    const rows = [submission('a', { returnedAt: now, status: 'RETURNED' }), submission('b', { approvedAt: now, status: 'APPROVED' }), submission('c')];
    const returned = calculateOperationalMetric('RETURN_FREQUENCY', 'client', period, [], rows, now);
    expect(returned.value).toBe(0.5); expect(returned.missingCount).toBe(1);
    expect(calculateOperationalMetric('SUBMISSION_COMPLETION', 'client', period, [], rows, now).value).toBeCloseTo(1 / 3);
  });
  it('queue age uses only current submitted state and never reports labour minutes', () => {
    const result = calculateOperationalMetric('REVIEW_QUEUE_AGE', 'client', period, [], [submission('a'), submission('b', { status: 'SUPERSEDED' })], now);
    expect(result.value).toBe(120); expect(result.unit).toBe('ELAPSED_MINUTES'); expect(result.sampleCount).toBe(1);
  });
  it('rejects contradictory decisions and future timestamps', () => {
    const result = calculateOperationalMetric('RETURN_FREQUENCY', 'client', period, [], [submission('a', { returnedAt: now, approvedAt: now }), submission('b', { returnedAt: new Date('2026-10-10') })], now);
    expect(result.value).toBeNull(); expect(result.missingCount).toBe(2);
  });
  it('validates civil dates/range and reuses Budapest DST boundaries', () => {
    for (const [from, to] of [['2026-02-30', '2026-03-01'], ['2026-10-10', '2026-10-09'], ['2024-01-01', '2026-01-01'], ['', '2026-01-01']]) expect(() => metricPeriod(from, to, now)).toThrow();
    const bounds = periodBounds(metricPeriod('2026-03-29', '2026-03-29', now));
    expect((bounds.lt.getTime() - bounds.gte.getTime()) / 3600000).toBe(23);
  });
});
