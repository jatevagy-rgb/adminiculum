import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceBasisCategory, evidenceBasisExplanationHu, sourceBasisLabelHu, type GrowEvidenceItem, type GrowSourceBasis } from '../src/lib/growApi';
import * as diagnosticPresentation from '../src/lib/diagnosticWorkbenchApi';
import { createRaceHarness, textOf } from './helpers/asyncRaceHarness';

const evidence = (sourceBasis?: GrowSourceBasis | null) => ({ kind: 'INTERNAL_MEASUREMENT', evidenceType: 'INTERNAL_MEASUREMENT', origin: 'CLIENT_INTERNAL', strength: 'STRONG', sourceBasis } as GrowEvidenceItem);

test('source basis overrides legacy measurement kind and strong evidence', () => {
  assert.equal(evidenceBasisCategory(evidence('ESTIMATED')), 'ESTIMATED_COMPANY');
  assert.equal(evidenceBasisCategory(evidence('DERIVED')), 'DERIVED_COMPANY');
  assert.equal(evidenceBasisCategory(evidence('DECLARED')), 'DECLARED_COMPANY');
  assert.equal(evidenceBasisCategory(evidence('EXTERNAL')), 'RESEARCH');
  assert.equal(evidenceBasisCategory(evidence('MEASURED')), 'MEASURED_COMPANY');
  assert.equal(evidenceBasisCategory(evidence()), 'UNKNOWN_COMPANY');
  assert.equal(evidenceBasisCategory(evidence(null)), 'UNKNOWN_COMPANY');
  assert.equal(evidenceBasisCategory({ ...evidence('MEASURED'), origin: 'ONLINE_VERIFIED' }), 'RESEARCH');
  assert.equal(evidenceBasisCategory({ ...evidence('MEASURED'), origin: null }), 'UNKNOWN_COMPANY');
});

test('five source bases remain distinct and estimates explain non-measurement', () => {
  const bases: GrowSourceBasis[] = ['DECLARED', 'ESTIMATED', 'DERIVED', 'MEASURED', 'EXTERNAL'];
  assert.equal(new Set(bases.map(sourceBasisLabelHu)).size, 5);
  assert.match(sourceBasisLabelHu(undefined), /nem igazolt/);
  assert.match(evidenceBasisExplanationHu('ESTIMATED_COMPANY'), /nem teszi empirikus méréssé/);
  assert.match(evidenceBasisExplanationHu('DERIVED_COMPANY'), /nem empirikus/);
});

test('primary diagnostic evidence consumer visibly distinguishes linked estimates and external sources', () => {
  const harness = createRaceHarness('src/components/clients/diagnostic-workbench/EvidenceSufficiencyPanel.tsx', 'EvidenceSufficiencyPanel', {
    '@/lib/growApi': { sourceBasisLabelHu },
    '@/lib/diagnosticWorkbenchApi': diagnosticPresentation,
  });
  const item = { id: 'estimated', title: 'Folyamatpillanatkép', sourceBasis: 'ESTIMATED', kind: 'INTERNAL_OBSERVATION', origin: 'CLIENT_INTERNAL', boundedClaim: null, verificationStatus: 'VERIFIED', strength: 'MODERATE', domainKeys: [] };
  const tree = harness.render({
    evidence: { records: [], research: [item, { ...item, id: 'external', sourceBasis: 'EXTERNAL', origin: 'ACADEMIC' }] },
    missing: { hasUnknownFacts: false, hasConflictingEvidence: false, insufficientRecommendationCount: 0, unresolvedItems: [] },
    sufficiency: [], diagnoses: [{ evidence: [{ id: 'estimated' }] }], recommendations: [],
  });
  const text = textOf(tree);
  assert.match(text, /Becslésen alapuló adat/);
  assert.match(text, /Külső kutatási forrás/);
  assert.doesNotMatch(text, /Mért működési megfigyelés/);
  harness.unmount();
});
