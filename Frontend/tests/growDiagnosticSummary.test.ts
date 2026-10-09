import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { DiagnosticWorkbenchDto } from '../src/lib/diagnosticWorkbenchApi';
import { growDiagnosticSummary } from '../src/lib/growDiagnosticSummary';

const empty: DiagnosticWorkbenchDto = {
  client: { id: 'client-a', name: 'Ügyfél A', operatingProfile: null },
  known: { facts: [], processes: [], systems: [] },
  observed: { observations: [], processSnapshots: [] },
  problems: { domains: [], diagnoses: [], sufficiency: [] },
  proposed: { recommendations: [] },
  evidence: { records: [], research: [] },
  missing: { hasUnknownFacts: false, hasConflictingEvidence: false, insufficientRecommendationCount: 0, unresolvedItems: [] },
};

test('six primary answers remain honest in an empty workforce diagnostic', () => {
  const rows = growDiagnosticSummary(empty);
  assert.deepEqual(rows.map((row) => row.question), [
    'Mit tudunk?', 'Mi az ügyfél jelzése?', 'Mit támaszt alá működési adat?',
    'Mi bizonytalan?', 'Mi a következő szakmai ellenőrzés?', 'Mi a következő emberi döntés?',
  ]);
  assert.match(rows[0].answer, /Nincs ellenőrzött/);
  assert.match(rows[1].answer, /nem következik, hogy az ügyfélnek nincs problémája/);
  assert.match(rows[2].answer, /Nem állítunk mért működési eredményt/);
  assert.match(rows[3].answer, /nem bizonyítja az adatok teljes elégségességét/);
  assert.match(rows[5].answer, /Nincs új, emberi felülvizsgálatra váró/);
});

test('declared, estimated and measured data stay distinct; only real pending review needs a decision', () => {
  const data: DiagnosticWorkbenchDto = {
    ...empty,
    known: { ...empty.known, facts: [{ id: 'fact', provenanceClass: 'CANONICAL_STATE', type: 'COUNT', value: '10', factDefinition: null,
      scopeType: null, factSubjectId: null, verificationStatus: 'VERIFIED', determinationMethod: null,
      observedAt: null, effectiveAt: null, validFrom: '2026-01-01', validTo: null, supersededAt: null }] },
    observed: { observations: [{ id: 'declared', provenanceClass: 'DECLARED_OBSERVATION', observationType: 'SURVEY',
      observedAt: '2026-01-01', createdAt: '2026-01-01', sourceRecordId: 'internal-id', inputDigest: 'internal-hash',
      source: { id: 'source', sourceType: 'CUSTOMER', name: 'Felmérés' }, discoveryRun: null }],
      processSnapshots: [
        { id: 'measured', provenanceClass: 'MEASURED_SNAPSHOT', sourceBasis: 'MEASURED',
          metricSourceBasis: [{ code: 'TOTAL_WAITING_MINUTES', sourceBasis: 'MEASURED', sourceFields: [] }],
          businessProcess: { id: 'process', name: 'Ügyintézés' }, metricVersion: '1', observedAt: '2026-01-01',
          inputDigest: 'digest', snapshotDigest: 'digest', metrics: [{ code: 'TOTAL_WAITING_MINUTES', value: 12, unit: 'MINUTES', metricVersion: '1' }], provenance: null },
        { id: 'mixed', provenanceClass: 'MEASURED_SNAPSHOT', sourceBasis: 'MEASURED',
          metricSourceBasis: [{ code: 'TOTAL_ACTIVE_MINUTES', sourceBasis: 'ESTIMATED', sourceFields: [] }],
          businessProcess: { id: 'other', name: 'Művelet' }, metricVersion: '1', observedAt: '2026-01-01',
          inputDigest: 'digest', snapshotDigest: 'digest', metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 4, unit: 'MINUTES', metricVersion: '1' }], provenance: null },
      ] },
    missing: { hasUnknownFacts: true, hasConflictingEvidence: true, insufficientRecommendationCount: 0, unresolvedItems: [] },
    problems: { ...empty.problems, sufficiency: [{ recommendationId: 'rec', provenanceClass: 'RECOMMENDATION', decision: 'NEEDS_MORE_DATA', evidenceCount: 0 }] },
    proposed: { recommendations: [
      { id: 'r1', provenanceClass: 'RECOMMENDATION', title: 'Vizsgálat', problemStatement: '', direction: '', kind: 'QUICK_FIX',
        impactTags: [], interventionCodes: [], status: 'PENDING_REVIEW', sufficiency: 'NEEDS_MORE_DATA', diagnosisId: null,
        domain: null, businessProcess: null, evidence: [] },
      { id: 'r2', provenanceClass: 'RECOMMENDATION', title: 'Korábbi', problemStatement: '', direction: '', kind: 'QUICK_FIX',
        impactTags: [], interventionCodes: [], status: 'DECLINED', sufficiency: 'OUT_OF_SCOPE', diagnosisId: null,
        domain: null, businessProcess: null, evidence: [] },
    ] },
  };
  const rows = growDiagnosticSummary(data);
  assert.match(rows[0].answer, /1 ellenőrzött/);
  assert.match(rows[1].answer, /1 deklarált.*nem azonosak mért/);
  assert.match(rows[2].answer, /1 teljesen mért.*további 1 pillanatkép/);
  assert.match(rows[3].answer, /Ismeretlen.*Ellentmondó.*Hiányos/);
  assert.match(rows[4].answer, /ellentmondó bizonyítékok szakmai egyeztetése/);
  assert.match(rows[5].answer, /1 belső javaslat vár emberi felülvizsgálatra/);
  assert.doesNotMatch(JSON.stringify(rows), /internal-id|internal-hash|PENDING_REVIEW|TOTAL_ACTIVE_MINUTES/);
});

test('a raw operating-profile summary remains only in the expanded technical detail', () => {
  const rows = growDiagnosticSummary({ ...empty, client: {
    ...empty.client,
    operatingProfile: { provenanceClass: 'CANONICAL_STATE', status: null, complianceEnrollmentStatus: 'UNKNOWN',
      summary: 'internal-id raw_field_key', lastReviewedAt: null, nextReviewAt: null },
  } });
  assert.match(rows[0].answer, /rögzített profil-összegzés/);
  assert.doesNotMatch(JSON.stringify(rows), /internal-id|raw_field_key/);
});

test('technical provenance remains expandable, not deleted or exposed in primary answers', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/components/clients/diagnostic-workbench/GrowDiagnosticWorkbench.tsx'), 'utf8');
  assert.match(source, /data-testid="diagnostic-readable-summary"/);
  assert.match(source, /<details[\s\S]*data-testid="diagnostic-technical-detail"/);
  for (const panel of ['CanonicalStatePanel', 'ObservationPanel', 'DiagnosisPanel', 'EvidenceSufficiencyPanel', 'InternalRecommendationPanel']) {
    assert.match(source, new RegExp(`<${panel}\\b`));
  }
  assert.match(source, /result\.clientId !== clientId/);
  assert.match(source, /setResult\(\{ clientId, data: dto \}\)/);
  assert.doesNotMatch(source, /setError\(err\.message/);
});
