#!/usr/bin/env node
/**
 * ADMINICULUM — PRESENTATION DEMO RESET SCRIPT
 *
 * npm run demo:presentation:reset
 *
 * Safety gates (ALL must be satisfied):
 *   1. NODE_ENV != 'production'
 *   2. ADMINICULUM_DEMO_CONTENT_ENABLED === 'true'
 *   3. Target fixture key starts with 'DEMO_PRESENTATION_'
 *
 * Resets ONLY the presentation demo fixture. Unrelated data is never touched.
 * Never truncates shared tables. Uses scoped deleteMany with explicit IDs.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { approveRequirementVersion, approveApplicabilityRuleVersion, createApplicabilityRuleVersion, addRequirementCitation } from '../src/modules/compliance/requirementRuleService';

// ---- Production guard --------------------------------------------------------

const NODE_ENV = process.env.NODE_ENV || '';
const DEMO_ENABLED = process.env.ADMINICULUM_DEMO_CONTENT_ENABLED || '';
const DEMO_FIXTURE_NAMESPACE = 'DEMO_PRESENTATION_';

function refuseIfProduction() {
  if (NODE_ENV === 'production') {
    console.error('ADMINICULUM_DEMO_PRODUCTION_DENY');
    process.exit(2);
  }
  if (DEMO_ENABLED !== 'true') {
    console.error('❌ REFUSED: ADMINICULUM_DEMO_CONTENT_ENABLED is not "true". Set ADMINICULUM_DEMO_CONTENT_ENABLED=true to allow.');
    process.exit(2);
  }
  // Verify fixture namespace
  const FIXTURE_KEY = 'DEMO_PRESENTATION_2026';
  if (!FIXTURE_KEY.startsWith(DEMO_FIXTURE_NAMESPACE)) {
    console.error(`❌ REFUSED: Fixture key "${FIXTURE_KEY}" does not start with "${DEMO_FIXTURE_NAMESPACE}".`);
    process.exit(2);
  }
  // Detect known production environment markers
  const knownProdMarkers = [
    process.env.WEBSITE_SITE_NAME,     // Azure App Service
    process.env.AZURE_FUNCTIONS_ENVIRONMENT,
    process.env.K_SERVICE,             // Cloud Run
  ].filter(Boolean);
  if (knownProdMarkers.length > 0) {
    console.error(`❌ REFUSED: Production environment marker detected: ${knownProdMarkers.join(', ')}`);
    process.exit(2);
  }
  console.log('✅ Safety checks passed.');
}

// ---- Stable IDs --------------------------------------------------------------

const PRESENTATION_SEED = 'DEMO_PRESENTATION_2026';

function stableId(name) {
  return crypto
    .createHash('sha256')
    .update(`${PRESENTATION_SEED}:${name}`)
    .digest('hex')
    .slice(0, 32);
}

function stableEmail(name) {
  return `demo-presentation-${name}@fixture.invalid`.toLowerCase();
}

function stableRef(name) {
  return `DEMO-${crypto
    .createHash('sha256')
    .update(`${PRESENTATION_SEED}:${name}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()}`;
}

const IDS = {
  adminUserId: stableId('adminUser'),
  lawyerUserId: stableId('lawyerUser'),
  clientId: stableId('demoClient'),
  groupRootId: stableId('groupRoot'),
  personUgyvezetoId: stableId('personUgyvezeto'),
  personKovacsId: stableId('personKovacs'),
  personBaloghId: stableId('personBalogh'),
  workspaceId: stableId('orgWorkspace'),
  publicRef: 'DEMO-PRESENTATION-WORKSPACE',
  caseMainId: stableId('caseMain'),
  caseComplianceId: stableId('caseCompliance'),
  taskOneId: stableId('taskOne'),
  taskTwoId: stableId('taskTwo'),
  taskThreeId: stableId('taskThree'),
  operatingProfileId: stableId('operatingProfile'),
  factEmployeeCountId: stableId('factEmployeeCount'),
  complianceDomainCode: 'DEMO_PRESENTATION_GROWTH',
  requirementKey: 'DEMO_PRESENTATION_COMPANY_GROWTH_REVIEW',
  requirementId: stableId('demoRequirement'),
  requirementVersionId: stableId('demoRequirementVersion'),
  factDefinitionId: stableId('demoFactDefinitionEmployeeCount'),
  factDefinitionKey: 'DEMO_PRESENTATION_COMPANY_EMPLOYEE_COUNT',
  // Synthetic compliance grounding identifiers
  syntheticSourceId: stableId('syntheticLegalSource'),
  syntheticSourceVersionId: stableId('syntheticLegalSourceVersion'),
  syntheticCitationId: stableId('syntheticCitation'),
  applicabilityRuleVersionId: stableId('demoApplicabilityRuleVersion'),
};

// ---- Teardown in FK-safe order -----------------------------------------------

async function teardown(db) {
  console.log('🗑  Tearing down previous demo fixture...');

  // Delete synthetic compliance data first (grounding, citations, rule versions, findings)
  await db.assessmentFinding.deleteMany({ where: { clientId: IDS.clientId } });
  await db.requirementApplicabilityFact.deleteMany({ where: { applicability: { clientId: IDS.clientId } } });
  await db.requirementApplicability.deleteMany({ where: { clientId: IDS.clientId } });
  await db.applicabilityRuleVersion.deleteMany({ where: { requirementVersionId: IDS.requirementVersionId } });
  await db.requirementCitation.deleteMany({ where: { requirementVersionId: IDS.requirementVersionId } });
  await db.legalSourceVersion.deleteMany({ where: { id: IDS.syntheticSourceVersionId } });
  await db.legalSource.deleteMany({ where: { id: IDS.syntheticSourceId } });

  await db.task.deleteMany({ where: { id: { in: [IDS.taskOneId, IDS.taskTwoId, IDS.taskThreeId] } } });
  await db.complianceProposal.deleteMany({ where: { caseId: { in: [IDS.caseMainId, IDS.caseComplianceId] } } });
  await db.case.deleteMany({ where: { id: { in: [IDS.caseMainId, IDS.caseComplianceId] } } });
  await db.clientFact.deleteMany({ where: { id: IDS.factEmployeeCountId } });
  await db.clientOperatingProfile.deleteMany({ where: { id: IDS.operatingProfileId } });
  await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId: IDS.workspaceId } });
  await db.clientPortalWorkspace.deleteMany({ where: { id: IDS.workspaceId } });
  await db.organizationPersonResponsibility.deleteMany({
    where: { organizationPersonId: { in: [IDS.personUgyvezetoId, IDS.personKovacsId, IDS.personBaloghId] } },
  });
  await db.organizationPerson.deleteMany({
    where: { id: { in: [IDS.personUgyvezetoId, IDS.personKovacsId, IDS.personBaloghId] } },
  });
  await db.clientOrganizationGroup.deleteMany({ where: { id: IDS.groupRootId } });
  await db.client.deleteMany({ where: { id: IDS.clientId } });
  await db.requirementVersion.deleteMany({ where: { id: IDS.requirementVersionId } });
  await db.requirement.deleteMany({ where: { id: IDS.requirementId } });
  await db.factDefinition.deleteMany({ where: { key: IDS.factDefinitionKey } });
  await db.complianceDomain.deleteMany({ where: { code: IDS.complianceDomainCode } });
  await db.user.deleteMany({ where: { id: { in: [IDS.adminUserId, IDS.lawyerUserId] } } });

  console.log('  ✓ Demo fixture cleared.');
}

// ---- Seed -------------------------------------------------------------------

async function seed(db) {
  console.log('🌱 Seeding presentation demo fixture...');

  // Workforce
  await db.user.upsert({ where: { id: IDS.adminUserId }, update: {}, create: { id: IDS.adminUserId, email: stableEmail('admin'), name: 'Demo Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } });
  await db.user.upsert({ where: { id: IDS.lawyerUserId }, update: {}, create: { id: IDS.lawyerUserId, email: stableEmail('kovacs-peter'), name: 'Dr. Kovács Péter', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] } });

  // Client
  await db.client.upsert({ where: { id: IDS.clientId }, update: {}, create: { id: IDS.clientId, name: 'Demo Kft.', notes: '[DEMO] Synthetic presentation company. Not a real customer.', relationshipMode: 'PORTAL_CENTRIC' } });

  // Organization
  await db.clientOrganizationGroup.upsert({ where: { id: IDS.groupRootId }, update: {}, create: { id: IDS.groupRootId, clientId: IDS.clientId, workspaceId: IDS.workspaceId, name: 'Ügyvezetés', status: 'ACTIVE', createdById: IDS.adminUserId } });
  await db.organizationPerson.upsert({ where: { id: IDS.personUgyvezetoId }, update: {}, create: { id: IDS.personUgyvezetoId, clientId: IDS.clientId, organizationGroupId: IDS.groupRootId, name: 'Demo Ügyvezető', jobTitle: 'Ügyvezető', employmentStatus: 'ACTIVE' } });
  await db.organizationPerson.upsert({ where: { id: IDS.personKovacsId }, update: {}, create: { id: IDS.personKovacsId, clientId: IDS.clientId, organizationGroupId: IDS.groupRootId, name: 'Dr. Kovács Péter', jobTitle: 'Ügyvezető', employmentStatus: 'ACTIVE' } });
  await db.organizationPerson.upsert({ where: { id: IDS.personBaloghId }, update: {}, create: { id: IDS.personBaloghId, clientId: IDS.clientId, organizationGroupId: IDS.groupRootId, name: 'Balogh Anna', jobTitle: 'Junior jogi asszisztens', employmentStatus: 'ACTIVE' } });

  // Workspace
  await db.clientPortalWorkspace.upsert({ where: { id: IDS.workspaceId }, update: {}, create: { id: IDS.workspaceId, clientId: IDS.clientId, name: 'Demo Kft. – Company Workspace', mode: 'ORGANIZATION', status: 'ACTIVE', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED', publicReference: IDS.publicRef, createdById: IDS.adminUserId } });

  // OperatingProfile with 7D.1 canonical enrollment
  await db.clientOperatingProfile.upsert({ where: { id: IDS.operatingProfileId }, update: {}, create: { id: IDS.operatingProfileId, clientId: IDS.clientId, status: 'ACTIVE', complianceEnrollmentStatus: 'ENROLLED', summary: '[DEMO] Demo Kft. — szintetikus bemutató vállalat. Nem valós ügyfél.', internalNote: 'DEMO fixture — presentation use only.' } });

  await db.case.upsert({ where: { id: IDS.caseMainId }, update: {}, create: { id: IDS.caseMainId, caseNumber: stableRef('caseMain'), title: 'Munkajogi szerződéses áttekintés', caseType: 'EMPLOYMENT', status: 'IN_REVIEW', priority: 'HIGH', clientId: IDS.clientId, assignedLawyerId: IDS.lawyerUserId, createdById: IDS.adminUserId } });
  await db.case.upsert({ where: { id: IDS.caseComplianceId }, update: {}, create: { id: IDS.caseComplianceId, caseNumber: stableRef('caseCompliance'), title: 'Vállalati megfelelőségi áttekintés', caseType: 'CORPORATE', status: 'IN_REVIEW', priority: 'MEDIUM', clientId: IDS.clientId, assignedLawyerId: IDS.lawyerUserId, createdById: IDS.adminUserId } });

  // Tasks (do NOT seed the live-demo Task)
  await db.task.upsert({ where: { id: IDS.taskOneId }, update: {}, create: { id: IDS.taskOneId, title: 'Munkaszerződés-sablon felülvizsgálata', taskType: 'REVIEW_CONTRACT', status: 'TODO', priority: 'HIGH', caseId: IDS.caseMainId, assignedToId: IDS.lawyerUserId, assignedById: IDS.adminUserId, requiredSkills: [] } });
  await db.task.upsert({ where: { id: IDS.taskTwoId }, update: {}, create: { id: IDS.taskTwoId, title: 'Belső szabályzat aktualizálása', taskType: 'DRAFT_CONTRACT', status: 'IN_PROGRESS', priority: 'MEDIUM', caseId: IDS.caseMainId, assignedToId: IDS.lawyerUserId, assignedById: IDS.adminUserId, requiredSkills: [] } });
  await db.task.upsert({ where: { id: IDS.taskThreeId }, update: {}, create: { id: IDS.taskThreeId, title: 'Megfelelőségi kérdőív összeállítása', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', caseId: IDS.caseComplianceId, assignedToId: IDS.lawyerUserId, assignedById: IDS.adminUserId, requiredSkills: [] } });

  // FactDefinition
  const existingFd = await db.factDefinition.findUnique({ where: { key: IDS.factDefinitionKey }, select: { id: true } });
  if (!existingFd) {
    await db.factDefinition.create({ data: { id: IDS.factDefinitionId, key: IDS.factDefinitionKey, domainCode: IDS.complianceDomainCode, valueType: 'NUMBER', allowedScopeTypes: ['COMPANY'], determinationMethod: 'USER_PROVIDED', overlapPolicy: 'ALLOW', temporalPolicy: 'OBSERVATION' } });
  }
  const fdId = existingFd?.id ?? IDS.factDefinitionId;

  // ClientFact — initial state = 47
  await db.clientFact.deleteMany({ where: { id: IDS.factEmployeeCountId } });
  await db.clientFact.create({ data: { id: IDS.factEmployeeCountId, clientId: IDS.clientId, type: IDS.factDefinitionKey, value: '47', factDefinitionId: fdId, scopeType: 'COMPANY', numberValue: 47, validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'CLIENT_PROVIDED', observedAt: new Date('2026-01-01T00:00:00Z') } });

  // Compliance content (DEMO — CANDIDATE only; rule cannot be approved without real citation)
  const existingDomain = await db.complianceDomain.findUnique({ where: { code: IDS.complianceDomainCode }, select: { code: true } });
  if (!existingDomain) await db.complianceDomain.create({ data: { code: IDS.complianceDomainCode, label: 'Szervezeti növekedési áttekintés [DEMO]' } });

  const existingReq = await db.requirement.findUnique({ where: { id: IDS.requirementId }, select: { id: true } });
  if (!existingReq) await db.requirement.create({ data: { id: IDS.requirementId, key: IDS.requirementKey, jurisdictionCode: 'HU', domainCode: IDS.complianceDomainCode } });

  const existingRv = await db.requirementVersion.findUnique({ where: { id: IDS.requirementVersionId }, select: { id: true } });
  if (!existingRv) {
    await db.requirementVersion.create({ data: { id: IDS.requirementVersionId, requirementId: IDS.requirementId, versionKey: 'V1-DEMO', title: 'Szervezeti növekedési áttekintés [DEMO]', normativeStatement: '[DEMO — szintetikus tartalom] Ha a foglalkoztatottak száma eléri az 52 főt, megjelenik a „Szervezeti növekedési áttekintés" téma. Ez kizárólag termékbemutatói logika, nem minősül jogi kötelezettségnek.', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', status: 'CANDIDATE', specialistRequirement: 'NONE' } });
  }

    // Synthetic LegalSource (real entity required for citation)
    const existingSource = await db.legalSource.findUnique({ where: { id: IDS.syntheticSourceId }, select: { id: true } });
    if (!existingSource) {
      await db.legalSource.create({
        data: {
          id: IDS.syntheticSourceId,
          sourceKey: IDS.syntheticSourceId,
          jurisdictionCode: 'HU',
          instrumentType: 'OTHER',
          canonicalCitation: '[DEMO — NEM JOGFORRÁS] Bemutató szabály',
          title: 'Synthetic demonstration rule source — not legal authority',
          issuer: 'Adminiculum Presentation Demo',
          status: 'APPROVED',
        },
      });
    }

    // Synthetic LegalSourceVersion
    const existingSourceVer = await db.legalSourceVersion.findUnique({ where: { id: IDS.syntheticSourceVersionId }, select: { id: true } });
    if (!existingSourceVer) {
      await db.legalSourceVersion.create({
        data: {
          id: IDS.syntheticSourceVersionId,
          legalSourceId: IDS.syntheticSourceId,
          legalVersionKey: 'V1-DEMO',
          versionLabel: 'V1',
          status: 'ACTIVE',
          reviewStatus: 'APPROVED',
        },
      });
    }

    // PRIMARY RequirementCitation linking to synthetic source version
    const existingCitation = await db.requirementCitation.findFirst({
      where: { requirementVersionId: IDS.requirementVersionId, supportRole: 'PRIMARY' },
      select: { id: true },
    });
    if (!existingCitation) {
      await db.requirementCitation.create({
        data: {
          id: IDS.syntheticCitationId,
          requirementVersionId: IDS.requirementVersionId,
          legalSourceVersionId: IDS.syntheticSourceVersionId,
          supportRole: 'PRIMARY',
          locator: 'N/A',
          quotedText: 'Synthetic demo citation',
        },
      });
    }

    // Approve RequirementVersion now that PRIMARY citation exists
    await approveRequirementVersion(IDS.requirementVersionId, IDS.adminUserId, db);

    // Create and approve ApplicabilityRuleVersion (AST GTE 52)
    const existingRule = await db.applicabilityRuleVersion.findFirst({
      where: { requirementVersionId: IDS.requirementVersionId, ruleVersionKey: 'V1-DEMO' },
      select: { id: true, status: true },
    });
    if (!existingRule) {
      const astJson = {
        schemaVersion: 'rule-ast/v1',
        node: {
          kind: 'COMPARE',
          operator: 'GTE',
          left: { kind: 'FACT', factKey: IDS.factDefinitionKey },
          right: { kind: 'LITERAL', valueType: 'number', value: 52 },
        },
      };
      const createdRule = await createApplicabilityRuleVersion({
        requirementVersionId: IDS.requirementVersionId,
        ruleVersionKey: 'V1-DEMO',
        astJson,
        status: 'CANDIDATE',
        evaluationScopeType: 'COMPANY',
        db,
      });
      await approveApplicabilityRuleVersion(createdRule.id, IDS.adminUserId, db);
    } else if (existingRule.status !== 'APPROVED') {
      await approveApplicabilityRuleVersion(existingRule.id, IDS.adminUserId, db);
    }

  // Portal identity (if DEMO_PORTAL_EMAIL is provided)
  await linkPortalIdentityIfConfigured(db);

  console.log('');
  console.log('✅ Presentation demo fixture ready!');
  console.log(`   Client:          Demo Kft. (id=${IDS.clientId})`);
  console.log(`   Lawyer:          Dr. Kovács Péter (id=${IDS.lawyerUserId})`);
  console.log(`   Case (main):     Munkajogi szerződéses áttekintés (id=${IDS.caseMainId})`);
  console.log(`   Case (comply):   Vállalati megfelelőségi áttekintés (id=${IDS.caseComplianceId})`);
  console.log(`   Employee count:  47 (initial state)`);
  console.log('');

}

// ---- Optional portal identity link ------------------------------------------

async function linkPortalIdentityIfConfigured(db) {
  const email = process.env.DEMO_PORTAL_EMAIL;
  if (!email) {
    console.log('   ℹ  DEMO_PORTAL_EMAIL not set — portal identity not linked.');
    return;
  }
  // Never commit a real email; validate format only
  if (!email.includes('@') || email.includes('fixture.invalid')) {
    console.error('❌ DEMO_PORTAL_EMAIL appears invalid. Skipping portal link.');
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();
  // Find existing identity
  const identity = await db.clientPortalIdentity.findUnique({ where: { normalizedEmail }, select: { id: true } });
  if (!identity) {
    console.log(`   ℹ  No portal identity found for ${normalizedEmail}. Manual login prerequisite: create the identity first through the legitimate onboarding flow.`);
    return;
  }
  // Create workspace membership if not existing
  const existing = await db.clientPortalWorkspaceMembership.findFirst({
    where: { clientPortalIdentityId: identity.id, workspaceId: IDS.workspaceId },
    select: { id: true },
  });
  if (!existing) {
    await db.clientPortalWorkspaceMembership.create({
      data: {
        clientPortalIdentityId: identity.id,
        workspaceId: IDS.workspaceId,
        status: 'ACTIVE',
        role: 'MEMBER',
        approvedAt: new Date(),
        approvedById: IDS.adminUserId,
      },
    });
    console.log(`   ✓ Portal membership created for ${normalizedEmail}`);
  } else {
    console.log(`   ✓ Portal membership already exists for ${normalizedEmail}`);
  }
}

// ---- Main -------------------------------------------------------------------

async function main() {
  refuseIfProduction();

  const db = new PrismaClient();
  try {
    await teardown(db);
    await seed(db);
  } catch (err) {
    console.error('❌ Demo reset failed:', err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
