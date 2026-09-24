import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, settle, flatten } from './helpers/asyncRaceHarness';

// CF-001 (regression) — /cases/[caseId] case identity route scoping.
//
// A late case A identity (canonical or legacy-alias) must never become the
// authoritative case for route B, and must never re-scope related loaders.

type Rec = { id: string; caseNumber: string; title: string; clientName: string; matterType: string; status: string };

const recordA: Rec = { id: 'case-a', caseNumber: 'A-001', title: 'A ügy cím', clientName: 'A Ügyfél', matterType: 'Munkajog', status: 'DRAFT' };
const recordB: Rec = { id: 'case-b', caseNumber: 'B-001', title: 'B ügy cím', clientName: 'B Ügyfél', matterType: 'Kártérítés', status: 'DRAFT' };

const emptyComms = { communications: [], pagination: { total: 0, limit: 50, offset: 0 } };

const newRelated = () => ({
  contracts: deferred<any>(),
  timeline: deferred<any>(),
  documents: deferred<any>(),
  communications: deferred<any>(),
  workflowSummary: deferred<any>(),
  workItems: deferred<any>(),
  activity: deferred<any>(),
  agenda: deferred<any>(),
  responsibility: deferred<any>(),
});

function makeCaseHarness() {
  let routeCaseId = 'A';
  const identity = { A: deferred<any>(), B: deferred<any>() };
  const alias = deferred<any>();
  const rel: Record<string, ReturnType<typeof newRelated>> = { 'case-a': newRelated(), 'case-b': newRelated() };
  const relatedCalls: string[] = [];
  const record = (id: string) => {
    relatedCalls.push(id);
    return rel[id === 'case-a' ? 'case-a' : 'case-b'];
  };

  const api: Record<string, any> = {
    getCaseById: (id: string) => (id === 'A' ? identity.A.promise : identity.B.promise),
    getCaseContracts: (id: string) => record(id).contracts.promise,
    getCaseTimeline: (id: string) => record(id).timeline.promise,
    getCaseDocuments: (id: string) => record(id).documents.promise,
    getCommunications: (args: any) => record(args.caseId).communications.promise,
    getCaseWorkflowSummary: (id: string) => record(id).workflowSummary.promise,
    getCaseWorkItems: (id: string) => record(id).workItems.promise,
    getCaseActivity: (id: string) => record(id).activity.promise,
    getWorkflowAgenda: (args: any) => record(args.caseId).agenda.promise,
    getCaseResponsibility: (id: string) => record(id).responsibility.promise,
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
  };

  const h = createRaceHarness('src/components/CaseDetail.tsx', 'CaseDetail', {
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/lib/api': api,
    '@/lib/workspace/identityResolution': {
      findCaseByReference: () => alias.promise,
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

  return {
    h,
    identity,
    alias,
    rel,
    relatedCalls,
    setRoute: (id: string) => {
      routeCaseId = id;
    },
    props: () => ({ params: { caseId: routeCaseId } }),
    commitAndSettle: async () => {
      h.commit({ params: { caseId: routeCaseId } });
      await settle();
    },
  };
}

const caseNav = (tree: any) =>
  flatten(tree).find((n) => n?.props?.activeTab === 'overview' && n?.props?.caseNumber !== undefined);

const resolveRelated = (ctx: ReturnType<typeof makeCaseHarness>, which: 'case-a' | 'case-b') => {
  ctx.rel[which].contracts.resolve([]);
  ctx.rel[which].timeline.resolve([]);
  ctx.rel[which].documents.resolve([]);
  ctx.rel[which].communications.resolve(emptyComms);
  ctx.rel[which].workflowSummary.resolve(null);
  ctx.rel[which].workItems.resolve(null);
  ctx.rel[which].activity.resolve(null);
  ctx.rel[which].agenda.resolve(null);
  ctx.rel[which].responsibility.resolve(null);
};

test('CF-001 case detail: late case A identity cannot overwrite route B', async () => {
  const ctx = makeCaseHarness();

  // 1. Route A identity stays pending.
  await ctx.commitAndSettle();

  // 2. Navigate to B while A pending.
  ctx.setRoute('B');
  await ctx.commitAndSettle();

  // 3. B identity + related data commit.
  ctx.identity.B.resolve(recordB);
  await settle();
  let tree = ctx.h.render(ctx.props());
  ctx.h.effects();
  await settle();
  resolveRelated(ctx, 'case-b');
  await settle();
  tree = ctx.h.render(ctx.props());
  const navB = caseNav(tree);
  assert.equal(navB?.props?.caseId, 'case-b', 'route B caseId committed');
  assert.equal(navB?.props?.caseNumber, 'B-001', 'route B caseNumber committed');
  assert.equal(navB?.props?.clientName, 'B Ügyfél', 'route B client committed');
  assert.ok(ctx.relatedCalls.includes('case-b'), 'related data fetched for B');

  // 4. A identity resolves LATE and must be discarded.
  ctx.identity.A.resolve(recordA);
  await settle();
  tree = ctx.h.render(ctx.props());
  const nav = caseNav(tree);
  assert.equal(nav?.props?.caseId, 'case-b', 'stale case A must not become authoritative');
  assert.equal(nav?.props?.caseNumber, 'B-001', 'route B caseNumber must remain');
  assert.ok(!ctx.relatedCalls.includes('case-a'), 'related loaders must not re-scope to case A');
});

test('CF-001 legacy alias fallback: delayed alias response cannot overwrite route B', async () => {
  const ctx = makeCaseHarness();

  // Route A resolves only through the legacy alias scan, and stays pending.
  await ctx.commitAndSettle();
  ctx.identity.A.reject(new Error('404 CASE_NOT_FOUND'));
  await settle();

  // Route B resolves canonically and commits.
  ctx.setRoute('B');
  await ctx.commitAndSettle();
  ctx.identity.B.resolve(recordB);
  await settle();
  let tree = ctx.h.render(ctx.props());
  ctx.h.effects();
  await settle();
  resolveRelated(ctx, 'case-b');
  await settle();
  tree = ctx.h.render(ctx.props());
  assert.equal(caseNav(tree)?.props?.caseNumber, 'B-001', 'route B committed');

  // The delayed legacy-alias response for A arrives last and must be discarded.
  ctx.alias.resolve(recordA);
  await settle();
  tree = ctx.h.render(ctx.props());
  const nav = caseNav(tree);

  assert.equal(nav?.props?.caseId, 'case-b', 'delayed alias A must not overwrite route B');
  assert.equal(nav?.props?.caseNumber, 'B-001', 'route B caseNumber must remain under the delayed alias');
  assert.ok(!ctx.relatedCalls.includes('case-a'), 'legacy alias must not re-scope related loaders');
});
