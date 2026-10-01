import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, settle, flatten, textOf } from './helpers/asyncRaceHarness';

// Report-level client-side owner selection and source-switch races on
// /work-report:
//   1. a late case A report must never overwrite case B (stale response guard)
//   2. a late owner-selection response must never restore a previous owner
//   3. a cross-client owner selection fails safely and resets the selection

type OwnerLike = { personId: string; name: string; jobTitle: string | null; organizationGroupName: string | null } | null;

const ISSUER = {
  legalName: 'Bálintfy és Társai Ügyvédi Iroda',
  address: '1061 Budapest, Andrássy út 2. IV. emelet',
  taxNumber: '28067935-2-42',
  email: 'info@balintfy.hu',
  phone: '+36 1 302 8900',
};

const OWNER_KISS_ILONA = { personId: 'op-1', name: 'Kiss Ilona', jobTitle: 'Beszerzési vezető', organizationGroupName: 'Beszerzés' };

function caseItem(caseId: string, caseNumber: string, title: string) {
  return {
    caseId,
    caseNumber,
    caseTitle: title,
    caseStatus: 'IN_REVIEW',
    caseStatusLabel: 'Felülvizsgálat alatt',
    isClosed: false,
    completedAt: null,
    matter: { id: 'matter-1', title: 'Munkaügyi ügytárgy' },
    responsibleLawyerName: 'Dr. Kovács Péter',
    recordedMinutes: 60,
    recordedEntryCount: 1,
    ambiguousMinutes: 0,
    ambiguousEntryCount: 0,
    excludedMinutes: 0,
    excludedEntryCount: 0,
    zeroTime: false,
  };
}

function detailFor(caseId: string, caseNumber: string, title: string, owner: OwnerLike = null) {
  const base = {
    kind: 'CLIENT_WORK_REPORT_V1',
    client: { id: 'client-1', name: 'Minta Kft.' },
    period: { startDate: '2026-09-01', endDate: '2026-09-30' },
    case: {
      ...caseItem(caseId, caseNumber, title),
      requesterNames: ['Nagy Réka'],
      organizationGroupNames: ['HR'],
      departmentNames: ['Munkajog'],
      workerNames: ['Ügyvéd Éva'],
      zeroTime: false,
    },
    rows: [],
    ambiguousRows: [],
    excludedRows: [],
    safeUpdates: [],
    generatedAt: '2026-09-30T20:00:00.000Z',
  };
  return {
    ...base,
    owner,
    issuer: ISSUER,
    issuerMissing: [],
    officeIdentifierNote: 'Az iroda kamarai nyilvántartási száma nem szerepel a kiállítói profilban, ezért az ügyfél-kivonat nem tartalmazza.',
    exportPreview: {
      kind: base.kind,
      client: base.client,
      period: base.period,
      case: {
        caseId: base.case.caseId,
        caseNumber: base.case.caseNumber,
        caseTitle: base.case.caseTitle,
        caseStatusLabel: base.case.caseStatusLabel,
        completedAt: null,
        matter: base.case.matter,
        responsibleLawyerName: base.case.responsibleLawyerName,
        requesterNames: base.case.requesterNames,
        organizationGroupNames: base.case.organizationGroupNames,
        departmentNames: base.case.departmentNames,
        recordedMinutes: base.case.recordedMinutes,
        recordedEntryCount: base.case.recordedEntryCount,
      },
      owner,
      issuer: ISSUER,
      rows: [],
      safeUpdates: [],
      generatedAt: base.generatedAt,
    },
  };
}

class MockApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, endpoint?: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function makeApi() {
  const ownerCalls: Array<{ caseId: string; ownerId: string | null; deferred: ReturnType<typeof deferred<any>> }> = [];
  const api: Record<string, any> = {
    getClients: async () => ({ data: [{ id: 'client-1', name: 'Minta Kft.' }] }),
    ApiError: MockApiError,
    listWorkReportCases: () =>
      Promise.resolve({
        kind: 'CLIENT_WORK_REPORT_CASES_V1',
        client: { id: 'client-1', name: 'Minta Kft.' },
        period: { startDate: '2026-09-01', endDate: '2026-09-30' },
        cases: [caseItem('case-a', 'A-001', 'A ügy címe'), caseItem('case-b', 'B-001', 'B ügy címe')],
        generatedAt: '2026-09-30T20:00:00.000Z',
      }),
    listWorkReportOwnerCandidates: async () => ({
      kind: 'CLIENT_WORK_REPORT_OWNERS_V1',
      client: { id: 'client-1', name: 'Minta Kft.' },
      people: [OWNER_KISS_ILONA, { personId: 'op-2', name: 'Nagy Réka', jobTitle: 'HR vezető', organizationGroupName: 'HR' }],
      generatedAt: '2026-09-30T20:00:00.000Z',
    }),
    getWorkReportCase: (caseId: string, _period: unknown, ownerId: string | null) => {
      const d = deferred<any>();
      ownerCalls.push({ caseId, ownerId, deferred: d });
      return d.promise;
    },
    downloadWorkReportPdf: async () => ({ blob: {} as Blob, filename: null }),
  };
  return { api, ownerCalls };
}

function makeHarness(api: Record<string, any>) {
  return createRaceHarness('src/app/work-report/page.tsx', 'WorkReportPageContent', {
    '@/components/AuthenticatedApp': { AuthenticatedApp: (props: any) => ({ type: 'auth', props: { children: props.children } }) },
    '@/components/ui': {
      Alert: (props: any) => ({ type: 'alert', props: { title: props.title, children: props.children } }),
      Badge: (props: any) => ({ type: 'badge', props: { children: props.children } }),
      Button: (props: any) => ({ type: 'button', props: { onClick: props.onClick, disabled: props.disabled, children: props.children } }),
      Card: (props: any) => ({ type: 'card', props: { children: props.children } }),
      CardContent: (props: any) => ({ type: 'cardcontent', props: { children: props.children } }),
      DataTable: (props: any) => ({ type: 'table', props: { children: props.children } }),
      DataTableHead: (props: any) => ({ type: 'thead', props: { children: props.children } }),
      DataTableBody: (props: any) => ({ type: 'tbody', props: { children: props.children } }),
      DataTableRow: (props: any) => ({ type: 'tr', props: { children: props.children } }),
      DataTableHeaderCell: (props: any) => ({ type: 'th', props: { children: props.children } }),
      DataTableCell: (props: any) => ({ type: 'td', props: { children: props.children } }),
      DataTableEmpty: (props: any) => ({ type: 'tempty', props: { children: props.children } }),
      EmptyState: (props: any) => ({ type: 'empty', props: { title: props.title, children: props.description } }),
      MetricTile: (props: any) => ({ type: 'tile', props: { label: props.label, children: props.value } }),
      PageHeader: (props: any) => ({ type: 'pageheader', props: props ?? {} }),
    },
    '@/lib/api': api,
    '@/lib/workReportApi': api,
  });
}

function ownerSelectOf(tree: any) {
  const selects = flatten(tree).filter((node) => node?.type === 'select');
  return selects.find((node) => textOf(node).includes('Nincs megadva')) ?? null;
}

function caseButtonsOf(tree: any) {
  return flatten(tree).filter(
    (node) => node && typeof node === 'object' && typeof node.props?.onClick === 'function' && textOf(node).includes('Részletek'),
  );
}

function ownerDdValue(tree: any): string | null {
  // InfoRow is a local function component: the harness does not invoke it, but
  // its element keeps the label/value props for direct inspection.
  const node = flatten(tree).find(
    (n) => n && typeof n === 'object' && typeof n.type === 'function' && n.props?.label === 'Ügygazda az ügyfélnél',
  );
  return node ? (node.props.value ?? null) : null;
}

async function openCaseB(h: ReturnType<typeof createRaceHarness>) {
  h.commit();
  await settle();
  h.commit();
  await settle();
  const clientSelect = flatten(h.render()).find((node) => node?.type === 'select');
  assert.ok(clientSelect, 'client select rendered');
  clientSelect.props.onChange({ target: { value: 'client-1' } });
  h.commit();
  await settle();
  const buttons = caseButtonsOf(h.render());
  assert.equal(buttons.length, 2);
  return buttons;
}

