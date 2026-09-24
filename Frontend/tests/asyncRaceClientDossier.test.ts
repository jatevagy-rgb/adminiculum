import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, settle, textOf } from './helpers/asyncRaceHarness';

// CF-002 (regression) — /clients/[clientId] dossier route identity.
//
// A late client A response must be discarded once route B is active; B stays
// authoritative for client, cases, documents, communications, portal workspace,
// organization capability and loading/error state.

type Deferreds = ReturnType<typeof deferred<any>>;

function makeDossierHarness() {
  let currentId = 'A';
  const d: Record<string, Record<string, Deferreds>> = { A: {}, B: {} };
  const keys = ['client', 'comms', 'workspaces', 'cases', 'docs'] as const;
  for (const id of ['A', 'B']) for (const k of keys) d[id][k] = deferred<any>();

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
      getClient: (id: string) => d[id].client.promise,
      getClientCommunicationSummary: (id: string) => d[id].comms.promise,
      getCases: (_page: number, _limit: number, _lawyer: any, id: string) => d[id].cases.promise,
      getCaseDocuments: (caseId: string) => (caseId.startsWith('A') ? d.A.docs.promise : d.B.docs.promise),
      updateClient: async () => ({}),
    },
    '@/lib/clientPortalAdminApi': {
      listAdminWorkspaces: (id: string) => d[id].workspaces.promise,
    },
    'next/navigation': {
      useParams: () => ({ clientId: currentId }),
      useRouter: () => ({ push() {} }),
    },
    'next/link': { default: 'a' },
  });

  return {
    h,
    d,
    setRoute: (id: string) => {
      currentId = id;
    },
  };
}

const resolveB = (d: Record<string, Record<string, Deferreds>>) => {
  d.B.client.resolve({ id: 'B', name: 'B Ügyfél', colorKey: null });
  d.B.comms.resolve({ communications: [{ id: 'cb', subject: 'B comms', clientId: 'B' }], client: { id: 'B', name: 'B Ügyfél' } });
  d.B.workspaces.resolve({ items: [] });
  d.B.cases.resolve({ data: [{ id: 'B-case', caseNumber: 'B-1', title: 'B ügy', status: 'DRAFT' }], pagination: { total: 1, page: 1, limit: 100 } });
  d.B.docs.resolve([]);
};

const resolveA = (d: Record<string, Record<string, Deferreds>>) => {
  d.A.client.resolve({ id: 'A', name: 'A Ügyfél', colorKey: null });
  d.A.comms.resolve({ communications: [{ id: 'ca', subject: 'A comms', clientId: 'A' }], client: { id: 'A', name: 'A Ügyfél' } });
  d.A.workspaces.resolve({ items: [] });
  d.A.cases.resolve({ data: [{ id: 'A-case', caseNumber: 'A-1', title: 'A ügy', status: 'DRAFT' }], pagination: { total: 1, page: 1, limit: 100 } });
  d.A.docs.resolve([]);
};

test('CF-002 dossier: late client A cannot overwrite route B', async () => {
  const ctx = makeDossierHarness();

  // 1. Route A starts loading.
  ctx.h.commit();
  await settle();

  // 2. Navigate to B while A pending.
  ctx.setRoute('B');
  ctx.h.commit();
  await settle();

  // 3. B resolves and fully commits.
  resolveB(ctx.d);
  await settle();
  let tree = ctx.h.render();
  const bText = textOf(tree);
  assert.ok(bText.includes('B Ügyfél'), 'route B client identity committed');
  assert.ok(bText.includes('B-1'), 'route B related case committed');

  // 4. A resolves LATE and must be discarded.
  resolveA(ctx.d);
  await settle();
  tree = ctx.h.render();
  const afterText = textOf(tree);

  assert.ok(afterText.includes('B Ügyfél'), 'route B identity remains');
  assert.ok(afterText.includes('B-1'), 'route B related case remains');
  assert.ok(!afterText.includes('A Ügyfél'), 'stale client A identity discarded');
  assert.ok(!afterText.includes('A-1'), 'stale client A case discarded');
});

test('CF-002 control: when A resolves before B, route B still wins', async () => {
  const ctx = makeDossierHarness();

  ctx.h.commit();
  await settle();
  ctx.setRoute('B');
  ctx.h.commit();
  await settle();

  resolveA(ctx.d);
  await settle();
  resolveB(ctx.d);
  await settle();
  const tree = ctx.h.render();
  const text = textOf(tree);

  assert.ok(text.includes('B Ügyfél'), 'B wins when it resolves last in time');
  assert.ok(!text.includes('A Ügyfél'), 'A is not shown once B has committed');
});
