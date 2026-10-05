import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, settle, flatten, textOf } from './helpers/asyncRaceHarness';

// UX-16 follow-up: a failed canonical case-list request must invalidate the
// previous case list for the new client/period request. The page must never
// keep rendering a stale successful result (populated rows OR a
// "Nincs megjeleníthető ügy" successful-empty assertion) beside the read
// error. Empty-state rendering is allowed only after a successful list read.

const MONTH_EMPTY = '2026-09';
const MONTH_POPULATED = '2026-08';
const MONTH_OTHER = '2026-07';

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

function casesResponse(period: any, cases: any[]) {
  return {
    kind: 'CLIENT_WORK_REPORT_CASES_V1',
    client: { id: 'client-1', name: 'Minta Kft.' },
    period,
    cases,
    generatedAt: '2026-09-30T20:00:00.000Z',
  };
}

function makeApi() {
  const listCalls: Array<{ clientId: string; period: any; deferred: ReturnType<typeof deferred<any>> }> = [];
  const api: Record<string, any> = {
    getClients: async () => ({ data: [{ id: 'client-1', name: 'Minta Kft.' }] }),
    ApiError: class MockApiError extends Error {},
    listWorkReportCases: (clientId: string, period: any) => {
      const d = deferred<any>();
      listCalls.push({ clientId, period, deferred: d });
      return d.promise;
    },
    listWorkReportOwnerCandidates: async () => ({
      kind: 'CLIENT_WORK_REPORT_OWNERS_V1',
      client: { id: 'client-1', name: 'Minta Kft.' },
      people: [],
      generatedAt: '2026-09-30T20:00:00.000Z',
    }),
    getWorkReportCase: async () => {
      throw new Error('report detail must not load in the case-list failure test');
    },
    downloadWorkReportPdf: async () => ({ blob: {} as Blob, filename: null }),
  };
  return { api, listCalls };
}

function makeHarness() {
  const { api, listCalls } = makeApi();
  const ui = {
    Alert: (props: any) => ({ type: 'alert', props: { title: props.title, children: props.children } }),
    Badge: (props: any) => ({ type: 'badge', props: { children: props.children } }),
    Button: (props: any) => ({ type: 'button', props: { onClick: props.onClick, children: props.children } }),
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
  };
  const h = createRaceHarness('src/app/work-report/page.tsx', 'WorkReportPageContent', {
    '@/components/AuthenticatedApp': {
      AuthenticatedApp: (props: any) => ({ type: 'auth', props: { children: props.children } }),
    },
    '@/components/ui': ui,
    '@/lib/api': api,
    '@/lib/workReportApi': api,
  });
  return { h, ui, listCalls };
}

type Harness = ReturnType<typeof makeHarness>;

function elementsOfType(tree: any, component: any) {
  return flatten(tree).filter((node) => node?.type === component);
}

function tableEmptyNodes(tree: any, ui: Harness['ui']) {
  return elementsOfType(tree, ui.DataTableEmpty);
}

function emptyStateTitles(tree: any, ui: Harness['ui']): string[] {
  return elementsOfType(tree, ui.EmptyState).map((node) => String(node.props?.title ?? ''));
}

async function mountWithClient(h: Harness['h']) {
  h.commit();
  await settle();
  h.commit();
  const select = flatten(h.render()).find((node) => node?.type === 'select');
  assert.ok(select, 'client select rendered');
  select.props.onChange({ target: { value: 'client-1' } });
  h.commit();
  await settle();
  h.commit();
}

async function setPeriod(h: Harness['h'], month: string) {
  const input = flatten(h.render()).find((node) => node?.type === 'input' && node.props?.type === 'month');
  assert.ok(input, 'period month input rendered');
  input.props.onChange({ target: { value: month } });
  h.commit();
  await settle();
  h.commit();
}

function resolveInitial(h: Harness, cases: any[]) {
  assert.ok(h.listCalls[0], 'initial case-list request issued');
  h.listCalls[0].deferred.resolve(casesResponse(h.listCalls[0].period, cases));
}

