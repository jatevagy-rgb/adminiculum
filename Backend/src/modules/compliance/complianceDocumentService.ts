/**
 * COMPLIANCE DOCUMENT LINKAGE — internal management service.
 *
 * Links logical Documents to compliance topics (Requirement) with an explicit
 * audience/purpose (INTERNAL_ANALYSIS vs CLIENT_POLICY). This is the ONLY
 * compliance-topic -> document relationship and it never carries publication
 * state. CLIENT_POLICY visibility remains driven exclusively by the canonical
 * ClientDocumentPublication flow; INTERNAL_ANALYSIS never crosses the portal.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InternalActor,
  InteractionError,
  assertClientReadAccess,
  requireInternal,
} from '../client-interaction/base';
import { scheduleInternalAnalysisIngestion } from '../compliance-doc-intelligence/service';

type Prisma = typeof defaultPrisma;

const AUDIENCES = ['INTERNAL_ANALYSIS', 'CLIENT_POLICY'] as const;

export type ComplianceDocumentAudience = (typeof AUDIENCES)[number];

export async function linkComplianceDocument(
  actor: InternalActor,
  input: { clientId: string; requirementKey: string; documentId: string; audience: string },
  prisma: Prisma = defaultPrisma,
): Promise<{ id: string; requirementKey: string; audience: ComplianceDocumentAudience }> {
  requireInternal(actor);
  await assertClientReadAccess(actor, input.clientId, prisma);

  if (!AUDIENCES.includes(input.audience as ComplianceDocumentAudience)) {
    throw new InteractionError(400, 'COMPLIANCE_DOCUMENT_INVALID_AUDIENCE', 'Unknown compliance document audience.');
  }
  const requirement = await prisma.requirement.findUnique({ where: { key: input.requirementKey }, select: { id: true, key: true } });
  if (!requirement) throw new InteractionError(404, 'COMPLIANCE_DOCUMENT_REQUIREMENT_NOT_FOUND', 'Compliance topic not found.');
  const document = await prisma.document.findFirst({ where: { id: input.documentId, clientId: input.clientId }, select: { id: true } });
  if (!document) throw new InteractionError(404, 'COMPLIANCE_DOCUMENT_DOCUMENT_NOT_FOUND', 'Document not found for this client.');

  const existing = await prisma.complianceDocument.findUnique({
    where: { requirementId_documentId_audience: { requirementId: requirement.id, documentId: input.documentId, audience: input.audience as ComplianceDocumentAudience } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, requirementKey: requirement.key, audience: input.audience as ComplianceDocumentAudience };

  const created = await prisma.complianceDocument.create({
    data: { requirementId: requirement.id, documentId: input.documentId, audience: input.audience as ComplianceDocumentAudience },
    select: { id: true },
  });

  // A document that has just become linked for internal analysis gets its current
  // version ingested (CDI-1). Derived, non-fatal, fire-and-forget: a parsing or
  // storage problem must never fail the linkage. CLIENT_POLICY never triggers it.
  if (input.audience === 'INTERNAL_ANALYSIS') {
    try {
      scheduleInternalAnalysisIngestion(input.documentId, { audienceConfirmedInternal: true });
    } catch {
      // Never surface ingestion scheduling problems to the linkage caller.
    }
  }

  return { id: created.id, requirementKey: requirement.key, audience: input.audience as ComplianceDocumentAudience };
}

export async function unlinkComplianceDocument(
  actor: InternalActor,
  input: { clientId: string; complianceDocumentId: string },
  prisma: Prisma = defaultPrisma,
): Promise<{ removed: boolean }> {
  requireInternal(actor);
  await assertClientReadAccess(actor, input.clientId, prisma);

  const link = await prisma.complianceDocument.findFirst({
    where: { id: input.complianceDocumentId, document: { clientId: input.clientId } },
    select: { id: true },
  });
  if (!link) throw new InteractionError(404, 'COMPLIANCE_DOCUMENT_NOT_FOUND', 'Compliance document link not found.');
  await prisma.complianceDocument.delete({ where: { id: link.id } });
  return { removed: true };
}

export async function listComplianceDocuments(
  actor: InternalActor,
  clientId: string,
  prisma: Prisma = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, prisma);

  const links = await prisma.complianceDocument.findMany({
    where: { document: { clientId } },
    select: {
      id: true,
      audience: true,
      requirement: { select: { key: true } },
      document: {
        select: {
          id: true,
          title: true,
          name: true,
          mimeType: true,
          createdAt: true,
          updatedAt: true,
          versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, version: true, createdAt: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  const clientPolicyDocumentIds = links
    .filter((link) => link.audience === 'CLIENT_POLICY')
    .map((link) => link.document.id);
  const publications = clientPolicyDocumentIds.length
    ? await prisma.clientDocumentPublication.findMany({
        where: { clientId, documentId: { in: clientPolicyDocumentIds }, status: 'PUBLISHED', revokedAt: null },
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, documentId: true, publishedAt: true, clientFacingTitle: true },
      })
    : [];
  const latestPublicationByDocument = new Map<string, (typeof publications)[number]>();
  for (const publication of publications) {
    if (!latestPublicationByDocument.has(publication.documentId)) latestPublicationByDocument.set(publication.documentId, publication);
  }

  const grouped = new Map<string, { requirementKey: string; internalAnalysis: unknown[]; clientPolicy: unknown[] }>();
  for (const link of links) {
    const key = link.requirement.key;
    const bucket = grouped.get(key) ?? { requirementKey: key, internalAnalysis: [], clientPolicy: [] };
    const publication = latestPublicationByDocument.get(link.document.id);
    const entry = {
      id: link.id,
      documentId: link.document.id,
      title: link.document.title ?? link.document.name,
      latestVersion: link.document.versions[0] ? { version: link.document.versions[0].version, createdAt: link.document.versions[0].createdAt.toISOString() } : null,
      createdAt: link.document.createdAt.toISOString(),
      updatedAt: link.document.updatedAt.toISOString(),
      published: publication
        ? { publicationId: publication.id, clientFacingTitle: publication.clientFacingTitle, publishedAt: publication.publishedAt?.toISOString() ?? null }
        : null,
    };
    if (link.audience === 'INTERNAL_ANALYSIS') bucket.internalAnalysis.push(entry);
    else bucket.clientPolicy.push(entry);
    grouped.set(key, bucket);
  }

  return { topics: [...grouped.values()] };
}
