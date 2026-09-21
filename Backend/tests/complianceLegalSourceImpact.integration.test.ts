/**
 * C4C — legal-source impact projection over PostgreSQL.
 *
 * Proves the ADMINICULUM side of the legal-change impact graph against a real
 * database, on exactly the persisted canonical relations:
 *
 *   LegalSourceVersion
 *     → clause anchors        → DocumentVersion → Document → Client
 *     → RequirementCitation   → RequirementVersion → Requirement
 *                             → RequirementControlMap → ControlDefinition → ClientControl
 *     → RequirementApplicability (client + requirementVersion)
 *
 * P1 AUTHORIZATION PROOF (the reason this suite exists in its current shape):
 * the DOCUMENT-level impact is scoped by the actor's CANONICAL CASE scope plus
 * the canonical HR_CONFIDENTIAL boundary — never by clientId alone:
 *   - an accessible case of a client does NOT unlock another case's document
 *     metadata of the SAME client;
 *   - HR_CONFIDENTIAL documents stay hidden from non-privileged actors even when
 *     the owning case is readable;
 *   - hidden documents leak neither document/version ids, clause ref, clause
 *     title, nor totals (totals are computed AFTER filtering);
 *   - the CLIENT-level requirement / control / applicability impact for a client
 *     the actor can read stays visible.
 * The admin/partner policy is unchanged (no new privilege is invented).
 *
 * Also proves the two hard guards:
 *   - reading the impact NEVER writes and NEVER creates a finding, proposal,
 *     case, task or LegalSourceVersion;
 *   - the external-watcher monitoring manifest for the SAME data still carries no
 *     client / document identity, while the internal impact map does.
 *
 * Skipped without a test database, matching the repository convention.
 */
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { prisma as db } from '../src/prisma/prisma.service';
import { REQUIREMENT_APPLICABILITY_SCHEMA_VERSION } from '../src/modules/compliance/requirementApplicabilityService';
import { buildComplianceMonitoringManifest } from '../src/modules/compliance-doc-intelligence/monitoringManifest';
import {
  UNSCOPED_IMPACT_ACCESS,
  buildDocumentReferenceImpactForCanonicalReference,
  buildLegalSourceImpactForVersion,
  type LegalSourceImpactAccessScope,
} from '../src/modules/compliance/legalSourceImpact';
import { resolveImpactAccessScope } from '../src/modules/compliance-doc-intelligence/routes';

const dbUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = dbUrl ? describe : describe.skip;

const GENERATED_AT = '2026-09-20T00:00:00.000Z';
const HEX64 = 'a'.repeat(64);

/** A fully-resolved (case + client + HR) scope, as the route resolves it. */
function scopedAccess(
  readableCaseIds: string[],
  readableClientIds: string[],
  hrConfidentialReadAllowed = false,
): LegalSourceImpactAccessScope {
  return {
    readableCaseIds: new Set(readableCaseIds),
    readableClientIds: new Set(readableClientIds),
    hrConfidentialReadAllowed,
  };
}

