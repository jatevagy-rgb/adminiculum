import { projectActionableItems, isExecutableRequest, assertActionCenterDtoSafe, type PortalActionItem } from '../src/modules/client-workspace/orgActionCenterService';

const row = (id: string, executable: boolean, urgency: PortalActionItem['urgency'] = 'NORMAL'): PortalActionItem => ({
  id, sourceType: 'CLIENT_REQUEST', sourceId: id, domain: 'LEGAL', kind: 'ANSWER',
  title: 'Kért adat', contextLabel: null, dueAt: null, urgency, state: 'OPEN',
  actionLabel: 'Válasz megnyitása', href: '/portal/matters/m1/requests/r1',
  canCompleteInPortal: executable, matterPublicationId: 'm1',
});

describe('customer action truth', () => {
  it('a published notice with no matter journey cannot suppress an answerable compliance fact', () => {
    expect(isExecutableRequest({ status: 'PUBLISHED', matterPublicationId: null })).toBe(false);
    expect(isExecutableRequest({ status: 'PUBLISHED', matterPublicationId: 'matter-a' })).toBe(true);
    expect(isExecutableRequest({ status: 'UNDER_INTERNAL_REVIEW', matterPublicationId: 'matter-a' })).toBe(false);
    const fact = { ...row('fact', true), sourceType: 'COMPLIANCE_MISSING_FACT' as const, domain: 'COMPLIANCE' as const };
    expect(projectActionableItems([row('notice', false), fact]).items).toEqual([fact]);
  });
  it('uses the same executable set for identities and all totals', () => {
    const rows = [row('a', true, 'OVERDUE'), row('b', false, 'OVERDUE'), row('c', true, 'DUE_SOON'), row('d', false)];
    const result = projectActionableItems(rows);
    expect(result.items.map(item => item.id)).toEqual(['a', 'c']);
    expect(result.counts).toEqual({ open: 2, overdue: 1, dueSoon: 1 });
    expect(result.informationItems.map(item => item.id)).toEqual(['b', 'd']);
    expect(rows).toHaveLength(4);
    expect(() => assertActionCenterDtoSafe(result)).not.toThrow();
  });
  it('keeps published read-only notices reachable without manufacturing customer work', () => {
    const notice = { ...row('notice', false), sourceType: 'CLIENT_ACTION_REQUEST' as const };
    const result = projectActionableItems([notice]);
    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({ open: 0, overdue: 0, dueSoon: 0 });
    expect(result.informationItems[0]).toEqual(notice);
  });
  it('does not synthesize records when the authorized source has none', () => {
    expect(projectActionableItems([])).toEqual({ items: [], informationItems: [], counts: { open: 0, overdue: 0, dueSoon: 0 } });
  });
  it('applies the existing safe-data check to information notices too', () => {
    const result = projectActionableItems([{ ...row('hidden', false), title: 'internalOwner' }]);
    expect(() => assertActionCenterDtoSafe(result)).toThrow();
  });
});
