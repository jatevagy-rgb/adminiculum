/**
 * COMPLIANCE DOCUMENT UPLOAD — one canonical orchestration for the internal
 * client-compliance page.
 *
 * The lawyer selects a compliance requirement and one clear intent; everything
 * else is canonical composition of EXISTING services:
 *
 *   resolve/reuse/create compliance Case   (complianceCaseResolver — retry-scoped)
 *        ↓ stable caseId (NO external effect inside the retry)
 *   ONE canonical Document upload          (documents/services.createDocument)
 *        ↓
 *   ONE compliance linkage                 (complianceDocumentService.linkComplianceDocument)
 *        ↓
 *   INTERNAL_ANALYSIS → CDI ingestion already scheduled by the linkage
 *   CLIENT_POLICY     → canonical DRAFT publication (createDocumentPublication)
 *
 * Nothing is duplicated: no document storage, no SharePoint upload, no upload
 * security, no second publication mechanism, no second parser, no watcher.
 * CLIENT_POLICY linkage alone NEVER equals customer visibility — the canonical
 * publication lifecycle owns that, and this orchestration only enters it.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InternalActor,
  InteractionError,
  assertClientReadAccess,
  requireInternal,
} from '../client-interaction/base';
import documentsService from '../documents/services';
import { validateWorkforceUpload } from '../upload-security/uploadValidationCore';
import { createDocumentPublication } from '../client-publication/publicationService';
import { linkComplianceDocument, type ComplianceDocumentAudience } from './complianceDocumentService';
import { resolveExplicitComplianceCase, resolveOrCreateComplianceCase } from './complianceCaseResolver';

type Prisma = typeof defaultPrisma;

export const COMPLIANCE_UPLOAD_INTENTS = ['CLIENT_POLICY', 'INTERNAL_ANALYSIS'] as const;
export type ComplianceUploadIntent = (typeof COMPLIANCE_UPLOAD_INTENTS)[number];

export interface ComplianceUploadInput {
  clientId: string;
  requirementKey: string;
  intent: string;
  fileName: string;
  mimeType?: string | null;
  fileContent: Buffer;
  title?: string | null;
  /** Exceptional ambiguity retry: an explicitly selected eligible compliance Case. */
  caseId?: string | null;
}

export interface ComplianceUploadResult {
  caseId: string;
  caseCreated: boolean;
  caseReused: boolean;
  documentId: string;
  documentVersionId: string | null;
  complianceDocumentId: string;
  audience: ComplianceDocumentAudience;
  /** INTERNAL_ANALYSIS: CDI ingestion is already scheduled by the linkage. */
  internalAnalysis: { matrixScheduled: boolean } | null;
  /**
   * CLIENT_POLICY: the canonical publication entered its DRAFT lifecycle.
   * `status` is the canonical ClientPublicationStatus when created, otherwise a
   * truthful non-created marker with a bounded code. Never auto-published.
   */
  publication: { publicationId: string | null; status: string; code?: string } | null;
}

/**
 * Bounded scanner codes that may be surfaced (observability only). Anything not
 * allowlisted falls back to the existing safe generic rejection code, so no
 * provider detail, URL, header or credential can ever reach the API response.
 */
const ALLOWLISTED_SCANNER_REJECTION_CODES = new Set([
  'SCANNER_NOT_CONFIGURED',
  'HTTP_SCAN_UNAUTHORIZED',
  'HTTP_SCAN_FORBIDDEN',
  'HTTP_SCAN_RATE_LIMITED',
  'HTTP_SCAN_TIMEOUT',
  'HTTP_SCAN_NETWORK_ERROR',
  'HTTP_SCAN_4XX',
  'HTTP_SCAN_5XX',
  'HTTP_SCAN_BAD_STATUS',
  'HTTP_SCAN_BAD_RESPONSE',
  'HTTP_SCAN_PROVIDER_ERROR',
]);