test('a late case A report never overwrites case B', async () => {
  const { api, ownerCalls } = makeApi();
  const h = makeHarness(api);
  const buttons = await openCaseB(h);
  buttons[0].props.onClick(); // case-a
  buttons[1].props.onClick(); // case-b
  assert.equal(ownerCalls.length, 2);
  // Resolve B first, then A late.
  ownerCalls[1].deferred.resolve(detailFor('case-b', 'B-001', 'B ügy címe'));
  await settle();
  h.commit();
  assert.match(textOf(h.render()), /B-001\s+—\s+B ügy címe/);
  ownerCalls[0].deferred.resolve(detailFor('case-a', 'A-001', 'A ügy címe'));
  await settle();
  h.commit();
  const text = textOf(h.render());
  assert.match(text, /B-001\s+—\s+B ügy címe/);
  assert.doesNotMatch(text, /A-001\s+—\s+A ügy címe/);
});

test('a late owner-selection response never restores a previous owner', async () => {
  const { api, ownerCalls } = makeApi();
  const h = makeHarness(api);
  const buttons = await openCaseB(h);
  buttons[1].props.onClick();
  assert.equal(ownerCalls.length, 1);
  ownerCalls[0].deferred.resolve(detailFor('case-b', 'B-001', 'B ügy címe', null));
  await settle();
  h.commit();
  await settle();
  const ownerSelect = ownerSelectOf(h.render());
  assert.ok(ownerSelect, 'owner select rendered');
  ownerSelect.props.onChange({ target: { value: 'op-1' } });
  ownerSelect.props.onChange({ target: { value: '' } });
  const later = ownerCalls.slice(1);
  assert.equal(later.length, 2);
  // Resolve the latest (owner cleared) first, then the stale owner response.
  later[1].deferred.resolve(detailFor('case-b', 'B-001', 'B ügy címe', null));
  await settle();
  h.commit();
  later[0].deferred.resolve(detailFor('case-b', 'B-001', 'B ügy címe', OWNER_KISS_ILONA));
  await settle();
  h.commit();
  const tree = h.render();
  assert.equal(ownerDdValue(tree), 'Nincs megadva');
  assert.equal(ownerSelectOf(tree)?.props.value, '');
});

test('a cross-client owner selection fails safely and resets the selection', async () => {
  const { api, ownerCalls } = makeApi();
  const h = makeHarness(api);
  const buttons = await openCaseB(h);
  buttons[1].props.onClick();
  ownerCalls[0].deferred.resolve(detailFor('case-b', 'B-001', 'B ügy címe', null));
  await settle();
  h.commit();
  await settle();
  const ownerSelect = ownerSelectOf(h.render());
  ownerSelect.props.onChange({ target: { value: 'op-foreign' } });
  // The foreign owner is rejected server-side; the page clears the selection
  // and reloads without an owner.
  await settle();
  h.commit();
  const retry = ownerCalls[1];
  assert.ok(retry, 'retry request issued');
  retry.deferred.reject(new MockApiError(422, 'A kiválasztott ügygazda nem tartozik az ügy ügyfeléhez.', '/work-reports/cases/case-b', 'WORK_REPORT_OWNER_NOT_IN_CLIENT'));
  await settle();
  h.commit();
  // The page reacts to the 422 by resetting the owner and reloading.
  const secondRetry = ownerCalls[2];
  assert.ok(secondRetry, 'ownerless reload issued after the rejection');
  secondRetry.deferred.resolve(detailFor('case-b', 'B-001', 'B ügy címe', null));
  await settle();
  h.commit();
  const tree = h.render();
  assert.equal(ownerSelectOf(tree)?.props.value, '');
  assert.equal(ownerDdValue(tree), 'Nincs megadva');
  assert.match(textOf(tree), /nem tartozik az ügy ügyfeléhez/);
});
