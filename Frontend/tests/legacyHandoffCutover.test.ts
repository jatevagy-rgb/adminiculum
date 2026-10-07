import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRaceHarness, deferred, flatten, settle, textOf } from './helpers/asyncRaceHarness';

const panelPath = 'src/components/handoff/HandoffPackagePanel.tsx';
const read = (file: string) => readFileSync(file, 'utf8');
const props = { caseId: 'case-a', mode: 'legacy-continuation' };
const record = (status = 'DRAFT') => ({
  id: 'legacy-package', caseId: 'case-a', status, packageType: 'FINAL_APPROVAL',
  sourceDocumentId: 'source-document', anonymizedDocumentId: 'anonymous-artifact',
  generatedContractId: 'generated-contract', legalAnalysisId: 'legal-analysis',
  reviewNotesId: 'structured-review-notes', preparerSummary: 'Preserved preparation evidence',
  preparedById: 'preparer', submittedAt: '2026-07-01T10:00:00.000Z',
  reviewedById: 'reviewer', reviewedAt: '2026-07-02T10:00:00.000Z',
  reviewDecision: 'REJECTED_BLOCKING', reviewComment: 'Preserved reviewer evidence',
  createdAt: '2026-06-30T10:00:00.000Z', updatedAt: '2026-07-02T11:00:00.000Z',
});

class ApiError extends Error {
  constructor(public status: number, public code = '') { super('Synthetic API failure'); }
}

function harness(user = { id: 'preparer', role: 'TRAINEE' }) {
  const reads: Array<{ caseId: string; includeArchived: boolean; result: ReturnType<typeof deferred> }> = [];
  const writes: Array<{ id: string; payload: any }> = [];
  const decisions: Array<{ id: string; payload: any }> = [];
  const h = createRaceHarness(panelPath, 'HandoffPackagePanel', {
    '@/lib/api': {
      ApiError,
      listCaseHandoffPackages: (caseId: string, options: { includeArchived: boolean }) => {
        const result = deferred();
        reads.push({ caseId, includeArchived: options.includeArchived, result });
        return result.promise;
      },
      getCurrentUser: async () => user,
      getCaseResponsibility: async () => ({ responsibleLawyer: { id: 'reviewer' } }),
      updateHandoffPackage: async (id: string, payload: any) => {
        writes.push({ id, payload });
        return { ...record(), ...payload };
      },
      reviewHandoffPackage: async (id: string, payload: any) => {
        decisions.push({ id, payload });
        return { ...record('APPROVED'), reviewDecision: payload.decision, reviewComment: payload.reviewComment };
      },
    },
  });
  return { h, reads, writes, decisions };
}

const buttons = (tree: any) => flatten(tree).filter((node) => node.type === 'button');

