import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceHarness, flatten, textOf, settle } from './helpers/asyncRaceHarness';
import * as presentation from '../src/lib/complianceWorkbenchPresentation';

// UX-13: the internal Compliance Workbench must present canonical states in
// human-readable Hungarian, never leak raw internal identifiers as ordinary
// labels, never fall back to a raw owner id, and never invent a destination.

const file = 'src/components/clients/compliance/ComplianceWorkbench.tsx';

function row(overrides: Record<string, any> = {}) {
  return {
    id: 'r1', kind: 'MISSING_FACT', sourceId: 'src-1', clientId: 'A', caseId: null, subject: null,
    title: 'Teszt sor', status: 'APPLIES', since: null, dueAt: null, ownerId: null, ownerName: null,
    readOnly: false, reason: null, action: 'REQUIREMENTS', ...overrides,
  };
}

async function render(rows: any[]) {
  const model = { clientId: 'A', rows, generatedAt: '', truncated: {} };
  const h = createRaceHarness(file, 'ComplianceWorkbench', {
    '@/lib/complianceWorkbenchPresentation': presentation,
    '@/lib/complianceWorkbenchApi': { complianceWorkbenchApi: { get: async () => model } },
  });
  const props = { clientId: 'A', onNavigate() {}, onChanged() {} };
  h.commit(props);
  await settle();
  return h.commit(props);
}

const anchorsOf = (tree: any) => flatten(tree).filter((n) => n.type === 'a').map((n) => String(n.props?.href ?? ''));

// --- Pure mapping -----------------------------------------------------------

test('known canonical statuses map to human labels', () => {
  assert.equal(presentation.workbenchStatusLabel({ kind: 'SUBMISSION', status: 'SUBMITTED' }), 'Beküldve');
  assert.equal(presentation.workbenchStatusLabel({ kind: 'SUBMISSION', status: 'CORRECTION_REQUESTED' }), 'Javítás kérve');
  assert.equal(presentation.workbenchStatusLabel({ kind: 'STALE_EVIDENCE', status: 'UNDER_REVIEW' }), 'Felülvizsgálat alatt');
  assert.equal(presentation.workbenchStatusLabel({ kind: 'SOURCE_IMPACT', status: 'IMPACT_CONFIRMED' }), 'Hatás megerősítve');
  assert.equal(presentation.workbenchStatusLabel({ kind: 'MISSING_FACT', status: 'LEGAL_REVIEW_REQUIRED' }), 'Jogi felülvizsgálat szükséges');
  assert.equal(presentation.workbenchStatusLabel({ kind: 'PROPOSAL', status: 'PROPOSED' }), 'Javasolt');
});

test('composite canonical statuses are decomposed, not printed raw', () => {
  assert.equal(presentation.workbenchStatusLabel({ kind: 'STALE_EVIDENCE', status: 'STALE:PROVIDED' }), 'Lejárt · Szolgáltatva');
  assert.equal(presentation.workbenchStatusLabel({ kind: 'PROPOSAL', status: 'PROPOSED:PENDING' }), 'Javasolt · feladat: Függőben');
  assert.equal(presentation.workbenchStatusLabel({ kind: 'SOURCE_IMPACT', status: 'DECIDED:NO_ACTION' }), 'Döntés rögzítve · Nincs további teendő');
});

test('unknown status/decision/kind falls back to a neutral label, never the raw token', () => {
  assert.equal(presentation.workbenchStatusLabel({ kind: 'SUBMISSION', status: 'MYSTERY_STATE' }), presentation.UNKNOWN_WORKBENCH_STATUS);
  assert.equal(presentation.workbenchStatusLabel({ kind: 'SOURCE_IMPACT', status: 'DECIDED:SOMETHING_NEW' }), `Döntés rögzítve · ${presentation.UNKNOWN_WORKBENCH_STATUS}`);
  assert.equal(presentation.impactDecisionLabel('SOMETHING_NEW'), presentation.UNKNOWN_WORKBENCH_STATUS);
  assert.equal(presentation.workbenchKindLabel('SOMETHING_NEW'), 'Ismeretlen tételtípus');
});

// --- Rendered workbench -----------------------------------------------------

test('a known row.status is rendered as a human label, not the raw code', async () => {
  const tree = await render([row({ id: 'sub', kind: 'SUBMISSION', status: 'CORRECTION_REQUESTED', action: 'SUBMISSION_REVIEW', readOnly: true, reason: 'AWAITING_CUSTOMER_CORRECTION' })]);
  const text = textOf(tree);
  assert.match(text, /Javítás kérve/);
  assert.doesNotMatch(text, /CORRECTION_REQUESTED/);
});

