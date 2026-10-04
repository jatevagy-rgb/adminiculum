import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertInternalCaseAccess, InteractionError, InternalActor, requireExpected, requireInternal, safeText } from './base';
import { acceptFileIntoMatterInTx } from './submissionService';
import { createTypedFactInTx } from '../compliance/typedFactMutationService';
import { createEvidenceRecordInTx } from '../compliance/controlEvidenceService';
import { assertEvidenceDocumentAuthority } from '../compliance/evidenceDocumentAuthority';
import { reconcileClientComplianceInTx } from '../compliance/complianceReconcileService';

export interface ComplianceAcceptanceInput {
  outcome: 'ACCEPT_FACT' | 'ACCEPT_EVIDENCE';
  expectedRevision: number;
  reason: string;
  fileId?: string;
  documentId?: string;
  documentVersionId?: string;
  fieldId?: string;
  factDefinitionId?: string;
  fact?: Record<string, unknown>;
  title?: string;
  clientControlId?: string;
}

/** Internal explicit acceptance only. Corrections/rejections keep their existing commands.
 * One immutable receipt per submission: repeats return an explicit conflict, never duplicates.
 * No request/task completion and no control implementation or legal conclusion is inferred.
 */
export async function acceptSubmissionCompliance(actor: InternalActor, submissionId: string,
  input: ComplianceAcceptanceInput, db: PrismaClient = defaultPrisma) {
  requireInternal(actor);
  if (!['ACCEPT_FACT', 'ACCEPT_EVIDENCE'].includes(input.outcome) || !Number.isInteger(input.expectedRevision)) {
    throw new InteractionError(400, 'COMPLIANCE_DECISION_INVALID', 'An explicit acceptance outcome and expectedRevision are required.');
  }
  const reason = safeText(input.reason, 'reason', 1000, true)!;
  try {
    return await db.$transaction(async (tx) => {
      const sub = await tx.clientSubmission.findUnique({ where: { id: submissionId }, include: { request: true } });
      if (!sub?.caseId) throw new InteractionError(404, 'SUBMISSION_NOT_FOUND', 'Case submission not found.');
      const caseRow = await assertInternalCaseAccess(actor, sub.caseId, tx as PrismaClient);
      if (caseRow.clientId !== sub.clientId || sub.request.clientId !== sub.clientId || sub.request.caseId !== sub.caseId) {
        throw new InteractionError(403, 'SUBMISSION_SCOPE_INVALID', 'Request and submission must belong to the same client and case.');
      }
      if (sub.complianceAcceptance) throw new InteractionError(409, 'COMPLIANCE_ALREADY_ACCEPTED', 'This submission already has a Compliance acceptance decision.');
      requireExpected(sub, input.expectedRevision);
      if (!['SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'ACCEPTED_INTO_MATTER'].includes(sub.status) || sub.customerUnavailableDeclaredAt) {
        throw new InteractionError(409, 'SUBMISSION_NOT_REVIEWABLE', 'Submission is not available for acceptance.');
      }

      let documentVersionId: string | null = null;
      let documentId: string | null = null;
      if (input.fileId) {
        const file = await tx.clientSubmissionFile.findFirst({ where: { id: input.fileId, submissionId } });
        if (!file) throw new InteractionError(403, 'EVIDENCE_ARTIFACT_FORBIDDEN', 'File is outside this submission.');
        if (file.status === 'ACCEPTED') {
          // Legacy submission-level pointers may have been overwritten by a different file.
          // Never infer exact provenance from those pointers or from display names.
          if (!file.acceptedDocumentVersionId) throw new InteractionError(409, 'EXACT_FILE_VERSION_UNAVAILABLE', 'This historical file has no exact accepted-version provenance.');
          documentVersionId = file.acceptedDocumentVersionId;
        } else {
          if (input.documentVersionId) throw new InteractionError(409, 'EXACT_VERSION_MISMATCH', 'An unaccepted file has no reviewed document version yet.');
          const accepted = await acceptFileIntoMatterInTx(actor, submissionId, file.id, {
            expectedRevision: sub.revision, documentId: input.documentId,
          }, tx);
          documentVersionId = accepted.documentVersionId;
        }
        if (input.documentVersionId && input.documentVersionId !== documentVersionId) {
          throw new InteractionError(403, 'EXACT_VERSION_MISMATCH', 'The selected version does not belong to this accepted file.');
        }
        const version = await assertEvidenceDocumentAuthority(actor, sub.clientId, documentVersionId, tx,
          { caseId: sub.caseId, documentId: input.documentId });
        documentId = version.documentId;
      } else if (input.documentId || input.documentVersionId || input.outcome === 'ACCEPT_EVIDENCE') {
        throw new InteractionError(400, 'SUBMISSION_FILE_REQUIRED', 'Document evidence requires an exact submission file.');
      }

      let factId: string | null = null;
      let evidenceRecordId: string | null = null;
      let field: { id: string; labelSnapshot: string; valueSafe: string | null } | null = null;
      if (input.outcome === 'ACCEPT_FACT') {
        if (!input.factDefinitionId || !input.fact || (!input.fieldId && !documentVersionId)) {
          throw new InteractionError(400, 'FACT_SOURCE_REQUIRED', 'Fact acceptance requires a definition, typed value and submission answer or file.');
        }
        if (input.fieldId) {
          field = await tx.clientSubmissionField.findFirst({ where: { id: input.fieldId, submissionId }, select: { id: true, labelSnapshot: true, valueSafe: true } });
          if (!field) throw new InteractionError(403, 'FACT_SOURCE_FORBIDDEN', 'Answer is outside this submission.');
        }
        const result = await createTypedFactInTx({ clientId: sub.clientId, factDefinitionId: input.factDefinitionId,
          actorUserId: actor.userId, verificationStatus: documentVersionId ? 'DOCUMENT_VERIFIED' : 'LAW_FIRM_VERIFIED',
          input: { ...input.fact, sourceReference: `CLIENT_SUBMISSION:${sub.id}`, sourceDocumentVersionId: documentVersionId,
            evaluationAt: new Date().toISOString() },
        }, tx);
        factId = result.fact.id;
      } else {
        const evidence = await createEvidenceRecordInTx(actor, sub.clientId, {
          sourceType: 'DOCUMENT_VERSION', documentVersionId, status: 'ACCEPTED', title: input.title || sub.request.clientSafeTitle,
        }, tx);
        evidenceRecordId = evidence.id;
        const clientControlId = input.clientControlId || sub.request.clientControlId;
        if (sub.request.clientControlId && input.clientControlId && sub.request.clientControlId !== input.clientControlId) {
          throw new InteractionError(403, 'EVIDENCE_CONTROL_FORBIDDEN', 'Control differs from the request source.');
        }
        if (clientControlId) {
          const control = await tx.clientControl.findFirst({ where: { id: clientControlId, clientId: sub.clientId } });
          if (!control) throw new InteractionError(403, 'EVIDENCE_CONTROL_FORBIDDEN', 'Control is outside this client.');
          await tx.evidenceControlLink.create({ data: { clientId: sub.clientId, clientControlId, evidenceRecordId } });
        }
      }
      const reevaluation = await reconcileClientComplianceInTx(sub.clientId, actor.userId, tx);
      const receipt = {
        outcome: input.outcome, clientId: sub.clientId, caseId: sub.caseId, requestId: sub.clientRequestId,
        submissionId: sub.id, submissionRevision: sub.revision, fileId: input.fileId || null, field,
        documentId, documentVersionId, factId, evidenceRecordId, reason,
        sourceType: documentVersionId ? 'DOCUMENT_VERSION' : 'CLIENT_FACT',
        reviewedByUserId: actor.userId, reviewedAt: new Date().toISOString(),
        reevaluation: { status: reevaluation.enrolled ? 'COMPLETED' : 'NOT_ENROLLED', ...reevaluation },
      };
      await tx.clientSubmission.update({ where: { id: sub.id }, data: {
        complianceAcceptance: receipt, status: 'ACCEPTED_INTO_MATTER', reviewedById: actor.userId,
        reviewedAt: new Date(receipt.reviewedAt), revision: { increment: 1 },
      } });
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new InteractionError(409, 'COMPLIANCE_DECISION_CONFLICT', 'Concurrent review changed this submission. Reload before retrying.');
    }
    throw error;
  }
}
