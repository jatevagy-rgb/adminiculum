import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, deferred, settle, textOf, flatten } from './helpers/asyncRaceHarness';

// CF-005 (regression) — /clients/[clientId]/compliance route identity.
//
// All independently loaded client-scoped modules share one active client
// identity. A previous client's late response must be discarded in ANY
// completion order; a mixed "B header + A findings" screen must be impossible.

function makeComplianceHarness() {
  let currentId = 'A';
  const d: Record<string, Record<string, ReturnType<typeof deferred<any>>>> = { A: {}, B: {} };
  const keys = ['client', 'workspaces', 'overview', 'controls', 'workspace'] as const;
  for (const id of ['A', 'B']) for (const k of keys) d[id][k] = deferred<any>();

  const h = createRaceHarness('src/app/clients/[clientId]/compliance/page.tsx', 'default', {
    '@/components/AuthenticatedApp': { AuthenticatedApp: 'div' },
    '@/components/clients/ClientWorkspaceTabs': { ClientWorkspaceTabs: 'div' },
    '@/components/adminiculum/OperationalPrimitives': { SafePanelError: 'div' },
    '@/components/clients/compliance/ComplianceOverview': {
      ComplianceOverviewPanel: 'div',
      ComplianceControlsSection: 'div',
      ComplianceProposalPanel: 'div',
      complianceOutcomeClass: {},
      complianceOutcomeLabels: {},
      complianceScopeLabels: {},
    },
    '@/components/clients/compliance/ComplianceDocumentsSection': { ComplianceDocumentsSection: 'div' },
    '@/lib/complianceOverviewApi': {
      complianceOverviewApi: {
        getOverview: (id: string) => d[id].overview.promise,
        getControls: (id: string) => d[id].controls.promise,
      },
    },
    '@/lib/complianceWorkspaceApi': {
      complianceWorkspaceApi: {
        getWorkspace: (id: string) => d[id].workspace.promise,
        reconcile: async () => ({}),
      },
    },
    '@/lib/api': { getClient: (id: string) => d[id].client.promise },
    '@/lib/clientPortalAdminApi': { listAdminWorkspaces: (id: string) => d[id].workspaces.promise },
    'next/navigation': { useParams: () => ({ clientId: currentId }) },
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

const workspaceFor = (count: number) => ({
  summary: { enrollment: 'ENROLLED', evaluatedCount: count, openFindings: 0, openProposals: 0 },
  evaluatedAt: '2026-01-01T00:00:00.000Z',
  areas: [],
});

const orgWorkspace = { id: 'w', status: 'ACTIVE', mode: 'ORGANIZATION' };

const renderedFindingsId = (tree: any): string | undefined => {
  const node = flatten(tree).find((n) => Array.isArray(n?.props?.findings));
  return node?.props?.findings?.[0]?.id;
};

async function driveToCommittedB(ctx: ReturnType<typeof makeComplianceHarness>) {
  ctx.h.commit();
  await settle();
  ctx.setRoute('B');
  ctx.h.commit();
  await settle();
  ctx.d.B.client.resolve({ id: 'B', name: 'B Ügyfél' });
  ctx.d.B.workspaces.resolve({ items: [orgWorkspace] });
  ctx.d.B.overview.resolve({ findings: [{ id: 'fb' }] });
  ctx.d.B.controls.resolve({ summary: 'B controls' });
  ctx.d.B.workspace.resolve(workspaceFor(22));
  await settle();
  let tree = ctx.h.render();
  ctx.h.effects();
  await settle();
  tree = ctx.h.render();
  assert.ok(textOf(tree).includes('B Ügyfél'), 'route B identity committed');
  assert.ok(textOf(tree).includes('22'), 'route B workspace committed');
  assert.equal(renderedFindingsId(tree), 'fb', 'route B findings committed');
  return tree;
}

function assertStillB(tree: any) {
  const text = textOf(tree);
  assert.ok(text.includes('B Ügyfél'), 'route B identity must remain');
  assert.ok(!text.includes('A Ügyfél'), 'stale A identity must not appear');
  assert.ok(text.includes('22'), 'route B workspace must remain');
  assert.ok(!text.includes('11'), 'stale A workspace must not appear');
  assert.equal(renderedFindingsId(tree), 'fb', 'route B findings must remain');
}

const resolveA = (ctx: ReturnType<typeof makeComplianceHarness>, parts: string[]) => {
  for (const part of parts) {
    if (part === 'client') {
      ctx.d.A.client.resolve({ id: 'A', name: 'A Ügyfél' });
      ctx.d.A.workspaces.resolve({ items: [orgWorkspace] });
    }
    if (part === 'overview') {
      ctx.d.A.overview.resolve({ findings: [{ id: 'fa' }] });
      ctx.d.A.controls.resolve({ summary: 'A controls' });
    }
    if (part === 'workspace') ctx.d.A.workspace.resolve(workspaceFor(11));
  }
};

test('CF-005 order 1: A client+workspace resolve late, then A overview → B remains', async () => {
  const ctx = makeComplianceHarness();
  await driveToCommittedB(ctx);
  resolveA(ctx, ['client']);
  await settle();
  assertStillB(ctx.h.render());
  resolveA(ctx, ['overview', 'workspace']);
  await settle();
  assertStillB(ctx.h.render());
});

test('CF-005 order 2: A workspace resolves late first → B remains', async () => {
  const ctx = makeComplianceHarness();
  await driveToCommittedB(ctx);
  resolveA(ctx, ['workspace']);
  await settle();
  assertStillB(ctx.h.render());
  resolveA(ctx, ['client', 'overview']);
  await settle();
  assertStillB(ctx.h.render());
});

test('CF-005 order 3: A overview resolves first, then client, then workspace → B remains', async () => {
  const ctx = makeComplianceHarness();
  await driveToCommittedB(ctx);
  resolveA(ctx, ['overview']);
  await settle();
  assertStillB(ctx.h.render());
  resolveA(ctx, ['client']);
  await settle();
  assertStillB(ctx.h.render());
  resolveA(ctx, ['workspace']);
  await settle();
  assertStillB(ctx.h.render());
});
