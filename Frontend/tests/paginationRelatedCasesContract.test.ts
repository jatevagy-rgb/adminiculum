import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, settle, textOf } from './helpers/asyncRaceHarness';

// CF-003 (regression) — bounded related-case pagination.
//
// The dossier must no longer truncate at an arbitrary 100 cases, but must also
// not enumerate unbounded; the document fan-out is bounded independently.

function makeDossier(total: number, perPage = 100) {
  const caseCalls: Array<{ page: number; limit: number; client: string }> = [];
  let documentCalls = 0;

  const h = createRaceHarness('src/app/clients/[clientId]/page.tsx', 'ClientDetailContent', {
    '@/components/clients/ClientHouseStylePanel': { ClientHouseStylePanel: 'div' },
    '@/components/billing/HourlyRateCard': { HourlyRateCard: 'div' },
    '@/components/clients/ClientColorSelector': { ClientColorSelector: 'div' },
    '@/components/clients/ClientCompanyFoundation': { ClientCompanyFoundation: 'div' },
    '@/components/clients/ClientContractLibrary': { ClientContractLibrary: 'div' },
    '@/components/clients/ClientOrganizationPreview': { ClientOrganizationPreview: 'div' },
    '@/components/clients/ClientWorkspaceTabs': { ClientWorkspaceTabs: 'div' },
    '@/components/clients/ClientLifecycleControls': { ClientLifecycleControls: 'div' },
    '@/components/cases/CompactNewCaseDialog': { CompactNewCaseDialog: 'div' },
    '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
    '@/components/adminiculum/OperationalPrimitives': { SafePanelError: 'div' },
    '@/lib/clientColors': { getClientColorDefinition: () => ({ key: null }) },
    '@/lib/api': {
      getClient: async () => ({ id: 'B', name: 'B Ügyfél', colorKey: null }),
      getClientCommunicationSummary: async () => ({ communications: [], client: { id: 'B', name: 'B Ügyfél' } }),
      getCases: async (page: number, limit: number, _lawyer: any, client: string) => {
        caseCalls.push({ page, limit, client });
        const start = (page - 1) * limit;
        const count = Math.max(0, Math.min(limit, total - start));
        const data = Array.from({ length: count }, (_, i) => ({
          id: `B-case-${start + i + 1}`,
          caseNumber: `B-${start + i + 1}`,
          title: `B ügy ${start + i + 1}`,
          status: 'DRAFT',
        }));
        return { data, pagination: { total, page, limit } };
      },
      getCaseDocuments: async () => {
        documentCalls += 1;
        return [];
      },
      updateClient: async () => ({}),
    },
    '@/lib/clientPortalAdminApi': { listAdminWorkspaces: async () => ({ items: [] }) },
    'next/navigation': { useParams: () => ({ clientId: 'B' }), useRouter: () => ({ push() {} }) },
    'next/link': { default: 'a' },
  });

  return { h, caseCalls, documentCalls: () => documentCalls };
}

test('CF-003 dossier: 150 related cases are fully paged (2 pages), not truncated at 100', async () => {
  const ctx = makeDossier(150);
  ctx.h.commit();
  await settle();
  const text = textOf(ctx.h.render()).replace(/\s+/g, ' ');

  assert.deepEqual(
    ctx.caseCalls.map((c) => [c.page, c.limit, c.client]),
    [[1, 100, 'B'], [2, 100, 'B']],
    'cases are paged until the backend total is reached',
  );
  assert.ok(text.includes('150 ügy'), 'all related cases are available');
  assert.ok(ctx.documentCalls() <= 50, 'document fan-out stays bounded');
});

test('CF-003 dossier: large dossiers stop at the bounded page cap with a partial warning', async () => {
  const ctx = makeDossier(5000);
  ctx.h.commit();
  await settle();
  const text = textOf(ctx.h.render()).replace(/\s+/g, ' ');

  assert.equal(ctx.caseCalls.length, 10, 'pagination stops at the bounded cap');
  assert.deepEqual(
    ctx.caseCalls.map((c) => c.page),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'no unbounded enumeration',
  );
  assert.ok(text.includes('1000 ügy'), 'the bounded window is shown');
  assert.ok(
    text.includes('A kapcsolt ügyek listája csak részlegesen töltődött be.'),
    'truncation is surfaced truthfully',
  );
  assert.ok(ctx.documentCalls() <= 50, 'document fan-out stays bounded');
});
