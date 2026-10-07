import { activeAssessmentQuestions, evaluateAssessmentAnswers, getAssessmentPack } from '../src/modules/company-growth/assessments/registry';
import { observationToGrowSignals } from '../src/modules/company-growth/research/observationSignals';
import { runResearchCycle, getOpportunityDetail, listGrowHome } from '../src/modules/company-growth/research/service';
import { getDiagnosticWorkbench } from '../src/modules/company-growth/diagnostic/workbenchService';
import { registerInternalEvidence, projectEvidenceSourceBasis, toEvidenceDTO } from '../src/modules/company-growth/research/corpus';
import { GROW_PROCESS_METRICS_V1 } from '../src/modules/company-growth/metrics/metricTypes';
import { deriveProcessSignals } from '../src/modules/company-growth/research/interventions';

jest.mock('../src/modules/client-interaction/base', () => ({
  ...jest.requireActual('../src/modules/client-interaction/base'),
  assertClientReadAccess: jest.fn().mockResolvedValue({ id: 'client' }),
}));
jest.mock('../src/modules/company-growth/research/corpus', () => ({
  ...jest.requireActual('../src/modules/company-growth/research/corpus'),
  ensureCorpusSeeded: jest.fn().mockResolvedValue({ seeded: 0 }),
  findCorpusEvidenceForDomains: jest.fn().mockImplementation((_domains, options) => Promise.resolve(
    options.verificationStatuses ? [] : [{ id: 'external', corpusKey: 'pack:EV-BPM-RPA-SLR-2026-001' }],
  )),
  registerInternalEvidence: jest.fn().mockResolvedValue({ id: 'internal' }),
}));

const stable = {
  v2_same_sequence_count: 'EIGHT_TEN', v2_process_instructions_use: 'DOCUMENTED_AND_USED',
  v2_exceptions_recognizable: 'YES', v2_repetitive_data_digital: 'ALL',
};

function assessment(id: string, overrides: Record<string, string> = {}, packKey = 'PROCESS_STABILITY_V2', processId: string | null = 'process') {
  const pack = getAssessmentPack(packKey)!;
  const all = pack.questions.map(q => ({ questionKey: q.questionKey, answer: overrides[q.questionKey] ?? 'UNKNOWN' }));
  const active = activeAssessmentQuestions(pack, all);
  return {
    id, observationType: 'DECLARED_SURVEY', observedAt: new Date('2026-10-01'), sourceRecordId: id,
    rawPayload: {
      schema: 'GROW_ASSESSMENT_V2', packKey, packVersion: 2,
      answers: all.filter(a => active.some(q => q.questionKey === a.questionKey)), processId,
      provenance: { workspaceId: id },
    },
  };
}

function database(observations: ReturnType<typeof assessment>[] = [], snapshots: any[] = []) {
  const diagnoses: any[] = [];
  const recommendations: any[] = [];
  const create = (rows: any[]) => jest.fn().mockImplementation(({ data }) => {
    const row = { id: `${rows.length}`, ...data };
    rows.push(row);
    return Promise.resolve(row);
  });
  const db = {
    businessProcess: { findMany: jest.fn().mockResolvedValue([{ id: 'process', ownerPersonId: 'owner', status: 'ACTIVE' }]) },
    processObservationSnapshot: { findMany: jest.fn().mockResolvedValue(snapshots) },
    observation: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue(observations),
    recommendationRun: { create: jest.fn().mockResolvedValue({ id: 'run' }), update: jest.fn().mockResolvedValue({}) },
    problemDomain: { upsert: jest.fn().mockImplementation(({ create: data }) => Promise.resolve({ id: data.key })) },
    diagnosisCandidate: { create: create(diagnoses) },
    recommendationCandidate: { create: create(recommendations) },
    diagnosisEvidenceLink: { upsert: jest.fn().mockResolvedValue({}) },
    recommendationEvidenceLink: { upsert: jest.fn().mockResolvedValue({}) },
    improvementOpportunity: { create: jest.fn() }, developmentInitiative: { create: jest.fn() },
    task: { create: jest.fn() }, clientRequest: { create: jest.fn() },
  };
  return { db, diagnoses, recommendations };
}