export async function uploadComplianceDocument(
  actor: InternalActor,
  input: ComplianceUploadInput,
  db: Prisma = defaultPrisma as PrismaClient as Prisma,
): Promise<ComplianceUploadResult> {
  requireInternal(actor);
  await assertClientReadAccess(actor, input.clientId, db as never);

  const intent = String(input.intent || '').trim().toUpperCase() as ComplianceUploadIntent;
  if (!COMPLIANCE_UPLOAD_INTENTS.includes(intent)) {
    throw new InteractionError(400, 'COMPLIANCE_UPLOAD_INVALID_INTENT', 'Unknown compliance upload intent.');
  }
  const requirementKey = String(input.requirementKey || '').trim();
  if (!requirementKey) {
    throw new InteractionError(400, 'COMPLIANCE_UPLOAD_REQUIREMENT_REQUIRED', 'Select a compliance area first.');
  }
  const fileName = String(input.fileName || '').trim();
  if (!fileName) {
    throw new InteractionError(400, 'COMPLIANCE_UPLOAD_FILE_REQUIRED', 'Choose a file to upload.');
  }
  const fileContent = Buffer.isBuffer(input.fileContent) ? input.fileContent : Buffer.alloc(0);
  if (fileContent.length === 0) {
    throw new InteractionError(400, 'COMPLIANCE_UPLOAD_FILE_EMPTY', 'The uploaded file is empty.');
  }

  // Canonical upload security (SEC-2 pipeline): empty/size/unsafe-content/magic
  // bytes/type acceptance/archive inspection. Declared MIME is never trusted.
  const validation = await validateWorkforceUpload({
    buffer: fileContent,
    declaredMimeType: input.mimeType ?? null,
    originalFileName: fileName,
    inspectArchiveContent: true,
  });
  if (!validation.ok) {
    // Preserve the bounded scanner-adapter code for SCAN_FAILED so the caller can
    // distinguish not-configured / unauthorized / forbidden / rate-limited /
    // timeout / network / 4xx / 5xx / bad response / provider error. Verdict and
    // fail-closed behaviour are unchanged, and the message stays generic.
    const scannerCode =
      validation.scanOutcome === 'SCAN_FAILED' ? validation.scannerCodeSafe : undefined;
    const suffix =
      scannerCode && ALLOWLISTED_SCANNER_REJECTION_CODES.has(scannerCode)
        ? scannerCode
        : validation.codeSafe;
    throw new InteractionError(400, `COMPLIANCE_UPLOAD_REJECTED_${suffix}`, 'The uploaded file was rejected by upload security.');
  }

  // Fail-fast precondition: prove the canonical Requirement exists using the SAME
  // key semantics as linkComplianceDocument, BEFORE case resolution or any
  // external document upload, so a stale key can never orphan a SharePoint file.
  const requirement = await db.requirement.findUnique({
    where: { key: requirementKey },
    select: { id: true },
  });
  if (!requirement) {
    throw new InteractionError(404, 'COMPLIANCE_UPLOAD_REQUIREMENT_NOT_FOUND', 'Compliance topic not found.');
  }

  // 1) Stable canonical caseId first. The retry scope ends here and performs no
  //    external effect, so a retried resolution can never duplicate an upload.
  //    An explicitly selected case (exceptional ambiguity retry) is validated and
  //    reused; it never creates or auto-resolves another Case.
  const requestedCaseId = typeof input.caseId === 'string' ? input.caseId.trim() : '';
  const resolution = requestedCaseId
    ? { caseId: (await resolveExplicitComplianceCase(actor, input.clientId, requestedCaseId, db)).caseId, caseCreated: false, caseReused: true }
    : await resolveOrCreateComplianceCase(actor, input.clientId, db);

  // 2) Exactly ONE canonical document upload.
  const document = await documentsService.createDocument({
    caseId: resolution.caseId,
    fileName,
    fileContent,
    mimeType: validation.detectedMimeType || input.mimeType || 'application/octet-stream',
    documentType: 'OTHER',
    folder: 'Drafts',
    createdById: actor.userId,
  });

  // 3) Exactly ONE canonical compliance linkage. INTERNAL_ANALYSIS schedules the
  //    existing CDI ingestion (fire-and-forget) inside the linkage service.
  const link = await linkComplianceDocument(
    actor,
    { clientId: input.clientId, requirementKey, documentId: document.id, audience: intent },
    db as never,
  );

  const version = await db.documentVersion.findFirst({
    where: { documentId: document.id },
    orderBy: { version: 'desc' },
    select: { id: true },
  });

  let publication: ComplianceUploadResult['publication'] = null;
  if (intent === 'CLIENT_POLICY') {
    if (!version) {
      publication = { publicationId: null, status: 'NOT_CREATED', code: 'NO_DOCUMENT_VERSION' };
    } else {
      try {
        // Canonical DRAFT entry. Approval/publish transitions stay with the
        // existing publication lifecycle — never auto-approved, never auto-published.
        const created = await createDocumentPublication(actor, {
          documentId: document.id,
          documentVersionId: version.id,
          clientFacingTitle: String(input.title || fileName).slice(0, 240),
        });
        publication = { publicationId: String(created.id), status: String(created.status) };
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : 'PUBLICATION_DRAFT_FAILED';
        publication = { publicationId: null, status: 'NOT_CREATED', code };
      }
    }
  }

  return {
    caseId: resolution.caseId,
    caseCreated: resolution.caseCreated,
    caseReused: resolution.caseReused,
    documentId: document.id,
    documentVersionId: version?.id ?? null,
    complianceDocumentId: link.id,
    audience: link.audience,
    internalAnalysis: intent === 'INTERNAL_ANALYSIS' ? { matrixScheduled: true } : null,
    publication,
  };
}
