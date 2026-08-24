/**
 * ADMINICULUM — PRESENTATION DEMO FIXTURE
 *
 * Reusable, deterministic, idempotent fixture for the live presentation.
 * Uses the same pattern as organizationalPortalFixture.ts.
 *
 * Demo story:
 *   Demo Kft. → Vállalati profil → employee count 47→52
 *   → workforce sees compliance attention → lawyer creates proposal
 *   → binds Case → confirms → Task created.
 *
 * Fixture namespace: DEMO_PRESENTATION_
 * No schema change. No migration. No compliance engine bypass.
 * Synthetic content is clearly labeled [DEMO].
 *
 * DEMO_RULE_BLOCKED:
 *   A full ApplicabilityRuleVersion cannot be approved via the canonical service
 *   because approveRequirementVersion requires a PRIMARY RequirementCitation
 *   pointing to a real LegalSource. We do NOT fake legal grounding.
 *   The fixture seeds the Requirement + RequirementVersion at CANDIDATE status
 *   (no citation, no approval) so future Org Discovery can complete it once
 *   DEMO authority support exists.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

export type Db = PrismaClient;

// ---------------------------------------------------------------------------
// The single deterministic seed for all presentation fixture IDs.
// Never changes between runs — gives us stable, predictable UUIDs.
// ---------------------------------------------------------------------------
const PRESENTATION_SEED = 'DEMO_PRESENTATION_2026';

function stableId(name: string): string {
  return crypto
    .createHash('sha256')
    .update(`${PRESENTATION_SEED}:${name}`)
    .digest('hex')
    .slice(0, 32);
}

function stableEmail(name: string): string {
  return `demo-presentation-${name}@fixture.invalid`.toLowerCase();
}

function stableRef(name: string): string {
  return `DEMO-${crypto
    .createHash('sha256')
    .update(`${PRESENTATION_SEED}:${name}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// All fixture IDs — stable across every run.
// ---------------------------------------------------------------------------
export const DEMO_IDS = {
  // Workforce
  adminUserId: stableId('adminUser'),
  lawyerUserId: stableId('lawyerUser'),   // Dr. Kovács Péter

  // Client
  clientId: stableId('demoClient'),        // Demo Kft.

  // Organization
  groupRootId: stableId('groupRoot'),      // Ügyvezetés
  personUgyvezetoId: stableId('personUgyvezeto'),  // Demo Ügyvezető
  personKovacsId: stableId('personKovacs'), // Dr. Kovács Péter (org record)
  personBaloghId: stableId('personBalogh'), // Balogh Anna (optional junior)

  // Portal
  workspaceId: stableId('orgWorkspace'),
  publicRef: 'DEMO-PRESENTATION-WORKSPACE',

  // Cases
  caseMainId: stableId('caseMain'),         // Munkajogi szerződéses áttekintés
  caseComplianceId: stableId('caseCompliance'), // Vállalati megfelelőségi áttekintés

  // Tasks (pre-seeded; the live-demo Task is NOT seeded)
  taskOneId: stableId('taskOne'),
  taskTwoId: stableId('taskTwo'),
  taskThreeId: stableId('taskThree'),

  // ClientOperatingProfile
  operatingProfileId: stableId('operatingProfile'),

  // ClientFact — employee count at initial state (47)
  factEmployeeCountId: stableId('factEmployeeCount'),

  // Compliance content (DEMO namespace, candidate-only — see blocker note)
  complianceDomainCode: 'DEMO_PRESENTATION_GROWTH',
  requirementKey: 'DEMO_PRESENTATION_COMPANY_GROWTH_REVIEW',
  requirementId: stableId('demoRequirement'),
  requirementVersionId: stableId('demoRequirementVersion'),

  // FactDefinition for demo employee count (DEMO-namespaced, generic)
  factDefinitionId: stableId('demoFactDefinitionEmployeeCount'),
  factDefinitionKey: 'DEMO_PRESENTATION_COMPANY_EMPLOYEE_COUNT',
} as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface PresentationDemoFixtureResult {
  ids: typeof DEMO_IDS;
  /** True if the compliance domain was created (not pre-existing). */
  complianceDomainCreated: boolean;
  /** True if the demo RequirementVersion was seeded (candidate only). */
  requirementCandidateSeeded: boolean;
  /**
   * Blocked: the demo ApplicabilityRuleVersion cannot be APPROVED via the
   * canonical service because approveRequirementVersion requires a PRIMARY
   * RequirementCitation linked to an actual LegalSource. We refuse to fake
   * legal grounding. The candidate version is seeded for forward-compatibility.
   */
  DEMO_RULE_BLOCKED_BY_CURRENT_GROUNDING: true;
}

