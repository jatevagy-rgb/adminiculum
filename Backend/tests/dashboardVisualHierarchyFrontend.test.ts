import fs from 'fs';
import path from 'path';
import {
  buildDashboardOperationalPresentation,
  DASHBOARD_SECONDARY_ACTIONS,
  getDashboardCaseTitle,
  getDashboardPrimaryActions,
  getNextSevenDayDeadlines,
} from '../../Frontend/src/lib/dashboardPresentation';
import type { DashboardOperationalOverview, WorkflowDeadlineItem } from '../../Frontend/src/lib/api';

const repoRoot = path.resolve(__dirname, '..', '..');
const dashboard = fs.readFileSync(path.join(repoRoot, 'Frontend/src/components/DashboardFocused.tsx'), 'utf8');

function operationalItem(
  id: string,
  groupCode: DashboardOperationalOverview['items'][number]['groupCode'],
): DashboardOperationalOverview['items'][number] {
  return {
    id,
    caseNumber: `CASE-${id}`,
    title: `${id} - LITIGATION`,
    client: { id: `client-${id}`, displayName: `Client ${id}`, clientColorKey: 'BLUE' },
    responsible: null,
    status: 'DRAFT',
    priority: 'MEDIUM',
    groupCode,
    groupLabel: groupCode,
    waitingLabel: 'Rögzített várakozási állapot',
    nearestDeadline: null,
    overdue: false,
    openTaskCount: 1,
    reviewCount: 0,
    oldestOpenActivityAt: '2026-07-20T08:00:00.000Z',
    nextAction: { code: 'OPEN_CASE', label: 'Ügy megnyitása', href: `/cases/${id}` },
    openHref: `/cases/${id}`,
  };
}

function deadline(id: string, dueAt: string): WorkflowDeadlineItem {
  return {
    id,
    sourceType: 'TASK',
    sourceId: id,
    caseId: `case-${id}`,
    title: id,
    dueAt,
    allDay: true,
    status: 'OPEN',
    urgency: 'THIS_WEEK',
    importance: 'NORMAL',
    legalSignificance: null,
    responsibility: {},
    source: { type: 'TASK', id },
    capabilities: {
      canOpen: true,
      canComplete: false,
      canReopen: false,
      canReschedule: false,
      canCancel: false,
      canCreateTask: false,
    },
  };
}

describe('dashboard visual hierarchy presentation behavior', () => {
  it('exposes four truthful primary actions and three compact secondary actions', () => {
    const actions = getDashboardPrimaryActions('case-1');

    expect(actions).toHaveLength(4);
    expect(actions.map((action) => action.label)).toEqual([
      'Új ügy',
      'Új feladat',
      'Dokumentum feltöltése',
      'Kommunikáció megnyitása',
    ]);
    expect(actions.every((action) => Boolean(action.icon && action.description && action.href))).toBe(true);
    expect(actions[2].href).toBe('/cases/case-1/documents');
    expect(DASHBOARD_SECONDARY_ACTIONS.map((action) => action.label)).toEqual(['Review sor', 'Határidők', 'Munkaórák']);
  });

  it('bounds grouped operational cases and reports the actual remaining count', () => {
    const groups: DashboardOperationalOverview['groups'] = [
      { code: 'DEADLINE_APPROACHING', label: 'Határidő közeleg', count: 3 },
      { code: 'OFFICE_ACTION', label: 'Nálunk van a következő lépés', count: 3 },
      { code: 'REVIEW', label: 'Review alatt', count: 2 },
      { code: 'CLIENT_WAITING', label: 'Ügyfélre várunk', count: 2 },
      { code: 'UNSPECIFIED', label: 'Nincs meghatározott következő lépés', count: 4 },
    ];
    const items = groups.flatMap((group) => Array.from({ length: group.count }, (_, index) => operationalItem(`${group.code}-${index}`, group.code)));
    const overview: DashboardOperationalOverview = {
      generatedAt: '2026-07-20T08:00:00.000Z',
      resume: { item: null },
      summary: { openCaseCount: items.length },
      groups,
      items,
    };

    const presentation = buildDashboardOperationalPresentation(overview);

    expect(presentation.visibleCount).toBe(6);
    expect(presentation.hiddenCount).toBe(items.length - 6);
    expect(presentation.unspecifiedCount).toBe(4);
    expect(presentation.groups).toHaveLength(5);
    expect(Math.max(...presentation.groups.map((group) => group.items.length))).toBe(2);
  });

  it('maps raw case-type suffixes to readable Hungarian labels', () => {
    expect(getDashboardCaseTitle('Minta ügy - LITIGATION')).toBe('Minta ügy - Peres ügy');
    expect(getDashboardCaseTitle('Minta ügy - OTHER')).toBe('Minta ügy - Egyéb');
    expect(getDashboardCaseTitle('Minta ügy - CONTRACT_DRAFTING')).toBe('Minta ügy - Szerződés');
  });

  it('keeps the deadline panel truthfully limited to the next seven local days', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    const items = [
      deadline('before', '2026-07-19T12:00:00.000Z'),
      deadline('today', '2026-07-20T12:00:00.000Z'),
      deadline('sixth', '2026-07-26T12:00:00.000Z'),
      deadline('eighth', '2026-07-27T22:00:00.000Z'),
    ];

    expect(getNextSevenDayDeadlines(items, now).map((item) => item.id)).toEqual(['today', 'sixth']);
  });
});

