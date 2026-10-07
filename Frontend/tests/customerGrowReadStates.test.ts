import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createRaceHarness, deferred, flatten, settle, textOf } from './helpers/asyncRaceHarness';
import { componentHarness } from './helpers/componentHarness';

class ApiError extends Error {
  constructor(public status: number, public code?: string) { super('Private server diagnostic'); }
}

const views = [
  { file: '../src/components/client-portal/OrgGrowView.tsx', outer: 'OrgGrowView', inner: 'OrgGrowWorkspaceView' },
  { file: '../src/components/client-portal-v3/grow/PortalGrowV3.tsx', outer: 'PortalGrowV3', inner: 'PortalGrowWorkspaceV3' },
];

const grow = (workspace: string, surveys?: unknown[]) => ({
  customerName: workspace,
  processes: [{ id: `${workspace}-process`, name: `${workspace} process`, category: 'OTHER', frequency: 'DAILY', criticality: 'LOW', steps: [] }],
  initiatives: [], outcomes: { measured: [], calculatedOrEstimated: [] },
  opportunities: [], opportunitiesDeferredNotice: null,
  ...(surveys === undefined ? {} : { surveys }),
});
const catalogue = { packs: [], aggregatedFindings: [] };
const survey = (name: string) => ({ submittedAt: '2026-01-01T00:00:00Z', categoryLabels: [name], processName: null, freeText: name });

function setup(view: typeof views[number], api: Record<string, unknown> = {}) {
  let workspace = 'A';
  const imports = {
    '@/lib/clientPortalApi': {
      CLIENT_PORTAL_WORKSPACE_STORAGE_KEY: 'workspace',
      getStoredPortalWorkspace: () => workspace,
      getPortalOrgGrow: async () => grow(workspace),
      listPortalGrowAssessments: async () => catalogue,
      listPortalGrowSurveys: async () => ({ items: [] }),
      ...api,
    },
    '@/lib/api': { ApiError },
    '@/lib/clientInteractionApi': {
      clientSafeError: (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status)
        ? 'Customer access required' : 'Customer data could not be loaded',
    },
    '@/lib/growApi': { SURVEY_CATEGORY_LABELS_HU: { TOPIC: 'Customer topic' } },
    '@/components/client-portal/GrowAdaptiveJourney': { GrowAdaptiveJourney: 'adaptive-journey' },
    '@/components/adminiculum/ui': { AdminBadge: 'span', AdminButton: 'button', AdminPanel: 'section', AdminSectionHeader: 'header', AdminStatusPill: 'span' },
    '@/components/adminiculum/OperationalPrimitives': { CompactState: 'compact-state', OperationalPageHeader: 'header', SafePanelError: 'safe-error' },
    '@/components/ui': { Button: 'button', SafePanelError: 'safe-error' },
    '../shared/PortalEmptyInline': { PortalEmptyInline: 'empty-inline' },
  };
  const file = fileURLToPath(new URL(view.file, import.meta.url));
  return {
    create: () => createRaceHarness(file, view.inner, imports),
    events: () => componentHarness(file, view.inner, imports),
    outer: () => createRaceHarness(file, view.outer, imports),
    changeWorkspace: (next: string) => { workspace = next; },
  };
}

const historyState = (tree: unknown) => flatten(tree).find((node) => node.props?.['data-testid'] === 'grow-survey-history-status');
const retry = (tree: unknown) => flatten(historyState(tree)).find((node) => node.type === 'safe-error').props.onRetry;
const processId = (tree: unknown) => flatten(tree).find((node) => node.type === 'adaptive-journey')?.props.processes[0]?.id;

