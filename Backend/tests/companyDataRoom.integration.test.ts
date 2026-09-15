import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getCompanyDataRoom } from '../src/modules/company-workspace/service';
import { InteractionError } from '../src/modules/client-interaction/base';
import { COMPANY_PROFILE_QUESTIONS } from '../src/modules/client-workspace/companyProfileQuestionRegistry';
import { buildFactStateMap, resolveVisibleQuestions } from '../src/modules/client-workspace/companyProfileAdaptive';

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
  const caseA2 = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  const groupA = crypto.randomUUID();
  const processA = crypto.randomUUID();
  const processB = crypto.randomUUID();
  const systemA = crypto.randomUUID();
  const snapshotA = crypto.randomUUID();
  const snapshotB = crypto.randomUUID();
  const factSubjectA = crypto.randomUUID();
  const standardA2 = crypto.randomUUID();
  const hrA1 = crypto.randomUUID();
  const factDefinition = crypto.randomUUID();
  const answeredFactDefinition = crypto.randomUUID();
  const answeredFact = crypto.randomUUID();
  const complianceDomainCode = `DATA_ROOM_${suffix}`;
  const requirementId = crypto.randomUUID();
  const requirementVersionId = crypto.randomUUID();
  const ruleVersionId = crypto.randomUUID();
  const createdProfileDefinitionIds: string[] = [];

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
    const profileDefinitions = new Map<string, { id: string }>();
    for (const key of ['employee_count', 'personal_data_processing', 'ai_use']) {
      let definition = await db.factDefinition.findUnique({ where: { key } });
      if (!definition) {
        definition = await db.factDefinition.create({
          data: {
            id: crypto.randomUUID(),
            key,
            domainCode: 'CLIENT_COMPANY_PROFILE',
            valueType: key === 'employee_count' ? 'NUMBER' : 'BOOLEAN',
            allowedScopeTypes: ['COMPANY', 'EMPLOYEE'],
            determinationMethod: 'USER_PROVIDED',
            overlapPolicy: 'DISALLOW',
            temporalPolicy: 'OBSERVATION',
            questionKey: key,
          } as never,
        });
        createdProfileDefinitionIds.push(definition.id);
      }
      profileDefinitions.set(key, definition);
    }
    await db.case.createMany({
      data: [
        { id: caseA, caseNumber: `DATA-ROOM-A-${suffix}`, title: 'Data Room A', caseType: 'OTHER', clientId: clientA, assignedLawyerId: lawyerId, createdById: adminId },
        { id: caseA2, caseNumber: `DATA-ROOM-A2-${suffix}`, title: 'Data Room A2 Hidden Case', caseType: 'OTHER', clientId: clientA, assignedLawyerId: otherLawyerId, createdById: adminId },
        { id: caseB, caseNumber: `DATA-ROOM-B-${suffix}`, title: 'Data Room B', caseType: 'OTHER', clientId: clientB, assignedLawyerId: otherLawyerId, createdById: adminId },
      ] as never,
    });
    await db.clientOperatingProfile.create({
      data: { clientId: clientA, status: 'ACTIVE', complianceEnrollmentStatus: 'ENROLLED', summary: 'Bounded company profile' },
    });
    await db.complianceDomain.create({ data: { code: complianceDomainCode, label: 'Data Room compliance' } });
    await db.requirement.create({ data: { id: requirementId, key: `DATA_ROOM_REQ_${suffix}`, jurisdictionCode: 'HU', domainCode: complianceDomainCode } });
    await db.requirementVersion.create({
      data: {
        id: requirementVersionId,
        requirementId,
        versionKey: 'V1',
        title: 'Current requirement',
        normativeStatement: 'Current requirement',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        status: 'APPROVED',
        sourceSupportState: 'SUFFICIENT',
      } as never,
    });
    await db.applicabilityRuleVersion.create({
      data: {
        id: ruleVersionId,
        requirementVersionId,
        ruleVersionKey: 'R1',
        schemaVersion: 'rule-ast/v1',
        astJson: { node: 'test' },
        canonicalDigest: 'a'.repeat(64),
        status: 'APPROVED',
      } as never,
    });
    await db.requirementApplicability.createMany({
      data: [
        {
          clientId: clientA,
          requirementVersionId,
          ruleVersionId,
          ruleDigest: 'b'.repeat(64),
          outcome: 'DOES_NOT_APPLY',
          scopeType: 'COMPANY',
          evaluationAt: new Date('2026-01-02T00:00:00.000Z'),
          sourceSupportState: 'SUFFICIENT',
          specialistRequirement: 'NONE',
          schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {},
          snapshotDigest: 'c'.repeat(64),
        },
        {
          clientId: clientA,
          requirementVersionId,
          ruleVersionId,
          ruleDigest: 'd'.repeat(64),
          outcome: 'APPLIES',
          scopeType: 'COMPANY',
          evaluationAt: new Date('2026-01-03T00:00:00.000Z'),
          sourceSupportState: 'SUFFICIENT',
          specialistRequirement: 'NONE',
          schemaVersion: 'phase6-requirement-applicability/v1',
          snapshotJson: {},
          snapshotDigest: 'e'.repeat(64),
        },
      ] as never,
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
    await db.factDefinition.create({
      data: {
        id: answeredFactDefinition,
        key: `data_room_boolean_${suffix}`,
        domainCode: 'COMPANY',
        valueType: 'BOOLEAN',
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
          id: answeredFact,
          clientId: clientA,
          type: 'PROFILE_BOOLEAN',
          value: 'legacy-boolean-must-not-win',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          verificationStatus: 'CLIENT_PROVIDED',
          factDefinitionId: answeredFactDefinition,
          booleanValue: true,
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
    await db.factSubject.create({
      data: {
        id: factSubjectA,
        clientId: clientA,
        scopeType: 'EMPLOYEE',
        subjectKey: `subject-${suffix}`,
      } as never,
    });
    await db.clientFact.create({
      data: {
        clientId: clientA,
        type: 'EMPLOYEE_COUNT',
        value: '999',
        factDefinitionId: profileDefinitions.get('employee_count')!.id,
        factSubjectId: factSubjectA,
        scopeType: 'EMPLOYEE',
        numberValue: 999,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        observedAt: new Date('2026-01-01T00:00:00.000Z'),
        verificationStatus: 'CLIENT_PROVIDED',
      } as never,
    });
    await db.clientFact.create({
      data: {
        clientId: clientA,
        type: 'PERSONAL_DATA_PROCESSING',
        value: 'false',
        factDefinitionId: profileDefinitions.get('personal_data_processing')!.id,
        scopeType: 'COMPANY',
        booleanValue: false,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        observedAt: new Date('2026-01-01T00:00:00.000Z'),
        verificationStatus: 'CLIENT_PROVIDED',
      } as never,
    });
    await db.clientFactAnswerState.create({
      data: {
        clientId: clientA,
        factDefinitionId: profileDefinitions.get('ai_use')!.id,
        scopeType: 'COMPANY',
        status: 'UNKNOWN',
      } as never,
    });
    await db.clientFactAnswerState.create({
      data: {
        clientId: clientA,
        factDefinitionId: answeredFactDefinition,
        scopeType: 'COMPANY',
        status: 'ANSWERED',
        currentFactId: answeredFact,
      } as never,
    });
    await db.clientOrganizationGroup.create({
      data: { id: groupA, clientId: clientA, name: 'Operations', descriptionSafe: 'Daily operations', createdById: adminId },
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
    await db.businessProcess.create({
      data: { id: processB, clientId: clientA, name: 'B Process', category: 'OPERATIONS', organizationGroupId: groupA },
    });
    await db.businessProcessStep.create({
      data: { clientId: clientA, processId: processA, position: 1, name: 'A Step', systemId: systemA, estimatedActiveMinutes: 10, estimatedWaitingMinutes: 20 },
    });
    await db.processObservationSnapshot.create({
      data: {
        id: snapshotA,
        clientId: clientA,
        businessProcessId: processA,
        metricVersion: 'GROW_PROCESS_METRICS_V1',
        observedAt: new Date('2026-01-05T00:00:00.000Z'),
        inputDigest: 'f'.repeat(64),
        snapshotDigest: 'g'.repeat(64),
        metrics: [
          { code: 'TOTAL_ACTIVE_MINUTES', value: 42, unit: 'MINUTES', metricVersion: 'GROW_PROCESS_METRICS_V1' },
          { code: 'UNSAFE_RAW_PAYLOAD', value: 999, unit: 'COUNT', metricVersion: 'GROW_PROCESS_METRICS_V1' },
        ],
      } as never,
    });
    await db.processObservationSnapshot.create({
      data: {
        id: snapshotB,
        clientId: clientA,
        businessProcessId: processB,
        metricVersion: 'GROW_PROCESS_METRICS_V1',
        observedAt: new Date('2026-02-05T00:00:00.000Z'),
        inputDigest: 'h'.repeat(64),
        snapshotDigest: 'i'.repeat(64),
        metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 84, unit: 'MINUTES', metricVersion: 'GROW_PROCESS_METRICS_V1' }],
      } as never,
    });
    const documentA1 = await db.document.create({
      data: {
        clientId: clientA,
        caseId: caseA,
        name: 'A Document',
        category: 'EVIDENCE',
        currentVersion: 1,
        currentVersionInt: 1,
      } as never,
    });
    const documentA2 = await db.document.create({
      data: {
        id: standardA2,
        clientId: clientA,
        caseId: caseA2,
        name: 'STANDARD_A2_HIDDEN_CASE',
        category: 'EVIDENCE',
        currentVersion: 1,
        currentVersionInt: 1,
      } as never,
    });
    const documentHrA1 = await db.document.create({
      data: {
        id: hrA1,
        clientId: clientA,
        caseId: caseA,
        name: 'HR_A1_PRIVILEGED_ONLY',
        category: 'INTERNAL_MEMO',
        securityClassification: 'HR_CONFIDENTIAL',
        currentVersion: 1,
        currentVersionInt: 1,
      } as never,
    });
    const documentVersions = await Promise.all([
      db.documentVersion.create({
        data: {
          documentId: documentA1.id,
          version: 1,
          name: 'STANDARD_A1',
          originalFileName: 'standard-a1.pdf',
          uploadedById: adminId,
          isCurrent: true,
        } as never,
      }),
      db.documentVersion.create({
        data: {
          documentId: documentA2.id,
          version: 1,
          name: 'STANDARD_A2',
          originalFileName: 'standard-a2.pdf',
          uploadedById: otherLawyerId,
          isCurrent: true,
        } as never,
      }),
      db.documentVersion.create({
        data: {
          documentId: documentHrA1.id,
          version: 1,
          name: 'HR_A1',
          originalFileName: 'hr-a1.pdf',
          uploadedById: adminId,
          isCurrent: true,
        } as never,
      }),
    ]);
    await db.evidenceRecord.createMany({
      data: documentVersions.map((version) => ({
        clientId: clientA,
        sourceType: 'DOCUMENT_VERSION',
        title: `Evidence ${version.name}`,
        status: 'ACCEPTED',
        documentVersionId: version.id,
      })) as never,
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
    const profileDefinitionIds = await db?.factDefinition.findMany({
      where: { key: { in: ['employee_count', 'personal_data_processing', 'ai_use'] } },
      select: { id: true },
    });
    const profileIds = profileDefinitionIds?.map((definition) => definition.id) ?? [];
    await db?.clientFactAnswerState.deleteMany({ where: { clientId: clientA, factDefinitionId: { in: profileIds } } });
    await db?.clientFact.deleteMany({ where: { clientId: clientA, factDefinitionId: { in: profileIds } } });
    await db?.factSubject.deleteMany({ where: { id: factSubjectA } });
    for (const id of createdProfileDefinitionIds) await db?.factDefinition.delete({ where: { id } });
    await db?.requirementApplicability.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await db?.applicabilityRuleVersion.deleteMany({ where: { id: ruleVersionId } });
    await db?.requirementVersion.deleteMany({ where: { id: requirementVersionId } });
    await db?.requirement.deleteMany({ where: { id: requirementId } });
    await db?.complianceDomain.deleteMany({ where: { code: complianceDomainCode } });
    await db?.$disconnect();
  });

  it('projects same-client canonical state and preserves bounded coverage semantics', async () => {
    const view = await getCompanyDataRoom(admin, clientA, db);

    expect(view.clientIdentity.id).toBe(clientA);
    expect(view.clientIdentity.company).toBe('Client A Kft.');
    expect(view.operatingProfile?.summary).toBe('Bounded company profile');
    expect(view.facts.map((fact) => fact.value)).not.toContain('Current A Kft.');
    expect(view.facts.map((fact) => fact.value)).not.toContain('Old A Kft.');
    expect(view.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ answerStatus: 'UNKNOWN', value: null }),
      expect.objectContaining({ answerStatus: 'ANSWERED', value: true }),
    ]));
    expect(view.dataQuality.answerStateSummary).toEqual({ answered: 1, unknown: 1 });
    expect(view.dataQuality.coverageAvailable).toBe(false);
    expect(view.dataQuality.relevantDataCoverage).toEqual(expect.objectContaining({
      answeredCount: 0,
      unknownCount: 1,
      unansweredCount: expect.any(Number),
      derivedAnsweredCount: 0,
    }));
    const expectedRelevantKeys = new Set(
      COMPANY_PROFILE_QUESTIONS
        .filter((question) => question.baseline || question.discoveryBaseline)
        .map((question) => question.factDefinitionKey),
    );
    const visibility = resolveVisibleQuestions(buildFactStateMap({
      personal_data_processing: { status: 'ANSWERED', value: false },
      ai_use: { status: 'UNKNOWN' },
    }));
    for (const question of visibility.visible) {
      for (const key of question.factKeys) expectedRelevantKeys.add(key);
    }
    expect(view.dataQuality.relevantDataCoverage.relevantDefinitionCount).toBe(expectedRelevantKeys.size);
    expect(view.dataQuality.relevantDataCoverage.undeterminedCount).toBeGreaterThan(0);
    expect(view.dataQuality.relevantDataCoverage.available).toBe(false);
    expect(view.dataQuality.stale).toBeNull();
    expect(view.dataQuality.staleAvailable).toBe(false);
    expect(view.organization.groupCount).toBe(1);
    expect(view.organization.groups[0]?.description).toBe('Daily operations');
    expect(view.organization.people[0]?.organizationGroupName).toBe('Operations');
    expect(view.processes[0]?.steps[0]?.system?.id).toBe(systemA);
    expect(view.processes[0]?.latestMeasuredSnapshot).toEqual(expect.objectContaining({
      id: snapshotA,
      metrics: [
        expect.objectContaining({ code: 'TOTAL_ACTIVE_MINUTES', value: 42 }),
      ],
    }));
    expect(view.processes[1]?.latestMeasuredSnapshot).toEqual(expect.objectContaining({ id: snapshotB }));
    expect(JSON.stringify(view.processes[0]?.latestMeasuredSnapshot)).not.toContain('UNSAFE_RAW_PAYLOAD');
    expect(view.systems[0]?.relatedProcessStepCount).toBe(1);
    expect(view.documents.documentCount).toBe(3);
    expect(view.documents.currentVersionCount).toBe(3);
    expect(view.documents.evidenceLinkedRecordCount).toBe(3);
    expect(view.contracts.totalCount).toBe(1);
    expect(view).not.toHaveProperty('contractDetails');
    expect(view.developmentSummary.opportunityCountsByStatus).toEqual([]);
    expect(view.measurementSummary.assumedCount).toBe(0);
    expect(view.complianceSummary.currentOnly).toBe(true);
    expect(view.complianceSummary.evaluatedCount).toBe(1);
    expect(view.complianceSummary.applies).toBe(1);
    expect(view.evidenceSummary.totalCount).toBe(4);
    expect(JSON.stringify(view)).not.toContain('must-not-escape');
  });

  it('allows an authorized lawyer, denies an out-of-scope lawyer, and isolates clients', async () => {
    await expect(getCompanyDataRoom(lawyer, clientA, db)).resolves.toMatchObject({
      clientIdentity: { id: clientA },
      documents: {
        documentCount: 1,
        currentVersionCount: 1,
        evidenceLinkedRecordCount: 1,
      },
    });
    const lawyerView = await getCompanyDataRoom(lawyer, clientA, db);
    expect(JSON.stringify(lawyerView)).not.toContain('STANDARD_A2_HIDDEN_CASE');
    expect(JSON.stringify(lawyerView)).not.toContain('HR_A1_PRIVILEGED_ONLY');
    const privilegedView = await getCompanyDataRoom(admin, clientA, db);
    expect(privilegedView.documents.documentCount).toBe(3);
    expect(privilegedView.documents.evidenceLinkedRecordCount).toBe(3);
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
      db.clientFactAnswerState.count({ where: { clientId: clientA } }),
      db.outcomeMeasurement.count({ where: { clientId: clientA } }),
      db.evidenceRecord.count({ where: { clientId: clientA } }),
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
      db.clientFactAnswerState.count({ where: { clientId: clientA } }),
      db.outcomeMeasurement.count({ where: { clientId: clientA } }),
      db.evidenceRecord.count({ where: { clientId: clientA } }),
    ]);
    expect(idsAfter).toEqual(idsBefore);

    await expect(getCompanyDataRoom(admin, crypto.randomUUID(), db)).rejects.toEqual(
      expect.objectContaining(new InteractionError(404, 'CLIENT_NOT_FOUND', 'Client not found.')),
    );
  });
});
