import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, settle, textOf, flatten } from './helpers/asyncRaceHarness';

// LF-002 (regression) — API failure vs legitimate empty state.
//
// A failed module must not render an ordinary empty state. Success-with-empty
// still renders the normal empty state.

const rejection = () => Promise.reject(new Error('HTTP 500'));

const panelDetails = (tree: any): string[] =>
  flatten(tree)
    .map((n) => n?.props?.detail)
    .filter((value): value is string => typeof value === 'string');

const hasDetail = (tree: any, needle: string) => panelDetails(tree).some((d) => d.includes(needle));

// ---------------------------------------------------------------------------
// Grow
// ---------------------------------------------------------------------------

function growHarness(listAdminWorkspaces: () => Promise<any>) {
  return createRaceHarness('src/app/clients/[clientId]/grow/page.tsx', 'GrowPageContent', {
    '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
    '@/components/clients/GrowJourney': { GrowJourney: 'div' },
    '@/components/clients/GrowWorkbench': {
      GrowWorkbench: 'div',
      GROW_TABS: [
        { id: 'attekintes', label: 'Áttekintés' },
        { id: 'diagnosztika', label: 'Diagnosztika' },
        { id: 'bizonyitekok', label: 'Bizonyítékok' },
        { id: 'dontesek', label: 'Döntések' },
        { id: 'kezdemenyezesek', label: 'Kezdeményezések' },
        { id: 'eredmenyek', label: 'Eredmények' },
        { id: 'adatforrasok', label: 'Adatforrások' },
      ],
    },
    '@/components/clients/ClientWorkspaceTabs': { ClientWorkspaceTabs: 'div' },
    '@/components/adminiculum/OperationalPrimitives': { SafePanelError: 'div' },
    '@/lib/api': { getClient: async () => ({ id: 'B', name: 'B Ügyfél' }) },
    '@/lib/clientPortalAdminApi': { listAdminWorkspaces },
    'next/navigation': {
      useParams: () => ({ clientId: 'B' }),
      useSearchParams: () => new URLSearchParams(''),
    },
    'next/link': { default: 'a' },
  });
}

test('LF-002 grow: organization-mode lookup 500 shows an error, not the mode gate', async () => {
  const h = growHarness(() => rejection());
  h.commit();
  await settle();
  const tree = h.render();

  assert.ok(hasDetail(tree, 'szervezeti ügyfélmód'), 'mode lookup failure is surfaced');
  assert.ok(
    !textOf(tree).includes('A Grow felület csak szervezeti ügyfélmódban érhető el.'),
    'failure must not masquerade as the legitimate mode gate',
  );
});

test('LF-002 grow: valid empty workspace list still shows the mode gate (success empty)', async () => {
  const h = growHarness(async () => ({ items: [] }));
  h.commit();
  await settle();
  const tree = h.render();

  assert.ok(
    textOf(tree).includes('A Grow felület csak szervezeti ügyfélmódban érhető el.'),
    'a valid empty workspace list is a legitimate business gate',
  );
  assert.ok(!hasDetail(tree, 'szervezeti ügyfélmód'), 'no error panel for a successful empty result');
});

// ---------------------------------------------------------------------------
// Client dossier
// ---------------------------------------------------------------------------

function dossierHarness(overrides: Record<string, any>) {
  const base: Record<string, any> = {
    getClient: async () => ({ id: 'B', name: 'B Ügyfél', colorKey: null }),
    getClientCommunicationSummary: async () => ({ communications: [], client: { id: 'B', name: 'B Ügyfél' } }),
    getCases: async () => ({ data: [], pagination: { total: 0, page: 1, limit: 100 } }),
    getCaseDocuments: async () => [],
    updateClient: async () => ({}),
  };
  const api = { ...base, ...overrides };
  return createRaceHarness('src/app/clients/[clientId]/page.tsx', 'ClientDetailContent', {
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
    '@/lib/api': api,
    '@/lib/clientPortalAdminApi': {
      listAdminWorkspaces: overrides.listAdminWorkspaces || (async () => ({ items: [] })),
    },
    'next/navigation': { useParams: () => ({ clientId: 'B' }), useRouter: () => ({ push() {} }) },
    'next/link': { default: 'a' },
  });
}

const caseRow = { id: 'B-case', caseNumber: 'B-1', title: 'B ügy', status: 'DRAFT' };

test('LF-002 dossier: document 500 shows an error, not the empty-documents state', async () => {
  const h = dossierHarness({
    getCases: async () => ({ data: [caseRow], pagination: { total: 1, page: 1, limit: 100 } }),
    getCaseDocuments: () => rejection(),
  });
  h.commit();
  await settle();
  const tree = h.render();

  assert.ok(hasDetail(tree, 'A kapcsolt dokumentumok betöltése nem sikerült.'), 'document failure is explicit');
  assert.ok(!textOf(tree).includes('Nincs elérhető kapcsolt dokumentum.'), 'failure is not shown as empty');
});

test('LF-002 dossier: valid empty documents still show the empty-documents state', async () => {
  const h = dossierHarness({
    getCases: async () => ({ data: [caseRow], pagination: { total: 1, page: 1, limit: 100 } }),
    getCaseDocuments: async () => [],
  });
  h.commit();
  await settle();
  const tree = h.render();

  assert.ok(textOf(tree).includes('Nincs elérhető kapcsolt dokumentum.'), 'success empty renders empty state');
  assert.ok(!hasDetail(tree, 'A kapcsolt dokumentumok betöltése nem sikerült.'), 'no error panel for success empty');
});