for (const view of views) {
  test(`${view.outer}: pending/failed survey history does not hide usable Grow data; retry can confirm empty`, async () => {
    const pending = deferred();
    let calls = 0;
    const ctx = setup(view, { listPortalGrowSurveys: () => ++calls === 1 ? pending.promise : Promise.resolve({ items: [] }) });
    const h = ctx.create();
    const props = { workspaceReference: 'A' };
    h.commit(props); await settle();
    let tree = h.render(props);
    assert.equal(processId(tree), 'A-process');
    assert.equal(historyState(tree).props['data-state'], 'loading');
    assert.doesNotMatch(textOf(historyState(tree)), /Még nincs/);

    pending.reject(new ApiError(500)); await settle();
    tree = h.render(props);
    assert.equal(processId(tree), 'A-process');
    assert.equal(historyState(tree).props['data-state'], 'error');
    assert.doesNotMatch(textOf(historyState(tree)), /Még nincs|Private server diagnostic/);
    retry(tree)(); await settle();
    tree = h.render(props);
    assert.equal(historyState(tree).props['data-state'], 'ready');
    assert.match(textOf(historyState(tree)), /Még nincs/);
    assert.equal(processId(tree), 'A-process');
    h.unmount();
  });

  test(`${view.outer}: authorization, unavailable, and malformed history responses are not empty`, async () => {
    for (const [response, expected] of [
      [new ApiError(401), 'unauthorized'], [new ApiError(403), 'unauthorized'],
      [new ApiError(403, 'FEATURE_DISABLED'), 'unavailable'], [new ApiError(404), 'unavailable'],
      [new ApiError(503), 'unavailable'], [null, 'unavailable'], [{ items: null }, 'unavailable'],
    ] as const) {
      const ctx = setup(view, { listPortalGrowSurveys: async () => { if (response instanceof Error) throw response; return response; } });
      const h = ctx.create();
      h.commit({ workspaceReference: 'A' }); await settle();
      const tree = h.render({ workspaceReference: 'A' });
      assert.equal(historyState(tree).props['data-state'], expected);
      assert.equal(processId(tree), 'A-process');
      assert.doesNotMatch(textOf(historyState(tree)), /Még nincs/);
      assert.ok(flatten(historyState(tree)).some((node) => node.type === 'safe-error'));
      h.unmount();
    }
  });

  test(`${view.outer}: the latest history retry wins over a late earlier response`, async () => {
    const older = deferred();
    const newer = deferred();
    let calls = 0;
    const ctx = setup(view, { listPortalGrowSurveys: () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new ApiError(500)) : calls === 2 ? older.promise : newer.promise;
    } });
    const h = ctx.create();
    const props = { workspaceReference: 'A' };
    h.commit(props); await settle();
    const reload = retry(h.render(props));
    reload(); reload();
    newer.resolve({ items: [] }); await settle();
    older.resolve({ items: [survey('Old history')] }); await settle();
    assert.equal(historyState(h.render(props)).props['data-state'], 'ready');
    assert.match(textOf(historyState(h.render(props))), /Még nincs/);
    assert.ok(!h.slots().some((slot) => Array.isArray(slot) && slot.some((item) => item?.freeText === 'Old history')));
    h.unmount();
  });

  test(`${view.outer}: workspace identity remounts the body and stale main reads start no follow-up reads`, async () => {
    const pending = deferred();
    let mainCalls = 0;
    let catalogueCalls = 0;
    let surveyCalls = 0;
    const ctx = setup(view, {
      getPortalOrgGrow: () => ++mainCalls === 1 ? pending.promise : Promise.resolve(grow('B', [])),
      listPortalGrowAssessments: async () => { catalogueCalls += 1; return catalogue; },
      listPortalGrowSurveys: async () => { surveyCalls += 1; return { items: [] }; },
    });
    const outer = ctx.outer();
    assert.equal(outer.commit().key, 'A');
    const a = ctx.create();
    a.commit({ workspaceReference: 'A' });
    ctx.changeWorkspace('B');
    assert.equal(outer.render().key, 'B');
    a.unmount();
    const b = ctx.create();
    b.commit({ workspaceReference: 'B' }); await settle();
    pending.resolve(grow('A')); await settle();
    assert.equal(processId(b.render({ workspaceReference: 'B' })), 'B-process');
    assert.equal(catalogueCalls, 1);
    assert.equal(surveyCalls, 0, 'old A response must not trigger a history request in B');
    assert.ok(!a.slots().some((slot) => slot?.customerName === 'A'));
    b.unmount(); outer.unmount();
  });

  test(`${view.outer}: stored workspace changes invalidate pending history before React unmount`, async () => {
    const pending = deferred();
    const ctx = setup(view, { listPortalGrowSurveys: () => pending.promise });
    const h = ctx.create();
    const props = { workspaceReference: 'A' };
    h.commit(props); await settle();
    ctx.changeWorkspace('B');
    pending.resolve({ items: [survey('Wrong workspace history')] }); await settle();
    assert.equal(historyState(h.render(props)).props['data-state'], 'loading');
    assert.ok(!h.slots().some((slot) => Array.isArray(slot) && slot.some((item) => item?.freeText === 'Wrong workspace history')));
    h.unmount();
  });

  test(`${view.outer}: unmount invalidates a pending catalogue read and its parent completion`, async () => {
    const pending = deferred();
    const ctx = setup(view, { getPortalOrgGrow: async () => grow('A', []), listPortalGrowAssessments: () => pending.promise });
    const h = ctx.create();
    h.commit({ workspaceReference: 'A' }); await settle();
    h.unmount();
    const before = JSON.stringify(h.slots());
    pending.resolve({ packs: [{ packKey: 'stale-pack' }], aggregatedFindings: [] }); await settle();
    assert.equal(JSON.stringify(h.slots()), before);
  });

  test(`${view.outer}: an old survey submission cannot refresh history in a newly selected workspace`, async () => {
    const pending = deferred();
    let historyCalls = 0;
    const ctx = setup(view, {
      getPortalOrgGrow: async () => grow('A', []),
      submitPortalGrowSurvey: () => pending.promise,
      listPortalGrowSurveys: async () => { historyCalls += 1; return { items: [] }; },
    });
    // The event harness omits window; exercise the real form without URL navigation side effects.
    const h = ctx.events();
    const props = { workspaceReference: 'A' };
    h.render(props); h.effects(); await settle();
    let tree = h.render(props);
    flatten(tree).find((node) => node.props?.['data-testid'] === 'grow-tab-teendok').props.onClick();
    tree = h.render(props);
    flatten(tree).find((node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = h.render(props);
    const submitted = flatten(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
    ctx.changeWorkspace('B');
    pending.resolve({ message: 'Old workspace submission completed' });
    await submitted; await settle();
    assert.equal(historyCalls, 0);
    assert.doesNotMatch(textOf(h.render(props)), /Old workspace submission completed/);
  });
}
