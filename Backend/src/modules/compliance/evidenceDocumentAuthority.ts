import { Prisma, PrismaClient } from '@prisma/client';
import { assertInternalCaseAccess, InteractionError, InternalActor, requireInternal } from '../client-interaction/base';
import { hrConfidentialReadAllowed } from '../documents/authorization';
import { securityScanBlock } from '../documents/securityScan.service';

/** Exact-version authority, shared by both evidence commands and submission review. */
export async function assertEvidenceDocumentAuthority(
  actor: InternalActor, clientId: string, versionId: string,
  tx: Prisma.TransactionClient, expected?: { caseId: string; documentId?: string }, requireClean = true,
) {
  requireInternal(actor);
  const version = await tx.documentVersion.findUnique({ where: { id: versionId }, include: { document: true } });
  if (!version || version.document.clientId !== clientId ||
      (expected && version.document.caseId !== expected.caseId) ||
      (expected?.documentId && version.documentId !== expected.documentId)) {
    throw new InteractionError(403, 'EVIDENCE_ARTIFACT_FORBIDDEN', 'Document version is outside the authorized scope.');
  }
  // Reuse the canonical active-user/case policy and HR policy with database role.
  await assertInternalCaseAccess(actor, version.document.caseId, tx as PrismaClient);
  const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { role: true } });
  if (version.document.securityClassification === 'HR_CONFIDENTIAL' && !hrConfidentialReadAllowed(user.role)) {
    throw new InteractionError(403, 'DOCUMENT_ACCESS_FORBIDDEN', 'Document is not accessible.');
  }
  const blocked = securityScanBlock(version.securityScanStatus);
  if (requireClean && blocked) throw new InteractionError(blocked.status, blocked.code, blocked.error);
  return version;
}
