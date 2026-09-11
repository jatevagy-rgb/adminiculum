/**
 * GROW WITH US V2 — T1.5 Vendor Onboarding Canonical Proof Integration Test.
 *
 * Demonstrates that canonical T1 models:
 *   - BusinessProcess
 *   - BusinessProcessStep
 *   - BusinessSystem
 *   - OrganizationPerson
 *   - ClientOrganizationGroup
 *
 * can represent a realistic 12-step Vendor Onboarding & Contracting process
 * without schema extensions.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  addProcessStep,
  createBusinessProcess,
  createBusinessSystem,
  deleteBusinessProcess,
  getBusinessProcess,
} from '../src/modules/client-company/service';

const databaseUrl =
  process.env.CLIENT_INTERACTION_TEST_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('PostgreSQL database URL is required for T1.5 Vendor Onboarding proof test execution.');
}

describe('Grow With Us V2 T1.5 — Vendor Onboarding Canonical Proof', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const lawyerId = crypto.randomUUID();

  const clientIdA = crypto.randomUUID();
  const clientIdB = crypto.randomUUID();

  const admin = { userId: adminId, role: 'ADMIN' };

  // People IDs
  let personProcurementLeadId: string;
  let personProcurementAssistantId: string;
  let personComplianceOfficerId: string;
  let personLegalCounselId: string;
  let personCfoId: string;
  let personItAdminId: string;
  let personClientBId: string;

  // Group ID
  let groupProcurementOpsId: string;

  // System IDs
  let systemOutlookId: string;
  let systemExcelId: string;
  let systemSharePointId: string;
  let systemAdminiculumRepoId: string;
  let systemBillingoErpId: string;
  let systemClientBId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    // Seed users
    await db.user.createMany({
      data: [
        { id: adminId, email: `admin-t15-${suffix}@example.invalid`, name: 'Admin T1.5', role: 'ADMIN', status: 'ACTIVE' },
        { id: lawyerId, email: `lawyer-t15-${suffix}@example.invalid`, name: 'Lawyer T1.5', role: 'LAWYER', status: 'ACTIVE' },
      ] as never,
    });

    // Seed clients
    await db.client.createMany({
      data: [
        { id: clientIdA, name: `Acme Corp T1.5 ${suffix}` },
        { id: clientIdB, name: `Beta Corp T1.5 ${suffix}` },
      ],
    });

    // Seed organizational group
    const group = await db.clientOrganizationGroup.create({
      data: {
        clientId: clientIdA,
        name: `Procurement & Operations ${suffix}`,
        descriptionSafe: 'Procurement, vendor governance, and legal ops group',
        createdById: adminId,
      },
    });
    groupProcurementOpsId = group.id;

    // Seed OrganizationPerson records
    const p1 = await db.organizationPerson.create({ data: { clientId: clientIdA, name: 'Procurement Lead', email: `procurement.lead-${suffix}@example.invalid`, jobTitle: 'Lead Procurement Manager' } });
    const p2 = await db.organizationPerson.create({ data: { clientId: clientIdA, name: 'Procurement Assistant', email: `procurement.assistant-${suffix}@example.invalid`, jobTitle: 'Procurement Specialist' } });
    const p3 = await db.organizationPerson.create({ data: { clientId: clientIdA, name: 'Compliance Officer', email: `compliance.officer-${suffix}@example.invalid`, jobTitle: 'DPO & Compliance Lead' } });
    const p4 = await db.organizationPerson.create({ data: { clientId: clientIdA, name: 'Legal Counsel', email: `legal.counsel-${suffix}@example.invalid`, jobTitle: 'Senior Legal Counsel' } });
    const p5 = await db.organizationPerson.create({ data: { clientId: clientIdA, name: 'CFO', email: `cfo-${suffix}@example.invalid`, jobTitle: 'Chief Financial Officer' } });
    const p6 = await db.organizationPerson.create({ data: { clientId: clientIdA, name: 'IT Administrator', email: `it.admin-${suffix}@example.invalid`, jobTitle: 'Systems Administrator' } });
    const pB = await db.organizationPerson.create({ data: { clientId: clientIdB, name: 'Client B Person', email: `clientB.person-${suffix}@example.invalid`, jobTitle: 'Other Officer' } });

    personProcurementLeadId = p1.id;
    personProcurementAssistantId = p2.id;
    personComplianceOfficerId = p3.id;
    personLegalCounselId = p4.id;
    personCfoId = p5.id;
    personItAdminId = p6.id;
    personClientBId = pB.id;

    // Seed BusinessSystem fixtures
    const s1 = await createBusinessSystem(admin, clientIdA, { name: 'Microsoft Outlook', category: 'COMMUNICATION', vendor: 'Microsoft', purpose: 'Email communication & vendor outreach', ownerPersonId: personProcurementLeadId });
    const s2 = await createBusinessSystem(admin, clientIdA, { name: 'Vendor Master Excel Sheet', category: 'SPREADSHEET', vendor: 'Microsoft', purpose: 'Working register for vendor intake and tracking', ownerPersonId: personProcurementAssistantId });
    const s3 = await createBusinessSystem(admin, clientIdA, { name: 'Document Repository System', category: 'DOCUMENT_MGMT', vendor: 'Vendor Corp', purpose: 'Document storage for NDA, DPA, and MSA files', ownerPersonId: personComplianceOfficerId });
    const s4 = await createBusinessSystem(admin, clientIdA, { name: 'Adminiculum Contract Repository', category: 'LEGAL_OPERATIONS', vendor: 'Adminiculum', purpose: 'Contract drafting, legal review, and obligation registration', ownerPersonId: personLegalCounselId });
    const s5 = await createBusinessSystem(admin, clientIdA, { name: 'Billingo ERP System', category: 'FINANCE', vendor: 'Billingo', purpose: 'Financial master setup and ERP vendor registration', ownerPersonId: personCfoId });
    const sB = await createBusinessSystem(admin, clientIdB, { name: 'Client B ERP System', category: 'FINANCE', vendor: 'SAP' });

    systemOutlookId = s1.id;
    systemExcelId = s2.id;
    systemSharePointId = s3.id;
    systemAdminiculumRepoId = s4.id;
    systemBillingoErpId = s5.id;
    systemClientBId = sB.id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('1-22. Full canonical Vendor Onboarding representation proof & metric verification', async () => {
    // 1. Create BusinessProcess
    const process = await createBusinessProcess(admin, clientIdA, {
      name: 'Vendor Onboarding & Contracting Process',
      category: 'PROCUREMENT',
      description: 'End-to-end operational vendor vetting, legal contracting, compliance verification, financial setup, and activation process.',
      criticality: 'HIGH',
      frequency: 'MONTHLY',
      ownerPersonId: personProcurementLeadId,
      organizationGroupId: groupProcurementOpsId,
    });

    expect(process.id).toBeDefined();

    // 2. Add 12 ordered steps
    await addProcessStep(admin, process.id, {
      name: 'Initiate Vendor Onboarding',
      stepType: 'MANUAL',
      position: 1,
      systemId: systemOutlookId,
      responsiblePersonId: personProcurementLeadId,
      estimatedActiveMinutes: 15,
      estimatedWaitingMinutes: 0,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Collect & Record Vendor Master Data',
      stepType: 'DATA_ENTRY',
      position: 2,
      systemId: systemExcelId,
      responsiblePersonId: personProcurementAssistantId,
      estimatedActiveMinutes: 30,
      estimatedWaitingMinutes: 120,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Assess Legal & Compliance Needs',
      stepType: 'DECISION',
      position: 3,
      systemId: undefined,
      responsiblePersonId: personComplianceOfficerId,
      estimatedActiveMinutes: 20,
      estimatedWaitingMinutes: 60,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Execute Non-Disclosure Agreement (NDA)',
      stepType: 'DOCUMENT',
      position: 4,
      systemId: systemSharePointId,
      responsiblePersonId: personLegalCounselId,
      estimatedActiveMinutes: 45,
      estimatedWaitingMinutes: 1440,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Execute Data Processing Addendum (DPA)',
      stepType: 'DOCUMENT',
      position: 5,
      systemId: systemSharePointId,
      responsiblePersonId: personComplianceOfficerId,
      estimatedActiveMinutes: 45,
      estimatedWaitingMinutes: 1440,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Draft Master Services Agreement (MSA)',
      stepType: 'HANDOFF',
      position: 6,
      systemId: systemAdminiculumRepoId,
      responsiblePersonId: personLegalCounselId,
      estimatedActiveMinutes: 120,
      estimatedWaitingMinutes: 2880,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Legal & Compliance Risk Approval',
      stepType: 'APPROVAL',
      position: 7,
      systemId: systemAdminiculumRepoId,
      responsiblePersonId: personLegalCounselId,
      estimatedActiveMinutes: 30,
      estimatedWaitingMinutes: 240,
      isApproval: true,
    });

    await addProcessStep(admin, process.id, {
      name: 'Financial & Budgetary Approval',
      stepType: 'APPROVAL',
      position: 8,
      systemId: systemBillingoErpId,
      responsiblePersonId: personCfoId,
      estimatedActiveMinutes: 15,
      estimatedWaitingMinutes: 480,
      isApproval: true,
    });

    await addProcessStep(admin, process.id, {
      name: 'Execute Contract Signatures',
      stepType: 'MANUAL',
      position: 9,
      systemId: systemSharePointId,
      responsiblePersonId: personProcurementLeadId,
      estimatedActiveMinutes: 30,
      estimatedWaitingMinutes: 1440,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Re-key Vendor Master Data into ERP',
      stepType: 'DATA_ENTRY',
      position: 10,
      systemId: systemBillingoErpId,
      responsiblePersonId: personProcurementAssistantId,
      estimatedActiveMinutes: 45,
      estimatedWaitingMinutes: 0,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Register Contract & Assign Contract Obligations',
      stepType: 'DATA_ENTRY',
      position: 11,
      systemId: systemAdminiculumRepoId,
      responsiblePersonId: personLegalCounselId,
      estimatedActiveMinutes: 30,
      estimatedWaitingMinutes: 0,
      isApproval: false,
    });

    await addProcessStep(admin, process.id, {
      name: 'Complete Vendor Operational Activation',
      stepType: 'SYSTEM',
      position: 12,
      systemId: systemBillingoErpId,
      responsiblePersonId: personItAdminId,
      estimatedActiveMinutes: 10,
      estimatedWaitingMinutes: 0,
      isApproval: false,
    });

    // 7. Read canonical process back through authoritative service
    const readback = await getBusinessProcess(admin, process.id);
    expect(readback).toBeDefined();
    expect(readback!.name).toBe('Vendor Onboarding & Contracting Process');
    expect(readback!.category).toBe('PROCUREMENT');
    expect(readback!.criticality).toBe('HIGH');
    expect(readback!.frequency).toBe('MONTHLY');

    // 8. Verify exact deterministic step ordering
    expect(readback!.steps).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      expect(readback!.steps[i].position).toBe(i + 1);
    }
    expect(readback!.steps[0].name).toBe('Initiate Vendor Onboarding');
    expect(readback!.steps[11].name).toBe('Complete Vendor Operational Activation');

    // 9. Verify process owner
    expect(readback!.ownerPersonId).toBe(personProcurementLeadId);
    expect(readback!.ownerPersonName).toBe('Procurement Lead');

    // 10. Verify organization group
    expect(readback!.organizationGroupId).toBe(groupProcurementOpsId);
    expect(readback!.organizationGroupName).toContain('Procurement & Operations');

    // 11. Verify responsible-person relationships across steps
    expect(readback!.steps[0].responsiblePersonId).toBe(personProcurementLeadId);
    expect(readback!.steps[1].responsiblePersonId).toBe(personProcurementAssistantId);
    expect(readback!.steps[2].responsiblePersonId).toBe(personComplianceOfficerId);
    expect(readback!.steps[3].responsiblePersonId).toBe(personLegalCounselId);
    expect(readback!.steps[7].responsiblePersonId).toBe(personCfoId);
    expect(readback!.steps[11].responsiblePersonId).toBe(personItAdminId);

    // 12. Verify system relationships across steps
    expect(readback!.steps[0].systemId).toBe(systemOutlookId);
    expect(readback!.steps[1].systemId).toBe(systemExcelId);
    expect(readback!.steps[2].systemId).toBeNull();
    expect(readback!.steps[3].systemId).toBe(systemSharePointId);
    expect(readback!.steps[5].systemId).toBe(systemAdminiculumRepoId);
    expect(readback!.steps[7].systemId).toBe(systemBillingoErpId);

    // 13. Verify approval flags
    const approvalSteps = readback!.steps.filter((s) => s.isApproval);
    expect(approvalSteps).toHaveLength(2);
    expect(approvalSteps.map((s) => s.position)).toEqual([7, 8]);
    expect(approvalSteps.map((s) => s.name)).toEqual([
      'Legal & Compliance Risk Approval',
      'Financial & Budgetary Approval',
    ]);

    // 14 & 15. Verify active-minute and waiting-minute values per step
    expect(readback!.steps[0].estimatedActiveMinutes).toBe(15);
    expect(readback!.steps[0].estimatedWaitingMinutes).toBe(0);
    expect(readback!.steps[5].estimatedActiveMinutes).toBe(120);
    expect(readback!.steps[5].estimatedWaitingMinutes).toBe(2880);

    // 16. Calculate total active minutes (derived in test code, not persisted)
    const totalActiveMinutes = readback!.steps.reduce(
      (sum, s) => sum + (s.estimatedActiveMinutes || 0),
      0,
    );
    expect(totalActiveMinutes).toBe(435); // 7.25 hours

    // 17. Calculate total waiting minutes (derived in test code, not persisted)
    const totalWaitingMinutes = readback!.steps.reduce(
      (sum, s) => sum + (s.estimatedWaitingMinutes || 0),
      0,
    );
    expect(totalWaitingMinutes).toBe(8100); // 135 hours = 5.625 days

    // 18. Verify number of distinct systems used
    const distinctSystemIds = new Set(readback!.steps.map((s) => s.systemId).filter(Boolean));
    expect(distinctSystemIds.size).toBe(5);

    // 19. Verify number of distinct responsible people
    const distinctPersonIds = new Set(
      readback!.steps.map((s) => s.responsiblePersonId).filter(Boolean),
    );
    expect(distinctPersonIds.size).toBe(6);

    // 20. Verify step types coverage in proof case
    const stepTypesUsed = new Set(readback!.steps.map((s) => s.stepType));
    expect(stepTypesUsed.has('MANUAL')).toBe(true);
    expect(stepTypesUsed.has('DATA_ENTRY')).toBe(true);
    expect(stepTypesUsed.has('DECISION')).toBe(true);
    expect(stepTypesUsed.has('DOCUMENT')).toBe(true);
    expect(stepTypesUsed.has('HANDOFF')).toBe(true);
    expect(stepTypesUsed.has('APPROVAL')).toBe(true);
    expect(stepTypesUsed.has('SYSTEM')).toBe(true);

    // 21. Verify existing T1 same-client tenant safety (cross-client reference rejection)
    await expect(
      addProcessStep(admin, process.id, {
        name: 'Invalid Step referencing Client B System',
        stepType: 'SYSTEM',
        position: 13,
        systemId: systemClientBId,
      }),
    ).rejects.toMatchObject({ code: 'CROSS_CLIENT_REFERENCE' });

    await expect(
      addProcessStep(admin, process.id, {
        name: 'Invalid Step referencing Client B Person',
        stepType: 'MANUAL',
        position: 13,
        responsiblePersonId: personClientBId,
      }),
    ).rejects.toMatchObject({ code: 'CROSS_CLIENT_REFERENCE' });

    // 22. Clean up test process & verify 404 on get
    await deleteBusinessProcess(admin, process.id);
    await expect(getBusinessProcess(admin, process.id)).rejects.toMatchObject({
      code: 'BUSINESS_PROCESS_NOT_FOUND',
    });
  });
});