describeWithDatabase('C4C legal-source impact (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const adminId = `c4c-${suffix}`;
  const lawyerId = `c4c-lawyer-${suffix}`;
  const clientAId = `c4c-a-${suffix}`;
  const clientBId = `c4c-b-${suffix}`;
  const caseAId = `c4c-case-a-${suffix}`;
  const caseBId = `c4c-case-b-${suffix}`;
  const domainCode = `C4C_${suffix}`;

  const subjectSourceId = `c4c-src-subject-${suffix}`;
  const subjectVersionId = `c4c-lsv-subject-${suffix}`;
  const otherSourceId = `c4c-src-other-${suffix}`;
  const otherVersionId = `c4c-lsv-other-${suffix}`;

  const requirementOneId = `c4c-req-one-${suffix}`;
  const requirementOneVersionId = `c4c-rv-one-${suffix}`;
  const requirementTwoId = `c4c-req-two-${suffix}`;
  const requirementTwoVersionId = `c4c-rv-two-${suffix}`;

  const controlOneId = `c4c-cd-one-${suffix}`;
  const controlTwoId = `c4c-cd-two-${suffix}`;

  const ruleOneId = `c4c-rule-one-${suffix}`;
  const applicabilityOneId = `c4c-app-one-${suffix}`;
  const applicabilityTwoId = `c4c-app-two-${suffix}`;

  const documentAId = `c4c-doc-a-${suffix}`;
  const documentAVersionId = `c4c-doc-a-v1-${suffix}`;
  const documentBId = `c4c-doc-b-${suffix}`;
  const documentBVersionId = `c4c-doc-b-v1-${suffix}`;
  const referenceDocumentId = `c4c-doc-ref-${suffix}`;
  const referenceDocumentVersionId = `c4c-doc-ref-v1-${suffix}`;
  const wrongReferenceDocumentId = `c4c-doc-wrongref-${suffix}`;
  const wrongReferenceDocumentVersionId = `c4c-doc-wrongref-v1-${suffix}`;

  /* ------------------------------------------------------------------ */
  /*  P1 authorization fixtures — one client, two cases.                 */
  /* ------------------------------------------------------------------ */
  const p1ClientId = `c4c-p1-client-${suffix}`;
  const p1CaseAccessibleId = `c4c-p1-case-accessible-${suffix}`;
  const p1CaseHiddenId = `c4c-p1-case-hidden-${suffix}`;
  const p1SourceId = `c4c-p1-src-${suffix}`;
  const p1VersionId = `c4c-p1-lsv-${suffix}`;
  const p1RequirementId = `c4c-p1-req-${suffix}`;
  const p1RequirementVersionId = `c4c-p1-rv-${suffix}`;
  const p1ControlId = `c4c-p1-cd-${suffix}`;
  const p1ClientControlId = `c4c-p1-cc-${suffix}`;
  const p1RuleId = `c4c-p1-rule-${suffix}`;
  const p1ApplicabilityId = `c4c-p1-app-${suffix}`;
  const p1VisibleDocId = `c4c-p1-doc-visible-${suffix}`;
  const p1VisibleDocVersionId = `c4c-p1-doc-visible-v1-${suffix}`;
  const p1HiddenDocId = `c4c-p1-doc-hidden-${suffix}`;
  const p1HiddenDocVersionId = `c4c-p1-doc-hidden-v1-${suffix}`;
  const p1HrDocId = `c4c-p1-doc-hr-${suffix}`;
  const p1HrDocVersionId = `c4c-p1-doc-hr-v1-${suffix}`;

  const actNumber = `${700000 + (Number(suffix.slice(-5)) % 90000)}`;
  const wrongActNumber = `${Number(actNumber) + 1}`;
  const MAIN_REFERENCE = `TV/2026/${actNumber}/5/2`;
  const WRONG_REFERENCE = `TV/2026/${wrongActNumber}/1`;
  const p1Reference = `TV/2026/${actNumber}/7/1`;

  const documentIds = [
    documentAId,
    documentBId,
    referenceDocumentId,
    wrongReferenceDocumentId,
    p1VisibleDocId,
    p1HiddenDocId,
    p1HrDocId,
  ];

  const createDocument = async (
    id: string,
    clientId: string,
    caseId: string,
    name: string,
    securityClassification = 'STANDARD',
  ) =>
    db.document.create({
      data: {
        id,
        clientId,
        caseId,
        name,
        title: name,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category: 'EVIDENCE',
        securityClassification,
      } as never,
    });

  const createVersion = async (id: string, documentId: string, name: string) =>
    db.documentVersion.create({
      data: { id, documentId, version: 1, name: `${name} v1`, uploadedById: adminId, isCurrent: true, spItemId: `sp-${documentId}` } as never,
    });

  const addAnchor = async (
    documentVersionId: string,
    overrides: {
      clauseRef?: string;
      clauseTitle?: string | null;
      relationType?: string;
      anchorKey?: string | null;
      legalSourceVersionId?: string | null;
    },
  ) =>
    db.complianceDocumentClauseAnchor.create({
      data: {
        documentVersionId,
        clauseRef: overrides.clauseRef ?? '1.1.',
        clauseTitle: overrides.clauseTitle ?? null,
        clauseStableId: null,
        relationType: overrides.relationType ?? 'MANDATORY_BASIS',
        anchorType: 'LEGAL',
        anchorDisplay: 'anchor',
        anchorStableId: null,
        anchorKey: overrides.anchorKey ?? null,
        eli: null,
        celex: null,
        locator: null,
        ecli: null,
        caseId: null,
        caseLocator: null,
        decisionId: null,
        authorityLocator: null,
        sourceUrl: null,
        rationale: null,
        legalSourceVersionId: overrides.legalSourceVersionId ?? null,
        rowDigest: randomBytes(32).toString('hex'),
        ingestWarnings: [],
      } as never,
    });

  const impactCounts = async () => ({
    legalSource: await db.legalSource.count(),
    legalSourceVersion: await db.legalSourceVersion.count(),
    legalSourceCapture: await db.legalSourceCapture.count(),
    requirement: await db.requirement.count(),
    requirementVersion: await db.requirementVersion.count(),
    requirementCitation: await db.requirementCitation.count(),
    requirementControlMap: await db.requirementControlMap.count(),
    controlDefinition: await db.controlDefinition.count(),
    clientControl: await db.clientControl.count(),
    applicabilityRuleVersion: await db.applicabilityRuleVersion.count(),
    requirementApplicability: await db.requirementApplicability.count(),
    assessmentFinding: await db.assessmentFinding.count(),
    complianceProposal: await db.complianceProposal.count(),
    task: await db.task.count(),
    clauseAnchor: await db.complianceDocumentClauseAnchor.count(),
  });

  beforeAll(async () => {
    await db.user.create({
      data: { id: adminId, email: `c4c-${suffix}@fixture.invalid`, name: 'C4C Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never,
    });
    await db.user.create({
      data: { id: lawyerId, email: `c4c-lawyer-${suffix}@fixture.invalid`, name: 'C4C Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] } as never,
    });
    for (const [clientId, caseId, label] of [
      [clientAId, caseAId, 'A'],
      [clientBId, caseBId, 'B'],
    ] as const) {
      await db.client.create({ data: { id: clientId, name: `C4C Client ${label}` } });
      await db.case.create({
        data: { id: caseId, caseNumber: `C4C-${label}-${suffix}`, title: `C4C Case ${label}`, caseType: 'OTHER', clientId, assignedLawyerId: adminId, createdById: adminId } as never,
      });
    }
    await db.complianceDomain.create({ data: { code: domainCode, label: 'C4C domain' } });

    // Canonical registry: one subject source, one unrelated source.
    await db.legalSource.create({
      data: { id: subjectSourceId, sourceKey: `C4C-SUBJECT-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED', updatedAt: new Date() } as never,
    });
    await db.legalSource.create({
      data: { id: otherSourceId, sourceKey: `C4C-OTHER-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED', updatedAt: new Date() } as never,
    });
    await db.legalSourceVersion.create({
      data: { id: subjectVersionId, legalSourceId: subjectSourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } as never,
    });
    await db.legalSourceVersion.create({
      data: { id: otherVersionId, legalSourceId: otherSourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } as never,
    });

    // Requirement 1 cites the subject exactly; requirement 2 cites the unrelated source.
    await db.requirement.create({
      data: { id: requirementOneId, key: `C4C_REQ_ONE_${suffix}`, jurisdictionCode: 'HU', domainCode, status: 'ACTIVE' } as never,
    });
    await db.requirement.create({
      data: { id: requirementTwoId, key: `C4C_REQ_TWO_${suffix}`, jurisdictionCode: 'HU', domainCode, status: 'ACTIVE' } as never,
    });
    await db.requirementVersion.create({
      data: { id: requirementOneVersionId, requirementId: requirementOneId, versionKey: 'V1', title: 'Requirement one', normativeStatement: 'Requirement one', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', status: 'APPROVED' } as never,
    });
    await db.requirementVersion.create({
      data: { id: requirementTwoVersionId, requirementId: requirementTwoId, versionKey: 'V1', title: 'Requirement two', normativeStatement: 'Requirement two', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', status: 'APPROVED' } as never,
    });
    await db.requirementCitation.create({
      data: { requirementVersionId: requirementOneVersionId, legalSourceVersionId: subjectVersionId, supportRole: 'PRIMARY', locator: 'sec=1' } as never,
    });
    await db.requirementCitation.create({
      data: { requirementVersionId: requirementTwoVersionId, legalSourceVersionId: otherVersionId, supportRole: 'PRIMARY', locator: 'sec=2' } as never,
    });

    // Control 1 is mapped to the impacted requirement; control 2 to the unrelated one.
    await db.controlDefinition.create({
      data: { id: controlOneId, key: `C4C_CTRL_ONE_${suffix}`, title: 'Control one', type: 'ORGANIZATIONAL', status: 'ACTIVE' } as never,
    });
    await db.controlDefinition.create({
      data: { id: controlTwoId, key: `C4C_CTRL_TWO_${suffix}`, title: 'Control two', type: 'TECHNICAL', status: 'ACTIVE' } as never,
    });
    await db.requirementControlMap.create({
      data: { requirementVersionId: requirementOneVersionId, controlDefinitionId: controlOneId } as never,
    });
    await db.requirementControlMap.create({
      data: { requirementVersionId: requirementTwoVersionId, controlDefinitionId: controlTwoId } as never,
    });

    // Existing client controls: both clients implement control 1; client A also has the unrelated control 2.
    await db.clientControl.create({
      data: { id: `c4c-cc-a1-${suffix}`, clientId: clientAId, controlDefinitionId: controlOneId, implementationStatus: 'IMPLEMENTED' } as never,
    });
    await db.clientControl.create({
      data: { id: `c4c-cc-b1-${suffix}`, clientId: clientBId, controlDefinitionId: controlOneId, implementationStatus: 'PLANNED' } as never,
    });
    await db.clientControl.create({
      data: { id: `c4c-cc-a2-${suffix}`, clientId: clientAId, controlDefinitionId: controlTwoId, implementationStatus: 'IMPLEMENTED' } as never,
    });

    // Applicability: client A applies to the impacted requirement; client B applies only to the unrelated one.
    await db.applicabilityRuleVersion.create({
      data: { id: ruleOneId, requirementVersionId: requirementOneVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { op: 'TRUE' }, canonicalDigest: HEX64, status: 'APPROVED' } as never,
    });
    await db.requirementApplicability.create({
      data: {
        id: applicabilityOneId,
        clientId: clientAId,
        requirementVersionId: requirementOneVersionId,
        ruleVersionId: ruleOneId,
        ruleDigest: HEX64,
        outcome: 'APPLIES',
        scopeType: 'COMPANY',
        evaluationAt: new Date('2026-09-01T00:00:00Z'),
        sourceSupportState: 'SUFFICIENT',
        specialistRequirement: 'NONE',
        schemaVersion: REQUIREMENT_APPLICABILITY_SCHEMA_VERSION,
        snapshotJson: { outcome: 'APPLIES' },
        snapshotDigest: HEX64,
      } as never,
    });
    await db.requirementApplicability.create({
      data: {
        id: applicabilityTwoId,
        clientId: clientBId,
        requirementVersionId: requirementTwoVersionId,
        ruleVersionId: ruleOneId,
        ruleDigest: HEX64,
        outcome: 'APPLIES',
        scopeType: 'COMPANY',
        evaluationAt: new Date('2026-09-01T00:00:00Z'),
        sourceSupportState: 'SUFFICIENT',
        specialistRequirement: 'NONE',
        schemaVersion: REQUIREMENT_APPLICABILITY_SCHEMA_VERSION,
        snapshotJson: { outcome: 'APPLIES' },
        snapshotDigest: HEX64,
      } as never,
    });

    // Documents: client A references the subject source; client B references the unrelated source.
    await createDocument(documentAId, clientAId, caseAId, 'C4C A master');
    await createVersion(documentAVersionId, documentAId, 'C4C A master');
    await addAnchor(documentAVersionId, { clauseRef: '1.1.', legalSourceVersionId: subjectVersionId });

    await createDocument(documentBId, clientBId, caseBId, 'C4C B master');
    await createVersion(documentBVersionId, documentBId, 'C4C B master');
    await addAnchor(documentBVersionId, { clauseRef: '2.1.', legalSourceVersionId: otherVersionId });

    // Canonical-reference transport: exact reference + a wrong reference.
    await createDocument(referenceDocumentId, clientAId, caseAId, 'C4C A reference master');
    await createVersion(referenceDocumentVersionId, referenceDocumentId, 'C4C A reference master');
    await addAnchor(referenceDocumentVersionId, { clauseRef: '5.1.', anchorKey: `LEGAL|REF=${MAIN_REFERENCE}` });

    await createDocument(wrongReferenceDocumentId, clientAId, caseAId, 'C4C A wrong reference master');
    await createVersion(wrongReferenceDocumentVersionId, wrongReferenceDocumentId, 'C4C A wrong reference master');
    await addAnchor(wrongReferenceDocumentVersionId, { clauseRef: '6.1.', anchorKey: `LEGAL|REF=${WRONG_REFERENCE}` });

    // The reference document is the only one the EXTERNAL watcher manifest may see demand for.
    await db.complianceDocument.create({
      data: { requirementId: requirementOneId, documentId: referenceDocumentId, audience: 'INTERNAL_ANALYSIS' } as never,
    });

    /* ---------------------------------------------------------------- */
    /*  P1 fixture: one client, two cases.                               */
    /*  The LAWYER is assigned only to p1CaseAccessibleId.               */
    /* ---------------------------------------------------------------- */
    await db.client.create({ data: { id: p1ClientId, name: 'C4C P1 Client' } });
    await db.case.create({
      data: { id: p1CaseAccessibleId, caseNumber: `C4C-P1-A-${suffix}`, title: 'C4C P1 accessible case', caseType: 'OTHER', clientId: p1ClientId, assignedLawyerId: lawyerId, createdById: adminId } as never,
    });
    await db.case.create({
      data: { id: p1CaseHiddenId, caseNumber: `C4C-P1-B-${suffix}`, title: 'C4C P1 hidden case', caseType: 'OTHER', clientId: p1ClientId, assignedLawyerId: adminId, createdById: adminId } as never,
    });

    await db.legalSource.create({
      data: { id: p1SourceId, sourceKey: `C4C-P1-SUBJECT-${suffix}`, jurisdictionCode: 'HU', instrumentType: 'LEGISLATION', status: 'APPROVED', updatedAt: new Date() } as never,
    });
    await db.legalSourceVersion.create({
      data: { id: p1VersionId, legalSourceId: p1SourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } as never,
    });
    await db.requirement.create({
      data: { id: p1RequirementId, key: `C4C_P1_REQ_${suffix}`, jurisdictionCode: 'HU', domainCode, status: 'ACTIVE' } as never,
    });
    await db.requirementVersion.create({
      data: { id: p1RequirementVersionId, requirementId: p1RequirementId, versionKey: 'V1', title: 'P1 requirement', normativeStatement: 'P1 requirement', effectiveFrom: new Date('2026-01-01T00:00:00Z'), sourceSupportState: 'SUFFICIENT', status: 'APPROVED' } as never,
    });
    await db.requirementCitation.create({
      data: { requirementVersionId: p1RequirementVersionId, legalSourceVersionId: p1VersionId, supportRole: 'PRIMARY', locator: 'p1=1' } as never,
    });
    await db.controlDefinition.create({
      data: { id: p1ControlId, key: `C4C_P1_CTRL_${suffix}`, title: 'P1 control', type: 'ORGANIZATIONAL', status: 'ACTIVE' } as never,
    });
    await db.requirementControlMap.create({
      data: { requirementVersionId: p1RequirementVersionId, controlDefinitionId: p1ControlId } as never,
    });
    await db.clientControl.create({
      data: { id: p1ClientControlId, clientId: p1ClientId, controlDefinitionId: p1ControlId, implementationStatus: 'IMPLEMENTED' } as never,
    });
    await db.applicabilityRuleVersion.create({
      data: { id: p1RuleId, requirementVersionId: p1RequirementVersionId, ruleVersionKey: 'R1', schemaVersion: 'rule-ast/v1', astJson: { op: 'TRUE' }, canonicalDigest: HEX64, status: 'APPROVED' } as never,
    });
    await db.requirementApplicability.create({
      data: {
        id: p1ApplicabilityId,
        clientId: p1ClientId,
        requirementVersionId: p1RequirementVersionId,
        ruleVersionId: p1RuleId,
        ruleDigest: HEX64,
        outcome: 'APPLIES',
        scopeType: 'COMPANY',
        evaluationAt: new Date('2026-09-01T00:00:00Z'),
        sourceSupportState: 'SUFFICIENT',
        specialistRequirement: 'NONE',
        schemaVersion: REQUIREMENT_APPLICABILITY_SCHEMA_VERSION,
        snapshotJson: { outcome: 'APPLIES' },
        snapshotDigest: HEX64,
      } as never,
    });

    // Visible: STANDARD document in the actor-accessible case.
    await createDocument(p1VisibleDocId, p1ClientId, p1CaseAccessibleId, 'C4C P1 visible document');
    await createVersion(p1VisibleDocVersionId, p1VisibleDocId, 'C4C P1 visible document');
    await addAnchor(p1VisibleDocVersionId, {
      clauseRef: '1.1.',
      clauseTitle: 'P1 visible clause',
      legalSourceVersionId: p1VersionId,
      anchorKey: `LEGAL|REF=${p1Reference}`,
    });

    // Hidden case: the SAME client, an INACCESSIBLE case, same legal source.
    await createDocument(p1HiddenDocId, p1ClientId, p1CaseHiddenId, 'C4C P1 hidden case document');
    await createVersion(p1HiddenDocVersionId, p1HiddenDocId, 'C4C P1 hidden case document');
    await addAnchor(p1HiddenDocVersionId, {
      clauseRef: '9.9.',
      clauseTitle: 'P1 hidden clause',
      legalSourceVersionId: p1VersionId,
      anchorKey: `LEGAL|REF=${p1Reference}`,
    });

    // HR_CONFIDENTIAL: in the ACCESSIBLE case, but classification-restricted.
    await createDocument(p1HrDocId, p1ClientId, p1CaseAccessibleId, 'C4C P1 HR confidential document', 'HR_CONFIDENTIAL');
    await createVersion(p1HrDocVersionId, p1HrDocId, 'C4C P1 HR confidential document');
    await addAnchor(p1HrDocVersionId, { clauseRef: '8.8.', clauseTitle: 'P1 HR clause', legalSourceVersionId: p1VersionId });
  });

  afterAll(async () => {
    const versionIds = (
      await db.documentVersion.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } })
    ).map((row) => row.id);
    await db.complianceDocumentClauseAnchor.deleteMany({ where: { documentVersionId: { in: versionIds } } });
    await db.complianceDocument.deleteMany({ where: { documentId: { in: documentIds } } });
    await db.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } });
    await db.document.deleteMany({ where: { id: { in: documentIds } } });
    await db.requirementApplicability.deleteMany({ where: { id: { in: [applicabilityOneId, applicabilityTwoId, p1ApplicabilityId] } } });
    await db.applicabilityRuleVersion.deleteMany({ where: { id: { in: [ruleOneId, p1RuleId] } } });
    await db.clientControl.deleteMany({ where: { clientId: { in: [clientAId, clientBId, p1ClientId] } } });
    await db.requirementControlMap.deleteMany({ where: { requirementVersionId: { in: [requirementOneVersionId, requirementTwoVersionId, p1RequirementVersionId] } } });
    await db.controlDefinition.deleteMany({ where: { id: { in: [controlOneId, controlTwoId, p1ControlId] } } });
    await db.requirementCitation.deleteMany({ where: { requirementVersionId: { in: [requirementOneVersionId, requirementTwoVersionId, p1RequirementVersionId] } } });
    await db.requirementVersion.deleteMany({ where: { id: { in: [requirementOneVersionId, requirementTwoVersionId, p1RequirementVersionId] } } });
    await db.requirement.deleteMany({ where: { id: { in: [requirementOneId, requirementTwoId, p1RequirementId] } } });
    await db.legalSourceVersion.deleteMany({ where: { id: { in: [subjectVersionId, otherVersionId, p1VersionId] } } });
    await db.legalSource.deleteMany({ where: { id: { in: [subjectSourceId, otherSourceId, p1SourceId] } } });
    await db.complianceDomain.deleteMany({ where: { code: domainCode } });
    await db.case.deleteMany({ where: { id: { in: [caseAId, caseBId, p1CaseAccessibleId, p1CaseHiddenId] } } });
    await db.client.deleteMany({ where: { id: { in: [clientAId, clientBId, p1ClientId] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId] } } });
  });

  it('A. an exact registry anchor finds the correct client document; a wrong subject finds none of it', async () => {
    const subject = await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    expect(subject).not.toBeNull();
    expect(subject!.subject).toMatchObject({ legalSourceVersionId: subjectVersionId, sourceKey: `C4C-SUBJECT-${suffix}` });
    expect(subject!.documentReferenceImpact.references).toHaveLength(1);
    expect(subject!.documentReferenceImpact.references[0]).toMatchObject({
      clientId: clientAId,
      documentId: documentAId,
      documentVersionId: documentAVersionId,
      clauseRef: '1.1.',
      canonicalReference: null,
    });

    const other = await buildLegalSourceImpactForVersion(otherVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    expect(other!.documentReferenceImpact.references.map((reference) => reference.documentId)).toEqual([documentBId]);
    expect(other!.documentReferenceImpact.references.some((reference) => reference.documentId === documentAId)).toBe(false);

    // An unknown subject is reported as absent, not as an empty-but-valid subject.
    expect(await buildLegalSourceImpactForVersion(`c4c-missing-${suffix}`, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT)).toBeNull();
  });

  it('B. cross-client isolation: the subject impact carries only client A document references', async () => {
    const subject = await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    const clientIds = subject!.documentReferenceImpact.references.map((reference) => reference.clientId);
    expect(new Set(clientIds)).toEqual(new Set([clientAId]));
    expect(clientIds).not.toContain(clientBId);
    expect(subject!.documentReferenceImpact.totals.clients).toBe(1);
  });

  it('C. an exact citation maps its requirement, keeps the control map exact, and excludes unrelated rows', async () => {
    const subject = await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    expect(subject!.requirementImpact.derivable).toBe(true);
    expect(subject!.requirementImpact.citations.map((citation) => citation.requirementKey)).toEqual([
      `C4C_REQ_ONE_${suffix}`,
    ]);
    expect(subject!.requirementImpact.requirements.map((requirement) => requirement.requirementId)).toEqual([
      requirementOneId,
    ]);

    // Only the exactly mapped control definition is claimed.
    expect(subject!.controlImpact.controlDefinitions.map((definition) => definition.controlDefinitionId)).toEqual([
      controlOneId,
    ]);
    expect(subject!.controlImpact.controlDefinitions[0].viaRequirementVersionIds).toEqual([
      requirementOneVersionId,
    ]);
    // The unrelated control definition and its ClientControl are never claimed.
    expect(subject!.controlImpact.controlDefinitions.some((definition) => definition.controlDefinitionId === controlTwoId)).toBe(false);
    expect(
      subject!.controlImpact.clientControls.some((clientControl) => clientControl.controlDefinitionId === controlTwoId),
    ).toBe(false);
    // Both existing ClientControls of the exactly mapped control are reported.
    expect(subject!.controlImpact.clientControls.map((clientControl) => clientControl.clientId).sort()).toEqual(
      [clientAId, clientBId].sort(),
    );
  });

  it('D. applicability impact is scoped to exactly impacted requirement versions', async () => {
    const subject = await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    expect(subject!.applicabilityImpact.applicabilities.map((applicability) => applicability.applicabilityId)).toEqual([
      applicabilityOneId,
    ]);
    expect(subject!.applicabilityImpact.applicabilities[0]).toMatchObject({
      clientId: clientAId,
      requirementVersionId: requirementOneVersionId,
      outcome: 'APPLIES',
    });
    // Client B applies only to the unrelated requirement version.
    expect(subject!.applicabilityImpact.applicabilities.some((applicability) => applicability.clientId === clientBId)).toBe(false);
  });

  it('E. client impact keeps the three kinds separate and canonical references stay document-only', async () => {
    const subject = await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    const clientA = subject!.clients.find((client) => client.clientId === clientAId);
    const clientB = subject!.clients.find((client) => client.clientId === clientBId);

    expect(clientA!.impactKinds).toEqual([
      'DOCUMENT_REFERENCE_IMPACT',
      'APPLICABILITY_IMPACT',
      'CONTROL_IMPACT',
    ]);
    // Client B has only the exact mapped ClientControl — nothing is inferred.
    expect(clientB!.impactKinds).toEqual(['CONTROL_IMPACT']);
    expect(subject!.review.automaticActionsCreated).toBe(0);
    expect(subject!.review.reviewRequired).toBe(true);

    // Canonical-reference subject: document impact is exact, registry impact is NOT derivable.
    const reference = await buildDocumentReferenceImpactForCanonicalReference(MAIN_REFERENCE, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    expect(reference!.subjectType).toBe('CANONICAL_REFERENCE');
    expect(reference!.canonicalReference).toBe(MAIN_REFERENCE);
    expect(reference!.documentReferenceImpact.references.map((row) => row.documentId)).toEqual([
      referenceDocumentId,
    ]);
    expect(reference!.requirementImpact).toMatchObject({
      derivable: false,
      unavailableReason: 'NO_CANONICAL_REGISTRY_BINDING',
    });
    expect(reference!.controlImpact.derivable).toBe(false);
    expect(reference!.applicabilityImpact.derivable).toBe(false);

    // A different canonical reference finds its own document and none of the subject's.
    const wrong = await buildDocumentReferenceImpactForCanonicalReference(WRONG_REFERENCE, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    expect(wrong!.documentReferenceImpact.references.map((row) => row.documentId)).toEqual([
      wrongReferenceDocumentId,
    ]);
    expect(
      wrong!.documentReferenceImpact.references.some((row) => row.documentId === referenceDocumentId),
    ).toBe(false);

    // A reference that is not canonical at all is rejected, not guessed.
    expect(await buildDocumentReferenceImpactForCanonicalReference('https://example.com/foo', db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT)).toBeNull();
  });

  it('F. reading the impact performs no write and creates no finding, proposal, task or legal version', async () => {
    const anchorBefore = await db.complianceDocumentClauseAnchor.findMany({
      where: { documentVersionId: { in: [documentAVersionId, documentBVersionId, referenceDocumentVersionId, wrongReferenceDocumentVersionId] } },
      orderBy: { id: 'asc' },
      select: { id: true, legalSourceVersionId: true, rowDigest: true, ingestedAt: true, anchorKey: true },
    });
    const clientControlsBefore = await db.clientControl.findMany({
      where: { clientId: { in: [clientAId, clientBId] } },
      orderBy: { id: 'asc' },
      select: { id: true, implementationStatus: true, lastReviewedAt: true, updatedAt: true },
    });

    const before = await impactCounts();

    await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    await buildLegalSourceImpactForVersion(otherVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    await buildDocumentReferenceImpactForCanonicalReference(MAIN_REFERENCE, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    // The P1 scoped read must be just as side-effect free.
    await buildLegalSourceImpactForVersion(p1VersionId, db, scopedAccess([p1CaseAccessibleId], [p1ClientId]), GENERATED_AT);

    expect(await impactCounts()).toEqual(before);
    expect(
      await db.complianceDocumentClauseAnchor.findMany({
        where: { documentVersionId: { in: [documentAVersionId, documentBVersionId, referenceDocumentVersionId, wrongReferenceDocumentVersionId] } },
        orderBy: { id: 'asc' },
        select: { id: true, legalSourceVersionId: true, rowDigest: true, ingestedAt: true, anchorKey: true },
      }),
    ).toEqual(anchorBefore);
    expect(
      await db.clientControl.findMany({
        where: { clientId: { in: [clientAId, clientBId] } },
        orderBy: { id: 'asc' },
        select: { id: true, implementationStatus: true, lastReviewedAt: true, updatedAt: true },
      }),
    ).toEqual(clientControlsBefore);
  });

  it('G. the external watcher manifest carries no client/document identity while the internal impact map does', async () => {
    const manifest = await buildComplianceMonitoringManifest(db, GENERATED_AT);
    const serializedManifest = JSON.stringify(manifest);
    for (const token of [clientAId, clientBId, caseAId, caseBId, documentAId, documentBId, referenceDocumentId, 'C4C Client', 'fixture.invalid']) {
      expect(serializedManifest).not.toContain(token);
    }
    // The exact canonical reference IS the only thing the watcher needs.
    expect(serializedManifest).toContain(`TV/2026/${actNumber}`);

    const impact = await buildLegalSourceImpactForVersion(subjectVersionId, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    const serializedImpact = JSON.stringify(impact);
    expect(serializedImpact).toContain(clientAId);
    expect(serializedImpact).toContain(documentAId);
  });

  it('H. applies the resolved case + client scope consistently', async () => {
    const scopedToA = await buildLegalSourceImpactForVersion(
      subjectVersionId,
      db,
      scopedAccess([caseAId], [clientAId]),
      GENERATED_AT,
    );
    expect(scopedToA!.documentReferenceImpact.references.every((reference) => reference.clientId === clientAId)).toBe(true);
    expect(scopedToA!.controlImpact.clientControls.every((clientControl) => clientControl.clientId === clientAId)).toBe(true);
    expect(scopedToA!.applicabilityImpact.applicabilities.every((applicability) => applicability.clientId === clientAId)).toBe(true);
    expect(scopedToA!.clients.map((client) => client.clientId)).toEqual([clientAId]);

    const scopedToB = await buildLegalSourceImpactForVersion(
      subjectVersionId,
      db,
      scopedAccess([caseBId], [clientBId]),
      GENERATED_AT,
    );
    // Client B has only the exact mapped ClientControl for this legal source.
    expect(scopedToB!.documentReferenceImpact.references).toEqual([]);
    expect(scopedToB!.applicabilityImpact.applicabilities).toEqual([]);
    expect(scopedToB!.controlImpact.clientControls.map((clientControl) => clientControl.clientId)).toEqual([clientBId]);
    expect(scopedToB!.clients.map((client) => client.clientId)).toEqual([clientBId]);

    // An empty scope (a non-manager with no accessible case) sees no client-bearing impact.
    const scopedToNone = await buildLegalSourceImpactForVersion(
      subjectVersionId,
      db,
      scopedAccess([], []),
      GENERATED_AT,
    );
    expect(scopedToNone!.documentReferenceImpact.references).toEqual([]);
    expect(scopedToNone!.applicabilityImpact.applicabilities).toEqual([]);
    expect(scopedToNone!.controlImpact.clientControls).toEqual([]);
    expect(scopedToNone!.clients).toEqual([]);
    // The legal-source / requirement / control structure is not client-scoped.
    expect(scopedToNone!.requirementImpact.citations).toHaveLength(1);
    expect(scopedToNone!.controlImpact.controlDefinitions).toHaveLength(1);

    // The canonical-reference document impact is scoped the same way.
    const referenceScopedToB = await buildDocumentReferenceImpactForCanonicalReference(
      MAIN_REFERENCE,
      db,
      scopedAccess([caseBId], [clientBId]),
      GENERATED_AT,
    );
    expect(referenceScopedToB!.documentReferenceImpact.references).toEqual([]);
  });

  /* ------------------------------------------------------------------ */
  /*  P1 — document visibility is CASE-scoped, never CLIENT-scoped.      */
  /* ------------------------------------------------------------------ */

  it('P1-a. an accessible case does not unlock a hidden case document of the SAME client', async () => {
    const scope = await resolveImpactAccessScope({ userId: lawyerId, role: 'LAWYER' });
    expect(scope.readableCaseIds).toEqual(new Set([p1CaseAccessibleId]));
    expect(scope.readableClientIds).toEqual(new Set([p1ClientId]));

    const projection = await buildLegalSourceImpactForVersion(p1VersionId, db, scope, GENERATED_AT);
    expect(projection).not.toBeNull();
    const references = projection!.documentReferenceImpact.references;
    expect(references.map((reference) => reference.documentId)).toEqual([p1VisibleDocId]);
    expect(references.some((reference) => reference.documentId === p1HiddenDocId)).toBe(false);
    expect(references.some((reference) => reference.documentId === p1HrDocId)).toBe(false);

    // Totals are computed AFTER visibility filtering: no existence leak.
    expect(projection!.documentReferenceImpact.totals).toEqual({
      references: 1,
      documents: 1,
      documentVersions: 1,
      clients: 1,
    });

    // No metadata (id, version id, clause ref, clause title) of a hidden document leaks.
    const serialized = JSON.stringify(projection);
    for (const token of [
      p1HiddenDocId,
      p1HiddenDocVersionId,
      'P1 hidden clause',
      '9.9.',
      p1HrDocId,
      p1HrDocVersionId,
      'P1 HR clause',
      '8.8.',
    ]) {
      expect(serialized).not.toContain(token);
    }
    // The authorized document impact IS visible.
    expect(serialized).toContain(p1VisibleDocId);
    expect(serialized).toContain('P1 visible clause');
  });

  it('P1-b. authorized CLIENT-level requirement / control / applicability impact stays visible', async () => {
    const scope = await resolveImpactAccessScope({ userId: lawyerId, role: 'LAWYER' });
    const projection = await buildLegalSourceImpactForVersion(p1VersionId, db, scope, GENERATED_AT);

    expect(projection!.requirementImpact.citations.map((citation) => citation.requirementKey)).toEqual([
      `C4C_P1_REQ_${suffix}`,
    ]);
    expect(projection!.controlImpact.controlDefinitions.map((definition) => definition.controlDefinitionId)).toEqual([
      p1ControlId,
    ]);
    expect(projection!.controlImpact.clientControls.map((clientControl) => clientControl.clientControlId)).toEqual([
      p1ClientControlId,
    ]);
    expect(projection!.applicabilityImpact.applicabilities.map((applicability) => applicability.applicabilityId)).toEqual([
      p1ApplicabilityId,
    ]);

    const client = projection!.clients.find((entry) => entry.clientId === p1ClientId);
    expect(client).toMatchObject({
      documentReferenceCount: 1,
      applicabilityCount: 1,
      clientControlCount: 1,
    });
    expect(client!.impactKinds).toEqual([
      'DOCUMENT_REFERENCE_IMPACT',
      'APPLICABILITY_IMPACT',
      'CONTROL_IMPACT',
    ]);
    expect(projection!.review.automaticActionsCreated).toBe(0);
  });

  it('P1-c. ADMIN/PARTNER canonical policy still sees both cases and HR_CONFIDENTIAL (no new privilege)', async () => {
    const scope = await resolveImpactAccessScope({ userId: adminId, role: 'ADMIN' });
    expect(scope.readableCaseIds).toBeNull();
    expect(scope.readableClientIds).toBeNull();

    const projection = await buildLegalSourceImpactForVersion(p1VersionId, db, scope, GENERATED_AT);
    expect(projection!.documentReferenceImpact.references.map((reference) => reference.documentId).sort()).toEqual(
      [p1HrDocId, p1HiddenDocId, p1VisibleDocId].sort(),
    );
    expect(projection!.documentReferenceImpact.totals).toMatchObject({ references: 3, documents: 3, clients: 1 });
  });

  it('P1-d. canonical-reference impact is scoped by the same case boundary', async () => {
    const scope = await resolveImpactAccessScope({ userId: lawyerId, role: 'LAWYER' });
    const scoped = await buildDocumentReferenceImpactForCanonicalReference(p1Reference, db, scope, GENERATED_AT);
    expect(scoped!.documentReferenceImpact.references.map((reference) => reference.documentId)).toEqual([p1VisibleDocId]);
    expect(JSON.stringify(scoped)).not.toContain(p1HiddenDocId);

    const unscoped = await buildDocumentReferenceImpactForCanonicalReference(p1Reference, db, UNSCOPED_IMPACT_ACCESS, GENERATED_AT);
    expect(unscoped!.documentReferenceImpact.references.map((reference) => reference.documentId).sort()).toEqual(
      [p1HiddenDocId, p1VisibleDocId].sort(),
    );
  });
});
