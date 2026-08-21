/**
 * PHASE 5 TEST FOUNDATION — reusable organizational-customer portal fixture.
 *
 * Builds a deterministic, canonical-model-only fixture representing a realistic
 * organizational customer journey (ClientPortalWorkspace ORGANIZATION mode,
 * identity + membership + grants, org groups/persons, contract library,
 * company data, matter/document publication, messaging, action requests,
 * requests/submissions) PLUS a second Client with deliberately nearby data to
 * prove cross-client isolation.
 *
 * NO schema change. NO product code. NO parallel fixture-only persistence.
 * All entities are canonical Prisma models. Authorization helpers reuse the
 * canonical resolvers (resolvePortalWorkspace / resolveActiveCustomerGrant /
 * resolveParticipantAccess) — never a bypass.
 *
 * Deterministic: every ID is generated up-front from a caller-supplied seed
 * namespace so the fixture is reproducible, and rows are created via explicit
 * ids (no reliance on auto-generated UUIDs).
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export type Db = PrismaClient;

export interface OrgPortalFixtureIds {
  // Workforce
  adminId: string;
  lawyerId: string;
  // Client A (organizational customer) + its org workspace
  clientA: string;
  orgWsA: string;
  orgWsB: string; // second ORG workspace on client A (cross-workspace isolation)
  groupA: string;
  groupFinance: string;
  personActive: string;
  personInactive: string;
  personCrossClient: string;
  // Client B (negative isolation)
  clientB: string;
  // Identities / memberships on client A org workspace
  authorizedIdentity: string;
  authorizedMembership: string;
  noGrantIdentity: string;
  noGrantMembership: string;
  expiredIdentity: string;
  expiredMembership: string;
  inactiveIdentity: string;
  // Cases + grants (client A)
  caseOne: string;
  caseTwo: string; // granted to authorized
  caseUngranted: string; // same workspace, no grant
  caseCrossClient: string; // client B case
  taskOne: string;
  taskInternalNote: string;
  // Contracts
  contractPublished: string; // safe + published exact doc version
  contractInternalOnly: string; // must never appear
  contractNoPublication: string; // ACTIVE but no published doc version
  contractCrossClient: string;
  // Obligation
  obligationOne: string;
  obligationCrossClient: string;
  // Company data (client A)
  operatingProfileA: string;
  factA: string;
  initiativeA: string;
  milestoneA: string;
  assessmentA: string;
  findingA: string;
  // Matter publication + immutable revision (client A, caseOne)
  matterPub: string;
  matterRevision: string;
  // Documents + versions (client A, caseOne)
  docPublished: string;
  docPublishedVersion: string;
  docPublishedVersion2: string;
  docInternal: string;
  docInternalVersion: string;
  docHrConfidential: string;
  docHrConfidentialVersion: string;
  docCrossClient: string;
  docCrossClientVersion: string;
  // Document publication
  docPublication: string;
  docPublicationSelected: string;
  docPublicationSelectedRecipientMembership: string;
  docSelected: string;
  docSelectedVersion: string;
  // Messaging
  threadA: string;
  threadCrossClient: string;
  // Action requests / requests / submissions
  actionRequestA: string;
  clientRequestA: string;
  submissionA: string;
  submissionFileNotClean: string;
}

/**
 * Build the full organizational-customer portal fixture deterministically.
 * Every entity is created with explicit ids derived from the seed.
 */
