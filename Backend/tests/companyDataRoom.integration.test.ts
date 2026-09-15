/**
 * GWU-2B.1 — workforce Company OS / Company Data Room read model.
 *
 * This suite proves that the projection composes existing canonical state,
 * remains tenant scoped, preserves UNKNOWN/UNANSWERED semantics, and performs
 * no lazy initialization or other writes.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getCompanyDataRoom, getWorkspaceOverview } from '../src/modules/company-workspace/service';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('GWU-2B.1 Company Data Room (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const externalLawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const processA = crypto.randomUUID();
  const processB = crypto.randomUUID();
  const systemB = crypto.randomUUID();
  const factA = crypto.randomUUID();
  const historicalFactA = crypto.randomUUID();
  const factB = crypto.randomUUID();
  const unknownStateA = crypto.randomUUID();
  const snapshotA = crypto.randomUUID();
  const admin = { userId: adminId, role: 'ADMIN' } as const;
  const externalLawyer = { userId: externalLawyerId, role: 'LAWYER' } as const;

  let employeeDefinitionId: string;
  let countryDefinitionId: string;
  let legalFormDefinitionId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const definitions = await db.factDefinition.findMany({
      where: { key: { in: ['employee_count', 'company_operating_country', 'company_legal_form'] }, status: 'ACTIVE' },
      select: { id: true, key: true },
    });
    employeeDefinitionId = definitions.find((row) => row.key === 'employee_count')?.id || '';
    countryDefinitionId = definitions.find((row) => row.key === 'company_operating_country')?.id || '';
    legalFormDefinitionId = definitions.find((row) => row.key === 'company_legal_form')?.id || '';
    if (!employeeDefinitionId || !countryDefinitionId || !legalFormDefinitionId) throw new Error('GWU-2B.1 requires the canonical Company Profile 2.0 FactDefinitions.');

    await db.user.createMany({ data: [
      { id: adminId, email: `data-room-admin-${suffix}@test.invalid`, name: 'Data Room Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
      { id: externalLawyerId, email: `data-room-lawyer-${suffix}@test.invalid`, name: 'External Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    ] as never });
    await db.client.createMany({ data: [
      { id: clientA, name: `Data Room Client A ${suffix}` },
      { id: clientB, name: `Data Room Client B ${suffix}` },
    ] });
    await db.case.create({ data: { id: caseA, caseNumber: `DR-${suffix}`, title: 'Data room access case', caseType: 'OTHER', clientId: clientA, assignedLawyerId: adminId, createdById: adminId } as never });
    await db.clientOperatingProfile.create({ data: { clientId: clientA, status: 'ACTIVE', summary: 'Canonical operating profile' } });

    await db.clientFact.createMany({ data: [
      { id: factA, clientId: clientA, factDefinitionId: employeeDefinitionId, type: 'employee_count', value: '12', numberValue: 12, scopeType: 'COMPANY', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED', determinationMethod: 'USER_PROVIDED' },
      { id: historicalFactA, clientId: clientA, factDefinitionId: employeeDefinitionId, type: 'employee_count', value: '7', numberValue: 7, scopeType: 'COMPANY', validFrom: new Date('2025-01-01T00:00:00Z'), validTo: new Date('2025-12-31T00:00:00Z'), supersededAt: new Date('2026-01-02T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED', determinationMethod: 'USER_PROVIDED' },
      { id: factB, clientId: clientB, factDefinitionId: employeeDefinitionId, type: 'employee_count', value: '999', numberValue: 999, scopeType: 'COMPANY', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED', determinationMethod: 'USER_PROVIDED' },
      { id: crypto.randomUUID(), clientId: clientA, factDefinitionId: legalFormDefinitionId, type: 'company_legal_form', value: 'Kft.', enumValue: 'Kft.', scopeType: 'COMPANY', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'DOCUMENT_VERIFIED', determinationMethod: 'USER_PROVIDED' },
    ] as never });
    await db.clientFactAnswerState.create({ data: { id: unknownStateA, clientId: clientA, factDefinitionId: countryDefinitionId, scopeType: 'COMPANY', status: 'UNKNOWN' } });
    await db.businessProcess.createMany({ data: [
      { id: processA, clientId: clientA, name: 'Client A process', category: 'OPERATIONS', description: 'Canonical process', criticality: 'MEDIUM', frequency: 'DAILY', status: 'ACTIVE' },
      { id: processB, clientId: clientB, name: 'Client B process', category: 'OPERATIONS', criticality: 'HIGH', frequency: 'DAILY', status: 'ACTIVE' },
    ] as never });
    await db.businessSystem.create({ data: { id: systemB, clientId: clientB, name: 'Client B system', category: 'SOFTWARE', status: 'ACTIVE' } });
    await db.processObservationSnapshot.create({ data: { id: snapshotA, clientId: clientA, businessProcessId: processA, metricVersion: 'grow-process-v1', observedAt: new Date('2026-08-01T00:00:00Z'), inputDigest: crypto.createHash('sha256').update('data-room-input').digest('hex'), snapshotDigest: crypto.createHash('sha256').update('data-room-snapshot').digest('hex'), metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 42, unit: 'MINUTES', metricVersion: 'grow-process-v1' }], provenance: { source: 'integration-test', calculatedBy: 'test', stepCount: 0, inputFieldInventory: [] } } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.processObservationSnapshot.deleteMany({ where: { id: snapshotA } });
    await db.businessSystem.deleteMany({ where: { id: systemB } });
    await db.businessProcess.deleteMany({ where: { id: { in: [processA, processB] } } });
    await db.clientFactAnswerState.deleteMany({ where: { id: unknownStateA } });
    await db.clientFact.deleteMany({ where: { id: { in: [factA, factB, historicalFactA] } } });
    await db.case.deleteMany({ where: { id: caseA } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId: clientA } });
    await db.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, externalLawyerId] } } });
    await db.$disconnect();
  });

  it('projects canonical company state without mutation or customer publication assumptions', async () => {
    const before = await Promise.all([
      db.clientFact.count({ where: { id: { in: [factA, factB] } } }),
      db.clientFactAnswerState.count({ where: { id: unknownStateA } }),
      db.processObservationSnapshot.count({ where: { id: snapshotA } }),
      db.observation.count({ where: { clientId: clientA } }),
      db.diagnosisCandidate.count({ where: { clientId: clientA } }),
      db.recommendationRun.count({ where: { clientId: clientA } }),
      db.recommendationCandidate.count({ where: { clientId: clientA } }),
      db.improvementOpportunity.count({ where: { clientId: clientA } }),
      db.evidenceRecord.count({ where: { clientId: clientA } }),
      db.developmentInitiative.count({ where: { clientId: clientA } }),
      db.timeEntry.count({ where: { case: { clientId: clientA } } }),
      db.task.count({ where: { case: { clientId: clientA } } }),
      db.outcomeMeasurement.count({ where: { clientId: clientA } }),
    ]);
    const view = await getCompanyDataRoom(admin, clientA, db);
    expect(view.client.id).toBe(clientA);
    expect(view.facts.find((fact) => fact.key === 'employee_count')).toEqual(expect.objectContaining({ value: 12, status: 'ANSWERED' }));
    expect(view.facts.find((fact) => fact.key === 'company_operating_country')).toEqual(expect.objectContaining({ value: null, status: 'UNKNOWN' }));
    expect(view.coverage.relevantDefinitionCount).toBeGreaterThan(0);
    expect(view.coverage.unansweredCount).toBeGreaterThanOrEqual(0);
    const hiddenFact = view.facts.find((fact) => fact.key === 'special_category_data');
    expect(hiddenFact?.status).toBe('UNANSWERED');
    expect(view.coverage.relevantDefinitionCount).toBeLessThan(view.facts.length);
    expect(view.processes.find((process) => process.id === processA)?.latestMeasuredSnapshot?.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TOTAL_ACTIVE_MINUTES', value: 42 })]));
    expect(JSON.stringify(view)).not.toContain('isCustomerVisible');
    expect(JSON.stringify(view)).not.toContain('RecommendationCandidate');
    expect(JSON.stringify(view)).not.toContain('rawPayload');
    const after = await Promise.all([
      db.clientFact.count({ where: { id: { in: [factA, factB] } } }),
      db.clientFactAnswerState.count({ where: { id: unknownStateA } }),
      db.processObservationSnapshot.count({ where: { id: snapshotA } }),
      db.observation.count({ where: { clientId: clientA } }),
      db.diagnosisCandidate.count({ where: { clientId: clientA } }),
      db.recommendationRun.count({ where: { clientId: clientA } }),
      db.recommendationCandidate.count({ where: { clientId: clientA } }),
      db.improvementOpportunity.count({ where: { clientId: clientA } }),
      db.evidenceRecord.count({ where: { clientId: clientA } }),
      db.developmentInitiative.count({ where: { clientId: clientA } }),
      db.timeEntry.count({ where: { case: { clientId: clientA } } }),
      db.task.count({ where: { case: { clientId: clientA } } }),
      db.outcomeMeasurement.count({ where: { clientId: clientA } }),
    ]);
    expect(after).toEqual(before);
  });

  it('is tenant scoped and preserves existing company-workspace behavior', async () => {
    await expect(getCompanyDataRoom(externalLawyer, clientB, db)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    const view = await getCompanyDataRoom(admin, clientA, db);
    expect(view.facts.some((fact) => fact.id === factB)).toBe(false);
    expect(view.processes.some((process) => process.id === processB)).toBe(false);
    expect(view.systems.some((system) => system.id === systemB)).toBe(false);
    await expect(getCompanyDataRoom(admin, crypto.randomUUID(), db)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    expect((await getWorkspaceOverview(admin, clientA, db)).client.id).toBe(clientA);
  });
});
