import { buildInternalHistory, projectCustomerHistory, type ApprovedHistorySource } from '../src/modules/case-history/projection';

describe('WF05 case history projection', () => {
  const time = { id: 't1', workDate: '2026-01-02T10:00:00.000Z', createdAt: '2026-01-02T11:00:00.000Z', workType: 'OTHER', description: 'Belső munka', minutes: 75 };

  it('deduplicates a time audit reference and sums actual time entries once', () => {
    const page = buildInternalHistory([
      { id: 'a1', eventType: 'CASE_CREATED', createdAt: '2026-01-01T10:00:00.000Z' },
      { id: 'a2', eventType: 'TIME_LOGGED', timeEntryId: 't1', createdAt: '2026-01-02T11:00:00.000Z' },
    ], [time, time], { limit: 1 });
    expect(page.items.map((item) => item.sourceKey)).toEqual(['timeline:a1']);
    expect(page.totalMinutes).toBe(75);
    expect(page.nextCursor).toBe('timeline:a1');
    const second = buildInternalHistory([
      { id: 'a1', eventType: 'CASE_CREATED', createdAt: '2026-01-01T10:00:00.000Z' },
      { id: 'a2', eventType: 'TIME_LOGGED', timeEntryId: 't1', createdAt: '2026-01-02T11:00:00.000Z' },
    ], [time], { cursor: page.nextCursor, limit: 1 });
    expect(second.items.map((item) => item.sourceKey)).toEqual(['time:t1']);
  });

  it('requires matching case, client, grant and saved policy; hidden and unpublished stay absent', () => {
    const sources: ApprovedHistorySource[] = [
      { sourceKey: 'safe:s1', caseId: 'case1', clientId: 'client1', category: 'SAFE_UPDATE', minimumLevel: 2, published: true, occurredAt: '2026-01-01T00:00:00Z', title: 'Jóváhagyott', body: 'Eredeti', minutes: null },
      { sourceKey: 'safe:s2', caseId: 'case1', clientId: 'client1', category: 'SAFE_UPDATE', minimumLevel: 1, published: false, occurredAt: '2026-01-02T00:00:00Z', title: 'Tervezet', body: 'Titok', minutes: null },
      { sourceKey: 'safe:s3', caseId: 'case2', clientId: 'client2', category: 'SAFE_UPDATE', minimumLevel: 1, published: true, occurredAt: '2026-01-03T00:00:00Z', title: 'Másik ügy', body: 'Másik', minutes: null },
      { sourceKey: 'audit:a1', caseId: 'case1', clientId: 'client1', category: 'UNKNOWN' as ApprovedHistorySource['category'], minimumLevel: 1, published: true, occurredAt: '2026-01-04T00:00:00Z', title: 'Belső', body: 'Titok', minutes: null },
    ];
    const policy = { caseId: 'case1', clientId: 'client1', level: 3 as const, excludedSourceKeys: ['safe:s1'], customerText: { 'safe:s1': 'Szerkesztett' } };
    const input = { caseId: 'case1', clientId: 'client1', grantAuthorized: true, policy, sources };
    expect(projectCustomerHistory({ ...input, policy: null })).toEqual([]);
    expect(projectCustomerHistory({ ...input, grantAuthorized: false })).toEqual([]);
    expect(projectCustomerHistory({ ...input, clientId: 'client2' })).toEqual([]);
    expect(projectCustomerHistory(input)).toEqual([]);
    expect(sources[0].body).toBe('Eredeti');
    expect(projectCustomerHistory({ ...input, policy: { ...policy, excludedSourceKeys: [] } })[0].body).toBe('Szerkesztett');
  });

  it('never reveals an excluded item after changing levels', () => {
    const source: ApprovedHistorySource = { sourceKey: 'safe:s1', caseId: 'c', clientId: 'x', category: 'SAFE_UPDATE', minimumLevel: 2, published: true, occurredAt: '2026-01-01T00:00:00Z', title: 'Safe', body: 'Approved', minutes: null };
    for (const level of [1, 2, 3] as const) {
      expect(projectCustomerHistory({ caseId: 'c', clientId: 'x', grantAuthorized: true, policy: { caseId: 'c', clientId: 'x', level, excludedSourceKeys: ['safe:s1'], customerText: {} }, sources: [source] })).toEqual([]);
    }
  });

  it('enforces category minimums even when a source supplies a lower level', () => {
    const source: ApprovedHistorySource = { sourceKey: 'work:w1', caseId: 'c', clientId: 'x', category: 'REVIEWED_WORK', minimumLevel: 1, published: true, occurredAt: '2026-01-01T00:00:00Z', title: 'Reviewed work', body: 'Approved summary', minutes: 20 };
    const base = { caseId: 'c', clientId: 'x', grantAuthorized: true, sources: [source] };
    expect(projectCustomerHistory({ ...base, policy: { caseId: 'c', clientId: 'x', level: 2, excludedSourceKeys: [], customerText: {} } })).toEqual([]);
    expect(projectCustomerHistory({ ...base, policy: { caseId: 'c', clientId: 'x', level: 3, excludedSourceKeys: [], customerText: {} } })[0].minutes).toBe(20);
  });
});