const actor = { userId: 'admin', role: 'ADMIN' };

describe('Grow bounded provenance and finding continuity (no database)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps positive investigation, bounded problem, identity, next check and polarity distinct in the same category', async () => {
    const positive = assessment('positive', stable);
    const negative = assessment('negative', { ...stable, v2_same_sequence_count: 'FOUR_SEVEN', v2_process_instructions_use: 'INFORMAL' });
    const positiveSignals = observationToGrowSignals(positive);
    const negativeSignals = observationToGrowSignals(negative);
    expect(positiveSignals).toHaveLength(1);
    expect(negativeSignals).toHaveLength(2); // same category, distinct bounded findings
    expect([...positiveSignals, ...negativeSignals].every(signal => signal.domainKey === 'MANUAL_ADMIN_LOAD')).toBe(true);
    expect(positiveSignals[0].provenance.assessmentFinding?.polarity).toBe('INVESTIGATION');
    expect(negativeSignals.every(signal => signal.provenance.assessmentFinding?.polarity === 'PROBLEM')).toBe(true);

    const { db, diagnoses, recommendations } = database([positive]);
    await runResearchCycle(actor, 'client', {}, db as never);
    const original = evaluateAssessmentAnswers('PROCESS_STABILITY_V2', 2, positive.rawPayload.answers)!.findings[0];
    const diagnosis = diagnoses.find(d => d.sourceRefs.assessmentFindings);
    expect(diagnosis.title).toBe(original.titleHu);
    expect(diagnosis.sourceRefs.assessmentFindings[0]).toMatchObject({ ...original, packKey: 'PROCESS_STABILITY_V2', packVersion: 2, polarity: 'INVESTIGATION' });
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({ title: original.titleHu, problemStatement: original.summaryHu, direction: original.nextCheckHu, interventionCodes: ['AUTOMATE_REPETITIVE_STEP'], status: 'PENDING_REVIEW' });
    expect(recommendations[0].title).not.toContain('Túl sok');
    for (const delegate of [db.improvementOpportunity, db.developmentInitiative, db.task, db.clientRequest]) expect(delegate.create).not.toHaveBeenCalled();

    const mixed = database([positive, negative]);
    await runResearchCycle(actor, 'client', {}, mixed.db as never);
    expect(mixed.recommendations).toHaveLength(3);
    for (const finding of evaluateAssessmentAnswers('PROCESS_STABILITY_V2', 2, negative.rawPayload.answers)!.findings) {
      expect(mixed.recommendations).toContainEqual(expect.objectContaining({ title: finding.titleHu, problemStatement: finding.summaryHu, direction: finding.nextCheckHu, interventionCodes: ['REDESIGN_BEFORE_AUTOMATING'] }));
    }
    // Separate negative evidence can defer action, but never rewrite the positive proposition.
    expect(mixed.recommendations.find(r => r.title === original.titleHu).interventionCodes).not.toContain('AUTOMATE_REPETITIVE_STEP');
  });

  it.each(['UNKNOWN', 'MISSING'])('%s is not negative evidence and creates no candidate', async answer => {
    const unknown = assessment('unknown');
    if (answer === 'MISSING') unknown.rawPayload.answers = [];
    expect(observationToGrowSignals(unknown)).toEqual([]);
    const { db, recommendations } = database([unknown]);
    await runResearchCycle(actor, 'client', {}, db as never);
    expect(recommendations).toEqual([]);
  });

  it('keeps the positive finding separate from metric negatives and applies ownership/rework guards', async () => {
    const positive = assessment('positive', stable);
    const snapshot = {
      id: 'snapshot', businessProcessId: 'process',
      metrics: [{ code: 'PROCESS_OWNER_PRESENT', value: false }],
      provenance: { calculatedBy: GROW_PROCESS_METRICS_V1, inputFieldInventory: ['ownerPersonId'] },
    };
    const { db, recommendations } = database([positive], [snapshot]);
    await runResearchCycle(actor, 'client', {}, db as never);
    const original = observationToGrowSignals(positive)[0].provenance.assessmentFinding!;
    expect(recommendations.find(r => r.title === original.titleHu).interventionCodes).toEqual([]);
    const rework = database([assessment('rework', { ...stable, v2_rework_same_point: 'YES' }, 'PROCESS_STABILITY_REWORK_V2')]);
    await runResearchCycle(actor, 'client', {}, rework.db as never);
    expect(rework.recommendations.every(r => !r.interventionCodes.includes('AUTOMATE_REPETITIVE_STEP'))).toBe(true);
  });

  it('preserves process scoping and never borrows another process deferral', async () => {
    const positive = assessment('positive', stable);
    const other = assessment('other', { ...stable, v2_same_sequence_count: 'FOUR_SEVEN' }, 'PROCESS_STABILITY_V2', 'other-process');
    const { db, recommendations } = database([positive, other]);
    db.businessProcess.findMany.mockResolvedValue([
      { id: 'process', ownerPersonId: 'owner', status: 'ACTIVE' },
      { id: 'other-process', ownerPersonId: 'owner', status: 'ACTIVE' },
    ]);
    await runResearchCycle(actor, 'client', { businessProcessId: 'process' }, db as never);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].interventionCodes).toEqual(['AUTOMATE_REPETITIVE_STEP']);
  });

  it.each([
    ['process', true], [null, true], ['other-process', false], ['archived-process', false],
  ] as const)('applies V2 safety from %s to metric candidates with exact scope and cited observation', async (processId, blocked) => {
    const deferral = assessment('deferral', { ...stable, v2_same_sequence_count: 'FOUR_SEVEN' }, 'PROCESS_STABILITY_V2', processId);
    const snapshot = {
      id: 'snapshot', businessProcessId: 'process',
      metrics: [
        { code: 'TOTAL_ACTIVE_MINUTES', value: 240 }, { code: 'HANDOFF_STEP_COUNT', value: 3 },
        { code: 'DATA_ENTRY_STEP_COUNT', value: 2 }, { code: 'PROCESS_OWNER_PRESENT', value: true },
      ],
      provenance: { calculatedBy: GROW_PROCESS_METRICS_V1, inputFieldInventory: ['steps.estimatedActiveMinutes', 'steps.stepType', 'ownerPersonId'] },
    };
    const { db, diagnoses, recommendations } = database([assessment('positive', stable), deferral], [snapshot]);
    db.businessProcess.findMany.mockResolvedValue([
      { id: 'process', ownerPersonId: 'owner', status: 'ACTIVE' },
      { id: 'other-process', ownerPersonId: 'owner', status: 'ACTIVE' },
      { id: 'archived-process', ownerPersonId: 'owner', status: 'ARCHIVED' },
    ]);
    await runResearchCycle(actor, 'client', { businessProcessId: 'process' }, db as never);
    const metricDiagnosis = diagnoses.find(d => d.sourceRefs.snapshotIds.includes('snapshot'));
    const candidate = recommendations.find(r => r.diagnosisId === metricDiagnosis.id);
    expect(candidate.interventionCodes.includes('AUTOMATE_REPETITIVE_STEP')).toBe(!blocked);
    expect(metricDiagnosis.sourceRefs.observationIds.includes('deferral')).toBe(blocked);
    if (blocked) {
      expect(candidate.interventionCodes).toContain('REDESIGN_BEFORE_AUTOMATING');
      expect(registerInternalEvidence).toHaveBeenCalledWith(actor, expect.objectContaining({ corpusKey: 'obs:deferral' }), db);
    }
    const positive = evaluateAssessmentAnswers('PROCESS_STABILITY_V2', 2, assessment('positive', stable).rawPayload.answers)!.findings[0];
    expect(recommendations).toContainEqual(expect.objectContaining({ title: positive.titleHu, problemStatement: positive.summaryHu, direction: positive.nextCheckHu }));
    expect(metricDiagnosis.sourceRefs.assessmentFindings).toBeUndefined();
  });

  it('estimated time and derived structural evidence remain eligible without measured claims or strong internal evidence', async () => {
    const snapshot = {
      id: 'snapshot', businessProcessId: 'process',
      metrics: [{ code: 'WAITING_SHARE', value: 0.8 }, { code: 'DATA_ENTRY_STEP_COUNT', value: 3 }],
      provenance: { calculatedBy: GROW_PROCESS_METRICS_V1, inputFieldInventory: ['steps.estimatedActiveMinutes', 'steps.estimatedWaitingMinutes', 'steps.stepType'] },
    };
    const before = JSON.stringify(snapshot);
    const { db, diagnoses, recommendations } = database([], [snapshot]);
    await runResearchCycle(actor, 'client', {}, db as never);
    expect(diagnoses).toHaveLength(2); // absent owner metric is not absent ownership
    expect(diagnoses.map(d => d.sourceRefs.sourceBasis)).toEqual(['ESTIMATED', 'DERIVED']);
    expect(recommendations).toHaveLength(2);
    expect(recommendations.find(r => r.diagnosisId === diagnoses[0].id).kind).toBe('DEVELOPMENT');
    expect(recommendations.every(r => r.sufficiency === 'SUPPORTED')).toBe(true);
    expect(deriveProcessSignals({ metrics: { WAITING_SHARE: 0.8 }, surveyCategories: ['GENERAL_CONCERN'], measured: false, declared: true, hasSnapshot: true })).not.toContain('PROCESS_VARIABILITY');
    expect(registerInternalEvidence).toHaveBeenCalledWith(actor, expect.objectContaining({ kind: 'INTERNAL_OBSERVATION', strength: 'MODERATE' }), db);
    expect((registerInternalEvidence as jest.Mock).mock.calls.every(call => call[1].kind !== 'INTERNAL_MEASUREMENT')).toBe(true);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('does not promote a metric diagnosis through evidence that only defers automation', async () => {
    const deferral = assessment('deferral', { ...stable, v2_same_sequence_count: 'FOUR_SEVEN' });
    const { db, diagnoses, recommendations } = database([deferral], [{
      id: 'unknown-snapshot', businessProcessId: 'process', provenance: null,
      metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 240 }, { code: 'HANDOFF_STEP_COUNT', value: 3 }, { code: 'DATA_ENTRY_STEP_COUNT', value: 2 }],
    }]);
    await runResearchCycle(actor, 'client', {}, db as never);
    const metricDiagnosis = diagnoses.find(d => d.sourceRefs.snapshotIds.length);
    expect(metricDiagnosis.sourceRefs).toMatchObject({ safetyObservationIds: ['deferral'], observationIds: ['deferral'], sufficiency: 'INSUFFICIENT_EVIDENCE' });
    expect(recommendations.some(r => r.diagnosisId === metricDiagnosis.id)).toBe(false);
  });

  it('reads historical measurement evidence as estimated without rewriting stored evidence', async () => {
    const row = {
      id: 'old', clientId: 'client', corpusKey: 'snap:snapshot', locator: 'snapshot:snapshot', kind: 'INTERNAL_MEASUREMENT', title: 'Old measurement',
      authors: null, venue: null, year: null, doi: null, verificationStatus: 'VERIFIED' as const, strength: 'STRONG', domainKeys: [],
      applicabilityNotes: null, limitations: null, createdAt: new Date('2026-10-01'),
    };
    const { db } = database([], [{ id: 'snapshot', metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 30 }], provenance: { calculatedBy: GROW_PROCESS_METRICS_V1, inputFieldInventory: ['steps.estimatedActiveMinutes'] } }]);
    const projected = await projectEvidenceSourceBasis([toEvidenceDTO(row)], 'client', db as never);
    expect(projected[0]).toMatchObject({ id: 'old', sourceBasis: 'ESTIMATED', kind: 'INTERNAL_OBSERVATION', strength: 'MODERATE' });
    expect(row.kind).toBe('INTERNAL_MEASUREMENT');
    expect(row.strength).toBe('STRONG');
    expect(db.processObservationSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: 'client', id: { in: ['snapshot'] } } }));
    const storedDiagnosis = {
      id: 'diagnosis', summary: 'Bounded problem. Ellenőrzött szakirodalmi bizonyíték + ügyfél-mérési pillanatkép támasztja alá.',
      sourceRefs: { snapshotIds: ['snapshot'], observationIds: [], reasons: ['Ellenőrzött szakirodalmi bizonyíték + ügyfél-mérési pillanatkép támasztja alá.'] },
    };
    const detailDb = { ...db, recommendationCandidate: { findFirst: jest.fn().mockResolvedValue({
      id: 'candidate', evidenceLinks: [{ evidence: row }], createdAt: new Date(),
      diagnosis: storedDiagnosis,
    }) } };
    const detail = await getOpportunityDetail(actor, 'client', 'candidate', detailDb as never);
    expect(detail.diagnosis?.sourceRefs).toMatchObject({ snapshotIds: ['snapshot'], sourceBasis: 'ESTIMATED' });
    expect(detail.evidence[0].sourceBasis).toBe('ESTIMATED');
    expect(detail.diagnosis?.summary).toContain('Bounded problem.');
    expect(detail.diagnosis?.summary).not.toContain('ügyfél-mérési pillanatkép');
    expect(JSON.stringify(detail.diagnosis?.sourceRefs)).not.toContain('ügyfél-mérési pillanatkép');
    expect(storedDiagnosis.summary).toContain('ügyfél-mérési pillanatkép');
    expect(storedDiagnosis.sourceRefs.reasons[0]).toContain('ügyfél-mérési pillanatkép');
    const homeDb = { ...db,
      recommendationCandidate: { findMany: jest.fn().mockResolvedValue([{
        id: 'candidate', status: 'PENDING_REVIEW', sufficiency: 'SUPPORTED', impactTags: ['APPROVAL_DELAY'],
        evidenceLinks: [{ evidence: row }, { evidence: { ...row, id: 'external', clientId: null, kind: 'PAPER', locator: 'https://example.invalid' } }],
        createdAt: new Date(), diagnosis: { sourceRefs: { snapshotIds: ['snapshot'], observationIds: [] } },
      }]) },
      developmentInitiative: { findMany: jest.fn().mockResolvedValue([]) }, outcomeMeasurement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const home = await listGrowHome(actor, 'client', homeDb as never);
    expect(home.topOpportunities[0].sourceBasis).toBe('ESTIMATED');
    expect(home.opportunityCounts).toMatchObject({ evidenceBacked: 1, measurementBacked: 0 });
  });

  it('diagnostic reads classify snapshot source without leaking payloads or mutating history', async () => {
    const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
    const snapshot = {
      id: 'snapshot', businessProcess: { id: 'process', name: 'Process' }, observedAt: new Date(),
      metricVersion: GROW_PROCESS_METRICS_V1, inputDigest: 'input', snapshotDigest: 'snapshot-digest',
      metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 0, unit: 'MINUTES', metricVersion: GROW_PROCESS_METRICS_V1 }],
      provenance: { source: 'CANONICAL_BUSINESS_PROCESS', calculatedBy: GROW_PROCESS_METRICS_V1, stepCount: 1, inputFieldInventory: ['steps.estimatedActiveMinutes'] },
    };
    const historical = { id: 'evidence', clientId: 'client', locator: 'snapshot:snapshot', kind: 'INTERNAL_MEASUREMENT', title: 'Folyamat-mérési pillanatkép', strength: 'STRONG', verificationStatus: 'VERIFIED', domainKeys: [] };
    const linkedOnly = { ...historical, id: 'linked-only', locator: 'snapshot:older-snapshot' };
    const external = { ...historical, id: 'external', clientId: null, locator: 'https://example.invalid', kind: 'PAPER', title: 'Verified paper' };
    const db = {
      client: { findUnique: jest.fn().mockResolvedValue({ id: 'client', name: 'Client' }) },
      clientFact: empty(), businessProcess: empty(), businessSystem: empty(), observation: empty(),
      problemDomain: empty(), evidenceRecord: empty(), clientFactAnswerState: empty(),
      diagnosisCandidate: { findMany: jest.fn().mockResolvedValue([{ id: 'diagnosis', summary: 'Bounded problem. Ellenőrzött szakirodalmi bizonyíték + ügyfél-mérési pillanatkép támasztja alá.', evidenceLinks: [{ evidence: linkedOnly }] }]) },
      recommendationCandidate: { findMany: jest.fn().mockResolvedValue([{ id: 'recommendation', evidenceLinks: [{ evidence: linkedOnly }] }]) },
      processObservationSnapshot: { findMany: jest.fn()
        .mockResolvedValueOnce([snapshot, { ...snapshot, id: 'unknown', provenance: null }])
        .mockResolvedValue([snapshot, { ...snapshot, id: 'older-snapshot' }]) },
      researchEvidence: { findMany: jest.fn().mockResolvedValue([historical, external]) },
    };
    const original = JSON.stringify(snapshot);
    const result = await getDiagnosticWorkbench(actor, 'client', db as never);
    expect(result.observed.processSnapshots[0]).toMatchObject({ sourceBasis: 'ESTIMATED', provenanceClass: 'ESTIMATED_SNAPSHOT', inputDigest: 'input', snapshotDigest: 'snapshot-digest' });
    expect(result.observed.processSnapshots[1]).toMatchObject({ sourceBasis: null, provenanceClass: 'PROCESS_SNAPSHOT' });
    expect(result.evidence.research[0].sourceBasis).toBe('ESTIMATED');
    expect(result.evidence.research[0]).toMatchObject({ kind: 'INTERNAL_OBSERVATION', strength: 'MODERATE' });
    expect(result.evidence.research[0].title).not.toBe(historical.title);
    expect(result.evidence.research[1]).toMatchObject({ kind: 'PAPER', title: 'Verified paper', strength: 'STRONG', sourceBasis: 'EXTERNAL' });
    for (const item of [result.problems.diagnoses[0], result.proposed.recommendations[0]]) {
      expect(item.evidence[0]).toMatchObject({ id: 'linked-only', strength: 'MODERATE', sourceBasis: 'ESTIMATED' });
      expect(item.evidence[0].title).not.toBe(historical.title);
    }
    expect(result.problems.diagnoses[0].summary).toContain('Bounded problem.');
    expect(result.problems.diagnoses[0].summary).not.toContain('ügyfél-mérési pillanatkép');
    expect(db.processObservationSnapshot.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { clientId: 'client', id: { in: expect.arrayContaining(['snapshot', 'older-snapshot']) } },
    }));
    expect(historical).toMatchObject({ kind: 'INTERNAL_MEASUREMENT', title: 'Folyamat-mérési pillanatkép', strength: 'STRONG' });
    expect(JSON.stringify(snapshot)).toBe(original);
    expect(JSON.stringify(result)).not.toContain('rawPayload');
  });
});
