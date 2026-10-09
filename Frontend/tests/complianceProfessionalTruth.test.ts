import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRequirements, orderAttention, professionalAnswers, recordedDate, scopedWorkbench } from '../src/lib/complianceProfessionalTruth';
import type { Workbench, WorkbenchRow } from '../src/lib/complianceWorkbenchApi';
import type { ComplianceWorkspace, ComplianceWorkspaceArea } from '../src/lib/complianceWorkspaceApi';

const area = { applicabilityId: 'a1', requirementVersionId: 'rv1', requirementVersionKey: 'v1', ruleVersionKey: null, title: 'Adatvédelem', domainLabel: 'Adat', outcome: 'INSUFFICIENT_FACTS', usedFacts: [{ factKey: 'boolean', label: 'Válasz', value: 'false' }, { factKey: 'count', label: 'Létszám', value: '0' }], missingFacts: [{ factKey: 'missing', label: 'Tisztázandó', profileAnswerable: true }], citations: [], normativeStatement: null } as unknown as ComplianceWorkspaceArea;
const workspace = { areas: [area] } as ComplianceWorkspace;
const row = (id: string, input: Partial<WorkbenchRow> = {}): WorkbenchRow => ({ id, sourceId: id, clientId: 'a', kind: 'PROPOSAL', title: id, status: 'PROPOSED', dueAt: null, since: null, ownerId: null, readOnly: false, action: 'PROPOSAL_REVIEW', caseId: null, subject: null, reason: null, ...input });
const wb = (rows: WorkbenchRow[], clientId = 'a'): Workbench => ({ clientId, rows, generatedAt: '2026-10-09T12:00:00Z', acceptanceTargets: [], truncated: {} });
describe('professional compliance truth', () => {
  it('answers all 14 questions with recorded provenance or explicit unknown', () => {
    const answers = professionalAnswers('a', { status: 'READY', data: workspace }, { status: 'READY', data: wb([]) });
    assert.equal(answers.length, 14);
    assert.equal(new Set(answers.map(a => a.key)).size, 14);
    for (const answer of answers) if (answer.status === 'RECORDED') assert.ok(answer.entries.every(e => e.source.length > 0));
    assert.equal(answers.find(a => a.key === 'version')?.status, 'UNKNOWN');
    assert.match(JSON.stringify(answers.find(a => a.key === 'facts')), /false/);
    assert.match(JSON.stringify(answers.find(a => a.key === 'facts')), /Létszám: 0/);
  });
  it('rejects wrong client envelopes and drops mixed client rows', () => {
    assert.deepEqual(scopedWorkbench('a', { status: 'READY', data: wb([row('secret')], 'b') }), { status: 'ACCESS_LIMITED' });
    const answers = professionalAnswers('a', { status: 'UNKNOWN' }, { status: 'READY', data: wb([row('secret', { clientId: 'b' })]) });
    assert.doesNotMatch(JSON.stringify(answers), /secret/);
  });
  it('keeps access denial distinct from empty successful data', () => {
    const answers = professionalAnswers('a', { status: 'ACCESS_LIMITED' }, { status: 'ACCESS_LIMITED' });
    assert.equal(answers.find(a => a.key === 'applies')?.status, 'ACCESS_LIMITED');
    assert.equal(answers.find(a => a.key === 'owner')?.status, 'ACCESS_LIMITED');
    assert.ok(answers.every(a => a.entries.length === 0));
  });
  it('orders recorded attention deterministically without treating undated as today', () => {
    const rows = [row('unknown'), row('late', { dueAt: '2026-10-08T12:00:00Z' }), row('future', { dueAt: '2026-10-10T12:00:00Z' }), row('missing', { kind: 'MISSING_FACT' }), row('source', { kind: 'SOURCE_IMPACT' }), row('done', { status: 'CONFIRMED:COMPLETED' }), row('cancel', { status: 'CONFIRMED:CANCELLED' }), row('decided', { status: 'DECIDED:NO_ACTION' })];
    assert.deepEqual(orderAttention(rows, new Date('2026-10-09T12:00:00Z')).map(r => r.id), ['late', 'source', 'missing', 'future', 'unknown']);
    assert.equal(rows.length, 8, 'source array preserved');
  });
  it('keeps unknown owner and invalid date explicit', () => {
    const answers = professionalAnswers('a', { status: 'UNKNOWN' }, { status: 'READY', data: wb([row('task')]) });
    assert.match(answers.find(a => a.key === 'owner')!.entries[0].text, /Nincs rögzítve/);
    assert.match(answers.find(a => a.key === 'due')!.entries[0].text, /Nincs rögzítve/);
    assert.equal(recordedDate('invalid'), 'Nincs rögzítve');
    assert.equal(recordedDate(null), 'Nincs rögzítve');
    assert.match(recordedDate('2026-10-08T23:30:00Z'), /09/);
  });
  it('excludes legacy DONE task state from next-action owners and attention', () => {
    const done = row('legacy-done', { status: 'CONFIRMED:DONE', ownerId: 'owner-a' });
    assert.deepEqual(orderAttention([done], new Date()), []);
    const answers = professionalAnswers('a', { status: 'UNKNOWN' }, { status: 'READY', data: wb([done]) });
    assert.equal(answers.find(a => a.key === 'owner')!.entries.length, 0);
    assert.equal(answers.find(a => a.key === 'due')!.entries.length, 0);
  });
  it('filters only recorded metadata without inferring applicability', () => {
    assert.equal(filterRequirements([area], 'Adat', 'INSUFFICIENT_FACTS', 'adat').length, 1);
    assert.equal(filterRequirements([area], 'Más', '', '').length, 0);
    assert.equal(filterRequirements([area], '', 'APPLIES', '').length, 0);
    assert.equal(area.outcome, 'INSUFFICIENT_FACTS');
  });
  it('preserves distinct exact identities for identical requirement titles', () => {
    const answers = professionalAnswers('a', { status: 'READY', data: { ...workspace, areas: [area, { ...area, applicabilityId: 'a2', requirementVersionId: 'rv2' }] } }, { status: 'UNKNOWN' });
    assert.equal(answers[0].entries.length, 2);
    assert.match(answers[0].entries[0].source, /rv1/);
    assert.match(answers[0].entries[1].source, /rv2/);
  });
});
