import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRaceHarness, deferred, settle, flatten, textOf } from './helpers/asyncRaceHarness';
import * as presentation from '../src/lib/complianceWorkbenchPresentation';
const file = 'src/components/clients/compliance/ComplianceWorkbench.tsx';
const source = { legalSourceVersionId: 'exact-v1', sourceKey: 'source', versionKey: 'V1', revision: 'a'.repeat(64), event: 'amendment', reviewedNote: 'Human reviewed', requirementVersions: [{ id: 'r1', title: 'Requirement' }], proposals: [{ id: 'p1', title: 'Remediation proposal' }], decision: null };
const row = { id: 'SOURCE_IMPACT:o1', kind: 'SOURCE_IMPACT', sourceId: 'o1', clientId: 'A', title: 'Source title', status: 'IMPACT_CONFIRMED', action: 'IMPACT_DECISION', readOnly: false, source };
const model = (clientId: string, rows: any[] = []) => ({ clientId, rows, generatedAt: '', truncated: {} });
const nodes = (tree: any, type: string) => flatten(tree).filter(n => n.type === type);

test('client-scoped workbench discards late previous-client responses', async () => {
  const a = deferred<any>(), b = deferred<any>();
  const h = createRaceHarness(file, 'ComplianceWorkbench', { '@/lib/complianceWorkbenchPresentation': presentation, '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { get: (id: string) => id === 'A' ? a.promise : b.promise } } });
  const props = { onNavigate() {}, onChanged() {} };
  h.commit({ ...props, clientId: 'A' }); h.commit({ ...props, clientId: 'B' });
  b.resolve(model('B', [{ ...row, clientId: 'B', title: 'B source' }])); await settle();
  assert.match(textOf(h.commit({ ...props, clientId: 'B' })), /B source/);
  a.resolve(model('A', [{ ...row, title: 'A secret' }])); await settle();
  assert.doesNotMatch(textOf(h.commit({ ...props, clientId: 'B' })), /A secret/);
});

test('impact form requires reason and sends explicit choice with exact source revision', async () => {
  const calls: any[] = [];
  const h = createRaceHarness(file, 'ImpactDecision', { '@/lib/complianceWorkbenchPresentation': presentation, '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { decide: async (...args: any[]) => calls.push(args) } } });
  const props = { row, busy: false, run: async (fn: any) => fn() };
  let tree = h.commit(props);
  assert.equal(nodes(tree, 'button')[0].props.disabled, true);
  nodes(tree, 'textarea')[0].props.onChange({ target: { value: 'Reviewed; no action.' } });
  tree = h.commit(props);
  nodes(tree, 'form')[0].props.onSubmit({ preventDefault() {} }); await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['A', 'o1', { sourceRevision: source.revision, kind: 'NO_ACTION', note: 'Reviewed; no action.' }]);
});

test('remediation sends only an explicitly selected existing proposal', async () => {
  const calls: any[] = [];
  const h = createRaceHarness(file, 'ImpactDecision', { '@/lib/complianceWorkbenchPresentation': presentation, '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { decide: async (...args: any[]) => calls.push(args) } } });
  const props = { row, busy: false, run: async (fn: any) => fn() };
  nodes(h.commit(props), 'select')[0].props.onChange({ target: { value: 'REMEDIATION' } });
  let tree = h.commit(props);
  nodes(tree, 'select')[1].props.onChange({ target: { value: 'p1' } });
  nodes(tree, 'textarea')[0].props.onChange({ target: { value: 'Remediation approved for this impact.' } });
  tree = h.commit(props); nodes(tree, 'form')[0].props.onSubmit({ preventDefault() {} }); await settle();
  assert.equal(calls[0][2].proposalId, 'p1'); assert.equal(calls[0][2].kind, 'REMEDIATION');
});

test('recorded decisions and pending customer correction are read-only', async () => {
  const h = createRaceHarness(file, 'ComplianceWorkbench', { '@/lib/complianceWorkbenchPresentation': presentation, '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { get: async () => model('A', [{ ...row, readOnly: true, reason: 'DECISION_RECORDED', source: { ...source, decision: { kind: 'NO_ACTION', note: 'Done' } } }, { ...row, id: 's', kind: 'SUBMISSION', source: undefined, action: 'SUBMISSION_REVIEW', readOnly: true, reason: 'AWAITING_CUSTOMER_CORRECTION' }]) } } });
  const props = { clientId: 'A', onNavigate() {}, onChanged() {} }; h.commit(props); await settle();
  const tree = h.commit(props);
  assert.match(textOf(tree), /Csak olvasható/); assert.match(textOf(tree), /Ügyféljavításra vár/);
  assert.equal(flatten(tree).some(n => n.type?.name === 'ImpactDecision' || n.type?.name === 'SubmissionDecision'), false);
});

test('failed workbench request is not presented as an empty or successful list', async () => {
  const h = createRaceHarness(file, 'ComplianceWorkbench', { '@/lib/complianceWorkbenchPresentation': presentation, '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { get: async () => { throw new Error('403'); } } } });
  const props = { clientId: 'A', onNavigate() {}, onChanged() {} }; h.commit(props); await settle();
  const tree = h.commit(props);
  assert.ok(flatten(tree).some(n => n.props?.role === 'alert'));
  assert.doesNotMatch(textOf(tree), /Nincs rögzített döntési teendő/);
});

test('missing-fact CTA passes exact applicability and fact identity without mutating', async () => {
  const navigations: any[] = [];
  const target = { applicabilityId: 'app-a', factKey: 'fact-a' };
  const missingRow = { ...row, id: 'missing-a', kind: 'MISSING_FACT', source: undefined, action: 'REQUIREMENTS', target, title: 'Requirement — További vállalati adat szükséges' };
  const h = createRaceHarness(file, 'ComplianceWorkbench', { '@/lib/complianceWorkbenchPresentation': presentation, '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { get: async () => model('A', [missingRow]) } } });
  const props = { clientId: 'A', onNavigate: (...args: any[]) => navigations.push(args), onChanged() {} };
  h.commit(props); await settle();
  const tree = h.commit(props);
  nodes(tree, 'button').find(n => textOf(n) === 'Követelmény és adatbekérés megnyitása')!.props.onClick();
  assert.deepEqual(navigations, [['requirements', target]]);
  assert.doesNotMatch(textOf(tree), /fact-a|app-a/);
});

test('missing-fact CTA rejects a cross-client row and a targetless row', async () => {
  const navigations: any[] = [];
  const rows = [
    { ...row, id: 'cross', kind: 'MISSING_FACT', source: undefined, action: 'REQUIREMENTS', target: { applicabilityId: 'other-app', factKey: 'secret-fact' }, clientId: 'B' },
    { ...row, id: 'targetless', kind: 'MISSING_FACT', source: undefined, action: 'REQUIREMENTS', target: undefined },
  ];
  const h = createRaceHarness(file, 'ComplianceWorkbench', { '@/lib/complianceWorkbenchPresentation': presentation, '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { get: async () => model('A', rows) } } });
  const props = { clientId: 'A', onNavigate: (...args: any[]) => navigations.push(args), onChanged() {} };
  h.commit(props); await settle();
  const tree = h.commit(props);
  for (const button of nodes(tree, 'button').filter(n => textOf(n) === 'Követelmény és adatbekérés megnyitása')) button.props.onClick();
  assert.deepEqual(navigations, []);
  assert.ok(flatten(h.commit(props)).some(n => n.props?.role === 'alert'));
});

test('internal client page mounts the workbench without changing customer Compliance', () => {
  const page = readFileSync('src/app/clients/[clientId]/compliance/page.tsx', 'utf8');
  assert.match(page, /ComplianceWorkbench key=\{client.id\}/);
  assert.doesNotMatch(readFileSync('src/components/client-portal/OrgComplianceView.tsx', 'utf8'), /ComplianceWorkbench/);
});
test('submission fact acceptance sends explicit typed value, source field and revision to canonical command', async () => {
  const calls: any[] = [];
  const h = createRaceHarness(file, 'SubmissionDecision', { '@/lib/api': { fetchApi: async (path: string, options: any) => {
    if (options.method === 'POST') { calls.push({ path, body: JSON.parse(options.body) }); return {}; }
    return { revision: 7, status: 'SUBMITTED', files: [], fields: [{ id: 'answer', labelSnapshot: 'Has employees', valueSafe: 'No' }] };
  } } });
  const props = { row: { ...row, sourceId: 's1', action: 'SUBMISSION_REVIEW' }, busy: false, run: async (fn: any) => fn(), targets: [{ id: 'definition', key: 'has_employees', valueType: 'BOOLEAN' }] };
  nodes(h.commit(props), 'button')[0].props.onClick(); await settle();
  let tree = h.commit(props);
  nodes(tree, 'textarea')[0].props.onChange({ target: { value: 'Reviewed the customer answer.' } });
  nodes(tree, 'select')[1].props.onChange({ target: { value: 'answer' } });
  nodes(tree, 'select')[2].props.onChange({ target: { value: 'definition' } });
  tree = h.commit(props);
  nodes(tree, 'select')[3].props.onChange({ target: { value: 'false' } });
  nodes(tree, 'input').find(n => n.props.type === 'date')!.props.onChange({ target: { value: '2026-01-01' } });
  tree = h.commit(props);
  const accept = nodes(tree, 'button').find(n => textOf(n) === 'Elfogadás ellenőrzött tényként')!;
  assert.equal(accept.props.disabled, false); accept.props.onClick(); await settle();
  assert.deepEqual(calls, [{ path: '/internal/client-interaction/submissions/s1/accept-compliance', body: { outcome: 'ACCEPT_FACT', expectedRevision: 7, reason: 'Reviewed the customer answer.', fieldId: 'answer', factDefinitionId: 'definition', fact: { scopeType: 'COMPANY', validFrom: '2026-01-01T00:00:00.000Z', booleanValue: false } } }]);
});
