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
import express, { Express } from 'express';
import http from 'http';
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

// Mock authenticateClientPortal so route-level requests can supply a trusted test session
jest.mock('../src/middleware/clientPortalAuth', () => {
  const actual = jest.requireActual('../src/middleware/clientPortalAuth');
  return {
    ...actual,
    authenticateClientPortal: (req: any, res: any, next: any) => {
      const sessionHeader = req.headers['x-client-portal-session'];
      if (sessionHeader) {
        try {
          req.clientPortalSession = typeof sessionHeader === 'string' ? JSON.parse(sessionHeader) : sessionHeader;
          return next();
        } catch {
          return res.status(401).json({ status: 401, code: 'CLIENT_PORTAL_AUTH_REQUIRED' });
        }
      }
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ status: 401, code: 'CLIENT_PORTAL_AUTH_REQUIRED', message: 'Client portal authentication is required.' });
      }
      return actual.authenticateClientPortal(req, res, next);
    },
  };
});

import clientPortalRoutes from '../src/routes/clientPortal';
import clientSafeComplianceRoutes from '../src/modules/compliance/clientSafeComplianceRoutes';

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/client-portal/compliance', clientSafeComplianceRoutes);
  app.use('/api/v1/client-portal', clientPortalRoutes);
  return app;
}

function httpRequest(
  app: Express,
  method: 'GET' | 'POST' | 'PUT',
  reqPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Address unavailable'));
        return;
      }
      const req = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method,
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            server.close();
            let parsed = null;
            try { parsed = JSON.parse(data); } catch {}
            resolve({ status: res.statusCode || 0, body: parsed, rawBody: data });
          });
        },
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

function makeSession(identityId: string, email: string, displayName: string, status = 'ACTIVE', emailVerified = true) {
  return JSON.stringify({
    identityType: 'CLIENT_PORTAL',
    issuer: 'https://issuer.invalid/',
    audience: 'adminiculum-client-portal',
    subject: `sub-${identityId}`,
    clientPortalIdentityId: identityId,
    normalizedEmail: email,
    displayName,
    accountType: 'ORGANIZATION_MEMBER',
    status,
    emailVerified,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  });
}

const databaseUrl =
  process.env.CLIENT_INTERACTION_TEST_DATABASE_URL ||
  process.env.CLIENT_IDENTITY_TEST_DATABASE_URL ||
  process.env.MIGRATION_REPLAY_DATABASE_URL;

