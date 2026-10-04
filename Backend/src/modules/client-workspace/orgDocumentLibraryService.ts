/**
 * CLIENT PORTAL 3.0 — Organization Document Library read model (checkpoint D).
 *
 * READ-ONLY projection over two canonical, semantically distinct sources:
 *
 *   published — documents explicitly published by the office through the
 *               canonical ClientDocumentPublication boundary (exact published
 *               DocumentVersion), served via listPortalDocuments().
 *
 *   submitted — the authenticated customer's OWN submission HISTORY across
 *               their ACTIVE granted matters, paired with the canonical
 *               ClientRequest by exact id relation.
 *
 * A DOCUMENT is not a REQUEST. Open requests (DOCUMENT_UPLOAD, CORRECTION_REQUEST,
 * INFORMATION_REQUEST, DATA_FORM, QUESTION_RESPONSE, MISSING_DOCUMENT_REQUEST)
 * never appear here — they belong to the Action Center. Draft/in-progress
 * upload states are also excluded.
 *
 * NO new Prisma model, NO migration, NO document/submission copy, NO new
 * lifecycle state. Authorization comes only from the resolved portal session +
 * selected workspace + existing ACTIVE grants / publication visibility rules.
 */

import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError, resolveActiveCustomerGrant } from '../client-interaction/base';
import { listCustomerRequests } from '../client-interaction/requestService';
import { listCustomerSubmissions } from '../client-interaction/submissionService';
import { listPortalDocuments } from '../client-publication/publicationService';
import { requireOrganizationWorkspace } from './organizationalAccessPolicy';

type Prisma = typeof defaultPrisma;

export type OrgLibrarySubmissionStatus =
  | 'SUBMITTED'
  | 'CORRECTION_REQUESTED'
  | 'ACCEPTED_INTO_MATTER'
  | 'REJECTED';

export interface OrgDocumentLibraryDto {
  published: Array<{
    publicationId: string;
    title: string;
    versionLabel: string;
    publishedAt: string | null;
    matterTitle: string | null;
    tags: string[];
    downloadAvailable: boolean;
  }>;
  submitted: Array<{
    submissionId: string;
    requestTitle: string;
    files: Array<{ id: string; title: string; statusLabel: string }>;
    submittedAt: string | null;
    status: OrgLibrarySubmissionStatus;
    matterTitle: string | null;
    /** Additive canonical route identities (already customer-facing in URLs); null when unavailable. */
    matterPublicationId: string | null;
    requestId: string | null;
  }>;
}

/**
 * Normalize an internal ClientSubmission status to its customer meaning.
 * DRAFT / UPLOADING are active editing journeys (excluded by the caller);
 * SCANNING / RECEIVED are provably office-receipt states and map to SUBMITTED;
 * CANCELLED has no published customer meaning in this library and is omitted.
 */
export function normalizeSubmissionStatus(status: string): OrgLibrarySubmissionStatus | null {
  switch (status) {
    case 'SUBMITTED':
    case 'UNDER_INTERNAL_REVIEW':
    case 'SCANNING':
    case 'RECEIVED':
      return 'SUBMITTED';
    case 'CORRECTION_REQUESTED':
      return 'CORRECTION_REQUESTED';
    case 'ACCEPTED_INTO_MATTER':
      return 'ACCEPTED_INTO_MATTER';
    case 'REJECTED':
      return 'REJECTED';
    default:
      return null;
  }
}

/** Client-safe file processing label — never a raw scanner/internal enum. */
export function submissionFileStatusLabel(state: string): string {
  switch (state) {
    case 'RECEIVED':
      return 'Beérkezett';
    case 'REJECTED':
      return 'Nem fogadható el';
    default:
      return 'Feldolgozás alatt';
  }
}

const FORBIDDEN_LIBRARY_FIELDS = [
  'caseId', 'clientId', 'workspaceId', 'grantId', 'documentId',
  'documentVersionId', 'storageReference', 'storageProvider', 'scanCode',
  'scanProvider', 'quarantine', 'reviewedBy', 'reviewedAt', 'internalReview',
  'uploadSource', 'checksum', 'reviewer',
];

/**
 * Safety net: forbid internal fields from ever crossing the boundary.
 */
export function assertDocumentLibraryDtoSafe(dto: unknown): void {
  assertClientSafe(dto);
  const json = JSON.stringify(dto ?? null);
  for (const forbidden of FORBIDDEN_LIBRARY_FIELDS) {
    if (json.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new InteractionError(500, 'DOCUMENT_LIBRARY_FORBIDDEN_FIELD', 'Document library DTO contains forbidden internal data.');
    }
  }
}