export async function createOrganizationalPortalFixture(
  db: Db,
  seed: string,
  opts: {
    publicReferenceA?: string;
    publicReferenceB?: string;
    clientAWorkspaceMode?: string;
  } = {},
): Promise<OrgPortalFixtureIds> {
  const ns = (name: string) => `${seed}:${name}`;
  const id = (name: string) => crypto.createHash('sha256').update(ns(name)).digest('hex').slice(0, 32);
  // Ensure uniqueness of caseNumber across parallel runs (must be globally unique).
  const ref = (prefix: string, name: string) => `${prefix}-${crypto.createHash('sha256').update(ns(name)).digest('hex').slice(0, 8)}`;

  const ids: OrgPortalFixtureIds = {
    adminId: id('admin'),
    lawyerId: id('lawyer'),
    clientA: id('clientA'),
    orgWsA: id('orgWsA'),
    orgWsB: id('orgWsB'),
    groupA: id('groupA'),
    groupFinance: id('groupFinance'),
    personActive: id('personActive'),
    personInactive: id('personInactive'),
    personCrossClient: id('personCrossClient'),
    clientB: id('clientB'),
    authorizedIdentity: id('authorizedIdentity'),
    authorizedMembership: id('authorizedMembership'),
    noGrantIdentity: id('noGrantIdentity'),
    noGrantMembership: id('noGrantMembership'),
    expiredIdentity: id('expiredIdentity'),
    expiredMembership: id('expiredMembership'),
    inactiveIdentity: id('inactiveIdentity'),
    caseOne: id('caseOne'),
    caseTwo: id('caseTwo'),
    caseUngranted: id('caseUngranted'),
    caseCrossClient: id('caseCrossClient'),
    taskOne: id('taskOne'),
    taskInternalNote: id('taskInternalNote'),
    contractPublished: id('contractPublished'),
    contractInternalOnly: id('contractInternalOnly'),
    contractNoPublication: id('contractNoPublication'),
    contractCrossClient: id('contractCrossClient'),
    obligationOne: id('obligationOne'),
    obligationCrossClient: id('obligationCrossClient'),
    operatingProfileA: id('operatingProfileA'),
    factA: id('factA'),
    initiativeA: id('initiativeA'),
    milestoneA: id('milestoneA'),
    assessmentA: id('assessmentA'),
    findingA: id('findingA'),
    matterPub: id('matterPub'),
    matterRevision: id('matterRevision'),
    docPublished: id('docPublished'),
    docPublishedVersion: id('docPublishedVersion'),
    docPublishedVersion2: id('docPublishedVersion2'),
    docInternal: id('docInternal'),
    docInternalVersion: id('docInternalVersion'),
    docHrConfidential: id('docHrConfidential'),
    docHrConfidentialVersion: id('docHrConfidentialVersion'),
    docCrossClient: id('docCrossClient'),
    docCrossClientVersion: id('docCrossClientVersion'),
    docPublication: id('docPublication'),
    docPublicationSelected: id('docPublicationSelected'),
    docPublicationSelectedRecipientMembership: id('docPublicationSelectedRecipientMembership'),
    docSelected: id('docSelected'),
    docSelectedVersion: id('docSelectedVersion'),
    threadA: id('threadA'),
    threadCrossClient: id('threadCrossClient'),
    actionRequestA: id('actionRequestA'),
    clientRequestA: id('clientRequestA'),
    submissionA: id('submissionA'),
    submissionFileNotClean: id('submissionFileNotClean'),
  };

  const email = (name: string) => `${ns(name)}@fixture.invalid`.toLowerCase();
  const refA = ref('P5A', 'caseOne');

  // ---- Workforce users ----
  await db.user.createMany({ data: [
    { id: ids.adminId, email: email('admin'), name: 'Phase5 Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
    { id: ids.lawyerId, email: email('lawyer'), name: 'Phase5 Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
  ] as never });

  // ---- Clients ----
  await db.client.createMany({ data: [
    { id: ids.clientA, name: 'Phase5 Org Client A' },
    { id: ids.clientB, name: 'Phase5 Org Client B' },
  ] });

  // ---- Cases ----
  await db.case.create({ data: { id: ids.caseOne, caseNumber: refA, title: 'Phase5 case one', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, assignedLawyerId: ids.lawyerId, createdById: ids.adminId } as never });
  await db.case.create({ data: { id: ids.caseTwo, caseNumber: ref('P5A', 'caseTwo'), title: 'Phase5 case two', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, assignedLawyerId: ids.lawyerId, createdById: ids.adminId } as never });
  await db.case.create({ data: { id: ids.caseUngranted, caseNumber: ref('P5A', 'caseUngranted'), title: 'Phase5 ungranted', caseType: 'CONTRACT_REVIEW', clientId: ids.clientA, assignedLawyerId: ids.lawyerId, createdById: ids.adminId } as never });
  await db.case.create({ data: { id: ids.caseCrossClient, caseNumber: ref('P5B', 'caseCrossClient'), title: 'Phase5 client B case', caseType: 'CONTRACT_REVIEW', clientId: ids.clientB, assignedLawyerId: ids.lawyerId, createdById: ids.adminId } as never });

  // ---- Internal Task (must never reach a customer DTO) ----
  await db.task.create({ data: { id: ids.taskOne, title: 'Internal task one', taskType: 'OTHER', status: 'TODO', priority: 'MEDIUM', caseId: ids.caseOne, assignedToId: ids.lawyerId, assignedById: ids.adminId, requiredSkills: [] } as never });
  await db.task.create({ data: { id: ids.taskInternalNote, title: 'Internal task with note', taskType: 'OTHER', status: 'IN_PROGRESS', priority: 'HIGH', caseId: ids.caseOne, assignedToId: ids.lawyerId, assignedById: ids.adminId, requiredSkills: [] } as never });

  // ---- Workspaces (ORGANIZATION) on client A ----
  const mode = (opts.clientAWorkspaceMode || 'ORGANIZATION') as 'ORGANIZATION' | 'CASE_RELAY' | 'INDIVIDUAL';
  await db.clientPortalWorkspace.createMany({ data: [
    { id: ids.orgWsA, clientId: ids.clientA, name: 'Phase5 Org Workspace A', mode, status: 'ACTIVE', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED', publicReference: opts.publicReferenceA || ref('PW', 'orgWsA'), createdById: ids.adminId },
    { id: ids.orgWsB, clientId: ids.clientA, name: 'Phase5 Org Workspace B', mode, status: 'ACTIVE', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED', publicReference: opts.publicReferenceB || ref('PW', 'orgWsB'), createdById: ids.adminId },
  ] });

  // ---- Identities ----
  await db.clientPortalIdentity.createMany({ data: [
    { id: ids.authorizedIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://issuer.invalid/', subject: id('sub-authorized'), normalizedEmail: email('authorized'), emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), displayName: 'Authorized Customer', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    { id: ids.noGrantIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://issuer.invalid/', subject: id('sub-nogrant'), normalizedEmail: email('nogrant'), emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), displayName: 'No Grant Customer', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    { id: ids.expiredIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://issuer.invalid/', subject: id('sub-expired'), normalizedEmail: email('expired'), emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), displayName: 'Expired Customer', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' },
    { id: ids.inactiveIdentity, provider: 'ENTRA_EXTERNAL_ID', issuer: 'https://issuer.invalid/', subject: id('sub-inactive'), normalizedEmail: email('inactive'), emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), displayName: 'Inactive Customer', accountType: 'ORGANIZATION_MEMBER', status: 'SUSPENDED' },
  ] });

  // ---- Memberships (workspace A) ----
  await db.clientPortalWorkspaceMembership.createMany({ data: [
    { id: ids.authorizedMembership, clientPortalIdentityId: ids.authorizedIdentity, workspaceId: ids.orgWsA, status: 'ACTIVE', role: 'MEMBER', approvedAt: new Date('2026-01-01T00:00:00Z'), approvedById: ids.adminId },
    { id: ids.noGrantMembership, clientPortalIdentityId: ids.noGrantIdentity, workspaceId: ids.orgWsA, status: 'ACTIVE', role: 'MEMBER', approvedAt: new Date('2026-01-01T00:00:00Z'), approvedById: ids.adminId },
    { id: ids.expiredMembership, clientPortalIdentityId: ids.expiredIdentity, workspaceId: ids.orgWsA, status: 'ACTIVE', role: 'MEMBER', approvedAt: new Date('2026-01-01T00:00:00Z'), approvedById: ids.adminId, expiresAt: new Date('2020-01-01T00:00:00Z') },
  ] });

  // ---- Grants ----
  const NOW = new Date();
  await db.clientPortalGrant.createMany({ data: [
    // authorized: full grant on caseOne and caseTwo
    { id: id('grant-one'), clientPortalIdentityId: ids.authorizedIdentity, workspaceId: ids.orgWsA, clientId: ids.clientA, caseId: ids.caseOne, role: 'VIEWER', status: 'ACTIVE', participantRole: 'REQUESTER', isRequester: true, permissions: ['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'MESSAGE_READ', 'MESSAGE_SEND', 'ACTION_REQUEST_READ', 'DOCUMENT_UPLOAD'], validFrom: new Date('2026-01-01T00:00:00Z'), validUntil: null, invitedById: ids.adminId, activatedAt: NOW },
    { id: id('grant-two'), clientPortalIdentityId: ids.authorizedIdentity, workspaceId: ids.orgWsA, clientId: ids.clientA, caseId: ids.caseTwo, role: 'VIEWER', status: 'ACTIVE', participantRole: 'PARTICIPANT', isRequester: false, permissions: ['MATTER_READ'], validFrom: new Date('2026-01-01T00:00:00Z'), validUntil: null, invitedById: ids.adminId, activatedAt: NOW },
    // noGrant: no case grant at all (membership only)
  ] });

  // ---- Organization (client A) ----
  await db.clientOrganizationGroup.createMany({ data: [
    { id: ids.groupA, clientId: ids.clientA, workspaceId: ids.orgWsA, name: 'Vezetőség', status: 'ACTIVE', createdById: ids.adminId },
    { id: ids.groupFinance, clientId: ids.clientA, workspaceId: ids.orgWsA, name: 'Pénzügy', status: 'ACTIVE', createdById: ids.adminId },
  ] });
  await db.organizationPerson.createMany({ data: [
    { id: ids.personActive, clientId: ids.clientA, organizationGroupId: ids.groupFinance, name: 'Aktív felelős', jobTitle: 'Pénzügyi vezető', employmentStatus: 'ACTIVE' },
    { id: ids.personInactive, clientId: ids.clientA, organizationGroupId: ids.groupA, name: 'Inaktív személy', jobTitle: 'Korábbi vezető', employmentStatus: 'INACTIVE' },
    { id: ids.personCrossClient, clientId: ids.clientB, name: 'B személy', jobTitle: 'B vezető', employmentStatus: 'ACTIVE' },
  ] });
  await db.organizationPersonResponsibility.createMany({ data: [
    { id: id('resp-active'), organizationPersonId: ids.personActive, type: 'CONTRACT_OWNER', label: 'Szerződésgazda' },
  ] });

  // ---- Contracts (client A) + cross-client ----
  await db.contractRecord.createMany({ data: [
    { id: ids.contractPublished, clientId: ids.clientA, title: 'Beszállítói keretszerződés', contractType: 'B2B_SUPPLY', status: 'ACTIVE', effectiveDate: new Date('2026-01-01T00:00:00Z'), expiryDate: new Date('2027-01-01T00:00:00Z'), businessOwnerPersonId: ids.personActive },    { id: ids.contractInternalOnly, clientId: ids.clientA, title: 'Belső tárgyalási anyag', contractType: 'NDA', status: 'DRAFT', businessOwnerLabel: 'Belső' },
    { id: ids.contractNoPublication, clientId: ids.clientA, title: 'Aktív, publikálatlan szerződés', contractType: 'SERVICE', status: 'ACTIVE', effectiveDate: new Date('2026-01-01T00:00:00Z') },
    { id: ids.contractCrossClient, clientId: ids.clientB, title: 'B ügyfél szerződés', contractType: 'SERVICE', status: 'ACTIVE' },
  ] });
  await db.contractParty.createMany({ data: [
    { id: id('party-published'), contractId: ids.contractPublished, roleCode: 'SUPPLIER', displayName: 'Beszállító Zrt.' },
  ] });
  // Link the published contract to its canonical published DocumentVersion later
  // (setCanonicalDocument is called by the test using the canonical service).
  await db.clientObligation.createMany({ data: [
    { id: ids.obligationOne, clientId: ids.clientA, sourceType: 'CONTRACT', sourceContractId: ids.contractPublished, title: 'Éves beszámoló', triggerType: 'RECURRING', frequencyCode: 'ANNUAL', status: 'OPEN', nextDueDate: new Date('2026-12-31T00:00:00Z'), ownerPersonId: ids.personActive },
    { id: ids.obligationCrossClient, clientId: ids.clientB, sourceType: 'CONTRACT', sourceContractId: ids.contractCrossClient, title: 'B kötelezettség', triggerType: 'DATE', status: 'OPEN', nextDueDate: new Date('2026-12-31T00:00:00Z') },
  ] });

  // ---- Company data (client A) ----
  await db.clientOperatingProfile.create({ data: { id: ids.operatingProfileA, clientId: ids.clientA, summary: 'Családi tulajdonú exportőr cég.', status: 'ACTIVE', nextReviewAt: new Date('2026-12-01T00:00:00Z') } });
  await db.clientFact.create({ data: { id: ids.factA, clientId: ids.clientA, type: 'EMPLOYEE_COUNT', value: '42 fő', validFrom: new Date('2026-01-01T00:00:00Z'), verificationStatus: 'LAW_FIRM_VERIFIED' } });
  await db.developmentInitiative.create({ data: { id: ids.initiativeA, clientId: ids.clientA, title: 'ISO 27001 bevezetés', priority: 'HIGH', status: 'ACTIVE', clientOwnerPersonId: ids.personActive } });
  await db.companyMilestone.create({ data: { id: ids.milestoneA, clientId: ids.clientA, type: 'IMPORTANT_IT_SYSTEM', title: 'Bevezetés kezdete', status: 'ACHIEVED', milestoneDate: new Date('2026-06-01T00:00:00Z'), developmentInitiativeId: ids.initiativeA, createdByUserId: ids.adminId } });
  await db.assessment.create({ data: { id: ids.assessmentA, clientId: ids.clientA, type: 'CONTRACT_GOVERNANCE', title: 'Szerződés-kormányzási felmérés', status: 'IN_PROGRESS', createdByUserId: ids.adminId } });
  await db.assessmentFinding.create({ data: { id: ids.findingA, clientId: ids.clientA, assessmentId: ids.assessmentA, severity: 'CRITICAL', title: 'Hiányzó irányítás', status: 'OPEN', createdByUserId: ids.adminId } });

  // ---- Matter publication + immutable revision (client A, caseOne) ----
  await db.clientMatterPublication.create({ data: { id: ids.matterPub, caseId: ids.caseOne, clientId: ids.clientA, workspaceId: ids.orgWsA, status: 'PUBLISHED', preparedById: ids.adminId, publishedById: ids.adminId, publishedAt: new Date('2026-07-01T00:00:00Z') } });
  await db.clientMatterPublicationRevision.create({
    data: {
      id: ids.matterRevision,
      publicationId: ids.matterPub,
      revisionNumber: 1,
      clientSafeTitle: 'Phase5 közzétett ügy',
      clientSafeStatus: 'Folyamatban',
      clientSafeNextStep: 'Aláírásra vár a keretszerződés.',
      clientSafeCurrentPosition: 'A szerződéses irányítás felmérése folyamatban.',
      clientSafeWaitingOn: 'Ügyfél válasza szükséges',
      publicTargetDate: new Date('2026-12-15T00:00:00Z'),
      responsibleLawyerDisplay: 'Dr. Teszt',
      publishedDeadlinesSnapshot: [{ label: 'Belső határidő', dueAt: '2026-12-31' }],
      safeUpdatesSnapshot: [],
      actionRequestsSnapshot: [],
      milestonesSnapshot: [
        { publicKey: 'ms-1', safeTitle: 'Felmérés indítása', safeDescription: null, completionState: 'COMPLETED', displayOrder: 1, weight: 50, completedAt: '2026-07-01T00:00:00.000Z' },
        { publicKey: 'ms-2', safeTitle: 'Kontrollok bevezetése', safeDescription: null, completionState: 'IN_PROGRESS', displayOrder: 2, weight: 50, completedAt: null },
      ],
      progressPercentage: 50,
      sourceCaseRevision: 0,
      sourceFingerprint: `fp-${ids.matterPub}`,
      audienceSnapshot: { grants: [{ id: id('grant-one'), clientPortalIdentityId: ids.authorizedIdentity, participantRole: 'REQUESTER', permissions: ['MATTER_READ'] }] },
      createdById: ids.adminId,
    },
  });
  await db.clientMatterPublication.update({ where: { id: ids.matterPub }, data: { currentRevisionId: ids.matterRevision } });

  // ---- Documents + versions (client A, caseOne) ----
  await db.document.createMany({ data: [
    { id: ids.docPublished, name: 'Keretszerződés', category: 'CONTRACT', caseId: ids.caseOne, clientId: ids.clientA },
    { id: ids.docInternal, name: 'Belső vázlat', category: 'INTERNAL_MEMO', caseId: ids.caseOne, clientId: ids.clientA },
    { id: ids.docHrConfidential, name: 'HR dokumentum', category: 'OTHER', caseId: ids.caseOne, clientId: ids.clientA, securityClassification: 'HR_CONFIDENTIAL' },
    { id: ids.docCrossClient, name: 'B dokumentum', category: 'OTHER', caseId: ids.caseCrossClient, clientId: ids.clientB },
    { id: ids.docSelected, name: 'Korlátozott dokumentum', category: 'CONTRACT', caseId: ids.caseOne, clientId: ids.clientA },
  ] as never });
  await db.documentVersion.createMany({ data: [
    { id: ids.docPublishedVersion, version: 1, name: 'Keretszerződés v1', originalFileName: 'contract-v1.pdf', mimeType: 'application/pdf', size: 1024, storageReference: 'sp://published-v1', isCurrent: false, documentId: ids.docPublished, uploadedById: ids.adminId },
    // A newer current version of the SAME document is intentionally not
    // published. Customer reads must follow the publication's pinned V1 id.
    { id: ids.docPublishedVersion2, version: 2, name: 'Keretszerződés v2', originalFileName: 'contract-v2.pdf', mimeType: 'application/pdf', size: 2048, storageReference: 'sp://unpublished-v2', isCurrent: true, documentId: ids.docPublished, previousVersionId: ids.docPublishedVersion, uploadedById: ids.adminId },
    { id: ids.docInternalVersion, version: 1, name: 'Belső vázlat v1', originalFileName: 'draft.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 512, storageReference: 'sp://internal', isCurrent: true, documentId: ids.docInternal, uploadedById: ids.adminId },
    { id: ids.docHrConfidentialVersion, version: 1, name: 'HR v1', originalFileName: 'hr.pdf', mimeType: 'application/pdf', size: 100, storageReference: 'sp://hr', isCurrent: true, documentId: ids.docHrConfidential, uploadedById: ids.adminId },
    { id: ids.docCrossClientVersion, version: 1, name: 'B v1', originalFileName: 'b.pdf', mimeType: 'application/pdf', size: 100, storageReference: 'sp://b', isCurrent: true, documentId: ids.docCrossClient, uploadedById: ids.adminId },
    { id: ids.docSelectedVersion, version: 1, name: 'Korlátozott v1', originalFileName: 'restricted.pdf', mimeType: 'application/pdf', size: 100, storageReference: 'sp://restricted', isCurrent: true, documentId: ids.docSelected, uploadedById: ids.adminId },
  ] as never });

  // ---- Document publication (exact published version, workspace visibility) ----
  await db.clientDocumentPublication.create({
    data: {
      id: ids.docPublication,
      caseId: ids.caseOne,
      clientId: ids.clientA,
      workspaceId: ids.orgWsA,
      visibility: 'WORKSPACE',
      documentId: ids.docPublished,
      documentVersionId: ids.docPublishedVersion,
      status: 'PUBLISHED',
      clientFacingTitle: 'Keretszerződés (publikált)',
      clientFacingExplanation: 'A végleges, közzétett változat.',
      preparedById: ids.adminId,
      publishedById: ids.adminId,
      publishedAt: new Date('2026-07-02T00:00:00Z'),
      audienceSnapshot: { grants: [{ id: id('grant-one'), clientPortalIdentityId: ids.authorizedIdentity, permissions: ['DOCUMENT_READ'] }] },
      sourceFingerprint: `fp-doc-${ids.docPublishedVersion}`,
    },
  });

  // A SELECTED_PARTICIPANTS document publication scoped to a membership that the
  // authorized customer is NOT a member of -> proves wrong-recipient denial.
  await db.clientDocumentPublication.create({
    data: {
      id: ids.docPublicationSelected,
      caseId: ids.caseOne,
      clientId: ids.clientA,
      workspaceId: ids.orgWsA,
      visibility: 'SELECTED_PARTICIPANTS',
      documentId: ids.docSelected,
      documentVersionId: ids.docSelectedVersion,
      status: 'PUBLISHED',
      clientFacingTitle: 'Csak egy kiválasztott tagnak',
      clientFacingExplanation: 'Korlátozott közönségű dokumentum.',
      preparedById: ids.adminId,
      publishedById: ids.adminId,
      publishedAt: new Date('2026-07-02T00:00:00Z'),
      audienceSnapshot: { grants: [{ id: id('grant-one'), clientPortalIdentityId: ids.authorizedIdentity, permissions: ['DOCUMENT_READ'] }] },
      sourceFingerprint: `fp-doc-selected-${ids.docPublishedVersion}`,
    },
  });
  await db.clientDocumentPublicationRecipient.create({ data: { id: id('doc-pub-selected-recipient'), documentPublicationId: ids.docPublicationSelected, workspaceMembershipId: ids.docPublicationSelectedRecipientMembership } });

  // ---- Messaging (client A, caseOne) ----
  await db.clientQuestionThread.create({ data: { id: ids.threadA, clientId: ids.clientA, caseId: ids.caseOne, clientPortalIdentityId: ids.authorizedIdentity, workspaceId: ids.orgWsA, category: 'QUESTION', createdByMembershipId: ids.authorizedMembership, subject: 'Kérdés a szerződésről', status: 'OPEN' } });
  await db.clientQuestionThreadParticipant.create({ data: { id: id('threadA-participant'), threadId: ids.threadA, workspaceMembershipId: ids.authorizedMembership, participantRole: 'REQUESTER', canRead: true, canWrite: true } });
  await db.clientQuestionMessage.create({ data: { id: id('threadA-msg'), threadId: ids.threadA, authorType: 'CLIENT', clientPortalIdentityId: ids.authorizedIdentity, bodySafe: 'Szerződéses kérdés.', visibility: 'SENT', sentAt: new Date('2026-07-03T00:00:00Z') } });
  // Cross-client thread
  await db.clientQuestionThread.create({ data: { id: ids.threadCrossClient, clientId: ids.clientB, caseId: ids.caseCrossClient, clientPortalIdentityId: ids.authorizedIdentity, workspaceId: ids.orgWsA, category: 'QUESTION', subject: 'B ügyfél szál', status: 'OPEN' } });

  // ---- Action request + client request + submission (client A, caseOne) ----
  await db.clientActionRequest.create({
    data: {
      id: ids.actionRequestA, caseId: ids.caseOne, clientId: ids.clientA, type: 'DOCUMENT_UPLOAD',
      clientSafeTitle: 'Töltse fel a meghatalmazást', clientSafeInstructions: 'Kérjük, töltse fel a signed meghatalmazást.', dueAt: new Date('2026-09-01T00:00:00Z'),
      status: 'PUBLISHED', audienceSnapshot: { grants: [{ id: id('grant-one'), permissions: ['ACTION_REQUEST_READ'] }] }, preparedById: ids.adminId,
    },
  });
  await db.clientRequest.create({
    data: {
      id: ids.clientRequestA, clientId: ids.clientA, caseId: ids.caseOne, createdById: ids.adminId, type: 'INFORMATION_REQUEST', status: 'PUBLISHED',
      clientSafeTitle: 'Adja meg a cégjegyzék adatait', clientSafeInstructions: 'Adja meg a cégjegyzékszámot.', required: true,
      audienceSnapshot: { capturedAt: new Date().toISOString() }, publishedAt: new Date('2026-07-04T00:00:00Z'),
    },
  });
  await db.clientSubmission.create({ data: { id: ids.submissionA, clientRequestId: ids.clientRequestA, clientId: ids.clientA, caseId: ids.caseOne, clientPortalIdentityId: ids.authorizedIdentity, status: 'SUBMITTED', submittedAt: new Date('2026-07-05T00:00:00Z') } });
  await db.clientSubmissionFile.create({ data: { id: ids.submissionFileNotClean, submissionId: ids.submissionA, originalFileNameSafe: 'scan_pending.pdf', detectedMimeType: 'application/pdf', sizeBytes: 500, checksum: 'abc', status: 'SCANNING', uploadedAt: new Date('2026-07-05T00:00:00Z') } });

  return ids;
}

/**
 * Build a SECOND Client with deliberately nearby data proving the portal cannot
 * leak across clients (B Case / B Contract / B OrganizationPerson / B
 * DocumentVersion / B QuestionThread). Reuses part of the main fixture ids.
 *
 * The Client B fixtures (caseCrossClient, contractCrossClient, personCrossClient,
 * obligationCrossClient, docCrossClient, threadCrossClient) are already created
 * inside createOrganizationalPortalFixture. This helper is the conventional,
 * named entry point that negative-isolation tests call to make the cross-client
 * fixture explicit and discoverable. It is idempotent.
 */
export async function createCrossClientIsolationFixture(_db: Db, _ids: OrgPortalFixtureIds): Promise<void> {
  // All Client B negative-isolation rows are provisioned by
  // createOrganizationalPortalFixture; nothing further to create here.
  return Promise.resolve();
}
