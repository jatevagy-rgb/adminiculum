import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

/**
 * Live acceptance repair — Compliance Center "Értékelés frissítése" feedback.
 *
 * The evaluation action must ALWAYS resolve into visible feedback:
 *   - success / no-change / error state,
 *   - a "Legutóbbi értékelés eredménye" summary with run time, status and counts,
 *   - an explicit "Nincs új változás…" message when the run produced no delta,
 *   - a changed-areas summary when the run produced new evaluation records,
 *   - safe error messaging that clears the loading state,
 *   - the extracted legal matrix documents section left reachable and untouched,
 *   - no automatic non-compliance wording from document references alone.
 *
 * The real production page is executed with its existing API helpers mocked,
 * exactly like the other component-level compliance tests. Section headers are
 * passed as a component property, so they are asserted through the Section
 * element instead of the traversed children text.
 */

class TestApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const demoArea = (overrides: Record<string, any> = {}) => ({
  applicabilityId: 'a1',
  requirementKey: 'r1',
  requirementVersionId: 'rv1',
  requirementVersionKey: 'v1',
  ruleVersionKey: 'rule1',
  title: 'Adatkezelési tájékoztató',
  normativeStatement: null,
  domainLabel: 'Adatvédelem',
  outcome: 'DOES_NOT_APPLY',
  scopeType: 'COMPANY',
  subjectLabel: null,
  evaluationAt: '2026-01-10T08:00:00.000Z',
  sourceSupportState: 'SUFFICIENT',
  specialistRequirement: 'NONE',
  activeFindingId: null,
  usedFacts: [],
  missingFacts: [],
  citations: [],
  ...overrides,
});

const workspaceFor = (overrides: Record<string, any> = {}) => ({
  summary: {
    enrollment: 'ENROLLED',
    evaluatedCount: 4,
    applies: 1,
    doesNotApply: 2,
    insufficientFacts: 0,
    legalReviewRequired: 0,
    technicalReviewRequired: 0,
    sourceSupportInsufficient: 0,
    openFindings: 0,
    openProposals: 0,
    ...(overrides.summary || {}),
  },
  evaluatedAt: overrides.evaluatedAt !== undefined ? overrides.evaluatedAt : '2026-01-10T08:00:00.000Z',
  areas: overrides.areas ?? [demoArea()],
});

type HarnessOptions = {
  initial?: any;
  reconcile?: () => Promise<any>;
};

function makeHarness(options: HarnessOptions = {}) {
  let current = options.initial ?? workspaceFor();
  const DocumentsSection = (props: any) =>
    React.createElement('div', null, `documents-section:${props?.clientId ?? 'missing'}`);
  const imports: Record<string, any> = {
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
    '@/components/clients/compliance/ComplianceDocumentsSection': { ComplianceDocumentsSection: DocumentsSection },
    '@/components/clients/compliance/ComplianceProfessionalSummary': { ComplianceProfessionalSummary: 'professional-summary' },
    '@/components/client-portal/ClientRequestComposer': { ClientRequestComposer: 'div' },
    '@/lib/complianceOverviewApi': {
      complianceOverviewApi: {
        getOverview: async () => ({ findings: [] }),
        getControls: async () => ({ requirements: [] }),
      },
    },
    '@/lib/complianceWorkspaceApi': {
      complianceWorkspaceApi: {
        getWorkspace: async () => current,
        reconcile:
          options.reconcile ??
          (async () => ({ enrolled: true, evaluated: 2, snapshotsCreated: 0, snapshotsDeduplicated: 2, findingsCreated: 0 })),
      },
    },
    '@/lib/api': {
      ApiError: TestApiError,
      getClient: async () => ({ id: 'demo', name: 'Demo Kft.' }),
      getCases: async () => ({ data: [] }),
    },
    '@/lib/clientPortalAdminApi': {
      listAdminWorkspaces: async () => ({ items: [{ id: 'w', status: 'ACTIVE', mode: 'ORGANIZATION' }] }),
    },
    '@/lib/routeGeneration': {
      useRouteGeneration: () => ({ generation: 1, isActive: () => true }),
    },
    'next/navigation': { useParams: () => ({ clientId: 'demo' }) },
    'next/link': { default: 'a' },
  };
  const h = componentHarness('src/app/clients/[clientId]/compliance/page.tsx', 'default', imports);
  return {
    h,
    setWorkspace: (next: any) => {
      current = next;
    },
  };
}