// ---------------------------------------------------------------------------
// Seed the full presentation demo fixture (idempotent).
// ---------------------------------------------------------------------------
export async function seedPresentationDemoFixture(
  db: Db,
): Promise<PresentationDemoFixtureResult> {
  const ids = DEMO_IDS;

  // ---- Workforce users ----
  await db.user.upsert({
    where: { id: ids.adminUserId },
    update: {},
    create: {
      id: ids.adminUserId,
      email: stableEmail('admin'),
      name: 'Demo Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      isActive: true,
      skills: [],
    } as never,
  });

  await db.user.upsert({
    where: { id: ids.lawyerUserId },
    update: {},
    create: {
      id: ids.lawyerUserId,
      email: stableEmail('kovacs-peter'),
      name: 'Dr. Kovács Péter',
      role: 'LAWYER',
      status: 'ACTIVE',
      isActive: true,
      skills: [],
    } as never,
  });

  // ---- Demo Kft. client ----
  await db.client.upsert({
    where: { id: ids.clientId },
    update: {},
    create: {
      id: ids.clientId,
      name: 'Demo Kft.',
      notes: '[DEMO] Synthetic presentation company. Not a real customer.',
      relationshipMode: 'PORTAL_CENTRIC',
    },
  });

  // ---- Organization ----
  await db.clientOrganizationGroup.upsert({
    where: { id: ids.groupRootId },
    update: {},
    create: {
      id: ids.groupRootId,
      clientId: ids.clientId,
      workspaceId: ids.workspaceId,
      name: 'Ügyvezetés',
      status: 'ACTIVE',
      createdById: ids.adminUserId,
    },
  });

  // Demo Ügyvezető — internal org record, no portal access, no responsibility
  await db.organizationPerson.upsert({
    where: { id: ids.personUgyvezetoId },
    update: {},
    create: {
      id: ids.personUgyvezetoId,
      clientId: ids.clientId,
      organizationGroupId: ids.groupRootId,
      name: 'Demo Ügyvezető',
      jobTitle: 'Ügyvezető',
      employmentStatus: 'ACTIVE',
    },
  });

  // Dr. Kovács Péter — workforce lawyer also has an org person record
  await db.organizationPerson.upsert({
    where: { id: ids.personKovacsId },
    update: {},
    create: {
      id: ids.personKovacsId,
      clientId: ids.clientId,
      organizationGroupId: ids.groupRootId,
      name: 'Dr. Kovács Péter',
      jobTitle: 'Ügyvezető',
      employmentStatus: 'ACTIVE',
    },
  });

  // Balogh Anna — junior optional
  await db.organizationPerson.upsert({
    where: { id: ids.personBaloghId },
    update: {},
    create: {
      id: ids.personBaloghId,
      clientId: ids.clientId,
      organizationGroupId: ids.groupRootId,
      name: 'Balogh Anna',
      jobTitle: 'Junior jogi asszisztens',
      employmentStatus: 'ACTIVE',
    },
  });

  // ---- Portal workspace (ORGANIZATION mode) ----
  await db.clientPortalWorkspace.upsert({
    where: { id: ids.workspaceId },
    update: {},
    create: {
      id: ids.workspaceId,
      clientId: ids.clientId,
      name: 'Demo Kft. – Company Workspace',
      mode: 'ORGANIZATION',
      status: 'ACTIVE',
      communicationMode: 'PORTAL_PRIMARY',
      connectedSystemState: 'NOT_CONFIGURED',
      publicReference: ids.publicRef,
      createdById: ids.adminUserId,
    },
  });

  // ---- ClientOperatingProfile ----
  // ClientOperatingProfile has no "enrollment" field in the current schema.
  // This is a forward-compatibility placeholder — once 7D.1 adds the field,
  // update this upsert to set it. Reported as blocked step.
  await db.clientOperatingProfile.upsert({
    where: { id: ids.operatingProfileId },
    update: {},
    create: {
      id: ids.operatingProfileId,
      clientId: ids.clientId,
      status: 'ACTIVE',
      summary:
        '[DEMO] Demo Kft. — szintetikus bemutató vállalat. Nem valós ügyfél.',
      internalNote: 'DEMO fixture — presentation use only.',
    },
  });

  // ---- Cases ----
  const caseOneRef = stableRef('caseMain');
  const caseTwoRef = stableRef('caseCompliance');

  await db.case.upsert({
    where: { id: ids.caseMainId },
    update: {},
    create: {
      id: ids.caseMainId,
      caseNumber: caseOneRef,
      title: 'Munkajogi szerződéses áttekintés',
      caseType: 'EMPLOYMENT',
      status: 'IN_REVIEW',
      priority: 'HIGH',
      clientId: ids.clientId,
      assignedLawyerId: ids.lawyerUserId,
      createdById: ids.adminUserId,
    } as never,
  });

  await db.case.upsert({
    where: { id: ids.caseComplianceId },
    update: {},
    create: {
      id: ids.caseComplianceId,
      caseNumber: caseTwoRef,
      title: 'Vállalati megfelelőségi áttekintés',
      caseType: 'CORPORATE',
      status: 'IN_REVIEW',
      priority: 'MEDIUM',
      clientId: ids.clientId,
      assignedLawyerId: ids.lawyerUserId,
      createdById: ids.adminUserId,
    } as never,
  });

  // ---- Tasks (do NOT seed the live-demo Task) ----
  const taskDefs = [
    {
      id: ids.taskOneId,
      title: 'Munkaszerződés-sablon felülvizsgálata',
      taskType: 'REVIEW_CONTRACT',
      status: 'TODO',
      priority: 'HIGH',
      caseId: ids.caseMainId,
    },
    {
      id: ids.taskTwoId,
      title: 'Belső szabályzat aktualizálása',
      taskType: 'DRAFT_CONTRACT',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      caseId: ids.caseMainId,
    },
    {
      id: ids.taskThreeId,
      title: 'Megfelelőségi kérdőív összeállítása',
      taskType: 'OTHER',
      status: 'TODO',
      priority: 'MEDIUM',
      caseId: ids.caseComplianceId,
    },
  ] as const;

  for (const t of taskDefs) {
    await (db.task as any).upsert({
      where: { id: t.id },
      update: {},
      create: {
        ...t,
        assignedToId: ids.lawyerUserId,
        assignedById: ids.adminUserId,
        requiredSkills: [],
      },
    });
  }

  // ---- FactDefinition (DEMO-namespaced generic employee count) ----
  let factDefinitionCreated = false;
  const existingFd = await db.factDefinition.findUnique({
    where: { key: ids.factDefinitionKey },
    select: { id: true },
  });
  if (!existingFd) {
    await db.factDefinition.create({
      data: {
        id: ids.factDefinitionId,
        key: ids.factDefinitionKey,
        domainCode: ids.complianceDomainCode,
        valueType: 'NUMBER',
        allowedScopeTypes: ['COMPANY'],
        determinationMethod: 'USER_PROVIDED',
        overlapPolicy: 'ALLOW',
        temporalPolicy: 'OBSERVATION',
      },
    });
    factDefinitionCreated = true;
  }

  // ---- ClientFact — initial employee count = 47 ----
  // (idempotent: delete existing, then recreate so reset always lands at 47)
  await db.clientFact.deleteMany({
    where: { id: ids.factEmployeeCountId },
  });
  await db.clientFact.create({
    data: {
      id: ids.factEmployeeCountId,
      clientId: ids.clientId,
      type: ids.factDefinitionKey,
      value: '47',
      factDefinitionId: existingFd?.id ?? ids.factDefinitionId,
      scopeType: 'COMPANY',
      numberValue: 47,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      verificationStatus: 'CLIENT_PROVIDED',
      observedAt: new Date('2026-01-01T00:00:00Z'),
    } as never,
  });

  // ---- Compliance content (DEMO — candidate only, not approved) ----
  // ComplianceDomain
  let complianceDomainCreated = false;
  const existingDomain = await db.complianceDomain.findUnique({
    where: { code: ids.complianceDomainCode },
    select: { code: true },
  });
  if (!existingDomain) {
    await db.complianceDomain.create({
      data: {
        code: ids.complianceDomainCode,
        label: 'Szervezeti növekedési áttekintés [DEMO]',
      },
    });
    complianceDomainCreated = true;
  }

  // Requirement (DEMO — no real law citation)
  const existingReq = await db.requirement.findUnique({
    where: { id: ids.requirementId },
    select: { id: true },
  });
  if (!existingReq) {
    await db.requirement.create({
      data: {
        id: ids.requirementId,
        key: ids.requirementKey,
        jurisdictionCode: 'HU',
        domainCode: ids.complianceDomainCode,
      },
    });
  }

  // RequirementVersion (CANDIDATE — cannot be approved without a real citation)
  let requirementCandidateSeeded = false;
  const existingRv = await db.requirementVersion.findUnique({
    where: { id: ids.requirementVersionId },
    select: { id: true },
  });
  if (!existingRv) {
    await db.requirementVersion.create({
      data: {
        id: ids.requirementVersionId,
        requirementId: ids.requirementId,
        versionKey: 'V1-DEMO',
        title: 'Szervezeti növekedési áttekintés [DEMO]',
        normativeStatement:
          '[DEMO — szintetikus tartalom] Ha a foglalkoztatottak száma eléri az 52 főt, ' +
          'megjelenik a „Szervezeti növekedési áttekintés" téma. ' +
          'Ez kizárólag termékbemutatói logika, nem minősül jogi kötelezettségnek.',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        sourceSupportState: 'MISSING',   // Cannot be SUFFICIENT without real source
        status: 'CANDIDATE',             // Cannot be APPROVED without PRIMARY citation
        specialistRequirement: 'NONE',
      },
    });
    requirementCandidateSeeded = true;
  }

  return {
    ids,
    complianceDomainCreated,
    requirementCandidateSeeded: requirementCandidateSeeded || !existingRv,
    DEMO_RULE_BLOCKED_BY_CURRENT_GROUNDING: true,
  };
}

