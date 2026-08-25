#!/usr/bin/env node
/**
 * ADMINICULUM — DEMO KFT. ORGANIZATIONAL FIXTURE (deterministic reset + seed)
 *
 * npm run demo:kft:reset
 *
 * Builds ONE coherent organizational demo tenant:
 *   Demo Kft. -> organization -> portal membership (Péterfi János, Ügyvezető)
 *   -> 3 matters/cases -> work package -> tasks -> time entries
 *   -> document metadata (no storage claim) -> review -> client-safe publications
 *   -> company profile (employee_count 47) -> compliance domain.
 *
 * SAFETY (all required):
 *  - NODE_ENV !== 'production'
 *  - ADMINICULUM_DEMO_CONTENT_ENABLED === 'true'
 *  - fixture namespace DEMO_KFT_
 *  - no known production runtime marker present.
 *
 * Idempotent: teardown (FK-safe scoped deleteMany) then reseed. Never truncates
 * shared tables. Does NOT assert live storage for document metadata.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

// ---- Production guard --------------------------------------------------------
const NODE_ENV = String(process.env.NODE_ENV || '');
const DEMO_ENABLED = String(process.env.ADMINICULUM_DEMO_CONTENT_ENABLED || '');
const FIXTURE_NAMESPACE = 'DEMO_KFT_';
const FIXTURE_KEY = 'DEMO_KFT_2026';

function refuseIfProduction() {
  if (NODE_ENV === 'production') {
    console.error('ADMINICULUM_DEMO_PRODUCTION_DENY');
    process.exit(2);
  }
  if (DEMO_ENABLED !== 'true') {
    console.error('❌ REFUSED: ADMINICULUM_DEMO_CONTENT_ENABLED must be "true".');
    process.exit(2);
  }
  if (!FIXTURE_KEY.startsWith(FIXTURE_NAMESPACE)) {
    console.error('❌ REFUSED: fixture namespace mismatch.');
    process.exit(2);
  }
  const prodMarkers = [process.env.WEBSITE_SITE_NAME, process.env.AZURE_FUNCTIONS_ENVIRONMENT, process.env.K_SERVICE].filter(Boolean);
  if (prodMarkers.length > 0) {
    console.error(`❌ REFUSED: production runtime marker detected: ${prodMarkers.join(', ')}`);
    process.exit(2);
  }
  console.log('✅ Safety checks passed.');
}

// Execute guard synchronously at module evaluation time
refuseIfProduction();

// ---- Stable IDs --------------------------------------------------------------
function stableId(name) {
  return crypto.createHash('sha256').update(`${FIXTURE_KEY}:${name}`).digest('hex').slice(0, 32);
}
function stableEmail(name) {
  return `demo-kft-${name}@fixture.invalid`.toLowerCase();
}
function stableRef(name) {
  return `DEMOKFT-${crypto.createHash('sha256').update(`${FIXTURE_KEY}:${name}`).digest('hex').slice(0, 6).toUpperCase()}`;
}

const IDS = {
  adminUserId: process.env.DEMO_ADMIN_USER_ID || stableId('adminUser'),
  lawyerCsanadId: stableId('lawyerCsanad'),
  lawyerGyulaId: stableId('lawyerGyula'),
  clientId: stableId('demoClient'),
  workspaceId: stableId('orgWorkspace'),
  publicRef: 'DEMO-KFT-WORKSPACE',
  mainGroupId: stableId('groupMain'),
  hrGroupId: stableId('groupHr'),
  financeGroupId: stableId('groupFinance'),
  opsGroupId: stableId('groupOps'),
  personPeterfiId: stableId('personPeterfi'),
  personHrLeadId: stableId('personHrLead'),
  personFinanceLeadId: stableId('personFinanceLead'),
  personOpsLeadId: stableId('personOpsLead'),
  operatingProfileId: stableId('operatingProfile'),
  identityId: stableId('portalIdentity'),
  membershipId: stableId('membership'),
  matterEmploymentId: stableId('matterEmployment'),
  matterSupplierId: stableId('matterSupplier'),
  matterComplianceId: stableId('matterCompliance'),
  caseEmploymentId: stableId('caseEmployment'),
  caseSupplierId: stableId('caseSupplier'),
  caseComplianceId: stableId('caseCompliance'),
  wpId: stableId('workPackage'),
  docEmploymentId: stableId('docEmployment'),
  version1Id: stableId('docVersion1'),
  version2Id: stableId('docVersion2'),
  reviewId: stableId('review'),
  reviewPointId: stableId('reviewPoint'),
  pubEmploymentId: stableId('pubEmployment'),
  pubSupplierId: stableId('pubSupplier'),
  factEmployeeCountId: stableId('factEmployeeCount'),
  factDefinitionId: stableId('factDefinitionEmployeeCount'),
  factDefinitionKey: 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT',
  requirementId: stableId('requirement'),
  requirementVersionId: stableId('requirementVersion'),
  requirementKey: 'DEMO_KFT_COMPANY_GROWTH_REVIEW',
  legalSourceId: stableId('legalSource'),
  legalSourceVersionId: stableId('legalSourceVersion'),
  citationId: stableId('citation'),
  applicabilityRuleVersionId: stableId('applicabilityRuleVersion'),
  complianceDomainId: stableId('complianceDomain'),
};

const TASK_IDS = {
  empReview: stableId('taskEmpReview'),
  empAiCheck: stableId('taskEmpAiCheck'),
  empLawyerDecision: stableId('taskEmpLawyerDecision'),
  supReview: stableId('taskSupReview'),
  compReview: stableId('taskCompReview'),
};

const TIME_IDS = {
  empReview: stableId('timeEmpReview'),
  empLawyer: stableId('timeEmpLawyer'),
  supReview: stableId('timeSupReview'),
  supQuestions: stableId('timeSupQuestions'),
  compReview: stableId('timeCompReview'),
  compDraft: stableId('timeCompDraft'),
};

const COMM_IDS = {
  incoming: stableId('commIncoming'),
  handoff: stableId('commHandoff'),
  clientUpdate: stableId('commClientUpdate'),
};

// ---- Teardown (FK-safe) ------------------------------------------------------
async function teardown(db) {
  console.log('🗑  Tearing down previous DEMO KFT fixture...');
  await db.assessmentFinding.deleteMany({ where: { clientId: IDS.clientId } });
  await db.requirementApplicabilityFact.deleteMany({ where: { applicability: { clientId: IDS.clientId } } });
  await db.requirementApplicability.deleteMany({ where: { clientId: IDS.clientId } });
  await db.applicabilityRuleVersion.deleteMany({ where: { requirementVersionId: IDS.requirementVersionId } });
  await db.requirementCitation.deleteMany({ where: { requirementVersionId: IDS.requirementVersionId } });
  await db.requirementVersion.deleteMany({ where: { id: IDS.requirementVersionId } });
  await db.requirement.deleteMany({ where: { id: IDS.requirementId } });
  await db.legalSourceVersion.deleteMany({ where: { id: IDS.legalSourceVersionId } });
  await db.legalSource.deleteMany({ where: { id: IDS.legalSourceId } });
  await db.complianceDomain.deleteMany({ where: { code: 'DEMO_KFT_GROWTH' } });

  await db.reviewPoint.deleteMany({ where: { id: IDS.reviewPointId } });
  await db.documentReview.deleteMany({ where: { id: IDS.reviewId } });
  await db.documentVersion.deleteMany({ where: { id: { in: [IDS.version1Id, IDS.version2Id] } } });
  await db.document.deleteMany({ where: { id: IDS.docEmploymentId } });

  await db.clientSafeUpdate.deleteMany({ where: { id: { in: [IDS.pubEmploymentId, IDS.pubSupplierId] } } });

  await db.communication.deleteMany({ where: { id: { in: Object.values(COMM_IDS) } } });

  await db.timeEntry.deleteMany({ where: { id: { in: Object.values(TIME_IDS) } } });
  await db.task.deleteMany({ where: { id: { in: Object.values(TASK_IDS) } } });

  await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackageId: IDS.wpId } });
  await db.caseWorkPackage.deleteMany({ where: { id: IDS.wpId } });

  await db.case.deleteMany({ where: { id: { in: [IDS.caseEmploymentId, IDS.caseSupplierId, IDS.caseComplianceId] } } });
  await db.matter.deleteMany({ where: { id: { in: [IDS.matterEmploymentId, IDS.matterSupplierId, IDS.matterComplianceId] } } });

  await db.clientPortalGrant.deleteMany({ where: { clientPortalIdentityId: IDS.identityId } });
  await db.clientPortalWorkspaceMembership.deleteMany({ where: { id: IDS.membershipId } });
  await db.clientPortalIdentity.deleteMany({ where: { id: IDS.identityId } });

  await db.organizationPerson.deleteMany({ where: { clientId: IDS.clientId } });
  await db.clientOrganizationGroup.deleteMany({ where: { clientId: IDS.clientId } });

  await db.clientFact.deleteMany({ where: { clientId: IDS.clientId } });
  await db.factDefinition.deleteMany({ where: { OR: [{ id: IDS.factDefinitionId }, { key: IDS.factDefinitionKey }] } });
  await db.clientOperatingProfile.deleteMany({ where: { id: IDS.operatingProfileId } });
  await db.clientPortalWorkspace.deleteMany({ where: { id: IDS.workspaceId } });
  await db.client.deleteMany({ where: { id: IDS.clientId } });
  await db.user.deleteMany({ where: { id: { in: [IDS.adminUserId, IDS.lawyerCsanadId, IDS.lawyerGyulaId] } } });
  console.log('  ✓ Demo KFT fixture cleared.');
}

// ---- Seed --------------------------------------------------------------------
async function seed(db) {
  const now = new Date();

  // Workforce users (law firm), seeded only if not already present.
  await db.user.upsert({
    where: { id: IDS.adminUserId },
    update: {},
    create: { id: IDS.adminUserId, email: stableEmail('admin'), name: 'Demo Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
  });
  await db.user.upsert({
    where: { id: IDS.lawyerCsanadId },
    update: {},
    create: { id: IDS.lawyerCsanadId, email: stableEmail('csanad'), name: 'Dr. Trugly Csanád', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: ['munkajog', 'review'] },
  });
  await db.user.upsert({
    where: { id: IDS.lawyerGyulaId },
    update: {},
    create: { id: IDS.lawyerGyulaId, email: stableEmail('gyula'), name: 'Dr. Hubay Gyula Máté', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: ['munkajog', 'szerződés', 'review'] },
  });

  // 1. Demo Kft. client.
  await db.client.upsert({
    where: { id: IDS.clientId },
    update: {},
    create: { id: IDS.clientId, name: 'Demo Kft.', notes: '[DEMO_KFT] Synthetic presentation company. NOT a real customer.', relationshipMode: 'PORTAL_CENTRIC' },
  });

  // 2. ORGANIZATION portal workspace.
  await db.clientPortalWorkspace.upsert({
    where: { id: IDS.workspaceId },
    update: {},
    create: { id: IDS.workspaceId, clientId: IDS.clientId, name: 'Demo Kft. – Company Workspace', mode: 'ORGANIZATION', status: 'ACTIVE', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED', publicReference: IDS.publicRef, createdById: IDS.adminUserId },
  });

  // 3. Operating profile (ENROLLED) + company facts/profiles.
  await db.clientOperatingProfile.upsert({
    where: { id: IDS.operatingProfileId },
    update: {},
    create: { id: IDS.operatingProfileId, clientId: IDS.clientId, status: 'ACTIVE', complianceEnrollmentStatus: 'ENROLLED', summary: '[DEMO_KFT] Szintetikus bemutató vállalat.', internalNote: 'DEMO KFT fixture — presentation only.' },
  });

  // 4. Organization structure (Ügyvezetés / HR / Pénzügy / Operáció).
  await db.clientOrganizationGroup.upsert({ where: { id: IDS.mainGroupId }, update: {}, create: { id: IDS.mainGroupId, clientId: IDS.clientId, workspaceId: IDS.workspaceId, name: 'Ügyvezetés', status: 'ACTIVE', createdById: IDS.adminUserId } });
  await db.clientOrganizationGroup.upsert({ where: { id: IDS.hrGroupId }, update: {}, create: { id: IDS.hrGroupId, clientId: IDS.clientId, workspaceId: IDS.workspaceId, name: 'HR', status: 'ACTIVE', createdById: IDS.adminUserId } });
  await db.clientOrganizationGroup.upsert({ where: { id: IDS.financeGroupId }, update: {}, create: { id: IDS.financeGroupId, clientId: IDS.clientId, workspaceId: IDS.workspaceId, name: 'Pénzügy', status: 'ACTIVE', createdById: IDS.adminUserId } });
  await db.clientOrganizationGroup.upsert({ where: { id: IDS.opsGroupId }, update: {}, create: { id: IDS.opsGroupId, clientId: IDS.clientId, workspaceId: IDS.workspaceId, name: 'Operáció', status: 'ACTIVE', createdById: IDS.adminUserId } });

  await db.organizationPerson.upsert({ where: { id: IDS.personPeterfiId }, update: {}, create: { id: IDS.personPeterfiId, clientId: IDS.clientId, organizationGroupId: IDS.mainGroupId, name: 'Péterfi János', jobTitle: 'Ügyvezető', employmentStatus: 'ACTIVE' } });
  await db.organizationPerson.upsert({ where: { id: IDS.personHrLeadId }, update: {}, create: { id: IDS.personHrLeadId, clientId: IDS.clientId, organizationGroupId: IDS.hrGroupId, name: 'HR vezető', jobTitle: 'HR vezető', employmentStatus: 'ACTIVE' } });
  await db.organizationPerson.upsert({ where: { id: IDS.personFinanceLeadId }, update: {}, create: { id: IDS.personFinanceLeadId, clientId: IDS.clientId, organizationGroupId: IDS.financeGroupId, name: 'Pénzügyi vezető', jobTitle: 'Pénzügyi vezető', employmentStatus: 'ACTIVE' } });
  await db.organizationPerson.upsert({ where: { id: IDS.personOpsLeadId }, update: {}, create: { id: IDS.personOpsLeadId, clientId: IDS.clientId, organizationGroupId: IDS.opsGroupId, name: 'Operációs vezető', jobTitle: 'Operációs vezető', employmentStatus: 'ACTIVE' } });

  // 5. Company profile fact — employee_count = 47 (canonical typed-fact shape).
  const fd = await db.factDefinition.upsert({
    where: { id: IDS.factDefinitionId },
    update: {},
    create: {
      id: IDS.factDefinitionId,
      key: IDS.factDefinitionKey,
      domainCode: 'DEMO_KFT_GROWTH',
      valueType: 'NUMBER',
      allowedScopeTypes: ['COMPANY'],
      determinationMethod: 'USER_PROVIDED',
      overlapPolicy: 'ALLOW',
      temporalPolicy: 'OBSERVATION',
    },
  });
  await db.clientFact.upsert({
    where: { id: IDS.factEmployeeCountId },
    update: {},
    create: {
      id: IDS.factEmployeeCountId,
      clientId: IDS.clientId,
      type: IDS.factDefinitionKey,
      value: '47',
      factDefinitionId: fd.id,
      scopeType: 'COMPANY',
      numberValue: 47,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      verificationStatus: 'CLIENT_PROVIDED',
      observedAt: new Date('2026-01-01T00:00:00Z'),
    },
  });

  // 6. Compliance domain + synthetic requirement + source provenance + APPROVED rule (threshold: 52).
  const existingDomain = await db.complianceDomain.findUnique({ where: { code: 'DEMO_KFT_GROWTH' }, select: { code: true } });
  if (!existingDomain) await db.complianceDomain.create({ data: { code: 'DEMO_KFT_GROWTH', label: 'Szervezeti növekedési áttekintés [DEMO_KFT]' } });
  const existingReq = await db.requirement.findUnique({ where: { key: IDS.requirementKey }, select: { id: true } });
  if (!existingReq) await db.requirement.create({ data: { id: IDS.requirementId, key: IDS.requirementKey, jurisdictionCode: 'HU', domainCode: 'DEMO_KFT_GROWTH' } });
  const {
    approveRequirementVersion,
    approveApplicabilityRuleVersion,
    createApplicabilityRuleVersion,
  } = await import('../src/modules/compliance/requirementRuleService.ts');

  // RequirementVersion in CANDIDATE state
  const existingRv = await db.requirementVersion.findUnique({
    where: { id: IDS.requirementVersionId },
    select: { id: true, status: true },
  });
  if (!existingRv) {
    await db.requirementVersion.create({
      data: {
        id: IDS.requirementVersionId,
        requirementId: IDS.requirementId,
        versionKey: 'V1-DEMO-KFT',
        title: 'Szervezeti növekedési áttekintés [DEMO_KFT]',
        normativeStatement: '[DEMO — szintetikus] Ha a foglalkoztatottak száma eléri az 52 főt, új megfelelőségi terület jelenik meg. Csak termékbemutató, nem jogi kötelezettség.',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        sourceSupportState: 'SUFFICIENT',
        status: 'CANDIDATE',
        specialistRequirement: 'NONE',
      },
    });
  }

  // Synthetic LegalSource
  const existingSource = await db.legalSource.findUnique({
    where: { id: IDS.legalSourceId },
    select: { id: true },
  });
  if (!existingSource) {
    await db.legalSource.create({
      data: {
        id: IDS.legalSourceId,
        sourceKey: IDS.legalSourceId,
        jurisdictionCode: 'HU',
        instrumentType: 'OTHER',
        canonicalCitation: '[DEMO — NEM JOGFORRÁS] Bemutató szabály',
        title: 'Demo Kft. növekedési megfelelőségi szabály [DEMO]',
        issuer: 'Adminiculum Demo Kft.',
        status: 'APPROVED',
      },
    });
  }

  // Synthetic LegalSourceVersion
  const existingSourceVer = await db.legalSourceVersion.findUnique({
    where: { id: IDS.legalSourceVersionId },
    select: { id: true },
  });
  if (!existingSourceVer) {
    await db.legalSourceVersion.create({
      data: {
        id: IDS.legalSourceVersionId,
        legalSourceId: IDS.legalSourceId,
        legalVersionKey: 'V1-DEMO-KFT',
        versionLabel: 'V1',
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
      },
    });
  }

  // PRIMARY RequirementCitation linking RequirementVersion -> LegalSourceVersion
  const existingCitation = await db.requirementCitation.findFirst({
    where: { requirementVersionId: IDS.requirementVersionId, supportRole: 'PRIMARY' },
    select: { id: true },
  });
  if (!existingCitation) {
    await db.requirementCitation.create({
      data: {
        id: IDS.citationId,
        requirementVersionId: IDS.requirementVersionId,
        legalSourceVersionId: IDS.legalSourceVersionId,
        supportRole: 'PRIMARY',
        locator: 'N/A',
        quotedText: 'Szintetikus bemutató szabály',
      },
    });
  }

  // Standard approval sequence for RequirementVersion (requires PRIMARY citation)
  const rv = await db.requirementVersion.findUnique({
    where: { id: IDS.requirementVersionId },
    select: { status: true },
  });
  if (rv && rv.status !== 'APPROVED') {
    await approveRequirementVersion(IDS.requirementVersionId, IDS.adminUserId, db);
  }

  // Deterministic, engine-valid rule AST: employee_count >= 52 -> applicable.
  const astJson = {
    schemaVersion: 'rule-ast/v1',
    node: {
      kind: 'COMPARE',
      operator: 'GTE',
      left: { kind: 'FACT', factKey: IDS.factDefinitionKey },
      right: { kind: 'LITERAL', valueType: 'number', value: 52 },
    },
  };
  const existingRule = await db.applicabilityRuleVersion.findFirst({ where: { requirementVersionId: IDS.requirementVersionId }, select: { id: true, status: true } });
  if (!existingRule) {
    const createdRule = await createApplicabilityRuleVersion({
      requirementVersionId: IDS.requirementVersionId,
      ruleVersionKey: 'R1-DEMO-KFT',
      astJson,
      status: 'CANDIDATE',
      evaluationScopeType: 'COMPANY',
      db,
    });
    await approveApplicabilityRuleVersion(createdRule.id, IDS.adminUserId, db);
  } else if (existingRule.status !== 'APPROVED') {
    await approveApplicabilityRuleVersion(existingRule.id, IDS.adminUserId, db);
  }

  // 7. Matters (economic container) — 1 per case.
  const matterRows = [
    { id: IDS.matterEmploymentId, title: 'Munkaszerződés- és HR dokumentumok', matterType: 'EMPLOYMENT', clientId: IDS.clientId },
    { id: IDS.matterSupplierId, title: 'Beszállítói keretszerződés', matterType: 'CONTRACT', clientId: IDS.clientId },
    { id: IDS.matterComplianceId, title: 'Megfelelőségi áttekintés', matterType: 'COMPLIANCE', clientId: IDS.clientId },
  ];
  for (const m of matterRows) await db.matter.upsert({ where: { id: m.id }, update: {}, create: m });

  // 8. Cases.
  await db.case.upsert({ where: { id: IDS.caseEmploymentId }, update: {}, create: { id: IDS.caseEmploymentId, caseNumber: stableRef('caseEmployment'), title: 'Munkaszerződés- és belső HR dokumentumok felülvizsgálata', caseType: 'EMPLOYMENT', status: 'IN_REVIEW', priority: 'HIGH', clientId: IDS.clientId, matterId: IDS.matterEmploymentId, assignedLawyerId: IDS.lawyerCsanadId, createdById: IDS.adminUserId, description: '[DEMO_KFT] Bemutató ügy.' } });
  await db.case.upsert({ where: { id: IDS.caseSupplierId }, update: {}, create: { id: IDS.caseSupplierId, caseNumber: stableRef('caseSupplier'), title: 'Beszállítói keretszerződés felülvizsgálata', caseType: 'CONTRACT_REVIEW', status: 'IN_REVIEW', priority: 'MEDIUM', clientId: IDS.clientId, matterId: IDS.matterSupplierId, assignedLawyerId: IDS.lawyerGyulaId, createdById: IDS.adminUserId } });
  await db.case.upsert({ where: { id: IDS.caseComplianceId }, update: {}, create: { id: IDS.caseComplianceId, caseNumber: stableRef('caseCompliance'), title: 'Vállalati megfelelőségi áttekintés', caseType: 'CORPORATE', status: 'IN_REVIEW', priority: 'MEDIUM', clientId: IDS.clientId, matterId: IDS.matterComplianceId, assignedLawyerId: IDS.lawyerGyulaId, createdById: IDS.adminUserId } });

  // 9. Work package (canonical models) for Case A — 6 modules, 3 completed.
  await db.caseWorkPackage.upsert({
    where: { id: IDS.wpId },
    update: {},
    create: { id: IDS.wpId, caseId: IDS.caseEmploymentId, workPackageTemplateVersion: 1, createdById: IDS.adminUserId },
  });
  const L = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'ACTIVE', 'ACTIVE', 'ACTIVE'];
  const modules = [
    ['DOCUMENT_WORK', 'incoming-review', 'Beérkező dokumentum áttekintése', IDS.lawyerGyulaId],
    ['RESEARCH', 'legal-research', 'Jogi kutatás', IDS.lawyerGyulaId],
    ['REVIEW', 'document-review', 'Dokumentum felülvizsgálata', IDS.lawyerGyulaId],
    ['CLIENT_REQUEST', 'client-questions', 'Ügyfélkérdések', IDS.lawyerCsanadId],
    ['APPROVAL', 'lawyer-decision', 'Felelős ügyvédi döntés', IDS.lawyerCsanadId],
    ['DELIVERY', 'delivery', 'Leadás', IDS.lawyerCsanadId],
  ];
  await db.caseWorkPackageItem.createMany({
    data: modules.map(([type, key, label, resp], i) => ({
      id: stableId('wp-item-' + key),
      caseWorkPackageId: IDS.wpId,
      moduleType: type,
      moduleKey: key,
      label,
      status: L[i],
      order: i,
      responsibleId: resp,
      config: {},
    })),
  });

  // 10. Tasks.
  await db.task.upsert({ where: { id: TASK_IDS.empReview }, update: {}, create: { id: TASK_IDS.empReview, title: 'Első körös munkajogi dokumentum-felülvizsgálat', taskType: 'REVIEW_CONTRACT', status: 'IN_REVIEW', priority: 'HIGH', caseId: IDS.caseEmploymentId, matterId: IDS.matterEmploymentId, assignedToId: IDS.lawyerGyulaId, assignedById: IDS.lawyerCsanadId, requiredSkills: [] } });
  await db.task.upsert({ where: { id: TASK_IDS.empAiCheck }, update: {}, create: { id: TASK_IDS.empAiCheck, title: 'AI-val támogatott előkészítés ellenőrzése', taskType: 'REVIEW_ANONYMIZED', status: 'IN_REVIEW', priority: 'HIGH', caseId: IDS.caseEmploymentId, matterId: IDS.matterEmploymentId, assignedToId: IDS.lawyerGyulaId, assignedById: IDS.lawyerCsanadId, requiredSkills: [] } });
  await db.task.upsert({ where: { id: TASK_IDS.empLawyerDecision }, update: {}, create: { id: TASK_IDS.empLawyerDecision, title: 'Felelős ügyvédi döntés', taskType: 'APPROVAL', status: 'TODO', priority: 'HIGH', caseId: IDS.caseEmploymentId, matterId: IDS.matterEmploymentId, assignedToId: IDS.lawyerCsanadId, assignedById: IDS.adminUserId, requiredSkills: [] } });
  await db.task.upsert({ where: { id: TASK_IDS.supReview }, update: {}, create: { id: TASK_IDS.supReview, title: 'Első jogi áttekintés', taskType: 'REVIEW_CONTRACT', status: 'IN_REVIEW', priority: 'MEDIUM', caseId: IDS.caseSupplierId, matterId: IDS.matterSupplierId, assignedToId: IDS.lawyerGyulaId, assignedById: IDS.adminUserId, requiredSkills: [] } });
  await db.task.upsert({ where: { id: TASK_IDS.compReview }, update: {}, create: { id: TASK_IDS.compReview, title: 'Megfelelőségi áttekintés', taskType: 'REVIEW_CONTRACT', status: 'IN_REVIEW', priority: 'MEDIUM', caseId: IDS.caseComplianceId, matterId: IDS.matterComplianceId, assignedToId: IDS.lawyerGyulaId, assignedById: IDS.adminUserId, requiredSkills: [] } });

  // 11. Time entries (875 total = 380 + 310 + 185), client-safe descriptions.
  const timeRows = [
    { id: TIME_IDS.empReview, matterId: IDS.matterEmploymentId, userId: IDS.lawyerGyulaId, minutes: 200, workType: 'DRAFTING', billable: true, description: 'Dokumentumok első jogi áttekintése' },
    { id: TIME_IDS.empLawyer, matterId: IDS.matterEmploymentId, userId: IDS.lawyerCsanadId, minutes: 180, workType: 'REVIEW', billable: true, description: 'Ügyvédi felülvizsgálat' },
    { id: TIME_IDS.supReview, matterId: IDS.matterSupplierId, userId: IDS.lawyerGyulaId, minutes: 190, workType: 'DRAFTING', billable: true, description: 'Szerződéses kérdések vizsgálata' },
    { id: TIME_IDS.supQuestions, matterId: IDS.matterSupplierId, userId: IDS.lawyerGyulaId, minutes: 120, workType: 'CLIENT_CALL', billable: true, description: 'Keretszerződés áttekintése' },
    { id: TIME_IDS.compReview, matterId: IDS.matterComplianceId, userId: IDS.lawyerGyulaId, minutes: 125, workType: 'REVIEW', billable: true, description: 'Megfelelőségi kérdések vizsgálata' },
    { id: TIME_IDS.compDraft, matterId: IDS.matterComplianceId, userId: IDS.lawyerGyulaId, minutes: 60, workType: 'DRAFTING', billable: true, description: 'Megfelelőségi összefoglaló készítése' },
  ];
  for (const r of timeRows) await db.timeEntry.upsert({ where: { id: r.id }, update: {}, create: { id: r.id, matterId: r.matterId, userId: r.userId, minutes: r.minutes, workType: r.workType, billable: r.billable, description: r.description, workDate: now } });

  // 12. Communications.
  await db.communication.upsert({ where: { id: COMM_IDS.incoming }, update: {}, create: { id: COMM_IDS.incoming, type: 'EMAIL', subject: 'Munkaszerződés-minták megküldése', body: 'Kérjük a munkaszerződés-minták és a kapcsolódó HR dokumentumok áttekintését.', senderName: 'Péterfi János', senderEmail: 'demo-kft-uzletvezeto@fixture.invalid', clientId: IDS.clientId, caseId: IDS.caseEmploymentId, direction: 'INBOUND', source: 'MANUAL', recipients: [] } });
  await db.communication.upsert({ where: { id: COMM_IDS.handoff }, update: {}, create: { id: COMM_IDS.handoff, type: 'NOTE', subject: 'Belső felülvizsgálati megbízás', body: 'Első körös felülvizsgálat, problémás kikötések megjelölése.', senderName: 'Dr. Trugly Csanád', senderEmail: stableEmail('csanad'), recipientName: 'Dr. Hubay Gyula Máté', clientId: IDS.clientId, caseId: IDS.caseEmploymentId, direction: 'OUTBOUND', source: 'MANUAL', recipients: [] } });
  await db.communication.upsert({ where: { id: COMM_IDS.clientUpdate }, update: {}, create: { id: COMM_IDS.clientUpdate, type: 'NOTE', subject: 'Ügy állapota', body: 'Az első jogi áttekintés elkészült, felelős ügyvédi jóváhagyás alatt.', senderName: 'Dr. Trugly Csanád', clientId: IDS.clientId, caseId: IDS.caseEmploymentId, direction: 'OUTBOUND', source: 'MANUAL', recipients: [] } });

  // 13. Document metadata (NO live storage claim — storageReference/spItemId stay null).
  await db.document.upsert({
    where: { id: IDS.docEmploymentId },
    update: {},
    create: { id: IDS.docEmploymentId, name: 'Munkaszerződés_minta.docx', fileName: 'Munkaszerződés_minta.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'CONTRACT', documentType: 'SOURCE', clientId: IDS.clientId, caseId: IDS.caseEmploymentId, title: 'Munkaszerződés minta', documentRole: 'SOURCE', workStatus: 'INTERNAL_REVIEW', responsibleId: IDS.lawyerGyulaId, reviewerId: IDS.lawyerCsanadId, workInstruction: 'Első körös felülvizsgálat, problémás kikötések jelölése.', nextStep: 'Felelős ügyvédi jóváhagyás', isLatest: true },
  });
  // Immutable metadata-only versions (no storage assertion).
  await db.documentVersion.upsert({ where: { id: IDS.version1Id }, update: {}, create: { id: IDS.version1Id, documentId: IDS.docEmploymentId, version: 1, name: 'Munkaszerződés_minta.docx', originalFileName: 'Munkaszerződés_minta.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', isCurrent: false, versionType: 'WORKING_COPY' } });
  await db.documentVersion.upsert({ where: { id: IDS.version2Id }, update: {}, create: { id: IDS.version2Id, documentId: IDS.docEmploymentId, version: 2, name: 'Munkaszerződés_minta_belso_revizios_v2.docx', originalFileName: 'Munkaszerződés_minta_belso_revizios_v2.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', isCurrent: true, versionType: 'WORKING_COPY' } });

  // 14. Review + review point.
  await db.documentReview.upsert({
    where: { id: IDS.reviewId },
    update: {},
    create: { id: IDS.reviewId, documentId: IDS.docEmploymentId, status: 'IN_REVIEW', createdById: IDS.lawyerGyulaId, assignedReviewerId: IDS.lawyerCsanadId },
  });
  await db.reviewPoint.upsert({
    where: { id: IDS.reviewPointId },
    update: {},
    create: { id: IDS.reviewPointId, reviewId: IDS.reviewId, type: 'WHOLE_DOCUMENT', status: 'OPEN', severity: 'NORMAL', body: 'A felmondási idő kikötése ellentmond a hatályos munkajogi szabályoknak.' },
  });

  // 15. Client-safe publications (customer-safe snapshots).
  await db.clientSafeUpdate.upsert({
    where: { id: IDS.pubEmploymentId },
    update: {},
    create: { id: IDS.pubEmploymentId, clientId: IDS.clientId, caseId: IDS.caseEmploymentId, category: 'ACTION_REQUIRED', status: 'PUBLISHED', body: 'Az első jogi áttekintés elkészült. Következő lépés: felelős ügyvédi jóváhagyás.', createdAt: now },
  });
  await db.clientSafeUpdate.upsert({
    where: { id: IDS.pubSupplierId },
    update: {},
    create: { id: IDS.pubSupplierId, clientId: IDS.clientId, caseId: IDS.caseSupplierId, category: 'STATUS', status: 'PUBLISHED', body: 'Az első szerződéses áttekintés folyamatban van.', createdAt: now },
  });

  // 16. Portal identity + membership + grants (Péterfi János, executive/approver).
  await db.clientPortalIdentity.upsert({
    where: { id: IDS.identityId },
    update: {},
    create: { id: IDS.identityId, normalizedEmail: 'demo-kft-uzletvezeto@fixture.invalid', status: 'ACTIVE', emailVerified: true },
  });
  await db.clientPortalWorkspaceMembership.upsert({
    where: { id: IDS.membershipId },
    update: {},
    create: { id: IDS.membershipId, clientPortalIdentityId: IDS.identityId, workspaceId: IDS.workspaceId, status: 'ACTIVE', role: 'APPROVER', approvedAt: now },
  });
  // Broad legitimate client-safe access through explicit grants.
  const grantRows = [
    { id: stableId('grantEmployment'), caseId: IDS.caseEmploymentId, permissions: ['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'ACTION_REQUEST_READ', 'UPDATE_READ'] },
    { id: stableId('grantSupplier'), caseId: IDS.caseSupplierId, permissions: ['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'ACTION_REQUEST_READ', 'UPDATE_READ'] },
    { id: stableId('grantCompliance'), caseId: IDS.caseComplianceId, permissions: ['MATTER_READ', 'UPDATE_READ'] },
  ];
  for (const g of grantRows) await db.clientPortalGrant.upsert({ where: { id: g.id }, update: {}, create: { id: g.id, clientPortalIdentityId: IDS.identityId, workspaceId: IDS.workspaceId, clientId: IDS.clientId, caseId: g.caseId, status: 'ACTIVE', role: 'VIEWER', permissions: g.permissions, validFrom: now } });

  console.log('\n✅ DEMO KFT fixture ready!');
  console.log('   Client:    Demo Kft. (id=[' + IDS.clientId + '])');
  console.log('   Exec:      Péterfi János · Ügyvezető (membership + grants)');
  console.log('   Cases:     Employment / Supplier / Compliance');
  console.log('   Baseline:  employee_count = 47');
}

const db = new PrismaClient();
(async () => {
  refuseIfProduction();
  await teardown(db);
  await seed(db);
})()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