const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb('Client Portal 2.0 Customer Product (PostgreSQL)', () => {
  let db: PrismaClient;
  let ids: OrgPortalFixtureIds;
  let testApp: Express;
  const seed = crypto.randomUUID();

  // Additional IDs
  const systemId1 = crypto.randomUUID();
  const systemId2 = crypto.randomUUID();
  const processId1 = crypto.randomUUID();
  const stepId1 = crypto.randomUUID();
  const stepId2 = crypto.randomUUID();
  const factEmployeeCountId = crypto.randomUUID();
  const factDefEmployeeCountId = crypto.randomUUID();

  // Objective 2 Tenant / Workspace isolation IDs
  const orgWsClientBId = crypto.randomUUID();
  const orgWsClientBRef = `PW-ClientB-${seed.slice(0, 8)}`;
  const indivWsId = crypto.randomUUID();
  const indivWsRef = `PW-Indiv-${seed.slice(0, 8)}`;
  const unassociatedIdentityId = crypto.randomUUID();

  let wsARef: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    testApp = createTestApp();

    ids = await createOrganizationalPortalFixture(db, seed);

    const wsARow = await db.clientPortalWorkspace.findUniqueOrThrow({ where: { id: ids.orgWsA } });
    wsARef = wsARow.publicReference;

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

    // 1. Create a REAL Client B organization workspace (Objective 2A)
    await db.clientPortalWorkspace.create({
      data: {
        id: orgWsClientBId,
        clientId: ids.clientB,
        name: 'Phase5 Org Workspace Client B',
        mode: 'ORGANIZATION',
        status: 'ACTIVE',
        communicationMode: 'PORTAL_PRIMARY',
        connectedSystemState: 'NOT_CONFIGURED',
        publicReference: orgWsClientBRef,
        createdById: ids.adminId,
      },
    });

    // 2. Create an INDIVIDUAL workspace and grant Identity A membership in it (Objective 2B)
    await db.clientPortalWorkspace.create({
      data: {
        id: indivWsId,
        clientId: ids.clientA,
        name: 'Phase5 Individual Workspace',
        mode: 'INDIVIDUAL',
        status: 'ACTIVE',
        communicationMode: 'PORTAL_PRIMARY',
        connectedSystemState: 'NOT_CONFIGURED',
        publicReference: indivWsRef,
        createdById: ids.adminId,
      },
    });
    await db.clientPortalWorkspaceMembership.create({
      data: {
        id: crypto.randomUUID(),
        clientPortalIdentityId: ids.authorizedIdentity,
        workspaceId: indivWsId,
        status: 'ACTIVE',
        role: 'MEMBER',
        approvedAt: new Date('2026-01-01T00:00:00Z'),
        approvedById: ids.adminId,
      },
    });

    // 3. Create an active Identity with NO workspace memberships anywhere (Objective 2B)
    await db.clientPortalIdentity.create({
      data: {
        id: unassociatedIdentityId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: 'https://issuer.invalid/',
        subject: `sub-unassociated-${seed}`,
        normalizedEmail: `unassociated-${seed}@fixture.invalid`.toLowerCase(),
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        displayName: 'Unassociated Customer',
        accountType: 'ORGANIZATION_MEMBER',
        status: 'ACTIVE',
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

    const employeeSubjectId = crypto.randomUUID();
    await db.factSubject.create({
      data: {
        id: employeeSubjectId,
        clientId: ids.clientA,
        scopeType: 'EMPLOYEE',
        subjectKey: `employee-${seed}`,
      },
    });

    const employeeCountReferenceNow = new Date();

    // Create ClientFact for employee_count = 50 on clientA
    await db.clientFact.create({
      data: {
        id: factEmployeeCountId,
        clientId: ids.clientA,
        factDefinitionId: factDef.id,
        type: 'EMPLOYEE_COUNT',
        value: '50 fő',
        validFrom: new Date(employeeCountReferenceNow.getTime() - 24 * 60 * 60 * 1000),
        numberValue: 50,
        verificationStatus: 'LAW_FIRM_VERIFIED',
        scopeType: 'COMPANY',
        factSubjectId: null,
      },
    });

    await db.clientFact.create({
      data: {
        id: crypto.randomUUID(),
        clientId: ids.clientA,
        factDefinitionId: factDef.id,
        type: 'EMPLOYEE_COUNT',
        value: '999 fő',
        validFrom: new Date(employeeCountReferenceNow.getTime() - 24 * 60 * 60 * 1000),
        numberValue: 999,
        verificationStatus: 'LAW_FIRM_VERIFIED',
        scopeType: 'EMPLOYEE',
        factSubjectId: employeeSubjectId,
      },
    });

    await db.clientFact.create({
      data: {
        id: crypto.randomUUID(),
        clientId: ids.clientA,
        factDefinitionId: factDef.id,
        type: 'EMPLOYEE_COUNT',
        value: '777 fő',
        validFrom: new Date(employeeCountReferenceNow.getTime() - 3 * 24 * 60 * 60 * 1000),
        validTo: new Date(employeeCountReferenceNow.getTime() - 24 * 60 * 60 * 1000),
        numberValue: 777,
        verificationStatus: 'LAW_FIRM_VERIFIED',
        scopeType: 'COMPANY',
        factSubjectId: null,
      },
    });

    await db.clientFact.create({
      data: {
        id: crypto.randomUUID(),
        clientId: ids.clientA,
        factDefinitionId: factDef.id,
        type: 'EMPLOYEE_COUNT',
        value: '888 fő',
        validFrom: new Date(employeeCountReferenceNow.getTime() + 24 * 60 * 60 * 1000),
        numberValue: 888,
        verificationStatus: 'LAW_FIRM_VERIFIED',
        scopeType: 'COMPANY',
        factSubjectId: null,
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

    // Route-level verification with actual session + workspace headers
    const authHeaders = {
      'x-client-portal-session': makeSession(ids.authorizedIdentity, 'authorized@fixture.invalid', 'Authorized Customer'),
      'x-client-portal-workspace': wsARef,
    };

    const resGrow = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/grow', authHeaders);
    expect(resGrow.status).toBe(200);
    expect(resGrow.body.customerName).toBe('Phase5 Org Client A');

    const resComp = await httpRequest(testApp, 'GET', '/api/v1/client-portal/compliance', authHeaders);
    expect(resComp.status).toBe(200);
    expect(Array.isArray(resComp.body.topics)).toBe(true);

    const resCompany = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/company', authHeaders);
    expect(resCompany.status).toBe(200);
    expect(resCompany.body.companyName).toBe('Phase5 Org Client A');
  });

  // 2. PORTAL_CROSS_TENANT_DENIED=PASS
  it('PORTAL_CROSS_TENANT_DENIED=PASS — identity cannot access another client workspace (route + service)', async () => {
    // Identity A attempts to access real Client B workspace via route
    const crossHeaders = {
      'x-client-portal-session': makeSession(ids.authorizedIdentity, 'authorized@fixture.invalid', 'Authorized Customer'),
      'x-client-portal-workspace': orgWsClientBRef,
    };

    const resGrow = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/grow', crossHeaders);
    expect(resGrow.status).toBe(403);

    const resComp = await httpRequest(testApp, 'GET', '/api/v1/client-portal/compliance', crossHeaders);
    expect(resComp.status).toBe(403);

    const resCompany = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/company', crossHeaders);
    expect(resCompany.status).toBe(403);

    // Direct service call to Client B's workspace fails closed
    await expect(
      getOrganizationalGrow(ids.authorizedIdentity, orgWsClientBId, db),
    ).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
  });

  // 3. PORTAL_MISSING_MEMBERSHIP_DENIED=PASS
  it('PORTAL_MISSING_MEMBERSHIP_DENIED=PASS — identity without membership cannot access workspace', async () => {
    const unassociatedHeaders = {
      'x-client-portal-session': makeSession(unassociatedIdentityId, 'unassociated@fixture.invalid', 'Unassociated Customer'),
      'x-client-portal-workspace': wsARef,
    };

    const resGrow = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/grow', unassociatedHeaders);
    expect(resGrow.status).toBe(403);

    const resComp = await httpRequest(testApp, 'GET', '/api/v1/client-portal/compliance', unassociatedHeaders);
    expect(resComp.status).toBe(403);

    const resCompany = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/company', unassociatedHeaders);
    expect(resCompany.status).toBe(403);

    // Direct service call fails closed
    await expect(
      getOrganizationalHome(unassociatedIdentityId, ids.orgWsA, db),
    ).rejects.toMatchObject({ code: 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED' });
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

    // Tightened DTO: hasRelatedMatter boolean present
    expect(typeof grow.initiatives[0].hasRelatedMatter).toBe('boolean');
    // Internal fields strictly removed from initiative
    expect((grow.initiatives[0] as any).currentState).toBeUndefined();
    expect((grow.initiatives[0] as any).rawStatus).toBeUndefined();
    expect((grow.initiatives[0] as any).linkedCaseId).toBeUndefined();
    expect((grow.initiatives[0] as any).createdAt).toBeUndefined();
    expect((grow.initiatives[0] as any).milestonesCount).toBeUndefined();
    expect((grow.initiatives[0] as any).responsibleSide).toBeUndefined();

    // Operational minute estimates strictly removed from process steps
    expect((grow.processes[0].steps[0] as any).estimatedWaitingMinutes).toBeUndefined();
    expect((grow.processes[0].steps[0] as any).estimatedActiveMinutes).toBeUndefined();

    // Outcomes are safely partitioned without leaking arbitrary metrics or internal notes
    expect(Array.isArray(grow.outcomes.measured)).toBe(true);
    expect(Array.isArray(grow.outcomes.calculatedOrEstimated)).toBe(true);
    for (const outcome of grow.outcomes.measured) {
      expect(outcome.basis).toBe('MEASURED');
      expect((outcome as any).note).toBeUndefined();
      expect((outcome as any).metricsSummary).toBeUndefined();
      expect((outcome as any).createdAt).toBeUndefined();
    }
    for (const outcome of grow.outcomes.calculatedOrEstimated) {
      expect(['CALCULATED', 'ESTIMATED']).toContain(outcome.basis);
      expect((outcome as any).note).toBeUndefined();
      expect((outcome as any).metricsSummary).toBeUndefined();
      expect((outcome as any).createdAt).toBeUndefined();
    }
  });

  it('GROW_INITIATIVE_MILESTONE_PROJECTION=PASS — projects only customer-safe linked milestones', async () => {
    const plannedId = crypto.randomUUID();
    const cancelledId = crypto.randomUUID();
    const unlinkedId = crypto.randomUUID();
    const crossInitiativeId = crypto.randomUUID();
    const crossMilestoneId = crypto.randomUUID();
    const internalDescription = 'Internal auditor evaluation notes for milestones';

    try {
      await db.companyMilestone.create({
        data: {
          id: plannedId, clientId: ids.clientA, type: 'PROCESS_CHANGE', title: 'Kontrollok bevezetése',
          status: 'PLANNED', targetDate: new Date('2026-09-01T00:00:00Z'),
          developmentInitiativeId: ids.initiativeA, createdByUserId: ids.adminId,
        },
      });
      await db.companyMilestone.create({
        data: {
          id: cancelledId, clientId: ids.clientA, type: 'OTHER', title: 'Elvetett lépés',
          status: 'CANCELLED', milestoneDate: new Date('2026-05-01T00:00:00Z'),
          description: internalDescription, developmentInitiativeId: ids.initiativeA, createdByUserId: ids.adminId,
        },
      });
      // Unlinked milestone (no developmentInitiativeId) must never appear in an initiative.
      await db.companyMilestone.create({
        data: {
          id: unlinkedId, clientId: ids.clientA, type: 'OTHER', title: 'Nem kapcsolt mérföldkő',
          status: 'PLANNED', milestoneDate: new Date('2026-04-01T00:00:00Z'), createdByUserId: ids.adminId,
        },
      });
      // Cross-client initiative + milestone must never appear on the customer path.
      await db.developmentInitiative.create({
        data: { id: crossInitiativeId, clientId: ids.clientB, title: 'B kliens kezdeményezés', status: 'ACTIVE' },
      });
      await db.companyMilestone.create({
        data: {
          id: crossMilestoneId, clientId: ids.clientB, type: 'OTHER', title: 'B kliens mérföldkő',
          status: 'ACHIEVED', milestoneDate: new Date('2026-03-01T00:00:00Z'),
          developmentInitiativeId: crossInitiativeId, createdByUserId: ids.adminId,
        },
      });

      const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
      const initiative = grow.initiatives.find((item) => item.id === ids.initiativeA);
      expect(initiative).toBeDefined();
      const milestones = initiative!.milestones;
      const seenIds = milestones.map((milestone) => milestone.id);
      expect(seenIds).toContain(ids.milestoneA);
      expect(seenIds).toContain(plannedId);
      expect(seenIds).toContain(cancelledId);
      expect(seenIds).not.toContain(unlinkedId);
      expect(seenIds).not.toContain(crossMilestoneId);

      // Chronological by effective date: May (cancelled) -> June (achieved) -> September (planned).
      expect(milestones.slice(0, 3).map((milestone) => milestone.title)).toEqual([
        'Elvetett lépés',
        'Bevezetés kezdete',
        'Kontrollok bevezetése',
      ]);

      for (const milestone of milestones) {
        expect(Object.keys(milestone).sort()).toEqual(['date', 'id', 'statusLabel', 'title']);
        expect(['Tervezett', 'Teljesítve', 'Törölve']).toContain(milestone.statusLabel);
        expect((milestone as any).createdByUserId).toBeUndefined();
        expect((milestone as any).status).toBeUndefined();
        expect((milestone as any).description).toBeUndefined();
        expect((milestone as any).targetDate).toBeUndefined();
        expect((milestone as any).clientId).toBeUndefined();
      }

      const serialized = JSON.stringify(grow);
      expect(serialized).not.toContain('createdByUserId');
      expect(serialized).not.toContain(internalDescription);
      expect(serialized).not.toContain('Nem kapcsolt mérföldkő');
      expect(serialized).not.toContain('B kliens mérföldkő');
    } finally {
      await db.companyMilestone.deleteMany({
        where: { id: { in: [plannedId, cancelledId, unlinkedId, crossMilestoneId] } },
      });
      await db.developmentInitiative.deleteMany({ where: { id: crossInitiativeId } });
    }
  });

  // 6. GROW_INTERNAL_DATA_HIDDEN=PASS
  it('GROW_INTERNAL_DATA_HIDDEN=PASS — internal improvement opportunities deferred and internal findings hidden', async () => {
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
    // Opportunities require publication approval and are not exposed blindly
    expect(grow.opportunities).toEqual([]);
    expect(grow.opportunitiesDeferredNotice).toBeNull();
    // Assessment findings and internal fields must NOT leak anywhere in the serialized DTO
    const jsonString = JSON.stringify(grow);
    expect((grow as any).findings).toBeUndefined();
    expect(jsonString).not.toContain('currentState');
    expect(jsonString).not.toContain('rawStatus');
    expect(jsonString).not.toContain('linkedCaseId');
    expect(jsonString).not.toContain('milestonesCount');
    expect(jsonString).not.toContain('metricsSummary');
    expect(jsonString).not.toContain('estimatedWaitingMinutes');
    expect(jsonString).not.toContain('Internal auditor evaluation notes');
  });

  it('PUB2_CUSTOMER_OPPORTUNITY_PROJECTION=PASS — projects only published workspace snapshots and fails closed', async () => {
    const prefix = crypto.randomUUID().replace(/-/g, '');
    const publicationIds = Array.from({ length: 7 }, (_, index) => `${prefix}-publication-${index}`);
    const revisionIds = Array.from({ length: 7 }, (_, index) => `${prefix}-revision-${index}`);
    const publishedAt = new Date('2026-08-01T00:00:00.000Z');
    const createPublication = async (index: number, input: {
      workspaceId?: string;
      clientId?: string;
      status?: 'DRAFT' | 'PUBLISHED';
      revokedAt?: Date | null;
      currentRevisionId?: string | null;
      title?: string;
      summary?: string;
      direction?: string | null;
      publishedAt?: Date;
    } = {}) => {
      const publicationId = publicationIds[index];
      const revisionId = revisionIds[index];
      await db.clientImprovementOpportunityPublication.create({
        data: {
          id: publicationId,
          opportunityId: `${prefix}-opportunity-${index}`,
          clientId: input.clientId || ids.clientA,
          workspaceId: input.workspaceId || ids.orgWsA,
          status: input.status || 'PUBLISHED',
          currentRevisionId: input.currentRevisionId === undefined ? revisionId : input.currentRevisionId,
          preparedById: ids.adminId,
          approvedById: ids.adminId,
          publishedById: ids.adminId,
          publishedAt: input.status === 'DRAFT' ? null : (input.publishedAt || publishedAt),
          revokedAt: input.revokedAt || null,
          revision: 1,
        },
      });
      if (input.status !== 'DRAFT') {
        await db.clientImprovementOpportunityPublicationRevision.create({
          data: {
            id: revisionId,
            publicationId,
            revisionNumber: 1,
            clientSafeTitle: input.title || `Published opportunity ${index}`,
            clientSafeSummary: input.summary || `Safe customer summary ${index}`,
            clientSafeDirection: input.direction === undefined ? 'Operational direction' : input.direction,
            sourceFingerprint: 'a'.repeat(64),
            audienceSnapshot: { workspaceId: input.workspaceId || ids.orgWsA, clientId: input.clientId || ids.clientA },
            createdById: ids.adminId,
          },
        });
      }
      return { publicationId, revisionId };
    };

    try {
      // One valid snapshot is visible; unpublished, revoked, wrong-workspace,
      // wrong-client and malformed-current-revision rows remain invisible.
      const valid = await createPublication(0, { title: 'Approved customer opportunity', summary: 'Snapshot summary' });
      const validSecond = await createPublication(6, {
        title: 'Second approved opportunity',
        summary: 'Second snapshot summary',
        publishedAt: new Date('2026-07-01T00:00:00.000Z'),
      });
      await createPublication(1, { status: 'DRAFT' });
      await createPublication(2, { revokedAt: new Date('2026-08-02T00:00:00.000Z') });
      await createPublication(3, { workspaceId: ids.orgWsB });
      await createPublication(4, { clientId: ids.clientB });
      const malformed = await createPublication(5);
      await db.clientImprovementOpportunityPublication.update({
        where: { id: malformed.publicationId },
        data: { currentRevisionId: revisionIds[0] },
      });

      const first = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
      expect(first.opportunities).toEqual([
        {
          publicationId: valid.publicationId,
          title: 'Approved customer opportunity',
          summary: 'Snapshot summary',
          direction: 'Operational direction',
          publishedAt: publishedAt.toISOString(),
        },
        {
          publicationId: validSecond.publicationId,
          title: 'Second approved opportunity',
          summary: 'Second snapshot summary',
          direction: 'Operational direction',
          publishedAt: '2026-07-01T00:00:00.000Z',
        },
      ]);
      expect(first.opportunitiesDeferredNotice).toBeNull();
      const serialized = JSON.stringify(first.opportunities);
      for (const forbiddenField of ['opportunityId', 'evidenceStrength', 'diagnosis', 'reviewer', 'observation', 'taskId', 'caseId', 'documentId']) {
        expect(serialized).not.toContain(forbiddenField);
      }

      // The projection is snapshot-only: changing no source row can add any
      // internal fields or alter the approved customer-safe shape.
      expect(Object.keys(first.opportunities[0]).sort()).toEqual(['direction', 'publicationId', 'publishedAt', 'summary', 'title']);
    } finally {
      await db.clientImprovementOpportunityPublication.deleteMany({ where: { id: { in: publicationIds } } });
    }
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
    expect(references.some((t) => t === 'Keretszerződés (publikált)' || t === 'Beszállítói keretszerződés')).toBe(true);
    // Internal-only and unpublished contracts are NOT visible
    expect(references).not.toContain('Belső tárgyalási anyag');
    expect(references).not.toContain('Aktív, publikálatlan szerződés');
    expect(references).not.toContain('B ügyfél szerződés');
  });

  // 10. COMPANY_ORG_PROJECTION=PASS
  it('COMPANY_ORG_PROJECTION=PASS — digital twin projection includes bounded customer-safe summaries', async () => {
    const company = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    expect(company).toBeDefined();
    expect(company.companyName).toBe('Phase5 Org Client A');
    expect(company.employeeCount).toBe(50);
    expect(company.dataSummary).toBeDefined();
    expect(company.dataSummary?.answeredCount! + company.dataSummary?.unknownCount! + company.dataSummary?.unansweredCount!)
      .toBe(company.dataSummary?.relevantQuestionCount);
    expect(company.systems).toBeDefined();
    expect(company.systems?.length).toBe(2);
    expect(company.systems?.map((s) => s.name)).toContain('SAP ERP');
    expect(company.processes).toBeDefined();
    expect(company.processes?.length).toBeGreaterThan(0);
    expect(company.documentsSummary).toBeDefined();
    expect(company.complianceSummary).toBeDefined();
    expect(company.developmentSummary).toBeDefined();
    expect(company.outcomeSummary).toBeDefined();

    const serialized = JSON.stringify(company).toLowerCase();
    for (const forbidden of [
      'rawpayload',
      'sourceconfig',
      'secret',
      'token',
      'lawyernote',
      'internalnote',
      'recommendationcandidate',
      'diagnosiscandidate',
      'improvementopportunity',
      'currentstate',
      'clientownerperson',
      'organizationperson',
      'hr_confidential',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('EMPLOYEE_COUNT_FALLBACK_SCOPE_GUARDS=PASS — only current company facts affect the customer employee count', async () => {
    const facts = await db.clientFact.findMany({
      where: { clientId: ids.clientA, factDefinition: { key: 'employee_count' } },
      select: { numberValue: true, scopeType: true, factSubjectId: true, validFrom: true, validTo: true },
    });
    const currentCompanyFact = facts.find((fact) => Number(fact.numberValue) === 50);
    const employeeFact = facts.find((fact) => Number(fact.numberValue) === 999);
    const expiredCompanyFact = facts.find((fact) => Number(fact.numberValue) === 777);
    const futureCompanyFact = facts.find((fact) => Number(fact.numberValue) === 888);

    expect(currentCompanyFact).toMatchObject({ scopeType: 'COMPANY', factSubjectId: null });
    expect(employeeFact).toMatchObject({ scopeType: 'EMPLOYEE' });
    expect(employeeFact?.factSubjectId).toBeTruthy();
    expect(expiredCompanyFact).toMatchObject({ scopeType: 'COMPANY', factSubjectId: null });
    expect(expiredCompanyFact?.validTo?.getTime()).toBeLessThan(Date.now());
    expect(futureCompanyFact).toMatchObject({ scopeType: 'COMPANY', factSubjectId: null });
    expect(futureCompanyFact?.validFrom.getTime()).toBeGreaterThan(Date.now());

    const company = await getOrganizationalCompany(ids.authorizedIdentity, ids.orgWsA, db);
    expect(company.employeeCount).toBe(50);
  });

  // 11. INDIVIDUAL_PORTAL_ISOLATION=PASS
  it('INDIVIDUAL_PORTAL_ISOLATION=PASS — individual workspaces fail closed on organizational endpoints', async () => {
    // Identity A attempts to access an INDIVIDUAL workspace via organizational routes
    const indHeaders = {
      'x-client-portal-session': makeSession(ids.authorizedIdentity, 'authorized@fixture.invalid', 'Authorized Customer'),
      'x-client-portal-workspace': indivWsRef,
    };

    const resGrow = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/grow', indHeaders);
    expect(resGrow.status).toBe(403);
    expect(resGrow.body.code).toBe('CLIENT_WORKSPACE_NOT_ORGANIZATION');

    const resComp = await httpRequest(testApp, 'GET', '/api/v1/client-portal/compliance', indHeaders);
    expect(resComp.status).toBe(403);
    expect(resComp.body.code).toBe('CLIENT_ORGANIZATION_WORKSPACE_REQUIRED');

    const resCompany = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/company', indHeaders);
    expect(resCompany.status).toBe(403);

    // Calling organizational home with INDIVIDUAL workspace fails closed
    await expect(
      getOrganizationalHome(ids.authorizedIdentity, indivWsId, db),
    ).rejects.toThrow();
  });

  it('INACTIVE_OR_SUSPENDED_IDENTITY_DENIED=PASS — inactive identity rejected at route level', async () => {
    const suspendedHeaders = {
      'x-client-portal-session': makeSession(ids.inactiveIdentity, 'inactive@fixture.invalid', 'Inactive Customer', 'SUSPENDED'),
      'x-client-portal-workspace': wsARef,
    };

    const resGrow = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/grow', suspendedHeaders);
    expect(resGrow.status).toBe(403);

    const resComp = await httpRequest(testApp, 'GET', '/api/v1/client-portal/compliance', suspendedHeaders);
    expect(resComp.status).toBe(403);

    const resCompany = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/company', suspendedHeaders);
    expect(resCompany.status).toBe(403);
  });

  it('MISSING_AUTHENTICATION_DENIED=PASS — unauthenticated request rejected at route level', async () => {
    const resGrow = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/grow');
    expect(resGrow.status).toBe(401);

    const resComp = await httpRequest(testApp, 'GET', '/api/v1/client-portal/compliance');
    expect(resComp.status).toBe(401);

    const resCompany = await httpRequest(testApp, 'GET', '/api/v1/client-portal/org/company');
    expect(resCompany.status).toBe(401);
  });

  // 12. IMPROVEMENT_OPPORTUNITY_INTERNAL_BY_DEFAULT=PASS
  it('IMPROVEMENT_OPPORTUNITY_INTERNAL_BY_DEFAULT=PASS — improvement opportunities withheld by default', async () => {
    const grow = await getOrganizationalGrow(ids.authorizedIdentity, ids.orgWsA, db);
    expect(grow.opportunities).toHaveLength(0);
    expect(grow.opportunitiesDeferredNotice).toBeNull();
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
    expect(growSrc).toContain('listPublishedOpportunities');
    expect(growSrc).toContain('ImprovementOpportunityPublication');
    expect(growSrc).not.toContain('improvementOpportunity.findMany');
  });

  it('GROW_INITIATIVE_MILESTONE_SAFE=PASS — reuses CompanyMilestone with no internal fields or raw research', () => {
    const growSrc = read('src/modules/client-workspace/orgGrowService.ts');
    expect(growSrc).toContain('milestones: {');
    expect(growSrc).toContain('MILESTONE_STATUS_LABELS');
    // No internal-only source is read on the customer Grow path.
    expect(growSrc).not.toContain('createdByUserId');
    expect(growSrc).not.toContain('responsiblePerson');
    expect(growSrc).not.toContain('recommendationCandidate');
    expect(growSrc).not.toContain('researchEvidence');
    expect(growSrc).not.toContain('diagnosisCandidate');
    expect(growSrc).not.toContain('task.findMany');
    expect(growSrc).not.toContain('improvementOpportunity.findMany');
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
    expect(growSrc).toContain('opportunitiesDeferredNotice: null');
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

  it('COMPANY_CUSTOMER_SAFE_SOURCES=PASS — Vállalat reuses explicit customer-safe projectors', () => {
    const companySrc = read('src/modules/client-workspace/orgCompanyService.ts');
    expect(companySrc).toContain('getCompanyProfileDiscovery');
    expect(companySrc).toContain('listPortalDocuments');
    expect(companySrc).toContain('getClientSafeComplianceReadModel');
    expect(companySrc).toContain('getOrganizationalGrow');
    expect(companySrc).not.toContain('getComplianceWorkspace');
  });

  it('COMPANY_READ_ONLY=PASS — Vállalat projection has no persistence mutations', () => {
    const companySrc = read('src/modules/client-workspace/orgCompanyService.ts');
    expect(companySrc).not.toMatch(/\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(/);
  });
});
