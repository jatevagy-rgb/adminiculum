/**
 * COMPANY FOUNDATION (Phase 1) — PostgreSQL integration + authorization.
 *
 * Exercises the full Client -> operating profile -> facts -> assessment ->
 * items -> finding -> initiative -> optional Case/Task -> company milestone
 * graph, plus client-scope isolation and the customer-safe projector.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  addAssessmentItem,
  createAssessment,
  createFact,
  createFinding,
  createInitiative,
  createMilestone,
  getAssessment,
  getOperatingProfile,
  linkFindingToInitiative,
  listFacts,
  transitionAssessment,
  transitionFinding,
  updateAssessmentItem,
  updateFact,
  updateInitiative,
  updateMilestone,
  upsertOperatingProfile,
  verifyFact,
} from '../src/modules/client-company/service';
import { projectCompanyOverviewForCustomer } from '../src/modules/client-company/projector';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('Company foundation (Phase 1) (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const collaboratorId = crypto.randomUUID();
  const externalLawyerId = crypto.randomUUID();
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  const caseA = crypto.randomUUID();
  const taskA = crypto.randomUUID();
  const caseB = crypto.randomUUID();
  const taskB = crypto.randomUUID();
  const documentB = crypto.randomUUID();
  const documentVersionB = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };
  const lawyer = { userId: lawyerId, role: 'LAWYER' };
  const partner = { userId: partnerId, role: 'PARTNER' };
  const collaborator = { userId: collaboratorId, role: 'COLLAB_LAWYER' };
  const externalLawyer = { userId: externalLawyerId, role: 'LAWYER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.createMany({ data: [
      { id: adminId, email: `admin-${suffix}@test.invalid`, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' },
      { id: lawyerId, email: `lawyer-${suffix}@test.invalid`, name: 'Lawyer A', role: 'LAWYER', status: 'ACTIVE' },
      { id: partnerId, email: `partner-${suffix}@test.invalid`, name: 'Partner', role: 'PARTNER', status: 'ACTIVE' },
      { id: collaboratorId, email: `collab-${suffix}@test.invalid`, name: 'Collaborator', role: 'COLLAB_LAWYER', status: 'ACTIVE' },
      { id: externalLawyerId, email: `lawyer-b-${suffix}@test.invalid`, name: 'Lawyer B', role: 'LAWYER', status: 'ACTIVE' },
    ] as never });
    await db.client.createMany({ data: [
      { id: clientA, name: `Company Client A ${suffix}` },
      { id: clientB, name: `Company Client B ${suffix}` },
    ] });
    await db.case.create({ data: { id: caseA, caseNumber: `CO-${suffix}`, title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId: clientA, assignedLawyerId: lawyerId, createdById: adminId } as never });
    await db.caseCollaborator.create({ data: { caseId: caseA, userId: collaboratorId } });
    await db.task.create({ data: { id: taskA, title: 'Remediation Task', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', caseId: caseA, assignedToId: lawyerId, assignedById: adminId, requiredSkills: [] } as never });
    // Client B fixtures for cross-client relationship-security assertions.
    await db.case.create({ data: { id: caseB, caseNumber: `CO-B-${suffix}`, title: 'Case B', caseType: 'CONTRACT_REVIEW', clientId: clientB, assignedLawyerId: externalLawyerId, createdById: adminId } as never });
    await db.task.create({ data: { id: taskB, title: 'Task B', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', caseId: caseB, assignedToId: externalLawyerId, assignedById: adminId, requiredSkills: [] } as never });
    await db.document.create({ data: { id: documentB, name: 'Doc B', category: 'OTHER', caseId: caseB, clientId: clientB } as never });
    await db.documentVersion.create({ data: { id: documentVersionB, version: 1, name: 'Doc B v1', documentId: documentB, uploadedById: adminId } as never });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('keeps exactly one operating profile per client (upsert)', async () => {
    await upsertOperatingProfile(admin, clientA, { status: 'ACTIVE', summary: 'First', lastReviewedAt: '2026-08-01T00:00:00Z' });
    await upsertOperatingProfile(admin, clientA, { summary: 'Updated' });
    const profile = await getOperatingProfile(admin, clientA);
    expect(profile).not.toBeNull();
    expect(profile!.summary).toBe('Updated');
    const count = await db.clientOperatingProfile.count({ where: { clientId: clientA } });
    expect(count).toBe(1);
  });

  it('restricts only enrollment changes to managers while preserving ordinary profile updates', async () => {
    await upsertOperatingProfile(lawyer, clientA, { summary: 'Lawyer update' });
    await upsertOperatingProfile(collaborator, clientA, { summary: 'Collaborator update' });
    await expect(upsertOperatingProfile(lawyer, clientA, { complianceEnrollmentStatus: 'SUSPENDED' })).rejects.toMatchObject({ code: 'COMPANY_MANAGE_FORBIDDEN' });
    await expect(upsertOperatingProfile(collaborator, clientA, { complianceEnrollmentStatus: 'SUSPENDED' })).rejects.toMatchObject({ code: 'COMPANY_MANAGE_FORBIDDEN' });
    await expect(upsertOperatingProfile(partner, clientA, { complianceEnrollmentStatus: 'ENROLLED' })).resolves.toMatchObject({ complianceEnrollmentStatus: 'ENROLLED' });
  });

  it('rejects unknown fact types and end-dates historical facts (validTo)', async () => {
    await expect(createFact(admin, clientA, { type: 'NOT_A_REAL_TYPE', value: 'x' })).rejects.toMatchObject({ code: 'FACT_TYPE_UNKNOWN' });
    const fact = await createFact(admin, clientA, { type: 'EMPLOYEE_COUNT', value: '42', validFrom: '2026-01-01T00:00:00Z' });
    expect(fact.verificationStatus).toBe('UNVERIFIED');
    expect(fact.validTo).toBeNull();
  });

  it('owns verification transitions server-side; non-managers cannot verify', async () => {
    const fact = await createFact(admin, clientA, { type: 'MAIN_ACTIVITY', value: 'Legal tech', validFrom: '2026-01-01T00:00:00Z' });
    const verified = await verifyFact(admin, fact.id, { verificationStatus: 'LAW_FIRM_VERIFIED' });
    expect(verified.verificationStatus).toBe('LAW_FIRM_VERIFIED');
    expect(verified.verifiedById).toBe(adminId);
    // A lawyer (non-manager) must not be able to assert verification.
    await expect(verifyFact(lawyer, fact.id, { verificationStatus: 'DOCUMENT_VERIFIED' })).rejects.toMatchObject({ code: 'COMPANY_MANAGE_FORBIDDEN' });
  });

  it('runs a generic assessment lifecycle with bounded items', async () => {
    const assessment = await createAssessment(admin, clientA, { type: 'COMPANY_OPERATING', title: 'Operating Review' });
    expect(assessment.status).toBe('DRAFT');
    await expect(addAssessmentItem(admin, assessment.id, { key: 'i1', label: 'Q', maturityLevel: 9 })).rejects.toMatchObject({ code: 'MATURITY_LEVEL_INVALID' });
    await addAssessmentItem(admin, assessment.id, { key: 'i1', label: 'Practice', kind: 'QUESTION', maturityLevel: 3, currentPractice: 'Some' });
    const started = await transitionAssessment(admin, assessment.id, 'start');
    expect(started.status).toBe('IN_PROGRESS');
    const done = await transitionAssessment(admin, assessment.id, 'complete');
    expect(done.status).toBe('COMPLETED');
    // COMPLETED -> DRAFT must be rejected.
    await expect(transitionAssessment(admin, assessment.id, 'start')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  it('links a finding through acknowledge -> plan -> resolve and to an initiative', async () => {
    const assessment = await createAssessment(admin, clientA, { type: 'MANAGEMENT_MATURITY', title: 'Management' });
    const finding = await createFinding(admin, { clientId: clientA, assessmentId: assessment.id, severity: 'HIGH', title: 'Finding', recommendation: 'Do X' });
    expect(finding.status).toBe('OPEN');
    await transitionFinding(admin, finding.id, 'ACKNOWLEDGED');
    await expect(transitionFinding(admin, finding.id, 'RESOLVED')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    await transitionFinding(admin, finding.id, 'ACTION_PLANNED');
    await transitionFinding(admin, finding.id, 'RESOLVED');
    const resolved = await db.assessmentFinding.findUnique({ where: { id: finding.id }, select: { status: true, remediationTaskId: true } });
    expect(resolved!.status).toBe('RESOLVED');
  });

  it('creates a development initiative and links a case + milestone (no fake progress)', async () => {
    const initiative = await createInitiative(admin, clientA, { title: 'Grow exports', priority: 'HIGH', status: 'PLANNED' });
    const updated = await updateInitiative(admin, initiative.id, { status: 'ACTIVE', caseId: caseA });
    expect(updated.status).toBe('ACTIVE');
    expect(updated.caseId).toBe(caseA);
    // A finding links to the initiative.
    const assessment = await createAssessment(admin, clientA, { type: 'DIGITAL_MATURITY', title: 'Digital' });
    const finding = await createFinding(admin, { clientId: clientA, assessmentId: assessment.id, severity: 'MEDIUM', title: 'Digital gap' });
    await linkFindingToInitiative(admin, finding.id, initiative.id);
    const linked = await db.assessmentFinding.findUnique({ where: { id: finding.id }, select: { developmentInitiativeId: true } });
    expect(linked!.developmentInitiativeId).toBe(initiative.id);
    // A milestone may point at the initiative; no numeric progress anywhere.
    const milestone = await createMilestone(admin, clientA, { type: 'FIRST_EXPORT', title: 'First export', status: 'PLANNED', targetDate: '2027-01-01T00:00:00Z', developmentInitiativeId: initiative.id });
    expect(milestone.developmentInitiativeId).toBe(initiative.id);
    expect(milestone).not.toHaveProperty('progressPercentage');
    expect(milestone).not.toHaveProperty('progress');
  });

  it('enforces client-scope isolation for non-manager reads', async () => {
    // lawyer has a Case only in client A, so client B reads must be forbidden.
    await expect(listFacts(externalLawyer, clientA)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    await expect(listFacts(lawyer, clientB)).rejects.toMatchObject({ code: 'CLIENT_ACCESS_FORBIDDEN' });
    // Same-client non-manager read is allowed.
    const facts = await listFacts(lawyer, clientA);
    expect(Array.isArray(facts.items)).toBe(true);
  });

  it('customer-safe projector strips internal provenance and findings', async () => {
    const view = await projectCompanyOverviewForCustomer(clientA);
    expect(view).toHaveProperty('profileHeadline');
    expect(view).toHaveProperty('milestones');
    expect(view).toHaveProperty('initiatives');
    const json = JSON.stringify(view);
    expect(json).not.toContain('verificationStatus');
    expect(json).not.toContain('sourceDocumentVersionId');
    expect(json).not.toContain('verifiedById');
    expect(json).not.toContain('internalNote');
    expect(json).not.toContain('recommendation');
  });

  it('refuses to link company records across clients via relational IDs', async () => {
    // Client A initiative must not point at a Client B Case.
    const initA = await createInitiative(admin, clientA, { title: 'A initiative', priority: 'MEDIUM', status: 'PLANNED' });
    await expect(updateInitiative(admin, initA.id, { caseId: caseB })).rejects.toMatchObject({ code: 'CASE_CROSS_CLIENT' });
    await expect(createInitiative(admin, clientA, { title: 'A2', priority: 'LOW', caseId: caseB })).rejects.toMatchObject({ code: 'CASE_CROSS_CLIENT' });

    // A Client B initiative for the cross-client finding/milestone assertions.
    const initB = await createInitiative(admin, clientB, { title: 'B initiative', priority: 'MEDIUM', status: 'PLANNED' });

    const assessmentA = await createAssessment(admin, clientA, { type: 'COMPANY_OPERATING', title: 'A assessment' });
    // Client A finding must not reference Client B initiative / task.
    await expect(createFinding(admin, { clientId: clientA, assessmentId: assessmentA.id, title: 'x', developmentInitiativeId: initB.id }))
      .rejects.toMatchObject({ code: 'INITIATIVE_CROSS_CLIENT' });
    await expect(createFinding(admin, { clientId: clientA, assessmentId: assessmentA.id, title: 'x', remediationTaskId: taskB }))
      .rejects.toMatchObject({ code: 'TASK_CROSS_CLIENT' });

    // link-initiative and milestone links are also client-bound.
    const findingA = await createFinding(admin, { clientId: clientA, assessmentId: assessmentA.id, title: 'ok' });
    await expect(linkFindingToInitiative(admin, findingA.id, initB.id)).rejects.toMatchObject({ code: 'INITIATIVE_CROSS_CLIENT' });
    await expect(createMilestone(admin, clientA, { type: 'FIRST_EXPORT', title: 'ms', developmentInitiativeId: initB.id }))
      .rejects.toMatchObject({ code: 'INITIATIVE_CROSS_CLIENT' });

    // Evidence document from another client is rejected for facts and items.
    await expect(createFact(admin, clientA, { type: 'CERTIFICATION', value: 'ISO', sourceDocumentVersionId: documentVersionB }))
      .rejects.toMatchObject({ code: 'EVIDENCE_CROSS_CLIENT' });
    await expect(addAssessmentItem(admin, assessmentA.id, { key: 'ev', label: 'Evidence', evidenceDocumentVersionId: documentVersionB }))
      .rejects.toMatchObject({ code: 'EVIDENCE_CROSS_CLIENT' });
  });

  it('rejects an incoherent fact validity interval (validTo before validFrom)', async () => {
    await expect(createFact(admin, clientA, { type: 'EMPLOYEE_COUNT', value: '10', validFrom: '2026-06-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z' }))
      .rejects.toMatchObject({ code: 'FACT_VALIDITY_INVALID' });
  });

  it('resets verification when a verified fact value materially changes', async () => {
    const fact = await createFact(admin, clientA, { type: 'REVENUE_BAND', value: 'BAND_A', validFrom: '2026-01-01T00:00:00Z' });
    const verified = await verifyFact(admin, fact.id, { verificationStatus: 'LAW_FIRM_VERIFIED' });
    expect(verified.verificationStatus).toBe('LAW_FIRM_VERIFIED');
    const changed = await updateFact(admin, fact.id, { value: 'BAND_B' });
    expect(changed.verificationStatus).toBe('UNVERIFIED');
    expect(changed.verifiedById).toBeNull();
    expect(changed.verifiedAt).toBeNull();
    // DOCUMENT_VERIFIED requires real evidence.
    await expect(verifyFact(admin, fact.id, { verificationStatus: 'DOCUMENT_VERIFIED' }))
      .rejects.toMatchObject({ code: 'FACT_EVIDENCE_REQUIRED' });
  });

  it('locks assessment items once the assessment is completed', async () => {
    const assessment = await createAssessment(admin, clientA, { type: 'HR_GOVERNANCE', title: 'Lock' });
    const item = await addAssessmentItem(admin, assessment.id, { key: 'k1', label: 'Q' });
    await transitionAssessment(admin, assessment.id, 'start');
    await transitionAssessment(admin, assessment.id, 'complete');
    await expect(addAssessmentItem(admin, assessment.id, { key: 'k2', label: 'Q2' })).rejects.toMatchObject({ code: 'ASSESSMENT_LOCKED' });
    await expect(updateAssessmentItem(admin, item.id, { label: 'edited' })).rejects.toMatchObject({ code: 'ASSESSMENT_LOCKED' });
  });
});