export async function getOrganizationalDocumentLibrary(
  identityId: string,
  workspaceId: string,
  prisma: Prisma = defaultPrisma,
): Promise<OrgDocumentLibraryDto> {
  const workspace = await requireOrganizationWorkspace(workspaceId, prisma);
  const actor = { userId: identityId, role: 'CLIENT_PORTAL' as const, workspaceId };
  const now = new Date();

  // ---- Published: canonical DOCUMENT_READ-scoped projection, canonical order.
  const publishedPage = await listPortalDocuments(actor, null, prisma);
  const published = (publishedPage.items as any[]).map((item) => {
    const tags: string[] = [];
    if (item.isCompliancePolicy === true) tags.push('Compliance');
    if (item.clientUploaded === true) tags.push('Saját eredetű');
    return {
      publicationId: String(item.id),
      title: String(item.title),
      versionLabel: String(item.versionLabel),
      publishedAt: item.publishedAt ? String(item.publishedAt) : null,
      matterTitle: item.matterTitle ? String(item.matterTitle) : null,
      tags,
      downloadAvailable: item.downloadAvailable === true,
    };
  });

  // ---- Submitted: the identity's own submission history on ACTIVE granted matters.
  const grants = await prisma.clientPortalGrant.findMany({
    where: {
      clientPortalIdentityId: identityId,
      workspaceId,
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { caseId: true },
    distinct: ['caseId'],
  });
  const caseIds = grants.map((grant) => grant.caseId);

  const matterTitleByCase = new Map<string, string>();
  const matterPublicationIdByCase = new Map<string, string>();
  if (caseIds.length) {
    const publications = await prisma.clientMatterPublication.findMany({
      where: { caseId: { in: caseIds }, status: 'PUBLISHED', currentRevisionId: { not: null }, OR: [{ workspaceId }, { workspaceId: null }] },
      select: { id: true, caseId: true, workspaceId: true, currentRevisionId: true },
    });
    const preferred = [...new Map(
      publications.sort((left, right) => Number(right.workspaceId === workspaceId) - Number(left.workspaceId === workspaceId)).map((publication) => [publication.caseId, publication]),
    ).values()];
    const revisionIds = preferred.map((publication) => publication.currentRevisionId).filter((id): id is string => Boolean(id));
    const revisions = revisionIds.length
      ? await prisma.clientMatterPublicationRevision.findMany({ where: { id: { in: revisionIds } }, select: { id: true, clientSafeTitle: true } })
      : [];
    const titleById = new Map(revisions.map((revision) => [revision.id, revision.clientSafeTitle]));
    for (const publication of preferred) {
      matterTitleByCase.set(publication.caseId, titleById.get(publication.currentRevisionId) || '');
      matterPublicationIdByCase.set(publication.caseId, publication.id);
    }
  }

  const submitted: OrgDocumentLibraryDto['submitted'] = [];
  for (const caseId of caseIds) {
    try {
      const ctx = await resolveActiveCustomerGrant(identityId, caseId, workspaceId, prisma);
      const [requestsPage, submissionsPage] = await Promise.all([
        listCustomerRequests(ctx, prisma),
        listCustomerSubmissions(ctx, undefined, prisma),
      ]);
      const requestTitleById = new Map((requestsPage.items as any[]).map((request) => [String(request.id), String(request.title)]));
      for (const submission of submissionsPage.items as any[]) {
        const normalized = normalizeSubmissionStatus(String(submission.status));
        if (!normalized) continue;
        const requestTitle = requestTitleById.get(String(submission.requestId));
        if (!requestTitle) continue; // Fail closed: never surface an unpaired submission.
        submitted.push({
          submissionId: String(submission.id),
          requestTitle,
          files: (submission.files || []).map((file: any) => ({
            id: String(file.id),
            title: String(file.fileName || ''),
            statusLabel: submissionFileStatusLabel(String(file.state || '')),
          })),
          submittedAt: submission.submittedAt ? String(submission.submittedAt) : null,
          status: normalized,
          matterTitle: matterTitleByCase.get(caseId) || null,
          matterPublicationId: matterPublicationIdByCase.get(caseId) || null,
          requestId: String(submission.requestId),
        });
      }
    } catch {
      // A denied or unresolvable case contributes nothing — fail closed.
    }
  }

  submitted.sort((left, right) =>
    String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')) || left.submissionId.localeCompare(right.submissionId));

  const dto: OrgDocumentLibraryDto = { published, submitted };
  assertDocumentLibraryDtoSafe(dto);
  return dto;
}