test('empty -> failed request: error shown, no successful-empty assertion', async () => {
  const harness = makeHarness();
  const { h, ui } = harness;
  await mountWithClient(h);
  resolveInitial(harness, []);
  await settle();
  h.commit();
  assert.ok(
    emptyStateTitles(h.render(), ui).includes('Nincs megjeleníthető ügy'),
    'baseline: previous request loaded a truthful empty list',
  );

  await setPeriod(h, MONTH_EMPTY);
  assert.ok(harness.listCalls[1], 'a new case-list request was issued for the new period');
  harness.listCalls[1].deferred.reject(new Error('network down'));
  await settle();
  h.commit();

  const tree = h.render();
  const text = textOf(tree);
  assert.match(text, /Az ügylista nem tölthető be\./, 'read failure is surfaced');
  assert.equal(
    emptyStateTitles(tree, ui).includes('Nincs megjeleníthető ügy'),
    false,
    'a failed read must not keep the stale successful-empty assertion',
  );
  assert.equal(tableEmptyNodes(tree, ui).length, 0, 'no DataTableEmpty false-empty after a failed read');
  assert.doesNotMatch(text, /Nincs ügy\./);
});

test('populated -> failed request: error shown, stale rows cleared', async () => {
  const harness = makeHarness();
  const { h, ui } = harness;
  await mountWithClient(h);
  resolveInitial(harness, [caseItem('case-a', 'A-001', 'A ügy címe'), caseItem('case-b', 'B-001', 'B ügy címe')]);
  await settle();
  h.commit();
  assert.match(textOf(h.render()), /A-001/);

  await setPeriod(h, MONTH_EMPTY);
  assert.ok(harness.listCalls[1], 'a new case-list request was issued for the new period');
  harness.listCalls[1].deferred.reject(new Error('boom'));
  await settle();
  h.commit();

  const tree = h.render();
  const text = textOf(tree);
  assert.match(text, /Az ügylista nem tölthető be\./, 'read failure is surfaced');
  assert.doesNotMatch(text, /A-001|B-001/, 'stale previous rows must not survive a failed read');
  assert.equal(tableEmptyNodes(tree, ui).length, 0);
  assert.equal(
    emptyStateTitles(tree, ui).includes('Nincs megjeleníthető ügy'),
    false,
    'a failed read is not a successful empty list',
  );
});

test('failed -> successful empty: truthful empty state replaces the error', async () => {
  const harness = makeHarness();
  const { h, ui } = harness;
  await mountWithClient(h);
  resolveInitial(harness, []);
  await settle();
  h.commit();

  await setPeriod(h, MONTH_EMPTY);
  harness.listCalls[1].deferred.reject(new Error('temporary failure'));
  await settle();
  h.commit();
  assert.match(textOf(h.render()), /Az ügylista nem tölthető be\./);

  await setPeriod(h, MONTH_OTHER);
  assert.ok(harness.listCalls[2], 'recovery request issued');
  harness.listCalls[2].deferred.resolve(casesResponse(harness.listCalls[2].period, []));
  await settle();
  h.commit();

  const tree = h.render();
  const text = textOf(tree);
  assert.doesNotMatch(text, /Az ügylista nem tölthető be\./, 'stale error is cleared by a successful read');
  assert.ok(
    emptyStateTitles(tree, ui).includes('Nincs megjeleníthető ügy'),
    'a successful empty read renders the truthful empty state',
  );
  assert.equal(tableEmptyNodes(tree, ui).length, 0);
});

test('failed -> successful populated: rows displayed, error cleared', async () => {
  const harness = makeHarness();
  const { h, ui } = harness;
  await mountWithClient(h);
  resolveInitial(harness, []);
  await settle();
  h.commit();

  await setPeriod(h, MONTH_EMPTY);
  harness.listCalls[1].deferred.reject(new Error('temporary failure'));
  await settle();
  h.commit();
  assert.match(textOf(h.render()), /Az ügylista nem tölthető be\./);

  await setPeriod(h, MONTH_POPULATED);
  assert.ok(harness.listCalls[2], 'recovery request issued');
  harness.listCalls[2].deferred.resolve(
    casesResponse(harness.listCalls[2].period, [caseItem('case-a', 'A-001', 'A ügy címe')]),
  );
  await settle();
  h.commit();

  const tree = h.render();
  const text = textOf(tree);
  assert.doesNotMatch(text, /Az ügylista nem tölthető be\./);
  assert.match(text, /A-001/);
  assert.equal(tableEmptyNodes(tree, ui).length, 0);
  assert.equal(emptyStateTitles(tree, ui).includes('Nincs megjeleníthető ügy'), false);
});
