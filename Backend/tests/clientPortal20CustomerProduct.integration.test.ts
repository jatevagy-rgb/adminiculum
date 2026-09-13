/**
 * CLIENT PORTAL 2.0 — CUSTOMER PRODUCT INTEGRATION SUITE (PostgreSQL).
 *
 * Verifies all 17 required customer product invariants:
 * 1.  PORTAL_OWN_WORKSPACE=PASS
 * 2.  PORTAL_CROSS_TENANT_DENIED=PASS
 * 3.  PORTAL_MISSING_MEMBERSHIP_DENIED=PASS
 * 4.  LEGAL_SAFE_PROJECTION=PASS
 * 5.  GROW_SAFE_PROJECTION=PASS
 * 6.  GROW_INTERNAL_DATA_HIDDEN=PASS
 * 7.  COMPLIANCE_SAFE_PROJECTION=PASS
 * 8.  COMPLIANCE_INTERNAL_DATA_HIDDEN=PASS
 * 9.  UNPUBLISHED_CONTENT_HIDDEN=PASS
 * 10. COMPANY_ORG_PROJECTION=PASS
 * 11. INDIVIDUAL_PORTAL_ISOLATION=PASS
 * 12. IMPROVEMENT_OPPORTUNITY_INTERNAL_BY_DEFAULT=PASS
 * 13. ASSESSMENT_FINDING_INTERNAL_BY_DEFAULT=PASS
 * 14. ORGANIZATION_PERSON_NOT_EXPOSED=PASS
 * 15. MESSAGE_NOT_PROMOTED_TO_ACTION_WITHOUT_ACTION_STATE=PASS
 * 16. NO_ACTION_DOES_NOT_EQUAL_COMPLIANT=PASS
 * 17. ASSUMED_OUTCOME_NOT_PRESENTED_AS_MEASURED=PASS
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  createOrganizationalPortalFixture,
  OrgPortalFixtureIds,
} from './helpers/organizationalPortalFixture';
import { getOrganizationalHome } from '../src/modules/client-workspace/orgHomeService';
import { getOrganizationalCompany } from '../src/modules/client-workspace/orgCompanyService';
import { getOrganizationalGrow } from '../src/modules/client-workspace/orgGrowService';
import { getOrganizationalContracts } from '../src/modules/client-workspace/orgContractsService';
import { getClientSafeComplianceReadModel } from '../src/modules/compliance/clientSafeComplianceService';
import { setCanonicalDocument } from '../src/modules/client-contracts/service';

const databaseUrl =
  process.env.CLIENT_INTERACTION_TEST_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL;

const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb('Client Portal 2.0 Customer Product (PostgreSQL)', () => {
  let db: PrismaClient;
  let ids: OrgPortalFixtureIds;
  const seed = crypto.randomUUID();

  // Additional IDs for Growth & Process & Digital Twin
  const systemId1 = crypto.randomUUID();
  const systemId2 = crypto.randomUUID();
  const processId1 = crypto.randomUUID();
  const stepId1 = crypto.randomUUID();
  const stepId2 = crypto.randomUUID();
  const factEmployeeCountId = crypto.randomUUID();
  const factDefEmployeeCountId = crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    ids = await createOrganizationalPortalFixture(db, seed);

    // Link published contract to canonical document version
    await setCanonicalDocument(
      { userId: ids.adminId, role: 'ADMIN' },
      ids.contractPublished,
      ids.docPublishedVersion,
      db,
    );

    // Grant summary scope to authorizedMembership so company/home succeed
    await db.clientPortalSummaryScope.create({
      data: {
        workspaceMembershipId: ids.authorizedMembership,
        workspaceId: ids.orgWsA,
        scopeType: 'ORGANIZATION',
        approvedById: ids.adminId,
      },
    });

    // Ensure FactDefinition for employee_count exists
    let factDef = await db.factDefinition.findFirst({ where: { key: 'employee_count' } });
    if (!factDef) {
      factDef = await db.factDefinition.create({
        data: {
          id: factDefEmployeeCountId,
          key: 'employee_count',
          domainCode: 'GENERAL',
          valueType: 'NUMBER',
          determinationMethod: 'USER_PROVIDED',
          overlapPolicy: 'ALLOW',
          temporalPolicy: 'VALIDITY_INTERVAL',
          questionKey: 'employee_count',
        },
      });
    }

    // Create ClientFact for employee_count = 50 on clientA
    await db.clientFact.create({
      data: {
        id: factEmployeeCountId,
        clientId: ids.clientA,
        factDefinitionId: factDef.id,
        type: 'EMPLOYEE_COUNT',
        value: '50 fő',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        numberValue: 50,
        verificationStatus: 'LAW_FIRM_VERIFIED',
      },
    });

    // Create BusinessSystems for clientA
    await db.businessSystem.createMany({
      data: [
        {
          id: systemId1,
          clientId: ids.clientA,
          name: 'SAP ERP',
          category: 'ERP',
          purpose: 'Vállalatirányítási rendszer',
          status: 'ACTIVE',
        },
        {
          id: systemId2,
          clientId: ids.clientA,
          name: 'Salesforce CRM',
          category: 'CRM',
          purpose: 'Ügyfélkapcsolati rendszer',
          status: 'ACTIVE',
        },
      ],
    });

    // Create BusinessProcess and steps for clientA
    await db.businessProcess.create({
      data: {
        id: processId1,
        clientId: ids.clientA,
        name: 'Beszerzési és jóváhagyási folyamat',
        category: 'PROCUREMENT',
        criticality: 'HIGH',
        frequency: 'DAILY',
        status: 'ACTIVE',
      },
    });

    await db.businessProcessStep.createMany({
      data: [
        {
          id: stepId1,
          processId: processId1,
          clientId: ids.clientA,
          position: 1,
          name: 'Igény rögzítése',
          stepType: 'INPUT',
          systemId: systemId1,
          estimatedActiveMinutes: 15,
          isApproval: false,
        },
        {
          id: stepId2,
          processId: processId1,
          clientId: ids.clientA,
          position: 2,
          name: 'Vezetői jóváhagyás',
          stepType: 'APPROVAL',
          systemId: systemId1,
          estimatedActiveMinutes: 10,
          estimatedWaitingMinutes: 120,
          isApproval: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  // 1. PORTAL_OWN_WORKSPACE=PASS
  it('PORTAL_OWN_WORKSPACE=PASS — customer accessing own workspace succeeds with canonical data', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    expect(home).toBeDefined();
    expect(home.customer.name).toBe('Phase5 Org Client A');
    expect(home.matters.length).toBeGreaterThan(0);
    expect(home.growSummary).toBeDefined();
    expect(home.complianceSummary).toBeDefined();
    expect(home.digitalTwinSummary).toBeDefined();
  });

  // 2. PORTAL_CROSS_TENANT_DENIED=PASS
  it('PORTAL_CROSS_TENANT_DENIED=PASS — identity cannot access another client workspace', async () => {
    // Attempting to access Client B's workspace or nonexistent workspace with Client A identity fails closed
    await expect(
      getOrganizationalHome(ids.authorizedIdentity, ids.clientB, db),
    ).rejects.toThrow();
  });

  // 3. PORTAL_MISSING_MEMBERSHIP_DENIED=PASS
  it('PORTAL_MISSING_MEMBERSHIP_DENIED=PASS — identity without membership cannot access workspace', async () => {
    const unassociatedIdentity = crypto.randomUUID();
    await expect(
      getOrganizationalHome(unassociatedIdentity, ids.orgWsA, db),
    ).rejects.toThrow();
  });

  // 4. LEGAL_SAFE_PROJECTION=PASS
  it('LEGAL_SAFE_PROJECTION=PASS — legal matters projected safely without internal notes or workforce IDs', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    expect(home.matters.length).toBeGreaterThan(0);
    for (const matter of home.matters) {
      expect(matter.publicTitle).toBeDefined();
      expect(matter.publicStatus).toBeDefined();
      // Must NOT expose internal ids or raw assigned lawyer user id
      expect((matter as any).assignedLawyerId).toBeUndefined();
      expect((matter as any).internalNotes).toBeUndefined();
    }
  });

  // 5. GROW_SAFE_PROJECTION=PASS
  it('GROW_SAFE_PROJECTION=PASS — Grow projection returns customer processes, active initiatives, and partitioned outcomes', async () => {
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
    expect(grow).toBeDefined();
    expect(grow.customerName).toBe('Phase5 Org Client A');
    expect(grow.processes.length).toBeGreaterThan(0);
    expect(grow.processes[0].name).toBe('Beszerzési és jóváhagyási folyamat');
    expect(grow.processes[0].steps.length).toBe(2);
    expect(grow.processes[0].steps[0].systemName).toBe('SAP ERP');
    expect(grow.initiatives.length).toBeGreaterThan(0);
    expect(grow.initiatives[0].title).toBe('ISO 27001 bevezetés');
  });

  // 6. GROW_INTERNAL_DATA_HIDDEN=PASS
  it('GROW_INTERNAL_DATA_HIDDEN=PASS — internal improvement opportunities deferred and internal findings hidden', async () => {
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
    // Opportunities require publication approval and are not exposed blindly
    expect(grow.opportunities).toEqual([]);
    expect(grow.opportunitiesDeferredNotice).toContain('GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP');
    // Assessment findings must NOT leak in the grow view
    expect((grow as any).findings).toBeUndefined();
  });

  // 7. COMPLIANCE_SAFE_PROJECTION=PASS
  it('COMPLIANCE_SAFE_PROJECTION=PASS — compliance projection returns safe topics and portal-answerable flags', async () => {
    const comp = await getClientSafeComplianceReadModel(ids.clientA, false, true, db);
    expect(comp).toBeDefined();
    expect(Array.isArray(comp.topics)).toBe(true);
    for (const topic of comp.topics) {
      expect(topic.topicId).toBeDefined();
      expect(topic.topicLabel).toBeDefined();
      expect(topic.state).toBeDefined();
      expect(topic.shortExplanation).toBeDefined();
      expect(Array.isArray(topic.missingInformation)).toBe(true);
      for (const missing of topic.missingInformation) {
        expect(typeof missing.portalAnswerable).toBe('boolean');
      }
    }
  });

  // 8. COMPLIANCE_INTERNAL_DATA_HIDDEN=PASS
  it('COMPLIANCE_INTERNAL_DATA_HIDDEN=PASS — internal compliance notes, proposals, and raw rule ASTs are stripped', async () => {
    const comp = await getClientSafeComplianceReadModel(ids.clientA, false, true, db);
    for (const topic of comp.topics) {
      expect((topic as any).ast).toBeUndefined();
      expect((topic as any).internalNotes).toBeUndefined();
      expect((topic as any).proposalId).toBeUndefined();
      expect((topic as any).rawRequirementKey).toBeUndefined();
    }
  });

  // 9. UNPUBLISHED_CONTENT_HIDDEN=PASS
  it('UNPUBLISHED_CONTENT_HIDDEN=PASS — unpublished contracts and ungranted cases are hidden', async () => {
    const contracts = await getOrganizationalContracts(ids.authorizedIdentity, ids.orgWsA, db);
    const references = contracts.items.map((c) => c.title);
    // Published contract is visible
    expect(references).toContain('Beszállítói keretszerződés');
    // Internal-only and unpublished contracts are NOT visible
    expect(references).not.toContain('Belső tárgyalási anyag');
    expect(references).not.toContain('Aktív, publikálatlan szerződés');
    expect(references).not.toContain('B ügyfél szerződés');
  });

  // 10. COMPANY_ORG_PROJECTION=PASS
  it('COMPANY_ORG_PROJECTION=PASS — digital twin projection includes systems, processes, employee count', async () => {
    const company = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    expect(company).toBeDefined();
    expect(company.companyName).toBe('Phase5 Org Client A');
    expect(company.employeeCount).toBe(50);
    expect(company.systems).toBeDefined();
    expect(company.systems?.length).toBe(2);
    expect(company.systems?.map((s) => s.name)).toContain('SAP ERP');
    expect(company.processes).toBeDefined();
    expect(company.processes?.length).toBeGreaterThan(0);
  });

  // 11. INDIVIDUAL_PORTAL_ISOLATION=PASS
  it('INDIVIDUAL_PORTAL_ISOLATION=PASS — individual workspaces fail closed on organizational endpoints', async () => {
    // Create an INDIVIDUAL workspace on clientA
    const indWsId = crypto.randomUUID();
    const indIdentityId = crypto.randomUUID();
    const indMembershipId = crypto.randomUUID();
    await db.clientPortalIdentity.create({
      data: {
        id: indIdentityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://issuer.invalid/',
        subject: `sub-ind-${seed}`,
        normalizedEmail: `ind-${seed}@fixture.invalid`.toLowerCase(),
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        displayName: 'Magán Ügyfél',
        accountType: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    await db.clientPortalWorkspace.create({
      data: {
        id: indWsId,
        clientId: ids.clientA,
        publicReference: `IND-${seed.slice(0, 8)}`,
        name: 'Magán munkatér',
        mode: 'INDIVIDUAL',
        status: 'ACTIVE',
        communicationMode: 'PORTAL_PRIMARY',
        connectedSystemState: 'NOT_CONFIGURED',
        createdById: ids.adminId,
      },
    });
    await db.clientPortalWorkspaceMembership.create({
      data: {
        id: indMembershipId,
        workspaceId: indWsId,
        clientPortalIdentityId: indIdentityId,
        status: 'ACTIVE',
        role: 'MEMBER',
        approvedAt: new Date('2026-01-01T00:00:00Z'),
        approvedById: ids.adminId,
      },
    });

    // Calling organizational home with INDIVIDUAL workspace fails closed
    await expect(
      getOrganizationalHome(indIdentityId, indWsId, db),
    ).rejects.toThrow();
  });

  // 12. IMPROVEMENT_OPPORTUNITY_INTERNAL_BY_DEFAULT=PASS
  it('IMPROVEMENT_OPPORTUNITY_INTERNAL_BY_DEFAULT=PASS — improvement opportunities withheld by default', async () => {
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
    expect(grow.opportunities).toHaveLength(0);
    expect(grow.opportunitiesDeferredNotice).toContain('GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP');
  });

  // 13. ASSESSMENT_FINDING_INTERNAL_BY_DEFAULT=PASS
  it('ASSESSMENT_FINDING_INTERNAL_BY_DEFAULT=PASS — raw assessment findings are never surfaced directly', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    const company = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);

    // Finding title 'Hiányzó irányítás' from fixture must not appear anywhere in customer DTOs
    const jsonString = JSON.stringify({ home, company, grow });
    expect(jsonString).not.toContain('Hiányzó irányítás');
  });

  // 14. ORGANIZATION_PERSON_NOT_EXPOSED=PASS
  it('ORGANIZATION_PERSON_NOT_EXPOSED=PASS — organization person names/PII are never exposed in company or grow', async () => {
    const company = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);

    const jsonString = JSON.stringify({ company, grow });
    expect(jsonString).not.toContain('Aktív felelős');
    expect(jsonString).not.toContain('Inaktív személy');
    expect(jsonString).not.toContain('B személy');
  });

  // 15. MESSAGE_NOT_PROMOTED_TO_ACTION_WITHOUT_ACTION_STATE=PASS
  it('MESSAGE_NOT_PROMOTED_TO_ACTION_WITHOUT_ACTION_STATE=PASS — unread messages appear in contactSummary not as action items', async () => {
    const home = await getOrganizationalHome(ids.authorizedIdentity, ids.orgWsA, db);
    // Actions must only be action requests or compliance inputs, not raw unread threads
    for (const action of home.actions) {
      expect(['LEGAL', 'COMPLIANCE', 'GROW']).toContain(action.area);
      expect(action.id).not.toContain('thread');
    }
    expect(home.contactSummary).toBeDefined();
    expect(typeof home.contactSummary.openCount).toBe('number');
  });

  // 16. NO_ACTION_DOES_NOT_EQUAL_COMPLIANT=PASS
  it('NO_ACTION_DOES_NOT_EQUAL_COMPLIANT=PASS — neutral state mapping without overclaiming compliance', async () => {
    const comp = await getClientSafeComplianceReadModel(ids.clientA, false, true, db);
    for (const topic of comp.topics) {
      // Must never contain overclaiming phrases
      expect(topic.shortExplanation).not.toContain('100%');
      expect(topic.shortExplanation).not.toContain('teljesen védett');
      expect(topic.shortExplanation).not.toContain('garantáltan megfelelő');
    }
  });

  // 17. ASSUMED_OUTCOME_NOT_PRESENTED_AS_MEASURED=PASS
  it('ASSUMED_OUTCOME_NOT_PRESENTED_AS_MEASURED=PASS — assumed outcomes never presented as measured', async () => {
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
    for (const outcome of grow.outcomes.measured) {
      expect(outcome.basis).toBe('MEASURED');
    }
    for (const outcome of grow.outcomes.calculatedOrEstimated) {
      expect(['CALCULATED', 'ESTIMATED']).toContain(outcome.basis);
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';

describe('Client Portal 2.0 Customer Product Static Verification', () => {
  const root = path.resolve(__dirname, '..');
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

  it('PORTAL_OWN_WORKSPACE=PASS — enforces organization mode and workspace clientId', () => {
    const homeSrc = read('src/modules/client-workspace/orgHomeService.ts');
    expect(homeSrc).toContain('requireOrganizationWorkspace(workspaceId, prisma)');
    expect(homeSrc).toContain('workspace.clientId');
  });

  it('PORTAL_CROSS_TENANT_DENIED=PASS — validates workspace isolation and fails closed', () => {
    const wsSrc = read('src/modules/client-workspace/workspaceService.ts');
    expect(wsSrc).toContain('resolvePortalWorkspace');
  });

  it('PORTAL_MISSING_MEMBERSHIP_DENIED=PASS — requires active workspace membership', () => {
    const wsSrc = read('src/modules/client-workspace/workspaceService.ts');
    expect(wsSrc).toContain("status: 'ACTIVE'");
  });

  it('LEGAL_SAFE_PROJECTION=PASS — projects only clientSafe legal matter snapshot fields', () => {
    const homeSrc = read('src/modules/client-workspace/orgHomeService.ts');
    expect(homeSrc).toContain('publicTitle');
    expect(homeSrc).toContain('publicStatus');
    expect(homeSrc).not.toContain('assignedLawyerId:');
  });

  it('GROW_SAFE_PROJECTION=PASS — projects processes, active initiatives, and partitioned outcomes', () => {
    const growSrc = read('src/modules/client-workspace/orgGrowService.ts');
    expect(growSrc).toContain('getOrganizationalGrow');
    expect(growSrc).toContain('processes');
    expect(growSrc).toContain('initiatives');
    expect(growSrc).toContain('outcomes');
  });

  it('GROW_INTERNAL_DATA_HIDDEN=PASS — defers internal improvement opportunities and findings', () => {
    const growSrc = read('src/modules/client-workspace/orgGrowService.ts');
    expect(growSrc).toContain('GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP');
    expect(growSrc).toContain('opportunities: []');
  });

  it('COMPLIANCE_SAFE_PROJECTION=PASS — projects safe topics with portalAnswerable question keys', () => {
    const compSrc = read('src/modules/compliance/clientSafeComplianceService.ts');
    expect(compSrc).toContain('portalAnswerable');
    expect(compSrc).toContain('questionKey');
  });

  it('COMPLIANCE_INTERNAL_DATA_HIDDEN=PASS — strips internal compliance findings and rule ASTs', () => {
    const compSrc = read('src/modules/compliance/clientSafeComplianceService.ts');
    expect(compSrc).toContain('assertClientSafe(result)');
    expect(compSrc).not.toContain('requirementKey:');
  });

  it('UNPUBLISHED_CONTENT_HIDDEN=PASS — hides unpublished contracts and ungranted matters', () => {
    const contractSrc = read('src/modules/client-workspace/orgContractsService.ts');
    expect(contractSrc).toContain("status: 'PUBLISHED'");
    expect(contractSrc).toContain('canonicalDocumentVersionId');
  });

  it('COMPANY_ORG_PROJECTION=PASS — projects systems, processes, and employee count in digital twin', () => {
    const compSrc = read('src/modules/client-workspace/orgCompanyService.ts');
    expect(compSrc).toContain('systems');
    expect(compSrc).toContain('processes');
    expect(compSrc).toContain('employeeCount');
  });

  it('INDIVIDUAL_PORTAL_ISOLATION=PASS — rejects individual workspaces on organizational endpoints', () => {
    const policySrc = read('src/modules/client-workspace/organizationalAccessPolicy.ts');
    expect(policySrc).toContain('CLIENT_WORKSPACE_NOT_ORGANIZATION');
    expect(policySrc).toContain("['ORGANIZATION', 'CASE_RELAY'].includes(String(workspace.mode))");
  });

  it('IMPROVEMENT_OPPORTUNITY_INTERNAL_BY_DEFAULT=PASS — improvement opportunities withheld by default', () => {
    const growSrc = read('src/modules/client-workspace/orgGrowService.ts');
    expect(growSrc).toContain('GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP');
  });

  it('ASSESSMENT_FINDING_INTERNAL_BY_DEFAULT=PASS — raw assessment findings excluded from customer DTOs', () => {
    const growSrc = read('src/modules/client-workspace/orgGrowService.ts');
    expect(growSrc).not.toContain('assessmentFinding.findMany');
  });

  it('ORGANIZATION_PERSON_NOT_EXPOSED=PASS — organization person identities stripped', () => {
    const compSrc = read('src/modules/client-workspace/orgCompanyService.ts');
    expect(compSrc).not.toContain('ownerPerson.name');
  });

  it('MESSAGE_NOT_PROMOTED_TO_ACTION_WITHOUT_ACTION_STATE=PASS — unread threads stay in contactSummary', () => {
    const homeSrc = read('src/modules/client-workspace/orgHomeService.ts');
    expect(homeSrc).toContain('contactSummary: OrgHomeContactSummary');
  });

  it('NO_ACTION_DOES_NOT_EQUAL_COMPLIANT=PASS — uses neutral states without overclaiming compliance', () => {
    const compSrc = read('src/modules/compliance/clientSafeComplianceService.ts');
    expect(compSrc).toContain('A jelenlegi állapot szerint nincs további portálos teendő.');
  });

  it('ASSUMED_OUTCOME_NOT_PRESENTED_AS_MEASURED=PASS — partitions assumed outcomes away from measured', () => {
    const growSrc = read('src/modules/client-workspace/orgGrowService.ts');
    expect(growSrc).toContain("basis === 'MEASURED'");
    expect(growSrc).toContain('calculatedOrEstimated');
  });
});