// ---------------------------------------------------------------------------
// Teardown: delete ONLY demo-owned entities in FK-safe order.
// ---------------------------------------------------------------------------
export async function teardownPresentationDemoFixture(db: Db): Promise<void> {
  const ids = DEMO_IDS;

  // Tasks first (FK → Case)
  await db.task.deleteMany({
    where: { id: { in: [ids.taskOneId, ids.taskTwoId, ids.taskThreeId] } },
  });

  // ComplianceProposals linked to our Cases
  await db.complianceProposal.deleteMany({
    where: { caseId: { in: [ids.caseMainId, ids.caseComplianceId] } },
  });

  // Cases
  await db.case.deleteMany({
    where: { id: { in: [ids.caseMainId, ids.caseComplianceId] } },
  });

  // ClientFact
  await db.clientFact.deleteMany({
    where: { id: ids.factEmployeeCountId },
  });

  // ClientOperatingProfile
  await db.clientOperatingProfile.deleteMany({
    where: { id: ids.operatingProfileId },
  });

  // Portal workspace memberships (if any were created by DEMO_PORTAL_EMAIL flow)
  await db.clientPortalWorkspaceMembership.deleteMany({
    where: { workspaceId: ids.workspaceId },
  });

  // Portal workspace
  await db.clientPortalWorkspace.deleteMany({
    where: { id: ids.workspaceId },
  });

  // Organization people
  await db.organizationPersonResponsibility.deleteMany({
    where: {
      organizationPersonId: {
        in: [ids.personUgyvezetoId, ids.personKovacsId, ids.personBaloghId],
      },
    },
  });
  await db.organizationPerson.deleteMany({
    where: {
      id: {
        in: [ids.personUgyvezetoId, ids.personKovacsId, ids.personBaloghId],
      },
    },
  });

  // Organization group
  await db.clientOrganizationGroup.deleteMany({
    where: { id: ids.groupRootId },
  });

  // Client
  await db.client.deleteMany({
    where: { id: ids.clientId },
  });

  // DEMO compliance content (only if DEMO_PRESENTATION-namespaced)
  await db.requirementVersion.deleteMany({
    where: { id: ids.requirementVersionId },
  });
  await db.requirement.deleteMany({
    where: { id: ids.requirementId },
  });
  await db.factDefinition.deleteMany({
    where: { key: ids.factDefinitionKey },
  });
  await db.complianceDomain.deleteMany({
    where: { code: ids.complianceDomainCode },
  });

  // Workforce users — only if created by this fixture
  await db.user.deleteMany({
    where: { id: { in: [ids.adminUserId, ids.lawyerUserId] } },
  });
}