test('document and comparison surfaces have no legacy writer and retain explicit canonical navigation', () => {
  const document = read('src/app/cases/[caseId]/documents/page.tsx');
  const compare = read('src/app/documents/compare/page.tsx');
  for (const source of [document, compare]) {
    assert.doesNotMatch(source, /HandoffPackagePanel|createCaseHandoffPackage|handleCreateHandoffPackage/);
    assert.match(source, /#ck-tasks/);
    assert.match(source, /Korábbi leadások/);
  }
  assert.match(document, /id="document-task-submission" tabIndex=\{-1\}/);
  assert.match(document, /href="#document-task-submission"/);
  assert.match(document, /<WordDocumentWorkspaceHeader/);
  assert.match(document, /versionId=\{canonicalActiveVersion\?\.id \?\? null\}/);
  assert.match(compare, /reviewHandoffDraft\.trim\(\) \|\| generatedReviewHandoffText/);
  assert.match(compare, /navigator\.clipboard\.writeText\(handoffText\)/);
});

test('direct route is a guarded compatibility bridge without task invention or automatic mutations', () => {
  const source = read('src/app/cases/[caseId]/handoff/page.tsx');
  assert.match(source, /mode="legacy-continuation"/);
  assert.match(source, /key=\{caseId\}/);
  assert.match(source, /!isLoading && !error && caseInfo/);
  assert.match(source, /role="alert"/);
  assert.match(source, /#ck-tasks/);
  assert.doesNotMatch(source, /createTask|createCaseHandoffPackage|createTaskSubmission|taskId=/);
  assert.doesNotMatch(read(panelPath), /createCaseHandoffPackage|handleCreateDraft|Mentés piszkozatként/);
});

test('history opts into archived reads and renders every persisted evidence field without actions on archived records', async () => {
  const { h, reads } = harness();
  h.commit(props);
  assert.equal(reads[0].includeArchived, true);
  reads[0].result.resolve([record('ARCHIVED')]);
  await settle();
  const tree = h.render(props);
  const text = textOf(tree);
  for (const [key, value] of Object.entries(record('ARCHIVED')).filter(([key]) => !['status', 'packageType', 'reviewDecision'].includes(key))) {
    assert.ok(text.includes(value), `Historical evidence missing: ${key}`);
  }
  assert.match(text, /Végleges jóváhagyás/);
  assert.match(text, /Visszaküldve blokkoló okkal/);
  assert.equal(flatten(tree).find((node) => node.props?.['data-testid'] === 'legacy-handoff-record').props['data-status'], 'ARCHIVED');
  assert.equal(buttons(tree).length, 0);
});

test('loading, empty, denial and service failure never masquerade as one another', async () => {
  for (const outcome of ['empty', 'denied', 'unavailable', 'error']) {
    const { h, reads } = harness();
    const loading = h.commit(props);
    assert.match(textOf(loading), /betöltése/);
    assert.doesNotMatch(textOf(loading), /Nincs korábbi/);
    if (outcome === 'empty') reads[0].result.resolve([]);
    else reads[0].result.reject(new ApiError(outcome === 'denied' ? 403 : outcome === 'unavailable' ? 501 : 500));
    await settle();
    const tree = h.render(props);
    if (outcome === 'empty') {
      assert.match(textOf(tree), /Nincs korábbi Leadás/);
      assert.match(textOf(tree), /ügy feladatai/);
      assert.equal(buttons(tree).length, 0);
    } else {
      assert.doesNotMatch(textOf(tree), /Nincs korábbi Leadás/);
      assert.ok(flatten(tree).some((node) => node.props?.role === 'alert'));
    }
  }
});

test('existing preparer can submit only the selected persisted package ID', async () => {
  const { h, reads, writes } = harness();
  h.commit(props);
  reads[0].result.resolve([record()]);
  await settle();
  const button = buttons(h.render(props)).find((node) => textOf(node) === 'Beküldés ügyvédi review-ra');
  assert.ok(button && !button.props.disabled);
  await button.props.onClick();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 'legacy-package');
  assert.equal(writes[0].payload.status, 'SUBMITTED');
  assert.equal('taskId' in writes[0].payload, false);
});

test('authorized legacy summary editing remains available for all nonarchived statuses', async () => {
  for (const status of ['DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED']) {
    const { h, reads, writes } = harness();
    h.commit(props);
    reads[0].result.resolve([record(status)]);
    await settle();
    buttons(h.render(props)).find((node) => textOf(node) === 'Szerkesztés').props.onClick();
    const input = flatten(h.render(props)).find((node) => node.props?.id === 'handoff-summary-legacy-package');
    input.props.onChange({ target: { value: 'Corrected existing summary' } });
    await buttons(h.render(props)).find((node) => textOf(node) === 'Mentés').props.onClick();
    assert.equal(writes[0].id, 'legacy-package');
    assert.equal(writes[0].payload.preparerSummary, 'Corrected existing summary');
    assert.equal('status' in writes[0].payload, false);
    assert.equal('taskId' in writes[0].payload, false);
  }
});

test('non-owner cannot edit or archive and preparer cannot self-review', async () => {
  for (const user of [{ id: 'unrelated', role: 'LAWYER' }, { id: 'preparer', role: 'TRAINEE' }]) {
    const { h, reads } = harness(user);
    h.commit(props);
    reads[0].result.resolve([record('SUBMITTED')]);
    await settle();
    const labels = buttons(h.render(props)).map(textOf);
    assert.equal(labels.includes('Ügyvédi döntés'), false);
    if (user.id === 'unrelated') assert.equal(labels.includes('Archiválás'), false);
  }
});

test('existing authorized reviewer decision keeps original package identity', async () => {
  const { h, reads, decisions } = harness({ id: 'reviewer', role: 'LAWYER' });
  h.commit(props);
  reads[0].result.resolve([record('SUBMITTED')]);
  await settle();
  buttons(h.render(props)).find((node) => textOf(node) === 'Ügyvédi döntés').props.onClick();
  const approve = buttons(h.render(props)).find((node) => textOf(node) === 'Jóváhagyás');
  await approve.props.onClick();
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].id, 'legacy-package');
  assert.equal(decisions[0].payload.decision, 'APPROVED');
  assert.equal('taskId' in decisions[0].payload, false);
});

test('late history response cannot replace a different case history', async () => {
  const { h, reads } = harness();
  h.commit(props);
  const next = { ...props, caseId: 'case-b' };
  h.commit(next);
  reads[1].result.resolve([]);
  await settle();
  reads[0].result.resolve([record('ARCHIVED')]);
  await settle();
  assert.doesNotMatch(textOf(h.render(next)), /legacy-package/);
});

test('archive requires human confirmation and retains the returned archived record', () => {
  const source = read(panelPath);
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /if \(!confirmed\) return;/);
  assert.match(source, /megváltoztathatja az ügy lezárhatóságát/);
  assert.match(source, /const archived = await archiveHandoffPackage\(pkg\.id\)/);
  assert.match(source, /item\.id === pkg\.id \? archived : item/);
  assert.match(source, /canWrite && pkg\.status !== "ARCHIVED"/);
  assert.doesNotMatch(source, /prev\.filter\(\(item\) => item\.id !== pkg\.id\)/);
});