test('LF-002 dossier: communications 500 shows an error, not the empty-communications state', async () => {
  const h = dossierHarness({ getClientCommunicationSummary: () => rejection() });
  h.commit();
  await settle();
  const tree = h.render();

  assert.ok(hasDetail(tree, 'A kommunikációs adatok jelenleg nem érhetők el.'), 'communications failure is explicit');
  assert.ok(!textOf(tree).includes('Nincs kapcsolt kommunikációs esemény.'), 'failure is not shown as empty');
});

test('LF-002 dossier: listAdminWorkspaces 500 is surfaced, not swallowed', async () => {
  const h = dossierHarness({ listAdminWorkspaces: () => rejection() });
  h.commit();
  await settle();
  const tree = h.render();

  assert.ok(textOf(tree).includes('B Ügyfél'), 'dossier still renders the client');
  assert.ok(hasDetail(tree, 'A szervezeti ügyfélmód adatai jelenleg nem érhetők el.'), 'mode failure is explicit');
});

test('LF-002 dossier: cases 500 is an explicit scoped warning', async () => {
  const h = dossierHarness({ getCases: () => rejection() });
  h.commit();
  await settle();
  const tree = h.render();

  assert.ok(textOf(tree).includes('A kapcsolt ügyek listája jelenleg nem elérhető.'), 'cases failure is explicit');
});

// ---------------------------------------------------------------------------
// CaseDetail
// ---------------------------------------------------------------------------

function caseHarness(related: Record<string, any>) {
  const api: Record<string, any> = {
    getCaseById: async () => ({ id: 'case-b', caseNumber: 'B-001', title: 'B ügy cím', clientName: 'B Ügyfél', matterType: 'Kártérítés', status: 'DRAFT' }),
    getUsers: async () => [],
    getCaseCollaborators: async () => [],
    getCaseTasks: async () => [],
    getWorkflowGraph: async () => null,
    getCaseWorkflowHistory: async () => [],
    getCases: async () => ({ data: [], pagination: { total: 0, page: 1, limit: 200 } }),
    getCaseAnonymousDocuments: async () => [],
    safeUploadErrorMessage: () => '',
    ApiError: class ApiError extends Error {},
    closeCaseLifecycle: async () => ({}),
    archiveCaseLifecycle: async () => ({}),
    ...related,
  };
  return createRaceHarness('src/components/CaseDetail.tsx', 'CaseDetail', {
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/lib/api': api,
    '@/lib/workspace/identityResolution': {
      findCaseByReference: async () => null,
      isCaseLookupAuthorizationDenial: () => false,
    },
    '@/components/adminiculum/OperationalPrimitives': { SafePanelError: 'div' },
    '@/components/documents/AnonymizeModal': { AnonymizeModal: 'div' },
    '@/components/documents/RehydrateModal': { RehydrateModal: 'div' },
    '@/components/cases/CaseWorkspaceNav': { CaseWorkspaceNav: 'div' },
    '@/components/cases/CaseWorkspaceOverview': { CaseWorkspaceOverview: 'div' },
    '@/components/litigation/CaseMatterDossierPanel': { CaseMatterDossierPanel: 'div' },
    '@/components/intake/CaseIntakeReadinessPanel': { CaseIntakeReadinessPanel: 'div' },
    '@/components/client-portal/ClientRequestComposer': { ClientRequestComposer: 'div' },
  });
}

test('LF-002 case detail: 500 on related loaders is surfaced as a partial-load panel', async () => {
  const h = caseHarness({
    getCaseContracts: () => rejection(),
    getCaseTimeline: () => rejection(),
    getCaseDocuments: () => rejection(),
    getCommunications: () => rejection(),
    getCaseWorkflowSummary: () => rejection(),
    getCaseWorkItems: () => rejection(),
    getCaseActivity: () => rejection(),
    getWorkflowAgenda: () => rejection(),
    getCaseResponsibility: () => rejection(),
  });
  h.commit({ params: { caseId: 'B' } });
  await settle();
  h.render({ params: { caseId: 'B' } });
  h.effects();
  await settle();
  const tree = h.render({ params: { caseId: 'B' } });

  assert.ok(hasDetail(tree, 'dokumentumok'), 'documents failure is named');
  assert.ok(hasDetail(tree, 'szerződések'), 'contracts failure is named');
  assert.ok(hasDetail(tree, 'kommunikáció'), 'communications failure is named');
});

test('LF-002 case detail: successful empty related data shows no partial-load panel', async () => {
  const h = caseHarness({
    getCaseContracts: async () => [],
    getCaseTimeline: async () => [],
    getCaseDocuments: async () => [],
    getCommunications: async () => ({ communications: [], pagination: { total: 0, limit: 50, offset: 0 } }),
    getCaseWorkflowSummary: async () => null,
    getCaseWorkItems: async () => null,
    getCaseActivity: async () => null,
    getWorkflowAgenda: async () => null,
    getCaseResponsibility: async () => null,
  });
  h.commit({ params: { caseId: 'B' } });
  await settle();
  h.render({ params: { caseId: 'B' } });
  h.effects();
  await settle();
  const tree = h.render({ params: { caseId: 'B' } });

  assert.ok(!hasDetail(tree, 'nem töltődtek be'), 'success empty must not show a partial-load panel');
});
