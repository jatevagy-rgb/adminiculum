import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRaceHarness, flatten, textOf, settle } from './helpers/asyncRaceHarness';

// UX-16: the Work Report case table must never render the "Nincs ügy."
// DataTableEmpty row while real case rows are displayed. The empty state is
// truthful: it appears only when there are zero displayed case rows.
//
// The harness executes the real page component; UI primitives are stubbed as
// element factories, so they are matched by component identity (React never
// invokes them here) and their rendered text is read through `textOf`.

const POPULATED_MONTH = '2026-08';
const EMPTY_MONTH = '2026-09';

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

function makeApi() {
  return {
    getClients: async () => ({ data: [{ id: 'client-1', name: 'Minta Kft.' }] }),
    ApiError: class MockApiError extends Error {},
    listWorkReportCases: (_clientId: string, period: { startDate: string; endDate: string }) => {
      const month = period.startDate.slice(0, 7);
      const cases =
        month === POPULATED_MONTH
          ? [caseItem('case-a', 'A-001', 'A ügy címe'), caseItem('case-b', 'B-001', 'B ügy címe')]
          : [];
      return Promise.resolve({
        kind: 'CLIENT_WORK_REPORT_CASES_V1',
        client: { id: 'client-1', name: 'Minta Kft.' },
        period,
        cases,
        generatedAt: '2026-09-30T20:00:00.000Z',
      });
    },
    listWorkReportOwnerCandidates: async () => ({
      kind: 'CLIENT_WORK_REPORT_OWNERS_V1',
      client: { id: 'client-1', name: 'Minta Kft.' },
      people: [],
      generatedAt: '2026-09-30T20:00:00.000Z',
    }),
    getWorkReportCase: async () => {
      throw new Error('report detail must not load in the case-list empty-state test');
    },
    downloadWorkReportPdf: async () => ({ blob: {} as Blob, filename: null }),
  };
}

function makeHarness() {
  const api = makeApi();
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
  return { h, ui };
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

async function selectPeriod(h: Harness['h'], month: string) {
  const input = flatten(h.render()).find((node) => node?.type === 'input' && node.props?.type === 'month');
  assert.ok(input, 'period month input rendered');
  input.props.onChange({ target: { value: month } });
  h.commit();
  await settle();
  h.commit();
  await settle();
  h.commit();
}

test('populated case list renders rows without the "Nincs ügy." empty row', async () => {
  const { h, ui } = makeHarness();
  await mountWithClient(h);
  await selectPeriod(h, POPULATED_MONTH);

  const tree = h.render();
  const text = textOf(tree);
  assert.match(text, /A-001/);
  assert.match(text, /B-001/);
  assert.equal(tableEmptyNodes(tree, ui).length, 0, 'no DataTableEmpty row while rows are displayed');
  assert.doesNotMatch(text, /Nincs ügy\./);
});

test('empty case list renders the truthful empty state exactly once', async () => {
  const { h, ui } = makeHarness();
  await mountWithClient(h);
  await selectPeriod(h, EMPTY_MONTH);

  const tree = h.render();
  assert.ok(
    emptyStateTitles(tree, ui).includes('Nincs megjeleníthető ügy'),
    'truthful empty case state is shown',
  );
  assert.equal(tableEmptyNodes(tree, ui).length, 0, 'no table empty row for a loaded empty list');
  assert.doesNotMatch(textOf(tree), /A-001|B-001/);
});

test('populated -> empty transition replaces rows with the empty state and no contradiction', async () => {
  const { h, ui } = makeHarness();
  await mountWithClient(h);
  await selectPeriod(h, POPULATED_MONTH);
  assert.match(textOf(h.render()), /A-001/);
  assert.equal(tableEmptyNodes(h.render(), ui).length, 0);

  await selectPeriod(h, EMPTY_MONTH);
  const tree = h.render();
  assert.doesNotMatch(textOf(tree), /A-001|B-001/);
  assert.ok(emptyStateTitles(tree, ui).includes('Nincs megjeleníthető ügy'));
  assert.equal(tableEmptyNodes(tree, ui).length, 0);
  assert.doesNotMatch(textOf(tree), /Nincs ügy\./);
});

test('empty -> populated transition removes the empty state and shows rows', async () => {
  const { h, ui } = makeHarness();
  await mountWithClient(h);
  await selectPeriod(h, EMPTY_MONTH);
  assert.ok(emptyStateTitles(h.render(), ui).includes('Nincs megjeleníthető ügy'));

  await selectPeriod(h, POPULATED_MONTH);
  const tree = h.render();
  const text = textOf(tree);
  assert.match(text, /A-001/);
  assert.match(text, /B-001/);
  assert.doesNotMatch(text, /Nincs ügy\./);
  assert.equal(
    emptyStateTitles(tree, ui).includes('Nincs megjeleníthető ügy'),
    false,
    'empty case state is gone once rows return',
  );
  assert.equal(tableEmptyNodes(tree, ui).length, 0);
});

test('source gate: DataTableEmpty is conditional on the displayed row count', () => {
  const page = readFileSync('src/app/work-report/page.tsx', 'utf8');
  assert.match(page, /const reportCaseRows = caseList\?\.cases \?\? \[\];/);
  assert.match(page, /reportCaseRows\.map\(/);
  assert.match(page, /reportCaseRows\.length === 0 \? \(\s*<DataTableEmpty colSpan=\{8\}>/);
});
