import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('7B workforce proposal surface', () => {
  it('uses the canonical action registry and proposal routes', () => {
    const api = read('src/lib/complianceProposalApi.ts');
    const component = read('src/components/clients/compliance/ComplianceOverview.tsx');
    for (const intent of ['REMEDIATE_COMPLIANCE_GAP', 'DISCLOSE_REQUIREMENT', 'UPDATE_DOCUMENTATION', 'IMPLEMENT_CONTROL', 'REVIEW_APPLICABILITY', 'ADDRESS_OPEN_MATTER']) assert.match(api, new RegExp(intent));
    assert.match(api, /\/compliance\/proposals/);
    assert.match(component, /Megerősítés/);
    assert.match(component, /Elutasítás/);
    assert.match(component, /Szerkesztés/);
    assert.match(component, /updateComplianceProposal/);
    assert.match(component, /Ügy hozzárendelése/);
  });

  it('requires a case before confirmation and hands new cases to normal intake', () => {
    const component = read('src/components/clients/compliance/ComplianceOverview.tsx');
    assert.match(component, /disabled=\{busy \|\| !proposal\.case\}/);
    assert.match(component, /\/cases\?newCase=1&clientId=/);
    assert.doesNotMatch(component, /\/api\/v1\/client-portal/);
  });

  it('keeps terminal proposals read-only and preserves the normal Task link', () => {
    const component = read('src/components/clients/compliance/ComplianceOverview.tsx');
    assert.match(component, /proposal\.status === 'PROPOSED'/);
    assert.match(component, /proposal\.taskId/);
    assert.match(component, /proposalStatusLabels/);
    assert.doesNotMatch(component, /proposal\.status === 'STALE'[\s\S]*Megerősítés/);
    assert.doesNotMatch(component, /proposal\.status === 'REJECTED'[\s\S]*Szerkesztés/);
  });

  it('guards create and mutation actions with one shared busy state', () => {
    const component = read('src/components/clients/compliance/ComplianceOverview.tsx');
    assert.match(component, /setBusy\(true\)/);
    assert.match(component, /disabled=\{busy \|\| !form\.findingId\}/);
    assert.match(component, /disabled=\{busy\}/);
  });
});