const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await tick();
};

const clickLabel = (node: any, label: string) => {
  const match = flatten(node).find((n) => n?.props?.type === 'button' && textOf(n).includes(label));
  assert.ok(match, `button "${label}" must be rendered`);
  match.props.onClick();
};

const sectionTitles = (node: any): string[] =>
  flatten(node)
    .filter((n) => typeof n?.type === 'function' && (n.type as any).name === 'Section')
    .map((n) => String(n.props?.title ?? ''));

/** Render the mounted page with its initial async loads settled. */
async function renderMounted(h: { render: (props?: any) => any; effects: () => void }) {
  let tree = h.render({});
  h.effects();
  await settle();
  tree = h.render({});
  h.effects();
  await settle();
  tree = h.render({});
  const professionalTab = flatten(tree).find(n => n.props?.role === 'tab' && textOf(n) === 'Szakmai áttekintés');
  assert.equal(professionalTab?.props?.['aria-selected'], true, 'the professional summary is the new default');
  // Detailed evaluation feedback still belongs to the retained state view.
  // Select it via the real UI so every original feedback assertion stays active.
  clickLabel(tree, 'Állapotkép');
  return h.render({});
}

test('successful evaluation click shows a no-change result summary', async () => {
  const { h } = makeHarness();
  await renderMounted(h);

  let tree = h.render({});
  clickLabel(tree, 'Értékelés frissítése');
  tree = h.render({});
  assert.ok(textOf(tree).includes('Értékelés folyamatban…'), 'loading state is visible while the run is in flight');
  await settle();
  tree = h.render({});
  const text = textOf(tree);
  assert.ok(
    sectionTitles(tree).includes('Legutóbbi értékelés eredménye'),
    'result summary block renders',
  );
  assert.ok(text.includes('Nincs új változás'), 'no-change status label renders');
  assert.ok(
    text.includes('Az értékelés lefutott. Nincs új változás az előző értékelés óta.'),
    'explicit no-change message renders',
  );
  assert.ok(text.includes('Futtatás ideje'), 'run time is shown');
  assert.ok(text.includes('Kiértékelt terület'), 'evaluated count is shown');
  assert.ok(text.includes('Új megállapítás'), 'findings count is shown');
  assert.ok(text.includes('Érintett terület'), 'affected area count is shown');
  assert.ok(!text.includes('Értékelés folyamatban…'), 'loading state resolved after completion');
});

test('changed evaluation click summarises new records, findings and affected areas', async () => {
  const initial = workspaceFor({ areas: [demoArea()] });
  const after = workspaceFor({
    evaluatedAt: '2026-02-01T09:30:00.000Z',
    summary: { openFindings: 1 },
    areas: [demoArea({ outcome: 'APPLIES', evaluationAt: '2026-02-01T09:30:00.000Z' })],
  });
  const { h, setWorkspace } = makeHarness({
    initial,
    reconcile: async () => {
      setWorkspace(after);
      return { enrolled: true, evaluated: 2, snapshotsCreated: 1, snapshotsDeduplicated: 1, findingsCreated: 1 };
    },
  });
  await renderMounted(h);

  let tree = h.render({});
  clickLabel(tree, 'Értékelés frissítése');
  tree = h.render({});
  assert.ok(textOf(tree).includes('Értékelés folyamatban…'), 'loading state entered');
  await settle();
  tree = h.render({});
  const text = textOf(tree);
  assert.ok(text.includes('Új, ellenőrzést igénylő megállapítás: 1 db.'), 'new finding count is summarised');
  assert.ok(text.includes('Új értékelési rekord készült: 1 db.'), 'new record count is summarised');
  assert.ok(text.includes('Adatkezelési tájékoztató'), 'changed area is named');
  assert.ok(text.includes('Érintett területek'), 'affected area section is shown');
});

