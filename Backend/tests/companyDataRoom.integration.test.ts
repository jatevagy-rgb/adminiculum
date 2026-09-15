import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getCompanyDataRoom } from '../src/modules/company-workspace/service';
import { InteractionError } from '../src/modules/client-interaction/base';

const databaseUrl =
  process.env.GROW_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

const d = databaseUrl ? describe : describe.skip;

d('Company Data Room integration (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const otherLawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  const groupA = crypto.randomUUID();
  const processA = crypto.randomUUID();
  const systemA = crypto.randomUUID();
  const factDefinition = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };
  const otherLawyer = { userId: otherLawyerId, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({
      data: [
        { id: adminId, email: `data-room-admin-${suffix}@test.invalid`, name: 'Data Room Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true },
        { id: lawyerId, email: `data-room-lawyer-${suffix}@test.invalid`, name: 'Data Room Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true },
        { id: otherLawyerId, email: `data-room-other-${suffix}@test.invalid`, name: 'Other Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true },
      ] as never,
    });
    await db.client.createMany({
      data: [
        { id: clientA, name: `Data Room Client A ${suffix}`, company: 'Client A Kft.', taxNumber: '11111111-1-11' },
        { id: clientB, name: `Data Room Client B ${suffix}`, company: 'Client B Kft.' },
      ],
    });
    await db.case.createMany({
      data: [
        { id: caseA, caseNumber: `DATA-ROOM-A-${suffix}`, title: 'Data Room A', caseType: 'OTHER', clientId: clientA, assignedLawyerId: lawyerId, createdById: adminId },
        { id: caseB, caseNumber: `DATA-ROOM-B-${suffix}`, title: 'Data Room B', caseType: 'OTHER', clientId: clientB, assignedLawyerId: otherLawyerId, createdById: adminId },
      ] as never,
    });
    await db.clientOperatingProfile.create({
      data: { clientId: clientA, status: 'ACTIVE', complianceEnrollmentStatus: 'ENROLLED', summary: 'Bounded company profile' },
    });
    await db.factDefinition.create({
      data: {
        id: factDefinition,
        key: `data_room_fact_${suffix}`,
        domainCode: 'COMPANY',
        valueType: 'STRING',
        allowedScopeTypes: ['COMPANY'],
        determinationMethod: 'USER_PROVIDED',
        overlapPolicy: 'DISALLOW',
        temporalPolicy: 'VALIDITY_INTERVAL',
      } as never,
    });
    await db.clientFact.createMany({
      data: [
        {
          clientId: clientA,
          type: 'LEGAL_NAME',
          value: 'Old A Kft.',
          validFrom: new Date('2025-01-01T00:00:00.000Z'),
          validTo: new Date('2025-12-31T00:00:00.000Z'),
          supersededAt: new Date('2026-01-01T00:00:00.000Z'),
          verificationStatus: 'CLIENT_PROVIDED',
        },
        {
          clientId: clientA,
          type: 'LEGAL_NAME',
          value: 'Current A Kft.',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          verificationStatus: 'LAW_FIRM_VERIFIED',
          factDefinitionId: factDefinition,
        },
        {
          clientId: clientB,
          type: 'LEGAL_NAME',
          value: 'Current B Kft.',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          verificationStatus: 'CLIENT_PROVIDED',
        },
      ] as never,
    });
    await db.clientFactAnswerState.create({
      data: {
        clientId: clientA,
        factDefinitionId: factDefinition,
        scopeType: 'COMPANY',
        status: 'UNKNOWN',
      } as never,
    });
    await db.clientOrganizationGroup.create({
      data: { id: groupA, clientId: clientA, name: 'Operations', createdById: adminId },
    });
    await db.organizationPerson.create({
      data: { clientId: clientA, organizationGroupId: groupA, name: 'A Owner', jobTitle: 'Owner', employmentStatus: 'ACTIVE' },
    });
    await db.businessSystem.create({
      data: { id: systemA, clientId: clientA, name: 'A System', category: 'SOFTWARE', purpose: 'Operations' },
    });
    await db.businessProcess.create({
      data: { id: processA, clientId: clientA, name: 'A Process', category: 'OPERATIONS', organizationGroupId: groupA },
    });
    await db.businessProcessStep.create({
      data: { clientId: clientA, processId: processA, position: 1, name: 'A Step', systemId: systemA, estimatedActiveMinutes: 10, estimatedWaitingMinutes: 20 },
    });
    await db.document.create({
      data: {
        clientId: clientA,
        caseId: caseA,
        name: 'A Document',
        category: 'EVIDENCE',
        currentVersion: 1,
        currentVersionInt: 1,
      } as never,
    });
    await db.contractRecord.create({
      data: { clientId: clientA, title: 'A Contract', contractType: 'SERVICE', status: 'ACTIVE' },
    });
    const controlDefinition = await db.controlDefinition.create({
      data: { key: `data_room_control_${suffix}`, title: 'A Control', type: 'ORGANIZATIONAL' },
    });
    await db.clientControl.create({
      data: { clientId: clientA, controlDefinitionId: controlDefinition.id, implementationStatus: 'IMPLEMENTED' },
    });
    await db.evidenceRecord.create({
      data: { clientId: clientA, sourceType: 'CLIENT_FACT', title: 'A Evidence', status: 'ACCEPTED' },
    });
    const source = await db.externalSourceConnection.create({
      data: { clientId: clientA, sourceType: 'TEST', name: 'A Source', config: { secret: 'must-not-escape' } },
    });
    const run = await db.discoveryRun.create({
      data: { clientId: clientA, connectionId: source.id, status: 'COMPLETED' },
    });
    await db.observation.create({
      data: {
        clientId: clientA,
        connectionId: source.id,
        discoveryRunId: run.id,
        idempotencyKey: `data-room-${suffix}`,
        inputDigest: 'a'.repeat(64),
        rawPayload: { secret: 'must-not-escape' },
        observationType: 'SYSTEM_RECORD',
      },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('projects same-client canonical state and preserves bounded coverage semantics', async () => {
    const view = await getCompanyDataRoom(admin, clientA, db);

    expect(view.clientIdentity.id).toBe(clientA);
    expect(view.clientIdentity.company).toBe('Client A Kft.');
    expect(view.operatingProfile?.summary).toBe('Bounded company profile');
    expect(view.facts.map((fact) => fact.value)).toContain('Current A Kft.');
    expect(view.facts.map((fact) => fact.value)).not.toContain('Old A Kft.');
    expect(view.dataQuality.coverage.unknown).toBe(1);
    expect(view.dataQuality.coverage.unanswered).toBeNull();
    expect(view.dataQuality.coverage.conflicting).toBeNull();
    expect(view.organization.groupCount).toBe(1);
    expect(view.processes[0]?.steps[0]?.system?.id).toBe(systemA);
    expect(view.systems[0]?.relatedProcessCount).toBe(1);
    expect(view.documents.documentCount).toBe(1);
    expect(view.contracts.totalCount).toBe(1);
    expect(view.complianceSummary.controlCount).toBe(1);
    expect(view.evidenceSummary.totalCount).toBe(1);
    expect(JSON.stringify(view)).not.toContain('must-not-escape');
  });

  it('allows an authorized lawyer, denies an out-of-scope lawyer, and isolates clients', async () => {
    await expect(getCompanyDataRoom(lawyer, clientA, db)).resolves.toMatchObject({
      clientIdentity: { id: clientA },
    });
    await expect(getCompanyDataRoom(otherLawyer, clientA, db)).rejects.toMatchObject({
      status: 403,
      code: 'CLIENT_ACCESS_FORBIDDEN',
    });
    const otherClientView = await getCompanyDataRoom(admin, clientB, db);
    expect(otherClientView.clientIdentity.id).toBe(clientB);
    expect(JSON.stringify(otherClientView)).not.toContain('Current A Kft.');
    expect(JSON.stringify(otherClientView)).not.toContain('A Process');
  });

  it('does not create state and keeps canonical 404 behavior', async () => {
    const idsBefore = await Promise.all([
      db.clientFact.count({ where: { clientId: clientA } }),
      db.observation.count({ where: { clientId: clientA } }),
      db.processObservationSnapshot.count({ where: { clientId: clientA } }),
      db.recommendationRun.count({ where: { clientId: clientA } }),
      db.diagnosisCandidate.count({ where: { clientId: clientA } }),
      db.recommendationCandidate.count({ where: { clientId: clientA } }),
      db.improvementOpportunity.count({ where: { clientId: clientA } }),
      db.developmentInitiative.count({ where: { clientId: clientA } }),
      db.task.count({ where: { case: { clientId: clientA } } }),
      db.timeEntry.count({ where: { task: { case: { clientId: clientA } } } }),
    ]);
    await getCompanyDataRoom(admin, clientA, db);
    const idsAfter = await Promise.all([
      db.clientFact.count({ where: { clientId: clientA } }),
      db.observation.count({ where: { clientId: clientA } }),
      db.processObservationSnapshot.count({ where: { clientId: clientA } }),
      db.recommendationRun.count({ where: { clientId: clientA } }),
      db.diagnosisCandidate.count({ where: { clientId: clientA } }),
      db.recommendationCandidate.count({ where: { clientId: clientA } }),
      db.improvementOpportunity.count({ where: { clientId: clientA } }),
      db.developmentInitiative.count({ where: { clientId: clientA } }),
      db.task.count({ where: { case: { clientId: clientA } } }),
      db.timeEntry.count({ where: { task: { case: { clientId: clientA } } } }),
    ]);
    expect(idsAfter).toEqual(idsBefore);

    await expect(getCompanyDataRoom(admin, crypto.randomUUID(), db)).rejects.toEqual(
      expect.objectContaining(new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.')),
    );
  });
});
