import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const PAGE = 'src/app/clients/[clientId]/compliance/page.tsx';

describe('Single-client compliance professional workspace (structural)', () => {
  const page = () => read(PAGE);

  it('organizes the module into the five target tabs, state-first', () => {
    const src = page();
    // Exact tab labels in order: state-first, then requirements, documents,
    // evidence/controls, findings/remediation.
    assert.match(src, /status: "Állapotkép"/);
    assert.match(src, /requirements: "Követelmények"/);
    assert.match(src, /documents: "Dokumentumok"/);
    assert.match(src, /controls: "Bizonyítékok és kontrollok"/);
    assert.match(src, /findings: "Megállapítások és intézkedések"/);
    assert.match(src, /type ComplianceView = "status" \| "requirements" \| "documents" \| "controls" \| "findings"/);
    // One primary action per context: the reconciliation button stays on Állapotkép.
    assert.match(src, /view === "status"/);
    assert.match(src, /Első megfelelőségi értékelés indítása/);
  });

  it('keeps requirements in a progressive-disclosure worklist, not a wall of cards', () => {
    const src = page();
    assert.match(src, /WorkspaceAreaRow/);
    assert.match(src, /aria-expanded=\{open\}/);
    assert.match(src, /Előírt követelmény:/);
    assert.match(src, /Jogi források/);
    assert.match(src, /complianceOutcomeClass/);
  });

  it('surfaces a single customer-request primary action that reuses the canonical composer', () => {
    const src = page();
    assert.match(src, /ClientRequestComposer/);
    assert.match(src, /cases=\{clientCases\}/);
    assert.match(src, /getCases\(1, 100, undefined, clientId\)/);
    // No new messaging subsystem: the canonical client-portal composer is reused.
    assert.doesNotMatch(src, /new ClientRequestComposer/);
  });

  it('never fabricates a compliance score or percentage anywhere in the module', () => {
    const src = page();
    assert.doesNotMatch(src, /complianceScore|riskScore|confidence|completionPercent|százalékos/);
    assert.doesNotMatch(src, /Megfelelőségi pontszám|megfelelőségi százalék/);
  });

  it('keeps every section behind the canonical organization capability gate', () => {
    const src = page();
    assert.match(src, /listAdminWorkspaces/);
    assert.match(src, /organizationMode/);
    assert.match(src, /ORGANIZATION/);
    assert.match(src, /CASE_RELAY/);
  });
});