test('first evaluation with an empty previous workspace reports the baseline truthfully', async () => {
  const initial = workspaceFor({ summary: { evaluatedCount: 0 }, evaluatedAt: null, areas: [] });
  const after = workspaceFor({ evaluatedAt: '2026-02-01T09:30:00.000Z', areas: [demoArea({ outcome: 'APPLIES' })] });
  const { h, setWorkspace } = makeHarness({
    initial,
    reconcile: async () => {
      setWorkspace(after);
      return { enrolled: true, evaluated: 1, snapshotsCreated: 1, snapshotsDeduplicated: 0, findingsCreated: 1 };
    },
  });
  await renderMounted(h);

  let tree = h.render({});
  clickLabel(tree, 'Első megfelelőségi értékelés indítása');
  await settle();
  tree = h.render({});
  const text = textOf(tree);
  assert.ok(text.includes('Első értékelés lefutott'), 'baseline status label renders');
  assert.ok(text.includes('Ez az első értékelés ennél az ügyfélnél.'), 'baseline explanation renders');
  assert.ok(
    !text.includes('Nincs új változás az előző értékelés óta.'),
    'a first evaluation never claims "no change" against a non-existent baseline',
  );
});

test('failed evaluation clears the loading state and shows a safe error category', async () => {
  const { h } = makeHarness({
    reconcile: async () => Promise.reject(new TestApiError(500, 'Compliance reconciliation request failed.')),
  });
  await renderMounted(h);

  let tree = h.render({});
  clickLabel(tree, 'Értékelés frissítése');
  tree = h.render({});
  assert.ok(textOf(tree).includes('Értékelés folyamatban…'), 'loading state entered');
  await settle();
  tree = h.render({});
  const text = textOf(tree);
  assert.ok(!text.includes('Értékelés folyamatban…'), 'loading state resolved, never stuck');
  assert.ok(text.includes('Az értékelés szerverhiba miatt nem futott le.'), 'safe server-error category renders');
  assert.ok(!text.includes('Compliance reconciliation request failed.'), 'raw upstream error text is not exposed');
  assert.ok(
    !text.includes('Nincs új változás') && !text.includes('Első értékelés lefutott') && !text.includes('Új értékelési eredmény érkezett'),
    'no fabricated success status after failure',
  );
});

test('forbidden evaluation reports the permission category', async () => {
  const { h } = makeHarness({
    reconcile: async () => Promise.reject(new TestApiError(403, 'Actor cannot access this client.')),
  });
  await renderMounted(h);

  const tree = h.render({});
  clickLabel(tree, 'Értékelés frissítése');
  await settle();
  const text = textOf(h.render({}));
  assert.ok(
    text.includes('Az értékelés nem futtatható: nincs jogosultság ehhez az ügyfélhez.'),
    'permission reason category renders',
  );
  assert.ok(!text.includes('Actor cannot access this client.'), 'raw upstream error text is not exposed');
});

test('documents view preserves the extracted legal matrix section after an evaluation run', async () => {
  const { h } = makeHarness();
  await renderMounted(h);

  const documentsSection = (node: any) =>
    flatten(node).find((n) => typeof n?.type === 'function' && (n.type as any).name === 'DocumentsSection');
  let tree = h.render({});
  clickLabel(tree, 'Dokumentumok');
  tree = h.render({});
  assert.ok(documentsSection(tree), 'legal matrix documents section is present in the documents view');
  assert.equal(documentsSection(tree)?.props?.clientId, 'demo', 'documents section receives the client scope');

  clickLabel(tree, 'Értékelés frissítése');
  await settle();
  tree = h.render({});
  assert.ok(documentsSection(tree), 'legal matrix documents section stays mounted in the same view after the run');
  assert.equal(documentsSection(tree)?.props?.clientId, 'demo', 'documents section keeps the same client scope after the run');
});

test('no automatic non-compliance wording appears in the evaluation summary', async () => {
  const { h } = makeHarness();
  await renderMounted(h);

  let tree = h.render({});
  clickLabel(tree, 'Értékelés frissítése');
  await settle();
  tree = h.render({});
  const text = textOf(tree);
  assert.ok(
    !/nem felel meg|nem megfelelő|non-compliant|megsérti a jogszabályt/i.test(text),
    'no automatic non-compliance claim may appear from document references alone',
  );
  assert.ok(
    text.includes('jogi forrásokból önmagukban nem keletkezik meg nem felelés'),
    'the truthful human-review-safe statement is present after a run',
  );
});