describe('dashboard visual hierarchy structural guards', () => {
  it('keeps the intended section order and one Dashboard title', () => {
    const labels = [
      'Gyors műveletek',
      'Itt folytasd',
      'Ügyek, ahol lépés szükséges',
      'Mai munkám',
      'Napi események és határidők',
      'Kommunikáció',
      'További jelzések',
    ];
    const positions = labels.map((label) => dashboard.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(dashboard.match(/title="Műszerfal"/g)).toHaveLength(1);
  });

  it('uses compact presentation primitives without the old saturated strip or nested empty card', () => {
    expect(dashboard).toContain('primaryActions.map');
    expect(dashboard).toContain('DASHBOARD_SECONDARY_ACTIONS.map');
    expect(dashboard).toContain('focus-visible:ring-2');
    expect(dashboard).toContain('<DashboardEmptyState');
    expect(dashboard).not.toContain('<CompactState');
    expect(dashboard).not.toContain('xl:grid-cols-7');
    expect(dashboard).not.toContain('bg-[var(--adm-terracotta-700)] text-white');
    expect(dashboard).not.toContain('Beérkezési sor');
  });

  it('preserves the operational, calendar, communication, and resume contracts', () => {
    expect(dashboard.match(/getDashboardOperationalOverview\(\)/g)).toHaveLength(1);
    expect(dashboard).toContain('action: operational.resume.item.actionLabel');
    expect(dashboard).toContain('getDashboardCaseTitle(operational.resume.item.case.title)');
    expect(dashboard).toContain('buildDashboardOperationalPresentation(operational)');
    expect(dashboard).toContain('getNextSevenDayDeadlines(deadlines)');
    expect(dashboard).toContain('Array.from({ length: 7 }');
    expect(dashboard).toContain('getCommunications({ limit: 50 })');
    expect(dashboard).toContain('<ClientAccent colorKey={item.client.clientColorKey}');
    expect(dashboard).toContain('workflowTone(group.code)');
    expect(dashboard).toContain('aria-expanded={signalsExpanded}');
  });

  it('keeps distinct daily work titles and explicit overdue meaning', () => {
    expect(dashboard).toContain('title="Mai feladataim"');
    expect(dashboard).toContain('title="Nekem kijelölt Review-k"');
    expect(dashboard).toContain('title="Következő 7 nap határidői"');
    expect(dashboard).toContain('Lejárt határidő');
    expect(dashboard).toContain('item.urgency === "OVERDUE" ? "Lejárt · "');
  });
});