test('an unknown status renders a safe explicit fallback, not the raw token', async () => {
  const tree = await render([row({ id: 'unknown', status: 'MYSTERY_STATE' })]);
  const text = textOf(tree);
  assert.match(text, /Ismeretlen állapot/);
  assert.doesNotMatch(text, /MYSTERY_STATE/);
});

test('a missing owner name never falls back to the raw owner id', async () => {
  const tree = await render([row({ id: 'prop', kind: 'PROPOSAL', status: 'PROPOSED', action: 'PROPOSAL_REVIEW', ownerId: 'person-secret-123', ownerName: null })]);
  const text = textOf(tree);
  assert.match(text, /nincs megjeleníthető név/);
  assert.doesNotMatch(text, /person-secret-123/);
});

test('opaque source identifiers are only exposed inside collapsed technical details', async () => {
  const source = { observationId: 'o1', legalSourceId: 'ls1', legalSourceVersionId: 'legal-version-secret', versionKey: 'VER-KEY-SECRET', sourceKey: 'SRC-KEY-SECRET', event: 'EVENT-SECRET', reviewedNote: 'Emberi indok', revision: 'rev', requirementVersions: [], proposals: [], decision: null };
  const tree = await render([row({ id: 'src', kind: 'SOURCE_IMPACT', status: 'IN_REVIEW', action: 'SOURCE_REVIEW', source })]);
  const text = textOf(tree);
  // traceability preserved ...
  assert.match(text, /SRC-KEY-SECRET/);
  assert.match(text, /legal-version-secret/);
  // ... but only under the technical details disclosure.
  const details = flatten(tree).find((n) => n.type === 'details');
  assert.ok(details, 'technical details disclosure rendered');
  const detailsText = textOf(details);
  assert.match(detailsText, /SRC-KEY-SECRET/);
  assert.match(detailsText, /VER-KEY-SECRET/);
  assert.match(detailsText, /legal-version-secret/);
  assert.match(detailsText, /EVENT-SECRET/);
  const article = flatten(tree).find((n) => n.type === 'article');
  const directChildren = Array.isArray(article?.props?.children) ? article.props.children : [article?.props?.children];
  const directParagraphs = directChildren.filter((c: any) => c?.type === 'p');
  assert.equal(
    directParagraphs.some((p: any) => textOf(p).includes('SRC-KEY-SECRET') || textOf(p).includes('EVENT-SECRET')),
    false,
    'raw identifiers are not an ordinary paragraph label',
  );
});

test('case rows link to the exact canonical case destination, never the customer portal', async () => {
  const tree = await render([row({ id: 'case', kind: 'PROPOSAL', status: 'PROPOSED', action: 'PROPOSAL_REVIEW', caseId: 'case-7' })]);
  const hrefs = anchorsOf(tree);
  assert.ok(hrefs.includes('/cases/case-7'), 'exact case destination used');
  assert.equal(hrefs.some((h) => h.includes('/client-portal')), false);
});

test('a recorded decision with a task id links to the exact task destination', async () => {
  const source = { observationId: 'o1', legalSourceId: 'ls1', legalSourceVersionId: 'v1', versionKey: 'V1', sourceKey: 'S1', event: 'ev', reviewedNote: null, revision: 'rev', requirementVersions: [], proposals: [], decision: { kind: 'REMEDIATION', note: 'Rendben', decidedAt: '2026-01-01T00:00:00.000Z', result: { caseId: 'case-7', taskId: 'task-9' } } };
  const tree = await render([row({ id: 'dec', kind: 'SOURCE_IMPACT', status: 'DECIDED:REMEDIATION', action: 'IMPACT_DECISION', source })]);
  const hrefs = anchorsOf(tree);
  assert.ok(hrefs.includes('/tasks?taskId=task-9'), 'exact task destination used');
  assert.ok(hrefs.includes('/cases/case-7'), 'exact case destination used');
  assert.match(textOf(tree), /Meglévő javaslatból ügy \/ feladat/);
  assert.doesNotMatch(textOf(tree), /DECIDED:REMEDIATION/);
});

test('a row with no exact destination does not invent one', async () => {
  const tree = await render([row({ id: 'none', kind: 'MISSING_FACT', status: 'APPLIES', action: 'REQUIREMENTS', caseId: null })]);
  assert.equal(anchorsOf(tree).length, 0);
});
